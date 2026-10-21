import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import querySchema from '../../../contracts/analysis/pageindex-cloud-query.schema.json' with { type: 'json' };
import type { PageIndexCloudQuery } from '../../../contracts/analysis/pageindex-cloud-query.generated.js';

const validateQuery = new Ajv({ strict: true }).compile<PageIndexCloudQuery>(querySchema);

const ORIGIN = 'https://api.pageindex.ai';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/**
 * Vendor document paths, checked live with free calls on 18/10: `POST /doc/` takes multipart/form-data with field `file` (the old
 * `/doc/upload` JSON path answered 405), `GET /docs?limit=&offset=` lists `{documents,total,limit,offset}` (the old `/doc/list`
 * answered 404), `GET /doc/{id}/metadata` matches `toDocument`. There is intentionally no delete method.
 */
export const PAGEINDEX_UPLOAD_PATH = '/doc/';
export const PAGEINDEX_LIST_PATH = '/docs';
const LIST_PAGE_SIZE = 100;
const MAX_LISTED = 10000;
const MAX_ERROR_SNIPPET_BYTES = 8192;
const MAX_UPLOAD_BYTES = 32 * 1024 * 1024;
const MAX_BLOCKS = 16;
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
class PageIndexCloudError extends Error {}
const fail = (code: string): never => { throw new PageIndexCloudError(`PAGEINDEX_${code}`); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('RESPONSE_INVALID');
  return value as Record<string, unknown>;
};
const string = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || !value.length || value.length > max) return fail('RESPONSE_INVALID');
  return value;
};
const normalise = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

/** Normalises vendor document shapes (`id`/`doc_id`, `name`, `pageNum`) into one document view. */
function toDocument(value: Record<string, unknown>): PageIndexCloudDocument {
  const rawId = string(value.id ?? value.doc_id, 256);
  if (!rawId.trim()) fail('RESPONSE_INVALID');
  const rawName = string(value.name ?? value.file_name, 256);
  if (!rawName.trim()) fail('RESPONSE_INVALID');
  const rawPages = value.pageNum ?? value.page_count;
  const pageCount = rawPages === undefined || rawPages === null ? null
    : typeof rawPages === 'number' && Number.isSafeInteger(rawPages) && rawPages >= 1 && rawPages <= 1000 ? rawPages : fail('RESPONSE_INVALID') as never;
  const status = value.status === 'completed' ? 'completed' as const
    : value.status === 'processing' || value.status === 'indexing' || value.status === undefined || value.status === null ? 'processing' as const
    : value.status === 'failed' ? 'failed' as const : 'unknown' as const;
  return { cloudDocId: rawId, cloudFileName: rawName, pageCount, status };
}

/**
 * Bounded, best-effort read of an error body for code mapping. Never throws
 * and never returns more than MAX_ERROR_SNIPPET_BYTES of text.
 */
async function readErrorSnippet(response: Response): Promise<string> {
  try {
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let length = 0;
    try {
      while (true) {
        const next = await reader.read(); if (next.done) break;
        const room = MAX_ERROR_SNIPPET_BYTES - length;
        if (room <= 0) break;
        chunks.push(next.value.subarray(0, room)); length += Math.min(next.value.length, room);
        if (next.value.length >= room) break;
      }
    } finally { await reader.cancel().catch(() => undefined); }
    return new TextDecoder('utf-8', { fatal: false }).decode(Buffer.concat(chunks));
  } catch { return ''; }
}

export interface PageIndexCloudCandidate {
  readonly role: 'RETRIEVAL_CANDIDATE';
  readonly sourceSha256: string;
  readonly page: number;
  readonly blockId: string;
  readonly blockType: string;
  readonly bbox: readonly number[];
  readonly quote: string;
  readonly verification: 'LOCAL_PDF_TEXT_MATCH' | 'UNVERIFIED_LOCAL_TEXT';
}

/** One vendor document as seen through upload, status or list. No delete operation exists. */
export interface PageIndexCloudDocument {
  readonly cloudDocId: string;
  readonly cloudFileName: string;
  readonly pageCount: number | null;
  readonly status: 'processing' | 'completed' | 'failed' | 'unknown';
}

/** Document upload input, sent as the multipart `file` field of the upload path above. */
export interface PageIndexCloudUpload {
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

export interface PageIndexCloudResult {
  readonly contractVersion: 'pageindex-cloud-result-v1';
  readonly approvalState: 'UNREVIEWED';
  readonly sourcePackageId: string;
  readonly manifestSha256: string;
  readonly logicalPath: string;
  readonly sourceSha256: string;
  readonly cloudDocId: string;
  readonly cloudBinding: 'CALLER_ASSERTED_LOCALLY_CHECKED';
  readonly answer: string;
  readonly model: string | null;
  readonly usage: { readonly promptTokens: number | null; readonly completionTokens: number | null };
  readonly candidates: readonly PageIndexCloudCandidate[];
  readonly limitations: readonly string[];
}

/** Optional connector, not a source authority or an automatic report generator. */
export class PageIndexCloudClient {
  readonly #key: string;
  readonly #fetch: typeof fetch;
  constructor(options: { enabled: boolean; apiKey: string; fetch?: typeof fetch }) {
    if (!options.enabled) fail('DISABLED');
    if (!options.apiKey.trim() || /[\r\n]/u.test(options.apiKey)) fail('KEY_UNAVAILABLE');
    this.#key = options.apiKey;
    this.#fetch = options.fetch ?? fetch;
  }

  /** A `FormData` body goes out as multipart (fetch sets the boundary content type); any other body as JSON. */
  async #request(endpoint: string, body?: unknown, signal?: AbortSignal): Promise<Record<string, unknown>> {
    try {
      signal?.throwIfAborted();
      const form = body instanceof FormData;
      const response = await this.#fetch(ORIGIN + endpoint, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: body === undefined || form ? { api_key: this.#key } : { api_key: this.#key, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(90_000)]) : AbortSignal.timeout(90_000),
      });
      // Single attempt only: this connector never retries a paid call.
      if (!response.ok) {
        if (response.status === 403 && (await readErrorSnippet(response)).includes('USAGE_LIMIT_REACHED')) fail('USAGE_LIMIT_REACHED');
        fail(`HTTP_${response.status}`);
      }
      if (!response.body) return fail('RESPONSE_INVALID');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const next = await reader.read(); if (next.done) break;
          length += next.value.length;
          if (length > MAX_RESPONSE_BYTES) fail('RESPONSE_TOO_LARGE');
          chunks.push(next.value);
        }
      } finally { await reader.cancel().catch(() => undefined); }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks));
      const data: unknown = JSON.parse(text);
      // Parsed values catch an echoed key even when JSON used unicode escapes.
      if (text.includes(this.#key) || JSON.stringify(data).includes(this.#key)) fail('SECRET_ECHO');
      return object(data);
    } catch (error) {
      if (error instanceof PageIndexCloudError) throw error;
      throw new PageIndexCloudError('PAGEINDEX_TRANSPORT_FAILED', { cause: error });
    }
  }

  /**
   * Uploads one PDF for indexing as multipart field `file`. Single attempt, no retry. Path and form were checked live on 18/10
   * (no file → 422 on `body.file`); no real upload was sent. Vendor docs: the reply carries `doc_id`, indexing is asynchronous and
   * a name already in use gains a suffix, so a reply without `name` or `pageNum` is completed by the free metadata read.
   */
  async uploadDocument(input: PageIndexCloudUpload, signal?: AbortSignal): Promise<PageIndexCloudDocument> {
    if (typeof input.fileName !== 'string' || !input.fileName.trim() || input.fileName.length > 256 || /[\r\n]/u.test(input.fileName)) fail('INPUT_INVALID');
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength < 1 || input.bytes.byteLength > MAX_UPLOAD_BYTES) fail('INPUT_INVALID');
    const form = new FormData();
    form.append('file', new Blob([Buffer.from(input.bytes)], { type: 'application/pdf' }), input.fileName);
    const response = await this.#request(PAGEINDEX_UPLOAD_PATH, form, signal);
    if (response.name === undefined || response.name === null || response.pageNum === undefined) {
      const id = response.id ?? response.doc_id;
      return this.documentStatus(typeof id === 'string' ? id : fail('RESPONSE_INVALID'), signal);
    }
    return toDocument(response);
  }

  /**
   * Reads one document's indexing state via its metadata. Single attempt, no retry.
   */
  async documentStatus(cloudDocId: string, signal?: AbortSignal): Promise<PageIndexCloudDocument> {
    if (typeof cloudDocId !== 'string' || !cloudDocId.trim() || cloudDocId.length > 256 || /[\r\n]/u.test(cloudDocId)) fail('INPUT_INVALID');
    return toDocument(await this.#request('/doc/' + encodeURIComponent(cloudDocId) + '/metadata', undefined, signal));
  }

  /**
   * Lists uploaded documents. This is the free call used by status rechecks;
   * it never uploads and never asks a question. Single attempt, no retry.
   */
  async listDocuments(): Promise<readonly PageIndexCloudDocument[]> {
    const documents: PageIndexCloudDocument[] = [];
    // Every non-empty page advances the offset; bound documents, even if the service returns fewer than requested per page.
    while (documents.length <= MAX_LISTED) {
      const response = await this.#request(`${PAGEINDEX_LIST_PATH}?limit=${LIST_PAGE_SIZE}&offset=${documents.length}`);
      const listed: unknown = response.documents;
      if (!Array.isArray(listed)) return fail('RESPONSE_INVALID');
      const total = typeof response.total === 'number' && Number.isSafeInteger(response.total) && response.total >= 0 ? response.total : null;
      if ((total ?? 0) > MAX_LISTED || documents.length + listed.length > MAX_LISTED) return fail('RESPONSE_TOO_LARGE');
      documents.push(...listed.map(entry => toDocument(object(entry))));
      if (listed.length === 0 && total !== null && documents.length < total) return fail('RESPONSE_INVALID');
      if (listed.length === 0 || (total !== null ? documents.length >= total : listed.length < LIST_PAGE_SIZE)) return documents;
    }
    return fail('RESPONSE_TOO_LARGE');
  }

  /** Local pages must be extracted from these exact bytes, never from Cloud OCR. */
  async query(request: PageIndexCloudQuery, sourceBytes: Uint8Array,
    localPages: readonly { page: number; text: string }[], signal?: AbortSignal): Promise<PageIndexCloudResult> {
    if (!validateQuery(request) || !request.question.trim() || hash(sourceBytes) !== request.sourceSha256) fail('INPUT_INVALID');
    if (!Buffer.from(sourceBytes.subarray(0, 5)).equals(Buffer.from('%PDF-')) ||
      !Number.isSafeInteger(request.pageCount) || request.pageCount < 1 || request.pageCount > 1000 ||
        localPages.length !== request.pageCount || localPages.some((p, i) => !p || p.page !== i + 1 || typeof p.text !== 'string')) fail('LOCAL_PDF_INVALID');
    const docPath = '/doc/' + encodeURIComponent(request.cloudDocId);
    const metadata = await this.#request(docPath + '/metadata', undefined, signal);
    // The vendor returns id, not doc_id, on this endpoint.
    if (metadata.id !== request.cloudDocId || metadata.name !== request.cloudFileName || metadata.pageNum !== request.pageCount) fail('DOCUMENT_MISMATCH');
    if (metadata.status !== 'completed') fail('INDEX_NOT_READY');
    const response = await this.#request('/chat/completions', {
      doc_id: request.cloudDocId, stream: false, temperature: 0, enable_citations: true,
      messages: [{ role: 'user', content: request.question }],
    }, signal);
    if (!Array.isArray(response.choices) || response.choices.length !== 1) return fail('RESPONSE_INVALID');
    const answer = string(object(object(response.choices[0]).message).content, 100_000);
    // Both tag forms pass the same identity checks: `<doc=NAME;page=N;block=ID>` (this parser's original form) and
    // `<cite doc="NAME" page="N" block="ID"/>` (vendor SDK docs). Neither form was seen in a live paid answer (not checked on 18/10).
    const tagPattern = /<doc=([^;>]+);page=(\d+);block=([^>]+)>|<cite\s+doc="([^"]+)"\s+page="(\d+)"\s+block="([^"]+)"\s*\/>/gu;
    // A malformed tag must not disappear from identity validation, including when other valid tags are present.
    if (/<\/?\s*(?:doc|cite)\b/iu.test(answer.replace(tagPattern, ''))) fail('CITATIONS_INVALID');
    const tags = [...answer.matchAll(tagPattern)]
      .map(match => match[1] !== undefined ? [match[0], match[1], match[2], match[3]] : [match[0], match[4], match[5], match[6]]);
    if (!Array.isArray(response.citations)) return fail('CITATIONS_INVALID');
    const refs = new Map<string, { page: number; blockId: string }>();
    for (const tag of tags) {
      const page = Number(tag[2]); const blockId = tag[3]!;
      if (tag[1] !== request.cloudFileName || !Number.isSafeInteger(page) || page < 1 || page > request.pageCount ||
        !new RegExp(`^p${page}_[A-Za-z]+_[0-9]+$`, 'u').test(blockId)) fail('CITATION_IDENTITY_MISMATCH');
      const existing = refs.get(blockId);
      if (existing && existing.page !== page) fail('CITATION_IDENTITY_MISMATCH');
      refs.set(blockId, { page, blockId });
    }
    if (refs.size > MAX_BLOCKS) fail('CITATION_LIMIT');
    const citationMetadata = new Map<string, Record<string, unknown>>();
    for (const raw of response.citations) {
      const c = object(raw); const id = string(c.block_id, 100); const ref = refs.get(id);
      if (!ref || c.document !== request.cloudFileName || c.page !== ref.page || citationMetadata.has(id)) fail('CITATION_IDENTITY_MISMATCH');
      citationMetadata.set(id, c);
    }
    if (citationMetadata.size !== refs.size) fail('CITATION_IDENTITY_MISMATCH');
    const candidates: PageIndexCloudCandidate[] = [];
    for (const ref of refs.values()) {
      const block = await this.#request(docPath + '/block/' + encodeURIComponent(ref.blockId) + '/', undefined, signal);
      const meta = citationMetadata.get(ref.blockId)!;
      if (block.doc_id !== request.cloudDocId || block.page !== ref.page || block.block_id !== ref.blockId ||
        block.block_type !== meta.block_type || JSON.stringify(block.bbox) !== JSON.stringify(meta.bbox)) fail('BLOCK_IDENTITY_MISMATCH');
      if (!Array.isArray(block.bbox) || block.bbox.length !== 4 || block.bbox.some(x => typeof x !== 'number' || !Number.isFinite(x) || x < 0 || x > 1000) ||
        !(block.bbox[0] < block.bbox[2] && block.bbox[1] < block.bbox[3])) fail('BLOCK_GEOMETRY_INVALID');
      const quote = string(block.text, 40_000); const blockType = string(block.block_type, 40);
      const comparable = blockType === 'table'
        ? quote.split('\n').filter(line => !/^\s*\|?[\s:|\-]+\|?\s*$/u.test(line)).join('\n').replaceAll('|', ' ')
        : quote;
      const comparableText = normalise(comparable);
      const matches = comparableText.length > 0 && normalise(localPages[ref.page - 1]!.text).includes(comparableText);
      candidates.push({ role: 'RETRIEVAL_CANDIDATE', sourceSha256: request.sourceSha256,
        page: ref.page, blockId: ref.blockId, blockType, bbox: block.bbox as number[], quote,
        verification: matches ? 'LOCAL_PDF_TEXT_MATCH' : 'UNVERIFIED_LOCAL_TEXT' });
    }
    const usage = response.usage ? object(response.usage) : {};
    const token = (v: unknown): number | null => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 ? v : null;
    return {
      contractVersion: 'pageindex-cloud-result-v1', approvalState: 'UNREVIEWED',
      sourcePackageId: request.sourcePackageId, manifestSha256: request.manifestSha256, logicalPath: request.logicalPath,
      sourceSha256: request.sourceSha256, cloudDocId: request.cloudDocId, cloudBinding: 'CALLER_ASSERTED_LOCALLY_CHECKED',
      answer, model: typeof response.model === 'string' ? response.model : null,
      usage: { promptTokens: token(usage.prompt_tokens), completionTokens: token(usage.completion_tokens) }, candidates,
      limitations: [
        'Cloud document identity is operator-bound; the vendor API does not attest the original upload SHA-256.',
        'Text match is not semantic support, complete-document coverage or pixel-exact highlight verification.',
        'No claim is approved or attached to an existing report by this retrieval result.',
        ...(candidates.some(c => c.verification !== 'LOCAL_PDF_TEXT_MATCH') ? ['Some quotes could not be matched to local PDF text.'] : []),
        ...(candidates.length === 0 ? ['No block citations returned; this does not establish absence of evidence.'] : []),
      ],
    };
  }
}

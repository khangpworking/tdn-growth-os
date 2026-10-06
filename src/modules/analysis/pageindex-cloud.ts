import { createHash } from 'node:crypto';
import { Ajv } from 'ajv';
import querySchema from '../../../contracts/analysis/pageindex-cloud-query.schema.json' with { type: 'json' };
import type { PageIndexCloudQuery } from '../../../contracts/analysis/pageindex-cloud-query.generated.js';

const validateQuery = new Ajv({ strict: true }).compile<PageIndexCloudQuery>(querySchema);

const ORIGIN = 'https://api.pageindex.ai';
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const MAX_BLOCKS = 16;
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fail = (code: string): never => { throw new Error(`PAGEINDEX_${code}`); };
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('RESPONSE_INVALID');
  return value as Record<string, unknown>;
};
const string = (value: unknown, max: number): string => {
  if (typeof value !== 'string' || !value.length || value.length > max) return fail('RESPONSE_INVALID');
  return value;
};
const normalise = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

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

  async #request(endpoint: string, body?: unknown): Promise<Record<string, unknown>> {
    try {
      const response = await this.#fetch(ORIGIN + endpoint, {
        method: body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: body === undefined ? { api_key: this.#key } : { api_key: this.#key, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok) fail(`HTTP_${response.status}`);
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
      if (error instanceof Error && /^PAGEINDEX_[A-Z0-9_]+$/u.test(error.message)) throw error;
      return fail('TRANSPORT_FAILED');
    }
  }

  /** Local pages must be extracted from these exact bytes, never from Cloud OCR. */
  async query(request: PageIndexCloudQuery, sourceBytes: Uint8Array,
    localPages: readonly { page: number; text: string }[]): Promise<PageIndexCloudResult> {
    if (!validateQuery(request) || !request.question.trim() || hash(sourceBytes) !== request.sourceSha256) fail('INPUT_INVALID');
    if (!Buffer.from(sourceBytes.subarray(0, 5)).equals(Buffer.from('%PDF-')) ||
      !Number.isSafeInteger(request.pageCount) || request.pageCount < 1 || request.pageCount > 1000 ||
        localPages.length !== request.pageCount || localPages.some((p, i) => !p || p.page !== i + 1 || typeof p.text !== 'string')) fail('LOCAL_PDF_INVALID');
    const docPath = '/doc/' + encodeURIComponent(request.cloudDocId);
    const metadata = await this.#request(docPath + '/metadata');
    // The vendor returns id, not doc_id, on this endpoint.
    if (metadata.id !== request.cloudDocId || metadata.name !== request.cloudFileName || metadata.pageNum !== request.pageCount) fail('DOCUMENT_MISMATCH');
    if (metadata.status !== 'completed') fail('INDEX_NOT_READY');
    const response = await this.#request('/chat/completions', {
      doc_id: request.cloudDocId, stream: false, temperature: 0, enable_citations: true,
      messages: [{ role: 'user', content: request.question }],
    });
    if (!Array.isArray(response.choices) || response.choices.length !== 1) return fail('RESPONSE_INVALID');
    const answer = string(object(object(response.choices[0]).message).content, 100_000);
    const tags = [...answer.matchAll(/<doc=([^;>]+);page=(\d+);block=([^>]+)>/gu)];
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
      const block = await this.#request(docPath + '/block/' + encodeURIComponent(ref.blockId) + '/');
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

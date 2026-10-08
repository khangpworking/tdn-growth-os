import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ContentAddressedArtifactStore, type ArtifactReadOptions } from '../../../platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import commentsSchema from '../../../../contracts/analysis/tiktok-comment-collection-v1.schema.json' with { type: 'json' };
import readingSchema from '../../../../contracts/analysis/video-reading-v1.schema.json' with { type: 'json' };
import keywordSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import type { TikTokVideoSelectionRequest, TikTokCommentCollectionIntent, TikTokCommentRetainedCapture, TikTokCommentSourceReceipt,
  TikTokCommentReadView, TikTokCommentSourceHistory, TikTokSourcePackageIdentity } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { VideoReadingPrepareRequest, VideoReadingSourceReceipt, VideoReadingReadView, VideoReadingSourceHistory } from '../../../../contracts/analysis/video-reading-v1.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { KeywordListDraftRecord } from '../keyword-list-draft-record.js';
import { CitationRegistry } from '../citation-registry.js';
import { ApifyTikTokCommentsCollector, retainedTikTokCapture, tikTokCommentActorInput } from '../../../platform/collectors/apify-tiktok-comments.js';
import { selectTikTokVideos, type TikTokVideoSelectionBinding } from './tiktok-video-selection.js';
import { buildTikTokCommentCorpus, citeTikTokCommentCorpus } from './tiktok-comment-intake.js';
import { prepareVideoReading, citeVideoReading } from './video-reading-intake.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema([keywordSchema, commentsSchema, readingSchema]);
const validateSelectionRequest = ajv.compile<TikTokVideoSelectionRequest>({ $ref: `${commentsSchema.$id}#/$defs/selectionRequest` });
const validateIntent = ajv.compile<TikTokCommentCollectionIntent>({ $ref: `${commentsSchema.$id}#/$defs/intent` });
const validateCapture = ajv.compile<TikTokCommentRetainedCapture>({ $ref: `${commentsSchema.$id}#/$defs/capture` });
const validateReadingRequest = ajv.compile<VideoReadingPrepareRequest>({ $ref: `${readingSchema.$id}#/$defs/request` });
const validateCommentView = ajv.compile<TikTokCommentReadView>({ $ref: `${commentsSchema.$id}#/$defs/readView` });
const validateReadingView = ajv.compile<VideoReadingReadView>({ $ref: `${readingSchema.$id}#/$defs/readView` });
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const bytes = (value: unknown) => Buffer.from(canonicalJson(value));
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
const identity = (p: VerifiedFinalizedSourcePackage): TikTokSourcePackageIdentity => ({ packageId: p.packageId,
  manifestArtifactSha256: p.manifestArtifactSha256, packageContentSha256: p.packageContentSha256 });
const mediaType = (name: string) => name === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json'
  : name.endsWith('.png') ? 'image/png' : name.endsWith('.jpg') ? 'image/jpeg' : 'application/json';
const readingBinding = (binding: TikTokVideoSelectionBinding, selectionSha256: string) => ({
  workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256, sourceSetSha256: binding.sourceSetSha256, selectionSha256 });
const BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };
export class P9SourceError extends Error { readonly code = 'P9_SOURCE_REJECTED'; }
function fail(): never { throw new P9SourceError('P9 source identity, retained evidence or explicit configuration differs.'); }
type PackageKind = 'selection' | 'intent' | 'comments' | 'reading' | 'diagnostic';
export const p9PackagePrefix = (runId: string, kind: PackageKind) => `automation-p9-${kind}:${runId}-`;
/** After each awaited put, abort before Foundation's synchronous publication.
 * Already-written sanitized CAS bytes may be orphaned; no deletion/rollback. */
export class P9PublicationArtifactStore extends ContentAddressedArtifactStore {
  constructor(private readonly base: ContentAddressedArtifactStore, private readonly guard: () => void) {
    // This service uses the ordinary owning CAS, never attachment staging.
    // Fail closed rather than hide Foundation's scoped ownership/recovery type.
    if (base instanceof RequestScopedArtifactStore) fail();
    super(path.resolve(base.pathForDigest('0'.repeat(64)), '../../..'));
  }
  override async put(value: Uint8Array) { this.guard(); const stored = await this.base.put(value); this.guard(); return stored; }
  override read(digest: string, options?: ArtifactReadOptions) { return this.base.read(digest, options); }
  override pathForDigest(digest: string) { return this.base.pathForDigest(digest); }
}
function member(p: VerifiedFinalizedSourcePackage, path: string) { return p.files.find(f => f.path === path) ?? fail(); }
function json<T>(p: VerifiedFinalizedSourcePackage, path: string): T {
  const file = member(p, path);
  try { const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    if (!bytes(value).equals(file.bytes)) fail(); return value as T;
  } catch { return fail(); }
}

/** Analysis owns workflow state; Foundation owns immutable package writes.
 * All callbacks authenticate the owning run, not operator-provided evidence. */
export class AutomationP9SourceIntake {
  readonly #packages: SourcePackageService;
  readonly #reader: FoundationSourcePackageReader;
  constructor(private readonly options: { packages: SourcePackageService; collector?: ApifyTikTokCommentsCollector;
    diagnostics: SourcePackageService;
    publishDiagnostic: <T>(operation: () => Promise<T>) => Promise<T>;
    keywordDraft: (digest: string) => Promise<KeywordListDraftRecord>;
    publish: <T>(operation: () => Promise<T>) => Promise<T> }) {
    this.#packages = options.packages; this.#reader = new FoundationSourcePackageReader(options.packages);
  }
  async #lookup(key: string) {
    const matches = await this.#reader.findFinalizedSourcePackagesByKey(key);
    if (matches.length > 1 || (matches[0] && matches[0].version !== 1)) fail();
    if (!matches[0]) return undefined;
    const p = await this.#reader.readFinalizedSourcePackage(matches[0].packageId, BUDGET);
    if (p.manifestArtifactSha256 !== matches[0].manifestArtifactSha256 || p.manifest.packageKey !== key) fail();
    return p;
  }
  async #verify(p: VerifiedFinalizedSourcePackage, binding: TikTokVideoSelectionBinding, kind: PackageKind, requestKey: string, paths: readonly string[]) {
    if (p.manifest.packageKey !== p9PackagePrefix(binding.runId, kind) + requestKey || p.manifest.version !== 1 ||
      p.files.length !== paths.length || p.files.some(f => !paths.includes(f.path))) fail();
    const origin = await this.#reader.readAutomationAttachmentOrigin(p.packageId, BUDGET);
    if (!origin || origin.bindingSha256 !== sha(bytes(binding)) || origin.manifestArtifactSha256 !== p.manifestArtifactSha256) fail();
    for (const f of p.files) {
      if (f.evidenceFamily !== `p9-${kind}-v1` || f.independence !== 'non_independent' || f.representationRole !== 'derived' ||
        f.providerProvenance !== 'operator_supplied_unverified' || f.mediaType !== mediaType(f.path) || f.period !== undefined) fail();
    }
  }
  async #store(binding: TikTokVideoSelectionBinding, kind: PackageKind, requestKey: string,
    files: ReadonlyMap<string, Uint8Array>, acquiredAt: string | null = null) {
    // Never finalize a package that the same declared bounded reader cannot
    // reopen. Refusal preserves the sample; no text truncation or sampling.
    if ([...files.values()].some(value => value.byteLength > BUDGET.maxFileBytes) ||
      [...files.values()].reduce((total, value) => total + value.byteLength, 0) > BUDGET.maxTotalBytes) fail();
    const input: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: p9PackagePrefix(binding.runId, kind) + requestKey,
      version: 1, sourceLabel: `P9 ${kind}: explicitly selected bounded evidence`, sourceAcquiredAt: acquiredAt,
      files: [...files].map(([path, value]) => ({ path, sha256: sha(value), byteSize: value.byteLength,
        mediaType: mediaType(path),
        evidenceFamily: `p9-${kind}-v1`, representationRole: 'derived', independence: 'non_independent',
        providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Explicit Analysis-owned P9 source intake; bounded sanitized evidence or operator reading, not provider authenticity, people, release approval or complete platform coverage.' })) as SourcePackageIntakeRequest['files'] };
    const result = kind === 'diagnostic'
      ? await this.options.publishDiagnostic(() => this.options.diagnostics.intakeAutomationAttachment(input, files, sha(bytes(binding))))
      : await this.options.publish(async () => {
        // Check under the owning mutation mutex too: two configured service
        // instances must not both treat an idempotent intent write as a new
        // paid dispatch permission.
        if (kind === 'intent' && await this.#lookup(input.packageKey)) fail();
        return this.#packages.intakeAutomationAttachment(input, files, sha(bytes(binding)));
      });
    return this.#reader.readFinalizedSourcePackage(result.packageId, BUDGET);
  }
  async select(binding: TikTokVideoSelectionBinding, value: unknown) {
    if (!validateSelectionRequest(value)) fail();
    const request = structuredClone(value);
    const prior = await this.#lookup(p9PackagePrefix(binding.runId, 'selection') + request.requestKey);
    if (prior) {
      const verified = await this.selection(binding, identity(prior));
      if (!equal(verified.request, request)) fail();
      return identity(prior);
    }
    const selected = await selectTikTokVideos(this.#reader, binding, request);
    const retained = await this.#store(binding, 'selection', request.requestKey, new Map([
      ['selection-request.json', bytes(request)], ['selection.json', bytes(selected.selection)] ]));
    return identity(retained);
  }
  async selection(binding: TikTokVideoSelectionBinding, selectedIdentity: TikTokSourcePackageIdentity) {
    const retained = await this.#reader.readFinalizedSourcePackage(selectedIdentity.packageId, BUDGET);
    if (!equal(identity(retained), selectedIdentity)) fail();
    const request = json<TikTokVideoSelectionRequest>(retained, 'selection-request.json');
    if (!validateSelectionRequest(request)) fail();
    await this.#verify(retained, binding, 'selection', request.requestKey, ['selection-request.json', 'selection.json']);
    const selected = await selectTikTokVideos(this.#reader, binding, request);
    if (!member(retained, 'selection.json').bytes.equals(bytes(selected.selection))) fail();
    return { ...selected, request, retained };
  }
  async collect(binding: TikTokVideoSelectionBinding, selectedIdentity: TikTokSourcePackageIdentity, keywordDigest: string,
    signal?: AbortSignal) {
    const selected = await this.selection(binding, selectedIdentity);
    const { requestKey } = selected.request;
    const existing = await this.#lookup(p9PackagePrefix(binding.runId, 'comments') + requestKey);
    if (existing) return (await this.comments(binding, identity(existing))).receipt;
    signal?.throwIfAborted();
    const collector = this.options.collector; if (!collector) fail();
    const draft = await this.options.keywordDraft(keywordDigest);
    signal?.throwIfAborted();
    const configuration = collector.collectionConfiguration;
    const intent: TikTokCommentCollectionIntent = { contractVersion: 'tiktok-comment-intent-v1', requestKey,
      binding: { ...binding, sourcePeriod: selected.selection.sourcePeriod }, selection: selected.selection,
      selectionSha256: selected.selectionSha256, keywordData: draft.output, ...configuration,
      privacy: collector.privacyProfile, replyPolicy: 'TOP_LEVEL_ONLY', auditForm: 'SANITIZED_ALLOWLIST' };
    if (!validateIntent(intent)) fail();
    // A persisted unfinished attempt is evidence of a possible paid dispatch,
    // not permission to start another transport, even after process restart.
    if (await this.#lookup(p9PackagePrefix(binding.runId, 'intent') + requestKey)) fail();
    signal?.throwIfAborted();
    await this.#store(binding, 'intent', requestKey, new Map([['intent.json', bytes(intent)], ['keyword-draft.json', bytes(draft)]]));
    signal?.throwIfAborted();
    const capture = await collector.collect(selected.selection.videos.map(v => v.url), sha(bytes(intent)), signal,
      async receipt => { await this.#store(binding, 'diagnostic', requestKey,
        new Map([['intent.json', bytes(intent)], ['provider-receipt.json', bytes(receipt)]]), receipt.retrievedAt); });
    signal?.throwIfAborted();
    if (!equal(capture.privacy, intent.privacy) || capture.actor !== intent.actor) fail();
    const corpus = buildTikTokCommentCorpus(selected, capture, draft.output);
    const files = new Map<string, Uint8Array>([['selection-package.json', bytes(selectedIdentity)], ['intent.json', bytes(intent)],
      ['keyword-draft.json', bytes(draft)], ['capture.json', bytes(retainedTikTokCapture(capture))], ['corpus.json', bytes(corpus)]]);
    for (const [index, page] of capture.pages.entries()) files.set(`pages/${index}.json`, page.bytes);
    signal?.throwIfAborted();
    const retained = await this.#store(binding, 'comments', requestKey, files, capture.receipt.retrievedAt);
    return { ...(await this.comments(binding, identity(retained))).receipt, exactRetry: false };
  }
  async comments(binding: TikTokVideoSelectionBinding, sourceIdentity: TikTokSourcePackageIdentity) {
    const p = await this.#reader.readFinalizedSourcePackage(sourceIdentity.packageId, BUDGET);
    if (!equal(identity(p), sourceIdentity)) fail();
    const intent = json<TikTokCommentCollectionIntent>(p, 'intent.json');
    const capture = json<TikTokCommentRetainedCapture>(p, 'capture.json');
    if (!validateIntent(intent) || !validateCapture(capture)) fail();
    await this.#verify(p, binding, 'comments', intent.requestKey, ['selection-package.json', 'intent.json', 'keyword-draft.json', 'capture.json', 'corpus.json', ...capture.pages.map((_, i) => `pages/${i}.json`)]);
    const selected = await this.selection(binding, json<TikTokSourcePackageIdentity>(p, 'selection-package.json'));
    if (selected.request.requestKey !== intent.requestKey || !equal(intent.binding, { ...binding, sourcePeriod: selected.selection.sourcePeriod }) ||
      !equal(intent.selection, selected.selection) || intent.selectionSha256 !== selected.selectionSha256 || !equal(intent.privacy, capture.privacy) ||
      capture.actor !== intent.actor || p.manifest.sourceAcquiredAt !== capture.receipt.retrievedAt) fail();
    const frozenIntent = await this.#lookup(p9PackagePrefix(binding.runId, 'intent') + intent.requestKey); if (!frozenIntent) fail();
    await this.#verify(frozenIntent, binding, 'intent', intent.requestKey, ['intent.json', 'keyword-draft.json']);
    if (!member(frozenIntent, 'intent.json').bytes.equals(bytes(intent)) || !member(frozenIntent, 'keyword-draft.json').bytes.equals(member(p, 'keyword-draft.json').bytes)) fail();
    const diagnostic = await this.#lookup(p9PackagePrefix(binding.runId, 'diagnostic') + intent.requestKey); if (!diagnostic) fail();
    await this.#verify(diagnostic, binding, 'diagnostic', intent.requestKey, ['intent.json', 'provider-receipt.json']);
    if (!member(diagnostic, 'intent.json').bytes.equals(bytes(intent)) || !member(diagnostic, 'provider-receipt.json').bytes.equals(bytes(capture.receipt)) ||
      diagnostic.manifest.sourceAcquiredAt !== capture.receipt.retrievedAt) fail();
    const draft = await this.options.keywordDraft(member(p, 'keyword-draft.json').sha256);
    if (!bytes(draft).equals(member(p, 'keyword-draft.json').bytes) || !equal(draft.output, intent.keywordData)) fail();
    const input = tikTokCommentActorInput(intent.actor, intent.selection.videos.map(v => v.url), intent.maxCommentsPerVideo);
    if (capture.inputSha256 !== sha(bytes(input)) || (capture.receipt.usageTotalUsd !== null && capture.receipt.usageTotalUsd > intent.approvedMaxTotalChargeUsd)) fail();
    const transient = { ...capture, pages: capture.pages.map((page, i) => ({ ...page, bytes: member(p, `pages/${i}.json`).bytes })) };
    const perVideo = new Map<string, Set<string>>();
    for (const page of capture.pages) for (const row of page.rows) if (!row.isReply) {
      const ids = perVideo.get(row.videoId) ?? new Set<string>(); ids.add(row.commentId); perVideo.set(row.videoId, ids);
      if (ids.size > intent.maxCommentsPerVideo) fail();
    }
    const returnedRows = capture.pages.reduce((count, page) => count + page.rows.length, 0);
    if (returnedRows > intent.selection.videos.length * intent.maxCommentsPerVideo * 4 ||
      (capture.receipt.providerTotalRows !== null && capture.receipt.providerTotalRows !== returnedRows)) fail();
    const corpus = buildTikTokCommentCorpus(selected, transient, draft.output);
    if (!member(p, 'corpus.json').bytes.equals(bytes(corpus))) fail();
    const registry = new CitationRegistry();
    const view: TikTokCommentReadView = { contractVersion: 'tiktok-comment-read-v1', registryId: 'S07', sampleLabel: corpus.sampleLabel,
      rows: citeTikTokCommentCorpus(corpus, registry) as TikTokCommentReadView['rows'], accounting: corpus.accounting, limitations: corpus.limitations };
    if (!validateCommentView(view)) fail();
    const receipt: TikTokCommentSourceReceipt = { contractVersion: 'tiktok-comment-source-receipt-v1', requestKey: intent.requestKey,
      package: identity(p), selectionSha256: selected.selectionSha256, corpusSha256: member(p, 'corpus.json').sha256,
      exactRetry: true, state: 'RETAINED_NOT_CODED' };
    return { receipt, view, citations: registry.entries(), finalizedAt: p.manifest.finalizedAt };
  }
  async prepareReading(binding: TikTokVideoSelectionBinding, value: unknown, frames: ReadonlyMap<string, Uint8Array>) {
    if (!validateReadingRequest(value)) fail();
    const request = structuredClone(value);
    const selected = await this.selection(binding, request.selectionPackage);
    if (!selected.selection.videos.some(v => v.url === request.input.videoUrl && v.kind === request.input.videoKind)) fail();
    const prepared = prepareVideoReading(request.input, frames, readingBinding(binding, selected.selectionSha256));
    const existing = await this.#lookup(p9PackagePrefix(binding.runId, 'reading') + request.requestKey);
    if (existing) {
      const read = await this.reading(binding, identity(existing));
      if (!member(existing, 'request.json').bytes.equals(bytes(request)) || !member(existing, 'reading.json').bytes.equals(prepared.bytes)) fail();
      return read.receipt;
    }
    const retained = await this.#store(binding, 'reading', request.requestKey,
      new Map<string, Uint8Array>([['request.json', bytes(request)], ['reading.json', prepared.bytes], ...frames]));
    return { ...(await this.reading(binding, identity(retained))).receipt, exactRetry: false };
  }
  async reading(binding: TikTokVideoSelectionBinding, sourceIdentity: TikTokSourcePackageIdentity) {
    const p = await this.#reader.readFinalizedSourcePackage(sourceIdentity.packageId, BUDGET);
    if (!equal(identity(p), sourceIdentity)) fail();
    const request = json<VideoReadingPrepareRequest>(p, 'request.json'); if (!validateReadingRequest(request)) fail();
    await this.#verify(p, binding, 'reading', request.requestKey, ['request.json', 'reading.json', ...request.input.frames.map(f => f.logicalPath)]);
    const selected = await this.selection(binding, request.selectionPackage);
    if (!selected.selection.videos.some(v => v.url === request.input.videoUrl && v.kind === request.input.videoKind)) fail();
    const prepared = prepareVideoReading(request.input, new Map(request.input.frames.map(f => [f.logicalPath, member(p, f.logicalPath).bytes])),
      readingBinding(binding, selected.selectionSha256));
    if (!member(p, 'reading.json').bytes.equals(prepared.bytes)) fail();
    const registry = new CitationRegistry();
    const view: VideoReadingReadView = { contractVersion: 'video-reading-read-v1', registryId: 'S14',
      rows: citeVideoReading(prepared.reading, prepared.sha256, registry), limitations: prepared.reading.limitations };
    if (!validateReadingView(view)) fail();
    const receipt: VideoReadingSourceReceipt = { contractVersion: 'video-reading-source-receipt-v1', requestKey: request.requestKey,
      package: identity(p), readingSha256: prepared.sha256, exactRetry: true, state: 'PREPARED_NOT_ADMITTED' };
    return { receipt, view, citations: registry.entries(), finalizedAt: p.manifest.finalizedAt };
  }
  async history(binding: TikTokVideoSelectionBinding) {
    const commentSources: TikTokCommentSourceHistory['sources'] = [];
    const readingSources: VideoReadingSourceHistory['sources'] = [];
    let commentsAt: string | null = null, readingsAt: string | null = null;
    for (const kind of ['comments', 'reading'] as const) {
      const entries = await this.#reader.findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(binding.runId, kind));
      if (entries.length >= 101) fail(); // The declared bounded lookup cannot prove a longer history complete.
      for (const entry of entries) {
        const source = await this.#reader.readFinalizedSourcePackage(entry.packageId, BUDGET);
        if (source.manifestArtifactSha256 !== entry.manifestArtifactSha256 || entry.version !== 1) fail();
        if (kind === 'comments') { const read = await this.comments(binding, identity(source)); commentSources.push(read.receipt);
          if (commentsAt === null || read.finalizedAt > commentsAt) commentsAt = read.finalizedAt;
        } else { const read = await this.reading(binding, identity(source)); readingSources.push(read.receipt);
          if (readingsAt === null || read.finalizedAt > readingsAt) readingsAt = read.finalizedAt; }
      }
    }
    const comments: TikTokCommentSourceHistory = { contractVersion: 'tiktok-comment-source-history-v1', workspaceId: binding.workspaceId, runId: binding.runId, sources: commentSources };
    const readings: VideoReadingSourceHistory = { contractVersion: 'video-reading-source-history-v1', workspaceId: binding.workspaceId, runId: binding.runId, sources: readingSources };
    return { comments, readings, commentsAt, readingsAt };
  }
}

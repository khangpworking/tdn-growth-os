import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import { createRequire } from 'node:module';
import corpusSchema from '../../../../contracts/analysis/research-review-corpus.schema.json' with { type: 'json' };
import publicCorpusSchema from '../../../../contracts/analysis/research-review-corpus-v2.schema.json' with { type: 'json' };
import collectionSchema from '../../../../contracts/foundation/shopee-public-collection.schema.json' with { type: 'json' };
import rowsSchema from '../../../../contracts/foundation/shopee-public-rows.schema.json' with { type: 'json' };
import legacyCollectionSchema from '../../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import type { ResearchReviewCorpusV2 } from '../../../../contracts/analysis/research-review-corpus-v2.generated.js';
import type { ShopeeCollector } from '../../../platform/collectors/apify-shopee.js';
import type { ShopeePublicRows } from '../../../../contracts/foundation/shopee-public-rows.generated.js';
import { type PublicCollectedPages, type PublicReviewStage, type ShopeePublicReviewSessionClient, validatePublicReviewStage } from '../../../platform/collectors/shopee-public-reviews.js';
import { ShopeeCollectionService, type VerifiedPublicShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { selectExactShopeeListings } from '../../foundation/shopee-exact-selection.js';
import { exactShopeeRequest, type ExactShopeeRunInput, type ExactShopeeAttempt } from './exact-shopee-bridge.js';
import { classifyPublicExactShopee, markReviewShortfalls, publicExactShopeeOutcomeLimitation, publicExactShopeeOutcomeMessage, SHOPEE_REPAIRABLE_OUTCOMES, type ExactShopeeOutcomeRecord } from './exact-shopee-outcome.js';
import type { StepResultDocument } from './model.js';
export type PublicShopeeCollectorFactory = (acquisition: PublicReviewStage) => { collector: ShopeeCollector<PublicCollectedPages>; requestsIssued: () => number };
export interface PublicShopeeConfiguration {
  maxReviewsPerProduct: number;
  factory: PublicShopeeCollectorFactory;
  /** Owner repair only; absent keeps the login/confirm actions unavailable. */
  session?: (context: { kind: 'LOGIN' | 'CONFIRM'; requestKey: string }) => ShopeePublicReviewSessionClient;
}
export type PublicReviewSource = import('../../../../contracts/foundation/shopee-public-collection.generated.js').PublicReviewSource;

const sha = (v: unknown) => createHash('sha256').update(canonicalJson(v)).digest('hex');
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); (require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
for (const [name, schema] of [['research-review-corpus',corpusSchema],['shopee-public-collection',collectionSchema],['shopee-public-rows',rowsSchema],['shopee-collection',legacyCollectionSchema]] as const) ajv.addSchema(schema, name + '.schema.json');
ajv.addSchema(legacyCollectionSchema, 'https://tdn.local/contracts/foundation/shopee-collection.schema.json');
ajv.addSchema(corpusSchema, 'https://tdn.local/contracts/analysis/research-review-corpus.schema.json');
const validCorpus = ajv.compile<ResearchReviewCorpusV2>(publicCorpusSchema);
/** Deterministic, raw-only accounting; never enters the literal or qualitative parser. */
export function buildPublicReviewCorpus(source: VerifiedPublicShopeeCollection): ResearchReviewCorpusV2 {
  const { packet } = source;
  const groups = new Map<string, { row: ShopeePublicRows[number]; versions: Map<string, { row: ShopeePublicRows[number]; refs: ResearchReviewCorpusV2['records'][number]['versions'][number]['sourceRefs'] }>; count: number }>();
  const coverage: ResearchReviewCorpusV2['coverage'] = { sourceRows: 0, uniqueScopedGroups: 0, equalDuplicates: 0, conflictingGroups: 0, quarantinedRows: 0,
    capturedReviewRecords: 0, readableCommentRecords: 0, attributesOnlyRecords: 0, emptyComments: 0, unreadableComments: 0, missingRatings: 0, invalidRatings: 0, sourceExcludedIds: 0 };
  const excluded = new Set<string>(); for (const e of source.envelopes) for (const x of e.excluded) excluded.add(canonicalJson([e.shopId,e.itemId,x.reviewId]));
  coverage.sourceExcludedIds = excluded.size;
  for (let pageIndex = 0; pageIndex < source.pages.length; pageIndex++) {
    const page = source.pages[pageIndex]!, envelope = source.envelopes[pageIndex]!;
    envelope.rows.forEach((row, rowIndex) => {
      coverage.sourceRows++;
      if (row.comment === null) coverage.unreadableComments++; else if (!row.comment.trim()) coverage.emptyComments++;
      if (row.ratingState === 'MISSING') coverage.missingRatings++; if (row.ratingState === 'INVALID') coverage.invalidRatings++;
      const key = row.reviewId === null ? canonicalJson(['locator',page.sha256,rowIndex]) : canonicalJson([row.shopId,row.itemId,row.reviewId]);
      const { sourcePage: _page, sourceRow: _row, ...substantive } = row;
      const versionId = sha(substantive);
      let group = groups.get(key); if (!group) { group = { row, versions: new Map(), count: 0 }; groups.set(key, group); }
      group.count++;
      let version = group.versions.get(versionId);
      if (!version) { version = { row, refs: [] }; group.versions.set(versionId, version); } else coverage.equalDuplicates++;
      version.refs.push({ pageSha256: page.sha256, pageIndex, rowIndex, rowPointer: `/${rowIndex}`, textPointer: row.comment === null ? null : `/${rowIndex}/comment` });
    });
  }
  const records: ResearchReviewCorpusV2['records'] = [];
  for (const [key, group] of groups) {
    coverage.uniqueScopedGroups++;
    const conflict = group.versions.size > 1 || excluded.has(key);
    const invalid = [...group.versions.values()].some(v => v.row.reviewId === null || v.row.admissionReasons.some(r => r !== 'SOURCE_TIME_NOT_PARSED'));
    if (conflict) coverage.conflictingGroups++;
    if (conflict || invalid) coverage.quarantinedRows += group.count;
    else { coverage.capturedReviewRecords++; if (group.row.contentType === 'ATTRIBUTES_ONLY') coverage.attributesOnlyRecords++; else if (group.row.comment?.trim()) coverage.readableCommentRecords++; }
    records.push({ identity: { kind: group.row.reviewId === null ? 'SOURCE_ROW_LOCATOR' : 'NATIVE_REVIEW_ID', nativeReviewId: group.row.reviewId,
      listingKey: `shopee:${group.row.shopId}:${group.row.itemId}`, internalLocator: group.row.reviewId === null ? key : null },
      listingAdmission: 'SELECTED_LISTING', disposition: conflict ? 'UNRESOLVED_CONFLICT' : invalid ? 'QUARANTINED' : 'RETAINED_RAW', occurrenceCount: group.count,
      versions: [...group.versions].map(([rawRowSha256, v]) => ({ rawRowSha256, text: v.row.comment, textState: v.row.comment === null ? 'UNREADABLE' : v.row.comment.trim() ? 'READABLE' : 'EMPTY',
        rating: { state: v.row.ratingState, value: v.row.ratingStar }, sourceRefs: v.refs,
        reasons: [...v.row.admissionReasons, ...(v.row.contentType === 'ATTRIBUTES_ONLY' ? ['ATTRIBUTES_ONLY'] : []), ...(excluded.has(key) ? ['SOURCE_EXCLUSION_OVERLAP'] : [])] })) });
  }
  const content = { contractVersion: 'research-review-corpus-v2' as const, mappingRevision: 'shopee-public-review-row-v1' as const,
    collectionId: packet.collectionId, collectionSha256: source.sha256, requestSha256: packet.requestSha256, confirmedSourceSetSha256: packet.confirmedSourceSetSha256,
    selectionBasis: 'OWNER_EXACT_URL' as const, selectedListings: packet.selected.map(p => ({ platform: p.platform, shopId: p.shopId, itemId: p.itemId, listingKey: `shopee:${p.shopId}:${p.itemId}`, productUrl: p.productUrl })),
    sourcePages: source.pages.map((p, pageIndex) => ({ sha256: p.sha256, byteSize: p.bytes.length, offset: p.offset, pageIndex, rowCount: source.envelopes[pageIndex]!.rows.length })),
    capture: { providerId: packet.providerId, listings: packet.listings }, corpusState: 'RAW_CAPTURE_ONLY' as const, codingState: 'NOT_CODED' as const,
    records, coverage, blockers: ['RAW_CAPTURE_ONLY','NOT_CODED'], limitations: ['BOUNDED_VISIBLE_FILTER_ONLY','NO_AUTHOR_IDENTITY','REVIEW_DATES_NOT_PERIOD_FILTERED'] };
  const result = { ...content, corpusId: sha(content) };
  if (!validCorpus(result)) throw new Error('Public review corpus is invalid'); return result;
}
export function verifyPublicReviewCorpus(value: unknown, source: VerifiedPublicShopeeCollection): ResearchReviewCorpusV2 {
  const rebuilt = buildPublicReviewCorpus(source); if (!validCorpus(value) || canonicalJson(value) !== canonicalJson(rebuilt)) throw new Error('Public review corpus replay differs'); return rebuilt;
}
export function publicReviewOutcome(source: VerifiedPublicShopeeCollection, stage: PublicReviewStage, corpus = buildPublicReviewCorpus(source), storedOutcome?: ExactShopeeOutcomeRecord['outcome']): ExactShopeeOutcomeRecord {
  const counts = markReviewShortfalls(source.packet.selected.map(p => ({ listingUrl: p.productUrl, reviews: corpus.records.filter(r => r.disposition === 'RETAINED_RAW' && r.identity.listingKey === `shopee:${p.shopId}:${p.itemId}`).length })), stage.maxReviewsPerProduct);
  const classified = classifyPublicExactShopee({ receipts: source.packet.listings, counts, maxReviewsPerProduct: stage.maxReviewsPerProduct });
  // Old retained runs classified these same verified human/health stops as
  // PROVIDER_BLOCKED. Preserve that saved meaning on replay; callers still
  // compare every field against the rebuilt record. New collections omit it.
  const outcome = storedOutcome === 'PROVIDER_BLOCKED' && SHOPEE_REPAIRABLE_OUTCOMES.includes(classified) ? storedOutcome : classified;
  return { outcome, listings: counts,
    providerMessage: null, attemptedAt: source.packet.attemptedAt, reused: source.packet.reused,
    ...(stage.sampleMode === 'TRIAL' ? { testReviewCap: stage.maxReviewsPerProduct } : {}) };
}
export class AutomationPublicShopeeBridge {
  readonly #collections: ShopeeCollectionService;
  constructor(db: Database.Database, artifacts: ContentAddressedArtifactStore, readonly configuration?: PublicShopeeConfiguration) { this.#collections = new ShopeeCollectionService(db, artifacts); }
  async read(reference: NonNullable<StepResultDocument['exactShopee']>, input: ExactShopeeRunInput, stage: PublicReviewStage): Promise<VerifiedPublicShopeeCollection> {
    validatePublicReviewStage(stage);
    const source = await this.#collections.readPublicExact(reference.collectionId), request = exactShopeeRequest(input);
    if (source.sha256 !== reference.collectionSha256 || source.packet.requestSha256 !== reference.requestSha256 || sha(request) !== reference.requestSha256 ||
        canonicalJson(source.request) !== canonicalJson(request) || source.packet.confirmedSourceSetSha256 !== stage.confirmedSourceSetSha256 ||
        source.packet.providerId !== stage.providerId || source.packet.mappingRevision !== stage.mappingRevision || source.packet.maxReviewsPerProduct !== stage.maxReviewsPerProduct ||
        (stage.sampleMode === 'TRIAL' ? input.scope.testReviewCap !== stage.maxReviewsPerProduct : input.scope.testReviewCap !== undefined)) throw new Error('Public review binding differs');
    return source;
  }
  async collect(input: ExactShopeeRunInput, stage: PublicReviewStage, signal?: AbortSignal): Promise<ExactShopeeAttempt & { publicReviewAcquisition: PublicReviewStage }> {
    validatePublicReviewStage(stage);
    const request = exactShopeeRequest(input), requestBytes = Buffer.from(canonicalJson(request));
    const base = { provider: 'shopee-public-review', dataset: 'reviews', observedStartDate: null, observedEndDate: null, truncated: true } as const;
    const final = { ...stage, state: 'FINAL' as const };
    let source = await this.#collections.existingPublicExact(requestBytes, 'live', stage.confirmedSourceSetSha256), requestsIssued = 0;
    if (!source) {
      if (!this.configuration || this.configuration.maxReviewsPerProduct !== stage.maxReviewsPerProduct) return { publicReviewAcquisition: final, requestsIssued: 0, costUsd: '0',
        coverage: { ...base, state: 'UNAVAILABLE', note: 'Nguồn review công khai trên Shopee chưa sẵn sàng cho lượt đọc đã xác nhận.' },
        limitation: { provider: base.provider, code: 'PUBLIC_REVIEW_NOT_CONFIGURED', message: 'Chưa thu được đánh giá trong lượt này; không suy ra sản phẩm không có đánh giá.' } };
      const attempt = this.configuration.factory(stage);
      if (attempt.collector.maxReviewsPerProduct !== stage.maxReviewsPerProduct) throw new Error('Public collector cap differs');
      const collected = await attempt.collector.collect(selectExactShopeeListings(request).selected, sha(request), request.runKey, signal);
      source = await this.#collections.savePublicExact(requestBytes, collected); requestsIssued = Math.max(attempt.requestsIssued(), collected.listings.reduce((n, r) => n + r.requestCount, 0));
    }
    const reference = { collectionId: source.packet.collectionId, collectionSha256: source.sha256, requestSha256: source.packet.requestSha256 };
    await this.read(reference, input, stage);
    const outcome = publicReviewOutcome(source, stage), records = outcome.listings.some(r => r.reviews > 0), blocked = outcome.outcome === 'PROVIDER_BLOCKED';
    const named = publicExactShopeeOutcomeMessage(outcome.outcome), outcomeLimitation = publicExactShopeeOutcomeLimitation(outcome.outcome);
    return { publicReviewAcquisition: final, reference, exactShopeeOutcome: outcome, requestsIssued, costUsd: '0',
      coverage: { ...base, state: signal?.aborted || source.packet.listings.some(receipt => receipt.stopCode === 'OWNER_ABORTED') ? 'CANCELLED' : outcome.outcome === 'OK' ? 'COLLECTED' : records ? 'PARTIAL' : SHOPEE_REPAIRABLE_OUTCOMES.includes(outcome.outcome) ? 'FAILED' : blocked ? 'UNAVAILABLE' : 'FAILED',
        note: named ?? 'Nguồn: review công khai trên Shopee. Phạm vi này không phải toàn bộ lịch sử đánh giá.' },
      limitation: { provider: base.provider, code: 'PUBLIC_REVIEW_RAW_CAPTURE_ONLY', message: 'Số đánh giá không phải số người. Nội dung chưa được mã hóa; chưa có kết luận về tỷ lệ ý kiến hay đặc điểm khách hàng.' },
      ...(outcomeLimitation ? { outcomeLimitation } : {}) };
  }
}

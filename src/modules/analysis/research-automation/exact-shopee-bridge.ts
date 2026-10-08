import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ShopeeExactRequest } from '../../../../contracts/foundation/shopee-exact-request.generated.js';
import type { AutomationPrivateShopeeSource } from '../../../../contracts/analysis/automation-private-shopee-source.generated.js';
import type { ResearchPrivateReviewCorpus } from '../../../../contracts/analysis/research-private-review-corpus.generated.js';
import { privateShopeeMarker } from './private-review-contracts.js';
import { readPrivateReviewCollection, buildPrivateReviewCorpus, verifyPrivateReviewCorpus, type PrivateReviewBinding, type PrivateReviewReference } from './private-review-corpus.js';
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { CollectionPendingError, type ShopeeCollector } from '../../../platform/collectors/apify-shopee.js';
import { ShopeeCollectionService, type VerifiedExactShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { selectExactShopeeListings } from '../../foundation/shopee-exact-selection.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { buildResearchReviewCorpus, verifyResearchReviewCorpus } from './review-corpus.js';
import { classifyExactShopee, countReviewsPerListing, exactShopeeOutcomeLimitation } from './exact-shopee-outcome.js';
import type { ScopeSnapshot, SourceLimitation, StartSnapshot, StepResultDocument } from './model.js';

export type ShopeeCollectorFactory = () => { collector: ShopeeCollector; requestsIssued: () => number };
export interface PrivateShopeeConfiguration { readonly source: AutomationPrivateShopeeSource; readonly factory: ShopeeCollectorFactory }
export interface ExactShopeeRunInput {
  privateShopeeSource?: AutomationPrivateShopeeSource;
  runId: string; start: StartSnapshot; scope: ScopeSnapshot; scopeConfirmedAt: string;
}
export interface ExactShopeeAttempt {
  privateReference?: PrivateReviewReference;
  reference?: NonNullable<StepResultDocument['exactShopee']>;
  coverage: StepResultDocument['coverage'][number];
  limitation: StepResultDocument['limitations'][number];
  /** Present whenever a verified collection exists, including the reuse path. */
  exactShopeeOutcome?: NonNullable<StepResultDocument['exactShopeeOutcome']>;
  /** The extra run-page limitation when the outcome is not OK; the service appends it. */
  outcomeLimitation?: SourceLimitation;
  requestsIssued: number;
  costUsd: string | null;
}

export function exactShopeeRequest(input: ExactShopeeRunInput): ShopeeExactRequest {
  return { contractVersion: '2.0.0', runKey: `auto-${input.runId}`, topic: input.start.keyword,
    selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Owner-confirmed exact Shopee listing URLs', acquiredAt: input.scopeConfirmedAt },
    productUrls: [...(input.scope.exactShopeeUrls ?? [])] };
}

/** Foundation owns collection retention; Analysis binds that exact result to the frozen run. */
export class AutomationExactShopeeBridge {
  readonly #collections: ShopeeCollectionService;
  constructor(db: Database.Database, artifacts: ContentAddressedArtifactStore, readonly factory?: ShopeeCollectorFactory, readonly privateConfiguration?: PrivateShopeeConfiguration) {
    this.#collections = new ShopeeCollectionService(db, artifacts);
  }

  async collect(input: ExactShopeeRunInput, signal?: AbortSignal, now: () => Date = () => new Date()): Promise<ExactShopeeAttempt> {
    if (input.privateShopeeSource) return this.#collectPrivate(input, signal);
    const request = exactShopeeRequest(input);
    const selection = selectExactShopeeListings(request);
    const bytes = Buffer.from(canonicalJson(request));
    const requestSha = createHash('sha256').update(bytes).digest('hex');
    const base = { provider: 'apify-shopee', dataset: 'reviews', observedStartDate: null, observedEndDate: null, truncated: false } as const;
    if (!this.factory) return { requestsIssued: 0, costUsd: '0',
      coverage: { ...base, state: 'UNAVAILABLE', note: 'Đã lưu URL chính xác. Nguồn review chưa được bật trên runtime; không thay bằng sản phẩm khác.' },
      limitation: { provider: 'apify-shopee', code: 'EXACT_SHOPEE_NOT_CONFIGURED', message: 'Nguồn review cần token và giới hạn thu đã cấu hình. URL không xác nhận listing tồn tại.' } };
    const attempt = this.factory();
    try {
      signal?.throwIfAborted();
      let verified = await this.#collections.existingExact(bytes, attempt.collector.mode);
      const reused = Boolean(verified);
      let providerMessage: string | null = null;
      if (!verified) {
        const collected = await attempt.collector.collect(selection.selected, requestSha, request.runKey, signal);
        providerMessage = collected.actorStatusMessage ?? null;
        // Keep returned pages even when cancelled; cancellation does not undo provider spend.
        verified = await this.#collections.saveExact(bytes, collected);
      }
      const actor = verified.packet.actor;
      const counts = countReviewsPerListing(selection.selected, verified.pages);
      const outcome = classifyExactShopee({ actorStatus: actor.status, statusMessage: providerMessage, counts });
      const outcomeLimitation = exactShopeeOutcomeLimitation(outcome, counts);
      const cost = reused ? '0' : actor.usageTotalUsd;
      // One structured line per collection: listing ids and counts only, never the token, URLs, review text or provider message.
      console[outcome === 'OK' ? 'info' : 'warn'](JSON.stringify({ event: 'exact_shopee_collection', runId: input.runId, outcome,
        listings: selection.selected.map((listing, index) => ({ listing: `${listing.shopId}:${listing.itemId}`, reviews: counts[index]!.reviews })),
        actorStatus: actor.status, usageUsd: reused ? 0 : actor.usageTotalUsd, reused }));
      const terminalFailure = ['FAILED', 'TIMED-OUT', 'ABORTED'].includes(actor.status);
      const complete = !terminalFailure && (actor.stopReason === 'dataset_exhausted' || actor.stopReason === 'fixture_complete');
      const hasReturnedRows = verified.pages.some(page => (JSON.parse(page.bytes.toString('utf8')) as unknown[]).length > 0);
      return { exactShopeeOutcome: { outcome, listings: counts, providerMessage, attemptedAt: now().toISOString(), reused },
        ...(outcomeLimitation ? { outcomeLimitation } : {}),
        reference: { collectionId: verified.packet.collectionId, collectionSha256: verified.sha256, requestSha256: requestSha },
        requestsIssued: attempt.requestsIssued(), costUsd: typeof cost === 'string' ? safeCost(cost) : typeof cost === 'number' ? safeCost(String(cost)) : null,
        coverage: { ...base, state: signal?.aborted ? 'CANCELLED' : terminalFailure && !hasReturnedRows ? 'FAILED' : complete ? 'COLLECTED' : 'PARTIAL', truncated: !complete,
          note: terminalFailure ? 'Nhà cung cấp báo lỗi. Dòng đã trả về vẫn được giữ; không có dòng không có nghĩa sản phẩm không có review.'
            : 'Review cấp listing; không xác nhận variant hay độ phủ kỳ báo cáo. Thu hết dataset không có nghĩa đủ mọi review.' },
        limitation: { provider: 'apify-shopee', code: terminalFailure ? 'EXACT_SHOPEE_ACTOR_FAILED' : 'REVIEW_PERIOD_NOT_CONSTRAINED',
          message: terminalFailure ? 'Lượt thu review thất bại ở nhà cung cấp; đã giữ biên nhận, chi phí và dữ liệu trả về. Không tự chạy lượt tính phí khác. Kỳ yêu cầu không lọc ngày review.'
            : 'Review giữ ngày từ nguồn nếu có. Kỳ nghiên cứu không lọc ngày review; chưa coding hoặc suy rộng khách hàng.' } };
    } catch (error) {
      const errorCode = error instanceof CollectionPendingError ? 'EXACT_SHOPEE_PENDING_RECONCILIATION' : 'EXACT_SHOPEE_FAILED';
      console.warn(JSON.stringify({ event: 'exact_shopee_collection', runId: input.runId, outcome: 'ERROR', errorCode }));
      return { requestsIssued: attempt.requestsIssued(), costUsd: null,
        coverage: { ...base, state: signal?.aborted ? 'CANCELLED' : 'FAILED', note: 'Chưa có collection đã xác minh cho URL này. Không tự khởi chạy lần thu trả phí khác.' },
        limitation: { provider: 'apify-shopee', code: errorCode,
          message: 'Cần kiểm tra biên nhận của lượt thu trước khi thử lại; không thay dữ liệu bằng listing khác.' } };
    }
  }

  async #collectPrivate(input: ExactShopeeRunInput, signal?: AbortSignal): Promise<ExactShopeeAttempt> {
    const marker = privateShopeeMarker(input.privateShopeeSource);
    const base = { provider: 'apify-shopee', dataset: 'reviews', observedStartDate: null, observedEndDate: null, truncated: false } as const;
    const configuration = this.privateConfiguration;
    if (!configuration || canonicalJson(privateShopeeMarker(configuration.source)) !== canonicalJson(marker)) return {
      requestsIssued: 0, costUsd: '0', coverage: { ...base, state: 'UNAVAILABLE', note: 'Explicit private source configuration is unavailable.' },
      limitation: { provider: 'apify-shopee', code: 'PRIVATE_SHOPEE_NOT_CONFIGURED', message: 'Frozen private profile requires its explicitly configured collector; raw/native substitution is forbidden.' } };
    const attempt = configuration.factory();
    try {
      signal?.throwIfAborted();
      if (canonicalJson(attempt.collector.privacyProfile) !== canonicalJson(marker.profile)) throw new Error('Private collector profile mismatch');
      const bytes = Buffer.from(canonicalJson(exactShopeeRequest(input)));
      const prior = await this.#collections.existingExact(bytes, attempt.collector.mode, { privacy: true });
      const source = await this.#collections.collectExact(bytes, attempt.collector, { privacy: true }, signal);
      return { privateReference: { privateVersion: '3.0.0', collectionId: source.packet.collectionId,
        collectionSha256: source.sha256, requestSha256: source.packet.requestSha256 }, requestsIssued: attempt.requestsIssued(),
        costUsd: prior ? '0' : source.packet.actor.usageTotalUsd === null ? null : safeCost(String(source.packet.actor.usageTotalUsd)),
        coverage: { ...base, state: 'COLLECTED', note: 'Sanitized listing review capture retained; source dates do not constrain the research period.' },
        limitation: { provider: 'apify-shopee', code: 'PRIVATE_REVIEW_CAPTURE_ONLY', message: 'Source-reported identities are scoped to one Shopee key; no person verification or persona decision.' } };
    } catch {
      return { requestsIssued: attempt.requestsIssued(), costUsd: null,
        coverage: { ...base, state: signal?.aborted ? 'CANCELLED' : 'FAILED', note: 'No finalized private collection; failed/incomplete/cancelled pages are diagnostics only.' },
        limitation: { provider: 'apify-shopee', code: 'PRIVATE_SHOPEE_FAILED', message: 'Check the prior collection receipt before retry; no replacement paid collection is started automatically.' } };
    }
  }

  async readPrivate(reference: PrivateReviewReference, input: ExactShopeeRunInput) {
    return readPrivateReviewCollection(this.#collections, reference, exactShopeeRequest(input), privateShopeeMarker(input.privateShopeeSource));
  }
  async privateCorpus(reference: PrivateReviewReference, input: ExactShopeeRunInput, binding: PrivateReviewBinding): Promise<ResearchPrivateReviewCorpus> {
    this.#assertPrivateBinding(input, binding);
    return buildPrivateReviewCorpus(await this.readPrivate(reference, input), binding).output;
  }
  async verifyPrivateCorpus(value: unknown, reference: PrivateReviewReference, input: ExactShopeeRunInput, binding: PrivateReviewBinding): Promise<ResearchPrivateReviewCorpus> {
    this.#assertPrivateBinding(input, binding);
    return verifyPrivateReviewCorpus(value, await this.readPrivate(reference, input), binding);
  }

  #assertPrivateBinding(input: ExactShopeeRunInput, binding: PrivateReviewBinding): void {
    const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
    if (binding.runId !== input.runId || binding.workspaceId !== input.start.workspaceId || input.scope.runId !== input.runId ||
      input.scope.workspaceId !== binding.workspaceId || binding.startSha256 !== hash(input.start) || binding.scopeSha256 !== hash(input.scope) ||
      binding.scopeConfirmedAt !== input.scopeConfirmedAt) throw new Error('Private corpus frozen binding mismatch');
  }

  async read(reference: NonNullable<StepResultDocument['exactShopee']>, input: ExactShopeeRunInput): Promise<VerifiedExactShopeeCollection> {
    if (input.privateShopeeSource || 'privateVersion' in reference) throw new Error('Raw/private source substitution');
    const verified = await this.#collections.readExact(reference.collectionId);
    const request = exactShopeeRequest(input);
    if (verified.sha256 !== reference.collectionSha256 || verified.packet.requestSha256 !== reference.requestSha256 ||
        canonicalJson(verified.request) !== canonicalJson(request)) throw new Error('Exact review collection does not match its frozen run');
    return verified;
  }

  async corpus(reference: NonNullable<StepResultDocument['exactShopee']>, input: ExactShopeeRunInput): Promise<ResearchReviewCorpus> {
    return buildResearchReviewCorpus(await this.read(reference, input)).output;
  }
  async verifyCorpus(snapshot: unknown, reference: NonNullable<StepResultDocument['exactShopee']>, input: ExactShopeeRunInput): Promise<void> {
    verifyResearchReviewCorpus(snapshot, await this.read(reference, input));
  }
}

function safeCost(value: string): string | null { return /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,12})?$/.test(value) ? value : null; }

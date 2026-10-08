import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { buildInsightLiteralEvidence, type InsightLiteralEvidence } from '../insight-literal-evidence.js';
import { exactLiteralReviews, literalSellerStatements, nativeLiteralReviews } from './insight-literal-source.js';
import { AutomationExactShopeeBridge, type ExactShopeeRunInput } from './exact-shopee-bridge.js';
import { AutomationNativeSourceReviewBridge } from './native-source-review-bridge.js';
import { MAX_CAPTURE_ENVELOPE_BYTES, MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError, type CaptureRecord, type StepResultDocument } from './model.js';

export type InsightLiteralBridgeInput = ExactShopeeRunInput & {
  previousPairId: string;
  collection: StepResultDocument | null;
  captures: readonly CaptureRecord[];
};
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Query-only source replay. It never invokes collectors, model transports,
 * source-package intake or database writes, even when verifying an old result. */
export class AutomationInsightLiteralEvidence {
  readonly #exact: AutomationExactShopeeBridge;
  readonly #native: AutomationNativeSourceReviewBridge;
  readonly #artifacts: ContentAddressedArtifactStore;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#exact = new AutomationExactShopeeBridge(options.db, options.artifactStore);
    this.#native = new AutomationNativeSourceReviewBridge(options);
    this.#artifacts = options.artifactStore;
  }
  async build(input: InsightLiteralBridgeInput): Promise<InsightLiteralEvidence> {
    if (!/^[0-9a-f]{64}$/.test(input.previousPairId) || input.start.workspaceId !== input.scope.workspaceId || input.scope.runId !== input.runId ||
        (input.collection !== null && input.collection.runId !== input.runId)) throw new ResearchAutomationIntegrityError('Literal evidence run binding differs.');
    if (input.collection?.exactShopee && input.collection.nativeReview) throw new ResearchAutomationIntegrityError('Literal evidence cannot substitute native and exact sources.');
    let reviews: Parameters<typeof buildInsightLiteralEvidence>[0]['reviews'] = [];
    if (input.collection?.exactShopee) reviews = exactLiteralReviews(await this.#exact.read(input.collection.exactShopee, input));
    if (input.collection?.nativeReview) {
      // The historical reference digest covers only the frozen run fields.
      // New method selectors/captures must never enter that v1 binding.
      const source = await this.#native.readReference(input.collection.nativeReview, { runId: input.runId,
        start: input.start, scope: input.scope, scopeConfirmedAt: input.scopeConfirmedAt });
      const dataset = source.files.find(file => file.path === 'capture/dataset.json');
      if (!dataset) throw new ResearchAutomationIntegrityError('Native literal evidence dataset is missing.');
      reviews = nativeLiteralReviews(dataset, input.collection.nativeReview.selected);
    }
    const captureBytes = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const capture of input.captures) if (capture.stepId === 'COLLECTION' && capture.provider === 'kalodata' && capture.operation === 'kalodata.product.detail') {
      const bytes = await this.#artifacts.read(capture.artifactSha256, { maxBytes: MAX_CAPTURE_ENVELOPE_BYTES });
      totalBytes += bytes.length;
      if (totalBytes > 128 * 1024 * 1024) throw new ResearchAutomationIntegrityError('Literal evidence capture bound exceeded.');
      captureBytes.set(capture.artifactSha256, bytes);
    }
    const sellerStatements = literalSellerStatements({ ...input, captureBytes });
    const output = buildInsightLiteralEvidence({ binding: { workspaceId: input.start.workspaceId, runId: input.runId,
      scopeSha256: digest(input.scope), previousPairId: input.previousPairId }, reviews, sellerStatements });
    if (Buffer.byteLength(canonicalJson(output)) > MAX_JSON_ARTIFACT_BYTES) throw new ResearchAutomationIntegrityError('Literal evidence output bound exceeded.');
    return output;
  }
  async verify(value: unknown, input: InsightLiteralBridgeInput): Promise<InsightLiteralEvidence> {
    const output = await this.build(input);
    if (canonicalJson(value) !== canonicalJson(output)) throw new ResearchAutomationIntegrityError('Literal evidence failed exact source replay.');
    return output;
  }
}

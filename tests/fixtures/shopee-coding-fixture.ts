import assert from 'node:assert/strict';
import type { TestContext } from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { reviewPolicyFixture } from '../helpers/review-policy-fixture.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import type { ShopeeCodingAI } from '../../src/modules/analysis/research-automation/shopee-coding.js';
import { shopeeCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import type { ShopeeReviewCodingConfiguration } from '../../contracts/analysis/shopee-review-coding-configuration-v1.generated.js';
import type { ShopeeCodingModelInput } from '../../contracts/analysis/shopee-review-coding-model-v1.generated.js';
import { syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';

export const now = () => new Date('2026-10-09T00:00:00Z');
export const workspaceId = '33333333-3333-4333-8333-333333333333', runId = '22222222-2222-4222-8222-222222222222';

/** Fake cliproxy text port: returns structurally valid candidates derived from the actual input
 * records (exact substrings only). It never decides retention, idempotency, or acceptance.
 * Honors abort like a real transport: an aborted call throws before producing anything. */
export function fakeShopeeCodingPort(onDispatch?: () => void): NonNullable<ShopeeCodingAI>['port'] & { dispatches(): number } {
  let dispatches = 0;
  const port = {
    dispatches: () => dispatches,
    async generateText(request: { userText: string; signal: AbortSignal }) {
      if (request.signal.aborted) throw new Error('aborted');
      dispatches++;
      onDispatch?.();
      const input = JSON.parse(request.userText) as ShopeeCodingModelInput;
      return { text: JSON.stringify({ codes: input.records.slice(0, 3).map((record, i) => {
        const text = record.text.slice(0, 10);
        return { code: `TOPIC_${i}`, label: `chủ đề ${i}`, recordIndex: record.recordIndex,
          quote: { text, start: 0, end: text.length } };
      }) }) };
    },
  };
  return port as NonNullable<ShopeeCodingAI>['port'] & { dispatches(): number };
}

export function fakeShopeeCodingAi(port: NonNullable<ShopeeCodingAI>['port'], configuration?: ShopeeReviewCodingConfiguration): NonNullable<ShopeeCodingAI> {
  return { port, configuration: configuration ?? shopeeCodingCliproxyConfiguration('synthetic-shopee-coding-model') };
}

/** Seed policy27 private collection + confirmed scope + DRAFT_READY run with a retained U22 sample.
 * Owns nothing: the caller closes the database and removes the root. */
export async function seedShopeeCodingHarness() {
  const f = await reviewPolicyFixture({ after: () => undefined } as unknown as TestContext, [29, 30, 300], 0.23);
  const workspaceId = f.input.start.workspaceId, runId = f.input.runId;
  const root = (f as unknown as { root: string }).root;
  const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'shopee-coding-synthetic', title: 'Synthetic Shopee coding fixture' });
  const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
  const source = syntheticProductSource();
  const sales: AutomationSourcePort = { ...source, quickSearch: async (input, options) => {
    const result = await source.quickSearch(input, options);
    const responseBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Thạch dừa từ nguồn bán hàng"}]}');
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes,
      responseSha256: hash(responseBytes), responseByteLength: responseBytes.length })) } };
  }, collect: async (input, options) => { const result = await source.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; } };
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, source, webSource: syntheticWebSource(() => {}, []),
    renderer: buildResearchAutomationReport,
    // Genuine owning collection flow: the fake policy collector retains the U22 sample
    // through the service; no injected receipts or caller-supplied manifests.
    reviewCollection: { policy: f.policy, factory: f.factory },
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => {
      return { keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic different term' }] };
    } } } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'Synthetic reviews', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: awaiting.revision,
    definition: 'Owner-selected exact listing capture; authenticated revenue coverage unavailable', includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [...f.input.scope.exactShopeeUrls!] });
  await service.processNext(); await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const packet = await service.readSourceEvidence(workspaceId, runId);
  return { ...f, root, workspaceId, runId, service, databasePath: path.join(root, 'synthetic.sqlite'),
    artifactRoot: path.join(root, 'artifacts'), keywordDigest: packet?.draftDigest ?? null,
    close: async () => { f.db.close(); } };
}

export async function shopeeFixture(t: TestContext) {
  const seeded = await seedShopeeCodingHarness();
  t.after(async () => { seeded.close(); await fs.rm(seeded.root, { recursive: true, force: true }); });
  return seeded;
}

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import BetterSqlite3 from 'better-sqlite3';
import researchAutomationApiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import revisionApiSchema from '../../contracts/api/research-automation-revision-api.schema.json' with { type: 'json' };
import revisionRequestSchema from '../../contracts/analysis/automation-report-revision.schema.json' with { type: 'json' };
import metricIntakeSchema from '../../contracts/api/research-automation-metric-intake-api.schema.json' with { type: 'json' };
import metricRuleSchema from '../../contracts/analysis/automation-metric-rule-adoption.schema.json' with { type: 'json' };
import membershipSchema from '../../contracts/analysis/automation-metric-membership.schema.json' with { type: 'json' };
import membershipApiSchema from '../../contracts/api/research-automation-metric-membership-api.schema.json' with { type: 'json' };
import locatedInsightSchema from '../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import insightSelectionSchema from '../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import insightCodingSchema from '../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import insightCodingApiSchema from '../../contracts/api/research-automation-insight-coding-api.schema.json' with { type: 'json' };
import insightModelSchema from '../../contracts/analysis/automation-insight-model.schema.json' with { type: 'json' };
import insightModelApiSchema from '../../contracts/api/research-automation-insight-model-api.schema.json' with { type: 'json' };
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { i14CliproxySynthesisConfiguration, decisionCliproxySynthesisConfiguration, insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';
import { reportMethodPacketsFixture } from '../helpers/report-method-packets-fixture.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/discovery-workspace-reader.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/database.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const ownerToken = 'owner-token-1234567890-abcdefghijklmnopqrstuvwxyz';
const requestedPeriod = { startDate: '2026-01-01', endDate: '2026-01-30' };
const roots: string[] = [];

const noProviders = {
  kalodataSecretKey: null,
  serpApiKey: null,
  apifyTokenConfigured: false,
};

interface Fixture {
  root: string;
  databasePath: string;
  artifactRoot: string;
}

interface ReceiptResponse {
  contractVersion: string;
  exactRetry: boolean;
  run: Record<string, any>;
}

type ContractKind = 'run' | 'runList' | 'receipt' | 'versionList' | 'attemptList' | 'revisionReceipt' | 'metricPrepared' | 'metricPreparedList' | 'metricRuleReceipt' | 'metricRuleList' | 'membership' | 'insightView' | 'insightMutation' | 'insightModel';

const apiValidators = (() => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(researchAutomationApiSchema);
  ajv.addSchema(revisionRequestSchema);
  ajv.addSchema(revisionApiSchema);
  ajv.addSchema(metricIntakeSchema);
  ajv.addSchema(metricRuleSchema);
  ajv.addSchema(membershipSchema); ajv.addSchema(membershipApiSchema);
  ajv.addSchema(locatedInsightSchema); ajv.addSchema(insightSelectionSchema); ajv.addSchema(insightCodingSchema); ajv.addSchema(insightCodingApiSchema);
  ajv.addSchema(insightModelSchema); ajv.addSchema(insightModelApiSchema);
  return {
    run: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/run`)!,
    runList: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/runList`)!,
    receipt: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/receipt`)!,
    versionList: ajv.getSchema(`${revisionApiSchema.$id}#/$defs/versionList`)!,
    attemptList: ajv.getSchema(`${revisionApiSchema.$id}#/$defs/attemptList`)!,
    revisionReceipt: ajv.getSchema(`${revisionApiSchema.$id}#/$defs/receipt`)!,
    metricPrepared: ajv.getSchema(`${metricIntakeSchema.$id}#/$defs/receipt`)!,
    metricPreparedList: ajv.getSchema(`${metricIntakeSchema.$id}#/$defs/preparedList`)!,
    metricRuleReceipt: ajv.getSchema(`${metricRuleSchema.$id}#/$defs/receipt`)!,
    metricRuleList: ajv.getSchema(`${metricRuleSchema.$id}#/$defs/list`)!,
    membership: ajv.getSchema(membershipApiSchema.$id)!,
    insightView: ajv.getSchema(`${insightCodingApiSchema.$id}#/$defs/view`)!,
    insightMutation: ajv.getSchema(`${insightCodingApiSchema.$id}#/$defs/mutation`)!,
    insightModel: ajv.getSchema(`${insightModelApiSchema.$id}#/$defs/response`)!,
  } satisfies Record<ContractKind, NonNullable<ReturnType<typeof ajv.getSchema>>>;
})();

function assertValidContract(value: unknown, kind: ContractKind): void {
  const validator = apiValidators[kind];
  assert.equal(validator(value), true, `${kind} response failed canonical schema: ${JSON.stringify(validator.errors)}`);
}

test.afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<Fixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-automation-api-'));
  roots.push(root);
  const databasePath = path.join(root, 'research.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  const workspaceService = new DiscoveryWorkspaceService({
    db,
    artifactStore: new ContentAddressedArtifactStore(artifactRoot),
    uuid: () => workspaceId,
    now: () => new Date('2026-01-31T00:00:00.000Z'),
  });
  await workspaceService.createWorkspace({
    contractVersion: '1.0.0',
    workspaceKey: 'research-automation-api-test',
    title: 'Research automation API test workspace',
  });
  db.close();
  return { root, databasePath, artifactRoot };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withApi<T>(
  fixture: Fixture,
  ownerEnabled: boolean,
  callback: (base: string, application: ReturnType<typeof openResearchAutomationApi>) => Promise<T>,
  i14Synthesis?: Parameters<typeof openResearchAutomationApi>[0]['i14Synthesis'],
  decisionSynthesis?: Parameters<typeof openResearchAutomationApi>[0]['decisionSynthesis'],
  insightCoding?: Parameters<typeof openResearchAutomationApi>[0]['insightCoding'],
): Promise<T> {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port;
  await closeServer(probe);

  const origin = `http://127.0.0.1:${port}`;
  const application = openResearchAutomationApi({
    databasePath: fixture.databasePath,
    artifactRoot: fixture.artifactRoot,
    origin,
    providers: noProviders,
    ...(i14Synthesis ? { i14Synthesis } : {}),
    ...(decisionSynthesis ? { decisionSynthesis } : {}),
    ...(insightCoding ? { insightCoding } : {}),
    ...(ownerEnabled
      ? {
          owner: {
            writeEnabled: true,
            databasePath: fixture.databasePath,
            artifactRoot: fixture.artifactRoot,
            token: ownerToken,
            allowedOrigin: origin,
            actorId: 'owner:research',
          },
        }
      : {}),
  });
  const server = http.createServer(application.handler);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await callback(origin, application);
  } finally {
    await closeServer(server);
    await application.close();
  }
}

function ownerHeaders(origin: string, includeAuthorization = true): Record<string, string> {
  return {
    Origin: origin,
    'Content-Type': 'application/json',
    ...(includeAuthorization ? { Authorization: `Bearer ${ownerToken}` } : {}),
  };
}

function startBody(requestKey: string): Record<string, any> {
  return {
    contractVersion: 'research-automation-start-v1',
    requestKey,
    mode: 'CATEGORY',
    requestedPeriod,
    keyword: 'wireless earbuds',
    reports: ['MARKET', 'INSIGHT'],
  };
}

function confirmBody(requestKey: string, expectedRevision: number): Record<string, any> {
  return {
    contractVersion: 'research-automation-confirm-v1',
    requestKey,
    expectedRevision,
    definition: 'Current Vietnam research scope',
    includeTerms: ['wireless earbuds'],
    excludeTerms: [],
    selectedProductIds: [],
    peerProductIds: [],
  };
}

function cancelBody(requestKey: string, expectedRevision: number): Record<string, any> {
  return { contractVersion: 'research-automation-cancel-v1', requestKey, expectedRevision };
}

async function readJson(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function getRun(base: string, runId: string): Promise<Record<string, any>> {
  const response = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`);
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assertValidContract(body, 'run');
  return body;
}

async function waitForRun(
  base: string,
  runId: string,
  predicate: (run: Record<string, any>) => boolean,
): Promise<Record<string, any>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await getRun(base, runId);
    if (predicate(run)) return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const run = await getRun(base, runId);
  throw new Error(`timed out waiting for research run; last status=${run.status}`);
}

async function startAndWaitForScope(base: string, requestKey: string): Promise<Record<string, any>> {
  const response = await fetch(
    `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
    {
      method: 'POST',
      headers: ownerHeaders(base),
      body: JSON.stringify(startBody(requestKey)),
    },
  );
  assert.equal(response.status, 202);
  const payload = (await readJson(response)) as ReceiptResponse;
  assertValidContract(payload, 'receipt');
  assert.equal(payload.exactRetry, false);
  assert.equal(payload.run.workspaceId, workspaceId);
  assert.match(payload.run.runId, /^[0-9a-f-]{36}$/);
  return waitForRun(base, payload.run.runId, (run) => run.status === 'AWAITING_SCOPE');
}

function databaseDigest(databasePath: string): string {
  return createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex');
}

function captureCount(databasePath: string): number {
  const db = new BetterSqlite3(databasePath, { readonly: true });
  try {
    return Number(
      (db.prepare('SELECT COUNT(*) AS count FROM analysis_research_automation_captures').get() as { count: number })
        .count,
    );
  } finally {
    db.close();
  }
}

// Primary acceptance owner: actual upload, verified preparation, proposals and
// selected receipts. Catches forged membership, silent partial writes and
// pending-to-UNKNOWN coercion that the rule-adoption test cannot exercise.
test('three industries classify a new report from complete selected acceptance without changing old reports', { timeout: 120_000 }, async t => {
  const fixture = await createFixture();
  const seedDb = openDatabase({ databasePath: fixture.databasePath }).db;
  try {
    await seedNativeDamiPackage(new SourcePackageService({ db: seedDb, artifactStore: new ContentAddressedArtifactStore(fixture.artifactRoot) }), {
      rawRows: [{ type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: 'synthetic-context', comment: 'Tôi mua tặng sản phẩm.', rating_star: 5 }],
    });
  } finally { seedDb.close(); }
  let modelCalls = 0;
  const calledSections: string[] = [];
  const gateway = http.createServer(async (request, response) => {
    modelCalls++;
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString());
    const input = JSON.parse(body.messages[1].content);
    const sectionId = input.sectionId ?? 'I14';
    calledSections.push(sectionId);
    assert.equal(body.model, sectionId === 'I14' ? 'synthetic-classified-revision' : `synthetic-${sectionId}`);
    assert.equal(input.supportEligible.length, 1);
    const candidate = { candidateType: sectionId === 'M12' ? 'ACTION_OPTION' : sectionId === 'I15' ? 'STRATEGY_OPTION' : 'HYPOTHESIS', candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
      text: 'Giả thuyết synthetic cần xem xét, không phải kết luận.', conciseEvidenceLinkedRationale: 'Nguồn synthetic nêu mua tặng.',
      citedClaimRefs: [input.supportEligible[0].claimId], counterevidenceRefs: [], assumptions: ['Chưa rõ người nhận.'], unknowns: ['Chưa rõ nhu cầu.'],
      evidenceGaps: ['Cần nguồn bổ sung.'], limitations: ['Một bản ghi synthetic.'],
      ...(sectionId === 'I14' ? {} : { counterevidenceRelations: [] }),
      ...(sectionId === 'M12' ? { prerequisites: ['Chỉ thực hiện sau khi người dùng duyệt.'] } : {}),
      ...(sectionId === 'I15' ? { conditions: ['Cần xác nhận mục tiêu kinh doanh.'] } : {}),
    };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ aiCandidates: [candidate] }) }, finish_reason: 'stop' }] }));
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(() => closeServer(gateway));
  await withApi(fixture, true, async base => {
    let previousRecordKey: string | undefined;
    for (const [index, keyword] of ['thạch dừa', 'bình giữ nhiệt', 'quạt cầm tay'].entries()) {
      const started = await readJson(await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`, {
        method: 'POST', headers: ownerHeaders(base), body: JSON.stringify({ ...startBody(randomUUID()), keyword }),
      }));
      const runId = started.run.runId as string;
      const awaiting = await waitForRun(base, runId, run => run.status === 'AWAITING_SCOPE');
      const apiRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
      const ownerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
      const post = (action: string, body: unknown, authorized = true) => fetch(`${ownerRoot}/${action}`, { method: 'POST', headers: ownerHeaders(base, authorized), body: JSON.stringify(body) });
      const confirm: Record<string, any> = { ...confirmBody(randomUUID(), awaiting.revision), definition: `Synthetic ${keyword} scope`, includeTerms: [keyword],
        ...(index === 0 ? { exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] } : {}) };
      const { contractVersion: _version, requestKey: _key, expectedRevision: _revision, ...scope } = confirm;
      const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2',
        cells: { A2: { type: 's', value: `${keyword} standalone synthetic` }, A3: { type: 's', value: `${keyword} uncertain synthetic` },
          ...(index === 1 ? { E2: { type: 's', value: '0' }, D2: { type: 's', value: '0' } } : {}),
          ...(index === 2 ? { E3: null, D3: null } : {}) } }), maxBuffer: 4 * 1024 * 1024 });
      assert.equal(generated.status, 0, generated.stderr.toString());
      const form = new FormData();
      form.set('metadata', JSON.stringify({ contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
        scope, sourceLabel: `Synthetic ${keyword} export`, sourceContext: 'Explicit synthetic fixture, not provider collection.',
        measurementPeriod: { ...requestedPeriod, basis: 'Synthetic observation window' }, selection: 'OFF', acquiredAt: null, precision: { revenue: 'exact', units: 'exact' } }));
      form.set('workbook', new File([new Uint8Array(generated.stdout)], 'synthetic.xlsx'));
      const upload = await fetch(`${ownerRoot}/sources/metric`, { method: 'POST', headers: { Origin: base, Authorization: `Bearer ${ownerToken}` }, body: form });
      assert.equal(upload.status, 201, await upload.clone().text());
      const prepared = await readJson(upload);
      assert.equal((await post('confirm-scope', { ...confirm, contractVersion: 'research-automation-confirm-v2', sources: {
        metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: index === 0 ? 'AUTO_REUSE' : 'SKIP' } })).status, 202);
      const ready = await waitForRun(base, runId, run => run.status === 'DRAFT_READY');
      const pairId = (await readJson(await fetch(`${apiRoot}/report-versions`))).versions[0].pairId as string;
      const originalMarket = await (await fetch(`${apiRoot}/reports/market`)).text();
      assert.equal(modelCalls, 4, 'only the first native source has an eligible synthetic context for the four explicitly enabled sections');
      assert.deepEqual([...calledSections].sort(), ['I14', 'I15', 'M11', 'M12']);
      if (index === 0) {
        assert.deepEqual(Object.keys(ready.aiActivity).sort(), ['i14', 'i15', 'm11', 'm12']);
        assert.equal(originalMarket.match(/Giả thuyết synthetic cần xem xét, không phải kết luận\./g)?.length, 2, 'both configured Market sections render validated output through the API worker');
        const insight = await fetch(`${apiRoot}/reports/insight`);
        assert.equal(insight.status, 200);
        assert.match(await insight.text(), /Cần xác nhận mục tiêu kinh doanh\./, 'the configured strategy section reaches Insight');
      } else assert.equal(ready.aiActivity, undefined, 'no eligible execution must not invent zero-count activity');
      const ruleRequest = { contractVersion: 'automation-metric-rule-adopt-v1', requestKey: randomUUID(), expectedRevision: ready.revision,
        rulebook: { ruleId: `synthetic-industry-${index}`, revision: 1, title: `Synthetic ${keyword} rules`,
          definitions: { CORE_CANDIDATE: 'Standalone products.', ADJACENT: 'Separate accessories.', OUTSIDE: 'Unrelated products.', UNKNOWN: 'Insufficient description.' },
          groups: [{ key: 'test-group', label: 'Synthetic group', definition: 'Only this synthetic source universe.' }], wideUnknownPolicy: 'exclude' } };
      const adopted = await post('metric-rule-adoptions', ruleRequest); assert.equal(adopted.status, 201);
      const adoptionId = (await readJson(adopted)).adoptionId as string;
      const review = async () => {
        const response = await fetch(`${apiRoot}/metric-membership/${pairId}/${adoptionId}`);
        assert.equal(response.status, 200, await response.clone().text());
        const output = await readJson(response); assertValidContract(output, 'membership'); return output;
      };
      const initial = await review();
      assert.equal(initial.recordCount, 2); assert.equal(initial.pendingCount, 2); assert.equal(initial.complete, false);
      assert.deepEqual(initial.acceptedReceiptIds, [], 'pending records have no acceptance to restore');
      assert.ok(initial.records.every((record: any) => record.state === 'PENDING' && record.classification === null));
      assert.equal(initial.records[0].title, `${keyword} standalone synthetic`);
      const keys = initial.records.map((record: any) => record.recordKey) as string[];
      const proposalRequest = { contractVersion: 'metric-membership-propose-v1', requestKey: randomUUID(), pairId, adoptionId,
        assignments: keys.map((recordKey, row) => ({ recordKey, classification: row === 0 ? 'CORE_CANDIDATE' : 'UNKNOWN', group: 'test-group' })) };
      assert.equal((await post('metric-membership-proposals', proposalRequest, false)).status, 401);
      assert.equal((await post('metric-membership-proposals', { ...proposalRequest, actorId: 'forged' })).status, 400);
      if (previousRecordKey) assert.equal((await post('metric-membership-proposals', { ...proposalRequest,
        assignments: [{ ...proposalRequest.assignments[0], recordKey: previousRecordKey }] })).status, 400, 'another source cannot supply a record identity');
      previousRecordKey = keys[0];
      const proposed = await post('metric-membership-proposals', proposalRequest); assert.equal(proposed.status, 201, await proposed.clone().text());
      const proposalReceipt = await readJson(proposed); assertValidContract(proposalReceipt, 'membership');
      const proposalId = proposalReceipt.id as string;
      const proposalRead = await readJson(await fetch(`${apiRoot}/metric-membership-proposals/${proposalId}`)); assertValidContract(proposalRead, 'membership');
      assert.equal(proposalRead.assignments.length, 2); assert.equal('actorId' in proposalRead, false);
      assert.deepEqual(await review(), initial, 'proposal submission is not acceptance');
      const acceptRequest = { contractVersion: 'metric-membership-accept-v1', requestKey: randomUUID(), proposalId, selectedRecordKeys: [keys[0]] };
      assert.equal((await post('metric-membership-receipts', acceptRequest, false)).status, 401);
      const invalidBatch = await post('metric-membership-receipts', { ...acceptRequest, selectedRecordKeys: [keys[0], 'f'.repeat(64)] });
      assert.equal(invalidBatch.status, 400); assert.equal((await review()).acceptedCount, 0, 'invalid mixed batch cannot partly accept');
      const accepted = await post('metric-membership-receipts', acceptRequest); assert.equal(accepted.status, 201, await accepted.clone().text());
      const acceptedReceipt = await readJson(accepted); assertValidContract(acceptedReceipt, 'membership');
      const firstRead = await readJson(await fetch(`${apiRoot}/metric-membership-receipts/${acceptedReceipt.id}`)); assertValidContract(firstRead, 'membership');
      const classifiedRequest = { contractVersion: 'automation-classified-report-revision-v1', requestKey: randomUUID(), previousPairId: pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, acceptedMetric: { adoptionId, receiptIds: [acceptedReceipt.id] } };
      assert.equal((await post('report-revisions', classifiedRequest)).status, 400, 'a subset must not shrink the calculation universe');
      assert.equal((await readJson(await fetch(`${apiRoot}/report-versions`))).versions.length, 1);
      const partial = await review(); assert.equal(partial.acceptedCount, 1); assert.equal(partial.pendingCount, 1); assert.equal(partial.complete, false);
      assert.deepEqual(partial.acceptedReceiptIds, [acceptedReceipt.id]);
      assert.equal(partial.records[1].classification, null, 'pending UNKNOWN proposal remains unaccepted, not a disposition');
      const conflictProposal = await post('metric-membership-proposals', { ...proposalRequest, requestKey: randomUUID(), assignments: [{ ...proposalRequest.assignments[0], classification: 'OUTSIDE' }] });
      assert.equal(conflictProposal.status, 201);
      const conflictId = (await readJson(conflictProposal)).id;
      assert.equal((await post('metric-membership-receipts', { ...acceptRequest, requestKey: randomUUID(), proposalId: conflictId })).status, 409);
      assert.deepEqual(await review(), partial);
      const second = await post('metric-membership-receipts', { ...acceptRequest, requestKey: randomUUID(), selectedRecordKeys: [keys[1]] }); assert.equal(second.status, 201);
      const secondReceipt = await readJson(second);
      classifiedRequest.acceptedMetric.receiptIds.push(secondReceipt.id);
      const complete = await review(); assert.equal(complete.recordCount, 2); assert.equal(complete.acceptedCount, 2); assert.equal(complete.complete, true);
      assert.deepEqual(complete.acceptedReceiptIds, [acceptedReceipt.id, secondReceipt.id].sort());
      classifiedRequest.acceptedMetric.receiptIds = complete.acceptedReceiptIds;
      assert.equal(complete.records[1].classification, 'UNKNOWN', 'UNKNOWN needs and now has explicit acceptance');
      if (index === 0) {
        const overlap = await post('metric-membership-receipts', { ...acceptRequest, requestKey: randomUUID(), selectedRecordKeys: keys });
        assert.equal(overlap.status, 201);
        const overlapReceipt = await readJson(overlap);
        assert.equal((await fetch(`${apiRoot}/metric-membership-receipts/${overlapReceipt.id}`)).status, 200);
        assert.deepEqual(await review(), complete, 'overlapping explicit batches preserve first acceptance without double counting');
      }
      const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
      const persisted = () => JSON.stringify(['analysis_metric_membership_proposals', 'analysis_metric_membership_receipts', 'analysis_metric_membership_accepted', 'artifact_manifests']
        .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()));
      try {
        const before = persisted();
        const retried = await post('metric-membership-receipts', acceptRequest); assert.equal(retried.status, 200);
        assert.deepEqual(await readJson(retried), { ...acceptedReceipt, exactRetry: true }); assert.equal(persisted(), before);
        const proposalRetry = await post('metric-membership-proposals', { ...proposalRequest, assignments: [...proposalRequest.assignments].reverse() });
        assert.equal(proposalRetry.status, 200); assert.equal(persisted(), before);
      } finally { db.close(); }
      assert.equal(await (await fetch(`${apiRoot}/reports/market`)).text(), originalMarket, 'acceptance never rewrites or rerenders the old report');
      if (index === 0) {
        const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
        const row = db.prepare('SELECT artifact_sha256 FROM analysis_metric_membership_receipts WHERE receipt_id=?').get(acceptedReceipt.id) as { artifact_sha256: string };
        const later = db.prepare('SELECT artifact_sha256 FROM analysis_metric_membership_receipts WHERE receipt_id=?').get(secondReceipt.id) as { artifact_sha256: string }; db.close();
        const laterPath = new ContentAddressedArtifactStore(fixture.artifactRoot).pathForDigest(later.artifact_sha256);
        const laterBytes = fs.readFileSync(laterPath); fs.writeFileSync(laterPath, 'later receipt corrupted');
        assert.equal((await fetch(`${apiRoot}/metric-membership-receipts/${acceptedReceipt.id}`)).status, 200, 'historical receipt must not depend on a later unrelated batch');
        assert.equal((await fetch(`${apiRoot}/metric-membership/${pairId}/${adoptionId}`)).status, 500, 'complete current coverage must verify every contributing batch');
        fs.writeFileSync(laterPath, laterBytes);
        const artifactPath = new ContentAddressedArtifactStore(fixture.artifactRoot).pathForDigest(row.artifact_sha256);
        const saved = fs.readFileSync(artifactPath); fs.unlinkSync(artifactPath);
        assert.equal((await fetch(`${apiRoot}/metric-membership-receipts/${acceptedReceipt.id}`)).status, 500);
        assert.equal(fs.existsSync(artifactPath), false, 'a read cannot repair acceptance evidence');
        assert.equal((await post('metric-membership-receipts', { ...acceptRequest, selectedRecordKeys: [keys[1]] })).status, 409);
        assert.equal(fs.existsSync(artifactPath), false, 'changed-content retry cannot publish staged receipt bytes');
        assert.equal((await post('metric-membership-receipts', acceptRequest)).status, 200);
        assert.deepEqual(fs.readFileSync(artifactPath), saved); assert.equal(fs.statSync(artifactPath).mode & 0o777, 0o600);
        assert.deepEqual(await review(), complete);
      }
      const classifiedStart = await post('report-revisions', classifiedRequest); assert.equal(classifiedStart.status, 202, await classifiedStart.clone().text());
      const classifiedAttempt = await readJson(classifiedStart);
      let classifiedPairId: string | undefined;
      for (let poll = 0; poll < 300; poll++) {
        const attempt = await readJson(await fetch(`${apiRoot}/report-attempts/${classifiedAttempt.attemptId}`));
        if (attempt.state === 'COMMITTED') { classifiedPairId = attempt.pairId; break; }
        assert.ok(['QUEUED', 'RUNNING'].includes(attempt.state), JSON.stringify(attempt));
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.ok(classifiedPairId);
      assert.equal(modelCalls, 4, 'Metric classification must reuse all retained synthesis, not issue another model call');
      if (index === 0) {
        const insight = await fetch(`${apiRoot}/report-versions/${classifiedPairId}/reports/insight`);
        assert.equal(insight.status, 200); assert.match(await insight.text(), /Giả thuyết synthetic cần xem xét/);
      }
      const newMarket = await fetch(`${apiRoot}/report-versions/${classifiedPairId}/reports/market`);
      assert.equal(newMarket.status, 200, await newMarket.clone().text());
      const classifiedHtml = await newMarket.text();
      assert.match(classifiedHtml, /Đã phân loại đủ 2 dòng/);
      assert.match(classifiedHtml, /WIDE loại OUTSIDE và UNKNOWN/);
      assert.match(classifiedHtml, /CORE: cấu trúc trong mẫu đã phân loại/);
      assert.doesNotMatch(classifiedHtml, /chưa phân loại CORE\/WIDE/i);
      const calculationDb = new BetterSqlite3(fixture.databasePath, { readonly: true });
      const output = calculationDb.prepare("SELECT version_sha256 FROM analysis_research_automation_attempt_outputs WHERE attempt_id=? AND report_kind='MARKET'")
        .get(classifiedAttempt.attemptId) as { version_sha256: string }; calculationDb.close();
      const semantic = JSON.parse((await new ContentAddressedArtifactStore(fixture.artifactRoot).read(output.version_sha256)).toString());
      const calculated = semantic.metricClassified.result;
      assert.deepEqual(semantic.sourceScope.metric.scopes.map((scope: any) => [scope.scope, scope.status]),
        [['all', 'CALCULATED'], ['wide', 'CALCULATED'], ['core', 'CALCULATED']]);
      assert.deepEqual(semantic.sourceScope.metric.classification.receiptIds, semantic.metricClassified.selection.receiptIds);
      assert.match(classifiedHtml, /Phân loại này chỉ áp dụng cho mẫu Metric/);
      assert.match(classifiedHtml, /Kỳ chọn listing không giới hạn ngày đăng review/);
      assert.deepEqual(calculated.scopes.map((scope: any) => [scope.key, scope.listingCount, scope.revenue.value, scope.units.value]),
        index === 0 ? [['all', 2, '150', '2'], ['wide', 1, '100', '2'], ['core', 1, '100', '2']] :
          index === 1 ? [['all', 2, '50', '0'], ['wide', 1, '0', '0'], ['core', 1, '0', '0']] :
            [['all', 2, '100', '2'], ['wide', 1, '100', '2'], ['core', 1, '100', '2']], 'independent fixture totals, never lifetime sales');
      assert.deepEqual(calculated.scopes[1].recordIndices, [0], 'accepted UNKNOWN stays in ALL but outside WIDE and CORE');
      assert.equal(calculated.input.records[1].units.state, index === 2 ? 'missing' : 'observed_zero');
      assert.equal(calculated.scopes[0].revenue.missingCount, index === 2 ? 1 : 0);
      if (index === 2) assert.equal(calculated.scopes[0].concentration[0].share, null, 'missing revenue cannot become a concentration denominator');
      else assert.equal(calculated.scopes[0].concentration[0].share.percent, index === 0 ? '66.67' : '100.00');
      if (index === 1) assert.equal(calculated.scopes[1].concentration[0].share, null, 'observed zero denominator has no percentage');
      else assert.equal(calculated.scopes[1].concentration[0].share.percent, '100.00');
      assert.equal(calculated.input.wideUnknownPolicy, 'exclude');
      assert.equal(semantic.metricMethods.result.scopes[1].status, 'BLOCKED_LABELS', 'old unclassified snapshot is retained unchanged');
      assert.equal(semantic.completion.completedAnalyticalSections, 0, 'classified sample alone does not complete all section methodology');
      assert.equal(await (await fetch(`${apiRoot}/reports/market`)).text(), originalMarket);
      assert.equal((await post('report-revisions', { ...classifiedRequest,
        acceptedMetric: { ...classifiedRequest.acceptedMetric, receiptIds: [...classifiedRequest.acceptedMetric.receiptIds].reverse() } })).status, 200);
      await withApi(fixture, false, async readOnlyBase => {
        const beforeRead = databaseDigest(fixture.databasePath);
        const replay = await fetch(`${readOnlyBase}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${classifiedPairId}/reports/market`);
        assert.equal(replay.status, 200); assert.equal(await replay.text(), classifiedHtml);
        assert.equal(databaseDigest(fixture.databasePath), beforeRead, 'read-only reopen does not recalculate or mutate classified output');
        if (index === 0) {
          const insight = await fetch(`${readOnlyBase}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${classifiedPairId}/reports/insight`);
          assert.equal(insight.status, 200); assert.match(await insight.text(), /Giả thuyết synthetic cần xem xét/);
          assert.equal(modelCalls, 4);
        }
      });
      if (index === 0) {
        const sha = semantic.metricClassified.proofSha256;
        const proofPath = path.join(fixture.artifactRoot, 'sha256', sha.slice(0, 2), sha);
        const proofBytes = fs.readFileSync(proofPath); fs.unlinkSync(proofPath);
        assert.equal((await fetch(`${apiRoot}/report-versions/${classifiedPairId}/reports/market`)).status, 500);
        assert.equal(fs.existsSync(proofPath), false, 'report read cannot synthesize missing calculation evidence');
        fs.writeFileSync(proofPath, proofBytes, { mode: 0o600 });
        assert.equal((await fetch(`${apiRoot}/report-versions/${classifiedPairId}/reports/market`)).status, 200);
      }
      const classifiedStillReads = () => fetch(`${apiRoot}/report-versions/${classifiedPairId}/reports/market`);
      if (index === 1) {
        const revision = await post('report-revisions', { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(),
          previousPairId: classifiedPairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
        assert.equal(revision.status, 202);
        const queued = await readJson(revision);
        let nextPairId: string | undefined;
        for (let poll = 0; poll < 200; poll++) {
          const attempt = await readJson(await fetch(`${apiRoot}/report-attempts/${queued.attemptId}`));
          if (attempt.state === 'COMMITTED') { nextPairId = attempt.pairId; break; }
          assert.ok(['QUEUED', 'RUNNING'].includes(attempt.state));
          await new Promise(resolve => setTimeout(resolve, 10));
        }
        assert.ok(nextPairId);
        const nextReview = await readJson(await fetch(`${apiRoot}/metric-membership/${nextPairId}/${adoptionId}`));
        assert.equal(nextReview.acceptedCount, 0, 'a new pair must not silently inherit the old pair acceptance');
        assert.equal(nextReview.pendingCount, 2);
        const keptReport = await fetch(`${apiRoot}/report-versions/${nextPairId}/reports/market`);
        assert.equal(keptReport.status, 200); assert.match(await keptReport.text(), /Đã phân loại đủ 2 dòng/);
        assert.equal((await post('metric-membership-receipts', acceptRequest)).status, 200, 'old exact receipt retries remain historical');
        const nextProposal = await post('metric-membership-proposals', { ...proposalRequest, requestKey: randomUUID(), pairId: nextPairId });
        assert.equal(nextProposal.status, 201);
        const nextProposalId = (await readJson(nextProposal)).id;
        assert.equal((await post('metric-membership-receipts', { ...acceptRequest, requestKey: randomUUID(), proposalId: nextProposalId })).status, 201);
        const nextPartial = await readJson(await fetch(`${apiRoot}/metric-membership/${nextPairId}/${adoptionId}`));
        assert.equal(nextPartial.acceptedCount, 1); assert.equal(nextPartial.pendingCount, 1);
        assert.deepEqual(await review(), complete, 'new pair acceptance never changes the old pair ledger');
      }
      const newerRule = await post('metric-rule-adoptions', { ...ruleRequest, requestKey: randomUUID(), rulebook: { ...ruleRequest.rulebook, revision: 2 } }); assert.equal(newerRule.status, 201);
      assert.equal((await post('metric-membership-proposals', { ...proposalRequest, requestKey: randomUUID() })).status, 409, 'new request cannot use a superseded rule revision');
      assert.equal((await post('metric-membership-receipts', { ...acceptRequest, requestKey: randomUUID() })).status, 409);
      assert.equal((await post('metric-membership-receipts', acceptRequest)).status, 200, 'historical exact retry survives newer rules');
      assert.deepEqual(await readJson(await fetch(`${apiRoot}/metric-membership-receipts/${acceptedReceipt.id}`)), firstRead);
      assert.deepEqual(await review(), complete, 'historical acceptance remains readable');
      assert.equal((await classifiedStillReads()).status, 200, 'a newer rule does not invalidate the frozen classified report');
      if (index === 2) {
        const corrupt = new BetterSqlite3(fixture.databasePath);
        try {
          assert.throws(() => corrupt.prepare('DELETE FROM analysis_metric_membership_accepted WHERE run_id=?').run(runId), /immutable_metric_membership/);
          corrupt.exec('DROP TRIGGER metric_membership_accepted_no_delete');
          corrupt.prepare('DELETE FROM analysis_metric_membership_accepted WHERE run_id=? AND record_key=?').run(runId, keys[0]);
        } finally { corrupt.close(); }
        assert.equal((await fetch(`${apiRoot}/metric-membership-receipts/${acceptedReceipt.id}`)).status, 500, 'receipt replay verifies the persisted selected membership');
        assert.equal((await post('metric-membership-receipts', acceptRequest)).status, 500, 'retry does not silently recreate missing accepted records');
        assert.equal((await classifiedStillReads()).status, 500, 'classified report cannot conceal missing selected membership');
      }
    }
  }, { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-loopback-only-key' },
    configuration: i14CliproxySynthesisConfiguration('synthetic-classified-revision') }, {
    cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-loopback-only-key' },
    configurations: { M11: decisionCliproxySynthesisConfiguration('M11', 'synthetic-M11'),
      M12: decisionCliproxySynthesisConfiguration('M12', 'synthetic-M12'), I15: decisionCliproxySynthesisConfiguration('I15', 'synthetic-I15') },
  });
});

// Primary owner proof for adoption: authenticated HTTP through persisted replay.
// Protects silent rule replacement, forged actor, implicit label/report changes,
// and retry publication; existing upload and report tests do not adopt rules.
test('OWNER Metric rule adoption is immutable, scope-bound, inert and replayable after reopening', async () => {
  const fixture = await createFixture();
  let runId = ''; let adoptionId = ''; let original: Record<string, any>; let request: Record<string, any>;
  const snapshot = (excludeAdoption = false): string => {
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
    try {
      const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
        .map(item => item.name).filter(name => !excludeAdoption || !['analysis_metric_rule_adoptions', 'artifact_manifests'].includes(name));
      return JSON.stringify(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()]));
    } finally { db.close(); }
  };
  const root = (base: string, owner = false) => `${base}/${owner ? 'owner-api' : 'api'}/workspaces/${workspaceId}/research-automation/runs/${runId}/metric-rule-adoptions`;
  const submit = (base: string, body = request, auth = true) => fetch(root(base, true), { method: 'POST', headers: ownerHeaders(base, auth), body: JSON.stringify(body) });
  await withApi(fixture, true, async base => {
    const awaiting = await startAndWaitForScope(base, randomUUID()); runId = awaiting.runId;
    request = { contractVersion: 'automation-metric-rule-adopt-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
      rulebook: { ruleId: 'synthetic-earbuds', revision: 1, title: 'Synthetic classification definitions',
        definitions: { CORE_CANDIDATE: 'Standalone wireless earbuds.', ADJACENT: 'Accessories sold separately.', OUTSIDE: 'Unrelated goods.', UNKNOWN: 'Insufficient product description.' },
        groups: [{ key: 'standalone', label: 'Standalone units', definition: 'One pair of earbuds; exclude accessories.' }], wideUnknownPolicy: 'exclude' } };
    assert.equal((await submit(base)).status, 409, 'unconfirmed scope cannot be adopted');
    assert.equal((await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/confirm-scope`, {
      method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(confirmBody(randomUUID(), awaiting.revision)),
    })).status, 202);
    const ready = await waitForRun(base, runId, run => run.status === 'DRAFT_READY'); request.expectedRevision = ready.revision;
    const before = snapshot(true);
    assert.equal((await submit(base, request, false)).status, 401);
    for (const extra of [{ actorId: 'forged' }, { adoptedAt: '2020-01-01T00:00:00.000Z' }, { acceptedLabels: [] }])
      assert.equal((await submit(base, { ...request, ...extra })).status, 400);
    assert.equal((await submit(base, { ...request, expectedRevision: ready.revision - 1 })).status, 409);
    assert.equal((await submit(base, { ...request, rulebook: { ...request.rulebook, groups: [...request.rulebook.groups, ...request.rulebook.groups] } })).status, 400);
    const created = await submit(base); assert.equal(created.status, 201);
    original = await readJson(created); assertValidContract(original, 'metricRuleReceipt'); adoptionId = original.adoptionId;
    assert.equal(original.exactRetry, false); assert.deepEqual(original.rulebook, request.rulebook);
    assert.equal('actorId' in original, false); assert.equal('scopeSha256' in original, false);
    assert.equal(snapshot(true), before, 'adoption cannot alter research, source, label, method or report records');
    const after = snapshot();
    const retry = await submit(base); assert.equal(retry.status, 200);
    assert.deepEqual(await readJson(retry), { ...original, exactRetry: true }); assert.equal(snapshot(), after);
    assert.equal((await submit(base, { ...request, rulebook: { ...request.rulebook, title: 'Changed' } })).status, 409);
    assert.equal((await submit(base, { ...request, requestKey: randomUUID() })).status, 409, 'new key cannot replace an immutable rule revision');
    assert.equal(snapshot(), after);
    const listed = await readJson(await fetch(root(base))); assertValidContract(listed, 'metricRuleList'); assert.deepEqual(listed.adoptions, [original]);
    const db = new BetterSqlite3(fixture.databasePath);
    try {
      const row = db.prepare('SELECT * FROM analysis_metric_rule_adoptions').get() as Record<string, any>;
      assert.equal(row.actor_id, 'owner:research'); assert.equal(row.scope_sha256, (db.prepare('SELECT scope_request_sha256 FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as any).scope_request_sha256);
      assert.throws(() => db.prepare('UPDATE analysis_metric_rule_adoptions SET actor_id=?').run('other'), /immutable_metric_rule_adoption/);
      assert.throws(() => db.prepare('DELETE FROM analysis_metric_rule_adoptions').run(), /immutable_metric_rule_adoption/);
    } finally { db.close(); }
    const next = await submit(base, { ...request, requestKey: randomUUID(), rulebook: { ...request.rulebook, revision: 2, title: 'Explicit second revision' } });
    assert.equal(next.status, 201);
    assert.deepEqual(await readJson(await fetch(`${root(base)}/${adoptionId}`)), original, 'exact historical adoption remains readable, never latest');
    assert.equal(snapshot(true), before);
  });
  await withApi(fixture, false, async base => {
    const before = snapshot();
    assert.deepEqual(await readJson(await fetch(`${root(base)}/${adoptionId}`)), original);
    assert.equal((await submit(base)).status, 403); assert.equal(snapshot(), before);
  });
  await withApi(fixture, true, async base => {
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
    const row = db.prepare('SELECT * FROM analysis_metric_rule_adoptions WHERE adoption_id=?').get(adoptionId) as Record<string, any>; db.close();
    const artifactPath = new ContentAddressedArtifactStore(fixture.artifactRoot).pathForDigest(row.artifact_sha256);
    const retained = fs.readFileSync(artifactPath); const before = snapshot();
    fs.unlinkSync(artifactPath);
    assert.equal((await fetch(`${root(base)}/${adoptionId}`)).status, 500, 'read-only replay never repairs missing evidence');
    assert.equal(fs.existsSync(artifactPath), false);
    const changed = { ...request, rulebook: { ...request.rulebook, title: 'Not the committed request' } };
    assert.equal((await submit(base, changed)).status, 409); assert.equal(fs.existsSync(artifactPath), false);
    const recovered = await submit(base); assert.equal(recovered.status, 200);
    assert.deepEqual(await readJson(recovered), { ...original, exactRetry: true });
    assert.deepEqual(fs.readFileSync(artifactPath), retained); assert.equal(snapshot(), before);
    assert.equal(fs.statSync(artifactPath).mode & 0o777, 0o600);
    fs.writeFileSync(artifactPath, 'corrupt', { mode: 0o600 });
    assert.equal((await submit(base)).status, 500, 'corrupt present file is never repaired or replaced');
    assert.equal((await fetch(`${root(base)}/${adoptionId}`)).status, 500);
    assert.equal(fs.readFileSync(artifactPath, 'utf8'), 'corrupt'); assert.equal(snapshot(), before);
    assert.deepEqual(fs.readdirSync(path.join(fixture.artifactRoot, '.owner-api-requests')), []);
  });
});

// Upload's transport owner: bytes/metadata/auth/route bounds cannot be proved
// by the bridge's already-existing exact package fixtures.
test('bounded raw Metric upload prepares original bytes without admission, preserves exact retries and late-source isolation', async () => {
  const fixture = await createFixture();
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2' }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const workbook = generated.stdout;
  let runId = '';
  let metadata: Record<string, any>;
  let packageId = '';
  let contextDigest = '';
  const inventory = (base: string) => fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`);
  const upload = (base: string, body: Record<string, any>, bytes = workbook, authorized = true) => {
    const form = new FormData();
    form.set('metadata', JSON.stringify(body));
    // An untrusted filename is inert; it must never become a storage path.
    form.set('workbook', new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '../untrusted.xlsx');
    return fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`, {
      method: 'POST', headers: { Origin: base, ...(authorized ? { Authorization: `Bearer ${ownerToken}` } : {}) }, body: form,
    });
  };
  const packageRows = () => {
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true, fileMustExist: true });
    try { return JSON.stringify(['foundation_source_packages', 'foundation_source_package_files', 'foundation_source_attachment_origins', 'artifact_manifests']
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())); } finally { db.close(); }
  };

  await withApi(fixture, true, async base => {
    const awaiting = await startAndWaitForScope(base, '81818181-8181-4181-8181-818181818181');
    runId = awaiting.runId;
    const { contractVersion: _version, requestKey: _key, expectedRevision: _rev, ...scope } = confirmBody('82828282-8282-4282-8282-828282828282', awaiting.revision);
    metadata = { contractVersion: 'automation-metric-prepare-v1', requestKey: '83838383-8383-4383-8383-838383838383', expectedRevision: awaiting.revision,
      scope, sourceLabel: 'Synthetic operator export', sourceContext: 'Keyword export; filters not independently verified.',
      measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-29', basis: 'Operator-declared export range, not authenticated' },
      selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' } };
    const emptyList = await readJson(await inventory(base));
    assertValidContract(emptyList, 'metricPreparedList'); assert.deepEqual(emptyList.sources, []);
    const before = packageRows();
    assert.equal((await upload(base, metadata, workbook, false)).status, 401);
    const badPeriod = await upload(base, { ...metadata, measurementPeriod: { ...metadata.measurementPeriod, startDate: '2025-12-31' } });
    assert.equal(badPeriod.status, 400);
    const badHeader = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells: { A1: { type: 's', value: 'wrong header' } } }), maxBuffer: 4 * 1024 * 1024 });
    assert.equal(badHeader.status, 0);
    assert.equal((await upload(base, metadata, badHeader.stdout)).status, 400);
    assert.equal((await upload(base, metadata, Buffer.from('not an OOXML archive'))).status, 400);
    const wrongType = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(metadata) });
    assert.equal(wrongType.status, 400);
    const oversized = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`, {
      method: 'POST', headers: { Origin: base, Authorization: `Bearer ${ownerToken}`, 'Content-Type': 'multipart/form-data; boundary=synthetic' }, body: new Uint8Array(32 * 1024 * 1024 + 16 * 1024 + 4097),
    });
    assert.equal(oversized.status, 413);
    assert.equal(packageRows(), before, 'rejected uploads do not persist sources or artifact manifests');

    const response = await upload(base, metadata);
    assert.equal(response.status, 201, await response.clone().text());
    const prepared = await readJson(response);
    assertValidContract(prepared, 'metricPrepared');
    assert.equal(prepared.state, 'PREPARED_NOT_ADMITTED'); assert.equal(prepared.recordCount, 2);
    assert.equal(prepared.acquiredAt, null); assert.equal(prepared.provenance, 'OPERATOR_SUPPLIED_UNVERIFIED');
    packageId = prepared.packageId;
    assert.deepEqual(await getRun(base, runId), awaiting, 'preparation changes no run, step, scope or usage');
    const after = packageRows();
    const retry = await upload(base, metadata);
    assert.equal(retry.status, 200); assert.deepEqual(await readJson(retry), { ...prepared, exactRetry: true });
    assert.equal(packageRows(), after, 'exact retry preserves all immutable source/manifest metadata');
    const priorPath = process.env.PATH;
    try {
      process.env.PATH = '/no-python-for-prepared-source-read';
      const list = await readJson(await inventory(base));
      assertValidContract(list, 'metricPreparedList');
      assert.deepEqual(list.sources, [{ packageId, recordCount: 2, request: metadata, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' }]);
      assert.equal(packageRows(), after, 'source choices replay without Python or database mutation');
    } finally { process.env.PATH = priorPath; }
    assert.equal((await upload(base, { ...metadata, sourceContext: 'changed declaration under the same key' })).status, 409);
    assert.equal(packageRows(), after);
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true, fileMustExist: true }); db.defaultSafeIntegers(true);
    try {
      const packages = new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(fixture.artifactRoot) });
      const source = await packages.readVerified(packageId);
      assert.deepEqual(source.files.find(file => file.path === 'metric/export.xlsx')!.bytes, workbook);
      contextDigest = source.files.find(file => file.path === 'metric/context.json')!.sha256;
      assert.equal(source.manifest.sourceAcquiredAt, null);
      assert.equal((await packages.readAutomationAttachmentOrigin(packageId))!.originKind, 'AUTOMATION_ATTACHMENT');
      assert.equal((await packages.listFinalizedSourcePackages()).some(value => value.packageId === packageId), false);
    } finally { db.close(); }
    assert.equal(fs.existsSync(path.join(fixture.root, 'untrusted.xlsx')), false);
    assert.deepEqual(fs.readdirSync(path.join(fixture.artifactRoot, '.owner-api-requests')), []);

    const confirm = { ...confirmBody('84848484-8484-4484-8484-848484848484', awaiting.revision), contractVersion: 'research-automation-confirm-v2',
      sources: { metric: { decision: 'USE_PREPARED', packageId }, nativeReview: 'SKIP' } };
    const confirmed = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/confirm-scope`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(confirm) });
    assert.equal(confirmed.status, 202, await confirmed.clone().text());
    const ready = await waitForRun(base, runId, run => run.status === 'DRAFT_READY');
    const oldHtml = await (await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`)).text();
    assert.match(oldHtml, /150 VND/);
    const late = await upload(base, { ...metadata, requestKey: '85858585-8585-4585-8585-858585858585', expectedRevision: ready.revision,
      measurementPeriod: { ...metadata.measurementPeriod, endDate: '2026-01-28' } });
    assert.equal(late.status, 201);
    assert.deepEqual(await getRun(base, runId), ready);
    assert.equal(await (await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`)).text(), oldHtml);
    assert.equal(captureCount(fixture.databasePath), 0);
    const frozenRetry = await upload(base, metadata);
    assert.equal(frozenRetry.status, 200, 'retry remains available after scope and original reports settle');
    const scopeChange = await upload(base, { ...metadata, requestKey: '86868686-8686-4686-8686-868686868686', expectedRevision: ready.revision, scope: { ...scope, definition: 'another scope' } });
    assert.equal(scopeChange.status, 409);
  });
  await withApi(fixture, false, async base => {
    assert.equal((await upload(base, metadata!)).status, 403);
    const before = databaseDigest(fixture.databasePath);
    const list = await readJson(await inventory(base)); assertValidContract(list, 'metricPreparedList');
    assert.equal(list.sources.length, 2, 'prepared choices survive closing and reopening the read application');
    assert.equal(list.sources.some((source: any) => source.packageId === packageId && source.request.requestKey === metadata!.requestKey), true);
    assert.equal(databaseDigest(fixture.databasePath), before, 'inventory stays read-only');
    fs.writeFileSync(new ContentAddressedArtifactStore(fixture.artifactRoot).pathForDigest(contextDigest), 'damaged retained source context');
    const damaged = await inventory(base); assert.equal(damaged.status, 500);
    const error = await readJson(damaged); assert.equal(error.error.code, 'integrity_error');
    assert.doesNotMatch(JSON.stringify(error), new RegExp(`${packageId}|${contextDigest}|metric/context`));
  });
});

// Owns supplemental multipart authentication, route/run binding and exact bytes.
// Method arithmetic and source replay stay covered by the existing method owners.
test('supplemental HTTP intake authenticates before storage and prepares an exact package without report admission', async () => {
  const fixture = await createFixture();
  const packet = reportMethodPacketsFixture();
  const descriptor = { ...packet.descriptor, decisions: null };
  const files = packet.files.filter(file => [packet.gateSourcePath, 'method-packets/advanced-profile.md', 'method-packets/adoption.md'].includes(file.path));
  files.push({ ...packet.files.find(file => file.path === packet.logicalPath)!, bytes: Buffer.from(JSON.stringify(descriptor)) });
  const metadata = { contractVersion: 'automation-supplemental-prepare-v1', requestKey: randomUUID(), family: 'BOUNDED',
    sourceLabel: 'Synthetic supplemental package', acquiredAt: null, descriptorPath: packet.logicalPath,
    files: files.map(file => ({ path: file.path, mediaType: file.mediaType, representationRole: file.representationRole })) };
  let runId = '';
  let preparedEntry: Record<string, any>;
  const upload = (base: string, body = metadata, authorized = true, duplicate = false, routeWorkspaceId = workspaceId) => {
    const form = new FormData(); form.set('metadata', JSON.stringify(body));
    for (const file of files) form.append(`file:${file.path}`, new Blob([new Uint8Array(file.bytes)], { type: file.mediaType }), '../ignored.json');
    if (duplicate) form.append(`file:${files[0]!.path}`, new Blob(['{}']), 'duplicate.json');
    return fetch(`${base}/owner-api/workspaces/${routeWorkspaceId}/research-automation/runs/${runId}/sources/supplemental`, {
      method: 'POST', headers: { Origin: base, ...(authorized ? { Authorization: `Bearer ${ownerToken}` } : {}) }, body: form });
  };
  const sourceState = () => {
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true, fileMustExist: true });
    try { return JSON.stringify(['foundation_source_packages', 'foundation_source_package_files', 'foundation_source_attachment_origins', 'artifact_manifests']
      .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())); } finally { db.close(); }
  };
  await withApi(fixture, true, async base => {
    const awaiting = await startAndWaitForScope(base, randomUUID()); runId = awaiting.runId;
    const before = sourceState();
    assert.equal((await upload(base, metadata, false)).status, 401);
    assert.equal((await upload(base)).status, 409, 'no supplemental package before confirmed reports');
    assert.equal(sourceState(), before);
    const confirm = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/confirm-scope`, {
      method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(confirmBody(randomUUID(), awaiting.revision)) });
    assert.equal(confirm.status, 202);
    const ready = await waitForRun(base, runId, run => run.status === 'DRAFT_READY');
    const versionUrl = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions`;
    const versions = await readJson(await fetch(versionUrl));
    const beforeInvalid = sourceState();
    assert.equal((await upload(base, metadata, true, true)).status, 400);
    assert.equal((await upload(base, { ...metadata, descriptorPath: 'missing.json' })).status, 400);
    assert.equal(sourceState(), beforeInvalid);
    const created = await upload(base); assert.equal(created.status, 201);
    const receipt = await readJson(created);
    const { contractVersion: _receiptVersion, exactRetry: _retryFlag, ...entry } = receipt;
    preparedEntry = entry;
    assert.equal(receipt.state, 'PREPARED_NOT_ADMITTED'); assert.equal(receipt.family, 'BOUNDED');
    assert.equal(receipt.provenance, 'OPERATOR_SUPPLIED_UNVERIFIED');
    assert.equal(receipt.descriptorPath, packet.logicalPath);
    for (const file of files) assert.equal(receipt.files.find((row: any) => row.path === file.path)?.sha256, createHash('sha256').update(file.bytes).digest('hex'));
    const retained = sourceState();
    const inventoryUrl = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/supplemental`;
    assert.deepEqual(await readJson(await fetch(inventoryUrl)), { contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages: [preparedEntry] });
    assert.equal(sourceState(), retained, 'inventory reads cannot register or admit a source');
    const retried = await upload(base); assert.equal(retried.status, 200);
    assert.deepEqual(await readJson(retried), { ...receipt, exactRetry: true }); assert.equal(sourceState(), retained);
    assert.equal((await upload(base, { ...metadata, sourceLabel: 'Changed same identity' })).status, 409);
    assert.equal(sourceState(), retained);
    assert.deepEqual(await getRun(base, runId), ready, 'preparation cannot mutate run or stages');
    assert.deepEqual(await readJson(await fetch(versionUrl)), versions, 'preparation cannot create or change reports');
    assert.equal((await upload(base, metadata, true, false, randomUUID())).status, 404);
    assert.equal(sourceState(), retained, 'wrong route workspace cannot access or copy the package');
    const another = await startAndWaitForScope(base, randomUUID());
    assert.equal((await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${another.runId}/confirm-scope`, {
      method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(confirmBody(randomUUID(), another.revision)) })).status, 202);
    await waitForRun(base, another.runId, run => run.status === 'DRAFT_READY');
    const otherRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${another.runId}`;
    const otherVersions = await readJson(await fetch(`${otherRoot}/report-versions`));
    assert.deepEqual((await readJson(await fetch(`${otherRoot}/sources/supplemental`))).packages, []);
    const attemptBefore = await readJson(await fetch(`${otherRoot}/report-attempts`));
    const crossRun = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${another.runId}/report-revisions`, {
      method: 'POST', headers: ownerHeaders(base), body: JSON.stringify({ contractVersion: 'automation-bounded-report-revision-v1',
        requestKey: randomUUID(), previousPairId: otherVersions.versions[0].pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
        boundedMethods: { decision: 'USE_PACKAGE', packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256,
          packageContentSha256: receipt.packageContentSha256, descriptorPath: receipt.descriptorPath } }) });
    assert.equal(crossRun.status, 400, 'a prepared package cannot be admitted to another run even with its exact digest');
    assert.deepEqual(await readJson(await fetch(`${otherRoot}/report-attempts`)), attemptBefore);
    assert.deepEqual(await readJson(await fetch(`${otherRoot}/report-versions`)), otherVersions);
    const firstRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const firstOwnerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const originalHtml = await (await fetch(`${firstRoot}/report-versions/${versions.versions[0].pairId}/reports/market`)).text();
    const revisionRequest = { contractVersion: 'automation-bounded-report-revision-v1', requestKey: randomUUID(), previousPairId: versions.versions[0].pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, boundedMethods: { decision: 'USE_PACKAGE',
        packageId: receipt.packageId, manifestArtifactSha256: receipt.manifestArtifactSha256,
        packageContentSha256: receipt.packageContentSha256, descriptorPath: receipt.descriptorPath } };
    const accepted = await fetch(`${firstOwnerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(revisionRequest) });
    assert.equal(accepted.status, 202);
    const queued = await readJson(accepted);
    let committed: Record<string, any> | undefined;
    for (let index = 0; index < 200; index++) {
      const attempt = await readJson(await fetch(`${firstRoot}/report-attempts/${queued.attemptId}`));
      if (attempt.state === 'COMMITTED') { committed = attempt; break; }
      assert.ok(['QUEUED', 'RUNNING'].includes(attempt.state));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(committed, 'explicit admission of the same-run prepared source produces a new pair');
    assert.equal((await fetch(`${firstRoot}/report-versions/${committed.pairId}/reports/market`)).status, 200);
    assert.equal((await fetch(`${firstRoot}/report-versions/${committed.pairId}/reports/insight`)).status, 200);
    assert.equal(await (await fetch(`${firstRoot}/report-versions/${versions.versions[0].pairId}/reports/market`)).text(), originalHtml);
    const retryRevision = await fetch(`${firstOwnerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(revisionRequest) });
    assert.equal(retryRevision.status, 200);
    assert.deepEqual(await readJson(retryRevision), { ...committed, exactRetry: true });
    assert.deepEqual((await readJson(await fetch(inventoryUrl))).packages, [preparedEntry], 'inventory describes prepared bytes, not historical admission status');
  });
  const beforeReadOnly = databaseDigest(fixture.databasePath);
  await withApi(fixture, false, async base => {
    assert.equal((await upload(base)).status, 403);
    const loaded = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/supplemental`);
    assert.equal(loaded.status, 200); assert.deepEqual((await readJson(loaded)).packages, [preparedEntry]);
  });
  assert.equal(databaseDigest(fixture.databasePath), beforeReadOnly);

  // A Foundation-valid package with this run's origin but without the server context
  // must fail admission just as it fails inventory. No attempt may be queued.
  const db = new BetterSqlite3(fixture.databasePath);
  let malformed: Awaited<ReturnType<SourcePackageService['readVerified']>>;
  try {
    db.defaultSafeIntegers(true);
    const writer = new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(fixture.artifactRoot) });
    const genuine = await writer.readVerified(preparedEntry!.packageId);
    const origin = await writer.readAutomationAttachmentOrigin(genuine.packageId);
    assert.ok(origin);
    const members = genuine.files.filter(file => file.path !== 'automation-supplemental/context.json');
    const stored = await writer.intakeAutomationAttachment({ contractVersion: '1.0.0',
      packageKey: `automation-supplemental:${runId}-bounded-${randomUUID()}`, version: 1,
      sourceLabel: genuine.manifest.sourceLabel, sourceAcquiredAt: genuine.manifest.sourceAcquiredAt,
      files: members.map(({ bytes: _bytes, ...file }) => file) },
    new Map(members.map(file => [file.path, file.bytes])), origin.bindingSha256);
    malformed = await writer.readVerified(stored.packageId);
  } finally { db.close(); }
  await withApi(fixture, true, async base => {
    const root = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const versions = await readJson(await fetch(`${root}/report-versions`));
    const latest = [...versions.versions].sort((a: any, b: any) => b.versionNumber - a.versionNumber)[0];
    assert.ok(latest);
    const attempts = await readJson(await fetch(`${root}/report-attempts`));
    const before = databaseDigest(fixture.databasePath);
    assert.equal((await fetch(`${root}/sources/supplemental`)).status, 500);
    const response = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`, {
      method: 'POST', headers: ownerHeaders(base), body: JSON.stringify({ contractVersion: 'automation-bounded-report-revision-v1',
        requestKey: randomUUID(), previousPairId: latest.pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
        boundedMethods: { decision: 'USE_PACKAGE', packageId: malformed.packageId,
          manifestArtifactSha256: malformed.manifestArtifactSha256, packageContentSha256: malformed.manifest.packageContentSha256,
          descriptorPath: packet.logicalPath } }) });
    assert.equal(response.status, 500, 'inventory-rejected prepared metadata cannot be admitted');
    assert.equal(databaseDigest(fixture.databasePath), before);
    assert.deepEqual(await readJson(await fetch(`${root}/report-attempts`)), attempts);
    assert.deepEqual(await readJson(await fetch(`${root}/report-versions`)), versions);
  });
});

test('readonly API has no writer and owner routes reject unauthenticated writes', async () => {
  const fixture = await createFixture();
  const before = databaseDigest(fixture.databasePath);

  await withApi(fixture, false, async (base) => {
    const listResponse = await fetch(
      `${base}/api/workspaces/${workspaceId}/research-automation/runs`,
    );
    assert.equal(listResponse.status, 200);
    const listBody = await readJson(listResponse);
    assertValidContract(listBody, 'runList');
    assert.deepEqual(listBody.runs, []);

    const writeResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      {
        method: 'POST',
        headers: ownerHeaders(base, false),
        body: JSON.stringify(startBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
      },
    );
    assert.equal(writeResponse.status, 403);
    assert.equal((await readJson(writeResponse)).error.code, 'forbidden');
  });

  await withApi(fixture, true, async (base) => {
    const unauthenticatedResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      {
        method: 'POST',
        headers: ownerHeaders(base, false),
        body: JSON.stringify(startBody('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
      },
    );
    assert.equal(unauthenticatedResponse.status, 401);
    assert.equal((await readJson(unauthenticatedResponse)).error.code, 'unauthorized');
  });

  assert.equal(databaseDigest(fixture.databasePath), before);
});

test('owner start is 202, exact retry is 200, and unconfigured Kalo stays awaiting scope', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const body = startBody('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const firstResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(firstResponse.status, 202);
    const first = (await readJson(firstResponse)) as ReceiptResponse;
    assertValidContract(first, 'receipt');
    assert.equal(first.exactRetry, false);
    assert.match(first.run.runId, /^[0-9a-f-]{36}$/);

    const retryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(retryResponse.status, 200);
    const retry = (await readJson(retryResponse)) as ReceiptResponse;
    assertValidContract(retry, 'receipt');
    assert.equal(retry.exactRetry, true);
    assert.equal(retry.run.runId, first.run.runId);

    const run = await waitForRun(base, first.run.runId, (candidate) => candidate.status === 'AWAITING_SCOPE');
    assert.equal(run.runId, first.run.runId);
    assert.deepEqual(run.productCards, []);
    assert.deepEqual(
      { startDate: run.requestedPeriod.startDate, endDate: run.requestedPeriod.endDate },
      requestedPeriod,
    );
    assert.equal(run.coverage.sources.length, 1);
    assert.equal(run.coverage.sources[0].provider, 'kalodata');
    assert.equal(run.coverage.sources[0].state, 'UNAVAILABLE');
    assert.equal(run.coverage.sources[0].observedStartDate, null);
    assert.equal(run.coverage.sources[0].observedEndDate, null);
    assert.equal(run.steps.find((step: Record<string, any>) => step.stepId === 'QUICK_SEARCH').state, 'UNAVAILABLE');
    assert.equal(captureCount(fixture.databasePath), 0);
  });
});

test('confirm freezes two web reports and reports PDF as unavailable without a renderer', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const run = await startAndWaitForScope(base, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    const body = confirmBody('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', run.revision);
    const confirmResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/confirm-scope`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(confirmResponse.status, 202);
    const confirmed = (await readJson(confirmResponse)) as ReceiptResponse;
    assertValidContract(confirmed, 'receipt');
    assert.equal(confirmed.exactRetry, false);

    const confirmRetryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/confirm-scope`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(confirmRetryResponse.status, 200);
    const confirmedRetry = (await readJson(confirmRetryResponse)) as ReceiptResponse;
    assertValidContract(confirmedRetry, 'receipt');
    assert.equal(confirmedRetry.exactRetry, true);
    assert.equal(confirmedRetry.run.runId, confirmed.run.runId);

    const completed = await waitForRun(base, run.runId, (candidate) => candidate.status === 'DRAFT_READY');
    const marketOutput = completed.outputs.market as Record<string, any> | undefined;
    const insightOutput = completed.outputs.insight as Record<string, any> | undefined;
    assert.ok(marketOutput);
    assert.ok(insightOutput);
    const outputs = [marketOutput, insightOutput];
    assert.equal(outputs.length, 2);
    for (const output of outputs) {
      assert.equal(output.web, true);
      assert.equal(output.pdf.available, false);
      assert.equal(typeof output.pdf.reason, 'string');
      assert.match(output.versionId, /^[0-9a-f]{64}$/);
    }
    assert.notEqual(marketOutput.versionId, insightOutput.versionId);

    for (const kind of ['market', 'insight']) {
      const reportResponse = await fetch(
        `${base}/api/workspaces/${workspaceId}/research-automation/runs/${completed.runId}/reports/${kind}`,
      );
      assert.equal(reportResponse.status, 200);
      assert.match(reportResponse.headers.get('content-type') ?? '', /^text\/html/);
      assert.ok((await reportResponse.text()).length > 100);

      const pdfResponse = await fetch(
        `${base}/api/workspaces/${workspaceId}/research-automation/runs/${completed.runId}/reports/${kind}/pdf`,
      );
      assert.equal(pdfResponse.status, 404);
      assert.equal((await readJson(pdfResponse)).error.code, 'pdf_not_available');
    }
  });
});

test('GET remains read-only and cancel is idempotent without repeating an unavailable provider call', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const run = await startAndWaitForScope(base, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(captureCount(fixture.databasePath), 0);

    const cancelBodyValue = cancelBody('99999999-9999-4999-8999-999999999999', run.revision);
    const cancelResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/cancel`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancelBodyValue) },
    );
    assert.equal(cancelResponse.status, 200);
    const cancelled = (await readJson(cancelResponse)) as ReceiptResponse;
    assertValidContract(cancelled, 'receipt');
    assert.equal(cancelled.exactRetry, false);

    const cancelRetryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/cancel`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancelBodyValue) },
    );
    assert.equal(cancelRetryResponse.status, 200);
    const cancelledRetry = (await readJson(cancelRetryResponse)) as ReceiptResponse;
    assertValidContract(cancelledRetry, 'receipt');
    assert.equal(cancelledRetry.exactRetry, true);
    assert.equal(cancelledRetry.run.runId, cancelled.run.runId);

    const finalRun = await waitForRun(base, run.runId, (candidate) => candidate.status === 'CANCELLED');
    assert.equal(finalRun.runId, run.runId);
    assert.equal(captureCount(fixture.databasePath), 0);

    const listResponse = await fetch(
      `${base}/api/workspaces/${workspaceId}/research-automation/runs`,
    );
    assert.equal(listResponse.status, 200);
    const listBody = await readJson(listResponse);
    assertValidContract(listBody, 'runList');
    assert.equal(listBody.runs.length, 1);
  });
});

for (const method of ['bounded', 'quote'] as const) test(`${method} revision HTTP contract reaches the existing worker and rejects changing unrelated sources`, async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async base => {
    const awaiting = await startAndWaitForScope(base, randomUUID());
    const readRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${awaiting.runId}`;
    const ownerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${awaiting.runId}`;
    assert.equal((await fetch(`${ownerRoot}/confirm-scope`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify(confirmBody(randomUUID(), awaiting.revision)) })).status, 202);
    await waitForRun(base, awaiting.runId, run => run.status === 'DRAFT_READY');
    const first = await readJson(await fetch(`${readRoot}/report-versions`));
    const request = { contractVersion: `automation-${method}-report-revision-v1`, requestKey: randomUUID(),
      previousPairId: first.versions[0].pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      [method === 'bounded' ? 'boundedMethods' : 'quoteMethods']: { decision: 'SKIP' } };
    const invalid = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify({ ...request, sources: { ...request.sources, metric: { decision: 'SKIP' } } }) });
    assert.equal(invalid.status, 400);
    const queuedResponse = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(request) });
    assert.equal(queuedResponse.status, 202, await queuedResponse.clone().text());
    const queued = await readJson(queuedResponse);
    assertValidContract(queued, 'revisionReceipt');
    let committed = false;
    for (let index = 0; index < 200; index++) {
      const receipt = await readJson(await fetch(`${readRoot}/report-attempts/${queued.attemptId}`));
      if (receipt.state === 'COMMITTED') { committed = true; break; }
      assert.ok(['QUEUED', 'RUNNING'].includes(receipt.state));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(committed);
    const retry = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(request) });
    assert.equal(retry.status, 200);
    assert.equal((await readJson(retry)).exactRetry, true);
  });
});

test('source-bound HTTP confirmation and supplemental versions preserve old report URLs and expose exact attempt cancellation', async () => {
  const fixture = await createFixture();
  let runId = '';
  let originalPairId = '';
  let revisedPairId = '';
  let cancelledAttemptId = '';
  const originalHtml = new Map<string, string>();
  await withApi(fixture, true, async (base) => {
    const awaiting = await startAndWaitForScope(base, '70707070-7070-4070-8070-707070707070');
    runId = awaiting.runId;
    const readRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const ownerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const premature = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify({ contractVersion: 'automation-report-revision-v1', requestKey: '77777777-7777-4777-8777-777777777777',
        previousPairId: 'a'.repeat(64), sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } }) });
    assert.equal(premature.status, 409);
    assert.equal((await readJson(premature)).error.code, 'invalid_state');
    const confirmed = await fetch(`${ownerRoot}/confirm-scope`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify({ ...confirmBody('71717171-7171-4171-8171-717171717171', awaiting.revision),
        contractVersion: 'research-automation-confirm-v2', sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } }) });
    assert.equal(confirmed.status, 202);
    assertValidContract(await readJson(confirmed), 'receipt');
    const completed = await waitForRun(base, runId, run => run.status === 'DRAFT_READY');
    const first = await readJson(await fetch(`${readRoot}/report-versions`));
    assertValidContract(first, 'versionList');
    assert.deepEqual(first.versions.map((value: any) => value.versionNumber), [1]);
    originalPairId = first.versions[0].pairId;
    for (const kind of ['market', 'insight']) originalHtml.set(kind, await (await fetch(`${readRoot}/reports/${kind}`)).text());

    const request = { contractVersion: 'automation-report-revision-v1', requestKey: '72727272-7272-4272-8272-727272727272',
      previousPairId: originalPairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
    for (const endpoint of ['report-revisions', 'report-attempts/73737373-7373-4373-8373-737373737373/cancel']) {
      const response = await fetch(`${ownerRoot}/${endpoint}`, { method: 'POST', headers: ownerHeaders(base, false), body: JSON.stringify(request) });
      assert.equal(response.status, 401);
    }
    const queuedResponse = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(request) });
    assert.equal(queuedResponse.status, 202);
    const queued = await readJson(queuedResponse);
    assertValidContract(queued, 'revisionReceipt');
    let committed: Record<string, any> | undefined;
    for (let index = 0; index < 200; index++) {
      const response = await fetch(`${readRoot}/report-attempts/${queued.attemptId}`);
      assert.equal(response.status, 200);
      const receipt = await readJson(response);
      assertValidContract(receipt, 'revisionReceipt');
      if (receipt.state === 'COMMITTED') { committed = receipt; break; }
      assert.ok(['QUEUED', 'RUNNING'].includes(receipt.state));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(committed, 'The supplemental worker must commit the requested pair');
    revisedPairId = committed.pairId;
    assert.notEqual(revisedPairId, originalPairId);
    const retryResponse = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(request) });
    assert.equal(retryResponse.status, 200);
    assert.deepEqual(await readJson(retryResponse), { ...committed, exactRetry: true });
    const list = await readJson(await fetch(`${readRoot}/report-versions`));
    assertValidContract(list, 'versionList');
    assert.deepEqual(list.versions.map((value: any) => value.versionNumber), [1, 2]);
    for (const kind of ['market', 'insight']) {
      assert.equal(await (await fetch(`${readRoot}/reports/${kind}`)).text(), originalHtml.get(kind));
      assert.equal(await (await fetch(`${readRoot}/report-versions/${originalPairId}/reports/${kind}`)).text(), originalHtml.get(kind));
      const revised = await fetch(`${readRoot}/report-versions/${revisedPairId}/reports/${kind}`);
      assert.equal(revised.status, 200);
      assert.ok((await revised.text()).length > 100);
      const pdf = await fetch(`${readRoot}/report-versions/${revisedPairId}/reports/${kind}/pdf`);
      assert.equal(pdf.status, 404);
      assert.equal((await readJson(pdf)).error.code, 'pdf_not_available');
    }
    const unchanged = await getRun(base, runId);
    assert.deepEqual(unchanged, completed);
    const stale = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify({ ...request, requestKey: '74747474-7474-4474-8474-747474747474' }) });
    assert.equal(stale.status, 409);
    const invalid = await fetch(`${ownerRoot}/report-revisions`, { method: 'POST', headers: ownerHeaders(base),
      body: JSON.stringify({ ...request, previousPairId: revisedPairId, definition: 'Cannot change frozen scope' }) });
    assert.equal(invalid.status, 400);
    const unknownPair = await fetch(`${readRoot}/report-versions/${'f'.repeat(64)}/reports/market`);
    assert.equal(unknownPair.status, 404);

    // Admit through the real service without waking the HTTP worker, then test
    // the HTTP cancellation boundary against durable queued work, not a mock.
    const db = new BetterSqlite3(fixture.databasePath);
    db.defaultSafeIntegers(true); db.pragma('foreign_keys=ON');
    try {
      const artifacts = new ContentAddressedArtifactStore(fixture.artifactRoot);
      const service = new ResearchAutomationService({ db, artifactStore: artifacts,
        workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })) });
      const pending = await service.requestReportRevision(workspaceId, runId, { ...request, previousPairId: revisedPairId,
        requestKey: '75757575-7575-4575-8575-757575757575' });
      cancelledAttemptId = pending.attemptId;
      const restored = await readJson(await fetch(`${readRoot}/report-attempts`));
      assertValidContract(restored, 'attemptList');
      assert.equal(restored.workspaceId, workspaceId); assert.equal(restored.runId, runId);
      assert.deepEqual(restored.attempts.map((item: any) => [item.attemptNumber, item.state]), [[1, 'COMMITTED'], [2, 'QUEUED']]);
      assert.equal(restored.attempts[1].attemptId, pending.attemptId, 'reload discovers durable work without resubmitting it');
      const cancel = { contractVersion: 'automation-report-revision-cancel-v1', requestKey: '76767676-7676-4676-8676-767676767676' };
      const result = await fetch(`${ownerRoot}/report-attempts/${pending.attemptId}/cancel`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancel) });
      assert.equal(result.status, 200);
      const receipt = await readJson(result);
      assertValidContract(receipt, 'revisionReceipt');
      assert.equal(receipt.state, 'CANCELLED');
      const retried = await fetch(`${ownerRoot}/report-attempts/${pending.attemptId}/cancel`, { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancel) });
      assert.equal(retried.status, 200);
      assert.deepEqual(await readJson(retried), { ...receipt, exactRetry: true });
      assert.equal(captureCount(fixture.databasePath), 0);
    } finally { db.close(); }
  });

  // The read-only application has no executor: version/history reads must not
  // alter the settled database or implicitly select a new default report.
  const before = databaseDigest(fixture.databasePath);
  await withApi(fixture, false, async base => {
    const root = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const versions = await readJson(await fetch(`${root}/report-versions`));
    assertValidContract(versions, 'versionList');
    assert.deepEqual(versions.versions.map((value: any) => value.pairId), [originalPairId, revisedPairId]);
    assert.equal((await readJson(await fetch(`${root}/report-attempts/${cancelledAttemptId}`))).state, 'CANCELLED');
    const attempts = await readJson(await fetch(`${root}/report-attempts`));
    assertValidContract(attempts, 'attemptList');
    assert.deepEqual(attempts.attempts.map((item: any) => item.state), ['COMMITTED', 'CANCELLED']);
    assert.deepEqual(attempts.attempts.map((item: any) => item.exactRetry), [false, false]);
    for (const kind of ['market', 'insight']) assert.equal(await (await fetch(`${root}/reports/${kind}`)).text(), originalHtml.get(kind));
    const forbidden = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`,
      { method: 'POST', headers: ownerHeaders(base), body: '{}' });
    assert.equal(forbidden.status, 403);
  });
  assert.equal(databaseDigest(fixture.databasePath), before);
});

// Primary HTTP owner proof for Insight coding: authenticated persisted adopt ->
// propose -> accept -> reload -> retry -> report revision. Protects forged actors,
// implicit latest pairs, silent truncation and corrupt history shown as empty;
// the four-section arithmetic stays owned by the exact-review service test.
test('OWNER model coding uses its own opt-in, safe receipt, retained retry and shutdown settlement', { timeout: 120_000 }, async () => {
  const fixture = await createFixture();
  const text = 'Tôi đã mua sản phẩm để dùng khi đi học.';
  const db = openDatabase({ databasePath: fixture.databasePath }).db;
  try {
    await seedNativeDamiPackage(new SourcePackageService({ db, artifactStore: new ContentAddressedArtifactStore(fixture.artifactRoot) }), {
      rawRows: [{ type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: 'synthetic-model-http', comment: text, rating_star: 4 }],
    });
  } finally { db.close(); }
  let calls = 0; let hang = false; let onCall = () => {};
  const gateway = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk)).on('end', () => {
      calls++; onCall();
      if (hang) return;
      const envelope = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(envelope.model, 'synthetic-coding-model');
      const input = JSON.parse(envelope.messages[1].content);
      assert.equal(input.records.length, 1); assert.equal(input.records[0].record.text, text);
      assert.equal(JSON.stringify(input).includes('owner:research'), false);
      const annotations = { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(annotations) } }] }));
    });
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const modelConfiguration = { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-model-http-key-123456' },
    configuration: insightCodingCliproxyConfiguration('synthetic-coding-model') };
  let runId = ''; let pairId = ''; let modelRequest: Record<string, unknown> = {};
  let proposed: Record<string, any> = {}; let interrupted: Record<string, unknown> = {};
  const post = (base: string, action: string, body: unknown, authorized = true) => fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/${action}`,
    { method: 'POST', headers: ownerHeaders(base, authorized), body: JSON.stringify(body) });
  const model = (base: string, body = modelRequest, authorized = true) => post(base, 'insight-coding-model-proposals', body, authorized);
  const inspectDb = <T,>(read: (db: BetterSqlite3.Database) => T) => {
    const reader = new BetterSqlite3(fixture.databasePath, { readonly: true });
    try { return read(reader); } finally { reader.close(); }
  };
  try {
    await withApi(fixture, true, async base => {
      const awaiting = await startAndWaitForScope(base, randomUUID()); runId = awaiting.runId;
      const confirmed = await post(base, 'confirm-scope', { ...confirmBody(randomUUID(), awaiting.revision), contractVersion: 'research-automation-confirm-v2',
        exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'AUTO_REUSE' } });
      assert.equal(confirmed.status, 202);
      await waitForRun(base, runId, row => row.status === 'DRAFT_READY');
      const root = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
      pairId = (await readJson(await fetch(`${root}/report-versions`))).versions[0].pairId;
      const view = await readJson(await fetch(`${root}/insight-coding/${pairId}`));
      const index = view.context.input.records.findIndex((record: { text: string }) => record.text === text); assert.ok(index >= 0);
      const adoption = await readJson(await post(base, 'insight-coding-adoptions', { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: view.context.binding,
        rules: { ruleId: 'synthetic-model-http', revision: 1, question: 'What is explicitly said?', inclusionRule: 'Readable exact records only', adjudicationRule: 'Keep uncertainty pending', corpora: [] } }));
      modelRequest = { contractVersion: 'insight-model-request-v1', requestKey: randomUUID(), adoptionId: adoption.evidenceId, previousProposalId: null, recordIndexes: [index] };
      const before = databaseDigest(fixture.databasePath);
      assert.equal((await model(base, {}, false)).status, 401);
      assert.equal((await model(base, { ...modelRequest, actorId: 'spoof' })).status, 400);
      assert.equal((await model(base, { ...modelRequest, recordIndexes: [index, index] })).status, 400);
      assert.equal((await model(base, { ...modelRequest, recordIndexes: [99999] })).status, 400);
      const wrongOrigin = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/insight-coding-model-proposals`,
        { method: 'POST', headers: { ...ownerHeaders(base), Origin: 'https://wrong-origin.invalid' }, body: JSON.stringify(modelRequest) });
      assert.equal(wrongOrigin.status, 403);
      const disabled = await model(base); assert.equal(disabled.status, 200);
      const output = await readJson(disabled); assertValidContract(output, 'insightModel');
      assert.deepEqual(output, { contractVersion: 'insight-model-response-v1', status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' });
      assert.equal(databaseDigest(fixture.databasePath), before); assert.equal(calls, 0);
    });
    const originalReports = inspectDb(reader => reader.prepare('SELECT * FROM analysis_research_automation_outputs ORDER BY run_id, report_kind').all());
    await withApi(fixture, true, async (base, application) => {
      const first = await model(base); assert.equal(first.status, 201, await first.clone().text());
      proposed = await readJson(first); assertValidContract(proposed, 'insightModel'); assert.equal(proposed.status, 'PROPOSED');
      assert.equal(proposed.proposal.kind, 'PROPOSAL'); assert.equal(proposed.proposal.exactRetry, false); assert.equal(calls, 1);
      for (const secret of ['owner:research', 'sha256', 'artifact', modelConfiguration.cliproxy.apiKey, 'systemText', fixture.root])
        assert.equal(JSON.stringify(proposed).includes(secret), false);
      const beforeRetry = databaseDigest(fixture.databasePath);
      const retry = await model(base); assert.equal(retry.status, 200);
      assert.deepEqual(await readJson(retry), { ...proposed, proposal: { ...proposed.proposal, exactRetry: true } });
      assert.equal(databaseDigest(fixture.databasePath), beforeRetry); assert.equal(calls, 1);
      assert.equal((await model(base, { ...modelRequest, requestKey: randomUUID() })).status, 409, 'stale predecessor is safe conflict');
      assert.equal(calls, 1);
      assert.equal(inspectDb(reader => (reader.prepare("SELECT COUNT(*) AS n FROM analysis_insight_coding_evidence WHERE kind='RECEIPT'").get() as { n: number }).n), 0);
      assert.deepEqual(inspectDb(reader => reader.prepare('SELECT * FROM analysis_research_automation_outputs ORDER BY run_id, report_kind').all()), originalReports);
      interrupted = { ...modelRequest, requestKey: randomUUID(), previousProposalId: proposed.proposal.evidenceId };
      hang = true;
      const received = new Promise<void>(resolve => { onCall = resolve; });
      const pending = model(base, interrupted);
      await received;
      await application.close();
      const response = await pending; assert.equal(response.status, 200);
      const output = await readJson(response); assertValidContract(output, 'insightModel'); assert.equal(output.status, 'DISPATCH_UNKNOWN');
      assert.equal(calls, 2);
      assert.equal(inspectDb(reader => (reader.prepare("SELECT COUNT(*) AS n FROM analysis_research_automation_ai_executions WHERE state='DISPATCHING'").get() as { n: number }).n), 0);
    }, undefined, undefined, modelConfiguration);
    await withApi(fixture, true, async base => {
      const before = databaseDigest(fixture.databasePath);
      const replay = await readJson(await model(base)); assertValidContract(replay, 'insightModel');
      assert.deepEqual(replay, { ...proposed, proposal: { ...proposed.proposal, exactRetry: true } });
      const unknown = await readJson(await model(base, interrupted)); assertValidContract(unknown, 'insightModel'); assert.equal(unknown.status, 'DISPATCH_UNKNOWN');
      assert.equal(databaseDigest(fixture.databasePath), before); assert.equal(calls, 2, 'disabled transport still replays without another model request');
    });
  } finally { gateway.closeAllConnections(); await closeServer(gateway); }
});

test('OWNER Insight coding round-trips over HTTP with exact source context, retries and a report revision', { timeout: 120_000 }, async () => {
  const fixture = await createFixture();
  const product = 'thạch dừa';
  const texts = [`Tôi đã mua ${product} rồi dùng. Tôi muốn nhỏ hơn nhưng hiện còn to.`, `Tôi đã dùng ${product}, muốn nhỏ hơn.`, 'Tôi đã mua sản phẩm, chưa nêu chủ đề.'];
  const seedDb = openDatabase({ databasePath: fixture.databasePath }).db;
  try {
    await seedNativeDamiPackage(new SourcePackageService({ db: seedDb, artifactStore: new ContentAddressedArtifactStore(fixture.artifactRoot) }), {
      rawRows: texts.map((comment, index) => ({ type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: `synthetic-coding-${index}`, comment, rating_star: 5 })),
    });
  } finally { seedDb.close(); }
  const otherId = '99999999-9999-4999-8999-999999999999';
  const codingRows = () => {
    const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
    try { return db.prepare('SELECT * FROM analysis_insight_coding_evidence ORDER BY evidence_id').all(); } finally { db.close(); }
  };
  let runId = ''; let pairId = ''; let fullSha = ''; let view: Record<string, any> = {};
  await withApi(fixture, true, async base => {
    const awaiting = await startAndWaitForScope(base, randomUUID());
    runId = awaiting.runId;
    const apiRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const ownerRoot = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const post = (action: string, body: unknown, authorized = true) => fetch(`${ownerRoot}/${action}`, { method: 'POST', headers: ownerHeaders(base, authorized),
      body: typeof body === 'string' ? body : JSON.stringify(body) });
    const readView = async (pair = pairId) => {
      const response = await fetch(`${apiRoot}/insight-coding/${pair}`);
      assert.equal(response.status, 200, await response.clone().text());
      const output = await readJson(response); assertValidContract(output, 'insightView'); return output;
    };
    const mutation = async (response: Response, status: number, kind: string) => {
      assert.equal(response.status, status, await response.clone().text());
      const output = await readJson(response); assertValidContract(output, 'insightMutation');
      assert.equal(output.kind, kind); assert.equal(output.exactRetry, status === 200);
      return output;
    };
    const confirmed = await post('confirm-scope', { ...confirmBody(randomUUID(), awaiting.revision), contractVersion: 'research-automation-confirm-v2',
      exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'AUTO_REUSE' } });
    assert.equal(confirmed.status, 202, await confirmed.clone().text());
    await waitForRun(base, runId, run => run.status === 'DRAFT_READY');
    pairId = (await readJson(await fetch(`${apiRoot}/report-versions`))).versions[0].pairId;
    const originalInsight = await (await fetch(`${apiRoot}/report-versions/${pairId}/reports/insight`)).text();

    const initial = await readView();
    assert.deepEqual(initial.evidence, [], 'an uncoded pair is an empty verified history');
    assert.equal(initial.context.binding.pairId, pairId); assert.equal(initial.context.binding.runId, runId);
    const records = initial.context.input.records as { text: string | null }[];
    const [first, second, third] = texts.map(text => records.findIndex(record => record.text === text)) as [number, number, number];
    assert.ok(first >= 0 && second >= 0 && third >= 0, 'all retained native records are exact coding context');
    const span = (recordIndex: number, quote: string) => locatedSpan(records[recordIndex]!.text!, quote);
    const provenance = { basis: 'PENDING_AI', coderRole: 'synthetic proposal', adjudication: null, disagreement: null };
    const rules = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: initial.context.binding,
      rules: { ruleId: 'synthetic-http-codes', revision: 1, question: 'Which explicit source-local statements occur?', inclusionRule: 'All three retained synthetic records',
        adjudicationRule: 'Leave unresolved disagreements pending', corpora: ['I10', 'I13'].map(sectionId => {
          const phrase = sectionId === 'I10' ? 'nhỏ hơn' : product;
          return { sectionId, recordIndexes: [first, second, third, first], question: 'Which literal references occur?', unit: 'source-native record',
            period: 'Synthetic retained sample', frame: 'Three supplied records', channel: 'synthetic review', inclusionRule: 'All supplied records',
            membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
            codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: first, firstSpan: span(first, phrase) }] }, assignments: [], dispositions: [] };
        }) } };

    // Authentication precedes route scope, body parsing and every source read.
    const untouched = databaseDigest(fixture.databasePath);
    for (const root of [ownerRoot, `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${otherId}`]) {
      for (const action of ['insight-coding-adoptions', 'insight-coding-proposals', 'insight-coding-literal-proposals', 'insight-coding-receipts']) {
        const response = await fetch(`${root}/${action}`, { method: 'POST', headers: ownerHeaders(base, false), body: JSON.stringify(rules) });
        assert.equal(response.status, 401);
      }
    }
    for (const spoof of [{ actorId: 'owner:spoofed' }, { actorRole: 'OWNER' }, { owner: { actorId: 'owner:spoofed', role: 'OWNER' } }]) {
      const response = await post('insight-coding-adoptions', { ...rules, ...spoof });
      assert.equal(response.status, 400, 'caller-supplied actor fields are rejected, never trusted');
    }
    const padded = JSON.stringify({ ...rules, padding: 'x'.repeat(20 * 1024) });
    assert.equal((await post('insight-coding-adoptions', padded)).status, 400, 'coding bodies use the owner 8 MiB bound');
    assert.equal((await post('confirm-scope', padded)).status, 413, 'unrelated request caps are unchanged');
    assert.equal((await post('insight-coding-adoptions', JSON.stringify({ ...rules, padding: 'x'.repeat(8 * 1024 * 1024) }))).status, 413);
    assert.deepEqual(codingRows(), []);
    assert.equal(databaseDigest(fixture.databasePath), untouched);

    const adoption = await mutation(await post('insight-coding-adoptions', rules), 201, 'ADOPTION');
    assert.deepEqual(Object.keys(adoption).sort(), ['contractVersion', 'evidenceId', 'exactRetry', 'kind']);
    const adoptedRows = codingRows();
    assert.deepEqual(await mutation(await post('insight-coding-adoptions', rules), 200, 'ADOPTION'), { ...adoption, exactRetry: true });
    assert.deepEqual(codingRows(), adoptedRows, 'exact retry writes nothing');
    const changed = await post('insight-coding-adoptions', { ...rules, rules: { ...rules.rules, question: 'A different question?' } });
    assert.equal(changed.status, 409); assert.equal((await readJson(changed)).error.code, 'revision_conflict');

    const literalRequest = { contractVersion: 'insight-coding-literal-propose-v1', requestKey: randomUUID(), adoptionId: adoption.evidenceId, previousProposalId: null };
    assert.equal((await post('insight-coding-literal-proposals', { ...literalRequest, accepted: true })).status, 400);
    const literal = await mutation(await post('insight-coding-literal-proposals', literalRequest), 201, 'PROPOSAL');
    const literalRows = codingRows();
    assert.deepEqual(await mutation(await post('insight-coding-literal-proposals', literalRequest), 200, 'PROPOSAL'), { ...literal, exactRetry: true });
    assert.deepEqual(codingRows(), literalRows);
    const generated = (await readView()).evidence.find((item: Record<string, any>) => item.evidenceId === literal.evidenceId).request.annotations;
    assert.deepEqual(generated.i06, []); assert.deepEqual(generated.i09, [], 'literal matching never invents relationships');
    assert.equal(generated.i13Mentions.length, 2);
    for (const corpus of generated.corpora) {
      assert.equal(corpus.assignments.length, 2, 'duplicate corpus membership does not duplicate candidate spans');
      assert.equal(corpus.dispositions.find((row: Record<string, any>) => row.recordIndex === third).state, 'PENDING', 'no literal match is not evidence of semantic absence');
      assert.ok(corpus.assignments.every((row: Record<string, any>) => row.provenance.basis === 'PENDING_AI'));
    }
    assert.ok(!literalRows.some((row: any) => row.kind === 'RECEIPT'), 'generation does not accept any candidate');
    assert.equal(await (await fetch(`${apiRoot}/report-versions/${pairId}/reports/insight`)).text(), originalInsight);
    assert.equal((await post('insight-coding-literal-proposals', { ...literalRequest, requestKey: randomUUID() })).status, 409, 'generation requires the explicit current predecessor');

    const proposal = { contractVersion: 'insight-coding-propose-v1', requestKey: randomUUID(), adoptionId: adoption.evidenceId, previousProposalId: literal.evidenceId,
      annotations: { i06: [], i09: [], i13Mentions: [], corpora: [0, 1].map(corpusIndex => ({ corpusIndex,
        assignments: [first, second].map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex, corpusIndex === 0 ? 'nhỏ hơn' : product), provenance })),
        dispositions: [first, second, third].map(recordIndex => ({ recordIndex, state: recordIndex === third ? 'UNCODED' : 'CODED', provenance })) })) } };
    const proposed = await mutation(await post('insight-coding-proposals', proposal), 201, 'PROPOSAL');
    const forged = structuredClone(proposal) as Record<string, any>;
    forged.requestKey = randomUUID(); forged.previousProposalId = proposed.evidenceId;
    forged.annotations.corpora[0].assignments[0].span.quote = 'Invented source text';
    const proposedRows = codingRows();
    assert.equal((await post('insight-coding-proposals', forged)).status, 400, 'a quote outside the exact source is caller input, not stored corruption');
    assert.deepEqual(codingRows(), proposedRows);

    // The digest an acceptance names comes from the reloaded view, not client memory.
    const proposalSha256 = (await readView()).evidence.find((item: Record<string, any>) => item.evidenceId === proposed.evidenceId).sha256;
    const accept = (requestKey: string, corpora: unknown[]) => ({ contractVersion: 'insight-coding-accept-v1', requestKey, proposalId: proposed.evidenceId, proposalSha256,
      selection: { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [], corpora } });
    assert.equal((await post('insight-coding-receipts', accept(randomUUID(), [{ corpusIndex: 0, assignments: [99], dispositions: [0] }]))).status, 400);
    const partial = await mutation(await post('insight-coding-receipts', accept(randomUUID(), [{ corpusIndex: 0, assignments: [0], dispositions: [0] }])), 201, 'RECEIPT');
    const completeRequest = accept(randomUUID(), [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [0, 1], dispositions: [0, 1, 2] })));
    const full = await mutation(await post('insight-coding-receipts', completeRequest), 201, 'RECEIPT');
    const acceptedRows = codingRows();
    assert.deepEqual(await mutation(await post('insight-coding-receipts', completeRequest), 200, 'RECEIPT'), { ...full, exactRetry: true });
    assert.deepEqual(codingRows(), acceptedRows);

    view = await readView();
    assert.deepEqual(view.context, initial.context);
    assert.deepEqual(view.evidence.map((item: Record<string, any>) => item.kind), ['ADOPTION', 'PROPOSAL', 'PROPOSAL', 'RECEIPT', 'RECEIPT'], 'the full corpus, not only accepted rows');
    assert.deepEqual(new Set(view.evidence.map((item: Record<string, any>) => item.evidenceId)), new Set([adoption, literal, proposed, partial, full].map(item => item.evidenceId)));
    assert.deepEqual(view.evidence[0].request, rules);
    assert.doesNotMatch(JSON.stringify(view), /owner:research|actorId|actorRole/, 'views carry no actor identity');
    fullSha = view.evidence.find((item: Record<string, any>) => item.evidenceId === full.evidenceId).sha256;

    const revision = { contractVersion: 'automation-insight-report-revision-v1', requestKey: randomUUID(), previousPairId: pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      acceptedInsight: { proposalId: proposed.evidenceId, receiptIds: [full.evidenceId, partial.evidenceId] } };
    const queuedResponse = await post('report-revisions', revision);
    assert.equal(queuedResponse.status, 202, await queuedResponse.clone().text());
    const queued = await readJson(queuedResponse); assertValidContract(queued, 'revisionReceipt');
    let nextPairId: string | undefined;
    for (let poll = 0; poll < 200; poll++) {
      const attempt = await readJson(await fetch(`${apiRoot}/report-attempts/${queued.attemptId}`));
      if (attempt.state === 'COMMITTED') { nextPairId = attempt.pairId; break; }
      assert.ok(['QUEUED', 'RUNNING'].includes(attempt.state), JSON.stringify(attempt));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(nextPairId && nextPairId !== pairId);
    assert.match(await (await fetch(`${apiRoot}/report-versions/${nextPairId}/reports/insight`)).text(), /Mã hóa lời nguồn/);
    assert.equal(await (await fetch(`${apiRoot}/report-versions/${pairId}/reports/insight`)).text(), originalInsight);

    // History stays readable; it never implies that new admission is current.
    assert.deepEqual(await readView(), view);
    const stale = await post('insight-coding-adoptions', { ...rules, requestKey: randomUUID() });
    assert.equal(stale.status, 409); assert.equal((await readJson(stale)).error.code, 'revision_conflict');
    assert.deepEqual(await mutation(await post('insight-coding-receipts', completeRequest), 200, 'RECEIPT'), { ...full, exactRetry: true }, 'historical exact retry survives');
    assert.deepEqual(await mutation(await post('insight-coding-literal-proposals', literalRequest), 200, 'PROPOSAL'), { ...literal, exactRetry: true }, 'literal generation replays the exact historical proposal without accepting or refreshing sources');
    const next = await readView(nextPairId);
    assert.deepEqual(next.evidence, [], 'a new pair does not inherit coding');
    assert.equal(next.context.binding.pairId, nextPairId);

    for (const target of [`${base}/api/workspaces/${otherId}/research-automation/runs/${runId}/insight-coding/${pairId}`,
      `${base}/api/workspaces/${workspaceId}/research-automation/runs/${otherId}/insight-coding/${pairId}`, `${apiRoot}/insight-coding/${'f'.repeat(64)}`, `${apiRoot}/insight-coding/latest`])
      assert.equal((await fetch(target)).status, 404, target);
    const wrongRun = await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${otherId}/insight-coding-adoptions`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify({ ...rules, requestKey: randomUUID() }) });
    assert.equal(wrongRun.status, 404);
    assert.equal((await fetch(`${apiRoot}/insight-coding/${pairId}`, { method: 'POST', headers: ownerHeaders(base), body: '{}' })).status, 405);
  });

  await withApi(fixture, false, async base => {
    const target = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/insight-coding/${pairId}`;
    const before = databaseDigest(fixture.databasePath); const rowsBefore = codingRows();
    const reopened = await fetch(target);
    assert.equal(reopened.status, 200);
    assert.deepEqual(await readJson(reopened), view, 'read-only reopen restores the same verified history');
    assert.equal((await fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/insight-coding-adoptions`,
      { method: 'POST', headers: ownerHeaders(base), body: '{}' })).status, 403);
    const artifactPath = path.join(fixture.artifactRoot, 'sha256', fullSha.slice(0, 2), fullSha);
    const saved = fs.readFileSync(artifactPath);
    fs.writeFileSync(artifactPath, Buffer.from('corrupt synthetic coding'));
    try {
      const failed = await fetch(target);
      assert.equal(failed.status, 500, 'corrupt coding is never shown as an empty or partial list');
      const text = await failed.text();
      assert.deepEqual(JSON.parse(text), { error: { code: 'integrity_error', message: 'Stored research evidence failed verification' } });
      for (const secret of [fullSha, fixture.root, fixture.artifactRoot, ownerToken, 'owner:research', 'SELECT', 'corrupt synthetic']) assert.equal(text.includes(secret), false);
      assert.deepEqual(fs.readFileSync(artifactPath), Buffer.from('corrupt synthetic coding'), 'GET never repairs storage');
    } finally { fs.writeFileSync(artifactPath, saved); }
    assert.deepEqual(await readJson(await fetch(target)), view);
    assert.equal(databaseDigest(fixture.databasePath), before);
    assert.deepEqual(codingRows(), rowsBefore);
  });
});

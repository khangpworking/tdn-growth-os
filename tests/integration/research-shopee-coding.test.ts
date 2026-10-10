import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ShopeeCodingError, ShopeeCodingTransportError, AutomationShopeeCoding } from '../../src/modules/analysis/research-automation/shopee-coding.js';
import { ShopeeCodingContextError } from '../../src/modules/analysis/research-automation/shopee-coding-context.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import type { ShopeeCodingAI } from '../../src/modules/analysis/research-automation/shopee-coding.js';
import { shopeeFixture, workspaceId, runId, fakeShopeeCodingPort, fakeShopeeCodingAi } from '../fixtures/shopee-coding-fixture.js';
import { shopeeCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';

type Fixture = Awaited<ReturnType<typeof shopeeFixture>>;
const CODING_BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };

async function proposeInput(f: Fixture, requestKey: string, recordIndexes?: number[]) {
  const selection = await f.service.readShopeeSamples(f.workspaceId, runId);
  const context = await f.service.readShopeeCodingContext(f.workspaceId, runId);
  assert.deepEqual(context.sample, selection.sample);
  return { contractVersion: 'shopee-coding-propose-v1', requestKey, binding: selection.binding,
    sample: selection.sample, keywordDigest: context.keywordDigest, ...(recordIndexes ? { recordIndexes } : {}) };
}

test('retained U22 sample -> draft coding proposal -> retained read/history/samples/context', async t => {
  const f = await shopeeFixture(t);
  const selection = await f.service.readShopeeSamples(f.workspaceId, runId);
  assert.ok(selection.counts.eligible > 0);
  const port = fakeShopeeCodingPort();
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, randomUUID()), fakeShopeeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  const history = await f.service.listShopeeCodingHistory(workspaceId, runId);
  assert.equal(history.sources.length, 1);
  const source = history.sources[0]!;
  assert.equal(source.proposalId, receipt.proposalId);
  const read = await f.service.readShopeeCoding(workspaceId, runId, source.packageId);
  assert.equal(read.draft.proposalId, receipt.proposalId);
  assert.equal(read.draft.status, 'PROPOSED_AWAITING_REVIEW');
  assert.ok(read.draft.codes.length > 0);
  assert.equal(read.report.proposalId, receipt.proposalId);
  assert.ok(read.report.findings.length > 0);
  for (const code of read.draft.codes) {
    assert.match(code.code, /^[A-Z0-9][A-Z0-9_]{0,79}$/);
    assert.ok(code.citationId >= 1);
  }
  assert.equal(read.citations.length, read.draft.codes.length);
  const publicBytes = canonicalJson({ draft: read.draft, report: read.report, citations: read.citations });
  assert.doesNotMatch(publicBytes, /authorIdentity|keyId|keyCommitment|SYNTHETIC_AUTHOR|SYNTHETIC_PROFILE/);
});

test('invalid source/sample/config/trust refuses before any model dispatch', async t => {
  const f = await shopeeFixture(t);
  const port = fakeShopeeCodingPort();
  const ai = fakeShopeeCodingAi(port);
  const good = await proposeInput(f, randomUUID());
  const cases: [string, unknown, new (...args: never[]) => Error][] = [
    ['wrong run', { ...good, binding: { ...good.binding, runId: randomUUID() } }, ShopeeCodingError],
    ['wrong scope', { ...good, binding: { ...good.binding, scopeSha256: '0'.repeat(64) } }, ShopeeCodingError],
    ['wrong sample', { ...good, sample: { ...good.sample, sampleId: '0'.repeat(64) } }, ShopeeCodingError],
    ['wrong keyword', { ...good, keywordDigest: '0'.repeat(64) }, ResearchAutomationIntegrityError],
    ['ineligible index', { ...good, recordIndexes: [9999] }, ShopeeCodingContextError],
    ['malformed contract', { ...good, contractVersion: 'shopee-coding-propose-v9' }, ResearchAutomationValidationError],
  ];
  for (const [name, input, expected] of cases) {
    await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, input, ai), expected, name);
  }
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, good, null), ShopeeCodingTransportError, 'unconfigured model refuses');
  const misconfigured = fakeShopeeCodingAi(port, { ...shopeeCodingCliproxyConfiguration('synthetic-shopee-coding-model'), modelId: '' });
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, good, misconfigured), ShopeeCodingTransportError, 'misconfigured model refuses pre-write');
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, { ...good, expectedRevision: 9999 }, ai), ResearchAutomationConflictError, 'stale revision refuses');
  assert.equal(port.dispatches(), 0);
});

test('explicit null keyword draft proposes without L9 dependency', async t => {
  const f = await shopeeFixture(t);
  const port = fakeShopeeCodingPort();
  const input = await proposeInput(f, randomUUID());
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, { ...input, keywordDigest: null }, fakeShopeeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  const history = await f.service.listShopeeCodingHistory(workspaceId, runId);
  const read = await f.service.readShopeeCoding(workspaceId, runId, history.sources[0]!.packageId);
  assert.equal(read.draft.keywordDigest, null);
});

test('two real instances racing one key dispatch exactly once; loser observes the claim', async t => {
  const f = await shopeeFixture(t);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let dispatches = 0;
  const blockingPort: NonNullable<ShopeeCodingAI>['port'] = { generateText: async request => {
    dispatches++;
    await gate;
    const input = JSON.parse((request as { userText: string }).userText) as { records: { recordIndex: number; text: string }[] };
    return { text: JSON.stringify({ codes: input.records.slice(0, 1).map(record => {
      const text = record.text.slice(0, 10);
      return { code: 'RACE_0', label: 'đua', recordIndex: record.recordIndex, quote: { text, start: 0, end: text.length } };
    }) }) };
  } };
  const ai = fakeShopeeCodingAi(blockingPort);
  const key = randomUUID();
  const db2 = openDatabase({ databasePath: (f as unknown as { databasePath: string }).databasePath }).db;
  t.after(() => { db2.close(); });
  const artifacts2 = new ContentAddressedArtifactStore((f as unknown as { artifactRoot: string }).artifactRoot);
  const service2 = new ResearchAutomationService({ db: db2, artifactStore: artifacts2,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: db2, artifactStore: artifacts2 })) });
  const first = f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), ai);
  try {
    let observed: string | undefined;
    for (let i = 0; i < 500; i++) {
      const row = f.db.prepare('SELECT state FROM analysis_shopee_coding_executions WHERE request_key=?').get(key) as { state: string } | undefined;
      if (row?.state === 'DISPATCHING') { observed = row.state; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(observed, 'DISPATCHING', 'competitor must observe the durable pre-dispatch claim');
    await assert.rejects(service2.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), ai),
      ShopeeCodingError, 'overlapping same-key instance never dispatches twice');
    assert.equal(dispatches, 1);
  } finally {
    release();
  }
  const winner = await first;
  assert.equal(winner.exactRetry, false);
  const replay = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), ai);
  assert.equal(replay.exactRetry, true);
  assert.equal(replay.proposalId, winner.proposalId);
  assert.equal(dispatches, 1);
});

test('invalid response settles terminally with durable classification; new key recovers', async t => {
  const f = await shopeeFixture(t);
  const variants: [string, (text: string) => string][] = [
    ['malformed json', () => '{not json'],
    ['schema-invalid codes', () => '{"codes":[{"code":"nope"}]}'],
    ['wrong exact quote', () => JSON.stringify({ codes: [{ code: 'Q_0', label: 'sai trích dẫn', recordIndex: 0,
      quote: { text: 'không có trong bản ghi', start: 0, end: 19 } }] })],
  ];
  for (const [name, shape] of variants) {
    let calls = 0;
    const badPort: NonNullable<ShopeeCodingAI>['port'] = { generateText: async request => {
      calls++;
      return { text: shape((request as { userText: string }).userText) };
    } };
    const key = randomUUID();
    await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), fakeShopeeCodingAi(badPort)),
      ShopeeCodingTransportError, `${name} refuses`);
    assert.equal(calls, 1, `${name} dispatched exactly once`);
    const settled = f.db.prepare('SELECT state,validation_status,validation_code FROM analysis_shopee_coding_executions WHERE request_key=?').get(key) as { state: string; validation_status: string; validation_code: string };
    assert.equal(settled.state, 'COMPLETED', `${name} settled`);
    assert.equal(settled.validation_status, 'INVALID', `${name} classified`);
    assert.equal(settled.validation_code, 'SHOPEE_CODING_RESPONSE_INVALID', `${name} coded`);
    assert.equal((await f.service.listShopeeCodingHistory(workspaceId, runId)).sources.length, 0, `${name} published no package`);
    await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), fakeShopeeCodingAi(badPort)),
      ShopeeCodingError, `${name}: same key never dispatches again`);
    assert.equal(calls, 1, `${name}: no redispatch`);
  }
  const port = fakeShopeeCodingPort();
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, randomUUID()), fakeShopeeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
});

test('settlement clock failure after genuine publication leaves unknown output unconsumed; new key recovers', async t => {
  const f = await shopeeFixture(t);
  const port = fakeShopeeCodingPort();
  let failedOnce = false;
  const flakyNow = () => {
    const claimed = f.db.prepare(`SELECT request_key FROM analysis_shopee_coding_executions
      WHERE state='DISPATCHING' ORDER BY created_at LIMIT 1`).get() as { request_key: string } | undefined;
    const stored = claimed && f.db.prepare(`SELECT package_id FROM foundation_source_packages
      WHERE package_key=?`).get(`automation-shopee-coding:${runId}-${claimed.request_key}`);
    if (claimed && stored && !failedOnce) { failedOnce = true; throw new Error('synthetic clock failure at settlement'); }
    return new Date('2026-10-09T00:00:00.000Z');
  };
  const flaky = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now: flakyNow,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })) });
  const key = randomUUID();
  await assert.rejects(flaky.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), fakeShopeeCodingAi(port)),
    ShopeeCodingTransportError, 'settlement failure surfaces as dispatch failure');
  assert.equal(port.dispatches(), 1);
  assert.ok(failedOnce, 'failure genuinely targeted settlement');
  const claim = f.db.prepare('SELECT state,unknown_code,validation_status FROM analysis_shopee_coding_executions WHERE request_key=?').get(key) as { state: string; unknown_code: string; validation_status: null };
  assert.equal(claim.state, 'DISPATCH_UNKNOWN');
  assert.equal(claim.unknown_code, 'TRANSPORT_OUTCOME_AMBIGUOUS');
  assert.equal(claim.validation_status, null);
  assert.equal((await f.service.listShopeeCodingHistory(workspaceId, runId)).sources.length, 0, 'unknown output filtered, not poisoned');
  const pkg = f.db.prepare(`SELECT package_id packageId FROM foundation_source_packages WHERE package_key=?`).get(`automation-shopee-coding:${runId}-${key}`) as { packageId: string };
  await assert.rejects(f.service.readShopeeCoding(workspaceId, runId, pkg.packageId),
    ShopeeCodingError, 'direct read of unknown output refuses');
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, key), fakeShopeeCodingAi(port)),
    ShopeeCodingError, 'unknown key never redispatches');
  assert.equal(port.dispatches(), 1);
  // Unknown-output Reader build refuses from the genuine retained digest pair; zero consumption first.
  const retainedUnknown = await new FoundationSourcePackageReader(new SourcePackageService({ db: f.db, artifactStore: f.artifacts }))
    .readFinalizedSourcePackage(pkg.packageId, { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
  const memberText = (name: string) => retainedUnknown.files.find(file => file.path === name)!.bytes.toString('utf8');
  const owner = { actorId: 'synthetic-owner', role: 'OWNER' as const };
  // The unknown digest pair genuinely reaches the Reader builder and is refused: history lists
  // no source for it, so no revision and zero consumption are recorded.
  const unknownDraft = JSON.parse(memberText('draft-coding.json'));
  const unknownReport = JSON.parse(memberText('cited-synthesis.json'));
  await assert.rejects(f.service.buildShopeeReaderReport(workspaceId, runId, { contractVersion: 'insight-reader-build-shopee-v1',
    reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: readDigest(unknownDraft),
    semanticSha256: readDigest(unknownReport), sourceKind: 'SHOPEE' }, owner),
    ResearchAutomationNotFoundError, 'unknown digest pair builds no Reader report');
  assert.equal((await f.service.readShopeeReportConsumption(workspaceId, runId)).entries.length, 0,
    'unknown output records zero consumption');
  const fresh = randomUUID();
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, fresh), fakeShopeeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 2);
  const read = await f.service.readShopeeCoding(workspaceId, runId,
    (await f.service.listShopeeCodingHistory(workspaceId, runId)).sources[0]!.packageId);
  assert.equal(read.draft.proposalId, receipt.proposalId);
  const built = await f.service.buildShopeeReaderReport(workspaceId, runId, { contractVersion: 'insight-reader-build-shopee-v1',
    reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: memberText('draft-coding.json').length > 0 ? readDigest(read.draft) : '',
    semanticSha256: readDigest(read.report), sourceKind: 'SHOPEE' }, owner);
  assert.equal(built.exactRetry, false);
  assert.equal((await f.service.readShopeeReportConsumption(workspaceId, runId)).entries.length, 1);
  function readDigest(value: unknown): string {
    return createHash('sha256').update(canonicalJson(value)).digest('hex');
  }
});

test('fabricated same-prefix coding package without server origin is refused on retry and read', async t => {
  const f = await shopeeFixture(t);
  const port = fakeShopeeCodingPort();
  const ai = fakeShopeeCodingAi(port);
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, randomUUID()), ai);
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  const freshKey = randomUUID();
  const freshRequest = await proposeInput(f, freshKey);
  const history = await f.service.listShopeeCodingHistory(workspaceId, runId);
  const retained = await new FoundationSourcePackageReader(new SourcePackageService({ db: f.db, artifactStore: f.artifacts }))
    .readFinalizedSourcePackage(history.sources[0]!.packageId, CODING_BUDGET);
  const requestBytes = Buffer.from(canonicalJson(freshRequest));
  const files = new Map(retained.files.map(file => [file.path,
    file.path === 'proposal-request.json' ? requestBytes : Buffer.from(file.bytes)] as const));
  const ordinary = new SourcePackageService({ db: f.db, artifactStore: f.artifacts });
  const fabricated = await ordinary.intake({ contractVersion: '1.0.0',
    packageKey: `automation-shopee-coding:${runId}-${freshKey}`, version: 1,
    sourceLabel: 'Synthetic fabricated coding package', sourceAcquiredAt: null,
    files: [...files].map(([filePath, value]) => ({ path: filePath, sha256: createHash('sha256').update(value).digest('hex'),
      byteSize: value.byteLength,
      mediaType: filePath === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json' : 'application/json',
      evidenceFamily: 'shopee-coding-v1', representationRole: 'derived', independence: 'non_independent',
      providerProvenance: 'operator_supplied_unverified',
      provenanceBasis: 'Synthetic test fabrication without server origin.' })) }, files);
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, freshRequest, ai),
    ShopeeCodingError, 'origin-less retry refused');
  assert.equal(port.dispatches(), 1);
  await assert.rejects(f.service.readShopeeCoding(workspaceId, runId, fabricated.packageId),
    ShopeeCodingError, 'origin-less direct read refused');
  assert.equal(port.dispatches(), 1);
  // A retained package read under a foreign scope binding is refused as well.
  const strict = new AutomationShopeeCoding({ db: f.db,
    packages: new SourcePackageService({ db: f.db, artifactStore: f.artifacts }), artifacts: f.artifacts,
    publish: async <T>(operation: () => Promise<T>): Promise<T> => operation(),
    mutex: async <T>(operation: () => Promise<T>): Promise<T> => operation(),
    keywordDraft: digest => f.service.readSourceKeywordDraft(workspaceId, runId, digest),
    sampleSource: () => { throw new Error('foreign binding must refuse before source replay'); } });
  const foreign = { workspaceId, runId, scopeSha256: '0'.repeat(64),
    sourceSetSha256: (await f.service.readShopeeSamples(workspaceId, runId)).binding.sourceSetSha256,
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } };
  const genuine = history.sources[0]!;
  await assert.rejects(strict.read(foreign, genuine.packageId, genuine.manifestArtifactSha256, genuine.packageContentSha256),
    ShopeeCodingError, 'foreign scope binding refuses retained read');
  assert.equal(port.dispatches(), 1);
});

test('cancelled dispatch records unknown outcome; configless cold reopen stays query-only', async t => {
  const f = await shopeeFixture(t);
  const port = fakeShopeeCodingPort();
  const ai = fakeShopeeCodingAi(port);
  const preempted = new AbortController();
  preempted.abort();
  const preemptedKey = randomUUID();
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, preemptedKey), ai, preempted.signal),
    'pre-admission abort refuses without dispatch or claim');
  assert.equal(port.dispatches(), 0);
  const recovered = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, preemptedKey), ai);
  assert.equal(recovered.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let gated = 0;
  const gatedPort: NonNullable<ShopeeCodingAI>['port'] = { generateText: async request => {
    gated++;
    await gate;
    return port.generateText(request);
  } };
  const controller = new AbortController();
  const cancelledKey = randomUUID();
  const pending = f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, cancelledKey), fakeShopeeCodingAi(gatedPort), controller.signal);
  try {
    let observed: string | undefined;
    for (let i = 0; i < 500; i++) {
      const row = f.db.prepare('SELECT state FROM analysis_shopee_coding_executions WHERE request_key=?').get(cancelledKey) as { state: string } | undefined;
      if (row?.state === 'DISPATCHING') { observed = row.state; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(observed, 'DISPATCHING', 'competitor must observe the durable pre-dispatch claim');
    controller.abort();
  } finally {
    release();
  }
  await assert.rejects(pending, ShopeeCodingTransportError, 'aborted dispatch fails terminally');
  assert.equal(gated, 1);
  const aborted = f.db.prepare('SELECT state,unknown_code FROM analysis_shopee_coding_executions WHERE request_key=?').get(cancelledKey) as { state: string; unknown_code: string };
  assert.equal(aborted.state, 'DISPATCH_UNKNOWN');
  assert.equal(aborted.unknown_code, 'INTERRUPTED_AFTER_CLAIM');
  await assert.rejects(f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, cancelledKey), ai),
    ShopeeCodingError, 'aborted key never redispatches');
  assert.equal(port.dispatches(), 1);
  const history = await f.service.listShopeeCodingHistory(workspaceId, runId);
  assert.equal(history.sources.length, 1);
  const receipt = await f.service.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, randomUUID()), ai);
  assert.equal(receipt.exactRetry, false);
  const coldDbClock = () => { throw new Error('cold read used the clock'); };
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now: coldDbClock,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })) });
  const filesBefore = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  const dbBefore = Buffer.from(f.db.serialize());
  const coldHistory = await cold.listShopeeCodingHistory(workspaceId, runId);
  assert.equal(coldHistory.sources.length, 2);
  const coldSource = coldHistory.sources.find(source => source.proposalId === receipt.proposalId)!;
  const coldRead = await cold.readShopeeCoding(workspaceId, runId, coldSource.packageId);
  assert.equal(coldRead.draft.proposalId, receipt.proposalId);
  assert.equal(coldRead.report.proposalId, receipt.proposalId);
  await assert.rejects(cold.proposeShopeeCoding(workspaceId, runId, await proposeInput(f, randomUUID()), null),
    ShopeeCodingTransportError, 'cold propose without model refuses');
  const filesAfter = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  assert.deepEqual(filesAfter, filesBefore, 'reads wrote no artifacts');
  assert.ok(Buffer.from(f.db.serialize()).equals(dbBefore), 'reads performed no database mutation');
});

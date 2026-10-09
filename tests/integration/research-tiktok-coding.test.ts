import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { TikTokCodingError, TikTokCodingTransportError, AutomationTikTokCoding } from '../../src/modules/analysis/research-automation/tiktok-coding.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { TikTokCodingContextError } from '../../src/modules/analysis/research-automation/tiktok-coding-context.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import type { TikTokCodingAI } from '../../src/modules/analysis/research-automation/tiktok-coding.js';
import { tiktokFixture, workspaceId, runId, fakeCodingPort, fakeCodingAi } from '../fixtures/tiktok-coding-fixture.js';

type Fixture = Awaited<ReturnType<typeof tiktokFixture>>;

function proposeInput(f: Fixture, requestKey: string, recordIndexes?: number[]) {
  assert.equal(f.keyword.contractVersion, 'l9-keyword-list-draft-record-v3');
  assert.ok(f.keyword.sourceSetDigest);
  return { contractVersion: 'tiktok-coding-propose-v1', requestKey,
    binding: { workspaceId, runId, scopeSha256: f.keyword.scopeDigest, sourceSetSha256: f.keyword.sourceSetDigest,
      requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } },
    corpus: { ...f.corpusPackage }, keywordDigest: f.keywordDigest, ...(recordIndexes ? { recordIndexes } : {}) };
}

test('retained keyword-v3 -> S07 corpus -> draft coding proposal -> retained read/history/context', async t => {
  const f = await tiktokFixture(t);
  const port = fakeCodingPort();
  const receipt = await f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, randomUUID()), fakeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  const history = await f.service.listTikTokCodingHistory(workspaceId, runId);
  assert.equal(history.sources.length, 1);
  const source = history.sources[0]!;
  assert.equal(source.proposalId, receipt.proposalId);
  const read = await f.service.readTikTokCoding(workspaceId, runId, source.packageId);
  assert.equal(read.draft.proposalId, receipt.proposalId);
  assert.equal(read.draft.status, 'PROPOSED_AWAITING_REVIEW');
  assert.ok(read.draft.codes.length > 0 && read.draft.codes.length <= 3);
  assert.equal(read.report.proposalId, receipt.proposalId);
  assert.equal(read.report.status, 'PROPOSED_AWAITING_REVIEW');
  assert.ok(read.report.findings.length > 0);
  for (const code of read.draft.codes) {
    assert.match(code.code, /^[A-Z0-9][A-Z0-9_]{0,79}$/);
    assert.ok(code.citationId >= 1);
  }
  assert.equal(read.citations.length, read.draft.codes.length);
  const context = await f.service.readTikTokCodingContext(workspaceId, runId, f.corpusPackage.packageId);
  assert.equal(context.keywordDigest, f.keywordDigest);
  assert.deepEqual(context.corpus, f.corpusPackage);
  assert.deepEqual(context.counts, { eligible: 4, excluded: 4, unclear: 2 });
  const publicBytes = canonicalJson({ draft: read.draft, report: read.report, citations: read.citations });
  assert.doesNotMatch(publicBytes, /authorIdentity|keyId|PRIVATE|998877|776655|665544/);
});

test('invalid source/quote/voice/config/trust refuses before any model dispatch', async t => {
  const f = await tiktokFixture(t);
  const port = fakeCodingPort();
  const ai = fakeCodingAi(port);
  const good = proposeInput(f, randomUUID());
  const cases: [string, unknown, new (...args: never[]) => Error][] = [
    ['wrong run', { ...good, binding: { ...good.binding, runId: randomUUID() } }, TikTokCodingError],
    ['wrong scope', { ...good, binding: { ...good.binding, scopeSha256: '0'.repeat(64) } }, TikTokCodingError],
    ['wrong corpus digest', { ...good, corpus: { ...good.corpus, packageContentSha256: '0'.repeat(64) } }, TikTokCodingError],
    ['wrong keyword', { ...good, keywordDigest: '0'.repeat(64) }, ResearchAutomationIntegrityError],
    ['ineligible index', { ...good, recordIndexes: [9999] }, TikTokCodingContextError],
    ['malformed contract', { ...good, contractVersion: 'tiktok-coding-propose-v9' }, ResearchAutomationValidationError],
  ];
  for (const [name, input, expected] of cases) {
    await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, input, ai), expected, name);
  }
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, good, null), TikTokCodingTransportError, 'unconfigured model refuses');
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, { ...good, expectedRevision: 9999 }, ai), ResearchAutomationConflictError, 'stale revision refuses');
  assert.equal(port.dispatches(), 0);
});

test('two real instances racing one key dispatch exactly once; loser observes the claim', async t => {
  const f = await tiktokFixture(t);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let dispatches = 0;
  const blockingPort: NonNullable<TikTokCodingAI>['port'] = { generateText: async request => {
    dispatches++;
    await gate;
    const input = JSON.parse((request as { userText: string }).userText) as { records: { recordIndex: number; text: string }[] };
    return { text: JSON.stringify({ codes: input.records.slice(0, 1).map(record => {
      const text = record.text.slice(0, 10);
      return { code: 'RACE_0', label: 'đua', recordIndex: record.recordIndex, quote: { text, start: 0, end: text.length } };
    }) }) };
  } };
  const ai = fakeCodingAi(blockingPort);
  const key = randomUUID();
  const db2 = openDatabase({ databasePath: f.databasePath }).db;
  t.after(() => { db2.close(); });
  const service2 = new ResearchAutomationService({ db: db2, artifactStore: new ContentAddressedArtifactStore(f.artifactRoot),
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: db2, artifactStore: new ContentAddressedArtifactStore(f.artifactRoot) })) });
  const first = f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, key), ai);
  try {
    let observed: string | undefined;
    for (let i = 0; i < 500; i++) {
      const row = f.db.prepare('SELECT state FROM analysis_tiktok_coding_executions WHERE request_key=?').get(key) as { state: string } | undefined;
      if (row?.state === 'DISPATCHING') { observed = row.state; break; }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(observed, 'DISPATCHING', 'competitor must observe the durable pre-dispatch claim');
    await assert.rejects(service2.proposeTikTokCoding(workspaceId, runId, proposeInput(f, key), ai),
      TikTokCodingError, 'overlapping same-key instance never dispatches twice');
    assert.equal(dispatches, 1);
  } finally {
    release();
  }
  const winner = await first;
  assert.equal(winner.exactRetry, false);
  const replay = await f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, key), ai);
  assert.equal(replay.exactRetry, true);
  assert.equal(replay.proposalId, winner.proposalId);
  assert.equal(dispatches, 1);
});

test('invalid response settles terminally: same key never redispatches, new key recovers', async t => {
  const f = await tiktokFixture(t);
  let calls = 0;
  const badPort: NonNullable<TikTokCodingAI>['port'] = { generateText: async () => { calls++; return { text: '{"codes":[{"code":"nope"}]}' }; } };
  const key = randomUUID();
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, key), fakeCodingAi(badPort)),
    TikTokCodingTransportError, 'invalid candidates refuse');
  assert.equal(calls, 1);
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, key), fakeCodingAi(badPort)),
    TikTokCodingError, 'same key after INVALID never dispatches again');
  assert.equal(calls, 1);
  // Terminal same-key retry performs no CAS writes, clock reads, publication, or database mutation.
  const claimBefore = f.db.prepare('SELECT * FROM analysis_tiktok_coding_executions WHERE request_key=?').get(key);
  const filesBefore = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  const binding = { workspaceId, runId, scopeSha256: f.keyword.scopeDigest, sourceSetSha256: f.keyword.sourceSetDigest!,
    requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } };
  const strict = new AutomationTikTokCoding({ db: f.db,
    packages: new SourcePackageService({ db: f.db, artifactStore: f.artifacts }), artifacts: f.artifacts,
    now: () => { throw new Error('terminal retry used the clock'); },
    publish: async (): Promise<never> => { throw new Error('terminal retry published'); },
    mutex: async (): Promise<never> => { throw new Error('terminal retry took the mutex'); },
    keywordDraft: digest => f.service.readSourceKeywordDraft(workspaceId, runId, digest),
    replayComments: async (): Promise<never> => { throw new Error('terminal retry replayed comments'); } });
  await assert.rejects(strict.propose(binding, proposeInput(f, key), fakeCodingAi(badPort)), TikTokCodingError,
    'terminal retry refuses before CAS/clock/publication');
  assert.equal(calls, 1);
  assert.deepEqual(f.db.prepare('SELECT * FROM analysis_tiktok_coding_executions WHERE request_key=?').get(key), claimBefore);
  assert.deepEqual((await fs.readdir(f.artifactRoot, { recursive: true })).sort(), filesBefore);
  const port = fakeCodingPort();
  const receipt = await f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, randomUUID()), fakeCodingAi(port));
  assert.equal(receipt.exactRetry, false);
  assert.equal(port.dispatches(), 1);
});

test('cancelled dispatch records unknown outcome; configless cold reopen stays query-only', async t => {
  const f = await tiktokFixture(t);
  const port = fakeCodingPort();
  const ai = fakeCodingAi(port);
  // Pre-admission abort refuses with no dispatch and no claim: the same key stays usable.
  const preempted = new AbortController();
  preempted.abort();
  const preemptedKey = randomUUID();
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, preemptedKey), ai, preempted.signal),
    'pre-admission abort refuses without dispatch or claim');
  assert.equal(port.dispatches(), 0);
  const recovered = await f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, preemptedKey), ai);
  assert.equal(recovered.exactRetry, false);
  assert.equal(port.dispatches(), 1);
  // Mid-dispatch abort after the durable claim settles INTERRUPTED_AFTER_CLAIM: terminal for its key.
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let gated = 0;
  const gatedPort: NonNullable<TikTokCodingAI>['port'] = { generateText: async request => {
    gated++;
    await gate;
    return port.generateText(request);
  } };
  const controller = new AbortController();
  const cancelledKey = randomUUID();
  const pending = f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, cancelledKey), fakeCodingAi(gatedPort), controller.signal);
  for (let i = 0; i < 500; i++) {
    const row = f.db.prepare('SELECT state FROM analysis_tiktok_coding_executions WHERE request_key=?').get(cancelledKey) as { state: string } | undefined;
    if (row?.state === 'DISPATCHING') break;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  controller.abort();
  release();
  await assert.rejects(pending, TikTokCodingTransportError, 'aborted dispatch fails terminally');
  assert.equal(gated, 1);
  const claim = f.db.prepare('SELECT state,unknown_code FROM analysis_tiktok_coding_executions WHERE request_key=?').get(cancelledKey) as { state: string; unknown_code: string };
  assert.equal(claim.state, 'DISPATCH_UNKNOWN');
  assert.equal(claim.unknown_code, 'INTERRUPTED_AFTER_CLAIM');
  await assert.rejects(f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, cancelledKey), ai),
    TikTokCodingError, 'aborted key never redispatches');
  assert.equal(port.dispatches(), 1);
  const history = await f.service.listTikTokCodingHistory(workspaceId, runId);
  assert.equal(history.sources.length, 1);
  const receipt = await f.service.proposeTikTokCoding(workspaceId, runId, proposeInput(f, randomUUID()), ai);
  assert.equal(receipt.exactRetry, false);
  const coldDbClock = () => { throw new Error('cold read used the clock'); };
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now: coldDbClock,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })) });
  const filesBefore = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  const dbBefore = Buffer.from(f.db.serialize());
  const coldHistory = await cold.listTikTokCodingHistory(workspaceId, runId);
  assert.equal(coldHistory.sources.length, 2);
  const coldSource = coldHistory.sources.find(source => source.proposalId === receipt.proposalId)!;
  const coldRead = await cold.readTikTokCoding(workspaceId, runId, coldSource.packageId);
  assert.equal(coldRead.draft.proposalId, receipt.proposalId);
  assert.equal(coldRead.report.proposalId, receipt.proposalId);
  await assert.rejects(cold.proposeTikTokCoding(workspaceId, runId, proposeInput(f, randomUUID()), null),
    TikTokCodingTransportError, 'cold propose without model refuses');
  const filesAfter = (await fs.readdir(f.artifactRoot, { recursive: true })).sort();
  assert.deepEqual(filesAfter, filesBefore, 'reads wrote no artifacts');
  assert.ok(Buffer.from(f.db.serialize()).equals(dbBefore), 'reads performed no database mutation');
});

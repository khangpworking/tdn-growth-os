import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { Bundle } from '../../src/modules/analysis/reader-report/bundle.js';
import { buildInsightReaderTemplate, type InsightReaderPage } from '../../src/modules/analysis/reader-report/insight-template.js';
import { publishInsightFamilyRevision, type InsightFamilyPublish } from '../../src/modules/analysis/research-automation/reader-publish.js';
import { ResearchAutomationConflictError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';

const at = '2026-10-08T00:00:00.000Z';
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

// These rows own only the new module's callback/result contracts and inclusive
// byte boundary. Family adapters, messages and record goldens belong to PR1.
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-c3-module-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: () => new Date(at) }).db;
  const artifactRoot = path.join(root, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const source = await artifacts.put(Buffer.from('{"synthetic":"module source"}'));
  db.prepare(`INSERT INTO artifact_manifests
    (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,'application/json',?,?,'1.0.0','active',?)`)
    .run(source.sha256, source.byteSize, source.relativePath, at, at);
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  const actorId = 'owner:synthetic';
  db.prepare(`INSERT INTO analysis_research_automation_runs
    (run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,reports,start_request_sha256,actor_id,created_at,updated_at)
    VALUES (?,?,1,'DRAFT_READY','CATEGORY','Synthetic','2026-01-01','2026-01-31','INSIGHT',?,?,?,?)`)
    .run(runId, workspaceId, source.sha256, actorId, at, at);
  // A scratch table exercises caller-owned transactional writes without
  // fabricating a TikTok/Shopee consumption receipt.
  db.exec('CREATE TEMP TABLE module_ledger (revision_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)');
  const scope = { keyword: 'Synthetic source', definition: 'Synthetic frozen scope',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } };
  const build: InsightFamilyPublish = {
    family: 'insight', workspaceId, runId, actorId,
    requestKey: '33333333-3333-4333-8333-333333333333', requestSha256: digest('synthetic request'),
    input: { contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1',
      workspaceId, runId, draftPairId: digest('synthetic draft'), semanticSha256: source.sha256,
      sourceReportSha256: source.sha256, frozenStartSha256: source.sha256, frozenScopeSha256: source.sha256,
      sourceRendererVersion: 'automation-report-kit-v19', scope, retainedMethods: [] },
    page: { keyword: scope.keyword, definition: scope.definition, period: scope.requestedPeriod,
      sections: [], findings: { bundle: new Bundle(), findings: [] }, registry: new CitationRegistry() },
    createdAt: () => at,
  };
  const snapshot = () => ({
    revisions: db.prepare('SELECT * FROM analysis_reader_report_revisions ORDER BY revision_id').all(),
    manifests: db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
    ledger: db.prepare('SELECT * FROM module_ledger ORDER BY revision_id').all(),
  });
  const files = async () => (await fs.readdir(artifactRoot, { recursive: true })).sort();
  const ledger = (revisionId: string, createdAt: string) => {
    db.prepare('INSERT INTO module_ledger VALUES (?,?)').run(revisionId, createdAt);
  };
  return { db, artifacts, build, snapshot, files, ledger };
}

// Mutation control: omit the callback or move it before registration/after COMMIT.
test('module ledger callback sees the revision and all manifests inside its transaction', async t => {
  const f = await fixture(t);
  let calls = 0;
  const outcome = await publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, ledger(revisionId, createdAt) {
    calls++;
    assert.equal(f.db.inTransaction, true);
    assert.equal(createdAt, at);
    const row = f.db.prepare('SELECT * FROM analysis_reader_report_revisions WHERE revision_id=?').get(revisionId) as Record<string, string>;
    assert.ok(row, 'revision must already exist when the caller writes its ledger');
    const manifests = f.db.prepare('SELECT sha256 FROM artifact_manifests WHERE sha256 IN (?,?,?,?)')
      .all(row.input_sha256, row.html_sha256, row.metrics_sha256, row.claims_sha256);
    assert.equal(manifests.length, 4);
    f.ledger(revisionId, createdAt);
  } });
  assert.equal(outcome.exactRetry, false);
  if (outcome.exactRetry) assert.fail('expected a first publication');
  assert.equal(calls, 1);
  assert.equal(f.db.inTransaction, false);
  assert.deepEqual(f.snapshot().ledger, [{ revision_id: outcome.revisionId, created_at: at }]);
});

// Mutation control: commit after a callback exception instead of rolling back.
test('module ledger exception rolls back revision, manifests and caller writes; a clean callback commits', async t => {
  const f = await fixture(t), before = f.snapshot();
  const failure = new Error('synthetic caller ledger failure');
  await assert.rejects(publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, ledger(revisionId, createdAt) {
    f.ledger(revisionId, createdAt);
    throw failure;
  } }), error => error === failure);
  assert.equal(f.db.inTransaction, false);
  assert.deepEqual(f.snapshot(), before);
  const outcome = await publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, ledger: f.ledger });
  assert.equal(outcome.exactRetry, false);
  if (outcome.exactRetry) assert.fail('failed publication must not become an exact retry');
  assert.equal(f.snapshot().revisions.length, 1);
  assert.deepEqual(f.snapshot().ledger, [{ revision_id: outcome.revisionId, created_at: at }]);
});

// Mutation control: change the raw retry discriminator/row or remove the SHA guard.
test('module exact retry returns the stored row without clock, ledger or writes; a changed request SHA conflicts', async t => {
  const f = await fixture(t);
  await publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, ledger: f.ledger });
  const stored = f.db.prepare('SELECT * FROM analysis_reader_report_revisions WHERE request_key=?')
    .get(f.build.requestKey) as Record<string, unknown>;
  const row = { ...stored, decision: null, decision_request_key: null, reason: null, decision_actor_id: null, decided_at: null };
  const before = f.snapshot(), files = await f.files(), changes = f.db.prepare('SELECT total_changes() n').get();
  const retry = { ...f.build, createdAt: () => assert.fail('retry must not read the clock'),
    ledger: () => assert.fail('retry must not repeat the ledger callback') };
  assert.deepEqual(await publishInsightFamilyRevision(f.db, f.artifacts, retry), { exactRetry: true, row });
  await assert.rejects(publishInsightFamilyRevision(f.db, f.artifacts, { ...retry, requestSha256: digest('changed synthetic request') }), error => {
    assert.ok(error instanceof ResearchAutomationConflictError);
    assert.equal(error.code, 'request_key_conflict');
    return true;
  });
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(await f.files(), files);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
});

// Mutation control: read the clock before the gate or read it twice on success.
test('module createdAt is called once after a passing gate and never after a failing gate', async t => {
  const f = await fixture(t);
  let clockCalls = 0;
  const createdAt = () => { clockCalls++; return at; };
  await assert.rejects(publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, createdAt,
    page: { ...f.build.page, sections: [{ id: 'I01', body: '<p>NaN</p>', explanation: 'Synthetic invalid rendering' }] },
  }), ResearchAutomationValidationError);
  assert.equal(clockCalls, 0);
  const outcome = await publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, createdAt });
  assert.equal(clockCalls, 1);
  if (outcome.exactRetry) assert.fail('expected a first publication');
  const row = f.db.prepare('SELECT created_at,input_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?')
    .get(outcome.revisionId) as { created_at: string; input_sha256: string };
  assert.equal(row.created_at, at);
  const record = JSON.parse((await f.artifacts.read(row.input_sha256)).toString()) as { createdAt: string };
  assert.equal(record.createdAt, at);
});

// Mutation control: use >= instead of >, or count string characters instead of bytes.
test('module accepts exactly 32 MiB of HTML and refuses one byte more without storing anything', async t => {
  const f = await fixture(t), limit = 32 * 1024 * 1024;
  const section = { id: 'I01' as const, body: '<p>é</p>', explanation: 'Synthetic retained section' };
  const page: InsightReaderPage = { ...f.build.page, sections: [section] };
  const padding = limit - Buffer.byteLength(buildInsightReaderTemplate(page).html);
  // Bounded text nodes avoid unrelated regex stack limits in the real gate.
  const chunk = `<p>${'x'.repeat(8192)}</p>`;
  section.body += chunk.repeat(Math.floor(padding / chunk.length)) + 'x'.repeat(padding % chunk.length);
  assert.equal(Buffer.byteLength(buildInsightReaderTemplate(page).html), limit);
  const oversized: InsightReaderPage = { ...page, sections: [{ ...section, body: section.body + 'x' }] };
  assert.equal(Buffer.byteLength(buildInsightReaderTemplate(oversized).html), limit + 1);
  const before = f.snapshot(), files = await f.files();
  await assert.rejects(publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, page: oversized,
    createdAt: () => assert.fail('oversize refusal must precede the clock'),
    ledger: () => assert.fail('oversize refusal must precede the ledger'),
  }), ResearchAutomationValidationError);
  assert.deepEqual(f.snapshot(), before);
  assert.deepEqual(await f.files(), files);
  const outcome = await publishInsightFamilyRevision(f.db, f.artifacts, { ...f.build, page });
  if (outcome.exactRetry) assert.fail('refused oversize build must leave no retry row');
  const row = f.db.prepare('SELECT html_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?')
    .get(outcome.revisionId) as { html_sha256: string };
  assert.equal((await f.artifacts.read(row.html_sha256)).byteLength, limit);
});

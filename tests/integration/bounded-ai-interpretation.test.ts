import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  AnalysisResultReader,
  InterpretationIdentityConflictError,
  MarketSnapshotInterpretationService,
  MarketSnapshotService,
} from '../../src/modules/analysis/index.js';
import {
  DataPackService,
  FoundationDataPackReader,
  FoundationService,
  canonicalJson,
} from '../../src/modules/foundation/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const fixturePath = path.resolve('tests/fixtures/json-export.synthetic.json');
const promptPath = path.resolve('prompts/analysis/market-snapshot-interpretation-v1.txt');
const priorMigrations = [
  'migrations/0001_foundation.sql',
  'migrations/0002_data_packs.sql',
  'migrations/0003_analysis_results.sql',
];
const expectedMigrationDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
];
const roots: string[] = [];

class FakeGateway implements AiGateway {
  readonly requests: AiGatewayRequest[] = [];
  response: AiGatewayResponse;

  constructor(response: AiGatewayResponse = validResponse()) {
    this.response = response;
  }

  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    this.requests.push(request);
    return this.response;
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function validResponse(): AiGatewayResponse {
  return {
    output: {
      summary: 'The snapshot contains observed period revenue and units sold with explicit coverage.',
      findings: [
        { code: 'observed_revenue', statement: 'Period revenue is present as an observed total.', citations: ['/totals/periodRevenueVndTotal', '/coverage/periodRevenueObservedProductCount'] },
        { code: 'observed_units', statement: 'Units sold are present as an observed total.', citations: ['/totals/periodUnitsSoldTotal'] },
      ],
      uncertainties: ['The snapshot does not establish causal relationships.'],
    },
    providerRequestId: 'fake-request-006',
    usage: { inputTokens: 321, outputTokens: 88 },
    latencyMs: 17,
  };
}

function setup(response: AiGatewayResponse = validResponse(), promptText = fs.readFileSync(promptPath, 'utf8')) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-interpretation-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'analysis.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const foundation = new FoundationService({ db, artifactStore: artifacts, now: () => new Date('2026-09-08T08:00:00.000Z') });
  const packs = new DataPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-08T09:00:00.000Z') });
  const results = new MarketSnapshotService({ db, artifactStore: artifacts, dataPackReader: new FoundationDataPackReader(packs), now: () => new Date('2026-09-08T10:00:00.000Z') });
  const gateway = new FakeGateway(response);
  const configuration = {
    providerId: 'injected:test-provider', modelId: 'synthetic-model-v1',
    promptId: 'analysis:market-snapshot-interpretation', promptVersion: 1,
    promptText, outputSchemaVersion: '1.0.0' as const,
    timeoutMs: 12_000, maxOutputTokens: 600,
  };
  const interpretation = new MarketSnapshotInterpretationService({
    db, artifactStore: artifacts, resultReader: new AnalysisResultReader(results), gateway, configuration,
    now: () => new Date('2026-09-08T11:00:00.000Z'),
  });
  return { root, db, artifacts, foundation, packs, results, gateway, configuration, interpretation };
}

async function createResult(state: ReturnType<typeof setup>) {
  const imported = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const pack = await state.packs.finalize({ contractVersion: '1.0.0', packKey: `analysis:interpretation-${randomUUID()}`, version: 1, purpose: 'Synthetic AI interpretation input.', observationIds: imported.observationIds.map(String) });
  return state.results.calculate({ contractVersion: '1.0.0', dataPackId: pack.packId, calculationKey: 'market_snapshot_v1', calculationVersion: 1 });
}

function request(resultId: string) {
  return { contractVersion: '1.0.0', resultId } as const;
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

test('migration 0004 upgrades version 3 once and migrations 0001-0003 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), expectedMigrationDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-interpretation-migration-'));
  roots.push(root);
  const migrationsDirectory = path.join(root, 'migrations');
  fs.mkdirSync(migrationsDirectory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(migrationsDirectory, path.basename(file)));
  const databasePath = path.join(root, 'analysis.sqlite');
  const versionThree = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(versionThree.migration.applied, [1, 2, 3]);
  assert.equal(versionThree.db.pragma('user_version', { simple: true }), 3n);
  versionThree.db.close();
  fs.copyFileSync('migrations/0004_analysis_interpretations.sql', path.join(migrationsDirectory, '0004_analysis_interpretations.sql'));
  const upgraded = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(upgraded.migration.applied, [4]);
  assert.equal(upgraded.db.pragma('user_version', { simple: true }), 4n);
  upgraded.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory });
  assert.deepEqual(rerun.migration.applied, []);
  assert.equal(rerun.migration.currentVersion, 4);
  rerun.db.close();
});

test('injected gateway receives only verified Result, versioned prompt/schema, limits, and no tools', async () => {
  const state = setup();
  const result = await createResult(state);
  const execution = await state.interpretation.interpret(request(result.resultId));
  assert.equal(state.gateway.requests.length, 1);
  const gatewayRequest = state.gateway.requests[0]!;
  assert.equal(gatewayRequest.runId, execution.interpretationId);
  assert.equal(gatewayRequest.providerId, state.configuration.providerId);
  assert.equal(gatewayRequest.modelId, state.configuration.modelId);
  assert.deepEqual(gatewayRequest.tools, []);
  assert.deepEqual(gatewayRequest.limits, { timeoutMs: 12_000, maxOutputTokens: 600 });
  assert.equal(gatewayRequest.prompt.text, state.configuration.promptText);
  assert.equal(gatewayRequest.prompt.sha256, createHash('sha256').update(state.configuration.promptText).digest('hex'));
  assert.equal(gatewayRequest.input.resultId, result.resultId);
  assert.equal(gatewayRequest.input.resultArtifactSha256, result.resultArtifactSha256);
  assert.equal(gatewayRequest.input.result.resultId, result.resultId);
  assert.equal(gatewayRequest.output.schemaVersion, '1.0.0');
  assert.equal(gatewayRequest.output.jsonSchema.title, 'MarketSnapshotInterpretationOutput');
  assert.equal('prompt' in request(result.resultId), false);
  assert.equal('modelId' in request(result.resultId), false);
  assert.equal('tools' in request(result.resultId), false);

  const replayed = await state.interpretation.replay(execution.interpretationId);
  assert.equal(replayed.sourceResult.resultArtifactSha256, result.resultArtifactSha256);
  assert.equal(replayed.gateway.providerRequestId, 'fake-request-006');
  assert.equal(replayed.gateway.inputTokenCount, 321);
  assert.equal(replayed.output.findings.length, 2);
  assert.equal('recommendation' in replayed.output, false);
  assert.equal('approval' in replayed.output, false);
  assert.equal('action' in replayed.output, false);
  assert.equal(count(state.db, 'analysis_interpretations'), 1n);
  const bytes = await state.artifacts.read(execution.outputArtifactSha256);
  assert.equal(bytes.toString('utf8'), canonicalJson(replayed));
  state.db.close();
});

test('same successful identity is idempotent without a second gateway call and prompt drift conflicts', async () => {
  const state = setup();
  const result = await createResult(state);
  const first = await state.interpretation.interpret(request(result.resultId));
  const artifactsAfterFirst = count(state.db, 'artifact_manifests');
  const second = await state.interpretation.interpret(request(result.resultId));
  assert.equal(second.deduplicated, true);
  assert.equal(second.interpretationId, first.interpretationId);
  assert.equal(state.gateway.requests.length, 1);
  assert.equal(count(state.db, 'analysis_interpretations'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsAfterFirst);

  const driftedGateway = new FakeGateway();
  const drifted = new MarketSnapshotInterpretationService({
    db: state.db, artifactStore: state.artifacts, resultReader: new AnalysisResultReader(state.results), gateway: driftedGateway,
    configuration: { ...state.configuration, promptText: `${state.configuration.promptText}\nDrift.` },
  });
  await assert.rejects(drifted.interpret(request(result.resultId)), InterpretationIdentityConflictError);
  assert.equal(driftedGateway.requests.length, 0);
  state.db.close();
});

test('invalid input or gateway output performs no output write and missing Result never calls gateway', async () => {
  const invalids: unknown[] = [
    { summary: 'Incomplete.', findings: [], uncertainties: [] },
    { ...validResponse().output as object, approval: true },
    { summary: 'Observed.', findings: [{ code: 'bad_pointer', statement: 'Observed.', citations: ['/dataPack/packKey'] }], uncertainties: [] },
    { summary: 'Observed.', findings: [{ code: 'missing_pointer', statement: 'Observed.', citations: ['/ignoredMetricCodes/99'] }], uncertainties: [] },
    { summary: 'Approval is appropriate.', findings: [{ code: 'approval_text', statement: 'Observed.', citations: ['/period/scope'] }], uncertainties: [] },
  ];
  for (const output of invalids) {
    const state = setup({ output });
    const result = await createResult(state);
    const baselineArtifacts = count(state.db, 'artifact_manifests');
    await assert.rejects(state.interpretation.interpret(request(result.resultId)));
    assert.equal(state.gateway.requests.length, 1);
    assert.equal(count(state.db, 'analysis_interpretations'), 0n);
    assert.equal(count(state.db, 'artifact_manifests'), baselineArtifacts);
    state.db.close();
  }

  const missing = setup();
  await assert.rejects(missing.interpretation.interpret(request(randomUUID())), /Analysis Result not found/);
  assert.equal(missing.gateway.requests.length, 0);
  assert.equal(count(missing.db, 'analysis_interpretations'), 0n);
  await assert.rejects(missing.interpretation.interpret({ ...request(randomUUID()), prompt: 'arbitrary' }));
  assert.equal(missing.gateway.requests.length, 0);
  missing.db.close();
});

test('completed interpretation is immutable and replay detects missing, corrupt, noncanonical, and metadata mismatch', async () => {
  const immutable = setup();
  const result = await createResult(immutable);
  const execution = await immutable.interpretation.interpret(request(result.resultId));
  assert.throws(() => immutable.db.prepare('UPDATE analysis_interpretations SET model_id = ? WHERE interpretation_id = ?').run('changed', execution.interpretationId), /analysis_interpretation_immutable/);
  assert.throws(() => immutable.db.prepare('DELETE FROM analysis_interpretations WHERE interpretation_id = ?').run(execution.interpretationId), /analysis_interpretation_immutable/);
  immutable.db.close();

  const missing = setup();
  const missingResult = await createResult(missing);
  const missingExecution = await missing.interpretation.interpret(request(missingResult.resultId));
  await fsp.rm(missing.artifacts.pathForDigest(missingExecution.outputArtifactSha256));
  await assert.rejects(missing.interpretation.replay(missingExecution.interpretationId), /ENOENT/);
  missing.db.close();

  const corrupt = setup();
  const corruptResult = await createResult(corrupt);
  const corruptExecution = await corrupt.interpretation.interpret(request(corruptResult.resultId));
  await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptExecution.outputArtifactSha256), Buffer.from('{}'));
  await assert.rejects(corrupt.interpretation.replay(corruptExecution.interpretationId), ArtifactIntegrityError);
  corrupt.db.close();

  const noncanonical = setup();
  const noncanonicalResult = await createResult(noncanonical);
  const noncanonicalExecution = await noncanonical.interpretation.interpret(request(noncanonicalResult.resultId));
  const original = JSON.parse((await noncanonical.artifacts.read(noncanonicalExecution.outputArtifactSha256)).toString('utf8'));
  const replacement = Buffer.from(JSON.stringify(original, null, 2));
  const replacementDigest = createHash('sha256').update(replacement).digest('hex');
  const replacementPath = noncanonical.artifacts.pathForDigest(replacementDigest);
  await fsp.mkdir(path.dirname(replacementPath), { recursive: true });
  await fsp.writeFile(replacementPath, replacement, { mode: 0o600 });
  noncanonical.db.exec('DROP TRIGGER analysis_interpretations_no_update');
  noncanonical.db.prepare(
    `INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
     VALUES (?, ?, 'application/json', ?, '2026-09-08T11:00:00.000Z', '1.0.0', 'active', '2026-09-08T11:00:00.000Z')`,
  ).run(replacementDigest, replacement.byteLength, `sha256/${replacementDigest.slice(0, 2)}/${replacementDigest}`);
  noncanonical.db.prepare('UPDATE analysis_interpretations SET output_artifact_sha256 = ? WHERE interpretation_id = ?').run(replacementDigest, noncanonicalExecution.interpretationId);
  await assert.rejects(noncanonical.interpretation.replay(noncanonicalExecution.interpretationId), /not canonical JSON/);
  noncanonical.db.close();

  const mismatch = setup();
  const mismatchResult = await createResult(mismatch);
  const mismatchExecution = await mismatch.interpretation.interpret(request(mismatchResult.resultId));
  mismatch.db.exec('DROP TRIGGER analysis_interpretations_no_update');
  mismatch.db.prepare('UPDATE analysis_interpretations SET request_sha256 = ? WHERE interpretation_id = ?').run('0'.repeat(64), mismatchExecution.interpretationId);
  await assert.rejects(mismatch.interpretation.replay(mismatchExecution.interpretationId), InterpretationIdentityConflictError);
  mismatch.db.close();
});

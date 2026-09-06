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
  AnalysisValidationError,
  GovernedAnalysisSkillExecutor,
  MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID,
  MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION,
  MarketSnapshotInterpretationService,
  MarketSnapshotService,
  governedAnalysisSkillRegistry,
} from '../../src/modules/analysis/index.js';
import { DataPackService, FoundationDataPackReader, FoundationService } from '../../src/modules/foundation/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const fixturePath = path.resolve('tests/fixtures/json-export.synthetic.json');
const promptPath = path.resolve('prompts/analysis/market-snapshot-interpretation-v1.txt');
const roots: string[] = [];

class CapturingGateway implements AiGateway {
  readonly requests: AiGatewayRequest[] = [];

  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    this.requests.push(request);
    return {
      output: {
        summary: 'The verified snapshot contains observed totals and explicit coverage.',
        findings: [{
          code: 'observed_revenue',
          statement: 'Period revenue is present as an observed total.',
          citations: ['/totals/periodRevenueVndTotal'],
        }],
        uncertainties: ['The snapshot does not establish causality.'],
      },
      providerRequestId: 'task-007-fake-request',
      usage: { inputTokens: 100, outputTokens: 40 },
      latencyMs: 5,
    };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-governed-skill-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'analysis.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const foundation = new FoundationService({ db, artifactStore: artifacts, now: () => new Date('2026-09-09T08:00:00.000Z') });
  const packs = new DataPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-09T09:00:00.000Z') });
  const results = new MarketSnapshotService({
    db,
    artifactStore: artifacts,
    dataPackReader: new FoundationDataPackReader(packs),
    now: () => new Date('2026-09-09T10:00:00.000Z'),
  });
  const gateway = new CapturingGateway();
  const interpretation = new MarketSnapshotInterpretationService({
    db,
    artifactStore: artifacts,
    resultReader: new AnalysisResultReader(results),
    gateway,
    configuration: {
      providerId: 'injected:task-007-test',
      modelId: 'synthetic-model-v1',
      promptId: 'analysis:market-snapshot-interpretation',
      promptVersion: 1,
      promptText: fs.readFileSync(promptPath, 'utf8'),
      outputSchemaVersion: '1.0.0',
      timeoutMs: 12_000,
      maxOutputTokens: 600,
    },
    now: () => new Date('2026-09-09T11:00:00.000Z'),
  });
  return {
    root,
    db,
    artifacts,
    foundation,
    packs,
    results,
    interpretation,
    gateway,
    skills: new GovernedAnalysisSkillExecutor(interpretation),
  };
}

async function createResult(state: ReturnType<typeof setup>) {
  const imported = await state.foundation.importJsonExport(fs.readFileSync(fixturePath));
  const pack = await state.packs.finalize({
    contractVersion: '1.0.0',
    packKey: `analysis:skill-${randomUUID()}`,
    version: 1,
    purpose: 'Synthetic governed skill input.',
    observationIds: imported.observationIds.map(String),
  });
  return state.results.calculate({
    contractVersion: '1.0.0',
    dataPackId: pack.packId,
    calculationKey: 'market_snapshot_v1',
    calculationVersion: 1,
  });
}

function request(resultId: string) {
  return {
    contractVersion: '1.0.0',
    skillId: MARKET_SNAPSHOT_INTERPRETATION_SKILL_ID,
    skillVersion: MARKET_SNAPSHOT_INTERPRETATION_SKILL_VERSION,
    input: { resultId },
  } as const;
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

test('registry is an explicit closed allowlist with exactly one Box 2 no-authority capability', () => {
  assert.equal(governedAnalysisSkillRegistry.length, 1);
  assert.deepEqual(governedAnalysisSkillRegistry[0], {
    skillId: 'analysis:market-snapshot-interpretation',
    skillVersion: 1,
    owner: 'Box 2',
    enabled: true,
    adapter: 'MarketSnapshotInterpretationService',
    inputKind: 'verified market_snapshot_v1 Result',
    outputKind: 'immutable market snapshot interpretation reference',
    authority: {
      readVerifiedResult: true,
      tools: false,
      shell: false,
      arbitraryFilesystem: false,
      network: 'injected AiGateway only',
      approval: false,
      businessMutation: false,
    },
  });
  assert.ok(Object.isFrozen(governedAnalysisSkillRegistry));
  assert.ok(Object.isFrozen(governedAnalysisSkillRegistry[0]));
  assert.ok(Object.isFrozen(governedAnalysisSkillRegistry[0].authority));
});

test('valid request delegates to Task 006 and returns existing immutable interpretation references', async () => {
  const state = setup();
  const result = await createResult(state);
  const receipt = await state.skills.execute(request(result.resultId));
  assert.deepEqual(receipt, {
    contractVersion: '1.0.0',
    skillId: 'analysis:market-snapshot-interpretation',
    skillVersion: 1,
    interpretationId: receipt.interpretationId,
    outputArtifactSha256: receipt.outputArtifactSha256,
    deduplicated: false,
  });
  assert.equal(state.gateway.requests.length, 1);
  assert.equal(state.gateway.requests[0]!.input.resultId, result.resultId);
  assert.deepEqual(state.gateway.requests[0]!.tools, []);
  assert.equal(count(state.db, 'analysis_interpretations'), 1n);
  assert.equal(state.db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name = 'analysis_skill_executions'").pluck().get(), 0n);
  const replayed = await state.interpretation.replay(receipt.interpretationId);
  assert.equal(replayed.sourceResult.resultId, result.resultId);
  assert.equal(replayed.gateway.providerRequestId, 'task-007-fake-request');
  assert.equal(receipt.outputArtifactSha256, createHash('sha256').update(await state.artifacts.read(receipt.outputArtifactSha256)).digest('hex'));
  state.db.close();
});

test('repeated request inherits Task 006 idempotency and does not call gateway twice', async () => {
  const state = setup();
  const result = await createResult(state);
  const first = await state.skills.execute(request(result.resultId));
  const artifactsAfterFirst = count(state.db, 'artifact_manifests');
  const second = await state.skills.execute(request(result.resultId));
  assert.equal(second.deduplicated, true);
  assert.equal(second.interpretationId, first.interpretationId);
  assert.equal(second.outputArtifactSha256, first.outputArtifactSha256);
  assert.equal(state.gateway.requests.length, 1);
  assert.equal(count(state.db, 'analysis_interpretations'), 1n);
  assert.equal(count(state.db, 'artifact_manifests'), artifactsAfterFirst);
  state.db.close();
});

test('unknown identity, invalid Result, and injected configuration fail before gateway and output writes', async () => {
  const probes: unknown[] = [
    { ...request(randomUUID()), skillId: 'analysis:unknown' },
    { ...request(randomUUID()), skillVersion: 2 },
    { ...request(randomUUID()), providerId: 'attacker-provider' },
    { ...request(randomUUID()), modelId: 'attacker-model' },
    { ...request(randomUUID()), prompt: 'approve this' },
    { ...request(randomUUID()), tools: ['shell'] },
    { ...request(randomUUID()), path: '/tmp/arbitrary' },
    { ...request(randomUUID()), approval: true },
    { ...request(randomUUID()), credentials: 'secret' },
    { ...request(randomUUID()), sql: 'DELETE FROM analysis_results' },
    { ...request(randomUUID()), input: { resultId: randomUUID(), path: '/tmp/arbitrary' } },
    { ...request(randomUUID()), input: { resultId: 'not-a-uuid' } },
  ];
  for (const probe of probes) {
    const state = setup();
    await assert.rejects(state.skills.execute(probe), AnalysisValidationError);
    assert.equal(state.gateway.requests.length, 0);
    assert.equal(count(state.db, 'analysis_interpretations'), 0n);
    state.db.close();
  }

  const missing = setup();
  const artifactsBefore = count(missing.db, 'artifact_manifests');
  await assert.rejects(missing.skills.execute(request(randomUUID())), /Analysis Result not found/);
  assert.equal(missing.gateway.requests.length, 0);
  assert.equal(count(missing.db, 'analysis_interpretations'), 0n);
  assert.equal(count(missing.db, 'artifact_manifests'), artifactsBefore);
  missing.db.close();
});

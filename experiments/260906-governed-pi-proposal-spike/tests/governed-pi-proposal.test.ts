import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  AnalysisResearchEvidenceAuditReader,
  AnalysisResearchEvidenceIndexResultReader,
  ResearchEvidenceAuditService,
  ResearchEvidenceIndexService,
} from '../../../src/modules/analysis/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../../src/platform/ai/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
} from '../../../src/modules/foundation/index.js';
import { AnalysisBackedProposalService } from '../../../src/modules/orchestrator/index.js';
import { ContentAddressedArtifactStore } from '../../../src/platform/artifacts/index.js';
import { openDatabase } from '../../../src/platform/db/index.js';
import { buildBoundedRequest, runGovernedProposalSpike, SPIKE_LIMITS } from '../prototype/adapter.js';
import { buildPiRpcLaunch, PI_DENY_FLAGS } from '../prototype/pi-launch.js';
import { PiRpcProposalRuntime } from '../prototype/pi-rpc-runtime.js';
import { StrictLfJsonlParser } from '../prototype/strict-jsonl.js';
import type { BoundedPiProposalRequest, DisposableProposalBoundary, VerifiedFixtureInput } from '../prototype/types.js';

const roots: string[] = [];
const fakeExecutable = path.resolve('experiments/260906-governed-pi-proposal-spike/fake-pi-rpc.mjs');
const promptText = fs.readFileSync('experiments/260906-governed-pi-proposal-spike/prototype/prompt-v1.txt', 'utf8');

class AuditGateway implements AiGateway {
  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    const documents = (request.input.result as { documents: Array<{ segments: Array<{ citationPointer: string }> }> }).documents;
    const first = documents[0]!.segments[0]!.citationPointer;
    return {
      output: {
        summary: 'Bản kiểm toán tổng hợp ngoại tuyến.',
        claims: [
          { code: 'duoc_ho_tro', claimText: 'Doanh thu tăng.', claimType: 'factual', assessment: 'supported', reasoning: 'Nguồn hỗ trợ.', claimCitations: [first], supportingCitations: [first], contradictingCitations: [], uncertainty: 'Phạm vi nguồn hạn chế.' },
          { code: 'bi_mau_thuan', claimText: 'Không có tăng trưởng.', claimType: 'factual', assessment: 'contradicted', reasoning: 'Nguồn mâu thuẫn.', claimCitations: [first], supportingCitations: [], contradictingCitations: [first], uncertainty: 'Phạm vi nguồn hạn chế.' },
          { code: 'hon_hop', claimText: 'Tăng trưởng bền vững.', claimType: 'inference', assessment: 'mixed', reasoning: 'Tín hiệu hai chiều.', claimCitations: [first], supportingCitations: [first], contradictingCitations: [first], uncertainty: 'Cần thêm dữ liệu.' },
          { code: 'chua_du', claimText: 'Xu hướng sẽ tiếp tục.', claimType: 'inference', assessment: 'insufficient_evidence', reasoning: 'Chưa đủ bằng chứng.', claimCitations: [first], supportingCitations: [], contradictingCitations: [], uncertainty: 'Thiếu dữ liệu tương lai.' },
        ],
        unansweredQuestions: [],
        overallAssessment: 'supported_but_incomplete',
        limitations: ['Chỉ dùng dữ liệu tổng hợp ngoại tuyến.'],
      },
      providerRequestId: 'offline-task-012-audit',
      usage: { inputTokens: 1, outputTokens: 1 },
      latencyMs: 1,
    };
  }
}

interface Harness {
  readonly root: string;
  readonly db: Database.Database;
  readonly fixture: VerifiedFixtureInput;
  readonly boundary: DisposableProposalBoundary;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

async function harness(): Promise<Harness> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-pi-spike-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'proposal.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db, artifactStore: artifacts });
  const packs = new ResearchPackService({ db, artifactStore: artifacts });
  const indexes = new ResearchEvidenceIndexService({ db, artifactStore: artifacts, researchPackReader: new FoundationResearchPackReader(packs) });
  const audits = new ResearchEvidenceAuditService({
    db,
    artifactStore: artifacts,
    resultReader: new AnalysisResearchEvidenceIndexResultReader(indexes),
    gateway: new AuditGateway(),
    configuration: {
      providerId: 'injected:task-012-offline', modelId: 'synthetic-audit-v1',
      promptId: 'analysis:research-evidence-audit', promptVersion: 1,
      promptText: fs.readFileSync('prompts/analysis/research-evidence-audit-v1.txt', 'utf8'),
      outputSchemaVersion: '1.0.0', timeoutMs: 1_000, maxOutputTokens: 1_000,
    },
  });
  const imported = await documents.importManualDocument({
    contractVersion: '1.0.0',
    source: { sourceId: `manual:pi-spike-${randomUUID()}`, sourceType: 'manual', displayName: 'Nguồn tổng hợp Task 012' },
    ingestion: { idempotencyKey: randomUUID(), acquiredAt: '2026-09-06T00:00:00.000Z', mediaType: 'text/plain', evidenceGrade: { grade: 'synthetic', basis: 'Dữ liệu tổng hợp ngoại tuyến.' } },
    document: { documentType: 'report', title: 'Báo cáo tổng hợp Task 012', sourceLocator: 'manual:task-012-offline', languageTag: 'vi', rightsStatus: 'permitted', rightsBasis: 'Dữ liệu kiểm thử.' },
  }, Buffer.from('Báo cáo tổng hợp ghi nhận doanh thu tăng.\n', 'utf8'));
  const pack = await packs.finalize({ contractVersion: '1.0.0', packKey: `research:pi-spike-${randomUUID()}`, version: 1, purpose: 'Task 012 offline fixture.', documentIds: [imported.documentId] });
  const index = await indexes.calculate({ contractVersion: '1.0.0', researchPackId: pack.packId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 });
  const audit = await audits.audit({ contractVersion: '1.0.0', resultId: index.resultId });
  const auditReader = new AnalysisResearchEvidenceAuditReader(audits);
  const verifiedAudit = await auditReader.readVerifiedResearchEvidenceAudit(audit.auditId);
  const proposals = new AnalysisBackedProposalService({
    db, artifactStore: artifacts, auditReader,
    configuration: { producerId: 'experiment:governed-pi-proposal', producerVersion: 1 },
  });
  let cleaned = false;
  const boundary: DisposableProposalBoundary = {
    async submitAndReplay(submission) {
      const receipt = await proposals.submit(submission);
      const replayed = await proposals.replay(receipt.proposalId);
      assert.equal(replayed.state, 'PROPOSED');
      assert.equal(replayed.proposalId, receipt.proposalId);
      assert.equal(replayed.sourceAudit.auditId, audit.auditId);
      return receipt;
    },
    async cleanup() {
      if (cleaned) return;
      cleaned = true;
      db.close();
      await fsp.rm(root, { recursive: true, force: true });
    },
  };
  return {
    root, db, boundary,
    fixture: {
      verifiedAudit,
      proposalKey: 'task_012_offline_review', proposalVersion: 1,
      objective: { code: 'review_evidence', statement: 'Chuẩn bị hồ sơ để con người rà soát bằng chứng.' },
    },
  };
}

function runtime(provider: string, overrides: Partial<{ maxStdoutBytes: number; maxStderrBytes: number }> = {}) {
  return new PiRpcProposalRuntime({
    executable: fakeExecutable, provider, model: 'fake-model',
    maxStdoutBytes: overrides.maxStdoutBytes ?? SPIKE_LIMITS.maxStdoutBytes,
    maxStderrBytes: overrides.maxStderrBytes ?? SPIKE_LIMITS.maxStderrBytes,
  });
}

function withTimeout(request: BoundedPiProposalRequest, timeoutMs: number): BoundedPiProposalRequest {
  return { ...request, limits: { ...request.limits, timeoutMs } };
}

test('fixed launch is shell-free, environment-minimal, and retains every deny flag', () => {
  const launch = buildPiRpcLaunch({ executable: fakeExecutable, provider: 'fake-valid', model: 'fake-model' });
  assert.equal(launch.options.shell, false);
  assert.deepEqual(launch.args.slice(0, 2), ['--mode', 'rpc']);
  for (const flag of PI_DENY_FLAGS) assert.equal(launch.args.filter((arg) => arg === flag).length, 1);
  assert.deepEqual(Object.keys(launch.options.env).sort(), ['CI', 'NO_COLOR', 'PATH']);
});

test('valid offline child output passes Task 011 submit and replay, then removes the disposable database', async () => {
  const state = await harness();
  const result = await runGovernedProposalSpike({ fixture: state.fixture, promptText, runtime: runtime('fake-valid'), disposableBoundary: state.boundary });
  assert.equal(result.measurements.schemaPass, true);
  assert.equal(result.measurements.evidenceSemanticPass, true);
  assert.equal(result.measurements.inventedClaimCodeCount, 0);
  assert.equal(result.measurements.forbiddenAuthorityFieldCount, 0);
  assert.equal(result.measurements.repairTurns, 0);
  assert.equal(result.measurements.disposableCleanup, true);
  assert.equal(fs.existsSync(state.root), false);
});

test('one invalid output gets exactly one repair; a second invalid output fails and still cleans up', async () => {
  const repaired = await harness();
  const result = await runGovernedProposalSpike({ fixture: repaired.fixture, promptText, runtime: runtime('fake-repair'), disposableBoundary: repaired.boundary });
  assert.equal(result.measurements.repairTurns, 1);
  assert.equal(fs.existsSync(repaired.root), false);

  const rejected = await harness();
  await assert.rejects(
    runGovernedProposalSpike({ fixture: rejected.fixture, promptText, runtime: runtime('fake-invalid'), disposableBoundary: rejected.boundary }),
    /after one repair turn/,
  );
  assert.equal(fs.existsSync(rejected.root), false);
});

test('timeout aborts and waits for child cleanup before rejecting', async () => {
  const state = await harness();
  const request = withTimeout(buildBoundedRequest(state.fixture, promptText), 50);
  await assert.rejects(runtime('fake-timeout').generate(request), /wall-clock timeout/);
  await state.boundary.cleanup();
  assert.equal(fs.existsSync(state.root), false);
});

test('CRLF protocol records are accepted end to end', async () => {
  const state = await harness();
  const result = await runGovernedProposalSpike({ fixture: state.fixture, promptText, runtime: runtime('fake-crlf'), disposableBoundary: state.boundary });
  assert.equal(result.measurements.schemaPass, true);
  assert.equal(result.measurements.evidenceSemanticPass, true);
  assert.equal(fs.existsSync(state.root), false);
});

test('LF and CRLF preserve U+2028 and U+2029 inside JSON strings across byte chunks', () => {
  for (const eol of ['\n', '\r\n']) {
    const records: unknown[] = [];
    const parser = new StrictLfJsonlParser(1024, (record) => records.push(record));
    const expected = { text: 'before\u2028middle\u2029after' };
    const bytes = Buffer.from(`${JSON.stringify(expected)}${eol}`, 'utf8');
    for (const byte of bytes) parser.push(Uint8Array.of(byte));
    parser.end();
    assert.deepEqual(records, [expected]);
  }
});

test('parser still rejects malformed JSON, invalid UTF-8, oversized data, and incomplete frames', () => {
  const parse = (maxBytes = 1024) => new StrictLfJsonlParser(maxBytes, () => undefined);

  const malformed = parse();
  assert.throws(() => malformed.push(Buffer.from('not-json\n')), /Malformed RPC JSONL record/);

  const invalidUtf8 = parse();
  assert.throws(() => invalidUtf8.push(Uint8Array.of(0xc3, 0x28)), /not valid UTF-8/);

  const oversized = parse(4);
  assert.throws(() => oversized.push(Buffer.from('{}\r\n\n')), /JSONL byte limit/);

  const incomplete = parse();
  incomplete.push(Buffer.from('{"ok":true}'));
  assert.throws(() => incomplete.end(), /partial JSONL record/);
});

test('malformed, partial, duplicate, and premature protocol records fail closed', async () => {
  for (const [scenario, message] of [
    ['fake-malformed', /Malformed RPC JSONL record/],
    ['fake-partial', /partial JSONL record/],
    ['fake-duplicate', /Duplicate prompt response/],
    ['fake-premature', /exited before a valid settled result/],
  ] as const) {
    const state = await harness();
    const request = buildBoundedRequest(state.fixture, promptText);
    await assert.rejects(runtime(scenario).generate(request), message);
    await state.boundary.cleanup();
    assert.equal(fs.existsSync(state.root), false);
  }
});

test('input, assistant output, stdout, and stderr bounds fail closed', async () => {
  const state = await harness();
  const request = buildBoundedRequest(state.fixture, promptText);
  await assert.rejects(runtime('fake-oversized').generate(request), /output byte limit/);
  await assert.rejects(runtime('fake-valid', { maxStdoutBytes: 10 }).generate(request), /JSONL byte limit/);
  await assert.rejects(runtime('fake-stderr', { maxStderrBytes: 10 }).generate(request), /stderr byte limit/);
  await state.boundary.cleanup();
  assert.equal(fs.existsSync(state.root), false);

  const tooLarge = { ...request, prompt: { ...request.prompt, text: 'x'.repeat(request.limits.maxInputBytes) } };
  await assert.rejects(runtime('fake-valid').generate(tooLarge), /input byte limit/);
});

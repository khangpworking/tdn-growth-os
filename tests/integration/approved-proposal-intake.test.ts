import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { ApprovedProposalIntakeRequest } from '../../contracts/flow/approved-proposal-intake-request.generated.js';
import type { AnalysisBackedProposalSubmission } from '../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import {
  AnalysisResearchEvidenceAuditReader,
  AnalysisResearchEvidenceIndexResultReader,
  ResearchEvidenceAuditService,
  ResearchEvidenceIndexService,
} from '../../src/modules/analysis/index.js';
import {
  ApprovedProposalIntakeIdentityConflictError,
  ApprovedProposalIntakeService,
  FlowAuthorizedPlanReader,
  FlowValidationError,
  type ApprovedProposalIntakeConfiguration,
} from '../../src/modules/flow/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
  canonicalJson,
} from '../../src/modules/foundation/index.js';
import {
  GovernedProposalDecisionService,
  GovernanceProposalDecisionReader,
  PROPOSAL_REVIEW_CAPABILITY,
  PROPOSAL_REVIEW_POLICY_ID,
  type GovernedProposalDecisionReader,
} from '../../src/modules/governance/index.js';
import {
  AnalysisBackedProposalService,
  OrchestratorAnalysisBackedProposalReader,
} from '../../src/modules/orchestrator/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
const promptPath = path.resolve('prompts/analysis/research-evidence-audit-v1.txt');
const priorMigrations = [
  'migrations/0001_foundation.sql', 'migrations/0002_data_packs.sql', 'migrations/0003_analysis_results.sql',
  'migrations/0004_analysis_interpretations.sql', 'migrations/0005_research_documents.sql',
  'migrations/0006_analysis_research_results.sql', 'migrations/0007_analysis_research_audits.sql',
  'migrations/0008_orchestrator_proposals.sql', 'migrations/0009_governance_proposal_decisions.sql',
] as const;
const priorDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
  'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592',
  '241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88',
  '18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b',
  '285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848',
  'f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439',
] as const;

class AuditGateway implements AiGateway {
  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    const segments = (request.input.result as { documents: Array<{ segments: Array<{ citationPointer: string }> }> }).documents[0]!.segments;
    const first = segments[0]!.citationPointer;
    const second = segments[1]!.citationPointer;
    return {
      output: {
        summary: 'Bản kiểm toán tổng hợp cho intake.',
        claims: [
          { code: 'duoc_ho_tro', claimText: 'Doanh thu tăng.', claimType: 'factual', assessment: 'supported', reasoning: 'Có bằng chứng hỗ trợ.', claimCitations: [first], supportingCitations: [second], contradictingCitations: [], uncertainty: 'Phạm vi nguồn hạn chế.' },
          { code: 'bi_mau_thuan', claimText: 'Không có tăng trưởng.', claimType: 'factual', assessment: 'contradicted', reasoning: 'Có bằng chứng mâu thuẫn.', claimCitations: [first], supportingCitations: [], contradictingCitations: [second], uncertainty: 'Chỉ đánh giá trong gói.' },
        ],
        unansweredQuestions: [], overallAssessment: 'supported_but_incomplete', limitations: ['Chỉ dùng dữ liệu tổng hợp.'],
      },
      providerRequestId: 'task-014-prerequisite-fake', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1,
    };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-approved-intake-')); roots.push(root);
  const databasePath = path.join(root, 'runtime', 'flow.sqlite');
  const { db } = openDatabase({ databasePath });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db, artifactStore: artifacts, now: () => new Date('2026-09-15T07:00:00.000Z') });
  const packs = new ResearchPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-15T08:00:00.000Z') });
  const indexes = new ResearchEvidenceIndexService({ db, artifactStore: artifacts, researchPackReader: new FoundationResearchPackReader(packs), now: () => new Date('2026-09-15T09:00:00.000Z') });
  const audits = new ResearchEvidenceAuditService({
    db, artifactStore: artifacts, resultReader: new AnalysisResearchEvidenceIndexResultReader(indexes), gateway: new AuditGateway(),
    configuration: { providerId: 'injected:task-014-prerequisite', modelId: 'synthetic-audit-v1', promptId: 'analysis:research-evidence-audit', promptVersion: 1, promptText: fs.readFileSync(promptPath, 'utf8'), outputSchemaVersion: '1.0.0', timeoutMs: 1_000, maxOutputTokens: 1_000 },
    now: () => new Date('2026-09-15T10:00:00.000Z'),
  });
  const proposals = new AnalysisBackedProposalService({
    db, artifactStore: artifacts, auditReader: new AnalysisResearchEvidenceAuditReader(audits),
    configuration: { producerId: 'orchestrator:direct-submission', producerVersion: 1 },
    now: () => new Date('2026-09-15T11:00:00.000Z'),
  });
  const proposalReader = new OrchestratorAnalysisBackedProposalReader(proposals);
  const decisions = new GovernedProposalDecisionService({
    db, artifactStore: artifacts, proposalReader,
    configuration: { policyId: PROPOSAL_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PROPOSAL_REVIEW_CAPABILITY },
    now: () => new Date('2026-09-15T12:00:00.000Z'),
  });
  const decisionReader = new GovernanceProposalDecisionReader(decisions);
  const configuration = { producerId: 'flow:approved-proposal-intake', producerVersion: 1 } as const;
  const createIntake = (
    reader: GovernedProposalDecisionReader = decisionReader,
    config: ApprovedProposalIntakeConfiguration = configuration,
  ) => new ApprovedProposalIntakeService({
    db, artifactStore: artifacts, decisionReader: reader, configuration: config,
    now: () => new Date('2026-09-15T13:00:00.000Z'),
  });
  return { root, databasePath, db, artifacts, documents, packs, indexes, audits, proposals, decisions, decisionReader, configuration, createIntake };
}

async function createProposal(state: ReturnType<typeof setup>) {
  const imported = await state.documents.importManualDocument({
    contractVersion: '1.0.0', source: { sourceId: `manual:intake-${randomUUID()}`, sourceType: 'manual', displayName: 'Nguồn tổng hợp Task 014' },
    ingestion: { idempotencyKey: randomUUID(), acquiredAt: '2026-09-15T06:00:00.000Z', mediaType: 'text/plain', evidenceGrade: { grade: 'synthetic', basis: 'Dữ liệu tổng hợp do tác giả tạo.' } },
    document: { documentType: 'report', title: 'Báo cáo tổng hợp Task 014', sourceLocator: 'manual:synthetic-task-014', languageTag: 'vi', rightsStatus: 'permitted', rightsBasis: 'Tác giả tạo cho kiểm thử.' },
  }, Buffer.from('Báo cáo cho rằng doanh thu tăng.\nSố liệu tổng hợp ghi nhận doanh thu tăng.\n', 'utf8'));
  const pack = await state.packs.finalize({ contractVersion: '1.0.0', packKey: `research:intake-${randomUUID()}`, version: 1, purpose: 'Synthetic Task 014 prerequisite.', documentIds: [imported.documentId] });
  const index = await state.indexes.calculate({ contractVersion: '1.0.0', researchPackId: pack.packId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 });
  const audit = await state.audits.audit({ contractVersion: '1.0.0', resultId: index.resultId });
  const submission: AnalysisBackedProposalSubmission = {
    contractVersion: '1.0.0', proposalKey: `intake_${randomUUID().replaceAll('-', '_')}`, proposalVersion: 1,
    proposalType: 'research_evidence_review_v1', sourceAuditId: audit.auditId,
    objective: { code: 'review_growth', statement: 'Chuẩn bị hồ sơ để con người xem xét.' },
    proposal: {
      title: 'Đề xuất intake tổng hợp', summary: 'Đưa hồ sơ vào cổng xem xét.', rationale: 'Bằng chứng cần được xem xét.',
      evidenceLinks: [
        { claimCode: 'duoc_ho_tro', use: 'support', note: 'Bằng chứng hỗ trợ.' },
        { claimCode: 'bi_mau_thuan', use: 'risk', note: 'Rủi ro mâu thuẫn.' },
      ], openQuestions: ['Cần thêm nguồn nào?'],
    }, requestedNextStep: 'request_human_review',
  };
  return state.proposals.submit(submission);
}

async function approve(state: ReturnType<typeof setup>, proposalId: string) {
  return state.decisions.decide({
    contractVersion: '1.0.0', proposalId, decisionVersion: 1, action: 'APPROVE',
    rationale: 'Con người đã xem xét và chấp thuận tạo plan shell.', expectedPreviousState: 'PROPOSED',
  }, {
    actorId: 'human:reviewer-014', roleSnapshot: 'Người xem xét được ứng dụng xác minh',
    capabilities: new Set([PROPOSAL_REVIEW_CAPABILITY]),
  });
}

function request(proposalId: string, decisionId: string, planKey = 'approved_growth_intake'): ApprovedProposalIntakeRequest {
  return {
    contractVersion: '1.0.0', planKey, planType: 'approved_proposal_intake_v1',
    sourceProposalId: proposalId, approvedDecisionId: decisionId, requestedNextStep: 'define_manual_tasks',
  };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

function mode(filePath: string): number { return fs.statSync(filePath).mode & 0o777; }

test('migration 0010 upgrades version 9 once and migrations 0001-0009 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), priorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-intake-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'intake.sqlite');
  const nine = openDatabase({ databasePath, migrationsDirectory: directory }); assert.equal(nine.migration.currentVersion, 9); nine.db.close();
  fs.copyFileSync('migrations/0010_flow_authorized_plans.sql', path.join(directory, '0010_flow_authorized_plans.sql'));
  const ten = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(ten.migration.applied, [10]); assert.equal(ten.migration.currentVersion, 10); ten.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 10); rerun.db.close();
});

test('exact current APPROVED decision creates one canonical immutable AUTHORIZED_PLAN shell and reader result', async () => {
  const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId); const service = state.createIntake();
  const receipt = await service.intake(request(proposal.proposalId, decision.decisionId));
  assert.equal(receipt.state, 'AUTHORIZED_PLAN'); assert.equal(receipt.deduplicated, false); assert.equal(count(state.db, 'flow_authorized_plans'), 1n);
  const plan = await new FlowAuthorizedPlanReader(service).readVerifiedAuthorizedPlan(receipt.planId);
  assert.equal(plan.planKey, 'approved_growth_intake'); assert.equal(plan.state, 'AUTHORIZED_PLAN'); assert.equal(plan.createdAt, '2026-09-15T13:00:00.000Z');
  assert.equal(plan.sourceProposal.proposalId, proposal.proposalId); assert.equal(plan.sourceProposal.proposalArtifactSha256, proposal.proposalArtifactSha256);
  assert.equal(plan.authorization.decisionId, decision.decisionId); assert.equal(plan.authorization.decisionArtifactSha256, decision.decisionArtifactSha256);
  assert.deepEqual(plan.producer, state.configuration); assert.equal(plan.requestedNextStep, 'define_manual_tasks');
  assert.equal(plan.requestSha256, createHash('sha256').update(canonicalJson(request(proposal.proposalId, decision.decisionId))).digest('hex'));
  assert.deepEqual(Object.keys(plan).sort(), ['authorization', 'contractVersion', 'createdAt', 'planId', 'planKey', 'planType', 'producer', 'requestSha256', 'requestedNextStep', 'sourceProposal', 'state']);
  assert.doesNotMatch(JSON.stringify(plan), /summary|rationale|evidenceLinks|command|schedule|workItem|actionPayload/i);
  state.db.close();
});

test('PROPOSED, HOLD, REJECTED, wrong decision/proposal, and malformed readers reject before writes', async () => {
  const cases: Array<(state: ReturnType<typeof setup>, proposalId: string) => Promise<GovernedProposalDecisionReader>> = [
    async (state) => state.decisionReader,
    async (state, proposalId) => { await state.decisions.decide({ contractVersion: '1.0.0', proposalId, decisionVersion: 1, action: 'HOLD', rationale: 'Cần xem xét thêm.', expectedPreviousState: 'PROPOSED' }, { actorId: 'human:reviewer-014', roleSnapshot: 'Reviewer', capabilities: new Set([PROPOSAL_REVIEW_CAPABILITY]) }); return state.decisionReader; },
    async (state, proposalId) => { await state.decisions.decide({ contractVersion: '1.0.0', proposalId, decisionVersion: 1, action: 'REJECT', rationale: 'Không chấp thuận.', expectedPreviousState: 'PROPOSED' }, { actorId: 'human:reviewer-014', roleSnapshot: 'Reviewer', capabilities: new Set([PROPOSAL_REVIEW_CAPABILITY]) }); return state.decisionReader; },
  ];
  for (const makeReader of cases) {
    const state = setup(); const proposal = await createProposal(state); const reader = await makeReader(state, proposal.proposalId); const before = count(state.db, 'artifact_manifests');
    await assert.rejects(state.createIntake(reader).intake(request(proposal.proposalId, randomUUID())), FlowValidationError);
    assert.equal(count(state.db, 'flow_authorized_plans'), 0n); assert.equal(count(state.db, 'artifact_manifests'), before); state.db.close();
  }
  const state = setup(); const proposal = await createProposal(state); const approved = await approve(state, proposal.proposalId); const verified = await state.decisionReader.readEffectiveDecision(proposal.proposalId);
  const malformed: GovernedProposalDecisionReader[] = [
    { async readEffectiveDecision() { return { ...verified, proposalId: randomUUID() } as any; } },
    { async readEffectiveDecision() { return { ...verified, extra: 'bad' } as any; } },
    { async readEffectiveDecision() { return { proposalId: proposal.proposalId, effectiveState: 'APPROVED' } as any; } },
    { async readEffectiveDecision() { return null as any; } },
  ];
  for (const reader of malformed) await assert.rejects(state.createIntake(reader).intake(request(proposal.proposalId, approved.decisionId)), FlowValidationError);
  await assert.rejects(state.createIntake().intake(request(proposal.proposalId, randomUUID())), /exact current effective decision/);
  const other = await createProposal(state);
  await assert.rejects(state.createIntake().intake(request(other.proposalId, approved.decisionId)), FlowValidationError);
  assert.equal(count(state.db, 'flow_authorized_plans'), 0n); state.db.close();
});

test('untrusted request cannot inject state, lineage, producer, authorization, work, command, or action fields', async () => {
  const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId); const service = state.createIntake();
  const before = count(state.db, 'artifact_manifests');
  const forbidden = ['state', 'planId', 'createdAt', 'proposalArtifactSha256', 'decisionArtifactSha256', 'producer', 'actor', 'policy', 'tasks', 'command', 'schedule', 'jobs', 'tools', 'actionPayload', 'provider', 'pi'];
  for (const field of forbidden) await assert.rejects(service.intake({ ...request(proposal.proposalId, decision.decisionId), [field]: 'attacker' }), FlowValidationError);
  assert.equal(count(state.db, 'flow_authorized_plans'), 0n); assert.equal(count(state.db, 'artifact_manifests'), before); state.db.close();
});

test('exact retry deduplicates without another artifact; changed key/decision/producer identity conflicts', async () => {
  const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId); const service = state.createIntake(); const value = request(proposal.proposalId, decision.decisionId);
  const first = await service.intake(value); const artifacts = count(state.db, 'artifact_manifests'); const retry = await service.intake(value);
  assert.equal(retry.deduplicated, true); assert.equal(retry.planId, first.planId); assert.equal(count(state.db, 'artifact_manifests'), artifacts);
  await assert.rejects(service.intake({ ...value, planKey: 'changed_plan_key' }), ApprovedProposalIntakeIdentityConflictError);
  await assert.rejects(service.intake({ ...value, approvedDecisionId: randomUUID() }), FlowValidationError);
  await assert.rejects(state.createIntake(state.decisionReader, { ...state.configuration, producerVersion: 2 }).intake(value), ApprovedProposalIntakeIdentityConflictError);
  state.db.close();
});

test('reader decision values are snapshotted before artifact writes', async () => {
  const state = setup(); const proposal = await createProposal(state); const approved = await approve(state, proposal.proposalId);
  const effective = await state.decisionReader.readEffectiveDecision(proposal.proposalId);
  assert.ok('decision' in effective);
  const mutable: any = structuredClone(effective);
  let release!: () => void;
  const originalPut = state.artifacts.put.bind(state.artifacts);
  const gate = new Promise<void>((resolve) => { release = resolve; });
  (state.artifacts as any).put = async (bytes: Uint8Array) => { await gate; return originalPut(bytes); };
  const reader: GovernedProposalDecisionReader = { async readEffectiveDecision() { return mutable; } };
  const pending = state.createIntake(reader).intake(request(proposal.proposalId, approved.decisionId));
  await new Promise((resolve) => setImmediate(resolve));
  mutable.decision.actor.actorId = 'human:attacker'; mutable.decision.proposal.proposalArtifactSha256 = 'f'.repeat(64);
  release(); const plan = await pending; const replayed = await state.createIntake().replay(plan.planId);
  assert.equal(replayed.authorization.actor.actorId, 'human:reviewer-014'); assert.equal(replayed.sourceProposal.proposalArtifactSha256, proposal.proposalArtifactSha256);
  state.db.close();
});

test('plan rows are immutable and Task 011 proposal plus Task 013 decision remain byte-for-byte unchanged', async () => {
  const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId);
  const proposalRow = state.db.prepare('SELECT * FROM orchestrator_proposals WHERE proposal_id = ?').get(proposal.proposalId);
  const decisionRow = state.db.prepare('SELECT * FROM governance_proposal_decisions WHERE decision_id = ?').get(decision.decisionId);
  const proposalBytes = await state.artifacts.read(proposal.proposalArtifactSha256); const decisionBytes = await state.artifacts.read(decision.decisionArtifactSha256);
  const plan = await state.createIntake().intake(request(proposal.proposalId, decision.decisionId));
  assert.throws(() => state.db.prepare('UPDATE flow_authorized_plans SET state = state WHERE plan_id = ?').run(plan.planId), /flow_authorized_plan_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_authorized_plans WHERE plan_id = ?').run(plan.planId), /flow_authorized_plan_immutable/);
  assert.deepEqual(state.db.prepare('SELECT * FROM orchestrator_proposals WHERE proposal_id = ?').get(proposal.proposalId), proposalRow);
  assert.deepEqual(state.db.prepare('SELECT * FROM governance_proposal_decisions WHERE decision_id = ?').get(decision.decisionId), decisionRow);
  assert.ok((await state.artifacts.read(proposal.proposalArtifactSha256)).equals(proposalBytes)); assert.ok((await state.artifacts.read(decision.decisionArtifactSha256)).equals(decisionBytes));
  state.db.close();
});

test('replay detects missing, corrupt, noncanonical, metadata, authorization, producer, and source-reader mismatch', async () => {
  const create = async () => { const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId); const service = state.createIntake(); const plan = await service.intake(request(proposal.proposalId, decision.decisionId)); return { state, proposal, decision, service, plan }; };
  const missing = await create(); await fsp.rm(missing.state.artifacts.pathForDigest(missing.plan.planArtifactSha256)); await assert.rejects(missing.service.replay(missing.plan.planId), /ENOENT/); missing.state.db.close();
  const corrupt = await create(); await fsp.writeFile(corrupt.state.artifacts.pathForDigest(corrupt.plan.planArtifactSha256), '{}'); await assert.rejects(corrupt.service.replay(corrupt.plan.planId), ArtifactIntegrityError); corrupt.state.db.close();
  const metadata = await create(); metadata.state.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', metadata.plan.planArtifactSha256); await assert.rejects(metadata.service.replay(metadata.plan.planId), /manifest metadata mismatch/); metadata.state.db.close();
  const noncanonical = await create(); const parsed = JSON.parse((await noncanonical.state.artifacts.read(noncanonical.plan.planArtifactSha256)).toString()); const bytes = Buffer.from(JSON.stringify(parsed, null, 2)); const digest = createHash('sha256').update(bytes).digest('hex'); await fsp.mkdir(path.dirname(noncanonical.state.artifacts.pathForDigest(digest)), { recursive: true }); await fsp.writeFile(noncanonical.state.artifacts.pathForDigest(digest), bytes, { mode: 0o600 }); noncanonical.state.db.exec('DROP TRIGGER flow_authorized_plans_no_update'); noncanonical.state.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,'2026-09-15T13:00:00.000Z','1.0.0','active','2026-09-15T13:00:00.000Z')`).run(digest, bytes.byteLength, `sha256/${digest.slice(0, 2)}/${digest}`); noncanonical.state.db.prepare('UPDATE flow_authorized_plans SET plan_artifact_sha256 = ? WHERE plan_id = ?').run(digest, noncanonical.plan.planId); await assert.rejects(noncanonical.service.replay(noncanonical.plan.planId), /not canonical JSON/); noncanonical.state.db.close();
  const authorization = await create(); authorization.state.db.exec('DROP TRIGGER flow_authorized_plans_no_update'); authorization.state.db.prepare('UPDATE flow_authorized_plans SET authorization_actor_id = ? WHERE plan_id = ?').run('human:other', authorization.plan.planId); await assert.rejects(authorization.service.replay(authorization.plan.planId), /does not match immutable metadata/); authorization.state.db.close();
  const producer = await create(); await assert.rejects(producer.state.createIntake(producer.state.decisionReader, { ...producer.state.configuration, producerVersion: 2 }).replay(producer.plan.planId), /does not match immutable metadata/); producer.state.db.close();
  const source = await create(); const effective = await source.state.decisionReader.readEffectiveDecision(source.proposal.proposalId); const badReader: GovernedProposalDecisionReader = { async readEffectiveDecision() { return { ...effective, proposalId: randomUUID() } as any; } }; await assert.rejects(source.state.createIntake(badReader).replay(source.plan.planId), /wrong proposal/); source.state.db.close();
});

test('Flow source has no direct Box 3/5 SQL and POSIX database, WAL/SHM, proposal, decision, and plan artifacts are 0600', async () => {
  const source = fs.readFileSync('src/modules/flow/approved-proposal-intake-service.ts', 'utf8');
  assert.doesNotMatch(source, /orchestrator_proposals|governance_proposal_decisions|FROM\s+(?:orchestrator_|governance_)|JOIN\s+(?:orchestrator_|governance_)/i);
  assert.doesNotMatch(source, /AiGateway|child_process|fetch\(|https?:\/\/|\bspawn\b|\bexec\b|\bshell\b|n8n/i);
  const state = setup(); const proposal = await createProposal(state); const decision = await approve(state, proposal.proposalId); const plan = await state.createIntake().intake(request(proposal.proposalId, decision.decisionId));
  state.db.pragma('wal_checkpoint(PASSIVE)');
  if (process.platform !== 'win32') for (const file of [state.databasePath, `${state.databasePath}-wal`, `${state.databasePath}-shm`, state.artifacts.pathForDigest(proposal.proposalArtifactSha256), state.artifacts.pathForDigest(decision.decisionArtifactSha256), state.artifacts.pathForDigest(plan.planArtifactSha256)]) assert.equal(mode(file), 0o600, `${file} must be 0600`);
  state.db.close();
});

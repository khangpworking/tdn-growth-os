import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { GovernedProposalReviewRequest } from '../../contracts/governance/governed-proposal-review-request.generated.js';
import type { AnalysisBackedProposalSubmission } from '../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import {
  AnalysisResearchEvidenceAuditReader,
  AnalysisResearchEvidenceIndexResultReader,
  ResearchEvidenceAuditService,
  ResearchEvidenceIndexService,
} from '../../src/modules/analysis/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
  canonicalJson,
} from '../../src/modules/foundation/index.js';
import {
  GovernedProposalDecisionIdentityConflictError,
  GovernedProposalDecisionService,
  GovernanceProposalDecisionReader,
  GovernanceValidationError,
  PROPOSAL_REVIEW_CAPABILITY,
  PROPOSAL_REVIEW_POLICY_ID,
  type GovernedProposalReviewConfiguration,
  type TrustedProposalReviewActorContext,
} from '../../src/modules/governance/index.js';
import {
  AnalysisBackedProposalService,
  OrchestratorAnalysisBackedProposalReader,
  type AnalysisBackedProposalReader,
} from '../../src/modules/orchestrator/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
const promptPath = path.resolve('prompts/analysis/research-evidence-audit-v1.txt');
const priorMigrations = [
  'migrations/0001_foundation.sql',
  'migrations/0002_data_packs.sql',
  'migrations/0003_analysis_results.sql',
  'migrations/0004_analysis_interpretations.sql',
  'migrations/0005_research_documents.sql',
  'migrations/0006_analysis_research_results.sql',
  'migrations/0007_analysis_research_audits.sql',
  'migrations/0008_orchestrator_proposals.sql',
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
] as const;

class AuditGateway implements AiGateway {
  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    const segments = (request.input.result as { documents: Array<{ segments: Array<{ citationPointer: string }> }> }).documents[0]!.segments;
    const first = segments[0]!.citationPointer;
    const second = segments[1]!.citationPointer;
    return {
      output: {
        summary: 'Bản kiểm toán tổng hợp cho quyết định xem xét.',
        claims: [
          { code: 'duoc_ho_tro', claimText: 'Doanh thu tăng.', claimType: 'factual', assessment: 'supported', reasoning: 'Có bằng chứng hỗ trợ.', claimCitations: [first], supportingCitations: [second], contradictingCitations: [], uncertainty: 'Phạm vi nguồn hạn chế.' },
          { code: 'bi_mau_thuan', claimText: 'Không có tăng trưởng.', claimType: 'factual', assessment: 'contradicted', reasoning: 'Có bằng chứng mâu thuẫn.', claimCitations: [first], supportingCitations: [], contradictingCitations: [second], uncertainty: 'Chỉ đánh giá trong gói.' },
        ],
        unansweredQuestions: [], overallAssessment: 'supported_but_incomplete',
        limitations: ['Chỉ sử dụng dữ liệu tổng hợp.'],
      },
      providerRequestId: 'task-013-prerequisite-fake', usage: { inputTokens: 1, outputTokens: 1 }, latencyMs: 1,
    };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-governance-review-'));
  roots.push(root);
  const databasePath = path.join(root, 'runtime', 'governance.sqlite');
  const { db } = openDatabase({ databasePath });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db, artifactStore: artifacts, now: () => new Date('2026-09-14T07:00:00.000Z') });
  const packs = new ResearchPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-14T08:00:00.000Z') });
  const indexes = new ResearchEvidenceIndexService({ db, artifactStore: artifacts, researchPackReader: new FoundationResearchPackReader(packs), now: () => new Date('2026-09-14T09:00:00.000Z') });
  const audits = new ResearchEvidenceAuditService({
    db, artifactStore: artifacts, resultReader: new AnalysisResearchEvidenceIndexResultReader(indexes), gateway: new AuditGateway(),
    configuration: { providerId: 'injected:task-013-prerequisite', modelId: 'synthetic-audit-v1', promptId: 'analysis:research-evidence-audit', promptVersion: 1, promptText: fs.readFileSync(promptPath, 'utf8'), outputSchemaVersion: '1.0.0', timeoutMs: 1_000, maxOutputTokens: 1_000 },
    now: () => new Date('2026-09-14T10:00:00.000Z'),
  });
  const proposals = new AnalysisBackedProposalService({
    db, artifactStore: artifacts, auditReader: new AnalysisResearchEvidenceAuditReader(audits),
    configuration: { producerId: 'orchestrator:direct-submission', producerVersion: 1 },
    now: () => new Date('2026-09-14T11:00:00.000Z'),
  });
  const proposalReader = new OrchestratorAnalysisBackedProposalReader(proposals);
  const configuration = {
    policyId: PROPOSAL_REVIEW_POLICY_ID,
    policyVersion: 1,
    requiredCapability: PROPOSAL_REVIEW_CAPABILITY,
  } as const;
  const createDecisions = (
    reader: AnalysisBackedProposalReader = proposalReader,
    config: GovernedProposalReviewConfiguration = configuration,
  ) => new GovernedProposalDecisionService({
    db, artifactStore: artifacts, proposalReader: reader, configuration: config,
    now: () => new Date('2026-09-14T12:00:00.000Z'),
  });
  return { root, databasePath, db, artifacts, documents, packs, indexes, audits, proposals, proposalReader, configuration, createDecisions };
}

async function createProposal(state: ReturnType<typeof setup>) {
  const imported = await state.documents.importManualDocument({
    contractVersion: '1.0.0', source: { sourceId: `manual:review-${randomUUID()}`, sourceType: 'manual', displayName: 'Nguồn tổng hợp Task 013' },
    ingestion: { idempotencyKey: randomUUID(), acquiredAt: '2026-09-14T06:00:00.000Z', mediaType: 'text/plain', evidenceGrade: { grade: 'synthetic', basis: 'Dữ liệu tổng hợp do tác giả tạo.' } },
    document: { documentType: 'report', title: 'Báo cáo tổng hợp Task 013', sourceLocator: 'manual:synthetic-task-013', languageTag: 'vi', rightsStatus: 'permitted', rightsBasis: 'Tác giả tạo cho kiểm thử.' },
  }, Buffer.from('Báo cáo cho rằng doanh thu tăng.\nSố liệu tổng hợp ghi nhận doanh thu tăng.\n', 'utf8'));
  const pack = await state.packs.finalize({ contractVersion: '1.0.0', packKey: `research:review-${randomUUID()}`, version: 1, purpose: 'Synthetic Task 013 prerequisite.', documentIds: [imported.documentId] });
  const index = await state.indexes.calculate({ contractVersion: '1.0.0', researchPackId: pack.packId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 });
  const audit = await state.audits.audit({ contractVersion: '1.0.0', resultId: index.resultId });
  const value: AnalysisBackedProposalSubmission = {
    contractVersion: '1.0.0', proposalKey: `review_${randomUUID().replaceAll('-', '_')}`, proposalVersion: 1,
    proposalType: 'research_evidence_review_v1', sourceAuditId: audit.auditId,
    objective: { code: 'review_growth', statement: 'Chuẩn bị hồ sơ để con người xem xét bằng chứng tăng trưởng.' },
    proposal: {
      title: 'Đề xuất xem xét bằng chứng tăng trưởng',
      summary: 'Đưa các nhận định đã kiểm toán vào quy trình xem xét của con người.',
      rationale: 'Bằng chứng và rủi ro cần được xem xét trước quyết định.',
      evidenceLinks: [
        { claimCode: 'duoc_ho_tro', use: 'support', note: 'Bằng chứng hỗ trợ trong phạm vi gói.' },
        { claimCode: 'bi_mau_thuan', use: 'risk', note: 'Rủi ro mâu thuẫn trong phạm vi gói.' },
      ],
      openQuestions: ['Cần thêm nguồn độc lập nào?'],
    },
    requestedNextStep: 'request_human_review',
  };
  return state.proposals.submit(value);
}

const capableActor: TrustedProposalReviewActorContext = {
  actorId: 'human:reviewer-001',
  roleSnapshot: 'Người xem xét được ứng dụng xác minh',
  capabilities: new Set([PROPOSAL_REVIEW_CAPABILITY]),
};

function request(proposalId: string, action: 'APPROVE' | 'REJECT' | 'HOLD', version = 1, previous: 'PROPOSED' | 'HOLD' = 'PROPOSED'): GovernedProposalReviewRequest {
  return {
    contractVersion: '1.0.0', proposalId, decisionVersion: version, action,
    rationale: `Con người đã xem xét hồ sơ tổng hợp và chọn ${action}.`,
    expectedPreviousState: previous,
  };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

function mode(filePath: string): number {
  return fs.statSync(filePath).mode & 0o777;
}

test('migration 0009 upgrades version 8 once and migrations 0001-0008 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), priorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-review-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'review.sqlite');
  const eight = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(eight.migration.applied, [1, 2, 3, 4, 5, 6, 7, 8]); assert.equal(eight.migration.currentVersion, 8); eight.db.close();
  fs.copyFileSync('migrations/0009_governance_proposal_decisions.sql', path.join(directory, '0009_governance_proposal_decisions.sql'));
  const nine = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(nine.migration.applied, [9]); assert.equal(nine.migration.currentVersion, 9); nine.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 9); rerun.db.close();
});

test('migration 0009 rejects impossible version/state and transition tuples', async () => {
  const state = setup();
  const proposal = await createProposal(state);
  const proposalId = proposal.proposalId;
  const artifactSha256 = proposal.proposalArtifactSha256;
  assert.throws(() => state.db.prepare(`INSERT INTO governance_proposal_decisions VALUES (?, ?, 1, 'APPROVE', 'HOLD', 'APPROVED', 'human:reviewer', 'Reviewer', ?, ?, 1, ?, ?, '2026-09-14T00:00:00.000Z')`).run(randomUUID(), proposalId, PROPOSAL_REVIEW_CAPABILITY, PROPOSAL_REVIEW_POLICY_ID, 'c'.repeat(64), artifactSha256), /CHECK constraint failed/);
  assert.throws(() => state.db.prepare(`INSERT INTO governance_proposal_decisions VALUES (?, ?, 2, 'APPROVE', 'PROPOSED', 'APPROVED', 'human:reviewer', 'Reviewer', ?, ?, 1, ?, ?, '2026-09-14T00:00:00.000Z')`).run(randomUUID(), proposalId, PROPOSAL_REVIEW_CAPABILITY, PROPOSAL_REVIEW_POLICY_ID, 'c'.repeat(64), artifactSha256), /CHECK constraint failed/);
  assert.throws(() => state.db.prepare(`INSERT INTO governance_proposal_decisions VALUES (?, ?, 1, 'APPROVE', 'PROPOSED', 'REJECTED', 'human:reviewer', 'Reviewer', ?, ?, 1, ?, ?, '2026-09-14T00:00:00.000Z')`).run(randomUUID(), proposalId, PROPOSAL_REVIEW_CAPABILITY, PROPOSAL_REVIEW_POLICY_ID, 'c'.repeat(64), artifactSha256), /CHECK constraint failed/);
  state.db.close();
});

test('all five allowed transitions create canonical decisions while the verified reader exposes only effective state', async () => {
  for (const action of ['APPROVE', 'REJECT', 'HOLD'] as const) {
    const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
    const receipt = await service.decide(request(proposal.proposalId, action), capableActor);
    assert.equal(receipt.resultState, action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'HOLD');
    const replayed = await service.replay(receipt.decisionId);
    assert.equal(replayed.proposal.proposalId, proposal.proposalId); assert.equal(replayed.previousState, 'PROPOSED');
    assert.equal(replayed.actor.actorId, capableActor.actorId); assert.deepEqual(replayed.policy, { policyId: PROPOSAL_REVIEW_POLICY_ID, policyVersion: 1 });
    const effective = await new GovernanceProposalDecisionReader(service).readEffectiveDecision(proposal.proposalId);
    assert.equal(effective.effectiveState, receipt.resultState); assert.ok('decision' in effective);
    state.db.close();
  }
  for (const action of ['APPROVE', 'REJECT'] as const) {
    const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
    await service.decide(request(proposal.proposalId, 'HOLD'), capableActor);
    const receipt = await service.decide(request(proposal.proposalId, action, 2, 'HOLD'), capableActor);
    assert.equal(receipt.resultState, action === 'APPROVE' ? 'APPROVED' : 'REJECTED');
    const replayed = await service.replay(receipt.decisionId); assert.equal(replayed.previousState, 'HOLD');
    state.db.close();
  }
});

test('proposal without decisions remains PROPOSED and missing capability or untrusted authority fields reject before writes', async () => {
  const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
  assert.deepEqual(await new GovernanceProposalDecisionReader(service).readEffectiveDecision(proposal.proposalId), { proposalId: proposal.proposalId, effectiveState: 'PROPOSED' });
  const beforeArtifacts = count(state.db, 'artifact_manifests');
  await assert.rejects(service.decide(request(proposal.proposalId, 'APPROVE'), { ...capableActor, capabilities: new Set() }), /lacks governance:proposal-review/);
  assert.equal(count(state.db, 'governance_proposal_decisions'), 0n); assert.equal(count(state.db, 'artifact_manifests'), beforeArtifacts);
  const forbidden = ['actorId', 'roleSnapshot', 'capabilities', 'policy', 'createdAt', 'resultState', 'decisionId', 'artifactDigest', 'command', 'url', 'actionPayload'];
  for (const field of forbidden) {
    await assert.rejects(service.decide({ ...request(proposal.proposalId, 'APPROVE'), [field]: 'attacker' }, capableActor), GovernanceValidationError);
  }
  assert.equal(count(state.db, 'governance_proposal_decisions'), 0n); assert.equal(count(state.db, 'artifact_manifests'), beforeArtifacts);
  await assert.rejects(service.decide({ ...request(proposal.proposalId, 'APPROVE'), rationale: '  khoảng trắng  ' }, capableActor), GovernanceValidationError);
  await assert.rejects(service.decide({ ...request(proposal.proposalId, 'APPROVE'), rationale: 'xuống dòng cuối\n' }, capableActor), GovernanceValidationError);
  state.db.close();
});

test('terminal, repeated HOLD, stale state, skipped version, and missing predecessor transitions reject before writes', async () => {
  for (const terminal of ['APPROVE', 'REJECT'] as const) {
    const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
    await service.decide(request(proposal.proposalId, terminal), capableActor);
    const artifacts = count(state.db, 'artifact_manifests');
    await assert.rejects(service.decide(request(proposal.proposalId, 'APPROVE', 2, 'HOLD'), capableActor), /verified HOLD predecessor/);
    assert.equal(count(state.db, 'governance_proposal_decisions'), 1n); assert.equal(count(state.db, 'artifact_manifests'), artifacts); state.db.close();
  }
  const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
  await service.decide(request(proposal.proposalId, 'HOLD'), capableActor);
  for (const invalid of [
    request(proposal.proposalId, 'HOLD', 2, 'HOLD'),
    request(proposal.proposalId, 'APPROVE', 2, 'PROPOSED'),
    request(proposal.proposalId, 'APPROVE', 3, 'HOLD'),
  ]) await assert.rejects(service.decide(invalid, capableActor), GovernanceValidationError);
  await assert.rejects(
    service.decide(request(proposal.proposalId, 'APPROVE', 1, 'HOLD'), capableActor),
    GovernedProposalDecisionIdentityConflictError,
  );
  const other = setup(); const otherProposal = await createProposal(other);
  await assert.rejects(other.createDecisions().decide(request(otherProposal.proposalId, 'APPROVE', 2, 'HOLD'), capableActor), /First decision requires version 1/);
  state.db.close(); other.db.close();
});

test('same identity deduplicates while changed request, proposal, actor, or policy identity conflicts', async () => {
  const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions(); const value = request(proposal.proposalId, 'APPROVE');
  const first = await service.decide(value, capableActor); const artifacts = count(state.db, 'artifact_manifests');
  const duplicate = await service.decide(value, capableActor);
  assert.equal(duplicate.deduplicated, true); assert.equal(duplicate.decisionId, first.decisionId); assert.equal(count(state.db, 'artifact_manifests'), artifacts);
  await assert.rejects(service.decide({ ...value, rationale: 'Nội dung hợp lệ nhưng đã thay đổi.' }, capableActor), GovernedProposalDecisionIdentityConflictError);
  await assert.rejects(service.decide(value, { ...capableActor, actorId: 'human:reviewer-002' }), GovernedProposalDecisionIdentityConflictError);
  await assert.rejects(state.createDecisions(state.proposalReader, { ...state.configuration, policyVersion: 2 }).decide(value, capableActor), GovernedProposalDecisionIdentityConflictError);
  const verified = await state.proposalReader.readVerifiedProposal(proposal.proposalId);
  const changedProposal = { ...verified.proposal, proposal: { ...verified.proposal.proposal, summary: 'Nội dung proposal bị thay đổi.' } };
  const changedReader: AnalysisBackedProposalReader = { async readVerifiedProposal() { return { proposalId: proposal.proposalId, proposalArtifactSha256: createHash('sha256').update(canonicalJson(changedProposal)).digest('hex'), proposal: changedProposal }; } };
  await assert.rejects(state.createDecisions(changedReader).decide(value, capableActor), GovernedProposalDecisionIdentityConflictError);
  state.db.close();
});

test('policy changes append a valid next version and caller mutations cannot alter validated snapshots', async () => {
  const policy = setup(); const proposal = await createProposal(policy); const v1 = policy.createDecisions();
  await v1.decide(request(proposal.proposalId, 'HOLD'), capableActor);
  const v2 = policy.createDecisions(policy.proposalReader, { ...policy.configuration, policyVersion: 2 });
  const approved = await v2.decide(request(proposal.proposalId, 'APPROVE', 2, 'HOLD'), { ...capableActor, actorId: 'human:reviewer-002' });
  assert.equal((await v2.replay(approved.decisionId)).policy.policyVersion, 2);
  assert.equal((await v2.readEffectiveDecision(proposal.proposalId)).effectiveState, 'APPROVED');
  policy.db.close();

  const mutable = setup(); const mutableProposal = await createProposal(mutable);
  const baseReader = mutable.proposalReader;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const delayedReader: AnalysisBackedProposalReader = {
    async readVerifiedProposal(proposalId) { await gate; return baseReader.readVerifiedProposal(proposalId); },
  };
  const mutableService = mutable.createDecisions(delayedReader);
  const input: any = request(mutableProposal.proposalId, 'APPROVE');
  const actor: any = { actorId: capableActor.actorId, roleSnapshot: capableActor.roleSnapshot, capabilities: new Set([PROPOSAL_REVIEW_CAPABILITY]) };
  const pending = mutableService.decide(input, actor);
  input.action = 'REJECT'; input.rationale = 'Nội dung bị thay đổi sau xác thực.';
  actor.actorId = 'human:attacker'; actor.roleSnapshot = 'Vai trò bị thay đổi';
  release();
  const receipt = await pending; const replayed = await mutableService.replay(receipt.decisionId);
  assert.equal(replayed.action, 'APPROVE'); assert.equal(replayed.actor.actorId, capableActor.actorId);
  mutable.db.close();
});

test('decision rows are immutable and Task 011 proposal row and artifact remain byte-for-byte unchanged', async () => {
  const state = setup(); const proposal = await createProposal(state); const service = state.createDecisions();
  const proposalRowBefore = state.db.prepare('SELECT * FROM orchestrator_proposals WHERE proposal_id = ?').get(proposal.proposalId);
  const proposalBytesBefore = await state.artifacts.read(proposal.proposalArtifactSha256);
  const decision = await service.decide(request(proposal.proposalId, 'APPROVE'), capableActor);
  assert.throws(() => state.db.prepare('UPDATE governance_proposal_decisions SET rationale = rationale WHERE decision_id = ?').run(decision.decisionId), /no such column: rationale/);
  assert.throws(() => state.db.prepare('UPDATE governance_proposal_decisions SET result_state = ? WHERE decision_id = ?').run('APPROVED', decision.decisionId), /governance_proposal_decision_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM governance_proposal_decisions WHERE decision_id = ?').run(decision.decisionId), /governance_proposal_decision_immutable/);
  assert.deepEqual(state.db.prepare('SELECT * FROM orchestrator_proposals WHERE proposal_id = ?').get(proposal.proposalId), proposalRowBefore);
  assert.ok((await state.artifacts.read(proposal.proposalArtifactSha256)).equals(proposalBytesBefore));
  state.db.close();
});

test('replay rejects missing, corrupt, noncanonical, manifest, proposal, actor/policy, and broken-chain mismatch', async () => {
  const missing = setup(); const missingProposal = await createProposal(missing); const missingService = missing.createDecisions(); const missingDecision = await missingService.decide(request(missingProposal.proposalId, 'APPROVE'), capableActor); await fsp.rm(missing.artifacts.pathForDigest(missingDecision.decisionArtifactSha256)); await assert.rejects(missingService.replay(missingDecision.decisionId), /ENOENT/); missing.db.close();
  const corrupt = setup(); const corruptProposal = await createProposal(corrupt); const corruptService = corrupt.createDecisions(); const corruptDecision = await corruptService.decide(request(corruptProposal.proposalId, 'APPROVE'), capableActor); await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptDecision.decisionArtifactSha256), '{}'); await assert.rejects(corruptService.replay(corruptDecision.decisionId), ArtifactIntegrityError); corrupt.db.close();
  const metadata = setup(); const metadataProposal = await createProposal(metadata); const metadataService = metadata.createDecisions(); const metadataDecision = await metadataService.decide(request(metadataProposal.proposalId, 'APPROVE'), capableActor); metadata.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', metadataDecision.decisionArtifactSha256); await assert.rejects(metadataService.replay(metadataDecision.decisionId), /manifest metadata mismatch/); metadata.db.close();
  const noncanonical = setup(); const ncProposal = await createProposal(noncanonical); const ncService = noncanonical.createDecisions(); const ncDecision = await ncService.decide(request(ncProposal.proposalId, 'APPROVE'), capableActor); const parsed = JSON.parse((await noncanonical.artifacts.read(ncDecision.decisionArtifactSha256)).toString()); const replacement = Buffer.from(JSON.stringify(parsed, null, 2)); const digest = createHash('sha256').update(replacement).digest('hex'); await fsp.mkdir(path.dirname(noncanonical.artifacts.pathForDigest(digest)), { recursive: true }); await fsp.writeFile(noncanonical.artifacts.pathForDigest(digest), replacement, { mode: 0o600 }); noncanonical.db.exec('DROP TRIGGER governance_proposal_decisions_no_update'); noncanonical.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,'2026-09-14T12:00:00.000Z','1.0.0','active','2026-09-14T12:00:00.000Z')`).run(digest, replacement.byteLength, `sha256/${digest.slice(0, 2)}/${digest}`); noncanonical.db.prepare('UPDATE governance_proposal_decisions SET decision_artifact_sha256 = ? WHERE decision_id = ?').run(digest, ncDecision.decisionId); await assert.rejects(ncService.replay(ncDecision.decisionId), /not canonical JSON/); noncanonical.db.close();
  const mismatch = setup(); const mismatchProposal = await createProposal(mismatch); const mismatchService = mismatch.createDecisions(); const mismatchDecision = await mismatchService.decide(request(mismatchProposal.proposalId, 'HOLD'), capableActor); mismatch.db.exec('DROP TRIGGER governance_proposal_decisions_no_update'); mismatch.db.prepare('UPDATE governance_proposal_decisions SET actor_id = ? WHERE decision_id = ?').run('human:other-reviewer', mismatchDecision.decisionId); await assert.rejects(mismatchService.replay(mismatchDecision.decisionId), /does not match immutable metadata/); mismatch.db.close();
  const policy = setup(); const policyProposal = await createProposal(policy); const policyService = policy.createDecisions(); const policyDecision = await policyService.decide(request(policyProposal.proposalId, 'APPROVE'), capableActor); const policyV2 = policy.createDecisions(policy.proposalReader, { ...policy.configuration, policyVersion: 2 }); assert.equal((await policyV2.replay(policyDecision.decisionId)).policy.policyVersion, 1); policy.db.exec('DROP TRIGGER governance_proposal_decisions_no_update'); policy.db.prepare('UPDATE governance_proposal_decisions SET policy_version = 2 WHERE decision_id = ?').run(policyDecision.decisionId); await assert.rejects(policyService.replay(policyDecision.decisionId), /does not match immutable metadata/); policy.db.close();
  const proposalMismatch = setup(); const pmProposal = await createProposal(proposalMismatch); const pmService = proposalMismatch.createDecisions(); const pmDecision = await pmService.decide(request(pmProposal.proposalId, 'APPROVE'), capableActor); const verified = await proposalMismatch.proposalReader.readVerifiedProposal(pmProposal.proposalId); const badProposalReader: AnalysisBackedProposalReader = { async readVerifiedProposal() { return { ...verified, proposalArtifactSha256: 'f'.repeat(64) }; } }; await assert.rejects(proposalMismatch.createDecisions(badProposalReader).replay(pmDecision.decisionId), /Verified proposal identity or artifact digest mismatch/); proposalMismatch.db.close();
  const chain = setup(); const chainProposal = await createProposal(chain); const chainService = chain.createDecisions(); const first = await chainService.decide(request(chainProposal.proposalId, 'HOLD'), capableActor); const second = await chainService.decide(request(chainProposal.proposalId, 'APPROVE', 2, 'HOLD'), capableActor); chain.db.exec('DROP TRIGGER governance_proposal_decisions_no_delete'); chain.db.prepare('DELETE FROM governance_proposal_decisions WHERE decision_id = ?').run(first.decisionId); await assert.rejects(chainService.replay(second.decisionId), /predecessor is missing/); chain.db.close();
});

test('governance source has no Box 3 SQL and POSIX database, WAL/SHM, proposal, and decision artifacts are 0600', async () => {
  const source = fs.readFileSync('src/modules/governance/governed-proposal-decision-service.ts', 'utf8');
  assert.doesNotMatch(source, /orchestrator_proposals|FROM\s+orchestrator_|JOIN\s+orchestrator_|UPDATE\s+orchestrator_/i);
  const state = setup(); const proposal = await createProposal(state); const decision = await state.createDecisions().decide(request(proposal.proposalId, 'APPROVE'), capableActor);
  state.db.pragma('wal_checkpoint(PASSIVE)');
  if (process.platform !== 'win32') {
    for (const file of [
      state.databasePath,
      `${state.databasePath}-wal`,
      `${state.databasePath}-shm`,
      state.artifacts.pathForDigest(proposal.proposalArtifactSha256),
      state.artifacts.pathForDigest(decision.decisionArtifactSha256),
    ]) assert.equal(mode(file), 0o600, `${file} must be 0600`);
  }
  state.db.close();
});

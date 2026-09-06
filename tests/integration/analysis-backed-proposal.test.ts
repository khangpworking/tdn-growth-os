import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { AnalysisBackedProposalSubmission } from '../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import {
  AnalysisResearchEvidenceAuditReader,
  AnalysisResearchEvidenceIndexResultReader,
  ResearchEvidenceAuditService,
  ResearchEvidenceIndexService,
} from '../../src/modules/analysis/index.js';
import type { ResearchEvidenceAuditReader } from '../../src/modules/analysis/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
} from '../../src/modules/foundation/index.js';
import {
  AnalysisBackedProposalIdentityConflictError,
  type AnalysisBackedProposalConfiguration,
  AnalysisBackedProposalService,
  OrchestratorAnalysisBackedProposalReader,
  OrchestratorValidationError,
} from '../../src/modules/orchestrator/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
const promptPath = path.resolve('prompts/analysis/research-evidence-audit-v1.txt');
const migrationNames = ['foundation', 'data_packs', 'analysis_results', 'analysis_interpretations', 'research_documents', 'analysis_research_results', 'analysis_research_audits'];
const priorMigrations = migrationNames.map((name, index) => `migrations/000${index + 1}_${name}.sql`);
const priorDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
  'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592',
  '241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88',
  '18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b',
];

class AuditGateway implements AiGateway {
  readonly requests: AiGatewayRequest[] = [];
  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    this.requests.push(request);
    const segments = (request.input.result as { documents: Array<{ segments: Array<{ citationPointer: string }> }> }).documents[0]!.segments;
    const first = segments[0]!.citationPointer;
    const second = segments[1]!.citationPointer;
    return {
      output: {
        summary: 'Bản kiểm toán tổng hợp cho nền tảng đề xuất.',
        claims: [
          { code: 'duoc_ho_tro', claimText: 'Doanh thu tăng.', claimType: 'factual', assessment: 'supported', reasoning: 'Có bằng chứng hỗ trợ.', claimCitations: [first], supportingCitations: [second], contradictingCitations: [], uncertainty: 'Phạm vi nguồn hạn chế.' },
          { code: 'bi_mau_thuan', claimText: 'Không có tăng trưởng.', claimType: 'factual', assessment: 'contradicted', reasoning: 'Bằng chứng trong gói mâu thuẫn.', claimCitations: [first], supportingCitations: [], contradictingCitations: [second], uncertainty: 'Chỉ đánh giá trong gói.' },
          { code: 'hon_hop', claimText: 'Tăng trưởng bền vững.', claimType: 'inference', assessment: 'mixed', reasoning: 'Có tín hiệu hai chiều.', claimCitations: [first], supportingCitations: [second], contradictingCitations: [first], uncertainty: 'Chưa đủ thời gian quan sát.' },
          { code: 'chua_du', claimText: 'Xu hướng sẽ tiếp tục.', claimType: 'inference', assessment: 'insufficient_evidence', reasoning: 'Gói chưa trả lời.', claimCitations: [first], supportingCitations: [], contradictingCitations: [], uncertainty: 'Thiếu dữ liệu tương lai.' },
        ],
        unansweredQuestions: [], overallAssessment: 'supported_but_incomplete',
        limitations: ['Chỉ sử dụng Research Pack tổng hợp.'],
      },
      providerRequestId: 'task-011-prerequisite-fake', usage: { inputTokens: 100, outputTokens: 100 }, latencyMs: 1,
    };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-proposal-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'orchestrator.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db, artifactStore: artifacts, now: () => new Date('2026-09-13T07:00:00.000Z') });
  const packs = new ResearchPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-13T08:00:00.000Z') });
  const indexes = new ResearchEvidenceIndexService({ db, artifactStore: artifacts, researchPackReader: new FoundationResearchPackReader(packs), now: () => new Date('2026-09-13T09:00:00.000Z') });
  const gateway = new AuditGateway();
  const audits = new ResearchEvidenceAuditService({
    db, artifactStore: artifacts, resultReader: new AnalysisResearchEvidenceIndexResultReader(indexes), gateway,
    configuration: { providerId: 'injected:task-011-prerequisite', modelId: 'synthetic-audit-v1', promptId: 'analysis:research-evidence-audit', promptVersion: 1, promptText: fs.readFileSync(promptPath, 'utf8'), outputSchemaVersion: '1.0.0', timeoutMs: 1_000, maxOutputTokens: 1_000 },
    now: () => new Date('2026-09-13T10:00:00.000Z'),
  });
  const auditReader = new AnalysisResearchEvidenceAuditReader(audits);
  const configuration = { producerId: 'orchestrator:direct-submission', producerVersion: 1 } as const;
  const createProposals = (reader: ResearchEvidenceAuditReader = auditReader, config: AnalysisBackedProposalConfiguration = configuration) => new AnalysisBackedProposalService({
    db, artifactStore: artifacts, auditReader: reader, configuration: config, now: () => new Date('2026-09-13T11:00:00.000Z'),
  });
  return { root, db, artifacts, documents, packs, indexes, gateway, audits, auditReader, configuration, createProposals };
}

async function createAudit(state: ReturnType<typeof setup>) {
  const imported = await state.documents.importManualDocument({
    contractVersion: '1.0.0', source: { sourceId: `manual:proposal-${randomUUID()}`, sourceType: 'manual', displayName: 'Nguồn tổng hợp Task 011' },
    ingestion: { idempotencyKey: randomUUID(), acquiredAt: '2026-09-13T06:00:00.000Z', mediaType: 'text/plain', evidenceGrade: { grade: 'synthetic', basis: 'Dữ liệu tổng hợp do tác giả tạo.' } },
    document: { documentType: 'report', title: 'Báo cáo tổng hợp Task 011', sourceLocator: 'manual:synthetic-task-011', languageTag: 'vi', rightsStatus: 'permitted', rightsBasis: 'Tác giả tạo cho kiểm thử.' },
  }, Buffer.from('Báo cáo cho rằng doanh thu tăng.\nSố liệu tổng hợp ghi nhận doanh thu tăng.\n', 'utf8'));
  const pack = await state.packs.finalize({ contractVersion: '1.0.0', packKey: `research:proposal-${randomUUID()}`, version: 1, purpose: 'Synthetic Task 011 prerequisite.', documentIds: [imported.documentId] });
  const index = await state.indexes.calculate({ contractVersion: '1.0.0', researchPackId: pack.packId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 });
  return state.audits.audit({ contractVersion: '1.0.0', resultId: index.resultId });
}

function submission(sourceAuditId: string, version = 1): AnalysisBackedProposalSubmission {
  return {
    contractVersion: '1.0.0', proposalKey: 'review_growth_evidence', proposalVersion: version,
    proposalType: 'research_evidence_review_v1', sourceAuditId,
    objective: { code: 'review_growth', statement: 'Chuẩn bị hồ sơ để con người xem xét bằng chứng tăng trưởng.' },
    proposal: {
      title: 'Đề xuất xem xét bằng chứng tăng trưởng',
      summary: 'Đưa các nhận định đã kiểm toán vào quy trình xem xét của con người.',
      rationale: 'Bằng chứng hỗ trợ, rủi ro và bất định cần được trình bày riêng trước mọi quyết định.',
      evidenceLinks: [
        { claimCode: 'duoc_ho_tro', use: 'support', note: 'Dùng làm bằng chứng hỗ trợ trong phạm vi gói.' },
        { claimCode: 'bi_mau_thuan', use: 'risk', note: 'Dùng để nêu rủi ro mâu thuẫn.' },
        { claimCode: 'hon_hop', use: 'uncertainty', note: 'Dùng để nêu bất định từ bằng chứng hỗn hợp.' },
        { claimCode: 'chua_du', use: 'uncertainty', note: 'Dùng để nêu khoảng trống bằng chứng.' },
      ],
      openQuestions: ['Cần thêm nguồn độc lập nào trước khi xem xét?'],
    },
    requestedNextStep: 'request_human_review',
  };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
}

test('migration 0008 upgrades version 7 once and migrations 0001-0007 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), priorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-proposal-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'proposal.sqlite');
  const seven = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(seven.migration.applied, [1, 2, 3, 4, 5, 6, 7]); assert.equal(seven.migration.currentVersion, 7); seven.db.close();
  fs.copyFileSync('migrations/0008_orchestrator_proposals.sql', path.join(directory, '0008_orchestrator_proposals.sql'));
  const eight = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(eight.migration.applied, [8]); assert.equal(eight.migration.currentVersion, 8); eight.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 8); rerun.db.close();
});

test('valid Vietnamese submission creates one application-owned canonical PROPOSED artifact and verified reader receipt', async () => {
  const state = setup(); const audit = await createAudit(state); const proposals = state.createProposals();
  const receipt = await proposals.submit(submission(audit.auditId));
  assert.equal(count(state.db, 'orchestrator_proposals'), 1n);
  const replayed = await proposals.replay(receipt.proposalId);
  assert.equal(replayed.state, 'PROPOSED'); assert.equal(replayed.proposalId, receipt.proposalId);
  assert.equal(replayed.createdAt, '2026-09-13T11:00:00.000Z'); assert.equal(replayed.sourceAudit.auditId, audit.auditId);
  assert.equal(replayed.sourceAudit.outputArtifactSha256, audit.outputArtifactSha256);
  assert.deepEqual(replayed.producer, state.configuration);
  assert.equal(replayed.proposal.title, 'Đề xuất xem xét bằng chứng tăng trưởng');
  assert.deepEqual(replayed.proposal.evidenceLinks.map(({ claimCode, use }) => [claimCode, use]), [['duoc_ho_tro', 'support'], ['bi_mau_thuan', 'risk'], ['hon_hop', 'uncertainty'], ['chua_du', 'uncertainty']]);
  const verified = await new OrchestratorAnalysisBackedProposalReader(proposals).readVerifiedProposal(receipt.proposalId);
  assert.equal(verified.proposalArtifactSha256, receipt.proposalArtifactSha256);
  assert.equal(createHash('sha256').update(await state.artifacts.read(receipt.proposalArtifactSha256)).digest('hex'), receipt.proposalArtifactSha256);
  assert.equal(state.gateway.requests.length, 1, 'only the prerequisite Task 010 audit used AI'); state.db.close();
});

test('unknown, duplicate, and every invalid assessment-to-use mapping reject before proposal writes', async () => {
  const probes: Array<(value: any) => void> = [
    (value) => { value.proposal.evidenceLinks[0].claimCode = 'khong_ton_tai'; },
    (value) => { value.proposal.evidenceLinks[1].claimCode = 'duoc_ho_tro'; },
    (value) => { value.proposal.evidenceLinks[0].use = 'risk'; },
    (value) => { value.proposal.evidenceLinks[1].use = 'support'; },
    (value) => { value.proposal.evidenceLinks[3].use = 'support'; },
    (value) => { value.proposal.evidenceLinks[0].use = 'uncertainty'; },
  ];
  for (const mutate of probes) {
    const state = setup(); const audit = await createAudit(state); const value: any = structuredClone(submission(audit.auditId)); mutate(value);
    const before = count(state.db, 'artifact_manifests');
    await assert.rejects(state.createProposals().submit(value), OrchestratorValidationError);
    assert.equal(count(state.db, 'orchestrator_proposals'), 0n); assert.equal(count(state.db, 'artifact_manifests'), before); state.db.close();
  }
});

test('request cannot inject application state, identity, producer, approval, tools, paths, SQL, or action fields', async () => {
  const fields = ['proposalId', 'state', 'createdAt', 'sourceAuditArtifactSha256', 'producer', 'approval', 'tools', 'path', 'sql', 'action'];
  for (const field of fields) {
    const state = setup(); const audit = await createAudit(state); const value: any = { ...submission(audit.auditId), [field]: field === 'state' ? 'APPROVED' : 'attacker' };
    const before = count(state.db, 'artifact_manifests'); await assert.rejects(state.createProposals().submit(value), OrchestratorValidationError);
    assert.equal(count(state.db, 'orchestrator_proposals'), 0n); assert.equal(count(state.db, 'artifact_manifests'), before); state.db.close();
  }
});

test('same identity deduplicates, drift conflicts, and sequential versions preserve prior proposals', async () => {
  const state = setup(); const audit = await createAudit(state); const proposals = state.createProposals(); const value = submission(audit.auditId);
  const first = await proposals.submit(value); const artifactsAfter = count(state.db, 'artifact_manifests'); const second = await proposals.submit(value);
  assert.equal(second.deduplicated, true); assert.equal(second.proposalId, first.proposalId); assert.equal(count(state.db, 'artifact_manifests'), artifactsAfter);
  await assert.rejects(proposals.submit({ ...value, objective: { ...value.objective, statement: 'Thay đổi.' } }), AnalysisBackedProposalIdentityConflictError);
  await assert.rejects(state.createProposals(state.auditReader, { producerId: 'orchestrator:other', producerVersion: 1 }).submit(value), AnalysisBackedProposalIdentityConflictError);
  const verifiedAudit = await state.auditReader.readVerifiedResearchEvidenceAudit(audit.auditId);
  const digestDriftReader: ResearchEvidenceAuditReader = { async readVerifiedResearchEvidenceAudit() { return { ...verifiedAudit, outputArtifactSha256: 'f'.repeat(64) }; } };
  await assert.rejects(state.createProposals(digestDriftReader).submit(value), AnalysisBackedProposalIdentityConflictError);
  await assert.rejects(proposals.submit({ ...value, proposalKey: 'missing_predecessor', proposalVersion: 2 }), /requires version 1/);
  const priorBytes = await state.artifacts.read(first.proposalArtifactSha256);
  const higher = await proposals.submit({ ...value, proposalVersion: 2, proposal: { ...value.proposal, summary: 'Phiên bản hai giữ nguyên lịch sử phiên bản một.' } });
  assert.notEqual(higher.proposalId, first.proposalId); assert.equal(count(state.db, 'orchestrator_proposals'), 2n);
  assert.ok((await state.artifacts.read(first.proposalArtifactSha256)).equals(priorBytes)); state.db.close();
});

test('immutable rows and replay reject missing, corrupt, noncanonical, artifact metadata, source, and producer mismatch', async () => {
  const immutable = setup(); const immutableAudit = await createAudit(immutable); const immutableService = immutable.createProposals(); const immutableProposal = await immutableService.submit(submission(immutableAudit.auditId));
  assert.throws(() => immutable.db.prepare('UPDATE orchestrator_proposals SET state = ? WHERE proposal_id = ?').run('PROPOSED', immutableProposal.proposalId), /orchestrator_proposal_immutable/);
  assert.throws(() => immutable.db.prepare('DELETE FROM orchestrator_proposals WHERE proposal_id = ?').run(immutableProposal.proposalId), /orchestrator_proposal_immutable/); immutable.db.close();

  const missing = setup(); const missingAudit = await createAudit(missing); const missingService = missing.createProposals(); const missingProposal = await missingService.submit(submission(missingAudit.auditId)); await fsp.rm(missing.artifacts.pathForDigest(missingProposal.proposalArtifactSha256)); await assert.rejects(missingService.replay(missingProposal.proposalId), /ENOENT/); missing.db.close();
  const corrupt = setup(); const corruptAudit = await createAudit(corrupt); const corruptService = corrupt.createProposals(); const corruptProposal = await corruptService.submit(submission(corruptAudit.auditId)); await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptProposal.proposalArtifactSha256), '{}'); await assert.rejects(corruptService.replay(corruptProposal.proposalId), ArtifactIntegrityError); corrupt.db.close();
  const metadata = setup(); const metadataAudit = await createAudit(metadata); const metadataService = metadata.createProposals(); const metadataProposal = await metadataService.submit(submission(metadataAudit.auditId)); metadata.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', metadataProposal.proposalArtifactSha256); await assert.rejects(metadataService.replay(metadataProposal.proposalId), /artifact manifest metadata mismatch/); metadata.db.close();

  const noncanonical = setup(); const ncAudit = await createAudit(noncanonical); const ncService = noncanonical.createProposals(); const ncProposal = await ncService.submit(submission(ncAudit.auditId)); const parsed = JSON.parse((await noncanonical.artifacts.read(ncProposal.proposalArtifactSha256)).toString()); const replacement = Buffer.from(JSON.stringify(parsed, null, 2)); const digest = createHash('sha256').update(replacement).digest('hex'); await fsp.mkdir(path.dirname(noncanonical.artifacts.pathForDigest(digest)), { recursive: true }); await fsp.writeFile(noncanonical.artifacts.pathForDigest(digest), replacement, { mode: 0o600 }); noncanonical.db.exec('DROP TRIGGER orchestrator_proposals_no_update'); noncanonical.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,'2026-09-13T11:00:00.000Z','1.0.0','active','2026-09-13T11:00:00.000Z')`).run(digest, replacement.byteLength, `sha256/${digest.slice(0, 2)}/${digest}`); noncanonical.db.prepare('UPDATE orchestrator_proposals SET proposal_artifact_sha256 = ? WHERE proposal_id = ?').run(digest, ncProposal.proposalId); await assert.rejects(ncService.replay(ncProposal.proposalId), /not canonical JSON/); noncanonical.db.close();

  const mismatch = setup(); const mismatchAudit = await createAudit(mismatch); const mismatchService = mismatch.createProposals(); const mismatchProposal = await mismatchService.submit(submission(mismatchAudit.auditId)); const verifiedAudit = await mismatch.auditReader.readVerifiedResearchEvidenceAudit(mismatchAudit.auditId); const wrongReader: ResearchEvidenceAuditReader = { async readVerifiedResearchEvidenceAudit() { return { ...verifiedAudit, outputArtifactSha256: 'f'.repeat(64) }; } }; await assert.rejects(mismatch.createProposals(wrongReader).replay(mismatchProposal.proposalId), /does not match immutable metadata/); await assert.rejects(mismatch.createProposals(mismatch.auditReader, { producerId: 'orchestrator:other', producerVersion: 1 }).replay(mismatchProposal.proposalId), /does not match immutable metadata/); mismatch.db.close();
});

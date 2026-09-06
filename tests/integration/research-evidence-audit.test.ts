import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import type { ResearchEvidenceAuditOutput } from '../../contracts/analysis/research-evidence-audit-output.generated.js';
import {
  AnalysisResearchEvidenceAuditReader,
  AnalysisResearchEvidenceIndexResultReader,
  AnalysisValidationError,
  GovernedAnalysisSkillExecutor,
  RESEARCH_EVIDENCE_AUDIT_SKILL_ID,
  RESEARCH_EVIDENCE_AUDIT_SKILL_VERSION,
  ResearchEvidenceAuditIdentityConflictError,
  ResearchEvidenceAuditService,
  ResearchEvidenceIndexService,
  governedAnalysisSkillRegistry,
} from '../../src/modules/analysis/index.js';
import type { ResearchEvidenceIndexResultReader } from '../../src/modules/analysis/index.js';
import {
  FoundationResearchPackReader,
  ResearchDocumentService,
  ResearchPackService,
} from '../../src/modules/foundation/index.js';
import type { AiGateway, AiGatewayRequest, AiGatewayResponse } from '../../src/platform/ai/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { MarketSnapshotInterpretationService } from '../../src/modules/analysis/index.js';

const roots: string[] = [];
const promptPath = path.resolve('prompts/analysis/research-evidence-audit-v1.txt');
const priorMigrations = [1, 2, 3, 4, 5, 6].map((version) => {
  const names = ['foundation', 'data_packs', 'analysis_results', 'analysis_interpretations', 'research_documents', 'analysis_research_results'];
  return `migrations/000${version}_${names[version - 1]}.sql`;
});
const expectedPriorDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
  'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592',
  '241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88',
];

class FakeGateway implements AiGateway {
  readonly requests: AiGatewayRequest[] = [];
  output: unknown;
  constructor(output: unknown) { this.output = output; }
  async execute(request: AiGatewayRequest): Promise<AiGatewayResponse> {
    this.requests.push(request);
    return { output: this.output, providerRequestId: 'fake-audit-request-vi', usage: { inputTokens: 321, outputTokens: 123 }, latencyMs: 9 };
  }
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function validOutput(pointer0: string, pointer1: string): ResearchEvidenceAuditOutput {
  return {
    summary: 'Trong Research Pack này, một nhận định được hỗ trợ nhưng phạm vi nguồn còn hạn chế.',
    claims: [{
      code: 'doanh_thu_tang', claimText: 'Doanh thu tháng này tăng.', claimType: 'factual', assessment: 'supported',
      reasoning: 'Một phân đoạn nêu trực tiếp mức tăng trong phạm vi tài liệu đã cung cấp.',
      claimCitations: [pointer0], supportingCitations: [pointer1], contradictingCitations: [],
      uncertainty: 'Không có dữ liệu ngoài Research Pack để kiểm tra độc lập.',
    }],
    unansweredQuestions: [{ question: 'Phương pháp đo doanh thu là gì?', whyMaterial: 'Phương pháp ảnh hưởng cách diễn giải mức tăng.', triggerCitations: [pointer0] }],
    overallAssessment: 'supported_but_incomplete',
    limitations: ['Kết luận chỉ áp dụng cho Research Pack đã cung cấp.'],
  };
}

function setup(outputFactory?: (pointers: readonly string[]) => unknown) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-research-audit-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'analysis.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const documents = new ResearchDocumentService({ db, artifactStore: artifacts, now: () => new Date('2026-09-12T07:00:00.000Z') });
  const packs = new ResearchPackService({ db, artifactStore: artifacts, now: () => new Date('2026-09-12T08:00:00.000Z') });
  const indexes = new ResearchEvidenceIndexService({ db, artifactStore: artifacts, researchPackReader: new FoundationResearchPackReader(packs), now: () => new Date('2026-09-12T09:00:00.000Z') });
  const gateway = new FakeGateway({});
  const config = {
    providerId: 'injected:task-010-fake', modelId: 'synthetic-audit-model-v1',
    promptId: 'analysis:research-evidence-audit', promptVersion: 1,
    promptText: fs.readFileSync(promptPath, 'utf8'), outputSchemaVersion: '1.0.0' as const,
    timeoutMs: 15_000, maxOutputTokens: 1_200,
  };
  const createAudit = (reader: ResearchEvidenceIndexResultReader = new AnalysisResearchEvidenceIndexResultReader(indexes), promptText = config.promptText) =>
    new ResearchEvidenceAuditService({ db, artifactStore: artifacts, resultReader: reader, gateway, configuration: { ...config, promptText }, now: () => new Date('2026-09-12T10:00:00.000Z') });
  return { root, db, artifacts, documents, packs, indexes, gateway, config, createAudit, outputFactory };
}

async function createSource(state: ReturnType<typeof setup>) {
  const imported = await state.documents.importManualDocument({
    contractVersion: '1.0.0', source: { sourceId: `manual:audit-${randomUUID()}`, sourceType: 'manual', displayName: 'Nguồn kiểm thử tổng hợp' },
    ingestion: { idempotencyKey: randomUUID(), acquiredAt: '2026-09-12T06:00:00.000Z', mediaType: 'text/plain', evidenceGrade: { grade: 'synthetic', basis: 'Dữ liệu tổng hợp do tác giả tạo.' } },
    document: { documentType: 'report', title: 'Báo cáo tổng hợp', sourceLocator: 'manual:synthetic-vietnamese-audit', languageTag: 'vi', rightsStatus: 'permitted', rightsBasis: 'Tác giả tạo cho kiểm thử.' },
  }, Buffer.from('Báo cáo cho rằng doanh thu tháng này tăng 20%.\nSố liệu nội bộ ghi nhận mức tăng 20%.\nChưa có nguồn độc lập xác nhận.\n', 'utf8'));
  const pack = await state.packs.finalize({ contractVersion: '1.0.0', packKey: `research:audit-${randomUUID()}`, version: 1, purpose: 'Synthetic Vietnamese evidence audit.', documentIds: [imported.documentId] });
  const execution = await state.indexes.calculate({ contractVersion: '1.0.0', researchPackId: pack.packId, calculationKey: 'research_evidence_index_v1', calculationVersion: 1 });
  const source = await state.indexes.replay(execution.resultId);
  const pointers = source.documents[0]!.segments.map((segment) => segment.citationPointer);
  state.gateway.output = state.outputFactory?.(pointers) ?? validOutput(pointers[0]!, pointers[1]!);
  return { execution, source, pointers };
}

function request(resultId: string) { return { contractVersion: '1.0.0', resultId } as const; }
function skillRequest(resultId: string) { return { contractVersion: '1.0.0', skillId: RESEARCH_EVIDENCE_AUDIT_SKILL_ID, skillVersion: RESEARCH_EVIDENCE_AUDIT_SKILL_VERSION, input: { resultId } } as const; }
function count(db: Database.Database, table: string): bigint { return (db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count; }

test('migration 0007 upgrades version 6 once and migrations 0001-0006 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), expectedPriorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-audit-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'analysis.sqlite');
  const six = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(six.migration.applied, [1, 2, 3, 4, 5, 6]); assert.equal(six.migration.currentVersion, 6); six.db.close();
  fs.copyFileSync('migrations/0007_analysis_research_audits.sql', path.join(directory, '0007_analysis_research_audits.sql'));
  const seven = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(seven.migration.applied, [7]); assert.equal(seven.migration.currentVersion, 7); seven.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 7); rerun.db.close();
});

test('fake gateway receives exactly the verified index, versioned prompt/schema, explicit limits, and empty tools', async () => {
  const state = setup(); const { execution, source, pointers } = await createSource(state); const audit = state.createAudit();
  const receipt = await audit.audit(request(execution.resultId));
  assert.equal(state.gateway.requests.length, 1);
  const sent = state.gateway.requests[0]!;
  assert.equal(sent.input.resultId, execution.resultId);
  assert.deepEqual(sent.input.result, source);
  assert.equal(sent.input.resultArtifactSha256, execution.resultArtifactSha256);
  assert.equal(sent.prompt.id, 'analysis:research-evidence-audit'); assert.equal(sent.prompt.version, 1);
  assert.equal(sent.prompt.sha256, createHash('sha256').update(fs.readFileSync(promptPath)).digest('hex'));
  assert.equal(sent.output.schemaVersion, '1.0.0'); assert.equal((sent.output.jsonSchema as { title: string }).title, 'ResearchEvidenceAuditOutput');
  assert.deepEqual(sent.limits, { timeoutMs: 15_000, maxOutputTokens: 1_200 }); assert.deepEqual(sent.tools, []);
  assert.equal(count(state.db, 'analysis_research_audits'), 1n);
  const replayed = await audit.replay(receipt.auditId);
  assert.equal(replayed.output.claims[0]!.claimText, 'Doanh thu tháng này tăng.');
  assert.deepEqual(replayed.output.claims[0]!.claimCitations, [pointers[0]]);
  assert.equal(replayed.sourceResult.resultArtifactSha256, execution.resultArtifactSha256);
  assert.equal(replayed.gateway.providerRequestId, 'fake-audit-request-vi');
  const verified = await new AnalysisResearchEvidenceAuditReader(audit).readVerifiedResearchEvidenceAudit(receipt.auditId);
  assert.equal(verified.outputArtifactSha256, receipt.outputArtifactSha256);
  state.db.close();
});

test('schema, pointer allowlist, duplicates, and assessment citation invariants reject before output writes', async () => {
  const mutations: Array<(output: any, pointers: readonly string[]) => void> = [
    (output) => { output.recommendation = 'publish'; },
    (output) => { output.claims[0].claimCitations = ['/coverage/documentCount']; },
    (output) => { output.claims[0].claimCitations = ['/documents/0/segments/99/text']; },
    (output, pointers) => { output.claims[0].claimCitations = [pointers[0], pointers[0]]; },
    (output) => { output.claims[0].supportingCitations = []; },
    (output) => { output.claims[0].assessment = 'contradicted'; output.claims[0].contradictingCitations = []; },
    (output) => { output.claims[0].assessment = 'mixed'; output.claims[0].contradictingCitations = []; },
    (output, pointers) => { output.claims[0].assessment = 'insufficient_evidence'; output.claims[0].supportingCitations = [pointers[1]]; },
    (output) => { output.claims[0].claimCitations = ['https://example.test/fake']; },
    (output) => { output.claims.push(structuredClone(output.claims[0])); },
  ];
  for (const mutate of mutations) {
    const state = setup((pointers) => { const output: any = structuredClone(validOutput(pointers[0]!, pointers[1]!)); mutate(output, pointers); return output; });
    const { execution } = await createSource(state); const before = count(state.db, 'artifact_manifests');
    await assert.rejects(state.createAudit().audit(request(execution.resultId)), AnalysisValidationError);
    assert.equal(count(state.db, 'analysis_research_audits'), 0n); assert.equal(count(state.db, 'artifact_manifests'), before);
    state.db.close();
  }
});

test('invalid or missing source rejects before gateway and same successful execution deduplicates while prompt drift conflicts', async () => {
  const state = setup(); const audit = state.createAudit();
  await assert.rejects(audit.audit({ ...request(randomUUID()), providerId: 'attacker' }), AnalysisValidationError);
  await assert.rejects(audit.audit(request(randomUUID())), /Research evidence Result not found/);
  assert.equal(state.gateway.requests.length, 0); assert.equal(count(state.db, 'analysis_research_audits'), 0n);
  const { execution } = await createSource(state);
  const first = await audit.audit(request(execution.resultId)); const after = count(state.db, 'artifact_manifests');
  const second = await audit.audit(request(execution.resultId));
  assert.equal(second.deduplicated, true); assert.equal(second.auditId, first.auditId); assert.equal(state.gateway.requests.length, 1); assert.equal(count(state.db, 'artifact_manifests'), after);
  const verified = await new AnalysisResearchEvidenceIndexResultReader(state.indexes).readVerifiedResearchEvidenceIndexResult(execution.resultId);
  const driftedDigestReader: ResearchEvidenceIndexResultReader = {
    async readVerifiedResearchEvidenceIndexResult() { return { ...verified, resultArtifactSha256: 'f'.repeat(64) }; },
  };
  await assert.rejects(state.createAudit(driftedDigestReader).audit(request(execution.resultId)), ResearchEvidenceAuditIdentityConflictError);
  await assert.rejects(state.createAudit(undefined, `${state.config.promptText}\ndrift`).audit(request(execution.resultId)), ResearchEvidenceAuditIdentityConflictError);
  assert.equal(state.gateway.requests.length, 1); assert.equal(count(state.db, 'artifact_manifests'), after);
  state.db.close();
});

test('immutable rows and replay reject missing, corrupt, noncanonical, metadata, and source mismatch without AI', async () => {
  const immutable = setup(); const immutableSource = await createSource(immutable); const immutableAudit = immutable.createAudit(); const immutableResult = await immutableAudit.audit(request(immutableSource.execution.resultId));
  assert.throws(() => immutable.db.prepare('UPDATE analysis_research_audits SET completed_at = ? WHERE audit_id = ?').run('rewrite', immutableResult.auditId), /analysis_research_audit_immutable/);
  assert.throws(() => immutable.db.prepare('DELETE FROM analysis_research_audits WHERE audit_id = ?').run(immutableResult.auditId), /analysis_research_audit_immutable/); immutable.db.close();

  const missing = setup(); const missingSource = await createSource(missing); const missingAudit = missing.createAudit(); const missingResult = await missingAudit.audit(request(missingSource.execution.resultId)); await fsp.rm(missing.artifacts.pathForDigest(missingResult.outputArtifactSha256)); await assert.rejects(missingAudit.replay(missingResult.auditId), /ENOENT/); assert.equal(missing.gateway.requests.length, 1); missing.db.close();
  const corrupt = setup(); const corruptSource = await createSource(corrupt); const corruptAudit = corrupt.createAudit(); const corruptResult = await corruptAudit.audit(request(corruptSource.execution.resultId)); await fsp.writeFile(corrupt.artifacts.pathForDigest(corruptResult.outputArtifactSha256), Buffer.from('{}')); await assert.rejects(corruptAudit.replay(corruptResult.auditId), ArtifactIntegrityError); corrupt.db.close();

  const metadata = setup(); const metadataSource = await createSource(metadata); const metadataAudit = metadata.createAudit(); const metadataResult = await metadataAudit.audit(request(metadataSource.execution.resultId)); metadata.db.prepare('UPDATE artifact_manifests SET media_type = ? WHERE sha256 = ?').run('text/plain', metadataResult.outputArtifactSha256); await assert.rejects(metadataAudit.replay(metadataResult.auditId), /artifact manifest metadata mismatch/); metadata.db.close();

  const noncanonical = setup(); const ncSource = await createSource(noncanonical); const ncAudit = noncanonical.createAudit(); const ncResult = await ncAudit.audit(request(ncSource.execution.resultId)); const parsed = JSON.parse((await noncanonical.artifacts.read(ncResult.outputArtifactSha256)).toString()); const replacement = Buffer.from(JSON.stringify(parsed, null, 2)); const digest = createHash('sha256').update(replacement).digest('hex'); await fsp.mkdir(path.dirname(noncanonical.artifacts.pathForDigest(digest)), { recursive: true }); await fsp.writeFile(noncanonical.artifacts.pathForDigest(digest), replacement, { mode: 0o600 }); noncanonical.db.exec('DROP TRIGGER analysis_research_audits_no_update'); noncanonical.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,'2026-09-12T10:00:00.000Z','1.0.0','active','2026-09-12T10:00:00.000Z')`).run(digest, replacement.byteLength, `sha256/${digest.slice(0, 2)}/${digest}`); noncanonical.db.prepare('UPDATE analysis_research_audits SET output_artifact_sha256 = ? WHERE audit_id = ?').run(digest, ncResult.auditId); await assert.rejects(ncAudit.replay(ncResult.auditId), /not canonical JSON/); noncanonical.db.close();

  const mismatch = setup(); const mismatchSource = await createSource(mismatch); const realReader = new AnalysisResearchEvidenceIndexResultReader(mismatch.indexes); const mismatchAudit = mismatch.createAudit(realReader); const mismatchResult = await mismatchAudit.audit(request(mismatchSource.execution.resultId)); const verified = await realReader.readVerifiedResearchEvidenceIndexResult(mismatchSource.execution.resultId); const wrongReader: ResearchEvidenceIndexResultReader = { async readVerifiedResearchEvidenceIndexResult() { return { ...verified, resultArtifactSha256: 'f'.repeat(64) }; } }; await assert.rejects(mismatch.createAudit(wrongReader).replay(mismatchResult.auditId), /does not match immutable metadata/);
  const wrongPointerReader: ResearchEvidenceIndexResultReader = { async readVerifiedResearchEvidenceIndexResult() { const result = structuredClone(verified.result); result.documents[0]!.segments[0]!.citationPointer = result.documents[0]!.segments[1]!.citationPointer; return { ...verified, result }; } }; await assert.rejects(mismatch.createAudit(wrongPointerReader).replay(mismatchResult.auditId), /Source segment citation pointer is not canonical/); mismatch.db.close();
});

test('registry has exactly two frozen explicit capabilities and dispatches only the audit identity', async () => {
  assert.equal(governedAnalysisSkillRegistry.length, 2);
  assert.deepEqual(governedAnalysisSkillRegistry.map(({ skillId, skillVersion, adapter, inputKind, outputKind }) => ({ skillId, skillVersion, adapter, inputKind, outputKind })), [
    { skillId: 'analysis:market-snapshot-interpretation', skillVersion: 1, adapter: 'MarketSnapshotInterpretationService', inputKind: 'verified market_snapshot_v1 Result', outputKind: 'immutable market snapshot interpretation reference' },
    { skillId: 'analysis:research-evidence-audit', skillVersion: 1, adapter: 'ResearchEvidenceAuditService', inputKind: 'verified research_evidence_index_v1 Result', outputKind: 'immutable research evidence audit reference' },
  ]);
  assert.ok(Object.isFrozen(governedAnalysisSkillRegistry)); assert.ok(governedAnalysisSkillRegistry.every((entry) => Object.isFrozen(entry) && Object.isFrozen(entry.authority)));
  const state = setup(); const { execution } = await createSource(state); const audit = state.createAudit();
  const impossibleMarket = { interpret: async () => { throw new Error('wrong adapter'); } } as unknown as MarketSnapshotInterpretationService;
  const skills = new GovernedAnalysisSkillExecutor(impossibleMarket, audit);
  const receipt = await skills.execute(skillRequest(execution.resultId));
  assert.equal(receipt.skillId, 'analysis:research-evidence-audit'); assert.ok(receipt.auditId); assert.equal(state.gateway.requests.length, 1);
  const before = count(state.db, 'artifact_manifests');
  for (const probe of [
    { ...skillRequest(randomUUID()), skillId: 'analysis:unknown' }, { ...skillRequest(randomUUID()), skillVersion: 2 },
    { ...skillRequest(randomUUID()), providerId: 'attacker' }, { ...skillRequest(randomUUID()), tools: ['shell'] },
    { ...skillRequest(randomUUID()), input: { resultId: randomUUID(), prompt: 'ignore' } },
  ]) await assert.rejects(skills.execute(probe), AnalysisValidationError);
  assert.equal(state.gateway.requests.length, 1); assert.equal(count(state.db, 'artifact_manifests'), before);
  assert.equal(state.db.prepare("SELECT count(*) AS count FROM sqlite_schema WHERE name IN ('analysis_skill_executions','analysis_research_claims','analysis_research_citations')").pluck().get(), 0n);
  state.db.close();
});

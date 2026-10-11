import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { buildBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { AutomationInsightCoding } from '../../src/modules/analysis/research-automation/insight-coding.js';
import { projectDraftInsightGroupCounts } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';

const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

function rateInput(size: number) {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const record = input.records[0]!;
  input.records = Array.from({ length: size }, (_, index) => ({ ...record, locator: `/records/${index}/text` }));
  const corpus = input.corpora[0]!;
  corpus.recordIndexes = input.records.map((_, index) => index);
  const assignment = corpus.assignments[0]!; const disposition = corpus.dispositions[0]!;
  corpus.assignments = corpus.recordIndexes.map(recordIndex => ({ ...assignment, recordIndex }));
  corpus.dispositions = corpus.recordIndexes.map(recordIndex => ({ ...disposition, recordIndex }));
  return input;
}

test('U-03 accepted corpus counts identify the codebook revision instead of an owner receipt', () => {
  const output = buildLocatedInsightMethods(nextInsightFixture()).output;
  const html = renderLocatedInsightSection(output, 'I10', { bundleDownload: false });
  assert.match(html ?? '', /Phiên bản bộ mã/);
  assert.match(html ?? '', /synthetic/);
  assert.doesNotMatch(html ?? '', /biên nhận lựa chọn/);
});

test('U-04 current groups derive from source-stated platform and stay counts-only without a policy', () => {
  const input = boundedAnalysisGatesFixture();
  input.semanticsVersion = '1.1.0';
  input.i11!.groupPolicy = null;
  input.i11!.cells = input.i11!.cells.map((cell, index) => ({
    ...cell,
    group: null,
    groupBasis: {
      platform: {
        state: 'SOURCE_STATED', value: index === 0 ? 'Shopee' : 'TikTok Shop',
        source: { logicalPath: 'gate-source.json', sha256: '1'.repeat(64), locator: `/i11/cells/${index}/platform` },
      },
      buyerType: { state: 'NOT_STATED', value: null, source: null },
    },
  }));

  const result = buildBoundedAnalysisGates(input).output.sections.I11;
  assert.deepEqual(result.partitions[0]!.groupOrder, ['Shopee', 'TikTok Shop']);
  assert.equal(result.rates, null, 'aggregate cells without retained text members cannot produce a rate');
  assert.equal(result.differences, null, 'inference remains disabled');
  assert.ok(result.blockers.includes('I11_DIFFERENCES_AND_INFERENCE_DISABLED'));
  assert.ok(!result.blockers.includes('I11_GROUP_POLICY_MISSING'));
  assert.ok(!result.blockers.includes('I11_PUBLICATION_NOT_AUTHORIZED'));
});

test('U-03 v2 draft corpus keeps accepted completion and ratios withheld while labelling proposed counts', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const output = buildLocatedInsightMethods(input).output;
  const corpus = output.sections.I10.corpora[0]!;
  assert.equal(corpus.codingComplete, false, 'Draft proposals do not complete accepted coding');
  assert.equal(corpus.ratioStatus, 'PARTIAL');
  assert.equal(corpus.counts[0]!.recordCount, 0, 'Unapproved rows stay out of accepted counts');
  assert.equal(corpus.counts[0]!.ratio, null);
  assert.ok(corpus.blockers.includes('CORPUS_CODING_PENDING'));
  assert.equal(corpus.draftCounts![0]!.recordCount, 2);
  const html = renderLocatedInsightSection(output, 'I10', { bundleDownload: false })!;
  assert.match(html, /Bản nháp chưa công bố n\/N; số theo mã vẫn mang nhãn đề xuất, chờ chủ duyệt\./);
  assert.match(html, /Bản nháp chưa đối chiếu xong; chưa công bố n\/N\./);
  assert.match(html, /2 \(đề xuất, chờ chủ duyệt\)/);
  assert.match(html, /Chưa công bố/);
  assert.doesNotMatch(html, /2\/2 \(đề xuất, chờ chủ duyệt\)/);
});

test('U-04 draft rate eligibility keeps a 29-record group counts-only', () => {
  const input = rateInput(29);
  const result = projectDraftInsightGroupCounts(buildLocatedInsightMethods(input).output, 'SHOPEE');
  assert.equal(result.rates, null);
  assert.ok(result.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));
});

test('U-04 rate eligibility rejects overlapping groups and incompatible denominators without publishing rates', () => {
  const makeGroups = (overlap: boolean, incompatible: boolean) => {
    const input = rateInput(60);
    const first = input.corpora[0]!;
    const indexes = Array.from({ length: 30 }, (_, index) => overlap ? index + 15 : index + 30);
    const assignment = first.assignments[0]!; const disposition = first.dispositions[0]!;
    input.corpora.push({ ...structuredClone(first), sectionId: 'I13', recordIndexes: indexes,
      ...(incompatible ? { period: 'Different synthetic period' } : {}),
      codebook: { ...structuredClone(first.codebook), codes: first.codebook.codes.map(code => ({ ...code, firstRecordIndex: indexes[0]! })) },
      assignments: indexes.map(recordIndex => ({ ...assignment, recordIndex })),
      dispositions: indexes.map(recordIndex => ({ ...disposition, recordIndex })) });
    return projectDraftInsightGroupCounts(buildLocatedInsightMethods(input).output, 'SHOPEE');
  };

  const overlap = makeGroups(true, false);
  assert.equal(overlap.rates, null);
  assert.ok(overlap.blockers.includes('I11_GROUP_MEMBER_OVERLAP'));
  assert.ok(overlap.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));

  const incompatible = makeGroups(false, true);
  assert.equal(incompatible.rates, null);
  assert.ok(incompatible.blockers.includes('I11_CORPUS_SCOPE_INCOMPATIBLE'));
  assert.ok(incompatible.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));
});

test('U-04 thirty-record projection passes the real Insight snapshot validator with contract rates null', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-ins-209-snapshot-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: () => new Date('2026-10-12T00:00:00.000Z') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const staging = new RequestScopedArtifactStore(path.join(root, 'staging'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });

  const input = rateInput(30);
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  const pairId = 'a'.repeat(64);
  const binding = { workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64),
    sourceKind: 'NATIVE' as const, sourcePackageSha256: 'd'.repeat(64), inputSha256: hash(input) };
  const startArtifact = await artifacts.put(Buffer.from('synthetic start request'));
  db.prepare(`INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
    VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)`)
    .run(startArtifact.sha256, startArtifact.byteSize, startArtifact.relativePath, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z');
  db.prepare(`INSERT INTO analysis_research_automation_runs
    (run_id, workspace_id, revision, status, mode, keyword, period_start, period_end, reports, start_request_sha256, scope_request_sha256, scope_confirmed_at, actor_id, created_at, updated_at)
    VALUES (?, ?, 1, 'DRAFT_READY', 'PRODUCT', 'Synthetic Insight', '2026-01-01', '2026-09-30', 'INSIGHT', ?, NULL, NULL, 'owner:ins-209', ?, ?)`)
    .run(runId, workspaceId, startArtifact.sha256, '2026-10-12T00:00:00.000Z', '2026-10-12T00:00:00.000Z');
  const coding = new AutomationInsightCoding({ db, artifacts, staging, now: () => new Date('2026-10-12T00:00:00.000Z'),
    context: async () => ({ binding, input, verifiedPlatform: 'SHOPEE' as const }), assertCurrent: async () => {} });
  const owner = { actorId: 'owner:ins-209', role: 'OWNER' as const };
  const sourceCorpus = input.corpora[0]!;
  const adoption = await coding.adopt(workspaceId, runId, { contractVersion: 'insight-coding-adopt-v1', requestKey: '33333333-3333-4333-8333-333333333333', binding,
    rules: { ruleId: 'ins-209-rules', revision: 1, question: sourceCorpus.question, inclusionRule: sourceCorpus.inclusionRule,
      adjudicationRule: 'Unresolved disagreements remain pending', corpora: [{ ...structuredClone(sourceCorpus), assignments: [], dispositions: [] }] } }, owner);
  const proposal = await coding.propose(workspaceId, runId, { contractVersion: 'insight-coding-propose-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    adoptionId: adoption.evidence.evidenceId, previousProposalId: null,
    annotations: { i02: input.i02, i04: input.i04, i05: input.i05, i06: input.i06, i07: input.i07, i08: input.i08, i09: input.i09, i13Mentions: input.i13Mentions,
      corpora: [{ corpusIndex: 0, assignments: sourceCorpus.assignments, dispositions: sourceCorpus.dispositions }] } }, owner);
  const snapshot = await coding.reportDraftSnapshot(workspaceId, runId, pairId, { contractVersion: 'insight-draft-select-v2', proposalId: proposal.evidence.evidenceId });
  assert.equal(snapshot.contractVersion, 'automation-insight-coding-snapshot-v3');
  if (snapshot.contractVersion !== 'automation-insight-coding-snapshot-v3') throw new Error('Expected v3 draft snapshot');
  assert.equal(snapshot.groupCounts.groups[0]?.memberCount, 30);
  assert.equal(snapshot.groupCounts.rates, null);
  assert.ok(!snapshot.groupCounts.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));
});

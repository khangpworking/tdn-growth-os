import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { buildLocatedInsightMethods, verifyLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { insightModelPrompt } from '../../src/modules/analysis/research-automation/insight-model-execution.js';
import { projectDraftInsightGroupCounts } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';

const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const families = ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09'] as const;

test('historical methods, HTML and v3 prompt retain pre-change bytes', () => {
  for (const [flag, methodSha, htmlSha] of [
    [undefined, 'eb9264d0d977f4b219a5edc17b28e067785ba0f80542d9afd793700b067b35b0', '035c8108fd27be3161bde9e58ab1f5de677c37eced162c0c5e054fffd904c486'],
    ['draft-counts-v1', '2f61c7042d6fd626dcc41a97645cea98b797b6d710317ed60f716219171678ce', 'f88aff874511740b8a3d1f168fa028d06c221a3f3ef3ea26f1c7202bf56a6852'],
  ] as const) {
    const input = nextInsightFixture();
    if (flag) input.draftCountsVersion = flag;
    const built = buildLocatedInsightMethods(input);
    assert.equal(sha(built.bytes), methodSha);
    assert.equal(sha([...families, 'I10'].map(id => renderLocatedInsightSection(built.output, id)).join('\n')), htmlSha);
    assert.deepEqual(verifyLocatedInsightMethods(built.output).bytes, built.bytes);
  }
  assert.equal(sha(insightModelPrompt('insight-model-prompt-v3').systemText), '004a9907dc96e686778de38fe785f2efde38df6e73edcad1893ab22610f4561f');
  assert.ok(!insightModelPrompt('insight-model-prompt-v3').systemText.includes('draft-counts-v2'));
  assert.ok(insightModelPrompt('insight-model-prompt-v4').systemText.includes('draft-counts-v2'));
});

test('v2 exposes every eligible draft family with disjoint accepted semantics and stable record dedupe', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const built = buildLocatedInsightMethods(input);
  for (const id of families) {
    assert.equal(built.output.sections[id].locatedRecordCount, 0);
    assert.ok(built.output.sections[id].draftAnnotationPointers!.length > 0, id);
    assert.ok(built.output.sections[id].blockers.includes('CODING_PENDING'));
    const html = renderLocatedInsightSection(built.output, id)!;
    assert.match(html, /data-classified="pending">[12] bản ghi \(đề xuất, chờ chủ duyệt\)\./);
    assert.ok(!html.includes('chỉ hỗ trợ I02/I10/I13'));
  }
  assert.equal(built.output.sections.I04.draftLocatedRecordCount, 2, 'Distinct locators count separately; duplicate stable identity counts once');
  assert.deepEqual(built.output.sections.I05.recordPolarities, []);
  assert.deepEqual(built.output.sections.I05.draftRecordPolarities, [
    { recordPointer: '/input/records/0', polarity: 'MIXED' }, { recordPointer: '/input/records/1', polarity: 'POSITIVE' },
  ]);
  assert.deepEqual(built.output.sections.I06.sequences, []);
  assert.equal(built.output.sections.I06.draftSequences!.length, 1);
  assert.match(renderLocatedInsightSection(built.output, 'I06')!, /Thứ tự do nguồn nêu trong cùng bản ghi/);
  assert.deepEqual(built.output.sections.I09.candidates, []);
  assert.deepEqual(built.output.sections.I09.draftCandidates!.map(row => [row.state, row.unmetNeedCandidate]), [['EXPLICIT_GAP', true], ['DESIRE_ONLY', false]]);
  assert.match(renderLocatedInsightSection(built.output, 'I09')!, /Chỉ có mong muốn/);
  assert.ok(built.output.sections.I09.blockers.includes('I09_INCOMPLETE_GAP_EVIDENCE'));
  assert.deepEqual(built.output.input, input, 'No evidence or provenance rewrite');
  assert.deepEqual(verifyLocatedInsightMethods(built.output).bytes, built.bytes);
});

test('disagreement stays out of all draft semantic outputs and complete raw ratios remain withheld in display', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  for (const key of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09'] as const) {
    for (const row of input[key]) row.provenance.disagreement = 'Unresolved source-local interpretation';
  }
  const output = buildLocatedInsightMethods(input).output;
  for (const id of families) assert.equal(output.sections[id].draftLocatedRecordCount, 0);
  assert.deepEqual(output.sections.I05.draftRecordPolarities, []);
  assert.deepEqual(output.sections.I06.draftSequences, []);
  assert.deepEqual(output.sections.I09.draftCandidates, []);
  assert.match(renderLocatedInsightSection(output, 'I05')!, /0 bản ghi \(đề xuất, chờ chủ duyệt\)/);
  assert.match(renderLocatedInsightSection(output, 'I10')!, /Chưa công bố/);
  const invalid = structuredClone(output); invalid.sections.I05.draftRecordPolarities!.push({ recordPointer: '/input/records/0', polarity: 'POSITIVE' });
  assert.throws(() => verifyLocatedInsightMethods(invalid), /REPLAY_MISMATCH/);
});

test('I11 group counts need authenticated platform proof, retain exact codebook scope and exclude ineligible dispositions', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const output = buildLocatedInsightMethods(input).output;
  const absent = projectDraftInsightGroupCounts(output);
  assert.equal(absent.platform, null);
  assert.deepEqual(absent.groups, []);
  assert.ok(absent.blockers.includes('I11_PLATFORM_EVIDENCE_UNAVAILABLE'));
  const proven = projectDraftInsightGroupCounts(output, 'SHOPEE');
  assert.equal(proven.groups[0]!.memberCount, 2);
  assert.equal(proven.groups[0]!.counts[0]!.recordCount, 2);
  assert.deepEqual(proven.groups[0]!.counts[0]!.recordPointers, ['/input/records/0', '/input/records/1']);
  assert.equal(proven.groups[0]!.codebookRevision, input.corpora[0]!.codebook.revision);
  assert.equal(proven.groups[0]!.scope.period, input.corpora[0]!.period);
  assert.equal(proven.rates, null);
  assert.equal(proven.differences, null);

  for (const state of ['PENDING', 'UNCLEAR', 'UNCODED'] as const) {
    const ineligible = nextInsightFixture(); ineligible.draftCountsVersion = 'draft-counts-v2';
    for (const row of ineligible.corpora[0]!.dispositions) row.state = state;
    const groups = projectDraftInsightGroupCounts(buildLocatedInsightMethods(ineligible).output, 'SHOPEE');
    assert.deepEqual(groups.groups[0]!.counts[0]!.recordPointers, []);
    assert.equal(groups.groups[0]!.counts[0]!.recordCount, null, 'Absent eligible code membership is missing, not a verified zero');
  }
  const disputed = nextInsightFixture(); disputed.draftCountsVersion = 'draft-counts-v2';
  disputed.corpora[0]!.dispositions[0]!.provenance.disagreement = 'Unresolved disposition';
  disputed.corpora[0]!.dispositions[2]!.provenance.disagreement = 'Unresolved disposition';
  const disputedGroups = projectDraftInsightGroupCounts(buildLocatedInsightMethods(disputed).output, 'SHOPEE');
  assert.equal(disputedGroups.groups[0]!.counts[0]!.recordCount, 1);
  assert.deepEqual(disputedGroups.groups[0]!.counts[0]!.recordPointers, ['/input/records/1']);
});

test('I11 draft bridge keeps rates withheld at thirty text records and named incomplete membership/scope', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const record = input.records[0]!;
  input.records = Array.from({ length: 30 }, (_, index) => ({ ...record, locator: `/records/${index}/text` }));
  const corpus = input.corpora[0]!;
  corpus.recordIndexes = input.records.map((_, index) => index);
  const assignment = corpus.assignments[0]!; const disposition = corpus.dispositions[0]!;
  corpus.assignments = corpus.recordIndexes.map(recordIndex => ({ ...assignment, recordIndex }));
  corpus.dispositions = corpus.recordIndexes.map(recordIndex => ({ ...disposition, recordIndex }));
  const groups = projectDraftInsightGroupCounts(buildLocatedInsightMethods(input).output, 'SHOPEE');
  assert.equal(groups.groups[0]!.memberCount, 30);
  assert.equal(groups.groups[0]!.counts[0]!.recordCount, 30);
  assert.equal(groups.rates, null, 'Sample size alone cannot bypass draft classification/U11 gate');
  corpus.membershipComplete = false; corpus.period = null;
  const incomplete = projectDraftInsightGroupCounts(buildLocatedInsightMethods(input).output, 'SHOPEE');
  assert.ok(incomplete.groups[0]!.blockers.includes('I11_MEMBERSHIP_INCOMPLETE'));
  assert.ok(incomplete.groups[0]!.blockers.includes('I11_CORPUS_SCOPE_INCOMPLETE'));
  assert.equal(incomplete.groups[0]!.scope.period, null);
  assert.equal(incomplete.rates, null);
});

test('draft I09 preserves current-only and unlinked pairs without claiming unmet needs; old flags reject new arrays', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const gap = input.i09[0]!;
  input.i09.push({ ...gap, desiredState: null, relation: null }, { ...gap, relation: null });
  const result = buildLocatedInsightMethods(input).output;
  assert.deepEqual(result.sections.I09.draftCandidates!.map(row => [row.state, row.unmetNeedCandidate]),
    [['EXPLICIT_GAP', true], ['CURRENT_STATE_ONLY', false], ['RELATION_UNCLEAR', false], ['DESIRE_ONLY', false]]);
  const oldFlag = structuredClone(result); oldFlag.input.draftCountsVersion = 'draft-counts-v1';
  assert.throws(() => verifyLocatedInsightMethods(oldFlag), /INVALID_LOCATED_INSIGHT_OUTPUT/);
  const excluded = nextInsightFixture(); excluded.draftCountsVersion = 'draft-counts-v2';
  excluded.records[0]!.disposition = 'EXCLUDED'; excluded.records[0]!.dispositionReason = 'Synthetic excluded row';
  excluded.records[2] = { ...excluded.records[0]! };
  assert.throws(() => buildLocatedInsightMethods(excluded), /ANNOTATION_RECORD_NOT_INCLUDED/);
});

test('new draft measurement captions and paginated count notes retain same-sentence labels while full verbatim quotes stay inert', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const record = input.records[0]!;
  input.records = Array.from({ length: 25 }, (_, index) => ({ ...record,
    locator: `/records/${index}/text`, text: `${record.text} This is the source saying tốt nhất.` }));
  const action = input.i04[0]!;
  input.i04 = input.records.map((_, recordIndex) => ({ ...action, recordIndex }));
  const html = renderLocatedInsightSection(buildLocatedInsightMethods(input).output, 'I04')!;
  assert.match(html, /data-classified="pending">Đang hiển thị 20 trong 25 chú giải đề xuất, theo thứ tự của hồ sơ \(đề xuất, chờ chủ duyệt\)\./);
  assert.match(html, /<blockquote[^>]*>[^<]*source saying tốt nhất\./);
  assert.ok(lintVisibleReportText(html).every(check => check.ok));
  assert.equal(lintVisibleReportText(html + '<p>Đây là cách tốt nhất.</p>').find(check => check.rule === 'U13_SUPERLATIVE')!.ok, false);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { insightModelPrompt } from '../../src/modules/analysis/research-automation/insight-model-execution.js';
import frozenV2PromptSchemas from '../../src/modules/analysis/research-automation/insight-model-prompt-v2-schemas.json' with { type: 'json' };
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

type Input = LocatedInsightMethods['input'];
type Provenance = Input['i04'][number]['provenance'];
const DRAFT_LABEL = 'đề xuất, chờ chủ duyệt';

const declared: Provenance = { basis: 'DECLARED', coderRole: 'synthetic coder', adjudication: null, disagreement: null };
const pendingAi = (): Provenance => ({ basis: 'PENDING_AI', coderRole: 'synthetic suggestion', adjudication: null, disagreement: null });
const disputed = (): Provenance => ({ basis: 'PENDING_AI', coderRole: 'synthetic suggestion', adjudication: null, disagreement: 'Clause remains disputed' });

function addRecord(input: Input, text: string): number {
  const index = input.records.length;
  input.records.push({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic account', timeText: null, disposition: 'INCLUDED', dispositionReason: null });
  return index;
}

function i02Row(recordIndex: number, provenance: Provenance): Input['i02'][number] {
  const empty = { state: 'NOT_STATED' as const, span: null };
  return { recordIndex, provenance, qualifiers: [], counterevidence: [],
    role: empty, situation: empty, task: empty, setting: empty, time: empty };
}

function summaryFixture(withDraftFlag: boolean): Input {
  const input = locatedInsightFixture();
  const accepted = addRecord(input, 'I bought A.');
  const draftable = addRecord(input, 'I tried B.');
  const contested = addRecord(input, 'I chose C.');
  input.i02 = [
    { ...i02Row(accepted, { ...declared, basis: 'HUMAN_REVIEWED', adjudication: 'Reviewed' }) },
    { ...i02Row(draftable, pendingAi()) },
    { ...i02Row(contested, disputed()) },
  ];
  if (withDraftFlag) { input.semanticsVersion = '1.1.0'; input.draftCountsVersion = 'draft-counts-v1'; }
  return input;
}

test('U-03 summary counts eligible retained proposals without touching accepted output', () => {
  const legacy = buildLocatedInsightMethods(summaryFixture(false)).output;
  assert.equal(legacy.sections.I02.locatedRecordCount, 1);
  assert.deepEqual(legacy.sections.I02.annotationPointers, ['/input/i02/0']);
  assert.deepEqual(legacy.sections.I02.pendingAnnotationPointers, ['/input/i02/1', '/input/i02/2']);
  assert.ok(!('draftAnnotationPointers' in legacy.sections.I02), 'Legacy output keeps accepted-only bytes');
  assert.ok(!('draftCountsVersion' in legacy.input), 'Legacy input echoes no draft flag');

  const draft = buildLocatedInsightMethods(summaryFixture(true)).output;
  assert.equal(draft.sections.I02.locatedRecordCount, 1, 'Accepted record count unchanged');
  assert.deepEqual(draft.sections.I02.annotationPointers, ['/input/i02/0']);
  assert.deepEqual(draft.sections.I02.draftAnnotationPointers, ['/input/i02/0', '/input/i02/1'],
    'Draft totals include eligible accepted rows plus pending proposals, disagreements excluded');
  assert.deepEqual(draft.sections.I02.draftRecordPointers, ['/input/records/0', '/input/records/1']);
  assert.equal(draft.sections.I02.draftLocatedRecordCount, 2);
  assert.equal(draft.sections.I02.draftLabel, DRAFT_LABEL);
  assert.equal(draft.sections.I02.draftCountsVersion, 'draft-counts-v1');
  // Other families keep accepted-only output: draft eligibility is I02-scoped.
  assert.ok(!('draftAnnotationPointers' in draft.sections.I04));
  // Provenance is never rewritten to approved; disagreements stay pending.
  assert.deepEqual(draft.input.i02.map(row => [row.provenance.basis, row.provenance.disagreement]),
    [['HUMAN_REVIEWED', null], ['PENDING_AI', null], ['PENDING_AI', 'Clause remains disputed']]);
  assert.deepEqual(draft.sections.I02.pendingAnnotationPointers, ['/input/i02/1', '/input/i02/2']);
  assert.ok(draft.sections.I02.blockers.includes('CODING_PENDING'));
});

const REVIEWED = { basis: 'HUMAN_REVIEWED', coderRole: 'synthetic coder', adjudication: 'Reviewed', disagreement: null } as const;
const PENDING = { basis: 'PENDING_AI', coderRole: 'synthetic suggestion', adjudication: null, disagreement: null } as const;

function corpusFixture(withDraftFlag: boolean): Input {
  const input = locatedInsightFixture();
  const texts = ['packaging', 'taste', 'packaging and taste', 'packaging'];
  input.records = texts.map((text, index) => ({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic source', timeText: null, disposition: 'INCLUDED', dispositionReason: null }));
  const span = (quote: string) => ({ start: 0, end: quote.length, quote });
  input.corpora = [{
    sectionId: 'I10', recordIndexes: [0, 1, 2, 3], question: 'Which literal topics occur?',
    unit: 'source-native record', period: 'January 2026', frame: 'Four frozen records', channel: 'synthetic text',
    inclusionRule: 'All retained records', membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
    codebook: { revision: 'synthetic-corpus-v1', codes: [
      { code: 'T001', label: 'packaging', phrase: 'packaging', firstRecordIndex: null, firstSpan: null },
      { code: 'T002', label: 'taste', phrase: 'taste', firstRecordIndex: null, firstSpan: null },
    ] },
    assignments: [
      { recordIndex: 0, code: 'T001', span: span('packaging'), provenance: { ...REVIEWED } },
      { recordIndex: 2, code: 'T001', span: span('packaging'), provenance: { ...PENDING } },
      { recordIndex: 2, code: 'T001', span: span('packaging'), provenance: { ...PENDING } },
      { recordIndex: 2, code: 'T002', span: { start: 14, end: 19, quote: 'taste' }, provenance: { ...PENDING } },
      { recordIndex: 3, code: 'T001', span: span('packaging'), provenance: { ...PENDING } },
    ],
    dispositions: [
      { recordIndex: 0, state: 'CODED' as const, provenance: { ...REVIEWED } },
      { recordIndex: 1, state: 'UNCODED' as const, provenance: { ...REVIEWED } },
      { recordIndex: 2, state: 'CODED' as const, provenance: { ...REVIEWED } },
      { recordIndex: 3, state: 'PENDING' as const, provenance: { ...PENDING } },
    ],
  }];
  if (withDraftFlag) { input.semanticsVersion = '1.1.0'; input.draftCountsVersion = 'draft-counts-v1'; }
  return input;
}

test('U-03 corpus draft counts keep accepted ratios unreleased and pending tallies intact', () => {
  const legacy = buildLocatedInsightMethods(corpusFixture(false)).output.sections.I10.corpora[0]!;
  assert.deepEqual(legacy.counts, [
    { code: 'T001', recordCount: 1, ratio: null, annotationPointers: ['/input/corpora/0/assignments/0'] },
    { code: 'T002', recordCount: 0, ratio: null, annotationPointers: [] },
  ]);
  assert.ok(!('draftCounts' in legacy), 'Legacy corpus output keeps accepted-only bytes');
  assert.equal(legacy.pendingCount, 2);

  const draft = buildLocatedInsightMethods(corpusFixture(true)).output.sections.I10.corpora[0]!;
  assert.deepEqual(draft.counts, [
    { code: 'T001', recordCount: 1, ratio: null, annotationPointers: ['/input/corpora/0/assignments/0'] },
    { code: 'T002', recordCount: 0, ratio: null, annotationPointers: [] },
  ]);
  assert.deepEqual(draft.draftCounts, [
    { code: 'T001', recordCount: 2, annotationPointers: ['/input/corpora/0/assignments/0', '/input/corpora/0/assignments/1', '/input/corpora/0/assignments/2'], label: DRAFT_LABEL },
    { code: 'T002', recordCount: 1, annotationPointers: ['/input/corpora/0/assignments/3'], label: DRAFT_LABEL },
  ]);
  assert.equal(draft.draftLabel, DRAFT_LABEL);
  assert.equal(draft.draftCountsVersion, 'draft-counts-v1');
  assert.equal(draft.pendingCount, 2, 'Draft eligibility never clears the pending tally');
  assert.equal(draft.codingComplete, false);
  assert.ok(draft.blockers.includes('CORPUS_CODING_PENDING'), 'Unresolved work cannot yield released counts');
});

test('U-03 draft excludes non-CODED dispositions even with pending proposals', () => {
  const input = corpusFixture(true);
  const output = buildLocatedInsightMethods(input).output.sections.I10.corpora[0]!;
  const t001 = output.draftCounts!.find(count => count.code === 'T001')!;
  assert.ok(!t001.annotationPointers.some(pointer => pointer.endsWith('/assignments/4')),
    'Record 3 has a pending proposal but a PENDING disposition: excluded from draft counts');
  assert.deepEqual([output.pendingCount, output.uncodedCount, output.codedCount], [2, 1, 1]);
});

test('U-03 renderers label every draft number in the same sentence and leave legacy HTML untouched', () => {
  const legacyHtml = renderLocatedInsightSection(buildLocatedInsightMethods(corpusFixture(false)).output, 'I10')!;
  assert.equal(legacyHtml.includes(DRAFT_LABEL), false, 'Legacy HTML carries no draft copy');
  const draftHtml = renderLocatedInsightSection(buildLocatedInsightMethods(corpusFixture(true)).output, 'I10')!;
  assert.match(draftHtml, /2 \(đề xuất, chờ chủ duyệt\)/, 'Draft corpus count carries the label in the same sentence');
  assert.match(draftHtml, /Số bản ghi theo mã \(đề xuất, chờ chủ duyệt\)/);

  const legacySummary = renderLocatedInsightSection(buildLocatedInsightMethods(summaryFixture(false)).output, 'I02')!;
  assert.equal(legacySummary.includes(DRAFT_LABEL), false);
  const draftSummary = renderLocatedInsightSection(buildLocatedInsightMethods(summaryFixture(true)).output, 'I02')!;
  assert.match(draftSummary, /2 bản ghi \(đề xuất, chờ chủ duyệt\)\./);
});

test('U-03 unsupported families withhold totals with an explicit explanation', () => {
  const flagged = summaryFixture(true);
  flagged.i04 = [{ recordIndex: 0, provenance: pendingAi(), qualifiers: [], counterevidence: [],
    span: { start: 0, end: 10, quote: 'I bought A' }, eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  const flaggedHtml = renderLocatedInsightSection(buildLocatedInsightMethods(flagged).output, 'I04')!;
  assert.match(flaggedHtml, /Bản nháp này chưa tính số đề xuất cho mục I04 \(chỉ hỗ trợ I02\/I10\/I13\); không hiển thị số đã chấp nhận ở đây\./);
  assert.equal(flaggedHtml.includes('bản ghi có mã hóa được hồ sơ đưa vào kết quả'), false, 'No bare accepted totals in draft view');
  assert.equal(flaggedHtml.includes('Chú giải được hồ sơ đưa vào kết quả'), false, 'No accepted table in draft view');
  const plain = summaryFixture(false);
  plain.i04 = flagged.i04;
  const legacyHtml = renderLocatedInsightSection(buildLocatedInsightMethods(plain).output, 'I04')!;
  assert.equal(legacyHtml.includes('chưa tính số đề xuất'), false, 'Legacy HTML carries no draft copy');
  assert.match(legacyHtml, /0 bản ghi có mã hóa được hồ sơ đưa vào kết quả/);
  const draftCorpus = renderLocatedInsightSection(buildLocatedInsightMethods(corpusFixture(true)).output, 'I10')!;
  assert.match(draftCorpus, /Số tổng hợp và phạm vi chi tiết của tập này được tính theo trạng thái mã hóa đã lưu, không hiển thị ở bản nháp/);
  assert.equal(draftCorpus.includes('Phạm vi và mức hoàn tất mã hóa'), false, 'No accepted coverage block in draft view');
  assert.match(draftCorpus, /2 \(đề xuất, chờ chủ duyệt\)/);
});

test('U-03 draft view suppresses ratios without touching raw complete counts', () => {
  const input = corpusFixture(false);
  input.corpora[0]!.assignments = [{ recordIndex: 0, code: 'T001', span: { start: 0, end: 9, quote: 'packaging' }, provenance: { ...REVIEWED } }];
  input.corpora[0]!.dispositions = [0, 1, 2, 3].map(recordIndex => ({ recordIndex,
    state: recordIndex === 0 ? 'CODED' as const : 'UNCODED' as const, provenance: { ...REVIEWED } }));
  input.semanticsVersion = '1.1.0';
  input.draftCountsVersion = 'draft-counts-v1';
  const corpus = buildLocatedInsightMethods(input).output.sections.I10.corpora[0]!;
  assert.equal(corpus.ratioStatus, 'COMPLETE');
  assert.deepEqual(corpus.counts[0]!.ratio, { numerator: 1, denominator: 4 }, 'Raw accepted ratio still publishes when complete');
  assert.deepEqual(corpus.draftCounts![0]!.recordCount, 1);
  const html = renderLocatedInsightSection(buildLocatedInsightMethods(input).output, 'I10')!;
  assert.match(html, /1 \(đề xuất, chờ chủ duyệt\)/);
  assert.match(html, /Chưa công bố/, 'Draft display never publishes ratios, even when raw counts are complete');
  assert.equal(html.includes('1/3'), false);
});

test('U-03 draft requires current method semantics and enforces the declared single-code invariant', () => {
  const stale = summaryFixture(true);
  delete stale.semanticsVersion;
  assert.throws(() => buildLocatedInsightMethods(stale), /DRAFT_REQUIRES_CURRENT_SEMANTICS/);
  const old = summaryFixture(true);
  old.semanticsVersion = '1.0.0';
  assert.throws(() => buildLocatedInsightMethods(old), /DRAFT_REQUIRES_CURRENT_SEMANTICS/);
  const single = corpusFixture(true);
  single.corpora[0]!.multiCode = false;
  assert.throws(() => buildLocatedInsightMethods(single), /DRAFT_MULTICODE_NOT_ALLOWED/,
    'One record with draft assignments in two codes violates the declared single-code corpus');
});

test('U-03 prompt v3 carries draft fragments while released v1/v2 bytes stay frozen', () => {
  assert.equal(
    createHash('sha256').update(canonicalJson(frozenV2PromptSchemas.annotations), 'utf8').digest('hex'),
    'a5cc806c7f3f61f1ae5f37f0e32912efc11edafa446b4c8a804c9eee376cb3bf');
  assert.equal(
    createHash('sha256').update(canonicalJson(frozenV2PromptSchemas.locatedDefinitions), 'utf8').digest('hex'),
    '3495d13a1e104df9100ab3a4b4e8db0e08518cdd94fdab0a30551f90120ee09a');
  const v2 = insightModelPrompt('insight-model-prompt-v2');
  const v3 = insightModelPrompt('insight-model-prompt-v3');
  assert.equal(v2.systemText.includes('draft-counts-v1'), false, 'Released v2 predates draft fields');
  assert.equal(v2.systemText.includes(DRAFT_LABEL), false);
  assert.ok(v3.systemText.includes('draft-counts-v1'), 'v3 embeds the draft eligibility fields');
  assert.ok(v3.systemText.includes('Do not infer people counts, causality'), 'v3 keeps the lifted persona ban wording');
  assert.equal(v3.contractVersion, 'insight-model-prompt-v3');
});

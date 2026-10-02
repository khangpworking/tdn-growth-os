import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { selectExactShopeeListings, validateExactShopeeRequest } from '../../src/modules/foundation/shopee-exact-selection.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { jsonBytes } from '../../src/modules/foundation/shopee-selection.js';
import { buildResearchReviewCorpus } from '../../src/modules/analysis/research-automation/review-corpus.js';
import { validateLocatedInsightInput } from '../../src/modules/analysis/located-insight-methods.js';
import { codeLiteralReviews, readLiteralReviewRulesV1 } from '../../src/modules/analysis/research-automation/literal-review-coding.js';

// Synthetic sentences only. Expected codes are proposed literal-rule readings, not human-labelled ground truth.
const roots: string[] = [];
afterEach(async () => {
  for (const directory of roots.splice(0)) {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tdn-literal-review-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
const review = (reviewId: string | null, comment: unknown) => ({ shopId: '78085196', itemId: '17678138164', reviewId, ratingStar: 5, comment });
async function corpusOf(pages: unknown[][]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-literal-review-')); roots.push(directory);
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  try {
    const foundation = new ShopeeCollectionService(db, new ContentAddressedArtifactStore(path.join(directory, 'artifacts')));
    const request = validateExactShopeeRequest({ contractVersion: '2.0.0', runKey: 'synthetic-literal-review', topic: 'Synthetic literal review coding',
      selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic owner request', acquiredAt: '2026-10-02T00:00:00Z' },
      productUrls: ['https://shopee.vn/product/78085196/17678138164'] });
    const collected = await new FixtureShopeeCollector(jsonBytes(pages[0] ?? [])).collect(selectExactShopeeListings(request).selected);
    let offset = 0;
    collected.pages = pages.map(rows => { const page = { bytes: jsonBytes(rows), offset }; offset += rows.length; return page; });
    return buildResearchReviewCorpus(await foundation.saveExact(jsonBytes(request), collected));
  } finally { db.close(); }
}
type Span = { start: number; end: number; quote: string };
const sp = (span: Span | null) => span && [span.start, span.end, span.quote];
const sha256 = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const RULES = readLiteralReviewRulesV1();
const locatedInput = (coding: ReturnType<typeof codeLiteralReviews>['output']) => ({
  contractVersion: '1.0.0', codebookId: coding.rules.codebookId, profileSha256: coding.rules.profileSha256,
  adoptionSha256: coding.rules.adoptionSha256, question: null, inclusionRule: 'Synthetic literal rule proposal check',
  codingUnit: 'LOCATED_RECORD', adjudicationRule: 'Not adjudicated; rule-generated declaration', brief: null,
  sources: [{ logicalPath: 'synthetic/research-review-corpus.json', sha256: coding.locatedSource.sha256 }],
  records: coding.records, ...coding.candidates, i06: [], i09: [], corpora: [], i13Mentions: [],
});

const NFD_TEXT = 'Tôi đã dùng sản phẩm.'.normalize('NFD');
// [text, expected I04 candidates [kind, attribution, span, qualifiers], expected I04 pending reasons]
const SENTENCES: [string, [string, string, unknown, unknown[]][], string[]][] = [
  ['Tôi đã dùng sản phẩm.', [['ACTION_REPORTED', 'SELF_REPORTED', [0, 20, 'Tôi đã dùng sản phẩm'], []]], []],
  ['Tôi thử đặt mua nhưng không đặt được.', [['ATTEMPT_REPORTED', 'SELF_REPORTED', [0, 36, 'Tôi thử đặt mua nhưng không đặt được'],
    [[4, 7, 'thử'], [22, 36, 'không đặt được']]]], []],
  ['Tôi đã dùng hết hộp.', [['COMPLETION_REPORTED', 'SELF_REPORTED', [0, 19, 'Tôi đã dùng hết hộp'], [[12, 15, 'hết']]]], []],
  ['Tôi chưa dùng sản phẩm.', [['NO_ACTION_EXPLICIT', 'SELF_REPORTED', [0, 22, 'Tôi chưa dùng sản phẩm'], [[4, 8, 'chưa']]]], []],
  ['Bạn tôi nói đã dùng sản phẩm.', [['ACTION_REPORTED', 'OTHER_REPORTED', [0, 28, 'Bạn tôi nói đã dùng sản phẩm'], [[0, 11, 'Bạn tôi nói']]]], []],
  ['Nếu mua, tôi sẽ dùng thử.', [], ['CONDITIONAL_SCOPE', 'CONDITIONAL_SCOPE']],
  ['😀 TÔI ĐÃ DÙNG SẢN PHẨM.', [['ACTION_REPORTED', 'SELF_REPORTED', [3, 23, 'TÔI ĐÃ DÙNG SẢN PHẨM'], []]], []],
  ['Con mình ăn hết hộp.', [], ['THIRD_PARTY_ACTOR']],
  ['Tôi không dùng sản phẩm.', [], ['NEGATED_VERB_AMBIGUOUS']],
  ['Nếu mua, tôi sẽ dùng thử. Tôi đã dùng sản phẩm.', [['ACTION_REPORTED', 'SELF_REPORTED', [26, 46, 'Tôi đã dùng sản phẩm'], []]], ['CONDITIONAL_SCOPE', 'CONDITIONAL_SCOPE']],
  ['Sản phẩm không ngon.', [], ['NO_RULE_MATCH']],
  ['Nghe nói sản phẩm tốt.', [], ['NO_RULE_MATCH']],
  ['Tôi mua không phải vì giá rẻ.', [['ACTION_REPORTED', 'SELF_REPORTED', [0, 7, 'Tôi mua'], []]], []],
  ['Vì giá rẻ nên tôi mua.', [], ['AMBIGUOUS_RESULT_LINKER']],
  ['Giá rẻ nên mua.', [], ['AMBIGUOUS_RESULT_LINKER']],
  ['Bé thích lắm.', [], ['NO_RULE_MATCH']],
  ['Tôi đặt hàng nhưng hết hàng.', [['ACTION_REPORTED', 'SELF_REPORTED', [0, 27, 'Tôi đặt hàng nhưng hết hàng'], [[19, 27, 'hết hàng']]]], []],
  ['Tôi đã mua nhưng thất vọng.', [['ACTION_REPORTED', 'SELF_REPORTED', [0, 10, 'Tôi đã mua'], []]], []],
  ['Tôi mua cho con ăn hàng ngày.', [['ACTION_REPORTED', 'SELF_REPORTED', [0, 28, 'Tôi mua cho con ăn hàng ngày'], []]], []],
  ['Ai đã dùng sản phẩm này?', [], ['QUESTION_SENTENCE']],
  ['Tôi ko dùng.', [], ['INFORMAL_OR_UNACCENTED_MARKER']],
  [NFD_TEXT, [], ['NON_NFC_TEXT']],
];

test('literal rules code exact original-text spans with negation, hearsay, conditional, relation and pending context intact', async () => {
  const corpus = await corpusOf([SENTENCES.map(([text], index) => review(String(index + 1), text))]);
  const corpusBefore = Buffer.from(corpus.bytes); const outputBefore = structuredClone(corpus.output);
  const { output, bytes } = codeLiteralReviews(corpus, RULES);

  assert.deepEqual(output.records.map(record => record.text), SENTENCES.map(([text]) => text));
  for (const [index, [, i04, i04Pending]] of SENTENCES.entries()) {
    assert.deepEqual(output.candidates.i04.filter(row => row.recordIndex === index)
      .map(row => [row.eventKind, row.attribution, sp(row.span), row.qualifiers.map(sp)]), i04, `I04 ${index}`);
    assert.deepEqual(output.pending.filter(row => row.family === 'I04' && row.recordIndex === index).map(row => row.reason), i04Pending, `I04 pending ${index}`);
  }
  assert.deepEqual(output.candidates.i05.map(row => [row.recordIndex, sp(row.span), row.polarity, row.target.state, sp(row.target.span),
    row.speakerAttribution.state, sp(row.speakerAttribution.span), row.qualifiers.map(sp)]), [
    [11, [0, 21, 'Nghe nói sản phẩm tốt'], 'POSITIVE', 'SOURCE_STATED', [9, 17, 'sản phẩm'], 'SOURCE_STATED', [0, 8, 'Nghe nói'], [[0, 8, 'Nghe nói']]],
    [17, [17, 26, 'thất vọng'], 'NEGATIVE', 'UNKNOWN', null, 'UNKNOWN', null, []],
  ]);
  assert.deepEqual(output.pending.filter(row => row.family === 'I05' && row.recordIndex === 15).map(row => row.reason), ['THIRD_PARTY_ATTITUDE_HOLDER']);
  assert.deepEqual(output.candidates.i07.map(row => [row.recordIndex, sp(row.choiceText), sp(row.reasonClause), sp(row.relation.link),
    sp(row.relation.context), row.reasonFacet, row.reasonPolarity, row.speakerBasis, row.resultState.state, row.qualifiers.map(sp)]), [
    [12, [0, 7, 'Tôi mua'], [22, 28, 'giá rẻ'], [8, 21, 'không phải vì'], [0, 28, 'Tôi mua không phải vì giá rẻ'], 'PRICE_COST', 'NEGATED', 'SELF_STATED', 'UNKNOWN', []],
  ]);
  assert.deepEqual(output.pending.filter(row => row.family === 'I07' && row.recordIndex === 14).map(row => [row.reason, sp(row.span), sp(row.trigger)]),
    [['AMBIGUOUS_RESULT_LINKER', [0, 14, 'Giá rẻ nên mua'], [7, 10, 'nên']]]);
  assert.deepEqual(output.candidates.i08.map(row => [row.recordIndex, sp(row.attemptedTask), sp(row.obstacleClause), sp(row.relation.link),
    sp(row.relation.context), row.barrierFacet, row.resolutionState.state, row.qualifiers.map(sp)]), [
    [1, [0, 15, 'Tôi thử đặt mua'], [22, 36, 'không đặt được'], [16, 21, 'nhưng'], [0, 36, 'Tôi thử đặt mua nhưng không đặt được'], 'UNCLEAR', 'UNKNOWN', [[4, 7, 'thử']]],
  ]);
  // Dissatisfaction after "nhưng" is not a task barrier.
  assert.deepEqual(output.pending.filter(row => row.family === 'I08' && row.recordIndex === 17).map(row => row.reason), ['NO_RULE_MATCH']);
  assert.deepEqual(output.candidates.i02.map(row => [row.recordIndex, row.situation.state, sp(row.situation.span), row.time.state,
    row.role.state, row.task.state, row.setting.state, row.qualifiers.map(sp)]), [
    [18, 'SOURCE_STATED', [4, 15, 'mua cho con'], 'SOURCE_STATED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN', [[4, 15, 'mua cho con'], [19, 28, 'hàng ngày']]],
  ]);

  const nfd = SENTENCES.length - 1;
  assert.deepEqual(output.units[nfd]!.textFlags, ['NON_NFC_TEXT']);
  assert.deepEqual(output.pending.filter(row => row.recordIndex === nfd).map(row => [row.family, row.reason, row.span]),
    ['I02', 'I04', 'I05', 'I07', 'I08'].map(family => [family, 'NON_NFC_TEXT', null]));
  assert.ok(output.blockers.includes('NON_NFC_TEXT_UNITS_PENDING'));
  assert.deepEqual(output.units[0]!.families, { I02: 'PENDING', I04: 'CANDIDATE', I05: 'PENDING', I07: 'PENDING', I08: 'PENDING' });
  assert.deepEqual(output.units[1]!.families, { I02: 'PENDING', I04: 'CANDIDATE', I05: 'PENDING', I07: 'PENDING', I08: 'CANDIDATE' });
  assert.equal(output.pending.some(row => row.recordIndex === 10 && row.family === 'I05' && row.reason === 'NEGATED_ATTITUDE'), true);
  assert.equal(output.pending.some(row => row.recordIndex === 16 && row.family === 'I08' && row.reason === 'TASK_OBSTACLE_RELATION_UNVERIFIED'), true);
  assert.equal(output.candidates.i02[0]!.time.span!.quote, 'hàng ngày');

  const role = `RULE_GENERATED_DECLARATION literal-review-rules v1-proposal-2 sha256:${sha256(RULES)} parser:literal-review-parser-v2`;
  for (const rows of Object.values(output.candidates)) {
    for (const row of rows) assert.deepEqual(row.provenance, { basis: 'DECLARED', coderRole: role, adjudication: null, disagreement: null });
  }
  assert.equal(bytes.includes('HUMAN_REVIEWED'), false);
  assert.equal(bytes.includes('PENDING_AI'), false);
  assert.equal(output.executionAuthority, 'NONE_RULE_PROPOSAL_ONLY');
  assert.equal(output.rules.declaredStatus, 'PROPOSAL_PENDING_BUSINESS_REVIEW');
  assert.deepEqual(output.blockers.slice(0, 2), ['LITERAL_RULES_PROPOSAL_NOT_ADOPTED', 'CODING_PENDING']);

  const located = validateLocatedInsightInput(locatedInput(output));
  assert.equal(located.i04.length, output.candidates.i04.length);
  assert.ok(codeLiteralReviews(corpus, RULES).bytes.equals(bytes));
  assert.ok(corpus.bytes.equals(corpusBefore));
  assert.deepEqual(corpus.output, outputBefore);
});

test('coverage keeps conflicting, quarantined, empty and unreadable versions out of coding while duplicates keep every source ref', async () => {
  const text = 'Tôi đã dùng sản phẩm.';
  const corpus = await corpusOf([[review('20', text), review('21', 'Tôi đã mua.'), { ...review('28', text), shopId: '999', itemId: '888' },
    review('22', text), review('23', ''), review('24', 42), review(null, text), { ...review('26', text), ratingStar: 0 }, review('27', 'Thạch mềm.')],
  [review('20', text), review('21', 'Tôi đã mua lại.')]]);
  const { output } = codeLiteralReviews(corpus, RULES);

  assert.deepEqual(output.units.map(unit => [unit.groupIndex, unit.versionIndex, unit.eligibility]), [
    [0, 0, 'ELIGIBLE'], [1, 0, 'CONFLICTING'], [1, 1, 'CONFLICTING'], [2, 0, 'QUARANTINED'], [3, 0, 'ELIGIBLE'],
    [4, 0, 'EMPTY_TEXT'], [5, 0, 'UNREADABLE_TEXT'], [6, 0, 'ELIGIBLE'], [7, 0, 'ELIGIBLE'], [8, 0, 'ELIGIBLE']]);
  assert.deepEqual(output.records.map(record => [record.locator, record.disposition, record.dispositionReason]), [
    ['/records/0/versions/0/text', 'INCLUDED', null], ['/records/1/versions/0/text', 'EXCLUDED', 'UNRESOLVED_CONFLICT'],
    ['/records/1/versions/1/text', 'EXCLUDED', 'UNRESOLVED_CONFLICT'], ['/records/2/versions/0/text', 'EXCLUDED', 'WRONG_LISTING'],
    ['/records/3/versions/0/text', 'INCLUDED', null], ['/records/4/versions/0/text', 'EXCLUDED', 'EMPTY_TEXT'],
    ['/records/5/versions/0/text', 'UNREADABLE', 'UNREADABLE_TEXT'], ['/records/6/versions/0/text', 'INCLUDED', null],
    ['/records/7/versions/0/text', 'INCLUDED', null], ['/records/8/versions/0/text', 'INCLUDED', null]]);
  assert.ok(output.records.every(record => record.sourceSha256 === sha256(corpus.bytes)));
  assert.equal(output.locatedSource.sha256, sha256(corpus.bytes));
  assert.equal(output.corpus.corpusId, corpus.output.corpusId);
  assert.deepEqual(output.units[0]!.sourceRefs.map(ref => [ref.pageIndex, ref.rowIndex]), [[0, 0], [1, 0]]);
  assert.deepEqual(output.units[3]!.identity.listingKey, 'shopee:999:888');
  // Missing native ID and invalid rating keep readable selected-listing text eligible.
  assert.deepEqual([output.units[7]!.identity.kind, output.units[7]!.exclusionReasons], ['SOURCE_ROW_LOCATOR', []]);
  assert.deepEqual([output.units[8]!.corpusReasons, output.units[8]!.exclusionReasons], [['RATING_INVALID'], []]);
  assert.deepEqual(output.candidates.i04.map(row => [row.recordIndex, row.eventKind, row.span.quote]),
    [0, 4, 7, 8].map(index => [index, 'ACTION_REPORTED', 'Tôi đã dùng sản phẩm']));
  assert.equal(output.pending.some(row => [1, 2, 3, 5, 6].includes(row.recordIndex)), false);
  assert.deepEqual(output.pending.filter(row => row.recordIndex === 9).map(row => [row.family, row.reason]),
    ['I02', 'I04', 'I05', 'I07', 'I08'].map(family => [family, 'NO_RULE_MATCH']));
  assert.deepEqual(output.units.map(unit => unit.families === null), [false, true, true, true, false, true, true, false, false, false]);
  const { families, ...counts } = output.coverage;
  assert.deepEqual(counts, { rawRows: 11, sourceRefs: 11, recordGroups: 9, units: 10, eligibleUnits: 5, quarantinedUnits: 1,
    conflictingUnits: 2, emptyTextUnits: 1, unreadableUnits: 1, nonNfcEligibleUnits: 0 });
  assert.deepEqual(families.I04, { candidateUnits: 4, candidateWithPendingUnits: 0, pendingUnits: 1, candidates: 4, pendingItems: 1 });
  validateLocatedInsightInput(locatedInput(output));
});

test('numeric units do not act as negators and uncertain modality or attitude holders stay pending', async () => {
  const texts = ['Tôi đã dùng 1 kg sản phẩm.', 'Tôi đã dùng 50k sản phẩm.', 'Tôi đã dùng k sản phẩm.',
    'Tôi thấy sản phẩm không quá tốt.', 'Sản phẩm không tệ.', 'Nếu giá rẻ thì tôi mua vì giá rẻ.',
    'Tôi mua nhưng không dùng được.', 'Tôi muốn sản phẩm tốt.', 'Tôi đọc rằng sản phẩm tốt.',
    'Bạn nên yên tâm về sản phẩm.'];
  const { output } = codeLiteralReviews(await corpusOf([texts.map((text, index) => review(String(index + 1), text))]), RULES);
  assert.deepEqual(output.candidates.i04.filter(row => row.recordIndex < 3).map(row => row.recordIndex), [0, 1]);
  assert.deepEqual(output.candidates.i05, []);
  assert.deepEqual(output.candidates.i07, []);
  assert.deepEqual(output.candidates.i08, []);
  assert.equal(output.candidates.i04.some(row => row.eventKind === 'NOT_REPORTED'), false);
  validateLocatedInsightInput(locatedInput(output));
});

test('the coder binds the exact rule bytes and rejects executable, adopted, overlapping or tampered inputs', async () => {
  const corpus = await corpusOf([[review('1', 'Tôi đã dùng sản phẩm.')]]);
  const baseline = codeLiteralReviews(corpus, RULES).output;
  assert.deepEqual([baseline.rules.sha256, baseline.rules.byteLength], [sha256(RULES), RULES.length]);
  const reformatted = Buffer.from(`${JSON.stringify(JSON.parse(RULES.toString('utf8')))}\n`);
  const rebound = codeLiteralReviews(corpus, reformatted).output;
  assert.equal(rebound.rules.sha256, sha256(reformatted));
  assert.notEqual(rebound.rules.sha256, baseline.rules.sha256);
  assert.notEqual(rebound.codingId, baseline.codingId);
  assert.deepEqual(rebound.candidates.i04.map(row => [row.eventKind, row.span]), baseline.candidates.i04.map(row => [row.eventKind, row.span]));

  const edit = (change: (table: { status: string; lexicon: Record<string, string[]> } & Record<string, unknown>) => void) => {
    const table = JSON.parse(RULES.toString('utf8')); change(table); return Buffer.from(JSON.stringify(table, null, 2));
  };
  const rejected: [Buffer, RegExp][] = [
    [edit(table => { table.executable = 'x'; }), /RULE_TABLE_SHAPE_INVALID/],
    [edit(table => { table.lexicon.customPattern = ['mua']; }), /RULE_TABLE_LEXICON_SHAPE_INVALID/],
    [edit(table => { table.lexicon.actionVerb!.push('d.ng'); }), /RULE_TABLE_PHRASE_INVALID:actionVerb/],
    [edit(table => { table.lexicon.actionVerb!.push('Dùng'); }), /RULE_TABLE_PHRASE_INVALID:actionVerb/],
    [edit(table => { table.status = 'ADOPTED'; }), /RULE_TABLE_BINDING_INVALID/],
    [edit(table => { table.lexicon.contrastLinker!.push('vì'); }), /RULE_TABLE_ROLE_OVERLAP/],
    [Buffer.from(RULES.toString('utf8').replace('"status":', '"status": "ADOPTED",\n  "status":')), /RULE_TABLE_DUPLICATE_OR_MISSING_KEY/],
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), RULES]), /RULE_TABLE_BOM_FORBIDDEN/],
  ];
  for (const [bytes, error] of rejected) assert.throws(() => codeLiteralReviews(corpus, bytes), error);

  const changed = structuredClone(corpus.output);
  changed.records[0]!.versions[0]!.text = 'Tôi chưa dùng sản phẩm.';
  assert.throws(() => codeLiteralReviews({ output: changed, bytes: corpus.bytes }, RULES), /CORPUS_BYTES_MISMATCH/);
  assert.throws(() => codeLiteralReviews({ output: changed, bytes: Buffer.from(`${canonicalJson(changed)}\n`) }, RULES), /CORPUS_ID_MISMATCH/);
});

test('literal candidates do not turn quoted speech, price homonyms or denied obstacles into findings', async () => {
  const texts = ['“Tôi đã dùng sản phẩm.”', 'Tôi mua vì đánh giá.', 'Tôi mua vì bác sĩ.',
    'Tôi dùng nhưng không bị lỗi.', 'Tôi mua nhưng hủy đơn.', 'Tôi mua nhưng sẽ hết hàng.',
    'Tôi đã dùng sản phẩm. “Tôi mua vì giá rẻ.”',
    'Tôi thử dùng nhưng con không dùng được.', 'Tôi thử dùng nhưng Nam không dùng được.',
    'Tôi thử dùng nhưng bạn tôi nói không dùng được.', 'Bạn tôi nói thử dùng nhưng tôi không dùng được.',
    'Tôi thử dùng nhưng tôi không dùng được.', 'Tôi thử dùng nhưng chúng tôi không dùng được.',
    'Tôi thử mua quạt nhưng tôi không mua thạch được.',
    'Tôi chọn A vì giá rẻ nhưng B chính hãng, vì vậy tôi chọn B.',
    'Tôi thử mua quạt nhưng tôi không mua quạt được.', 'Tôi thử mua nhưng tôi không mua quạt được.'];
  const { output } = codeLiteralReviews(await corpusOf([texts.map((text, index) => review(String(index + 1), text))]), RULES);
  assert.deepEqual(output.candidates.i04.filter(row => [0, 6].includes(row.recordIndex))
    .map(row => [row.recordIndex, row.attribution, row.span.quote]), [[6, 'SELF_REPORTED', 'Tôi đã dùng sản phẩm']]);
  assert.deepEqual(output.candidates.i07.map(row => [row.recordIndex, row.choiceText.quote, row.reasonClause.quote, row.reasonFacet]),
    [[1, 'Tôi mua', 'đánh giá', 'UNCLEAR'], [2, 'Tôi mua', 'bác sĩ', 'UNCLEAR'],
      [14, 'Tôi chọn A', 'giá rẻ', 'PRICE_COST'], [14, 'tôi chọn B', 'B chính hãng', 'INFORMATION_TRUST']]);
  assert.deepEqual(output.candidates.i08.map(row => [row.recordIndex, row.attemptedTask.quote, row.obstacleClause.quote]),
    [[11, 'Tôi thử dùng', 'tôi không dùng được'], [15, 'Tôi thử mua quạt', 'tôi không mua quạt được']]);
  assert.deepEqual(output.candidates.i04.filter(row => [7, 8, 9, 10, 12].includes(row.recordIndex))
    .map(row => [row.recordIndex, row.span.quote, row.qualifiers.map(span => span.quote)]),
    [[7, 'Tôi thử dùng', ['thử']], [8, 'Tôi thử dùng', ['thử']], [9, 'Tôi thử dùng', ['thử']],
      [10, 'Bạn tôi nói thử dùng', ['Bạn tôi nói', 'thử']], [12, 'Tôi thử dùng', ['thử']]]);
  assert.equal(output.pending.some(row => row.recordIndex === 7 && row.family === 'I04' && row.reason === 'THIRD_PARTY_ACTOR'), true);
  assert.equal(output.pending.some(row => row.recordIndex === 0 && row.family === 'I04' && row.reason === 'QUOTED_TEXT_SCOPE'), true);
  assert.equal(output.pending.some(row => row.recordIndex === 3 && row.family === 'I08' && row.reason === 'NEGATED_OBSTACLE'), true);
  validateLocatedInsightInput(locatedInput(output));
});

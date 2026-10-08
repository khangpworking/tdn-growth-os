import assert from 'node:assert/strict';
import type { CitationInput } from '../../src/modules/analysis/citation-registry.js';
import test from 'node:test';
import { buildInsightLiteralEvidence } from '../../src/modules/analysis/insight-literal-evidence.js';
import { nativeLiteralReviews, literalSellerStatements } from '../../src/modules/analysis/research-automation/insight-literal-source.js';
import { literalHash, literalNativeFile, literalRunId, literalSelected, literalSellerFixture, literalWorkspaceId } from '../helpers/insight-literal-fixture.js';
const binding = { workspaceId: literalWorkspaceId, runId: literalRunId, scopeSha256: 'a'.repeat(64), previousPairId: 'b'.repeat(64) };
const row = (cmtid: string, comment: unknown, star: unknown = 5) => ({ type: 'review', shopid: literalSelected.shopId, itemid: literalSelected.itemId, cmtid, comment, rating_star: star });

test('literal stars keep source distribution separate from no-text unknown, missing and invalid values', () => {
  const absent = row('3', 'Chữ không có số sao'); delete (absent as Partial<typeof absent>).rating_star;
  const source = literalNativeFile([row('1', 'Không thích dù nguồn cho năm sao'), row('2', '', 1), absent,
    row('4', 'Chữ có số sao không hợp lệ', 0), row('5', null, 3), row('6', 'Thiếu giá trị sao', null)]);
  const input = { binding, reviews: nativeLiteralReviews(source, literalSelected), sellerStatements: [] };
  const before = structuredClone(input);
  const output = buildInsightLiteralEvidence(input);
  assert.deepEqual(output.stars.bins.map(bin => [bin.value, bin.recordPointers.length]), [[1, 1], [2, 0], [3, 1], [4, 0], [5, 1]]);
  assert.deepEqual(output.stars.textlessUnknown.recordPointers, ['/input/reviews/1']);
  assert.deepEqual(output.stars.unreadableText.recordPointers, ['/input/reviews/4']);
  assert.deepEqual(output.stars.absentField.recordPointers, ['/input/reviews/2']);
  assert.deepEqual(output.stars.invalidValue.recordPointers, ['/input/reviews/3']);
  assert.deepEqual(output.stars.missingValue.recordPointers, ['/input/reviews/5']);
  assert.deepEqual(input, before);
  assert.equal(output.sellerLayer.state, 'UNAVAILABLE');
  assert.deepEqual(output.sellerLayer.customerCodingMembership, []);
  assert.ok(output.limitations.includes('STARS_NOT_TEXT_SENTIMENT'));
  const withoutStars = [row('1', 'Nguồn không có sao')]; delete (withoutStars[0] as Partial<typeof absent>).rating_star;
  const missing = buildInsightLiteralEvidence({ binding, reviews: nativeLiteralReviews(literalNativeFile(withoutStars), literalSelected), sellerStatements: [] });
  assert.equal(missing.stars.state, 'SOURCE_FIELD_ABSENT');
  assert.deepEqual(missing.stars.bins, []);
});

test('identical text at distinct locators remains two records while reference duplicates and conflicts keep original rules', () => {
  const reviews = nativeLiteralReviews(literalNativeFile([row('1', 'Nguyên văn giống nhau'), row('2', 'Nguyên văn giống nhau'),
    row('3', 'Bản ghi mâu thuẫn'), row('3', 'Chữ khác'), { ...row('4', 'Sai listing'), itemid: '999' }]), literalSelected);
  const output = buildInsightLiteralEvidence({ binding, reviews: [...reviews, reviews[0]!], sellerStatements: [] });
  assert.equal(output.input.reviews.length, 5, 'same retained reference counts once');
  assert.equal(output.selectedRecordPointers.length, 2, 'distinct legitimate locators both count');
  assert.deepEqual(output.duplicateTexts.map(item => [item.recordPointers, item.label]), [[['/input/reviews/0', '/input/reviews/1'], 'trùng nguyên văn, có thể cùng một người']]);
  assert.deepEqual(output.excludedRecordPointers, ['/input/reviews/2', '/input/reviews/3', '/input/reviews/4']);
  assert.equal(output.stars.bins[4]!.recordPointers.length, 2);
  assert.throws(() => buildInsightLiteralEvidence({ binding, reviews: [reviews[0]!, { ...reviews[0]!, text: 'Changed under same retained reference' }], sellerStatements: [] }), /LITERAL_REFERENCE_CONFLICT/);
  assert.equal(output.sellerLayer.statementPointers.length, 0);
});

test('seller statements require exact documented approved detail fields and cannot populate customer barriers', () => {
  const fixture = literalSellerFixture();
  const sellers = literalSellerStatements(fixture);
  assert.deepEqual(sellers.map(item => [item.voice, item.sourceType, item.locator]), [['SELLER', 'LISTING_TITLE', '/data/product_name'], ['SELLER', 'LISTING_DESCRIPTION', '/data/product_description/0/text']]);
  assert.equal(sellers[0]!.sourceSha256, fixture.captures[0]!.artifactSha256);
  assert.match(sellers[1]!.text, /có an toàn không/);
  const output = buildInsightLiteralEvidence({ binding, reviews: [], sellerStatements: sellers });
  assert.equal(output.sellerLayer.state, 'AVAILABLE');
  assert.deepEqual(output.selectedRecordPointers, []);
  assert.deepEqual(output.sellerLayer.customerCodingMembership, []);
  const noTypedField = literalSellerStatements(literalSellerFixture({ product_id: '101', comment: 'Tôi là người bán. Nhắm tới khách hàng này.' }));
  assert.deepEqual(noTypedField, [], 'wording and undocumented fields cannot authenticate seller voice');
  const wrongProduct = literalSellerFixture({ product_id: '999', product_name: 'Wrong product' });
  assert.throws(() => literalSellerStatements(wrongProduct), /approved product/);
  const wrongBytes = { ...fixture, captureBytes: new Map([[fixture.captures[0]!.artifactSha256, Buffer.from('{}')]]) };
  assert.throws(() => literalSellerStatements(wrongBytes), /different digest/);
  const wrongVoice = { ...fixture, captures: [{ ...fixture.captures[0]!, operation: 'unknown.review.comment' }] };
  assert.deepEqual(literalSellerStatements(wrongVoice), []);
  assert.throws(() => nativeLiteralReviews({ ...literalNativeFile([row('1', 'Text')]), sha256: literalHash(Buffer.from('wrong')) }, literalSelected), /BYTES_MISMATCH/);
});

test('literal views render verified method counts and verbatim quotes with shared wording lint', async () => {
  const { insightLiteralSection } = await import('../../src/modules/analysis/research-automation/review-corpus-report.js');
  const { lintVisibleReportText } = await import('../../src/modules/analysis/report-visible-text-lint.js');
  const refs: CitationInput[] = [];
  const citations = { mark: (ref: CitationInput) => { refs.push(ref); return `[${refs.length}]`; } };
  const raw = [row('1', 'Nguyên văn tốt nhất <script>source</script>', 5), row('2', 'Nguyên văn tốt nhất <script>source</script>', 1)];
  const source = literalNativeFile(raw);
  const output = buildInsightLiteralEvidence({ binding, reviews: nativeLiteralReviews(source, literalSelected),
    sellerStatements: literalSellerStatements(literalSellerFixture({ product_id: '101', product_name: 'Tiêu đề tốt nhất',
      product_description: [{ text: 'Người bán nói: sản phẩm hàng đầu, có an toàn không?' }] })) });
  for (const id of ['I05', 'I07', 'I08', 'I13', 'I17'] as const) {
    const html = insightLiteralSection(output, id, citations);
    assert.deepEqual(lintVisibleReportText(html).filter(result => !result.ok), [], id);
    assert.equal(html.includes('<script>source</script>'), false);
    if (id === 'I17') {
      assert.match(html, /trùng nguyên văn, có thể cùng một người/);
      assert.match(html, /&lt;script&gt;source&lt;\/script&gt;/);
    }
    if (id === 'I08') assert.match(html, /không đưa vào rào cản của khách/);
  }
  const generatedSuperlative = structuredClone(output); Object.assign(generatedSuperlative.duplicateTexts[0]!, { label: 'tốt nhất' });
  assert.throws(() => insightLiteralSection(generatedSuperlative, 'I17', citations), /INSIGHT_LITERAL_VISIBLE_TEXT_LINT_FAILED/);
  assert.ok(refs.some(ref => ref.identity === source.sha256 && ref.locator === '/0/rating_star'));
  assert.ok(refs.some(ref => ref.identity === source.sha256 && ref.locator === '/1/comment'));
  assert.ok(refs.some(ref => ref.locator === '/data/product_description/0/text'));
  const altered = structuredClone(output); altered.stars.bins[0]!.recordCount = 91;
  assert.match(insightLiteralSection(altered, 'I05', citations), /<td>91<\/td>/, 'template renders retained count rather than recalculating membership');
  const absentRow = row('1', 'Nguồn không có số sao'); delete (absentRow as Partial<typeof absentRow>).rating_star;
  const absent = buildInsightLiteralEvidence({ binding, reviews: nativeLiteralReviews(literalNativeFile([absentRow]), literalSelected), sellerStatements: [] });
  const absentHtml = insightLiteralSection(absent, 'I05', citations);
  assert.match(absentHtml, /nguồn không có số sao; chưa có phân bố số sao, không thay bằng 0/);
  assert.doesNotMatch(absentHtml, /<td>[1-5]\/5<\/td>/);
  assert.ok(refs.some(ref => ref.identity === absent.input.reviews[0]!.sourceRefs[0]!.sourceSha256 && ref.locator === '/0'), 'absent field cites its existing row rather than a fabricated field locator');
});

test('canonical literal method rejects malformed states, provenance and forged recomputed outputs', async () => {
  const { verifyInsightLiteralEvidence } = await import('../../src/modules/analysis/insight-literal-evidence.js');
  const input = { binding, reviews: nativeLiteralReviews(literalNativeFile([row('1', 'Original text')]), literalSelected),
    sellerStatements: literalSellerStatements(literalSellerFixture()) };
  const output = buildInsightLiteralEvidence(input);
  assert.deepEqual(verifyInsightLiteralEvidence(output), output);
  for (const mutate of [
    (value: typeof input) => { value.binding.runId = 'not-a-uuid'; },
    (value: typeof input) => { value.reviews[0]!.rating.fieldPresent = false; },
    (value: typeof input) => { value.reviews[0]!.text = null; },
    (value: typeof input) => { value.reviews[0]!.sourceRefs[0]!.sourceSha256 = 'not-a-digest'; },
    (value: typeof input) => { value.sellerStatements[0]!.sourceSha256 = 'not-a-digest'; },
    (value: typeof input) => { value.sellerStatements[0]!.retrievedAt = 'unknown'; },
  ]) {
    const malformed = structuredClone(input); mutate(malformed);
    assert.throws(() => buildInsightLiteralEvidence(malformed), /LITERAL_INPUT_INVALID/);
  }
  assert.throws(() => buildInsightLiteralEvidence({ ...input, fabricatedApproval: true }), /LITERAL_INPUT_INVALID/);
  const altered = structuredClone(output); altered.stars.bins[0]!.recordCount = 9;
  assert.throws(() => verifyInsightLiteralEvidence(altered), /LITERAL_METHOD_REPLAY_MISMATCH/);
  const wrongMembership = structuredClone(output); wrongMembership.sellerLayer.customerCodingMembership = ['/input/reviews/0'];
  assert.throws(() => verifyInsightLiteralEvidence(wrongMembership), /LITERAL_OUTPUT_INVALID/);
});

test('literal-only revision is closed and cannot change old selection payloads or source decisions', async () => {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = require('ajv-formats') as typeof import('ajv-formats').default;
  const { default: revision } = await import('../../contracts/analysis/automation-insight-report-revision.schema.json', { with: { type: 'json' } });
  const { default: classified } = await import('../../contracts/analysis/automation-classified-report-revision.schema.json', { with: { type: 'json' } });
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv); ajv.addSchema(classified);
  const validate = ajv.compile(revision);
  const common = { requestKey: literalRunId, previousPairId: binding.previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  const literal = { ...common, contractVersion: 'automation-insight-literal-report-revision-v1',
    literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  assert.equal(validate(literal), true, JSON.stringify(validate.errors));
  assert.equal(validate({ ...common, contractVersion: 'automation-insight-report-revision-v1', acceptedInsight: { proposalId: literalRunId, receiptIds: [literalWorkspaceId] } }), true);
  for (const contractVersion of ['insight-draft-select-v1', 'insight-draft-select-v2']) assert.equal(validate({ ...common,
    contractVersion: 'automation-insight-report-revision-v1', draftInsight: { contractVersion, proposalId: literalRunId } }), true);
  for (const malformed of [
    { ...literal, contractVersion: 'automation-insight-report-revision-v1' },
    { ...literal, literalInsight: { contractVersion: 'insight-literal-select-v1', approval: true } },
    { ...literal, draftInsight: { contractVersion: 'insight-draft-select-v2', proposalId: literalRunId } },
    { ...literal, sources: { ...common.sources, nativeReview: { decision: 'REPLACE' } } },
    { ...literal, previousPairId: 'invalid' },
  ]) assert.equal(validate(malformed), false);
});

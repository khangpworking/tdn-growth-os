import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { readPrivatePersonaEvidence } from '../../src/modules/analysis/research-automation/insight-persona-evidence.js';
import { personaRows, personaSourceFixture, PERSONA_KEY, PERSONA_NOW } from '../helpers/insight-persona-fixture.js';
const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

test('actual retained S05 source supplies located cards, exact E4 labels and per-source proposed x/y with private identity kept internal', async t => {
  const f = await personaSourceFixture(t);
  const before = canonicalJson({ packet: f.source.packet, corpus: f.corpus, view: f.view });
  const result = f.evidence.persona([[f.quote(0), f.quote(1)], [f.quote(2), f.quote(3)], [f.quote(4), f.quote(5)]]);
  assert.equal(result.eligible, true); assert.equal(result.cards.length, 3);
  assert.equal(result.authorEvidence, 'MET_WITH_SOURCE_AUTHOR_PROOF');
  assert.equal(result.broaderScopeEligible, true); assert.deepEqual(result.sampleSize, { numerator: 6, denominator: 6 });
  assert.equal(result.sampleSizeLabel, '6/6 bản ghi trong mẫu — đề xuất, chờ chủ duyệt');
  assert.equal(result.label, 'Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật');
  assert.equal(result.status, 'PROPOSED'); assert.equal(result.releaseEligibility, 'UNAVAILABLE');
  assert.equal(f.evidence.publicSource().sourceDateEligibility, 'UNKNOWN');
  const serialized = canonicalJson({ source: f.evidence.publicSource(), result });
  for (const secret of [PERSONA_KEY, 'PRIVATE_AUTHOR', 'PRIVATE_PROFILE', f.source.packet.privacy.keyCommitment,
    ...personaRows().flatMap(row => [row.authorId, row.reviewId]), ...f.corpus.projection.records.map(row => row.authorIdentity.hash!)])
    assert.equal(serialized.includes(secret), false, secret);
  for (const field of ['authorIdentity', 'authorHash', 'keyId', 'privacy', 'reviewId']) assert.equal(serialized.includes(`"${field}"`), false, field);
  assert.equal(canonicalJson({ packet: f.source.packet, corpus: f.corpus, view: f.view }), before);
  assert.deepEqual((await readPrivatePersonaEvidence(f.selection)).publicSource(), f.evidence.publicSource());
});

test('2 versus3 distinct cards and4 versus5 source authors; known repeated identities never enable fallback', async t => {
  const f = await personaSourceFixture(t, personaRows(5));
  const cards = [[f.quote(0), f.quote(1)], [f.quote(1), f.quote(2)], [f.quote(3), f.quote(4)]];
  assert.equal(f.evidence.persona(cards).eligible, true);
  assert.ok(f.evidence.persona(cards.slice(0, 2)).blockers.includes('PERSONA_REQUIRES_THREE_EVIDENCE_CARDS'));
  const repeatedCard = f.evidence.persona([cards[0]!, [...cards[0]!].reverse(), cards[1]!]);
  assert.equal(repeatedCard.cards.length, 2); assert.equal(repeatedCard.eligible, false);
  const values = personaRows(5); values[4]!.authorId = values[0]!.authorId;
  const four = await personaSourceFixture(t, values);
  const insufficient = four.evidence.persona([[four.quote(0), four.quote(1)], [four.quote(1), four.quote(2)], [four.quote(3), four.quote(4)]]);
  assert.equal(insufficient.authorEvidence, 'INSUFFICIENT'); assert.equal(insufficient.identityLimitation, null);
  assert.equal(insufficient.eligible, false);
  const oneAuthor = await personaSourceFixture(t, personaRows().map(row => ({ ...row, authorId: '918273640' })));
  const single = oneAuthor.evidence.card([oneAuthor.quote(0), oneAuthor.quote(1)]);
  assert.equal(single.eligible, false); assert.equal(single.authorEvidence, 'INSUFFICIENT');
  assert.equal(oneAuthor.evidence.persona([[oneAuthor.quote(0), oneAuthor.quote(1)]]).rejectedCards.length, 1);
});

test('fallback needs truly missing source IDs and5 exact distinct contents; mixed/invalid/known identities cannot be evaded by selecting missing rows', async t => {
  const noIds = personaRows(5).map(({ authorId: _id, ...row }) => row);
  const f = await personaSourceFixture(t, noIds);
  const cards = [[f.quote(0), f.quote(1)], [f.quote(1), f.quote(2)], [f.quote(3), f.quote(4)]];
  const result = f.evidence.persona(cards);
  assert.equal(result.eligible, true); assert.equal(result.authorEvidence, 'MET_WITH_DISTINCT_CONTENT_FALLBACK');
  assert.equal(result.identityLimitation, 'nguồn không có mã người viết; chưa xác minh là 5 người');
  const duplicateContents = [...noIds, { ...noIds[0]!, reviewId: '7000000020' }];
  duplicateContents[4]!.comment = duplicateContents[0]!.comment;
  const fourContents = await personaSourceFixture(t, duplicateContents);
  assert.equal(fourContents.evidence.persona([[fourContents.quote(0), fourContents.quote(1)],
    [fourContents.quote(2), fourContents.quote(3)], [fourContents.quote(4), fourContents.quote(5)]]).authorEvidence, 'INSUFFICIENT');
  for (const authorId of ['918273699', 0]) {
    const mixed = await personaSourceFixture(t, [...noIds, { ...personaRows()[5]!, authorId }]);
    const candidate = mixed.evidence.persona([[mixed.quote(0), mixed.quote(1)], [mixed.quote(1), mixed.quote(2)], [mixed.quote(3), mixed.quote(4)]]);
    assert.equal(candidate.eligible, false); assert.equal(candidate.identityLimitation, null);
  }
});

test('source-native aliases excluded before sampling/quote admission; separate IDs with identical text retain distinct author/record evidence', async t => {
  const original = personaRows();
  const f = await personaSourceFixture(t, [...original, { ...original[0]! }]);
  const source = f.evidence.publicSource();
  assert.equal(source.records.length, 7); assert.equal(source.eligibleRecordIndexes.length, 6);
  assert.equal(source.records[6]!.exclusionReason, 'SOURCE_NATIVE_ALIAS');
  assert.equal(source.records[6]!.aliasOfRecordIndex, 0);
  assert.throws(() => f.evidence.card([f.quote(0), f.quote(6)]), /QUOTE_RECORD_NOT_ELIGIBLE/);
  const identical = await personaSourceFixture(t, personaRows().map(row => ({ ...row, comment: 'Identical exact source text.' })));
  assert.equal(identical.evidence.publicSource().eligibleRecordIndexes.length, 6);
  assert.equal(identical.evidence.persona([[identical.quote(0), identical.quote(1)],
    [identical.quote(2), identical.quote(3)], [identical.quote(4), identical.quote(5)]]).eligible, true);
});

test('conflicting source-native text/rating/author/listing variants fail before any evidence handle is returned', async t => {
  for (const change of [{ comment: 'Contrary original text.' }, { ratingStar: 4 }, { authorId: '918273699' }, { itemId: '3002' }]) {
    const row = personaRows()[0]!;
    await assert.rejects(personaSourceFixture(t, [row, { ...row, ...change }]), error => {
      assert.match(String(error), /SOURCE_NATIVE_IDENTITY_CONFLICT/);
      assert.equal(String(error).includes(row.reviewId), false); assert.equal(String(error).includes(row.authorId), false);
      return true;
    });
  }
});

test('source exclusions retained with reasons; explicit product links govern broader scope, never text or guessed metadata', async t => {
  const values = [...personaRows(), { ...personaRows()[0]!, reviewId: '7000000090', comment: '' },
    { ...personaRows()[0]!, reviewId: '7000000091', comment: null },
    { ...personaRows()[0]!, reviewId: '7000000092', shopId: '9999' },
    { ...personaRows()[0]!, reviewId: '7000000093', itemId: null }];
  const f = await personaSourceFixture(t, values);
  assert.equal(f.evidence.publicSource().records.length, 10);
  assert.deepEqual(f.evidence.publicSource().records.slice(6).map(row => row.exclusionReason),
    ['NO_READABLE_TEXT', 'NO_READABLE_TEXT', 'OTHER_LISTING', 'UNRESOLVED_LISTING']);
  for (const index of [6, 7, 8, 9]) assert.throws(() => f.evidence.quote({ ...f.quote(0), recordIndex: index }), /QUOTE_RECORD_NOT_ELIGIBLE/);
  const limited = await personaSourceFixture(t, personaRows().map(row => ({ ...row, itemId: '3001',
    comment: `${row.comment} Fictional brand A brand B brand C.` })), 1);
  const candidate = limited.evidence.persona([[limited.quote(0), limited.quote(1)], [limited.quote(2), limited.quote(3)], [limited.quote(4), limited.quote(5)]]);
  assert.equal(candidate.broaderScopeEligible, false);
  assert.ok(candidate.blockers.includes('PERSONA_BROADER_SCOPE_REQUIRES_THREE_SOURCE_PRODUCTS'));
  assert.equal(candidate.cards.length, 3); assert.equal(candidate.eligible, false);
});

test('taxonomy uses all below300 and exactlyfirst300 eligible retained units above300 without identity leakage or representative claim', async t => {
  const small = await personaSourceFixture(t);
  assert.deepEqual(small.evidence.publicSource().taxonomySample.recordIndexes, [0, 1, 2, 3, 4, 5]);
  const large = await personaSourceFixture(t, personaRows(301));
  const sample = large.evidence.publicSource().taxonomySample;
  assert.equal(sample.version, 'retained-source-order-first-300-v1'); assert.equal(sample.recordIndexes.length, 300);
  assert.deepEqual(sample.recordIndexes, Array.from({ length: 300 }, (_, index) => index));
  assert.equal(large.evidence.publicSource().eligibleRecordIndexes.length, 301);
});

test('exact quoted context retains negation, qualifiers, Unicode and literal unknown source dates; public copies cannot alter private checks', async t => {
  const values = personaRows(); values[0]!.comment = 'Không ngọt 😀; nếu đi làm tôi mới mang theo. Không phải lúc nào cũng mua.';
  const f = await personaSourceFixture(t, values);
  const original = f.quote(0);
  const start = original.span.quote.indexOf('ngọt');
  const located = f.evidence.quote({ ...original, span: { start, end: start + 4, quote: 'ngọt' } });
  assert.equal(located.text, values[0]!.comment); assert.equal(located.sourceDate.eligibility, 'UNKNOWN');
  const fake = { ...original, span: { ...original.span, quote: original.span.quote.replace('Không', 'Có') } };
  assert.throws(() => f.evidence.quote(fake), /QUOTE_SPAN_MISMATCH/);
  const emoji = original.span.quote.indexOf('😀');
  assert.throws(() => f.evidence.quote({ ...original, span: { start: emoji, end: emoji + 1, quote: original.span.quote.slice(emoji, emoji + 1) } }), /SURROGATE/);
  const publicCopy = f.evidence.publicSource(); publicCopy.records[0]!.text = 'Forged source';
  assert.equal(f.evidence.quote(original).text, values[0]!.comment);
  assert.equal(f.evidence.publicSource().records[0]!.text, values[0]!.comment);
});

test('wrong frozen identities, quote source/locator/span, view membership and actual CAS corruption fail read-only', async t => {
  const f = await personaSourceFixture(t);
  for (const field of ['workspaceId', 'runId', 'startSha256', 'scopeSha256', 'confirmedSourceSetSha256', 'scopeConfirmedAt'] as const) {
    const binding = { ...f.selection.binding, [field]: field.endsWith('Sha256') ? 'f'.repeat(64)
      : field === 'scopeConfirmedAt' ? '2026-10-09T00:00:00.000Z' : PERSONA_KEY };
    await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, binding }));
  }
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, corpusSha256: 'f'.repeat(64) }), /CORPUS_DIGEST/);
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, request: { ...f.selection.request, source: {
    ...f.selection.request.source, acquiredAt: '2026-10-09T00:00:00.000Z' } } }));
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, marker: { ...f.selection.marker,
    profile: { ...f.selection.marker.profile, keyId: f.selection.binding.workspaceId } } }));
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, marker: { ...f.selection.marker,
    profile: { ...f.selection.marker.profile, platform: 'tiktok' } } as never }));
  const otherSource = await personaSourceFixture(t);
  assert.throws(() => f.evidence.quote(otherSource.quote(0)), /QUOTE_SOURCE_BINDING_MISMATCH/);
  const quote = f.quote(0);
  for (const tampered of [{ ...quote, recordId: 'f'.repeat(64) }, { ...quote, locator: { ...quote.locator, rowIndex: 1 } },
    { ...quote, span: { ...quote.span, quote: 'Not the original source' } }]) assert.throws(() => f.evidence.quote(tampered));
  const view = structuredClone(f.view); view.records.pop();
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, retainedView: view }), /VIEW_REPLAY/);
  const corpus = structuredClone(f.corpus); corpus.projection.records[0]!.locator.textPointer = '/1/comment';
  await assert.rejects(readPrivatePersonaEvidence({ ...f.selection, retainedCorpus: corpus, corpusSha256: hash(corpus) }));
  const original = await f.artifacts.read(f.source.pages[0]!.sha256);
  await fs.writeFile(f.artifacts.pathForDigest(f.source.pages[0]!.sha256), 'corrupted source');
  await assert.rejects(readPrivatePersonaEvidence(f.selection), /digest mismatch/);
  await fs.writeFile(f.artifacts.pathForDigest(f.source.pages[0]!.sha256), original);
  assert.deepEqual((await readPrivatePersonaEvidence(f.selection)).publicSource(), f.evidence.publicSource());
  assert.equal(f.evidence.publicSource().records[0]!.sourceDate.literal, null);
  assert.notEqual(f.evidence.publicSource().records[0]!.sourceDate.literal, PERSONA_NOW);
});

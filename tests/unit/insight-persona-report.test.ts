import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { personaSourceFixture, personaRows, PERSONA_KEY } from '../helpers/insight-persona-fixture.js';
import { personaFixtureResponse, personaIndexes } from '../helpers/insight-persona-service-fixture.js';
import { buildPersonaModelInput } from '../../src/modules/analysis/research-automation/insight-persona-model.js';
import { projectPersonaResponse, type PersonaStageSource } from '../../src/modules/analysis/research-automation/insight-persona-projection.js';
import { personaDigest } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';
import { insightPersonaSection } from '../../src/modules/analysis/research-automation/insight-persona-report.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMarkOrMissing, orderReportCitations, renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import type { PersonaModelResponse, PersonaSnapshot } from '../../contracts/analysis/automation-insight-persona.generated.js';

async function fixture(t: Parameters<typeof personaSourceFixture>[0], rows: unknown[] = personaRows(18)) {
  const f = await personaSourceFixture(t, rows), source = f.evidence.publicSource();
  const binding = { ...source.binding, pairId: 'd'.repeat(64), semanticSha256: 'e'.repeat(64), corpusSha256: source.corpus.artifactSha256,
    collectionId: source.corpus.collectionId, collectionSha256: source.corpus.collectionSha256, sourceRequestSha256: source.corpus.requestSha256,
    viewSha256: source.viewSha256, sourceSha256: personaDigest(source) };
  const stage: PersonaStageSource = { binding, evidence: f.evidence, previous: null,
    request: { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(), binding,
      rootId: null, rootSha256: null, previousProposalId: null, previousProposalSha256: null, stage: 'TAXONOMY',
      recordIndexes: personaIndexes(source.taxonomySample.recordIndexes) } };
  const taxonomy = projectPersonaResponse(stage, personaFixtureResponse(buildPersonaModelInput(stage), source) as PersonaModelResponse).snapshot;
  const classify: PersonaStageSource = { ...stage, previous: taxonomy, request: { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(),
    binding, rootId: randomUUID(), rootSha256: 'a'.repeat(64), previousProposalId: randomUUID(), previousProposalSha256: 'b'.repeat(64), stage: 'CLASSIFY',
    recordIndexes: personaIndexes(source.eligibleRecordIndexes) } };
  const classified = projectPersonaResponse(classify, personaFixtureResponse(buildPersonaModelInput(classify), source) as PersonaModelResponse).snapshot;
  const synthesize: PersonaStageSource = { ...classify, previous: classified, request: { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(),
    binding, rootId: randomUUID(), rootSha256: 'a'.repeat(64), previousProposalId: randomUUID(), previousProposalSha256: 'b'.repeat(64), stage: 'SYNTHESIZE', recordIndexes: [] } };
  const snapshot = projectPersonaResponse(synthesize, personaFixtureResponse(buildPersonaModelInput(synthesize), source) as PersonaModelResponse).snapshot;
  const registry = new CitationRegistry(), citations = { mark: (input: Parameters<CitationRegistry['cite']>[0]) => renderCitationMarkOrMissing(registry.cite(input)) };
  return { f, source, snapshot, registry, citations };
}

test('pure cited persona view copies verified pending evidence and sample labels, preserves complete quotes and source trace without private proof or calls', async t => {
  const { f, source, snapshot, registry, citations } = await fixture(t);
  assert.equal(snapshot.personas.length, 3); assert.equal(snapshot.cards.length, 9);
  const before = JSON.stringify({ source, snapshot });
  const html = orderReportCitations(['I02', 'I03', 'I17'].map(id => insightPersonaSection(snapshot, source, id as 'I02' | 'I03' | 'I17', citations)).join(''), registry);
  assert.ok(html.includes('Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật · Shopee: 6/18 bản ghi trong mẫu — đề xuất, chờ chủ duyệt'));
  assert.ok(html.includes('không dùng mẫu này để kết luận cho kỳ nghiên cứu hoặc toàn bộ khách hàng'));
  assert.ok(html.includes('Chưa có thống kê độ tin cậy'));
  for (const row of source.records) assert.ok(html.includes(row.text!));
  assert.ok(html.includes('I do not want a sweet drink'));
  assert.ok(lintVisibleReportText(html).every(result => result.ok));
  assert.equal(registry.entries().length, 18);
  assert.equal(registry.entries()[0]!.quoteVerification, 'APP_VERIFIED');
  for (const entry of registry.technicalTrace().entries) {
    assert.ok(source.records.some(row => row.locator.pageSha256 === entry.identity));
    assert.ok(source.records.some(row => entry.locator?.kind === 'json-pointer' && entry.locator.pointer === row.locator.textPointer));
  }
  const artifact = JSON.stringify({ html, register: renderCitationRegister(registry.entries(), { format: 'web' }), trace: registry.technicalTrace() });
  for (const secret of [PERSONA_KEY, 'PRIVATE_AUTHOR', 'PRIVATE_PROFILE', f.source.packet.privacy.keyCommitment,
    ...personaRows(18).flatMap(row => [row.authorId, row.reviewId]), ...f.corpus.projection.records.map(row => row.authorIdentity.hash!)])
    assert.equal(artifact.includes(secret), false, secret);
  assert.equal(JSON.stringify({ source, snapshot }), before);
});

test('genuine absent author fallback is adjacent to each persona; shortage retains cards; stars/missing/textless/native aliases remain separate', async t => {
  const missing = personaRows(18).map(({ authorId: _id, ...row }) => row);
  const { source, snapshot, citations } = await fixture(t, [...missing,
    { ...missing[0]! }, { ...missing[0]!, reviewId: '7000000030', comment: '', ratingStar: null },
    { reviewId: '7000000031', shopId: '2001', itemId: '3001', comment: 'Extra literal source text.' },
    { reviewId: '7000000032', shopId: '2001', itemId: '3001', comment: 'Other literal source text.', ratingStar: 0 }]);
  assert.equal(snapshot.personas.length, 3);
  const html = insightPersonaSection(snapshot, source, 'I02', citations);
  assert.equal((html.match(/nguồn không có mã người viết; chưa xác minh là 5 người/g) ?? []).length, 12); // Three personas and nine cards.
  const shortage: PersonaSnapshot = { ...snapshot, personas: [], insufficiency: 'Chưa đủ bằng chứng nguồn.' };
  const scarce = insightPersonaSection(shortage, source, 'I02', citations);
  assert.ok(scarce.includes('Chưa đủ bằng chứng nguồn.')); assert.ok(scarce.includes('Thẻ bằng chứng theo hoàn cảnh'));
  const appendix = insightPersonaSection(snapshot, source, 'I17', citations);
  for (const text of ['5/5', 'nguồn không có số sao', 'Nguồn có trường sao nhưng thiếu giá trị', 'Điểm nguồn không hợp lệ: 0',
    'Nguồn không có phần chữ', 'Bản lặp cùng định danh nguồn; không thêm vào mẫu hoặc phân loại', 'kỳ đo lường chưa rõ']) assert.ok(appendix.includes(text), text);
});

test('renderer rejects wrong source/locator/full context/codebook/member/unsupported attribute and never rewrites provider-bearing literal evidence', async t => {
  const { source, snapshot, citations } = await fixture(t);
  for (const mutate of [
    (s: PersonaSnapshot) => { s.binding.scopeSha256 = 'f'.repeat(64); },
    (s: PersonaSnapshot) => { s.cards[0]!.quotes[0]!.locator.pageSha256 = 'f'.repeat(64); },
    (s: PersonaSnapshot) => { s.cards[0]!.quotes[0]!.text = 'Hidden negation'; },
    (s: PersonaSnapshot) => { s.codebookSha256 = 'f'.repeat(64); },
    (s: PersonaSnapshot) => { s.cards[0]!.recordIndexes = [1, 2]; },
    (s: PersonaSnapshot) => { s.personas[0]!.cardIds[0] = 'f'.repeat(64); },
    (s: PersonaSnapshot) => { s.cards[0]!.situation.value = 'Unsupported interpretation'; },
  ]) { const broken = structuredClone(snapshot); mutate(broken); assert.throws(() => insightPersonaSection(broken, source, 'I02', citations)); }
  const rows = personaRows(18); rows[0]!.comment = 'Apify literal source wording; I do not claim it was rewritten.';
  const unsafe = await fixture(t, rows), before = JSON.stringify(unsafe.snapshot);
  const html = insightPersonaSection(unsafe.snapshot, unsafe.source, 'I02', unsafe.citations);
  assert.equal(html.includes('Apify'), false); assert.ok(html.includes('Nguyên văn được giữ trong bản lưu nguồn; không đưa vào bản đọc này.'));
  assert.equal(JSON.stringify(unsafe.snapshot), before);
});

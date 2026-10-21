import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerifiedQuotesArtifact,
  fixedPageIndexQuestion,
  orderRunPdfsForQuestions,
  planPageIndexQuestions,
  toCitationInput,
  verifyPageIndexQuotes,
  PAGEINDEX_ELIGIBLE_SECTIONS,
  PageIndexQuestionError,
  readPageIndexPdfTitle,
} from '../../src/modules/analysis/pageindex-questions.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';

test('one fixed question per eligible section, none for synthesis or method sections', () => {
  assert.ok(PAGEINDEX_ELIGIBLE_SECTIONS.length > 0);
  for (const section of PAGEINDEX_ELIGIBLE_SECTIONS) {
    const question = fixedPageIndexQuestion(section);
    assert.ok(question && question.length > 0, section);
  }
  for (const section of ['M01', 'M02', 'M11', 'M12', 'M13', 'I01', 'I03', 'I14', 'I15', 'I17', 'UNKNOWN']) {
    assert.equal(fixedPageIndexQuestion(section), null);
  }
});

test('caps hold at one per section per PDF and N per run with a default of 10', () => {
  const planned = planPageIndexQuestions({ sections: PAGEINDEX_ELIGIBLE_SECTIONS, pdfCount: 1 });
  assert.equal(planned.length, 10);
  assert.deepEqual(planned.map(entry => entry.sectionId), PAGEINDEX_ELIGIBLE_SECTIONS.slice(0, 10));
  const custom = planPageIndexQuestions({ sections: ['I04', 'I04', 'M01', 'M05'], pdfCount: 2, maxPerRun: 3 });
  assert.deepEqual(custom.map(entry => [entry.sectionId, entry.pdfIndex]), [['M05', 0], ['I04', 0], ['M05', 1]]);
  assert.equal(planPageIndexQuestions({ sections: [], pdfCount: 3 }).length, 0);
  assert.equal(planPageIndexQuestions({ sections: ['M05'], pdfCount: 0 }).length, 0);
  assert.throws(() => planPageIndexQuestions({ sections: ['M05'], pdfCount: 1, maxPerRun: -1 }),
    error => error instanceof PageIndexQuestionError && error.code === 'INVALID_QUESTION_PLAN');
});

test('verifier keeps quotes found on their page and drops plus logs the rest', () => {
  const drops: Array<{ page: number; reason: string }> = [];
  const verified = verifyPageIndexQuotes({
    candidates: [
      { page: 1, quote: 'Canxi 120 mg' },
      { page: 1, quote: 'Canxi 999 mg không tồn tại' },
      { page: 2, quote: 'Canxi 120 mg' },
      { page: 9, quote: 'Canxi 120 mg' },
    ],
    localPages: [{ page: 1, text: 'Khẩu phần chứa Canxi 120 mg mỗi ngày' }, { page: 2, text: 'Không liên quan' }],
    pageCount: 2,
    sourceSha256: 'a'.repeat(64),
    cloudDocId: 'pi-1',
    sectionId: 'M05',
    onDrop: dropped => { drops.push({ page: dropped.page, reason: dropped.reason }); },
  });
  assert.equal(verified.length, 1);
  assert.equal(verified[0]?.page, 1);
  assert.equal(verified[0]?.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
  assert.deepEqual(drops.map(drop => drop.reason), ['QUOTE_NOT_ON_PAGE', 'QUOTE_NOT_ON_PAGE', 'PAGE_OUT_OF_RANGE']);
  assert.throws(() => verifyPageIndexQuotes({
    candidates: [], localPages: [], pageCount: 0, sourceSha256: 'a'.repeat(64), cloudDocId: 'pi-1', sectionId: 'M05',
  }), error => error instanceof PageIndexQuestionError && error.code === 'INVALID_QUOTE_INPUT');
});

test('artifacts carry verified quotes only and cite as PDF_PAGE without answer text', () => {
  const quote = { sourceSha256: 'b'.repeat(64), cloudDocId: 'pi-2', sectionId: 'I04', page: 3, quote: 'Uống sau ăn', quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED' as const };
  const artifact = buildVerifiedQuotesArtifact('run-1', [quote]);
  assert.equal(artifact.contractVersion, 'pageindex-verified-quotes-v1');
  assert.equal(artifact.approvalState, 'UNREVIEWED');
  assert.ok(!('answer' in artifact), 'vendor answer text is never stored as report content');
  const citation = toCitationInput(quote, 'Báo cáo ngành quạt điện');
  assert.equal(citation.label, 'Báo cáo ngành quạt điện, trang 3', 'the document name and its page, no "Tài liệu" prefix');
  assert.equal(citation.sourceKind, 'PDF_PAGE');
  assert.deepEqual(citation.locator, { kind: 'pdf', page: 3, fragment: null });
  assert.equal(citation.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
  // The shaped input is directly consumable by CitationRegistry.
  const registry = new CitationRegistry();
  const number = registry.cite({ ...citation, technical: { provider: 'pageindex-test', cloudDocId: 'pi-2' } });
  assert.equal(number, 1);
  assert.equal(registry.entries()[0]?.locatorText, 'trang 3');
  assert.match(renderCitationRegister(registry.entries(), { format: 'web' }), /Báo cáo ngành quạt điện<\/span>, <span class="cite-locator">trang 3<\/span>/u);
  for (const unsafe of ['bao-cao-nganh.pdf', 'Báo cáo của Google', 'Báo cáo <script>']) {
    assert.equal(toCitationInput(quote, unsafe, 2).label, 'Tài liệu PDF số 2, trang 3');
  }
  assert.throws(() => buildVerifiedQuotesArtifact('', [quote]),
    error => error instanceof PageIndexQuestionError && error.code === 'INVALID_QUOTE_INPUT');
});

test('reading outcomes record a late document and reject an unverified quote', () => {
  const quote = { sourceSha256: 'b'.repeat(64), cloudDocId: 'pi-2', sectionId: 'I04', page: 3, quote: 'Uống sau ăn', quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED' as const };
  const artifact = buildVerifiedQuotesArtifact('run-1', [quote], [{ sourceSha256: quote.sourceSha256, state: 'NOT_READY_AFTER_WAIT' }]);
  assert.deepEqual(artifact.documents, [{ sourceSha256: quote.sourceSha256, state: 'NOT_READY_AFTER_WAIT' }]);
  assert.throws(() => buildVerifiedQuotesArtifact('run-1', [{ ...quote, quoteVerification: 'MODEL' as never }]), /INVALID_QUOTE_INPUT/u);
});

test('optional local title reader returns null for invalid input or a failed Python launch', async () => {
  const python = process.env.TDN_PAGEINDEX_PYTHON;
  try {
    for (const executable of ['', '/missing-pageindex-python']) {
      process.env.TDN_PAGEINDEX_PYTHON = executable;
      assert.equal(await readPageIndexPdfTitle(Buffer.from('%PDF-1.4\ninvalid')), null);
    }
    assert.equal(await readPageIndexPdfTitle(Buffer.from('not a PDF')), null);
  } finally {
    if (python === undefined) delete process.env.TDN_PAGEINDEX_PYTHON; else process.env.TDN_PAGEINDEX_PYTHON = python;
  }
});

test('owner uploads are planned before captured PDFs, each group in sha order', () => {
  const sha = (c: string) => c.repeat(64);
  const files = [
    { sha256: sha('a'), origin: 'CAPTURE' as const }, { sha256: sha('b'), origin: 'CAPTURE' as const },
    { sha256: sha('f'), origin: 'UPLOAD' as const }, { sha256: sha('c'), origin: 'UPLOAD' as const },
  ];
  const ordered = orderRunPdfsForQuestions(files);
  assert.deepEqual(ordered.map(file => file.sha256[0]), ['c', 'f', 'a', 'b']);
  assert.deepEqual(files.map(file => file.sha256[0]), ['a', 'b', 'f', 'c'], 'input untouched');
  // Two automatic PDFs sorting first by sha and one upload, cap 10, seven Market sections: the upload gets its seven.
  const market = PAGEINDEX_ELIGIBLE_SECTIONS.filter(id => id.startsWith('M'));
  const run = orderRunPdfsForQuestions([{ sha256: sha('0'), origin: 'CAPTURE' as const }, { sha256: sha('1'), origin: 'CAPTURE' as const }, { sha256: sha('9'), origin: 'UPLOAD' as const }]);
  const plan = planPageIndexQuestions({ sections: market, pdfCount: run.length, maxPerRun: 10 });
  const perFile = (s: string) => plan.filter(q => run[q.pdfIndex]!.sha256 === s).length;
  assert.equal(plan.length, 10);
  assert.deepEqual([perFile(sha('9')), perFile(sha('0')), perFile(sha('1'))], [7, 3, 0]);
  assert.deepEqual(plan.filter(q => q.pdfIndex === 0).map(q => q.sectionId), market);
});

test('without captured PDFs the ordered inputs and every planned question are unchanged', () => {
  const files = ['a', 'c', 'f'].map(c => ({ sha256: c.repeat(64), origin: 'UPLOAD' as const }));
  const ordered = orderRunPdfsForQuestions(files);
  assert.deepEqual(ordered, files, 'the run inventory already uses ascending SHA order');
  for (const maxPerRun of [0, 1, 10, 100]) {
    const input = { sections: PAGEINDEX_ELIGIBLE_SECTIONS, pdfCount: files.length, maxPerRun };
    assert.deepEqual(planPageIndexQuestions({ ...input, pdfCount: ordered.length }), planPageIndexQuestions(input));
  }
});

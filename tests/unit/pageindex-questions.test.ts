import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerifiedQuotesArtifact,
  fixedPageIndexQuestion,
  planPageIndexQuestions,
  toCitationInput,
  verifyPageIndexQuotes,
  PAGEINDEX_ELIGIBLE_SECTIONS,
  PageIndexQuestionError,
} from '../../src/modules/analysis/pageindex-questions.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';

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
  const citation = toCitationInput(quote, 'nguon.pdf');
  assert.equal(citation.sourceKind, 'PDF_PAGE');
  assert.deepEqual(citation.locator, { kind: 'pdf', page: 3, fragment: null });
  assert.equal(citation.quoteVerification, 'EXTERNAL_VERIFIER_ATTESTED');
  // The shaped input is directly consumable by CitationRegistry.
  const registry = new CitationRegistry();
  const number = registry.cite({ ...citation, technical: { provider: 'pageindex-test', cloudDocId: 'pi-2' } });
  assert.equal(number, 1);
  assert.equal(registry.entries()[0]?.locatorText, 'trang 3');
  assert.throws(() => buildVerifiedQuotesArtifact('', [quote]),
    error => error instanceof PageIndexQuestionError && error.code === 'INVALID_QUOTE_INPUT');
});

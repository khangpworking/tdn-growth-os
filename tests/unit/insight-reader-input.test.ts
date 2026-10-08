import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyInsightReaderInput, type InsightReaderInput } from '../../src/modules/analysis/reader-report/insight-input-v1.js';
import { ReaderReportInputError } from '../../src/modules/analysis/reader-report/build.js';

const input = (): InsightReaderInput => ({ contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1',
  workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222',
  draftPairId: 'a'.repeat(64), semanticSha256: 'b'.repeat(64), sourceReportSha256: 'c'.repeat(64),
  frozenStartSha256: 'd'.repeat(64), frozenScopeSha256: 'e'.repeat(64), sourceRendererVersion: 'automation-report-kit-v19',
  scope: { keyword: 'Nguồn tổng hợp thử nghiệm', definition: 'Phạm vi tổng hợp đã đóng băng', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } },
  retainedMethods: [{ kind: 'LITERAL', sha256: 'f'.repeat(64) }] });

test('Insight reader canonical identity requires exact authenticated source/scope/version without Market fields', () => {
  const expected = input();
  assert.deepEqual(verifyInsightReaderInput(expected, expected), expected);
  assert.notEqual(verifyInsightReaderInput(expected, expected), expected);
  for (const key of ['workspaceId', 'runId', 'draftPairId', 'semanticSha256', 'sourceReportSha256', 'frozenStartSha256', 'frozenScopeSha256'] as const) {
    const wrong = input(); wrong[key] = key.endsWith('Id') && key !== 'draftPairId' ? '33333333-3333-4333-8333-333333333333' : '0'.repeat(64);
    assert.throws(() => verifyInsightReaderInput(wrong, expected), ReaderReportInputError, key);
  }
  assert.throws(() => verifyInsightReaderInput({ ...expected, profile: {}, metricPackageId: expected.workspaceId }, expected), ReaderReportInputError);
  assert.throws(() => verifyInsightReaderInput({ ...expected, injectedMethodSummary: { count: 100 } }, expected), ReaderReportInputError);
  assert.throws(() => verifyInsightReaderInput({ ...expected, sourceRendererVersion: 'automation-report-kit-v21' }, expected), ReaderReportInputError, 'Future default requires explicit reader version');
  const changedScope = input(); changedScope.scope.keyword = 'Đổi từ khóa';
  assert.throws(() => verifyInsightReaderInput(changedScope, expected), ReaderReportInputError);
  const swappedPeriod = input(); swappedPeriod.scope.requestedPeriod.endDate = '2026-08-01';
  assert.throws(() => verifyInsightReaderInput(swappedPeriod, swappedPeriod), ReaderReportInputError);
  const duplicate = input(); duplicate.retainedMethods.push({ ...duplicate.retainedMethods[0]! });
  assert.throws(() => verifyInsightReaderInput(duplicate, duplicate), ReaderReportInputError);
});

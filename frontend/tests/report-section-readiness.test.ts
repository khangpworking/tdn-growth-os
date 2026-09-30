import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';

const reportId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const semanticVersionId = 'a'.repeat(64);
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

const entry = (sectionId: 'M01' | 'M02' | 'I01', state: 'PARTIAL_DETERMINISTIC_DRAFT' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED') => ({
  sectionId, title: { M01: 'Kết luận chính', M02: 'Phạm vi và phương pháp', I01: 'Câu hỏi kinh doanh' }[sectionId],
  methodId: `method-${sectionId.toLowerCase()}`, methodVersion: '1.0.0', historicalTemplateMaturity: 'METHOD', moduleIds: ['source-scope'],
  requiredInputs: ['verified-input'], inputChecks: [{
    inputId: 'verified-input', state: state === 'PARTIAL_DETERMINISTIC_DRAFT' ? 'PRESENT' : state === 'BLOCKED' ? 'ABSENT' : 'INVALID',
    blocking: state !== 'PARTIAL_DETERMINISTIC_DRAFT', codes: [state === 'PARTIAL_DETERMINISTIC_DRAFT' ? 'EXACT_INPUT_BOUND' : 'INPUT_REQUIRED'],
    evidenceRefs: state === 'PARTIAL_DETERMINISTIC_DRAFT' ? [{ kind: 'REPORT_ARTIFACT', locator: 'metric-result.json', sha256: '9'.repeat(64) }] : [],
  }], reopenCondition: 'Có đủ dữ liệu cùng phạm vi và kỳ đo.', fallbackState: state === 'MANUAL_REVIEW_REQUIRED' ? 'MANUAL_REVIEW_REQUIRED' : 'BLOCKED', fallbackReasons: ['INPUT_REQUIRED'],
  deliveryState: state, claimIds: state === 'PARTIAL_DETERMINISTIC_DRAFT' ? ['M01:all:listings'] : [], contextPointers: state === 'PARTIAL_DETERMINISTIC_DRAFT' ? ['/input/scope'] : [], blockers: state === 'PARTIAL_DETERMINISTIC_DRAFT' ? [] : ['INPUT_REQUIRED'], sectionSha256: ({ M01: '1', M02: '2', I01: '3' } as const)[sectionId].repeat(64),
});

test('section matrix exposes methods, blockers and evidence pointers, then filters without inventing readiness', { concurrency: false }, async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Matrix } = await tsImport('../src/ReportSectionReadiness.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ReportSectionReadiness');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => json({
    contractVersion: '1.0.0', readinessProfile: 'report-input-readiness-v1', reportId, reportVersion: 1, versionId, semanticVersionId,
    packetId: 'b'.repeat(64), catalogId: 'market-insight-30-section-catalog-v1', catalogVersion: '0.1.0', catalogSha256: 'c'.repeat(64),
    sections: [entry('M01', 'PARTIAL_DETERMINISTIC_DRAFT'), entry('M02', 'BLOCKED'), entry('I01', 'MANUAL_REVIEW_REQUIRED')],
  })) as typeof fetch;
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Matrix, { reportId, reportVersion: 1, semanticVersionId })); await settle(); });
    const text = dom.container.textContent ?? '';
    for (const expected of ['3 section đang ở đâu?', 'Code đã tính · một phần', 'Thiếu điều kiện', 'Cần người dùng', 'Kết luận chính', 'Câu hỏi kinh doanh']) assert.ok(text.includes(expected));
    const market = [...dom.container.querySelectorAll('button')].find(button => button.textContent === 'Market M01–M13');
    assert.ok(market);
    await act(async () => { market.click(); await settle(); });
    assert.match(dom.container.textContent ?? '', /Phạm vi và phương pháp/);
    assert.doesNotMatch(dom.container.textContent ?? '', /Câu hỏi kinh doanh/);
    const first = dom.container.querySelector('details.readiness-card') as HTMLDetailsElement;
    first.open = true;
    const input = first.querySelector('details.input-check') as HTMLDetailsElement;
    input.open = true;
    assert.match(first.textContent ?? '', /Đã có/);
    assert.match(first.textContent ?? '', /metric-result\.json/);
    assert.match(first.textContent ?? '', /999999999999/);
    assert.match(first.textContent ?? '', /M01:all:listings/);
    assert.match(first.textContent ?? '', /\/input\/scope/);
  } finally {
    await act(async () => { root.unmount(); }); globalThis.fetch = originalFetch; dom.cleanup();
  }
});

async function settle(): Promise<void> { await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); await Promise.resolve(); }

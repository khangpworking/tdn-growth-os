import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { locatedInsightFixture } from '../../tests/helpers/located-insight-fixture';
import { sourceDefaultInsightRules } from '../../src/modules/analysis/research-automation/insight-default-coding';
import { loadInsightCoding, proposeDefaultInsightCodingModel } from '../src/research-automation/insight-coding-api';
import { insightCodingAnyView, insightCodingVersionedView, insightDefaultModelRequest, insightDefaultModelSubmission } from '../src/generated/report-validators.generated.js';
import { setupDom } from './dom';
import type { ResearchAutomationRun } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222', pairId = 'a'.repeat(64);
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;
const corpus = { artifactSha256: 'a'.repeat(64), corpusId: 'b'.repeat(64), collectionId: id(1), collectionSha256: 'c'.repeat(64), requestSha256: 'd'.repeat(64) };
const binding = { contractVersion: 'insight-source-binding-v2' as const, workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64),
  sourceKind: 'PRIVATE_SHOPEE' as const, sourcePackageSha256: 'd'.repeat(64), inputSha256: 'e'.repeat(64), projectionSha256: 'f'.repeat(64), corpus };
function fixture() {
  const input = locatedInsightFixture();
  const annotations = { i02: [], i04: [], i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [] };
  Object.assign(input, annotations, { sources: [{ logicalPath: 'private-review-source', sha256: corpus.collectionSha256 }] });
  input.records = [{ sourceSha256: corpus.collectionSha256, locator: '/records/0/text', text: 'Source phone 0123456789 remains verbatim.',
    sourceAttribution: 'Synthetic Shopee source', timeText: null, disposition: 'INCLUDED', dispositionReason: null }];
  const privateSource = { contractVersion: 'private-insight-source-projection-v1', corpus, input, records: [{ recordIndex: 0, recordId: '1'.repeat(64), shopId: '2001', itemId: '3001',
    textState: 'READABLE', rating: { fieldPresent: true, state: 'VALID', value: 5 }, region: 'VN', admission: 'SELECTED_TEXT',
    locator: { collectionId: corpus.collectionId, pageSha256: '2'.repeat(64), pageIndex: 0, rowIndex: 0, textPointer: '/0/comment' },
    duplicateOfRecordIndex: null, disposition: 'INCLUDED', dispositionReason: null }] };
  const view = { contractVersion: 'insight-coding-view-v3', context: { binding, input, privateSource }, evidence: [] as any[] };
  const request = { contractVersion: 'insight-default-model-request-v2' as const, requestKey: id(3), binding, defaultRuleId: null,
    defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
  return { view, request, annotations, rules: sourceDefaultInsightRules(input) };
}
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

test('private contracts use additive client versions and reject historical versions or private metadata before transport', async () => {
  const { view, request } = fixture();
  assert.equal(insightCodingVersionedView(view), true); assert.equal(insightCodingAnyView(view), false);
  assert.equal(insightDefaultModelSubmission(request), true); assert.equal(insightDefaultModelRequest(request), false);
  for (const changed of [{ ...request, contractVersion: 'insight-default-model-request-v1' }, { ...request, binding: { ...binding, authorId: 'PRIVATE_AUTHOR' } }])
    assert.equal(insightDefaultModelSubmission(changed), false);
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async (_url, init) => { calls++; return response(view); }) as typeof fetch;
  try {
    assert.deepEqual(await loadInsightCoding(workspaceId, runId, pairId, new AbortController().signal), view);
    await assert.rejects(proposeDefaultInsightCodingModel(workspaceId, runId, { ...request, binding: { ...binding, workspaceId: id(7) } }, 'synthetic', new AbortController().signal), /khớp nguồn/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('mounted OWNER private default flow sends v2 without adoption and exact retry requires explicit confirmation', async () => {
  const f = fixture(), dom = setupDom(), original = globalThis.fetch;
  const posts: any[] = []; let calls = 0, lost = true, activity = 0;
  globalThis.fetch = (async (url, init) => {
    if (init?.method !== 'POST') return response(f.view);
    const body = JSON.parse(String(init.body)); posts.push(body);
    if (String(url).endsWith('/report-revisions')) { activity++; return response({ attemptId: id(9), attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202); }
    assert.equal(body.contractVersion, 'insight-default-model-request-v2'); assert.deepEqual(body.binding, binding);
    assert.equal('adoptionId' in body, false);
    if (lost) {
      calls++;
      f.view.evidence.push({ evidenceId: id(10), kind: 'DEFAULT_RULE', sequence: 1, binding, createdAt: '2026-10-09T00:00:00.000Z', sha256: 'f'.repeat(64),
        request: { contractVersion: 'insight-coding-default-rule-v2', kind: 'DEFAULT_RULE', status: 'PROPOSED', requestKey: id(11), originatingRequestKey: body.requestKey, binding, policyVersion: 'source-private-default-coding-v1', rules: f.rules } },
        { evidenceId: id(12), kind: 'PROPOSAL', sequence: 1, binding, createdAt: '2026-10-09T00:00:00.000Z', sha256: 'e'.repeat(64),
          request: { contractVersion: 'insight-coding-default-propose-v2', status: 'PROPOSED', requestKey: body.requestKey, defaultRuleId: id(10), defaultRuleSha256: 'f'.repeat(64),
            previousProposalId: null, previousProposalSha256: null, executionId: id(13), recordIndexes: body.recordIndexes, rules: f.rules, codebookSha256: 'a'.repeat(64), annotations: f.annotations } });
      lost = false; throw new TypeError('Synthetic lost response');
    }
    return response({ contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: id(13), proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId: id(12), exactRetry: true } });
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCodingPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingPanel');
  const root = createRoot(dom.container);
  const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  const until = async (check: () => boolean) => { for (let i = 0; i < 300 && !check(); i++) await settle(); assert.ok(check()); };
  const click = async (label: string) => { const b = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === label); assert.ok(b, label); await act(async () => b.click()); };
  try {
    await act(async () => root.render(createElement(Panel, { run: { workspaceId, runId, revision: 4, definition: { definition: 'Synthetic private source' }, requestedPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 } } as ResearchAutomationRun, pairId, versionNumber: 1, ownerToken: 'synthetic', disabled: false,
      reportBlock: null, onBusyChanged: () => {}, onActivityChanged: () => {} })));
    await until(() => dom.container.textContent!.includes('Tạo đề xuất AI mặc định'));
    assert.equal(posts.length, 0);
    assert.ok(dom.container.textContent!.includes('Chưa hỗ trợ kiểm chéo cho nguồn riêng này.'));
    assert.equal(dom.container.querySelector('.ic-crosscheck'), null);
    assert.equal([...dom.container.querySelectorAll('button')].find(item => item.textContent === 'Soạn quy tắc mã hóa')!.disabled, true);
    await click('Tạo đề xuất AI mặc định'); assert.equal(posts.length, 0); await click('Gọi model và lưu đề xuất');
    await until(() => dom.container.textContent!.includes('Thử lại đúng yêu cầu mặc định'));
    assert.equal(posts.length, 1); await click('Thử lại đúng yêu cầu mặc định');
    await until(() => dom.container.textContent!.includes('Tạo báo cáo nháp từ đề xuất mặc định đã chọn'));
    assert.deepEqual(posts[1], posts[0]); assert.equal(calls, 1);
    assert.equal(f.view.context.input.records[0]!.text, 'Source phone 0123456789 remains verbatim.');
    await click('Tạo báo cáo nháp từ đề xuất mặc định đã chọn'); assert.equal(activity, 0); await click('Tạo bản nháp');
    await until(() => activity === 1);
    assert.deepEqual(posts[2].defaultInsight, { contractVersion: 'insight-default-draft-select-v1', proposalId: id(12), proposalSha256: 'e'.repeat(64) });
    assert.equal(calls, 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); }
});

test('standalone historical crosscheck child cannot confirm or dispatch from a private binding', async () => {
  const f = fixture(), dom = setupDom(), original = globalThis.fetch; let posts = 0;
  globalThis.fetch = (async (_url, init) => {
    if (init?.method === 'POST') posts++;
    return response({ error: { message: 'Private crosscheck is unsupported' } }, 400);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCrosscheckPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCrosscheckPanel');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(Panel, { run: { workspaceId, runId } as ResearchAutomationRun,
      view: f.view as unknown as import('../src/research-automation/insight-coding-ui').View, ownerToken: 'synthetic', block: null, reportBlock: null,
      inFlight: { current: false }, onBusyChanged: () => {}, onActivityChanged: () => {} })));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    const button = [...dom.container.querySelectorAll('button')].find(item => item.textContent === 'Xem lại mẫu cho model thứ hai');
    assert.ok(button); assert.equal(button.disabled, true);
    await act(async () => button.click());
    assert.equal(document.querySelector('[role="dialog"]'), null); assert.equal(posts, 0);
  } finally { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); }
});

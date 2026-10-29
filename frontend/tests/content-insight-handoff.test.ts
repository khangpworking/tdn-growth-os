import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, type ReactNode } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { statement, id, at } from '../../tests/fixtures/content-insight-handoff-statement';
import type { ContentInsightReport } from '../../contracts/api/content-insight-reports-api.generated';
import type { InsightReportStatement } from '../../contracts/analysis/insight-report-statement.generated';

const revisionId = id(100), campaignId = id(3), workspaceId = id(50), runId = id(60);
const report = (patch: Partial<ContentInsightReport> = {}): ContentInsightReport => ({ revisionId, runId, reportKind: 'INSIGHT', revisionNumber: 2, keyword: 'Synthetic keyword', period: { startDate: '2026-10-21', endDate: '2026-10-22' }, createdAt: at, ...patch });
const s = statement(revisionId, { statementId: id(101) });
const source = (selected = s) => ({ kind: 'INSIGHT_REPORT' as const, revisionId: selected.revisionId, statementId: selected.statementId, snapshot: selected });
const fields = { customer: s.customer, painPoint: s.conflict, insight: s.insight };
const insight = (selected = s) => ({ customer: selected.customer, painPoint: selected.conflict, insight: selected.insight, source: source(selected) });
const campaign = { contractVersion: '1.0.0', campaign: { campaignId, campaignKey: 'cih-test', brandId: id(1), version: 1, campaign: { name: 'Synthetic campaign', objective: 'Synthetic objective', items: [{ itemId: id(2), itemVersion: 1 }] }, createdAt: at }, items: [{ itemId: id(2), itemVersion: 1, itemKey: 'service', itemType: 'SERVICE', name: 'Synthetic service', tiers: [] }], history: [{ version: 1, name: 'Synthetic campaign', createdAt: at }], lifecycle: { sequence: 0 } };
const detail = (latest?: ReturnType<typeof insight>, extra = {}) => ({ contractVersion: '1.0.0', campaignId, campaignVersion: 1, campaignDeleted: false, gate: { required: false, ready: true }, history: latest ? [{ version: 1, sourceKind: 'INSIGHT_REPORT', createdAt: at }] : [], ...(latest ? { latest: { version: 1, insight: latest, createdAt: at } } : {}), ...extra });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
async function flush() { await act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); }); }
function button(container: HTMLElement, text: string) { const result = [...container.querySelectorAll('button')].find(b => b.textContent?.trim() === text); assert.ok(result, `Missing button ${text}`); return result; }
async function click(element: HTMLElement) { await act(async () => element.click()); await flush(); }
async function change(element: HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const win = element.ownerDocument.defaultView!;
  const proto = element.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : win.HTMLTextAreaElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(element, value); element.dispatchEvent(new win.Event('input', { bubbles: true })); element.dispatchEvent(new win.Event('change', { bubbles: true })); }); await flush();
}
async function harness(t: import('node:test').TestContext, handler: typeof fetch) {
  const dom = setupDom(), original = globalThis.fetch; globalThis.fetch = handler;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const module = await tsImport('../src/InsightReportPicker.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/InsightReportPicker');
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); });
  return { ...dom, ...module, render: async (node: ReactNode) => { await act(async () => root.render(node)); await flush(); } };
}
function pickerReads(statements: InsightReportStatement[] = [s], reports = [report()]): typeof fetch { return async url => String(url).endsWith('/statements') ? json({ contractVersion: '1.0.0', report: reports.find(r => String(url).includes(r.revisionId)) ?? report(), statements }) : json({ contractVersion: '1.0.0', reports }); }
async function choose(container: HTMLElement, statementId = s.statementId) {
  const select = container.querySelector('section[aria-label="Chọn câu từ báo cáo Insight"] select') as HTMLSelectElement;
  if (!select.value) await change(select, revisionId);
  const radio = container.querySelector(`input[value="${statementId}"]`) as HTMLInputElement; assert.ok(radio); await click(radio); await click(button(container, 'Dùng câu insight'));
}
async function page(t: import('node:test').TestContext, initial = detail(), statements = [s]) {
  let current = initial; const posts: { url: string; body: any }[] = [];
  const h = await harness(t, async (url, init) => {
    const path = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push({ url: path, body });
      if (path.endsWith('from-report')) current = detail(insight(statements.find(v => v.statementId === body.statementId)!));
      return json({ contractVersion: '1.0.0', campaignId, version: body.expectedVersion + 1, createdAt: at, exactRetry: false }, 201);
    }
    if (path === `/api/content/campaigns/${campaignId}`) return json(campaign);
    if (path === `/api/content/campaigns/${campaignId}/insight`) return json(current);
    if (path.endsWith('/statements')) return json({ contractVersion: '1.0.0', report: report({ revisionId: path.split('/').at(-2)! }), statements });
    return json({ contractVersion: '1.0.0', reports: [report(), report({ revisionId: id(110), revisionNumber: 3 })] });
  });
  const { default: Page } = await tsImport('../src/InsightPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/InsightPage');
  await h.render(createElement(Page, { mode: 'real', campaignId, ownerToken: 'synthetic-token', writesAvailable: true, demoCampaigns: [], demoItems: [], demoInsights: [], setDemoInsights: () => undefined, researchProducts: [], notify: () => undefined }));
  return { ...h, posts };
}

test('CIH-Q16 dropdown shows frozen dates/missing period and keeps run IDs only in hover titles', async t => {
  const reports = [report(), report({ revisionId: id(102), runId: id(62), period: { startDate: '2025-12-30', endDate: '2026-01-02' } }), report({ revisionId: id(103), runId: id(63), period: null })];
  const h = await harness(t, pickerReads([s], reports)); await h.render(createElement(h.default, { disabled: false, onApply: () => undefined }));
  const options = [...h.container.querySelectorAll('option')].slice(1);
  assert.deepEqual(options.map(o => o.value), [revisionId, id(102), id(103)]);
  assert.deepEqual(options.map(o => o.textContent), ['Synthetic keyword · 21/10–22/10/26 · bản 2', 'Synthetic keyword · 30/12/25–02/01/26 · bản 2', 'Synthetic keyword · Chưa có kỳ dữ liệu · bản 2']);
  assert.deepEqual(options.map(o => o.title), [runId, id(62), id(63)]); assert.ok(options.every(o => !o.textContent!.includes(o.title)));
});

test('CIH-Q17 picker hides NONE, renders stages/confidence and applies exactly one selected card', async t => {
  const statements = [s, statement(revisionId, { statementId: id(102), insight: 'They prefer another complete sentence.', purchaseStage: 'PURCHASE', confidence: { level: 'CERTAIN', hypothesis: false } }), statement(revisionId, { statementId: id(103), confidence: { level: 'FAIR', hypothesis: false } }), statement(revisionId, { statementId: id(104), insight: 'Hidden NONE sentence.', confidence: { level: 'NONE', hypothesis: false } })];
  const selected: InsightReportStatement[] = [], h = await harness(t, pickerReads(statements)); await h.render(createElement(h.default, { disabled: false, onApply: v => selected.push(v) }));
  await change(h.container.querySelector('select')!, revisionId); assert.equal(h.container.querySelectorAll('input[type=radio]').length, 3); assert.doesNotMatch(h.container.textContent!, /Hidden NONE/); assert.match(h.container.textContent!, /Muốn mua · Yếu · Giả thuyết/); assert.match(h.container.textContent!, /Mua · Chắc/); assert.match(h.container.textContent!, /Khá/);
  await click(h.container.querySelector(`input[value="${s.statementId}"]`)!); await click(h.container.querySelector(`input[value="${id(102)}"]`)!); assert.equal(h.container.querySelectorAll('input:checked').length, 1); assert.deepEqual(selected, []); await click(button(h.container, 'Dùng câu insight')); assert.deepEqual(selected, [statements[1]]);
});

test('CIH-Q18 read-only reference retains weak/hypothesis labels while unflagged twin does not', async t => {
  const h = await harness(t, pickerReads()); await h.render(createElement(h.InsightReportReference, { source: source(), current: { ...fields, insight: 'Edited sentence.' } }));
  assert.match(h.container.textContent!, /Yếu · Giả thuyết/); assert.equal(h.container.querySelectorAll('input,textarea,select').length, 0);
  const certain = statement(revisionId, { confidence: { level: 'CERTAIN', hypothesis: false } }); await h.render(createElement(h.InsightReportReference, { source: source(certain), current: fields })); assert.match(h.container.textContent!, /Chắc/); assert.doesNotMatch(h.container.textContent!, /Giả thuyết/);
});

test('CIH-Q19 report rows expose send only for eligible exact INSIGHT revisions; opening/cancel writes nothing', async t => {
  const revisions = ['APPROVED', 'REJECTED', 'PENDING_OWNER_REVIEW', 'APPROVED'].map((state, i) => ({ revisionId: i === 0 ? revisionId : id(200 + i), revisionNumber: i === 3 ? 1 : i + 1, workspaceId, runId, reportKind: i === 3 ? 'MARKET' : 'INSIGHT', state, builderVersion: i === 3 ? 'reader-report-market-v3' : 'reader-report-insight-v1', draftPairId: 'a'.repeat(64), htmlSha256: 'b'.repeat(64), createdAt: at, decision: state === 'APPROVED' || state === 'REJECTED' ? { decision: state, decidedAt: at, reason: null } : null, ...(i === 3 ? { platforms: ['shopee'], profileStatus: 'proposed' } : { semanticSha256: 'c'.repeat(64), sourceReportSha256: 'd'.repeat(64) }) }));
  let writes = 0; const h = await harness(t, async (url, init) => {
    if (init?.method === 'POST') writes++;
    const path = String(url);
    if (path === '/api/content/insight-reports') return json({ contractVersion: '1.0.0', reports: [report()] });
    if (path.endsWith('/statements')) return json({ contractVersion: '1.0.0', report: report(), statements: [s] });
    if (path === '/api/content/campaigns') return json({ contractVersion: '1.0.0', campaigns: [] });
    if (path.includes('reader-reports')) return json({ contractVersion: 'reader-report-list-v2', workspaceId, runId, revisions });
    return json({ contractVersion: 'research-automation-report-versions-v1', workspaceId, runId, versions: [] });
  });
  const { default: Panel } = await tsImport('../src/research-automation/ReaderReportPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReaderReportPanel');
  await h.render(createElement(Panel, { run: { workspaceId, runId, status: 'DRAFT_READY', reports: ['INSIGHT', 'MARKET'] } as any, ownerToken: 'synthetic-token', writesAvailable: true }));
  assert.equal([...h.container.querySelectorAll('button')].filter(b => b.textContent === 'Gửi sang Content').length, 0);
  await change(h.container.querySelector('select')!, 'INSIGHT');
  assert.equal([...h.container.querySelectorAll('button')].filter(b => b.textContent === 'Gửi sang Content').length, 1);
  const send = button(h.container, 'Gửi sang Content'); assert.ok(send.closest('li')?.textContent?.includes('lần 1')); await click(send); await choose(h.container);
  assert.ok([...h.container.querySelectorAll('a')].find(a => a.textContent === 'Tạo chiến dịch mới')); assert.equal(writes, 0); await click(button(h.container, 'Đóng')); assert.equal(h.container.querySelector('[role=dialog]'), null); assert.equal(writes, 0);
});

test('CIH-Q20 pull sends one exact selection and reloads the mapped draft', async t => {
  const h = await page(t); await choose(h.container); assert.equal(h.posts.length, 1); assert.equal(h.posts[0]!.url, `/owner-api/content/campaigns/${campaignId}/insight/from-report`); assert.deepEqual(h.posts[0]!.body, { contractVersion: '1.0.0', expectedVersion: 0, revisionId, statementId: s.statementId, confirmReplacement: false });
  assert.equal((h.container.querySelector('#insight-pain') as HTMLTextAreaElement).value, s.conflict); assert.ok(h.container.querySelector('[aria-label="Từ báo cáo"]'));
});

test('CIH-Q21 new-campaign report attachment keeps the full form and cancel performs no write', async t => {
  let writes = 0, cancelled = 0; const h = await harness(t, async (_url, init) => { if (init?.method === 'POST') writes++; return json({ contractVersion: '1.0.0', report: report(), statements: [s] }); });
  const { CampaignForm } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const { campaignEditorReducer } = await import('../src/campaign-data-source');
  const editor = campaignEditorReducer(null, { type: 'new', key: 'cih-new' });
  await h.render(createElement(CampaignForm, { mode: 'real', ownerToken: 'synthetic-token', writesAvailable: true, brands: [], catalogItems: [], productWorkspaces: [], editor, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onStaleSettled: () => undefined, isActiveSession: () => true, onCancel: () => { cancelled++; }, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined, reportSelection: { revisionId, statementId: s.statementId } }));
  assert.match(h.container.textContent!, /Thương hiệu/); assert.match(h.container.textContent!, /Tên chiến dịch/); assert.match(h.container.textContent!, /Mục tiêu/); assert.match(h.container.textContent!, /Sản phẩm/); assert.match(h.container.textContent!, new RegExp(s.insight));
  const cancel = [...h.container.querySelectorAll('button')].find(b => /Hủy|Bỏ|Đóng/.test(b.textContent!)); assert.ok(cancel); await click(cancel); assert.equal(cancelled, 1); assert.equal(writes, 0);
});

test('CIH-Q22 reference displays all extra groups, exact source IDs and separate evidence without fabricated N', async t => {
  const h = await harness(t, pickerReads()); await h.render(createElement(h.InsightReportReference, { source: source(), current: fields }));
  for (const value of [s.hiddenTruth, s.motivation, s.threeC!.customer, s.threeC!.brand, s.threeC!.category, revisionId, s.statementId]) assert.ok(h.container.textContent!.includes(value));
  const lines = [...h.container.querySelectorAll('dd p')].map(p => p.textContent); assert.deepEqual(lines, ['Shopee: 7 bản ghi / 19 bản ghi', 'TikTok Shop: 3 bản ghi']); assert.equal(h.container.querySelectorAll('input,textarea').length, 0); assert.doesNotMatch(lines[1]!, /\/|0 bản ghi/);
});

test('CIH-Q24 dirty unsaved and saved drafts ask confirmation, preserve edits on cancel, and send only after confirm', async t => {
  const h = await page(t); await change(h.container.querySelector('#insight-customer')!, 'Local unsaved customer'); await choose(h.container); assert.equal(h.posts.length, 0); assert.ok(h.container.querySelector('[role=dialog]')); await click(button(h.container, 'Hủy')); assert.equal((h.container.querySelector('#insight-customer') as HTMLTextAreaElement).value, 'Local unsaved customer'); assert.equal(h.posts.length, 0);
  await click(button(h.container, 'Dùng câu insight')); await click(button(h.container, 'Thay Insight')); assert.equal(h.posts.length, 1); assert.equal(h.posts[0]!.body.confirmReplacement, true);
  await choose(h.container); assert.ok(h.container.querySelector('[role=dialog]')); assert.equal(h.posts.length, 1);
});

test('CIH-Q29 edited labels track each field and disappear only when that field reverts', async t => {
  const h = await page(t, detail(insight()));
  const controls = [['#insight-customer', s.customer], ['#insight-pain', s.conflict], ['#insight-text', s.insight]] as const;
  for (const [index, [selector]] of controls.entries()) { await change(h.container.querySelector(selector)!, `Edited ${index}`); assert.equal((h.container.textContent!.match(/Đã sửa so với báo cáo/g) ?? []).length, index + 1); }
  await change(h.container.querySelector('#insight-pain')!, s.conflict); assert.equal((h.container.textContent!.match(/Đã sửa so với báo cáo/g) ?? []).length, 2); assert.ok(h.container.textContent!.includes(s.conflict)); assert.equal(h.posts.length, 0);
});

test('CIH-Q33 empty feature stays visible/disabled and connection errors never claim an empty list', async t => {
  let fail = false; const h = await harness(t, async url => String(url).includes('/reader-reports/') ? json({ contractVersion: 'reader-report-list-v2', workspaceId, runId, revisions: [] }) : fail ? json({ error: 'synthetic failure' }, 500) : json({ contractVersion: '1.0.0', reports: [] }));
  await h.render(createElement(h.default, { disabled: false, onApply: () => undefined })); assert.match(h.container.textContent!, /Chưa có báo cáo nào có câu insight/); assert.equal(h.container.querySelector('select')!.disabled, true);
  fail = true; await h.render(createElement(h.default, { key: 'error', disabled: false, onApply: () => undefined })); assert.ok(h.container.querySelector('[role=alert]')); assert.doesNotMatch(h.container.textContent!, /Chưa có báo cáo nào có câu insight/);
  const { default: Panel } = await tsImport('../src/research-automation/ReaderReportPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReaderReportPanel');
  fail = false; await h.render(createElement(Panel, { run: { workspaceId, runId, status: 'FAILED', reports: ['INSIGHT'] } as any, ownerToken: 'synthetic-token', writesAvailable: true })); assert.equal(button(h.container, 'Gửi sang Content').disabled, true); assert.match(h.container.textContent!, /Chưa có báo cáo nào có câu insight/);
});

test('CIH-Q20 push sends the same exact handoff and navigates to the campaign Insight', async t => {
  const posts: any[] = []; const h = await harness(t, async (url, init) => {
    const path = String(url);
    if (init?.method === 'POST') { posts.push({ url: path, body: JSON.parse(String(init.body)) }); return json({ contractVersion: '1.0.0', campaignId, version: 1, createdAt: at, exactRetry: false }, 201); }
    if (path.endsWith('/statements')) return json({ contractVersion: '1.0.0', report: report(), statements: [s] });
    if (path === '/api/content/insight-reports') return json({ contractVersion: '1.0.0', reports: [report()] });
    if (path.endsWith('/insight')) return json(detail());
    return json({ contractVersion: '1.0.0', campaigns: [{ campaignId, campaignKey: 'cih-test', brandId: id(1), version: 1, name: 'Synthetic campaign', items: [{ itemId: id(2), itemVersion: 1, name: 'Synthetic service', tierNames: [] }], updatedAt: at }] });
  });
  const { default: Send } = await tsImport('../src/SendInsightToContent.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/SendInsightToContent');
  await h.render(createElement(Send, { revisionId, ownerToken: 'synthetic-token', writesAvailable: true, onClose: () => undefined })); await choose(h.container); assert.equal(posts.length, 0);
  await change(h.container.querySelector('select')!, campaignId); await click(button(h.container, 'Gửi sang chiến dịch'));
  assert.deepEqual(posts, [{ url: `/owner-api/content/campaigns/${campaignId}/insight/from-report`, body: { contractVersion: '1.0.0', expectedVersion: 0, revisionId, statementId: s.statementId, confirmReplacement: false } }]); assert.equal(window.location.hash, `#/content/${campaignId}/insight`);
});

test('CIH-Q25 locked Insight disables the picker and stale submit shows the exact server refusal', async t => {
  const h = await page(t, detail(insight(), { lock: { insightVersion: 1, campaignVersion: 1, lockedAt: at } }));
  assert.equal((h.container.querySelector('section[aria-label="Chọn câu từ báo cáo Insight"] select') as HTMLSelectElement).disabled, true); assert.equal(button(h.container, 'Dùng câu insight').disabled, true); assert.equal(h.posts.length, 0);
  const { sendReport } = await import('../src/insight-report-data-source');
  await assert.rejects(sendReport(campaignId, { contractVersion: '1.0.0', expectedVersion: 1, revisionId, statementId: s.statementId, confirmReplacement: true }, 'synthetic-token', async () => json({ error: { code: 'conflict', message: 'Insight đã chốt, hãy tạo chiến dịch mới' } }, 409)), /Insight đã chốt, hãy tạo chiến dịch mới/);
});

test('CIH-Q24 push asks again after replacement is cancelled and posts only after confirmation', async t => {
  const posts: { url: string; body: unknown }[] = [];
  const h = await harness(t, async (url, init) => {
    const path = String(url);
    if (init?.method === 'POST') {
      posts.push({ url: path, body: JSON.parse(String(init.body)) });
      return json({ contractVersion: '1.0.0', campaignId, version: 2, createdAt: at, exactRetry: false }, 201);
    }
    if (path.endsWith('/statements')) return json({ contractVersion: '1.0.0', report: report(), statements: [s] });
    if (path === '/api/content/insight-reports') return json({ contractVersion: '1.0.0', reports: [report()] });
    if (path.endsWith('/insight')) return json(detail(insight()));
    return json({ contractVersion: '1.0.0', campaigns: [{ campaignId, campaignKey: 'cih-test', brandId: id(1), version: 1, name: 'Synthetic campaign', items: [{ itemId: id(2), itemVersion: 1, name: 'Synthetic service', tierNames: [] }], updatedAt: at }] });
  });
  const { default: Send } = await tsImport('../src/SendInsightToContent.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/SendInsightToContent');
  await h.render(createElement(Send, { revisionId, ownerToken: 'synthetic-token', writesAvailable: true, onClose: () => undefined }));
  await choose(h.container);
  await change(h.container.querySelector('select')!, campaignId);
  await click(button(h.container, 'Gửi sang chiến dịch'));
  assert.match(h.container.textContent!, /Thay Insight nháp\?/);
  await click(button(h.container, 'Hủy'));
  assert.doesNotMatch(h.container.textContent!, /Thay Insight nháp\?/);
  assert.deepEqual(posts, []);
  await click(button(h.container, 'Gửi sang chiến dịch'));
  assert.deepEqual(posts, []);
  assert.match(h.container.textContent!, /Thay Insight nháp\?/);
  await click(button(h.container, 'Thay Insight'));
  assert.deepEqual(posts, [{ url: `/owner-api/content/campaigns/${campaignId}/insight/from-report`, body: { contractVersion: '1.0.0', expectedVersion: 1, revisionId, statementId: s.statementId, confirmReplacement: true } }]);
  assert.equal(window.location.hash, `#/content/${campaignId}/insight`);
});

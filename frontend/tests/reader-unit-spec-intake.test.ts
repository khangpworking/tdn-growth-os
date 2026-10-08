import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { act, createElement } from 'react';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { buildReaderWithUnitSpecs } from '../src/research-automation/reader-report-api';
import { ResearchAutomationError, type ResearchAutomationRun } from '../src/research-automation/api';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token-abcdefghijklmnopqrstuvwxyz';
const observation = { platform: 'shopee', listing: 'synthetic-listing', variant: 'synthetic variant',
  category: { label: 'Thử nghiệm', kind: 'MASS', massBasis: 'NET', countKind: null, specGroup: null },
  price: { value: 10000, currency: 'VND', kind: 'LISTED', conditions: [] }, quantity: { value: 200, unit: 'g' },
  period: { start: '2026-01-01', end: '2026-01-31' } };
const sourceBytes = JSON.stringify({ observations: [observation] }, null, 2) + '\n';
const sha256 = createHash('sha256').update(sourceBytes).digest('hex');
const packet = { contractVersion: 'market-unit-prices-v1', sources: [{ sha256, role: 'LISTING_SPEC' }],
  records: [{ rowI: 0, source: { sourceSha256: sha256, locator: '/observations/0' }, observation }] };
const request = { contractVersion: 'reader-report-build-v1.2', requestKey: '33333333-3333-4333-8333-333333333333',
  metricPackageId: '44444444-4444-4444-8444-444444444444', platforms: ['shopee'],
  profile: { slug: 'synthetic', product: 'Hũ thử', status: 'proposed', segments: { S1: 'Hũ' }, short: {}, core: ['S1'], non: [], rules: [{ seg: 'S1', when: {} }], signals: [] },
  source: { measurementPeriod: { start: '2026-01-01', end: '2026-01-31' }, rowCap: 5000,
    displayedHeadlines: { revenueVnd: 100, soldListings: 1, shops: 1, units: 2 }, platformBreakdown: { shopee: { displayedRevenueVnd: 100 } } }, cover: null, unitPrices: packet };
const revision = { revisionId: '55555555-5555-4555-8555-555555555555', revisionNumber: 1, workspaceId, runId,
  state: 'PENDING_OWNER_REVIEW', draftPairId: 'a'.repeat(64), platforms: ['shopee'], profileStatus: 'proposed', htmlSha256: 'b'.repeat(64), createdAt: '2026-02-01T00:00:00Z', decision: null };
const intakeReceipt = { contractVersion: 'reader-unit-spec-intake-receipt-v1', exactRetry: false, intakeSha256: 'c'.repeat(64), workspaceId, runId,
  request: { contractVersion: 'reader-unit-spec-intake-v1', metricPackageId: request.metricPackageId, platforms: request.platforms, unitPrices: packet } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

test('reader intake client verifies exact bytes/receipt binding before authenticated build', async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    calls.push(String(url)); assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.equal(init!.credentials, 'omit'); assert.equal(init!.redirect, 'error');
    if (String(url).endsWith('unit-spec-intakes')) {
      assert.ok(init!.body instanceof FormData); const form = init!.body;
      assert.deepEqual(JSON.parse(String(form.get('metadata'))), intakeReceipt.request);
      const file = form.get(`file:${sha256}`) as File; assert.equal(await file.text(), sourceBytes);
      return json(intakeReceipt, 201);
    }
    assert.deepEqual(JSON.parse(String(init!.body)), { contractVersion: 'reader-report-unit-spec-build-v1', intakeSha256: intakeReceipt.intakeSha256, request });
    return json({ contractVersion: 'reader-report-build-receipt-v1', exactRetry: false, revision }, 201);
  }) as typeof fetch;
  try {
    const receipt = await buildReaderWithUnitSpecs(workspaceId, runId, request as any, [{ role: 'LISTING_SPEC', file: new File([sourceBytes], 'source.json') }], token);
    assert.equal(receipt.revision.revisionId, revision.revisionId); assert.equal(calls.length, 2);
    calls.length = 0;
    await assert.rejects(buildReaderWithUnitSpecs(workspaceId, runId, request as any, [{ role: 'OWNER_DECLARATION', file: new File([sourceBytes], 'source.json') }], token), /vai trò/);
    assert.equal(calls.length, 0);
    await assert.rejects(buildReaderWithUnitSpecs(workspaceId, runId, request as any, [{ role: 'LISTING_SPEC', file: new File(['{}'], 'source.json') }], token), /khớp nguồn/);
    await assert.rejects(buildReaderWithUnitSpecs(workspaceId, runId, request as any, [{ role: 'LISTING_SPEC', file: new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'source.json') }], token), /2 MiB/);
    assert.equal(calls.length, 0);
    globalThis.fetch = (async () => { calls.push('intake'); return json({ ...intakeReceipt, runId: '99999999-9999-4999-8999-999999999999' }, 201); }) as typeof fetch;
    await assert.rejects(buildReaderWithUnitSpecs(workspaceId, runId, request as any, [{ role: 'LISTING_SPEC', file: new File([sourceBytes], 'source.json') }], token), /không khớp phiên/);
    assert.equal(calls.length, 1, 'wrong-run receipt prevents build');
  } finally { globalThis.fetch = original; }
});

test('reader intake panel requires owner and selected files, sends only explicit action and displays rejection/retry', async () => {
  const dom = setupDom(); const original = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReaderReportPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReaderReportPanel');
  const root = createRoot(dom.container); let writes = 0; let rejectBuild = true;
  globalThis.fetch = (async (url, init) => {
    if (!init?.method) return json({ contractVersion: 'reader-report-list-v1', workspaceId, runId, revisions: writes && !rejectBuild ? [revision] : [] });
    writes++;
    if (String(url).endsWith('unit-spec-intakes')) return json({ ...intakeReceipt, exactRetry: writes > 2 }, writes > 2 ? 200 : 201);
    if (rejectBuild) return json({ error: { code: 'bad_request', message: 'Quy cách không khớp biến thể.' } }, 400);
    return json({ contractVersion: 'reader-report-build-receipt-v1', exactRetry: false, revision }, 201);
  }) as typeof fetch;
  const run = { workspaceId, runId, status: 'DRAFT_READY' } as ResearchAutomationRun;
  const buildButton = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === 'Lưu quy cách và dựng bản đọc')!;
  const select = async (input: HTMLInputElement, files: File[]) => act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files }); input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  try {
    await act(async () => root.render(createElement(Panel, { run, ownerToken: null, writesAvailable: true })));
    assert.equal(buildButton().disabled, true); assert.match(dom.container.textContent!, /Mở khóa OWNER/); assert.equal(writes, 0);
    await act(async () => root.render(createElement(Panel, { run, ownerToken: token, writesAvailable: true })));
    const inputs = document.querySelectorAll<HTMLInputElement>('input[type=file]');
    await select(inputs[0]!, [new File([JSON.stringify(request)], 'build.json')]);
    assert.equal(buildButton().disabled, true);
    await select(inputs[1]!, [new File([sourceBytes], 'listing.json')]); assert.equal(buildButton().disabled, false); assert.equal(writes, 0);
    await act(async () => { buildButton().click(); for (let i = 0; i < 100 && writes < 2; i++) await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(writes, 2); assert.match(document.querySelector('[role=alert]')!.textContent!, /khớp biến thể/);
    assert.match(dom.container.textContent!, /Đã lưu quy cách của phiên này/); assert.match(dom.container.textContent!, /chưa được dựng xong/);
    rejectBuild = false; await act(async () => { buildButton().click(); for (let i = 0; i < 100 && writes < 4; i++) await new Promise(resolve => setTimeout(resolve, 10)); });
    assert.equal(writes, 4); assert.match(dom.container.textContent!, /Đã lưu quy cách và dựng bản đọc lần 1/);
    assert.ok(document.querySelector('a[href$="/html"]')); assert.match(dom.container.textContent!, /chờ bạn duyệt/);
    await select(inputs[0]!, [new File(['{broken'], 'build.json')]);
    await act(async () => { buildButton().click(); await new Promise(resolve => setTimeout(resolve, 20)); }); assert.equal(writes, 4); assert.match(document.querySelector('[role=alert]')!.textContent!, /JSON UTF-8/);
  } finally { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); }
});

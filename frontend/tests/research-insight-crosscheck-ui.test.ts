import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { act, createElement, StrictMode } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { crosscheckFlowFixture, crosscheckWorkspaceId as workspaceId, crosscheckRunId as runId, crosscheckOwner as owner, blankCrosscheckAnnotations } from '../../tests/helpers/crosscheck-flow-fixture';
import { openResearchAutomationApi } from '../../src/api/research-automation-api';
import { insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport';
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
async function until(check: () => boolean, label: string) { for (let at = 0; at < 3000 && !check(); at++) await settle(); assert.ok(check(), label); }
function button(root: ParentNode, label: string) { const item = [...root.querySelectorAll('button')].find(button => button.textContent?.trim() === label); assert.ok(item, label); return item; }
const click = (root: ParentNode, label: string) => act(async () => button(root, label).click());

test('actual StrictMode UI -> authenticated HTTP -> two blinded fake second calls -> retained selected report23; lost responses retry exact bodies', { timeout: 180000 }, async t => {
  const f = await crosscheckFlowFixture(t);
  let calls = 0;
  const captures: any[] = [];
  const gateway = http.createServer((request, response) => {
    const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(chunk)).on('end', () => {
      calls++; const envelope = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(envelope.model, 'synthetic-second-ui');
      const input = JSON.parse(envelope.messages[1].content); captures.push(input);
      assert.ok(input.records.length <= 100); assert.equal(input.projectionVersion, 'insight-crosscheck-blinded-v1');
      assert.ok(!envelope.messages[1].content.includes('first-fixture')); assert.ok(!envelope.messages[1].content.includes('firstRecordIndex')); assert.ok(!envelope.messages[1].content.includes('firstSpan'));
      assert.ok(!envelope.messages[1].content.includes('assignments')); assert.ok(!envelope.messages[1].content.includes('dispositions'));
      assert.deepEqual(input.corpora[0].codes, [{ code: 'C1', label: 'size', phrase: 'kích thước' }]);
      assert.ok(input.records.every((row: any) => row.text === 'Tôi thích kích thước.'));
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: `  ${JSON.stringify(blankCrosscheckAnnotations())}\n` } }] }));
    });
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening'); const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`, token = 'synthetic-crosscheck-token-abcdefghijklmnopqrstuvwxyz123456';
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: owner.actorId },
    insightCrosscheck: { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-only-key123456' }, configuration: insightCodingCliproxyConfiguration('synthetic-second-ui') } });
  const server = http.createServer(application.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const dom = setupDom(), originalFetch = globalThis.fetch;
  const posts: { url: string; body: any }[] = []; let lostCrosscheck = false, lostReport = false, activity = 0;
  globalThis.fetch = (async (url, init) => {
    const target = new URL(String(url), origin).href;
    const options = { ...init, headers: { ...init?.headers, ...(init?.method === 'POST' ? { Origin: origin } : {}) } };
    if (init?.method === 'POST' && target.startsWith(`${origin}/owner-api/`)) posts.push({ url: target, body: JSON.parse(String(init.body)) });
    const response = await originalFetch(target, options);
    if (init?.method === 'POST' && target.endsWith('/insight-crosscheck-preparations') && response.ok && !lostCrosscheck) { lostCrosscheck = true; await response.arrayBuffer(); throw new TypeError('Synthetic lost completion'); }
    if (init?.method === 'POST' && target.endsWith('/report-revisions') && response.ok && !lostReport) { lostReport = true; await response.arrayBuffer(); throw new TypeError('Synthetic lost report receipt'); }
    return response;
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCodingPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingPanel');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(Panel, { run: await f.service.getRun(workspaceId, runId), pairId: f.pair.pairId, versionNumber: 1,
      ownerToken: token, disabled: false, reportBlock: null, onBusyChanged: () => {}, onActivityChanged: () => { activity++; } }))));
    await until(() => Boolean(dom.container.querySelector('select[aria-label="Đề xuất mặc định cho lượt thứ hai"]')?.querySelectorAll('option').length === 4), 'exact first history loaded');
    await until(() => dom.container.textContent?.includes('Model thứ hai: cliproxy/synthetic-second-ui') ?? false, 'explicit second configuration read');
    assert.equal(posts.length, 0); assert.equal(calls, 0);
    const select = dom.container.querySelector<HTMLSelectElement>('select[aria-label="Đề xuất mặc định cho lượt thứ hai"]')!;
    assert.equal(select.value, '');
    await act(async () => { select.value = f.latest.evidence.evidenceId; select.dispatchEvent(new Event('change', { bubbles: true })); });
    await click(dom.container, 'Xem lại mẫu cho model thứ hai'); assert.equal(posts.length, 0);
    await click(document.querySelector('[role="dialog"]')!, 'Hủy'); assert.equal(calls, 0);
    await click(dom.container, 'Xem lại mẫu cho model thứ hai'); await click(document.querySelector('[role="dialog"]')!, 'Gửi model thứ hai');
    await until(() => [...dom.container.querySelectorAll('button')].some(button => button.textContent === 'Thử lại đúng mẫu đã giữ'), 'lost result held');
    assert.equal(calls, 2); assert.deepEqual(captures.map(row => row.records.length), [100, 100]);
    const sent = posts[0]!.body;
    assert.equal(captures.flatMap(row => row.records).length, 200);
    assert.equal(new Set(captures.flatMap(row => row.records).map(row => row.locator)).size, 200);
    await click(dom.container, 'Thử lại đúng mẫu đã giữ');
    await until(() => [...dom.container.querySelectorAll('button')].some(button => button.textContent === 'Tạo báo cáo nháp với phụ lục lượt thứ hai đã chọn'), 'retained read verified');
    assert.deepEqual(posts[1]!.body, sent); assert.equal(calls, 2);
    await click(dom.container, 'Đọc đúng bằng chứng lượt thứ hai đã lưu');
    await until(() => dom.container.textContent?.includes('Đã đọc đúng bằng chứng đã lưu') ?? false, 'explicit immutable read');
    assert.equal(posts.length, 2); assert.equal(calls, 2);
    assert.ok(dom.container.textContent?.includes('Đề xuất AI chờ xem xét'));
    await click(dom.container, 'Tạo báo cáo nháp với phụ lục lượt thứ hai đã chọn'); await click(document.querySelector('[role="dialog"]')!, 'Hủy'); assert.equal(posts.length, 2);
    await click(dom.container, 'Tạo báo cáo nháp với phụ lục lượt thứ hai đã chọn'); await click(document.querySelector('[role="dialog"]')!, 'Tạo bản nháp có phụ lục');
    await until(() => [...dom.container.querySelectorAll('button')].some(button => button.textContent === 'Thử lại đúng báo cáo đã giữ'), 'lost report receipt held');
    await click(dom.container, 'Thử lại đúng báo cáo đã giữ'); await until(() => activity === 1, 'exact report retry verified');
    assert.deepEqual(posts[3]!.body, posts[2]!.body); assert.equal(posts[2]!.body.defaultInsight.proposalId, f.latest.evidence.evidenceId);
    let selectedPair: string | undefined;
    for (let at = 0; at < 500 && !selectedPair; at++) {
      const attempts = await f.service.listReportAttempts(workspaceId, runId);
      assert.ok(!attempts.some(item => item.state === 'FAILED'));
      selectedPair = attempts.find(item => item.state === 'COMMITTED')?.pairId ?? undefined;
      if (!selectedPair) await settle();
    }
    assert.ok(selectedPair);
    const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, selectedPair);
    const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
    assert.equal(semantic.rendererVersion, 'automation-report-kit-v23'); assert.equal(semantic.insightCrosscheck.plan.sample.length, 200);
    assert.equal(semantic.insightCrosscheck.plan.eligible.length, 201); assert.equal(semantic.insightCrosscheck.releaseState, 'U11_STATISTIC_UNAVAILABLE');
    assert.equal(semantic.insightCoding.groupCounts.rates, null); assert.ok(report.bytes.toString().includes('insight-crosscheck-evidence'));
    const apiBase = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    assert.equal((await originalFetch(`${apiBase}/insight-crosscheck-preparations`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify(sent) })).status, 401);
    const wrong = await originalFetch(`${apiBase}/insight-crosscheck-preparations`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ ...sent, seed: 'b'.repeat(64) }) });
    assert.equal(wrong.status, 409); assert.equal(calls, 2); assert.equal(f.firstCalls(), 3);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup();
    await application.close(); await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => gateway.close(() => resolve()));
  }
});

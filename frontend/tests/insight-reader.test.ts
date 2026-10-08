import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import test from 'node:test';
import { tsImport } from 'tsx/esm/api';
import { buildInsightReader, decideReaderReportV2, loadReaderReportsV2 } from '../src/research-automation/reader-report-api';
import type { ResearchAutomationRun } from '../src/research-automation/api';
import type { ResearchAutomationReaderRevisionV2 } from '../../contracts/api/research-automation-reader-report-api.generated';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token';
const revision = { reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-v1', workspaceId, runId,
  revisionId: '33333333-3333-4333-8333-333333333333', revisionNumber: 1, state: 'PENDING_OWNER_REVIEW',
  draftPairId: 'a'.repeat(64), semanticSha256: 'b'.repeat(64), sourceReportSha256: 'c'.repeat(64), htmlSha256: 'd'.repeat(64),
  createdAt: '2026-10-08T00:00:00Z', decision: null } as const;
const market = { reportKind: 'MARKET', builderVersion: 'reader-report-market-v4', workspaceId, runId,
  revisionId: '44444444-4444-4444-8444-444444444444', revisionNumber: 1, state: 'APPROVED',
  draftPairId: 'e'.repeat(64), platforms: ['shopee'], profileStatus: 'proposed', htmlSha256: 'f'.repeat(64),
  createdAt: revision.createdAt, decision: { decision: 'APPROVED', reason: null, decidedAt: revision.createdAt } } as const;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const list = (revisions: unknown[]) => ({ contractVersion: 'reader-report-list-v2', workspaceId, runId, revisions });
const build = { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: '55555555-5555-4555-8555-555555555555',
  draftPairId: revision.draftPairId, semanticSha256: revision.semanticSha256 } as const;

test('Insight client binds owner build and decisions to exact kind, pair, run and saved HTML', async () => {
  const original = globalThis.fetch; let writes = 0;
  const receipt = { contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision };
  globalThis.fetch = (async (url, init) => {
    writes++; assert.match(String(url), /\/owner-api\/.*\/reader-reports\/insight$/);
    assert.equal((init!.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.equal(init!.credentials, 'omit'); assert.deepEqual(JSON.parse(String(init!.body)), build);
    return json(receipt, 201);
  }) as typeof fetch;
  try {
    await assert.rejects(buildInsightReader(workspaceId, runId, build, ''), /OWNER/); assert.equal(writes, 0);
    assert.equal((await buildInsightReader(workspaceId, runId, build, token)).revision.reportKind, 'INSIGHT');
    for (const change of [{ reportKind: 'MARKET' }, { runId: market.revisionId }, { draftPairId: '0'.repeat(64) }, { semanticSha256: '0'.repeat(64) }]) {
      globalThis.fetch = (async () => json({ ...receipt, revision: { ...revision, ...change } }, 201)) as typeof fetch;
      await assert.rejects(buildInsightReader(workspaceId, runId, build, token), /contract|khớp nguồn/);
    }
    const decision = { contractVersion: 'reader-report-decision-v2', requestKey: build.requestKey, reportKind: 'INSIGHT',
      revisionId: revision.revisionId, htmlSha256: revision.htmlSha256, decision: 'APPROVED', reason: null } as const;
    const approved = { ...revision, state: 'APPROVED', decision: { decision: 'APPROVED', reason: null, decidedAt: revision.createdAt } };
    globalThis.fetch = (async () => json({ contractVersion: 'reader-report-decision-receipt-v2', exactRetry: false, revision: approved }, 201)) as typeof fetch;
    assert.equal((await decideReaderReportV2(workspaceId, runId, decision, token)).revision.state, 'APPROVED');
    globalThis.fetch = (async () => json({ contractVersion: 'reader-report-decision-receipt-v2', exactRetry: false,
      revision: { ...approved, htmlSha256: '0'.repeat(64) } }, 201)) as typeof fetch;
    await assert.rejects(decideReaderReportV2(workspaceId, runId, decision, token), /khớp bản đọc/);
  } finally { globalThis.fetch = original; }
});

test('v2 reader client validates independent kind histories and rejects stale, repeated or foreign rows', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = (async () => json(list([market, revision]))) as typeof fetch;
    assert.equal((await loadReaderReportsV2(workspaceId, runId, new AbortController().signal)).revisions.length, 2);
    for (const rows of [[market, { ...revision, state: 'SUPERSEDED' }], [revision, revision],
      [{ ...revision, revisionNumber: 2 }], [{ ...revision, workspaceId: market.revisionId }]]) {
      globalThis.fetch = (async () => json(list(rows))) as typeof fetch;
      await assert.rejects(loadReaderReportsV2(workspaceId, runId, new AbortController().signal), /Trạng thái|Chuỗi/);
    }
  } finally { globalThis.fetch = original; }
});

test('Insight panel requires explicit source selection and owner action, with separate Market approval', async () => {
  const dom = setupDom(), original = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReaderReportPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReaderReportPanel');
  const root = createRoot(dom.container); let rows: ResearchAutomationReaderRevisionV2[] = [market as unknown as ResearchAutomationReaderRevisionV2];
  const writes: Record<string, unknown>[] = [];
  globalThis.fetch = (async (url, init) => {
    if (!init?.method) {
      if (String(url).endsWith('report-versions')) return json({ contractVersion: 'automation-report-version-list-v1', workspaceId, runId,
        versions: [{ pairId: revision.draftPairId, versionNumber: 1, attemptId: null, outputs: [{ kind: 'INSIGHT', versionId: revision.semanticSha256, pdfAvailable: false }] }] });
      return json(list(rows));
    }
    const body = JSON.parse(String(init.body)); writes.push(body);
    assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    if (String(url).endsWith('/insight')) {
      rows = [...rows, revision]; return json({ contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision }, 201);
    }
    assert.equal(body.reportKind, 'INSIGHT'); assert.equal(body.revisionId, revision.revisionId); assert.equal(body.htmlSha256, revision.htmlSha256);
    rows = [rows[0]!, { ...revision, state: 'APPROVED', decision: { decision: 'APPROVED', reason: null, decidedAt: revision.createdAt } }];
    return json({ contractVersion: 'reader-report-decision-receipt-v2', exactRetry: false, revision: rows[1] }, 201);
  }) as typeof fetch;
  const run = { workspaceId, runId, reports: ['INSIGHT'], status: 'DRAFT_READY' } as ResearchAutomationRun;
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!;
  try {
    await act(async () => root.render(createElement(Panel, { run, ownerToken: null, writesAvailable: true })));
    assert.equal(document.querySelectorAll('input[type=file]').length, 0); assert.equal(button('Dựng bản đọc insight').disabled, true); assert.equal(writes.length, 0);
    await act(async () => root.render(createElement(Panel, { run, ownerToken: token, writesAvailable: true })));
    assert.equal(button('Dựng bản đọc insight').disabled, true);
    const select = document.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => { select.value = revision.draftPairId; select.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.equal(button('Dựng bản đọc insight').disabled, false); assert.equal(writes.length, 0);
    await act(async () => button('Dựng bản đọc insight').click());
    assert.equal(writes.length, 1); assert.equal(writes[0]!.draftPairId, revision.draftPairId); assert.equal(writes[0]!.semanticSha256, revision.semanticSha256);
    assert.match(dom.container.textContent!, /reader-report-insight-v1/); assert.match(dom.container.textContent!, /Chờ bạn duyệt/);
    await act(async () => button('Duyệt').click()); assert.equal(writes.length, 1);
    const dialog = document.querySelector('[role=dialog]')!;
    await act(async () => [...dialog.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === 'Duyệt')!.click());
    assert.equal(writes.length, 2); assert.match(dom.container.textContent!, /Đã duyệt bản đọc/);
    const kind = document.querySelector<HTMLSelectElement>('select')!;
    await act(async () => { kind.value = 'MARKET'; kind.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.match(dom.container.textContent!, /reader-report-market-v4/); assert.equal(document.querySelector('[role=dialog]'), null); assert.equal(writes.length, 2);
  } finally { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); }
});

test('changing runs clears source selections and ignores an old in-flight build response', async () => {
  const dom = setupDom(), original = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReaderReportPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReaderReportPanel');
  const root = createRoot(dom.container), nextRunId = '66666666-6666-4666-8666-666666666666';
  let settle!: (response: Response) => void, writes = 0;
  globalThis.fetch = (async (url, init) => {
    if (init?.method) { writes++; return new Promise<Response>(resolve => { settle = resolve; }); }
    const currentRun = String(url).includes(nextRunId) ? nextRunId : runId;
    if (String(url).endsWith('report-versions')) return json({ contractVersion: 'automation-report-version-list-v1', workspaceId, runId: currentRun,
      versions: [{ pairId: revision.draftPairId, versionNumber: 1, attemptId: null, outputs: [{ kind: 'INSIGHT', versionId: revision.semanticSha256, pdfAvailable: false }] }] });
    return json({ ...list([]), runId: currentRun });
  }) as typeof fetch;
  const run = { workspaceId, runId, reports: ['INSIGHT'], status: 'DRAFT_READY' } as ResearchAutomationRun;
  const buildButton = () => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === 'Dựng bản đọc insight')!;
  try {
    await act(async () => root.render(createElement(Panel, { run, ownerToken: token, writesAvailable: true })));
    const sourceSelect = document.querySelectorAll<HTMLSelectElement>('select')[1]!;
    await act(async () => { sourceSelect.value = revision.draftPairId; sourceSelect.dispatchEvent(new Event('change', { bubbles: true })); });
    await act(async () => buildButton().click()); assert.equal(writes, 1);
    await act(async () => root.render(createElement(Panel, { run: { ...run, runId: nextRunId }, ownerToken: token, writesAvailable: true })));
    assert.equal(document.querySelectorAll<HTMLSelectElement>('select')[1]!.value, ''); assert.equal(buildButton().disabled, true);
    await act(async () => settle(json({ contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision }, 201)));
    assert.equal(document.querySelectorAll<HTMLSelectElement>('select')[1]!.value, ''); assert.equal(buildButton().disabled, true);
    assert.doesNotMatch(dom.container.textContent!, /Đã dựng bản đọc insight lần/); assert.equal(writes, 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); }
});

import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import type { MetaPagePrepareRequest, MetaPageSourceView } from '../../contracts/api/research-automation-meta-page-api.generated.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { metaOwningFixture, metaWorkspaceId, metaRunId } from '../../tests/helpers/meta-page-fixture.js';
import type { ResearchAutomationSourceStatus } from '../src/research-automation/api';
import { setupDom } from './dom';

test('mounted Meta activity counts confirmed page/ad memberships through the actual OWNER API', async t => {
  for (const count of [1, 2]) await t.test(`${count} included memberships, inert preparation and repeated captures`, async child => {
    const f = await metaOwningFixture(child);
    const calls = f.calls();
    const capture = structuredClone(f.raw.capture), html = Buffer.from(f.raw.html);
    if (count === 2) {
      // Preserve the authentic located bytes while removing only this fixture's exclusion term.
      const text = capture.ads[1]!.text, value = 'Synthetic nồi chiên';
      const padding = ' '.repeat(text.span.byteLength - Buffer.byteLength(value));
      html.fill(32, text.span.byteOffset, text.span.byteOffset + text.span.byteLength);
      html.write(value, text.span.byteOffset);
      text.value = value + padding;
      capture.htmlSha256 = createHash('sha256').update(html).digest('hex');
    }
    const request: MetaPagePrepareRequest = { ...f.request, htmlBase64: html.toString('base64'),
      visibleFieldsBase64: Buffer.from(JSON.stringify(capture)).toString('base64') };
    const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const token = 'synthetic-meta-mounted-owner-1234567890-abcdefghijklmnopqrstuvwxyz';
    const app = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
      providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
      owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token,
        allowedOrigin: origin, actorId: 'owner:synthetic-meta-unit' } });
    server.on('request', app.handler);
    const nativeFetch = globalThis.fetch, dom = setupDom();
    const { createRoot } = await import('react-dom/client');
    const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx',
      { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
    const root = createRoot(dom.container);
    const ownerPath = `${origin}/owner-api/workspaces/${metaWorkspaceId}/research-automation/runs/${metaRunId}/sources/meta-page`;
    const headers = { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const otherCards = new Map<string, string>(); let mounts = 0;
    const post = async (body: unknown, suffix = ''): Promise<MetaPageSourceView> => {
      const response = await nativeFetch(ownerPath + suffix, { method: 'POST', headers, body: JSON.stringify(body) });
      assert.equal(response.status, 201, await response.clone().text());
      return response.json() as Promise<MetaPageSourceView>;
    };
    const mountStatus = async (expectedCount: number) => {
      const before = f.db.prepare('SELECT total_changes() n').get();
      const response = await nativeFetch(`${origin}/api/workspaces/${metaWorkspaceId}/research-automation/source-status`, { headers });
      assert.equal(response.status, 200, await response.clone().text());
      const status = await response.clone().json() as ResearchAutomationSourceStatus;
      const meta = status.sources.find(source => source.source === 'META_AD_LIBRARY')!;
      assert.equal(meta.dataCount, expectedCount);
      assert.equal(meta.state, 'MANUAL_IMPORT'); assert.equal(meta.credential, 'NOT_REQUIRED');
      assert.equal(meta.wiredIntoRuns, false); assert.equal(meta.paid, false);
      assert.equal(meta.pendingPackage ?? null, null); assert.equal(meta.lastUsageAt, null);
      // Bridge the exact HTTP response into the mounted relative-URL fetch; do not manufacture card data.
      globalThis.fetch = (async (url, init) => {
        assert.equal(String(url), `/api/workspaces/${metaWorkspaceId}/research-automation/source-status`);
        assert.equal(init?.method ?? 'GET', 'GET'); return response.clone();
      }) as typeof fetch;
      await act(async () => root.render(createElement(SourceStatusBoard, { key: ++mounts, mode: 'real', workspaceId: metaWorkspaceId })));
      const card = document.querySelector('.ra-source[data-source="META_AD_LIBRARY"]')!;
      assert.ok(card);
      const labels = [...card.querySelectorAll('dt')], data = labels.find(label => label.textContent === 'Dữ liệu')!.nextElementSibling!.textContent!;
      if (expectedCount) assert.match(data, new RegExp(`^${expectedCount} quảng cáo đã xác nhận theo trang · gần nhất `));
      else assert.equal(data, 'Chưa có trong workspace');
      assert.equal(data.includes('lần đọc'), false);
      for (const other of document.querySelectorAll<HTMLElement>('.ra-source')) {
        if (other.dataset.source === 'META_AD_LIBRARY') continue;
        const source = other.dataset.source!;
        if (otherCards.has(source)) assert.equal(other.outerHTML, otherCards.get(source), `Unchanged ${source} card`);
        else otherCards.set(source, other.outerHTML);
      }
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
      assert.deepEqual(f.calls(), calls);
    };
    try {
      await mountStatus(0);
      const prepared = await post(request);
      assert.equal(prepared.state, 'PREPARED');
      assert.deepEqual(prepared.projection.includedLibraryIds, count === 1 ? ['9001'] : ['9001', '9002']);
      assert.deepEqual(prepared.projection.adFilter.results.map(record => record.decision), count === 1
        ? ['INCLUDED', 'EXCLUDED', 'UNCLEAR'] : ['INCLUDED', 'INCLUDED', 'UNCLEAR']);
      assert.equal(prepared.projection.duplicateObservations, 1);
      await mountStatus(0);
      const confirmation = { contractVersion: 'meta-page-confirm-v1', requestKey: randomUUID(),
        expectedRevision: f.current.revision, packageId: prepared.prepared.packageId };
      await post(confirmation, '/confirm');
      assert.equal((await f.service.listMetaPageSources(metaWorkspaceId, metaRunId)).length, 1);
      await mountStatus(count);
      const beforeRetry = f.db.prepare('SELECT total_changes() n').get();
      await post(confirmation, '/confirm');
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeRetry);
      await mountStatus(count);
      const repeated = await post({ ...request, requestKey: randomUUID(),
        visibleFieldsBase64: Buffer.from(JSON.stringify({ ...capture, capturedAt: '2026-10-08T09:00:00.000Z' })).toString('base64') });
      await mountStatus(count);
      await post({ ...confirmation, requestKey: randomUUID(), packageId: repeated.prepared.packageId }, '/confirm');
      assert.equal((await f.service.listMetaPageSources(metaWorkspaceId, metaRunId)).length, 2);
      await mountStatus(count);
      assert.deepEqual((await f.service.readReport(metaWorkspaceId, metaRunId, 'MARKET', false, f.pair.pairId)).bytes, f.report.bytes);
      assert.deepEqual(f.calls(), calls);
    } finally {
      await act(async () => root.unmount()); globalThis.fetch = nativeFetch; dom.cleanup();
      await new Promise<void>(resolve => server.close(() => resolve())); await app.close();
    }
  });
});

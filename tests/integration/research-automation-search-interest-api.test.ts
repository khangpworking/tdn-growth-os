import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/index.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { syntheticTrendsBody, syntheticWeeks } from '../helpers/search-interest-synthetic.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const token = 'synthetic-owner-token-0-not-a-live-credential';
const day = (back: number) => new Date(Date.now() - back * 86_400_000).toISOString().slice(0, 10);

for (const searchTrends of [false, true]) test(`real API composition ${searchTrends ? 'makes one trends request and shows the series' : 'without the flag never asks for the series'}`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-search-interest-api-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath }).db;
  await new DiscoveryWorkspaceService({ db, artifactStore: new ContentAddressedArtifactStore(artifactRoot), uuid: () => workspaceId }).createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'interest-api', title: 'Synthetic interest API' });
  db.close();
  const calls = { trends: 0, web: 0 };
  const transport: ProviderTransport = { sleep: async () => {}, now: () => Date.now(), fetch: (async (url: string | URL | Request, options?: RequestInit) => {
    const endpoint = new URL(String(url)); let data: unknown;
    if (endpoint.pathname.endsWith('/credit/balance')) data = { success: true, data: { totalRemain: 100 } };
    else if (endpoint.pathname.endsWith('/product/rank')) data = { success: true, data: [{ product_id: '12345', product_name: 'Thạch dừa tên nguồn', unit_price: 10000 }] };
    else if (endpoint.pathname.endsWith('/product/detail')) data = { success: true, data: { product_id: JSON.parse(options!.body as string).product_id, product_region: 'VN', product_name: 'Thạch dừa tên nguồn', product_description: [],
      revenue: 10, sales_volumn: 2, unit_price: 10000, min_price: 10000, max_price: 10000, video_revenue: 6, live_revenue: 4, shopping_mall_revenue: 0 } };
    else {
      assert.equal(endpoint.hostname, 'serpapi.com');
      if (endpoint.searchParams.get('engine') === 'google_trends') {
        calls.trends++;
        return new Response(syntheticTrendsBody(endpoint.searchParams.get('q')!, syntheticWeeks()), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      calls.web++;
      data = { organic_results: [{ position: 1, title: 'Thạch dừa được giữ', link: 'https://example.test/keep' }] };
    }
    return new Response(JSON.stringify(data), { status: 200 });
  }) as typeof fetch };
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let app: ReturnType<typeof openResearchAutomationApi> | undefined;
  t.after(async () => { if (app) await app.close(); await new Promise<void>(resolve => server.close(() => resolve())); await fs.rm(root, { recursive: true, force: true }); });
  app = openResearchAutomationApi({ databasePath, artifactRoot, origin, providers: { kalodataSecretKey: 'synthetic-sales-key', serpApiKey: 'synthetic-web-key', apifyTokenConfigured: false },
    owner: { databasePath, artifactRoot, writeEnabled: true, token, actorId: 'synthetic-owner', allowedOrigin: origin }, ...(searchTrends ? { searchTrends: true as const } : {}) }, transport);
  server.on('request', app.handler);

  const post = async (url: string, body: unknown) => { const response = await fetch(origin + url, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); assert.equal(response.status, 202, await response.clone().text()); return response.json() as Promise<any>; };
  const start = await post(`/owner-api/workspaces/${workspaceId}/research-automation/runs`, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa', requestedPeriod: { startDate: day(40), endDate: day(10) }, reports: ['MARKET'] });
  const runId = start.run.runId as string;
  const wait = async (status: string) => { for (let n = 0; n < 100; n++) { const response = await fetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`); assert.equal(response.status, 200); const result = await response.json() as any;
    if (result.status === status) return result; if (['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(result.status)) throw new Error(`run stopped before ${status}: ${JSON.stringify({ status: result.status, steps: result.steps, blockers: result.blockers })}`); await new Promise(resolve => setTimeout(resolve, 50)); } throw new Error(`run did not reach ${status}`); };
  const awaiting = await wait('AWAITING_SCOPE');
  await post(`/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/confirm-scope`, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision, definition: 'Synthetic frozen scope',
    includeTerms: ['thạch dừa'], excludeTerms: [], selectedProductIds: [awaiting.productCards[0].productId], peerProductIds: [], exactShopeeUrls: [] });
  await wait('DRAFT_READY');

  assert.equal(calls.web, 1, 'the web lane is unchanged');
  assert.equal(calls.trends, searchTrends ? 1 : 0);
  const response = await fetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`);
  assert.equal(response.status, 200);
  const html = await response.text(), doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('#M05 figure.market-chart').length, searchTrends ? 1 : 0);
  assert.equal(/Hình 5\.2/.test(html), searchTrends);
  assert.equal(/mức quan tâm tìm kiếm/i.test(doc.querySelector('.source-evidence')?.textContent ?? ''), searchTrends, 'the source list names the series only when the report draws it');
  assert.doesNotMatch(html, /Google/i);
  assert.equal(await (await fetch(`${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`)).text(), html, 'a second read replays the same bytes');
});

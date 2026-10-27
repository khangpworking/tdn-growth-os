import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { JSDOM } from 'jsdom';
import { S3Client } from '@aws-sdk/client-s3';
import { R2MetricEvidenceStore } from '../../src/platform/artifacts/r2-metric-evidence.js';
import { loadV3Archive, v3Hash } from '../../src/modules/analysis/research-automation/metric-v3-report.js';
import { pngChunk, syntheticPng } from './content-images.js';

export const adapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
export const evidenceAdapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-evidence.js', import.meta.url).href);
export const jsonBytes = (v: unknown) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`);
export const capturedAt = '2026-10-26T07:00:00.000Z';
export const fakeRunId = '22222222-2222-4222-8222-222222222222';
// Synthetic access material only; never load process credentials.
export const fakeCredentials = { accountId: 'a'.repeat(32), accessKeyId: 'FAKEACCESSKEY12345678', secretAccessKey: 'fake-secret-for-offline-tests-only' };
export const opening = {
  points: ['Synthetic sales are estimates.', 'Platforms have separate observations.', 'Prices reflect the captured cards.', 'Unknown platforms remain separate.', 'Profit data is unavailable.'],
  proposals: ['Check the search scope.', 'Check the product records.', 'Review the platforms before deciding.'],
};
export const model = { identity: 'synthetic-evr2-model', generateText: async () => JSON.stringify(opening) };

/** Reuses the explicitly synthetic response-shape fixture; all product/shop/brand values are fake. */
export async function syntheticCapture() {
  const f = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
  f.spec.preset.keywords = ['synthetic zinc', 'synthetic zinc capsule'];
  const files: Record<string, Buffer> = {};
  const refs = [];
  for (const [i, window] of f.spec.windows.entries()) {
    const row = f.windows[i];
    row.observation.appliedState.keywords = [...f.spec.preset.keywords];
    for (const response of row.responses) {
      response.requestBody.include_query.queries = [...f.spec.preset.keywords];
      for (const endpoint of ['products', 'shops', 'groups']) {
        if (!response.body.data?.[endpoint]) continue;
        response.body.data[endpoint] = Array.from({ length: 20 }, (_, n) => ({
          shop_base_id: n === 0 ? 'fake-shop' : null,
          product_name: `Synthetic zinc item ${n + 1}`, shop_name: `Synthetic shop ${n + 1}`, brand: `Synthetic brand ${n + 1}`,
          platform_id: endpoint === 'products' ? null : n % 2 ? 1 : 8, official_type: n % 2,
          price: 123000, revenue_custom: 2000000000 - n * 1000000, previous_revenue_custom: 1000000000,
          revenue_custom_sum: 2000000000 - n * 1000000, previous_revenue_custom_sum: 1000000000,
        }));
      }
    }
    const raw = jsonBytes(row.responses);
    const manifest = adapter.buildV3WindowManifest(f.spec, window, row.observation, row.responses, capturedAt);
    manifest.captureId = `eeeeeeee-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    files[`${window.id}/raw-responses.json`] = raw;
    files[`${window.id}/manifest.json`] = jsonBytes(manifest);
    refs.push({ window: window.id, path: `${window.id}/manifest.json`, sha256: v3Hash(jsonBytes(manifest)) });
  }
  files['manifest.json'] = jsonBytes({ contractVersion: 'metric-v3-capture-v1', specDigest: v3Hash(jsonBytes(f.spec)), windows: refs });
  return { files, spec: f.spec, archive: await loadV3Archive(async p => files[p]!, f.spec) };
}

export async function writeCapture(dir: string, files: Record<string, Buffer>) {
  for (const [file, bytes] of Object.entries(files)) {
    await mkdir(join(dir, file, '..'), { recursive: true });
    await writeFile(join(dir, file), bytes);
  }
}

/** The real DOM locator/masking functions run here; only browser pixels/layout are simulated. */
export function fakeEvidencePage(missingProducts = false) {
  const dom = new JSDOM(`<body><header id="source-logo">Metric</header><div class="account-menu">Fake account</div>
    <div id="QuerySearchBuilder"></div><div class="market-overview"></div><div class="platforms-chart"></div>
    <div id="growth-detail-chart"></div><div class="statistic-item"><h2 class="statistic-item__title">Shop type</h2></div>
    <div class="statistic-item"><h2 class="statistic-item__title">Price range</h2></div>
    <div class="brand-list-container"></div><div class="shop-list-container"></div>
    ${missingProducts ? '' : '<div class="products-list-container"></div>'}</body>`, { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
  const regions = [...dom.window.document.body.children];
  for (const [i, element] of regions.entries()) {
    element.getBoundingClientRect = () => ({ x: 0, y: i * 10, left: 0, top: i * 10, right: 100, bottom: i * 10 + 10, width: 100, height: 10, toJSON() {} });
  }
  Object.defineProperty(dom.window.document.documentElement, 'scrollWidth', { value: 100 });
  Object.defineProperty(dom.window.document.documentElement, 'scrollHeight', { value: 200 });
  const png = syntheticPng(100, 200, { extraChunks: [pngChunk('tEXt', Buffer.from('Source\0Metric'))] });
  return {
    dom, png,
    page: {
      evaluate: async (fn: Function, arg?: unknown) => dom.window.eval(`(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`),
      screenshot: async ({ path, fullPage }: { path: string; fullPage: boolean }) => {
        assert.equal(fullPage, true);
        assert.equal((dom.window.document.querySelector('.account-menu') as HTMLElement).style.visibility, 'hidden');
        assert.notEqual((dom.window.document.querySelector('#source-logo') as HTMLElement).style.visibility, 'hidden');
        await writeFile(path, png);
      },
    },
    close: () => dom.window.close(),
  };
}

/** Real AWS SDK serialization and verified-copy code, with no sockets and no real account. */
export function fakeR2() {
  const objects = new Map<string, { bytes: Buffer; type: string }>();
  const state = { fail: false, corruptRead: false, requests: 0 };
  const client = new S3Client({
    endpoint: 'https://fake-r2.invalid', region: 'auto', forcePathStyle: true, credentials: fakeCredentials, maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { handle: async (request: { method: string; path: string; body?: unknown; headers: Record<string, string> }) => {
      state.requests++;
      const reply = (statusCode: number, body = Buffer.alloc(0), headers: Record<string, string> = {}) => ({ response: { statusCode, headers, body: Readable.from([body]) } });
      if (state.fail) return reply(503);
      if (request.method === 'PUT') {
        assert.equal(request.headers['if-none-match'], '*');
        assert.equal(request.headers['cache-control'], 'private, no-store');
        if (objects.has(request.path)) return reply(412);
        assert.ok(Buffer.isBuffer(request.body));
        objects.set(request.path, { bytes: Buffer.from(request.body), type: request.headers['content-type']! });
        return reply(200);
      }
      assert.equal(request.method, 'GET');
      const object = objects.get(request.path);
      if (!object) return reply(404);
      const body = Buffer.from(object.bytes);
      if (state.corruptRead) body[0] = body[0]! ^ 1;
      return reply(200, body, { 'content-type': object.type, 'content-length': String(body.length) });
    } },
  });
  return { objects, state, store: new R2MetricEvidenceStore(client, 'tdn-media', fakeCredentials), close: () => client.destroy() };
}

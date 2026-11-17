import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { TestContext } from 'node:test';
import { hashFolder, sha256 } from '../../scripts/module-pick.js';

/** The flat m1/ shape the `m1-import` command writes for a user-page source. */
export const USER_PAGE_WINDOW = { id: 'selected', period: { startDate: '2026-10-14', endDate: '2026-11-12' }, intervalDays: 7 };
export const USER_PAGE_SCOPE = { start_date: '20261014', end_date: '20261112', include_query: { queries: ['synthetic term'] }, platforms: [1, 2] };
export const USER_PAGE_IMPORT_ID = '3f6c2a1e-8b9d-4c1e-9f00-1234567890ab';
export const USER_PAGE_POLICY = { format: 'shopee-review-policy-v1', mode: 'with-comments', stars: [], totalPerLink: 50,
  allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1' };

let nextItem = 7000;
export const userPageProduct = (name: string, shop: number, revenue: number) => ({
  product_base_id: `1__${nextItem++}__${shop}`, product_name: name, shop_base_id: String(shop),
  platform_id: 1, revenue_custom: revenue, brand: 'Synthetic Brand', final_brand: 'Synthetic Brand' });
export const userPageRows = (count = 5) => Array.from({ length: count }, (_, i) =>
  userPageProduct(`Synthetic product ${i + 1}`, 701 + i, 1000 - i * 10));
export const userPageRequest = () => ({ format: 'request-v2', preset: { keywords: ['synthetic term'] },
  windows: [structuredClone(USER_PAGE_WINDOW)], collectionPolicy: structuredClone(USER_PAGE_POLICY), principalTitles: [],
  selectionPolicy: 'metric-products-unique-v2',
  metricSource: { format: 'user-page-v1', scope: structuredClone(USER_PAGE_SCOPE), importId: USER_PAGE_IMPORT_ID } });
export const userPageRaw = (rows: unknown[]) => [{ urlPath: '/v2/market/analytics/products/', method: 'POST', status: 200,
  requestBody: { ...structuredClone(USER_PAGE_SCOPE), limit: 100, page: 0, sort_by: 'revenue_custom__desc' }, responseOrder: 0,
  body: { status: 'success', code: 0, data: { products: rows } } }];
export const jsonBytes = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

export async function buildUserPageRun(t: TestContext, options: { rows?: unknown[]; gate?: boolean } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-user-page-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const request = userPageRequest();
  const requestBytes = jsonBytes(request);
  const raw = userPageRaw(options.rows ?? userPageRows());
  const rawBytes = jsonBytes(raw);
  const part = { contractVersion: 'metric-user-page-window-v1', captureMethod: 'user-page',
    capturedAt: '2026-11-17T15:00:00.000Z', window: structuredClone(USER_PAGE_WINDOW),
    sourceMap: { products: 'raw-responses.json#/0/body/data' }, captureGate: 'PASSED',
    files: [{ path: 'raw-responses.json', sha256: sha256(rawBytes), byteSize: Buffer.byteLength(rawBytes) }] };
  const partBytes = jsonBytes(part);
  const outer = { contractVersion: 'metric-v3-capture-v1',
    windows: [{ window: 'selected', path: 'selected/manifest.json', sha256: sha256(partBytes) }] };
  await mkdir(join(dir, 'm1/selected'), { recursive: true });
  await writeFile(join(dir, 'request.json'), requestBytes);
  await writeFile(join(dir, 'm1/selected/raw-responses.json'), rawBytes);
  await writeFile(join(dir, 'm1/selected/manifest.json'), partBytes);
  await writeFile(join(dir, 'm1/manifest.json'), jsonBytes(outer));
  await writeFile(join(dir, 'run-tracking.json'), jsonBytes({ format: 'run-tracking-v1', runId: basename(dir),
    requestSha256: sha256(requestBytes), primaryKeyword: 'synthetic term', createdAt: null, firstRunAt: null,
    firstObservedLaunchAt: null, historyBasis: 'new-run' }));
  if (options.gate !== false) {
    await mkdir(join(dir, 'gates'), { recursive: true });
    await writeFile(join(dir, 'gates/m1.json'), jsonBytes({ format: 'handoff-v1', module: 'M1', runId: basename(dir),
      skillVersion: '1.0.0', verdict: 'PASS', inputSha256: null, outputSha256: await hashFolder(dir, 'm1'),
      checks: [], errorCode: null, next: null }));
  }
  return { run: dir, request, raw, part, rawBytes, requestBytes };
}

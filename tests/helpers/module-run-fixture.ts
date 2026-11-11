import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import type { TestContext } from 'node:test';
import { main, hashFolder, sha256 } from '../../scripts/module-pick.js';
import { capturedAt, evidenceAdapter, fakeEvidencePage, jsonBytes } from './evr2-evidence-fixture.js';

const { buildV3WindowManifest } = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
const fixture = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));

export type Row = Record<string, unknown>;
export const window = { id: 'selected', period: { startDate: '2026-09-16', endDate: '2026-10-02' }, intervalDays: 7 };
export const preset = { ...structuredClone(fixture.spec.preset), keywords: ['synthetic term one', 'synthetic term two'], smartExclusion: false };
const spec = { contractVersion: 'metric-v3-capture-spec-v3', preset, windows: [structuredClone(window)] };
const policy = { format: 'shopee-review-policy-v1', mode: 'stars', stars: [2, 3], totalPerLink: 500,
  allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1' };

let nextItem = 9100;
export const product = (name: string, shop: number, revenue: number): Row => ({
  product_base_id: `1__${nextItem++}__${shop}`, product_name: name, shop_base_id: String(shop),
  platform_id: 1, revenue_custom: revenue, brand: 'DHC', final_brand: 'DHC',
});
export const distinctRows = (count: number, extra: (i: number) => Row = () => ({})) => {
  const titles = ['DHC Kẽm 60 ngày', 'DHC Vitamin C 60 ngày', 'DHC Biotin 60 ngày', 'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày'];
  return Array.from({ length: count }, (_, i) => ({ ...product(titles[i % titles.length]!, 801, 10_000 - i * 100), ...extra(i) }));
};

export function requestBytes(withPolicy: boolean) {
  const value = {
    format: 'request-v2', preset: { keywords: [...preset.keywords] }, windows: [structuredClone(window)],
    collectionPolicy: policy, captureSpec: structuredClone(spec),
    metricInput: { format: 'shopee-metric-input-v1', preset: structuredClone(preset), window: structuredClone(window) },
    principalTitles: [], ...(withPolicy ? { selectionPolicy: 'metric-products-unique-v1' } : {}),
  };
  return jsonBytes(value);
}
function captureResponses(rows: Row[]) {
  const responses = fixture.windows[0].responses.map((response: any) => ({
    ...structuredClone(response),
    requestBody: { ...structuredClone(response.requestBody), start_date: '20260916', end_date: '20261002' },
  }));
  responses.find((response: any) => response.urlPath === '/v2/market/analytics/products/')!.body.data.products = rows;
  return responses;
}

/** Builds a real retained run: capture manifest, raw bytes, evidence v2 and the flow's own gate/selection. */
export async function buildModuleRun(t: TestContext, options: { rows?: Row[]; pictured?: number[]; controls?: boolean; policy?: boolean;
  evidence?: boolean; legacyGate?: boolean } = {}) {
  const run = await mkdtemp(join(tmpdir(), 'shopee-module-output-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  const rows = options.rows ?? distinctRows(5);
  const req = requestBytes(options.policy ?? true);
  await mkdir(join(run, 'm1/selected'), { recursive: true });
  await writeFile(join(run, 'request.json'), req);
  const responses = captureResponses(rows);
  const rawBytes = jsonBytes(responses);
  const manifest = buildV3WindowManifest(spec, structuredClone(window), {
    taxonomy: structuredClone(preset.category), appliedState: structuredClone(preset), keywordInput: '',
    selectedCategoryIds: preset.category.children.map((child: any) => child.id), period: structuredClone(window.period),
    categoryMode: 'Advanced', multi: true, comparisonDefault: true, displayedKPIs: 'synthetic module capture',
  }, responses, capturedAt);
  manifest.captureId = '33333333-3333-4333-8333-333333333333';
  const partBytes = jsonBytes(manifest);
  await writeFile(join(run, 'm1/selected/raw-responses.json'), rawBytes);
  await writeFile(join(run, 'm1/selected/manifest.json'), partBytes);
  await writeFile(join(run, 'm1/manifest.json'), jsonBytes({ contractVersion: 'metric-v3-capture-v1',
    specDigest: sha256(`${JSON.stringify(spec, null, 2)}\n`),
    windows: [{ window: 'selected', path: 'selected/manifest.json', sha256: sha256(partBytes) }] }));
  const pictured = (options.pictured ?? rows.map((_, i) => i)).map(i => String(rows[i]!.product_base_id));
  if (options.evidence !== false) {
    const browser = fakeEvidencePage(true);
    t.after(browser.close);
    modulePanel(browser, { ids: pictured, controls: options.controls ?? true });
    const evidence = await evidenceAdapter.writeV3EvidencePackage(browser.page, { windowDir: join(run, 'm1/selected'), manifest, rawBytes,
      moduleEvidence: { runId: basename(run), requestSha256: sha256(req) } });
    if (evidence.status === 'FAILED') throw new Error(`synthetic evidence failed: ${evidence.code}`);
  }
  await mkdir(join(run, 'gates'), { recursive: true });
  await writeFile(join(run, 'gates/m1.json'), jsonBytes({ format: 'handoff-v1', module: 'M1', runId: basename(run),
    skillVersion: '1.0.0', verdict: 'PASS', inputSha256: null, outputSha256: await hashFolder(run, 'm1'),
    checks: [], errorCode: null, next: null }));
  await main(run);
  if (options.legacyGate) {
    await writeFile(join(run, 'gates/m2.json'), jsonBytes({ format: 'handoff-v1', module: 'M2', runId: basename(run),
      skillVersion: '1.0.0', verdict: 'PASS', inputSha256: await hashFolder(run, 'm1'),
      outputSha256: sha256(await readFile(join(run, 'm2/selection.json'))), checks: [], errorCode: null, next: null }));
  }
  return { run, rows, rawBytes, manifest };
}

/** The current native Top Products panel: title, both source dropdowns and the pictured rows only. */
function modulePanel(browser: ReturnType<typeof fakeEvidencePage>, { ids, controls }: { ids: string[]; controls: boolean }) {
  const { document } = browser.dom.window;
  const container = document.createElement('div');
  container.className = 'statistic-item';
  const heading = document.createElement('h2');
  heading.className = 'statistic-item__title';
  heading.textContent = 'Sản phẩm bán chạy';
  container.append(heading);
  const selects: HTMLElement[] = [];
  if (controls) for (const label of ['Doanh số trong kỳ', 'Giảm dần']) {
    const select = document.createElement('div');
    select.className = 'ant-select';
    const item = document.createElement('div');
    item.className = 'ant-select-selection-item';
    item.textContent = label;
    select.append(item);
    container.append(select);
    selects.push(select);
  }
  const rendered = ids.map(id => {
    const row = document.createElement('div');
    row.className = 'ant-table-row';
    row.setAttribute('data-row-key', id);
    row.textContent = id;
    container.append(row);
    return row;
  });
  document.body.append(container);
  const bounds = (element: Element, top: number, height: number) => {
    (element as HTMLElement).getBoundingClientRect = () => ({ x: 0, y: top, left: 0, top, right: 100, bottom: top + height, width: 100, height, toJSON() {} });
  };
  bounds(container, 40, 150);
  bounds(heading, 42, 8);
  selects.forEach((select, i) => bounds(select, 52 + i * 8, 6));
  rendered.forEach((row, i) => bounds(row, 72 + i * 5, 4));
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { buildV3Body, loadV3Archive, renderV3Report, v3Hash, v3Resolver, type V3Archive, type V3TextModel } from '../../src/modules/analysis/research-automation/metric-v3-report.js';
import { checkMarketNumberTrace } from '../../src/modules/analysis/research-automation/market-number-trace.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import { fixture, workspaceId, drain, autorun } from '../helpers/autorun-harness.js';
const adapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
const original = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
const bytes = (v: unknown) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`);

// Extends the existing synthetic publication fixture at the external response boundary.
async function capture() {
  const f = structuredClone(original);
  const files: Record<string, Buffer> = {};
  const refs = [];
  for (const [i, window] of f.spec.windows.entries()) {
    const row = f.windows[i];
    for (const response of row.responses) {
      for (const endpoint of ['products', 'shops', 'groups']) {
        if (!response.body.data?.[endpoint]) continue;
        response.body.data[endpoint] = Array.from({ length: 20 }, (_, n) => ({
          product_name: `Synthetic item ${n + 1}`, shop_name: `Synthetic shop ${n + 1}`, brand: `Synthetic brand ${n + 1}`,
          platform_id: endpoint === 'products' ? null : n % 2 ? 1 : 8, official_type: n % 2,
          price: 123000, revenue_custom: 2000000000 - n * 1000000, previous_revenue_custom: 1000000000,
          revenue_custom_sum: 2000000000 - n * 1000000, previous_revenue_custom_sum: 1000000000,
        }));
      }
    }
    // The published source map selects the last valid response, not an earlier same-scope result.
    const publishedBasic = structuredClone(row.responses[0]);
    row.responses[0].body.data.search_basic.aggregations.find((a: any) => a.aggregation === 'SHOP_TOTAL').entity.platforms[0].value = 777;
    row.responses.push(publishedBasic);
    const raw = bytes(row.responses);
    const m = adapter.buildV3WindowManifest(f.spec, window, row.observation, row.responses, '2026-10-26T07:00:00.000Z');
    files[`${window.id}/raw-responses.json`] = raw;
    files[`${window.id}/manifest.json`] = bytes(m);
    refs.push({ window: window.id, path: `${window.id}/manifest.json`, sha256: v3Hash(bytes(m)) });
  }
  files['manifest.json'] = bytes({ contractVersion: 'metric-v3-capture-v1', specDigest: v3Hash(bytes(f.spec)), windows: refs });
  const archive = await loadV3Archive(async p => files[p]!, f.spec);
  return { files, archive, spec: f.spec };
}
const opening = { points: ['Doanh số được nguồn ước tính.', 'Các sàn có quy mô khác nhau.', 'Giá là giá trên thẻ sản phẩm.', 'Sàn chưa rõ được giữ riêng.', 'Chưa có dữ liệu về lợi nhuận.'], proposals: ['Đề xuất kiểm tra phạm vi tìm kiếm.', 'Đề xuất đối chiếu hồ sơ sản phẩm.', 'Đề xuất rà soát các sàn trước khi quyết định.'] };
const model = { identity: 'synthetic-model', generateText: async () => JSON.stringify(opening) };

// A1: external report shape and independently known fixture amounts; legacy tests own legacy rules.
test('A1 v3 renders ordered sections, nine figures and capture values, preserving unknown platform', async () => {
  const { archive } = await capture();
  const built = await renderV3Report(archive, model);
  const dom = new JSDOM(built.html);
  const doc = dom.window.document;
  assert.deepEqual([...doc.querySelectorAll('section')].map(s => s.id), Array.from({ length: 8 }, (_, i) => `phan-${i}`));
  assert.equal(doc.querySelectorAll('figure').length, 9);
  assert.equal(doc.querySelector('#phan-1 .kpis .kpi:last-child .k-v')!.textContent, '35');
  assert.equal(doc.querySelectorAll('.mucluc a').length, 8);
  assert.equal(doc.querySelectorAll('#phan-0 .finds li').length, 5);
  assert.equal(doc.querySelectorAll('#phan-0 .pcard').length, 3);
  assert.match(doc.querySelector('#phan-5')!.textContent!, /2,0 tỷ/);
  assert.match(doc.querySelector('#phan-5')!.textContent!, /Chưa xác định sàn/);
  assert.doesNotMatch(doc.body.textContent!, /278 triệu|75 sản phẩm|Metric|Kalodata|TradeInt|Dami/);
  assert.match(doc.querySelector('#phan-4')!.textContent!, /so với kỳ/);
  dom.window.close();
});

// A2: independently mutate source bytes and an AI claim; each must stop at its own guard.
test('A2 hash and number-trace guards block captured-value drift and invented AI numbers', async () => {
  const { archive, files, spec } = await capture();
  const built = await renderV3Report(archive, model);
  assert.equal(built.gate.coveredUntraced, 0);
  assert.equal(built.gate.mismatches.length, 0);
  const changed = structuredClone(archive) as V3Archive;
  const productResponse = changed.windows[0]!.raw.find((r: any) => r.body.data.products);
  productResponse.body.data.products[0].revenue_custom++;
  assert.equal(checkMarketNumberTrace(built.html, built.trace, { resolve: v3Resolver(changed) }).ok, false);
  const raw = JSON.parse(files['30d/raw-responses.json']!.toString());
  raw.find((r: any) => r.body.data.products).body.data.products[0].revenue_custom++;
  files['30d/raw-responses.json'] = bytes(raw);
  await assert.rejects(loadV3Archive(async p => files[p]!, spec), /V3_CAPTURE_HASH_MISMATCH/);
  await assert.rejects(renderV3Report(archive, { generateText: async () => JSON.stringify({ ...opening, points: ['Thị trường đạt 987654321 tỷ.', ...opening.points.slice(1)] }) }), /MARKET_NUMBER_TRACE_BLOCKED/);
  await assert.rejects(renderV3Report(archive, undefined), /V3_REPORT_AI_NOT_CONFIGURED/);
});

// A3: real existing engine, no browser server or new PDF implementation. Explicit binary for portable CI.
test('A3 existing Chromium exporter prints the v3 document', { skip: !process.env.TDN_RESEARCH_PDF_CHROMIUM }, async () => {
  const { archive } = await capture();
  const built = await renderV3Report(archive, model);
  const renderer = createChromiumPdfRenderer({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM! });
  try { const pdf = await renderer.render(Buffer.from(built.html)); assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000); }
  finally { await renderer.close(); }
});

// A4: durable production service boundary, then fresh read handle; no test-only production seam.
test('A4 preset PREPARE stores and replays a report while bypassing legacy collection', async t => {
  const bundle = await capture();
  const lane: { model?: V3TextModel } = { model: { ...model } };
  const f = await fixture(t, 'on', undefined, fake => async (_config, request) => {
    const dir = join(fake.captureRoot, request.runId, 'run1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(fake.captureRoot, request.runId, 'spec.json'), bytes(bundle.spec));
    for (const [p, data] of Object.entries(bundle.files)) { await mkdir(join(dir, p, '..'), { recursive: true }); await writeFile(join(dir, p), data); }
    return { ok: true, captureDir: dir, period: bundle.spec.windows[1].period, executorCalls: 1 };
  }, undefined, { v3Report: lane });
  const receipt = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: 'cccccccc-0000-4000-8000-000000000001', mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, metricV3Preset: bundle.spec, reports: ['MARKET'] });
  await drain(f.service);
  const runId = receipt.run.runId;
  const run = await f.service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY', JSON.stringify(autorun(f.db, runId), (_key, value) => typeof value === 'bigint' ? String(value) : value));
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  const report = await f.make().readReport(workspaceId, runId, 'MARKET');
  assert.match(report.bytes.toString(), /id="phan-7"/);
  await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', true), /not available/);
  const steps = f.db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { state: string };
  assert.equal(steps.state, 'SKIPPED');
  assert.equal((f.db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='QUICK_SEARCH'").get(runId) as { state: string }).state, 'SKIPPED');
  assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_research_automation_usage WHERE run_id=?').get(runId) as { n: bigint }).n, 0n);
  // A process restart after dispatch is ambiguous: stop, never send another model request.
  let signalStarted!: () => void, release!: (text: string) => void, calls = 0;
  const started = new Promise<void>(r => { signalStarted = r; });
  lane.model = { identity: 'synthetic-model', generateText: async () => { calls++; signalStarted(); return new Promise<string>(r => { release = r; }); } };
  const second = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: 'cccccccc-0000-4000-8000-000000000002', mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, metricV3Preset: bundle.spec, reports: ['MARKET'] });
  const working = drain(f.service);
  await started;
  await f.make().recoverOnStart();
  release(JSON.stringify(opening));
  await working;
  assert.equal(calls, 1);
  assert.equal(autorun(f.db, second.run.runId)!.stopCode, 'V3_REPORT_INTERRUPTED');
  await assert.rejects(f.make().readReport(workspaceId, second.run.runId, 'MARKET'), /not available/);
  delete lane.model;
  const third = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: 'cccccccc-0000-4000-8000-000000000003', mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, metricV3Preset: bundle.spec, reports: ['MARKET'] });
  await drain(f.service);
  assert.equal(autorun(f.db, third.run.runId)!.stopCode, 'V3_REPORT_AI_NOT_CONFIGURED');
  await assert.rejects(f.make().readReport(workspaceId, third.run.runId, 'MARKET'), /not available/);

});

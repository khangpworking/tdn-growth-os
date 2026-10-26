import assert from 'node:assert/strict';
import test from 'node:test';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { chromium } from 'playwright-core';
import { buildV3Body, checkV3NumberTrace, loadV3Archive, renderV3Report, v3Hash, v3Resolver, type V3Archive, type V3TextModel } from '../../src/modules/analysis/research-automation/metric-v3-report.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { checkMarketNumberTrace } from '../../src/modules/analysis/research-automation/market-number-trace.js';
import { createChromiumPdfRenderer } from '../../src/modules/analysis/research-automation/pdf.js';
import { planScope } from '../../src/modules/analysis/research-automation/autorun-scope.js';
import { fixture, workspaceId, drain, autorun } from '../helpers/autorun-harness.js';
const adapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
const original = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
const bytes = (v: unknown) => Buffer.from(`${JSON.stringify(v, null, 2)}\n`);

// Extends the existing synthetic publication fixture at the external response boundary.
async function capture(shopCase: 'known' | 'missing' | 'unknown' | 'conflicting' = 'missing', products?: { platforms: (number | null)[]; firstTitle: string }, singleKeyword?: string) {
  const f = structuredClone(original);
  if (singleKeyword) {
    f.spec.contractVersion = 'metric-v3-capture-spec-v2';
    f.spec.preset.keywords = [singleKeyword];
    for (const row of f.windows) {
      row.observation.appliedState.keywords = [singleKeyword];
      for (const response of row.responses) response.requestBody.include_query.queries = [singleKeyword];
    }
  }
  const files: Record<string, Buffer> = {};
  const refs = [];
  for (const [i, window] of f.spec.windows.entries()) {
    const row = f.windows[i];
    for (const response of row.responses) {
      for (const endpoint of ['products', 'shops', 'groups']) {
        if (!response.body.data?.[endpoint]) continue;
        response.body.data[endpoint] = Array.from({ length: 20 }, (_, n) => ({
          shop_base_id: n === 0 ? 'known-shop' : null, product_name: n === 0 && products ? products.firstTitle : `Synthetic item ${n + 1}`, shop_name: `Synthetic shop ${n + 1}`, brand: `Synthetic brand ${n + 1}`,
          platform_id: endpoint === 'products' ? products?.platforms[n] ?? null : n % 2 ? 1 : 8, official_type: n % 2,
          price: 123000, revenue_custom: 2000000000 - n * 1000000, previous_revenue_custom: 1000000000,
          revenue_custom_sum: 2000000000 - n * 1000000, previous_revenue_custom_sum: 1000000000,
        }));
      }
    }
    const shops = row.responses.find((r: any) => r.body.data?.shops).body.data.shops;
    if (shopCase === 'missing') shops[0].shop_base_id = 'unmatched-shop';
    if (shopCase === 'unknown') shops[0].platform_id = null;
    if (shopCase === 'conflicting') shops[1].shop_base_id = 'known-shop';
    // The published source map selects the last valid response, not an earlier same-scope result.
    const publishedBasic = structuredClone(row.responses[0]);
    row.responses[0].body.data.search_basic.aggregations.find((a: any) => a.aggregation === 'SHOP_TOTAL').entity.platforms[0].value = 777;
    row.responses.push(publishedBasic);
    const raw = bytes(row.responses);
    const m = adapter.buildV3WindowManifest(f.spec, window, row.observation, row.responses, '2026-10-26T07:00:00.000Z');
    m.captureId = `eeeeeeee-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    files[`${window.id}/raw-responses.json`] = raw;
    files[`${window.id}/manifest.json`] = bytes(m);
    refs.push({ window: window.id, path: `${window.id}/manifest.json`, sha256: v3Hash(bytes(m)) });
  }
  files['manifest.json'] = bytes({ contractVersion: 'metric-v3-capture-v1', specDigest: v3Hash(bytes(f.spec)), windows: refs });
  const archive = await loadV3Archive(async p => files[p]!, f.spec);
  return { files, archive, spec: f.spec };
}
const findings = [
  { headline: 'Doanh số được nguồn ước tính.', detail: 'Chỉ phản ánh phạm vi đã thu.' },
  { headline: 'Các sàn có quy mô khác nhau.', detail: 'Chưa thể kết luận nguyên nhân.' },
  { headline: 'Giá là giá trên thẻ sản phẩm.', detail: 'Không phải giá khách trả sau voucher.' },
  { headline: 'Sàn chưa rõ được giữ riêng.', detail: 'Không suy đoán từ tên shop.' },
  { headline: 'Chưa có dữ liệu về lợi nhuận.', detail: 'Cần kiểm tra chi phí trước khi quyết định.' },
];
const opening = { points: findings.map(f => `${f.headline} ${f.detail}`), proposals: ['Đề xuất kiểm tra phạm vi tìm kiếm.', 'Đề xuất đối chiếu hồ sơ sản phẩm.', 'Đề xuất rà soát các sàn trước khi quyết định.'] };
const model = { identity: 'synthetic-model', generateText: async () => JSON.stringify(opening) };

test('K2 one-keyword report title falls back to keyword 1 after archive validation', async () => {
  const { archive } = await capture('missing', undefined, 'synthetic jar');
  const dom = new JSDOM(buildV3Body(archive).html);
  try {
    assert.equal(dom.window.document.querySelector('h1')!.textContent, 'Synthetic jar trên Shopee và TikTok Shop');
    assert.match(dom.window.document.querySelector('.filters')!.textContent!, /Từ khóa: synthetic jar,/);
  } finally { dom.window.close(); }
});

// A1: external report shape and independently known fixture amounts; legacy tests own legacy rules.
test('V3L A1 summary precedes evidence, with complete conclusions last and nine unchanged figures', async () => {
  const { archive } = await capture();
  const built = await renderV3Report(archive, model);
  const dom = new JSDOM(built.html);
  const doc = dom.window.document;
  const parts = [
    ['p1', 'Phần 1', 'Tổng quan tóm tắt', 0],
    ['p2', 'Phần 2', 'Thị trường lớn cỡ nào, đang lên hay xuống', 3],
    ['p3', 'Phần 3', 'Shop Mall hay shop thường', 1],
    ['p4', 'Phần 4', 'Tiền nằm ở dải giá nào', 1],
    ['p5', 'Phần 5', 'Ai đang thắng', 2],
    ['p6', 'Phần 6', 'Sản phẩm bán chạy nhất', 2],
    ['p7', 'Phần 7', 'Dữ liệu này không trả lời được gì', 0],
    ['p8', 'Phần 8', 'Kết luận và đề xuất hướng kinh doanh', 0],
    ['p9', 'Phụ lục', 'Chú thích dữ liệu', 0],
  ];
  assert.deepEqual([...doc.querySelectorAll('section')].map(s => [s.id, s.querySelector('.sec-no')!.textContent, s.querySelector('h2')!.textContent, s.querySelectorAll('figure').length]), parts);
  assert.equal(doc.querySelectorAll('figure').length, 9);
  assert.deepEqual([...doc.querySelectorAll('.mucluc a')].map(a => [a.getAttribute('href'), a.querySelector('b')!.textContent, a.lastChild!.textContent]), parts.map(([id, label, title]) => [`#${id}`, label, title]));
  for (const link of doc.querySelectorAll('a[href^="#"]')) assert.ok(doc.getElementById(link.getAttribute('href')!.slice(1)), `broken report link: ${link.outerHTML}`);
  assert.equal(doc.querySelector('#p1 .lead-in a')!.getAttribute('href'), '#p8');
  assert.deepEqual([...doc.querySelectorAll('#p1 .kp-h')].map(p => p.textContent!.split(' · ')[0]), ['30 ngày', '12 tháng']);
  assert.equal(doc.querySelectorAll('#p1 .kpis').length, 2);
  assert.equal(doc.querySelectorAll('section:not(#p1) .kpis').length, 0);
  assert.equal(doc.querySelector('#p1 .kpis .kpi:last-child .k-v')!.textContent, '35');
  assert.equal(doc.querySelector('#p1 h3')!.textContent, 'Điểm chính');
  assert.deepEqual([...doc.querySelectorAll('#p1 .sum-pts li')].map(li => li.textContent), findings.slice(0, 4).map(f => f.headline));
  assert.equal(doc.querySelector('#p1 .sum-cav')!.textContent, findings[4]!.headline);
  assert.equal(doc.querySelectorAll('#p1 .finds, #p1 .pcard, #p1 .det').length, 0);
  assert.deepEqual([...doc.querySelectorAll('#p8 .finds li b')].map(b => b.textContent), findings.map(f => f.headline));
  assert.deepEqual([...doc.querySelectorAll('#p8 .finds li .det')].map(span => span.textContent), findings.map(f => f.detail));
  assert.equal(doc.querySelector('#p8 h3')!.textContent, 'Đề xuất hướng kinh doanh');
  assert.deepEqual([...doc.querySelectorAll('#p8 .pcard p')].map(p => p.textContent), opening.proposals);
  for (const card of doc.querySelectorAll('#p8 .pcard')) assert.match(card.textContent!, /chờ chủ duyệt/);
  assert.match(doc.querySelector('#p6')!.textContent!, /2,0 tỷ/);
  assert.match(doc.querySelector('#p6')!.textContent!, /Chưa xác định sàn/);
  assert.doesNotMatch(doc.body.textContent!, /278 triệu|75 sản phẩm|Metric|Kalodata|TradeInt|Dami/);
  assert.match(doc.querySelector('#p5')!.textContent!, /so với kỳ/);
  assert.ok(doc.querySelector('.srcline')!.textContent!.startsWith('Biểu đồ: mỗi sàn một màu, theo màu sàn của công cụ đo. Sàn chưa xác định giữ màu xám.'));
  dom.window.close();
});

// Product platform evidence: identity-linked shop vs absent/unknown/ambiguous evidence.
for (const shopCase of ['known', 'missing', 'unknown', 'conflicting'] as const) {
  test(`product platform colour from captured shops: ${shopCase}`, async () => {
    const { archive } = await capture(shopCase);
    const dom = new JSDOM((await renderV3Report(archive, model)).html);
    const figures = dom.window.document.querySelectorAll('#p6 figure');
    assert.equal(figures.length, 2);
    for (const figure of figures) {
      const row = figure.querySelector('.hb-r')!;
      assert.ok(row.querySelector(shopCase === 'known' ? '.bg-tiktok' : '.bg-unk'));
      assert.match(row.textContent!, shopCase === 'known' ? /TikTok Shop/ : /Chưa xác định sàn/);
    }
    dom.window.close();
  });
}

// A2: independently mutate source bytes and an AI claim; each must stop at its own guard.
test('A2 hash and number-trace guards block captured-value drift and invented AI numbers', async () => {
  const { archive, files, spec } = await capture();
  const built = await renderV3Report(archive, model);
  assert.equal(built.gate.coveredUntraced, 0);
  assert.equal(built.gate.mismatches.length, 0);
  const numeric = await renderV3Report(archive, { generateText: async request => {
    const facts = JSON.parse(request.userText).facts as Record<string, string>;
    const shopCount = Object.entries(facts).find(([, text]) => text === '35');
    assert.ok(shopCount, 'fixture has the independently known shop count');
    return JSON.stringify({ ...opening, points: [`Có {${shopCount[0]}} shop có lượt bán. Phạm vi chỉ gồm nguồn đã thu.`, ...opening.points.slice(1)] });
  } });
  assert.equal(numeric.gate.coveredUntraced, 0);
  assert.deepEqual(numeric.gate.mismatches, []);
  const dom = new JSDOM(numeric.html);
  assert.equal(dom.window.document.querySelector('#p1 .sum-pts li')!.textContent, 'Có 35 shop có lượt bán.');
  assert.equal(dom.window.document.querySelector('#p8 .finds li b')!.textContent, 'Có 35 shop có lượt bán.');
  dom.window.close();
  const duplicated = checkV3NumberTrace({ ...numeric, html: numeric.html.replace('Có 35 shop', 'Có 35 35 shop') }, archive);
  assert.equal(duplicated.ok, false, 'an extra occurrence of an otherwise valid headline number must block');
  assert.ok(duplicated.mismatches.some(m => m.token === '35' && m.reason === 'v3 occurrence count differs'));
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
test('V3L A3 existing Chromium exporter honours A4 paper for the v3 document', { skip: !process.env.TDN_RESEARCH_PDF_CHROMIUM }, async () => {
  const { archive } = await capture();
  const built = await renderV3Report(archive, model);
  const renderer = createChromiumPdfRenderer({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM! });
  try {
    const pdf = await renderer.render(Buffer.from(built.html));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.length > 10000);
    const pages = [...pdf.toString('latin1').matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)];
    assert.ok(pages.length > 0, 'exported PDF exposes its actual paper dimensions');
    for (const page of pages) {
      assert.ok(Math.abs(Number(page[1]) - 595.28) < 1, 'A4 width in PDF points');
      assert.ok(Math.abs(Number(page[2]) - 841.89) < 1, 'A4 height in PDF points');
    }
  }
  finally { await renderer.close(); }
});

// V3L rows 2–3: real chart marks and the print cascade, including a title that needs clamping.
test('V3L platform palette survives themes and print keeps panels and product metadata readable', { skip: !process.env.TDN_RESEARCH_PDF_CHROMIUM }, async () => {
  const firstTitle = 'Tên sản phẩm tổng hợp dùng để kiểm tra tiêu đề rất dài và khả năng xuống dòng khi in '.repeat(8).trim();
  const { archive } = await capture('missing', { platforms: [1, 8, 2, 3, null], firstTitle });
  const built = await renderV3Report(archive, model);
  const browser = await chromium.launch({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM!, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, javaScriptEnabled: false });
    await page.route('**/*', route => route.abort());
    await page.setContent(built.html);
    const palette = ['rgb(238, 103, 45)', 'rgb(0, 0, 0)', 'rgb(18, 38, 137)', 'rgb(0, 96, 255)'];
    for (const scenario of [
      { media: 'screen', colorScheme: 'light', theme: null },
      { media: 'screen', colorScheme: 'dark', theme: null },
      { media: 'screen', colorScheme: 'light', theme: 'dark' },
      { media: 'screen', colorScheme: 'dark', theme: 'light' },
      { media: 'print', colorScheme: 'dark', theme: 'dark' },
    ] as const) {
      await page.emulateMedia({ media: scenario.media, colorScheme: scenario.colorScheme });
      await page.evaluate(theme => {
        if (theme) document.documentElement.dataset.theme = theme;
        else delete document.documentElement.dataset.theme;
      }, scenario.theme);
      const colours = await page.evaluate(() => ({
        rows: [...document.querySelectorAll('#p6 figure:first-of-type .hb-r')].slice(0, 5).map(row => ({
          label: row.querySelector('small')!.textContent,
          background: getComputedStyle(row.querySelector('.hb-b i')!).backgroundColor,
        })),
        stacked: [...document.querySelectorAll('#p2 figure:first-of-type .stk2 i')].map(mark => ({ background: getComputedStyle(mark).backgroundColor, text: getComputedStyle(mark).color })),
        line: getComputedStyle(document.querySelector('#p2 svg circle')!).fill,
      }));
      assert.deepEqual(colours.rows.slice(0, 4).map(row => row.background), palette, JSON.stringify(scenario));
      assert.deepEqual(colours.rows.slice(0, 4).map(row => row.label!.split(' · ')[0]), ['Shopee', 'TikTok Shop', 'Lazada', 'Tiki']);
      assert.match(colours.rows[4]!.label!, /Chưa xác định sàn/);
      const grey = colours.rows[4]!.background.match(/\d+/g)!.map(Number);
      assert.ok(Math.max(...grey) - Math.min(...grey) <= 10, 'unknown platform stays grey');
      assert.deepEqual(colours.stacked, [0, 1].flatMap(() => [
        { background: palette[1], text: 'rgb(255, 255, 255)' },
        { background: palette[0], text: 'rgb(11, 11, 11)' },
      ]), 'share labels contrast with their platform background');
      assert.equal(colours.line, palette[0], 'SVG marks use the same platform colour as HTML bars');
    }
    // A4 content width triggers narrow-screen rules too; print must restore two columns.
    await page.setViewportSize({ width: 700, height: 900 });
    const print = await page.evaluate(() => {
      const title = document.querySelector('#p6 .hb-l > span') as HTMLElement;
      const metadata = title.nextElementSibling as HTMLElement;
      const panels = [...document.querySelectorAll('#p5 figure:first-of-type .two > .panel')].map(panel => ({ x: panel.getBoundingClientRect().x, y: panel.getBoundingClientRect().y }));
      const pageStyles: CSSStyleDeclaration[] = [];
      const css = {
        values(selector: string, property: string) { return [...document.querySelectorAll(selector)].map(node => getComputedStyle(node).getPropertyValue(property)); },
        active(rules: CSSRuleList) {
          for (const rule of rules) {
            if (rule instanceof CSSMediaRule && matchMedia(rule.conditionText).matches) css.active(rule.cssRules);
            if (rule instanceof CSSPageRule) pageStyles.push(rule.style);
          }
        },
      };
      for (const sheet of document.styleSheets) css.active(sheet.cssRules);
      const paper = Object.fromEntries(['size', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left'].map(property => [property, pageStyles.map(style => style.getPropertyValue(property)).filter(Boolean).at(-1)]));
      return {
        paper, panels, cover: css.values('.top', 'break-after'), sections: css.values('section', 'break-before'),
        productFigures: css.values('#p6 figure', 'break-before'),
        keeps: css.values('.kpis, .kpi, .pcard, .finds li, .hb-r, .foot-notes li, figure:has(.chart), figure:has(.stk2), figure:has(.two)', 'break-inside'),
        kpiLabels: css.values('.kp-h', 'break-after'),
        title: { text: title.textContent, clamp: getComputedStyle(title).webkitLineClamp, overflow: getComputedStyle(title).overflow, height: title.clientHeight, fullHeight: title.scrollHeight, lineHeight: Number.parseFloat(getComputedStyle(title).lineHeight) },
        metadata: { tag: metadata.tagName, text: metadata.textContent, display: getComputedStyle(metadata).display, height: metadata.getBoundingClientRect().height },
        caveat: Number.parseFloat(getComputedStyle(document.querySelector('#p1 .sum-cav')!).fontSize),
        headline: Number.parseFloat(getComputedStyle(document.querySelector('#p1 .sum-pts li')!).fontSize),
      };
    });
    assert.equal(print.paper.size!.toLowerCase(), 'a4');
    assert.deepEqual([print.paper['margin-top'], print.paper['margin-right'], print.paper['margin-bottom'], print.paper['margin-left']], ['14mm', '13mm', '16mm', '13mm']);
    assert.deepEqual(print.cover, ['page']);
    assert.deepEqual(print.sections, ['page', ...Array<string>(8).fill('auto')]);
    assert.equal(print.productFigures[1], 'page', 'the twelve-month product list starts on a new page');
    assert.ok(print.keeps.length > 30 && print.keeps.every(value => value === 'avoid'), 'cards, chart figures and list rows stay together');
    assert.ok(print.kpiLabels.every(value => value === 'avoid'));
    assert.equal(print.panels.length, 2);
    assert.ok(print.panels[1]!.x > print.panels[0]!.x && Math.abs(print.panels[1]!.y - print.panels[0]!.y) < 1, 'brand panels retain two print columns');
    assert.equal(print.title.text, firstTitle);
    assert.equal(print.title.clamp, '2'); assert.equal(print.title.overflow, 'hidden');
    assert.ok(print.title.height <= 2 * print.title.lineHeight + 1 && print.title.fullHeight > print.title.height, 'a long product title is visibly clamped to two lines');
    assert.equal(print.metadata.tag, 'SMALL'); assert.match(print.metadata.text!, /Shopee · Synthetic shop 1 · 123\.000đ/);
    assert.ok(print.metadata.display !== 'none' && print.metadata.height > 0, 'shop and price remain outside the clamped title');
    assert.ok(print.caveat < print.headline, 'the fifth caveat is smaller than the four main headlines');
  } finally { await browser.close(); }
});

// A4: durable production service boundary, then fresh read handle; no test-only production seam.
for (const [presetOrigin, rendererVersion] of [['start', 'v2'], ['confirmation', 'v2'], ['start', 'v1']] as const) test(`A4 ${presetOrigin} preset ${rendererVersion} stored report reads/downloads and stops interrupted AI on restart`, async t => {
  const bundle = await capture();
  const lane: { model?: V3TextModel } = { model: { ...model } };
  const f = await fixture(t, 'on', undefined, fake => async (_config, request) => {
    const dir = join(fake.captureRoot, request.runId, 'run1');
    await mkdir(dir, { recursive: true });
    await writeFile(join(fake.captureRoot, request.runId, 'spec.json'), bytes(bundle.spec));
    for (const [p, data] of Object.entries(bundle.files)) { await mkdir(join(dir, p, '..'), { recursive: true }); await writeFile(join(dir, p), data); }
    return { ok: true, captureDir: dir, period: bundle.spec.windows[1].period, executorCalls: 1 };
  }, undefined, { v3Report: lane });
  async function startRun(requestNumber: number) {
    const receipt = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v2', requestKey: `cccccccc-0000-4000-8000-${String(requestNumber).padStart(12, '0')}`, mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, ...(presetOrigin === 'start' ? { metricV3Preset: bundle.spec } : {}), reports: ['MARKET'] });
    if (presetOrigin === 'confirmation') {
      const id = receipt.run.runId;
      while ((await f.service.getRun(workspaceId, id)).status !== 'AWAITING_SCOPE') await f.service.processNext();
      f.db.prepare("UPDATE research_automation_autorun SET phase='STOPPED',phase_state='QUEUED',stop_code='KEYWORD2_AWAITING' WHERE run_id=?").run(id);
      const dir = join(f.capture.captureRoot, id);
      await mkdir(join(dir, 'run1'), { recursive: true });
      await writeFile(join(dir, 'run1', 'raw-responses.json'), JSON.stringify({ responses: [] }));
      const scope = planScope({ runId: id, keyword1: bundle.spec.preset.keywords[0],
        category: { reason: 'DOMINANT', category: { id: 'c2140822537', label: 'Thực phẩm chức năng' }, top: null, threshold: 0.7, productType: null, interviewMatch: null, shares: null },
        keyword2: { chosen: { term: bundle.spec.preset.keywords[1], source: 'TITLE', titles: 5, titleShare: 0.5, brands: 3, revenue: 100, kept: true }, candidates: [], titleCount: 10, modelVariants: 'NOT_CONFIGURED' } });
      await writeFile(join(dir, 'scope.json'), JSON.stringify(scope));
      await f.service.retryAutoRunCapture(workspaceId, id, { contractVersion: 'research-automation-autorun-keyword-v2',
        requestKey: `dddddddd-0000-4000-8000-${String(requestNumber).padStart(12, '0')}`, keyword2: bundle.spec.preset.keywords[1], metricV3Preset: bundle.spec });
    }
    return receipt;
  }
  const receipt = await startRun(1);
  await drain(f.service);
  const runId = receipt.run.runId;
  const run = await f.service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY', JSON.stringify(autorun(f.db, runId), (_key, value) => typeof value === 'bigint' ? String(value) : value));
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  const saved = f.db.prepare('SELECT version_sha256 versionSha FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { versionSha: string };
  const semantic = JSON.parse((await f.artifacts.read(saved.versionSha)).toString());
  assert.equal(semantic.rendererVersion, 'metric-v3-report-v2', 'new runs name the new layout');
  assert.equal((f.db.prepare('SELECT builder_version version FROM analysis_reader_report_revisions WHERE run_id=?').get(runId) as { version: string }).version, 'metric-v3-report-v2');
  // Load historical bytes captured using the unmodified origin/main renderer,
  // retaining this run's real capture lineage and identity. No legacy model call.
  async function retain(data: Buffer, mediaType: string) {
    const artifact = await f.artifacts.put(data);
    f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,?,?,'2026-02-01T00:00:00.000Z','1.0.0','active','2026-02-01T00:00:00.000Z') ON CONFLICT DO NOTHING`)
      .run(artifact.sha256, artifact.byteSize, mediaType, artifact.relativePath);
    return artifact.sha256;
  }
  if (rendererVersion === 'v1') {
    const historical = JSON.parse(await readFile(new URL('../fixtures/metric-v3/report-v1.json', import.meta.url), 'utf8'));
    const htmlSha = await retain(Buffer.from(historical.html), 'text/html; charset=utf-8');
    Object.assign(semantic, { rendererVersion: 'metric-v3-report-v1', htmlSha, opening: historical.opening, numberTrace: historical.trace, numberTraceGate: historical.gate });
    const versionSha = await retain(Buffer.from(canonicalJson(semantic)), 'application/json');
    const metricsSha = await retain(bytes(historical.trace), 'application/json');
    const row = f.db.prepare('SELECT revision_id revisionId,input_sha256 inputSha FROM analysis_reader_report_revisions WHERE run_id=?').get(runId) as { revisionId: string; inputSha: string };
    const input = JSON.parse((await f.artifacts.read(row.inputSha)).toString());
    Object.assign(input, { semanticSha256: versionSha, htmlSha256: htmlSha });
    const inputSha = await retain(bytes(input), 'application/json');
    // Historical-state fixture installation only; production keeps immutable ledgers.
    f.db.exec('DROP TRIGGER analysis_research_automation_outputs_no_update; DROP TRIGGER analysis_reader_report_revisions_no_update');
    f.db.prepare('UPDATE analysis_research_automation_outputs SET version_sha256=?,html_sha256=? WHERE run_id=?').run(versionSha, htmlSha, runId);
    f.db.prepare("UPDATE analysis_reader_report_revisions SET builder_version='metric-v3-report-v1',request_sha256=?,draft_pair_id=?,input_sha256=?,html_sha256=?,metrics_sha256=? WHERE run_id=?")
      .run(versionSha, versionSha, inputSha, htmlSha, metricsSha, runId);
  }
  const fresh = f.make();
  const revisions = (await fresh.listReaderReports(workspaceId, runId)).revisions;
  assert.equal(revisions.length, 1, 'completed v3 must be available in Reader');
  const report = await fresh.readReport(workspaceId, runId, 'MARKET');
  const reader = await fresh.readReaderReport(workspaceId, runId, revisions[0]!.revisionId);
  assert.deepEqual(reader.bytes, report.bytes, 'Reader preserves the v3 HTML');
  const server = http.createServer();
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const api = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin: base,
    ...(process.env.TDN_RESEARCH_PDF_CHROMIUM ? { pdfExecutablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM } : {}),
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot,
      token: 'synthetic-owner-token-for-v3-reader-1234567890', allowedOrigin: base, actorId: 'synthetic-owner' } });
  server.on('request', api.handler);
  try {
    const root = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reader-reports`;
    const page = await fetch(`${root}/${revisions[0]!.revisionId}/html`);
    assert.equal(page.status, 200);
    assert.deepEqual(Buffer.from(await page.arrayBuffer()), report.bytes);
    // The draft download replays retained evidence, unlike the Reader's retained HTML route.
    const draft = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reports/market`);
    assert.equal(draft.status, 200);
    assert.deepEqual(Buffer.from(await draft.arrayBuffer()), report.bytes);
    if (process.env.TDN_RESEARCH_PDF_CHROMIUM) {
      const download = await fetch(`${root}/${revisions[0]!.revisionId}/pdf`);
      assert.equal(download.status, 200);
      assert.equal(download.headers.get('content-type'), 'application/pdf');
      assert.match(download.headers.get('content-disposition')!, /attachment; filename="reader-report-/);
      assert.equal(Buffer.from(await download.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    } else t.diagnostic('PDF route requires TDN_RESEARCH_PDF_CHROMIUM; HTML delivery still checked');
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); }

  if (rendererVersion === 'v1') {
    const historical = JSON.parse(await readFile(new URL('../fixtures/metric-v3/report-v1.json', import.meta.url), 'utf8'));
    assert.equal(report.bytes.toString(), historical.html, 'v1 is byte-identical to origin/main');
    return;
  }
  assert.match(report.bytes.toString(), /id="p9"/);
  if (presetOrigin === 'start') {
    // Rebind valid artifact hashes so corruption reaches the evidence replay guard.
    // A mere file-byte change would only exercise the artifact store's hash check.
    f.db.exec('DROP TRIGGER analysis_research_automation_outputs_no_update');
    const changedHtmlSha = await retain(Buffer.from(report.bytes.toString().replace('Synthetic item 1', 'Tampered item 1')), 'text/html; charset=utf-8');
    const tamperedSha = await retain(Buffer.from(canonicalJson({ ...semantic, htmlSha: changedHtmlSha })), 'application/json');
    f.db.prepare('UPDATE analysis_research_automation_outputs SET version_sha256=?,html_sha256=? WHERE run_id=?').run(tamperedSha, changedHtmlSha, runId);
    await assert.rejects(f.make().readReport(workspaceId, runId, 'MARKET'), /Stored v3 report differs from retained evidence/);
    const unknownSha = await retain(Buffer.from(canonicalJson({ ...semantic, rendererVersion: 'metric-v3-report-v99' })), 'application/json');
    f.db.prepare('UPDATE analysis_research_automation_outputs SET version_sha256=?,html_sha256=? WHERE run_id=?').run(unknownSha, semantic.htmlSha, runId);
    await assert.rejects(f.make().readReport(workspaceId, runId, 'MARKET'), /Stored v3 report identity differs/);
  }
  await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', true), /not available/);
  const steps = f.db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { state: string };
  assert.equal(steps.state, 'SKIPPED');
  assert.equal((f.db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='QUICK_SEARCH'").get(runId) as { state: string }).state, presetOrigin === 'start' ? 'SKIPPED' : 'SUCCEEDED');
  assert.equal((f.db.prepare(presetOrigin === 'start' ? "SELECT count(*) n FROM analysis_research_automation_usage WHERE run_id=?" : "SELECT count(*) n FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { n: bigint }).n, 0n);
  // A process restart after dispatch is ambiguous: stop, never send another model request.
  let signalStarted!: () => void, release!: (text: string) => void, calls = 0;
  const started = new Promise<void>(r => { signalStarted = r; });
  lane.model = { identity: 'synthetic-model', generateText: async () => { calls++; signalStarted(); return new Promise<string>(r => { release = r; }); } };
  const second = await startRun(2);
  const working = drain(f.service);
  await started;
  assert.equal(autorun(f.db, second.run.runId)!.phase, 'PREPARE');
  assert.equal(autorun(f.db, second.run.runId)!.state, 'RUNNING');
  const restarted = f.make();
  try {
    await restarted.recoverOnStart();
    // Any accidental replay must finish so the counter detects a second dispatch.
    lane.model = { identity: 'synthetic-model', generateText: async () => { calls++; return JSON.stringify(opening); } };
    await drain(restarted);
  } finally {
    release(JSON.stringify(opening));
    await working;
  }
  assert.equal(calls, 1, 'restart must not dispatch AI again');
  assert.equal(autorun(f.db, second.run.runId)!.phase, 'STOPPED');
  assert.equal(autorun(f.db, second.run.runId)!.stopCode, 'V3_REPORT_INTERRUPTED');
  await assert.rejects(f.make().readReport(workspaceId, second.run.runId, 'MARKET'), /not available/);
  if (presetOrigin === 'confirmation') return;
  delete lane.model;
  const third = await f.service.start(workspaceId, { contractVersion: 'research-automation-start-v2', requestKey: 'cccccccc-0000-4000-8000-000000000003', mode: 'CATEGORY', keyword: bundle.spec.preset.keywords[0], requestedPeriod: bundle.spec.windows[1].period, metricV3Preset: bundle.spec, reports: ['MARKET'] });
  await drain(f.service);
  assert.equal(autorun(f.db, third.run.runId)!.stopCode, 'V3_REPORT_AI_NOT_CONFIGURED');
  await assert.rejects(f.make().readReport(workspaceId, third.run.runId, 'MARKET'), /not available/);

});

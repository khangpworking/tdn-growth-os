import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { containsTechnicalId } from '../../src/modules/analysis/citation-registry.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData, lint } from '../../src/modules/analysis/reader-report/index.js';
import { COMTRADE_MIRROR_NOTE, COMTRADE_OWN_NOTE, renderComtradeCharts, renderWorldBankCharts, WORLD_BANK_CHART_NOTE } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { COMTRADE_SRC } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { StepComtrade, StepComtradeRow, StepOfficialStats, StepWorldBank, StepWorldBankIndicator } from '../../src/modules/analysis/research-automation/model.js';
import { OFFICIAL_STATS_LIMIT, OFFICIAL_STATS_PROVINCE_LIMIT, OFFICIAL_STATS_PROVINCE_NOTE, validOfficialStats } from '../../src/modules/analysis/research-automation/official-statistics-lane.js';
import { assertFlintCharts } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { WORLD_BANK_LIMIT, WORLD_BANK_SRC } from '../../src/modules/analysis/research-automation/world-bank-lane.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { fullMarket14Input, fullWorldBank } from '../helpers/market14-full-fixture.js';

const SHA = 'a'.repeat(64);
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

function indicator(code: string, name: string, series: readonly { year: string; value: string | null }[] | undefined, value = '123.5', year = '2024'): StepWorldBankIndicator {
  const last = series?.[series.length - 1];
  return { code, status: 'COLLECTED', reason: null, retrievedAt: '2026-01-01T00:00:00.000Z', captureIndex: 10, metadataCaptureIndex: 11, sourceSha256: SHA, metadataSha256: SHA,
    row: { indicatorName: name, value: last?.value ?? value, unit: null, year: last?.year ?? year, lastUpdated: '2026-01-01', statusLiteral: '', footnote: null, locator: '/1/0' },
    ...(series ? { series } : {}) };
}
const years = (from: number, values: readonly (string | null)[]) => values.map((value, i) => ({ year: String(from + i), value }));
const worldBank = (withSeries: boolean): StepWorldBank => ({ profile: 'p', indicators: [
  indicator('SP.POP.TOTL', 'Chỉ số tổng hợp A', withSeries ? years(2015, ['91000000', null, '93000000', '94000000', '95000000', '96000000', '97000000', '98000000', '99000000', '100300000']) : undefined, '100300000'),
  indicator('NE.CON.PRVT.PC.KD', 'Chỉ số tổng hợp B', withSeries ? years(2022, ['2000', '2050.5', '2100.5']) : undefined, '2100.5'),
] });
const row = (side: 'OWN' | 'MIRROR', reporter: string, flow: 'M' | 'X', year: string, value: string): StepComtradeRow => ({ side, reporter, flow, year, value, captureIndex: 20 });
const comtrade = (rows: readonly StepComtradeRow[]): StepComtrade => ({ profile: 'comtrade-v1', status: 'OK', hsCode: '999999', officialDescription: 'Synthetic goods',
  descriptionVi: 'Hàng tổng hợp', reasonVi: null, attempts: [], calls: [], rows, mirrorReporterCount: rows.filter(r => r.side === 'MIRROR').length });
const fullTrade = comtrade([row('OWN', 'Nước C', 'M', '2023', '5130000'), row('OWN', 'Nước C', 'X', '2023', '1270000'),
  row('MIRROR', 'Nước A', 'X', '2023', '3410000'), row('MIRROR', 'Nước B', 'X', '2023', '1270000')]);
const thinTrade = comtrade([row('MIRROR', 'Nước A', 'X', '2023', '3410000')]);

const figures = (html: string) => [...new JSDOM(html).window.document.querySelectorAll('figure')].map(figure => ({
  no: figure.querySelector('.exn')?.textContent ?? '', engine: figure.querySelector('.chart')?.getAttribute('data-engine') ?? '', text: figure.textContent!.replace(/\s+/gu, ' ') }));
const figure = (html: string, no: string) => figures(html).find(item => item.no === no);
const machineFailures = (html: string) => auditMarket14(html, undefined, { requireFlint: true }).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);

// v2 reader renderer
async function reader(extra: { worldBank?: StepWorldBank; comtrade?: StepComtrade; officialStats?: StepOfficialStats } = {}, flint = true) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint, ...extra });
}

test('World Bank documents without source precision/name preserve complete base HTML bytes in both renderers', async () => {
  // Captured from HEAD with the same synthetic inputs; the base and tree HTML dumps were also compared byte for byte.
  const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
  assert.equal(hash((await reader({ worldBank: fullWorldBank() }, false)).html), 'f7670c24d51634d3feb8dfdae3577cce691c3b7ea062a78981c582f7fc8da078');
  assert.equal(hash(buildResearchAutomationReport(await fullMarket14Input(), 'MARKET').html), '977dd2f9f35944f4774a087cc0cb79741b3d8a022fe492e0ff7c3b3709093845');
});

test('v2 reader: World Bank lines are Hình 5.3/5.4 after Bảng 5.3 and Comtrade bars are Hình 6.1/6.2 after Bảng 6.2, all Flint', async () => {
  const built = await reader({ worldBank: worldBank(true), comtrade: fullTrade });
  const wb1 = figure(built.html, 'Hình 5.3'), wb2 = figure(built.html, 'Hình 5.4'), mirror = figure(built.html, 'Hình 6.1'), own = figure(built.html, 'Hình 6.2');
  for (const [item, src, note] of [[wb1, WORLD_BANK_SRC, WORLD_BANK_CHART_NOTE], [wb2, WORLD_BANK_SRC, WORLD_BANK_CHART_NOTE], [mirror, COMTRADE_SRC, COMTRADE_MIRROR_NOTE], [own, COMTRADE_SRC, COMTRADE_OWN_NOTE]] as const) {
    assert.ok(item, 'figure present');
    assert.equal(item.engine, 'flint');
    assert.ok(item.text.includes(src), 'source line');
    assert.ok(item.text.includes(note), 'note');
    assert.doesNotMatch(item.text, /%|Google/u);
    assert.equal(containsTechnicalId(item.text), false, 'tick labels never read as a long digit run');
  }
  assert.match(wb1!.text, /Chỉ số tổng hợp A, cả nước Việt Nam/u);
  assert.match(wb1!.text, /\(triệu/u);
  assert.match(wb2!.text, /\(nghìn/u);
  assert.match(mirror!.text, /năm 2023/u);
  assert.match(own!.text, /triệu USD/u);
  const doc = new JSDOM(built.html).window.document;
  assert.equal([...doc.querySelectorAll('#phan-5 figure')].filter(item => /Hình 5\.[34]/u.test(item.textContent!)).length, 2, 'World Bank figures sit in the demand section');
  assert.deepEqual(built.charts.filter(chart => /^M0[56]\.(world-bank|comtrade)/u.test(chart.id)).map(chart => chart.engine), ['flint', 'flint', 'flint', 'flint']);
  assert.doesNotThrow(() => assertFlintCharts(built.charts, true));
  assert.deepEqual(machineFailures(built.html), machineFailures((await reader()).html), 'the figures add no failing machine rule');
  assert.equal(auditMarket14(built.html, undefined, { requireFlint: true }).find(item => item.rule === '11')!.ok, true);
});

test('v2 reader: absent data, old documents without a series and one mirror row change no byte', async () => {
  const plain = (await reader()).html;
  assert.equal((await reader({ worldBank: { profile: 'p', indicators: [] } })).html, plain, 'no rows, no bytes');
  const tables = (await reader({ worldBank: worldBank(false), comtrade: thinTrade })).html;
  assert.doesNotMatch(tables, /Hình 5\.3|Hình 6\.1/u);
  assert.notEqual(tables, plain, 'the tables still render');
  // Same table rows with a stored series: the figures are the only difference.
  const drawn = (await reader({ worldBank: worldBank(true), comtrade: thinTrade })).html;
  assert.equal(stripFigures(drawn, /Hình 5\.[34]/u), tables);
  assert.equal((await reader({ worldBank: worldBank(true), comtrade: thinTrade }, false)).html.includes('data-engine="flint"'), false, 'the opt-out draws no Flint chart');
});
function stripFigures(html: string, no: RegExp): string {
  return html.replace(/<figure\b[\s\S]*?<\/figure>(?:<p class="interp">[\s\S]*?<\/p>)?/gu, block => no.test(block) ? '' : block);
}

// Automation (presentation) renderer
async function presentationInput(extra: { worldBank?: StepWorldBank; comtrade?: StepComtrade; officialStats?: StepOfficialStats } = {}, draw = true): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows, unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const collection = { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', comparables: [], productCards: [], webResults: [], coverage: [], limitations: [], ...extra };
  const worldBankCharts = draw && extra.worldBank ? await renderWorldBankCharts(extra.worldBank) : [];
  const comtradeCharts = draw && extra.comtrade ? await renderComtradeCharts(extra.comtrade) : [];
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows),
    ...(worldBankCharts.length ? { worldBankCharts } : {}), ...(comtradeCharts.length ? { comtradeCharts } : {}) } as unknown as AutomationReportInput;
}
const draftHtml = (input: AutomationReportInput): string => buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');

test('both renderers show the confirmed scope limit beside the estimated code as automatic interpretation', async () => {
  const reasonVi = 'Số liệu chỉ gồm bình cách nhiệt bằng thép, không bao gồm mọi vật liệu của nhóm sản phẩm.';
  const scopedTrade = { ...fullTrade, reasonVi, descriptionVi: 'Bình cách nhiệt bằng thép' };
  const htmls = [(await reader({ comtrade: scopedTrade })).html, draftHtml(await presentationInput({ comtrade: scopedTrade }))];
  for (const html of htmls) {
    const doc = new JSDOM(html).window.document;
    const paragraph = [...doc.querySelectorAll('p')].find(p => p.textContent!.includes('Mã hàng ước tính: 999999'));
    assert.ok(paragraph, 'code is shown');
    assert.ok(paragraph.textContent!.includes(`Phạm vi áp dụng (diễn giải tự động): ${reasonVi}`), 'the limitation is in the same paragraph as the code');
    assert.doesNotMatch(paragraph.textContent!, /%|Google/u);
    assert.deepEqual(machineFailures(html), []);
  }
});

test('both renderers escape scope text and omit it without a reason or renderable rows', async () => {
  const reasonVi = '<img src=x onerror="alert(1)"> & synthetic scope';
  for (const trade of [
    { ...fullTrade, reasonVi },
    fullTrade,
    { ...fullTrade, reasonVi, rows: [] },
    { ...fullTrade, reasonVi, status: 'HS_CODE_NOT_CONFIRMED' as const },
  ]) {
    const htmls = [(await reader({ comtrade: trade })).html, draftHtml(await presentationInput({ comtrade: trade }))];
    for (const html of htmls) {
      const doc = new JSDOM(html).window.document;
      const paragraphs = [...doc.querySelectorAll('p')].filter(p => p.textContent!.includes('Phạm vi áp dụng (diễn giải tự động):'));
      const shown = trade.reasonVi !== null && trade.rows.length > 0 && trade.status === 'OK';
      assert.equal(paragraphs.length, shown ? 1 : 0);
      if (shown) {
        assert.ok(paragraphs[0]!.textContent!.includes(reasonVi));
        assert.equal(paragraphs[0]!.querySelector('img'), null, 'model text cannot create HTML');
      }
    }
  }
});

test('both Market renderers show source precision, source-name units and a rounding note without gate regressions', async () => {
  const bank = worldBank(true);
  const updated = { ...bank, indicators: bank.indicators.map(item => {
    const population = item.code === 'SP.POP.TOTL';
    const value = population ? '101598527' : '2381.8882523638';
    return { ...item, row: { ...item.row!, value, decimal: 0,
      sourceIndicatorName: population ? 'Population, total' : 'Households and NPISHs Final consumption expenditure per capita (constant 2015 US$)' },
      series: item.series!.map((point, i) => i === item.series!.length - 1 ? { ...point, value } : point) };
  }) };
  const readerHtml = (await reader({ worldBank: updated, comtrade: fullTrade })).html;
  const automationHtml = draftHtml(await presentationInput({ worldBank: updated, comtrade: fullTrade }));
  for (const html of [readerHtml, automationHtml]) {
    const doc = new JSDOM(html).window.document;
    const table = [...doc.querySelectorAll('.table-wrap, .ex')].find(node => /Bảng 5\.3/u.test(node.textContent!))!;
    assert.match(table.textContent!, /101\.598\.527 người/u);
    assert.match(table.textContent!, /2\.382 USD, giá cố định năm 2015/u);
    assert.doesNotMatch(table.textContent!, /nguồn chưa ghi đơn vị|2\.381,888|%/u);
    assert.equal((table.textContent!.match(/Các giá trị được làm tròn theo độ chính xác do nguồn công bố\./gu) ?? []).length, 1);
    assert.match(figure(html, 'Hình 5.3')!.text, /triệu người/u);
    assert.match(figure(html, 'Hình 5.4')!.text, /nghìn USD, giá cố định năm 2015/u);
    for (const [code, expected] of [['NE.CON.PRVT.PC.KD', '2.382 USD, giá cố định năm 2015'], ['SP.POP.TOTL', '101.598.527 người']]) {
      const points = [...doc.querySelectorAll(`[data-chart-id="M05.world-bank.${code}"] [aria-roledescription="point"]`)];
      assert.equal(points.at(-1)!.getAttribute('aria-label'), `Năm: 2024; Giá trị: ${expected}`);
    }
  }
  assert.deepEqual(machineFailures(readerHtml), machineFailures((await reader()).html));
  assert.deepEqual(machineFailures(automationHtml), []);
  assertMarketBusinessGate(automationHtml, { presentation: true, partialTotals: [] });
});

test('both renderers: World Bank figures, national and province tables, and Comtrade figures coexist with valid numbering and Flint', async () => {
  const officialStats: StepOfficialStats = {
    profile: 'official-stats-v1', status: 'OK', categoryGroup: 'Đồ uống', reasonVi: null, listCaptureIndex: null,
    files: [{ role: 'CPI', captureIndex: 30, sha256: SHA, title: 'Tệp giả lập', revised: false,
      url: 'https://www.nso.gov.vn/wp-content/uploads/2026/10/CPI-synthetic.xlsx', listedAt: '2026-10-01T00:00:00', retrievedAt: '2026-10-01T00:00:00.000Z' }],
    tables: [{ table: 'CPI_WORKBOOK', captureIndex: 30, outcome: 'READ', sheet: 'Cả nước', variant: 'binh-quan-luy-ke' }],
    values: [{ table: 'CPI_WORKBOOK', captureIndex: 30, sheet: 'Cả nước', row: 14, cell: 'C14', label: 'II. Đồ uống và thuốc lá',
      period: 'Tháng 9 năm 2026', measure: 'INDEX', unit: null, base: 'tháng trước', value: '102.25', shown: '102.25', status: 'NOT_STATED' }],
    provinces: { captureIndex: 30, outcome: 'READ', sheet: 'Địa phương', variant: 'thang-truoc', period: 'Tháng 9 năm 2026', base: 'tháng trước',
      provinces: ['Tỉnh A', 'Thành phố B'], values: [
        { row: 9, cell: 'B9', label: 'CHỈ SỐ GIÁ TIÊU DÙNG', province: 'Tỉnh A', value: '100.25', shown: '100.25' },
        { row: 9, cell: 'C9', label: 'CHỈ SỐ GIÁ TIÊU DÙNG', province: 'Thành phố B', value: '101.25', shown: '101.25' },
        { row: 11, cell: 'B11', label: 'II. Đồ uống và thuốc lá', province: 'Tỉnh A', value: '102.25', shown: '102.25' },
        { row: 11, cell: 'C11', label: 'II. Đồ uống và thuốc lá', province: 'Thành phố B', value: '103.25', shown: '103.25' },
      ] },
  };
  assert.equal(validOfficialStats(officialStats), true);
  const extra = { worldBank: worldBank(true), comtrade: fullTrade, officialStats };
  const readerHtml = (await reader(extra)).html;
  const automationHtml = draftHtml(await presentationInput(extra));
  for (const html of [readerHtml, automationHtml]) {
    const doc = new JSDOM(html).window.document;
    const exhibits = [...doc.querySelectorAll('.exn')].map(node => node.textContent!.trim());
    const start = exhibits.indexOf('Bảng 5.3');
    assert.ok(start >= 0);
    assert.deepEqual(exhibits.slice(start, start + 5), ['Bảng 5.3', 'Hình 5.3', 'Hình 5.4', 'Bảng 5.4', 'Bảng 5.5']);
    const trade = exhibits.indexOf('Bảng 6.2');
    assert.ok(trade > start + 4);
    assert.deepEqual(exhibits.slice(trade, trade + 3), ['Bảng 6.2', 'Hình 6.1', 'Hình 6.2']);
    for (const no of ['Hình 5.3', 'Hình 5.4', 'Hình 6.1', 'Hình 6.2']) assert.equal(figure(html, no)?.engine, 'flint', no);
    const m05 = doc.querySelector('#phan-5, #M05')!.textContent!;
    for (const text of [WORLD_BANK_LIMIT, OFFICIAL_STATS_LIMIT, OFFICIAL_STATS_PROVINCE_NOTE, OFFICIAL_STATS_PROVINCE_LIMIT]) assert.ok(m05.includes(text), text);
    assert.match(doc.querySelector('#phu-luc, #M13')!.textContent!, /Cục Thống kê \(nso\.gov\.vn\)/u);
    const numbering = lint(html).find(check => check.rule.startsWith('F7 '))!;
    assert.equal(numbering.ok, true, numbering.detail);
    const rule11 = auditMarket14(html, undefined, { requireFlint: true }).find(check => check.rule === '11')!;
    assert.equal(rule11.ok, true, rule11.detail);
  }
  assert.deepEqual(machineFailures(readerHtml), machineFailures((await reader()).html));
  assert.deepEqual(machineFailures(automationHtml), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(automationHtml, { presentation: true, partialTotals: [] }));
});

test('automation report: the four macro figures are Flint, numbered after their tables, and pass the gates and the 14 rules with requireFlint', async () => {
  const html = draftHtml(await presentationInput({ worldBank: worldBank(true), comtrade: fullTrade }));
  const list = figures(html);
  for (const no of ['Hình 5.3', 'Hình 5.4', 'Hình 6.1', 'Hình 6.2']) assert.equal(list.find(item => item.no === no)?.engine, 'flint', no);
  assert.ok(figure(html, 'Hình 5.3')!.text.includes(WORLD_BANK_SRC) && figure(html, 'Hình 5.3')!.text.includes(WORLD_BANK_CHART_NOTE));
  assert.ok(figure(html, 'Hình 6.1')!.text.includes(COMTRADE_SRC) && figure(html, 'Hình 6.1')!.text.includes(COMTRADE_MIRROR_NOTE));
  assert.ok(figure(html, 'Hình 6.2')!.text.includes(COMTRADE_OWN_NOTE));
  const doc = new JSDOM(html).window.document;
  assert.ok(doc.querySelector('#M05')!.textContent!.indexOf('Bảng 5.3') < doc.querySelector('#M05')!.textContent!.indexOf('Hình 5.3'));
  assert.ok(doc.querySelector('#M06')!.textContent!.indexOf('Bảng 6.2') < doc.querySelector('#M06')!.textContent!.indexOf('Hình 6.1'));
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true, partialTotals: [] }));
  const gate = auditMarketReportHtml(html, { presentation: true, partialTotals: [] });
  for (const rule of ['NO_LEAK', 'G08_PROVIDER_NAME', 'WORLD_BANK_NOT_ARITHMETIC']) { const hit = gate.find(item => item.rule === rule); if (hit) assert.equal(hit.ok, true, rule); }
  assert.deepEqual(machineFailures(html), []);
});

test('automation report: no data or no drawable series changes no byte, and a drawable series needs its pre-drawn figure', async () => {
  const none = draftHtml(await presentationInput());
  assert.equal(draftHtml(await presentationInput({ worldBank: worldBank(false), comtrade: thinTrade })), draftHtml(await presentationInput({ worldBank: worldBank(false), comtrade: thinTrade }, false)));
  assert.doesNotMatch(none, /Hình 5\.3|Hình 6\.1/u);
  assert.doesNotMatch(draftHtml(await presentationInput({ worldBank: worldBank(false), comtrade: thinTrade })), /Hình 5\.3|Hình 6\.1/u);
  // Same tables, figures withdrawn: only the figures and their required interpretations differ.
  const drawnWb = draftHtml(await presentationInput({ worldBank: worldBank(true) }));
  const doc = new JSDOM(drawnWb).window.document;
  const macroFigures = [...doc.querySelectorAll('figure')].filter(figure => /Hình 5\.[34]/u.test(figure.textContent!));
  assert.equal(macroFigures.length, 2);
  for (const figure of macroFigures) assert.equal(figure.nextElementSibling?.className, 'interp');
  assert.equal(stripFigures(drawnWb, /Hình 5\.[34]/u), draftHtml(await presentationInput({ worldBank: worldBank(false) })));
});
test('automation report: a drawable series without its pre-drawn figure throws', async () => {
  const wb = await presentationInput({ worldBank: worldBank(true) }, false);
  assert.throws(() => draftHtml(wb), /WORLD_BANK_CHARTS_MISSING/u);
  const trade = await presentationInput({ comtrade: fullTrade }, false);
  assert.throws(() => draftHtml(trade), /COMTRADE_CHARTS_MISSING/u);
});

test('a Flint failure in country-background figures retains fallbacks in both renderers and passes revision checks', async t => {
  const vega = await import('vega');
  const toSVG = vega.View.prototype.toSVG;
  t.mock.method(vega.View.prototype, 'toSVG', async function (this: InstanceType<typeof vega.View>, ...args: Parameters<typeof toSVG>) {
    await this.runAsync();
    const data = this.getState({ data: () => true }).data as Record<string, Record<string, unknown>[] | null>;
    if (Object.values(data).some(rows => Array.isArray(rows) && rows.some(row => row && ('nam' in row || 'ben' in row)))) throw new Error('SYNTHETIC_MACRO_FLINT_FAILURE');
    return toSVG.apply(this, args);
  });
  const built = await reader({ worldBank: worldBank(true), comtrade: fullTrade });
  const macro = built.charts.filter(chart => /^M0[56]\.(world-bank|comtrade)/u.test(chart.id));
  assert.equal(macro.length, 4);
  for (const chart of macro) {
    assert.equal(chart.engine, 'svg-fallback', chart.id);
    assert.equal(chart.error, 'SYNTHETIC_MACRO_FLINT_FAILURE', chart.id);
  }
  for (const chart of built.charts.filter(chart => !macro.includes(chart))) assert.equal(chart.engine, 'flint', `${chart.id}: ${chart.error ?? ''}`);
  assert.doesNotThrow(() => assertFlintCharts(built.charts, true), 'revision accepts macro fallbacks');
  assert.deepEqual(machineFailures(built.html), machineFailures((await reader()).html));
  assert.equal(auditMarket14(built.html, undefined, { requireFlint: true }).find(item => item.rule === '11')!.ok, true);
  const html = draftHtml(await presentationInput({ worldBank: worldBank(true), comtrade: fullTrade }));
  for (const no of ['Hình 5.3', 'Hình 5.4', 'Hình 6.1', 'Hình 6.2']) assert.equal(figure(html, no)!.engine, 'svg-fallback');
  assert.deepEqual(machineFailures(html), []);
});

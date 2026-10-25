import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { auditMarket14, technicalLeaks } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildAutomationMarketPresentation } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { marketRawScaleSection, type MarketRawReportInput } from '../../src/modules/analysis/research-automation/market-raw-report.js';
import { readMarketRawSeries, resolveMarketRawSource } from '../../src/modules/analysis/research-automation/market-raw-series.js';
import { MarketNumberTraceCollector, type MarketNumberTrace, type MarketNumberTraceEntry } from '../../src/modules/analysis/research-automation/market-trace-map.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import zinc30 from '../fixtures/market-raw-series/zinc-30d-4platform.synthetic.raw-responses.json' with { type: 'json' };
import zinc12 from '../fixtures/market-raw-series/zinc-12m-4platform.synthetic.raw-responses.json' with { type: 'json' };
import zinc30Dev from '../fixtures/market-raw-series/zinc-30d-dev.raw-responses.json' with { type: 'json' };
import zinc12Dev from '../fixtures/market-raw-series/zinc-12m-dev.raw-responses.json' with { type: 'json' };

// P4 is builder-only. The four-platform KPI targets are synthetic canaries;
// the dev captures exercise real window shapes, not Smart-query acceptance.
const scope: MarketRawReportInput['scope'] = { keywords: ['viên uống kẽm'], smartQuery: true };
const captured = (captureId: string, raw: unknown) => ({ captureId, series: readMarketRawSeries(raw) });
const synthetic = { periods: [captured('zinc-30d', zinc30), captured('zinc-12m', zinc12)], scope };
let fixture: Promise<AutomationReportInput> | undefined;
const baseInput = () => fixture ??= fullMarket14Input();

async function reportHtml(raw = synthetic): Promise<string> {
  return buildResearchAutomationReport({ ...await baseInput(), marketRawSeries: raw }, 'MARKET').html.toString();
}

function withDocument(html: string, check: (document: Document) => void): void {
  const dom = new JSDOM(html);
  try { check(dom.window.document); } finally { dom.window.close(); }
}

// Inspect the rendered paths, not the builder's self-reported series count.
function assertB2(document: Document): void {
  const charts = [...document.querySelectorAll('figure[data-market-raw-chart]')];
  assert.deepEqual(charts.map(chart => chart.getAttribute('data-market-raw-chart')), ['weekly', 'monthly']);
  for (const chart of charts) {
    const lines = [...chart.querySelectorAll('svg polyline')];
    assert.equal(lines.length, 2, 'B2 requires two platform lines in every chart');
    assert.deepEqual(lines.map(line => line.getAttribute('data-platform')).sort(), ['shopee', 'tiktok']);
    assert.ok(lines.every(line => line.getAttribute('points')!.trim().split(/\s+/u).length >= 2));
    assert.match(chart.textContent!, /Shopee/u);
    assert.match(chart.textContent!, /TikTok Shop/u);
    assert.doesNotMatch(chart.textContent!, /Cộng 2 sàn/u);
  }
}

test('B1 raw-input report removes average prices from populated inventory and all visible sections', async () => {
  // Derive a synthetic inventory from the existing metric fixture. The old
  // reader must actually have an average-price value available to suppress.
  const source = metricFixture(), row = source.records[0]!;
  const ref = { sourceSha256: row.source.sourceSha256, fieldPointer: row.source.locator };
  const price = String(Number(row.revenue.value) / Number(row.units.value));
  const window = { start: source.scope.start, end: source.scope.end };
  const inventory = {
    temporal: { input: { frame: { members: [{ memberKey: row.listingId, platform: 'shopee' }] },
      observations: [['revenue', row.revenue.value], ['sales_volumn', row.units.value]].map(([literal, decimal]) => ({
        observationId: `capture-1-${literal}`, subjectMemberKeys: [row.listingId], retrievedAt: source.scope.acquiredAt,
        measure: { literal, unit: literal === 'revenue' ? 'VND' : null, currency: null },
        value: { decimal, literal: null }, requestedWindow: window, rawQuery: window, source: ref,
      })) } },
    quotes: { input: { quotes: [{ quoteId: 'capture-1-unit-price', acquiredAt: source.scope.acquiredAt, offerText: null,
      price: { value: price, range: null, currency: 'VND', state: 'NON_EXACT' }, source: ref }] } },
  } as unknown as NonNullable<AutomationReportInput['marketInventory']>;
  const base = await baseInput(), presentation = base.marketPresentation!;
  const input = { ...base, marketInventory: inventory,
    marketPresentation: buildAutomationMarketPresentation(presentation.binding, {
      ...presentation.input,
      rows: presentation.input.rows.map(row => ({ ...row, title: 'Viên kẽm 10 viên' })),
      // No listed-price receipt: every đồng/viên price in this fixture comes from sales arithmetic.
      unitSpec: null,
    }),
  };
  const assertNoPackPrice = (document: Document): void => {
    assert.doesNotMatch(document.body.textContent!, /(?:đồng|VND)\s*\/\s*viên/iu,
      'B1 forbids pack-size prices derived from revenue/units in every draft block');
  };
  withDocument(buildResearchAutomationReport(input, 'MARKET').html.toString(), document => {
    assert.match(document.querySelector('#M08')!.textContent!, /Giá bình quân/u, 'fixture exercises the former average-price column');
    for (const id of ['M11', 'M12']) {
      const section = document.getElementById(id);
      assert.ok(section, `unguarded draft retains ${id}`);
      assert.match(section.textContent!, /đồng\/viên/u, 'unguarded draft labels pack-size derived prices');
      assert.match(section.textContent!, /10\.000–10\.000/u, 'Shopee control divides 100,000 per sale by the ten-piece pack');
      assert.match(section.textContent!, /20\.000–20\.000/u, 'TikTok control divides 200,000 per sale by the ten-piece pack');
    }
    assert.throws(() => assertNoPackPrice(document), { name: 'AssertionError', message: /B1 forbids pack-size prices/u },
      'the same B1 assertion rejects derived prices when the raw-input guard is disabled');
  });
  withDocument(buildResearchAutomationReport({ ...input, marketRawSeries: synthetic }, 'MARKET').html.toString(), document => {
    assert.ok(document.querySelector('#M08 [data-market-prices] tbody tr'), 'inventory is still rendered');
    for (const id of ['M01', 'M04', 'M08', 'M11', 'M12']) assert.ok(document.getElementById(id), `raw-enabled draft retains ${id}`);
    assertNoPackPrice(document);
    assert.deepEqual(document.body.textContent!.match(/giá\s*(?:TB|(?:bán\s+)?trung bình|bình quân)/giu) ?? [], [],
      'B1 bans average-price labels; the existing caveat about a possible estimate is not a printed average price');
  });
  const readerInput = sync1ReaderFixture('1.4.0');
  readerInput.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const readerData = computeReaderReportData(readerInput);
  const legacy = await buildMarketReport(readerData, sync1Options);
  withDocument(legacy.html, document => {
    assert.match(document.body.textContent!, /Giá bán trung bình/iu, 'Reader control has an average price to remove');
  });
  const reader = await buildMarketReport(readerData, { ...sync1Options, withoutAveragePrice: true });
  withDocument(reader.html, document => {
    assert.deepEqual(document.body.textContent!.match(/giá\s*(?:TB|(?:bán\s+)?trung bình|bình quân)/giu) ?? [], []);
    for (const id of ['phan-1', 'phan-3', 'phan-8', 'phan-11', 'phan-12', 'phu-luc']) {
      const section = document.getElementById(id);
      assert.ok(section, `Reader retains ${id}`);
      assert.doesNotMatch(section.textContent!, /(?<![\d.])(?:100\.000|200\.000)(?![\d.])/u, `${id} must not retain the fixture's revenue/units price`);
    }
    const appendix = document.querySelector('#phu-luc table')!;
    assert.equal(appendix.querySelectorAll('tbody tr').length, 12, 'removing prices preserves the source rows');
    assert.ok([...appendix.querySelectorAll('thead th')].some(cell => cell.textContent === 'Đơn vị bán'));
  });
});

test('B2 weekly and monthly charts each retain separate Shopee and TikTok Shop series', async () => {
  const raw = { periods: [captured('zinc-30d-dev', zinc30Dev), captured('zinc-12m-dev', zinc12Dev)],
    scope: { ...scope, smartQuery: false } };
  withDocument(await reportHtml(raw), document => {
    assertB2(document);
    for (const [kind, count] of [['weekly', 6], ['monthly', 13]] as const) {
      const chart = document.querySelector(`figure[data-market-raw-chart="${kind}"]`)!;
      for (const line of chart.querySelectorAll('polyline')) assert.equal(line.getAttribute('points')!.trim().split(/\s+/u).length, count);
      const table = document.querySelector(`table[data-market-raw-intervals="${kind}"]`)!;
      assert.equal(table.querySelectorAll('tbody tr').length, count);
      assert.equal(table.querySelectorAll('tr[data-period-incomplete="true"]').length, 2);
    }
    const monthly = document.querySelector('table[data-market-raw-intervals="monthly"]')!;
    assert.match(monthly.querySelector('tbody tr:first-child td')!.textContent!, /20\/10–31\/10\/2025/u);
    assert.match(monthly.querySelector('tbody tr:last-child td')!.textContent!, /01\/10–19\/10\/2026/u);
  });
});

test('B3 trend sentences distinguish rising, falling and mixed full intervals', () => {
  for (const [values, word, partial] of [
    [[1, 2, 3, 4], 'tăng đều', 0],
    [[4, 3, 2, 1], 'giảm đều', 99],
    [[1, 3, 2, 4], 'tăng nhưng dao động', 0],
    [[4, 2, 3, 1], 'giảm nhưng dao động', 99],
    [[1, 1, 2, 3], 'tăng nhưng dao động', 0],
    [[3, 3, 2, 1], 'giảm nhưng dao động', 99],
  ] as const) {
    const raw = structuredClone(zinc30);
    const data = raw[1]!.body.data;
    assert.ok(Array.isArray(data));
    for (const platform of data) platform.order_revenue_intervals.forEach((interval, i) => {
      interval.revenue_custom_sum = (values[i] ?? partial) * 1e9;
    });
    const html = marketRawScaleSection({ periods: [captured('zinc-30d', raw)], scope }, new MarketNumberTraceCollector());
    withDocument(html, document => {
      const text = [...document.querySelectorAll('p')].map(p => p.textContent).find(text => text?.startsWith('Shopee:'));
      assert.ok(text, 'the builder emits the trend sentence');
      for (const platform of ['Shopee', 'TikTok Shop']) {
        assert.ok(text.includes(`${platform}: ${word}, từ ${values[0]},0 tỷ (21/09–27/09/2026) đến ${values[3]},0 tỷ (12/10–18/10/2026)`),
          `${platform}: ${values.join(',')} must say ${word} using only full source intervals`);
      }
    });
  }
});

test('B4 every rendered percentage identifies its metric, comparison basis and dated period', async () => {
  withDocument(await reportHtml(), document => {
    const blocks = [...document.querySelectorAll('p, td, th, .kpi')].filter(block => /\d\s*(?:%|phần trăm)/u.test(block.textContent!));
    assert.ok(blocks.length >= 10, 'both periods have percentages; this cannot pass on empty output');
    for (const block of blocks) {
      const text = block.textContent!;
      assert.match(text, /doanh thu|đơn vị bán|số sản phẩm có bán|số gian hàng có bán/u, text);
      assert.match(text, /\([^)]*(?:so với|cùng kỳ|kỳ)\s[^)]*\d{2}\/\d{2}(?:\/\d{4})?\s*(?:–|đến)\s*\d{2}\/\d{2}\/\d{4}[^)]*\)/u, text);
    }
    for (const [key, previous, current, label] of [
      ['30d', '22/08–20/09/2026', '21/09–20/10/2026', '30 ngày'],
      ['12m', '01/11/2024–31/10/2025', '01/11/2025–31/10/2026', '12 tháng'],
    ]) {
      const period = document.querySelector(`[data-market-raw-period="${key}"]`)!;
      for (const [field, metric] of [['revenue', 'doanh thu'], ['units', 'đơn vị bán'], ['products', 'số sản phẩm có bán'], ['shops', 'số gian hàng có bán']]) {
        assert.equal(period.querySelector(`[data-kpi="${field}"] .cmp-note`)!.textContent,
          `(${metric}, so với ${label} trước: ${previous})`);
      }
      const split = period.querySelector('[data-market-raw-split]')!;
      assert.equal((split.textContent!.match(/\d+%/gu) ?? []).length, 2, 'each platform has a share');
      assert.equal(split.querySelector('.cmp-note')!.textContent,
        `(tỷ lệ = doanh thu từng sàn ÷ doanh thu Cộng 2 sàn, cùng kỳ ${label}: ${current})`);
    }
  });
});

test('B5 provider names in raw scope keywords and category never leak to the report', async () => {
  const names = 'Metric Kalodata TradeInt Dami';
  for (const category of [{ chosen: names }, { chosen: null, note: names }] as const) {
    const html = await reportHtml({ ...synthetic, scope: { keywords: ['viên uống kẽm', names], smartQuery: true, category } });
    withDocument(html, document => {
      assert.doesNotMatch(document.body.textContent!, /Metric|Kalodata|TradeInt|Dami/iu);
      const scopeLine = document.querySelector('.market-capture-scope')!;
      assert.match(scopeLine.textContent!, /viên uống kẽm/u);
      assert.match(scopeLine.textContent!, /bật tìm mở rộng/u);
      assert.match(scopeLine.textContent!, /Từ khóa được giữ trong bản lưu/u);
      assert.match(scopeLine.textContent!, /Ngành được giữ trong bản lưu/u);
      assert.match(document.querySelector('.market-raw-scale')!.textContent!, /Shopee/u);
      assert.match(document.querySelector('.market-raw-scale')!.textContent!, /TikTok Shop/u);
    });
    assert.deepEqual(technicalLeaks(html), []);
    const failures = auditMarket14(html).filter(rule => rule.kind === 'machine' && !rule.ok);
    assert.deepEqual(failures, [], 'existing machine gates remain green with the raw blocks');
  }
});

test('B6 synthetic zinc KPI prints 35,0 tỷ total, 34,9 tỷ scope, 27,0 tỷ TikTok and 7,9 tỷ Shopee', async () => {
  // Deliberately make interval sums disagree with the headline aggregations.
  const raw = structuredClone(zinc30);
  const data = raw[1]!.body.data;
  assert.ok(Array.isArray(data));
  for (const platform of data) for (const interval of platform.order_revenue_intervals) interval.revenue_custom_sum = 1;
  withDocument(await reportHtml({ ...synthetic, periods: [captured('zinc-30d', raw)] }), document => {
    const period = document.querySelector('[data-market-raw-period="30d"]')!;
    assert.equal(period.querySelector('[data-kpi="revenue"] b')!.textContent, '35,0 tỷ');
    assert.equal(period.querySelector('[data-kpi="products"] b')!.textContent, '956');
    const split = period.querySelector('[data-market-raw-split]')!.textContent!;
    assert.match(split, /Shopee 7,9 tỷ/u);
    assert.match(split, /TikTok Shop 27,0 tỷ/u);
    assert.match(split, /Cộng 2 sàn 34,9 tỷ/u);
    assert.doesNotMatch(split, /Cộng 2 sàn 35,0/u);
  });
});

test('B7 a null interval remains a chart gap and replaces trend words with the fixed missing-data sentence', async () => {
  for (const fixtureRaw of [zinc30, zinc12]) {
    const raw = structuredClone(fixtureRaw);
    const data = raw[1]!.body.data;
    assert.ok(Array.isArray(data));
    for (const platform of data) platform.order_revenue_intervals.forEach((interval, i) => {
      interval.revenue_custom_sum = (i + 1) * 1e9;
      if (i === 2) Object.assign(interval, { revenue_custom_sum: null });
    });
    const period = captured('zinc-gap', raw);
    withDocument(await reportHtml({ ...synthetic, periods: [period] }), document => {
      const chart = document.querySelector('figure[data-market-raw-chart]')!;
      const table = document.querySelector('table[data-market-raw-intervals]')!;
      assert.equal(table.querySelectorAll('tbody tr').length, data[0]!.order_revenue_intervals.length);
      assert.deepEqual([...table.querySelectorAll('tbody tr:nth-child(3) td')].slice(1).map(cell => cell.textContent), ['thiếu', 'thiếu']);
      const ticks = [...chart.querySelectorAll('svg text')].filter(node => node.getAttribute('text-anchor') === 'middle');
      assert.equal(ticks.length, data[0]!.order_revenue_intervals.length, 'missing interval retains its place on the date axis');
      const gapX = Number(ticks[2]!.getAttribute('x'));
      for (const platform of ['shopee', 'tiktok']) {
        const segments = [...chart.querySelectorAll(`polyline[data-platform="${platform}"]`)];
        assert.equal(segments.length, 2, `${platform} has separate segments on either side of the gap`);
        for (const segment of segments) {
          const xs = segment.getAttribute('points')!.trim().split(/\s+/u).map(pair => Number(pair.split(',')[0]));
          assert.ok(!(Math.min(...xs) < gapX && Math.max(...xs) > gapX), 'a line cannot bridge the missing interval');
        }
        assert.ok([...chart.querySelectorAll(`circle[data-platform="${platform}"]`)].every(point => Number(point.getAttribute('cx')) !== gapX),
          'a missing value must not become a zero-valued point');
      }
      const trends = [...document.querySelectorAll('.market-raw-period p')].map(p => p.textContent!).find(text => text.startsWith('Shopee:'));
      assert.equal(trends, 'Shopee: chưa đủ dữ liệu để nhận xét xu hướng. TikTok Shop: chưa đủ dữ liệu để nhận xét xu hướng.');
      assert.doesNotMatch(trends, /tăng đều|giảm đều|tăng nhưng dao động|giảm nhưng dao động|đi ngang/u);
    });
  }
});

test('B8 a platform without intervals remains visible and labelled không có dữ liệu', async () => {
  for (const [id, key, label, column] of [[1, 'shopee', 'Shopee', 2], [8, 'tiktok', 'TikTok Shop', 3]] as const) {
    for (const missing of ['no-intervals', 'all-null'] as const) {
      const raw = structuredClone(zinc30);
      const data = raw[1]!.body.data;
      assert.ok(Array.isArray(data));
      const platform = data.find(platform => platform.platform_id === id)!;
      if (missing === 'no-intervals') platform.order_revenue_intervals = [];
      else for (const interval of platform.order_revenue_intervals) Object.assign(interval, { revenue_custom_sum: null });
      withDocument(await reportHtml({ ...synthetic, periods: [captured('zinc-missing-platform', raw)] }), document => {
        const chart = document.querySelector('figure[data-market-raw-chart="weekly"]')!;
        assert.ok([...chart.querySelectorAll('svg text')].some(text => text.textContent === `${label}: không có dữ liệu`));
        assert.equal(chart.querySelectorAll(`polyline[data-platform="${key}"], circle[data-platform="${key}"]`).length, 0);
        const table = document.querySelector('table[data-market-raw-intervals="weekly"]')!;
        assert.match(table.querySelector(`thead th:nth-child(${column})`)!.textContent!, new RegExp(label, 'u'));
        const cells = [...table.querySelectorAll(`tbody td:nth-child(${column})`)];
        assert.equal(cells.length, 5);
        assert.ok(cells.every(cell => cell.textContent === 'không có dữ liệu'), 'missing platform is neither omitted nor represented as zero');
        assert.ok([...document.querySelectorAll('.market-raw-period p')].some(p => p.textContent!.includes(`${label}: không có dữ liệu theo tuần trong kỳ này.`)));
      });
    }
  }
});

test('B9 every printed number in the touched raw blocks has a capture-bound trace entry and replayable pointer', async () => {
  const report = buildResearchAutomationReport({ ...await baseInput(), marketRawSeries: synthetic }, 'MARKET');
  const trace = (report.semantic as { marketNumberTrace?: MarketNumberTrace }).marketNumberTrace;
  assert.ok(trace?.entries.length, 'trace is stored with the report output');
  const captures = new Map<string, unknown>([['zinc-30d', zinc30], ['zinc-12m', zinc12]]);
  for (const entry of trace.entries) {
    assert.ok(entry.token.trim() && entry.blockId.trim() && entry.formula.trim());
    assert.ok(entry.kind === 'raw' || entry.kind === 'computed');
    assert.ok(entry.inputs.length > 0, `${entry.token} cannot have unbound computed inputs`);
    const expectedCapture = entry.blockId.includes('30d') ? 'zinc-30d' : 'zinc-12m';
    for (const input of entry.inputs) {
      assert.equal(input.captureId, expectedCapture, `${entry.blockId} must name the capture of its printed period`);
      assert.ok(Number.isInteger(input.responseIndex) && input.responseIndex >= 0);
      assert.match(input.jsonPath, /^\//u);
      assert.notEqual(resolveMarketRawSource(captures.get(input.captureId), input), undefined, `${entry.token}: pointer resolves in the named capture`);
    }
  }
  for (const [token, captureId, values] of [
    ['35,0 tỷ', 'zinc-30d', [7_900_000_000, 60_000_000, 40_000_000, 27_000_000_000]],
    ['380,3 tỷ', 'zinc-12m', [90_000_000_000, 3_800_000_000, 1_500_000_000, 285_000_000_000]],
    ['22/08–20/09/2026', 'zinc-30d', ['20260921', '20261020']],
    ['01/11/2024–31/10/2025', 'zinc-12m', ['20251101', '20261031']],
  ] as const) {
    const entry: MarketNumberTraceEntry | undefined = trace.entries.find(candidate => candidate.token === token);
    assert.ok(entry, `trace includes ${token}`);
    assert.ok(entry.inputs.every(input => input.captureId === captureId));
    assert.deepEqual(entry.inputs.map(input => resolveMarketRawSource(captures.get(input.captureId), input)), [...values],
      'trace inputs retain both request dates or the exact headline aggregation members');
  }
  withDocument(report.html.toString(), document => {
    const missing: string[] = [];
    for (const period of document.querySelectorAll('.market-raw-period')) {
      const key = period.getAttribute('data-market-raw-period')!;
      const remaining = trace.entries.filter(entry => entry.blockId.startsWith(`M03.${key}.`)).map(entry => entry.token);
      const content = period.cloneNode(true) as Element;
      // Exhibit and citation numbers are identifiers, separate from the data.
      content.querySelectorAll('.exn, sup.cite').forEach(node => node.remove());
      const walker = document.createTreeWalker(content, 4);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const numbers = node.textContent!.match(/\d{2}\/\d{2}(?:\/\d{4})?–\d{2}\/\d{2}\/\d{4}|\d{2}\/\d{4}|[+−-]?\d+(?:[.,]\d+)*(?:\s*(?:tỷ|triệu|nghìn|đồng|%|phần trăm))?/gu) ?? [];
        for (const number of numbers) {
          const at = remaining.indexOf(number);
          if (at < 0) missing.push(`${key}: ${number} in ${node.textContent!.trim()}`);
          else remaining.splice(at, 1);
        }
      }
    }
    assert.deepEqual(missing, [], 'B9 requires a trace entry for each printed numeric occurrence, including template numbers');
  });
});

test('B2 negative control rejects a builder keeping one summed line', () => {
  const html = marketRawScaleSection(synthetic, new MarketNumberTraceCollector());
  withDocument(html, document => {
    assertB2(document);
    for (const chart of document.querySelectorAll('figure[data-market-raw-chart]')) {
      const lines = [...chart.querySelectorAll('polyline')];
      // Same axis and scale: sum the two revenues in SVG coordinates, whose
      // zero baseline is y=214. Leave the claimed series count untouched.
      const points = lines.map(line => line.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number)));
      lines[0]!.setAttribute('points', points[0]!.map(([x, y], i) => `${x},${y! + points[1]![i]![1]! - 214}`).join(' '));
      lines[0]!.setAttribute('data-platform', 'total');
      lines[1]!.remove();
    }
    assert.throws(() => assertB2(document), { name: 'AssertionError', message: /B2 requires two platform lines/ },
      'the very same B2 assertion must reject the summed-line builder output');
  });
});

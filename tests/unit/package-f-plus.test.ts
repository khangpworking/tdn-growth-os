import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test, { after } from 'node:test';
import { JSDOM } from 'jsdom';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gWithQuoteContexts } from '../helpers/package-g-evidence-fixture.js';
import { referenceInput } from '../helpers/package-g-references-fixture.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { packageAReaderFixture } from '../helpers/package-a-reader-fixture.js';
import { gTrade } from '../helpers/package-g-evidence-fixture.js';
import { F_CLOCK, F_DUPLICATE_TITLE, F_EXPECTED, F_QUOTED_TITLE, F_SHAPES, fAdsVariants, fAfterTableMetadata, fByteInput, fInput, fRows, type FShape } from '../helpers/package-f-plus-fixture.js';
import { fAdsEvidence, fCells, fFigure, fNeedFigure, fQuotes, fSampleEvidence, fSampleTables, fText, fWithoutCites } from '../helpers/package-f-plus-observations.js';

// ===== PHASE 2 BINDING SECTION: handoff §§1–3; coordinator's accepted deviations =====
// Optional root selects clean main for the identical negative-evidence assertions.
// Named exports below predate F+; new options are ignored by main, not missing imports.
const root = process.env.F_PLUS_REPORT_ROOT ?? new URL('../../', import.meta.url).pathname;
const own = (file: string) => import(pathToFileURL(resolve(root, file)).href);
const { buildResearchAutomationReport } = await own('src/modules/analysis/research-automation/reports.ts');
const { buildMarketReport, computeReaderReportData } = await own('src/modules/analysis/reader-report/index.ts');
const { renderMarketCharts } = await own('src/modules/analysis/reader-report/market-charts.ts');
const { marketChartSource } = await own('src/modules/analysis/research-automation/market-presentation-report.ts');
const prepareCurrent = async (input: AutomationReportInput): Promise<AutomationReportInput> => {
  const { rows, ...options } = marketChartSource(input.marketPresentation!.input.rows, input.metricMethods);
  let prepared: AutomationReportInput = { ...input, marketPresentationCharts: await renderMarketCharts(rows, options) };
  if (input.marketPresentationCharts?.some(chart => chart.svg.includes('f-short-metadata'))) {
    prepared = fAfterTableMetadata(gWithQuoteContexts(prepared));
  }
  return prepared;
};
const buildCurrent = (input: AutomationReportInput) => buildResearchAutomationReport(input, 'MARKET');
const BINDING = {
  aliasMaximum: 40,
  tickMaximum: 13,
  rowReferenceHeader: /^Mã dòng$/u,
  chartReference: /(?:·\s*)?(Dòng\s+\d+|\d+)\s*$/u,
  machineReference: (platform: string, index: number) => `${platform}:${index + 1}`,
  visibleReference: (index: number) => `Dòng ${index + 1}`,
  aliasText: (label: string) => label.replace(/\s*·\s*(?:Shopee|TikTok Shop).*$/u, ''),
  figureCaption: 'figcaption,[role="heading"],.exh',
  exhibitNumber: '.exn',
  separator: ': ',
  searchTitle: 'Mức quan tâm tìm kiếm theo tuần',
  soldUnit: 'đơn vị bán',
  forcedSelector: '.sheet',
  sampleMarker: '.capture-sample[data-capture-sample="1"]',
  sampleSentence: (platform: string, count: number, products: number) =>
    `Mẫu ${platform}: n = ${count} dòng sản phẩm${products !== count ? `, gồm ${products} sản phẩm khác nhau` : ''}, lấy từ bảng kết quả tìm kiếm đã lưu, ngày 02/10/2026.`,
};
// ===== END PHASE 2 BINDING SECTION =====

type Built = { input: AutomationReportInput; html: string; trace: string | undefined; dom: JSDOM; doc: Document };
const cache = new Map<FShape, Promise<Built>>();
async function render(shape: FShape): Promise<Built> {
  let pending = cache.get(shape);
  if (!pending) {
    pending = (async () => {
      const input = await prepareCurrent(await fInput(shape)), built = buildCurrent(input);
      const html = built.html.toString(), dom = new JSDOM(html);
      return { input, html, trace: built.traceHtml?.toString(), dom, doc: dom.window.document };
    })();
    cache.set(shape, pending);
  }
  return pending;
}
after(async () => { for (const pending of cache.values()) { try { (await pending).dom.window.close(); } catch { /* A build failure has already been reported. */ } } });
const baseline = async () => JSON.parse(await readFile(new URL('../fixtures/package-f-plus-main-observations.json', import.meta.url), 'utf8'));
const audit = (html: string, trace?: string) => auditMarket14(html, trace, { requireFlint: true }).map(({ rule, kind, ok }) => ({ rule, kind, ok }));
function checks(entries: Record<string, () => void>): void {
  const failures: string[] = [];
  for (const [label, check] of Object.entries(entries)) {
    try { check(); } catch (error) { failures.push(`${label}: ${(error as Error).message}`); }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
}
function visible(node: Element): boolean { return !node.closest('template,details.evidence-trace,[hidden]'); }
function svgHeight(node: Element): number { return Number(node.querySelector('svg')!.getAttribute('viewBox')!.split(/\s+/u)[3]); }
function tickLabels(figure: Element): string[] {
  return [...figure.querySelectorAll('.role-axis-label text')].map(fText).filter(label => /\d{2}\/\d{2}\/\d{4}/u.test(label));
}
function checkWeeklyTicks(figure: Element, shape: FShape): void {
  const ticks = tickLabels(figure);
  assert.ok(ticks.length > 0 && ticks.length <= BINDING.tickMaximum, `labelled weekly ticks = ${ticks.length}; expected 1..${BINDING.tickMaximum}`);
  assert.equal(ticks[0], '21–27/09/2025');
  assert.equal(ticks.at(-1), shape === 'F1' ? '13–19/09/2026' : shape === 'F2' ? '09–15/11/2025' : '26/10–01/11/2025');
  if (shape !== 'F1') assert.equal(ticks.length, F_EXPECTED[shape].weeks, 'short series needs no thinning');
}
function checkSearchValues(figure: Element, shape: FShape): void {
  const path = figure.querySelector('.mark-line path')?.getAttribute('d');
  assert.ok(path, 'production line geometry');
  const points = [...path.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/gu)].map(match => [Number(match[1]), Number(match[2])]);
  assert.equal(points.length, F_EXPECTED[shape].weeks - 1, 'every non-null value is plotted');
  assert.equal((path.match(/M/gu) ?? []).length, shape === 'F3' ? 1 : 2, 'null week separates the line');
  for (let i = 1; i < points.length; i++) assert.ok(points[i]![0]! > points[i - 1]![0]!, 'date order');
  const indices = Array.from({ length: F_EXPECTED[shape].weeks }, (_, i) => i).filter(i => i !== 5);
  const values = indices.map(i => i === 30 ? 100 : 20 + i * 7 % 45);
  const firstX = points[0]![0]!, dx = (points[1]![0]! - firstX);
  for (let i = 0; i < points.length; i++) assert.ok(Math.abs(points[i]![0]! - firstX - indices[i]! * dx) < 0.1, 'null has its own x position');
  const low = Math.min(...values), high = Math.max(...values), yAtLow = points[values.indexOf(low)]![1]!, yAtHigh = points[values.indexOf(high)]![1]!;
  for (let i = 0; i < points.length; i++) {
    const expectedY = yAtLow + (values[i]! - low) * (yAtHigh - yAtLow) / (high - low);
    assert.ok(Math.abs(points[i]![1]! - expectedY) < 0.1, `source value at week ${indices[i]}`);
  }
  if (shape === 'F1') {
    assert.match(figure.querySelector('.mark-line path')!.getAttribute('aria-label')!, /:\s*20$/u);
    assert.ok([...figure.querySelectorAll('.role-axis-label text')].some(node => fText(node) === '100'), 'peak retains its index unit');
    assert.equal(values.indexOf(100), 29, 'peak is the 31st calendar week with one earlier null');
    assert.equal(points[29]![1], Math.min(...points.map(point => point[1]!)), 'source peak remains the highest plotted value');
  }
}
function rowReferences(table: HTMLTableElement): string[] {
  const headings = fCells(table.querySelector('thead tr')!);
  const index = headings.findIndex(heading => BINDING.rowReferenceHeader.test(heading));
  assert.ok(index >= 0, 'sample table needs a visible stable row-reference column');
  const refs = [...table.querySelectorAll('tbody tr')].map(row => fWithoutCites(row.children[index]!));
  assert.equal(new Set(refs).size, refs.length, 'references distinguish duplicate source titles');
  for (const ref of refs) assert.ok(ref.length > 0, 'reference cannot be empty');
  return refs;
}
function checkExhibits(doc: Document): void {
  for (const section of doc.querySelectorAll('#sections section.sheet')) {
    const sectionNo = section.id === 'M13' ? 'PL' : String(Number(section.id.slice(1)));
    const next = { Bảng: 1, Hình: 1 };
    for (const item of [...section.querySelectorAll('table,figure')].filter(visible)) {
      const kind = item.tagName === 'TABLE' ? 'Bảng' : 'Hình';
      const wrapper = item.tagName === 'TABLE' ? item.closest('.table-wrap,.ex') ?? item : item;
      const labels = [...wrapper.querySelectorAll(BINDING.exhibitNumber)];
      const expected = `${kind} ${sectionNo}.${next[kind]++}`;
      assert.equal(labels.length, 1, `${section.id}: ${kind} must have exactly one number`);
      assert.equal(fText(labels[0]), expected, 'numbering follows appearance, separately by type');
      assert.equal(labels[0]!.nextElementSibling?.textContent, BINDING.separator, 'literal separator after number');
      const caption = item.querySelector('caption,figcaption');
      const labelledBy = item.getAttribute('aria-labelledby');
      const accessible = caption ? fText(caption) : item.getAttribute('aria-label')
        ?? (labelledBy ? fText(doc.getElementById(labelledBy)) : '');
      assert.ok(accessible, `${expected}: accessible title required`);
      const title = fText(wrapper.querySelector('.ext'));
      if (title && caption) assert.ok(!title.includes(fText(caption)) || caption.contains(wrapper.querySelector('.ext')),
        `${expected}: heading duplicates its caption`);
    }
  }
}
function printRules(doc: Document): { selector: string; style: CSSStyleDeclaration }[] {
  const out: { selector: string; style: CSSStyleDeclaration }[] = [];
  const visit = (rules: CSSRuleList, inPrint: boolean) => {
    for (const rule of Array.from(rules)) {
      const group = rule as CSSMediaRule;
      // Modern JSDOM style rules also expose cssRules (for CSS nesting).
      // Collect their declarations before visiting grouping rules.
      if ('selectorText' in rule) {
        const styled = rule as CSSStyleRule;
        out.push({ selector: styled.selectorText, style: styled.style });
      } else if ('cssRules' in group) {
        const media = group.media?.mediaText ?? group.conditionText ?? '';
        if (!media || /print/u.test(media)) visit(group.cssRules, inPrint || /print/u.test(media));
      }
    }
  };
  for (const sheet of Array.from(doc.styleSheets)) if (sheet.cssRules) visit(sheet.cssRules, false);
  return out;
}
function property(rules: ReturnType<typeof printRules>, node: Element, name: string): string {
  let value = '';
  for (const rule of rules) {
    try { if (node.matches(rule.selector) && rule.style.getPropertyValue(name)) value = rule.style.getPropertyValue(name).trim(); } catch { /* Unsupported selector does not prove a rule applies. */ }
  }
  return value;
}
function keepCaption(doc: Document): void {
  const rules = printRules(doc);
  for (const figure of [...doc.querySelectorAll('#sections figure')].filter(visible)) {
    const caption = figure.querySelector(BINDING.figureCaption);
    assert.ok(caption, 'figure caption');
    assert.ok(/avoid/u.test(property(rules, figure, 'break-inside') || property(rules, figure, 'page-break-inside'))
      || /avoid/u.test(property(rules, caption, 'break-after') || property(rules, caption, 'page-break-after')),
    'emitted print CSS must keep figure and caption together');
  }
}
function chartValues(figure: Element, measure: RegExp): number[] {
  return [...figure.querySelectorAll('.mark-rect [aria-label]')].map(node => {
    const fields = node.getAttribute('aria-label')!.split(';').map(value => value.trim());
    const field = fields.find(value => measure.test(value));
    assert.ok(field, `plotted measure ${measure}`);
    return Number(field.slice(field.indexOf(':') + 1).trim().replace(',', '.'));
  });
}

// One table-driven case per binding-contract row and shape. All are positive
// acceptance assertions: today's defects intentionally fail against main.
const rows: { item: string; line: number; check: (shape: FShape, built: Built) => void | Promise<void> }[] = [
  { item: 'M7', line: 24, check: async (shape, { doc }) => {
    const figure = fNeedFigure(doc, 'search');
    checks({
      ticks: () => checkWeeklyTicks(figure, shape),
      values: () => checkSearchValues(figure, shape),
      unit: () => assert.ok((fText(figure.querySelector('.exh,figcaption')).match(/chỉ số tương đối/giu) ?? []).length <= 1, 'unit is stated at most once'),
      captions: () => keepCaption(doc),
      aliases: () => {
        const labels = [...fNeedFigure(doc, 'ranking').querySelectorAll('.role-axis-label text')].map(fText).filter(label => /Sản phẩm mẫu|Mẫu|Dòng/u.test(label));
        assert.ok(labels.length > 0, 'ranking retains meaningful row labels');
        if (shape === 'F1' && BINDING.aliasMaximum !== undefined) for (const label of labels) assert.ok(BINDING.aliasText(label).length <= BINDING.aliasMaximum);
        const tables = fSampleTables(doc);
        for (const row of fRows(shape)) assert.ok(tables.some(table => [...table.querySelectorAll('q,[data-quote]')].some(q => q.textContent === row.title)), 'exact title stays in evidence');
      },
      size: () => assert.ok(svgHeight(fNeedFigure(doc, 'ranking')) > 0),
    });
    if (shape === 'F1') assert.ok(svgHeight(fNeedFigure(doc, 'ranking')) > svgHeight(fNeedFigure((await render('F3')).doc, 'ranking')), 'ranking grows with row count');
  } },
  { item: 'M8', line: 25, check: async (shape, { doc }) => {
    const main = (await baseline()).shapes[shape];
    checks({
      exhibits: () => checkExhibits(doc),
      anchors: () => assert.deepEqual([...doc.querySelectorAll('#sections section[id]')].map(node => node.id), main.anchors),
      citations: () => assert.deepEqual(fSampleEvidence(doc), main.sample),
      omissions: () => {
        if (shape !== 'F1') assert.ok(![...doc.querySelectorAll('caption,.ext')].some(node => /Thương mại cả nước theo mã hàng|Quảng cáo trên công cụ tìm kiếm/u.test(fText(node))));
      },
    });
  } },
  { item: 'M9', line: 26, check: (shape, { doc }) => {
    const section = doc.getElementById('M03')!;
    const summary = [...section.querySelectorAll('p')].filter(visible);
    checks({
      bars: () => assert.equal([...section.querySelectorAll('figure')].filter(node => /Bản ghi sản phẩm|Số bản ghi trong mẫu|so_ban_ghi/u.test(fText(node) + node.innerHTML)).length, 0, 'no capture count bars'),
      counts: () => {
        for (const [p, platform] of ['Shopee', 'TikTok Shop'].entries()) {
          const count = F_EXPECTED[shape].rows[p]!;
          if (!count) continue;
          const countPattern = new RegExp(`(?:n\\s*=\\s*${count}\\b|\\b${count} (?:dòng|bản ghi))`, 'u');
          const paragraphs = summary.filter(node => fText(node).includes(platform) && countPattern.test(fText(node)) && fText(node).includes('02/10/2026'));
          assert.equal(paragraphs.length, 1, `${platform}: one row-count/capture-date sentence`);
          assert.equal(fWithoutCites(paragraphs[0]!), BINDING.sampleSentence(platform, count, F_EXPECTED[shape].products[p]!), 'exact handoff count sentence');
          if (F_EXPECTED[shape].products[p] !== count) assert.match(fText(paragraphs[0]), new RegExp(`${F_EXPECTED[shape].products[p]} sản phẩm`, 'u'));
          if (shape === 'F2' || shape === 'F1' && p === 1) assert.doesNotMatch(fText(paragraphs[0]), /\d+ gian hàng/u);
        }
      },
      partial: () => { if (shape === 'F2') assert.match(fText(section), /TikTok Shop[^.]*không[^.]*(?:mẫu|thu|lưu)|không[^.]*TikTok Shop/u); },
      meaningful: () => {
        fNeedFigure(doc, 'ranking'); fNeedFigure(doc, 'revenue');
        if (shape !== 'F2') fNeedFigure(doc, 'concentration');
      },
    });
  } },
  { item: 'M14', line: 27, check: (shape, { doc }) => {
    const figure = fNeedFigure(doc, 'ranking');
    const labels = [...figure.querySelectorAll('.role-axis-label text')].map(fText);
    assert.ok(labels.length > 0);
    const tables = fSampleTables(doc);
    for (const label of labels) {
      if (!label.includes(' · ') && !/^Dòng /u.test(label)) continue;
      const ordinal = BINDING.chartReference.exec(label)?.[1];
      if (!ordinal) continue; // Omitting ordinals is explicitly permitted by M14.
      const bar = [...figure.querySelectorAll('.mark-rect [aria-label]')].find(node => node.getAttribute('aria-label')?.includes(label));
      const platform = label.includes('TikTok Shop') || bar?.getAttribute('aria-label')?.includes('TikTok Shop') ? 'TikTok Shop' : 'Shopee';
      const table = tables.find(node => fText(node.querySelector('caption')).includes(platform) || node.getAttribute('aria-label')?.includes(platform));
      assert.ok(table, 'matching sample table');
      const bars = [...figure.querySelectorAll('.mark-rect [aria-label]')];
      const ranked = fRows(shape).sort((a, b) => b.rev! - a.rev!);
      const sourceRow = ranked[bars.indexOf(bar!)]!;
      assert.ok(sourceRow, 'ordinal belongs to a retained ranked row');
      const ownRows = fRows(shape).filter(row => row.platform === sourceRow.platform);
      const index = ownRows.findIndex(row => row.i === sourceRow.i);
      assert.equal(ordinal, rowReferences(table)[index], `chart reference ${ordinal} must identify its exact sample row`);
    }
    // Present main labels are combined source indices; this fails meaningfully
    // even when row-reference markers have not yet been implemented.
    if (shape === 'F1') assert.doesNotMatch(labels.join('\n'), /Dòng (?:42|9|74|13|106|21|147|25|184|33)\b/u);
    const bars = [...figure.querySelectorAll('.mark-rect [aria-label]')].map(node => node.getAttribute('aria-label')!);
    assert.equal(bars.length, fRows(shape).length, 'ranking values are retained');
    assert.deepEqual(chartValues(figure, /^Doanh thu/u), fRows(shape).map(row => row.rev! / 1000000).sort((a, b) => b - a));
    assert.deepEqual(chartValues(fNeedFigure(doc, 'revenue'), /^Doanh thu/u), F_EXPECTED[shape].revenue.filter(value => value > 0).map(value => value / 1000000));
  } },
  { item: 'L4', line: 28, check: async (shape, { doc }) => {
    const tables = fSampleTables(doc); assert.equal(tables.length, shape === 'F2' ? 1 : 2);
    for (const table of tables) {
      const refs = rowReferences(table);
      const platform = /TikTok Shop/u.test(fText(table.querySelector('caption')) + table.getAttribute('aria-label')) ? 'tiktok' : 'shopee';
      assert.equal(refs.length, F_EXPECTED[shape].rows[platform === 'shopee' ? 0 : 1]);
      const interpretation = table.closest('.table-wrap')?.nextElementSibling;
      if (interpretation?.matches('.interp')) for (const match of fText(interpretation).matchAll(/Dòng\s+\d+/gu)) assert.ok(refs.includes(match[0]));
      [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
        assert.equal(refs[index], BINDING.visibleReference(index));
        assert.equal(row.getAttribute('data-row-ref'), BINDING.machineReference(platform, index));
      });
      if (shape === 'F1' && platform === 'shopee') {
        const duplicates = [...table.querySelectorAll('tbody tr')].filter(row => fText(row.querySelector('q,[data-quote]')) === F_DUPLICATE_TITLE);
        assert.equal(duplicates.length, 2);
      }
    }
    assert.deepEqual(fSampleEvidence(doc), (await baseline()).shapes[shape].sample, 'rendered citation identities and title order unchanged');
  } },
  { item: 'L6', line: 29, check: (shape, { doc }) => {
    const tables = [...fSampleTables(doc), ...doc.querySelectorAll<HTMLTableElement>('#M03 table,#M08 table')]
      .filter((value, i, all) => all.indexOf(value) === i && visible(value));
    let numericColumns = 0;
    const moneyTerms = new Set<string>(), quantityTerms = new Set<string>();
    for (const table of tables) {
      const headings = fCells(table.querySelector('thead tr')!);
      headings.forEach((heading, index) => {
        if (!/Doanh thu|(?:Khoảng )?[Gg]iá|Sản lượng|Số lượng bán/u.test(heading)) return;
        numericColumns++;
        assert.match(heading, /\((?:VND|đồng|đơn vị(?: bán)?)\)/u, 'unit belongs in the column header');
        const money = heading.match(/\bVND\b|\bđồng\b/gu) ?? [], quantity = heading.match(/đơn vị(?: bán)?/gu) ?? [];
        assert.equal(money.length + quantity.length, 1, 'one unit in each numeric column header');
        money.forEach(term => moneyTerms.add(term)); quantity.forEach(term => quantityTerms.add(term));
        for (const row of table.querySelectorAll('tbody tr')) {
          const cell = row.children[index]; if (!cell) continue;
          assert.doesNotMatch(fWithoutCites(cell), /\bVND\b|\bđồng\b|đơn vị(?: bán)?/u, 'unit is not repeated in numeric cells');
        }
      });
    }
    assert.ok(numericColumns >= 2);
    assert.equal(moneyTerms.size, 1, 'one money unit term across sample, price and period tables');
    assert.equal(quantityTerms.size, 1, 'one quantity unit term across current-reader tables');
    for (const table of fSampleTables(doc)) {
      const headings = fCells(table.querySelector('thead tr')!), revenueIndex = headings.findIndex(h => /Doanh thu/u.test(h));
      const platform = /TikTok Shop/u.test(fText(table.querySelector('caption')) + table.getAttribute('aria-label')) ? 'tiktok' : 'shopee';
      const values = [...table.querySelectorAll('tbody tr')].map(row => fWithoutCites(row.children[revenueIndex]!).replace(/\s*(?:VND|đồng)$/u, ''));
      assert.deepEqual(values, fRows(shape).filter(row => row.platform === platform).map(row => row.rev!.toLocaleString('vi-VN')));
    }
    if (shape === 'F1') assert.ok([...doc.querySelectorAll('#M03 q,#M03 [data-quote]')].some(node => node.textContent === F_QUOTED_TITLE));
  } },
  { item: 'L14', line: 30, check: (_shape, { doc }) => {
    const rules = printRules(doc);
    checks({
      metadata: () => {
        const lists = [...doc.querySelectorAll('#sections dl')].filter(visible);
        assert.ok(lists.some(list => list.querySelectorAll('dt').length === 2), 'two-pair metadata after sample table');
        for (const list of lists) for (const dt of list.querySelectorAll('dt')) {
          const dd = dt.nextElementSibling;
          assert.equal(dd?.tagName, 'DD');
          const pair = dt.parentElement!;
          assert.ok(/avoid/u.test(property(rules, pair, 'break-inside') || property(rules, pair, 'page-break-inside')),
            'metadata pair or short list has an emitted keep rule');
        }
      },
      captions: () => keepCaption(doc),
      sections: () => {
        const forced = rules.filter(rule => /page|always/u.test(rule.style.getPropertyValue('break-before') || rule.style.getPropertyValue('page-break-before')));
        assert.ok(forced.every(rule => !rule.selector.split(',').some(selector => selector.trim() !== BINDING.forcedSelector)),
          'forced page starts apply only to the accepted top-level .sheet predicate');
        for (const section of doc.querySelectorAll('#sections section.sheet')) assert.doesNotMatch(property(rules, section, 'break-inside'), /avoid/u);
      },
      tables: () => {
        for (const table of fSampleTables(doc)) {
          assert.doesNotMatch(property(rules, table, 'break-inside'), /avoid/u, 'long table remains splittable');
          assert.equal(property(rules, table.querySelector('thead')!, 'display'), 'table-header-group');
        }
      },
      references: () => assert.doesNotMatch(rules.map(rule => `${rule.selector}{${rule.style.cssText}}`).join(''), /citation-register a::after[^}]*attr\(href\)/u),
    });
  } },
  { item: 'L17', line: 31, check: (shape, { doc }) => {
    const figure = fFigure(doc, 'concentration'), expected = F_EXPECTED[shape].knownShops;
    if (!expected.length) {
      assert.equal(figure, undefined);
      assert.match(fText(doc.getElementById('M04')), /không ghi gian hàng/u);
      return;
    }
    assert.ok(figure);
    const caption = fText(figure.querySelector('.ext,figcaption'));
    for (const platform of expected) assert.ok(caption.includes(platform === 'shopee' ? 'Shopee' : 'TikTok Shop'), 'title names only plotted platforms');
    const legend = [...figure.querySelectorAll('.role-legend-label text')].map(fText);
    assert.deepEqual(legend, expected.map(platform => platform === 'shopee' ? 'Shopee' : 'TikTok Shop'), 'one-series chart is labelled too');
    if (shape === 'F1') {
      assert.doesNotMatch(caption, /TikTok|từng sàn|các sàn/u);
      assert.match(fText(figure), /TikTok Shop[^.]*không ghi gian hàng/u);
    }
    const bars = [...figure.querySelectorAll('.mark-rect [aria-label]')].map(node => node.getAttribute('aria-label')!);
    assert.ok(bars.length > 0);
    assert.ok(bars.every(label => !/ty_trong: 0(?:;|$)/u.test(label)), 'no synthetic zero concentration');
    assert.deepEqual(chartValues(figure, /^Tỷ trọng/u).sort((a, b) => a - b), shape === 'F1' ? [45.6, 90.5, 100] : [75, 80]);
  } },
];
for (const row of rows) for (const shape of F_SHAPES) {
  test(`[contract ${row.line}] ${row.item} ${shape}: must hold and must still hold`, async () => row.check(shape, await render(shape)));
}

test('[contract 24b,27,28,29] exact source values, quotes, citation targets and all weekly positions are preserved', async () => {
  const main = await baseline();
  for (const shape of F_SHAPES) {
    const { doc } = await render(shape);
    checkSearchValues(fNeedFigure(doc, 'search'), shape);
    assert.deepEqual(fSampleEvidence(doc), main.shapes[shape].sample);
    assert.equal(doc.querySelector('.citation-register')?.outerHTML, main.shapes[shape].register);
    for (const table of fSampleTables(doc)) {
      const headings = fCells(table.querySelector('thead tr')!);
      const revenueIndex = headings.findIndex(h => /Doanh thu/u.test(h)), unitsIndex = headings.findIndex(h => /Sản lượng|Số lượng bán/u.test(h));
      const platform = /TikTok Shop/u.test(fText(table.querySelector('caption')) + table.getAttribute('aria-label')) ? 'tiktok' : 'shopee';
      const expected = fRows(shape).filter(row => row.platform === platform);
      [...table.querySelectorAll('tbody tr')].forEach((row, index) => {
        assert.equal(row.querySelector('q,[data-quote]')?.textContent, expected[index]!.title);
        assert.equal(fWithoutCites(row.children[revenueIndex]!).replace(/\s*(?:VND|đồng)$/u, ''), expected[index]!.rev!.toLocaleString('vi-VN'));
        assert.equal(fWithoutCites(row.children[unitsIndex]!), expected[index]!.units!.toLocaleString('vi-VN'));
      });
    }
    assert.deepEqual(chartValues(fNeedFigure(doc, 'ranking'), /^Doanh thu/u), fRows(shape).map(row => row.rev! / 1000000).sort((a, b) => b - a));
    assert.deepEqual(chartValues(fNeedFigure(doc, 'revenue'), /^Doanh thu/u), F_EXPECTED[shape].revenue.filter(value => value > 0).map(value => value / 1000000));
    if (shape !== 'F2') assert.deepEqual(chartValues(fNeedFigure(doc, 'concentration'), /^Tỷ trọng/u).sort((a, b) => a - b), shape === 'F1' ? [45.6, 90.5, 100] : [75, 80]);
  }
});

test('[contract 26d] M9 empty capture: no count bars or bare zero', async () => {
  const built = buildCurrent(await prepareCurrent(await fInput('F3', true))), dom = new JSDOM(built.html.toString());
  try {
    const section = dom.window.document.getElementById('M03')!;
    assert.match(fText(section), /[Cc]hưa có|[Kk]hông có số liệu/u);
    assert.doesNotMatch(fText(section), /(?<![\d/.])0(?![\d/.])/u);
    assert.equal([...section.querySelectorAll('figure')].filter(node => /Bản ghi sản phẩm|so_ban_ghi/u.test(node.innerHTML)).length, 0);
  } finally { dom.window.close(); }
});

test('[contract 10,17] all 14-rule results equal main and all machine rules pass for F1/F2/F3', async () => {
  const main = await baseline();
  for (const shape of F_SHAPES) {
    const built = await render(shape);
    assert.deepEqual(audit(built.html, built.trace), main.shapes[shape].audit, shape);
    assertMarket14MachineRules(built.html, built.trace, { requireFlint: true });
  }
});

test('[contract 3,27] G search-ads regression: five states and selection note unchanged from main', async () => {
  const main = await baseline();
  const variants = await fAdsVariants();
  for (const [index, input] of variants.entries()) {
    const dom = new JSDOM(buildCurrent(await prepareCurrent(input)).html.toString());
    try { assert.deepEqual(fAdsEvidence(dom.window.document), main.ads[index]); } finally { dom.window.close(); }
  }
});

test('[contract 15,40] G quote regression: exact q/blockquote/data-quote/authored/SVG bytes stay identical', async () => {
  const { dom, doc } = await render('F1');
  assert.deepEqual(fQuotes(dom), (await baseline()).shapes.F1.quotes);
  for (const id of ['g-q', 'g-block', 'g-data', 'g-nested']) assert.equal(doc.getElementById(id)!.querySelectorAll('.pi').length, 0);
  assert.ok(doc.getElementById('g-authored')!.querySelector('.pi'));
  assert.ok([...doc.querySelectorAll('q,[data-quote]')].some(node => node.textContent === F_QUOTED_TITLE));
});

test('[contract 7,25] forced SVG fallback chart bytes remain identical on all shapes', async () => {
  const main = await baseline();
  for (const shape of F_SHAPES) {
    const input = await fInput(shape), raw = sync1ReaderFixture('1.4.0');
    raw.rows = fRows(shape);
    raw.platforms = [...new Set(raw.rows.map(row => row.platform))] as typeof raw.platforms;
    raw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
    const dom = new JSDOM((await buildMarketReport(computeReaderReportData(raw), {
      builtOn: '19/10/2026', limitations: [], flint: false, searchInterest: input.collection!.searchInterest!,
    })).html);
    try {
      for (const kind of ['ranking', 'revenue', 'concentration', 'search'] as const) {
        assert.equal(fFigure(dom.window.document, kind)?.querySelector('svg')?.outerHTML ?? null, main.shapes[shape].fallbackSvg[kind], `${shape} ${kind}`);
      }
    } finally { dom.window.close(); }
  }
});

for (const [name, kind] of [['legacy-market', 'MARKET'], ['insight', 'INSIGHT']] as const) {
  test(`[contract 6,7] ${name} public-builder byte baseline`, async t => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.parse(F_CLOCK) });
    assert.deepEqual(buildResearchAutomationReport(await fByteInput(), kind).html,
      await readFile(new URL(`../fixtures/package-f-plus-${name}.html`, import.meta.url)));
  });
}
test('[contract 6,7] versioned market-template public-builder byte baseline', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(F_CLOCK) });
  const raw = sync1ReaderFixture('1.4.0'); raw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const built = await buildMarketReport(computeReaderReportData(raw), {
    limitations: ['Nguồn bán hàng là số ước tính.'], builtOn: '19/10/2026', flint: false, comtrade: gTrade('G1'),
  });
  assert.deepEqual(Buffer.from(built.html), await readFile(new URL('../fixtures/package-f-plus-versioned-market.html', import.meta.url)));
  // The existing A synthetic projection is also exercised, without inventing a new capture input.
  const projection = JSON.parse((await packageAReaderFixture('automation-metric-capture-v2')).readerJson);
  assert.equal(projection.rows.length, 4);
});

test('[contract 24a] negative control: restoring main production weekly labels trips M7', async () => {
  const built = await render('F1'), dom = new JSDOM(built.html);
  try {
    const figure = fNeedFigure(dom.window.document, 'search');
    figure.querySelector('svg')!.outerHTML = (await baseline()).shapes.F1.mainSearchSvg;
    assert.throws(() => checkWeeklyTicks(figure, 'F1'), /labelled weekly ticks = 52/u,
      'negative control restores the real main chart defect, not a missing import');
  } finally { dom.window.close(); }
});

// Coordinator: non-capture rows keep their old labels. This uses full rendered reports.
test('[contract 7,27] non-capture presentation labels retain main form and capture references stay scoped', async () => {
  const input = await fInput('F3', false, true);
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const prepared = await prepareCurrent({ ...input, metricMethods });
  const doc = new JSDOM(buildCurrent(prepared).html.toString());
  try {
    const labels = [...fNeedFigure(doc.window.document, 'ranking').querySelectorAll('.role-axis-label text')].map(fText);
    assert.deepEqual(labels.filter(label => /^Dòng /u.test(label)), fRows('F3').map(row => `Dòng ${row.i + 1}`));
    assert.equal(doc.window.document.querySelectorAll('tr[data-row-ref]').length, 0);
  } finally { doc.window.close(); }
});

test('[contract 6,25,30] G-references fixture keeps source identities and the cover through numbering', async () => {
  const input = await referenceInput('Q1'), built = buildCurrent(input), dom = new JSDOM(built.html.toString());
  try {
    const doc = dom.window.document;
    assert.ok(doc.querySelector('.cover'));
    assert.ok(doc.querySelectorAll('.citation-register li').length >= 3);
    checkExhibits(doc);
    keepCaption(doc);
  } finally { dom.window.close(); }
});

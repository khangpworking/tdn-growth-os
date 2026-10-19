import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import { JSDOM } from 'jsdom';
import { F_CLOCK, F_SHAPES, fAdsVariants, fAfterTableMetadata, fInput, fRows } from './package-f-plus-fixture.js';
import { fAdsEvidence, fFigure, fQuotes, fSampleEvidence } from './package-f-plus-observations.js';

// Usage: node --import tsx tests/helpers/package-f-plus-baselines.ts CHECKOUT OUTPUT_DIRECTORY
// Public builders AND chart dependencies are imported from CHECKOUT. Never edit it.
const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error('Expected checkout and output directory');
const own = (file: string) => import(pathToFileURL(resolve(checkout, file)).href);
const { buildResearchAutomationReport } = await own('src/modules/analysis/research-automation/reports.ts');
const { buildMarketReport, computeReaderReportData } = await own('src/modules/analysis/reader-report/index.ts');
const { renderMarketCharts, renderSearchInterestChart } = await own('src/modules/analysis/reader-report/market-charts.ts');
const { marketChartSource } = await own('src/modules/analysis/research-automation/market-presentation-report.ts');
const { auditMarket14 } = await own('src/modules/analysis/research-automation/market-14-rules.ts');
const { searchInterestChartPoints } = await own('src/modules/analysis/research-automation/search-interest.ts');
const { sync1ReaderFixture } = await own('tests/helpers/sync1-reader-fixture.ts');
const { DEFAULT_MARKET_PEER_RULE } = await own('src/modules/analysis/default-market-peers.ts');
const { gTrade, gByteInput, gWithQuoteContexts } = await own('tests/helpers/package-g-evidence-fixture.ts');
await mkdir(output, { recursive: true });
const save = async (name: string, bytes: Uint8Array | string) => {
  const value = Buffer.from(bytes);
  await writeFile(resolve(output, name), value);
  console.log(`${name} ${value.length} ${createHash('sha256').update(value).digest('hex')}`);
};
mock.timers.enable({ apis: ['Date'], now: Date.parse(F_CLOCK) });
try {
  const raw = sync1ReaderFixture('1.4.0'); raw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const versioned = await buildMarketReport(computeReaderReportData(raw), {
    limitations: ['Nguồn bán hàng là số ước tính.'], builtOn: '19/10/2026', flint: false, comtrade: gTrade('G1'),
  });
  await save('package-f-plus-legacy-market.html', buildResearchAutomationReport(await gByteInput(), 'MARKET').html);
  await save('package-f-plus-versioned-market.html', versioned.html);
  await save('package-f-plus-insight.html', buildResearchAutomationReport(await gByteInput(), 'INSIGHT').html);
  const observations: Record<string, unknown> = {};
  for (const shape of F_SHAPES) {
    const original = await fInput(shape);
    // Force main's own chart code even if this generator is rerun after phase 2.
    let input: typeof original = { ...original, marketPresentationCharts: await renderMarketCharts(marketChartSource(original.marketPresentation!.input.rows, original.metricMethods).rows),
      searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(original.collection!.searchInterest!)) };
    if (shape === 'F1') input = fAfterTableMetadata(gWithQuoteContexts(input));
    const built = buildResearchAutomationReport(input, 'MARKET'), dom = new JSDOM(built.html.toString());
    // The automation builder mandates production charts. Its versioned public
    // template is the existing supported forced-fallback seam; never relabel an engine.
    const fallbackRaw = sync1ReaderFixture('1.4.0');
    fallbackRaw.rows = fRows(shape);
    fallbackRaw.platforms = [...new Set(fallbackRaw.rows.map((row: { platform: string }) => row.platform))] as typeof fallbackRaw.platforms;
    fallbackRaw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
    const fallback = new JSDOM((await buildMarketReport(computeReaderReportData(fallbackRaw), {
      builtOn: '19/10/2026', limitations: [], flint: false, searchInterest: input.collection!.searchInterest,
    })).html);
    try {
      observations[shape] = {
        audit: auditMarket14(built.html.toString(), built.traceHtml?.toString(), { requireFlint: true })
          .map(({ rule, kind, ok }: { rule: string; kind: string; ok: boolean }) => ({ rule, kind, ok })),
        sample: fSampleEvidence(dom.window.document),
        anchors: [...dom.window.document.querySelectorAll('#sections section[id]')].map(node => node.id),
        register: dom.window.document.querySelector('.citation-register')?.outerHTML,
        fallbackSvg: Object.fromEntries(['ranking', 'revenue', 'concentration', 'search'].map(kind =>
          [kind, fFigure(fallback.window.document, kind as Parameters<typeof fFigure>[1])?.querySelector('svg')?.outerHTML ?? null])),
        ...(shape === 'F1' ? { quotes: fQuotes(dom), mainSearchSvg: fFigure(dom.window.document, 'search')?.querySelector('svg')?.outerHTML } : {}),
      };
    } finally { dom.window.close(); fallback.window.close(); }
  }
  const ads = [];
  for (const input of await fAdsVariants()) {
    const dom = new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString());
    try { ads.push(fAdsEvidence(dom.window.document)); } finally { dom.window.close(); }
  }
  await save('package-f-plus-main-observations.json', JSON.stringify({ shapes: observations, ads }, null, 2) + '\n');
} finally { mock.timers.reset(); }

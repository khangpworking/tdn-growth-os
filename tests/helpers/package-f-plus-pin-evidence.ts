// Pin evidence only: exact synthetic inventory recipe reused from market-price-reader.
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import { JSDOM } from 'jsdom';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
const hash = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const labels = new Map(Array.from({ length: 8 }, (_, i) => [`detail:p${i + 1}`, i === 0 ? 'Quạt <mẫu> & A' : `Quạt mẫu ${i + 1}`]));
const context = { platforms: new Map([...labels.keys()].map((key, i) => [key, i === 4 ? 'shopee' : 'tiktok'])) };

function inventory(): AutomationMarketMethodSnapshot {
  const requestedWindow = { start: '2026-09-12', end: '2026-10-11' };
  const rawQuery = { start: '2026-08-01', end: '2026-08-30' };
  const captures = [
    { n: 30, p: 1, at: '2026-09-01', value: '100000', range: ['90000', '110000'] },
    { n: 2, p: 1, at: '2026-09-02', value: '391777', range: ['350000', '450000'] },
    { n: 3, p: 2, at: '2026-09-02', value: '0', range: ['100000', '200000'] },
    { n: 4, p: 3, at: '2026-09-02', value: null, range: null },
    { n: 5, p: 4, at: '2026-09-02', value: '391777', range: ['374467', '374467'] },
    { n: 6, p: 5, at: '2026-09-02', value: '391777', range: ['100000', '200000'] },
    { n: 7, p: 6, at: '2026-09-02', value: '90000', range: ['0', '100000'] },
    { n: 8, p: 7, at: '2026-09-01', value: '52000', range: null },
    { n: 9, p: 7, at: '2026-09-02', value: '0', range: null },
    { n: 10, p: 8, at: '2026-09-02', value: '0.1', range: ['0.1', '0.2'] },
  ];
  const source = (n: number, fieldPointer = '/data') => ({ sourceSha256: hash(`synthetic capture ${n}`), fieldPointer });
  return {
    temporal: { input: { frame: { members: [...labels.keys()].map(memberKey => ({ memberKey })) }, observations: captures.flatMap(row => [
      { observationId: `capture-${row.n}-revenue`, subjectMemberKeys: [`detail:p${row.p}`], retrievedAt: `${row.at}T00:00:00Z`, measure: { literal: 'revenue', unit: 'VND', currency: 'VND' }, value: { decimal: row.value === '0' ? '0' : '123456789', literal: null }, requestedWindow, rawQuery, source: source(row.n, '/data/revenue') },
      { observationId: `capture-${row.n}-sales_volumn`, subjectMemberKeys: [`detail:p${row.p}`], retrievedAt: `${row.at}T00:00:00Z`, measure: { literal: 'sales_volumn', unit: null, currency: null }, value: { decimal: row.value === '0' ? '0' : '25', literal: null }, requestedWindow, rawQuery, source: source(row.n, '/data/sales_volumn') },
    ]) } },
    quotes: { input: { quotes: captures.flatMap(row => {
      const base = { quoteId: `capture-${row.n}-unit-price`, acquiredAt: `${row.at}T00:00:00Z`, offerText: null,
        price: { value: row.value, range: null, currency: 'VND', state: row.value === null ? 'UNREADABLE' : 'NON_EXACT' }, source: source(row.n) };
      return [base, ...(row.range ? [{ ...base, quoteId: `capture-${row.n}-price-range`, price: { ...base.price, value: null, range: { minimum: row.range[0], maximum: row.range[1] }, state: 'RANGE' } }] : [])];
    }) } },
  } as unknown as AutomationMarketMethodSnapshot;
}


// Usage: node --import tsx tests/helpers/package-f-plus-pin-evidence.ts CHECKOUT OUTPUT
// Each builder and input helper comes from CHECKOUT; output is outside both checkouts.
const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error('CHECKOUT and OUTPUT required');
const own = (file: string) => import(pathToFileURL(resolve(checkout, file)).href);
const { buildResearchAutomationReport: build } = await own('src/modules/analysis/research-automation/reports.ts');
const { fullMarket14Input } = await own('tests/helpers/market14-full-fixture.ts');
const { filteredEmptyHeadlineInput } = await own('tests/helpers/market-headline-fixture.ts');
const { periodByteCases } = await own('tests/helpers/package-e-period-fixture.ts');
const { builderControlNames, footerBuilderControl } = await own('tests/helpers/package-r-reader-footer-fixture.ts');
const { CAPTURE_ROW_PROFILE_V2 } = await own('src/modules/analysis/research-automation/capture-row-quality.ts');
await mkdir(output, { recursive: true });
const manifest: Record<string, { html: string; trace: string | null; bytes: number }> = {};
const save = async (name: string, report: { html: Buffer; traceHtml?: Buffer }) => {
  await writeFile(resolve(output, `${name}.html`), report.html);
  if (report.traceHtml) await writeFile(resolve(output, `${name}.trace.html`), report.traceHtml);
  manifest[name] = { html: hash(report.html), trace: report.traceHtml ? hash(report.traceHtml) : null, bytes: report.html.length };
};
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00.000Z') });
try {
  const input = await fullMarket14Input();
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const noCapture = { ...input, metricMethods };
  await save('full', build(input, 'MARKET'));
  await save('no-capture', build(noCapture, 'MARKET'));
  for (const [name, value, section] of [['fragment-full-m03', input, 'M03'], ['fragment-no-capture-m04', noCapture, 'M04']] as const) {
    const dom = new JSDOM(build(value, 'MARKET').html.toString());
    try { await save(name, { html: Buffer.from(dom.window.document.getElementById(section)!.outerHTML) }); } finally { dom.window.close(); }
  }
  for (const [name, value] of [['full', input], ['no-capture', noCapture]] as const) {
    const built = build(value, 'MARKET');
    await save(`${name}-badge-control`, { html: Buffer.from(built.html.toString().replace('<span class="state">Có giá tham khảo, chưa xác minh</span>', '<span class="state">Có số liệu</span>')) });
  }
  await save('no-figure', build(filteredEmptyHeadlineInput(input), 'MARKET'));
  const snapshot = inventory();
  const priceTestSource = await readFile(resolve(checkout, 'tests/unit/market-price-reader.test.ts'), 'utf8');
  const provider = /productCards: \[\.\.\.labels\]\.map[^\n]*provider: '([^']+)'/u.exec(priceTestSource)?.[1];
  if (!provider) throw new Error('Exact retained price-pin recipe not located');
  await save('price-inventory', build({ ...input, marketInventory: snapshot, marketPresentation: { ...input.marketPresentation!, unitPrices: [] },
    collection: { ...input.collection!, productCards: [...labels].map(([productId, title]) => ({ productId, title, provider })) } }, 'MARKET'));
  for (const [name, policy] of [['capture-policy-v1', undefined], ['capture-policy-v2', CAPTURE_ROW_PROFILE_V2]] as const) {
    const methods = { ...input.metricMethods!, capture: { ...input.metricMethods!.capture!, ...(policy ? { rowPolicyVersion: policy } : {}),
      excludedRows: [{ platform: 'shopee', reason: 'NOT_MAIN_PRODUCT', rowIndex: 0, listingId: 'synthetic-excluded', title: 'Synthetic part', shop: 'Gian hàng mẫu', revenue: null, units: null }] } };
    await save(name, build({ ...input, metricMethods: methods }, 'MARKET'));
  }
  for (const control of periodByteCases(input)) await save(`period-${control.name}`, build(control.input, control.kind));
  for (const name of builderControlNames) {
    const { input: control, kind } = await footerBuilderControl(name);
    await save(`footer-${name}`, build(control, kind));
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`${Object.keys(manifest).length} named HTML/trace controls saved`);
} finally { mock.timers.reset(); }

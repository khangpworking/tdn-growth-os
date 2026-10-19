import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { filteredEmptyHeadlineInput } from '../helpers/market-headline-fixture.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

// Original controls computed independently on main at edfcfc98, Node 24.15.0.
// Package D updates only the two affected market14 html/trace pairs; every
// legacy and Insight control keeps its original independently pinned bytes.
// R updates only current Market copy: M6/M10/M17 and L5/L7/L8/L9/L12/L13.
const baseline = JSON.parse(readFileSync(new URL('../fixtures/market-headline-main-hashes.json', import.meta.url), 'utf8')) as
  Record<string, { html: string; semantic: string; trace: string | null }>;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
let fixture: Promise<AutomationReportInput> | undefined;

for (const [name, kind] of [
  ['capture-market', 'MARKET'], ['capture-insight', 'INSIGHT'],
  ['no-capture-market', 'MARKET'], ['no-capture-insight', 'INSIGHT'],
  ['no-figure-4.1-market', 'MARKET'],
  ['legacy-capture-market', 'MARKET'], ['legacy-capture-insight', 'INSIGHT'],
  ['legacy-no-capture-market', 'MARKET'], ['legacy-no-capture-insight', 'INSIGHT'],
] as const) test(`package C byte control: ${name}${name === 'capture-market' ? ' semantic' : ' html, semantic and trace'}`, async () => {
  const input = await (fixture ??= fullMarket14Input());
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const { marketPresentation: _presentation, ...legacy } = input;
  let value = name.startsWith('legacy-') ? legacy : input;
  if (name.includes('no-capture')) value = { ...value, metricMethods };
  if (name === 'no-figure-4.1-market') value = filteredEmptyHeadlineInput(input);
  const report = buildResearchAutomationReport(value, kind), expected = baseline[name]!;
  assert.equal(hash(canonicalJson(report.semantic)), expected.semantic, 'reviewed current copy or frozen historical semantic bytes');
  if (name !== 'capture-market') {
    assert.equal(hash(report.html), expected.html, 'retained reader bytes, including package D market14 badges');
    assert.equal(report.traceHtml ? hash(report.traceHtml) : null, expected.trace, 'trace identity, including absence');
  }
  if (name === 'no-figure-4.1-market') {
    const dom = new JSDOM(report.html.toString());
    try {
      const section = dom.window.document.querySelector('#M01')!;
      assert.equal(section.querySelector('[data-market-headline="1"]'), null);
      assert.equal(section.querySelector('.state')!.textContent, 'Chưa đủ dữ liệu');
      assert.doesNotMatch(dom.window.document.querySelector('#M04')!.textContent!, /Hình 4\.1/u);
      assert.doesNotMatch(section.textContent!, /Ba phương án ở Phần 12/u);
    } finally { dom.window.close(); }
  }
});

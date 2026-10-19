import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { plainM09ControlInput } from '../helpers/market-section-badges-fixture.js';

// Independently computed on the feature's parent 82459bb9, Node 24.15.0.
// These controls must never be re-pinned for package D.
const baseline = JSON.parse(readFileSync(new URL('../fixtures/market-section-badges-main-hashes.json', import.meta.url), 'utf8')) as
  Record<string, { html: string; semantic: string; trace: string | null }>;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
let fixture: ReturnType<typeof fullMarket14Input> | undefined;

for (const name of ['legacy-market', 'insight', 'market14', 'plain-m09'] as const) test(`package D byte control: ${name}`, async () => {
  const input = await (fixture ??= fullMarket14Input());
  const { marketPresentation: _presentation, ...legacy } = input;
  const value = name === 'legacy-market' ? legacy : name === 'plain-m09' ? await plainM09ControlInput() : input;
  const report = buildResearchAutomationReport(value, name === 'insight' ? 'INSIGHT' : 'MARKET');
  const expected = baseline[name]!;
  assert.equal(hash(canonicalJson(report.semantic)), expected.semantic, 'semantic JSON retains parent bytes');
  if (name !== 'market14') {
    assert.equal(hash(report.html), expected.html, 'reader HTML retains parent bytes');
    assert.equal(report.traceHtml ? hash(report.traceHtml) : null, expected.trace, 'trace identity includes absence');
    assert.doesNotMatch(report.html.toString(), /data-exhibit-scope="national"|data-section-gap="1"/u);
  }
  if (name === 'plain-m09') {
    const dom = new JSDOM(report.html.toString());
    try {
      const events = dom.window.document.querySelector('#M09')!;
      assert.equal(events.querySelector('caption')!.textContent, 'Sự kiện trong kỳ do nguồn nêu');
      assert.deepEqual([...events.querySelectorAll('thead th')].map(node => node.textContent), ['Sản phẩm', 'Sự kiện', 'Ngày', 'Nguồn']);
      assert.ok(events.textContent!.includes('Đã lược bỏ các sự kiện có ngày trước hoặc sau kỳ báo cáo.'));
      assert.doesNotMatch(events.textContent!, /Các dòng trong bảng chỉ là ngày ra mắt/u);
    } finally { dom.window.close(); }
  }
});

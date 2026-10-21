import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { describeDescriptiveSection } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { reportVisibleText } from '../helpers/report-visible-text.js';

const M04_POINTER = 'Danh sách sản phẩm và số liệu của từng sàn nằm ở Phần 3; phần này không in lại.';
const M05_POINTER = 'Số liệu bán từng kỳ của các sản phẩm được chọn nằm ở Phần 3; phần này không in lại.';
const M13_POINTER = 'Phạm vi, kỳ số liệu và điều kiện của mẫu ghi ở Phần 2.';
const M04_READING = 'Cơ cấu doanh thu của mẫu đã lưu theo từ khóa, đọc riêng từng sàn; chưa phân loại thành thị trường.';
const M13_READING = 'Dấu vết nguồn, kết quả tìm kiếm đã lưu và tài liệu tham khảo của lượt này.';
const OLD_READING = 'Phạm vi yêu cầu, độ phủ thực tế và dấu vết nguồn của lượt này. Không thay thế phương pháp tính chuyên biệt của từng mục.';
const citations = { mark: () => '[1]' };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const count = (value: string, sentence: string) => value.split(sentence).length - 1;
const section = (document: Document, id: string) => {
  const node = document.getElementById(id);
  assert.ok(node, id);
  return node;
};
const methodSection = (report: ReturnType<typeof buildResearchAutomationReport>, id = 'M05') => {
  const semantic = report.semantic as { sections: { sectionId: string; state: string; methodOutput?: unknown }[] };
  const found = semantic.sections.find(row => row.sectionId === id);
  assert.ok(found, id);
  return found;
};

// Only the inventory renderer's inputs are needed, as in market-price-reader.
// Reuse the full fixture's source observations rather than inventing another dataset.
function withInventory(input: AutomationReportInput): AutomationReportInput {
  const rows = input.descriptiveMethods!.input.m05;
  const marketInventory = {
    temporal: { input: { observations: rows.map((row, index) => ({
      observationId: `capture-${index + 1}-sales`, subjectMemberKeys: [`detail:p${index + 1}`],
      measure: { literal: row.measureLiteral, unit: row.unit, currency: null },
      value: { decimal: row.observation.value, literal: row.sourceWording },
      requestedWindow: { start: row.period!.start, end: row.period!.end },
      source: { sourceSha256: row.source.sourceSha256, fieldPointer: row.source.locator },
    })) } }, quotes: { input: { quotes: [{ quoteId: 'capture-1-unit-price',
      identity: { platform: 'SHOPEE' },
      price: { value: rows[0]!.observation.value, range: null, currency: 'VND', state: 'NON_EXACT' },
      source: { sourceSha256: rows[0]!.source.sourceSha256, fieldPointer: rows[0]!.source.locator },
    }] } },
  } as unknown as AutomationMarketMethodSnapshot;
  return { ...input, marketInventory };
}

test('M04 capture reader points to Phần 3 while M03 retains its exact per-platform tables', async () => {
  const input = await fullMarket14Input(), retained = canonicalJson(input);
  const dom = new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString());
  try {
    const m04 = section(dom.window.document, 'M04'), m03 = section(dom.window.document, 'M03');
    assert.equal(count(m04.textContent!, M04_POINTER), 1);
    assert.equal(m04.querySelector('.section-reading')!.textContent, M04_READING);
    // M10: zero tables pinned the missing breakdown; retain the inventory pointer.
    assert.equal(m04.querySelectorAll('table').length, 2);
    assert.equal(m04.querySelectorAll('table[data-market-price-bands="true"]').length, 2);
    assert.deepEqual([...m04.querySelectorAll('table[data-market-price-bands]')].map(table => table.getAttribute('data-platform')), ['shopee', 'tiktok']);
    assert.doesNotMatch(m04.textContent!, /cơ cấu trong bảng kết quả đã lưu|Synthetic L1/iu);
    const captions = [...m03.querySelectorAll('table caption')].map(node => node.textContent!);
    assert.ok(captions.some(value => value.includes('Shopee')));
    assert.ok(captions.some(value => value.includes('TikTok Shop')));
    assert.match(m03.textContent!, /Synthetic L1/u);
    // R L5/L7/L8 change current method copy; retained per-platform rows stay asserted above.
    assert.equal(hash(m03.outerHTML), 'ed57c19617d79bf8d070b452d70473d9a81194b54695dd53018b212e76ebfbf7');
  } finally { dom.window.close(); }
  assert.equal(canonicalJson(input), retained);
});

test('M04 negative controls retain legacy capture bytes and the reader without capture retains tables', async () => {
  const input = await fullMarket14Input();
  const { marketPresentation: _presentation, ...legacy } = input;
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  for (const [value, isLegacy] of [[legacy, true], [{ ...input, metricMethods }, false]] as const) {
    const dom = new JSDOM(buildResearchAutomationReport(value, 'MARKET').html.toString());
    try {
      const m04 = section(dom.window.document, 'M04');
      assert.ok(m04.querySelector('table'));
      assert.ok(!m04.textContent!.includes(M04_POINTER));
      assert.notEqual(m04.querySelector('.section-reading')!.textContent, M04_READING);
      if (isLegacy) {
        assert.match(m04.textContent!, /cơ cấu trong bảng kết quả đã lưu/iu);
        assert.match(m04.textContent!, /Synthetic L1/u);
        assert.equal(hash(m04.outerHTML), '72224d428e028b18fffbb3a179a24ba3eb16273a10e220178dd3b72223484f4d');
      } else {
        // G-references general report-text rule spells out percentages and zero in the current reader.
        assert.equal(hash(m04.outerHTML), '4190e8bd195af9b95c570d1598b95842ff3642332391ab327b02cb4a5dfa2c47');
      }
    } finally { dom.window.close(); }
  }
});

test('M05 pointer requires inventory rows in M03, including both metric failure branches', async () => {
  const original = await fullMarket14Input(), inventory = withInventory(original);
  const { metricMethods: _methods, ...noMethods } = inventory;
  const failure = 'METRIC_METHOD_FAILED' as const;
  for (const [label, input, pointer] of [
    ['inventory and metric', inventory, true],
    ['inventory without metric', noMethods, true],
    ['retained metric despite failure', { ...inventory, metricMethodsFailure: failure }, true],
    ['no inventory', original, false],
    ['failed metric without retained method', { ...noMethods, metricMethodsFailure: failure }, false],
  ] as const) {
    const report = buildResearchAutomationReport(input, 'MARKET');
    const dom = new JSDOM(report.html.toString());
    try {
      const m05 = section(dom.window.document, 'M05');
      assert.equal(m05.textContent!.includes(M05_POINTER), pointer, label);
      const periodTables = [...m05.querySelectorAll('table')].filter(table => table.querySelector('caption .ext')?.textContent === 'Lượt tìm kiếm (lượt tìm kiếm)' || table.querySelector('caption')?.textContent === 'Lượt tìm kiếm (lượt tìm kiếm)');
      assert.equal(periodTables.length, pointer ? 0 : 1, label);
      assert.equal(methodSection(report).state, 'METHOD_OUTPUT', label);
      assert.deepEqual(methodSection(report).methodOutput,
        methodSection(buildResearchAutomationReport(original, 'MARKET')).methodOutput, label);
      if (pointer) assert.match(section(dom.window.document, 'M03').textContent!, /Số liệu theo từng kỳ đo/u);
    } finally { dom.window.close(); }
  }
});

test('M05 pointer preserves usable state, method evidence, notes and legacy bytes for zero, missing, unknown and empty rows', async () => {
  const input = withInventory(await fullMarket14Input()), original = input.descriptiveMethods!;
  for (const state of ['observed_value', 'observed_zero', 'missing', 'UNKNOWN', 'empty'] as const) {
    const methods = buildDescriptiveMarketMethods({ ...original.input,
      m05: state === 'empty' ? [] : original.input.m05.map(row => ({ ...row,
        observation: { ...row.observation, state, value: state === 'observed_value' ? '12' : state === 'observed_zero' ? '0' : null },
      })),
    }, { methodVersion: '1.1.0' }).output;
    const retained = canonicalJson(methods);
    const normal = describeDescriptiveSection(methods, 'M05', citations, true);
    const pointed = describeDescriptiveSection(methods, 'M05', citations, true, { periodRowsInM03: true });
    const { html: _normalHtml, ...normalEvidence } = normal;
    const { html: _pointedHtml, ...pointedEvidence } = pointed;
    assert.deepEqual(pointedEvidence, normalEvidence, state);
    const usable = state === 'observed_value' || state === 'observed_zero';
    assert.equal(pointed.usable, usable, state);
    assert.equal(pointed.html.includes(M05_POINTER), state !== 'empty', state);
    assert.ok(!pointed.html.includes('<table'), state);
    if (state !== 'empty') {
      const a = new JSDOM(normal.html), b = new JSDOM(pointed.html);
      try {
        const notes = (document: Document) => [...document.querySelectorAll('.sec-note')].map(node => node.textContent);
        assert.deepEqual(notes(b.window.document), notes(a.window.document).filter(note => note !== 'Không cộng các dòng với nhau.'));
        assert.match(pointed.html, /Nhu cầu, đo bằng doanh số/u);
      } finally { a.window.close(); b.window.close(); }
    } else assert.equal(pointed.html, normal.html);
    const report = buildResearchAutomationReport({ ...input, descriptiveMethods: methods }, 'MARKET');
    assert.equal(methodSection(report).state, usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', state);
    const { marketInventory: _inventory, ...withoutInventory } = input;
    assert.deepEqual(methodSection(report).methodOutput,
      methodSection(buildResearchAutomationReport({ ...withoutInventory, descriptiveMethods: methods }, 'MARKET')).methodOutput, state);
    // Direct legacy negative control: the flag is ignored unless readerPlainText is true.
    assert.deepEqual(describeDescriptiveSection(methods, 'M05', citations, false, { periodRowsInM03: true }),
      describeDescriptiveSection(methods, 'M05', citations), state);
    assert.equal(canonicalJson(methods), retained, state);
  }
});

test('M05 pointer preserves nonempty unresolved pointers and blockers, even when no row resolves', async () => {
  const original = (await fullMarket14Input()).descriptiveMethods!;
  for (const resolved of [true, false]) {
    const methods = structuredClone(original);
    const partition = methods.sections.M05.partitions[0]!;
    partition.recordPointers = [...(resolved ? partition.recordPointers : []), '/m05/999'];
    if (!resolved) methods.sections.M05.partitions = [partition];
    methods.sections.M05.blockers = ['PERIOD_MISSING'];
    const normal = describeDescriptiveSection(methods, 'M05', citations, true);
    const pointed = describeDescriptiveSection(methods, 'M05', citations, true, { periodRowsInM03: true });
    const { html: _a, ...a } = normal, { html: _b, ...b } = pointed;
    assert.deepEqual(b, a);
    assert.deepEqual(pointed.unresolvedPointers, ['/m05/999']);
    assert.deepEqual(pointed.blockers, ['PERIOD_MISSING']);
    assert.equal(pointed.html.includes(M05_POINTER), resolved);
  }
});

test('M13 refers to Phần 2, retains the appendix and source trace, and M02 retains scope', async () => {
  const input = await fullMarket14Input();
  for (const captures of [input.captures, []]) {
    const report = buildResearchAutomationReport({ ...input, captures }, 'MARKET');
    const dom = new JSDOM(report.html.toString()), trace = new JSDOM(report.traceHtml!.toString());
    try {
      const m13 = section(dom.window.document, 'M13');
      assert.equal(count(m13.textContent!, M13_POINTER), 1);
      assert.equal(m13.querySelector('.section-reading')!.textContent, M13_READING);
      assert.equal(m13.querySelector('dl'), null);
      assert.match(section(dom.window.document, 'M02').querySelector('dl')!.textContent!, /Định nghĩa đã xác nhận.*Synthetic scope.*Điều kiện bao gồm.*Điều kiện loại trừ/u);
      assert.ok(m13.querySelector('.market14-sources'));
      assert.ok(m13.querySelector('table[data-glossary]'));
      // Main already suppresses M13's technical appendix and raw capture table.
      // The source list, glossary, retained captures and citation trace survive.
      assert.deepEqual((report.semantic as { captures: unknown }).captures, captures);
      assert.ok(section(trace.window.document, 'M13').querySelector('.market14-sources'));
      assert.ok(trace.window.document.querySelector('details.evidence-trace'));
      assert.ok((report.semantic as { citationEntries: unknown[] }).citationEntries.length);
    } finally { dom.window.close(); trace.window.close(); }
  }
});

test('M13 legacy negative control keeps its old explanation, scope and exact section bytes', async () => {
  const { marketPresentation: _presentation, ...input } = await fullMarket14Input();
  const dom = new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString());
  try {
    const m13 = section(dom.window.document, 'M13');
    assert.equal(m13.querySelector('.section-reading')!.textContent, OLD_READING);
    assert.ok(!m13.textContent!.includes(M13_POINTER));
    assert.match(m13.querySelector('dl')!.textContent!, /Định nghĩa đã xác nhận.*Synthetic scope/u);
    assert.equal(hash(m13.outerHTML), '36562a3a20c1f4531ed82ce080a75179b39d1a4f85eadbc342fc63f7646746b5');
  } finally { dom.window.close(); }
});

test('whole market14 reader prints each pointer once with safe new wording and preserves retained semantic data', async () => {
  const input = withInventory(await fullMarket14Input()), retained = canonicalJson(input);
  const report = buildResearchAutomationReport(input, 'MARKET');
  const visible = reportVisibleText(report.html.toString());
  for (const pointer of [M04_POINTER, M05_POINTER, M13_POINTER]) assert.equal(count(visible, pointer), 1);
  assert.doesNotMatch(visible, /Metric|Kalodata|TradeInt|Dami|Apify|SerpApi|PageIndex|Gemini|OpenCLI|zen-studio|Agent-Reach|Google/iu);
  const dom = new JSDOM(report.html.toString());
  try {
    for (const [id, pointer] of [['M04', M04_POINTER], ['M05', M05_POINTER], ['M13', M13_POINTER]] as const) {
      const node = [...section(dom.window.document, id).querySelectorAll(':scope > p')].find(p => p.textContent!.includes(pointer));
      assert.ok(node);
      assert.equal(node.textContent, pointer);
      assert.doesNotMatch(node.textContent!, /%|\b0\b/u);
    }
    for (const id of ['M04', 'M13']) assert.doesNotMatch(section(dom.window.document, id).querySelector('.section-reading')!.textContent!, /%|\b0\b/u);
  } finally { dom.window.close(); }
  const semantic = report.semantic as { descriptiveMethods: unknown; marketInventory: unknown; metricMethods: unknown };
  assert.deepEqual(semantic.descriptiveMethods, input.descriptiveMethods);
  assert.deepEqual(semantic.marketInventory, input.marketInventory);
  assert.deepEqual(semantic.metricMethods, input.metricMethods);
  const { marketPresentation: _presentation, ...legacy } = input;
  const legacyHtml = buildResearchAutomationReport(legacy, 'MARKET').html.toString();
  for (const pointer of [M04_POINTER, M05_POINTER, M13_POINTER]) assert.equal(count(legacyHtml, pointer), 0);
  assert.equal(canonicalJson(input), retained);
});

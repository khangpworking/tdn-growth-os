import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { type MarketNumberTraceGateResult, scanMarketReportNumbers } from '../../src/modules/analysis/research-automation/market-number-trace.js';
import { assertMarketReport, checkMarketReport, MarketNumberTraceBlockedError, type MarketCheckContext, type MarketCheckOutcome } from '../../src/modules/analysis/research-automation/market-report-check.js';
import { readMarketRawSeries, resolveMarketRawSource } from '../../src/modules/analysis/research-automation/market-raw-series.js';
import type { MarketNumberTrace, MarketTraceInput } from '../../src/modules/analysis/research-automation/market-trace-map.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import zinc30 from '../fixtures/market-raw-series/zinc-30d-4platform.synthetic.raw-responses.json' with { type: 'json' };
import zinc12 from '../fixtures/market-raw-series/zinc-12m-4platform.synthetic.raw-responses.json' with { type: 'json' };

// The P4 synthetic zinc captures supply the raw values; the existing full
// fixture supplies capture tables and the other stored-source blocks.
const rawCaptures = new Map<string, unknown>([['zinc-30d', zinc30], ['zinc-12m', zinc12]]);
const resolve = (input: MarketTraceInput): unknown => 'store' in input ? undefined
  : resolveMarketRawSource(rawCaptures.get(input.captureId), input);

function build(input: AutomationReportInput) {
  const report = buildResearchAutomationReport(input, 'MARKET');
  const semantic = report.semantic as { marketNumberTrace?: MarketNumberTrace; marketNumberTraceGate?: MarketNumberTraceGateResult };
  assert.ok(semantic.marketNumberTrace?.entries.length, 'the report must retain its trace map');
  assert.ok(semantic.marketNumberTraceGate, 'the report must retain its machine-readable gate result');
  const context = { kind: 'DRAFT_PRESENTATION', numberTrace: { trace: semantic.marketNumberTrace, resolve } } as const satisfies MarketCheckContext;
  return { input, html: report.html.toString(), trace: semantic.marketNumberTrace, gate: semantic.marketNumberTraceGate, context };
}

let fixture: Promise<ReturnType<typeof build>> | undefined;
function zincReport() {
  return fixture ??= fullMarket14Input().then(base => build({ ...base, marketRawSeries: {
    scope: { keywords: ['viên uống kẽm'], smartQuery: true },
    periods: [...rawCaptures].map(([captureId, raw]) => ({ captureId, raw, series: readMarketRawSeries(raw) })),
  } }));
}

function inject(html: string, block: string, fragment: string): string {
  const opening = new RegExp(`<section\\b[^>]*\\bid="${block}"[^>]*>`, 'u');
  assert.match(html, opening, `the fixture must render ${block}`);
  return html.replace(opening, match => match + fragment);
}

const injected = '<p>Giá trị bổ sung: 36,2 tỷ.</p>';
function assertT2(outcome: MarketCheckOutcome): void {
  assert.equal(outcome.failure?.message, 'MARKET_NUMBER_TRACE_FAILED:N01_UNTRACED_NUMBER', 'T2 requires delivery to be blocked by the HTML scan');
  assert.deepEqual(outcome.failure.failed, ['N01_UNTRACED_NUMBER']);
  assert.ok(outcome.numberTrace);
  assert.equal(outcome.numberTrace.ok, false);
  assert.equal(outcome.numberTrace.coveredUntraced, 1);
  assert.deepEqual(outcome.numberTrace.mismatches, [], 'the injected HTML leaves the valid trace map unchanged');
  assert.deepEqual(outcome.numberTrace.untraced, [{ token: '36,2 tỷ', block: 'M03', context: 'Giá trị bổ sung: 36,2 tỷ.' }]);
}

test('T1 zinc fixture report has zero untraced numbers in every covered block', async () => {
  const { gate } = await zincReport();
  assert.equal(gate.ok, true);
  assert.equal(gate.coveredUntraced, 0);
  assert.deepEqual(gate.untraced, []);
  assert.deepEqual(gate.mismatches, []);
  assert.ok(gate.replayedPointers > 0, 'raw values must be re-read from the fixture captures');
  assert.deepEqual(gate.covered.map(row => row.block).sort(), ['M01', 'M02', 'M03', 'M04', 'M07', 'M12', 'page']);
  for (const row of gate.covered) {
    assert.ok(row.numbers > 0 && row.traced > 0, `${row.block} must exercise real printed numbers and traces`);
    assert.equal(row.untraced, 0, `${row.block} must have no untraced numbers`);
    assert.equal(row.numbers, row.traced + row.allowed);
  }
});

test('T2 an injected 36,2 tỷ in a covered block blocks delivery and lists its context', async () => {
  const { html, context } = await zincReport();
  const tampered = inject(html, 'M03', injected);
  assertT2(checkMarketReport(tampered, context));
  assert.throws(() => assertMarketReport(tampered, context), error => {
    assert.ok(error instanceof MarketNumberTraceBlockedError);
    assert.equal(error.message, 'MARKET_NUMBER_TRACE_FAILED:N01_UNTRACED_NUMBER');
    assert.equal(error.numberTrace.untraced[0]?.token, '36,2 tỷ', 'the thrown block must carry the saved diagnostic');
    return true;
  });
});

test('T3 a change percentage with the wrong previous-period base blocks delivery', async () => {
  const { html, trace, context } = await zincReport();
  const index = trace.entries.findIndex(entry => entry.blockId.startsWith('M03.30d.') && entry.formulaId === 'change-percent');
  assert.ok(index >= 0, 'the zinc report must exercise change percentages');
  const original = trace.entries[index]!;
  const inputs = original.inputs.map(input => {
    if (input.role !== 'previous') return input;
    assert.equal(typeof input.value, 'number');
    return { ...input, value: Number(input.value) * 2 };
  });
  assert.ok(inputs.some((input, i) => input.value !== original.inputs[i]!.value), 'the control must change the comparison base');
  const wrong = { ...trace, entries: trace.entries.map((entry, i) => i === index ? { ...entry, inputs } : entry) };
  // Replay the declared computation without a resolver, so this proves the
  // formula rejects the base rather than merely detecting a pointer mismatch.
  const outcome = checkMarketReport(html, { ...context, numberTrace: { trace: wrong } });
  assert.ok(outcome.failure);
  assert.ok(outcome.failure.failed.includes('N02_TRACE_REPLAY'));
  assert.match(outcome.failure.message, /^MARKET_NUMBER_TRACE_FAILED:/u);
  assert.equal(outcome.numberTrace?.ok, false);
  assert.deepEqual(outcome.numberTrace?.mismatches, [{ token: original.token, blockId: original.blockId, reason: 'change-percent gives «−44%»' }]);
});

test('a supplied raw capture with missing source pointers blocks delivery', async () => {
  const { input } = await zincReport();
  const rawSeries = input.marketRawSeries!;
  const periods = rawSeries.periods.map(period => ({ ...period, raw: [] }));
  assert.throws(() => buildResearchAutomationReport({ ...input, marketRawSeries: { ...rawSeries, periods } }, 'MARKET'), error => {
    assert.ok(error instanceof MarketNumberTraceBlockedError);
    assert.ok(error.message.includes('N02_TRACE_REPLAY'));
    assert.ok(error.numberTrace.mismatches.length > 0, 'numbers cannot trace to pointers absent from the supplied raw capture');
    return true;
  });
});

test('T4 section labels and source dates pass; M12 deadlines follow the Vietnam run date', async () => {
  const { input } = await zincReport();
  const { html, gate, context } = build({ ...input, run: { ...input.run, createdAt: '2026-10-25T18:30:00.000Z' } });
  assert.equal(gate.ok, true);
  assert.equal(gate.coveredUntraced, 0);
  assert.deepEqual(gate.mismatches, []);
  const scanned = scanMarketReportNumbers(html);
  assert.ok(scanned.some(number => number.block === 'M03' && number.allowed === 'section-label'), 'section numbers must be explicit template labels');
  for (const token of ['21/09–20/10/2026', '21/09–27/09/2026']) {
    assert.ok(scanned.some(number => number.block === 'M03' && number.token === token && !number.allowed), `${token} must be checked as data`);
  }
  // UTC 25 October at 18:30 is 26 October in Vietnam. Offsets 3/7/14
  // therefore produce these dates, including a month boundary.
  const dom = new JSDOM(html);
  try {
    const actions = dom.window.document.querySelector('#M12');
    assert.ok(actions);
    assert.deepEqual([...new Set(actions.textContent!.match(/\d{2}\/\d{2}\/\d{4}/gu))].sort(), ['02/11/2026', '09/11/2026', '29/10/2026']);
    assert.ok(scanned.filter(number => number.block === 'M12' && /\/2026$/u.test(number.token)).every(number => !number.allowed), 'deadlines must be traced, not allow-listed');
  } finally { dom.window.close(); }
  const wrongDate = inject(html, 'M12', '<p>Hạn bổ sung: 30/10/2026.</p>');
  const outcome = checkMarketReport(wrongDate, context);
  assert.deepEqual(outcome.failure?.failed, ['N01_UNTRACED_NUMBER']);
  assert.deepEqual(outcome.numberTrace?.untraced.map(({ token, block }) => ({ token, block })), [{ token: '30/10/2026', block: 'M12' }]);
});

test('T5 a number in the trace appendix is ignored', async () => {
  const { html, context } = await zincReport();
  const baseline = checkMarketReport(html, context);
  const appendix = inject(html, 'M13', injected);
  assert.ok(appendix.includes(injected), 'the number is present in the HTML');
  const outcome = checkMarketReport(appendix, context);
  assert.equal(outcome.failure, null);
  assert.deepEqual(outcome.numberTrace, baseline.numberTrace, 'appendix numbers must not enter either blocking or nonblocking counts');
});

test('T6 an untraced number in a not-covered block is counted without blocking', async () => {
  const { html, context } = await zincReport();
  const baseline = checkMarketReport(html, context).numberTrace!;
  const outcome = checkMarketReport(inject(html, 'M06', injected), context);
  assert.equal(outcome.failure, null);
  assert.ok(outcome.numberTrace);
  assert.equal(outcome.numberTrace.ok, true);
  assert.equal(outcome.numberTrace.coveredUntraced, 0);
  assert.deepEqual(outcome.numberTrace.untraced, []);
  assert.equal(outcome.numberTrace.notCoveredUntraced, baseline.notCoveredUntraced + 1);
  assert.ok(outcome.numberTrace.notCoveredList.some(number => number.token === '36,2 tỷ' && number.block === 'M06' && number.context === 'Giá trị bổ sung: 36,2 tỷ.'));
  const trade = outcome.numberTrace.notCovered.find(row => row.block === 'M06');
  const before = baseline.notCovered.find(row => row.block === 'M06');
  assert.ok(trade && before);
  assert.equal(trade.numbers, before.numbers + 1);
  assert.equal(trade.untraced, before.untraced + 1);
  assert.match(trade.source!, /trade/iu, 'follow-up counts must identify their data source');
  assert.ok(outcome.results.find(row => row.rule === 'N01_UNTRACED_NUMBER')?.ok);
});

test('T2 negative control: a map-only gate without an HTML scan fails the T2 assertion', async () => {
  const { html, context } = await zincReport();
  const tampered = inject(html, 'M03', injected);
  assertT2(checkMarketReport(tampered, context));
  // Deliberately wrong reader: replay the unchanged map against no page text.
  // The real formula validator still runs, but cannot see the injected number.
  const mapOnly = (_html: string) => checkMarketReport('', { kind: 'DRAFT_PLAIN', numberTrace: context.numberTrace });
  const wrong = mapOnly(tampered);
  assert.equal(wrong.failure, null);
  assert.deepEqual(wrong.numberTrace?.mismatches, []);
  assert.throws(() => assertT2(wrong), { name: 'AssertionError', message: /T2 requires delivery to be blocked by the HTML scan/u });
});

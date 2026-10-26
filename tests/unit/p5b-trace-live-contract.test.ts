import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { AutomationSourceClaims } from '../../contracts/analysis/automation-source-claims.generated.js';
import type { ScopeSnapshot, StepSearchAds } from '../../src/modules/analysis/research-automation/model.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { buildAutomationDecisionPacket } from '../../src/modules/analysis/research-automation/decision-packets.js';
import { buildAutomationM01EvidenceInventory } from '../../src/modules/analysis/research-automation/m01-evidence-inventory.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { checkMarketReport, MarketNumberTraceBlockedError, type MarketCheckContext } from '../../src/modules/analysis/research-automation/market-report-check.js';
import { checkMarketNumberTrace, type MarketNumberTraceGateResult } from '../../src/modules/analysis/research-automation/market-number-trace.js';
import { readMarketRawSeries, resolveMarketRawSource } from '../../src/modules/analysis/research-automation/market-raw-series.js';
import type { MarketNumberTrace, MarketTraceInput } from '../../src/modules/analysis/research-automation/market-trace-map.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import zinc30 from '../fixtures/market-raw-series/zinc-30d-4platform.synthetic.raw-responses.json' with { type: 'json' };
import zinc12 from '../fixtures/market-raw-series/zinc-12m-4platform.synthetic.raw-responses.json' with { type: 'json' };

// The P4 synthetic zinc captures supply the raw-series blocks and switch the gate on.
const rawCaptures = new Map<string, unknown>([['zinc-30d', zinc30], ['zinc-12m', zinc12]]);
const resolve = (input: MarketTraceInput): unknown => 'store' in input ? undefined
  : resolveMarketRawSource(rawCaptures.get(input.captureId), input);

// P5b contract rows: a small extract of the real live-run shapes (evidence annotations,
// printed periods, product titles and the fixed +07:00 note). No customer or provider
// names: the synthetic item is «Kẽm tổng hợp …» and every id is local.
const TITLE = 'Kẽm tổng hợp 30 ngày 60 viên 150mg';
const CARD_ID = 'detail:p1';
const COLLECTION_SHA = 'a'.repeat(64);
const PACKAGE = { packageId: '33333333-3333-4333-8333-333333333333', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) };
const WINDOW = { start: '2025-11-25', end: '2025-12-24' };
const M01_VALUE = '99846086';
const M12_VALUE = '631404562';
const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

function claimsFor(scope: ScopeSnapshot, value = M01_VALUE): AutomationSourceClaims {
  const claimScope = { scopeSha256: sha(scope), universe: null, geography: 'VN', frame: null, inclusionRule: null, exclusionRule: null,
    variantRule: null, description: 'Synthetic frozen run scope' };
  const body = {
    sectionId: 'M05' as const,
    method: { methodId: 'descriptive-market-methods', methodVersion: '1.0.0', methodOutputId: 'd'.repeat(64), artifact: PACKAGE, outputPointer: '/input/m05/0' },
    source: { package: PACKAGE, logicalPath: 'synthetic/market.csv', sha256: 'e'.repeat(64), locator: '/observations/55', recordLocator: null,
      statement: null, attribution: null, spans: [] },
    observation: {
      basis: 'SOURCE_OBSERVED' as const, state: value === '0' ? 'observed_zero' : 'observed_value',
      measure: { literal: 'Doanh thu', definition: 'Source-stated revenue for one listed row', entityLabel: TITLE },
      value, unit: 'VND', precision: 'exact' as const,
      period: { start: WINDOW.start, end: WINDOW.end, timezone: 'Asia/Ho_Chi_Minh', basis: 'SOURCE_STATED_PERIOD' },
      periodText: '25/11/2025 - 24/12/2025', scope: claimScope,
      coverage: { unit: 'SOURCE_OBSERVATIONS' as const, observedCount: value === '0' ? 0 : 1, zeroCount: value === '0' ? 1 : 0, missingCount: 0, unknownCount: 0, nonExactCount: 0,
        description: 'One observed row' },
      limitations: ['SOURCE_STATED_MEASURE_IS_NOT_DEMAND_OR_MARKET_SIZE'],
    },
    declaration: null,
    limitations: ['SYNTHETIC_FIXTURE'],
  };
  const claims = [{ claimId: sha(body), ...body }];
  return { contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0',
    runId: scope.runId, workspaceId: scope.workspaceId, scopeSha256: sha(scope), claimsSha256: sha(claims), claims,
    limitations: ['SYNTHETIC_SOURCE_CLAIMS_FIXTURE'] } as unknown as AutomationSourceClaims;
}

/**
 * The captured results table of the live run: a row policy version on the capture
 * (so the page spells out zero) and no zero-revenue row in the retained samples.
 */
function metricMethods(): AutomationMetricMethodSnapshot {
  const fixture = metricFixture();
  const result = calculateMetricScopes({ ...fixture, records: fixture.records.filter(record => record.revenue.value !== '0') });
  return {
    contractVersion: 'automation-metric-method-snapshot-v2', runId: '22222222-2222-4222-8222-222222222222', runBindingSha256: 'b'.repeat(64),
    sourcePackage: { packageId: 'synthetic-method-package', manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
    originalSourcePackage: { packageId: 'synthetic-capture-package', manifestArtifactSha256: 'e'.repeat(64), packageContentSha256: 'f'.repeat(64) },
    preparation: { preparationSha256: '1'.repeat(64), normalizedInput: { rowCount: result.input.records.length }, selectedSources: {} },
    readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] },
    result, limitations: ['CAPTURE_RESULTS_PAGE_TOP_N_LIMITED'],
    capture: { provenance: 'RESULTS_PAGE_CAPTURE', rowPolicyVersion: CAPTURE_ROW_PROFILE, snapshotSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64),
      contextSha256: '4'.repeat(64), descriptorSha256: '5'.repeat(64), platforms: [{ platform: 'shopee', result }, { platform: 'tiktok', result }], unattributedRows: [],
      capture: { captureId: 'capture-synthetic-209', keyword: 'synthetic jar', specDigest: '6'.repeat(64),
        measurementPeriod: { startDate: result.input.scope.start, endDate: result.input.scope.end }, platforms: ['shopee', 'tiktok'],
        truncation: { cap: 200, totalShown: null, pagesRead: 1, rowsRead: result.input.records.length, truncated: false } } },
  } as unknown as AutomationMetricMethodSnapshot;
}

/** One product and one query window, read as the live reader does (M03). */
function marketInventory(): AutomationMarketMethodSnapshot {
  const source = (fieldPointer: string) => ({ sourceSha256: 'f'.repeat(64), fieldPointer });
  const observation = (measure: 'revenue' | 'sales_volumn', decimal: string) => ({ observationId: `${measure}-1`, subjectMemberKeys: [CARD_ID],
    retrievedAt: '2025-12-25T00:00:00.000Z', measure: { literal: measure, unit: measure === 'revenue' ? 'VND' : null, currency: measure === 'revenue' ? 'VND' : null },
    value: { decimal, literal: null }, requestedWindow: WINDOW, rawQuery: WINDOW, source: source(`/data/${measure}`) });
  return {
    contractVersion: 'automation-market-method-snapshot-v1', runId: '22222222-2222-4222-8222-222222222222',
    sourcePackage: PACKAGE, mappingRevision: 'market-method-mapping-v1' as AutomationMarketMethodSnapshot['mappingRevision'],
    temporal: { input: { frame: { members: [{ memberKey: CARD_ID }] }, observations: [observation('revenue', M12_VALUE), observation('sales_volumn', '19219')] } },
    quotes: { input: { quotes: [] } },
    sourceRequirements: { temporal: ['INVENTORY_ONLY_NO_TEMPORAL_OPERATIONS_REQUESTED'], quotes: ['INVENTORY_ONLY_ALL_UNIT_PRICE_OPERATIONS_UNAVAILABLE'] },
  } as unknown as AutomationMarketMethodSnapshot;
}

async function p5bInput(value = M01_VALUE): Promise<AutomationReportInput> {
  const base = await fullMarket14Input();
  const scope = base.scope;
  const claims = claimsFor(scope, value);
  const { artifact: m01Inventory } = buildAutomationM01EvidenceInventory({
    run: { runId: scope.runId, workspaceId: scope.workspaceId }, scope, claimsSha256: claims.claimsSha256, sourceClaims: claims });
  const evidence = { run: { runId: scope.runId, workspaceId: scope.workspaceId }, scope, claimsSha256: claims.claimsSha256,
    sourceClaims: claims, locatedMethodOutput: null, admissionVersion: '1.0.0' as const };
  const { artifact: m12Packet } = buildAutomationDecisionPacket({ sectionId: 'M12', evidence });
  return {
    ...base,
    // The live run had no market14 presentation: M01/M12 read the stored claims and M03 reads the inventory.
    marketPresentation: undefined,
    marketPresentationCharts: undefined,
    // A retained public-review source is what the live reader carries (it never adds a scanned number: M13 is not scanned).
    publicReviewSource: { acquisition: { maxReviewsPerProduct: 20 }, reference: null,
      outcome: { outcome: 'OK', listings: [], providerMessage: null, attemptedAt: null, reused: false }, products: [],
      corpusSha256: null, corpusUnavailableReason: null, humanBlocked: false, accounting: { sourceRows: 0, uniqueScopedGroups: 0,
        equalDuplicates: 0, conflictingGroups: 0, quarantinedRows: 0, capturedReviewRecords: 0, readableCommentRecords: 0,
        attributesOnlyRecords: 0, emptyComments: 0, unreadableComments: 0, missingRatings: 0, invalidRatings: 0, sourceExcludedIds: 0 } },
    start: { ...base.start, sourceEvidenceVersion: 'automation-source-evidence-v1' },
    sourceEvidence: buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: base.captures }),
    collection: { ...base.collection!, productCards: [{ productId: CARD_ID, provider: 'synthetic', sourceProductId: CARD_ID,
      role: 'PRINCIPAL', title: TITLE, sourceUrl: null, imageUrl: null, description: null, descriptionState: 'EMPTY',
      observedWindow: null, retrievedAt: '2025-12-25T00:00:00.000Z' }] },
    productCardSources: { collection: COLLECTION_SHA },
    sourceClaims: claims,
    m01Inventory,
    decisionPackets: [m12Packet],
    decisionSourceClaims: claims,
    metricMethods: metricMethods(),
    marketInventory: marketInventory(),
    marketRawSeries: { scope: { keywords: ['viên uống kẽm'], smartQuery: true },
      periods: [...rawCaptures].map(([captureId, raw]) => ({ captureId, raw, series: readMarketRawSeries(raw) })) },
  } as unknown as AutomationReportInput;
}

function build(input: AutomationReportInput) {
  const report = buildResearchAutomationReport(input, 'MARKET');
  const semantic = report.semantic as { marketNumberTrace?: MarketNumberTrace; marketNumberTraceGate?: MarketNumberTraceGateResult };
  assert.ok(semantic.marketNumberTrace?.entries.length, 'the report must retain its trace map');
  assert.ok(semantic.marketNumberTraceGate, 'the report must retain its machine-readable gate result');
  const context: MarketCheckContext = { kind: 'DRAFT_PLAIN', numberTrace: { trace: semantic.marketNumberTrace, resolve } };
  return { input, html: report.html.toString(), trace: semantic.marketNumberTrace, gate: semantic.marketNumberTraceGate, context };
}

let fixture: Promise<ReturnType<typeof build>> | undefined;
function p5bReport() {
  return fixture ??= p5bInput().then(build);
}

/** A1's single assertion, reused by the negative control: no covered block may print an untraced number. */
function assertCoveredAllTraced(gate: MarketNumberTraceGateResult): void {
  assert.equal(gate.ok, true, JSON.stringify({ untraced: gate.untraced.slice(0, 5), mismatches: gate.mismatches.slice(0, 5) }));
  assert.equal(gate.coveredUntraced, 0);
  assert.deepEqual(gate.untraced, []);
  assert.deepEqual(gate.mismatches, []);
  for (const block of ['M01', 'M03', 'M12']) {
    const row = gate.covered.find(entry => entry.block === block);
    assert.ok(row, `${block} must be a covered block of this fixture`);
    assert.ok(row.numbers > 0 && row.traced > 0, `${block} must exercise printed numbers and trace entries`);
    assert.equal(row.untraced, 0, `${block} must have no untraced number`);
  }
}

function section(html: string, block: string): { start: number; end: number } {
  const opening = html.indexOf(`<section class="sheet" id="${block}">`);
  assert.ok(opening >= 0, `the fixture must render ${block}`);
  // Sheet sections are top-level siblings; their bodies may hold nested <section> blocks.
  const next = html.indexOf('<section class="sheet" id="', opening + 1);
  return { start: opening, end: next < 0 ? html.length : next };
}

function mutate(html: string, block: string, from: string, to: string): string {
  const { start, end } = section(html, block);
  const at = html.indexOf(from, start);
  assert.ok(at >= 0 && at < end, `${block} must print «${from}»`);
  return html.slice(0, at) + to + html.slice(at + from.length);
}

test('A1 a live-run-shaped report traces every number in its covered blocks', async () => {
  const { gate, trace, input } = await p5bReport();
  assertCoveredAllTraced(gate);
  // The rows the live gate blocked (evidence annotations, periods, titles) are the ones now traced.
  const blockIds = new Set(trace.entries.map(entry => entry.blockId));
  for (const id of ['M01.evidence.value', 'M01.evidence.period', 'M01.evidence.title', 'M01.items', 'M01',
    'M03.inventory.title', 'M12.evidence.value', 'M12']) assert.ok(blockIds.has(id), `${id} must carry a trace entry`);
  assert.deepEqual(gate.covered.map(row => row.block).sort(), ['M01', 'M02', 'M03', 'M04', 'M07', 'M12', 'page']);
  // The count must resolve in the retained artifact, whose digest covers the full canonical document and newline.
  const storedClaims = input.sourceClaims!;
  const storedClaimsSha = createHash('sha256').update(`${canonicalJson(storedClaims)}\n`).digest('hex');
  const count = trace.entries.find(entry => entry.blockId === 'M01.items');
  assert.ok(count);
  assert.deepEqual(count.inputs, storedClaims.claims.map((claim, index) => ({
    store: 'stored-source', identity: storedClaimsSha, pointer: `/claims/${index}/claimId`, value: claim.claimId,
  })));
  const zero = build(await p5bInput('0'));
  assertCoveredAllTraced(zero.gate);
  assert.match(zero.html, /0 VND(?:<|\.)/u);
  assert.doesNotMatch(zero.html, /0 VND VND/u);
});

test('A3a a changed evidence value blocks with one untraced number in its block', async () => {
  const { html, context } = await p5bReport();
  const tampered = mutate(html, 'M01', '99.846.086', '99.846.087');
  const outcome = checkMarketReport(tampered, context);
  assert.deepEqual(outcome.failure?.failed, ['N01_UNTRACED_NUMBER']);
  assert.equal(outcome.numberTrace?.ok, false);
  assert.equal(outcome.numberTrace?.coveredUntraced, 1);
  assert.deepEqual(outcome.numberTrace?.untraced.map(({ token, block }) => ({ token, block })), [{ token: '99.846.087', block: 'M01' }]);
});

test('A3b a changed number inside a product title blocks in M03', async () => {
  const { html, context } = await p5bReport();
  assert.ok(html.includes(TITLE), 'the stored product title must be printed whole');
  const tampered = mutate(html, 'M03', '150mg', '151mg');
  const outcome = checkMarketReport(tampered, context);
  assert.deepEqual(outcome.failure?.failed, ['N01_UNTRACED_NUMBER']);
  assert.equal(outcome.numberTrace?.coveredUntraced, 1);
  assert.deepEqual(outcome.numberTrace?.untraced.map(({ token, block }) => ({ token, block })), [{ token: '151', block: 'M03' }]);
});

test('A3c a date outside every stored window blocks in M03', async () => {
  const { html, context } = await p5bReport();
  assert.ok(html.includes('25/11/2025'), 'the stored window start must be printed');
  const tampered = mutate(html, 'M03', '25/11/2025', '25/11/2024');
  const outcome = checkMarketReport(tampered, context);
  assert.deepEqual(outcome.failure?.failed, ['N01_UNTRACED_NUMBER']);
  assert.equal(outcome.numberTrace?.coveredUntraced, 1);
  assert.deepEqual(outcome.numberTrace?.untraced.map(({ token, block }) => ({ token, block })), [{ token: '25/11/2024', block: 'M03' }]);
});

test('negative control: removing the P5b trace entries makes the A1 assertion fail', async () => {
  const { html, trace, gate } = await p5bReport();
  assertCoveredAllTraced(gate);
  // The entries the pre-P5b code did not write: evidence/title/count annotations. Same page, same scanner.
  const p5bPrefixes = ['M01.evidence.', 'M01.items', 'M03.inventory.title', 'M12.evidence.'];
  const stripped: MarketNumberTrace = { ...trace,
    entries: trace.entries.filter(entry => entry.blockId !== 'M01' && entry.blockId !== 'M12' && !p5bPrefixes.some(prefix => entry.blockId.startsWith(prefix))) };
  assert.ok(stripped.entries.length < trace.entries.length, 'the control must remove entries');
  const preP5b = checkMarketReport(html, { kind: 'DRAFT_PLAIN', numberTrace: { trace: stripped } }).numberTrace!;
  assert.ok(preP5b.coveredUntraced > 0);
  assert.ok(preP5b.untraced.some(({ block }) => block === 'M01'), 'the M01 annotations must be untraced without their entries');
  assert.throws(() => assertCoveredAllTraced(preP5b), { name: 'AssertionError' });
});

// Three invented brands: a checked zero, a skipped label with digits, and positive
// counts/dates. The domain also contains digits, so it must trace as stored text.
const searchAds: StepSearchAds = {
  profile: 'search-ads-v1', status: 'OK', brands: [
    { label: 'Nhãn Mây', domain: 'may.example', status: 'OK', reason: null, totalResults: 0, creativeCount: 0,
      formats: { text: 0, image: 0, video: 0 }, firstShown: null, lastShown: null, maxDaysShown: 0,
      overlapCount: 0, invalidCount: 0, captureIndex: null, retrievedAt: '2026-10-01T00:00:00.000Z', responseSha256: null, usageOrdinal: null },
    { label: '7LX', domain: null, status: 'SKIPPED_NO_DOMAIN', reason: null, totalResults: null, creativeCount: null,
      formats: null, firstShown: null, lastShown: null, maxDaysShown: null, overlapCount: null, invalidCount: null,
      captureIndex: null, retrievedAt: null, responseSha256: null, usageOrdinal: null },
    { label: 'Nhãn Gió', domain: 'gio27.example', status: 'OK', reason: null, totalResults: 13, creativeCount: 13,
      formats: { text: 6, image: 4, video: 3 }, firstShown: '2026-09-03', lastShown: '2026-09-21', maxDaysShown: 19,
      overlapCount: 0, invalidCount: 0, captureIndex: null, retrievedAt: '2026-10-01T00:00:00.000Z', responseSha256: null, usageOrdinal: null },
  ],
};

function collectionResolver(collection: AutomationReportInput['collection']) {
  return (input: MarketTraceInput): unknown => {
    if (!('store' in input) || input.identity !== COLLECTION_SHA) return resolve(input);
    return input.pointer.slice(1).split('/').reduce<unknown>((value, key) =>
      value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined, collection);
  };
}

const s17Inputs = new Map<boolean, Promise<AutomationReportInput>>();
function s17Input(presentation: boolean): Promise<AutomationReportInput> {
  if (!s17Inputs.has(presentation)) s17Inputs.set(presentation, (async () => {
    const { input: base } = await p5bReport();
    const presented = presentation ? await fullMarket14Input() : undefined;
    return { ...base, ...(presented ? { marketPresentation: presented.marketPresentation!,
      marketPresentationCharts: presented.marketPresentationCharts! } : {}),
      collection: { ...base.collection!, searchAds: structuredClone(searchAds) } };
  })());
  return s17Inputs.get(presentation)!;
}

function buildS17(input: AutomationReportInput) {
  try { return build(input); }
  catch (error) {
    if (error instanceof MarketNumberTraceBlockedError) assert.fail(`${error.message}: ${JSON.stringify({
      untraced: error.numberTrace.untraced, mismatches: error.numberTrace.mismatches })}`);
    throw error;
  }
}

for (const presentation of [false, true]) {
  const branch = presentation ? 'with marketPresentation' : 'without marketPresentation';
  test(`S17 preserves zero tokens in stored source labels ${branch}`, async t => {
    const base = await s17Input(presentation);
    for (const { label, range } of [{ label: 'Nhãn Gió 0' }, { label: '0' }, { label: '0', range: true }, { label: 'Nhãn là 0' }]) await t.test(`${label}${range ? ' in a range' : ''}`, () => {
      const collection = structuredClone(base.collection!);
      collection.searchAds!.brands[2]!.label = label;
      if (range) collection.searchAds!.brands[0]!.label = '13';
      const { html, trace } = buildS17({ ...base, collection });
      assertCoveredAllTraced(checkMarketNumberTrace(html, trace, { resolve: collectionResolver(collection) }));
      assert.ok(html.includes(`>${label}</`), 'the stored label must keep its printed bytes');
      if (presentation && label === '0' && !range) {
        const changed = structuredClone(collection);
        changed.searchAds!.brands[2]!.label = 'Nhãn Khác';
        const outcome = checkMarketReport(html, { kind: 'DRAFT_PLAIN', numberTrace: { trace, resolve: collectionResolver(changed) } });
        assert.ok(outcome.failure?.failed.includes('N02_TRACE_REPLAY'), 'preserving a source-label zero must still replay its stored value');
      }
    });
  });

  test(`S17 traces counts, dates and digit-bearing labels ${branch}`, async () => {
    const { html, trace, input } = buildS17(await s17Input(presentation));
    const gate = checkMarketNumberTrace(html, trace, { resolve: collectionResolver(input.collection) });
    assertCoveredAllTraced(gate);
    const { start, end } = section(html, 'M07');
    for (const value of ['7LX', 'gio27.example', '13', '6 / 4 / 3', '03/09/2026', '21/09/2026', '19']) {
      assert.ok(html.slice(start, end).includes(value), `M07 must print «${value}»`);
    }
  });

  test(`S17 table label follows its real position ${branch}`, async () => {
    const input = await s17Input(presentation);
    // Check the visible label independently of trace acceptance, so an unrelated
    // untraced value cannot conceal an ordinal regression.
    const { marketRawSeries: _rawSeries, ...withoutRawSeries } = input;
    const report = buildResearchAutomationReport(withoutRawSeries, 'MARKET');
    const dom = new JSDOM(report.html.toString());
    try {
      const sheet = dom.window.document.querySelector('#M07')!;
      assert.ok(sheet);
      const tables = [...sheet.querySelectorAll('table')];
      const table = tables.find(table => table.tHead?.textContent?.includes('Số mẫu quảng cáo'));
      assert.ok(table, 'S17 must print its search-ads table');
      const ordinal = tables.indexOf(table) + 1;
      assert.notEqual(ordinal, 3, 'the fixture must put S17 away from the old hard-coded position');
      assert.match(table.parentElement!.textContent!, new RegExp(`Bảng 7\\.${ordinal}(?!\\d)`, 'u'));
      assert.doesNotMatch(sheet.textContent!, /Bảng 7\.3/u);
    } finally { dom.window.close(); }
  });
}

test('S17 undated counts and digit-bearing labels replay COLLECTION; a changed stored creative count blocks with N02', async () => {
  const input = await s17Input(false);
  const collection = structuredClone(input.collection!);
  collection.searchAds!.brands[2]!.firstShown = null;
  collection.searchAds!.brands[2]!.lastShown = null;
  const { html, trace } = buildS17({ ...input, collection });
  const gate = checkMarketNumberTrace(html, trace, { resolve: collectionResolver(collection) });
  assertCoveredAllTraced(gate);
  assert.ok(gate.replayedPointers > 0);

  // Leave the page and trace unchanged, and alter the retained record instead.
  const changed = structuredClone(collection);
  changed.searchAds!.brands[2]!.creativeCount = 14;
  const outcome = checkMarketReport(html, { kind: 'DRAFT_PLAIN', numberTrace: { trace, resolve: collectionResolver(changed) } });
  assert.ok(outcome.failure?.failed.includes('N02_TRACE_REPLAY'));
  assert.equal(outcome.numberTrace?.ok, false);
  assert.ok(outcome.numberTrace.mismatches.some(row => row.token === '13' && row.blockId.startsWith('M07')
    && row.reason.includes('/searchAds/brands/2/creativeCount')), 'the changed COLLECTION field must cause the mismatch');
});

test('S17 reading keeps counts and repeated labels tied to their actual sources when numbers collide', async t => {
  const base = await s17Input(true);
  for (const equalCounts of [true, false]) await t.test(equalCounts ? 'count versus stored value' : 'measure versus label', () => {
    const collection = structuredClone(base.collection!);
    const first = collection.searchAds!.brands[0]!;
    first.label = 'Nhãn Mây 13';
    first.creativeCount = equalCounts ? 13 : 17;
    first.formats = { text: 13, image: 0, video: equalCounts ? 0 : 4 };
    first.maxDaysShown = 2;
    const { html, trace } = buildS17({ ...base, collection });
    assertCoveredAllTraced(checkMarketNumberTrace(html, trace, { resolve: collectionResolver(collection) }));
    const reading = trace.entries.filter(entry => entry.blockId === 'M07.searchAds.reading');
    const sources = (token: string) => reading.filter(entry => entry.token === token)
      .map(entry => ({ formula: entry.formulaId, pointers: entry.inputs.map(input => {
        assert.ok('store' in input, 'reading inputs must resolve to the retained COLLECTION');
        assert.equal(input.identity, COLLECTION_SHA);
        return input.pointer;
      }) }));
    if (equalCounts) {
      assert.ok(html.includes('ở 2 dòng có số'));
      assert.deepEqual(sources('2'), [{ formula: 'count', pointers: ['/searchAds/brands/0/label', '/searchAds/brands/2/label'] }]);
    } else {
      assert.ok(html.includes('mức thấp là 13'));
      assert.deepEqual(sources('13'), [
        { formula: 'as-stored', pointers: ['/searchAds/brands/2/creativeCount'] },
        { formula: 'as-stored', pointers: ['/searchAds/brands/0/label'] },
      ]);
    }
  });
});

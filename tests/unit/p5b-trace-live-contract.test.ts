import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { AutomationSourceClaims } from '../../contracts/analysis/automation-source-claims.generated.js';
import type { ScopeSnapshot } from '../../src/modules/analysis/research-automation/model.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { buildAutomationDecisionPacket } from '../../src/modules/analysis/research-automation/decision-packets.js';
import { buildAutomationM01EvidenceInventory } from '../../src/modules/analysis/research-automation/m01-evidence-inventory.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { checkMarketReport, type MarketCheckContext } from '../../src/modules/analysis/research-automation/market-report-check.js';
import type { MarketNumberTraceGateResult } from '../../src/modules/analysis/research-automation/market-number-trace.js';
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

function claimsFor(scope: ScopeSnapshot): AutomationSourceClaims {
  const claimScope = { scopeSha256: sha(scope), universe: null, geography: 'VN', frame: null, inclusionRule: null, exclusionRule: null,
    variantRule: null, description: 'Synthetic frozen run scope' };
  const body = {
    sectionId: 'M05' as const,
    method: { methodId: 'descriptive-market-methods', methodVersion: '1.0.0', methodOutputId: 'd'.repeat(64), artifact: PACKAGE, outputPointer: '/input/m05/0' },
    source: { package: PACKAGE, logicalPath: 'synthetic/market.csv', sha256: 'e'.repeat(64), locator: '/observations/55', recordLocator: null,
      statement: null, attribution: null, spans: [] },
    observation: {
      basis: 'SOURCE_OBSERVED' as const, state: 'observed_value',
      measure: { literal: 'Doanh thu', definition: 'Source-stated revenue for one listed row', entityLabel: TITLE },
      value: M01_VALUE, unit: 'VND', precision: 'exact' as const,
      period: { start: WINDOW.start, end: WINDOW.end, timezone: 'Asia/Ho_Chi_Minh', basis: 'SOURCE_STATED_PERIOD' },
      periodText: '25/11/2025 - 24/12/2025', scope: claimScope,
      coverage: { unit: 'SOURCE_OBSERVATIONS' as const, observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0,
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

async function p5bInput(): Promise<AutomationReportInput> {
  const base = await fullMarket14Input();
  const scope = base.scope;
  const claims = claimsFor(scope);
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
  return { html: report.html.toString(), trace: semantic.marketNumberTrace, gate: semantic.marketNumberTraceGate, context };
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
  const { gate, trace } = await p5bReport();
  assertCoveredAllTraced(gate);
  // The rows the live gate blocked (evidence annotations, periods, titles) are the ones now traced.
  const blockIds = new Set(trace.entries.map(entry => entry.blockId));
  for (const id of ['M01.evidence.value', 'M01.evidence.period', 'M01.evidence.title', 'M01.items', 'M01',
    'M03.inventory.title', 'M12.evidence.value', 'M12']) assert.ok(blockIds.has(id), `${id} must carry a trace entry`);
  assert.deepEqual(gate.covered.map(row => row.block).sort(), ['M01', 'M02', 'M03', 'M04', 'M07', 'M12', 'page']);
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

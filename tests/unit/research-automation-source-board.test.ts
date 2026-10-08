import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  buildResearchAutomationSourceStatus,
  futureCollectorState,
  SERPAPI_KNOWN_OPERATIONS,
  SOURCE_BOARD_ORDER,
  SOURCE_REGISTRY,
  type SourceStatusInput,
} from '../../src/modules/analysis/research-automation/source-status.js';
import type { ResearchAutomationSourceStatusEntry } from '../../contracts/api/research-automation-source-status-api.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function activity(overrides: Record<string, { lastDataAt: string | null; dataCount: number; lastUsageAt: string | null }> = {}) {
  return {
    kalodata: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    serpapi: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'apify-shopee': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    metric: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'kalodata-video': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'apify-tiktok-comments': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'video-reading': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'meta-ad-library': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'official-stats': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    'world-bank': { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    pageindex: { lastDataAt: null, dataCount: 0, lastUsageAt: null },
    ...overrides,
  };
}

function input(overrides: Partial<SourceStatusInput> = {}): SourceStatusInput {
  return {
    workspaceId, checkedAt: '2026-02-03T00:00:00.000Z', executorEnabled: true, providers: undefined,
    wired: { kalodata: true, serpapi: true, apifyShopee: true },
    activity: { ...activity(), serpapiOperations: [] },
    ...overrides,
  };
}

const bySource = (status: ReturnType<typeof buildResearchAutomationSourceStatus>) => {
  const map = new Map(status.sources.map(item => [item.source, item] as const));
  return (id: ResearchAutomationSourceStatusEntry['source']) => {
    const card = map.get(id);
    assert.ok(card, `missing board card ${id}`);
    return card;
  };
};

test('every registry ID on the board exists in the source registry v1.9', () => {
  const doc = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)),
    '../../docs/research/ultimate-method/input-data-sources-30-sections.md'), 'utf8');
  const cardIds = new Set(Object.values(SOURCE_REGISTRY).flatMap(card => card.registryIds));
  assert.ok(cardIds.size > 0);
  for (const id of cardIds) {
    assert.match(doc, new RegExp(`^\\| ${id} \\|`, 'm'), `registry ID ${id} must exist in input-data-sources-30-sections.md`);
  }
  // The roster is exactly the eleven approved cards: the existing five plus the six additions.
  assert.deepEqual([...SOURCE_BOARD_ORDER], ['METRIC', 'KALODATA', 'KALODATA_VIDEO_FILE', 'APIFY_SHOPEE',
    'APIFY_TIKTOK_COMMENTS', 'VIDEO_READING', 'META_AD_LIBRARY', 'SERPAPI', 'OFFICIAL_STATS', 'WORLD_BANK', 'PAGEINDEX']);
});

test('mixed connectors carry per-ID tiers, never a fabricated aggregate', () => {
  assert.equal(SOURCE_REGISTRY.METRIC.tier, null);
  assert.equal(SOURCE_REGISTRY.METRIC.tierDetail, 'S01: C; S04: B');
  assert.equal(SOURCE_REGISTRY.SERPAPI.tier, null);
  assert.match(SOURCE_REGISTRY.SERPAPI.tierDetail!, /S19: theo trang gốc/);
  assert.equal(SOURCE_REGISTRY.PAGEINDEX.tier, null);
  assert.equal(SOURCE_REGISTRY.KALODATA.tier, 'C');
  assert.equal(SOURCE_REGISTRY.OFFICIAL_STATS.tier, 'A');
  assert.equal(SOURCE_REGISTRY.WORLD_BANK.tier, 'A');
});

test('board emits all eleven cards with registry metadata and truthful build states', () => {
  const status = buildResearchAutomationSourceStatus(input());
  assert.equal(status.sources.length, 11);
  assert.deepEqual(status.sources.map(item => item.source), [...SOURCE_BOARD_ORDER]);
  const sources = bySource(status);
  for (const id of SOURCE_BOARD_ORDER) {
    const card = sources(id);
    const registry = SOURCE_REGISTRY[id]!;
    assert.deepEqual([...card.registryIds!], registry.registryIds);
    assert.equal(card.tier ?? null, registry.tier);
    assert.equal(card.group, registry.group);
    assert.equal(card.reportName, registry.reportName);
    assert.equal(card.pendingPackage ?? null, registry.pendingPackage);
  }
  // The registry built flag determines the transition: built cards show their
  // operational state with no collector running; unbuilt cards show honest zeros.
  for (const id of SOURCE_BOARD_ORDER) {
    const card = sources(id);
    if (SOURCE_REGISTRY[id]!.built) {
      assert.notEqual(card.state, 'NOT_BUILT', `${id} is built and must show its operational state`);
    } else {
      assert.equal(card.state, 'NOT_BUILT', `${id} must not pretend its collector exists`);
      assert.equal(card.wiredIntoRuns, false);
      assert.equal(card.dataCount, 0);
      assert.equal(card.lastDataAt, null);
      assert.equal(card.lastUsageAt, null);
    }
  }
  assert.equal(sources('METRIC').state, 'MANUAL_IMPORT');
  assert.equal(sources('KALODATA_VIDEO_FILE').state, 'MANUAL_IMPORT');
  // EXECUTOR_DISABLED keeps precedence over every state including NOT_BUILT.
  const disabledStatus = buildResearchAutomationSourceStatus(input({ executorEnabled: false }));
  assert.ok(disabledStatus.sources.every(card => card.state === 'EXECUTOR_DISABLED'));
  const disabled = bySource(disabledStatus);
  assert.equal(disabled('APIFY_TIKTOK_COMMENTS').pendingPackage, 'P9', 'Metadata survives the disabled override');
});

test('TikTok cap is exposed exactly as configured and never defaulted', () => {
  const missing = bySource(buildResearchAutomationSourceStatus(input()));
  assert.equal(missing('APIFY_TIKTOK_COMMENTS').spendCapUsd, null);
  assert.equal(missing('APIFY_TIKTOK_COMMENTS').credential, 'MISSING');
  const configured = bySource(buildResearchAutomationSourceStatus(input({
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false, apifyTikTokComments: { maxChargeUsd: 3 } },
  })));
  assert.equal(configured('APIFY_TIKTOK_COMMENTS').spendCapUsd, 3);
  assert.equal(configured('APIFY_TIKTOK_COMMENTS').state, 'NOT_BUILT', 'A configured cap alone does not build the collector');
  // A present Apify token is honest credential evidence; the missing
  // independent cap still blocks collection and the card stays NOT_BUILT.
  const tokenPresent = bySource(buildResearchAutomationSourceStatus(input({
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true },
  })));
  assert.equal(tokenPresent('APIFY_TIKTOK_COMMENTS').credential, 'CONFIGURED');
  assert.equal(tokenPresent('APIFY_TIKTOK_COMMENTS').state, 'NOT_BUILT');
  assert.equal(tokenPresent('APIFY_TIKTOK_COMMENTS').spendCapUsd, null);
  // A token without a spending cap never starts a paid collection.
  const shopee = bySource(buildResearchAutomationSourceStatus(input({
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true },
  })));
  assert.equal(shopee('APIFY_SHOPEE').state, 'NOT_CONFIGURED');
  assert.equal(shopee('APIFY_SHOPEE').spendCapUsd, null);
});

test('future collector readiness never fabricates wiring or manual import for API collectors', () => {
  // Unbuilt stays NOT_BUILT no matter what evidence is present.
  for (const kind of ['MANUAL_UPLOAD', 'PAID_API', 'FREE_COLLECT'] as const) {
    assert.equal(futureCollectorState({ built: false, kind, credentialPresent: true, capUsable: true }), 'NOT_BUILT');
  }
  // Upload arrivals become manual import once built; collectors never do.
  assert.equal(futureCollectorState({ built: true, kind: 'MANUAL_UPLOAD', credentialPresent: false, capUsable: false }), 'MANUAL_IMPORT');
  // Paid API collectors: credential and cap evidence, never READY or MANUAL_IMPORT.
  assert.equal(futureCollectorState({ built: true, kind: 'PAID_API', credentialPresent: false, capUsable: false }), 'NOT_CONFIGURED');
  assert.equal(futureCollectorState({ built: true, kind: 'PAID_API', credentialPresent: true, capUsable: false }), 'NOT_CONFIGURED');
  assert.equal(futureCollectorState({ built: true, kind: 'PAID_API', credentialPresent: true, capUsable: true }), 'CONFIGURED_NOT_WIRED');
  // Free collectors: same ladder without a cap.
  assert.equal(futureCollectorState({ built: true, kind: 'FREE_COLLECT', credentialPresent: false, capUsable: false }), 'NOT_CONFIGURED');
  assert.equal(futureCollectorState({ built: true, kind: 'FREE_COLLECT', credentialPresent: true, capUsable: false }), 'CONFIGURED_NOT_WIRED');
  // TikTok comments are a paid API arrival: flipping built must not invent a manual-upload capability.
  assert.equal(SOURCE_REGISTRY.APIFY_TIKTOK_COMMENTS.arrival, 'PAID_API');
  assert.notEqual(futureCollectorState({ built: true, kind: SOURCE_REGISTRY.APIFY_TIKTOK_COMMENTS.arrival,
    credentialPresent: true, capUsable: true }), 'MANUAL_IMPORT');
  assert.notEqual(futureCollectorState({ built: true, kind: SOURCE_REGISTRY.APIFY_TIKTOK_COMMENTS.arrival,
    credentialPresent: true, capUsable: true }), 'READY');
});

test('SerpApi operations list known rows with observed counts and pass unknown operations through', () => {
  assert.deepEqual(SERPAPI_KNOWN_OPERATIONS.map(row => row.operation), ['serpapi.google.search', 'serpapi.google.trends']);
  const status = bySource(buildResearchAutomationSourceStatus(input({
    activity: { ...activity(), serpapiOperations: [
      { operation: 'serpapi.google.search', count: 3, lastDataAt: '2026-02-03T00:00:00.000Z', lastUsageAt: '2026-02-03T00:00:01.000Z' },
    ] },
  })));
  const operations = status('SERPAPI').operations!;
  assert.equal(operations.length, 2);
  assert.deepEqual(operations[0], { operation: 'serpapi.google.search', count: 3,
    lastDataAt: '2026-02-03T00:00:00.000Z', lastUsageAt: null, registryIds: ['S19', 'S13', 'S26'], tier: null });
  assert.deepEqual(operations[1], { operation: 'serpapi.google.trends', count: 0,
    lastDataAt: null, lastUsageAt: null, registryIds: ['S20'], tier: 'B' });
});

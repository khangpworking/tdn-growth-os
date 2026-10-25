import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import {
  COLLECTION_LANE_ORDINALS, attemptCollectionLanes, collectionLaneOrdinals, collectionLanes,
  collectionLaneUsage, collectionLanesCancelled, lanesBeforeVideo, lanesAfterVideo, storeCollectionLanes,
  type CollectionLane, type CollectionLaneContext, type CollectionRunFacts, type LaneCaptureStore,
} from '../../src/modules/analysis/research-automation/collection-lanes.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ComtradeCollection } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import type { OfficialStatsCollection } from '../../src/modules/analysis/research-automation/official-statistics-lane.js';
import { metaSearchUrl, type MetaAutoCollection } from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import { tiktokTopAdsUrl, type TikTokTopAdsCollection } from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import type { SearchGeoSource } from '../../src/modules/analysis/research-automation/search-geo.js';
import { syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { syntheticTrendsSource } from '../helpers/search-interest-synthetic.js';
import { syntheticGeoSource } from '../helpers/search-geo-synthetic.js';

const context: CollectionLaneContext = {
  keyword: 'synthetic product', description: null, mode: 'CATEGORY', reports: ['MARKET'],
  requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' },
  productTitles: () => [], webUrls: () => [], readPick: async () => null,
};
const step: StepResultDocument = {
  contractVersion: 'research-automation-step-result-v1', runId: '22222222-2222-4222-8222-222222222222',
  stepId: 'COLLECTION', outcome: 'PARTIAL', productCards: [], comparables: [], coverage: [],
  limitations: [{ code: 'SYNTHETIC_LIMIT', provider: null, message: 'Keep the existing step content.' }],
};
const fields = ['worldBank', 'comtrade', 'searchAds', 'officialStats'] as const;
type Field = typeof fields[number];
const comtrade: ComtradeCollection = {
  status: 'NO_DATA', hsCode: null, officialDescription: null, descriptionVi: null, reasonVi: null,
  attempts: [], calls: [], mirrorReporterCount: null, requests: 3,
};
const stats: OfficialStatsCollection = {
  status: 'NO_DATA', categoryGroup: null, reasonVi: null, list: null, files: [], tables: [], values: [], requests: 1,
};

// These settled responses retain no evidence, so the store must never receive a capture.
const noCaptures: LaneCaptureStore = async () => { assert.fail('unexpected capture storage'); };
const accept = () => {};
const indicator = (code: string, reason: string) => ({
  code, status: 'FAILED' as const, reason, retrievedAt: null, captureIndex: null,
  metadataCaptureIndex: null, sourceSha256: null, metadataSha256: null, row: null,
});
const documents = {
  worldBank: { profile: 'world-bank-vn-two-indicators-v1', indicators: [indicator('SP.POP.TOTL', 'EMPTY_RESPONSE')] },
  comtrade: { profile: 'comtrade-v1', status: 'NO_DATA', hsCode: null, officialDescription: null,
    descriptionVi: null, reasonVi: null, attempts: [], calls: [], rows: [], mirrorReporterCount: null },
  searchAds: { profile: 'search-ads-v2', status: 'NO_BRANDS', brands: [] },
  officialStats: { profile: 'official-stats-v1', status: 'NO_DATA', categoryGroup: null, reasonVi: null,
    listCaptureIndex: null, files: [], tables: [], values: [] },
};

function sources(throwLane?: Field) {
  const calls: Field[] = [];
  const collect = async <T>(name: Field, result: T): Promise<T> => {
    calls.push(name);
    if (name === throwLane) throw new Error('synthetic collect failure');
    return result;
  };
  return {
    calls,
    lanes: collectionLanes({
      worldBankSource: { collect: () => collect('worldBank', [{ code: 'SP.POP.TOTL', requests: 2,
        reason: 'EMPTY_RESPONSE', projection: null, observation: null, metadata: null }]) },
      comtradeSource: { collect: () => collect('comtrade', comtrade) },
      searchAdsSource: { collect: () => collect('searchAds', { status: 'NO_BRANDS', brands: [], requests: 0, ambiguousRequests: 0 } as const) },
      officialStatsSource: { collect: () => collect('officialStats', stats) },
    }),
  };
}

function fakeLanes(afterAttempt: () => void = accept) {
  const calls: string[] = [];
  const lanes: CollectionLane[] = (['worldBank', 'comtrade'] as const).map(name => ({
    name,
    async attempt() {
      calls.push(name);
      afterAttempt();
      return { name, store: async value => value, usage: () => [] };
    },
  }));
  return { calls, lanes };
}

test('the exported ordinal table has distinct valid ordinals and normalized providers', () => {
  // assertDistinctOrdinals is private: this checks the public table, without a test-only export.
  const ordinals = COLLECTION_LANE_ORDINALS.map(row => row.ordinal);
  assert.ok(ordinals.length > 0);
  assert.equal(new Set(ordinals).size, ordinals.length);
  for (const row of COLLECTION_LANE_ORDINALS) {
    assert.ok(Number.isInteger(row.ordinal) && row.ordinal >= 2);
    if (row.lane === 'web') assert.equal(row.provider, null);
    else {
      assert.equal(typeof row.provider, 'string');
      assert.ok(row.provider && row.provider.length > 0);
      assert.equal(row.provider, row.provider.toLowerCase());
    }
  }
});

test('QUICK_SEARCH skips public lane attempts while COLLECTION runs them', async () => {
  const f = fakeLanes();
  const signal = new AbortController().signal;
  assert.deepEqual(await attemptCollectionLanes(f.lanes, 'QUICK_SEARCH', context, signal), []);
  assert.deepEqual(f.calls, []);
  const runs = await attemptCollectionLanes(f.lanes, 'COLLECTION', context, signal);
  assert.deepEqual(runs.map(run => run.name), ['worldBank', 'comtrade']);
  assert.deepEqual(f.calls, ['worldBank', 'comtrade']);
});

test('abort prevents attempts both before collection and between lanes', async () => {
  const controller = new AbortController();
  controller.abort();
  const before = fakeLanes();
  assert.deepEqual(await attemptCollectionLanes(before.lanes, 'COLLECTION', context, controller.signal), []);
  assert.deepEqual(before.calls, []);

  const during = new AbortController();
  const between = fakeLanes(() => during.abort());
  const runs = await attemptCollectionLanes(between.lanes, 'COLLECTION', context, during.signal);
  assert.deepEqual(runs.map(run => run.name), ['worldBank']);
  assert.deepEqual(between.calls, ['worldBank']);
});

test('a collect throw changes only its lane document and later lanes still run in order', async () => {
  for (const thrown of [false, true]) {
    const f = sources(thrown ? 'comtrade' : undefined);
    const runs = await attemptCollectionLanes(f.lanes, 'COLLECTION', context, new AbortController().signal);
    assert.deepEqual(f.calls, ['worldBank', 'comtrade', 'searchAds', 'officialStats']);
    assert.deepEqual(runs.map(run => run.name), ['worldBank', 'comtrade', 'searchAds', 'officialStats']);
    const stored = await storeCollectionLanes(runs, step, noCaptures, accept);
    assert.deepEqual(stored, { ...step, ...documents,
      comtrade: { ...documents.comtrade, status: thrown ? 'FAILED' : 'NO_DATA' } });
  }
});

test('a check throw uses each lane own failed document and preserves every other document', async () => {
  const f = sources();
  const runs = await attemptCollectionLanes(f.lanes, 'COLLECTION', context, new AbortController().signal);
  assert.deepEqual(await storeCollectionLanes(runs, step, noCaptures, accept), { ...step, ...documents });
  for (const field of fields) {
    let rejected = false;
    const stored = await storeCollectionLanes(runs, step, noCaptures, probe => {
      if (!rejected && probe[field] !== undefined) {
        rejected = true;
        throw new Error('synthetic document or lineage rejection');
      }
    });
    assert.equal(rejected, true, `${field} reached validation`);
    const failed = field === 'worldBank'
      ? { profile: 'world-bank-vn-two-indicators-v1', indicators: [
        indicator('NE.CON.PRVT.PC.KD', 'DOCUMENT_INVALID'), indicator('SP.POP.TOTL', 'DOCUMENT_INVALID'),
      ] }
      : { ...documents[field], status: 'FAILED' };
    assert.deepEqual(stored, { ...step, ...documents, [field]: failed });
  }
});

test('usage returns settled rows alongside exactly one thrown lane ordinal and provider', async () => {
  const usage = (requestsIssued: number) => ({ requestsIssued, paidRequestsIssued: 0,
    ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } });
  for (const thrown of [false, true]) {
    const f = sources(thrown ? 'searchAds' : undefined);
    const runs = await attemptCollectionLanes(f.lanes, 'COLLECTION', context, new AbortController().signal);
    assert.deepEqual(collectionLaneUsage(runs), [
      { kind: 'USAGE', ordinal: 7, result: { provider: 'WORLD-BANK', usage: usage(2) } },
      { kind: 'USAGE', ordinal: 9, result: { provider: 'COMTRADE', usage: usage(3) } },
      ...(thrown ? [{ kind: 'UNSETTLED', ordinal: 10, provider: 'serpapi' }] : []),
      { kind: 'USAGE', ordinal: 11, result: { provider: 'OFFICIAL-STATS', usage: usage(1) } },
    ]);
  }
});

test('searchAds activity ordinals include its ads call and all three discovery calls', () => {
  assert.deepEqual(collectionLaneOrdinals('searchAds'), [10, 17, 18, 19]);
});

function runContext(overrides: Partial<CollectionRunFacts> = {}): CollectionLaneContext {
  return { ...context, run: {
    input: { runId: step.runId, mode: 'CATEGORY', keyword: context.keyword, requestedPeriod: context.requestedPeriod,
      country: 'VN', selectedProductRefs: [], peerProductRefs: [] },
    productAttempted: true, now: () => new Date('2026-10-02T00:00:00Z'),
    publish: async () => { throw new Error('unexpected attachment publication'); }, ...overrides,
  } };
}

const attempt = (lanes: readonly CollectionLane[], run = runContext()) =>
  attemptCollectionLanes(lanes, 'COLLECTION', run, new AbortController().signal);
const emptySearch = { status: 'FAILED', facts: null, captures: [] } as const;
const webSource = () => syntheticWebSource(accept, []);
// These rows check orchestration, not capture persistence (owned by the service characterization).
const captureOffset: LaneCaptureStore = async () => 0;

test('geo requires a produced trends period and reuses its keyword, skip and clipped range', async () => {
  const calls: { keyword: string; range: unknown }[] = [];
  let clock = new Date('2026-09-29T00:00:00Z');
  const run = runContext({ now: () => clock });
  const trendsGeoSource: SearchGeoSource = { id: 'SERPAPI', collect: async (keyword, _options, range) => {
    calls.push({ keyword, range }); return emptySearch;
  } };
  assert.deepEqual(await attempt(collectionLanes({ trendsGeoSource }), run), []);
  const lanes = collectionLanes({
    trendsSource: { id: 'SERPAPI', collect: async () => {
      clock = new Date('2026-10-02T00:00:00Z'); return emptySearch;
    } }, trendsGeoSource,
  });
  const geo = lanes.find(lane => lane.name === 'geo')!;
  assert.equal(await geo.attempt(run, new AbortController().signal, []), null);
  const runs = await attempt(lanes, run);
  assert.deepEqual(runs.map(value => value.name), ['trends', 'geo']);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls, [{ keyword: context.keyword, range: { startDate: '2025-10-01', endDate: '2026-09-29' } }]);

  calls.length = 0;
  clock = new Date('2020-01-01T00:00:00Z');
  const skipped = await attempt(lanes, run);
  assert.deepEqual(calls, []);
  const stored = await storeCollectionLanes(skipped, step, captureOffset, accept);
  assert.equal(stored.searchGeo?.status, 'SKIPPED');
  assert.equal(stored.searchGeo?.reason, 'PERIOD_IN_FUTURE');
});

test('expanded search is attempted only with a configured web source', async () => {
  let calls = 0;
  const expandedSource = { id: 'SERPAPI' as const, collect: async () => { calls++; return []; } };
  assert.deepEqual(await attempt(collectionLanes({ expandedSource })), []);
  assert.equal(calls, 0);
  const runs = await attempt(collectionLanes({ webSource: webSource(), expandedSource }));
  assert.deepEqual(runs.map(run => run.name), ['web', 'expanded']);
  assert.equal(calls, 1);
});

test('search ads receives earlier web and expanded URLs with plain-first deduplication and stable position sorting', async () => {
  const plain = syntheticWebSource(accept, [
    { position: 4, title: 'Plain', link: 'https://plain.example/item' },
    { position: 2, title: 'Plain tie', link: 'https://plain-tie.example/' },
  ]);
  const window = syntheticWebSource(accept, [
    { position: 1, title: 'Duplicate plain', link: 'http://PLAIN.example/item/#fragment' },
    { position: 3, title: 'Window', link: 'https://window.example/new' },
    { position: 2, title: 'Expanded tie', link: 'https://expanded-tie.example/' },
  ]);
  const shopee = syntheticWebSource(accept, [
    { position: 1, title: 'Duplicate window', link: 'http://window.example/new/#fragment' },
    { position: 1, title: 'Extra', link: 'https://extra.example/' },
  ]);
  const received: string[][] = [];
  const searchAdsSource = { collect: async (input: { webUrls: readonly string[] }) => {
    received.push([...input.webUrls]);
    return { status: 'NO_BRANDS', brands: [], requests: 0, ambiguousRequests: 0 } as const;
  } };
  await attempt(collectionLanes({ webSource: plain,
    expandedSource: { id: 'SERPAPI', collect: async input => [
      { kind: 'WINDOW', state: 'CALLED', requestedWindow: input.requestedPeriod, result: (await window.collect(input)).result },
      { kind: 'SHOPEE', state: 'CALLED', requestedWindow: null, result: (await shopee.collect(input)).result },
    ] }, searchAdsSource,
  }));
  await attempt(collectionLanes({ searchAdsSource }));
  assert.deepEqual(received, [[
    'https://extra.example/', 'https://plain-tie.example/', 'https://expanded-tie.example/',
    'https://window.example/new', 'https://plain.example/item',
  ], []]);
});

function attachmentCollections() {
  const read = { requestedUrl: metaSearchUrl('Synthetic'), finalUrl: metaSearchUrl('Synthetic'),
    outcome: 'READ' as const, stop: null, retained: true, textSha256: createHash('sha256').update('synthetic').digest('hex'), textBytes: 9,
    readAt: '2026-10-02T00:00:00Z' };
  const meta: MetaAutoCollection = { status: 'NO_DATA', stop: null, reasonVi: null, opens: 2,
    brands: [{ label: 'Synthetic', key: 'synthetic', status: 'PAGE_NOT_FOUND', pageId: null,
      searchRead: 0, pageRead: null, resultCount: null, resultCountSpan: null, refusedIds: 0, ads: [] }],
    reads: [{ read: { ...read, kind: 'SEARCH', brandIndex: 0 }, text: 'synthetic',
      fingerprint: { profile: 'meta-ad-library-visible-text-v1', htmlBytes: 0, textBytes: 9,
        textTruncated: false, candidatePageIds: 0, markers: {}, labels: {} } }],
  };
  const tiktok: TikTokTopAdsCollection = { status: 'NO_DATA', stop: null, reasonVi: null, opens: 1,
    keyword: context.keyword, cards: [], droppedCards: 0, refusedCards: 0,
    reads: [{ read: { ...read, requestedUrl: tiktokTopAdsUrl(context.keyword),
      finalUrl: tiktokTopAdsUrl(context.keyword) }, text: 'synthetic',
      fingerprint: { profile: 'tiktok-top-ads-visible-text-v1', htmlBytes: 0, textBytes: 9,
        textTruncated: false, markers: {}, labels: {} } }],
  };
  return { meta, tiktok };
}

test('Meta and TikTok publish through the after-video partition and honor a CANCELLING publish refusal', async () => {
  const { meta, tiktok } = attachmentCollections();
  for (const status of ['COLLECTING', 'CANCELLING'] as const) {
    const published: string[] = [], refusals: string[] = [];
    // The service owns the status guard. This boundary double makes its refusal observable to the module.
    const run = runContext({ publish: async (refusal, write) => {
      refusals.push(refusal);
      if (status === 'CANCELLING') throw new Error(refusal);
      return write({ intakeAutomationAttachment: async (_input, files) => {
        const profile = JSON.parse(Buffer.from(files.get('collection.json')!).toString()) as { profile: string };
        published.push(profile.profile);
        return { packageId: `synthetic-${published.length}`, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) };
      } });
    } });
    const runs = await attempt(collectionLanes({ webSource: webSource(),
      metaAutoSource: { collect: async () => meta }, tiktokTopAdsSource: { collect: async () => tiktok },
    }), run);
    assert.deepEqual(lanesBeforeVideo(runs).map(run => run.name), ['web']);
    assert.deepEqual(lanesAfterVideo(runs).map(run => run.name), ['metaAuto', 'tiktokTopAds']);
    const before = await storeCollectionLanes(lanesBeforeVideo(runs), step, captureOffset, accept);
    assert.equal(before.metaAuto, undefined);
    assert.equal(before.tiktokTopAds, undefined);
    assert.deepEqual(refusals, []);
    assert.deepEqual(collectionLaneUsage(lanesBeforeVideo(runs)).map(row => row.ordinal), [2]);
    const stored = await storeCollectionLanes(lanesAfterVideo(runs), before, noCaptures, accept);
    assert.deepEqual(refusals, ['This run cannot publish a Meta ad library read.', 'This run cannot publish a TikTok top-ads read.']);
    assert.deepEqual(published, status === 'COLLECTING'
      ? ['meta-ad-library-visible-text-v1', 'tiktok-top-ads-visible-text-v1'] : []);
    assert.equal(stored.metaAuto?.evidence?.packageId ?? null, status === 'COLLECTING' ? 'synthetic-1' : null);
    assert.equal(stored.tiktokTopAds?.evidence?.packageId ?? null, status === 'COLLECTING' ? 'synthetic-2' : null);
    assert.equal(stored.metaAuto?.reads[0]?.retained, status === 'COLLECTING');
    assert.equal(stored.tiktokTopAds?.reads[0]?.retained, status === 'COLLECTING');
    assert.deepEqual(collectionLaneUsage(lanesAfterVideo(runs)).map(row =>
      [row.kind, row.ordinal, row.kind === 'USAGE' ? row.result.provider : row.provider,
        row.kind === 'USAGE' ? row.result.usage.requestsIssued : null]), [
      ['USAGE', 12, 'META-AD-LIBRARY', 2], ['USAGE', 13, 'TIKTOK-TOP-ADS', 1],
    ]);
  }
});

test('only web, trends and expanded results contribute to the module cancellation roll-up', async () => {
  const { meta, tiktok } = attachmentCollections();
  for (const cancelled of [null, 'web', 'trends', 'expanded', 'geo', 'comtrade', 'officialStats', 'metaAuto', 'tiktokTopAds']) {
    const web = webSource();
    const runs = await attempt(collectionLanes({
      webSource: { ...web, collect: async (input, options) => {
        const bound = await web.collect(input, options);
        return { ...bound, result: { ...bound.result, status: cancelled === 'web' ? 'CANCELLED' : bound.result.status } };
      } },
      trendsSource: { id: 'SERPAPI', collect: async () => ({ ...emptySearch, status: cancelled === 'trends' ? 'CANCELLED' : 'FAILED' }) },
      trendsGeoSource: { id: 'SERPAPI', collect: async () => ({ ...emptySearch, status: cancelled === 'geo' ? 'CANCELLED' : 'FAILED' }) },
      expandedSource: { id: 'SERPAPI', collect: async input => [{ kind: 'WINDOW', state: 'CALLED', requestedWindow: input.requestedPeriod,
        result: { ...(await web.collect(input)).result, status: cancelled === 'expanded' ? 'CANCELLED' : 'SUCCEEDED' } }] },
      comtradeSource: { collect: async () => ({ ...comtrade, status: cancelled === 'comtrade' ? 'CANCELLED' : 'NO_DATA' }) },
      officialStatsSource: { collect: async () => ({ ...stats, status: cancelled === 'officialStats' ? 'CANCELLED' : 'NO_DATA' }) },
      metaAutoSource: { collect: async () => ({ ...meta, status: cancelled === 'metaAuto' ? 'CANCELLED' : 'NO_DATA' }) },
      tiktokTopAdsSource: { collect: async () => ({ ...tiktok, status: cancelled === 'tiktokTopAds' ? 'CANCELLED' : 'NO_DATA' }) },
    }));
    assert.equal(collectionLanesCancelled(runs), ['web', 'trends', 'expanded'].includes(cancelled ?? ''), String(cancelled));
  }
});

test('a throwing web lane still lets trends, geo and expanded run and store in order', async () => {
  for (const thrown of [false, true]) {
    const calls: string[] = [];
    const web = webSource();
    const runs = await attempt(collectionLanes({
      webSource: { ...web, collect: async (input, options) => {
        calls.push('web');
        if (thrown) throw new Error('synthetic web failure');
        return web.collect(input, options);
      } },
      trendsSource: syntheticTrendsSource(() => calls.push('trends'), 'ok', context.keyword),
      trendsGeoSource: syntheticGeoSource(() => calls.push('geo'), 'ok', undefined, context.keyword),
      expandedSource: { id: 'SERPAPI', collect: async () => { calls.push('expanded'); return []; } },
    }));
    assert.deepEqual(calls, ['web', 'trends', 'geo', 'expanded']);
    assert.deepEqual(runs.map(run => run.name), calls);
    const stored = await storeCollectionLanes(runs, step, captureOffset, accept);
    assert.equal(stored.searchInterest?.status, 'COLLECTED');
    assert.equal(stored.searchGeo?.status, 'COLLECTED');
    assert.deepEqual(collectionLaneUsage(runs).map(row => [row.kind, row.ordinal]), [
      [thrown ? 'UNSETTLED' : 'USAGE', 2], ['USAGE', 3], ['USAGE', 16],
    ]);
  }
});

test('a whole expanded collect throw and a per-query throw each keep one UNKNOWN row at ordinal 4', async () => {
  for (const wholeThrow of [false, true]) {
    const runs = await attempt(collectionLanes({ webSource: webSource(),
      expandedSource: { id: 'SERPAPI', collect: async () => {
        if (wholeThrow) throw new Error('synthetic whole expanded failure');
        return [{ kind: 'WINDOW', state: 'THROWN' }];
      } },
    }));
    const stored = await storeCollectionLanes(runs, step, captureOffset, accept);
    assert.deepEqual(stored.expandedSearch, wholeThrow ? undefined : { queries: [{
      kind: 'WINDOW', requestedWindow: null, status: 'FAILED', reason: 'PROVIDER_FAILED',
      retrievedAt: null, captureIndex: null, results: [],
    }] });
    // c1 PR4 owner decision 24/10/2026: Q1
    assert.deepEqual(collectionLaneUsage(runs).filter(row => row.kind === 'UNSETTLED'),
      [{ kind: 'UNSETTLED', ordinal: 4, provider: 'serpapi' }]);
  }
});

test('c1 PR4 bug 2: rejected trends/geo documents keep their range; skipped attempts carry none', async () => {
  for (const skipped of [false, true]) {
    const calls: string[] = [];
    const runs = await attempt(collectionLanes({
      trendsSource: syntheticTrendsSource(() => calls.push('trends'), 'ok', context.keyword),
      trendsGeoSource: syntheticGeoSource(() => calls.push('geo'), 'ok', undefined, context.keyword),
    }), runContext({ now: () => new Date(skipped ? '2020-01-01T00:00:00Z' : '2026-10-02T00:00:00Z') }));
    const stored = await storeCollectionLanes(runs, step, captureOffset, probe => {
      if (probe.searchInterest?.status === 'COLLECTED' || probe.searchGeo?.status === 'COLLECTED')
        throw new Error('synthetic document rejection');
    });
    assert.deepEqual(calls, skipped ? [] : ['trends', 'geo']);
    for (const series of [stored.searchInterest, stored.searchGeo]) {
      assert.ok(series);
      assert.deepEqual([series.status, series.reason, series.window, series.requestedRange, series.captureIndex], skipped
        ? ['SKIPPED', 'PERIOD_IN_FUTURE', 'LAST_12_MONTHS', undefined, null]
        : ['FAILED', 'PROVIDER_FAILED', 'REQUESTED_RANGE', context.requestedPeriod, null]);
    }
    assert.deepEqual(stored.searchInterest?.points, []);
    assert.deepEqual(stored.searchGeo?.provinces, []);
    assert.equal(stored.outcome, step.outcome);
  }
});

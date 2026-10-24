import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COLLECTION_LANE_ORDINALS, attemptCollectionLanes, collectionLaneOrdinals, collectionLanes,
  collectionLaneUsage, storeCollectionLanes,
  type CollectionLane, type CollectionLaneContext, type LaneCaptureStore,
} from '../../src/modules/analysis/research-automation/collection-lanes.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ComtradeCollection } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import type { OfficialStatsCollection } from '../../src/modules/analysis/research-automation/official-statistics-lane.js';

const context: CollectionLaneContext = {
  keyword: 'synthetic product', description: null, mode: 'CATEGORY',
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

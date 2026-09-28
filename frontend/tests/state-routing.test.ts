import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedState, demoReducer, laneOrder, marketMatches, passCount } from '../src/model';
import { parseRoute, routeToHash } from '../src/routing';

test('market relationships, search, empty creation and routes use IDs', () => {
  let state = createSeedState();
  assert.equal(state.markets.length, 3);
  assert.equal(state.products.filter((product) => product.marketId === 'calcium').length, 2);
  assert.equal(marketMatches(state.markets[0]!, 'calcium'), true);
  assert.equal(marketMatches(state.markets[1]!, 'calcium'), false);
  state = demoReducer(state, { type: 'create-market', id: 'market-new', name: '  Thị trường mới  ', keywords: ' new ' });
  assert.deepEqual(state.markets.at(-1), { id: 'market-new', name: 'Thị trường mới', keywords: 'new', note: 'Workspace mới chưa có dữ liệu nghiên cứu hoặc ứng viên.' });
  state = demoReducer(state, { type: 'create-market', id: 'market-same-name', name: 'Thị trường mới', keywords: 'new' });
  assert.equal(state.markets.filter((market) => market.name === 'Thị trường mới').length, 2);
  assert.equal(state.products.some((product) => product.marketId === 'market-new'), false);
  assert.deepEqual(parseRoute(routeToHash.market('market-new'), state), { kind: 'market', marketId: 'market-new' });
  assert.deepEqual(parseRoute(routeToHash.product('calcium', 'adult'), state), { kind: 'product', marketId: 'calcium', productId: 'adult', section: 'b8' });
  const campaignId = '66666666-6666-4666-8666-0000000000c1';
  assert.deepEqual(parseRoute(routeToHash.campaignInsight(campaignId), state), { kind: 'campaign-insight', campaignId });
  assert.equal(parseRoute('#/content/not-a-uuid/insight', state).kind, 'invalid');
  assert.equal(parseRoute(routeToHash.product('collagen', 'adult'), state).kind, 'invalid');
  assert.equal(parseRoute('#/markets/missing', state).kind, 'invalid');
  assert.equal(parseRoute('#/markets/%E0%A4%A', state).kind, 'invalid');
});

test('B8 updates are append-only and isolated by product and market', () => {
  const seed = createSeedState();
  const childBefore = seed.products.find((product) => product.id === 'child')!;
  const collagenBefore = seed.products.find((product) => product.id === 'collagen-liquid')!;
  const adultBefore = seed.products.find((product) => product.id === 'adult')!;
  const changed = demoReducer(seed, { type: 'decide', productId: 'adult', lane: 'LEGAL', decision: 'PASS', time: '10:00 · test' });
  const adultAfter = changed.products.find((product) => product.id === 'adult')!;
  assert.equal(adultAfter.states.LEGAL, 'PASS');
  assert.equal(adultAfter.history.length, adultBefore.history.length + 1);
  assert.deepEqual(changed.products.find((product) => product.id === 'child'), childBefore);
  assert.deepEqual(changed.products.find((product) => product.id === 'collagen-liquid'), collagenBefore);
  assert.equal(changed.markets, seed.markets);
  assert.equal(demoReducer(changed, { type: 'decide', productId: 'adult', lane: 'LEGAL', decision: 'PASS', time: '10:01 · test' }), changed);
});

test('four PASS creates one historical clearance that survives a later lane change', () => {
  let state = createSeedState();
  for (const lane of laneOrder) state = demoReducer(state, { type: 'decide', productId: 'child', lane, decision: 'PASS', time: `${lane} · test` });
  const ready = state.products.find((product) => product.id === 'child')!;
  assert.equal(passCount(ready), 4);
  state = demoReducer(state, { type: 'create-clearance', productId: 'child', time: '11:00 · test' });
  const clearance = state.products.find((product) => product.id === 'child')!.clearance;
  assert.ok(clearance);
  assert.deepEqual(Object.keys(clearance.decisionIds), laneOrder);
  const duplicate = demoReducer(state, { type: 'create-clearance', productId: 'child', time: '11:01 · test' });
  assert.equal(duplicate, state);
  state = demoReducer(state, { type: 'decide', productId: 'child', lane: 'LEGAL', decision: 'HOLD', time: '11:02 · test' });
  const changed = state.products.find((product) => product.id === 'child')!;
  assert.equal(changed.states.LEGAL, 'HOLD');
  assert.deepEqual(changed.clearance, clearance);
});

test('reset returns an independent synthetic seed', () => {
  const seed = createSeedState();
  const changed = demoReducer(seed, { type: 'decide', productId: 'adult', lane: 'FINANCE', decision: 'REJECT', time: 'test' });
  const reset = demoReducer(changed, { type: 'reset' });
  assert.deepEqual(reset, createSeedState());
  assert.notEqual(reset, seed);
});


test('demo candidate create and revision are synthetic, isolated, and retain historical product linkage', () => {
  const seed=createSeedState();
  const created=demoReducer(seed,{type:'create-candidate',id:'candidate-demo',marketId:'sleep',key:'candidate-hidden',name:'  Magiê buổi tối  ',summary:'  Giả thuyết tổng hợp.  '});
  assert.deepEqual(created.candidates.at(-1),{id:'candidate-demo',marketId:'sleep',key:'candidate-hidden',version:1,name:'Magiê buổi tối',summary:'Giả thuyết tổng hợp.',productId:null,productCandidateVersion:null});
  assert.equal(created.products,seed.products);
  const revised=demoReducer(created,{type:'revise-candidate',id:'candidate-calcium-adult',name:'Canxi người trưởng thành mới',summary:'Bản mô tả mới.'});
  const candidate=revised.candidates.find(item=>item.id==='candidate-calcium-adult')!;
  assert.equal(candidate.version,3); assert.equal(candidate.productCandidateVersion,1); assert.equal(candidate.productId,'adult');
  assert.equal(revised.products.find(item=>item.id==='adult')?.candidateVersion,1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { frontendMode, loadRealWorkspaceState, WorkspaceDataSourceError } from '../src/data-source';

const ids = {
  w1: '11111111-1111-4111-8111-111111111111', w2: '11111111-1111-4111-8111-222222222222',
  c1: '22222222-2222-4222-8222-111111111111', p1: '33333333-3333-4333-8333-111111111111',
  basket: '44444444-4444-4444-8444-111111111111', b7: '55555555-5555-4555-8555-111111111111',
  d1: '66666666-6666-4666-8666-111111111111', d2: '66666666-6666-4666-8666-222222222222', d3: '66666666-6666-4666-8666-333333333333',
} as const;
const at = '2026-10-01T00:00:00.000Z';
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const workspace = (workspaceId: string, candidateCount: number, productCount: number) => ({ workspaceId, workspaceKey: `key-${workspaceId}`, state: 'ACTIVE', title: 'Trùng tên', createdAt: at, candidateCount, productCount });
const productSummary = { productWorkspaceId: ids.p1, productWorkspaceKey: 'product-one', state: 'ACTIVE', entryStep: 'B8', title: 'Sản phẩm', createdAt: at };

function validResponses(): Map<string, unknown> {
  const w1 = workspace(ids.w1, 1, 1); const w2 = workspace(ids.w2, 0, 0);
  return new Map<string, unknown>([
    ['/api/workspaces', { contractVersion: '1.0.0', workspaces: [w1, w2] }],
    [`/api/workspaces/${ids.w1}`, { contractVersion: '1.0.0', workspace: w1, candidates: [{ candidateId: ids.c1, candidateKey: 'candidate-one', state: 'EXPLORING', version: 3, label: 'Ứng viên', createdAt: at }], products: [productSummary] }],
    [`/api/workspaces/${ids.w2}`, { contractVersion: '1.0.0', workspace: w2, candidates: [], products: [] }],
    [`/api/product-workspaces/${ids.p1}`, { contractVersion: '1.0.0', product: { ...productSummary, sourceWorkspaceId: ids.w1, sourceBasketId: ids.basket, sourceBasketKey: 'basket-one', sourceBasketVersion: 1, sourceCandidateId: ids.c1, sourceCandidateKey: 'candidate-one', sourceCandidateVersion: 3, sourceCandidateLabel: 'Ứng viên', sourceB7DecisionId: ids.b7, sourceB7DecidedAt: at }, b8: { readyForB9: false, lanes: [
      { lane: 'LEGAL', effectiveState: 'PASS', decisionId: ids.d1, decisionVersion: 1, decidedAt: at }, { lane: 'SCIENTIFIC', effectiveState: 'NO_DECISION' }, { lane: 'QUALITY', effectiveState: 'HOLD', decisionId: ids.d2, decisionVersion: 1, decidedAt: at }, { lane: 'FINANCE', effectiveState: 'REJECT', decisionId: ids.d3, decisionVersion: 1, decidedAt: at },
    ] } }],
  ]);
}
const fetchFrom = (responses: Map<string, unknown>) => (async (input: string | URL | Request) => json(responses.get(String(input)))) as typeof fetch;

test('real mode is default and demo requires an explicit URL parameter', () => {
  assert.equal(frontendMode(''), 'real');
  assert.equal(frontendMode('?mode=real'), 'real');
  assert.equal(frontendMode('?mode=demo'), 'demo');
});

test('loads real portfolio/details by IDs and exact candidate versions without inferring duplicate names', async () => {
  const state = await loadRealWorkspaceState(fetchFrom(validResponses()));
  assert.deepEqual(state.markets.map((market) => [market.id, market.name]), [[ids.w1, 'Trùng tên'], [ids.w2, 'Trùng tên']]);
  assert.deepEqual(state.candidates.map((candidate) => [candidate.marketId, candidate.version]), [[ids.w1, 3]]);
  assert.deepEqual(state.products.map((product) => [product.marketId, product.candidateVersion]), [[ids.w1, 3]]);
  assert.deepEqual(state.products[0]?.states, { LEGAL: 'PASS', SCIENTIFIC: 'NONE', QUALITY: 'HOLD', FINANCE: 'REJECT' });
});

test('truthfully preserves an empty real portfolio', async () => {
  const state = await loadRealWorkspaceState((async () => json({ contractVersion: '1.0.0', workspaces: [] })) as typeof fetch);
  assert.deepEqual(state.markets, []);
  assert.deepEqual(state.products, []);
});

test('rejects malformed nested responses and inconsistent relationships', async () => {
  for (const mutate of [
    (responses: Map<string, unknown>) => { (responses.get(`/api/workspaces/${ids.w1}`) as any).workspace.candidateCount = 2; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).product.sourceCandidateVersion = 2; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).b8.lanes[0].decisionVersion = '1'; },
    (responses: Map<string, unknown>) => { (responses.get(`/api/product-workspaces/${ids.p1}`) as any).b8.readyForB9 = true; },
  ]) {
    const responses = validResponses(); mutate(responses);
    await assert.rejects(loadRealWorkspaceState(fetchFrom(responses)), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
  }
});

test('connection and integrity failures remain distinct without demo fallback', async () => {
  await assert.rejects(loadRealWorkspaceState((async () => { throw new Error('private path'); }) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'connection');
  await assert.rejects(loadRealWorkspaceState((async () => json({ error: { code: 'integrity_error' } }, 500)) as typeof fetch), (error) => error instanceof WorkspaceDataSourceError && error.kind === 'integrity');
});

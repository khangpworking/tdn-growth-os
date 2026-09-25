import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createSeedState } from '../src/model';
import { parseRoute, routeToHash } from '../src/routing';
import {
  BRAND_ELEMENTS,
  BRAND_PURPOSES,
  ContentDataSourceError,
  DEFAULT_DISPLAY_RULES,
  brandDraftBlocker,
  brandRequestFromDraft,
  createDemoBrand,
  emptyBrandDraft,
  generatedBrandKey,
  loadBrand,
  loadBrands,
  reviseDemoBrand,
  submitBrandCreate,
  submitBrandRevision,
} from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';

const brandId = '66666666-6666-4666-8666-000000000001';
const time = '2027-01-01T00:00:00.000Z';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('brand routes parse and build without depending on workspace state', () => {
  const state = createSeedState();
  assert.deepEqual(parseRoute(routeToHash.brands(), state), { kind: 'brands' });
  assert.deepEqual(parseRoute(routeToHash.brand(brandId), state), { kind: 'brand', brandId });
  assert.equal(parseRoute('#/brands/not-a-uuid', state).kind, 'invalid');
  assert.equal(parseRoute('#/brands/a/b', state).kind, 'invalid');
});

test('default display rules match the approved Task 047 table', () => {
  assert.deepEqual(BRAND_PURPOSES.map((purpose) => purpose.key), ['sales', 'trust', 'education', 'entertainment', 'engagement']);
  assert.deepEqual(BRAND_ELEMENTS.map((element) => element.key), ['name', 'logo', 'tagline', 'hotline', 'web', 'address']);
  assert.deepEqual(DEFAULT_DISPLAY_RULES.sales, { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' });
  assert.deepEqual(DEFAULT_DISPLAY_RULES.trust, { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' });
  assert.deepEqual(DEFAULT_DISPLAY_RULES.education, { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' });
  assert.deepEqual(DEFAULT_DISPLAY_RULES.entertainment, { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' });
  assert.deepEqual(DEFAULT_DISPLAY_RULES.engagement, { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' });
});

test('drafts become trimmed requests without empty optional facts', () => {
  const draft = { ...emptyBrandDraft(), brandName: '  Canxi Việt ', hotline: ' 0900 000 000 ', website: '   ' };
  assert.deepEqual(brandRequestFromDraft(draft), { profile: { brandName: 'Canxi Việt', hotline: '0900 000 000' }, displayRules: DEFAULT_DISPLAY_RULES });
  assert.equal(brandDraftBlocker(draft), null);
  assert.equal(brandDraftBlocker(emptyBrandDraft()), 'Nhập tên thương hiệu.');
  assert.equal(brandDraftBlocker({ ...draft, brandName: 'x'.repeat(121) }), 'Tên thương hiệu tối đa 120 ký tự.');
  assert.equal(brandDraftBlocker({ ...draft, hotline: '1'.repeat(65) }), 'Hotline tối đa 64 ký tự.');
  assert.match(generatedBrandKey('ABCDEF01-2345-4678-9abc-def012345678'), /^brand-[0-9a-f]{32}$/);
});

test('read responses are validated before use', async () => {
  const summary = { brandId, brandKey: 'canxi-viet', version: 2, brandName: 'Canxi Việt', updatedAt: time };
  const list = await loadBrands(async () => json(200, { contractVersion: '1.0.0', brands: [summary] }));
  assert.deepEqual(list, [summary]);
  await assert.rejects(loadBrands(async () => json(200, { contractVersion: '1.0.0', brands: [{ ...summary, version: 0 }] })), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  await assert.rejects(loadBrands(async () => json(500, { error: { code: 'integrity_error', message: 'x' } })), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  await assert.rejects(loadBrands(async () => { throw new TypeError('offline'); }), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'connection');
  const detail = { contractVersion: '1.0.0', brand: { brandId, brandKey: 'canxi-viet', version: 1, profile: { brandName: 'Canxi Việt' }, displayRules: DEFAULT_DISPLAY_RULES, createdAt: time }, history: [{ version: 1, brandName: 'Canxi Việt', createdAt: time }] };
  assert.equal((await loadBrand(brandId, async () => json(200, detail))).brand.version, 1);
  await assert.rejects(loadBrand(brandId, async () => json(200, { ...detail, brand: { ...detail.brand, brandId: '66666666-6666-4666-8666-000000000002' } })), ContentDataSourceError);
  assert.equal(await loadBrand(brandId, async () => json(404, { error: { code: 'not_found', message: 'x' } })), null);
});

test('OWNER submissions post exact bodies and map failures', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const receipt = { contractVersion: '1.0.0', brandId, brandKey: 'brand-abc', version: 1, brandName: 'Canxi Việt', createdAt: time, exactRetry: false };
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return json(201, receipt); };
  const request = brandRequestFromDraft({ ...emptyBrandDraft(), brandName: 'Canxi Việt' });
  assert.deepEqual(await submitBrandCreate({ ...request, brandKey: 'brand-abc', token: 'token-1234567890abcdef1234567890abcd' }, fetcher), receipt);
  assert.equal(calls[0]!.url, '/owner-api/content/brands');
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, 'Bearer token-1234567890abcdef1234567890abcd');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { contractVersion: '1.0.0', brandKey: 'brand-abc', ...request });
  await submitBrandRevision({ ...request, brandId, expectedVersion: 1, token: 'token-1234567890abcdef1234567890abcd' }, async (url, init) => { calls.push({ url: String(url), init: init! }); return json(201, { ...receipt, version: 2 }); });
  assert.equal(calls[1]!.url, `/owner-api/content/brands/${brandId}/revisions`);
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { contractVersion: '1.0.0', expectedVersion: 1, ...request });
  for (const [status, kind] of [[409, 'conflict'], [401, 'unauthorized'], [403, 'forbidden'], [400, 'invalid'], [500, 'integrity']] as const) {
    await assert.rejects(submitBrandCreate({ ...request, brandKey: 'brand-abc', token: 't' }, async () => json(status, { error: { code: 'x', message: 'x' } })), (error: unknown) => error instanceof OwnerWriteError && error.kind === kind);
  }
  await assert.rejects(submitBrandCreate({ ...request, brandKey: 'brand-abc', token: 't' }, async () => { throw new TypeError('offline'); }), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'connection');
  await assert.rejects(submitBrandCreate({ ...request, brandKey: 'brand-abc', token: 't' }, async () => json(201, { ...receipt, extra: true })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('demo brands are versioned in memory only', () => {
  const draft = { ...emptyBrandDraft(), brandName: 'Demo' };
  const created = createDemoBrand([], draft, brandId, time);
  assert.equal(created.length, 1);
  assert.equal(created[0]!.version, 1);
  const revised = reviseDemoBrand(created, brandId, 1, { ...draft, tagline: 'Mới' }, time);
  assert.equal(revised[0]!.version, 2);
  assert.equal(revised[0]!.history.length, 2);
  assert.equal(revised[0]!.profile.tagline, 'Mới');
  assert.throws(() => reviseDemoBrand(revised, brandId, 1, draft, time), /conflict/);
});

test('content frontend sources contain no hard-coded development or remote origins', () => {
  const sources = ['frontend/src/content-data-source.ts', 'frontend/src/BrandsPage.tsx'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /https?:\/\/[^'"`\s]+|(?:localhost|127\.0\.0\.1):\d+/);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { once } from 'node:events';
import http from 'node:http';
import test from 'node:test';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import contentApiSchema from '../../contracts/api/content-api.schema.json' with { type: 'json' };
import ownerContentPackageApiSchema from '../../contracts/api/owner-content-package-api.schema.json' with { type: 'json' };
import packageGenerateSchema from '../../contracts/flow/content-package-generate-request.schema.json' with { type: 'json' };
import packageCreateSchema from '../../contracts/flow/content-package-create-request.schema.json' with { type: 'json' };
import ideaGenerateSchema from '../../contracts/flow/content-idea-generate-request.schema.json' with { type: 'json' };
import packageStateSchema from '../../contracts/flow/content-package-state-request.schema.json' with { type: 'json' };
import packageVersionArtifactSchema from '../../contracts/flow/content-package-version-artifact.schema.json' with { type: 'json' };
import catalogCreateSchema from '../../contracts/flow/content-catalog-item-create-request.schema.json' with { type: 'json' };
import promptCreateSchema from '../../contracts/flow/content-prompt-create-request.schema.json' with { type: 'json' };
import campaignCreateSchema from '../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import insightRevisionSchema from '../../contracts/flow/content-insight-revision-request.schema.json' with { type: 'json' };
import insightLockArtifactSchema from '../../contracts/flow/content-insight-lock-artifact.schema.json' with { type: 'json' };
import ideaStateSchema from '../../contracts/flow/content-idea-state-request.schema.json' with { type: 'json' };
import purposeTagSchema from '../../contracts/flow/content-purpose-tag-request.schema.json' with { type: 'json' };
import defaultsSchema from '../../contracts/flow/content-campaign-defaults-request.schema.json' with { type: 'json' };
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { createFakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { fixtureAt, fixtureCampaignContent, fixtureCampaignId, createPackageFixture, imageReply, textReply } from '../helpers/content-package-fixture.js';
import { fixtureImage } from '../helpers/content-images.js';

const token = 'synthetic-owner-token-051-with-at-least-32-characters';
const origin = 'http://synthetic-owner.example';
const packageRequestId = (number: number): string => `05130000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

function createBody(campaignId: string, angleId: string, requestId = packageRequestId(1)): Record<string, unknown> {
  return {
    contractVersion: '1.0.0', requestId,
    caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [], includeLogo: false },
    rows: [{ angleId }], campaignId,
  };
}

function ownerCreateBody(campaignId: string, angleId: string, requestId = packageRequestId(1)): Record<string, unknown> {
  const body = createBody(campaignId, angleId, requestId);
  const { campaignId: _campaign, ...owner } = body;
  return owner;
}

function defaultsBody() {
  return {
    contractVersion: '1.0.0', expectedVersion: 0,
    defaults: {
      caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
      poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [], includeLogo: false },
    },
  };
}

async function listen(handler: http.RequestListener): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

function validateContracts(): { readonly owner: (value: unknown) => boolean; readonly content: (value: unknown) => boolean } {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ownerAjv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ownerAjv);
  for (const schema of [packageCreateSchema, ideaGenerateSchema, packageGenerateSchema, packageStateSchema, packageVersionArtifactSchema]) ownerAjv.addSchema(schema);
  const contentAjv = new Ajv2020({ allErrors: true, strict: true }); addFormats(contentAjv);
  for (const schema of [catalogCreateSchema, promptCreateSchema, campaignCreateSchema, insightRevisionSchema, insightLockArtifactSchema, ideaGenerateSchema, ideaStateSchema, purposeTagSchema, packageCreateSchema, defaultsSchema]) contentAjv.addSchema(schema);
  return { owner: ownerAjv.compile(ownerContentPackageApiSchema), content: contentAjv.compile(contentApiSchema) };
}

test('Task 051 schemas are in the contract generator inventory', () => {
  const generator = fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8');
  for (const [module, contract] of [
    ['api', 'owner-content-package-api'],
    ['flow', 'content-package-create-request'], ['flow', 'content-package-artifact'],
    ['flow', 'content-package-generate-request'], ['flow', 'content-package-version-request'],
    ['flow', 'content-package-version-artifact'], ['flow', 'content-package-state-request'],
    ['flow', 'content-campaign-defaults-request'],
  ]) assert.match(generator, new RegExp(`\\['${module}', '${contract}'\\]`));
});

test('GET package list/detail/poster routes are contract-shaped, fail closed and serve inert poster bytes', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  const gateway = createFakeCreativeGateway({ text: [textReply('{"post":"API caption"}')], image: [imageReply()] });
  let nextId = 600;
  const owner = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway, uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: () => new Date(fixtureAt) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  const contracts = validateContracts();
  try {
    const create = await fetch(`${ownerServer.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) });
    assert.equal(create.status, 201);
    const createReceipt = await create.json(); assert.equal(contracts.owner(createReceipt), true);
    const created = createReceipt as { packages: [{ packageId: string }] };
    const generateCaption = await fetch(`${ownerServer.base}/owner-api/content/packages/${created.packages[0]!.packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 2, requestId: packageRequestId(2) }) });
    assert.equal(generateCaption.status, 201); assert.equal(contracts.owner(await generateCaption.json()), true);
    const generatePoster = await fetch(`${ownerServer.base}/owner-api/content/packages/${created.packages[0]!.packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'POSTER', plannedCallCount: 2, requestId: packageRequestId(3) }) });
    assert.equal(generatePoster.status, 201); assert.equal(contracts.owner(await generatePoster.json()), true);
    await state.campaigns.reviseCampaign({
      contractVersion: '1.0.0', campaignId: fixtureCampaignId, expectedVersion: 1,
      campaign: { ...fixtureCampaignContent, name: 'Synthetic campaign — newer version' },
    });

    const list = await fetch(`${readServer.base}/api/content/campaigns/${fixtureCampaignId}/packages`);
    assert.equal(list.status, 200); const listBody = await list.json(); assert.equal(contracts.content(listBody), true);
    assert.equal((listBody as { packages: unknown[] }).packages.length, 1);
    const detail = await fetch(`${readServer.base}/api/content/packages/${created.packages[0]!.packageId}`);
    assert.equal(detail.status, 200); const detailBody = await detail.json(); assert.equal(contracts.content(detailBody), true);
    assert.equal((detailBody as { campaignName: string }).campaignName, fixtureCampaignContent.name);
    assert.equal((detailBody as { captions: unknown[]; posters: unknown[] }).captions.length, 1);
    assert.equal((detailBody as { posters: unknown[] }).posters.length, 1);
    const poster = await fetch(`${readServer.base}/api/content/packages/${created.packages[0]!.packageId}/posters/1`);
    assert.equal(poster.status, 200);
    assert.equal(poster.headers.get('content-type'), 'image/jpeg');
    assert.equal(poster.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(poster.headers.get('cache-control'), 'private, max-age=31536000, immutable');
    assert.equal(poster.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(poster.headers.get('content-disposition'), 'inline');
    assert.equal(poster.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.equal(Number(poster.headers.get('content-length')), (await poster.clone().arrayBuffer()).byteLength);
    assert.equal((await fetch(`${readServer.base}/api/content/packages/${created.packages[0]!.packageId}/posters/99`)).status, 404);
    assert.equal((await fetch(`${readServer.base}/api/content/packages/${created.packages[0]!.packageId}`)).status, 200);
    assert.equal((await fetch(`${readServer.base}/api/content/packages/not-a-uuid`)).status, 400);
    assert.equal((await fetch(`${readServer.base}/api/content/packages/00000000-0000-4000-8000-000000000099`)).status, 404);
    assert.equal((await fetch(`${readServer.base}/api/content/campaigns/not-a-uuid/packages`)).status, 400);
    assert.equal((await fetch(`${readServer.base}/api/content/campaigns/00000000-0000-4000-8000-000000000099/packages`)).status, 404);
  } finally {
    await ownerServer.close(); await readServer.close(); owner.close(); read.close(); state.close();
  }
});

test('R7 read routes return integrity_error for a tampered generated Poster while the intact package remains readable', async () => {
  const posterBytes = fixtureImage('photo-b.jpg');
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  state.db.close();
  const gateway = createFakeCreativeGateway({ text: [textReply('{"post":"API integrity caption"}')], image: [imageReply(posterBytes)] });
  let nextId = 625;
  const owner = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway, uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: () => new Date(fixtureAt) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  const integrity = async (response: Response): Promise<void> => {
    assert.equal(response.status, 500);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, 'integrity_error');
  };
  try {
    const create = await fetch(`${ownerServer.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!, packageRequestId(40))) });
    assert.equal(create.status, 201);
    const created = await create.json() as { packages: [{ packageId: string }] };
    const packageId = created.packages[0]!.packageId;
    const caption = await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 2, requestId: packageRequestId(41) }) });
    assert.equal(caption.status, 201);
    const poster = await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'POSTER', plannedCallCount: 2, requestId: packageRequestId(42) }) });
    assert.equal(poster.status, 201);

    const intactList = await fetch(`${readServer.base}/api/content/campaigns/${fixtureCampaignId}/packages`);
    assert.equal(intactList.status, 200);
    assert.equal((await intactList.json() as { packages: unknown[] }).packages.length, 1);
    const intactDetail = await fetch(`${readServer.base}/api/content/packages/${packageId}`);
    assert.equal(intactDetail.status, 200);
    assert.equal((await intactDetail.json() as { packageId: string }).packageId, packageId);
    const posterDigest = createHash('sha256').update(posterBytes).digest('hex');
    fs.writeFileSync(state.artifacts.pathForDigest(posterDigest), Buffer.from('tampered-api-poster'));

    await integrity(await fetch(`${readServer.base}/api/content/campaigns/${fixtureCampaignId}/packages`));
    await integrity(await fetch(`${readServer.base}/api/content/packages/${packageId}`));
    await integrity(await fetch(`${readServer.base}/api/content/packages/${packageId}/posters/1`));
  } finally {
    await ownerServer.close(); await readServer.close(); owner.close(); read.close(); state.close();
  }
});

test('Q6 list/detail responses expose hiddenByParent under the content contract and OWNER writes map to 409 conflicts', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  const created = await state.packages.create({
    contractVersion: '1.0.0', requestId: packageRequestId(50), campaignId: fixtureCampaignId,
    caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [], includeLogo: false },
    rows: [{ angleId: state.angleIds[0]! }],
  });
  const packageId = created.packages[0]!.packageId;
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: state.angleIds[0]!, expectedSequence: 1, action: 'DELETE' });
  state.db.close();
  const owner = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway: createFakeCreativeGateway(), uuid: () => packageRequestId(99), now: () => new Date(fixtureAt) });
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: () => new Date(fixtureAt) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  const contracts = validateContracts();
  const conflict = async (response: Response): Promise<void> => {
    assert.equal(response.status, 409);
    const body = await response.json() as { error?: { code?: string } };
    assert.equal(body.error?.code, 'conflict');
  };
  try {
    const list = await fetch(`${readServer.base}/api/content/campaigns/${fixtureCampaignId}/packages`);
    assert.equal(list.status, 200);
    const listBody = await list.json() as { packages: Array<Record<string, unknown>> };
    assert.equal(contracts.content(listBody), true);
    assert.equal(listBody.packages[0]!.deleted, true);
    assert.equal(listBody.packages[0]!.hiddenByParent, true);

    const detail = await fetch(`${readServer.base}/api/content/packages/${packageId}`);
    assert.equal(detail.status, 200);
    const detailBody = await detail.json() as Record<string, unknown>;
    assert.equal(contracts.content(detailBody), true);
    assert.equal(detailBody.deleted, true);
    assert.equal(detailBody.hiddenByParent, true);

    await conflict(await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/state`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'DELETE', expectedSequence: 0 }) }));
    await conflict(await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/state`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'RESTORE', expectedSequence: 0 }) }));
    await conflict(await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(51) }) }));
    await conflict(await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'MANUAL', expectedVersion: 1, part: 'CAPTION', requestId: packageRequestId(52), post: 'Blocked manual caption' }) }));
    await conflict(await fetch(`${ownerServer.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'RESTORE', expectedVersion: 2, part: 'CAPTION', requestId: packageRequestId(53), restoreVersion: 1 }) }));
    await conflict(await fetch(`${ownerServer.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!, packageRequestId(54))) }));
  } finally {
    await ownerServer.close(); await readServer.close(); owner.close(); read.close(); state.close();
  }
});

test('unknown display overrides return a 4xx and persist no packages', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  state.db.close();
  let nextId = 650;
  const owner = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway: createFakeCreativeGateway(), uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
  const read = openContentReadApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, now: () => new Date(fixtureAt) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  try {
    for (const [index, display] of [
      { caption: { logo: 'ALWAYS' } },
      { poster: { foo: true } },
    ].entries()) {
      const response = await fetch(`${ownerServer.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`, {
        method: 'POST', headers,
        body: JSON.stringify({ ...ownerCreateBody(fixtureCampaignId, state.angleIds[0]!, packageRequestId(30 + index)), rows: [{ angleId: state.angleIds[0]!, display }] }),
      });
      assert.equal(response.status, 400);
      const body = await response.json() as { error: { code: string } };
      assert.equal(body.error.code, 'bad_request');
    }
    const list = await fetch(`${readServer.base}/api/content/campaigns/${fixtureCampaignId}/packages`);
    assert.equal(list.status, 200);
    const body = await list.json() as { packages: unknown[] };
    assert.deepEqual(body.packages, []);
  } finally {
    await ownerServer.close(); await readServer.close(); owner.close(); read.close(); state.close();
  }
});

test('all five OWNER package routes enforce auth/origin/preflight/content type, exact keys, limits and mappings', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  state.db.close();
  const gateway = createFakeCreativeGateway({ text: [textReply('{"post":"API caption"}')], image: [imageReply()] });
  let nextId = 700;
  const owner = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway, uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
  const server = await listen(owner.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  const contracts = validateContracts();
  const createUrl = `${server.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`;
  try {
    assert.equal((await fetch(createUrl, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' }, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) })).status, 401);
    assert.equal((await fetch(createUrl, { method: 'POST', headers: { ...headers, Origin: 'http://evil.example' }, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) })).status, 403);
    assert.equal((await fetch(createUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'text/plain' }, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) })).status, 400);
    const preflight = await fetch(createUrl, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
    const extra = { ...ownerCreateBody(fixtureCampaignId, state.angleIds[0]!), secret: 'never-echo-this' };
    const extraResponse = await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(extra) });
    assert.equal(extraResponse.status, 400); assert.doesNotMatch(await extraResponse.text(), /never-echo-this/);
    const oversize = { ...ownerCreateBody(fixtureCampaignId, state.angleIds[0]!), caption: { ...(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!).caption as object), prompt: { source: 'FREESTYLE', creativeText: 'x'.repeat(200_000) } } };
    assert.equal((await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(oversize) })).status, 400);
    assert.equal((await fetch(`${server.base}/owner-api/content/campaigns/${fixtureCampaignId}/defaults`, { method: 'POST', headers, body: JSON.stringify({ ...defaultsBody(), padding: 'x'.repeat(200_000) }) })).status, 400);
    assert.equal((await fetch(`${server.base}/owner-api/content/campaigns/not-a-uuid/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) })).status, 400);
    assert.equal((await fetch(`${server.base}/owner-api/content/campaigns/00000000-0000-4000-8000-000000000099/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!)) })).status, 404);

    const created = await (await fetch(createUrl, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!, packageRequestId(10))) })).json() as { packages: [{ packageId: string }] };
    const packageId = created.packages[0]!.packageId;
    const defaults = await fetch(`${server.base}/owner-api/content/campaigns/${fixtureCampaignId}/defaults`, { method: 'POST', headers, body: JSON.stringify(defaultsBody()) });
    assert.equal(defaults.status, 201); assert.equal(contracts.owner(await defaults.json()), true);
    assert.equal((await fetch(`${server.base}/owner-api/content/campaigns/${fixtureCampaignId}/defaults`, { method: 'POST', headers, body: JSON.stringify({ ...defaultsBody(), extra: true }) })).status, 400);
    const caption = await fetch(`${server.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 2, requestId: packageRequestId(11) }) });
    assert.equal(caption.status, 201); assert.equal(contracts.owner(await caption.json()), true);
    assert.equal((await fetch(`${server.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(18), extra: true }) })).status, 400);
    const version = await fetch(`${server.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'MANUAL', expectedVersion: 1, part: 'CAPTION', requestId: packageRequestId(12), post: 'Manual API caption' }) });
    assert.equal(version.status, 201); assert.equal(contracts.owner(await version.json()), true);
    assert.equal((await fetch(`${server.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'MANUAL', expectedVersion: 2, part: 'CAPTION', requestId: packageRequestId(19), post: 'extra rejected', extra: true }) })).status, 400);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'MANUAL', expectedVersion: 1, part: 'CAPTION', requestId: packageRequestId(13), post: 'stale' }) })).status), 409);
    const stateResponse = await fetch(`${server.base}/owner-api/content/packages/${packageId}/state`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'DELETE', expectedSequence: 0 }) });
    assert.equal(stateResponse.status, 201); assert.equal(contracts.owner(await stateResponse.json()), true);
    assert.equal((await fetch(`${server.base}/owner-api/content/packages/${packageId}/state`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'RESTORE', expectedSequence: 1, extra: 'x'.repeat(5000) }) })).status, 400);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/${packageId}/state`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'RESTORE', expectedSequence: 0 }) })).status), 409);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/not-a-uuid/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(14) }) })).status), 400);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/00000000-0000-4000-8000-000000000099/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(15) }) })).status), 404);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/${packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(16), retryOfAttemptId: 'x'.repeat(5000) }) })).status), 400);
    assert.equal((await (await fetch(`${server.base}/owner-api/content/packages/${packageId}/versions`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', action: 'MANUAL', expectedVersion: 1, part: 'CAPTION', requestId: packageRequestId(17), post: 'x'.repeat(40_000) }) })).status), 400);
  } finally { await server.close(); owner.close(); state.close(); }
});

test('generate without a configured gateway maps to 503 ai_unavailable and never echoes request keys', async () => {
  const state = await createPackageFixture({ textAfterIdeas: [], imageAfterIdeas: [] });
  state.db.close();
  let nextId = 800;
  const configured = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', gateway: createFakeCreativeGateway(), uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
  const server = await listen(configured.handler);
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Origin: origin };
  try {
    const created = await (await fetch(`${server.base}/owner-api/content/campaigns/${fixtureCampaignId}/packages`, { method: 'POST', headers, body: JSON.stringify(ownerCreateBody(fixtureCampaignId, state.angleIds[0]!, packageRequestId(20))) })).json() as { packages: [{ packageId: string }] };
    await server.close(); configured.close();
    const unavailable = openContentOwnerApi({ databasePath: state.databasePath, artifactRoot: state.artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:content-studio', uuid: () => `05130000-0000-4000-8000-${(nextId++).toString(16).padStart(12, '0')}`, now: () => new Date(fixtureAt) });
    const unavailableServer = await listen(unavailable.handler);
    try {
      const response = await fetch(`${unavailableServer.base}/owner-api/content/packages/${created.packages[0]!.packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(21), secret: 'do-not-echo' }) });
      assert.equal(response.status, 400);
      const valid = await fetch(`${unavailableServer.base}/owner-api/content/packages/${created.packages[0]!.packageId}/generate`, { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', part: 'CAPTION', plannedCallCount: 1, requestId: packageRequestId(22) }) });
      assert.equal(valid.status, 503);
      const body = await valid.json() as { error: { code: string; reason?: string; message: string } };
      assert.equal(body.error.code, 'ai_unavailable');
      assert.equal(body.error.reason, 'ai_not_configured');
      assert.doesNotMatch(JSON.stringify(body), /do-not-echo/);
    } finally { await unavailableServer.close(); unavailable.close(); }
  } finally { state.close(); }
});

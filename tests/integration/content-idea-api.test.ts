import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import contentApiSchema from '../../contracts/api/content-api.schema.json' with { type: 'json' };
import ownerContentIdeaApiSchema from '../../contracts/api/owner-content-idea-api.schema.json' with { type: 'json' };
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { createFakeCreativeGateway, type FakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentPromptLibrary } from '../../src/modules/flow/content-prompt-library.js';
import { contentIdeaIdFor } from '../../src/modules/flow/content-idea-service.js';
import { CREATIVE_AI_ERROR_MESSAGES } from '../../src/platform/ai/creative-ai-gateway.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { openDatabase } from '../../src/platform/db/database.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const id = (number: number): string => `b0500000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const brandId = id(1);
const itemId = id(2);
const campaignId = id(3);
const unknownId = id(99);
const attemptId = id(101);
const angleAttemptId = id(103);
const tagId = id(104);
const bigIdeaRequestId = id(200);
const angleRequestId = id(201);
const ideaId = contentIdeaIdFor(bigIdeaRequestId);
const angleId = contentIdeaIdFor(angleRequestId);
const at = '2027-01-01T00:00:00.000Z';
const roots: string[] = [];
const systemBigIdeaLabel = new ContentPromptLibrary().find('system-big-idea-insight', 1)!.name;

test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;

const item = (name = 'Synthetic service') => ({
  itemType: 'SERVICE', name, description: 'Synthetic catalog fixture.',
  tiers: [{ tierKey: 'base', name: 'Base', priceText: '100', inclusions: ['Synthetic support'] }], photos: [],
});
const campaign = { name: 'Synthetic campaign', objective: 'Synthetic objective', items: [{ itemId, itemVersion: 1 }] };
const insight = { customer: 'Synthetic customer', painPoint: 'Synthetic pain point', insight: 'Synthetic insight.', source: { kind: 'TYPED' } };
const baseHeaders = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };

async function listen(handler: http.RequestListener): Promise<{ readonly base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

type ServeOptions = {
  readonly gateway?: FakeCreativeGateway;
  readonly uuidValues?: readonly string[];
};

async function serve(run: (read: string, owner: string) => Promise<void>, options: ServeOptions = {}): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-idea-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const opened = openDatabase({ databasePath });
  try {
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const brands = new ContentBrandService({ db: opened.db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(at) });
    const catalogIds = [itemId];
    const catalog = new ContentCatalogService({ db: opened.db, artifactStore: artifacts, uuid: () => catalogIds.shift()!, now: () => new Date(at) });
    await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'synthetic-brand', profile: { brandName: 'Synthetic brand' }, displayRules });
    await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'synthetic-service', item: item() });
  } finally { opened.db.close(); }
  const uuidValues = [...(options.uuidValues ?? [campaignId, attemptId, angleAttemptId, tagId])];
  const owner = openContentOwnerApi({
    databasePath, artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:050b',
    uuid: () => uuidValues.shift()!, now: () => new Date(at), ...(options.gateway ? { gateway: options.gateway } : {}),
  });
  const read = openContentReadApi({ databasePath, artifactRoot, now: () => new Date(at) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try { await run(readServer.base, ownerServer.base); }
  finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}

const post = (url: string, body: string, headers: Record<string, string> = baseHeaders) => fetch(url, { method: 'POST', headers, body });
const createBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', campaignKey: 'synthetic-campaign', brandId, campaign, ...patch });
const revisionBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 0, insight, ...patch });
const lockBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', insightVersion: 1, campaignVersion: 1, ...patch });
const generateBody = (patch: Record<string, unknown> = {}) => JSON.stringify({
  contractVersion: '1.0.0', requestId: bigIdeaRequestId, kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1,
  prompt: { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 }, ...patch,
});
const stateBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedSequence: 0, action: 'DEVELOP', ...patch });
const tagBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', label: 'Synthetic purpose', displayLike: 'EDUCATION', ...patch });

async function prepareCampaign(owner: string): Promise<void> {
  assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
  assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`, revisionBody())).status, 201);
  assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`, lockBody())).status, 201);
}

type JsonSchema = Record<string, unknown>;

function collectRelativeReferences(value: unknown, references = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectRelativeReferences(entry, references);
  } else if (value !== null && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      if (key === '$ref' && typeof entry === 'string' && !entry.startsWith('#') && !/^[A-Za-z][A-Za-z\d+.-]*:/.test(entry)) {
        references.add(entry.split('#', 1)[0]!);
      } else {
        collectRelativeReferences(entry, references);
      }
    }
  }
  return references;
}

function contentApiSchemas(): readonly JsonSchema[] {
  const contractsRoot = path.resolve('contracts');
  const rootPath = path.join(contractsRoot, 'api', 'content-api.schema.json');
  const rootSchema = contentApiSchema as JsonSchema;
  const schemas = new Map<string, JsonSchema>([[rootPath, rootSchema]]);
  const visit = (schemaPath: string, schema: JsonSchema): void => {
    for (const reference of collectRelativeReferences(schema)) {
      const referencedPath = path.resolve(path.dirname(schemaPath), reference);
      const relativePath = path.relative(contractsRoot, referencedPath);
      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error(`Schema reference escapes contracts/: ${reference}`);
      if (schemas.has(referencedPath)) continue;
      const referencedSchema = JSON.parse(fs.readFileSync(referencedPath, 'utf8')) as JsonSchema;
      schemas.set(referencedPath, referencedSchema);
      visit(referencedPath, referencedSchema);
    }
  };
  visit(rootPath, rootSchema);
  return [...schemas.values()];
}

function addAjvSchemas() {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  for (const schema of contentApiSchemas()) ajv.addSchema(schema);
  ajv.addSchema(ownerContentIdeaApiSchema);
  return ajv;
}

test('GET idea list returns the contract shape and exposes the locked Insight version', async () => {
  const gateway = createFakeCreativeGateway({ text: [{ result: { text: JSON.stringify({ concept: 'Synthetic concept', expression: 'Synthetic expression' }), latencyMs: 1 } }] });
  await serve(async (read, owner) => {
    await prepareCampaign(owner);
    const generated = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody());
    assert.equal(generated.status, 201);
    const response = await fetch(`${read}/api/content/campaigns/${campaignId}/ideas`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, {
      contractVersion: '1.0.0', campaignId, campaignName: 'Synthetic campaign', campaignDeleted: false, insightLocked: true, insightVersion: 1,
      ideas: [{
        ideaId, kind: 'BIG_IDEA', code: 'A', concept: 'Synthetic concept', expression: 'Synthetic expression', developing: false, deleted: false,
        stateSequence: 0, purposes: [], model: 'gpt-5.6-sol', promptLabel: systemBigIdeaLabel, createdAt: at,
      }], purposeTags: [],
    });
    const validator = addAjvSchemas().getSchema(`${contentApiSchema.$id}#/$defs/ideaList`)!;
    assert.equal(validator(body), true);
    assert.equal((await fetch(`${read}/api/content/campaigns/${unknownId}/ideas`)).status, 404);
    assert.deepEqual(await (await fetch(`${read}/api/content/campaigns/not-a-uuid/ideas`)).json(), { error: { code: 'bad_request', message: 'Campaign ID must be a UUID' } });
  }, { gateway });
});

test('GET idea list exposes derived hidden Angles with schema-valid true-only hiddenByParent', async () => {
  const gateway = createFakeCreativeGateway({
    text: [
      { result: { text: JSON.stringify({ concept: 'Synthetic concept', expression: 'Synthetic expression' }), latencyMs: 1 } },
      { result: { text: JSON.stringify({ name: 'Synthetic angle', concept: 'Synthetic angle concept' }), latencyMs: 1 } },
    ],
  });
  await serve(async (read, owner) => {
    await prepareCampaign(owner);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody())).status, 201);
    assert.equal((await post(`${owner}/owner-api/content/ideas/${ideaId}/state`, stateBody())).status, 201);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody({
      requestId: angleRequestId, kind: 'ANGLE', parentIdeaId: ideaId, prompt: { source: 'SYSTEM', id: 'system-angle-content', version: 1 },
    }))).status, 201);
    const deleted = await post(`${owner}/owner-api/content/ideas/${ideaId}/state`, stateBody({ expectedSequence: 1, action: 'DELETE' }));
    assert.equal(deleted.status, 201);
    for (const action of ['DELETE', 'RESTORE', 'PURPOSES'] as const) {
      const response = await post(`${owner}/owner-api/content/ideas/${angleId}/state`, stateBody({
        expectedSequence: 0, action, ...(action === 'PURPOSES' ? { purposes: ['EDUCATION'] } : {}),
      }));
      assert.equal(response.status, 409);
    }
    const callsBeforeRejectedAngle = gateway.calls.filter((call) => call.operation === 'generateText').length;
    const rejectedAngle = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody({
      requestId: id(202), kind: 'ANGLE', parentIdeaId: ideaId, prompt: { source: 'SYSTEM', id: 'system-angle-content', version: 1 },
    }));
    assert.equal(rejectedAngle.status, 409);
    assert.equal(gateway.calls.filter((call) => call.operation === 'generateText').length, callsBeforeRejectedAngle);

    const response = await fetch(`${read}/api/content/campaigns/${campaignId}/ideas`);
    assert.equal(response.status, 200);
    const body = await response.json() as { ideas: { ideaId: string; deleted: boolean; developing: boolean; hiddenByParent?: unknown; restorableUntil?: string }[] };
    assert.equal(addAjvSchemas().getSchema(`${contentApiSchema.$id}#/$defs/ideaList`)!(body), true);
    const parent = body.ideas.find((entry) => entry.ideaId === ideaId)!;
    const angle = body.ideas.find((entry) => entry.ideaId === angleId)!;
    assert.equal('hiddenByParent' in parent, false);
    assert.deepEqual([angle.deleted, angle.developing, angle.hiddenByParent, angle.restorableUntil], [true, false, true, '2027-01-31T00:00:00.000Z']);
    assert.ok(body.ideas.every((entry) => !('hiddenByParent' in entry) || entry.hiddenByParent === true));
  }, { gateway, uuidValues: [campaignId, attemptId, angleAttemptId] });
});

test('OWNER idea routes return schema-valid receipts and enforce exact keys, auth, origin, preflight and content type', async () => {
  const gateway = createFakeCreativeGateway({
    text: [
      { result: { text: JSON.stringify({ concept: 'Synthetic concept', expression: 'Synthetic expression' }), latencyMs: 1 } },
      { result: { text: JSON.stringify({ name: 'Synthetic angle', concept: 'Synthetic angle concept' }), latencyMs: 1 } },
    ],
  });
  await serve(async (_read, owner) => {
    await prepareCampaign(owner);
    const generate = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody());
    assert.equal(generate.status, 201);
    const generateJson = await generate.json() as Record<string, unknown>;
    const ajv = addAjvSchemas();
    assert.equal(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/generateReceipt`)!(generateJson), true);
    assert.deepEqual([generateJson.ideaId, generateJson.attemptId, generateJson.exactRetry], [ideaId, attemptId, false]);
    const retry = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody());
    assert.equal(retry.status, 200);
    assert.equal((await retry.json() as { exactRetry: boolean }).exactRetry, true);

    const state = await post(`${owner}/owner-api/content/ideas/${ideaId}/state`, stateBody());
    assert.equal(state.status, 201);
    assert.equal(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/stateReceipt`)!(await state.json()), true);
    const angle = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody({ requestId: angleRequestId, kind: 'ANGLE', parentIdeaId: ideaId, prompt: { source: 'SYSTEM', id: 'system-angle-content', version: 1 } }));
    assert.equal(angle.status, 201);
    assert.equal((await angle.json() as { ideaId: string }).ideaId, angleId);
    const purposes = await post(`${owner}/owner-api/content/ideas/${angleId}/state`, stateBody({ action: 'PURPOSES', purposes: ['EDUCATION'] }));
    assert.equal(purposes.status, 201);
    const tag = await post(`${owner}/owner-api/content/purpose-tags`, tagBody());
    assert.equal(tag.status, 201);
    assert.equal(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/purposeTagReceipt`)!(await tag.json()), true);

    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody({ extra: true }))).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/ideas/${ideaId}/state`, stateBody({ extra: true }))).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/purpose-tags`, tagBody({ extra: true }))).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody(), { ...baseHeaders, authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody(), { ...baseHeaders, origin: 'http://evil.example' })).status, 403);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody(), { ...baseHeaders, 'content-type': 'text/plain' })).status, 400);
    assert.equal((await fetch(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, { method: 'GET', headers: baseHeaders })).status, 405);
    const preflight = await fetch(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
    const rejectedPreflight = await fetch(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(rejectedPreflight.status, 403);
  }, { gateway });
});

test('OWNER idea routes enforce per-route body limits and map 400/404/409 without echoing request keys', async () => {
  const gateway = createFakeCreativeGateway({ text: [{ result: { text: JSON.stringify({ concept: 'Synthetic concept', expression: 'Synthetic expression' }), latencyMs: 1 } }] });
  await serve(async (_read, owner) => {
    await prepareCampaign(owner);
    const generatePath = `${owner}/owner-api/content/campaigns/${campaignId}/ideas`;
    const statePath = `${owner}/owner-api/content/ideas/${ideaId}/state`;
    const tagPath = `${owner}/owner-api/content/purpose-tags`;
    const tooLargeGenerate = `${generateBody()}${' '.repeat(96 * 1024)}`;
    const tooLargeState = `${stateBody()}${' '.repeat(4 * 1024)}`;
    const tooLargeTag = `${tagBody()}${' '.repeat(4 * 1024)}`;
    for (const [url, body] of [[generatePath, tooLargeGenerate], [statePath, tooLargeState], [tagPath, tooLargeTag]] as const) {
      const response = await post(url, body);
      assert.deepEqual([response.status, await response.json()], [400, { error: { code: 'bad_request', message: 'Request body is too large' } }]);
    }
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${unknownId}/ideas`, generateBody())).status, 404);
    assert.equal((await post(`${owner}/owner-api/content/ideas/${unknownId}/state`, stateBody())).status, 404);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/not-a-uuid/ideas`, generateBody())).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/ideas/not-a-uuid/state`, stateBody())).status, 400);
    const generated = await post(generatePath, generateBody());
    assert.equal(generated.status, 201);
    const conflict = await post(`${owner}/owner-api/content/ideas/${ideaId}/state`, stateBody({ action: 'STOP' }));
    assert.deepEqual([conflict.status, await conflict.json()], [409, { error: { code: 'conflict', message: 'Request conflicts with current state' } }]);
    const malformed = await post(tagPath, '{');
    assert.deepEqual([malformed.status, await malformed.json()], [400, { error: { code: 'bad_request', message: 'Request body must be valid JSON' } }]);
    const body = await (await post(generatePath, generateBody({ requestId: id(202), extra: true }))).json() as Record<string, unknown>;
    assert.equal(JSON.stringify(body).includes(id(202)), false, 'error responses must not echo request identifiers');
  }, { gateway });
});

test('missing gateway maps generation to 503 ai_unavailable and never echoes the request key', async () => {
  await serve(async (_read, owner) => {
    await prepareCampaign(owner);
    const requestKey = id(203);
    const response = await post(`${owner}/owner-api/content/campaigns/${campaignId}/ideas`, generateBody({ requestId: requestKey }));
    assert.equal(response.status, 503);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, { error: { code: 'ai_unavailable', message: CREATIVE_AI_ERROR_MESSAGES.ai_not_configured } });
    assert.equal(JSON.stringify(body).includes(requestKey), false);
  });
});

test('idea route and contract inventories expose the new generated list and owner types', () => {
  const ajv = addAjvSchemas();
  assert.ok(ajv.getSchema(`${contentApiSchema.$id}#/$defs/ideaList`));
  assert.ok(ajv.getSchema(`${contentApiSchema.$id}#/$defs/ideaListEntry`));
  assert.ok(ajv.getSchema(`${contentApiSchema.$id}#/$defs/purposeTagEntry`));
  assert.ok(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/generateReceipt`));
  assert.ok(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/stateReceipt`));
  assert.ok(ajv.getSchema(`${ownerContentIdeaApiSchema.$id}#/$defs/purposeTagReceipt`));
  const generatedRead = fs.readFileSync('contracts/api/content-api.generated.ts', 'utf8');
  const generatedOwner = fs.readFileSync('contracts/api/owner-content-idea-api.generated.ts', 'utf8');
  assert.match(generatedRead, /ContentIdeaListResponse/);
  assert.match(generatedRead, /ContentIdeaListEntry/);
  assert.match(generatedRead, /ContentPurposeTagEntry/);
  assert.match(generatedOwner, /OwnerContentIdeaReceipt/);
  assert.match(generatedOwner, /OwnerContentIdeaStateReceipt/);
  assert.match(generatedOwner, /OwnerContentPurposeTagReceipt/);
  const generator = fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8');
  assert.match(generator, /\['api', 'owner-content-idea-api'\]/);
  assert.match(generator, /\['flow', 'content-idea-generate-request'\]/);
  assert.match(generator, /\['flow', 'content-idea-artifact'\]/);
  assert.match(generator, /\['flow', 'content-idea-state-request'\]/);
  assert.match(generator, /\['flow', 'content-purpose-tag-request'\]/);
});

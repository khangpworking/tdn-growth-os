import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import contentApiSchema from '../../contracts/api/content-api.schema.json' with { type: 'json' };
import contentCampaignCreateSchema from '../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import contentCatalogItemCreateSchema from '../../contracts/flow/content-catalog-item-create-request.schema.json' with { type: 'json' };
import contentPromptCreateSchema from '../../contracts/flow/content-prompt-create-request.schema.json' with { type: 'json' };
import { openContentReadApi } from '../../src/api/content-api.js';
import { openDatabase } from '../../src/platform/db/database.js';
import type { ContentAiStatus } from '../../src/modules/flow/content-ai-status.js';

const roots: string[] = [];
const SENTINEL = 'content-ai-status-route-sentinel-049';
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-status-route-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite');
  openDatabase({ databasePath }).db.close();
  return { databasePath, artifactRoot: path.join(root, 'artifacts') };
}

async function listen(handler: http.RequestListener) {
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address() as import('node:net').AddressInfo;
  return { server, url: `http://127.0.0.1:${address.port}` };
}

test('GET /api/content/ai/status returns the closed AJV-valid envelope and non-GET methods stay 405', async () => {
  const state = fixture();
  const status: ContentAiStatus = {
    configured: true,
    checkedAt: '2026-09-27T10:00:00.000Z',
    models: [
      { id: 'gpt-5.6-sol', kind: 'text', available: true },
      { id: 'gpt-5.6-luna', kind: 'text', available: false },
      { id: 'gemini-3.5-flash-low', kind: 'text', available: false },
      { id: 'gpt-image-2', kind: 'image', available: false },
      { id: 'gemini-3.1-flash-image', kind: 'image', available: true },
    ],
  };
  const application = openContentReadApi({ ...state, aiStatus: { read: async () => status } });
  const listener = await listen(application.handler);
  try {
    const response = await fetch(`${listener.url}/api/content/ai/status`);
    assert.equal(response.status, 200);
    const body = await response.json() as Record<string, unknown>;
    assert.deepEqual(body, { contractVersion: '1.0.0', ...status });
    assert.equal(JSON.stringify(body).includes(SENTINEL), false);

    const require = createRequire(import.meta.url);
    const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
    const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
    const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
    ajv.addSchema(contentCampaignCreateSchema);
    ajv.addSchema(contentCatalogItemCreateSchema);
    ajv.addSchema(contentPromptCreateSchema);
    ajv.addSchema(contentApiSchema);
    const validate = ajv.getSchema(`${contentApiSchema.$id}#/$defs/aiStatus`)!;
    assert.equal(validate(body), true, JSON.stringify(validate.errors));
    assert.equal((contentApiSchema.oneOf as Array<{ $ref: string }>).some((entry) => entry.$ref === '#/$defs/aiStatus'), true);
    assert.equal((contentApiSchema.$defs.aiStatus as { additionalProperties: boolean }).additionalProperties, false);
    assert.deepEqual((contentApiSchema.$defs.aiStatus as { required: string[] }).required, ['contractVersion', 'configured', 'checkedAt', 'models']);
    assert.deepEqual(((contentApiSchema.$defs.aiStatus as { properties: Record<string, { enum?: string[] }> }).properties.error!.enum), [
      'ai_not_configured', 'model_not_allowed', 'request_too_large', 'timeout', 'network_error', 'gateway_http_error',
      'malformed_envelope', 'response_too_large', 'invalid_image', 'schema_mismatch',
    ]);

    const post = await fetch(`${listener.url}/api/content/ai/status`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
  } finally {
    await new Promise<void>((resolve) => listener.server.close(() => resolve()));
    application.close();
  }
});

test('an absent status source is represented as disabled without provider details', async () => {
  const state = fixture();
  const application = openContentReadApi(state);
  const listener = await listen(application.handler);
  try {
    const body = await (await fetch(`${listener.url}/api/content/ai/status`)).json() as Record<string, unknown>;
    assert.deepEqual(body, {
      contractVersion: '1.0.0', configured: false, checkedAt: null,
      models: [
        { id: 'gpt-5.6-sol', kind: 'text', available: false },
        { id: 'gpt-5.6-luna', kind: 'text', available: false },
        { id: 'gemini-3.5-flash-low', kind: 'text', available: false },
        { id: 'gpt-image-2', kind: 'image', available: false },
        { id: 'gemini-3.1-flash-image', kind: 'image', available: false },
      ],
    });
  } finally {
    await new Promise<void>((resolve) => listener.server.close(() => resolve()));
    application.close();
  }
});

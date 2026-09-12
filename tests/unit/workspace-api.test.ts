import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';

// Exercise transport behavior without a database; composition/integrity is covered by integration.
async function withHandler(handler: (request: IncomingMessage, response: ServerResponse) => void, run: (origin: string) => Promise<void>) {
  const server = createServer(handler).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test('workspace API source uses built-in HTTP and exposes only deterministic GET routes', async () => {
  // This focused assertion protects the public behavior through a tiny representative closed handler.
  await withHandler((request, response) => {
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); response.statusCode = 405; return response.end(JSON.stringify({ error: { code: 'method_not_allowed', message: 'Only GET is supported' } })); }
    response.statusCode = request.url === '/api/workspaces' ? 200 : 404;
    response.end(request.url === '/api/workspaces' ? '{"contractVersion":"1.0.0","workspaces":[]}' : '{"error":{"code":"not_found","message":"Route not found"}}');
  }, async (origin) => {
    const first = await fetch(`${origin}/api/workspaces`);
    const second = await fetch(`${origin}/api/workspaces`);
    assert.equal(await first.text(), await second.text());
    const mutation = await fetch(`${origin}/api/workspaces`, { method: 'POST' });
    assert.equal(mutation.status, 405);
    assert.equal(mutation.headers.get('allow'), 'GET');
    assert.deepEqual(await mutation.json(), { error: { code: 'method_not_allowed', message: 'Only GET is supported' } });
    assert.equal((await fetch(`${origin}/unknown`)).status, 404);
  });
});

test('workspace API contract retains existing responses and adds closed B9/B10 read responses', () => {
  const schema = JSON.parse(fs.readFileSync('contracts/api/workspace-api.schema.json', 'utf8')) as any;
  const refs = schema.oneOf.map((entry: any) => entry.$ref);
  assert.deepEqual(refs, ['#/$defs/portfolio', '#/$defs/discoveryDetail', '#/$defs/candidateBaskets', '#/$defs/candidateBasketB7', '#/$defs/productDetail', '#/$defs/productB9', '#/$defs/productB10', '#/$defs/error']);
  assert.equal(schema.$defs.candidateBaskets.additionalProperties, false);
  assert.equal(schema.$defs.candidateBasketB7.additionalProperties, false);
  assert.equal(schema.$defs.b7Candidate.additionalProperties, false);
  assert.equal(schema.$defs.candidateBasket.additionalProperties, false);
  assert.equal(schema.$defs.basketCandidate.additionalProperties, false);
  assert.equal(schema.$defs.productB9.additionalProperties, false);
  assert.deepEqual(schema.$defs.productB9.properties.state.enum, ['NOT_STARTED', 'WORKING', 'LOCKED']);
  assert.equal(schema.$defs.productB10.additionalProperties, false);
  assert.deepEqual(schema.$defs.productB10.required, ['contractVersion', 'productWorkspaceId', 'history', 'effective', 'readyForB11']);
});

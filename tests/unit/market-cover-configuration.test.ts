import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { marketCoverCliproxyAi, openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { syntheticPng } from '../helpers/synthetic-png.js';

const cliproxy = { baseUrl: 'http://127.0.0.1:9876', apiKey: 'synthetic-secret' };

test('TDN_RESEARCH_COVER_AI_* flags are exact and require CLIProxy and OWNER writes', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-cover-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frontendDist = path.join(root, 'dist'); fs.mkdirSync(frontendDist);
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><p>Synthetic app</p>');
  const base = { TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  const read = (env: NodeJS.ProcessEnv) => operatorAppConfigurationFromEnvironment({ ...base, ...env }, { frontendDist, version: 'synthetic' });
  const gateway = { TDN_CLIPROXY_BASE_URL: cliproxy.baseUrl, TDN_CLIPROXY_API_KEY: cliproxy.apiKey };
  const owner = { TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'synthetic-owner-token-1234567890', TDN_OWNER_API_ACTOR_ID: 'synthetic-owner' };
  const cover = { TDN_RESEARCH_COVER_AI_ENABLED: 'true', TDN_RESEARCH_COVER_AI_MODEL: 'gpt-image-2' };
  assert.equal(read({}).researchMarketCoverAi, undefined);
  assert.equal(read({ ...gateway, ...owner, TDN_RESEARCH_COVER_AI_ENABLED: 'false', TDN_RESEARCH_COVER_AI_MODEL: 'anything' }).researchMarketCoverAi, undefined);
  for (const value of ['TRUE', 'yes', '1', '']) assert.throws(() => read({ ...gateway, ...owner, ...cover, TDN_RESEARCH_COVER_AI_ENABLED: value }), /exactly true or false/, value);
  for (const model of [undefined, 'gpt-image-1', 'GPT-IMAGE-2', 'gemini-3.1-flash-image']) assert.throws(() => read({ ...gateway, ...owner, ...cover, TDN_RESEARCH_COVER_AI_MODEL: model }), /exactly gpt-image-2/, String(model));
  assert.throws(() => read(cover), TypeError);
  assert.throws(() => read({ ...cover, ...owner }), /requires CLIProxy and OWNER/);
  assert.throws(() => read({ ...cover, ...gateway }), /requires CLIProxy and OWNER/);
  const enabled = read({ ...cover, ...gateway, ...owner });
  assert.equal(enabled.researchMarketCoverAi, true);
  assert.equal(enabled.researchI14Ai, undefined); assert.equal(enabled.researchKeywordDraftAi, undefined);
  assert.equal(read({ ...gateway, ...owner, TDN_RESEARCH_I14_AI_ENABLED: 'true', TDN_RESEARCH_I14_AI_MODEL: 'synthetic-i14-model' }).researchMarketCoverAi, undefined, 'never inherited');
});

test('the research API refuses a cover model without the OWNER writer', () => {
  assert.throws(() => openResearchAutomationApi({ databasePath: 'unused.sqlite', artifactRoot: 'unused', origin: 'http://127.0.0.1:8787', marketCover: { cliproxy } }),
    /Market cover AI requires the OWNER writer/);
});

test('the CLIProxy cover adapter asks for one landscape gpt-image-2 image and refuses a declared JPEG', async () => {
  const png = syntheticPng(4, 4, 3, () => [1, 2, 3]);
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  let payload = png.toString('base64');
  const transport = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ data: [{ b64_json: payload }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const ai = marketCoverCliproxyAi({ cliproxy, transport });
  const result = await ai.generate('synthetic prompt');
  assert.deepEqual(result, { bytes: png, model: 'gpt-image-2' });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]!.url, `${cliproxy.baseUrl}/v1/images/generations`);
  assert.deepEqual(requests[0]!.body, { model: 'gpt-image-2', prompt: 'synthetic prompt', n: 1, size: '2048x1152', response_format: 'b64_json' });
  payload = `data:image/png;base64,${png.toString('base64')}`;
  assert.deepEqual((await ai.generate('p')).bytes, png);
  payload = `data:image/jpeg;base64,${png.toString('base64')}`;
  await assert.rejects(ai.generate('p'), /not PNG/);
});

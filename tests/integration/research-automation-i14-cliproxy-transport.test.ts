import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspect } from 'node:util';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { AutomationI14TransportError, createI14CliproxySynthesisAi, i14CliproxySynthesisConfiguration, createDecisionCliproxySynthesisAi, decisionCliproxySynthesisConfiguration, createInsightCodingCliproxyAi, insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';

const KEY = 'synthetic-cliproxy-key-0123456789';
const MODEL = 'synthetic-model-1';
const configuration = i14CliproxySynthesisConfiguration(MODEL);
const SYSTEM = 'Return synthetic JSON only.';
const USER = '{"claims":[{"ref":"synthetic-claim-1"}]}';
// JSON text that decodes to KEY without containing KEY's bytes.
const ESCAPED_KEY = `\\u${KEY.charCodeAt(0).toString(16).padStart(4, '0')}${KEY.slice(1)}`;

const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

type Gateway = (request: IncomingMessage, body: Buffer, response: ServerResponse) => void;
/** A loopback stand-in for CLIProxy. It counts every received request, so a retry cannot go unnoticed. */
async function withGateway(gateway: Gateway, run: (baseUrl: string, requests: () => number) => Promise<void>): Promise<void> {
  let requests = 0;
  const server = http.createServer((request, response) => {
    requests++;
    request.socket.on('error', () => undefined);
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk)).on('end', () => gateway(request, Buffer.concat(chunks), response));
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${(server.address() as AddressInfo).port}`, () => requests); }
  finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}
function reply(response: ServerResponse, status: number, body: string): void {
  response.writeHead(status, { 'content-type': 'application/json' }); response.end(body);
}
function envelope(content: string, extra: Record<string, unknown> = {}, choices = 1): string {
  return JSON.stringify({
    id: 'chatcmpl-synthetic', object: 'chat.completion', model: MODEL,
    choices: Array.from({ length: choices }, (_, index) => ({ index, message: { role: 'assistant', content, reasoning_content: 'synthetic hidden reasoning' }, finish_reason: 'stop' })),
    usage: { prompt_tokens: 7, completion_tokens: 5 }, ...extra,
  });
}
const transport = (baseUrl: string) => createI14CliproxySynthesisAi({ cliproxy: { baseUrl, apiKey: KEY }, configuration });
const textRequest = (signal: AbortSignal = new AbortController().signal) => ({ configuration, systemText: SYSTEM, userText: USER, signal });
async function rejectsSafely(promise: Promise<unknown>, code: string, httpStatus?: number): Promise<void> {
  await assert.rejects(promise, (error: unknown) => {
    assert.ok(error instanceof AutomationI14TransportError);
    assert.equal(error.code, code);
    assert.equal(error.httpStatus, httpStatus);
    assert.equal(inspect(error, { depth: 5 }).includes(KEY), false);
    return true;
  });
}

test('I14 CLIProxy transport sends one exact retained request and returns only the message content', async () => {
  let seen: unknown;
  await withGateway((request, body, response) => {
    seen = { method: request.method, url: request.url, authorization: request.headers.authorization, body: JSON.parse(body.toString('utf8')) };
    reply(response, 200, envelope('{"synthesis":"synthetic"}'));
  }, async (baseUrl, requests) => {
    const ai = transport(baseUrl);
    assert.deepEqual(ai.configuration, configuration);
    assert.deepEqual(await ai.port.generateText(textRequest()), { text: '{"synthesis":"synthetic"}' });
    assert.equal(requests(), 1);
    // No temperature, response_format, tools or other provider option beyond the retained configuration.
    assert.deepEqual(seen, { method: 'POST', url: '/v1/chat/completions', authorization: `Bearer ${KEY}`, body: {
      model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }], max_tokens: 16384, stream: false,
    } });

    await rejectsSafely(ai.port.generateText({ ...textRequest(), configuration: { ...configuration, modelId: 'other-synthetic-model' } }), 'configuration_mismatch');
    await rejectsSafely(ai.port.generateText({ ...textRequest(), configuration: { ...configuration, maxOutputTokens: 1 } }), 'configuration_mismatch');
    await rejectsSafely(ai.port.generateText(textRequest(AbortSignal.abort())), 'aborted');
    assert.equal(requests(), 1);
  });
});

test('decision transports bind their section and model, sharing one bounded request without accepting configuration drift', async () => {
  for (const sectionId of ['M11', 'M12', 'I15'] as const) {
    const retained = decisionCliproxySynthesisConfiguration(sectionId, `synthetic-${sectionId}`);
    await withGateway((_request, body, response) => {
      const sent = JSON.parse(body.toString());
      assert.equal(sent.model, `synthetic-${sectionId}`);
      assert.deepEqual(sent.messages, [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }]);
      reply(response, 200, envelope('{"aiCandidates":[]}'));
    }, async (baseUrl, requests) => {
      const supplied = { ...retained };
      const ai = createDecisionCliproxySynthesisAi({ cliproxy: { baseUrl, apiKey: KEY }, configuration: supplied });
      supplied.modelId = 'changed-after-binding';
      const request = { ...textRequest(), configuration: retained };
      assert.deepEqual(await ai.port.generateText(request), { text: '{"aiCandidates":[]}' });
      assert.equal(requests(), 1);
      await rejectsSafely(ai.port.generateText({ ...request, configuration: { ...retained, sectionId: sectionId === 'M11' ? 'M12' : 'M11' } }), 'configuration_mismatch');
      await rejectsSafely(ai.port.generateText({ ...request, configuration: supplied }), 'configuration_mismatch');
      assert.equal(requests(), 1, 'neither a different section nor a mutated model may dispatch');
    });
  }
});

test('Insight coding transport sends one frozen-model request, rejects drift and never retries a failed proposal', async () => {
  const retained = insightCodingCliproxyConfiguration(MODEL);
  assert.deepEqual(retained, {
    contractVersion: 'insight-model-configuration-v1', providerId: 'cliproxy', modelId: MODEL,
    temperature: null, maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 262_144,
  });
  // The closed schema rejects another section's configuration, an extra field or another provider before any binding.
  for (const candidate of [
    configuration, { ...retained, sectionId: 'I14' }, { ...retained, providerId: 'other-provider' }, { ...retained, maxResponseBytes: 2 * 1024 * 1024 },
  ]) assert.throws(() => createInsightCodingCliproxyAi({ cliproxy: { baseUrl: 'http://127.0.0.1:18317', apiKey: KEY }, configuration: candidate as unknown as typeof retained }), /requires a valid cliproxy configuration/);

  const seen: unknown[] = [];
  let status = 200;
  await withGateway((request, body, response) => {
    seen.push({ url: request.url, authorization: request.headers.authorization, body: JSON.parse(body.toString('utf8')) });
    reply(response, status, status === 200 ? envelope('{"i02":[]}') : JSON.stringify({ error: { message: 'synthetic outage' } }));
  }, async (baseUrl, requests) => {
    const supplied = { ...retained };
    const ai = createInsightCodingCliproxyAi({ cliproxy: { baseUrl, apiKey: KEY }, configuration: supplied });
    supplied.modelId = 'changed-after-binding';
    assert.ok(Object.isFrozen(ai.configuration));
    assert.deepEqual(ai.configuration, retained);
    const request = { ...textRequest(), configuration: retained };
    assert.deepEqual(await ai.port.generateText(request), { text: '{"i02":[]}' });
    assert.deepEqual(seen, [{ url: '/v1/chat/completions', authorization: `Bearer ${KEY}`, body: {
      model: MODEL, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: USER }], max_tokens: 16384, stream: false,
    } }]);
    await rejectsSafely(ai.port.generateText({ ...request, configuration: supplied }), 'configuration_mismatch');
    await rejectsSafely(ai.port.generateText({ ...request, configuration: { ...retained, maxOutputTokens: 1 } }), 'configuration_mismatch');
    assert.equal(requests(), 1, 'a mutated model or bound never dispatches');
    status = 503;
    await rejectsSafely(ai.port.generateText(request), 'gateway_http_error', 503);
    assert.equal(requests(), 2, 'a failed proposal request is not retried');
  });
});

test('I14 CLIProxy transport fails once with a generic code on unsafe, oversized or malformed gateway responses', async () => {
  const cases: ReadonlyArray<{ name: string; gateway: (response: ServerResponse) => void; code: string; httpStatus?: number }> = [
    { name: 'gateway error echoing the credential', code: 'gateway_http_error', httpStatus: 500,
      gateway: (response) => reply(response, 500, JSON.stringify({ error: { message: `invalid key ${KEY}` } })) },
    { name: 'credential in the raw envelope', code: 'malformed_envelope',
      gateway: (response) => reply(response, 200, envelope('{"synthesis":"synthetic"}', { system_fingerprint: KEY })) },
    { name: 'escaped credential in the parsed envelope', code: 'malformed_envelope',
      gateway: (response) => reply(response, 200, envelope('{"synthesis":"synthetic"}', { system_fingerprint: 'ESCAPED' }).replace('ESCAPED', ESCAPED_KEY)) },
    { name: 'escaped credential in the parsed content', code: 'malformed_envelope',
      gateway: (response) => reply(response, 200, envelope(`{"synthesis":"${ESCAPED_KEY}"}`)) },
    { name: 'streamed envelope beyond the bound', code: 'response_too_large',
      gateway: (response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        for (let index = 0; index < 10; index++) response.write(Buffer.alloc(64 * 1024, 0x20));
        response.end();
      } },
    { name: 'non-JSON envelope', code: 'malformed_envelope', gateway: (response) => reply(response, 200, 'synthetic plain text') },
    { name: 'more than one choice', code: 'malformed_envelope', gateway: (response) => reply(response, 200, envelope('{"synthesis":"synthetic"}', {}, 2)) },
  ];
  for (const entry of cases) {
    await withGateway((_request, _body, response) => entry.gateway(response), async (baseUrl, requests) => {
      await rejectsSafely(transport(baseUrl).port.generateText(textRequest()), entry.code, entry.httpStatus);
      assert.equal(requests(), 1, entry.name);
    });
  }
});

test('I14 CLIProxy transport propagates caller abort to the in-flight request without retry', async () => {
  let arrived!: () => void; const arrival = new Promise<void>((resolve) => { arrived = resolve; });
  let closed!: () => void; const closure = new Promise<void>((resolve) => { closed = resolve; });
  await withGateway((_request, _body, response) => { response.on('close', closed); arrived(); }, async (baseUrl, requests) => {
    const controller = new AbortController();
    const pending = transport(baseUrl).port.generateText(textRequest(controller.signal));
    await arrival;
    controller.abort();
    await rejectsSafely(pending, 'aborted');
    await closure;
    assert.equal(requests(), 1);
  });
});

test('I14 synthesis stays off unless the operator explicitly names a model with CLIProxy and OWNER writes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-i14-transport-')); roots.push(root);
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  const parse = (environment: NodeJS.ProcessEnv) => operatorAppConfigurationFromEnvironment(environment, { frontendDist, version: '0.1.0' });
  const base = { TDN_WORKSPACE_DB: path.join(root, 'workspace.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  const owner = { TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'strong-owner-token-12345678901234567890', TDN_OWNER_API_ACTOR_ID: 'owner:local' };
  const cliproxy = { TDN_CLIPROXY_BASE_URL: 'http://127.0.0.1:18317', TDN_CLIPROXY_API_KEY: KEY };
  const optIn = { TDN_RESEARCH_I14_AI_ENABLED: 'true', TDN_RESEARCH_I14_AI_MODEL: MODEL };

  // Content Studio's CLIProxy and a model name alone never opt INSIGHT into synthesis.
  for (const environment of [
    { ...base, ...owner, ...cliproxy },
    { ...base, ...owner, ...cliproxy, TDN_RESEARCH_I14_AI_MODEL: MODEL },
    { ...base, ...owner, ...cliproxy, ...optIn, TDN_RESEARCH_I14_AI_ENABLED: 'false' },
  ]) assert.equal('researchI14Ai' in parse(environment), false);
  assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...optIn, TDN_RESEARCH_I14_AI_ENABLED: 'yes' }), /TDN_RESEARCH_I14_AI_ENABLED must be exactly true or false/);
  for (const model of [undefined, '', ' synthetic-model', 'vendor/synthetic-model']) {
    assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...optIn, TDN_RESEARCH_I14_AI_MODEL: model }), /TDN_RESEARCH_I14_AI_MODEL must name an explicit CLIProxy model/);
  }
  assert.throws(() => parse({ ...base, ...owner, ...optIn }), /requires CLIProxy and OWNER writes/);
  assert.throws(() => parse({ ...base, ...cliproxy, ...optIn }), /requires CLIProxy and OWNER writes/);

  const enabled = parse({ ...base, ...owner, ...cliproxy, ...optIn });
  assert.deepEqual(enabled.researchI14Ai, {
    contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-configuration', providerId: 'cliproxy', modelId: MODEL,
    temperature: null, maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 262_144,
  });
  // A read-only automation application refuses a generating port before opening any database.
  assert.throws(() => openResearchAutomationApi({
    databasePath: base.TDN_WORKSPACE_DB, artifactRoot: base.TDN_ARTIFACT_ROOT, origin: 'http://127.0.0.1:18787',
    i14Synthesis: { cliproxy: enabled.cliproxy!, configuration: enabled.researchI14Ai! },
  }), /requires the OWNER writer/);

  assert.equal('researchDecisionAi' in enabled, false, 'I14 opt-in does not opt in three extra sections');
  assert.equal('researchInsightCodingAi' in enabled, false, 'I14 opt-in does not opt in Insight coding');
  for (const sectionId of ['M11', 'M12', 'I15'] as const) {
    const prefix = `TDN_RESEARCH_${sectionId}_AI`;
    for (const flag of [undefined, 'false']) {
      assert.equal('researchDecisionAi' in parse({ ...base, ...owner, ...cliproxy, [`${prefix}_MODEL`]: MODEL, [`${prefix}_ENABLED`]: flag }), false);
    }
    const optIn = { [`${prefix}_ENABLED`]: 'true', [`${prefix}_MODEL`]: MODEL };
    assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...optIn, [`${prefix}_ENABLED`]: 'yes' }), /must be exactly true or false/);
    for (const model of [undefined, '', ' invalid', 'vendor/model']) {
      assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...optIn, [`${prefix}_MODEL`]: model }), /must name an explicit CLIProxy model/);
    }
    assert.throws(() => parse({ ...base, ...owner, ...optIn }), /requires CLIProxy and OWNER writes/);
    assert.throws(() => parse({ ...base, ...cliproxy, ...optIn }), /requires CLIProxy and OWNER writes/);
    const result = parse({ ...base, ...owner, ...cliproxy, ...optIn });
    assert.deepEqual(Object.keys(result.researchDecisionAi!), [sectionId]);
    assert.equal(result.researchI14Ai, undefined);
    assert.equal(result.researchInsightCodingAi, undefined);
    assert.deepEqual(result.researchDecisionAi![sectionId], {
      contractVersion: '1.0.0', methodId: 'automation-decision-synthesis-configuration', sectionId,
      providerId: 'cliproxy', modelId: MODEL, temperature: null, maxOutputTokens: 16384, timeoutMs: 300000, maxResponseBytes: 262144,
    });
    assert.throws(() => openResearchAutomationApi({
      databasePath: base.TDN_WORKSPACE_DB, artifactRoot: base.TDN_ARTIFACT_ROOT, origin: 'http://127.0.0.1:18787',
      decisionSynthesis: { cliproxy: result.cliproxy!, configurations: result.researchDecisionAi! },
    }), /requires the OWNER writer/);
    assert.throws(() => openResearchAutomationApi({
      databasePath: base.TDN_WORKSPACE_DB, artifactRoot: base.TDN_ARTIFACT_ROOT, origin: 'http://127.0.0.1:18787',
      owner: { databasePath: base.TDN_WORKSPACE_DB, artifactRoot: base.TDN_ARTIFACT_ROOT, allowedOrigin: 'http://127.0.0.1:18787', writeEnabled: true, token: owner.TDN_OWNER_API_TOKEN, actorId: 'owner:local' },
      decisionSynthesis: { cliproxy: result.cliproxy!, configurations: { [sectionId]: decisionCliproxySynthesisConfiguration(sectionId === 'M11' ? 'M12' : 'M11', MODEL) } },
    }), /section configuration mismatch/, 'section mismatch fails before opening the nonexistent database');
  }

  const insightPrefix = 'TDN_RESEARCH_INSIGHT_CODING_AI';
  const insightOptIn = { [`${insightPrefix}_ENABLED`]: 'true', [`${insightPrefix}_MODEL`]: MODEL };
  const everyOtherModel = { ...optIn, TDN_RESEARCH_M11_AI_ENABLED: 'true', TDN_RESEARCH_M11_AI_MODEL: MODEL, TDN_RESEARCH_I15_AI_ENABLED: 'true', TDN_RESEARCH_I15_AI_MODEL: MODEL };
  // Default off: CLIProxy, a model name, or every other enabled model flag never opts Insight coding in.
  for (const flag of [undefined, 'false']) {
    assert.equal('researchInsightCodingAi' in parse({ ...base, ...owner, ...cliproxy, ...everyOtherModel, [`${insightPrefix}_MODEL`]: MODEL, [`${insightPrefix}_ENABLED`]: flag }), false);
  }
  assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...insightOptIn, [`${insightPrefix}_ENABLED`]: 'TRUE' }), /TDN_RESEARCH_INSIGHT_CODING_AI_ENABLED must be exactly true or false/);
  for (const model of [undefined, '', ' synthetic-model', 'vendor/synthetic-model']) {
    // Another section's model is never borrowed for a missing or invalid Insight coding model.
    assert.throws(() => parse({ ...base, ...owner, ...cliproxy, ...everyOtherModel, ...insightOptIn, [`${insightPrefix}_MODEL`]: model }), /TDN_RESEARCH_INSIGHT_CODING_AI_MODEL must name an explicit CLIProxy model/);
  }
  assert.throws(() => parse({ ...base, ...owner, ...insightOptIn }), /INSIGHT_CODING_AI_ENABLED requires CLIProxy and OWNER writes/);
  assert.throws(() => parse({ ...base, ...cliproxy, ...insightOptIn }), /INSIGHT_CODING_AI_ENABLED requires CLIProxy and OWNER writes/);
  const insight = parse({ ...base, ...owner, ...cliproxy, ...insightOptIn, [`${insightPrefix}_MODEL`]: 'synthetic-insight-model' });
  assert.deepEqual(insight.researchInsightCodingAi, insightCodingCliproxyConfiguration('synthetic-insight-model'));
  assert.equal('researchI14Ai' in insight, false, 'Insight coding opt-in does not opt in I14');
  assert.equal('researchDecisionAi' in insight, false, 'Insight coding opt-in does not opt in decision sections');
  assert.throws(() => openResearchAutomationApi({
    databasePath: base.TDN_WORKSPACE_DB, artifactRoot: base.TDN_ARTIFACT_ROOT, origin: 'http://127.0.0.1:18787',
    insightCoding: { cliproxy: insight.cliproxy!, configuration: insight.researchInsightCodingAi! },
  }), /requires the OWNER writer/, 'read-only API refuses coding even with valid model configuration');
});

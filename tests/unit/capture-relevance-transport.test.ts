import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { captureRelevanceConfiguration, createCaptureRelevanceCliproxyTransport } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { classifyCaptureRelevance, validateCaptureRelevanceConfiguration, type CaptureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { CAPTURE_RELEVANCE_PROMPT } from '../../src/modules/analysis/research-automation/capture-relevance.js';

export function relevanceOperatorConfig(t: {after: (callback: () => void) => void}, value?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'synthetic-relevance-config-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const frontendDist = path.join(root,'dist'); fs.mkdirSync(frontendDist); fs.writeFileSync(path.join(frontendDist,'index.html'),'<p>Synthetic</p>');
  const base: NodeJS.ProcessEnv = {TDN_WORKSPACE_DB:path.join(root,'test.sqlite'),TDN_ARTIFACT_ROOT:path.join(root,'artifacts'),
    ...(value === undefined ? {} : {TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL:value})};
  return {base, read: (env: NodeJS.ProcessEnv = {}) => operatorAppConfigurationFromEnvironment({...base,...env},{frontendDist,version:'synthetic'})};
}
const configuration = captureRelevanceConfiguration('synthetic-lumo-model');
// A transport-only sentinel; fetch is replaced in every test. No socket is opened.
const cliproxy = {baseUrl:'http://127.0.0.1:1',apiKey:'synthetic-not-a-credential'};
const input = {keyword:'lumo pod',items:[{id:'synthetic-title',title:'Lumo pod amber',category:'Invented lumoware'}]};
const response = [{id:'synthetic-title',label:'UNSURE'}];
const envelope = (text: string) => new Response(JSON.stringify({choices:[{message:{content:text}}]}));
const transport = (config = configuration) => createCaptureRelevanceCliproxyTransport({cliproxy,configuration:config});

test('configuration has no default: unset and empty disable; explicit id enables; invalid values fail', t => {
  const {read} = relevanceOperatorConfig(t);
  assert.equal(read().researchCaptureRelevanceAi,undefined);
  assert.equal(read({TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL:''}).researchCaptureRelevanceAi,undefined);
  const owner = {TDN_OWNER_API_ENABLED:'true',TDN_OWNER_API_TOKEN:'synthetic-owner-token-1234567890',TDN_OWNER_API_ACTOR_ID:'synthetic-owner'};
  const gateway = {TDN_CLIPROXY_BASE_URL:cliproxy.baseUrl,TDN_CLIPROXY_API_KEY:cliproxy.apiKey};
  const enabled = {TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL:'synthetic-lumo-model'};
  assert.throws(() => read(enabled),/CLIProxy and OWNER/);
  assert.throws(() => read({...enabled,...owner}),/CLIProxy and OWNER/);
  assert.throws(() => read({...enabled,...gateway}),/CLIProxy and OWNER/);
  const selected = read({...enabled,...owner,...gateway});
  assert.deepEqual(selected.researchCaptureRelevanceAi,configuration);
  assert.equal(selected.researchKeywordDraftAi,undefined); assert.equal(selected.researchI14Ai,undefined);
  for (const value of [' ',' invalid','bad/model','bad\nmodel','-bad','x'.repeat(129)]) {
    assert.throws(() => read({...owner,...gateway,TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL:value}),/explicit valid model/);
  }
  assert.throws(() => captureRelevanceConfiguration(undefined as unknown as string),TypeError);
  assert.deepEqual(configuration,{contractVersion:'capture-relevance-configuration-v1',providerId:'cliproxy',modelId:'synthetic-lumo-model',temperature:null,maxOutputTokens:16384,timeoutMs:300000,maxResponseBytes:262144});
});

test('configuration bounds include endpoints and reject out-of-bound, fractional and extra values', () => {
  const bounds = {timeoutMs:[1000,600000],maxOutputTokens:[1,65536],maxResponseBytes:[1,1048576],temperature:[0,2]} as const;
  for (const [key,[low,high]] of Object.entries(bounds)) {
    for (const value of [low,high]) assert.equal(validateCaptureRelevanceConfiguration({...configuration,[key]:value}),true,`${key}=${value}`);
    for (const value of [low-1,high+1]) {
      const bad = {...configuration,[key]:value};
      assert.equal(validateCaptureRelevanceConfiguration(bad),false,`${key}=${value}`);
      assert.throws(() => transport(bad),TypeError);
    }
  }
  for (const key of ['timeoutMs','maxOutputTokens','maxResponseBytes']) assert.equal(validateCaptureRelevanceConfiguration({...configuration,[key]:1.5}),false);
  for (const bad of [{...configuration,extra:true},{...configuration,providerId:'invented-provider'},{...configuration,modelId:''}]) assert.equal(validateCaptureRelevanceConfiguration(bad),false);
  assert.equal(validateCaptureRelevanceConfiguration({...configuration,temperature:null}),true);
});

for (const wrapper of ['plain','json fence','bare fence'] as const) test(`stubbed HTTP accepts ${wrapper} and sends the explicit model and prompt`, async t => {
  let calls = 0;
  t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit) => {
    calls++; const body = JSON.parse(String(init.body));
    assert.equal(body.model,'synthetic-lumo-model'); assert.equal(body.max_tokens,16384); assert.equal(body.stream,false);
    assert.equal(body.messages[0].content,CAPTURE_RELEVANCE_PROMPT); assert.deepEqual(JSON.parse(body.messages[1].content),input);
    assert.equal(init.redirect,'error'); assert.ok(init.signal); assert.equal(body.temperature,undefined);
    const json = JSON.stringify(response);
    return envelope(wrapper === 'plain' ? json : wrapper === 'json fence' ? `\n\x60\x60\x60json\n${json}\n\x60\x60\x60\n` : `\x60\x60\x60\r\n${json}\r\n\x60\x60\x60`);
  });
  assert.deepEqual(await transport().classify(input),response); assert.equal(calls,1);
});

for (const value of ['Here is JSON: []','```json\n[]\n```\nextra prose','```json\n[]\n```\n```json\n[]\n```','```json\n```json\n[]\n```\n```']) test(`stubbed HTTP rejects wrapper ${JSON.stringify(value)}`, async t => {
  t.mock.method(globalThis,'fetch',async () => envelope(value));
  await assert.rejects(transport().classify(input),/invalid JSON/);
});

test('response byte bound measures UTF-8 bytes and accepts its exact boundary', async t => {
  const text = JSON.stringify(response) + ' '.repeat(5);
  t.mock.method(globalThis,'fetch',async () => envelope(text));
  assert.deepEqual(await transport({...configuration,maxResponseBytes:Buffer.byteLength(text)}).classify(input),response);
  await assert.rejects(transport({...configuration,maxResponseBytes:Buffer.byteLength(text)-1}).classify(input),/too large/);
  // Multibyte whitespace is trimmed by JSON parsing but still counts against the byte limit.
  const unicode = JSON.stringify(response) + '\u2003'.repeat(5);
  t.mock.method(globalThis,'fetch',async () => envelope(unicode));
  await assert.rejects(transport({...configuration,maxResponseBytes:unicode.length}).classify(input),/too large/);
});

test('real transport timeout retries once then retains nulls, without a network request', async t => {
  let calls = 0; const signals: AbortSignal[] = [];
  const config: CaptureRelevanceConfiguration = {...configuration,timeoutMs:1000};
  t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit) => {
    calls++; const signal = init.signal!; signals.push(signal);
    return new Promise<Response>((_resolve,reject) => signal.addEventListener('abort',() => reject(signal.reason),{once:true}));
  });
  // AbortSignal.timeout is unref'd; keep this synthetic test alive until both deadlines fire.
  const keepAlive = setInterval(() => undefined,100);
  try {
    const record = await classifyCaptureRelevance([{title:input.items[0]!.title}], [input.keyword], {configuration:config,classifier:transport(config)});
    assert.equal(calls,2); assert.ok(signals.every(signal => signal.aborted));
    assert.deepEqual(record.methodNotes,{batches:1,retriedBatches:1,failedBatches:1,cappedTitles:0});
    assert.equal(record.decisions[0]!.label,null);
  } finally { clearInterval(keepAlive); }
});

test('caller abort reaches HTTP and retries through the null fallback without dispatching again', async t => {
  const controller = new AbortController(); let calls = 0;
  t.mock.method(globalThis,'fetch',async (_url:unknown,init:RequestInit) => {
    calls++; assert.ok(init.signal); controller.abort(); assert.equal(init.signal.aborted,true); throw new DOMException('synthetic abort','AbortError');
  });
  const record = await classifyCaptureRelevance([{title:input.items[0]!.title}], [input.keyword],{configuration,classifier:transport()},controller.signal);
  assert.equal(calls,1); assert.deepEqual(record.methodNotes,{batches:1,retriedBatches:1,failedBatches:1,cappedTitles:0});
  assert.equal(record.decisions[0]!.label,null);
});

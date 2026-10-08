import assert from 'node:assert/strict';
import test from 'node:test';
import { createKeywordCliproxyTransport, keywordDraftConfiguration } from '../../src/modules/analysis/research-automation/keyword-cliproxy-transport.js';
const configuration = keywordDraftConfiguration('synthetic-model');
const input: Parameters<ReturnType<typeof createKeywordCliproxyTransport>['draftLists']>[0] = { productNames: ['Tên nguồn'], includeTerms: ['thạch dừa'], excludeTerms: [], prompt: 'Retained exact synthetic prompt', promptVersion: 'l9-keyword-prompt-v1', modelIdentity: 'cliproxy:synthetic-model' };
const transport = () => createKeywordCliproxyTransport({ cliproxy: { baseUrl: 'http://127.0.0.1:9876', apiKey: 'synthetic-secret' }, configuration });
test('keyword transport fails identity mismatch and pre-cancellation before HTTP', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; throw new Error('unexpected HTTP'); });
  await assert.rejects(transport().draftLists({ ...input, modelIdentity: 'substituted-model' }), /bound generation identity/);
  await assert.rejects(transport().draftLists({ ...input, signal: AbortSignal.abort() }));
  assert.equal(calls, 0);
});
test('keyword transport never retries failed dispatch and rejects oversized envelopes', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { status: 503 }); });
  await assert.rejects(transport().draftLists(input));
  assert.equal(calls, 1);
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('', { headers: { 'content-length': '9999999' } }); });
  await assert.rejects(transport().draftLists(input));
  assert.equal(calls, 2);
});
test('keyword transport forwards active cancellation to its single request', async t => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    calls++;
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    controller.abort();
    assert.equal(options.signal.aborted, true);
    throw new Error('synthetic cancellation');
  });
  await assert.rejects(transport().draftLists({ ...input, signal: controller.signal }));
  assert.equal(calls, 1);
});

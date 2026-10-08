import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIndexCloudClient, PAGEINDEX_LIST_PATH, PAGEINDEX_UPLOAD_PATH } from '../../src/modules/analysis/pageindex-cloud.js';

const bytes = Buffer.from('%PDF-synthetic-upload-test');

function clientFor(routes: Record<string, { status: number; body: unknown }>): { client: PageIndexCloudClient; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push({ url, init });
    const route = Object.entries(routes).find(([suffix]) => url.endsWith(suffix))?.[1]
      ?? { status: 404, body: { error: 'NOT_FOUND' } };
    if (route.status === 403 && typeof route.body === 'string') {
      return new Response(route.body, { status: 403, headers: { 'Content-Type': 'text/plain' } });
    }
    return new Response(JSON.stringify(route.body), { status: route.status });
  };
  return { client: new PageIndexCloudClient({ enabled: true, apiKey: 'synthetic-key', fetch: transport }), calls };
}

test('upload posts to the named constant path and reads the created document', async () => {
  const { client, calls } = clientFor({
    [PAGEINDEX_UPLOAD_PATH]: { status: 200, body: { id: 'pi-new', name: 'a.pdf', pageNum: 3, status: 'processing' } },
  });
  const doc = await client.uploadDocument({ fileName: 'a.pdf', bytes });
  assert.equal(doc.cloudDocId, 'pi-new');
  assert.equal(doc.cloudFileName, 'a.pdf');
  assert.equal(doc.pageCount, 3);
  assert.equal(doc.status, 'processing');
  assert.equal(calls.length, 1);
  assert.ok(calls[0]!.url.endsWith(PAGEINDEX_UPLOAD_PATH));
  assert.equal(calls[0]!.init?.method, 'POST');
});

test('document status reuses metadata and list is the free call with a bounded body', async () => {
  const { client, calls } = clientFor({
    '/metadata': { status: 200, body: { id: 'pi-new', name: 'a.pdf', pageNum: 3, status: 'completed' } },
    [PAGEINDEX_LIST_PATH]: { status: 200, body: { documents: [{ id: 'pi-new', name: 'a.pdf', pageNum: 3, status: 'completed' }] } },
  });
  assert.equal((await client.documentStatus('pi-new')).status, 'completed');
  const listed = await client.listDocuments();
  assert.equal(listed.length, 1);
  assert.equal(listed[0]?.cloudDocId, 'pi-new');
  assert.ok(calls.every(call => (call.init?.method ?? 'GET') === 'GET'));
});

test('a 403 carrying USAGE_LIMIT_REACHED maps once while other errors keep their codes', async () => {
  const limited = clientFor({ [PAGEINDEX_UPLOAD_PATH]: { status: 403, body: '{"error":"USAGE_LIMIT_REACHED","plan":"free"}' } });
  await assert.rejects(limited.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_USAGE_LIMIT_REACHED' });
  assert.equal(limited.calls.length, 1, 'no retry on usage limit');
  const forbidden = clientFor({ [PAGEINDEX_UPLOAD_PATH]: { status: 403, body: '{"error":"FORBIDDEN"}' } });
  await assert.rejects(forbidden.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_HTTP_403' });
  const missing = clientFor({ '/metadata': { status: 404, body: { error: 'gone' } } });
  await assert.rejects(missing.client.documentStatus('pi-nope'), { message: 'PAGEINDEX_HTTP_404' });
  assert.equal(missing.calls.length, 1, 'no retry on other errors');
});

test('uploads validate input before dispatching and there is no delete method', async () => {
  const { client, calls } = clientFor({});
  for (const input of [
    { fileName: '', bytes },
    { fileName: 'a\nb.pdf', bytes },
    { fileName: 'a.pdf', bytes: new Uint8Array(0) },
  ]) {
    await assert.rejects(client.uploadDocument(input as { fileName: string; bytes: Uint8Array }), { message: 'PAGEINDEX_INPUT_INVALID' });
  }
  await assert.rejects(client.documentStatus(''), { message: 'PAGEINDEX_INPUT_INVALID' });
  assert.equal(calls.length, 0);
  const names = new Set([...Object.getOwnPropertyNames(Object.getPrototypeOf(client)), ...Object.keys(client)]);
  assert.ok(![...names].some(name => /delet/i.test(name)), 'no delete method may exist on the client');
});

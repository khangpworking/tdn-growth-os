import test from 'node:test';
import assert from 'node:assert/strict';
import { PageIndexCloudClient, PAGEINDEX_LIST_PATH, PAGEINDEX_UPLOAD_PATH } from '../../src/modules/analysis/pageindex-cloud.js';

const bytes = Buffer.from('%PDF-synthetic-upload-test');
type Route = { status: number; body: unknown } | ((url: URL) => { status: number; body: unknown });

/** Routes match the exact path (query ignored); `/metadata` matches any metadata read. Unknown paths answer 404. */
function clientFor(routes: Record<string, Route>): { client: PageIndexCloudClient; calls: Array<{ url: string; init: RequestInit | undefined }> } {
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    calls.push({ url: String(input), init });
    const found = routes[url.pathname] ?? (url.pathname.endsWith('/metadata') ? routes['/metadata'] : undefined);
    const route = (typeof found === 'function' ? found(url) : found) ?? { status: 404, body: { detail: 'Not Found' } };
    if (typeof route.body === 'string') return new Response(route.body, { status: route.status, headers: { 'Content-Type': 'text/plain' } });
    return new Response(JSON.stringify(route.body), { status: route.status });
  };
  return { client: new PageIndexCloudClient({ enabled: true, apiKey: 'synthetic-key', fetch: transport }), calls };
}

test('the vendor paths are the ones checked on 18/10', () => {
  assert.equal(PAGEINDEX_UPLOAD_PATH, '/doc/');
  assert.equal(PAGEINDEX_LIST_PATH, '/docs');
});

test('upload posts multipart field "file" with the file name, key header and no JSON or base64 body', async () => {
  const { client, calls } = clientFor({ '/doc/': { status: 200, body: { id: 'pi-new', name: 'a.pdf', pageNum: 3, status: 'processing' } } });
  const doc = await client.uploadDocument({ fileName: 'a.pdf', bytes });
  assert.deepEqual(doc, { cloudDocId: 'pi-new', cloudFileName: 'a.pdf', pageCount: 3, status: 'processing' });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0]!;
  assert.equal(url, 'https://api.pageindex.ai/doc/');
  assert.equal(init?.method, 'POST');
  assert.equal(init?.redirect, 'error');
  const headers = init?.headers as Record<string, string>;
  assert.deepEqual(headers, { api_key: 'synthetic-key' });
  assert.ok(!Object.keys(headers).some(name => name.toLowerCase() === 'content-type'), 'fetch sets the multipart boundary itself');
  assert.ok(init?.body instanceof FormData);
  const form = init.body as FormData;
  assert.deepEqual([...form.keys()], ['file']);
  const file = form.get('file') as File;
  assert.equal(file.name, 'a.pdf');
  assert.equal(file.type, 'application/pdf');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), bytes);
  assert.ok(!form.has('content_base64') && !form.has('file_name'));
});

test('an upload reply with only doc_id is completed by the free metadata read, not failed', async () => {
  const { client, calls } = clientFor({
    '/doc/': { status: 200, body: { doc_id: 'pi-new' } },
    '/metadata': { status: 200, body: { id: 'pi-new', name: 'a_1.pdf', pageNum: null, status: 'processing' } },
  });
  const doc = await client.uploadDocument({ fileName: 'a.pdf', bytes });
  assert.deepEqual(doc, { cloudDocId: 'pi-new', cloudFileName: 'a_1.pdf', pageCount: null, status: 'processing' }, 'the stored (suffixed) name is kept');
  assert.equal(calls.length, 2);
  assert.equal(calls[1]!.url, 'https://api.pageindex.ai/doc/pi-new/metadata');
  assert.equal(calls[1]!.init?.method, 'GET');
  const noId = clientFor({ '/doc/': { status: 200, body: { status: 'processing' } } });
  await assert.rejects(noId.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_RESPONSE_INVALID' });
  assert.equal(noId.calls.length, 1);
});

test('list pages through /docs by limit and offset until total, all GET', async () => {
  const all = Array.from({ length: 230 }, (_, i) => ({ id: `pi-${i}`, name: `t${i}.pdf`, pageNum: 2, status: 'completed' }));
  const { client, calls } = clientFor({ '/docs': url => {
    const limit = Number(url.searchParams.get('limit')); const offset = Number(url.searchParams.get('offset'));
    return { status: 200, body: { documents: all.slice(offset, offset + limit), total: all.length, limit, offset } };
  } });
  const listed = await client.listDocuments();
  assert.equal(listed.length, 230);
  assert.deepEqual(listed.map(doc => doc.cloudDocId), all.map(doc => doc.id));
  assert.deepEqual(calls.map(call => new URL(call.url).search), ['?limit=100&offset=0', '?limit=100&offset=100', '?limit=100&offset=200']);
  assert.ok(calls.every(call => (call.init?.method ?? 'GET') === 'GET'));
});

test('list without a total stops on a short page; an empty first page is an empty list', async () => {
  const short = clientFor({ '/docs': { status: 200, body: { documents: [{ id: 'pi-a', name: 'a.pdf', pageNum: 3, status: 'completed' }] } } });
  assert.equal((await short.client.listDocuments()).length, 1);
  assert.equal(short.calls.length, 1);
  const empty = clientFor({ '/docs': { status: 200, body: { documents: [], total: 0, limit: 100, offset: 0 } } });
  assert.deepEqual(await empty.client.listDocuments(), []);
  assert.equal(empty.calls.length, 1);
});

test('list follows smaller pages to the total without imposing a 101-page document limit', async () => {
  const { client, calls } = clientFor({ '/docs': url => {
    const offset = Number(url.searchParams.get('offset'));
    return { status: 200, body: { documents: [{ id: `pi-${offset}`, name: 'a.pdf', pageNum: 1 }], total: 105 } };
  } });
  assert.equal((await client.listDocuments()).length, 105);
  assert.equal(calls.length, 105);
  assert.equal(new URL(calls[104]!.url).searchParams.get('offset'), '104');
});

test('an empty page before the declared total fails rather than returning an incomplete list', async () => {
  const { client, calls } = clientFor({ '/docs': { status: 200, body: { documents: [], total: 1 } } });
  await assert.rejects(client.listDocuments(), { message: 'PAGEINDEX_RESPONSE_INVALID' });
  assert.equal(calls.length, 1);
});

test('list keeps the 10000 cap: a larger total or a never-ending reply is RESPONSE_TOO_LARGE', async () => {
  const big = clientFor({ '/docs': { status: 200, body: { documents: [], total: 10001 } } });
  await assert.rejects(big.client.listDocuments(), { message: 'PAGEINDEX_RESPONSE_TOO_LARGE' });
  const page = Array.from({ length: 100 }, (_, i) => ({ id: `pi-${i}`, name: 'x.pdf', pageNum: 1, status: 'completed' }));
  const endless = clientFor({ '/docs': { status: 200, body: { documents: page } } });
  await assert.rejects(endless.client.listDocuments(), { message: 'PAGEINDEX_RESPONSE_TOO_LARGE' });
  assert.equal(endless.calls.length, 101, 'the call past 10000 documents fails instead of growing the list');
  const invalid = clientFor({ '/docs': { status: 200, body: { items: [] } } });
  await assert.rejects(invalid.client.listDocuments(), { message: 'PAGEINDEX_RESPONSE_INVALID' });
});

test('without a total, pagination ends on a later short or empty page and permits exactly 10000 documents', async () => {
  for (const size of [100, 101, 10000]) {
    const { client, calls } = clientFor({ '/docs': url => {
      const offset = Number(url.searchParams.get('offset'));
      const documents = Array.from({ length: Math.min(100, size - offset) }, (_, i) => ({ id: `pi-${offset + i}`, name: 'a.pdf', pageNum: 1 }));
      return { status: 200, body: { documents } };
    } });
    assert.equal((await client.listDocuments()).length, size);
    assert.equal(calls.length, Math.floor(size / 100) + 1);
  }
});

test('metadata fallback makes only one extra call, preserving failures and secret protection', async () => {
  for (const [metadata, message] of [
    [{ status: 404, body: { detail: 'Not found' } }, 'PAGEINDEX_HTTP_404'],
    [{ status: 200, body: { id: 'pi-new' } }, 'PAGEINDEX_RESPONSE_INVALID'],
    [{ status: 200, body: { id: 'pi-new', name: 'synthetic-key', pageNum: 1 } }, 'PAGEINDEX_SECRET_ECHO'],
  ] as const) {
    const { client, calls } = clientFor({ '/doc/': { status: 200, body: { id: 'pi-new' } }, '/metadata': metadata });
    await assert.rejects(client.uploadDocument({ fileName: 'a.pdf', bytes }), { message });
    assert.equal(calls.length, 2);
  }
});

test('document status reuses metadata', async () => {
  const { client, calls } = clientFor({ '/metadata': { status: 200, body: { id: 'pi-new', name: 'a.pdf', pageNum: 3, status: 'completed' } } });
  assert.equal((await client.documentStatus('pi-new')).status, 'completed');
  assert.equal(calls[0]!.url, 'https://api.pageindex.ai/doc/pi-new/metadata');
});

test('a 403 carrying USAGE_LIMIT_REACHED maps once while 404, 405 and 422 keep their codes, single attempt', async () => {
  const limited = clientFor({ '/doc/': { status: 403, body: '{"error":"USAGE_LIMIT_REACHED","plan":"free"}' } });
  await assert.rejects(limited.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_USAGE_LIMIT_REACHED' });
  assert.equal(limited.calls.length, 1, 'no retry on usage limit');
  const forbidden = clientFor({ '/doc/': { status: 403, body: '{"error":"FORBIDDEN"}' } });
  await assert.rejects(forbidden.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_HTTP_403' });
  const notAllowed = clientFor({ '/doc/': { status: 405, body: { detail: 'Method Not Allowed' } } });
  await assert.rejects(notAllowed.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_HTTP_405' });
  assert.equal(notAllowed.calls.length, 1);
  const unprocessable = clientFor({ '/doc/': { status: 422, body: { detail: [{ loc: ['body', 'file'], msg: 'Field required', type: 'missing' }] } } });
  await assert.rejects(unprocessable.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_HTTP_422' });
  assert.equal(unprocessable.calls.length, 1);
  const missingList = clientFor({});
  await assert.rejects(missingList.client.listDocuments(), { message: 'PAGEINDEX_HTTP_404' });
  assert.equal(missingList.calls.length, 1);
  const missing = clientFor({ '/metadata': { status: 404, body: { error: 'gone' } } });
  await assert.rejects(missing.client.documentStatus('pi-nope'), { message: 'PAGEINDEX_HTTP_404' });
  assert.equal(missing.calls.length, 1, 'no retry on other errors');
});

test('an upload reply that echoes the key is refused', async () => {
  const echo = clientFor({ '/doc/': { status: 200, body: { id: 'pi-new', name: 'synthetic-key', pageNum: 1, status: 'processing' } } });
  await assert.rejects(echo.client.uploadDocument({ fileName: 'a.pdf', bytes }), { message: 'PAGEINDEX_SECRET_ECHO' });
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { PageIndexCloudClient } from '../../src/modules/analysis/pageindex-cloud.js';
import type { PageIndexCloudQuery } from '../../contracts/analysis/pageindex-cloud-query.generated.js';

const bytes = Buffer.from('%PDF-synthetic-protocol-test-not-a-document');
const request: PageIndexCloudQuery = { contractVersion: 'pageindex-cloud-query-v1',
  sourcePackageId: '00000000-0000-4000-8000-000000000001', manifestSha256: 'a'.repeat(64),
  logicalPath: 'fixture.pdf', sourceSha256: createHash('sha256').update(bytes).digest('hex'),
  cloudDocId: 'pi-fixture', cloudFileName: 'nguon.pdf', pageCount: 1, question: 'Hàm lượng canxi?' };
const pages = [{ page: 1, text: 'Canxi 120 mg mỗi khẩu phần' }];
const meta = { document: 'nguon.pdf', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [0, 0, 100, 100] };
const answer = { choices: [{ message: { content: '120 mg <doc=nguon.pdf;page=1;block=p1_text_1>' } }], citations: [meta],
  usage: { prompt_tokens: 10, completion_tokens: 5 } };
const block = { doc_id: 'pi-fixture', page: 1, block_id: 'p1_text_1', block_type: 'text', bbox: [0, 0, 100, 100],
  text: 'Canxi 120 mg mỗi khẩu phần' };

function setup(changes: { metadata?: object; answer?: unknown; rawAnswer?: string; block?: object; transportError?: boolean } = {}) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const transport: typeof fetch = async (input, init) => {
    const url = String(input); calls.push({ url, init });
    if (changes.transportError) throw new Error('secret-fixture-key');
    const data = url.endsWith('/metadata') ? (changes.metadata ?? { id: 'pi-fixture', name: 'nguon.pdf', pageNum: 1, status: 'completed' })
      : url.endsWith('/chat/completions') ? (changes.answer ?? answer) : (changes.block ?? block);
    return new Response(url.endsWith('/chat/completions') && changes.rawAnswer !== undefined
      ? changes.rawAnswer : JSON.stringify(data), { status: 200 });
  };
  return { calls, client: new PageIndexCloudClient({ enabled: true, apiKey: 'secret-fixture-key', fetch: transport }) };
}

test('Cloud citation remains an unreviewed retrieval candidate tied to exact source bytes', async () => {
  const { client, calls } = setup(); const result = await client.query(request, bytes, pages);
  assert.equal(result.approvalState, 'UNREVIEWED'); assert.equal(result.cloudBinding, 'CALLER_ASSERTED_LOCALLY_CHECKED');
  assert.equal(result.model, null); assert.equal(result.candidates[0]?.sourceSha256, request.sourceSha256);
  assert.equal(result.candidates[0]?.verification, 'LOCAL_PDF_TEXT_MATCH');
  assert.equal(result.candidates[0]?.quote, 'Canxi 120 mg mỗi khẩu phần');
  assert.deepEqual(result.usage, { promptTokens: 10, completionTokens: 5 });
  assert.equal(calls.length, 3);
  assert.ok(calls.every(c => c.url.startsWith('https://api.pageindex.ai/') && c.init?.redirect === 'error'));
});

test('bad inputs cannot dispatch and a wrong Cloud document cannot dispatch the paid chat', async () => {
  for (const invalid of [{ ...request, extra: true }, { ...request, cloudFileName: 'x\ny.pdf' },
    { ...request, sourceSha256: 'b'.repeat(64) }]) {
    const { client, calls } = setup();
    await assert.rejects(client.query(invalid, bytes, pages), /PAGEINDEX_INPUT_INVALID/); assert.equal(calls.length, 0);
  }
  const { client, calls } = setup({ metadata: { id: 'pi-other', name: 'nguon.pdf', pageNum: 1, status: 'completed' } });
  await assert.rejects(client.query(request, bytes, pages), /PAGEINDEX_DOCUMENT_MISMATCH/); assert.equal(calls.length, 1);
  assert.throws(() => new PageIndexCloudClient({ enabled: false, apiKey: 'secret-fixture-key' }), /PAGEINDEX_DISABLED/);
});

test('changed amounts, empty table text and missing evidence cannot acquire verified status', async () => {
  for (const [candidate, response, verification] of [
    [{ ...block, text: 'Canxi 120 g mỗi khẩu phần' }, answer, 'UNVERIFIED_LOCAL_TEXT'],
    [{ ...block, text: '|---|---|', block_type: 'table' }, { ...answer, citations: [{ ...meta, block_type: 'table' }] }, 'UNVERIFIED_LOCAL_TEXT'],
    [{ ...block, text: '|Canxi|120 mg|', block_type: 'table' }, { ...answer, citations: [{ ...meta, block_type: 'table' }] }, 'LOCAL_PDF_TEXT_MATCH'],
  ] as const) {
    const { client } = setup({ block: candidate, answer: response });
    assert.equal((await client.query(request, bytes, pages)).candidates[0]?.verification, verification);
  }
  const { client } = setup({ answer: { choices: [{ message: { content: 'Không tìm thấy.' } }], citations: [] } });
  const result = await client.query(request, bytes, pages);
  assert.equal(result.candidates.length, 0); assert.equal(result.approvalState, 'UNREVIEWED');
  assert.ok(result.limitations.some(x => x.includes('does not establish absence')));
});

test('citation identity and geometry disagreements fail instead of linking unrelated source blocks', async () => {
  const cases = [
    { answer: { ...answer, citations: [{ ...meta, document: 'other.pdf' }] } },
    { answer: { ...answer, citations: [] } },
    { block: { ...block, doc_id: 'pi-other' } },
    { block: { ...block, page: 2 } },
    { block: { ...block, bbox: [100, 0, 0, 100] }, answer: { ...answer, citations: [{ ...meta, bbox: [100, 0, 0, 100] }] } },
  ];
  for (const item of cases) {
    const { client } = setup(item); await assert.rejects(client.query(request, bytes, pages), /PAGEINDEX_(?:CITATION|BLOCK)_/);
  }
});

test('transport failures are generic, secret echoes fail closed and there are no automatic retries', async () => {
  const failed = setup({ transportError: true });
  await assert.rejects(failed.client.query(request, bytes, pages), { message: 'PAGEINDEX_TRANSPORT_FAILED' });
  assert.equal(failed.calls.length, 1);
  const echoed = setup({ answer: { ...answer, model: 'secret-fixture-key' } });
  await assert.rejects(echoed.client.query(request, bytes, pages), { message: 'PAGEINDEX_SECRET_ECHO' });
  assert.equal(echoed.calls.length, 2);
  const escaped = JSON.stringify({ ...answer, model: 'secret-fixture-key' }).replace('secret-fixture-key',
    [...'secret-fixture-key'].map(c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0')).join(''));
  assert.ok(!escaped.includes('secret-fixture-key'));
  const encodedEcho = setup({ rawAnswer: escaped });
  await assert.rejects(encodedEcho.client.query(request, bytes, pages), { message: 'PAGEINDEX_SECRET_ECHO' });
  assert.equal(encodedEcho.calls.length, 2);
});

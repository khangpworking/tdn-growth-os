import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { checkKeywordListDraftRecord, replayKeywordListDraft, retainKeywordListDraft, KEYWORD_LIST_DRAFT_RECORD_CONTRACT, KeywordListDraftRecordError, type KeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-keyword-draft-record-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const run = { workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222' };
  const scope = { ...run, selectedProductIds: ['kalodata:12345'], peerProductIds: [], includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'] };
  const scopeDigest = (await store.put(Buffer.from(JSON.stringify(scope)))).sha256;
  const raw = JSON.stringify({ data: [{ product_id: '12345', product_name: 'Thạch dừa An Nhiên 350g' }] });
  const digest = (await store.put(Buffer.from(raw))).sha256;
  const captureDigest = (await store.put(Buffer.from(JSON.stringify({ contractVersion: 'research-automation-capture-v1', provider: 'KALODATA',
    operation: 'kalodata.product.rank', outcome: 'OK', responseBytesBase64: Buffer.from(raw).toString('base64'), responseSha256: digest, responseByteLength: Buffer.byteLength(raw) })))).sha256;
  const record: KeywordListDraftRecord = { contractVersion: KEYWORD_LIST_DRAFT_RECORD_CONTRACT, run, scopeDigest, sourceSetDigest: null,
    salesNameRefs: [{ digest, locator: '/data/0/product_name', captureDigest }],
    seeds: { productNames: ['Thạch dừa An Nhiên 350g'], includeTerms: scope.includeTerms, excludeTerms: scope.excludeTerms },
    dataVersion: 'l9-thach-dua-v1', category: 'thạch dừa synthetic',
    model: { configuration: null, identity: 'synthetic-fake-model-v1', promptVersion: 'l9-draft-prompt-v1', prompt: 'Exact synthetic prompt', promptSha256: sha('Exact synthetic prompt') },
    output: { contractVersion: 'l9-keyword-data-v1', dataVersion: 'l9-thach-dua-v1', category: 'thạch dừa synthetic', provenance: 'MODEL_DRAFTED',
      keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'khác sản phẩm' }] } };
  return { store, record, root };
}
test('retention replays scope, capture and exact name bytes and is content idempotent', async t => {
  const { store, record } = await fixture(t);
  const receipt = await retainKeywordListDraft(store, record);
  assert.deepEqual(await replayKeywordListDraft(store, receipt.digest), record);
  assert.equal((await retainKeywordListDraft(store, record)).digest, receipt.digest);
});
test('reject malformed output, mismatched versions, extra fields and forged evidence before retention', async t => {
  const { store, record } = await fixture(t);
  const bad: unknown[] = [
    { ...record, extra: true }, { ...record, output: { contractVersion: 'l9-keyword-data-v1' } },
    { ...record, output: { ...record.output, provenance: 'OPERATOR_SUPPLIED' } },
    { ...record, output: { ...record.output, dataVersion: 'substituted-v2' } },
    { ...record, salesNameRefs: [] }, { ...record, model: { ...record.model, promptSha256: 'a'.repeat(64) } },
    { ...record, seeds: { ...record.seeds, productNames: ['Invented product name'] } },
    { ...record, seeds: { ...record.seeds, includeTerms: ['changed scope term'] } },
    { ...record, salesNameRefs: [{ ...record.salesNameRefs[0], locator: '/data/9/product_name' }] },
  ];
  for (const value of bad) await assert.rejects(retainKeywordListDraft(store, value as KeywordListDraftRecord), KeywordListDraftRecordError);
  assert.throws(() => checkKeywordListDraftRecord({ ...record, output: { ...record.output, keywords: [] } }), KeywordListDraftRecordError);
});
test('exact replay fails on missing record or tampered dependency even with valid record digest', async t => {
  const { store, record, root } = await fixture(t);
  await assert.rejects(replayKeywordListDraft(store, 'c'.repeat(64)), KeywordListDraftRecordError);
  const receipt = await retainKeywordListDraft(store, record);
  const file = path.join(root, 'artifacts', 'sha256', record.salesNameRefs[0].digest.slice(0, 2), record.salesNameRefs[0].digest);
  await fs.writeFile(file, 'substituted evidence');
  await assert.rejects(replayKeywordListDraft(store, receipt.digest), /digest verification/);
});

test('valid capture and name bytes cannot admit an unselected sales product', async t => {
  const { store, record } = await fixture(t);
  const scope = { ...record.run, includeTerms: record.seeds.includeTerms, excludeTerms: record.seeds.excludeTerms, selectedProductIds: ['kalodata:99999'], peerProductIds: [] };
  const scopeDigest = (await store.put(Buffer.from(JSON.stringify(scope)))).sha256;
  await assert.rejects(retainKeywordListDraft(store, { ...record, scopeDigest }), /selected frozen product/);
});

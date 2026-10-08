import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import {
  checkKeywordListDraftRecord,
  replayKeywordListDraft,
  retainKeywordListDraft,
  KEYWORD_LIST_DRAFT_RECORD_CONTRACT,
  KeywordListDraftRecordError,
  type KeywordListDraftRecord,
} from '../../src/modules/analysis/keyword-list-draft-record.js';

const roots: string[] = [];
test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function record(overrides: Partial<KeywordListDraftRecord> = {}): KeywordListDraftRecord {
  return {
    contractVersion: KEYWORD_LIST_DRAFT_RECORD_CONTRACT,
    run: { workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222' },
    scopeDigest: 'a'.repeat(64),
    sourceSetDigest: null,
    salesNameRefs: [{ digest: 'b'.repeat(64), locator: 'sales/export.csv#row:7' }],
    seeds: { productNames: ['Thạch dừa An Nhiên 350g'], includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'] },
    dataVersion: 'l9-thach-dua-v1',
    category: 'thạch dừa synthetic',
    model: { identity: 'synthetic-fake-model-v1', promptVersion: 'l9-draft-prompt-v1', prompt: 'Draft keywords for: Thạch dừa' },
    output: { contractVersion: 'l9-keyword-data-v1', dataVersion: 'l9-thach-dua-v1', category: 'thạch dừa synthetic',
      provenance: 'MODEL_DRAFTED', keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'khác sản phẩm' }] },
    ...overrides,
  };
}

async function store() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-keyword-draft-record-'));
  roots.push(root);
  return new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
}

test('retain and replay preserve exact bytes with digest binding', async () => {
  const artifacts = await store();
  const receipt = await retainKeywordListDraft(artifacts, record());
  assert.match(receipt.digest, /^[0-9a-f]{64}$/);
  assert.ok(receipt.byteSize > 0);
  const replayed = await replayKeywordListDraft(artifacts, receipt.digest);
  assert.deepEqual(replayed, record());
  const again = await retainKeywordListDraft(artifacts, record());
  assert.equal(again.digest, receipt.digest, 'Identical bytes retain idempotently');
});

test('replay fails closed on missing, corrupt and substituted records', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-keyword-draft-record-'));
  roots.push(root);
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  await assert.rejects(replayKeywordListDraft(artifacts, 'c'.repeat(64)), KeywordListDraftRecordError);
  const receipt = await retainKeywordListDraft(artifacts, record());
  const file = path.join(root, 'artifacts', 'sha256', receipt.digest.slice(0, 2), receipt.digest);
  const original = fs.readFileSync(file);
  fs.writeFileSync(file, Buffer.from('{"tampered":true}'));
  await assert.rejects(replayKeywordListDraft(artifacts, receipt.digest), /digest verification/);
  fs.writeFileSync(file, original);
  assert.deepEqual(await replayKeywordListDraft(artifacts, receipt.digest), record());
});

test('invalid records fail validation before any retention', async () => {
  const artifacts = await store();
  const cases: Partial<KeywordListDraftRecord>[] = [
    { run: undefined as unknown as KeywordListDraftRecord['run'] },
    { scopeDigest: 'not-a-digest' },
    { sourceSetDigest: 'also-not-a-digest' },
    { salesNameRefs: [{ digest: 'b'.repeat(64), locator: '' }] },
    { seeds: { productNames: [], includeTerms: [], excludeTerms: [] } },
    { model: { identity: '', promptVersion: 'v1', prompt: 'x' } },
    { model: { identity: 'm', promptVersion: 'v1', prompt: '' } },
    { output: { contractVersion: 'wrong-v1' } as unknown as KeywordListDraftRecord['output'] },
  ];
  for (const partial of cases) {
    const candidate = { ...record(), ...partial };
    assert.throws(() => checkKeywordListDraftRecord(candidate), KeywordListDraftRecordError);
    await assert.rejects(retainKeywordListDraft(artifacts, candidate), KeywordListDraftRecordError);
  }
});

// Isolated process reads only the synthetic fixture supplied by its owning test.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createHash } from 'node:crypto';
import Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
const [root, workspaceId, runId, draftDigest, expectedDraftHash, marketHash, insightHash] = process.argv.slice(2);
assert.ok(root && workspaceId && runId && draftDigest);
const db = new Database(path.join(root, 'test.sqlite'), { readonly: true, fileMustExist: true });
db.defaultSafeIntegers(true); db.pragma('query_only = ON');
const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
artifacts.put = async () => { throw new Error('cold replay attempted CAS write'); };
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const before = hash(db.serialize());
const service = new ResearchAutomationService({ db, artifactStore: artifacts,
  now: () => { throw new Error('cold replay consulted clock'); },
  workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('cold replay consulted current workspace'); } } });
try {
  const draft = await service.readSourceKeywordDraft(workspaceId, runId, draftDigest);
  assert.equal(hash(canonicalJson(draft)), expectedDraftHash);
  assert.deepEqual(draft.salesNameRefs.filter(ref => !('captureDigest' in ref)).map(ref => ref.locator), ['Sheet1!A2', 'Sheet1!A4']);
  assert.deepEqual(draft.seeds.productNames.slice(-2), ['  Thạch dừa  nguyên văn – An Nhiên 350g  ', '  Thạch dừa  nguyên văn – An Nhiên 350g  ']);
  assert.equal(hash((await service.readReport(workspaceId, runId, 'MARKET')).bytes), marketHash);
  assert.equal(hash((await service.readReport(workspaceId, runId, 'INSIGHT')).bytes), insightHash);
  assert.equal(hash(db.serialize()), before);
  process.stdout.write('cold retained Metric proof replay passed\n');
} finally { db.close(); }

// Reopens only a parent test's synthetic fixture; no runtime/private data.
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
const [root, workspaceId, runId, packageId, expectedViewHash, selectedJson] = process.argv.slice(2);
assert.ok(root && workspaceId && runId && packageId && expectedViewHash && selectedJson);
const db = new Database(path.join(root, 'test.sqlite'), { readonly: true, fileMustExist: true });
db.defaultSafeIntegers(true); db.pragma('query_only = ON');
const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
artifacts.put = async () => { throw new Error('P9 cold read wrote CAS'); };
const hash = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const before = hash(db.serialize());
const service = new ResearchAutomationService({ db, artifactStore: artifacts,
  now: () => { throw new Error('P9 cold read consulted clock'); },
  workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('P9 cold read consulted current workspace'); } } });
try {
  const source = await service.readP9Source(workspaceId, runId, 'comments', packageId);
  assert.equal(hash(canonicalJson(source.view)), expectedViewHash);
  const retry = await service.collectTikTokComments(workspaceId, runId, JSON.parse(selectedJson));
  assert.equal(retry.exactRetry, true); assert.equal(retry.package.packageId, packageId);
  assert.equal((await service.readP9SourceHistory(workspaceId, runId)).comments.sources.length, 1);
  assert.equal(hash(db.serialize()), before);
  process.stdout.write('P9 cold reopened configured-free replay passed\n');
} finally { db.close(); }

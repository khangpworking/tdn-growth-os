import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { selectTikTokVideos, exactTikTokVideoUrl } from '../../src/modules/analysis/research-automation/tiktok-video-selection.js';

const url = (id: number) => `https://www.tiktok.com/@synthetic_creator/video/${1000 + id}`;
async function fixture(t: test.TestContext, revenues: (string | null)[], videos = revenues.map((_, index) => url(index))) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-p9-selection-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts }));
  const intake = new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(path.join(root, 'artifacts')), db, () => new Date('2026-10-09T00:00:00Z'));
  const binding = { workspaceId: randomUUID(), runId: randomUUID() };
  const csv = Buffer.from(['video,creator,revenue,views,units,ad_spend,publish_date,product_link',
    ...revenues.map((value, index) => `${videos[index]},synthetic,${value ?? ''},,,,,`)].join('\n'));
  const prepared = await intake.prepare({ contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video',
    sourceLabel: 'Synthetic video sample', acquiredAt: null }, csv, 'synthetic.csv', binding);
  return { db, artifacts, reader, binding, sourcePackage: { packageId: prepared.packageId,
    manifestArtifactSha256: prepared.manifestArtifactSha256, packageContentSha256: prepared.packageContentSha256 } };
}

test('actual prepared P4 selection freezes A/C, source-order ties, distinct review additions and exact row lineage', async t => {
  const f = await fixture(t, ['40', '40', '10', '5', '5']);
  const before = Buffer.from(f.db.serialize());
  const a = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(90)] });
  assert.deepEqual(a.selection.videos.map(v => [v.videoId, v.kind, v.sourceLine]), [['1000', 'SELLER_VIDEO', 'csv:row:2'], ['1090', 'REVIEW_VIDEO', null]]);
  const c = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [] });
  assert.deepEqual(c.selection.videos.map(v => v.videoId), ['1000', '1001']);
  assert.deepEqual((await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(90)] })), a);
  assert.deepEqual(Buffer.from(f.db.serialize()), before);
});

test('source exclusions remain explicit and zero/missing alone cannot manufacture coverage', async t => {
  const f = await fixture(t, ['10', null, '0', '20'], [url(0), url(1), url(2), 'plain source title']);
  const a = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [] });
  assert.deepEqual(a.selection.excluded.map(r => r.reason), ['MISSING_REVENUE', 'ZERO_REVENUE', 'INVALID_VIDEO_URL']);
  assert.equal(a.selection.sampleVideoCount, 1);
  const empty = await fixture(t, [null, '0']);
  await assert.rejects(selectTikTokVideos(empty.reader, empty.binding, { sourcePackage: empty.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [url(99)] }));
});

test('reject wrong package/run/workspace/digest and duplicate URL before exposing membership', async t => {
  const f = await fixture(t, ['10', '20']);
  const request = { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT' as const, reviewVideoUrls: [] };
  for (const field of ['runId', 'workspaceId'] as const) await assert.rejects(selectTikTokVideos(f.reader, { ...f.binding, [field]: randomUUID() }, request));
  for (const field of ['manifestArtifactSha256', 'packageContentSha256'] as const) await assert.rejects(selectTikTokVideos(f.reader, f.binding,
    { ...request, sourcePackage: { ...f.sourcePackage, [field]: 'f'.repeat(64) } }));
  await assert.rejects(selectTikTokVideos(f.reader, f.binding, { ...request, reviewVideoUrls: [url(0)] }));
  const duplicate = await fixture(t, ['10', '10'], [url(0), url(0)]);
  await assert.rejects(selectTikTokVideos(duplicate.reader, duplicate.binding, { ...request, sourcePackage: duplicate.sourcePackage }));
});

test('overflow30 refuses rather than truncating and URLs are exact inert public video locators', async t => {
  const f = await fixture(t, Array(40).fill('1'));
  await assert.rejects(selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [] }));
  for (const bad of ['http://www.tiktok.com/@x/video/123', 'https://www.tiktok.com/@x/video/123?key=secret', 'https://example.test/@x/video/123', 'https://www.tiktok.com/@x', 'https://www.tiktok.com/@x/video/123/']) assert.throws(() => exactTikTokVideoUrl(bad));
});

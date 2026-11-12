/**
 * B3 contract: the results tab reads numbers only from the verified step-3 sources.
 * Synthetic native evidence; no collector, provider, database or network is started.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { reviewStatsView } from '../../scripts/module-review-data.js';
import { addCustomAttempt, addLegacySource, createModuleRun, moduleRow } from '../fixtures/shopee-module-review-data.js';

async function fixture(t: TestContext): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-stats-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return base;
}

const NUMBER_KEYS = ['commentCount', 'averageStar', 'starCounts', 'firstCommentAt', 'lastCommentAt'];

test('review stats count comments, stars, dates and links for all links and per link', async t => {
  const run = await createModuleRun(await fixture(t), { runId: 'run-stats' });
  const [a, b] = run.links;
  const legacy = await addLegacySource(run, { rowsByLink: [
    [moduleRow(a!, 'r1', { ratingStar: 5, createdAt: '2026-02-14T09:00:00+07:00', comment: 'SECRET-TEXT-1' }),
      moduleRow(a!, 'r2', { ratingStar: 1, createdAt: '2026-11-05T09:00:00+07:00', comment: 'SECRET-TEXT-2' })],
    [moduleRow(b!, 'r3', { ratingStar: 4, createdAt: '2026-06-01T09:00:00+07:00', comment: 'SECRET-TEXT-3' })],
  ] });
  const view = await reviewStatsView(run.runDir) as any;
  assert.equal(view.format, 'review-stats-v1');
  assert.equal(view.runId, 'run-stats');
  assert.equal(view.sources.length, 1);
  const source = view.sources[0];
  assert.deepEqual([source.sourceSha256, source.kind, source.status], [legacy.sourceSha256, 'legacy', 'SUCCEEDED']);
  assert.deepEqual(source.all, { commentCount: 3, averageStar: 10 / 3, starCounts: { 1: 1, 2: 0, 3: 0, 4: 1, 5: 1 },
    firstCommentAt: '2026-02-14T09:00:00+07:00', lastCommentAt: '2026-11-05T09:00:00+07:00' });
  const byShop = Object.fromEntries(source.links.map((link: any) => [link.shopId, link]));
  assert.deepEqual([byShop[a!.shopId].commentCount, byShop[a!.shopId].averageStar, byShop[a!.shopId].url], [2, 3, a!.url]);
  assert.deepEqual(byShop[b!.shopId].starCounts, { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 });
  assert.equal(byShop[b!.shopId].firstCommentAt, byShop[b!.shopId].lastCommentAt);
});

test('review stats send numbers only: no comment text, variation, review id or user field', async t => {
  const run = await createModuleRun(await fixture(t), { runId: 'run-numbers' });
  const [a, b] = run.links;
  await addLegacySource(run, { rowsByLink: [
    [moduleRow(a!, 'review-id-secret', { comment: 'PRIVATE-COMMENT', variation: 'PRIVATE-VARIATION', attributes: ['PRIVATE-ATTR'] })],
    [moduleRow(b!, 'review-id-other', { comment: 'PRIVATE-COMMENT-2' })],
  ] });
  const view = await reviewStatsView(run.runDir) as any;
  const text = JSON.stringify(view);
  for (const marker of ['PRIVATE-', 'review-id-'])
    assert.equal(text.includes(marker), false, `${marker} values must not leave the server`);
  const source = view.sources[0];
  assert.deepEqual(Object.keys(source).sort(), ['all', 'completedAt', 'kind', 'links', 'sourceSha256', 'status']);
  assert.deepEqual(Object.keys(source.all).sort(), [...NUMBER_KEYS].sort());
  for (const link of source.links) assert.deepEqual(Object.keys(link).sort(), ['itemId', 'shopId', 'url', ...NUMBER_KEYS].sort());
});

test('review stats list each verified step-3 result and stay empty when nothing was saved', async t => {
  const base = await fixture(t);
  const empty = await createModuleRun(base, { runId: 'run-empty' });
  assert.deepEqual(await reviewStatsView(empty.runDir), { format: 'review-stats-v1', runId: 'run-empty', sources: [] });

  const run = await createModuleRun(base, { runId: 'run-both' });
  const [a, b] = run.links;
  await addLegacySource(run);
  const custom = await addCustomAttempt(run, { rowsByLink: [
    [moduleRow(a!, 'c1', { ratingStar: 2, createdAt: null })], [moduleRow(b!, 'c2', { ratingStar: null, createdAt: null })],
  ] });
  const view = await reviewStatsView(run.runDir) as any;
  assert.deepEqual(view.sources.map((s: any) => s.kind).sort(), ['custom', 'legacy']);
  const counted = view.sources.find((s: any) => s.kind === 'custom');
  assert.equal(counted.sourceSha256, custom.sourceSha256);
  assert.deepEqual(counted.all, { commentCount: 2, averageStar: 2, starCounts: { 1: 0, 2: 1, 3: 0, 4: 0, 5: 0 },
    firstCommentAt: null, lastCommentAt: null }, 'rows without a star or date are counted but not averaged or dated');
});

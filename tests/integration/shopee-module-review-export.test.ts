/**
 * Export boundary: cached receipts, digest/size verification, source
 * immutability, read-only reuse and cross-run provenance refusal.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import {
  EXPORT_MAX_BYTES, cachedReviewExport, prepareReviewExport, readReviewExportBytes,
  renderReviewExport, type VerifiedModuleReviewCollection,
} from '../../src/modules/foundation/shopee-module-review-data.js';
import { discoverModuleReviewSources } from '../../src/modules/foundation/shopee-module-review-data.js';
import {
  LINKS, addCustomAttempt, createModuleRun, moduleRow, rewriteCanonical, sha256,
} from '../fixtures/shopee-module-review-data.js';

async function fixture(t: TestContext): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-export-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return base;
}

function rejection(code: string, exitCode?: number) {
  return (error: unknown) => (error as { code?: string; exitCode?: number }).code === code &&
    (exitCode === undefined || (error as { exitCode?: number }).exitCode === exitCode);
}

async function exportedFixture(t: TestContext) {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-export' });
  const attempt = await addCustomAttempt(run, {
    rowsByLink: [[moduleRow(LINKS[0]!, 'export-a')], [moduleRow(LINKS[1]!, 'export-b')]],
  });
  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  const watched = [
    'request.json', 'm2/selection.json', `${attempt.base}/attempt.json`,
    `${attempt.base}/output/reviews.json`, `${attempt.base}/output/outcome.json`,
  ].map(file => path.join(run.runDir, file));
  const before = new Map(await Promise.all(watched.map(async file => [file, await fs.readFile(file)] as const)));
  return { base, run, attempt, source, before };
}

test('first export publishes the exact bytes and its receipt', async t => {
  const { run, source } = await exportedFixture(t);
  const receipt = await prepareReviewExport(run.runDir, source.sourceSha256, 'json');
  assert.equal(receipt.format, 'review-data-export-v1');
  assert.equal(receipt.runId, run.runId);
  assert.equal(receipt.sourceSha256, source.sourceSha256);
  assert.equal(receipt.exportFormat, 'json');
  assert.equal(receipt.exportVersion, 'module-review-export-v1');
  assert.equal(receipt.rowCount, 2);
  assert.equal(receipt.reused, false);
  assert.equal(receipt.fileName, `shopee-${run.runId}-${source.sourceSha256.slice(0, 12)}.json`);

  const file = path.join(run.runDir, 'review-data', 'files', receipt.exportSha256);
  const bytes = await fs.readFile(file);
  assert.equal(bytes.length, receipt.byteSize);
  assert.equal(sha256(bytes), receipt.exportSha256);
  assert.ok(bytes.equals(renderReviewExport(source, 'json')));
  assert.ok((await readReviewExportBytes(run.runDir, receipt.exportSha256)).equals(bytes));

  const receiptFile = path.join(run.runDir, 'review-data', 'exports', source.sourceSha256,
    'module-review-export-v1', 'json.json');
  const cached = await cachedReviewExport(run.runDir, source, 'json');
  assert.ok(cached);
  assert.equal(cached.reused, true);
  assert.equal(cached.exportSha256, receipt.exportSha256);
  assert.deepEqual(JSON.parse(await fs.readFile(receiptFile, 'utf8')), receipt);

  const txt = await prepareReviewExport(run.runDir, source.sourceSha256, 'txt');
  assert.equal(txt.exportFormat, 'txt');
  assert.notEqual(txt.exportSha256, receipt.exportSha256);
  assert.ok((await readReviewExportBytes(run.runDir, txt.exportSha256)).equals(renderReviewExport(source, 'txt')));
});

test('a repeated export reuses the cache without touching source or cached bytes', async t => {
  const { run, source, before } = await exportedFixture(t);
  const first = await prepareReviewExport(run.runDir, source.sourceSha256, 'txt');
  const named = ['review-data/files/' + first.exportSha256,
    `review-data/exports/${source.sourceSha256}/module-review-export-v1/txt.json`].map(file => path.join(run.runDir, file));
  const frozen = await Promise.all(named.map(file => fs.readFile(file)));
  const receipt = await prepareReviewExport(run.runDir, source.sourceSha256, 'txt');
  assert.equal(receipt.reused, true);
  assert.equal(receipt.exportSha256, first.exportSha256);
  for (const [index, file] of named.entries()) assert.ok((await fs.readFile(file)).equals(frozen[index]!));

  const [again] = await discoverModuleReviewSources(run.runDir);
  assert.equal(again?.sourceSha256, source.sourceSha256, 'export adds no evidence and changes no source digest');
  for (const [file, bytes] of before) assert.ok((await fs.readFile(file)).equals(bytes), `${file} is unchanged`);
});

test('read-only permits a cached export but refuses to create a new one', async t => {
  const { run, source } = await exportedFixture(t);
  const created = await prepareReviewExport(run.runDir, source.sourceSha256, 'json');
  const previous = process.env.TDN_SHOPEE_FLOW_READONLY;
  try {
    process.env.TDN_SHOPEE_FLOW_READONLY = '1';
    await assert.rejects(prepareReviewExport(run.runDir, source.sourceSha256, 'txt'), rejection('READONLY_ON'));
    const reused = await prepareReviewExport(run.runDir, source.sourceSha256, 'json');
    assert.equal(reused.reused, true);
    assert.equal(reused.exportSha256, created.exportSha256);
  } finally {
    if (previous === undefined) delete process.env.TDN_SHOPEE_FLOW_READONLY;
    else process.env.TDN_SHOPEE_FLOW_READONLY = previous;
  }
});

test('exported bytes and receipts are verified before reuse or read', async t => {
  const { run, source } = await exportedFixture(t);
  const receipt = await prepareReviewExport(run.runDir, source.sourceSha256, 'json');
  const file = path.join(run.runDir, 'review-data', 'files', receipt.exportSha256);
  const original = await fs.readFile(file);
  await fs.writeFile(file, Buffer.concat([original, Buffer.from('\n')]));
  await assert.rejects(prepareReviewExport(run.runDir, source.sourceSha256, 'json'), rejection('REVIEW_EXPORT_CHANGED'));
  await assert.rejects(readReviewExportBytes(run.runDir, receipt.exportSha256), rejection('REVIEW_EXPORT_CHANGED'));
  await fs.writeFile(file, original);

  await rewriteCanonical(path.join(run.runDir, 'review-data', 'exports', source.sourceSha256,
    'module-review-export-v1', 'json.json'), value => { value.rowCount = 999; });
  await assert.rejects(prepareReviewExport(run.runDir, source.sourceSha256, 'json'), rejection('REVIEW_EXPORT_CHANGED'));
});

test('export reads are bound to the run that published them', async t => {
  const { base, run, source } = await exportedFixture(t);
  const receipt = await prepareReviewExport(run.runDir, source.sourceSha256, 'json');
  await assert.rejects(readReviewExportBytes(run.runDir, '0'.repeat(64)), rejection('REVIEW_EXPORT_NOT_FOUND', 2));
  await assert.rejects(readReviewExportBytes(run.runDir, 'not-a-digest'), rejection('REVIEW_DATA_INVALID', 2));

  const other = path.join(base, 'run-export-copy');
  await fs.mkdir(other, { recursive: true });
  await fs.cp(path.join(run.runDir, 'review-data'), path.join(other, 'review-data'), { recursive: true });
  await assert.rejects(readReviewExportBytes(other, receipt.exportSha256), rejection('REVIEW_EXPORT_CHANGED'));
});

test('the 64 MiB export ceiling refuses an oversized render', async t => {
  await fixture(t);
  const comment = 'x'.repeat(65536);
  const rows = Array.from({ length: 1100 }, (_, index): ReturnType<typeof moduleRow> =>
    moduleRow(LINKS[0]!, `oversized-${index}`, { comment })) as VerifiedModuleReviewCollection['rows'];
  assert.ok(Buffer.byteLength(JSON.stringify(rows)) > EXPORT_MAX_BYTES);
  const source: VerifiedModuleReviewCollection = {
    runId: 'run-oversized', sourceSha256: 'a'.repeat(64), kind: 'custom', attemptId: null, planSha256: null,
    status: 'SUCCEEDED', gateVerdict: 'PASS', completedAt: null, rowBasis: 'published',
    rows, links: [], collectedAt: new Map(), proof: [],
    requestSha256: 'b'.repeat(64), m2Digest: 'c'.repeat(64),
  };
  assert.throws(() => renderReviewExport(source, 'json'), rejection('REVIEW_EXPORT_TOO_LARGE'));
});

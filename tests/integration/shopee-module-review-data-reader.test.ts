/**
 * Real offline reader on synthetic native evidence: discovery, exact-source
 * selection, terminal partial handling, tamper rejection and lossless render.
 * No collector, provider, database or network is started.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { hashFolder } from '../../scripts/module-pick.js';
import { samplingDigest } from '../../src/modules/foundation/shopee-review-sampling.js';
import {
  discoverModuleReviewSources, readModuleReviewSource, reviewArchive, renderReviewExport,
} from '../../src/modules/foundation/shopee-module-review-data.js';
import {
  LINKS, addCustomAttempt, addLegacySource, createModuleRun, moduleRow, rewriteCanonical,
  sha256, sourceIdentity, writeCanonical,
} from '../fixtures/shopee-module-review-data.js';

async function fixture(t: TestContext): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-reader-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return base;
}

function rejection(code: string, exitCode?: number) {
  return (error: unknown) => (error as { code?: string; exitCode?: number }).code === code &&
    (exitCode === undefined || (error as { exitCode?: number }).exitCode === exitCode);
}

const relative = (root: string, file: string) => path.relative(root, file).split(path.sep).join('/');

test('legacy native source: discovery binds exact proof bytes, rows, links and observed times', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-legacy-pass' });
  const legacy = await addLegacySource(run);
  const journalBytes = new Map(await Promise.all(legacy.journalPaths.map(async file =>
    [relative(run.runDir, file), await fs.readFile(file)] as const)));
  const kept = {
    request: await fs.readFile(path.join(run.runDir, 'request.json')),
    selection: await fs.readFile(path.join(run.runDir, 'm2', 'selection.json')),
  };

  const sources = await discoverModuleReviewSources(run.runDir);
  assert.equal(sources.length, 1);
  const source = sources[0]!;
  assert.equal(source.sourceSha256, legacy.sourceSha256, 'source identity is the documented run + proof digest');
  assert.equal(source.runId, run.runId);
  assert.equal(source.kind, 'legacy');
  assert.equal(source.attemptId, null);
  assert.equal(source.planSha256, null);
  assert.equal(source.status, 'SUCCEEDED');
  assert.equal(source.gateVerdict, 'PASS');
  assert.equal(source.rowBasis, 'published');
  assert.equal(source.rows.length, 2);
  assert.equal(source.requestSha256, run.requestSha256);
  assert.equal(source.m2Digest, run.selectionSha256);
  assert.equal(source.completedAt, '2026-11-10T00:05:00.000Z');
  assert.deepEqual(source.rows, legacy.retained);
  assert.deepEqual([...source.links].sort((a, b) => a.shopId.localeCompare(b.shopId)), [
    { shopId: '201', itemId: '101', url: LINKS[0]!.url, requested: 5, actual: 1, shortfall: 4, complete: true, status: 'succeeded' },
    { shopId: '202', itemId: '102', url: LINKS[1]!.url, requested: 5, actual: 1, shortfall: 4, complete: true, status: 'succeeded' },
  ]);
  assert.deepEqual([...source.collectedAt.entries()].sort(), [
    [LINKS[0]!.url, '2026-11-10T00:05:00.000Z'], [LINKS[1]!.url, '2026-11-10T00:05:00.000Z'],
  ]);
  assert.deepEqual(source.proof.map(file => file.path), [
    'gates/m3.json', 'm3/outcome.json', 'm3/reviews.json', ...journalBytes.keys(),
  ].sort());
  for (const file of source.proof) {
    const original = journalBytes.get(file.path);
    if (original) assert.equal(file.sha256, sha256(original), `journal proof keeps native bytes for ${file.path}`);
  }

  const exact = await readModuleReviewSource(run.runDir, legacy.sourceSha256);
  assert.deepEqual(exact.rows, source.rows);
  await assert.rejects(readModuleReviewSource(run.runDir, 'f'.repeat(64)),
    rejection('REVIEW_SOURCE_CHANGED', 23));
  assert.ok((await fs.readFile(path.join(run.runDir, 'request.json'))).equals(kept.request));
  assert.ok((await fs.readFile(path.join(run.runDir, 'm2', 'selection.json'))).equals(kept.selection));
});

test('legacy terminal partial source offers retained rows for export but no pass status', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-legacy-partial' });
  const legacy = await addLegacySource(run, { verdict: 'FAIL', errorCode: 'SOURCE_JOB_FAILED' });

  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  assert.equal(source.status, 'FAILED');
  assert.equal(source.gateVerdict, 'FAIL');
  assert.equal(source.rowBasis, 'terminal-retained');
  assert.equal(source.rows.length, 2);
  assert.deepEqual(source.rows.map(row => row.reviewId).sort(), legacy.retained.map(row => row.reviewId).sort());
  assert.equal(source.links.every(link => link.status === 'failed' && link.complete === false), true);
  assert.deepEqual(reviewArchive(source).rows, source.rows);
  assert.match(renderReviewExport(source, 'txt').toString('utf8'), /Row basis: terminal-retained/);
});

test('custom attempt: discovery, per-link actual counts and provider terminal time', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-custom-pass' });
  const attempt = await addCustomAttempt(run, {
    rowsByLink: [
      [moduleRow(LINKS[0]!, 'custom-a'), moduleRow(LINKS[0]!, 'custom-b', { ratingStar: 5 })],
      [moduleRow(LINKS[1]!, 'custom-c')],
    ],
  });

  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  assert.equal(source.sourceSha256, attempt.sourceSha256);
  assert.equal(source.kind, 'custom');
  assert.equal(source.attemptId, attempt.attemptId);
  assert.equal(source.planSha256, attempt.planSha256);
  assert.equal(source.rowBasis, 'published');
  assert.deepEqual(source.rows.map(row => row.reviewId), ['custom-a', 'custom-b', 'custom-c']);
  assert.deepEqual(source.links.map(link => [link.requested, link.actual, link.shortfall, link.complete, link.status]), [
    [5, 2, 3, true, 'exhausted'], [5, 1, 4, true, 'exhausted'],
  ]);
  assert.deepEqual([...source.collectedAt.values()], [
    '2026-11-10T00:05:00.000Z', '2026-11-10T00:05:00.000Z',
  ]);
  assert.equal(source.completedAt, '2026-11-10T00:05:00.000Z');
});

test('custom terminal partial keeps retained rows, not the empty publication', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-custom-partial' });
  const attempt = await addCustomAttempt(run, {
    verdict: 'FAIL', status: 'FAILED', published: [], errorCode: 'REVIEW_RESULT_INVALID',
    rowsByLink: [[moduleRow(LINKS[0]!, 'partial-a')], [moduleRow(LINKS[1]!, 'partial-b')]],
  });

  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  assert.equal(source.sourceSha256, attempt.sourceSha256);
  assert.equal(source.status, 'FAILED');
  assert.equal(source.rowBasis, 'terminal-retained');
  assert.deepEqual(source.rows.map(row => row.reviewId), ['partial-a', 'partial-b']);
  assert.deepEqual(reviewArchive(source).rows.map(row => row.reviewId), ['partial-a', 'partial-b']);
});

test('changed or unsettled native evidence is never offered as a source', async t => {
  interface Variant { name: string; build: (base: string) => Promise<{ root: string; target: string }>;
    tamper: (target: string, root: string) => Promise<void> }
  const variants: Variant[] = [
    {
      name: 'legacy run marked RUNNING',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'legacy-running' });
        await addLegacySource(run);
        return { root: run.runDir, target: path.join(run.runDir, 'state.json') };
      },
      tamper: target => rewriteCanonical(target, value => { value.status = 'RUNNING'; }),
    },
    {
      name: 'legacy provider job still running',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'legacy-live-job' });
        const legacy = await addLegacySource(run);
        return { root: run.runDir, target: legacy.journalPaths[0]! };
      },
      tamper: target => rewriteCanonical(target, value => { value.job.state = 'running'; }),
    },
    {
      name: 'legacy published rows diverge from retained snapshot',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'legacy-diverged' });
        await addLegacySource(run);
        return { root: run.runDir, target: path.join(run.runDir, 'm3', 'reviews.json') };
      },
      tamper: async (target, root) => {
        const reviews = JSON.parse(await fs.readFile(target, 'utf8'));
        reviews[0].comment = 'Replaced after publication';
        await writeCanonical(target, reviews);
        const gateFile = path.join(root, 'gates', 'm3.json');
        const gate = JSON.parse(await fs.readFile(gateFile, 'utf8'));
        gate.outputSha256 = await hashFolder(root, 'm3');
        await writeCanonical(gateFile, gate);
      },
    },
    {
      name: 'custom attempt state UNCERTAIN',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'custom-running' });
        const attempt = await addCustomAttempt(run, { rowsByLink: [[moduleRow(LINKS[0]!, 'u1')], [moduleRow(LINKS[1]!, 'u2')]] });
        return { root: run.runDir, target: path.join(run.runDir, attempt.base, 'state.json') };
      },
      tamper: target => rewriteCanonical(target, value => { value.status = 'UNCERTAIN'; }),
    },
    {
      name: 'custom journal not terminal',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'custom-journal-live' });
        const attempt = await addCustomAttempt(run, { rowsByLink: [[moduleRow(LINKS[0]!, 'j1')], [moduleRow(LINKS[1]!, 'j2')]] });
        const journal = (await fs.readdir(path.join(run.runDir, attempt.base, 'journal'))).sort()[0]!;
        return { root: run.runDir, target: path.join(run.runDir, attempt.base, 'journal', journal) };
      },
      tamper: target => rewriteCanonical(target, value => { value.terminal = false; }),
    },
    {
      name: 'custom gate output disagrees with the output folder',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'custom-gate-changed' });
        const attempt = await addCustomAttempt(run, { rowsByLink: [[moduleRow(LINKS[0]!, 'g1')], [moduleRow(LINKS[1]!, 'g2')]] });
        return { root: run.runDir, target: path.join(run.runDir, attempt.base, 'gate.json') };
      },
      tamper: target => rewriteCanonical(target, value => { value.outputSha256 = 'a'.repeat(64); }),
    },
    {
      name: 'custom published rows diverge from journal results',
      build: async base => {
        const run = await createModuleRun(base, { runId: 'custom-diverged' });
        const attempt = await addCustomAttempt(run, { rowsByLink: [[moduleRow(LINKS[0]!, 'd1')], [moduleRow(LINKS[1]!, 'd2')]] });
        return { root: run.runDir, target: path.join(run.runDir, attempt.base, 'output', 'reviews.json') };
      },
      tamper: async (target, root) => {
        const attemptBase = path.dirname(path.dirname(target));
        const reviews = JSON.parse(await fs.readFile(target, 'utf8'));
        reviews[0].comment = 'Replaced after publication';
        await writeCanonical(target, reviews);
        const outputSha256 = await hashFolder(root, relative(root, path.join(attemptBase, 'output')));
        for (const name of ['gate.json', 'state.json']) {
          const file = path.join(attemptBase, name);
          const value = JSON.parse(await fs.readFile(file, 'utf8'));
          value.outputSha256 = outputSha256;
          await writeCanonical(file, value);
        }
      },
    },
  ];

  for (const variant of variants) {
    await t.test(variant.name, async t2 => {
      const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-variant-'));
      t2.after(() => fs.rm(base, { recursive: true, force: true }));
      const { root, target } = await variant.build(base);
      const before = await discoverModuleReviewSources(root);
      assert.equal(before.length, 1, 'fixture starts valid');
      const previous = before[0]!.sourceSha256;
      await variant.tamper(target, root);
      assert.deepEqual(await discoverModuleReviewSources(root), [], 'invalid/unsettled proof is not offered');
      await assert.rejects(readModuleReviewSource(root, previous), rejection('REVIEW_SOURCE_CHANGED', 23));
    });
  }
});

test('JSON archive and TXT export are lossless and keep native row order', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-lossless' });
  const trickyComment = 'Dòng đầu tiếng Việt\n--- Review 2 ---\nContent type: COMMENT\nShop: 999\n<&> "trích dẫn"';
  await addCustomAttempt(run, {
    rowsByLink: [
      [
        moduleRow(LINKS[0]!, 'unicode-a', {
          comment: trickyComment, postedAtLocal: null,
          variation: '  Biến thể\n', attributes: ['Nhãn "đặc biệt"', 'Có\nxuống dòng'],
        }),
        moduleRow(LINKS[0]!, 'attributes-only', {
          comment: null, attributes: ['Chỉ nhãn'], ratingStar: null, ratingState: 'MISSING',
          contentType: 'ATTRIBUTES_ONLY', createdAt: null, variation: null,
          admissionReasons: ['SOURCE_TIME_NOT_PARSED'],
        }),
      ],
      [moduleRow(LINKS[1]!, 'plain-c', { comment: 'Bình luận thường', attributes: [] })],
    ],
  });
  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);

  const jsonBytes = renderReviewExport(source, 'json');
  assert.equal(jsonBytes.at(-1), 0x0a, 'canonical JSON export ends with one newline');
  const archive = JSON.parse(jsonBytes.toString('utf8')) as {
    format: string; sourceSha256: string; rowBasis: string; rows: unknown[]; links: unknown[];
    proof: Array<{ path: string; sha256: string; bytesBase64: string }>;
  };
  assert.equal(archive.format, 'module-review-archive-v1');
  assert.equal(archive.sourceSha256, source.sourceSha256);
  assert.equal(archive.rowBasis, 'published');
  assert.deepEqual(archive.rows, source.rows);
  assert.deepEqual(archive.links, source.links);
  assert.deepEqual(archive.proof.map(file => [file.path, file.sha256]),
    source.proof.map(file => [file.path, file.sha256]));
  for (const proof of archive.proof) {
    const original = await fs.readFile(path.join(run.runDir, ...proof.path.split('/')));
    assert.ok(Buffer.from(proof.bytesBase64, 'base64').equals(original), `proof bytes survive for ${proof.path}`);
  }

  const txt = renderReviewExport(source, 'txt').toString('utf8');
  assert.match(txt, /Stored application data; not original HTTP bytes\./);
  assert.ok(txt.includes('--- Review 1 ---\nReview ID: unicode-a\n'));
  assert.ok(txt.includes(`Comment (verbatim; may contain its own delimiters):\n${trickyComment}\n`),
    'a comment containing export delimiters is not rewritten or truncated');
  assert.ok(txt.includes('Content type: ATTRIBUTES_ONLY'));
  assert.ok(txt.includes('Posted: unknown'));
  assert.ok(txt.includes(`Attributes (original array): ${JSON.stringify(['Nhãn "đặc biệt"', 'Có\nxuống dòng'])}`));
  assert.ok(txt.indexOf('Review ID: unicode-a') < txt.indexOf('Review ID: attributes-only'));
  assert.ok(txt.indexOf('Review ID: attributes-only') < txt.indexOf('Review ID: plain-c'));
});

test('independent source identity formula matches discovery for both kinds', async t => {
  const base = await fixture(t);
  const legacyRun = await createModuleRun(base, { runId: 'run-identity-legacy' });
  const legacy = await addLegacySource(legacyRun);
  const customRun = await createModuleRun(base, { runId: 'run-identity-custom' });
  const attempt = await addCustomAttempt(customRun, {
    rowsByLink: [[moduleRow(LINKS[0]!, 'identity-a')], [moduleRow(LINKS[1]!, 'identity-b')]],
  });
  const legacyProof = [
    'gates/m3.json', 'm3/outcome.json', 'm3/reviews.json',
    ...legacy.journalPaths.map(file => relative(legacyRun.runDir, file)),
  ];
  assert.equal(legacy.sourceSha256,
    await sourceIdentity(legacyRun.runDir, 'legacy', null, 'published', legacyProof));
  const customProof = [
    `${attempt.base}/attempt.json`, `${attempt.base}/state.json`, `${attempt.base}/gate.json`,
    `${attempt.base}/output/reviews.json`, `${attempt.base}/output/outcome.json`,
    `m3-custom/plans/${attempt.planSha256}.json`,
    ...LINKS.map(link => `${attempt.base}/journal/${samplingDigest(link)}.json`),
  ];
  assert.equal(attempt.sourceSha256,
    await sourceIdentity(customRun.runDir, 'custom', attempt.attemptId, 'published', customProof));
});

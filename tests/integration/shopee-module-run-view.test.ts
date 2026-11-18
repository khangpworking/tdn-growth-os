/**
 * run-view-v1 contract: every part, outputs included, is exactly what the single command prints and
 * is streamed as one line as soon as it is done; one node process builds all parts, and insights v2
 * rebuilds v1 from the summary plus the on-demand comment lists.
 * Synthetic M3 evidence only; no provider, collector or network.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { reviewInsightCommentsView, reviewInsightsSummaryView, reviewInsightsView } from '../../scripts/module-review-data.js';
import { reviewRunView, type RunViewLine } from '../../scripts/module-run-view.js';
import { addCustomAttempt, addLegacySource, createModuleRun, moduleRow } from '../fixtures/shopee-module-review-data.js';

const ROOT = path.resolve(import.meta.dirname, '../..');
const ID = /^[A-Za-z0-9._:-]{1,128}$/;

async function fixture(t: TestContext) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-run-view-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const run = await createModuleRun(base, { runId: 'run-view' });
  await addLegacySource(run);
  await addCustomAttempt(run, { rowsByLink: [
    [moduleRow(run.links[0]!, 'review-c1', { comment: 'Nguồn custom A' })],
    [moduleRow(run.links[1]!, 'review-c2', { comment: 'Nguồn custom B' })],
  ] });
  return run;
}

function commandEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const key of ['TDN_WORKSPACE_DB', 'TDN_ARTIFACT_ROOT', 'TDN_SHOPEE_FLOW_READONLY']) delete env[key];
  return env;
}

function single(script: string, args: string[]): Promise<{ code: number | null; value: any; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', path.join(ROOT, script), ...args],
      { cwd: ROOT, env: commandEnv(), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => {
      try { resolve({ code, value: JSON.parse(stdout), stderr }); }
      catch (error) { reject(new Error(`unparseable ${script} ${args.join(' ')}: ${stdout}${stderr}`)); }
    });
  });
}

test('one node run-view streams one line per part, outputs included, each equal to the single command', async t => {
  const run = await fixture(t);
  const emitted: RunViewLine[] = [];
  const view = await reviewRunView(run.runDir, true, line => emitted.push(line));
  assert.equal(view.format, 'review-run-view-node-v1');
  assert.deepEqual(view.errors, {});
  const parts = ['insights', 'outputs', 'process', 'reviewData', 'sampling', 'stats'];
  assert.deepEqual(Object.keys(view.parts).sort(), parts);
  assert.deepEqual(emitted.map(line => line.part).sort(), parts, 'every part is streamed once, in settle order');
  assert.ok(emitted.every(line => line.ok), 'every part is streamed as a success line');
  const expected: Record<string, { script: string; args: string[] }> = {
    sampling: { script: 'scripts/module-review-sampling.ts', args: ['view', run.runDir] },
    reviewData: { script: 'scripts/module-review-data.ts', args: ['view', run.runDir] },
    process: { script: 'scripts/module-review-data.ts', args: ['process-view', run.runDir] },
    stats: { script: 'scripts/module-review-data.ts', args: ['stats', run.runDir] },
    insights: { script: 'scripts/module-review-data.ts', args: ['insights-summary', run.runDir] },
    outputs: { script: 'scripts/module-metric-output.ts', args: ['view', run.runDir] },
  };
  for (const [name, call] of Object.entries(expected)) {
    const { code, value, stderr } = await single(call.script, call.args);
    assert.equal(code, 0, `${name}: ${stderr}`);
    assert.deepEqual(view.parts[name], value, name);
  }
});

test('a part that cannot be read stays an error and never hides the others', async t => {
  const run = await fixture(t);
  await fs.writeFile(path.join(run.runDir, 'm3-custom', 'plans', 'bad.json'), '{}');
  const emitted: RunViewLine[] = [];
  const view = await reviewRunView(run.runDir, true, line => emitted.push(line));
  assert.deepEqual(view.errors, { sampling: { code: 'REVIEW_PLAN_INVALID', message: 'REVIEW_PLAN_INVALID', exitCode: 20 } });
  for (const name of ['reviewData', 'process', 'stats', 'insights', 'outputs']) assert.ok(view.parts[name], name);
  assert.deepEqual(Object.fromEntries(emitted.map(line => [line.part, line.ok])),
    { sampling: false, reviewData: true, process: true, stats: true, insights: true, outputs: true });
});

test('the outputs bound is its own at the command boundary: the full command returns after a stalled outputs read',
  { timeout: 90_000 }, async t => {
  const run = await fixture(t);
  // m2/link-checks.json is read by the outputs part only, so a FIFO without a writer stalls just that part.
  const fifo = path.join(run.runDir, 'm2', 'link-checks.json');
  await new Promise<void>((resolveMkfifo, reject) => {
    const mkfifo = spawn('mkfifo', [fifo], { stdio: 'ignore' });
    mkfifo.on('error', reject);
    mkfifo.on('close', code => code === 0 ? resolveMkfifo() : reject(new Error(`mkfifo exited ${code}`)));
  });
  const started = Date.now();
  const child = spawn(process.env.PYTHON ?? 'python3',
    [path.join(ROOT, 'skills', 'tdn-shopee-flow', 'scripts', 'shopee_flow.py'), 'run-view', '--run', run.runId, '--result'],
    { cwd: ROOT, env: { ...commandEnv(), SHOPEE_FLOW_RUNS: path.dirname(run.runDir) }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8').on('data', chunk => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', chunk => { stderr += chunk; });
  const code: number | null = await new Promise((resolveClose, reject) => {
    child.on('error', reject);
    child.on('close', resolveClose);
  });
  const elapsed = Date.now() - started;
  assert.equal(code, 0, stderr);
  assert.ok(elapsed < 35_000, `run-view returned after ${elapsed} ms; the abandoned outputs read kept node alive`);
  const view = JSON.parse(stdout);
  assert.equal(view.format, 'run-view-v1');
  assert.deepEqual(view.errors, { outputs: { code: 'MODULE_OUTPUT_TIMEOUT', message: 'MODULE_OUTPUT_TIMEOUT' } });
  const expected: Record<string, { script: string; args: string[] }> = {
    sampling: { script: 'scripts/module-review-sampling.ts', args: ['view', run.runDir] },
    reviewData: { script: 'scripts/module-review-data.ts', args: ['view', run.runDir] },
    process: { script: 'scripts/module-review-data.ts', args: ['process-view', run.runDir] },
    stats: { script: 'scripts/module-review-data.ts', args: ['stats', run.runDir] },
    insights: { script: 'scripts/module-review-data.ts', args: ['insights-summary', run.runDir] },
  };
  for (const [name, call] of Object.entries(expected)) {
    const result = await single(call.script, call.args);
    assert.equal(result.code, 0, `${name}: ${result.stderr}`);
    assert.deepEqual(view.parts[name], result.value, name);
  }
});

test('insights v2 rebuilds v1 from the summary and one comment list per bucket and theme', async t => {
  const run = await fixture(t);
  const v1: any = await reviewInsightsView(run.runDir);
  const v2: any = await reviewInsightsSummaryView(run.runDir);
  assert.equal(v1.format, 'review-insights-v1');
  assert.equal(v2.format, 'review-insights-v2');
  assert.deepEqual([v2.runId, v2.codebookVersion], [v1.runId, v1.codebookVersion]);

  const keys = new Set<string>();
  const rebuild = async (summary: any, original: any) => {
    assert.deepEqual(Object.keys(summary).sort(), ['commentCount', 'key', 'summary', 'themes']);
    assert.ok(ID.test(summary.key), `bucket key ${summary.key}`);
    assert.ok(!keys.has(summary.key), `duplicate bucket key ${summary.key}`);
    keys.add(summary.key);
    assert.deepEqual(summary.summary, original.summary);
    assert.equal(summary.commentCount, original.comments.length);
    const all = await reviewInsightCommentsView(run.runDir, summary.key);
    assert.deepEqual(all, { format: 'review-insight-comments-v1', bucket: summary.key, theme: null, comments: original.comments });
    assert.equal(summary.themes.length, original.themes.length);
    const themes = [];
    for (const [index, theme] of summary.themes.entries()) {
      const source = original.themes[index];
      const expectedKeys = Object.keys(source).filter(key => key !== 'comments').concat('commentCount').sort();
      assert.deepEqual(Object.keys(theme).sort(), expectedKeys);
      assert.equal(theme.commentCount, source.comments.length);
      assert.ok(ID.test(theme.code), `theme id ${theme.code}`);
      const list = await reviewInsightCommentsView(run.runDir, summary.key, theme.code);
      assert.deepEqual(list, { format: 'review-insight-comments-v1', bucket: summary.key, theme: theme.code, comments: source.comments });
      const { commentCount, ...rest } = theme;
      themes.push({ ...rest, comments: list.comments });
    }
    return { summary: summary.summary, themes, comments: all.comments };
  };

  assert.equal(v1.sources.length, 2, 'legacy and custom sources');
  for (const [index, source] of v2.sources.entries()) {
    const original = v1.sources[index];
    assert.deepEqual([source.sourceSha256, source.kind, source.status, source.completedAt],
      [original.sourceSha256, original.kind, original.status, original.completedAt]);
    assert.deepEqual(await rebuild(source.all, original.all), original.all);
    assert.equal(source.links.length, original.links.length);
    for (const [position, link] of source.links.entries()) {
      const originalLink = original.links[position];
      assert.deepEqual([link.shopId, link.itemId, link.url], [originalLink.shopId, originalLink.itemId, originalLink.url]);
      assert.deepEqual(await rebuild(link.insights, originalLink.insights), originalLink.insights);
    }
  }
  assert.equal(keys.size, v2.sources.length * 3, 'one bucket key for every all-list and link');
});

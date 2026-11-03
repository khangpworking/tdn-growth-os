import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { clearTimeout, setTimeout as watchdogTimeout } from 'node:timers';
import { fileURLToPath } from 'node:url';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { labelsGolden, type LabelCall } from './raw-db-v1-labels.js';

type Fixture = { root: string; databasePath: string; artifactRoot?: string };
export const snapshotPath = (f: Fixture) => path.join(path.dirname(f.databasePath), 'app-db-snapshot', 'app-db.snapshot.sqlite');
export const lockPath = (f: Fixture) => path.join(path.dirname(f.databasePath), 'raw-db-labels.lock.sqlite');

/** Independent holder of the public SQLite lock-file protocol, never an app-DB transaction. */
export function holdLabelsLock(f: Fixture) {
  const db = new Database(lockPath(f));
  db.exec('BEGIN EXCLUSIVE');
  return () => { if (db.open) { db.exec('ROLLBACK'); db.close(); } };
}

export async function until(check: () => Promise<boolean>, description: string, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    assert.ok(Date.now() < deadline, `timed out: ${description}`);
    await setTimeout(25);
  }
}

export async function exists(file: string) {
  try { await fs.stat(file); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}

/** Actual CLI processes; the preload replaces all fetches, including unexpected ones. */
export async function startY2Cli(t: TestContext, f: Fixture, args: string[], options: { gate?: boolean; responses?: number } = {}) {
  const id = randomUUID(), log = path.join(f.root, `y2-${id}.jsonl`);
  const ready = path.join(f.root, `y2-${id}.ready`), release = path.join(f.root, `y2-${id}.release`);
  const config = path.join(f.root, `y2-${id}.json`);
  await fs.writeFile(log, '');
  await fs.writeFile(config, JSON.stringify({ log, ready, release: options.gate ? release : null,
    responses: Array.from({ length: options.responses ?? 8 }, () => ({ raw: labelsGolden.no_theme_response })) }));
  const child = spawn(process.execPath, ['--import', 'tsx', '--import',
    fileURLToPath(new URL('./raw-db-v1-y2-fetch.mjs', import.meta.url)), 'scripts/raw-db-load.ts',
    '--db', f.databasePath, ...args], {
    cwd: path.resolve('.'), stdio: ['ignore', 'pipe', 'pipe'],
    env: { PATH: process.env.PATH, LANG: 'C.UTF-8', TZ: 'UTC', RAWDB_Y2_FETCH_CONFIG: config,
      TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot ?? path.join(f.root, 'artifacts'),
      TDN_RESEARCH_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-y2-key', TDN_RESEARCH_JEV_MODEL: labelsGolden.model },
  });
  let stdout = '', stderr = '', done = false;
  child.stdout.on('data', chunk => { stdout += String(chunk); });
  child.stderr.on('data', chunk => { stderr += String(chunk); });
  const timer = watchdogTimeout(() => { if (!done) child.kill('SIGKILL'); }, 45_000);
  timer.unref();
  const result = new Promise<{ status: number | null; signal: string | null; stdout: string; stderr: string }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => { done = true; clearTimeout(timer); resolve({ status, signal, stdout, stderr }); });
  });
  // Always reap our own processes, including a child stuck behind a deliberately held lock.
  t.after(async () => { if (!done) child.kill('SIGKILL'); await result; });
  return { child, result, ready, release, get done() { return done; },
    calls: async () => (await fs.readFile(log, 'utf8')).trim().split('\n').filter(Boolean).map(line => JSON.parse(line) as LabelCall) };
}

export async function cliValue(process: Awaited<ReturnType<typeof startY2Cli>>) {
  const result = await process.result;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout.trim()) as Record<string, unknown>;
}

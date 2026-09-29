import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import test from 'node:test';
import { openOperatorApp, type OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/database.js';

const roots: string[] = [];
const SENTINEL = 'content-ai-operator-sentinel-049';
let nextPort = 19700;
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture(ownerWritesEnabled = false, migrationsDirectory?: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-operator-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite');
  const opened = openDatabase({ databasePath, ...(migrationsDirectory ? { migrationsDirectory } : {}) }); opened.db.close();
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.css'), 'body{}');
  const configuration: OperatorAppConfiguration = {
    databasePath, artifactRoot: path.join(root, 'artifacts'), frontendDist, version: '0.1.0',
    host: '127.0.0.1', port: nextPort++, ownerWritesEnabled,
    ...(ownerWritesEnabled ? { ownerToken: 'strong-owner-token-049-12345678901234567890', ownerActorId: 'owner:local' } : {}),
  };
  return { root, databasePath, frontendDist, configuration };
}

async function serving(configuration: OperatorAppConfiguration, run: (origin: string) => Promise<void>): Promise<void> {
  const application = openOperatorApp(configuration);
  application.server.listen(configuration.port, configuration.host);
  await once(application.server, 'listening');
  try { await run(application.origin); } finally { await application.close(); }
}

function insertRunning(databasePath: string, attemptId: string, targetId = 'operator-target'): void {
  const db = new BetterSqlite3(databasePath); db.pragma('foreign_keys = ON');
  db.prepare(`INSERT INTO flow_content_ai_attempts
    (attempt_id, kind, modality, target_type, target_id, model, provider_model, prompt_ref, input_bundle_sha256, planned_action_call_count, state, actor_id, created_at)
    VALUES (?, 'generate', 'text', 'campaign', ?, 'gpt-5.6-sol', 'gpt-5.6-sol', 'prompt:operator', ?, 1, 'running', 'owner:local', ?)`)
    .run(attemptId, targetId, 'd'.repeat(64), '2026-09-27T10:00:00.000Z');
  db.close();
}

function attemptState(databasePath: string, attemptId: string): Record<string, unknown> {
  const db = new BetterSqlite3(databasePath); const value = db.prepare('SELECT * FROM flow_content_ai_attempts WHERE attempt_id=?').get(attemptId) as Record<string, unknown>; db.close(); return value;
}

test('viewer starts with AI disabled and status never exposes configuration details', async () => {
  const state = fixture();
  await serving(state.configuration, async (origin) => {
    const response = await fetch(`${origin}/api/content/ai/status`);
    assert.equal(response.status, 200);
    const body = await response.text();
    assert.match(body, /"configured":false/);
    assert.doesNotMatch(body, /baseUrl|apiKey|8317/);
  });
});

test('an operator database one migration behind fails before serving and writes nothing', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-behind-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  const migrations = fs.readdirSync('migrations').filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const head = Number(migrations.at(-1)!.slice(0, 4));
  const prior = migrations.filter((name) => /^00(?:0[1-9]|1[0-9]|2[0-4])_/.test(name));
  const priorHead = Number(prior.at(-1)!.slice(0, 4));
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(directory, name));
  const state = fixture(false, directory);
  assert.throws(() => openOperatorApp(state.configuration), { message: new RegExp(`^Database schema is at v${priorHead}; apply migrations up to v${head} before starting$`) });
  assert.equal(fs.existsSync(`${state.databasePath}.executor.lock`), false);
  const db = new BetterSqlite3(state.databasePath); assert.equal((db.prepare("SELECT count(*) count FROM sqlite_master WHERE name='flow_content_ai_attempts'").get() as { count: number }).count, 0); db.close();
});

test('one executor owns the canonical database lock; a second executor fails and a viewer does not sweep', async () => {
  const first = fixture(true);
  const executorA = openOperatorApp(first.configuration);
  const lockPath = `${first.databasePath}.executor.lock`;
  assert.equal(fs.existsSync(lockPath), true);
  const runningId = '00000000-0000-4000-8000-000000000401';
  insertRunning(first.databasePath, runningId);
  const second = { ...first.configuration, port: nextPort++ };
  assert.throws(() => openOperatorApp(second), /executor lock|pid/);
  assert.equal(attemptState(first.databasePath, runningId).state, 'running');
  const { ownerToken: _ownerToken, ownerActorId: _ownerActorId, ...viewerBase } = first.configuration;
  const viewer = openOperatorApp({ ...viewerBase, ownerWritesEnabled: false, port: nextPort++ });
  await viewer.close();
  assert.equal(attemptState(first.databasePath, runningId).state, 'running');
  await executorA.close();
  assert.equal(fs.existsSync(lockPath), false);
});

test('canonical path aliases resolve to the same executor lock identity', async () => {
  const first = fixture(true);
  const executor = openOperatorApp(first.configuration);
  try {
    const alias = `${first.root}${path.sep}nested${path.sep}..${path.sep}db.sqlite`;
    assert.throws(() => openOperatorApp({ ...first.configuration, databasePath: alias, port: nextPort++ }), /executor lock|pid/);
  } finally { await executor.close(); }
});

test('dead, other-host, empty and malformed existing locks fail closed without changing bytes or attempts', () => {
  const cases = [
    ['empty', Buffer.alloc(0)],
    ['malformed', Buffer.from(`malformed ${SENTINEL}`)],
    ['dead pid', Buffer.from(JSON.stringify({ pid: 999999999, hostname: 'local-host', startedAt: '2026-09-27T10:00:00.000Z', ownerNonce: '00000000-0000-4000-8000-000000000499' }))],
    ['other host', Buffer.from(JSON.stringify({ pid: 1, hostname: 'other-host', startedAt: '2026-09-27T10:00:00.000Z', ownerNonce: '00000000-0000-4000-8000-000000000498' }))],
  ] as const;
  for (const [index, [label, bytes]] of cases.entries()) {
    const state = fixture(true);
    const attemptId = `00000000-0000-4000-8000-${(500 + index).toString(16).padStart(12, '0')}`;
    insertRunning(state.databasePath, attemptId);
    const lockPath = `${state.databasePath}.executor.lock`; fs.writeFileSync(lockPath, bytes, { mode: 0o600 });
    const before = fs.readFileSync(lockPath);
    assert.throws(() => openOperatorApp(state.configuration), /executor lock|Another operator/ , label);
    assert.deepEqual(fs.readFileSync(lockPath), before, label);
    assert.equal(attemptState(state.databasePath, attemptId).state, 'running', label);
  }
});

test('manual stale-lock removal is the only recovery path; next executor sweeps running rows and preserves closed rows', async () => {
  const state = fixture(true);
  const runningId = '00000000-0000-4000-8000-000000000601';
  insertRunning(state.databasePath, runningId);
  const db = new BetterSqlite3(state.databasePath);
  db.prepare(`INSERT INTO flow_content_ai_attempts
    (attempt_id, kind, modality, target_type, target_id, model, provider_model, prompt_ref, input_bundle_sha256, planned_action_call_count, state, actor_id, created_at)
    VALUES (?, 'generate', 'text', 'campaign', 'closed-target', 'gpt-5.6-sol', 'gpt-5.6-sol', 'prompt:closed', ?, 1, 'running', 'owner:local', ?)`)
    .run('00000000-0000-4000-8000-000000000602', 'e'.repeat(64), '2026-09-27T09:00:00.000Z');
  db.prepare("UPDATE flow_content_ai_attempts SET state='interrupted', error_code='interrupted_by_restart', closed_at=? WHERE attempt_id=?")
    .run('2026-09-27T09:01:00.000Z', '00000000-0000-4000-8000-000000000602');
  db.close();
  const lockPath = `${state.databasePath}.executor.lock`; fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, hostname: 'local-host', startedAt: '2026-09-27T09:00:00.000Z', ownerNonce: '00000000-0000-4000-8000-000000000699' }));
  fs.rmSync(lockPath);
  const application = openOperatorApp(state.configuration);
  try {
    assert.equal(attemptState(state.databasePath, runningId).state, 'interrupted');
    assert.equal(attemptState(state.databasePath, runningId).error_code, 'interrupted_by_restart');
    assert.equal(attemptState(state.databasePath, '00000000-0000-4000-8000-000000000602').closed_at, '2026-09-27T09:01:00.000Z');
  } finally { await application.close(); }
});

test('a failed startup sweep releases only its lock and never creates a listening server', () => {
  const state = fixture(true);
  insertRunning(state.databasePath, '00000000-0000-4000-8000-000000000701');
  const db = new BetterSqlite3(state.databasePath);
  db.exec(`CREATE TRIGGER test_fail_content_ai_sweep BEFORE UPDATE ON flow_content_ai_attempts
    WHEN NEW.error_code = 'interrupted_by_restart' BEGIN SELECT RAISE(ABORT, 'synthetic sweep failure'); END`);
  db.close();
  assert.throws(() => openOperatorApp(state.configuration), /synthetic sweep failure/);
  assert.equal(fs.existsSync(`${state.databasePath}.executor.lock`), false);
  assert.equal(attemptState(state.databasePath, '00000000-0000-4000-8000-000000000701').state, 'running');
});

test('a configured operator keeps the sentinel key out of status, logs, database text and errors', async () => {
  const state = fixture(false);
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => { logs.push(args.map(String).join(' ')); };
  const application = openOperatorApp({ ...state.configuration, cliproxy: { baseUrl: 'http://127.0.0.1:8317', apiKey: SENTINEL } }, {
    creativeAiTransport: async () => new Response(JSON.stringify({ data: [] }), { status: 200 }),
  });
  try {
    application.server.listen(state.configuration.port, state.configuration.host);
    await once(application.server, 'listening');
    const response = await fetch(`${application.origin}/api/content/ai/status`);
    const body = await response.text();
    assert.doesNotMatch(body, new RegExp(SENTINEL));
    assert.ok(logs.every((line) => !line.includes(SENTINEL)));
    const db = new BetterSqlite3(state.databasePath);
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    for (const { name } of tables) {
      const columns = db.prepare(`PRAGMA table_info("${name.replaceAll('"', '""')}")`).all() as Array<{ name: string; type: string }>;
      for (const column of columns.filter((entry) => /TEXT/i.test(entry.type))) {
        const escapedTable = name.replaceAll('"', '""'); const escapedColumn = column.name.replaceAll('"', '""');
        assert.equal((db.prepare(`SELECT count(*) count FROM "${escapedTable}" WHERE "${escapedColumn}" LIKE ?`).get(`%${SENTINEL}%`) as { count: number }).count, 0);
      }
    }
    db.close();
  } finally { console.log = originalLog; await application.close(); }
});

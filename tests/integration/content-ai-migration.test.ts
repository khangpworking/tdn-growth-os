import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';

const roots: string[] = [];
const createdAt = '2026-09-27T10:00:00.000Z';
const closedAt = '2026-09-27T10:00:01.000Z';
const outputSha = 'a'.repeat(64);
const inputSha = 'b'.repeat(64);
const attemptId = (number: number) => `00000000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;

test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-migration-')); roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  opened.db.prepare(`INSERT INTO artifact_manifests
    (sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
    VALUES (?, 1, 'text/plain', ?, ?, '1.0.0', 'active', ?)`)
    .run(outputSha, `sha256/${outputSha.slice(0, 2)}/${outputSha}`, createdAt, createdAt);
  return { root, ...opened };
}

type AttemptOverrides = Partial<{
  attempt_id: string | null;
  kind: string | null;
  modality: string | null;
  target_type: string | null;
  target_id: string | null;
  model: string | null;
  prompt_ref: string | null;
  input_bundle_sha256: string | null;
  output_sha256: string | null;
  planned_action_call_count: unknown;
  state: string | null;
  error_code: string | null;
  retry_of: string | null;
  actor_id: string | null;
  created_at: string | null;
  closed_at: string | null;
  latency_ms: unknown;
  provider_request_id: string | null;
  input_tokens: unknown;
  output_tokens: unknown;
}>;

function row(number: number, overrides: AttemptOverrides = {}): Record<string, unknown> {
  return {
    attempt_id: attemptId(number), kind: 'generate', modality: 'text', target_type: 'campaign', target_id: `target-${number}`,
    model: 'gpt-5.6-sol', prompt_ref: 'prompt:1', input_bundle_sha256: inputSha, output_sha256: null,
    planned_action_call_count: 1, state: 'running', error_code: null, retry_of: null, actor_id: 'owner:local',
    created_at: createdAt, closed_at: null, latency_ms: null, provider_request_id: null, input_tokens: null, output_tokens: null,
    ...overrides,
  };
}

function insert(db: ReturnType<typeof setup>['db'], values: Record<string, unknown>): void {
  const columns = Object.keys(values);
  const sql = `INSERT INTO flow_content_ai_attempts (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`;
  db.prepare(sql).run(...columns.map((column) => values[column]));
}

test('migration 0025 creates the audit table, indexes and strict legal output-state matrix', () => {
  const state = setup();
  assert.equal(state.migration.currentVersion, 26);
  assert.deepEqual(state.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'flow_content_ai_attempts%' ORDER BY name").all(), [
    { name: 'flow_content_ai_attempts_by_target' },
    { name: 'flow_content_ai_attempts_running' },
  ]);
  insert(state.db, row(1));
  insert(state.db, row(2));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='succeeded', closed_at=?, output_sha256=? WHERE attempt_id=?").run(closedAt, outputSha, attemptId(2));
  insert(state.db, row(3));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='failed', closed_at=?, error_code='network_error' WHERE attempt_id=?").run(closedAt, attemptId(3));
  insert(state.db, row(4));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='failed', closed_at=?, error_code='persist_failed', output_sha256=? WHERE attempt_id=?").run(closedAt, outputSha, attemptId(4));
  insert(state.db, row(5));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='interrupted', closed_at=?, error_code='interrupted_by_restart' WHERE attempt_id=?").run(closedAt, attemptId(5));
  assert.equal((state.db.prepare('SELECT count(*) AS count FROM flow_content_ai_attempts').get() as { count: bigint }).count, 5n);
  state.db.close();
});

test('the state matrix rejects NULL loopholes, illegal terminal combinations and non-integer values', () => {
  const cases: Array<[string, AttemptOverrides]> = [
    ['succeeded without output', { state: 'succeeded', closed_at: closedAt }],
    ['succeeded with error', { state: 'succeeded', closed_at: closedAt, output_sha256: outputSha, error_code: 'persist_failed' }],
    ['failed with non-persist output', { state: 'failed', closed_at: closedAt, error_code: 'network_error', output_sha256: outputSha }],
    ['failed without error', { state: 'failed', closed_at: closedAt }],
    ['interrupted with wrong error', { state: 'interrupted', closed_at: closedAt, error_code: 'network_error' }],
    ['running with closed timestamp', { closed_at: closedAt }],
    ['running with latency', { latency_ms: 1 }],
    ['running with provider id', { provider_request_id: 'provider-1' }],
    ['fractional call count', { planned_action_call_count: 1.5 }],
    ['negative input tokens', { state: 'succeeded', closed_at: closedAt, output_sha256: outputSha, input_tokens: -1 }],
    ['fractional output tokens', { state: 'succeeded', closed_at: closedAt, output_sha256: outputSha, output_tokens: 1.5 }],
  ];
  for (const [label, overrides] of cases) {
    const state = setup();
    try {
      if (overrides.state !== undefined && overrides.state !== 'running') {
        // Reach the closing CHECKs rather than the unrelated start-only INSERT trigger.
        insert(state.db, row(10));
        const terminal = { closed_at: closedAt, ...overrides };
        const columns = Object.keys(terminal);
        assert.throws(() => state.db.prepare(
          `UPDATE flow_content_ai_attempts SET ${columns.map((column) => `${column} = ?`).join(', ')} WHERE attempt_id = ?`,
        ).run(...columns.map((column) => (terminal as Record<string, unknown>)[column]), attemptId(10)),
        /CHECK constraint failed|cannot store REAL/, label);
        assert.equal((state.db.prepare('SELECT state FROM flow_content_ai_attempts WHERE attempt_id = ?').get(attemptId(10)) as { state: string }).state, 'running');
      } else {
        assert.throws(() => insert(state.db, row(10, overrides)), /CHECK constraint failed|flow_content_ai_attempt_must_start_running|cannot store REAL/, label);
      }
    } finally { state.db.close(); }
  }
});

test('direct SQL enforces start-only inserts, duplicate protection, immutable closes, retry parents and deletion', () => {
  const state = setup();
  insert(state.db, row(20));
  state.db.prepare(`UPDATE flow_content_ai_attempts SET state='succeeded', closed_at=?, output_sha256=? WHERE attempt_id=?`).run(closedAt, outputSha, attemptId(20));
  const before = state.db.prepare('SELECT * FROM flow_content_ai_attempts WHERE attempt_id=?').get(attemptId(20));
  assert.throws(() => insert(state.db, row(19, { state: 'succeeded', closed_at: closedAt, output_sha256: outputSha })), /flow_content_ai_attempt_must_start_running/);
  assert.throws(() => insert(state.db, row(20, { state: 'running' })), /flow_content_ai_attempt_exists/);
  assert.throws(() => state.db.prepare(`INSERT OR REPLACE INTO flow_content_ai_attempts
    (attempt_id, kind, modality, target_type, target_id, model, prompt_ref, input_bundle_sha256, planned_action_call_count, state, actor_id, created_at)
    VALUES (?, 'generate', 'text', 'campaign', 'replacement', 'gpt-5.6-sol', 'prompt:replacement', ?, 1, 'running', 'owner:local', ?)`)
    .run(attemptId(20), inputSha, createdAt), /flow_content_ai_attempt_exists/);
  assert.deepEqual(state.db.prepare('SELECT * FROM flow_content_ai_attempts WHERE attempt_id=?').get(attemptId(20)), before);
  assert.throws(() => state.db.prepare(`UPDATE flow_content_ai_attempts SET state='running', closed_at=NULL, error_code=NULL, output_sha256=NULL WHERE attempt_id=?`).run(attemptId(20)), /flow_content_ai_attempt_close_invalid/);
  assert.throws(() => state.db.prepare(`UPDATE flow_content_ai_attempts SET target_id='changed', state='failed', error_code='network_error', closed_at=? WHERE attempt_id=?`).run(closedAt, attemptId(20)), /flow_content_ai_attempt_close_invalid/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_ai_attempts WHERE attempt_id=?').run(attemptId(20)), /flow_content_ai_attempt_immutable/);

  insert(state.db, row(21));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='failed', closed_at=?, error_code='network_error' WHERE attempt_id=?").run(closedAt, attemptId(21));
  insert(state.db, row(22, { state: 'running', target_id: 'same-target', retry_of: null }));
  assert.throws(() => state.db.prepare(`UPDATE flow_content_ai_attempts SET state='failed', error_code='network_error', closed_at=?, retry_of=? WHERE attempt_id=?`).run(closedAt, attemptId(21), attemptId(22)), /flow_content_ai_attempt_close_invalid/);
  insert(state.db, row(23, { target_id: 'same-target' }));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='failed', closed_at=?, error_code='network_error' WHERE attempt_id=?").run(closedAt, attemptId(23));
  insert(state.db, row(24, { target_id: 'same-target', retry_of: attemptId(23) }));
  assert.throws(() => state.db.prepare(`UPDATE flow_content_ai_attempts SET state='failed', error_code='network_error', closed_at=?, retry_of=NULL WHERE attempt_id=?`).run(closedAt, attemptId(24)), /flow_content_ai_attempt_close_invalid/);
  state.db.close();
});

test('timestamps, identifiers, NULL-safe retry identity, and all retry parent states are guarded at SQL boundaries', () => {
  const timestampCases: Array<[string, AttemptOverrides]> = [
    ['missing created_at', { created_at: null }],
    ['noncanonical created_at with space', { created_at: '2026-09-27 10:00:00.000Z' }],
    ['noncanonical created_at without milliseconds', { created_at: '2026-09-27T10:00:00Z' }],
    ['unparseable created_at', { created_at: '2026-99-99T99:99:99.999Z' }],
    ['unparseable twenty-four character created_at', { created_at: 'xxxxxxxxxxxxxxxxxxxxxxxx' }],
    ['missing closed_at', { state: 'succeeded', output_sha256: outputSha, error_code: null, closed_at: null }],
    ['noncanonical closed_at', { state: 'succeeded', output_sha256: outputSha, closed_at: '2026-09-27T10:00:01Z' }],
    ['unparseable closed_at', { state: 'succeeded', output_sha256: outputSha, closed_at: '2026-99-99T99:99:99.999Z' }],
    ['earlier closed_at', { state: 'succeeded', output_sha256: outputSha, closed_at: '2026-09-27T09:59:59.999Z' }],
  ];
  for (const [label, overrides] of timestampCases) {
    const state = setup();
    try {
      if (overrides.state === 'succeeded') {
        insert(state.db, row(30));
        assert.throws(() => state.db.prepare(
          "UPDATE flow_content_ai_attempts SET state = 'succeeded', output_sha256 = ?, closed_at = ? WHERE attempt_id = ?",
        ).run(outputSha, overrides.closed_at, attemptId(30)),
        overrides.closed_at === null ? /flow_content_ai_attempt_close_invalid/ : /CHECK constraint failed/, label);
        assert.equal((state.db.prepare('SELECT state FROM flow_content_ai_attempts WHERE attempt_id = ?').get(attemptId(30)) as { state: string }).state, 'running');
      } else {
        assert.throws(() => insert(state.db, row(30, overrides)), /CHECK constraint failed|NOT NULL constraint failed/, label);
      }
    } finally { state.db.close(); }
  }

  const retryParentCases: Array<[string, AttemptOverrides]> = [
    ['running parent', { state: 'running' }],
    ['succeeded parent', { state: 'succeeded', closed_at: closedAt, output_sha256: outputSha }],
    ['other-target failed parent', { state: 'failed', closed_at: closedAt, error_code: 'network_error', target_id: 'other-target' }],
  ];
  for (const [label, parentOverrides] of retryParentCases) {
    const state = setup();
    insert(state.db, row(31, { target_id: parentOverrides.target_id ?? 'same-target' }));
    if (parentOverrides.state !== 'running') {
      state.db.prepare('UPDATE flow_content_ai_attempts SET state=?, closed_at=?, error_code=?, output_sha256=? WHERE attempt_id=?').run(
        parentOverrides.state,
        closedAt,
        parentOverrides.state === 'succeeded' ? null : 'network_error',
        parentOverrides.state === 'succeeded' ? outputSha : null,
        attemptId(31),
      );
    }
    assert.throws(() => insert(state.db, row(32, { target_id: 'same-target', retry_of: attemptId(31) })), /flow_content_ai_attempt_retry_invalid/, label);
    state.db.close();
  }

  const state = setup();
  insert(state.db, row(33, { target_id: 'same-target' }));
  state.db.prepare("UPDATE flow_content_ai_attempts SET state='failed', closed_at=?, error_code='network_error' WHERE attempt_id=?").run(closedAt, attemptId(33));
  insert(state.db, row(34, { target_id: 'same-target', retry_of: attemptId(33) }));
  assert.equal((state.db.prepare('SELECT retry_of FROM flow_content_ai_attempts WHERE attempt_id=?').get(attemptId(34)) as { retry_of: string }).retry_of, attemptId(33));
  state.db.close();
});

test('v24 to v25 applies once, while migration 0024 remains byte-identical', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-ai-v25-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  const prior = fs.readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-9]|2[0-4])_/.test(name)).sort();
  assert.equal(prior.length, 24);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(directory, name));
  const databasePath = path.join(root, 'db.sqlite');
  const v24 = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.equal(v24.migration.currentVersion, 24);
  v24.db.close();
  fs.copyFileSync('migrations/0025_flow_content_ai_attempts.sql', path.join(directory, '0025_flow_content_ai_attempts.sql'));
  const v25 = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(v25.migration.applied, [25]);
  assert.equal(v25.db.pragma('user_version', { simple: true }), 25n);
  v25.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(rerun.migration.applied, []);
  rerun.db.close();
  assert.equal(createHash('sha256').update(fs.readFileSync('migrations/0024_flow_content_campaigns.sql')).digest('hex'), '4f71e1b14c510edd341bdf51f3317d7472a3c64dee6d0f4e90bdb8db71f98a10');
});

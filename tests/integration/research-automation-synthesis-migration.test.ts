import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationI14SynthesisExecutions } from '../../src/modules/analysis/research-automation/i14-synthesis-execution.js';
import { i14Now, pausedI14Parent, syntheticI14Input, validI14Response } from '../helpers/i14-execution-fixture.js';

// The upgrade changes an existing ledger, unlike fresh-schema coverage. Exercise
// actual retained executions so dropped rows/metadata and accidental redispatch fail.
function businessRows(db: Database.Database): Record<string, unknown> {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(tables.map(({ name }) => {
    const table = `"${name.replaceAll('"', '""')}"`;
    const columns = db.prepare(`PRAGMA table_info(${table})`).all();
    return [name, db.prepare(`SELECT * FROM ${table} ORDER BY ${columns.map((_, index) => index + 1).join(',')}`).all()];
  }));
}

for (const target of [46, 47]) test(`00${target} preserves populated I14 execution artifacts and retry semantics from v${target - 1}`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-synthesis-upgrade-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const priorDirectory = path.join(root, `v${target - 1}`);
  const targetDirectory = path.join(root, `v${target}`);
  await fs.mkdir(priorDirectory);
  await fs.mkdir(targetDirectory);
  for (const name of (await fs.readdir('migrations')).filter(name => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= target)) {
    await fs.copyFile(path.join('migrations', name), path.join(targetDirectory, name));
    if (Number(name.slice(0, 4)) < target) await fs.copyFile(path.join('migrations', name), path.join(priorDirectory, name));
  }

  for (const state of ['PREPARED', 'COMPLETED'] as const) await t.test(state, async sub => {
    const fixture = await pausedI14Parent({ migrationsDirectory: priorDirectory });
    sub.after(() => fixture.cleanup());
    assert.equal(fixture.db.pragma('user_version', { simple: true }), BigInt(target - 1));
    const input = syntheticI14Input();
    let calls = 0;
    const ai = {
      configuration: { contractVersion: '1.0.0' as const, methodId: 'automation-i14-synthesis-configuration' as const,
        providerId: 'synthetic', modelId: 'synthetic-model', temperature: null,
        maxOutputTokens: 100, timeoutMs: 1000, maxResponseBytes: 65536 },
      port: { async generateText() { calls += 1; return { text: JSON.stringify(validI14Response(input)) }; } },
    };
    const service = new AutomationI14SynthesisExecutions({ db: fixture.db, artifactStore: fixture.artifacts, now: i14Now });
    const request = { parent: fixture.parent, admission: input, ai };
    if (state === 'PREPARED') {
      await assert.rejects(service.execute({ ...request, signal: AbortSignal.abort() }));
      assert.equal(calls, 0);
    } else {
      assert.equal((await service.execute(request)).status, 'VALID');
      assert.equal(calls, 1);
    }
    const before = businessRows(fixture.db);
    if (target === 47) for (const row of before.analysis_research_automation_ai_executions as Record<string, unknown>[])
      Object.assign(row, { coding_adoption_id: null, coding_request_key: null, coding_previous_proposal_id: null });
    const ledger = fixture.db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
    const manifests = fixture.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all() as { sha256: string }[];
    const bytes = await Promise.all(manifests.map(row => fixture.artifacts.read(row.sha256)));
    const upgraded = openDatabase({ databasePath: fixture.db.name, now: i14Now, migrationsDirectory: targetDirectory });
    assert.deepEqual(upgraded.migration, { applied: [target], currentVersion: target });
    upgraded.db.close();
    assert.deepEqual(businessRows(fixture.db), before, 'Upgrade preserves every business row, including acquisition metadata');
    assert.deepEqual(fixture.db.prepare('SELECT * FROM schema_migrations WHERE version<? ORDER BY version').all(target), ledger);
    assert.deepEqual(await Promise.all(manifests.map(row => fixture.artifacts.read(row.sha256))), bytes);
    assert.deepEqual(fixture.db.pragma('foreign_key_check'), []);
    const rerun = openDatabase({ databasePath: fixture.db.name, migrationsDirectory: targetDirectory });
    assert.deepEqual(rerun.migration, { applied: [], currentVersion: target });
    rerun.db.close();

    const first = await service.execute(request);
    assert.equal(first.status, 'VALID');
    assert.equal(calls, 1, 'Prepared resumes once; completed must not redispatch');
    fixture.release();
    await fixture.reportPromise;
    const settled = businessRows(fixture.db);
    fixture.db.pragma('query_only = ON');
    const retry = await service.execute({ ...request, ai: null });
    assert.equal(retry.status, 'VALID');
    assert.equal(retry.dispatched, false);
    if (first.status === 'VALID' && retry.status === 'VALID') assert.deepEqual(retry.candidates.bytes, first.candidates.bytes);
    assert.equal(calls, 1);
    assert.deepEqual(businessRows(fixture.db), settled);
  });
});

test('0046 admits only sections belonging to the requested report and preserves immutable per-section identity', async t => {
  for (const reports of [['INSIGHT'], ['MARKET'], ['MARKET', 'INSIGHT']] as const) await t.test(reports.join('+'), async sub => {
    const fixture = await pausedI14Parent({ reports });
    sub.after(() => fixture.cleanup());
    const { sha256 } = fixture.db.prepare('SELECT sha256 FROM artifact_manifests LIMIT 1').get() as { sha256: string };
    // Manifest existence is all SQL promises. Adapter tests separately validate
    // the actual admission/input/prompt/configuration artifact semantics.
    const insert = fixture.db.prepare(`INSERT INTO analysis_research_automation_ai_executions
      (execution_id,run_id,section_id,workspace_id,scope_sha256,admission_sha256,input_sha256,prompt_sha256,configuration_sha256,state,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,'PREPARED',?)`);
    const scopeHash = createHash('sha256').update(canonicalJson(fixture.scope)).digest('hex');
    for (const section of ['I14', 'I15', 'M11', 'M12'] as const) {
      const id = randomUUID();
      const args = [id, fixture.parent.runId, section, fixture.scope.workspaceId, scopeHash, sha256, sha256, sha256, sha256, i14Now().toISOString()];
      const allowed = (reports as readonly string[]).includes(section.startsWith('I') ? 'INSIGHT' : 'MARKET');
      if (!allowed) {
        assert.throws(() => insert.run(...args), /invalid_analysis_ai_execution/);
        continue;
      }
      insert.run(...args);
      assert.throws(() => insert.run(randomUUID(), ...args.slice(1)), /UNIQUE constraint failed/);
      assert.throws(() => fixture.db.prepare('UPDATE analysis_research_automation_ai_executions SET section_id=? WHERE execution_id=?')
        .run(section === 'I14' ? 'I15' : 'I14', id), /invalid_analysis_ai_execution_transition/);
      assert.throws(() => fixture.db.prepare('DELETE FROM analysis_research_automation_ai_executions WHERE execution_id=?').run(id), /analysis_ai_execution_immutable/);
    }
    assert.deepEqual(fixture.db.pragma('foreign_key_check'), []);
  });
});

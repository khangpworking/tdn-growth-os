import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../scripts/module-pick.js';
import { buildModuleRun } from '../helpers/module-run-fixture.js';

const repo = fileURLToPath(new URL('../..', import.meta.url));
const appDir = join(repo, 'tools/shopee-desktop');

/** Real bridge -> flow CLI -> TS reader over a saved run; only the OS viewer is replaced. */
test('desktop bridge projects saved module outputs and opens exact evidence bytes without a source call', async t => {
  const { run, rawBytes } = await buildModuleRun(t);
  const base = await mkdtemp(join(tmpdir(), 'shopee-bridge-check-'));
  t.after(() => rm(base, { recursive: true, force: true }));
  const config = join(base, 'config.json');
  const state = join(base, 'state');
  const presets = join(base, 'presets');
  const bin = join(base, 'bin');
  for (const folder of [state, presets, bin]) await mkdir(folder);
  await writeFile(config, JSON.stringify({
    sshCommand: ['bash', '-s'], remoteScript: join(repo, 'skills/tdn-shopee-flow/scripts/shopee_flow.py'),
    runsRoot: dirname(run), presetsRoot: presets, timeoutSeconds: 120,
  }));
  const opened = join(base, 'opened.txt');
  const viewer = join(bin, 'xdg-open');
  await writeFile(viewer, '#!/bin/sh\nprintf \'%s\\n\' "$@" >> "$XDG_OPEN_LOG"\n');
  await chmod(viewer, 0o755);
  const digest = sha256(rawBytes);
  const script = `import json, sys
sys.path.insert(0, ${JSON.stringify(appDir)})
import tdn_shopee_app
api = tdn_shopee_app.Api()
run = sys.argv[1]
out = {'outputs': api.moduleOutputs(run)}
if len(sys.argv) > 2:
    out['open'] = api.openModuleEvidence(run, 'raw', sys.argv[2])
    out['wrong'] = api.openModuleEvidence(run, 'raw', '0' * 64)
print(json.dumps(out))`;
  const result = spawnSync('python3', ['-c', script, run.split('/').pop()!, digest], {
    encoding: 'utf8', timeout: 120000,
    env: { ...process.env, TDN_SHOPEE_APP_CONFIG: config, SHOPEE_FLOW_STATE: state,
      PYTHONDONTWRITEBYTECODE: '1', XDG_OPEN_LOG: opened,
      PATH: `${bin}:${process.env.PATH ?? ''}` },
  });
  assert.equal(result.status, 0, result.stderr);
  const data = JSON.parse(result.stdout);
  assert.equal(data.outputs.ok, true, JSON.stringify(data.outputs));
  assert.equal(data.outputs.data.format, 'module-outputs-v1');
  assert.equal(data.outputs.data.runId, run.split('/').pop());
  const descriptor = data.outputs.data.m1.evidence.raw;
  assert.deepEqual(Object.keys(descriptor).sort(),
    ['available', 'byteSize', 'errorCode', 'fileName', 'kind', 'mediaType', 'sha256'].sort());
  assert.deepEqual([descriptor.available, descriptor.kind, descriptor.byteSize, descriptor.mediaType,
    descriptor.fileName, descriptor.errorCode],
  [true, 'raw', rawBytes.length, 'application/json', 'raw-responses.json', null]);
  assert.equal(descriptor.sha256, digest);
  assert.deepEqual(data.open, { ok: true, data: { format: 'module-evidence-open-v1', runId: run.split('/').pop(),
    kind: 'raw', sha256: digest, opened: true } });
  assert.deepEqual(data.wrong, { ok: false, error: { code: 'EVIDENCE_IDENTITY_MISMATCH', message: 'EVIDENCE_IDENTITY_MISMATCH' } });
  const views = (await readFile(opened, 'utf8')).trim().split('\n');
  assert.equal(views.length, 1, 'only the verified descriptor opens the OS viewer');
  assert.deepEqual(await readFile(views[0]!), rawBytes);
  await rm(dirname(views[0]!), { recursive: true, force: true });
});

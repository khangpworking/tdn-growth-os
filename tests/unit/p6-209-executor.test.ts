import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { executeMetricOpenCli, type MetricOpenCliExecutorInput, type MetricOpenCliProcessExecution } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';

const bytes = new TextEncoder().encode('synthetic adapter manifest');
const digest = createHash('sha256').update(bytes).digest('hex');
const input = (overrides: Partial<MetricOpenCliExecutorInput> = {}): MetricOpenCliExecutorInput => ({
  enabledEnv: '1', executable: 'opencli', specPath: 'synthetic/spec.json', outputDir: 'synthetic/out', adapterManifestPath: 'manifest', expectedAdapterManifestSha256: digest, ...overrides,
});
const child = (overrides: { pid?: number; killGroup?: () => void; kill?: () => void } = {}) => ({
  ...(overrides.pid === undefined ? {} : { pid: overrides.pid }),
  ...(overrides.killGroup === undefined ? {} : { killGroup: overrides.killGroup }),
  kill: overrides.kill ?? (() => {}),
});
const execution = (result: MetricOpenCliProcessExecution['completion'] extends Promise<infer T> ? T : never, handle = child()): MetricOpenCliProcessExecution => ({ child: handle, completion: Promise.resolve(result) });
const deps = (result: any = { exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '' }) => ({ readManifest: async () => bytes, runProcess: async () => execution(result) });

test('executor is disabled unless flag is exactly 1', async () => {
  const result = await executeMetricOpenCli(input({ enabledEnv: 'true' }), deps());
  assert.equal(result.ok, false); if (result.ok) assert.fail('expected disabled'); assert.equal(result.code, 'EXECUTOR_DISABLED');
});

test('executor uses fixed argv, detached process group and no shell when enabled', async () => {
  let seen: readonly string[] = []; let options: any;
  const result = await executeMetricOpenCli(input(), { readManifest: async () => bytes, runProcess: async (_exe, argv, received) => { seen = argv; options = received; return execution({ exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '' }); } });
  assert.equal(result.ok, true); assert.equal(options.shell, false); assert.equal(options.detached, true);
  assert.deepEqual(seen, ['metric', 'capture', '--spec', 'synthetic/spec.json', '--out', 'synthetic/out', '--product-cap', '200', '-f', 'json']);
});

test('executor owns timeout and kills both the child and its process group', async () => {
  let childKilled = false; let groupKilled = false;
  const handle = child({ pid: 12345, kill: () => { childKilled = true; }, killGroup: () => { groupKilled = true; } });
  const result = await executeMetricOpenCli(input({ timeoutMs: 5 }), { readManifest: async () => bytes, runProcess: async () => ({ child: handle, completion: new Promise(() => {}) }) });
  assert.equal(result.ok, false); if (result.ok) assert.fail('expected timeout'); assert.equal(result.code, 'TIMEOUT'); assert.equal(childKilled, true); assert.equal(groupKilled, true);
});

test('executor rejects a zero exit with unrecognised stderr or malformed stdout', async () => {
  const stderr = await executeMetricOpenCli(input(), deps({ exitCode: 0, stdout: '[{"status":"READY"}]', stderr: 'unexpected warning' }));
  const stdout = await executeMetricOpenCli(input(), deps({ exitCode: 0, stdout: 'ok', stderr: '' }));
  for (const result of [stderr, stdout]) { assert.equal(result.ok, false); if (result.ok) assert.fail('expected fail closed'); assert.equal(result.code, 'METRIC_UI_CHANGED'); }
});

test('executor accepts exactly one READY adapter row and known benign stderr', async () => {
  const result = await executeMetricOpenCli(input(), deps({ exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '⏳ Starting daemon...\n' }));
  assert.equal(result.ok, true);
});

test('executor maps timeout, hash mismatch and every fail-closed code', async () => {
  const mismatch = await executeMetricOpenCli(input({ expectedAdapterManifestSha256: '0'.repeat(64) }), deps());
  if (mismatch.ok) assert.fail('expected manifest mismatch'); assert.equal(mismatch.code, 'MANIFEST_HASH_MISMATCH');
  for (const code of ['METRIC_LOGIN_REQUIRED', 'METRIC_CAPTCHA', 'METRIC_UI_CHANGED', 'METRIC_FILTER_MISMATCH', 'METRIC_ROW_CAP', 'BRIDGE_DISCONNECTED'] as const) {
    const result = await executeMetricOpenCli(input(), deps({ exitCode: 1, stdout: '', stderr: code }));
    if (result.ok) assert.fail(`expected ${code}`); assert.equal(result.code, code);
  }
});

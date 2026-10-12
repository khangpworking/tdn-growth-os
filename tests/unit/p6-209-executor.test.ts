import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { executeMetricOpenCli, type MetricOpenCliExecutorInput } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';

const bytes = new TextEncoder().encode('synthetic adapter manifest');
const digest = createHash('sha256').update(bytes).digest('hex');
const input = (overrides: Partial<MetricOpenCliExecutorInput> = {}): MetricOpenCliExecutorInput => ({
  enabledEnv: '1', executable: 'opencli', specPath: 'synthetic/spec.json', outputDir: 'synthetic/out', adapterManifestPath: 'manifest', expectedAdapterManifestSha256: digest, ...overrides,
});
const deps = (result: any = { exitCode: 0, stdout: '{}', stderr: '' }) => ({ readManifest: async () => bytes, runProcess: async (_exe: string, _argv: readonly string[], options: any) => { assert.equal(options.shell, false); return result; } });

test('executor is disabled unless flag is exactly 1', async () => {
  const result = await executeMetricOpenCli(input({ enabledEnv: 'true' }), deps());
  assert.equal(result.ok, false);
  if (result.ok) assert.fail('expected executor to be disabled');
  assert.equal(result.code, 'EXECUTOR_DISABLED');
});

test('executor uses fixed argv and no shell when enabled', async () => {
  let seen: readonly string[] = [];
  const result = await executeMetricOpenCli(input(), { readManifest: async () => bytes, runProcess: async (_exe, argv, options) => { seen = argv; assert.equal(options.shell, false); return { exitCode: 0, stdout: 'ok', stderr: '' }; } });
  assert.equal(result.ok, true);
  assert.deepEqual(seen, ['metric', 'capture', '--spec', 'synthetic/spec.json', '--out', 'synthetic/out', '--export', 'true', '--pdf', 'true', '--max-rows', '5000', '-f', 'json']);
});

test('executor maps timeout, hash mismatch and every fail-closed code', async () => {
  const timeout = await executeMetricOpenCli(input(), deps({ exitCode: null, stdout: '', stderr: '', timedOut: true }));
  if (timeout.ok) assert.fail('expected timeout');
  assert.equal(timeout.code, 'TIMEOUT');
  const mismatch = await executeMetricOpenCli(input({ expectedAdapterManifestSha256: '0'.repeat(64) }), deps());
  if (mismatch.ok) assert.fail('expected manifest mismatch');
  assert.equal(mismatch.code, 'MANIFEST_HASH_MISMATCH');
  for (const code of ['METRIC_LOGIN_REQUIRED', 'METRIC_CAPTCHA', 'METRIC_UI_CHANGED', 'METRIC_FILTER_MISMATCH', 'METRIC_ROW_CAP', 'BRIDGE_DISCONNECTED'] as const) {
    const result = await executeMetricOpenCli(input(), deps({ exitCode: 1, stdout: '', stderr: code }));
    if (result.ok) assert.fail(`expected ${code}`);
    assert.equal(result.code, code);
  }
});

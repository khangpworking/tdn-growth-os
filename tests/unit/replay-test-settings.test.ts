import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

const flag = 'TDN_RESEARCH_AUTORUN_TEST_REVIEWS';
const cap = 'TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT';
const charge = 'TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD';
const invoke = (...args: string[]) => spawnSync('bash', ['scripts/replay-test-instance.sh', ...args], { encoding: 'utf8', env: { PATH: process.env.PATH, HOME: process.env.HOME } });

test('replay test-setting refuses every non-allow-listed key before production reads, without echoing values', () => {
  for (const key of ['TDN_APIFY_TOKEN', 'APIFY_TOKEN', 'TDN_OWNER_API_TOKEN', 'TDN_WORKSPACE_DB', 'TDN_METRIC_OPENCLI_ENABLED', 'PATH']) {
    const result = invoke('--test-setting', `${key}=synthetic-secret-do-not-echo`);
    assert.equal(result.status, 1); assert.match(result.stderr, /not allow-listed/);
    assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret-do-not-echo/);
  }
});

test('replay test-setting accepts only short numeric flag and cap values', () => {
  for (const entry of [`${flag}=1`, `${flag}=0`, `${cap}=1`, `${cap}=20`, `${cap}=19`, `${charge}=0.01`, `${charge}=1`, `${charge}=10000.000`]) {
    const result = invoke('--test-setting', entry, '--help');
    assert.equal(result.status, 0, result.stderr); assert.match(result.stdout, /--test-setting/);
  }
  for (const [key, values] of [[flag, ['true', 'secret', '2']], [cap, ['0', '21', '50', '51', '300', '20x', '12345678901234567890']],
    [charge, ['0', '-1', '10000.01', '10001', '1e2', '1\nTDN_APIFY_TOKEN=synthetic', 'synthetic-secret', '12345678901234567890', '1$(touch ../never-create-this)']]] as const) {
    for (const value of values) {
      const result = invoke('--test-setting', `${key}=${value}`, '--help');
      assert.equal(result.status, 1, `${key}: ${value}`); assert.doesNotMatch(result.stdout + result.stderr, /synthetic-secret|TDN_APIFY_TOKEN=synthetic|touch/);
    }
  }
  assert.equal(invoke('--test-setting').status, 1);
});

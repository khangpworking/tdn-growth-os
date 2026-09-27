import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertCliproxyConfiguration,
  cliproxyConfigurationFromEnvironment,
} from '../../src/platform/ai/cliproxy-configuration.js';

const KEY = 'cliproxy-config-sentinel-049';

function environment(baseUrl: string, apiKey = KEY): NodeJS.ProcessEnv {
  return { TDN_CLIPROXY_BASE_URL: baseUrl, TDN_CLIPROXY_API_KEY: apiKey };
}

function assertRejected(baseUrl: string, apiKey = KEY): void {
  let error: unknown;
  try { cliproxyConfigurationFromEnvironment(environment(baseUrl, apiKey)); }
  catch (caught) { error = caught; }
  assert.ok(error instanceof TypeError, `${baseUrl} should be rejected`);
  const rendered = `${error.message}\n${error.stack ?? ''}`;
  assert.doesNotMatch(rendered, new RegExp(KEY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  // The fixed rule phrase necessarily shares the bare `http://127.0.0.1` prefix
  // for the no-port case; it does not echo the submitted full value.
  if (baseUrl !== 'http://127.0.0.1') assert.equal(rendered.includes(baseUrl), false);
}

test('both CLIProxy variables unset disables AI, while partial configuration fails together', () => {
  assert.equal(cliproxyConfigurationFromEnvironment({}), undefined);
  assert.throws(() => cliproxyConfigurationFromEnvironment({ TDN_CLIPROXY_BASE_URL: 'http://127.0.0.1:8317' }), (error: unknown) => {
    assert.ok(error instanceof TypeError);
    assert.equal(error.message, 'TDN_CLIPROXY_BASE_URL and TDN_CLIPROXY_API_KEY must be set together');
    return true;
  });
  assert.throws(() => cliproxyConfigurationFromEnvironment({ TDN_CLIPROXY_API_KEY: KEY }), /must be set together/);
});

test('accepted numeric loopback forms normalize only an optional trailing slash', () => {
  assert.deepEqual(cliproxyConfigurationFromEnvironment(environment('http://127.0.0.1:8317')), { baseUrl: 'http://127.0.0.1:8317', apiKey: KEY });
  assert.deepEqual(cliproxyConfigurationFromEnvironment(environment('http://127.0.0.1:8317/')), { baseUrl: 'http://127.0.0.1:8317', apiKey: KEY });
  assert.deepEqual(cliproxyConfigurationFromEnvironment(environment('http://[::1]:8317')), { baseUrl: 'http://[::1]:8317', apiKey: KEY });
  assert.deepEqual(cliproxyConfigurationFromEnvironment(environment('http://127.0.0.1:80')), { baseUrl: 'http://127.0.0.1:80', apiKey: KEY });
});

test('every non-loopback, normalized, or syntactically unsafe base URL is rejected without echoing input', () => {
  for (const value of [
    'http://127.0.0.1:8317@evil.test',
    'https://127.0.0.1:8317',
    'http://localhost:8317',
    'http://127.1:8317',
    'http://0x7f.0.0.1:8317',
    'http://[::ffff:127.0.0.1]:8317',
    'http://127.0.0.2:8317',
    'http://0.0.0.0:8317',
    'http://192.168.1.10:8317',
    'http://203.0.113.10:8317',
    'http://127.0.0.1',
    'http://127.0.0.1:0',
    'http://127.0.0.1:65536',
    'http://127.0.0.1:080',
    'http://user:pass@127.0.0.1:8317',
    'http://127.0.0.1:8317?',
    'http://127.0.0.1:8317#',
    'http://127.0.0.1:8317?x=1',
    'http://127.0.0.1:8317/path',
    ' http://127.0.0.1:8317',
    'http://127.0.0.1:8317 ',
  ]) assertRejected(value);
});

test('empty, whitespace, non-ASCII, and overlong keys are rejected without echoing the key', () => {
  for (const key of ['', 'contains space', 'contains\ttab', 'khóa-không-ASCII', 'x'.repeat(513)]) assertRejected('http://127.0.0.1:8317', key);
});

test('the already-parsed configuration is checked again without accepting a trailing slash or invalid key', () => {
  assert.doesNotThrow(() => assertCliproxyConfiguration({ baseUrl: 'http://127.0.0.1:8317', apiKey: KEY }));
  assert.throws(() => assertCliproxyConfiguration({ baseUrl: 'http://127.0.0.1:8317/', apiKey: KEY }), /without a trailing slash/);
  assert.throws(() => assertCliproxyConfiguration({ baseUrl: 'http://127.0.0.1:8317', apiKey: 'bad key' }), /printable ASCII/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';

test('TDN_RESEARCH_SEARCH_TRENDS_ENABLED turns the search-interest lane on only when it is exactly "1"', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-trends-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frontendDist = path.join(root, 'dist'); fs.mkdirSync(frontendDist);
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><p>Synthetic app</p>');
  const base = { TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  const read = (env: NodeJS.ProcessEnv) => operatorAppConfigurationFromEnvironment({ ...base, ...env }, { frontendDist, version: 'synthetic' });
  const off = read({});
  assert.equal('researchSearchTrends' in off, false, 'off by default: the key is absent, not false');
  for (const value of ['', '0', 'true', 'TRUE', 'yes', ' 1', '1 ', '01']) assert.equal('researchSearchTrends' in read({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: value }), false, JSON.stringify(value));
  const on = read({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: '1' });
  assert.equal(on.researchSearchTrends, true);
  const { researchSearchTrends: _flag, ...rest } = on;
  assert.deepEqual(rest, off, 'nothing else in the configuration changes');
});

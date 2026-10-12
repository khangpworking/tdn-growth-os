import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';

test('operator configuration enables Jev only with the explicit flag and key, without exposing key material in errors', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-jev-209b-operator-'));
  const frontendDist = path.join(root, 'frontend');
  await fs.mkdir(path.join(frontendDist, 'assets'), { recursive: true });
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<script src="./assets/app.js"></script>');
  await fs.writeFile(path.join(frontendDist, 'assets', 'app.js'), '');
  await fs.chmod(frontendDist, 0o755); await fs.chmod(path.join(frontendDist, 'assets'), 0o755);
  await fs.chmod(path.join(frontendDist, 'index.html'), 0o644); await fs.chmod(path.join(frontendDist, 'assets', 'app.js'), 0o644);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const base = { TDN_WORKSPACE_DB: path.join(root, 'research.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  const defaults = { frontendDist, version: 'synthetic' };
  const disabled = operatorAppConfigurationFromEnvironment(base, defaults);
  assert.equal(disabled.researchJev, undefined);
  const enabled = operatorAppConfigurationFromEnvironment({ ...base, TDN_RESEARCH_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'synthetic-key-without-spaces' }, defaults);
  assert.deepEqual(enabled.researchJev, { enabled: true, apiKey: 'synthetic-key-without-spaces', model: 'jev-1.13.0' });
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_RESEARCH_JEV_ENABLED: 'true', TYPESAFE_API_KEY: 'secret key' }, defaults), error =>
    error instanceof Error && !error.message.includes('secret key'));
});

test('automation API builds the L9 second pass only for the OWNER writer, before opening any database', () => {
  const researchJev = { enabled: true, apiKey: 'synthetic-key-without-spaces', model: 'jev-1.13.0' };
  const missing = path.join(os.tmpdir(), 'tdn-jev-209b-api-missing', 'research.sqlite');
  assert.throws(() => openResearchAutomationApi({
    databasePath: missing, artifactRoot: path.dirname(missing), origin: 'http://127.0.0.1:18787', researchJev,
  }), (error: unknown) => error instanceof TypeError && /L9 second pass requires the OWNER writer/.test(error.message) && !error.message.includes(researchJev.apiKey));
  // A disabled configuration grants nothing and never reaches the OWNER check.
  assert.throws(() => openResearchAutomationApi({
    databasePath: missing, artifactRoot: path.dirname(missing), origin: 'http://127.0.0.1:18787', researchJev: { enabled: false, model: 'jev-1.13.0' },
  }), (error: unknown) => error instanceof Error && !/L9 second pass/.test(error.message));
});
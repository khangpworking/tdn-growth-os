import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';

const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function parse(environment: NodeJS.ProcessEnv) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-tiktok-operator-')); roots.push(root);
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(path.join(frontendDist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  fs.writeFileSync(path.join(frontendDist, 'assets', 'app.js'), 'globalThis.TDN=true;');
  const base = { TDN_WORKSPACE_DB: path.join(root, 'workspace.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  return operatorAppConfigurationFromEnvironment({ ...base, ...environment }, { frontendDist, version: '0.1.0' });
}

const owner = { TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'strong-owner-token-12345678901234567890', TDN_OWNER_API_ACTOR_ID: 'owner:local' };
const cliproxy = { TDN_CLIPROXY_BASE_URL: 'http://127.0.0.1:18317', TDN_CLIPROXY_API_KEY: 'synthetic-cliproxy-key-0123456789' };
const MODEL = 'synthetic-tiktok-model-1';

test('TikTok coding model stays unconfigured unless explicitly opted in with an explicit model', () => {
  for (const environment of [
    { ...owner, ...cliproxy },
    { ...owner, ...cliproxy, TDN_RESEARCH_TIKTOK_CODING_AI_MODEL: MODEL },
    { ...owner, ...cliproxy, TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED: 'false', TDN_RESEARCH_TIKTOK_CODING_AI_MODEL: MODEL },
  ]) assert.equal('researchTikTokCodingAi' in parse(environment), false, 'no automatic enable');
  assert.throws(() => parse({ ...owner, ...cliproxy, TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED: 'yes' }),
    /TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED must be exactly true or false/);
  for (const model of [undefined, '', ' synthetic-model', 'vendor/synthetic-model']) {
    assert.throws(() => parse({ ...owner, ...cliproxy, TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED: 'true', TDN_RESEARCH_TIKTOK_CODING_AI_MODEL: model }),
      /TDN_RESEARCH_TIKTOK_CODING_AI_MODEL must name an explicit CLIProxy model/);
  }
  assert.throws(() => parse({ ...owner, TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED: 'true', TDN_RESEARCH_TIKTOK_CODING_AI_MODEL: MODEL }),
    /requires CLIProxy and OWNER writes/);
  const enabled = parse({ ...owner, ...cliproxy, TDN_RESEARCH_TIKTOK_CODING_AI_ENABLED: 'true', TDN_RESEARCH_TIKTOK_CODING_AI_MODEL: MODEL });
  assert.deepEqual(enabled.researchTikTokCodingAi, { contractVersion: 'tiktok-coding-configuration-v1',
    providerId: 'cliproxy', modelId: MODEL, temperature: null, maxOutputTokens: 16384, timeoutMs: 300_000, maxResponseBytes: 262_144 });
});

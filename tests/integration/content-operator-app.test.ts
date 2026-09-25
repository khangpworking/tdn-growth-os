import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openOperatorApp, type OperatorAppConfiguration } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { syntheticJpeg } from '../helpers/content-images.js';

const roots: string[] = [];
let nextPort = 18987;
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const token = 'strong-owner-token-12345678901234567890';
const displayRules = Object.fromEntries(['sales', 'trust', 'education', 'entertainment', 'engagement'].map((purpose) => [purpose,
  { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' }]));

function fixture(enabled: boolean): OperatorAppConfiguration {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-operator-')); roots.push(root);
  const databasePath = path.join(root, 'workspace.sqlite');
  const frontendDist = path.join(root, 'frontend', 'dist');
  fs.mkdirSync(frontendDist, { recursive: true });
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><p>TDN</p>');
  openDatabase({ databasePath }).db.close();
  return { databasePath, artifactRoot: path.join(root, 'artifacts'), frontendDist, version: '0.1.0', host: '127.0.0.1', port: nextPort++, ownerWritesEnabled: enabled,
    ...(enabled ? { ownerToken: token, ownerActorId: 'owner:local' } : {}) };
}
async function serve(configuration: OperatorAppConfiguration, run: (origin: string) => Promise<void>): Promise<void> {
  const application = openOperatorApp(configuration);
  application.server.listen(configuration.port, configuration.host); await once(application.server, 'listening');
  try { await run(application.origin); } finally { await application.close(); }
}

test('operator app routes content read and OWNER paths to the content APIs', async () => {
  await serve(fixture(true), async (origin) => {
    assert.deepEqual(await (await fetch(`${origin}/api/content/brands`)).json(), { contractVersion: '1.0.0', brands: [] });
    const created = await fetch(`${origin}/owner-api/content/brands`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin },
      body: JSON.stringify({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile: { brandName: 'Canxi Việt' }, displayRules }),
    });
    assert.equal(created.status, 201);
    const list = await (await fetch(`${origin}/api/content/brands`)).json() as { brands: { brandName: string }[] };
    assert.deepEqual(list.brands.map((brand) => brand.brandName), ['Canxi Việt']);
    const { brandId } = await created.json() as { brandId: string };
    const photo = syntheticJpeg(640, 480);
    const uploaded = await fetch(`${origin}/owner-api/content/brands/${brandId}/media/photo`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'image/jpeg', origin }, body: photo });
    assert.equal(uploaded.status, 201);
    const { mediaSha256 } = await uploaded.json() as { mediaSha256: string };
    const preview = await fetch(`${origin}/api/content/brands/${brandId}/media/${mediaSha256}`);
    assert.equal(preview.status, 200);
    assert.equal(preview.headers.get('content-type'), 'image/jpeg');
    assert.equal(Buffer.from(await preview.arrayBuffer()).equals(photo), true);
    assert.deepEqual(await (await fetch(`${origin}/api/content/brands/${brandId}/catalog`)).json(), { contractVersion: '1.0.0', brandId, items: [] });
    assert.equal((await fetch(`${origin}/api/workspaces`)).status, 200);
  });
});

test('content OWNER paths stay forbidden when OWNER writes are disabled', async () => {
  await serve(fixture(false), async (origin) => {
    assert.equal((await fetch(`${origin}/api/content/brands`)).status, 200);
    const denied = await fetch(`${origin}/owner-api/content/brands`, { method: 'POST' });
    assert.equal(denied.status, 403);
    assert.deepEqual(await denied.json(), { error: { code: 'forbidden', message: 'OWNER writes are disabled' } });
  });
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../../tools/opencli-metric/', import.meta.url);
// Checkouts may convert line endings; the pins are over the repository's LF bytes.
const lfBytes = (url: URL): Buffer => Buffer.from(readFileSync(url, 'utf8').replace(/\r\n/g, '\n'), 'utf8');
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

test('adapter manifest pins match the adapter files in the repository', () => {
  const manifest = JSON.parse(readFileSync(new URL('adapter-manifest.json', root), 'utf8')) as { files: { path: string; sha256: string }[] };
  assert.ok(manifest.files.length > 0);
  for (const file of manifest.files) assert.equal(sha256(lfBytes(new URL(file.path, root))), file.sha256, file.path);
});

test('runbook names the current adapter manifest digest', () => {
  const digest = sha256(lfBytes(new URL('adapter-manifest.json', root)));
  assert.ok(readFileSync(new URL('../../docs/runbooks/metric-opencli.md', import.meta.url), 'utf8').includes(digest));
});

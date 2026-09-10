import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterEach, test } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function state() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-source-package-cli-'));
  roots.push(root);
  const packageRoot = path.join(root, 'package');
  const artifactRoot = path.join(root, 'artifacts');
  fs.mkdirSync(packageRoot);
  const bytes = Buffer.from('<script>alert(1)</script> 0\n');
  fs.writeFileSync(path.join(packageRoot, 'evidence.html'), bytes);
  const input = {
    contractVersion: '1.0.0',
    packageKey: 'manual:synthetic-cli',
    version: 1,
    sourceAcquiredAt: null,
    sourceLabel: '<script>source</script> ![label](https://evil.example/image.png)\n# injected heading',
    files: [{
      path: 'evidence.html', sha256: digest(bytes), byteSize: bytes.length, mediaType: 'text/html',
      evidenceFamily: 'synthetic-family', representationRole: 'primary', independence: 'independent',
      providerProvenance: 'synthetic', provenanceBasis: '<b>fixture</b>',
    }],
  };
  const audit = {
    contractVersion: '1.0.0', packageKey: input.packageKey, version: 1,
    observations: [{
      observationKey: 'synthetic-zero', field: '<img src=x>', state: 'observed_zero', value: '0', unit: 'count',
      precision: 'exact', evidenceFamily: 'synthetic-family', representationPath: 'evidence.html',
      representationSha256: digest(bytes), locator: { type: 'html_text', text: '<script>alert(1)</script> 0' },
      notes: '<iframe>note</iframe> [link](javascript:alert(1))\r\n## injected note',
    }], conflicts: [], periodComparisons: [],
  };
  const intakePath = path.join(root, 'intake.json');
  const auditPath = path.join(root, 'audit.json');
  fs.writeFileSync(intakePath, JSON.stringify(input));
  fs.writeFileSync(auditPath, JSON.stringify(audit));
  return { root, packageRoot, artifactRoot, databasePath: path.join(root, 'db.sqlite'), output: path.join(root, 'report.md'), intakePath, auditPath };
}

function run(value: ReturnType<typeof state>) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'scripts/intake-source-package.ts',
    value.databasePath, value.artifactRoot, value.packageRoot, value.intakePath, value.auditPath, value.output], {
    encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_APIFY_TOKEN: 'MUST_NOT_USE', TDN_PYTHON: 'must-not-run' },
  });
}

test('023 CLI persists synthetic package without provider use and emits inert owner-only report', async () => {
  const value = state();
  const first = run(value);
  assert.equal(first.status, 0, first.stderr);
  const receipt = JSON.parse(first.stdout);
  assert.equal(receipt.providerCalls, 0);
  assert.ok(receipt.databaseMutations > 0);
  assert.match(receipt.packageContentSha256, /^[a-f0-9]{64}$/);
  assert.match(receipt.resultSha256, /^[a-f0-9]{64}$/);
  const report = await fsp.readFile(value.output, 'utf8');
  assert.match(report, /&lt;script&gt;source&lt;\/script&gt;/);
  assert.match(report, /&lt;img src=x&gt;/);
  assert.match(report, /&lt;iframe&gt;note&lt;\/iframe&gt;/);
  assert.ok(report.includes('\\!\\[label\\]\\(https://evil\\.example/image\\.png\\)&\\#10;\\# injected heading'));
  assert.ok(report.includes('\\[link\\]\\(javascript:alert\\(1\\)\\)&\\#13;&\\#10;\\#\\# injected note'));
  assert.doesNotMatch(report, /<script>|<img|<iframe>/);
  assert.doesNotMatch(report, /!\[[^\]]*\]\([^)]*\)|\[[^\]]+\]\([^)]*\)/);
  assert.doesNotMatch(report, /(?:^|\n)#+ injected (?:heading|note)(?:\n|$)/);
  assert.doesNotMatch(report, new RegExp(value.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  if (process.platform !== 'win32') assert.equal((await fsp.stat(value.output)).mode & 0o777, 0o600);

  const opened = openDatabase({ databasePath: value.databasePath });
  const count = (table: string): bigint => (opened.db.prepare(`SELECT count(*) AS count FROM ${table}`).get() as { count: bigint }).count;
  const before = {
    packages: count('foundation_source_packages'),
    audits: count('analysis_source_package_field_audit_results'),
    artifacts: count('artifact_manifests'),
  };
  opened.db.close();

  const second = run(value);
  assert.equal(second.status, 1);
  assert.equal(second.stdout, '');
  assert.match(second.stderr, /Refusing to overwrite/);
  const checked = openDatabase({ databasePath: value.databasePath });
  assert.deepEqual({
    packages: (checked.db.prepare('SELECT count(*) AS count FROM foundation_source_packages').get() as { count: bigint }).count,
    audits: (checked.db.prepare('SELECT count(*) AS count FROM analysis_source_package_field_audit_results').get() as { count: bigint }).count,
    artifacts: (checked.db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count,
  }, before);
  checked.db.close();
});

test('023 CLI rejects extra files and symlinks before source package or artifact rows', () => {
  for (const kind of ['extra', 'symlink'] as const) {
    const value = state();
    const opened = openDatabase({ databasePath: value.databasePath });
    opened.db.close();
    if (kind === 'extra') fs.writeFileSync(path.join(value.packageRoot, 'extra.txt'), 'extra');
    else fs.symlinkSync(path.join(value.packageRoot, 'evidence.html'), path.join(value.packageRoot, 'link.html'));
    const attempted = run(value);
    assert.equal(attempted.status, 1);
    assert.match(attempted.stderr, kind === 'extra' ? /Extra package file/ : /Symlink rejected/);
    const checked = openDatabase({ databasePath: value.databasePath });
    assert.equal((checked.db.prepare('SELECT count(*) AS count FROM foundation_source_packages').get() as { count: bigint }).count, 0n);
    assert.equal((checked.db.prepare('SELECT count(*) AS count FROM artifact_manifests').get() as { count: bigint }).count, 0n);
    checked.db.close();
  }
});

import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { preparedReportFixture, byteDigest } from './prepared-report-fixture.js';
import { buildReportAssemblySnapshot } from '../../src/modules/analysis/report-assembly-snapshot.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { publishPrivateReportBundle } from '../../src/platform/artifacts/private-report-bundle.js';

if (process.platform !== 'linux') throw new Error('Linux-only synthetic acceptance helper');
const output = process.argv[2];
if (!output?.startsWith('/')) throw new Error('Absolute private output required');
const state = await preparedReportFixture();
try {
  const requestFile = `${state.directory}/request.json`;
  const catalogFile = `${state.directory}/catalog.json`;
  await fs.writeFile(requestFile, canonicalJson(state.sourceRequest), { mode: 0o600 });
  await fs.writeFile(catalogFile, state.catalogBytes, { mode: 0o600 });
  state.db.pragma('wal_checkpoint(TRUNCATE)');
  state.db.close();
  const before = byteDigest(await fs.readFile(state.databasePath));
  // Run the actual read-only CLI, not a stand-in presentation function.
  const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/export-report-citation-preview.ts',
    state.databasePath, state.artifactRoot, requestFile, catalogFile, `${output}/bundle`], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || 'Preview CLI failed');
  if (byteDigest(await fs.readFile(state.databasePath)) !== before) throw new Error('Preview mutated database bytes');
  const snapshot = buildReportAssemblySnapshot(state).snapshot;
  await publishPrivateReportBundle(`${output}/audit-input`, new Map([
    ['assembly-snapshot.json', Buffer.from(canonicalJson(snapshot) + '\n')],
  ]));
  console.log(JSON.stringify({ syntheticOnly: true, cli: JSON.parse(result.stdout), databaseBytePreserving: true,
    assemblySnapshot: `${output}/audit-input/assembly-snapshot.json` }));
} finally { await state.cleanup(); }

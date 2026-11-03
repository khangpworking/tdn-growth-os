import path from 'node:path';
import { parseArgs } from 'node:util';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { loadShopeeReviewsToDbV1 } from '../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../src/modules/raw-db/google-search-loader.js';

// Usage: raw-db-load --source S05|S19b|S29 --run <runId> [--file <raw-v1 file>] [--db <path>] [--artifacts <dir>] [--dry-run]
// --file (S19b, S29 only) reads a raw-v1 / kem-raw-v1 file instead of the run's captures; --run is then its label.
// --db defaults to TDN_WORKSPACE_DB, else runtime/tdn-growth-os.sqlite; --artifacts defaults to TDN_ARTIFACT_ROOT.
let options;
try {
  options = parseArgs({ options: { source: { type: 'string' }, run: { type: 'string' }, file: { type: 'string' }, db: { type: 'string' }, artifacts: { type: 'string' },
    'dry-run': { type: 'boolean', default: false } } }).values;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const source = options.source;
if (source !== 'S05' && source !== 'S19b' && source !== 'S29') { console.error(`source not supported yet: ${source ?? '(none)'}`); process.exit(2); }
if (!options.run) { console.error('--run <runId> is required'); process.exit(2); }
if (options.file && source === 'S05') { console.error('--file is not supported for S05'); process.exit(2); }
const artifactRoot = options.artifacts ?? process.env.TDN_ARTIFACT_ROOT;
if (!artifactRoot && !options.file) { console.error('--artifacts <dir> or TDN_ARTIFACT_ROOT is required'); process.exit(2); }

let db: BetterSqlite3.Database | undefined;
try {
  // Loading requires an existing, migrated app DB. Opening it must not commit migrations before --dry-run.
  db = new BetterSqlite3(path.resolve(options.db ?? process.env.TDN_WORKSPACE_DB ?? path.join('runtime', 'tdn-growth-os.sqlite')), { fileMustExist: true });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.defaultSafeIntegers(true);
  // A file load reads no artifact; the store is only a placeholder then.
  const artifacts = new ContentAddressedArtifactStore(path.resolve(artifactRoot ?? 'runtime/artifacts'));
  const input = options.file ? { file: path.resolve(options.file), runId: options.run } : { runId: options.run };
  // Dry run: the loader's own transaction nests as a savepoint inside this one, which is then rolled back.
  if (options['dry-run']) db.exec('BEGIN');
  try {
    const result = source === 'S05' ? await loadShopeeReviewsToDbV1(db, artifacts, { runId: options.run })
      : source === 'S19b' ? await loadSearchSuggestionsToDbV1(db, artifacts, input)
      : await loadAiOverviewToDbV1(db, artifacts, input);
    console.log(JSON.stringify(result));
  } finally {
    if (options['dry-run']) db.exec('ROLLBACK');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db?.close();
}

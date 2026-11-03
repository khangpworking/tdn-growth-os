import path from 'node:path';
import { parseArgs } from 'node:util';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';
import { loadShopeeReviewsToDbV1 } from '../src/modules/raw-db/shopee-reviews-loader.js';

// Usage: raw-db-load --source S05 --run <runId> [--db <path>] [--artifacts <dir>] [--dry-run]
// --db defaults to TDN_WORKSPACE_DB, else runtime/tdn-growth-os.sqlite; --artifacts defaults to TDN_ARTIFACT_ROOT.
let options;
try {
  options = parseArgs({ options: { source: { type: 'string' }, run: { type: 'string' }, db: { type: 'string' }, artifacts: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } }).values;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
if (options.source !== 'S05') { console.error(`source not supported yet: ${options.source ?? '(none)'}`); process.exit(2); }
if (!options.run) { console.error('--run <runId> is required'); process.exit(2); }
const artifactRoot = options.artifacts ?? process.env.TDN_ARTIFACT_ROOT;
if (!artifactRoot) { console.error('--artifacts <dir> or TDN_ARTIFACT_ROOT is required'); process.exit(2); }

const { db } = openDatabase({ databasePath: path.resolve(options.db ?? process.env.TDN_WORKSPACE_DB ?? path.join('runtime', 'tdn-growth-os.sqlite')) });
try {
  const artifacts = new ContentAddressedArtifactStore(path.resolve(artifactRoot));
  // Dry run: the loader's own transaction nests as a savepoint inside this one, which is then rolled back.
  if (options['dry-run']) db.exec('BEGIN');
  try {
    const result = await loadShopeeReviewsToDbV1(db, artifacts, { runId: options.run });
    console.log(JSON.stringify(result));
  } finally {
    if (options['dry-run']) db.exec('ROLLBACK');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db.close();
}

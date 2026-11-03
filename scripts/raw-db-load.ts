import path from 'node:path';
import { parseArgs } from 'node:util';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { loadShopeeReviewsToDbV1 } from '../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../src/modules/raw-db/google-search-loader.js';
import { loadTikTokCommentsToDbV1 } from '../src/modules/raw-db/tiktok-comments-loader.js';
import { loadKalodataVideosToDbV1 } from '../src/modules/raw-db/kalodata-video-loader.js';
import { loadVideoReadingsToDbV1 } from '../src/modules/raw-db/video-reading-loader.js';
import { readTikTokCommentPrivacyFile, TIKTOK_COMMENTS_PRIVACY_FILE_ENV } from '../src/platform/collectors/apify-tiktok-comments-free.js';

// Usage: raw-db-load --source S02b|S05|S07|S14|S19b|S29 --run <runId> [--file <raw-v1 file>] [--privacy-file <abs path>] [--db <path>] [--artifacts <dir>] [--dry-run]
// --file (S02b, S07, S14, S19b, S29 only) reads a raw-v1 / kem-raw-v1 file instead of the run's captures; --run is then its label.
// S02b, S07 and S14 need the TikTok comment privacy key: --privacy-file, else TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE (mode-600 JSON).
// Load S14 after S02b for the same run: a run's top-selling video needs its S02b video row first.
// --db defaults to TDN_WORKSPACE_DB, else runtime/tdn-growth-os.sqlite; --artifacts defaults to TDN_ARTIFACT_ROOT.
let options;
try {
  options = parseArgs({ options: { source: { type: 'string' }, run: { type: 'string' }, file: { type: 'string' }, 'privacy-file': { type: 'string' }, db: { type: 'string' }, artifacts: { type: 'string' },
    'dry-run': { type: 'boolean', default: false } } }).values;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const source = options.source;
if (source !== 'S02b' && source !== 'S05' && source !== 'S07' && source !== 'S14' && source !== 'S19b' && source !== 'S29') { console.error(`source not supported yet: ${source ?? '(none)'}`); process.exit(2); }
if (!options.run) { console.error('--run <runId> is required'); process.exit(2); }
if (options.file && source === 'S05') { console.error('--file is not supported for S05'); process.exit(2); }
const artifactRoot = options.artifacts ?? process.env.TDN_ARTIFACT_ROOT;
if (!artifactRoot && !options.file) { console.error('--artifacts <dir> or TDN_ARTIFACT_ROOT is required'); process.exit(2); }
const keyed = source === 'S02b' || source === 'S07' || source === 'S14';
if (options['privacy-file'] && !keyed) { console.error('--privacy-file is only for S02b, S07 and S14'); process.exit(2); }
// S02b, S07, S14: the writer key is required before any input is read; the salt stays inside the privacy closure and is never printed.
let privacy;
if (keyed) {
  const file = options['privacy-file'] ?? process.env[TIKTOK_COMMENTS_PRIVACY_FILE_ENV];
  if (!file) { console.error(`RAW_DB_PRIVACY_KEY_MISSING: ${source} needs --privacy-file or ${TIKTOK_COMMENTS_PRIVACY_FILE_ENV}`); process.exit(1); }
  try { privacy = readTikTokCommentPrivacyFile(file); }
  catch (error) { console.error(`RAW_DB_PRIVACY_KEY_INVALID: ${error instanceof Error ? error.message : 'unreadable key file'}`); process.exit(1); }
}

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
      : source === 'S07' ? await loadTikTokCommentsToDbV1(db, artifacts, input, privacy)
      : source === 'S02b' ? await loadKalodataVideosToDbV1(db, artifacts, input, privacy)
      : source === 'S14' ? await loadVideoReadingsToDbV1(db, artifacts, input, privacy)
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

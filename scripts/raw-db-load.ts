import path from 'node:path';
import { parseArgs } from 'node:util';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { loadShopeeReviewsToDbV1 } from '../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../src/modules/raw-db/google-search-loader.js';
import { loadTikTokCommentsToDbV1 } from '../src/modules/raw-db/tiktok-comments-loader.js';
import { loadKalodataVideosToDbV1 } from '../src/modules/raw-db/kalodata-video-loader.js';
import { loadVideoReadingsToDbV1 } from '../src/modules/raw-db/video-reading-loader.js';
import { loadTikTokShopReviewsToDbV1 } from '../src/modules/raw-db/tiktok-shop-reviews-loader.js';
import { autoloadRunToDbV1 } from '../src/modules/raw-db/autoload.js';
import { loadReviewCodesToDbV1 } from '../src/modules/raw-db/review-code-loader.js';
import { labelReviewsInDbV1 } from '../src/modules/raw-db/review-labeller.js';
import { filterReviewsInDbV1, reviewFilterEnabled } from '../src/modules/raw-db/review-filter.js';
import { LabelsBusyError } from '../src/modules/raw-db/labels-lock.js';
import { defaultSnapshotDir, publishAppDbSnapshot, tryPublishAppDbSnapshot } from '../src/modules/raw-db/app-db-snapshot.js';
import { TypesafeJevClient, typesafeJevConfigurationFromEnvironment } from '../src/platform/ai/typesafe-jev-client.js';
import { readTikTokCommentPrivacyFile, TIKTOK_COMMENTS_PRIVACY_FILE_ENV } from '../src/platform/collectors/apify-tiktok-comments-free.js';

// Usage: raw-db-load --source S02b|S05|S06|S07|S14|S19b|S29 --run <runId> [--file <raw-v1 file>] [--privacy-file <abs path>] [--db <path>] [--artifacts <dir>] [--dry-run]
// S06 (TikTok Shop reviews) reads only the run's stored kalodata.product.comment.insight captures (no --file).
// --file (S02b, S07, S14, S19b, S29 only) reads a raw-v1 / kem-raw-v1 file instead of the run's captures; --run is then its label.
// S02b, S07 and S14 need the TikTok comment privacy key: --privacy-file, else TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE (mode-600 JSON).
// Load S14 after S02b for the same run: a run's top-selling video needs its S02b video row first.
// raw-db-load --source CODES --mcp-run <runs/<runId>.sqlite> --codebook <theme list JSON> --coder <name> [--db <path>] [--dry-run]
// imports the theme labels of an Insight MCP run (no AI call, no privacy key; the run file is only read).
// raw-db-load --source LABELS [--run <runId>] [--max-calls N] [--codebook <json>] [--captures <dir>] [--db <path>] [--artifacts <dir>] [--dry-run]
// labels eligible db-v1 product reviews, Shopee and TikTok Shop (one run, or all) with Jev (review_code origin APP_JEV); --dry-run plans only (no network).
// A real S05 load labels the run's reviews right after it commits (owner F366/F367); --no-label skips that. Jev needs
// TDN_RESEARCH_JEV_ENABLED=true and TYPESAFE_API_KEY; without them the S05 load still succeeds (labelling SKIPPED_JEV_DISABLED).
// --captures (scope.json root) defaults to TDN_METRIC_CAPTURE_DIR, else <db dir>/metric-captures.
// LABELS passes, the S05 labelling and CODES imports run one at a time (lock <db dir>/raw-db-labels.lock.sqlite); a second
// one waits 10 s, then fails with LABELS_BUSY (S05: the load succeeds, labelling SKIPPED_BUSY). --dry-run takes no lock.
// A real S05 load, LABELS pass or CODES import then publishes <db dir>/app-db-snapshot/app-db.snapshot.sqlite for the
// Insight MCP (result field snapshot; a failed publish is reported there and never fails the load).
// raw-db-load --source SNAPSHOT [--db <path>] publishes that snapshot by hand.
// raw-db-load --source FILTER [--run <runId>] [--max-calls N] [--db <path>] [--artifacts <dir>] [--dry-run]
// runs the shadow review filter (review_filter_assessment; read by nothing else) over product reviews, Shopee and TikTok Shop
// (one run, or all): one Jev call per review with content, at most 1500 per pass. Jev and the lock as LABELS; a real pass
// then publishes the snapshot. --dry-run prints the counts only (no network, no write).
// raw-db-load --source AUTOLOAD --run <runId> [--privacy-file <abs path>] [--captures <dir>] [--codebook <json>] [--db <path>] [--artifacts <dir>] [--dry-run]
// runs the app's automatic sequence by hand (old runs, retries): S05, S06, S07, S02b, S14, S19b, S29 (each only when the run
// has it), then Jev labelling of the run's product reviews, one raw_db_autoload row, then the snapshot. A missing privacy key
// skips only S07, S02b and S14 (SKIPPED_NO_PRIVACY_KEY); Jev disabled → labelling SKIPPED_JEV_DISABLED. --dry-run records nothing.
// The shadow review filter runs before labelling only when TDN_RAW_DB_REVIEW_FILTER_ENABLED=true (else filtering SKIPPED_FLAG_OFF).
// --db defaults to TDN_WORKSPACE_DB, else runtime/tdn-growth-os.sqlite; --artifacts defaults to TDN_ARTIFACT_ROOT.
let options;
try {
  options = parseArgs({ options: { source: { type: 'string' }, run: { type: 'string' }, file: { type: 'string' }, 'privacy-file': { type: 'string' }, 'mcp-run': { type: 'string' }, codebook: { type: 'string' }, coder: { type: 'string' }, 'max-calls': { type: 'string' }, captures: { type: 'string' }, 'no-label': { type: 'boolean', default: false }, db: { type: 'string' }, artifacts: { type: 'string' },
    'dry-run': { type: 'boolean', default: false } } }).values;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(2);
}
const source = options.source;
if (source !== 'SNAPSHOT' && source !== 'FILTER' && source !== 'LABELS' && source !== 'CODES' && source !== 'AUTOLOAD' && source !== 'S02b' && source !== 'S05' && source !== 'S06' && source !== 'S07' && source !== 'S14' && source !== 'S19b' && source !== 'S29') { console.error(`source not supported yet: ${source ?? '(none)'}`); process.exit(2); }
const snapshotOnly = source === 'SNAPSHOT';
if (snapshotOnly && Object.entries(options).some(([name, value]) => name !== 'source' && name !== 'db' && value !== undefined && value !== false)) {
  console.error('SNAPSHOT takes only --db'); process.exit(2);
}
const codes = source === 'CODES';
const labels = source === 'LABELS';
const autoload = source === 'AUTOLOAD';
const filter = source === 'FILTER';
const labelSource = labels || source === 'S05';
if (options.captures && !labelSource && !autoload) { console.error('--captures is only for LABELS, S05 and AUTOLOAD'); process.exit(2); }
if (options['max-calls'] !== undefined && !labelSource && !filter) { console.error('--max-calls is only for LABELS, FILTER and S05'); process.exit(2); }
if (options['no-label'] && source !== 'S05') { console.error('--no-label is only for S05'); process.exit(2); }
const maxCalls = options['max-calls'] === undefined ? undefined : Number(options['max-calls']);
if (maxCalls !== undefined && !(Number.isInteger(maxCalls) && maxCalls >= 1)) { console.error('--max-calls must be a positive integer'); process.exit(2); }
if (snapshotOnly) { /* checked above */ } else if (labels) {
  if (options.file || options['mcp-run'] || options.coder) { console.error('--file, --mcp-run and --coder are not used by LABELS'); process.exit(2); }
} else if (filter) {
  if (options.file || options['mcp-run'] || options.coder || options.codebook || options['privacy-file']) { console.error('--file, --mcp-run, --coder, --codebook and --privacy-file are not used by FILTER'); process.exit(2); }
} else if (autoload) {
  if (!options.run) { console.error('--run <runId> is required'); process.exit(2); }
  if (options.file || options['mcp-run'] || options.coder) { console.error('--file, --mcp-run and --coder are not used by AUTOLOAD'); process.exit(2); }
} else if (codes) {
  if (!options['mcp-run'] || !options.codebook || !options.coder) { console.error('CODES needs --mcp-run <file>, --codebook <json> and --coder <name>'); process.exit(2); }
  if (options.run || options.file || options.artifacts) { console.error('--run, --file and --artifacts are not used by CODES'); process.exit(2); }
} else if (options['mcp-run'] || options.codebook || options.coder) { console.error('--mcp-run and --coder are only for CODES, --codebook for CODES and LABELS'); process.exit(2); }
else if (!options.run) { console.error('--run <runId> is required'); process.exit(2); }
if (options.file && (source === 'S05' || source === 'S06')) { console.error(`--file is not supported for ${source}`); process.exit(2); }
const artifactRoot = options.artifacts ?? process.env.TDN_ARTIFACT_ROOT;
if (!artifactRoot && !options.file && !codes && !snapshotOnly && !((labels || filter) && options['dry-run'])) { console.error('--artifacts <dir> or TDN_ARTIFACT_ROOT is required'); process.exit(2); }
const keyed = source === 'S02b' || source === 'S07' || source === 'S14';
if (options['privacy-file'] && !keyed && !autoload) { console.error('--privacy-file is only for S02b, S07, S14 and AUTOLOAD'); process.exit(2); }
// S02b, S07, S14: the writer key is required before any input is read; the salt stays inside the privacy closure and is never printed.
let privacy;
if (keyed) {
  const file = options['privacy-file'] ?? process.env[TIKTOK_COMMENTS_PRIVACY_FILE_ENV];
  if (!file) { console.error(`RAW_DB_PRIVACY_KEY_MISSING: ${source} needs --privacy-file or ${TIKTOK_COMMENTS_PRIVACY_FILE_ENV}`); process.exit(1); }
  try { privacy = readTikTokCommentPrivacyFile(file); }
  catch (error) { console.error(`RAW_DB_PRIVACY_KEY_INVALID: ${error instanceof Error ? error.message : 'unreadable key file'}`); process.exit(1); }
}
// AUTOLOAD: a missing key skips the keyed sources; an unreadable one fails them. The salt is never printed.
let autoloadPrivacy: ReturnType<typeof readTikTokCommentPrivacyFile> | { error: string } | undefined;
if (autoload) {
  const file = options['privacy-file'] ?? process.env[TIKTOK_COMMENTS_PRIVACY_FILE_ENV];
  if (file) {
    try { autoloadPrivacy = readTikTokCommentPrivacyFile(file); }
    catch (error) { autoloadPrivacy = { error: error instanceof Error ? error.message : 'unreadable key file' }; }
  }
}

let db: BetterSqlite3.Database | undefined;
try {
  // Loading requires an existing, migrated app DB. Opening it must not commit migrations before --dry-run.
  const dbPath = path.resolve(options.db ?? process.env.TDN_WORKSPACE_DB ?? path.join('runtime', 'tdn-growth-os.sqlite'));
  db = new BetterSqlite3(dbPath, { fileMustExist: true });
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.defaultSafeIntegers(true);
  // A file load reads no artifact; the store is only a placeholder then.
  const artifacts = new ContentAddressedArtifactStore(path.resolve(artifactRoot ?? 'runtime/artifacts'));
  const input = options.file ? { file: path.resolve(options.file), runId: options.run! } : { runId: options.run! };
  const captureRoot = path.resolve(options.captures ?? (process.env.TDN_METRIC_CAPTURE_DIR || path.join(path.dirname(dbPath), 'metric-captures')));
  if (snapshotOnly) console.log(JSON.stringify(await publishAppDbSnapshot(db, defaultSnapshotDir(dbPath))));
  else {
    // Dry run: the loader's own transaction nests as a savepoint inside this one, which is then rolled back.
    if (options['dry-run']) db.exec('BEGIN');
    try {
      const result = autoload ? await autoloadRunToDbV1(db, artifacts, options.run!, { origin: 'CLI', privacy: autoloadPrivacy,
          jev: options['dry-run'] ? null : jevClient(false), captureRoot, codebookFile: options.codebook && path.resolve(options.codebook), dryRun: options['dry-run'],
          reviewFilter: reviewFilterEnabled(process.env) })
        : filter ? await filterReviewsInDbV1(db, artifacts, options['dry-run'] ? null : jevClient(false), { runId: options.run, maxCalls, dryRun: options['dry-run'] })
        : labels ? await labelReviewsInDbV1(db, artifacts, options['dry-run'] ? null : jevClient(true),
          { runId: options.run, maxCalls, dryRun: options['dry-run'], codebookFile: options.codebook && path.resolve(options.codebook), captureRoot })
        : codes ? await loadReviewCodesToDbV1(db, { mcpRunFile: path.resolve(options['mcp-run']!), codebookFile: path.resolve(options.codebook!), coder: options.coder!,
          dryRun: options['dry-run'] })
        : source === 'S05' ? await loadShopeeReviewsToDbV1(db, artifacts, { runId: options.run! })
        : source === 'S06' ? await loadTikTokShopReviewsToDbV1(db, artifacts, { runId: options.run! })
        : source === 'S07' ? await loadTikTokCommentsToDbV1(db, artifacts, input, privacy)
        : source === 'S02b' ? await loadKalodataVideosToDbV1(db, artifacts, input, privacy)
        : source === 'S14' ? await loadVideoReadingsToDbV1(db, artifacts, input, privacy)
        : source === 'S19b' ? await loadSearchSuggestionsToDbV1(db, artifacts, input)
        : await loadAiOverviewToDbV1(db, artifacts, input);
      // Option A: a real S05 load labels the run's reviews after its transaction committed. Labelling never fails the load.
      if (source === 'S05' && !options['dry-run']) {
        const client = options['no-label'] ? null : jevClient(false);
        let labelling: unknown = options['no-label'] ? 'SKIPPED_NO_LABEL' : client ? null : 'SKIPPED_JEV_DISABLED';
        if (client) {
          try { labelling = await labelReviewsInDbV1(db, artifacts, client, { runId: options.run!, maxCalls, captureRoot }); }
          catch (error) { labelling = error instanceof LabelsBusyError ? 'SKIPPED_BUSY' : { error: error instanceof Error ? error.message : String(error) }; }
        }
        console.log(JSON.stringify({ ...result, labelling, snapshot: await publishSnapshot(db, dbPath) }));
      } else if ((labels || filter || codes || autoload) && !options['dry-run']) console.log(JSON.stringify({ ...result, snapshot: await publishSnapshot(db, dbPath) }));
      else console.log(JSON.stringify(result));
    } finally {
      if (options['dry-run']) db.exec('ROLLBACK');
    }
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  db?.close();
}

/** Publishes the Insight MCP snapshot of the app DB; a failure is returned, never thrown. */
async function publishSnapshot(appDb: BetterSqlite3.Database, dbPath: string) {
  return tryPublishAppDbSnapshot(appDb, defaultSnapshotDir(dbPath));
}

/** The app Jev client, or null when Jev is disabled or not configured (required: the LABELS error RAW_DB_LABELS_JEV_DISABLED). */
function jevClient(required: boolean): TypesafeJevClient | null {
  try {
    const configuration = typesafeJevConfigurationFromEnvironment(process.env);
    if (configuration.enabled) return new TypesafeJevClient(configuration);
  } catch { /* a missing or malformed key counts as disabled; its text is never printed */ }
  if (required) throw new Error('RAW_DB_LABELS_JEV_DISABLED: set TDN_RESEARCH_JEV_ENABLED=true and TYPESAFE_API_KEY, or use --dry-run');
  return null;
}

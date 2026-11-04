import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { TypesafeJevClient, type TypesafeJevConfiguration } from '../../platform/ai/typesafe-jev-client.js';
import { readTikTokCommentPrivacyFile } from '../../platform/collectors/apify-tiktok-comments-free.js';
import { SourcePackageService } from '../foundation/source-package-service.js';
import { p9PackagePrefix } from '../analysis/research-automation/p9-source-intake.js';
import { defaultSnapshotDir, tryPublishAppDbSnapshot } from './app-db-snapshot.js';
import { assertRun, loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from './google-search-loader.js';
import { loadKalodataVideosToDbV1 } from './kalodata-video-loader.js';
import { LabelsBusyError } from './labels-lock.js';
import { filterReviewsInDbV1, type ReviewFilterResult } from './review-filter.js';
import { labelReviewsInDbV1 } from './review-labeller.js';
import { loadShopeeReviewsToDbV1 } from './shopee-reviews-loader.js';
import { loadTikTokCommentsToDbV1, type TikTokCommentsLoadPrivacy } from './tiktok-comments-loader.js';
import { loadTikTokShopReviewsToDbV1 } from './tiktok-shop-reviews-loader.js';
import { loadVideoReadingsToDbV1 } from './video-reading-loader.js';

/** The env flag of the automatic load after each research run's collection (owner F368, F389). Only `true` turns it on. */
export const RAW_DB_AUTOLOAD_ENV = 'TDN_RAW_DB_AUTOLOAD_ENABLED';
/** Load order (KHUON-CSDL §5): reviews first, S02b before S14 (a top-selling video needs its S02b video row). */
export const AUTOLOAD_SOURCES = ['S05', 'S06', 'S07', 'S02b', 'S14', 'S19b', 'S29'] as const;
export type AutoloadSource = (typeof AUTOLOAD_SOURCES)[number];
const KEYED = new Set<AutoloadSource>(['S07', 'S02b', 'S14']);
// Capture-based sources: the run has the source when it stored one of these captures.
const CAPTURE_OPERATIONS: Partial<Record<AutoloadSource, [string, string][]>> = {
  S06: [['kalodata', 'kalodata.product.comment.insight']],
  S02b: [['kalodata', 'kalodata.video.rank']],
  S14: [['video-watch', 'videowatch.generate']],
  S19b: [['google-suggest', 'google.suggest']],
  S29: [['serpapi', 'serpapi.google.search'], ['serpapi', 'serpapi.google_ai_overview']],
};

export type AutoloadSourceResult =
  | { status: 'LOADED'; result: unknown }
  | { status: 'SKIPPED_NO_CAPTURES' }
  | { status: 'SKIPPED_NO_PRIVACY_KEY' }
  | { status: 'FAILED'; error: string; message: string };
export type AutoloadLabellingResult =
  | { status: 'LABELLED' | 'PLANNED'; result: unknown }
  | { status: 'SKIPPED_JEV_DISABLED' }
  | { status: 'LABELS_BUSY' }
  | { status: 'FAILED'; error: string; message: string };
export type AutoloadFilteringResult =
  | { status: 'FILTERED' | 'PLANNED'; result: ReviewFilterResult }
  | { status: 'SKIPPED_FLAG_OFF' }
  | { status: 'SKIPPED_JEV_DISABLED' }
  | { status: 'LABELS_BUSY' }
  | { status: 'FAILED'; error: string; message: string };
export interface AutoloadResult {
  /** The raw_db_autoload row; null on a dry run (nothing is recorded). */
  attemptId: number | null;
  runId: string; origin: 'APP' | 'CLI'; startedAt: string; finishedAt: string;
  sources: Record<AutoloadSource, AutoloadSourceResult>;
  filtering: AutoloadFilteringResult;
  labelling: AutoloadLabellingResult;
}
export interface AutoloadOptions {
  origin: 'APP' | 'CLI';
  /** The TikTok comment privacy key (S07, S02b, S14); undefined = not configured; `{ error }` = configured but unreadable. */
  privacy: TikTokCommentsLoadPrivacy | undefined | { error: string };
  /** Null when Jev is disabled or not configured. */
  jev: TypesafeJevClient | null;
  /** Root of the stored `<runId>/scope.json` records (labelling block choice). */
  captureRoot: string;
  codebookFile?: string | undefined;
  /** The shadow review filter (TDN_RAW_DB_REVIEW_FILTER_ENABLED): runs after the loads, before labelling. */
  reviewFilter?: boolean | undefined;
  /** Plan only: loads run inside the caller's rolled-back transaction, labelling plans without Jev, no row is recorded. */
  dryRun?: boolean | undefined;
  now?: () => Date;
}

/**
 * Loads one research run's stored data into db-v1 in the fixed order S05, S06, S07, S02b, S14, S19b, S29 (each only when
 * the run has that source), then runs the shadow review filter when options.reviewFilter is on, then labels the run's eligible product reviews (S05, S06) with Jev, and records the attempt
 * as one insert-only `raw_db_autoload` row. Uses the existing run loaders (stored captures only, no file). One source
 * failing never stops the next; a missing privacy key skips only S07, S02b and S14. Throws only when the run does not
 * exist or the row cannot be written; never touches the run, its steps or its reports.
 */
export async function autoloadRunToDbV1(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, options: AutoloadOptions): Promise<AutoloadResult> {
  const now = options.now ?? (() => new Date());
  assertRun(db, runId);
  const startedAt = now().toISOString();
  const sources = {} as Record<AutoloadSource, AutoloadSourceResult>;
  for (const source of AUTOLOAD_SOURCES) sources[source] = await loadSource(db, artifacts, runId, source, options);
  const filtering = await filter(db, artifacts, runId, options);
  const labelling = await label(db, artifacts, runId, options);
  const finishedAt = now().toISOString();
  let attemptId: number | null = null;
  if (!options.dryRun) {
    const json = (value: unknown) => JSON.stringify(value);
    attemptId = Number(db.prepare(`INSERT INTO raw_db_autoload(run_id,origin,started_at,finished_at,s05,s06,s07,s02b,s14,s19b,s29,labelling,filtering)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(runId, options.origin, startedAt, finishedAt, json(sources.S05), json(sources.S06), json(sources.S07),
      json(sources.S02b), json(sources.S14), json(sources.S19b), json(sources.S29), json(labelling), json(filtering)).lastInsertRowid);
  }
  return { attemptId, runId, origin: options.origin, startedAt, finishedAt, sources, filtering, labelling };
}

async function loadSource(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, source: AutoloadSource,
  options: AutoloadOptions): Promise<AutoloadSourceResult> {
  try {
    if (!runHasSource(db, artifacts, runId, source)) return { status: 'SKIPPED_NO_CAPTURES' };
    let privacy: TikTokCommentsLoadPrivacy | undefined;
    if (KEYED.has(source)) {
      if (options.privacy === undefined) return { status: 'SKIPPED_NO_PRIVACY_KEY' };
      if ('error' in options.privacy) return { status: 'FAILED', error: 'RAW_DB_PRIVACY_KEY_INVALID', message: options.privacy.error };
      privacy = options.privacy;
    }
    const input = { runId };
    const result = source === 'S05' ? await loadShopeeReviewsToDbV1(db, artifacts, input)
      : source === 'S06' ? await loadTikTokShopReviewsToDbV1(db, artifacts, input)
      : source === 'S07' ? await loadTikTokCommentsToDbV1(db, artifacts, input, privacy)
      : source === 'S02b' ? await loadKalodataVideosToDbV1(db, artifacts, input, privacy)
      : source === 'S14' ? await loadVideoReadingsToDbV1(db, artifacts, input, privacy)
      : source === 'S19b' ? await loadSearchSuggestionsToDbV1(db, artifacts, input)
      : await loadAiOverviewToDbV1(db, artifacts, input);
    return { status: 'LOADED', result };
  } catch (error) {
    const failed = failure(error);
    // A loader that finds nothing of its own to read (for example captures without a stored S14 reading) is a skip.
    return failed.error === 'RAW_DB_RUN_NOT_FOUND' ? { status: 'SKIPPED_NO_CAPTURES' } : { status: 'FAILED', ...failed };
  }
}

/** The shadow filter pass of the run; a failure or a busy lock never stops labelling. */
async function filter(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, options: AutoloadOptions): Promise<AutoloadFilteringResult> {
  if (!options.reviewFilter) return { status: 'SKIPPED_FLAG_OFF' };
  if (!options.dryRun && !options.jev) return { status: 'SKIPPED_JEV_DISABLED' };
  try {
    const result = await filterReviewsInDbV1(db, options.dryRun ? null : artifacts, options.dryRun ? null : options.jev, { runId, dryRun: options.dryRun });
    if (result.failed) return { status: 'FAILED', error: result.failed.code, message: `review ${result.failed.reviewKey}; ${result.notAssessed} reviews not assessed` };
    return { status: options.dryRun ? 'PLANNED' : 'FILTERED', result };
  } catch (error) {
    if (error instanceof LabelsBusyError) return { status: 'LABELS_BUSY' };
    return { status: 'FAILED', ...failure(error) };
  }
}

async function label(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, options: AutoloadOptions): Promise<AutoloadLabellingResult> {
  if (!options.dryRun && !options.jev) return { status: 'SKIPPED_JEV_DISABLED' };
  try {
    // The cap is the codebook's limits.maxCallsPerRun; the crash-safe labelling lock is taken by the labeller.
    const result = await labelReviewsInDbV1(db, options.dryRun ? null : artifacts, options.dryRun ? null : options.jev,
      { runId, dryRun: options.dryRun, codebookFile: options.codebookFile, captureRoot: options.captureRoot });
    return { status: options.dryRun ? 'PLANNED' : 'LABELLED', result };
  } catch (error) {
    if (error instanceof LabelsBusyError) return { status: 'LABELS_BUSY' };
    return { status: 'FAILED', ...failure(error) };
  }
}

function runHasSource(db: Database.Database, artifacts: ContentAddressedArtifactStore, runId: string, source: AutoloadSource): boolean {
  if (source === 'S05') return Boolean(db.prepare('SELECT 1 FROM foundation_shopee_collections WHERE run_key=?').get(`auto-${runId}`));
  if (source === 'S07') return new SourcePackageService({ db, artifactStore: artifacts }).findAutomationAttachmentPackagesByKeyPrefix(p9PackagePrefix(runId, 'comments')).length > 0;
  const exists = db.prepare('SELECT 1 FROM analysis_research_automation_captures WHERE run_id=? AND provider=? AND operation=? LIMIT 1');
  return CAPTURE_OPERATIONS[source]!.some(([provider, operation]) => exists.get(runId, provider, operation));
}

/** The leading error code of a loader message (`RAW_DB_…: detail`), and the message cut to 500 characters. */
function failure(error: unknown): { error: string; message: string } {
  const message = error instanceof Error ? error.message : String(error);
  const code = /^([A-Z][A-Z0-9_]{2,63}):/.exec(message)?.[1] ?? 'RAW_DB_AUTOLOAD_SOURCE_FAILED';
  return { error: code, message: message.slice(0, 500) };
}

export interface RawDbAutoloaderOptions {
  databasePath: string;
  artifactRoot: string;
  captureRoot: string;
  /** TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE; read at each attempt, as the CLI does. */
  privacyFile?: string | undefined;
  /** The app's Jev configuration when enabled. */
  jev?: TypesafeJevConfiguration | undefined;
  /** reviewFilterEnabled(process.env): runs the shadow review filter in each attempt. */
  reviewFilter?: boolean | undefined;
  /** Called with every attempt result or failure; for logs. Never sees a key. */
  onResult?: (outcome: { runId: string; result?: AutoloadResult; error?: string }) => void;
}

/**
 * The app side of the automatic load: `schedule(runId)` queues one attempt; attempts run one at a time on their own DB
 * connection, after the caller's transaction, and never throw. After each attempt the app DB snapshot is published.
 */
export class RawDbAutoloader {
  readonly #options: RawDbAutoloaderOptions;
  #tail: Promise<void> = Promise.resolve();
  #closing = false;

  constructor(options: RawDbAutoloaderOptions) { this.#options = options; }

  schedule(runId: string): void {
    if (this.#closing) return;
    this.#tail = this.#tail.then(() => this.#attempt(runId)).catch(() => { /* #attempt reports its own failures */ });
  }

  /** Waits for the attempt in progress and the queued ones; nothing new is accepted. */
  async close(): Promise<void> {
    this.#closing = true;
    await this.#tail;
  }

  async #attempt(runId: string): Promise<void> {
    let db: BetterSqlite3.Database | undefined;
    try {
      db = new BetterSqlite3(this.#options.databasePath, { fileMustExist: true });
      db.pragma('foreign_keys = ON'); db.pragma('busy_timeout = 5000'); db.defaultSafeIntegers(true);
      const artifacts = new ContentAddressedArtifactStore(this.#options.artifactRoot);
      let privacy: AutoloadOptions['privacy'];
      if (this.#options.privacyFile) {
        try { privacy = readTikTokCommentPrivacyFile(this.#options.privacyFile); }
        catch (error) { privacy = { error: error instanceof Error ? error.message : 'unreadable key file' }; }
      }
      let jev: TypesafeJevClient | null = null;
      try { if (this.#options.jev?.enabled) jev = new TypesafeJevClient(this.#options.jev); } catch { jev = null; }
      const result = await autoloadRunToDbV1(db, artifacts, runId, { origin: 'APP', privacy, jev, captureRoot: this.#options.captureRoot,
        reviewFilter: this.#options.reviewFilter });
      await tryPublishAppDbSnapshot(db, defaultSnapshotDir(this.#options.databasePath));
      this.#report({ runId, result });
    } catch (error) {
      this.#report({ runId, error: failure(error).error });
    } finally {
      try { db?.close(); } catch { /* the attempt is over either way */ }
    }
  }

  #report(outcome: { runId: string; result?: AutoloadResult; error?: string }): void {
    try { this.#options.onResult?.(outcome); } catch { /* a logger never fails the attempt */ }
  }
}

/** The automatic load is on only when TDN_RAW_DB_AUTOLOAD_ENABLED is exactly `true`. */
export function rawDbAutoloadEnabled(environment: NodeJS.ProcessEnv): boolean {
  return environment[RAW_DB_AUTOLOAD_ENV] === 'true';
}

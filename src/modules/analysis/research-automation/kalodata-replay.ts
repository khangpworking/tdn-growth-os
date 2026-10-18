// Test-instance only: answers sales-data (Kalodata) requests from the raw captures of an
// earlier run, so a full Market run costs zero provider points. Off unless
// TDN_RESEARCH_KALODATA_REPLAY_SOURCE_RUN_ID is set; never set in the production deploy.
//
// Fail closed: a Kalodata-host request is NEVER forwarded to the inner transport. A request
// without a matching stored capture gets a synthetic `success:false` answer with code
// KALODATA_REPLAY_MISS. Request bodies and keys are never logged.
import type BetterSqlite3 from 'better-sqlite3';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { isRecord, sha256, type ProviderTransport } from './provider-common.js';
import { ResearchAutomationValidationError } from './model.js';

export const KALODATA_REPLAY_ENV = 'TDN_RESEARCH_KALODATA_REPLAY_SOURCE_RUN_ID';
/** Step and limitation code when a replayed request has no stored capture. */
export const KALODATA_REPLAY_MISS = 'KALODATA_REPLAY_MISS';
/** Start refused: keyword or period differ from the source run. */
export const KALODATA_REPLAY_SCOPE_MISMATCH = 'KALODATA_REPLAY_SCOPE_MISMATCH';
/** Startup refused: production database/port, or unusable source run. */
export const KALODATA_REPLAY_REFUSED = 'KALODATA_REPLAY_REFUSED';
/** Usage operation label for a replayed provider call (cost KNOWN 0 CREDITS, no live request). */
export const KALODATA_REPLAY_USAGE_OPERATION = 'provider.replay';
/** Visible owner-facing notice (names no provider). */
export const KALODATA_REPLAY_NOTICE_VI = 'Bản chạy thử – dữ liệu bán hàng phát lại từ lần chạy trước, không phải báo cáo thật';
/** Placeholder credential in replay mode: the real key is never handed to the replay provider. */
export const KALODATA_REPLAY_PLACEHOLDER_KEY = 'replay-mode-no-live-key';

const PRODUCTION_STATE_SEGMENT = 'operator-dev-8787-ab099f3';
const PRODUCTION_PORT = 8787;
const KALODATA_HOST = 'www.kalodata.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export interface KalodataReplaySource {
  readonly sourceRunId: string;
  readonly keyword: string;
  readonly period: { readonly startDate: string; readonly endDate: string };
}

export class KalodataReplayScopeMismatchError extends ResearchAutomationValidationError {
  readonly code = KALODATA_REPLAY_SCOPE_MISMATCH;
}

export class KalodataReplayRefusedError extends TypeError {
  readonly code = KALODATA_REPLAY_REFUSED;
}

/** Reads the flag. Undefined/empty = replay off. Anything else must be a run UUID. */
export function kalodataReplaySourceRunIdFromEnvironment(environment: NodeJS.ProcessEnv): string | undefined {
  const value = environment[KALODATA_REPLAY_ENV];
  if (value === undefined || value === '') return undefined;
  if (!UUID.test(value)) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: ${KALODATA_REPLAY_ENV} must be a run UUID`);
  return value;
}

/** Replay mode never runs against the production state directory or port. */
export function assertKalodataReplayNotProduction(input: { readonly databasePath: string; readonly artifactRoot: string; readonly port: number }): void {
  const unsafe = (value: string) => value.replace(/\\/g, '/').split('/').includes(PRODUCTION_STATE_SEGMENT);
  if (input.port === PRODUCTION_PORT) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: replay mode refuses port ${PRODUCTION_PORT}`);
  if (unsafe(input.databasePath)) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: replay mode refuses the production database path`);
  if (unsafe(input.artifactRoot)) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: replay mode refuses the production artifact root`);
}

/** Synchronous startup check: the source run exists and has stored sales-data captures. */
export function readKalodataReplaySource(db: BetterSqlite3.Database, sourceRunId: string): KalodataReplaySource {
  const run = db.prepare('SELECT keyword, period_start periodStart, period_end periodEnd FROM analysis_research_automation_runs WHERE run_id=?')
    .get(sourceRunId) as { keyword: string; periodStart: string; periodEnd: string } | undefined;
  if (!run) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: source run not found`);
  const count = db.prepare(`SELECT COUNT(*) n FROM analysis_research_automation_captures WHERE run_id=? AND provider='kalodata'`)
    .get(sourceRunId) as { n: number | bigint };
  if (Number(count.n) < 1) throw new KalodataReplayRefusedError(`${KALODATA_REPLAY_REFUSED}: source run has no stored sales-data captures`);
  return { sourceRunId, keyword: run.keyword, period: { startDate: run.periodStart, endDate: run.periodEnd } };
}

/** Throws KALODATA_REPLAY_SCOPE_MISMATCH unless keyword and period equal the source run. */
export function assertKalodataReplayScope(source: KalodataReplaySource, keyword: string, period: { readonly startDate: string; readonly endDate: string }): void {
  const norm = (value: string) => value.normalize('NFC').trim();
  if (norm(keyword) !== norm(source.keyword) || period.startDate !== source.period.startDate || period.endDate !== source.period.endDate) {
    throw new KalodataReplayScopeMismatchError(`${KALODATA_REPLAY_SCOPE_MISMATCH}: replay test instance only accepts the source run keyword and period (${source.period.startDate}..${source.period.endDate})`);
  }
}

/** Adds the visible test notice right after <body ...>; prepends when no body tag exists. */
export function withKalodataReplayNotice(html: Buffer | string): Buffer {
  const text = Buffer.isBuffer(html) ? html.toString('utf8') : html;
  const notice = `<div role="note" data-test-replay="1" style="background:#fff3cd;border:2px solid #b45309;color:#7c2d12;padding:12px 16px;margin:0 0 16px;font-weight:700;font-size:16px">${KALODATA_REPLAY_NOTICE_VI}</div>`;
  const match = /<body\b[^>]*>/i.exec(text);
  const out = match ? text.slice(0, match.index + match[0].length) + notice + text.slice(match.index + match[0].length) : notice + text;
  return Buffer.from(out, 'utf8');
}

// ---- capture index ----

interface StoredAnswer { readonly status: number; readonly bytes: Buffer }

export interface KalodataReplayIndex {
  readonly balance: StoredAnswer | null;
  /** canonical rank identity (body without date_range) -> stored answer + stored date_range */
  readonly rank: ReadonlyMap<string, StoredAnswer & { readonly dateRange: string | null }>;
  /** canonical detail body -> stored answer */
  readonly detail: ReadonlyMap<string, StoredAnswer>;
  readonly captures: number;
}

export interface ReplayCaptureEnvelope {
  readonly operation?: unknown; readonly outcome?: unknown; readonly httpStatus?: unknown;
  readonly requestParameters?: unknown; readonly responseBytesBase64?: unknown; readonly responseSha256?: unknown;
}

/** Builds the index from stored capture envelopes (in capture order). Only OK 2xx captures whose bytes match their sha are kept. */
export function buildKalodataReplayIndex(envelopes: readonly ReplayCaptureEnvelope[]): KalodataReplayIndex {
  let balance: (StoredAnswer & { remain: number }) | null = null;
  const rank = new Map<string, StoredAnswer & { dateRange: string | null }>();
  const detail = new Map<string, StoredAnswer>();
  let captures = 0;
  for (const envelope of envelopes) {
    if (envelope.outcome !== 'OK' || typeof envelope.httpStatus !== 'number' || envelope.httpStatus < 200 || envelope.httpStatus > 299) continue;
    if (typeof envelope.responseBytesBase64 !== 'string') continue;
    const bytes = Buffer.from(envelope.responseBytesBase64, 'base64');
    if (typeof envelope.responseSha256 !== 'string' || sha256(bytes) !== envelope.responseSha256) continue;
    const answer = { status: envelope.httpStatus, bytes };
    const params = isRecord(envelope.requestParameters) ? envelope.requestParameters : {};
    if (envelope.operation === 'kalodata.credit.balance') {
      const remain = balanceRemain(bytes);
      if (remain === null) continue;
      // Highest stored balance: replayed before and after a phase, so it reads as enough credit and 0 consumed.
      if (!balance || remain > balance.remain) balance = { ...answer, remain };
    } else if (envelope.operation === 'kalodata.product.rank') {
      const { date_range: dateRange, ...identity } = params;
      rank.set(canonicalJson(identity), { ...answer, dateRange: typeof dateRange === 'string' ? dateRange : null });
    } else if (envelope.operation === 'kalodata.product.detail') {
      detail.set(canonicalJson(params), answer);
    } else continue;
    captures++;
  }
  return { balance: balance ? { status: balance.status, bytes: balance.bytes } : null, rank, detail, captures };
}

function balanceRemain(bytes: Buffer): number | null {
  try {
    const value: unknown = JSON.parse(bytes.toString('utf8'));
    if (!isRecord(value) || value.success !== true || !isRecord(value.data)) return null;
    const remain = value.data.totalRemain;
    return typeof remain === 'number' && Number.isFinite(remain) && remain >= 0 ? remain : null;
  } catch { return null; }
}

/** Loads every stored sales-data capture envelope of the source run, in step/ordinal order. */
export async function loadKalodataReplayIndex(db: BetterSqlite3.Database, artifacts: { read(sha256: string): Promise<Buffer> }, sourceRunId: string): Promise<KalodataReplayIndex> {
  const rows = db.prepare(`SELECT artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND provider='kalodata'
    ORDER BY CASE step_id WHEN 'QUICK_SEARCH' THEN 0 WHEN 'COLLECTION' THEN 1 ELSE 2 END, ordinal`).all(sourceRunId) as { sha: string }[];
  const envelopes: ReplayCaptureEnvelope[] = [];
  for (const row of rows) {
    try {
      const value: unknown = JSON.parse((await artifacts.read(row.sha)).toString('utf8'));
      if (isRecord(value)) envelopes.push(value);
    } catch { /* an unreadable capture is simply not replayable: requests for it miss */ }
  }
  return buildKalodataReplayIndex(envelopes);
}

// ---- transport ----

export interface KalodataReplayStats { replayed: number; missed: number; passedThrough: number }

/**
 * Wraps `inner`. Requests to the sales-data host are answered from `index` and never forwarded;
 * every other host passes through untouched.
 */
export function createKalodataReplayTransport(inner: ProviderTransport, index: () => Promise<KalodataReplayIndex>,
  stats: KalodataReplayStats = { replayed: 0, missed: 0, passedThrough: 0 }): ProviderTransport & { readonly stats: KalodataReplayStats } {
  // Quick search asks for a recent window relative to "now"; the stored rank used the source run's window.
  // Detail requests for that new window are mapped to the stored one (exact match is tried first).
  const windowRemap = new Map<string, string>();
  let loaded: Promise<KalodataReplayIndex> | undefined;
  const miss = () => { stats.missed++; return answer(200, Buffer.from(JSON.stringify({ success: false, code: KALODATA_REPLAY_MISS, message: 'replay miss' }), 'utf8')); };
  const fetchImpl = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]): Promise<Response> => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    // Any host of the sales-data domain is replay-only; an unknown one simply misses (fail closed).
    const salesDomain = url.hostname === 'kalodata.com' || url.hostname.endsWith('.kalodata.com');
    if (!salesDomain) { stats.passedThrough++; return inner.fetch(input, init); }
    if (url.hostname !== KALODATA_HOST) return miss();
    init?.signal?.throwIfAborted();
    let table: KalodataReplayIndex;
    try { table = await (loaded ??= index()); } catch { return miss(); }
    const method = (init?.method ?? 'GET').toUpperCase();
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string') {
      try { const parsed: unknown = JSON.parse(init.body); if (!isRecord(parsed)) return miss(); body = parsed; } catch { return miss(); }
    } else if (init?.body !== undefined && init.body !== null) return miss();
    let found: StoredAnswer | undefined;
    if (method === 'GET' && url.pathname === '/openapi/v1/credit/balance') found = table.balance ?? undefined;
    else if (method === 'POST' && url.pathname === '/openapi/v1/tiktok/product/rank') {
      const { date_range: requested, ...identity } = body;
      const stored = table.rank.get(canonicalJson(identity));
      if (stored) {
        found = stored;
        if (typeof requested === 'string' && stored.dateRange && requested !== stored.dateRange) windowRemap.set(requested, stored.dateRange);
      }
    } else if (method === 'POST' && url.pathname === '/openapi/v1/tiktok/product/detail') {
      found = table.detail.get(canonicalJson(body));
      const mapped = typeof body.date_range === 'string' ? windowRemap.get(body.date_range) : undefined;
      if (!found && mapped) found = table.detail.get(canonicalJson({ ...body, date_range: mapped }));
    }
    if (!found) return miss();
    stats.replayed++;
    return answer(found.status, found.bytes);
  };
  return { fetch: fetchImpl as typeof fetch, sleep: inner.sleep, now: inner.now, stats };
}

function answer(status: number, bytes: Buffer): Response {
  return new Response(new Uint8Array(bytes), { status, headers: { 'Content-Type': 'application/json' } });
}

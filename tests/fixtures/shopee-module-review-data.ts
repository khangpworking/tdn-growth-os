/**
 * Synthetic native evidence for the Shopee module review-data reader, export and DB import.
 *
 * Files are written in the shapes the real collectors write: canonical JSON bytes,
 * mode 0600 where the native reader checks permissions, M1/M2 gates bound to the
 * exact folder/selection hashes, and legacy/custom M3 proofs. No provider, browser,
 * database or network is involved.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { samplingDigest } from '../../src/modules/foundation/shopee-review-sampling.js';
import { hashFolder } from '../../scripts/module-pick.js';

export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

export interface ReviewLink { shopId: string; itemId: string; url: string }
export interface NativeRow {
  reviewId: string | null; shopId: string; itemId: string; postedAtLocal: string | null;
  createdAt: string | null; variation: string | null; ratingStar: number | null;
  ratingState: 'VALID' | 'MISSING' | 'INVALID'; comment: string | null; attributes: string[];
  contentType: 'COMMENT' | 'ATTRIBUTES_ONLY' | 'UNRESOLVED'; sourcePage: number | null;
  sourceUrl: string; sourceRow: number; admissionReasons: string[];
}

export const LINKS: readonly ReviewLink[] = [
  { shopId: '201', itemId: '101', url: 'https://shopee.vn/product/201/101' },
  { shopId: '202', itemId: '102', url: 'https://shopee.vn/product/202/102' },
];

export function moduleRow(link: ReviewLink, reviewId: string | null, overrides: Partial<NativeRow> = {}): NativeRow {
  return {
    reviewId, shopId: link.shopId, itemId: link.itemId, postedAtLocal: '03-11-2026 10:04',
    createdAt: '2026-11-03T03:04:00+07:00', variation: '  Synthetic variant\n', ratingStar: 4,
    ratingState: 'VALID', comment: 'Synthetic comment', attributes: ['Synthetic material', 'Synthetic size'],
    contentType: 'COMMENT', sourcePage: 2, sourceUrl: link.url, sourceRow: 0, admissionReasons: [],
    ...overrides,
  };
}

export async function writeCanonical(file: string, value: unknown, mode?: number): Promise<Buffer> {
  const bytes = Buffer.from(canonicalJson(value));
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, bytes, mode === undefined ? {} : { mode });
  if (mode !== undefined) await fs.chmod(file, mode);
  return bytes;
}

export async function rewriteCanonical(file: string, edit: (value: any) => void): Promise<void> {
  const value = JSON.parse(await fs.readFile(file, 'utf8'));
  edit(value);
  await writeCanonical(file, value, 0o600);
}

function handoff(module: string, runId: string, verdict: 'PASS' | 'FAIL', inputSha256: string | null,
  outputSha256: string | null, errorCode: string | null) {
  const checks: { id: string; ok: boolean; got: unknown }[] = [
    { id: 'synthetic_native_proof', ok: verdict === 'PASS', got: verdict === 'PASS' },
  ];
  return {
    format: 'handoff-v1', module, runId, skillVersion: 'synthetic-native-m3-v1', verdict,
    inputSha256, outputSha256, checks,
    errorCode, next: verdict === 'PASS' && module !== 'M3' ? { M1: 'M2', M2: 'M3' }[module] : null,
  };
}

export interface ModuleRun {
  readonly runDir: string;
  readonly runId: string;
  readonly links: readonly ReviewLink[];
  readonly requestSha256: string;
  readonly m1Sha256: string;
  readonly selectionSha256: string;
  readonly rawNameRows: readonly Record<string, unknown>[];
}

/** Request + numeric M1 raw source + passing M1/M2 gates + auto M2 selection. */
export async function createModuleRun(base: string, options: {
  runId: string;
  links?: readonly ReviewLink[];
  rawNameRows?: readonly Record<string, unknown>[];
}): Promise<ModuleRun> {
  const runDir = path.join(base, options.runId);
  const links = options.links ?? LINKS;
  const request = {
    format: 'request-v1', preset: { keywords: ['kem chống nắng'] },
    windows: [{ id: '30d', period: { startDate: '2026-10-01', endDate: '2026-10-31' } }],
    reviewCapPerLink: 300,
  };
  const requestBytes = await writeCanonical(path.join(runDir, 'request.json'), request);
  const nameRows = options.rawNameRows ?? links.map((link, index) => ({
    product_base_id: `1__${link.itemId}__${link.shopId}`, product_name: `Synthetic jar ${index + 1}`,
    revenue_custom: 1000 - index, order_custom: 10 - index,
  }));
  await writeCanonical(path.join(runDir, 'm1', 'manifest.json'), {
    windows: [{ window: '30d', path: '30d/manifest.json' }],
  });
  await writeCanonical(path.join(runDir, 'm1', '30d', 'manifest.json'), { format: 'synthetic-window-manifest-v1' });
  await writeCanonical(path.join(runDir, 'm1', '30d', 'raw-responses.json'), {
    responses: [{ body: { data: nameRows } }],
  });
  const m1Sha256 = await hashFolder(runDir, 'm1');
  await writeCanonical(path.join(runDir, 'gates', 'm1.json'),
    handoff('M1', options.runId, 'PASS', sha256(requestBytes), m1Sha256, null));
  const selection = {
    format: 'selection-v1', runId: options.runId, source: 'auto', pickRuleVersion: 'autorun-pick-v3',
    metricInputSha256: m1Sha256,
    links: links.map((link, index) => ({
      rank: index + 1, shopId: link.shopId, itemId: link.itemId, productBaseId: `1__${link.itemId}__${link.shopId}`,
      url: link.url, brand: null, revenue: 1000 - index, reason: `Synthetic link ${index + 1}`,
    })),
    counts: { walked: links.length, deleted: 0, notIncluded: 0, tokenGuardRejected: 0,
      eligible: links.length, picked: links.length, maskedRows: 0, maskedAboveLowestPick: 0 },
  };
  const selectionBytes = await writeCanonical(path.join(runDir, 'm2', 'selection.json'), selection);
  const selectionSha256 = sha256(selectionBytes);
  await writeCanonical(path.join(runDir, 'gates', 'm2.json'),
    handoff('M2', options.runId, 'PASS', m1Sha256, selectionSha256, null));
  await writeCanonical(path.join(runDir, 'state.json'), {
    format: 'state-v1', runId: options.runId, status: 'IDLE', mode: null, module: null, pid: null,
    startedAt: null, endedAt: null, errorCode: null, failedCheck: null,
  });
  return { runDir, runId: options.runId, links, requestSha256: sha256(requestBytes), m1Sha256, selectionSha256, rawNameRows: nameRows };
}

const INTENT_AT = '2026-11-10T00:00:00.000Z';
const CAP = 5;

function legacyJournal(run: ModuleRun, link: ReviewLink, rows: NativeRow[], options: {
  verdict: 'PASS' | 'FAIL'; m2Digest: string; requestSha256: string; observedAt: string; jobUpdatedAt: string;
}): Record<string, any> {
  const state = options.verdict === 'PASS' ? 'succeeded' : 'failed';
  const jobId = '10000000-0000-4000-8000-000000000001';
  const snapshot = {
    contractVersion: 'shopee-public-sanitized-result-v1', jobId, productUrl: link.url, shopId: link.shopId,
    itemId: link.itemId, maxReviewsPerProduct: CAP, complete: options.verdict === 'PASS',
    stopReason: options.verdict === 'PASS' ? 'last_page' : 'OTHER_OR_MISSING', filter: 'HAS_COMMENTS',
    expectedWithComments: rows.length, startedAt: INTENT_AT, finishedAt: options.observedAt,
    excluded: [], diagnostics: [],
    pages: rows.length ? [{ page: 2, cards: rows.length, collected: rows.length, ids: rows.map(row => row.reviewId) }] : [],
    rows,
  };
  const snapshotBytes = Buffer.from(canonicalJson(snapshot));
  const input = { url: link.url, max_comments: CAP };
  return {
    contractVersion: 'shopee-public-journal-v1', runKey: run.runId, confirmedSourceSetSha256: options.m2Digest,
    requestSha256: options.requestSha256, providerId: 'shopee-public-review', maxReviewsPerProduct: CAP,
    mappingRevision: 'shopee-public-review-row-v1', sampleMode: 'STANDARD', productUrl: link.url,
    shopId: link.shopId, itemId: link.itemId, inputSha256: sha256(canonicalJson(input)), intentAt: INTENT_AT,
    submitWindowStart: '2026-11-09T23:59:58.000Z', submitWindowEnd: '2026-11-10T00:00:12.000Z',
    deadline: '2026-11-10T00:40:00.000Z', acquisitionDeadline: '2026-11-10T00:40:00.000Z', baselineIds: [],
    job: { id: jobId, request: input, state, created_at: INTENT_AT, updated_at: options.jobUpdatedAt,
      result_available: true, collected: rows.length },
    lastState: state, snapshot, requestCount: 2, requestCountUncertain: false, cancelIntent: false,
    timedOut: false,
    terminal: { productUrl: link.url, shopId: link.shopId, itemId: link.itemId,
      inputSha256: sha256(canonicalJson(input)), jobId, state, stopCode: null, createdAt: INTENT_AT,
      observedAt: options.observedAt, attemptedAt: INTENT_AT, complete: options.verdict === 'PASS',
      stopReason: options.verdict === 'PASS' ? 'last_page' : 'OTHER_OR_MISSING', resultAvailable: true,
      resultSha256: sha256(snapshotBytes), resultByteSize: snapshotBytes.length, requestCount: 2,
      requestCountUncertain: false, timedOut: false, cancelIntent: false },
  };
}

export interface LegacySource {
  readonly sourceSha256: string;
  readonly journalPaths: string[];
  readonly retained: NativeRow[];
}

/** Native legacy M3: journals, outcome, published rows and the passing/failing M3 gate. */
export async function addLegacySource(run: ModuleRun, options: {
  verdict?: 'PASS' | 'FAIL';
  rowsByLink?: readonly NativeRow[][];
  published?: readonly NativeRow[];
  m2Digest?: string;
  requestSha256?: string;
  observedAt?: string;
  jobUpdatedAt?: string;
  errorCode?: string;
} = {}): Promise<LegacySource> {
  const verdict = options.verdict ?? 'PASS';
  const rowsByLink = options.rowsByLink ?? [
    [moduleRow(run.links[0]!, 'review-a', { comment: 'First synthetic comment' })],
    [moduleRow(run.links[1]!, 'review-b', { comment: 'Second synthetic comment' })],
  ];
  const m2Digest = options.m2Digest ?? run.selectionSha256;
  const observedAt = options.observedAt ?? '2026-11-10T00:05:00.000Z';
  const jobUpdatedAt = options.jobUpdatedAt ?? '2026-11-10T00:05:00.000Z';
  const journalBase = path.join(run.runDir, 'm3-journal', samplingDigest([run.runId, m2Digest]));
  const journalPaths: string[] = [];
  const journals: Record<string, any>[] = [];
  for (const [index, link] of run.links.entries()) {
    const journal = legacyJournal(run, link, rowsByLink[index] ?? [], {
      verdict, m2Digest, requestSha256: options.requestSha256 ?? run.requestSha256, observedAt, jobUpdatedAt,
    });
    const file = path.join(journalBase, `${samplingDigest([link.shopId, link.itemId])}.json`);
    await writeCanonical(file, journal, 0o600);
    journalPaths.push(file);
    journals.push(journal);
  }
  const retained = journals.flatMap(journal => journal.snapshot.rows as NativeRow[]);
  const published = options.published ?? (verdict === 'PASS' ? retained : []);
  await writeCanonical(path.join(run.runDir, 'm3', 'reviews.json'), published);
  await writeCanonical(path.join(run.runDir, 'm3', 'outcome.json'), {
    format: 'm3-outcome-v1', verdict: verdict === 'PASS' ? 'OK' : 'FAILED',
    errorCode: verdict === 'PASS' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED',
  });
  const gate = handoff('M3', run.runId, verdict, m2Digest, await hashFolder(run.runDir, 'm3'),
    verdict === 'PASS' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED');
  gate.checks.push({ id: 'min_reviews_per_link', ok: true, got: journals.map(journal => journal.snapshot.rows.length) });
  await writeCanonical(path.join(run.runDir, 'gates', 'm3.json'), gate);
  const proofPaths = [
    'gates/m3.json', 'm3/outcome.json', 'm3/reviews.json',
    ...journalPaths.map(file => path.relative(run.runDir, file).split(path.sep).join('/')),
  ];
  const sourceSha256 = await sourceIdentity(run.runDir, 'legacy', null,
    verdict === 'PASS' || published.length ? 'published' : 'terminal-retained', proofPaths);
  return { sourceSha256, journalPaths, retained };
}

export interface CustomAttempt {
  readonly attemptId: string;
  readonly planSha256: string;
  readonly sourceSha256: string;
  readonly base: string;
  readonly retained: NativeRow[];
}

function samplingPolicy(totalPerLink = CAP) {
  const policy = {
    format: 'shopee-review-policy-v1', mode: 'with-comments', stars: [], totalPerLink,
    allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1',
  };
  return { policy, policySha256: samplingDigest(policy) };
}

export async function addCustomAttempt(run: ModuleRun, options: {
  rowsByLink: readonly NativeRow[][];
  verdict?: 'PASS' | 'FAIL';
  status?: 'SUCCEEDED' | 'FAILED';
  attemptId?: string;
  stopReason?: 'record_limit' | 'exhausted' | 'page_limit';
  published?: readonly NativeRow[];
  jobUpdatedAt?: string;
  errorCode?: string;
}): Promise<CustomAttempt> {
  const verdict = options.verdict ?? 'PASS';
  const status = options.status ?? (verdict === 'PASS' ? 'SUCCEEDED' : 'FAILED');
  const attemptId = options.attemptId ?? '11111111-1111-4111-8111-111111111111';
  const base = `m3-custom/attempts/${attemptId}`;
  const runDir = run.runDir;
  const { policy, policySha256 } = samplingPolicy();
  const plan = {
    format: 'shopee-review-plan-v1', runId: run.runId, requestSha256: run.requestSha256,
    m2Digest: run.selectionSha256, policy, policySha256, targets: [],
    links: run.links.map(({ shopId, itemId, url }) => ({ shopId, itemId, url })),
  };
  const planSha256 = samplingDigest(plan);
  await writeCanonical(path.join(runDir, 'm3-custom', 'plans', `${planSha256}.json`), plan);
  const attempt = {
    format: 'shopee-review-attempt-v1', kind: 'custom', attemptId, runId: run.runId,
    createdAt: '2026-11-10T00:00:00.000Z', m2Digest: run.selectionSha256,
    requestSha256: run.requestSha256, planSha256,
    links: run.links.map(({ shopId, itemId, url }) => ({ shopId, itemId, url })),
  };
  await writeCanonical(path.join(runDir, base, 'attempt.json'), attempt);
  const jobUpdatedAt = options.jobUpdatedAt ?? '2026-11-10T00:05:00.000Z';
  const journals: Record<string, any>[] = [];
  for (const [index, link] of run.links.entries()) {
    const rows = options.rowsByLink[index] ?? [];
    const input = {
      url: link.url, max_comments: policy.totalPerLink,
      sampling: { attemptId, planSha256, policySha256, policy },
    };
    const inputSha256 = samplingDigest(input);
    const jobId = `20000000-0000-4000-8000-00000000000${index + 1}`;
    const result = {
      format: 'shopee-sampled-result-v1', jobId, inputSha256, planSha256, policySha256,
      link: { shopId: link.shopId, itemId: link.itemId, url: link.url }, rows,
      pages: rows.length ? [{ filter: 'with-comments', page: 2, cards: rows.length, collected: rows.length,
        ids: rows.map(row => row.reviewId) }] : [],
      groups: [{ filter: 'with-comments', stopReason: options.stopReason ?? 'exhausted' }],
      sourceCounts: null, stopReason: options.stopReason ?? 'exhausted', complete: true,
      phase: 'terminal', sourceSha256: sha256(`synthetic-source-${link.url}`),
    };
    const journal = {
      format: 'shopee-sampling-journal-v1', inputSha256, request: input, intentAt: INTENT_AT,
      deadline: '2026-11-10T00:40:00.000Z', baselineIds: [],
      job: { id: jobId, request: input, state: verdict === 'PASS' ? 'succeeded' : 'failed',
        created_at: INTENT_AT, updated_at: jobUpdatedAt, result_available: true, collected: rows.length },
      result, terminal: true, errorCode: verdict === 'PASS' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED',
      requestCount: 2, requestCountUncertain: false, cancelIntent: false, resultSha256: samplingDigest(result),
    };
    await writeCanonical(path.join(runDir, base, 'journal', `${samplingDigest(link)}.json`), journal, 0o600);
    journals.push(journal);
  }
  const retained = journals.flatMap(journal => journal.result.rows as NativeRow[]);
  const published = options.published ?? (verdict === 'PASS' ? retained : []);
  await writeCanonical(path.join(runDir, base, 'output', 'reviews.json'), published);
  await writeCanonical(path.join(runDir, base, 'output', 'outcome.json'), {
    format: 'shopee-sampling-outcome-v1', planSha256,
    verdict: verdict === 'PASS' ? 'OK' : 'FAILED',
    errorCode: verdict === 'PASS' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED',
  });
  const outputSha256 = await hashFolder(runDir, `${base}/output`);
  await writeCanonical(path.join(runDir, base, 'state.json'), {
    format: 'shopee-review-attempt-state-v1', status, pid: null,
    errorCode: status === 'SUCCEEDED' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED',
    outputSha256, attemptSha256: samplingDigest(attempt),
  });
  await writeCanonical(path.join(runDir, base, 'gate.json'), {
    format: 'handoff-v1', module: 'M3', runId: run.runId, skillVersion: 'custom-review-sampling-v1',
    verdict, inputSha256: planSha256, outputSha256,
    checks: [{ id: 'synthetic_native_proof', ok: verdict === 'PASS' }],
    errorCode: verdict === 'PASS' ? null : options.errorCode ?? 'SOURCE_JOB_FAILED', next: null,
  });
  const proofPaths = [
    `${base}/attempt.json`, `${base}/state.json`, `${base}/gate.json`,
    `${base}/output/reviews.json`, `${base}/output/outcome.json`, `m3-custom/plans/${planSha256}.json`,
    ...run.links.map(link => `${base}/journal/${samplingDigest(link)}.json`),
  ];
  const sourceSha256 = await sourceIdentity(runDir, 'custom', attemptId,
    verdict === 'PASS' || published.length ? 'published' : 'terminal-retained', proofPaths);
  return { attemptId, planSha256, sourceSha256, base, retained };
}

/** The documented `module-review-source-v1` digest, computed independently of the reader. */
export async function sourceIdentity(runDir: string, kind: 'legacy' | 'custom', attemptId: string | null,
  rowBasis: 'published' | 'terminal-retained', proofPaths: readonly string[]): Promise<string> {
  const paths = [...new Set(proofPaths)].sort();
  const proof = [];
  for (const relative of paths) {
    const bytes = await fs.readFile(path.join(runDir, ...relative.split('/')));
    proof.push({ path: relative, sha256: sha256(bytes) });
  }
  return samplingDigest({ format: 'module-review-source-v1', runId: path.basename(runDir), kind, attemptId, rowBasis, proof });
}

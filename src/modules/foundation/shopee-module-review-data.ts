import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, readdir, mkdir, open, link, unlink } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { createRequire } from 'node:module';
import schema from '../../../contracts/foundation/shopee-module-review-data.schema.json' with { type: 'json' };
import type { RunTracking, RunTrackingRecord, ReviewDataLink, ReviewDataExport, ModuleReviewArchive } from '../../../contracts/foundation/shopee-module-review-data.generated.js';
import type { SamplingResult } from '../../../contracts/foundation/shopee-review-sampling.generated.js';
import { canonicalJson } from './canonical-json.js';
import { samplingDigest, validateSamplingResult } from './shopee-review-sampling.js';
import { readPublicReviewJournal, validatePublicEnvelope, PUBLIC_REVIEW_MAX_BYTES } from '../../platform/collectors/shopee-public-reviews.js';
import { frozenAttemptProof, journalsFor, stateFor } from '../../../scripts/module-review-sampling.js';
import { hashFile, hashFolder, ModuleError, object, safePath, validateModuleValue } from '../../../scripts/module-pick.js';

export const EXPORT_MAX_BYTES = 64 * 1024 * 1024;
const FILE_MAX_BYTES = PUBLIC_REVIEW_MAX_BYTES + 131072;
const hex = /^[a-f0-9]{64}$/;
const uuid = /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/;
const liveStates = new Set(['queued', 'running', 'needs_login', 'needs_verification']);
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv); ajv.addSchema(schema);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export function validateReviewData<T>(definition: string, value: unknown): T {
  let validate = validators.get(definition);
  if (!validate) { validate = ajv.compile({ $ref: `${schema.$id}#/$defs/${definition}` }); validators.set(definition, validate); }
  if (!validate(value)) throw new ModuleError('REVIEW_DATA_INVALID', 2);
  return value as T;
}
export type ModuleReviewRow = SamplingResult['rows'][number];
export interface VerifiedModuleReviewCollection {
  runId: string; sourceSha256: string; kind: 'legacy' | 'custom'; attemptId: string | null;
  planSha256: string | null; status: 'SUCCEEDED' | 'FAILED'; gateVerdict: 'PASS' | 'FAIL' | 'WAIT_OWNER' | null;
  completedAt: string | null; rowBasis: 'published' | 'terminal-retained'; rows: ModuleReviewRow[];
  links: ReviewDataLink[]; collectedAt: Map<string, string>; proof: { path: string; sha256: string; bytes: Buffer }[];
  requestSha256: string; m2Digest: string;
}
export const reviewDataHash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export async function reviewDataReadonly(): Promise<boolean> {
  if (process.env.TDN_SHOPEE_FLOW_READONLY === '1') return true;
  try { await lstat(join(process.env.SHOPEE_FLOW_STATE ?? join(homedir(), '.local/state/tdn-growth-os'), 'shopee-flow/READONLY')); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
}
export async function assertReviewDataWritable(): Promise<void> {
  if (await reviewDataReadonly()) throw new ModuleError('READONLY_ON');
}
async function readBounded(run: string, path: string, limit = path.endsWith('/reviews.json') ? EXPORT_MAX_BYTES : FILE_MAX_BYTES): Promise<Buffer> {
  const file = await safePath(run, path), stat = await lstat(file);
  if (!stat.isFile() || stat.size > limit) throw new ModuleError('REVIEW_SOURCE_INVALID');
  const bytes = await readFile(file);
  if (bytes.length > limit || bytes.length !== stat.size) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  return bytes;
}
async function optionalBytes(run: string, path: string): Promise<Buffer | null> {
  try { return await readBounded(run, path); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function names(run: string, path: string): Promise<string[]> {
  try { return (await readdir(await safePath(run, path))).sort(); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
}
const parsed = (bytes: Buffer): Record<string, unknown> => object(JSON.parse(bytes.toString('utf8')));
const date = (value: unknown): string | null => typeof value === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
export async function readRunTracking(run: string): Promise<RunTracking> {
  const bytes = await optionalBytes(run, 'run-tracking.json');
  const record = bytes ? validateReviewData<RunTrackingRecord>('trackingRecord', JSON.parse(bytes.toString('utf8'))) : null;
  if (record && (record.runId !== basename(run) || record.historyBasis === 'legacy-first-unproven' && record.firstRunAt !== null)) throw new ModuleError('RUN_TRACKING_INVALID');
  const request = record ? null : await optionalBytes(run, 'request.json'), state = await optionalBytes(run, 'state.json');
  const metadata = (bytes:Buffer|null):Record<string,unknown> => { try { return bytes ? parsed(bytes) : {}; } catch { return {}; } };
  const preset = metadata(request).preset;
  const keywords = preset && typeof preset === 'object' && !Array.isArray(preset) ? (preset as Record<string,unknown>).keywords : null;
  const primaryKeyword = record?.primaryKeyword ?? (Array.isArray(keywords) && typeof keywords[0] === 'string' ? keywords[0] : null);
  return validateReviewData<RunTracking>('tracking', { primaryKeyword, firstRunAt: record?.firstRunAt ?? null,
    timeBasis: record?.firstRunAt ? 'recorded-first-accepted' : record?.historyBasis === 'new-run' ? 'not-started' : 'legacy-first-unproven',
    displayTimezone: 'Asia/Ho_Chi_Minh', lastKnownStartedAt: date(metadata(state).startedAt) });
}
async function snapshotFiles(run: string, paths: string[]): Promise<VerifiedModuleReviewCollection['proof']> {
  const proof = [];
  for (const path of [...new Set(paths)].sort()) { const bytes = await readBounded(run, path); proof.push({ path, bytes, sha256: reviewDataHash(bytes) }); }
  return proof;
}
function identity(source: Omit<VerifiedModuleReviewCollection, 'sourceSha256'>): VerifiedModuleReviewCollection {
  const sourceSha256 = samplingDigest({ format: 'module-review-source-v1', runId: source.runId, kind: source.kind,
    attemptId: source.attemptId, rowBasis: source.rowBasis, proof: source.proof.map(({ path, sha256 }) => ({ path, sha256 })) });
  return { ...source, sourceSha256 };
}
function assertRows(rows: ModuleReviewRow[], shopId: string, itemId: string, url: string): void {
  if (rows.some(row => row.shopId !== shopId || row.itemId !== itemId || row.sourceUrl !== url)) throw new ModuleError('REVIEW_SOURCE_INVALID');
}
async function assertProofUnchanged(run: string, proof: VerifiedModuleReviewCollection['proof']): Promise<void> {
  for (const file of proof) if (await hashFile(run, file.path) !== file.sha256) throw new ModuleError('REVIEW_SOURCE_CHANGED');
}
async function legacySource(run: string): Promise<VerifiedModuleReviewCollection | null> {
  const state = await optionalBytes(run,'state.json');
  if (state && parsed(state).status === 'RUNNING') throw new ModuleError('REVIEW_SOURCE_UNSETTLED');
  const output = await optionalBytes(run, 'm3/reviews.json');
  if (!output) return null;
  if (canonicalJson(await names(run,'m3')) !== canonicalJson(['outcome.json','reviews.json'])) throw new ModuleError('REVIEW_SOURCE_INVALID');
  const paths = ['m3/reviews.json', 'm3/outcome.json', 'gates/m3.json'];
  const proof = await snapshotFiles(run, paths), gate = parsed(proof.find(p => p.path === 'gates/m3.json')!.bytes);
  await validateModuleValue('handoff-v1', gate);
  if (gate.runId !== basename(run) || gate.module !== 'M3' || gate.outputSha256 !== await hashFolder(run, 'm3')) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  const outcome = parsed(proof.find(p => p.path === 'm3/outcome.json')!.bytes);
  const published = JSON.parse(output.toString('utf8')) as ModuleReviewRow[];
  // The native legacy validator remains authoritative for legacy limits/fields.
  const journalRoot = `m3-journal/${samplingDigest([basename(run),gate.inputSha256])}`;
  const journalNames = await names(run, journalRoot);
  const journals = [];
  for (const name of journalNames) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) throw new ModuleError('REVIEW_SOURCE_INVALID');
    const path = `${journalRoot}/${name}`, journal = await readPublicReviewJournal(await safePath(run, path));
    if (!journal) throw new ModuleError('REVIEW_SOURCE_INVALID');
    if (name !== `${samplingDigest([journal.shopId, journal.itemId])}.json`) throw new ModuleError('REVIEW_SOURCE_INVALID');
    if (!journal.terminal || journal.job && liveStates.has(journal.job.state)) throw new ModuleError('REVIEW_SOURCE_UNSETTLED');
    if (journal.runKey !== basename(run) || journal.confirmedSourceSetSha256 !== gate.inputSha256 ||
        journal.productUrl !== `https://shopee.vn/product/${journal.shopId}/${journal.itemId}`) throw new ModuleError('REVIEW_SOURCE_CHANGED');
    if (journal.snapshot) { validatePublicEnvelope(journal.snapshot); assertRows(journal.snapshot.rows, journal.shopId, journal.itemId, journal.productUrl); }
    journals.push(journal); paths.push(path);
  }
  if (!journals.length || journals.length > 5 || new Set(journals.map(j => j.requestSha256)).size !== 1 ||
      new Set(journals.map(j => j.maxReviewsPerProduct)).size !== 1) throw new ModuleError('REVIEW_SOURCE_INVALID');
  const gateCounts = (gate.checks as Record<string,unknown>[]).find(c=>c.id==='min_reviews_per_link')?.got;
  if (!Array.isArray(gateCounts) || gateCounts.length !== journals.length || new Set(journals.map(j=>j.productUrl)).size !== journals.length)
    throw new ModuleError('REVIEW_SOURCE_INVALID');
  const retained = journals.flatMap(j => j.snapshot?.rows ?? []);
  if (!Array.isArray(published) || published.length && canonicalJson([...published].sort((a,b) => canonicalJson(a).localeCompare(canonicalJson(b)))) !==
      canonicalJson([...retained].sort((a,b) => canonicalJson(a).localeCompare(canonicalJson(b))))) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  const pass = gate.verdict === 'PASS';
  if (pass && (gate.errorCode !== null || (gate.checks as Record<string,unknown>[]).some(c=>!c.ok&&c.level!=='warn') ||
      outcome.errorCode !== null || !['OK','PARTIAL_LISTINGS'].includes(String(outcome.verdict)) || !published.length ||
      new Set(published.map(r => r.reviewId)).size !== published.length || published.some(r => !r.reviewId) ||
      journals.some(j => !j.snapshot?.rows.length || j.snapshot.rows.length > j.maxReviewsPerProduct))) throw new ModuleError('REVIEW_SOURCE_INVALID');
  const rows = published.length || pass ? published : retained, collectedAt = new Map<string,string>();
  const links: ReviewDataLink[] = journals.map(j => {
    if (j.snapshot && j.terminal!.observedAt) collectedAt.set(j.productUrl, j.terminal!.observedAt);
    const actual = j.snapshot ? j.snapshot.rows.length : null;
    return { shopId: j.shopId, itemId: j.itemId, url: j.productUrl, requested: j.maxReviewsPerProduct, actual,
      shortfall: actual === null ? null : Math.max(0,j.maxReviewsPerProduct-actual), complete: j.snapshot?.complete ?? null, status: j.terminal!.state };
  });
  const fullProof = await snapshotFiles(run, paths); await assertProofUnchanged(run, proof);
  for (const journal of journals) {
    const file = fullProof.find(p => p.path === `${journalRoot}/${samplingDigest([journal.shopId,journal.itemId])}.json`)!;
    if (canonicalJson(JSON.parse(file.bytes.toString('utf8'))) !== canonicalJson(journal)) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  }
  return identity({ runId: basename(run), kind: 'legacy', attemptId: null, planSha256: null,
    status: pass ? 'SUCCEEDED' : 'FAILED', gateVerdict: gate.verdict as VerifiedModuleReviewCollection['gateVerdict'],
    completedAt: journals.flatMap(j => date(j.job?.updated_at) ? [j.job!.updated_at] : []).sort().at(-1) ?? null,
    rowBasis: published.length || pass ? 'published' : 'terminal-retained', rows, links, collectedAt, proof: fullProof,
    requestSha256: journals[0]!.requestSha256, m2Digest: journals[0]!.confirmedSourceSetSha256 });
}
async function customSource(run: string, id: string): Promise<VerifiedModuleReviewCollection> {
  const { attempt, plan } = await frozenAttemptProof(run, 'custom', id), state = await stateFor(run, 'custom', id);
  if (!plan || !['SUCCEEDED','FAILED'].includes(state.status)) throw new ModuleError('REVIEW_SOURCE_UNSETTLED');
  const journals = await journalsFor(run, attempt), base = `m3-custom/attempts/${id}`;
  if (canonicalJson(await names(run,`${base}/output`)) !== canonicalJson(['outcome.json','reviews.json'])) throw new ModuleError('REVIEW_SOURCE_INVALID');
  if (journals.some(j => j && (!j.terminal || j.job && liveStates.has(j.job.state)))) throw new ModuleError('REVIEW_SOURCE_UNSETTLED');
  const gateBytes = await readBounded(run, `${base}/gate.json`), gate = parsed(gateBytes);
  // Custom gates intentionally use their existing compact check shape (without legacy `got`).
  if (gate.format !== 'handoff-v1' || gate.skillVersion !== 'custom-review-sampling-v1' ||
      !['PASS','FAIL','WAIT_OWNER'].includes(String(gate.verdict)) || !Array.isArray(gate.checks) ||
      gate.checks.some(c => typeof object(c).id !== 'string' || typeof object(c).ok !== 'boolean') ||
      gate.verdict === 'PASS' && gate.checks.some(c => !object(c).ok && object(c).level !== 'warn')) throw new ModuleError('REVIEW_SOURCE_INVALID');
  if (gate.runId !== basename(run) || gate.module !== 'M3' || gate.inputSha256 !== attempt.planSha256 ||
      gate.outputSha256 !== state.outputSha256 || gate.outputSha256 !== await hashFolder(run, `${base}/output`)) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  const paths = [`${base}/attempt.json`,`${base}/state.json`,`${base}/gate.json`,`${base}/output/reviews.json`,`${base}/output/outcome.json`, `m3-custom/plans/${attempt.planSha256}.json`];
  const results: SamplingResult[] = [];
  const collectedAt = new Map<string,string>();
  const links = attempt.links.map((link,index): ReviewDataLink => {
    const j = journals[index], result = j?.result?.format === 'shopee-sampled-result-v1' ? j.result : null;
    if (j) paths.push(`${base}/journal/${samplingDigest(link)}.json`);
    if (result) { validateSamplingResult(result, plan, attempt.planSha256!, link, j!.inputSha256); results.push(result); }
    // Provider terminal time is retained with its explicit basis, never inferred from file/import time.
    if (result && date(j?.job?.updated_at)) collectedAt.set(link.url, j!.job!.updated_at);
    const actual = result ? result.rows.length : null;
    return { ...link, requested: plan.policy.totalPerLink, actual, shortfall: actual === null ? null : Math.max(0,plan.policy.totalPerLink-actual),
      complete: result?.complete ?? null, status: result?.stopReason ?? j?.job?.state ?? 'not-observed' };
  });
  const proof = await snapshotFiles(run, paths), published = JSON.parse(proof.find(p => p.path === `${base}/output/reviews.json`)!.bytes.toString('utf8')) as ModuleReviewRow[];
  const proofValue = (path:string):unknown => JSON.parse(proof.find(p=>p.path===path)!.bytes.toString('utf8'));
  if (canonicalJson(proofValue(`${base}/attempt.json`)) !== canonicalJson(attempt) || canonicalJson(proofValue(`${base}/state.json`)) !== canonicalJson(state) ||
      canonicalJson(proofValue(`${base}/gate.json`)) !== canonicalJson(gate) || canonicalJson(proofValue(`m3-custom/plans/${attempt.planSha256}.json`)) !== canonicalJson(plan)) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  for (const [index,journal] of journals.entries()) if (journal && canonicalJson(proofValue(`${base}/journal/${samplingDigest(attempt.links[index]!)}.json`)) !== canonicalJson(journal)) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  const retained = results.flatMap(result => result.rows), outcome = parsed(proof.find(p => p.path === `${base}/output/outcome.json`)!.bytes);
  if (!Array.isArray(published) || published.length && canonicalJson(published) !== canonicalJson(retained)) throw new ModuleError('REVIEW_SOURCE_CHANGED');
  const pass = gate.verdict === 'PASS';
  if (pass && (gate.errorCode !== null || state.status !== 'SUCCEEDED' || state.errorCode !== null || outcome.planSha256 !== attempt.planSha256 || outcome.errorCode !== null ||
      !['OK','PARTIAL_LISTINGS'].includes(String(outcome.verdict)) || results.length !== attempt.links.length ||
      results.some(r => r.phase !== 'terminal' || !['record_limit','exhausted','page_limit'].includes(r.stopReason)) ||
      links.some(l => l.actual === null || l.actual < 1) || canonicalJson(published) !== canonicalJson(retained) ||
      new Set(published.map(r => r.reviewId)).size !== published.length)) throw new ModuleError('REVIEW_SOURCE_INVALID');
  await assertProofUnchanged(run, proof);
  return identity({ runId: basename(run), kind: 'custom', attemptId: id, planSha256: attempt.planSha256, status: pass ? 'SUCCEEDED' : 'FAILED',
    gateVerdict: gate.verdict as VerifiedModuleReviewCollection['gateVerdict'], completedAt: journals.flatMap(j => date(j?.job?.updated_at) ? [j!.job!.updated_at] : []).sort().at(-1) ?? null,
    rowBasis: pass || published.length ? 'published' : 'terminal-retained', rows: pass || published.length ? published : retained,
    links, collectedAt, proof, requestSha256: attempt.requestSha256, m2Digest: attempt.m2Digest });
}
export async function discoverModuleReviewSources(run: string): Promise<VerifiedModuleReviewCollection[]> {
  const sources: VerifiedModuleReviewCollection[] = [];
  try { const legacy = await legacySource(run); if (legacy) sources.push(legacy); }
  catch (error) { if (!(error instanceof Error)) throw error; /* Invalid/unsettled evidence is never offered as a source. */ }
  for (const id of await names(run, 'm3-custom/attempts')) {
    if (!uuid.test(id)) continue;
    try { sources.push(await customSource(run,id)); }
    catch (error) { if (!(error instanceof Error)) throw error; }
  }
  return sources;
}
export async function readModuleReviewSource(run: string, sourceSha256: string): Promise<VerifiedModuleReviewCollection> {
  if (!hex.test(sourceSha256)) throw new ModuleError('REVIEW_DATA_INVALID',2);
  const source = (await discoverModuleReviewSources(run)).find(s => s.sourceSha256 === sourceSha256);
  if (!source) throw new ModuleError('REVIEW_SOURCE_CHANGED',23);
  return source;
}
export function reviewArchive(source: VerifiedModuleReviewCollection): ModuleReviewArchive {
  return validateReviewData<ModuleReviewArchive>('archive', { format: 'module-review-archive-v1', sourceSha256: source.sourceSha256, runId: source.runId,
    kind: source.kind, attemptId: source.attemptId, planSha256: source.planSha256, status: source.status, gateVerdict: source.gateVerdict,
    completedAt: source.completedAt, rowBasis: source.rowBasis, links: source.links, rows: source.rows,
    proof: source.proof.map(p => ({ path: p.path, sha256: p.sha256, bytesBase64: p.bytes.toString('base64') })) });
}
export function renderReviewExport(source: VerifiedModuleReviewCollection, format: 'json'|'txt'): Buffer {
  let bytes: Buffer;
  if (format === 'json') bytes = Buffer.from(canonicalJson(reviewArchive(source)) + '\n','utf8');
  else {
    const sections = [`Shopee collected reviews\nRun: ${source.runId}\nSource: ${source.sourceSha256}\nStatus: ${source.status}\nM3: ${source.gateVerdict ?? 'unknown'}\nRow basis: ${source.rowBasis}\nCompleted: ${source.completedAt ?? 'unknown'}\nRows: ${source.rows.length}\nStored application data; not original HTTP bytes.\nLinks (null means not observed):\n${JSON.stringify(source.links,null,2)}\nProof file digests:\n${source.proof.map(p=>`${p.path}: ${p.sha256}`).join('\n')}\n`];
    source.rows.forEach((row,index) => sections.push(`\n--- Review ${index+1} ---\nReview ID: ${row.reviewId ?? 'unknown'}\nShop: ${row.shopId}\nItem: ${row.itemId}\nRating: ${row.ratingStar ?? 'unknown'} (${row.ratingState})\nPosted: ${row.createdAt ?? 'unknown'}\nSource time: ${row.postedAtLocal ?? 'unknown'}\nVariation: ${row.variation ?? 'unknown'}\nSource: ${row.sourceUrl}\nPage: ${row.sourcePage ?? 'unknown'}; row: ${row.sourceRow}\nContent type: ${row.contentType}\nAdmission reasons: ${JSON.stringify(row.admissionReasons)}\nAttributes (original array): ${JSON.stringify(row.attributes)}\nComment (verbatim; may contain its own delimiters):\n${row.comment ?? ''}\n`));
    bytes = Buffer.from(sections.join(''),'utf8');
  }
  if (bytes.length > EXPORT_MAX_BYTES) throw new ModuleError('REVIEW_EXPORT_TOO_LARGE');
  return bytes;
}
export async function cachedReviewExport(run: string, source: VerifiedModuleReviewCollection, format: 'json'|'txt'): Promise<ReviewDataExport|null> {
  const path = `review-data/exports/${source.sourceSha256}/module-review-export-v1/${format}.json`, raw = await optionalBytes(run,path);
  if (!raw) return null;
  const receipt = validateReviewData<ReviewDataExport>('export',JSON.parse(raw.toString('utf8')));
  if (receipt.sourceSha256 !== source.sourceSha256 || receipt.runId !== source.runId || receipt.exportFormat !== format || receipt.rowCount !== source.rows.length) throw new ModuleError('REVIEW_EXPORT_CHANGED');
  const bytes = await readBounded(run,`review-data/files/${receipt.exportSha256}`,EXPORT_MAX_BYTES);
  if (bytes.length !== receipt.byteSize || reviewDataHash(bytes) !== receipt.exportSha256) throw new ModuleError('REVIEW_EXPORT_CHANGED');
  return { ...receipt, reused: true };
}
async function publishExclusive(run: string, path: string, bytes: Buffer): Promise<void> {
  const target = await safePath(run,path); await mkdir(dirname(target), {recursive:true,mode:0o700});
  const temp = `${target}.${randomUUID()}.tmp`, handle = await open(temp,'wx',0o600);
  try {
    try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
    try { await link(temp,target); }
    catch(error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !(await readFile(await safePath(run,path))).equals(bytes)) throw new ModuleError('REVIEW_EXPORT_CHANGED'); }
  } finally { await unlink(temp); }
  const directory = await open(dirname(target),'r'); try { await directory.sync(); } finally { await directory.close(); }
}
export async function prepareReviewExport(run: string, sourceSha256: string, format: 'json'|'txt'): Promise<ReviewDataExport> {
  const source = await readModuleReviewSource(run,sourceSha256), existing = await cachedReviewExport(run,source,format);
  if (existing) return existing;
  await assertReviewDataWritable();
  const bytes = renderReviewExport(source,format), exportSha256 = reviewDataHash(bytes);
  await assertReviewDataWritable();
  const receipt = validateReviewData<ReviewDataExport>('export', {format:'review-data-export-v1',runId:source.runId,sourceSha256,exportFormat:format,exportVersion:'module-review-export-v1',exportSha256,
    byteSize:bytes.length,fileName:`shopee-${source.runId}-${sourceSha256.slice(0,12)}.${format}`,rowCount:source.rows.length,reused:false});
  await publishExclusive(run,`review-data/files/${exportSha256}`,bytes);
  await publishExclusive(run,`review-data/exports/${sourceSha256}/module-review-export-v1/${format}.json`,Buffer.from(canonicalJson(receipt)));
  return receipt;
}
export async function readReviewExportBytes(run: string, digest: string): Promise<Buffer> {
  if (!hex.test(digest)) throw new ModuleError('REVIEW_DATA_INVALID',2);
  for (const name of await names(run,'review-data/exports')) {
    if (!hex.test(name)) continue;
    for (const format of ['json','txt'] as const) {
      const raw = await optionalBytes(run,`review-data/exports/${name}/module-review-export-v1/${format}.json`);
      if (!raw) continue;
      const receipt = validateReviewData<ReviewDataExport>('export',JSON.parse(raw.toString('utf8')));
      if (receipt.exportSha256 !== digest) continue;
      if (receipt.sourceSha256 !== name || receipt.runId !== basename(run) || receipt.exportFormat !== format) throw new ModuleError('REVIEW_EXPORT_CHANGED');
      const bytes = await readBounded(run,`review-data/files/${digest}`,EXPORT_MAX_BYTES);
      if (bytes.length !== receipt.byteSize || reviewDataHash(bytes) !== digest) throw new ModuleError('REVIEW_EXPORT_CHANGED');
      return bytes;
    }
  }
  throw new ModuleError('REVIEW_EXPORT_NOT_FOUND',2);
}

import { derivePeriodProductPick, deriveTopProductPick, linksToCheckCount, MODULE_PICK_POLICY, MODULE_PICK_POLICY_V2,
  MODULE_PICK_POLICY_V3, pickAllShopeeProducts, pickProductsWithJev, ProductPickError, type ProductSelection } from './module-product-pick.js';
import { pickJevFromEnvironment, type PickJev } from './module-product-pick-jev.js';
import { createM2LinkCheck, linkCheckBudgetMs, LinkCheckStop, linkCollectorFromEnvironment, reconcileLinkJournals,
  type LinkCheckEntry, type LinkCollector } from './module-link-check.js';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deriveIncludeTerms, pickShopeeLinks } from '../src/modules/analysis/research-automation/autorun-derive.js';
import { usedScope, type AutorunScopeRecord } from '../src/modules/analysis/research-automation/autorun-scope.js';
import { CAPTURE_ROW_PROFILE } from '../src/modules/analysis/research-automation/capture-row-quality.js';
import { assertMetricInputMatches, validateMetricV3CaptureSpec } from '../src/modules/analysis/research-automation/metric-v3-capture-spec.js';
import specSchema from '../contracts/analysis/metric-v3-capture-spec.schema.json' with { type: 'json' };
import selectedSpecSchema from '../contracts/analysis/metric-v3-capture-spec-v3.schema.json' with { type: 'json' };
import selectedWindowSchema from '../contracts/analysis/metric-v3-window-capture-v3.schema.json' with { type: 'json' };
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { lazyValidator } from '../src/platform/lazy-validator.js';
import legacySpecSchema from '../contracts/analysis/metric-v3-capture-spec-v1.schema.json' with { type: 'json' };
import requestV1Schema from '../skills/tdn-shopee-flow/chuan/request-v1.schema.json' with { type: 'json' };
import samplingSchema from '../contracts/foundation/shopee-review-sampling.schema.json' with { type: 'json' };
import { validateReviewPolicy } from '../src/modules/foundation/shopee-review-sampling.js';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
export class ModuleError extends Error {
  constructor(readonly code: string, readonly exitCode = 20) { super(code); }
}
export const object = (value: unknown): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ModuleError('MODULE_INPUT_INVALID');
  return value as Record<string, unknown>;
};
export async function safePath(run: string, name: string): Promise<string> {
  if (isAbsolute(name) || name.split('/').includes('..') || /[\\\t\r\n]/.test(name)) throw new ModuleError('MODULE_PATH_INVALID');
  const root = resolve(run), target = resolve(root, name), rel = relative(root, target);
  if (rel.startsWith(`..${sep}`) || rel === '..' || isAbsolute(rel)) throw new ModuleError('MODULE_PATH_INVALID');
  let current = root;
  for (const part of ['', ...rel.split(sep).filter(Boolean)]) {
    current = part ? join(current, part) : current;
    try { if ((await lstat(current)).isSymbolicLink()) throw new ModuleError('MODULE_PATH_INVALID'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return target;
}
export async function readJson(run: string, name: string): Promise<unknown> {
  return JSON.parse(await readFile(await safePath(run, name), 'utf8')) as unknown;
}
export async function hashFile(run: string, name: string): Promise<string> {
  return sha256(await readFile(await safePath(run, name)));
}
export async function hashFolder(run: string, name: string): Promise<string> {
  const files: string[] = [];
  async function walk(folder: string) {
    for (const entry of await readdir(await safePath(run, folder), { withFileTypes: true })) {
      const path = `${folder}/${entry.name}`;
      await safePath(run, path);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path.slice(name.length + 1));
      else throw new ModuleError('MODULE_PATH_INVALID');
    }
  }
  await walk(name);
  let lines = '';
  for (const path of files.sort()) lines += `${path}\t${await hashFile(run, `${name}/${path}`)}\n`;
  return sha256(lines);
}
export async function prerequisite(run: string, gate: 'm1' | 'm2'): Promise<string> {
  let slip: Record<string, unknown>;
  try { slip = object(await readJson(run, `gates/${gate}.json`)); }
  catch { throw new ModuleError('GATE_NOT_PASSED', 22); }
  if (slip.format !== 'handoff-v1' || slip.verdict !== 'PASS' || slip.module !== gate.toUpperCase() || slip.runId !== basename(resolve(run)))
    throw new ModuleError('GATE_NOT_PASSED', 22);
  let digest: string;
  try { digest = gate === 'm1' ? await hashFolder(run, 'm1') : await hashFile(run, 'm2/selection.json'); }
  catch { throw new ModuleError('GATE_INPUT_CHANGED', 23); }
  if (digest !== slip.outputSha256) throw new ModuleError('GATE_INPUT_CHANGED', 23);
  if (gate === 'm2') await requireBoundLinkLog(run);
  return digest;
}
/** Contract F644 round 3: a selection that bound its step-2 link log is admitted to M3 only while that exact log is present. */
async function requireBoundLinkLog(run: string): Promise<void> {
  let selection: unknown;
  try { selection = await readJson(run, 'm2/selection.json'); }
  catch { throw new ModuleError('GATE_INPUT_CHANGED', 23); }
  const record = selection !== null && typeof selection === 'object' && !Array.isArray(selection) ? selection as Record<string, unknown> : null;
  const value = record?.selectionProof;
  const proof = value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  const bound = proof?.linkChecksSha256;
  if (bound === undefined) return;
  const actual = await hashFile(run, 'm2/link-checks.json').catch(() => null);
  if (typeof bound !== 'string' || !/^[a-f0-9]{64}$/.test(bound) || actual !== bound)
    throw new ModuleError('GATE_INPUT_CHANGED', 23);
}
export async function atomicJson(run: string, name: string, data: unknown): Promise<void> {
  const path = await safePath(run, name);
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const tmp = `${path}.${randomUUID()}.tmp`;
  try { await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); await rename(tmp, path); }
  finally { await unlink(tmp).catch(() => {}); }
}
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema(selectedSpecSchema); ajv.addSchema(specSchema); ajv.addSchema(legacySpecSchema); ajv.addSchema(requestV1Schema); ajv.addSchema(samplingSchema);
const validateSelectedWindow = lazyValidator(ajv, selectedWindowSchema);
const validators = new Map<string, ReturnType<typeof ajv.compile>>();
export async function validateModuleValue(name: string, value: unknown): Promise<void> {
  let validate = validators.get(name);
  if (!validate) {
    const schema = JSON.parse(await readFile(join(repoRoot, 'skills/tdn-shopee-flow/chuan', `${name}.schema.json`), 'utf8')) as { $id: string };
    validate = ajv.getSchema(schema.$id) ?? ajv.compile(schema);
    validators.set(name, validate);
  }
  if (!validate(value)) throw new ModuleError('MODULE_INPUT_INVALID');
}
export async function readRequest(run: string) {
  const value = object(await readJson(run, 'request.json'));
  await validateModuleValue(value.format === 'request-v2' ? 'request-v2' : 'request-v1', value);
  const collectionPolicy = value.format === 'request-v2' ? validateReviewPolicy(value.collectionPolicy) : null;
  const captureSpec = value.captureSpec === undefined ? undefined : validateMetricV3CaptureSpec(value.captureSpec);
  try {
    if (captureSpec) assertMetricInputMatches(value.metricInput, captureSpec);
    else if (value.metricInput !== undefined) throw new Error('CAPTURE_INPUT_INVALID');
  } catch (error) {
    throw new ModuleError(error instanceof Error ? error.message : 'CAPTURE_INPUT_INVALID');
  }
  const keywords = object(value.preset).keywords as string[];
  const windows = value.windows as { id: string; period: { startDate: string; endDate: string }; intervalDays?: number }[];
  if (captureSpec && (windows.length !== captureSpec.windows.length || JSON.stringify(keywords) !== JSON.stringify(captureSpec.preset.keywords) || windows.some((w, i) =>
      w.id !== captureSpec.windows[i]?.id || w.period.startDate !== captureSpec.windows[i]?.period.startDate ||
      w.period.endDate !== captureSpec.windows[i]?.period.endDate ||
      (object(w).intervalDays !== undefined && object(w).intervalDays !== captureSpec.windows[i]?.intervalDays)))) throw new ModuleError('CAPTURE_SPEC_MISMATCH');
  return { keywords, principalTitles: (value.principalTitles ?? []) as string[], reviewCapPerLink: collectionPolicy?.totalPerLink ?? value.reviewCapPerLink as number, collectionPolicy, captureSpec, selectionPolicy: [MODULE_PICK_POLICY, MODULE_PICK_POLICY_V2, MODULE_PICK_POLICY_V3].includes(value.selectionPolicy as string) ? value.selectionPolicy as string : null,
    productSelection: value.productSelection as ProductSelection | undefined,
    windows, metricSource: value.metricSource as UserPageMetricSource | undefined };
}
type UserPageMetricSource = { format: 'user-page-v1'; scope: Record<string, unknown>; importId: string };
const USER_PAGE_REQUEST_BODY = { limit: 100, page: 0, sort_by: 'revenue_custom__desc' };
/** The user-page source keeps the page's own products response, so no preset rebuild is needed. */
async function readUserPageSource(run: string, request: NonNullable<Awaited<ReturnType<typeof readRequest>>>,
    source: UserPageMetricSource) {
  const window = request.windows[0];
  if (!window || window.id !== 'selected') throw new ModuleError('PICK_WINDOW_MISSING');
  if ('limit' in source.scope || 'page' in source.scope || 'sort_by' in source.scope) throw new ModuleError('CAPTURE_INPUT_INVALID');
  const outer = object(await readJson(run, 'm1/manifest.json'));
  const refs = outer.windows;
  if (outer.contractVersion !== 'metric-v3-capture-v1' || !Array.isArray(refs) || refs.length !== 1)
    throw new ModuleError('CAPTURE_SPEC_MISMATCH');
  const ref = object(refs[0]);
  if (ref.window !== 'selected' || ref.path !== 'selected/manifest.json') throw new ModuleError('PICK_WINDOW_MISSING');
  const partBytes = await readFile(await safePath(run, 'm1/selected/manifest.json'));
  if (sha256(partBytes) !== ref.sha256) throw new ModuleError('CAPTURE_HASH_MISMATCH');
  const part = object(JSON.parse(partBytes.toString('utf8')));
  await validateModuleValue('metric-user-page-window-v1', part);
  if (canonicalJson(part.window) !== canonicalJson(window)) throw new ModuleError('CAPTURE_WINDOW_MISMATCH');
  const rawBytes = await readFile(await safePath(run, 'm1/selected/raw-responses.json'));
  const file = (part.files as { path: string; sha256: string; byteSize: number }[])[0]!;
  if (file.path !== 'raw-responses.json' || file.sha256 !== sha256(rawBytes) || file.byteSize !== rawBytes.length)
    throw new ModuleError('CAPTURE_HASH_MISMATCH');
  const raw: unknown = JSON.parse(rawBytes.toString('utf8'));
  if (!Array.isArray(raw) || raw.length !== 1) throw new ModuleError('CAPTURE_SPEC_MISMATCH');
  const response = object(raw[0]);
  if (response.urlPath !== '/v2/market/analytics/products/' || response.method !== 'POST' || response.status !== 200 ||
      object(response.body).status !== 'success') throw new ModuleError('CAPTURE_SPEC_MISMATCH');
  if (canonicalJson(response.requestBody) !== canonicalJson({ ...source.scope, ...USER_PAGE_REQUEST_BODY }))
    throw new ModuleError('CAPTURE_INPUT_INVALID');
  return { raw, prefix: 'm1', part, rawBytes };
}
export async function readPickSource(run: string, request?: Awaited<ReturnType<typeof readRequest>>) {
  if (!request) {
    try { await lstat(await safePath(run, 'request.json')); request = await readRequest(run); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  if (request?.metricSource) return readUserPageSource(run, request, request.metricSource);
  const selected = request?.captureSpec?.contractVersion === 'metric-v3-capture-spec-v3';
  let scope: AutorunScopeRecord | null = null;
  try { scope = await readJson(run, 'm1/scope.json') as AutorunScopeRecord; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const legacy = usedScope(scope)?.captureNumber === 2 ? 'run2' : 'run1';
  if (!selected) {
    try { return { raw: await readJson(run, `m1/${legacy}/raw-responses.json`), prefix: null, part: null, rawBytes: null }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  let prefix = 'm1';
  try { await lstat(await safePath(run, 'm1/manifest.json')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const dirs = (await readdir(await safePath(run, 'm1'), { withFileTypes: true })).filter(d => d.isDirectory() && /^[a-f0-9-]{36}$/.test(d.name));
    if (dirs.length !== 1) throw new ModuleError('CAPTURE_FILES_MISSING');
    prefix = `m1/${dirs[0]!.name}/run1`;
  }
  const manifest = object(await readJson(run, `${prefix}/manifest.json`));
  const refs = manifest.windows;
  if (!Array.isArray(refs) || !refs.length) throw new ModuleError('CAPTURE_FILES_MISSING');
  if (selected) {
    const spec = request!.captureSpec!;
    const window = spec.windows[0]!;
    const specDigest = sha256(`${JSON.stringify(spec, null, 2)}\n`);
    if (manifest.contractVersion !== 'metric-v3-capture-v1' || manifest.specDigest !== specDigest || refs.length !== 1)
      throw new ModuleError('CAPTURE_SPEC_MISMATCH');
    const ref = object(refs[0]);
    if (ref.window !== window.id || ref.path !== `${window.id}/manifest.json`) throw new ModuleError('PICK_WINDOW_MISSING');
    const manifestBytes = await readFile(await safePath(run, `${prefix}/${ref.path}`));
    if (sha256(manifestBytes) !== ref.sha256) throw new ModuleError('CAPTURE_HASH_MISMATCH');
    const part = object(JSON.parse(manifestBytes.toString('utf8')));
    if (!validateSelectedWindow(part) || part.specDigest !== specDigest ||
        canonicalJson(part.window) !== canonicalJson(window))
      throw new ModuleError('CAPTURE_SPEC_MISMATCH');
    const rawBytes = await readFile(await safePath(run, `${prefix}/${window.id}/raw-responses.json`));
    const file = (part.files as { path: string; sha256: string; byteSize: number }[])[0]!;
    if (file.path !== 'raw-responses.json' || file.sha256 !== sha256(rawBytes) || file.byteSize !== rawBytes.length)
      throw new ModuleError('CAPTURE_HASH_MISMATCH');
    const raw: unknown = JSON.parse(rawBytes.toString('utf8'));
    // Replay the real capture publication boundary, including its unique-set applied-state
    // comparison. DOM member order can differ from the frozen request; artifact hashes stay exact.
    const { buildV3WindowManifest } = await import(new URL('../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
    let replay;
    try {
      replay = buildV3WindowManifest(spec, window, { taxonomy: spec.preset.category, appliedState: part.appliedState,
        keywordInput: '', selectedCategoryIds: part.selectedCategoryIds, period: window.period, categoryMode: 'Advanced',
        multi: true, comparisonDefault: true, displayedKPIs: part.displayedKPIs }, raw, part.capturedAt,
        part.captureMethod, part.fallbackReason);
    } catch { throw new ModuleError('CAPTURE_SPEC_MISMATCH'); }
    if (canonicalJson(replay.sourceMap) !== canonicalJson(part.sourceMap)) throw new ModuleError('CAPTURE_SPEC_MISMATCH');
    return { raw, prefix, part, rawBytes };
  }
  const config = object(await readJson(repoRoot, 'skills/tdn-shopee-flow/modules.json'));
  const rule = object(object(config.params).pickWindow);
  const ref = refs.map(object).find(r => r.window === rule.preset);
  if (!ref || typeof ref.window !== 'string' || ref.path !== `${ref.window}/manifest.json`) throw new ModuleError('PICK_WINDOW_MISSING');
  return { raw: await readJson(run, `${prefix}/${ref.window}/raw-responses.json`), prefix: null, part: null, rawBytes: null };
}
export async function pickRaw(run: string, request?: Awaited<ReturnType<typeof readRequest>>): Promise<unknown> {
  return (await readPickSource(run, request)).raw;
}
export function derivePickCandidate(raw: unknown, keywords: readonly string[], principalTitles: readonly string[]) {
  const terms = [...deriveIncludeTerms(keywords[0] ?? '', principalTitles), ...keywords.slice(1)];
  const picked = pickShopeeLinks(raw, terms, { profile: CAPTURE_ROW_PROFILE });
  const links = picked.links.map((link, index) => ({ ...link, rank: index + 1,
    reason: `Hạng chọn ${index + 1}, doanh thu kỳ ${link.revenue === null ? 'chưa có dữ liệu' : `${link.revenue.toLocaleString('vi-VN')} đồng`}, thương hiệu ${link.brand ?? 'chưa có dữ liệu'}.` }));
  return { ...picked, links };
}
export function auditMaskedRows(raw: unknown, links: readonly { revenue: number | null }[]) {
  const revenues = links.flatMap(l => l.revenue === null ? [] : [l.revenue]);
  const lowest = revenues.length ? Math.min(...revenues) : null;
  let maskedRows = 0, maskedAboveLowestPick = 0;
  const seen = new Set<string>(), stack: unknown[] = [raw];
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== 'object') continue;
    if (Array.isArray(node)) { for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]); continue; }
    const record = node as Record<string, unknown>, id = record.product_base_id;
    if (typeof id === 'string' && !seen.has(id)) {
      seen.add(id);
      if (id.startsWith('1__') && id.includes('[REDACTED')) {
        maskedRows++;
        // Coordinator R3 permits this one reading rule from private collectShopeeRows.
        // Ranking and filtering still run exclusively in the app's pickShopeeLinks.
        const value = record.revenue_custom ?? record.revenue, revenue = Number(value);
        if (value !== null && value !== undefined && value !== '' && Number.isFinite(revenue) && revenue >= 0 &&
            (lowest === null || revenue > lowest)) maskedAboveLowestPick++;
      }
    }
    const values = Object.values(record);
    for (let i = values.length - 1; i >= 0; i--) stack.push(values[i]);
  }
  return { maskedRows, maskedAboveLowestPick };
}
const LINK_CHECK_BASIS = 'm2/link-check-basis.json';
type LinkCheckBasis = { metricInputSha256: string; policySha256: string };
/** The collection policy part that changes a link verdict: mode and stars. */
export const linkPolicySha256 = (policy: { mode: string; stars: readonly number[] } | null): string =>
  sha256(canonicalJson(policy ? { mode: policy.mode, stars: [...policy.stars] } : null));
async function readLinkVerdicts(run: string, name: string): Promise<LinkCheckEntry[] | null> {
  try {
    const value = object(await readJson(run, name));
    const log = { format: 'link-check-log-v1', runId: value.runId, entries: value.entries };
    await validateModuleValue('link-check-log-v1', log);
    return log.runId === basename(run) ? log.entries as LinkCheckEntry[] : null;
  } catch { return null; }
}
/**
 * Sidecar `m2/link-check-basis.json` (link-check-basis-v1) names the basis every entry in `m2/link-checks.json`
 * was made on, and keeps the verdicts of earlier attempts on that basis. Invariant: while the sidecar names basis X,
 * every log entry was made on X. Same basis: save the union first, then reset the log. Other basis: reset the log
 * first, then name the new basis. Only verdicts are ever logged, so stops (login, verification, failure, deadline)
 * are never reused.
 */
async function prepareLinkCheckRetry(run: string, basis: LinkCheckBasis, resetLog: () => Promise<void>):
    Promise<Map<string, LinkCheckEntry>> {
  let saved: Record<string, unknown> | null;
  try { saved = object(await readJson(run, LINK_CHECK_BASIS)); } catch { saved = null; }
  const same = saved?.format === 'link-check-basis-v1' && saved.runId === basename(run) &&
    saved.metricInputSha256 === basis.metricInputSha256 && saved.policySha256 === basis.policySha256;
  const reuse = new Map<string, LinkCheckEntry>();
  if (same) {
    for (const entry of [...(await readLinkVerdicts(run, LINK_CHECK_BASIS) ?? []), ...(await readLinkVerdicts(run, 'm2/link-checks.json') ?? [])])
      reuse.set(entry.productBaseId, entry);
  }
  const writeBasis = async () => {
    const entries = [...reuse.values()];
    await validateModuleValue('link-check-log-v1', { format: 'link-check-log-v1', runId: basename(run), entries });
    await atomicJson(run, LINK_CHECK_BASIS, { format: 'link-check-basis-v1', runId: basename(run), ...basis, entries });
  };
  await unlink(await safePath(run, 'm2/selection.json')).catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  });
  if (same) { await writeBasis(); await resetLog(); }
  else { await resetLog(); await writeBasis(); }
  return reuse;
}
/** `jev` gives the Jev client for a v2 run; only the command line below builds the real one. */
export async function main(runDir: string, options: { jev?: () => PickJev; sleep?: (ms: number) => Promise<void>;
    linkCollector?: () => LinkCollector } = {}) {
  const run = resolve(runDir);
  const metricInputSha256 = await prerequisite(run, 'm1');
  const request = await readRequest(run);
  const source = await readPickSource(run, request);
  let picked, selection;
  if (request.selectionPolicy) {
    if (!source.part || !source.rawBytes) throw new ModuleError('PICK_WINDOW_MISSING');
    let linkChecksSha256: string | null = null;
    try {
      if (request.selectionPolicy === MODULE_PICK_POLICY_V2 || request.selectionPolicy === MODULE_PICK_POLICY_V3) {
        const publishLog = async (entries: readonly LinkCheckEntry[]) => {
          const log = { format: 'link-check-log-v1', runId: basename(run), entries };
          await validateModuleValue('link-check-log-v1', log);
          await atomicJson(run, 'm2/link-checks.json', log);
        };
        // A retry drops the previous selection before starting a fresh log, so the two are never out of
        // step: a crash between them leaves an unbound log, never an old selection bound to an empty one.
        // Verdicts made on the same basis (step-1 input and collection policy) are kept for reuse first.
        const reuse = await prepareLinkCheckRetry(run, { metricInputSha256, policySha256: linkPolicySha256(request.collectionPolicy) },
          () => publishLog([]));
        const clock = () => new Date();
        // One deadline for this attempt's whole count work, reconciliation included. Contract F644 scales it
        // with the number of links this selection may still check; an absent productSelection stays at five.
        const selection = request.productSelection;
        const reusedResults = new Map([...reuse].map(([id, entry]) => [id, entry.result]));
        const deadline = clock().getTime() + linkCheckBudgetMs(linksToCheckCount(source.raw, source.part, selection, reusedResults));
        const collector = options.linkCollector ? options.linkCollector() : null;
        if (!collector) throw new ModuleError('LINK_CHECK_FAILED');
        // Count-job journals live with the run: an unresolved one is reconciled here before any new submission.
        const journalDir = join(run, 'm2/link-check-journal');
        await reconcileLinkJournals({ collector, journalDir, deadline, now: clock });
        // Each completed verdict is published before the next check starts, so an interrupted walk keeps it.
        const { check } = createM2LinkCheck({ collector, policy: request.collectionPolicy, journalDir, deadline, now: clock, publish: publishLog, reuse });
        // v3 (contract F656): no Jev and no duplicate filter, so it never needs the Jev key.
        if (request.selectionPolicy === MODULE_PICK_POLICY_V3)
          picked = await deriveTopProductPick(source.raw, source.part, sha256(source.rawBytes), check, selection);
        else if (selection?.mode === 'all') picked = await pickAllShopeeProducts(source.raw, source.part, sha256(source.rawBytes), check, selection);
        else {
          let jev: PickJev;
          try { jev = options.jev!(); } catch { throw new ModuleError('PICK_JEV_UNAVAILABLE'); }
          picked = await pickProductsWithJev(source.raw, source.part, sha256(source.rawBytes), jev, options.sleep, check, selection);
        }
        // Only a published selection binds the log's digest.
        linkChecksSha256 = await hashFile(run, 'm2/link-checks.json');
      } else picked = derivePeriodProductPick(source.raw, source.part, sha256(source.rawBytes));
    } catch (error) {
      if (error instanceof ModuleError) throw error;
      if (error instanceof LinkCheckStop) throw new ModuleError(error.code);
      throw new ModuleError(error instanceof ProductPickError ? error.message : 'PICK_CANDIDATE_INVALID');
    }
    selection = { format: 'selection-v1', runId: basename(run), source: 'auto',
      pickRuleVersion: picked.pickRuleVersion, metricInputSha256, links: picked.links, counts: picked.counts,
      selectionProof: linkChecksSha256 === null ? picked.selectionProof : { ...picked.selectionProof, linkChecksSha256 } };
  } else {
    const legacy = derivePickCandidate(source.raw, request.keywords, request.principalTitles);
    picked = { ...legacy, counts: { ...legacy.counts, ...auditMaskedRows(source.raw, legacy.links) } };
    selection = { format: 'selection-v1', runId: basename(run), source: 'auto',
      pickRuleVersion: picked.pickRuleVersion, metricInputSha256, links: picked.links, counts: picked.counts };
  }
  const counts = picked.counts;
  await validateModuleValue('selection-v1', selection);
  if (await prerequisite(run, 'm1') !== metricInputSha256) throw new ModuleError('GATE_INPUT_CHANGED', 23);
  await atomicJson(run, 'm2/selection.json', selection);
  const errorCode = 'selectionProof' in selection ? selection.selectionProof.shortageReason : null;
  return { format: 'module-script-result-v1', verdict: errorCode ? 'FAIL' : 'PASS', errorCode, exitCode: errorCode ? 20 : 0,
    runId: basename(run), metricInputSha256, pickedIds: picked.links.map(l => l.productBaseId),
    reasonsPresent: picked.links.filter(l => l.reason.trim()).length, counts };
}
export function failureResult(error: unknown) {
  return { format: 'module-script-result-v1', verdict: 'FAIL', errorCode: error instanceof ModuleError ? error.code : 'MODULE_FAILED',
    exitCode: error instanceof ModuleError ? error.exitCode : 20 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv.length === 3 ? main(process.argv[2]!, { jev: pickJevFromEnvironment, linkCollector: linkCollectorFromEnvironment }) : Promise.reject(new ModuleError('USAGE', 2));
  void task.catch(failureResult).then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.exitCode; });
}

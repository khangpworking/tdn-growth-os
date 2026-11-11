import { createHash, randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { deriveIncludeTerms, pickShopeeLinks } from '../src/modules/analysis/research-automation/autorun-derive.js';
import { usedScope, type AutorunScopeRecord } from '../src/modules/analysis/research-automation/autorun-scope.js';
import { CAPTURE_ROW_PROFILE } from '../src/modules/analysis/research-automation/capture-row-quality.js';
import { validateMetricV3CaptureSpec } from '../src/modules/analysis/research-automation/metric-v3-capture-spec.js';
import specSchema from '../contracts/analysis/metric-v3-capture-spec.schema.json' with { type: 'json' };
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
  return digest;
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
ajv.addSchema(specSchema); ajv.addSchema(legacySpecSchema); ajv.addSchema(requestV1Schema); ajv.addSchema(samplingSchema);
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
  const keywords = object(value.preset).keywords as string[];
  const windows = value.windows as { id: string; period: { startDate: string; endDate: string } }[];
  if (captureSpec && (windows.length !== captureSpec.windows.length || JSON.stringify(keywords) !== JSON.stringify(captureSpec.preset.keywords) || windows.some((w, i) =>
      w.id !== captureSpec.windows[i]?.id || w.period.startDate !== captureSpec.windows[i]?.period.startDate ||
      w.period.endDate !== captureSpec.windows[i]?.period.endDate))) throw new ModuleError('CAPTURE_SPEC_MISMATCH');
  return { keywords, principalTitles: (value.principalTitles ?? []) as string[], reviewCapPerLink: collectionPolicy?.totalPerLink ?? value.reviewCapPerLink as number, collectionPolicy, captureSpec };
}
export async function pickRaw(run: string): Promise<unknown> {
  let scope: AutorunScopeRecord | null = null;
  try { scope = await readJson(run, 'm1/scope.json') as AutorunScopeRecord; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const legacy = usedScope(scope)?.captureNumber === 2 ? 'run2' : 'run1';
  try { return await readJson(run, `m1/${legacy}/raw-responses.json`); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
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
  const config = object(await readJson(repoRoot, 'skills/tdn-shopee-flow/modules.json'));
  const rule = object(object(config.params).pickWindow);
  const ref = refs.map(object).find(r => r.window === rule.preset);
  if (!ref || typeof ref.window !== 'string' || ref.path !== `${ref.window}/manifest.json`) throw new ModuleError('PICK_WINDOW_MISSING');
  return readJson(run, `${prefix}/${ref.window}/raw-responses.json`);
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
export async function main(runDir: string) {
  const run = resolve(runDir);
  const metricInputSha256 = await prerequisite(run, 'm1');
  const request = await readRequest(run);
  const raw = await pickRaw(run);
  const picked = derivePickCandidate(raw, request.keywords, request.principalTitles);
  const counts = { ...picked.counts, ...auditMaskedRows(raw, picked.links) };
  const selection = { format: 'selection-v1', runId: basename(run), source: 'auto',
    pickRuleVersion: picked.pickRuleVersion, metricInputSha256, links: picked.links, counts };
  await validateModuleValue('selection-v1', selection);
  if (await prerequisite(run, 'm1') !== metricInputSha256) throw new ModuleError('GATE_INPUT_CHANGED', 23);
  await atomicJson(run, 'm2/selection.json', selection);
  return { format: 'module-script-result-v1', verdict: 'PASS', errorCode: null, exitCode: 0,
    runId: basename(run), metricInputSha256, pickedIds: picked.links.map(l => l.productBaseId),
    reasonsPresent: picked.links.filter(l => l.reason.trim()).length, counts };
}
export function failureResult(error: unknown) {
  return { format: 'module-script-result-v1', verdict: 'FAIL', errorCode: error instanceof ModuleError ? error.code : 'MODULE_FAILED',
    exitCode: error instanceof ModuleError ? error.exitCode : 20 };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const task = process.argv.length === 3 ? main(process.argv[2]!) : Promise.reject(new ModuleError('USAGE', 2));
  void task.catch(failureResult).then(result => { process.stdout.write(`${JSON.stringify(result)}\n`); process.exitCode = result.exitCode; });
}

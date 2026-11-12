import { createRequire } from 'node:module';
import { lstat, readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import evidenceSchema from '../contracts/analysis/metric-v3-evidence-v2.schema.json' with { type: 'json' };
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { ModuleError, hashFile, hashFolder, object, prerequisite, readJson, readPickSource, readRequest, safePath, sha256, validateModuleValue } from './module-pick.js';
import { MODULE_PICK_POLICY, ProductPickError, derivePeriodProductPick, rankedMetricProducts } from './module-product-pick.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
const validateEvidence = ajv.compile(evidenceSchema);
const MAX_BYTES = 64 * 1024 * 1024;
type Kind = 'full-page' | 'top-products' | 'raw';
type Source = Awaited<ReturnType<typeof readPickSource>>;
const code = (error: unknown) => error instanceof ModuleError ? error.code :
  error instanceof ProductPickError ? error.message : 'MODULE_OUTPUT_INVALID';
const unavailable = (kind: Kind, errorCode: string) => ({ available: false, kind, sha256: null as string | null,
  byteSize: null as number | null, mediaType: null as string | null, fileName: null as string | null, errorCode: errorCode as string | null });
const absentFiles = (error: string) => ({ fullPage: { descriptor: unavailable('full-page', error), path: null as string | null },
  topProducts: { descriptor: unavailable('top-products', error), path: null as string | null, coverage: [] as {sourceRank: number; productBaseId: string}[] },
  raw: { descriptor: unavailable('raw', error), path: null as string | null } });

async function boundedRead(run: string, path: string): Promise<Buffer> {
  const target = await safePath(run, path), info = await lstat(target);
  if (!info.isFile() || info.size < 1 || info.size > MAX_BYTES) throw new ModuleError('EVIDENCE_FILE_INVALID');
  const bytes = await readFile(target);
  if (bytes.length !== info.size || bytes.length > MAX_BYTES) throw new ModuleError('EVIDENCE_FILE_INVALID');
  return bytes;
}
async function frozenRequest(run: string) {
  const request = await readRequest(run);
  const tracking = object(await readJson(run, 'run-tracking.json').catch(error => {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }));
  if (tracking.requestSha256 !== undefined && (tracking.runId !== basename(run) || tracking.requestSha256 !== await hashFile(run, 'request.json')))
    throw new ModuleError('RUN_TRACKING_CHANGED');
  return request;
}

async function evidenceFiles(run: string, source: Source, request: Awaited<ReturnType<typeof readRequest>>) {
  if (!source.prefix || !source.part || !source.rawBytes || !request.selectionPolicy)
    return absentFiles('LEGACY_EVIDENCE_UNBOUND');
  const window = object(source.part.window), root = `${source.prefix}/${String(window.id)}`;
  const files = absentFiles('EVIDENCE_FILES_MISSING');
  const rawPath = `${root}/raw-responses.json`;
  const rawBytes = await boundedRead(run, rawPath);
  if (sha256(rawBytes) !== sha256(source.rawBytes)) throw new ModuleError('CAPTURE_HASH_MISMATCH');
  files.raw = { descriptor: { available: true, kind: 'raw', sha256: sha256(rawBytes), byteSize: rawBytes.length,
    mediaType: 'application/json', fileName: 'raw-responses.json', errorCode: null }, path: rawPath };
  let value;
  try { value = object(await readJson(run, `${root}/evidence/manifest.json`)); }
  catch { return files; }
  const mismatch = () => {
    files.fullPage.descriptor = unavailable('full-page', 'EVIDENCE_IDENTITY_MISMATCH');
    files.topProducts.descriptor = unavailable('top-products', 'EVIDENCE_IDENTITY_MISMATCH');
    return files;
  };
  if (!validateEvidence(value) || value.runId !== basename(run) || value.requestSha256 !== await hashFile(run, 'request.json') ||
      value.specDigest !== source.part.specDigest || value.captureId !== source.part.captureId ||
      value.windowId !== window.id || value.capturedAt !== source.part.capturedAt) return mismatch();
  if (value.status === 'FAILED') {
    files.fullPage.descriptor = unavailable('full-page', String(value.code));
    files.topProducts.descriptor = unavailable('top-products', String(value.code));
    return files;
  }
  if (canonicalJson(value.period) !== canonicalJson(window.period) || canonicalJson(value.keywords) !== canonicalJson(object(source.part.appliedState).keywords) ||
      object(value.rawResponses).path !== 'raw-responses.json' || object(value.rawResponses).sha256 !== sha256(source.rawBytes) || object(value.rawResponses).byteSize !== source.rawBytes.length)
    return mismatch();
  // The retained duplicate must really match the capture, not merely advertise its digest.
  try {
    const copy = await boundedRead(run, `${root}/evidence/raw-responses.json`);
    if (sha256(copy) !== sha256(source.rawBytes)) return mismatch();
  } catch { return mismatch(); }
  const verifiedFile = async (kind: Kind, ref: unknown, path: string, fileName: string) => {
    try {
      const info = object(ref);
      if (info.path !== path) throw new ModuleError('EVIDENCE_FILE_INVALID');
      const relative = `${root}/evidence/${path}`, bytes = await boundedRead(run, relative);
      if (sha256(bytes) !== info.sha256 || bytes.length !== info.byteSize) throw new ModuleError('EVIDENCE_HASH_MISMATCH');
      return { descriptor: { available: true, kind, sha256: sha256(bytes), byteSize: bytes.length,
        mediaType: 'image/png', fileName, errorCode: null }, path: relative };
    } catch (error) { return { descriptor: unavailable(kind, code(error)), path: null }; }
  };
  if (value.fullPage) files.fullPage = await verifiedFile('full-page', value.fullPage, 'full-page.png', 'full-page.png');
  else files.fullPage.descriptor = unavailable('full-page', typeof value.code === 'string' ? value.code : 'EVIDENCE_SCREENSHOT_UNAVAILABLE');
  const proof = object(value.topProductsProof);
  if (proof.status !== 'AVAILABLE') {
    files.topProducts.descriptor = unavailable('top-products', typeof proof.code === 'string' ? proof.code : 'EVIDENCE_RANK_NOT_COVERED');
    return files;
  }
  let rows;
  try { rows = rankedMetricProducts(source.raw, source.part).rows; }
  catch (error) { files.topProducts.descriptor = unavailable('top-products', code(error)); return files; }
  const coverage = proof.candidates as {sourceRank: number; productBaseId: string}[];
  const ranks = coverage.map(c => c.sourceRank);
  if (proof.code !== null || !/^(Top Products|Top sản phẩm|Sản phẩm bán chạy)$/i.test(String(proof.title)) ||
      !/^(Revenue in time period|Revenue|Doanh số trong kỳ|Doanh số)$/i.test(String(proof.metricLabel)) ||
      !/^(Descending|Giảm dần)$/i.test(String(proof.orderLabel)) || proof.candidateCount !== rows.length ||
      !coverage.length || new Set(ranks).size !== ranks.length || coverage.some((c, i) =>
        rows[c.sourceRank - 1]?.product_base_id !== c.productBaseId || (i > 0 && c.sourceRank <= ranks[i - 1]!))) {
    files.topProducts.descriptor = unavailable('top-products', 'EVIDENCE_RANK_NOT_COVERED');
    return files;
  }
  const sections = value.sections as Record<string, unknown>[];
  const panel = sections.filter(s => s.sectionKey === 'top-products');
  if (panel.length === 1 && files.fullPage.descriptor.available)
    files.topProducts = { ...await verifiedFile('top-products', panel[0], 'sections/top-products.png', 'top-products.png'), coverage };
  else files.topProducts.descriptor = unavailable('top-products', 'EVIDENCE_PRODUCTS_PANEL_MISSING');
  return files;
}

export async function verifyModuleCapture(run: string) {
  const request = await frozenRequest(run), source = await readPickSource(run, request);
  if (!source.part && request.selectionPolicy) throw new ModuleError('CAPTURE_FILES_MISSING');
  if (request.selectionPolicy && source.part) rankedMetricProducts(source.raw, source.part);
  return { request, source };
}

export async function verifyModuleSelection(run: string) {
  const { request, source } = await verifyModuleCapture(run);
  if (request.selectionPolicy !== MODULE_PICK_POLICY || !source.part || !source.rawBytes) throw new ModuleError('PICK_POLICY_MISMATCH');
  const metricInputSha256 = await prerequisite(run, 'm1');
  const selection = object(await readJson(run, 'm2/selection.json'));
  await validateModuleValue('selection-v1', selection);
  const expected = derivePeriodProductPick(source.raw, source.part, sha256(source.rawBytes));
  const exact = { format: 'selection-v1', runId: basename(run), source: 'auto', pickRuleVersion: MODULE_PICK_POLICY,
    metricInputSha256, links: expected.links, counts: expected.counts, selectionProof: expected.selectionProof };
  if (canonicalJson(selection) !== canonicalJson(exact)) throw new ModuleError('PICK_PROOF_MISMATCH');
  const files = await evidenceFiles(run, source, request);
  const fiveDistinct = expected.links.length === 5 && expected.selectionProof.unresolvedCount === 0;
  const panelCovered = files.topProducts.descriptor.available && expected.links.every(l =>
    files.topProducts.coverage.some(c => c.sourceRank === l.sourceRank && c.productBaseId === l.productBaseId));
  return { linksMatchSourceOrder: true, fiveDistinct, selectedCount: expected.links.length,
    shortageReason: expected.selectionProof.shortageReason,
    errorCode: expected.selectionProof.shortageReason ?? files.topProducts.descriptor.errorCode ?? (panelCovered ? null : 'EVIDENCE_RANK_NOT_COVERED'),
    links: expected.links, skipped: expected.selectionProof.skipped, panelCovered };
}

type Row = Record<string, unknown>;
// Legacy captures have no source map; their products are read only when exactly one products response was saved.
function productsPart(raw: unknown, part: Row | null): Row | null {
  if (part) return part;
  const found = Array.isArray(raw) ? raw.flatMap((r, i) => r && typeof r === 'object' && (r as Row).urlPath === '/v2/market/analytics/products/' ? [i] : []) : [];
  return found.length === 1 ? { sourceMap: { products: `raw-responses.json#/${found[0]}/body/data` } } : null;
}
function revenueOrderDescending(raw: unknown, part: Row | null): boolean | null {
  const ref = productsPart(raw, part);
  if (!ref) return null;
  try { rankedMetricProducts(raw, ref); return true; }
  catch (error) { return error instanceof ProductPickError && error.orderBroken ? false : null; }
}
function savedProductRows(raw: unknown, part: Row | null): unknown[] | null {
  const map = productsPart(raw, part)?.sourceMap as Row | undefined;
  const pointer = /^raw-responses\.json#\/(\d+)\/body\/data$/.exec(String(map?.products));
  const response = pointer && Array.isArray(raw) ? raw[Number(pointer[1])] as Row | undefined : undefined;
  const products = ((response?.body as Row | undefined)?.data as Row | undefined)?.products;
  return Array.isArray(products) ? products : null;
}
const text = (value: unknown) => typeof value === 'string' && value.trim() ? value : null;
const amount = (value: unknown) => {
  const n = typeof value === 'number' ? value : typeof value === 'string' && /^\d+(?:\.\d+)?$/.test(value) ? Number(value) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
};
const isRow = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
/** The link's row in the saved products response, copied as stored; null when the row is not there.
 *  The rank is the row's 1-based position in the saved response, malformed entries included. */
function metricProduct(rows: unknown[] | null, id: unknown) {
  const index = rows && typeof id === 'string' ? rows.findIndex(r => isRow(r) && r.product_base_id === id) : -1;
  if (index < 0) return null;
  const row = rows![index] as Row;
  const categories = Array.isArray(row.final_categories) ? row.final_categories.flatMap(c =>
    c && typeof c === 'object' && text((c as Row).name) ? [(c as Row).name as string] : []) : [];
  return { rank: index + 1, productName: text(row.product_name), shopName: text(row.shop_name),
    officialType: Number.isInteger(row.official_type) ? row.official_type as number : null, brand: text(row.final_brand),
    categories: categories.length ? categories : null, price: amount(row.price), priceMin: amount(row.price_min),
    priceMax: amount(row.price_max), periodRevenue: amount(row.revenue_custom), previousRevenue: amount(row.previous_revenue_custom),
    periodSold: amount(row.order_custom), previousSold: amount(row.previous_order_custom), totalRevenue: amount(row.revenue),
    totalSold: amount(row.order_count), ratingAvg: amount(row.rating_avg), ratingCount: amount(row.rating_count),
    listedAt: text(row.platform_created_at) };
}

function countShopeeRows(raw: unknown): number {
  const ids = new Set<string>(), stack = [raw];
  while (stack.length) {
    const next = stack.pop();
    if (Array.isArray(next)) stack.push(...next);
    else if (next && typeof next === 'object') {
      const row = next as Record<string, unknown>;
      if (typeof row.product_base_id === 'string' && row.product_base_id.startsWith('1__')) ids.add(row.product_base_id);
      stack.push(...Object.values(row));
    }
  }
  return ids.size;
}
export async function moduleOutputs(runArg: string) {
  const run = resolve(runArg), runId = basename(run);
  const request = await frozenRequest(run);
  const m1 = { captureSuccess: null as boolean | null, dataValid: null as boolean | null, errorCode: null as string | null,
    keywords: request.keywords, period: request.captureSpec?.windows[0]?.period ?? null, shopeeRowCount: null as number | null,
    revenueOrderDescending: null as boolean | null,
    evidence: { fullPage: unavailable('full-page', 'CAPTURE_FILES_MISSING'), raw: unavailable('raw', 'CAPTURE_FILES_MISSING') } };
  let files = absentFiles('CAPTURE_FILES_MISSING');
  let productRows: unknown[] | null = null;
  try {
    const source = await readPickSource(run, request);
    m1.captureSuccess = source.part ? source.part.captureGate === 'PASSED' : null;
    m1.revenueOrderDescending = revenueOrderDescending(source.raw, source.part);
    productRows = savedProductRows(source.raw, source.part);
    files = await evidenceFiles(run, source, request);
    m1.evidence = { fullPage: files.fullPage.descriptor, raw: files.raw.descriptor };
    try {
      const rows = request.selectionPolicy && source.part ? rankedMetricProducts(source.raw, source.part).rows : null;
      m1.shopeeRowCount = rows ? rows.filter(r => typeof r.product_base_id === 'string' && r.product_base_id.startsWith('1__')).length : countShopeeRows(source.raw);
      m1.dataValid = m1.shopeeRowCount > 0;
      m1.errorCode = m1.dataValid ? null : 'CAPTURE_SHOPEE_ROWS_MISSING';
    } catch (error) { m1.dataValid = false; m1.errorCode = code(error); }
    if (!request.selectionPolicy) {
      try {
        await prerequisite(run, 'm1');
        const gate = object(await readJson(run, 'gates/m1.json'));
        const success = (Array.isArray(gate.checks) ? gate.checks : []).find(c => c && typeof c === 'object' && c.id === 'capture_success');
        if (success && typeof success.ok === 'boolean') m1.captureSuccess = success.ok;
      } catch (error) { m1.dataValid = null; m1.errorCode = code(error); }
    }
  } catch (error) {
    m1.dataValid = false;
    m1.errorCode = (error as NodeJS.ErrnoException).code === 'ENOENT' ? 'CAPTURE_FILES_MISSING' : code(error);
    if (m1.errorCode === 'CAPTURE_FILES_MISSING') m1.dataValid = null;
    files = absentFiles(m1.errorCode);
    m1.evidence = { fullPage: files.fullPage.descriptor, raw: files.raw.descriptor };
  }
  let selectionError: string | null = null;
  const selection = await readJson(run, 'm2/selection.json').catch(error => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') selectionError = code(error);
    return null;
  });
  const m2 = { policy: request.selectionPolicy ?? 'legacy', legacyVerdict: null as string | null,
    linksMatchSourceOrder: null as boolean | null, fiveDistinct: null as boolean | null, selectedCount: null as number | null,
    shortageReason: null as string | null, errorCode: (selectionError ?? 'SELECTION_MISSING') as string | null,
    links: [] as Record<string, unknown>[], skipped: [] as unknown[], evidence: { topProducts: files.topProducts.descriptor } };
  if (selection) {
    try {
      await validateModuleValue('selection-v1', selection);
      if (request.selectionPolicy) {
        const proof = await verifyModuleSelection(run);
        Object.assign(m2, proof);
        if (!proof.panelCovered && m2.evidence.topProducts.available)
          m2.evidence.topProducts = unavailable('top-products', 'EVIDENCE_RANK_NOT_COVERED');
      }
      else {
        const old = object(selection), gate = object(await readJson(run, 'gates/m2.json').catch(() => ({})));
        m2.links = (old.links as Record<string, unknown>[]).map(l => ({ ...l, sourceRank: null, productName: null,
          shopName: null, groupKey: null, groupingBasis: null }));
        m2.selectedCount = m2.links.length;
        m2.errorCode = null;
        if (gate.runId === runId && gate.module === 'M2' && gate.outputSha256 === await hashFile(run, 'm2/selection.json') &&
            (old.source === 'manual' || gate.inputSha256 === await hashFolder(run, 'm1')) &&
            ['PASS', 'FAIL', 'WAIT_OWNER'].includes(String(gate.verdict))) m2.legacyVerdict = String(gate.verdict);
      }
    } catch (error) { m2.errorCode = code(error); }
  }
  m2.links = m2.links.map(link => ({ ...link, metricProduct: metricProduct(productRows, link.productBaseId) }));
  // panelCovered is a gate-only result, not an undocumented desktop field.
  const { panelCovered: _covered, ...wireM2 } = m2 as typeof m2 & { panelCovered?: boolean };
  const wire = { format: 'module-outputs-v1', runId, m1, m2: wireM2 };
  await validateModuleValue('module-outputs-v1', wire);
  return wire;
}

export async function readModuleEvidence(runArg: string, kind: string, digest: string) {
  const run = resolve(runArg);
  if (!['full-page', 'top-products', 'raw'].includes(kind) || !/^[a-f0-9]{64}$/.test(digest)) throw new ModuleError('ARG_INVALID', 2);
  const request = await frozenRequest(run), source = await readPickSource(run, request);
  const files = await evidenceFiles(run, source, request);
  if (kind === 'top-products' && await readJson(run, 'm2/selection.json').catch(() => null)) {
    const proof = await verifyModuleSelection(run);
    if (!proof.panelCovered) throw new ModuleError('EVIDENCE_RANK_NOT_COVERED');
  }
  const file = files[kind === 'full-page' ? 'fullPage' : kind === 'top-products' ? 'topProducts' : 'raw'];
  if (!file.descriptor.available || !file.path) throw new ModuleError(file.descriptor.errorCode ?? 'EVIDENCE_FILES_MISSING');
  const bytes = await boundedRead(run, file.path);
  if (file.descriptor.sha256 !== digest || sha256(bytes) !== digest || bytes.length !== file.descriptor.byteSize)
    throw new ModuleError('EVIDENCE_HASH_MISMATCH');
  return bytes;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, run, kind, digest] = process.argv.slice(2);
  void (async () => {
    if (!run) throw new ModuleError('USAGE', 2);
    if (action === 'read') { process.stdout.write(await readModuleEvidence(run, kind ?? '', digest ?? '')); return; }
    const result = action === 'view' ? await moduleOutputs(run) : action === 'verify-capture'
      ? await verifyModuleCapture(run).then(() => ({ valid: true })) : action === 'verify-selection'
        ? await verifyModuleSelection(run) : null;
    if (!result) throw new ModuleError('USAGE', 2);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  })().catch(error => {
    if (action === 'read') process.stderr.write(`${code(error)}\n`);
    else process.stdout.write(`${JSON.stringify({ format: 'error-v1', code: code(error), message: code(error) })}\n`);
    process.exitCode = error instanceof ModuleError ? error.exitCode : 20;
  });
}

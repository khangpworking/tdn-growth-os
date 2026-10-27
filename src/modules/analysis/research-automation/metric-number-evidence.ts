import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/metric-v3-evidence.schema.json' with { type: 'json' };
import { canonicalJson } from '../../foundation/canonical-json.js';
import { V3_TEMPLATE_IDENTITY, v3Hash, v3Resolver, type V3Archive } from './metric-v3-report.js';
import type { MarketNumberTrace } from './market-trace-map.js';
import { metricEvidenceKey, type R2MetricEvidenceStore } from '../../../platform/artifacts/r2-metric-evidence.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
const validate = ajv.compile<any>(schema);
export type EvidenceStore = Pick<R2MetricEvidenceStore, 'put' | 'presignGet'>;
export type EvidenceRef = { captureId: string; sectionKey: string; jsonPath: string; source: 'raw-responses' | 'capture-settings' | 'template' };
export type EvidenceNumber = { numberRef: string; token: string; refs: EvidenceRef[] };
function captureSettings(m: V3Archive['windows'][number]['manifest']) {
  return { keywords: m.appliedState.keywords, category: m.appliedState.category, platforms: m.appliedState.platforms,
    period: m.window.period, smartQuery: m.appliedState.smartQuery ?? null, windowId: m.window.id, captureMethod: m.captureMethod ?? 'ui' };
}
export type EvidencePackage = { captureId: string; capturedAt: string; settings: ReturnType<typeof captureSettings>; manifest: any; status: 'UPLOADED' | 'LOCAL_ONLY' | 'FAILED'; code: string | null; files: Record<string, string> };
export type NumberEvidenceIndex = { contractVersion: 'metric-number-evidence-v1'; numbers: EvidenceNumber[]; packages: EvidencePackage[] };

/** A sidecar over the existing P4 trace: no HTML/trace mutation and no inference/model lookup. */
export function buildNumberEvidenceIndex(archive: V3Archive, trace: MarketNumberTrace, packages: EvidencePackage[]): NumberEvidenceIndex {
  const numbers = evidenceNumbers(archive, trace);
  const index: NumberEvidenceIndex = { contractVersion: 'metric-number-evidence-v1', numbers, packages };
  assertNumberEvidence(index, trace, archive);
  return index;
}

function evidenceNumbers(archive: V3Archive, trace: MarketNumberTrace): EvidenceNumber[] {
  return trace.entries.map((entry, i) => ({ numberRef: `n${i}`, token: entry.token, refs: entry.inputs.map(input => {
    if (!('store' in input)) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
    if (input.identity === V3_TEMPLATE_IDENTITY) return { captureId: archive.windows[0]!.manifest.captureId, sectionKey: 'search-settings', jsonPath: input.pointer, source: 'template' as const };
    const window = archive.windows.find(w => input.identity === w.rawSha || input.identity === v3Hash(canonicalJson(w.manifest)));
    if (!window) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
    if (input.identity !== window.rawSha) return { captureId: window.manifest.captureId, sectionKey: 'search-settings', jsonPath: input.pointer, source: 'capture-settings' as const };
    const endpoint = Object.entries(window.manifest.sourceMap as Record<string, string>).find(([, path]) => input.pointer.startsWith(path.split('#')[1]! + '/') || input.pointer === path.split('#')[1])?.[0];
    let sectionKey = ({ products: 'top-products', groups: 'top-brands', shops: 'top-shops', insight: 'trend-chart', 'search-basic': 'kpi' } as Record<string, string>)[endpoint ?? ''];
    if (endpoint === 'search-basic') {
      const match = /\/aggregations\/(\d+)/u.exec(input.pointer);
      const index = Number(input.pointer.split('/')[1]);
      const aggregation = match ? window.raw[index]?.body?.data?.search_basic?.aggregations?.[Number(match[1])]?.aggregation : '';
      if (/SHOP_TYPE/u.test(aggregation)) sectionKey = 'shop-types';
      else if (/PRICE_RANGE/u.test(aggregation)) sectionKey = 'price-bands';
      else if (/^(?:PREVIOUS_)?REVENUE_TOTAL_CUSTOM$/u.test(aggregation)) {
        // Complete overview totals (including prior-period comparisons) belong to the KPI cards.
        // Only revenue split by platform belongs to the sales-by-platform chart; counts also use
        // platform arrays in the source, so the storage shape alone cannot identify that chart.
        const platformsPath = input.pointer.slice(0, input.pointer.indexOf('/entity/platforms/')) + '/entity/platforms';
        const contributing = entry.inputs.flatMap(other => 'store' in other && other.identity === input.identity && other.pointer.startsWith(`${platformsPath}/`) ? [other] : []);
        const platformCount = window.raw[index]?.body?.data?.search_basic?.aggregations?.[Number(match![1])]?.entity?.platforms?.length;
        const revenueShare = entry.formulaId === 'share-percent' && contributing.some(other => other.role === 'part');
        if (revenueShare || new Set(contributing.map(other => other.pointer)).size < platformCount) sectionKey = 'platform-share';
      }
    }
    if (!sectionKey) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
    return { captureId: window.manifest.captureId, sectionKey, jsonPath: input.pointer, source: 'raw-responses' as const };
  }) }));
}

/** P5 extension: missing or changed refs block publication, independently of upload/image availability. */
export function assertNumberEvidence(index: NumberEvidenceIndex, trace: MarketNumberTrace, archive: V3Archive): void {
  const resolve = v3Resolver(archive);
  if (index.contractVersion !== 'metric-number-evidence-v1' || canonicalJson(index.numbers) !== canonicalJson(evidenceNumbers(archive, trace))) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
  const expected = trace.entries.map((entry, i) => ({ numberRef: `n${i}`, token: entry.token, inputs: entry.inputs }));
  if (index.numbers.length !== expected.length) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
  for (const [i, entry] of expected.entries()) {
    const number = index.numbers[i];
    if (!number || number.numberRef !== entry.numberRef || number.token !== entry.token || number.refs.length !== entry.inputs.length || !number.refs.length)
      throw new Error('V3_NUMBER_EVIDENCE_MISSING');
    for (const [j, input] of entry.inputs.entries()) {
      const ref = number.refs[j]!;
      const window = archive.windows.find(w => w.manifest.captureId === ref.captureId);
      if (!window || !index.packages.some(p => p.captureId === ref.captureId) || !schema.$defs.sectionKey.enum.includes(ref.sectionKey) ||
          !('store' in input) || input.pointer !== ref.jsonPath || resolve(input) === undefined ||
          (ref.source === 'template' ? input.identity !== V3_TEMPLATE_IDENTITY :
            ref.source === 'capture-settings' ? input.identity !== v3Hash(canonicalJson(window.manifest)) :
            ref.source !== 'raw-responses' || input.identity !== window.rawSha)) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
    }
  }
}

/** Retain local bytes first; verified R2 copies are best effort. Caller registers the returned artifacts in its publication transaction. */
export async function retainEvidencePackages(options: {
  dir: string; workspaceId: string; runId: string; archive: V3Archive; store?: EvidenceStore;
  retain(bytes: Buffer, mediaType: string): Promise<string>;
}): Promise<EvidencePackage[]> {
  const packages: EvidencePackage[] = [];
  for (const window of options.archive.windows) {
    const captureId = window.manifest.captureId;
    const pkg: EvidencePackage = { captureId, capturedAt: window.manifest.capturedAt, settings: captureSettings(window.manifest), manifest: null, status: 'FAILED', code: 'EVIDENCE_PACKAGE_MISSING', files: {} };
    packages.push(pkg);
    try {
      const dir = join(options.dir, window.manifest.window.id, 'evidence');
      const manifestBytes = await readFile(join(dir, 'manifest.json'));
      const m = JSON.parse(manifestBytes.toString('utf8'));
      if (!validate(m) || m.captureId !== captureId || m.capturedAt !== window.manifest.capturedAt || m.windowId !== window.manifest.window.id) throw new Error('EVIDENCE_MANIFEST_INVALID');
      const files: { path: string; bytes: Buffer; type: 'application/json' | 'image/png' }[] = [{ path: 'manifest.json', bytes: manifestBytes, type: 'application/json' }];
      if (m.status !== 'FAILED') {
        if (canonicalJson(m.period) !== canonicalJson(window.manifest.window.period) || canonicalJson(m.keywords) !== canonicalJson(window.manifest.appliedState.keywords) ||
            canonicalJson(m.category) !== canonicalJson(window.manifest.appliedState.category) || canonicalJson(m.platforms) !== canonicalJson(window.manifest.appliedState.platforms) || m.captureMethod !== (window.manifest.captureMethod ?? 'ui') || m.smartQuery !== (window.manifest.appliedState.smartQuery ?? null) || m.rawResponses.sha256 !== window.rawSha) throw new Error('EVIDENCE_MANIFEST_INVALID');
        if (m.rawResponses.path !== 'raw-responses.json' || new Set(m.sections.map((v: any) => v.sectionKey)).size !== m.sections.length ||
            m.sections.some((v: any) => v.path !== `sections/${v.sectionKey}.png`)) throw new Error('EVIDENCE_MANIFEST_INVALID');
        for (const file of [m.rawResponses, m.fullPage, ...m.sections].filter(Boolean)) {
          const bytes = await readFile(join(dir, file.path));
          if (bytes.length !== file.byteSize || v3Hash(bytes) !== file.sha256) throw new Error('EVIDENCE_HASH_MISMATCH');
          files.push({ path: file.path, bytes, type: file.path.endsWith('.png') ? 'image/png' : 'application/json' });
        }
      }
      pkg.manifest = m;
      for (const file of files) pkg.files[file.path] = await options.retain(file.bytes, file.type);
      pkg.status = m.status === 'FAILED' ? 'FAILED' : 'LOCAL_ONLY';
      pkg.code = m.code ?? (m.status === 'PARTIAL' ? 'EVIDENCE_SECTIONS_MISSING' : m.status === 'NO_IMAGES' ? 'EVIDENCE_IMAGES_UNAVAILABLE' : options.store ? null : 'EVIDENCE_R2_UNAVAILABLE');
      if (options.store) {
        try {
          for (const file of files) await options.store.put(metricEvidenceKey(options.workspaceId, options.runId, captureId, file.path), file.bytes, v3Hash(file.bytes), file.type);
          if (pkg.status !== 'FAILED') pkg.status = 'UPLOADED';
        } catch { if (pkg.status !== 'FAILED') { pkg.status = 'LOCAL_ONLY'; pkg.code = 'EVIDENCE_UPLOAD_FAILED'; } }
      }
    } catch { pkg.status = 'FAILED'; pkg.code = 'EVIDENCE_PACKAGE_INVALID_OR_MISSING'; }
  }
  return packages;
}

/** Resolve the first source section; all contributing refs remain available for computed numbers. */
export function explainEvidence(index: NumberEvidenceIndex, numberRef: string, workspaceId: string, runId: string, store?: EvidenceStore) {
  const number = index.numbers.find(n => n.numberRef === numberRef);
  if (!number) throw new Error('V3_NUMBER_REF_UNKNOWN');
  const ref = number.refs[0]!;
  const pkg = index.packages.find(p => p.captureId === ref.captureId);
  if (!pkg) throw new Error('V3_NUMBER_EVIDENCE_MISSING');
  const m = pkg.manifest;
  const section = m?.sections?.find((s: any) => s.sectionKey === ref.sectionKey);
  const urls = ref.source !== 'template' && pkg.status === 'UPLOADED' && section && m.fullPage && store ? {
    section: store.presignGet(metricEvidenceKey(workspaceId, runId, ref.captureId, section.path)),
    fullPage: store.presignGet(metricEvidenceKey(workspaceId, runId, ref.captureId, m.fullPage.path)),
  } : null;
  return { numberRef, token: number.token, refs: number.refs, source: ref.source, sectionName: ref.source === 'template' ? 'Report template' : section?.sectionName ?? ref.sectionKey,
    capturedAt: pkg.capturedAt, settings: { ...pkg.settings, adapterVersion: m?.adapterVersion ?? null },
    evidenceStatus: pkg.status, code: ref.source === 'template' ? 'EVIDENCE_TEMPLATE_NUMBER' : urls ? pkg.code : pkg.code ?? 'EVIDENCE_IMAGES_UNAVAILABLE', urls };
}

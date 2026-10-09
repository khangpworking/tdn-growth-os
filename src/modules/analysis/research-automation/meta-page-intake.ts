import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import sourceSchema from '../../../../contracts/analysis/meta-page-source-v1.schema.json' with { type: 'json' };
import apiSchema from '../../../../contracts/api/research-automation-meta-page-api.schema.json' with { type: 'json' };
import peersSchema from '../../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import l9Schema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import type { MetaPageBinding, MetaPageSelection, MetaPageSavedCapture, MetaPageProjection, MetaPageConfirmation, MetaPageLocatedLiteral, MetaPagePackageIdentity } from '../../../../contracts/analysis/meta-page-source-v1.generated.js';
import type { MetaPagePrepareRequest, MetaPageConfirmRequest, MetaPageSourceView } from '../../../../contracts/api/research-automation-meta-page-api.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageManifest } from '../../../../contracts/foundation/source-package-manifest.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import type { KeywordMeaningFilterData } from '../keyword-meaning-filter.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { filterKeywordMeanings } from '../keyword-meaning-filter.js';
import { filterSerpApiResults } from './serpapi-l9-filter.js';
import { checkMetaPageTarget } from './meta-page-capture.js';
import { MAX_JSON_ARTIFACT_BYTES } from './model.js';

export type { MetaPageBinding, MetaPageSelection, MetaPageSourceView };
export class MetaPageSourceRejection extends Error {
  constructor(readonly code: string) { super(code); }
}
const fail = (code: string): never => { throw new MetaPageSourceRejection(code); };
export const metaPageSha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const formats = require('ajv-formats') as typeof import('ajv-formats').default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); formats(ajv);
for (const schema of [sourceSchema, apiSchema, peersSchema, l9Schema]) ajv.addSchema(schema);
const validate = (name: string, value: unknown, api = false): void => {
  if (!ajv.getSchema(`${api ? apiSchema.$id : sourceSchema.$id}#/$defs/${name}`)!(value)) fail('META_CONTRACT_INVALID');
};
const BUDGET = { maxFileBytes: MAX_JSON_ARTIFACT_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const POLICY = json({ version: 'operator-located-visible-declarations-v1', dateFormat: 'YYYY-MM-DD',
  identity: 'EXACT_PAGE_AND_LIBRARY_ID', duplicate: 'IDENTICAL_LITERAL_DECLARATIONS_ONLY',
  authority: 'OPERATOR_DECLARATIONS_NOT_AUTHENTIC_DOM_OR_EFFECTIVENESS_EVIDENCE',
  age: 'UTC_CALENDAR_DAYS_TO_RETAINED_CAPTURE_DATE', runtime: 'UNAVAILABLE_OPENCLI_CONTRACT_MISSING' });
const PROFILES = new Map([
  ['profiles/meta-page-source-v1.schema.json', json(sourceSchema)],
  ['profiles/research-automation-meta-page-api.schema.json', json(apiSchema)],
  ['profiles/default-market-peers.schema.json', json(peersSchema)],
  ['profiles/keyword-meaning-filter.schema.json', json(l9Schema)],
  ['profiles/saved-capture-policy.json', POLICY],
]);
const PREPARED_PATHS = [...PROFILES.keys(), 'request/prepare.json', 'binding/source.json', 'capture/page.html', 'capture/visible.json', 'projection/ads.json'];
const CONFIRM_PATHS = [...PROFILES.keys(), 'request/confirm.json', 'binding/source.json', 'confirmation/owner.json'];
export function metaPagePackagePrefix(runId: string): string { return `automation-meta-page:${runId}-`; }
const packageKey = (runId: string, requestKey: string, kind: 'prepare' | 'confirm'): string => `${metaPagePackagePrefix(runId)}${kind}-${requestKey}`;
const identity = (p: VerifiedFinalizedSourcePackage): MetaPagePackageIdentity => ({ packageId: p.packageId,
  manifestSha256: p.manifestArtifactSha256, contentSha256: p.manifest.packageContentSha256 });
function parse(p: VerifiedFinalizedSourcePackage, path: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(member(p, path))); } catch { return fail('META_RETAINED_JSON_INVALID'); }
}
function member(p: VerifiedFinalizedSourcePackage, path: string): Buffer {
  return p.files.find(file => file.path === path)?.bytes ?? fail('META_MEMBER_MISSING');
}
function utf8(bytes: Uint8Array): string {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return fail('META_UTF8_INVALID'); }
}
function decode(value: string): Buffer {
  if (value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) fail('META_BASE64_INVALID');
  const bytes = Buffer.from(value, 'base64');
  if (!bytes.length || bytes.length > MAX_JSON_ARTIFACT_BYTES || bytes.toString('base64') !== value) fail('META_SOURCE_SIZE_INVALID');
  return bytes;
}
/** Only closed numeric page search URLs bind this saved-capture profile. No keyword ad search. */
export function validateMetaPageBinding(value: unknown): asserts value is MetaPageBinding {
  validate('binding', value); const b = value as MetaPageBinding;
  if (b.peerMember.identity.key !== b.selection.peerIdentityKey || b.search.captureId !== b.selection.searchCaptureId || b.search.position !== b.selection.searchPosition ||
      !b.peerMember.sources.length || /^0(?:\.0+)?$/.test(b.peerMember.revenue)) fail('META_PEER_OR_SEARCH_BINDING_INVALID');
  let url: URL;
  try { url = new URL(b.search.url); } catch { return fail('META_SEARCH_PAGE_INVALID'); }
  if (url.protocol !== 'https:' || !['www.facebook.com', 'facebook.com'].includes(url.hostname) || url.port || url.username || url.password || url.hash ||
      !((url.pathname === `/${b.selection.pageId}` || url.pathname === `/${b.selection.pageId}/`) && !url.search ||
        url.pathname === '/profile.php' && url.searchParams.getAll('id').length === 1 && url.searchParams.get('id') === b.selection.pageId && [...url.searchParams.keys()].every(key => key === 'id')))
    fail('META_SEARCH_PAGE_INVALID');
  const decision = filterSerpApiResults({ results: [b.search], filter: b.keywordData as KeywordMeaningFilterData }).result;
  if (!equal(b.searchDecision, decision) || decision.results[0]?.decision !== 'INCLUDED') fail('META_SEARCH_L9_NOT_INCLUDED');
}
function located(literal: MetaPageLocatedLiteral, html: Buffer): string {
  const { byteOffset, byteLength } = literal.span;
  if (!Number.isSafeInteger(byteOffset + byteLength) || byteOffset + byteLength > html.length || !html.subarray(byteOffset, byteOffset + byteLength).equals(Buffer.from(literal.value)))
    fail('META_LITERAL_LOCATOR_MISMATCH');
  return literal.value;
}
function date(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`)) || new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) !== value)
    fail('META_DATE_PROFILE_UNKNOWN');
  return value;
}
/** Pure projection of operator declarations. Never claims DOM extraction or delivery continuity. */
export function projectMetaPageCapture(binding: MetaPageBinding, html: Buffer, visibleBytes: Buffer): { capture: MetaPageSavedCapture; projection: MetaPageProjection } {
  validateMetaPageBinding(binding); utf8(html);
  if (!html.length || html.length > BUDGET.maxFileBytes || !visibleBytes.length || visibleBytes.length > BUDGET.maxFileBytes) fail('META_SOURCE_SIZE_INVALID');
  let capture: MetaPageSavedCapture;
  try { capture = JSON.parse(utf8(visibleBytes)) as MetaPageSavedCapture; } catch { return fail('META_CAPTURE_JSON_INVALID'); }
  validate('capture', capture);
  const bindingSha256 = metaPageSha256(json(binding));
  try { checkMetaPageTarget({ pageId: capture.pageId, libraryUrl: capture.libraryUrl, bindingSha256 }); }
  catch { return fail('META_PAGE_URL_INVALID'); }
  if (capture.pageId !== binding.selection.pageId || capture.htmlSha256 !== metaPageSha256(html)) fail('META_PAGE_SOURCE_BINDING_MISMATCH');
  const captureDate = new Date(capture.capturedAt).toISOString().slice(0, 10);
  const observations: MetaPageProjection['observations'] = [], seen = new Map<string, unknown>(); let duplicates = 0;
  for (const ad of capture.ads) {
    const values = Object.fromEntries(Object.entries(ad).map(([key, value]) => [key, value === null ? null : Array.isArray(value) ? value.map(v => located(v, html)) : located(value, html)])) as Record<string, string | string[] | null>;
    const libraryId = values.libraryId as string, pageId = values.pageId as string;
    if (!/^[1-9][0-9]{0,29}$/.test(libraryId) || pageId !== capture.pageId || !(values.pageName as string).trim()) fail('META_AD_IDENTITY_INVALID');
    const expectedLink = `https://www.facebook.com/ads/library/?id=${libraryId}`;
    if (values.libraryLink !== expectedLink) fail('META_AD_LINK_INVALID');
    const prior = seen.get(libraryId);
    if (prior) { if (!equal(prior, values)) fail('META_DUPLICATE_AD_CONFLICT'); duplicates++; continue; }
    seen.set(libraryId, values);
    const start = date(values.startDate as string), stop = values.stopDate === null ? null : date(values.stopDate as string);
    if (start > captureDate || stop !== null && (stop < start || stop > captureDate)) fail('META_DATE_BINDING_INVALID');
    const status = values.status as string;
    observations.push({ libraryId, libraryLink: expectedLink, pageId, pageName: values.pageName as string, startDateLiteral: values.startDate as string,
      startDate: start, stopDateLiteral: values.stopDate as string | null, stopDate: stop, statusLiteral: status,
      status: status === 'Active' ? 'ACTIVE' : status === 'Inactive' ? 'INACTIVE' : 'UNKNOWN', platforms: values.platforms as string[] | null,
      versionCountLiteral: values.versionCount as string | null, spendRangeLiteral: values.spendRange as string | null,
      impressionRangeLiteral: values.impressionRange as string | null, textFirst200: Array.from(values.text as string).slice(0, 200).join(''),
      ageDaysToCapture: (Date.parse(`${captureDate}T00:00:00.000Z`) - Date.parse(`${start}T00:00:00.000Z`)) / 86400000 });
  }
  const adFilter = filterKeywordMeanings(binding.keywordData as KeywordMeaningFilterData, observations.map(ad => ({ recordId: ad.libraryId, text: ad.textFirst200, contextText: null })));
  const projection: MetaPageProjection = { contractVersion: 'meta-page-projection-v1', bindingSha256, htmlSha256: capture.htmlSha256,
    captureSha256: metaPageSha256(visibleBytes), capturedAt: capture.capturedAt, pageId: capture.pageId, observations, adFilter,
    includedLibraryIds: adFilter.results.filter(v => v.decision === 'INCLUDED').map(v => v.recordId), duplicateObservations: duplicates,
    limitations: 'OPERATOR_DECLARATIONS_NOT_AUTHENTIC_DOM_OR_EFFECTIVENESS_EVIDENCE' };
  validate('projection', projection); return { capture, projection };
}

/** Attachment mechanics only; the owning application resolves authentic peers/search and policy. */
export class AutomationMetaPageIntake {
  readonly #packages: SourcePackageService; readonly #reader: FoundationSourcePackageReader;
  constructor(private readonly artifacts: ContentAddressedArtifactStore, private readonly db: Database.Database, private readonly now: () => Date,
    private readonly resolve: (selection: MetaPageSelection, forWrite: boolean) => Promise<MetaPageBinding>) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now }); this.#reader = new FoundationSourcePackageReader(this.#packages);
  }
  hasRequest(runId: string, requestKey: string, kind: 'prepare' | 'confirm'): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(packageKey(runId, requestKey, kind)).length > 0;
  }
  async prepare(value: unknown, actor: { role: string }, signal?: AbortSignal): Promise<MetaPageSourceView> {
    if (actor.role !== 'OWNER') fail('META_OWNER_REQUIRED'); validate('prepare', value, true);
    const input = structuredClone(value) as MetaPagePrepareRequest; signal?.throwIfAborted();
    const key = packageKey((await this.resolve(input.selection, false)).runId, input.requestKey, 'prepare');
    const entries = await this.#reader.findFinalizedSourcePackagesByKey(key);
    if (entries.length) {
      if (entries.length !== 1) fail('META_REQUEST_AMBIGUOUS');
      const existing = await this.#readPrepared(entries[0]!.packageId);
      if (!equal(existing.request, input)) fail('META_REQUEST_CONFLICT');
      signal?.throwIfAborted(); return this.#view(existing);
    }
    const binding = await this.resolve(input.selection, true); validateMetaPageBinding(binding);
    const html = decode(input.htmlBase64), visible = decode(input.visibleFieldsBase64);
    const { projection } = projectMetaPageCapture(binding, html, visible);
    const files = new Map(PROFILES); files.set('request/prepare.json', json(input)); files.set('binding/source.json', json(binding));
    files.set('capture/page.html', html); files.set('capture/visible.json', visible); files.set('projection/ads.json', json(projection));
    // Reauthenticate immediately before publication, with no current clock on exact retry.
    if (!equal(binding, await this.resolve(input.selection, true))) fail('META_SOURCE_REFERENCE_DRIFT'); signal?.throwIfAborted();
    const packageId = await this.#persist(key, files, binding, signal);
    return this.#view(await this.#readPrepared(packageId));
  }
  async confirm(value: unknown, actor: { role: string }, signal?: AbortSignal): Promise<MetaPageSourceView> {
    if (actor.role !== 'OWNER') fail('META_OWNER_REQUIRED'); validate('confirm', value, true);
    const input = structuredClone(value) as MetaPageConfirmRequest; signal?.throwIfAborted();
    const prepared = await this.#readPrepared(input.packageId);
    const key = packageKey(prepared.binding.runId, input.requestKey, 'confirm');
    const existing = await this.#reader.findFinalizedSourcePackagesByKey(key);
    if (existing.length) {
      if (existing.length !== 1) fail('META_REQUEST_AMBIGUOUS');
      const confirmation = await this.#readConfirmation(existing[0]!.packageId, prepared);
      if (!equal(confirmation.request, input)) fail('META_REQUEST_CONFLICT'); signal?.throwIfAborted();
      return this.#view(prepared, confirmation.package);
    }
    const declaration: MetaPageConfirmation = { contractVersion: 'meta-page-confirmation-v1', bindingSha256: metaPageSha256(json(prepared.binding)),
      prepared: identity(prepared.package), projectionSha256: metaPageSha256(member(prepared.package, 'projection/ads.json')), ownerRole: 'OWNER' };
    const files = new Map(PROFILES); files.set('request/confirm.json', json(input)); files.set('binding/source.json', json(prepared.binding)); files.set('confirmation/owner.json', json(declaration));
    if (!equal(prepared.binding, await this.resolve(prepared.binding.selection, true))) fail('META_SOURCE_REFERENCE_DRIFT'); signal?.throwIfAborted();
    const id = await this.#persist(key, files, prepared.binding, signal);
    const confirmation = await this.#readConfirmation(id, prepared); return this.#view(prepared, confirmation.package);
  }
  async read(packageId: string): Promise<MetaPageSourceView> {
    const p = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    if (p.manifest.packageKey.includes('-confirm-')) {
      const declaration = parse(p, 'confirmation/owner.json') as MetaPageConfirmation; validate('confirmation', declaration);
      const prepared = await this.#readPrepared(declaration.prepared.packageId);
      const confirmation = await this.#readConfirmation(packageId, prepared); return this.#view(prepared, confirmation.package);
    }
    return this.#view(await this.#readPrepared(packageId));
  }
  async history(runId: string): Promise<MetaPageSourceView[]> {
    const entries = await this.#reader.findAutomationAttachmentPackagesByKeyPrefix(metaPagePackagePrefix(runId));
    const views: MetaPageSourceView[] = [], confirmations = new Map<string, MetaPageSourceView>();
    for (const entry of entries) {
      const view = await this.read(entry.packageId);
      if (view.binding.runId !== runId) fail('META_RUN_BINDING_MISMATCH');
      if (view.confirmation) confirmations.set(view.prepared.packageId, view); else views.push(view);
    }
    return views.map(view => confirmations.get(view.prepared.packageId) ?? view);
  }
  async #readPrepared(packageId: string) {
    const p = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET); await this.#checkPackage(p, PREPARED_PATHS);
    const input = parse(p, 'request/prepare.json') as MetaPagePrepareRequest; validate('prepare', input, true);
    const binding = parse(p, 'binding/source.json') as MetaPageBinding; validateMetaPageBinding(binding);
    if (!equal(input.selection, binding.selection) || !equal(binding, await this.resolve(binding.selection, false)) ||
      p.manifest.packageKey !== packageKey(binding.runId, input.requestKey, 'prepare')) fail('META_RETAINED_BINDING_INVALID');
    const html = member(p, 'capture/page.html'), visible = member(p, 'capture/visible.json');
    if (!decode(input.htmlBase64).equals(html) || !decode(input.visibleFieldsBase64).equals(visible)) fail('META_RETAINED_SOURCE_INVALID');
    const result = projectMetaPageCapture(binding, html, visible);
    if (!equal(parse(p, 'projection/ads.json'), result.projection) || !member(p, 'projection/ads.json').equals(json(result.projection))) fail('META_RETAINED_PROJECTION_INVALID');
    return { package: p, request: input, binding, ...result };
  }
  async #readConfirmation(packageId: string, prepared: { package: VerifiedFinalizedSourcePackage; binding: MetaPageBinding }) {
    const p = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET); await this.#checkPackage(p, CONFIRM_PATHS);
    const input = parse(p, 'request/confirm.json') as MetaPageConfirmRequest; validate('confirm', input, true);
    const declaration = parse(p, 'confirmation/owner.json') as MetaPageConfirmation; validate('confirmation', declaration);
    if (input.packageId !== prepared.package.packageId || p.manifest.packageKey !== packageKey(prepared.binding.runId, input.requestKey, 'confirm') ||
      !equal(parse(p, 'binding/source.json'), prepared.binding) || !equal(declaration, { contractVersion: 'meta-page-confirmation-v1',
        bindingSha256: metaPageSha256(json(prepared.binding)), prepared: identity(prepared.package),
        projectionSha256: metaPageSha256(member(prepared.package, 'projection/ads.json')), ownerRole: 'OWNER' })) fail('META_CONFIRMATION_BINDING_INVALID');
    return { request: input, package: p };
  }
  #view(prepared: { package: VerifiedFinalizedSourcePackage; binding: MetaPageBinding; capture: MetaPageSavedCapture; projection: MetaPageProjection }, confirmed?: VerifiedFinalizedSourcePackage): MetaPageSourceView {
    const view: MetaPageSourceView = { contractVersion: 'meta-page-view-v1', state: confirmed ? 'CONFIRMED' : 'PREPARED', prepared: identity(prepared.package),
      confirmation: confirmed ? identity(confirmed) : null, binding: prepared.binding, capture: prepared.capture, projection: prepared.projection,
      runtimeCollector: 'UNAVAILABLE_OPENCLI_CONTRACT_MISSING' };
    validate('view', view, true); return view;
  }
  async #checkPackage(p: VerifiedFinalizedSourcePackage, paths: readonly string[]): Promise<void> {
    if (p.manifest.version !== 1 || !equal(p.files.map(f => f.path).sort(), [...paths].sort()) || !p.manifest.sourceLabel ||
      !p.manifest.sourceAcquiredAt) fail('META_PACKAGE_MEMBERSHIP_INVALID');
    for (const [path, bytes] of PROFILES) if (!member(p, path).equals(bytes)) fail('META_PROFILE_BYTES_INVALID');
    const binding = parse(p, 'binding/source.json'); validateMetaPageBinding(binding);
    const origin = await this.#reader.readAutomationAttachmentOrigin(p.packageId, BUDGET);
    if (!origin || origin.manifestArtifactSha256 !== p.manifestArtifactSha256 || origin.bindingSha256 !== metaPageSha256(json(binding))) fail('META_ORIGIN_INVALID');
    const expected = [...p.files].map(f => metadata(f.path, f.bytes));
    if (!equal(p.manifest.files, expected)) fail('META_MEMBER_METADATA_INVALID');
    if (p.manifest.sourceLabel !== 'Meta page saved capture (operator declarations)' || p.manifest.sourceAcquiredAt !== (p.files.some(f => f.path === 'capture/visible.json')
      ? (parse(p, 'capture/visible.json') as MetaPageSavedCapture).capturedAt : p.manifest.finalizedAt)) fail('META_PACKAGE_SOURCE_METADATA_INVALID');
  }
  async #persist(key: string, files: Map<string, Buffer>, binding: MetaPageBinding, signal?: AbortSignal): Promise<string> {
    const acquiredAt = files.has('capture/visible.json') ? (JSON.parse(utf8(files.get('capture/visible.json')!)) as MetaPageSavedCapture).capturedAt : null;
    const finalizedAt = this.now().toISOString();
    const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: key, version: 1, sourceLabel: 'Meta page saved capture (operator declarations)',
      sourceAcquiredAt: acquiredAt ?? finalizedAt, files: [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => metadata(path, bytes)) as SourcePackageIntakeRequest['files'] };
    // Exact manifest-width proof before the first staging/CAS/DB action; reuse existing source safety budget.
    const manifest: SourcePackageManifest = { ...request, packageId: '00000000-0000-4000-8000-000000000000', finalizedAt, packageContentSha256: '0'.repeat(64) };
    const sizes = [...files.values()].map(v => v.length).concat(json(manifest).length);
    if (sizes.some(n => n > BUDGET.maxFileBytes) || sizes.reduce((a, b) => a + b, 0) > BUDGET.maxTotalBytes) fail('META_SOURCE_SIZE_INVALID');
    signal?.throwIfAborted();
    const staging = this.artifacts;
    if (!(staging instanceof RequestScopedArtifactStore)) return fail('META_WRITER_UNAVAILABLE');
    return staging.withOwnership(async () => {
      const packages = new SourcePackageService({ db: this.db, artifactStore: staging, now: () => new Date(finalizedAt) });
      const stored = await packages.intakeAutomationAttachment(request, files, metaPageSha256(json(binding)));
      const verified = await this.#reader.readFinalizedSourcePackage(stored.packageId, BUDGET);
      await this.#checkPackage(verified, files.has('capture/visible.json') ? PREPARED_PATHS : CONFIRM_PATHS);
      for (const digest of new Set([verified.manifestArtifactSha256, ...verified.files.map(f => f.sha256)])) await staging.publishOwned(digest);
      return stored.packageId;
    });
  }
}
function metadata(path: string, bytes: Buffer): SourcePackageIntakeRequest['files'][number] {
  return { path, sha256: metaPageSha256(bytes), byteSize: bytes.length, mediaType: path.endsWith('.html') ? 'text/html' : 'application/json',
    evidenceFamily: 'meta-page-saved-capture', representationRole: path.startsWith('capture/') ? 'primary' : 'derived', independence: 'non_independent',
    providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Exact operator-supplied located declarations; no authentic DOM/provider or effectiveness verification.' };
}

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { GenericQuoteUnit } from '../../../../contracts/analysis/generic-quote-unit.generated.js';
import type { TemporalWindowMethod } from '../../../../contracts/analysis/temporal-window-method.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { buildGenericQuoteUnit } from '../generic-quote-unit.js';
import { buildTemporalWindowMethod } from '../temporal-window-method.js';
import { MAX_CAPTURE_ENVELOPE_BYTES, MAX_CAPTURES_PER_STEP, MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError,
  type CaptureRecord, type ScopeSnapshot, type StartSnapshot, type StepResultDocument } from './model.js';
import { verifyAutomationDetailCaptures, verifyAutomationObservations, type VerifiedAutomationDetailCapture } from './verified-observations.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const MAPPING = 'kalodata-product-detail-market-inventory-v1';
const CONFIG = 'normalized/market-run.json';
const TEMPORAL_INPUT = 'methods/temporal-input.json';
const QUOTE_INPUT = 'methods/quote-input.json';
const TEMPORAL_PROFILE = 'profiles/temporal-window.schema.json';
const QUOTE_PROFILE = 'profiles/generic-quote-unit.schema.json';
const READ_BUDGET = { maxFileBytes: MAX_CAPTURE_ENVELOPE_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const digest = (value: unknown): string => sha(json(value));
function integrity(message: string): never { throw new ResearchAutomationIntegrityError(message); }
type TemporalInput = TemporalWindowMethod['input'];
type QuoteInput = GenericQuoteUnit['input'];
type Source = QuoteInput['sources'][number];
type Ref = QuoteInput['quotes'][number]['source'];
type PackageIdentity = TemporalInput['sourcePackage'];
type Prepared = { request: SourcePackageIntakeRequest; files: Map<string, Buffer> };

export interface AutomationMarketMethodInput {
  readonly runId: string;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
}

/** Service retains these exact bytes under its committed artifact digest before reporting. */
export interface AutomationMarketMethodSnapshot {
  readonly contractVersion: 'automation-market-method-snapshot-v1';
  readonly runId: string;
  readonly sourcePackage: PackageIdentity;
  readonly mappingRevision: typeof MAPPING;
  readonly temporal: TemporalWindowMethod;
  readonly quotes: GenericQuoteUnit;
  readonly sourceRequirements: { readonly temporal: readonly string[]; readonly quotes: readonly string[] };
}

const SOURCE_REQUIREMENTS: AutomationMarketMethodSnapshot['sourceRequirements'] = {
  temporal: ['SOURCE_METRIC_DEFINITION_AND_PRECISION_NOT_ESTABLISHED', 'SOURCE_TIMEZONE_CALENDAR_AND_BOUNDARIES_NOT_ESTABLISHED',
    'PERIOD_FLOW_ADDITIVITY_NOT_ESTABLISHED', 'SOURCE_LISTING_VARIANT_IDENTITY_AND_COMPLETE_SCALAR_NOT_ESTABLISHED',
    'INVENTORY_ONLY_NO_TEMPORAL_OPERATIONS_REQUESTED'],
  quotes: ['PROVIDER_PRICE_FIELDS_NOT_VERIFIED_VARIANT_PURCHASED_PACK_QUOTES', 'PRICE_OBSERVATION_TIME_AND_CONDITIONS_UNKNOWN',
    'SOURCE_LISTING_VARIANT_OFFER_LINKAGE_UNKNOWN', 'PACK_COUNT_COMPOSITION_NET_AND_DRAINED_MASS_UNKNOWN',
    'INVENTORY_ONLY_ALL_UNIT_PRICE_OPERATIONS_UNAVAILABLE'],
};

/** Existing run evidence -> real Foundation package -> bounded M03/M08 inventory. */
export class AutomationMarketMethodBridge {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #packages: SourcePackageService;

  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#packages = new SourcePackageService(options);
  }

  async execute(input: AutomationMarketMethodInput, signal?: AbortSignal): Promise<AutomationMarketMethodSnapshot | undefined> {
    signal?.throwIfAborted();
    const prepared = await this.#prepare(input);
    if (!prepared) return undefined;
    return withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(prepared.request, prepared.files);
      const retained = await this.#packages.readVerified(receipt.packageId, READ_BUDGET);
      this.#verifyPrepared(prepared, retained);
      signal?.throwIfAborted();
      const identity = packageIdentity(retained);
      const temporal = buildTemporalWindowMethod({ ...parseFile(retained, TEMPORAL_INPUT), sourcePackage: identity }).output;
      const quotes = buildGenericQuoteUnit({ ...parseFile(retained, QUOTE_INPUT), sourcePackage: identity }).output;
      const output: AutomationMarketMethodSnapshot = { contractVersion: 'automation-market-method-snapshot-v1', runId: input.runId,
        sourcePackage: identity, mappingRevision: MAPPING, temporal, quotes, sourceRequirements: SOURCE_REQUIREMENTS };
      if (json(output).length > MAX_JSON_ARTIFACT_BYTES) integrity('Market method snapshot exceeds its bound.');
      return output;
    });
  }

  /** Frozen v1 reader: no intake, calculator, current profile read, clock or provider. */
  async verify(untrusted: unknown, input: AutomationMarketMethodInput): Promise<AutomationMarketMethodSnapshot> {
    if (json(untrusted).length > MAX_JSON_ARTIFACT_BYTES || !isRecord(untrusted) ||
        Object.keys(untrusted).sort().join(',') !== 'contractVersion,mappingRevision,quotes,runId,sourcePackage,sourceRequirements,temporal' ||
        untrusted.contractVersion !== 'automation-market-method-snapshot-v1' || untrusted.mappingRevision !== MAPPING || untrusted.runId !== input.runId ||
        !isRecord(untrusted.sourcePackage) || typeof untrusted.sourcePackage.packageId !== 'string') integrity('Market method snapshot identity is invalid.');
    const snapshot = untrusted as unknown as AutomationMarketMethodSnapshot;
    const retained = await this.#packages.readVerified(snapshot.sourcePackage.packageId, READ_BUDGET);
    if (canonicalJson(snapshot.sourcePackage) !== canonicalJson(packageIdentity(retained)) ||
        retained.manifest.packageKey !== `automation-method:${input.runId}-market-v1` || retained.manifest.version !== 1)
      integrity('Market method package differs from the frozen run.');
    const mapping = parseFile(retained, CONFIG);
    if (mapping.contractVersion !== 'automation-market-normalization-v1' || mapping.mappingRevision !== MAPPING || mapping.runId !== input.runId ||
        canonicalJson(mapping.start) !== canonicalJson(input.start) || canonicalJson(mapping.scope) !== canonicalJson(input.scope) ||
        canonicalJson(mapping.collection) !== canonicalJson(input.collection) || canonicalJson(mapping.captures) !== canonicalJson(collectionCaptures(input)) ||
        canonicalJson(mapping.sourceRequirements) !== canonicalJson(snapshot.sourceRequirements) || !Array.isArray(mapping.admittedCaptures))
      integrity('Market method mapping differs from the frozen run.');
    const expectedPaths = new Set([CONFIG, TEMPORAL_INPUT, QUOTE_INPUT, TEMPORAL_PROFILE, QUOTE_PROFILE]);
    for (const capture of collectionCaptures(input)) {
      const filePath = capturePath(capture.ordinal);
      expectedPaths.add(filePath);
      const file = findFile(retained, filePath);
      if (file.sha256 !== capture.artifactSha256 || file.mediaType !== capture.mediaType) integrity('Market capture differs from the frozen collection.');
    }
    const admittedOrdinals = new Set<number>();
    for (const row of mapping.admittedCaptures) {
      if (!isRecord(row) || !Number.isInteger(row.ordinal) || admittedOrdinals.has(row.ordinal as number)) integrity('Market admitted capture membership is invalid.');
      const ordinal = row.ordinal as number;
      admittedOrdinals.add(ordinal);
      if (!input.captures.some(capture => capture.stepId === 'COLLECTION' && capture.ordinal === ordinal)) integrity('Market admitted capture is not in the collection.');
      for (const kind of ['request', 'response'] as const) {
        const filePath = payloadPath(ordinal, kind);
        expectedPaths.add(filePath);
        const payload = findFile(retained, filePath);
        const envelope = parseFile(retained, capturePath(ordinal), MAX_CAPTURE_ENVELOPE_BYTES);
        const base64 = envelope[kind === 'request' ? 'requestBodyBytesBase64' : 'responseBytesBase64'];
        if (typeof base64 !== 'string' || !payload.bytes.equals(Buffer.from(base64, 'base64')) || payload.sha256 !== row[`${kind}Sha256`])
          integrity('Market raw payload differs from its retained capture.');
      }
    }
    if (expectedPaths.size !== retained.files.length || retained.files.some(file => !expectedPaths.has(file.path))) integrity('Market package membership differs from its frozen mapping.');
    for (const file of retained.files) {
      const expected = fileMetadata(file.path, file.bytes, file.mediaType);
      const { period: _period, ...actual } = file;
      const { bytes: _bytes, ...metadata } = actual;
      if (_period !== undefined || canonicalJson(metadata) !== canonicalJson(expected)) integrity('Market source metadata differs from its frozen role.');
    }
    verifyFrozenMethod(snapshot.temporal, retained, TEMPORAL_INPUT, TEMPORAL_PROFILE);
    verifyFrozenMethod(snapshot.quotes, retained, QUOTE_INPUT, QUOTE_PROFILE);
    return snapshot;
  }

  #verifyPrepared(prepared: Prepared, retained: VerifiedFinalizedSourcePackage): void {
    const { packageId: _id, finalizedAt: _time, packageContentSha256: _content, ...request } = retained.manifest;
    const expected = { ...prepared.request, files: [...prepared.request.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0) };
    if (canonicalJson(request) !== canonicalJson(expected) || retained.files.length !== prepared.files.size ||
        retained.files.some(file => !prepared.files.get(file.path)?.equals(file.bytes))) integrity('Market method intake differs from the verified capture preparation.');
  }

  async #prepare(input: AutomationMarketMethodInput): Promise<Prepared | undefined> {
    if (input.collection === null) return undefined;
    const captures = collectionCaptures(input);
    if (input.captures.length > 2 * MAX_CAPTURES_PER_STEP || captures.length > MAX_CAPTURES_PER_STEP) integrity('Market capture inventory exceeds its bound.');
    const captureBytes = new Map<string, Buffer>();
    let totalBytes = 0;
    for (const capture of captures) {
      const bytes = await this.#artifacts.read(capture.artifactSha256, { maxBytes: MAX_CAPTURE_ENVELOPE_BYTES });
      totalBytes += bytes.length;
      if (totalBytes > READ_BUDGET.maxTotalBytes - 8 * MAX_JSON_ARTIFACT_BYTES) integrity('Market capture evidence exceeds its read bound.');
      captureBytes.set(capture.artifactSha256, bytes);
    }
    const verified = verifyAutomationObservations({ ...input, captureBytes });
    const details = verifyAutomationDetailCaptures({ ...input, captureBytes });
    if (!details.length) return undefined;
    if (verified.length > 500) integrity('Market temporal inventory exceeds 500 observations; no records were truncated.');
    const files = new Map<string, Buffer>();
    for (const capture of captures) files.set(capturePath(capture.ordinal), captureBytes.get(capture.artifactSha256)!);
    for (const detail of details) {
      files.set(payloadPath(detail.capture.ordinal, 'request'), detail.requestBytes);
      files.set(payloadPath(detail.capture.ordinal, 'response'), detail.responseBytes);
    }
    files.set(TEMPORAL_PROFILE, await fs.readFile(new URL('../../../../contracts/analysis/temporal-window-method.schema.json', import.meta.url)));
    files.set(QUOTE_PROFILE, await fs.readFile(new URL('../../../../contracts/analysis/generic-quote-unit.schema.json', import.meta.url)));
    files.set(CONFIG, json({ contractVersion: 'automation-market-normalization-v1', mappingRevision: MAPPING,
      runId: input.runId, start: input.start, scope: input.scope, collection: input.collection, captures,
      sourceRequirements: SOURCE_REQUIREMENTS,
      admittedCaptures: details.map(detail => ({ ordinal: detail.capture.ordinal, productRef: detail.productRef,
        providerProductId: detail.providerProductId, retainedOutcome: detail.retainedOutcome,
        requestSha256: sha(detail.requestBytes), responseSha256: sha(detail.responseBytes) })) }));
    // These are actual source/mapping documents, not invented owner declarations or semantic proof.
    const sources: Source[] = [...files].filter(([filePath]) => !filePath.startsWith('captures/')).map(([logicalPath, bytes]) => ({ logicalPath, sha256: sha(bytes), role: 'SOURCE' }));
    if (sources.length > 1000) integrity('Market source inventory exceeds 1000 files; no records were truncated.');
    const ref = (filePath: string, fieldPointer: string): Ref => ({ sourceSha256: sha(files.get(filePath)!), locator: `${filePath}${fieldPointer}`, fieldPointer });
    const members: TemporalInput['frame']['members'] = [...input.scope.selectedProductIds, ...input.scope.peerProductIds].map((productRef, index) => ({
      memberKey: productRef, identityState: 'UNKNOWN', provider: 'kalodata', country: 'VN', platform: null, shopId: null, listingId: null,
      variantScope: 'UNKNOWN', variantId: null, source: ref(CONFIG, index < input.scope.selectedProductIds.length
        ? `/scope/selectedProductIds/${index}` : `/scope/peerProductIds/${index - input.scope.selectedProductIds.length}`),
    }));
    const byOrdinal = new Map(details.map(detail => [detail.capture.ordinal, detail]));
    const temporal: Omit<TemporalInput, 'sourcePackage'> = {
      contractVersion: '1.0.0', sources,
      configuration: { profileId: 'source-compatible-temporal-v1', profileVersion: '1.0.0', profileSha256: sha(files.get(TEMPORAL_PROFILE)!),
        profileRef: ref(TEMPORAL_PROFILE, '/$id'), mappingRevision: MAPPING, compatibilityPolicyRevision: 'fixed-frame-equal-declared-duration-v1', configurationRef: ref(CONFIG, '/mappingRevision') },
      frame: { frameId: input.runId, revision: '1.0.0', universePurpose: 'Frozen selected and explicit peer provider references only; not market population or verified listing identities.',
        scopeRuleRevision: 'owner-confirmed-run-scope-v1', labelsRevision: 'literal-provider-reference-v1', selectionRef: ref(CONFIG, '/scope/selectedProductIds'), scopeRef: ref(CONFIG, '/scope'), members,
        externalCoverage: 'UNKNOWN_NOT_MARKET_POPULATION' },
      observations: verified.map((row): TemporalInput['observations'][number] => {
        const detail = byOrdinal.get(row.comparable.captureIndex);
        if (!detail) return integrity('Verified market scalar has no admitted detail capture.');
        const responsePath = payloadPath(detail.capture.ordinal, 'response');
        const requestPath = payloadPath(detail.capture.ordinal, 'request');
        return { observationId: `capture-${detail.capture.ordinal}-${row.measureLiteral}`, source: ref(responsePath, row.evidence.responseLocator),
          sourceNamespace: 'kalodata-product-detail', rawRequestSha256: sha(detail.requestBytes), rawResponseSha256: sha(detail.responseBytes), retrievedAt: detail.capture.retrievedAt,
          subjectMemberKeys: [detail.productRef], measure: { literal: row.measureLiteral, canonicalMapping: row.comparable.metric,
            definition: null, definitionRevision: null, definitionRef: null, dimension: row.comparable.metric === 'GMV_VND' ? 'CURRENCY' : 'COUNT',
            unit: row.comparable.metric === 'GMV_VND' ? 'VND' : null, currency: row.comparable.metric === 'GMV_VND' ? 'VND' : null,
            semantics: 'UNKNOWN', semanticsRef: null, additive: null, additivityRef: null, displayPolicy: 'UNKNOWN', displayPolicyRef: null },
          value: { state: /^0(?:\.0+)?$/.test(row.comparable.value) ? 'OBSERVED_ZERO' : 'NON_EXACT', decimal: row.comparable.value, literal: row.sourceWording },
          requestedWindow: { start: input.start.requestedPeriod.startDate, end: input.start.requestedPeriod.endDate, binding: ref(CONFIG, '/start/requestedPeriod') },
          rawQuery: { start: row.comparable.window.startDate, end: row.comparable.window.endDate, binding: ref(requestPath, '/date_range') },
          observedWindow: { rawStart: null, rawEnd: null, interval: null, basisKind: 'UNKNOWN', basisLiteral: null, basisRef: null,
            boundaryConvention: 'UNKNOWN', boundaryRef: null, mappingRef: null, duration: { basis: 'UNKNOWN', value: null, unit: null, proof: null } },
          membership: { observedMemberKeys: [], unknownMemberKeys: [detail.productRef], excludedMemberKeys: [], complete: false, proof: null },
          upstream: { kind: 'UNKNOWN', ready: false, complete: false, entityOverlapResolved: false, proof: null } };
      }),
      requests: [], snapshotDispositions: [],
    };
    const quotes: Omit<QuoteInput, 'sourcePackage'> = { contractVersion: '1.0.0', sources,
      configuration: { parserProfileId: 'generic-quote-unit-v1', parserRevision: '1.0.0', parserProfileSha256: sha(files.get(QUOTE_PROFILE)!),
        parserProfileRef: ref(QUOTE_PROFILE, '/$id'), mappingRevision: MAPPING, configurationRef: ref(CONFIG, '/mappingRevision') },
      quotes: details.flatMap(detail => quoteRecords(detail, ref)),
    };
    if (quotes.quotes.length > 500) integrity('Market quote inventory exceeds 500 records; no records were truncated.');
    files.set(TEMPORAL_INPUT, json(temporal));
    files.set(QUOTE_INPUT, json(quotes));
    const metadata: SourcePackageIntakeRequest['files'][number][] = [];
    for (const [filePath, bytes] of files) {
      totalBytes += filePath.startsWith('captures/') ? 0 : bytes.length;
      if ((!filePath.startsWith('captures/') && bytes.length > MAX_JSON_ARTIFACT_BYTES) || totalBytes > READ_BUDGET.maxTotalBytes - MAX_JSON_ARTIFACT_BYTES)
        integrity('Market method package exceeds its exact-byte bound.');
      const capture = captures.find(row => capturePath(row.ordinal) === filePath);
      metadata.push(fileMetadata(filePath, bytes, capture?.mediaType ?? 'application/json'));
    }
    return { files, request: { contractVersion: '1.0.0', packageKey: `automation-method:${input.runId}-market-v1`, version: 1,
      sourceAcquiredAt: captures.map(capture => capture.retrievedAt).sort().at(-1) ?? null,
      sourceLabel: `Automation ${input.runId}: M03/M08 verified capture inventory`, files: metadata as SourcePackageIntakeRequest['files'] } };
  }
}

function collectionCaptures(input: AutomationMarketMethodInput): CaptureRecord[] {
  return input.captures.filter(capture => capture.stepId === 'COLLECTION').sort((a, b) => a.ordinal - b.ordinal);
}
function capturePath(ordinal: number): string { return `captures/collection-${ordinal}.json`; }
function payloadPath(ordinal: number, kind: 'request' | 'response'): string { return `payloads/collection-${ordinal}-${kind}.json`; }
function packageIdentity(retained: VerifiedFinalizedSourcePackage): PackageIdentity {
  return { packageId: retained.packageId, version: retained.manifest.version, manifestArtifactSha256: retained.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256 };
}
function findFile(retained: VerifiedFinalizedSourcePackage, filePath: string): VerifiedFinalizedSourcePackage['files'][number] {
  return retained.files.find(file => file.path === filePath) ?? integrity('Market package source file is missing.');
}
function parseFile(retained: VerifiedFinalizedSourcePackage, filePath: string, maxBytes = MAX_JSON_ARTIFACT_BYTES): Record<string, unknown> {
  const file = findFile(retained, filePath);
  if (file.byteSize > maxBytes) integrity('Market retained JSON exceeds its bound.');
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    return isRecord(value) ? value : integrity('Market retained JSON is not an object.');
  } catch { return integrity('Market retained JSON is invalid.'); }
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function fileMetadata(filePath: string, bytes: Buffer, mediaType: string): SourcePackageIntakeRequest['files'][number] {
  const provider = filePath.startsWith('captures/') || filePath.startsWith('payloads/');
  return { path: filePath, sha256: sha(bytes), byteSize: bytes.length, mediaType,
    evidenceFamily: filePath.startsWith('captures/') ? 'research-automation-capture' : provider ? 'kalodata-automation' : 'automation-market-method-configuration',
    representationRole: filePath.startsWith('captures/') ? 'primary' : 'derived', independence: 'non_independent',
    providerProvenance: provider ? 'provider_reported' : 'operator_supplied_unverified',
    provenanceBasis: provider ? 'Exact retained capture or decoded payload bytes; no independent truth, listing identity, time-window semantics or purchased-pack price attestation.'
      : 'Application mapping or method schema document from the frozen run; not owner authorization or provider semantic proof.' };
}

function quoteRecords(detail: VerifiedAutomationDetailCapture, ref: (path: string, pointer: string) => Ref): QuoteInput['quotes'] {
  const responsePath = payloadPath(detail.capture.ordinal, 'response');
  const source = ref(responsePath, '/data');
  const scalar = (value: unknown): string | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER &&
    /^(0|[1-9][0-9]{0,39})(\.[0-9]{1,18})?$/.test(String(value)) ? String(value) : null;
  const unit = scalar(detail.data.unit_price); const minimum = scalar(detail.data.min_price); const maximum = scalar(detail.data.max_price);
  const field = (name: string) => ({ state: !Object.hasOwn(detail.data, name) || detail.data[name] === null ? 'MISSING'
    : scalar(detail.data[name]) === null ? 'UNREADABLE' : 'REPORTED_NON_EXACT',
    present: Object.hasOwn(detail.data, name), literal: detail.data[name] ?? null });
  const quantity: QuoteInput['quotes'][number]['pack']['count'] = { state: 'UNKNOWN', value: null, unit: null, dimension: 'UNKNOWN', origin: 'UNKNOWN', binding: null, literal: null };
  const base: QuoteInput['quotes'][number] = {
    quoteId: `capture-${detail.capture.ordinal}-unit-price`, source, acquiredAt: detail.capture.retrievedAt, observedAt: null,
    authenticationState: 'UNKNOWN', reviewState: 'UNKNOWN',
    identity: { state: 'UNKNOWN', platform: null, shopId: null, listingId: null, variantState: 'UNKNOWN', variantId: null, variantAttributes: [], binding: ref(responsePath, '/data/product_id'), linkage: 'UNKNOWN' },
    // Literal named fields remain inspectable even when missing endpoints cannot form a range.
    offerText: JSON.stringify({ provider_product_id: detail.providerProductId,
      unit_price: field('unit_price'), min_price: field('min_price'), max_price: field('max_price'),
      rangeState: minimum === null || maximum === null ? 'INCOMPLETE_OR_UNREADABLE' : Number(minimum) > Number(maximum) ? 'CONFLICTING' : 'REPORTED_RANGE' }), packText: null,
    price: { state: unit !== null ? 'NON_EXACT' : detail.data.unit_price === undefined || detail.data.unit_price === null ? 'MISSING' : 'UNREADABLE',
      value: unit, range: null, currency: 'VND', priceState: 'UNKNOWN', binding: detail.data.unit_price === undefined ? null : ref(responsePath, '/data/unit_price'),
      checkoutBinding: null, conditions: [], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
    pack: { count: quantity, compositionState: 'UNKNOWN', linkage: 'UNKNOWN', binding: null, components: [] },
    netMass: { quantity, basis: 'UNKNOWN', linkage: 'UNKNOWN', basisBinding: null }, drainedMass: { quantity, basis: 'UNKNOWN', linkage: 'UNKNOWN', basisBinding: null },
    selectedMassBases: [], massSelectionBinding: null,
  };
  if (minimum === null || maximum === null || Number(minimum) > Number(maximum)) return [base];
  return [base, { ...base, quoteId: `capture-${detail.capture.ordinal}-price-range`, price: { ...base.price,
    state: 'RANGE', value: null, range: { minimum, maximum }, binding: source } }];
}

function verifyFrozenMethod(output: TemporalWindowMethod | GenericQuoteUnit, retained: VerifiedFinalizedSourcePackage, descriptorPath: string, profilePath: string): void {
  const profile = findFile(retained, profilePath);
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  const schema = parseFile(retained, profilePath);
  if (schema.$id !== `https://research.local/contracts/analysis/${profilePath === TEMPORAL_PROFILE ? 'temporal-window-method' : 'generic-quote-unit'}.schema.json`)
    integrity('Market retained method schema identity differs.');
  const validate = ajv.compile(schema);
  if (!validate(output)) integrity('Market frozen method fails its retained canonical schema.');
  const { methodOutputId, ...body } = output;
  if (digest(body) !== methodOutputId || digest(output.input) !== output.inputSha256 ||
      canonicalJson(output.input.sourcePackage) !== canonicalJson(packageIdentity(retained))) integrity('Market frozen method hash or package identity differs.');
  const { sourcePackage: _identity, ...descriptor } = output.input;
  if (canonicalJson(descriptor) !== canonicalJson(parseFile(retained, descriptorPath))) integrity('Market frozen method input differs from its retained descriptor.');
  const configuration = output.input.configuration;
  const recordedProfile = 'profileSha256' in configuration ? configuration.profileSha256 : configuration.parserProfileSha256;
  if (profile.sha256 !== recordedProfile) integrity('Market frozen method profile differs from its recorded digest.');
  for (const source of output.input.sources) {
    const file = findFile(retained, source.logicalPath);
    if (source.sha256 !== file.sha256 || source.role !== 'SOURCE') integrity('Market frozen method source differs from its retained membership.');
  }
}

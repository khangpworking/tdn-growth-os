import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import sourceSchema from '../../../../contracts/analysis/world-bank-intake-v1.schema.json' with { type: 'json' };
import apiSchema from '../../../../contracts/api/research-automation-macro-intake-api.schema.json' with { type: 'json' };
import type { Binding, Projection, Row, WorldBankIntakeV1 } from '../../../../contracts/analysis/world-bank-intake-v1.generated.js';
import type { PackageRef, PrepareRequest, PrepareReceipt, ConfirmRequest, Confirmed, View, History } from '../../../../contracts/api/research-automation-macro-intake-api.generated.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { FoundationSourcePackageReader, type FinalizedSourcePackageReader, type SourceAttachmentOriginReader, type AutomationSourcePackageLookup } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { renderWorldBankSourceDisplay } from './world-bank-report.js';

/** Initial public indicators witnessed by ST-20261008-20; never expanded from caller strings. */
export const WORLD_BANK_INDICATORS = ['NE.CON.PRVT.PC.KD', 'SP.POP.TOTL'] as const;
export const MAX_WORLD_BANK_FILE_BYTES = 8 * 1024 * 1024;
export const WORLD_BANK_PROFILE = 'world-bank-vn-two-indicators-v1';

export class WorldBankSourceRejection extends Error {
  constructor(readonly code: string, readonly locator: string) { super(`${locator}: ${code}`); }
}
function reject(code: string, locator: string): never { throw new WorldBankSourceRejection(code, locator); }
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
ajv.addSchema(sourceSchema); ajv.addSchema(apiSchema);
const validatePrepare = ajv.compile<PrepareRequest>({ $ref: `${apiSchema.$id}#/$defs/prepareRequest` });
const validateDescriptor = ajv.compile<WorldBankIntakeV1>(sourceSchema);
const validateBinding = ajv.compile<Binding>({ $ref: `${sourceSchema.$id}#/$defs/binding` });
const validateReference = ajv.compile<PackageRef>({ $ref: `${sourceSchema.$id}#/$defs/packageRef` });
const validateConfirm = ajv.compile<ConfirmRequest>({ $ref: `${apiSchema.$id}#/$defs/confirmRequest` });
const validateConfirmed = ajv.compile<Confirmed>({ $ref: `${apiSchema.$id}#/$defs/confirmed` });
export const WORLD_BANK_DESCRIPTOR_PATH = 'normalized/world-bank-source.json';
export const WORLD_BANK_CONFIRMATION_PATH = 'macro/confirmation.json';
export const WORLD_BANK_DISPLAY_PATH = 'macro/display.html';
export const WORLD_BANK_READ_BUDGET = { maxFileBytes: MAX_WORLD_BANK_FILE_BYTES,
  maxTotalBytes: 2 * MAX_WORLD_BANK_FILE_BYTES + 1024 * 1024 } as const;
const PROVENANCE = 'Operator-supplied exact public endpoint bytes; source attribution and metadata are retained, not independently authenticated provider acquisition.';
type SourceReader = FinalizedSourcePackageReader & SourceAttachmentOriginReader;
const reference = (source: VerifiedFinalizedSourcePackage): PackageRef => ({ packageId: source.packageId,
  manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256 });
export const worldBankBindingSha256 = (binding: Binding): string => hash(json(binding));
export const worldBankPackageKey = (runId: string, requestKey: string): string => `automation-world-bank:${runId}-${requestKey}`;

/** Source preparation owns mechanics only. Admission remains an explicit action of the owning application service. */
export class AutomationWorldBankSourceIntake {
  readonly #packages: SourcePackageService;
  readonly #reader: FoundationSourcePackageReader;
  constructor(private readonly artifacts: RequestScopedArtifactStore, db: Database.Database, private readonly now: () => Date) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now });
    this.#reader = new FoundationSourcePackageReader(this.#packages);
  }
  hasRequest(runId: string, requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(worldBankPackageKey(runId, requestKey)).length > 0;
  }
  hasConfirmation(runId: string, requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(worldBankConfirmationKey(runId, requestKey)).length > 0;
  }
  async prepare(value: unknown, observations: Uint8Array, metadata: Uint8Array, bound: Binding): Promise<PrepareReceipt> {
    if (!validatePrepare(value) || !validateBinding(bound)) reject('REQUEST_OR_BINDING_INVALID', 'prepare');
    // Copy every caller-owned value before the first await.
    const input = JSON.parse(canonicalJson(value)) as PrepareRequest;
    const binding = JSON.parse(canonicalJson(bound)) as Binding;
    const observationBytes = Buffer.from(observations), metadataBytes = Buffer.from(metadata);
    const projection = inspectWorldBankSource(observationBytes, metadataBytes, input.sourceUrl, input.metadataUrl);
    const descriptor: WorldBankIntakeV1 = { contractVersion: 'world-bank-intake-v1', binding, requestKey: input.requestKey,
      sourceLabel: input.sourceLabel, acquiredAt: input.acquiredAt, condition: 'MULTI_YEAR_SERIES',
      observationPath: 'macro/observations.json', metadataPath: 'macro/metadata.json', projection };
    if (!validateDescriptor(descriptor)) reject('DESCRIPTOR_INVALID', 'prepare');
    const members = new Map<string, Buffer>([[descriptor.observationPath, observationBytes], [descriptor.metadataPath, metadataBytes],
      [WORLD_BANK_DESCRIPTOR_PATH, json(descriptor)]]);
    const files = expectedMetadata(binding.runId, members);
    // An intact exact retry is a read. Do not enter attachment recovery/staging or call CAS.put.
    const existing = this.#packages.findFinalizedSourcePackagesByKey(worldBankPackageKey(binding.runId, input.requestKey));
    if (existing.length > 1) reject('REQUEST_KEY_CONFLICT', 'prepare');
    if (existing[0]) {
      const prior = existing[0];
      const verified = await this.#reader.readFinalizedSourcePackage(prior.packageId, WORLD_BANK_READ_BUDGET);
      if (verified.manifestArtifactSha256 !== prior.manifestArtifactSha256) reject('PACKAGE_IDENTITY_MISMATCH', 'prepare');
      const ref = reference(verified);
      const retained = await verifyPreparedWorldBankSource(this.#reader, ref, binding);
      if (retained.source.files.some(file => !file.bytes.equals(members.get(file.path)!))) reject('REQUEST_KEY_CONFLICT', 'prepare');
      return { contractVersion: 'automation-world-bank-prepared-v1', requestKey: input.requestKey, source: ref,
        state: 'PREPARED_NOT_ADMITTED', exactRetry: true, recordCount: retained.descriptor.projection.rows.length };
    }
    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment({ contractVersion: '1.0.0',
        packageKey: worldBankPackageKey(binding.runId, input.requestKey), version: 1, sourceLabel: input.sourceLabel,
        sourceAcquiredAt: input.acquiredAt, files }, members, worldBankBindingSha256(binding));
      const prepared = await verifyPreparedWorldBankSource(this.#reader, { packageId: stored.packageId,
        manifestArtifactSha256: stored.manifestArtifactSha256, packageContentSha256: stored.packageContentSha256 }, binding);
      for (const digest of new Set([stored.manifestArtifactSha256, ...files.map(file => file.sha256)])) await this.artifacts.publishOwned(digest);
      return { contractVersion: 'automation-world-bank-prepared-v1', requestKey: input.requestKey, source: reference(prepared.source),
        state: 'PREPARED_NOT_ADMITTED', exactRetry: stored.deduplicated, recordCount: prepared.descriptor.projection.rows.length };
    });
  }
  /** Explicit service-owned OWNER action, separate from inert preparation. Caller holds the existing mutation mutex. */
  async confirm(value: unknown, bound: Binding, actorId: string): Promise<View> {
    if (!validateConfirm(value) || !validateBinding(bound) || typeof actorId !== 'string' || !actorId.trim() || actorId.length > 10000) reject('CONFIRM_REQUEST_INVALID', 'confirm');
    const input = JSON.parse(canonicalJson(value)) as ConfirmRequest, binding = JSON.parse(canonicalJson(bound)) as Binding;
    const prepared = await verifyPreparedWorldBankSource(this.#reader, input.source, binding);
    const prior = this.#packages.findFinalizedSourcePackagesByKey(worldBankConfirmationKey(binding.runId, input.requestKey));
    if (prior.length > 1) reject('REQUEST_KEY_CONFLICT', 'confirm');
    if (prior[0]) {
      const verified = await this.#reader.readFinalizedSourcePackage(prior[0].packageId, WORLD_BANK_READ_BUDGET);
      const retained = await readConfirmedWorldBankSource(this.#reader, reference(verified), binding);
      if (canonicalJson(retained.view.confirmation.source) !== canonicalJson(input.source) ||
        retained.view.confirmation.confirmedBy !== actorId || retained.view.confirmation.requestKey !== input.requestKey) reject('REQUEST_KEY_CONFLICT', 'confirm');
      return retained.view;
    }
    const confirmation: Confirmed = { contractVersion: 'automation-world-bank-confirmed-v1', requestKey: input.requestKey, binding,
      source: input.source, descriptorSha256: hash(json(prepared.descriptor)), confirmedBy: actorId, confirmedAt: this.now().toISOString() };
    if (!validateConfirmed(confirmation)) reject('CONFIRMATION_INVALID', 'confirm');
    const display = Buffer.from(renderWorldBankSourceDisplay(prepared.descriptor, input.source));
    const members = new Map<string, Buffer>([[WORLD_BANK_CONFIRMATION_PATH, json(confirmation)], [WORLD_BANK_DISPLAY_PATH, display]]);
    const files = confirmationMetadata(binding.runId, members);
    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment({ contractVersion: '1.0.0',
        packageKey: worldBankConfirmationKey(binding.runId, input.requestKey), version: 1, sourceLabel: prepared.descriptor.sourceLabel,
        sourceAcquiredAt: prepared.descriptor.acquiredAt, files }, members, worldBankBindingSha256(binding));
      const retained = await readConfirmedWorldBankSource(this.#reader, { packageId: stored.packageId,
        manifestArtifactSha256: stored.manifestArtifactSha256, packageContentSha256: stored.packageContentSha256 }, binding);
      for (const digest of new Set([stored.manifestArtifactSha256, ...files.map(file => file.sha256)])) await this.artifacts.publishOwned(digest);
      return retained.view;
    });
  }
}

const worldBankConfirmationKey = (runId: string, requestKey: string): string => `automation-world-bank-confirm:${runId}-${requestKey}`;
export const worldBankConfirmationPrefix = (runId: string): string => `automation-world-bank-confirm:${runId}-`;
function confirmationMetadata(runId: string, members: ReadonlyMap<string, Uint8Array>) {
  return [...members].map(([path, bytes]) => ({ path, sha256: hash(bytes), byteSize: bytes.byteLength,
    mediaType: path === WORLD_BANK_DISPLAY_PATH ? 'text/html' : 'application/json', representationRole: 'derived' as const,
    evidenceFamily: `world-bank-${runId}`, independence: 'non_independent' as const,
    providerProvenance: 'operator_supplied_unverified' as const, provenanceBasis: PROVENANCE }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Reads one exact confirmed revision and the stored display, never selecting latest or changing admission. */
export async function readConfirmedWorldBankSource(reader: SourceReader, ref: PackageRef, bound: Binding): Promise<{ view: View; display: Buffer }> {
  if (!validateReference(ref) || !validateBinding(bound)) reject('REFERENCE_OR_BINDING_INVALID', 'confirmation');
  const expected = JSON.parse(canonicalJson(ref)) as PackageRef, binding = JSON.parse(canonicalJson(bound)) as Binding;
  const source = await reader.readFinalizedSourcePackage(expected.packageId, WORLD_BANK_READ_BUDGET);
  if (canonicalJson(reference(source)) !== canonicalJson(expected)) reject('PACKAGE_IDENTITY_MISMATCH', 'confirmation');
  const origin = await reader.readAutomationAttachmentOrigin(expected.packageId, WORLD_BANK_READ_BUDGET);
  if (!origin || origin.bindingSha256 !== worldBankBindingSha256(binding) || origin.manifestArtifactSha256 !== source.manifestArtifactSha256) reject('ORIGIN_MISMATCH', 'confirmation');
  const members = new Map(source.files.map(file => [file.path, file.bytes]));
  if (members.size !== 2 || !members.has(WORLD_BANK_CONFIRMATION_PATH) || !members.has(WORLD_BANK_DISPLAY_PATH)) reject('MEMBERSHIP_MISMATCH', 'confirmation');
  let confirmation: unknown;
  try { confirmation = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(members.get(WORLD_BANK_CONFIRMATION_PATH)!)); }
  catch { return reject('CONFIRMATION_INVALID', 'confirmation'); }
  if (!validateConfirmed(confirmation) || canonicalJson(confirmation.binding) !== canonicalJson(binding)) reject('CONFIRMATION_BINDING_MISMATCH', 'confirmation');
  if (!members.get(WORLD_BANK_CONFIRMATION_PATH)!.equals(json(confirmation))) reject('CONFIRMATION_BYTES_MISMATCH', 'confirmation');
  if (source.manifest.packageKey !== worldBankConfirmationKey(binding.runId, confirmation.requestKey) || source.manifest.version !== 1) reject('PACKAGE_CONTEXT_MISMATCH', 'confirmation');
  const metadata = confirmationMetadata(binding.runId, members);
  const observed = source.files.map(({ bytes: _bytes, ...file }) => file).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (canonicalJson(metadata) !== canonicalJson(observed) || canonicalJson(source.manifest.files) !== canonicalJson(metadata)) reject('FILE_METADATA_MISMATCH', 'confirmation');
  const prepared = await verifyPreparedWorldBankSource(reader, confirmation.source, binding);
  if (confirmation.descriptorSha256 !== hash(json(prepared.descriptor)) || source.manifest.sourceLabel !== prepared.descriptor.sourceLabel ||
    source.manifest.sourceAcquiredAt !== prepared.descriptor.acquiredAt) reject('CONFIRMED_SOURCE_MISMATCH', 'confirmation');
  const display = members.get(WORLD_BANK_DISPLAY_PATH)!;
  if (!display.equals(Buffer.from(renderWorldBankSourceDisplay(prepared.descriptor, confirmation.source)))) reject('DISPLAY_BYTES_MISMATCH', 'confirmation');
  return { view: { contractVersion: 'automation-world-bank-view-v1', confirmation, confirmationSource: reference(source), descriptor: prepared.descriptor }, display };
}

export async function readWorldBankHistory(reader: SourceReader & AutomationSourcePackageLookup, bound: Binding): Promise<History> {
  if (!validateBinding(bound)) reject('BINDING_INVALID', 'history');
  const binding = JSON.parse(canonicalJson(bound)) as Binding;
  const entries = await reader.findAutomationAttachmentPackagesByKeyPrefix(worldBankConfirmationPrefix(binding.runId));
  // The declared Foundation lookup returns at most 101 entries. Do not label a truncated result complete history.
  if (entries.length === 101) reject('HISTORY_LOOKUP_LIMIT', 'history');
  const sources: View[] = [];
  for (const entry of entries) {
    const source = await reader.readFinalizedSourcePackage(entry.packageId, WORLD_BANK_READ_BUDGET);
    if (source.manifestArtifactSha256 !== entry.manifestArtifactSha256) reject('PACKAGE_IDENTITY_MISMATCH', 'history');
    sources.push((await readConfirmedWorldBankSource(reader, reference(source), binding)).view);
  }
  return { contractVersion: 'automation-world-bank-history-v1', sources };
}

function expectedMetadata(runId: string, members: ReadonlyMap<string, Uint8Array>) {
  return [...members].map(([path, bytes]) => ({ path, sha256: hash(bytes), byteSize: bytes.byteLength, mediaType: 'application/json',
    representationRole: path === WORLD_BANK_DESCRIPTOR_PATH ? 'derived' as const : 'structured' as const,
    evidenceFamily: `world-bank-${runId}`, independence: 'non_independent' as const,
    providerProvenance: 'operator_supplied_unverified' as const, provenanceBasis: PROVENANCE }))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}

/** Revalidates all exact package/member/origin/binding/schema/source checks on each read.
 * Never uses current configuration, acquisition transport, clocks, arithmetic or a cached value. */
export async function verifyPreparedWorldBankSource(reader: SourceReader, ref: PackageRef, bound: Binding) {
  if (!validateReference(ref) || !validateBinding(bound)) reject('REFERENCE_OR_BINDING_INVALID', 'read');
  const expected = JSON.parse(canonicalJson(ref)) as PackageRef, binding = JSON.parse(canonicalJson(bound)) as Binding;
  const source = await reader.readFinalizedSourcePackage(expected.packageId, WORLD_BANK_READ_BUDGET);
  if (canonicalJson(reference(source)) !== canonicalJson(expected)) reject('PACKAGE_IDENTITY_MISMATCH', 'read');
  const origin = await reader.readAutomationAttachmentOrigin(expected.packageId, WORLD_BANK_READ_BUDGET);
  if (!origin || origin.bindingSha256 !== worldBankBindingSha256(binding) || origin.manifestArtifactSha256 !== expected.manifestArtifactSha256) reject('ORIGIN_MISMATCH', 'read');
  const members = new Map(source.files.map(file => [file.path, file.bytes]));
  if (members.size !== 3 || !members.has(WORLD_BANK_DESCRIPTOR_PATH) || !members.has('macro/observations.json') || !members.has('macro/metadata.json')) reject('MEMBERSHIP_MISMATCH', 'read');
  let descriptor: unknown;
  try { descriptor = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(members.get(WORLD_BANK_DESCRIPTOR_PATH)!)); }
  catch { return reject('DESCRIPTOR_INVALID', 'read'); }
  if (!validateDescriptor(descriptor) || canonicalJson(descriptor.binding) !== canonicalJson(binding)) reject('DESCRIPTOR_BINDING_MISMATCH', 'read');
  if (!members.get(WORLD_BANK_DESCRIPTOR_PATH)!.equals(json(descriptor))) reject('DESCRIPTOR_BYTES_MISMATCH', 'read');
  if (source.manifest.packageKey !== worldBankPackageKey(binding.runId, descriptor.requestKey) || source.manifest.version !== 1 ||
    source.manifest.sourceLabel !== descriptor.sourceLabel || source.manifest.sourceAcquiredAt !== descriptor.acquiredAt) reject('PACKAGE_CONTEXT_MISMATCH', 'read');
  const metadata = expectedMetadata(binding.runId, members);
  const observed = source.files.map(({ bytes: _bytes, ...file }) => file).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (canonicalJson(metadata) !== canonicalJson(observed) || canonicalJson(source.manifest.files) !== canonicalJson(metadata)) reject('FILE_METADATA_MISMATCH', 'read');
  const reconstructed = inspectWorldBankSource(members.get(descriptor.observationPath)!, members.get(descriptor.metadataPath)!,
    descriptor.projection.sourceUrl, descriptor.projection.metadataUrl);
  if (canonicalJson(reconstructed) !== canonicalJson(descriptor.projection)) reject('PROJECTION_MISMATCH', 'read');
  return { source, descriptor };
}

/** Node 24's source context preserves the JSON number token BEFORE IEEE754 conversion.
 * These transient token objects never enter a stored contract. Original source bytes remain evidence. */
function sourceJson(bytes: Uint8Array): unknown {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_WORLD_BANK_FILE_BYTES) reject('FILE_SIZE_LIMIT', 'json');
  try {
    const parse = JSON.parse as (text: string, reviver: (key: string, value: unknown, context: { source?: string }) => unknown) => unknown;
    const original = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const result = parse(original, (key, value, context) => {
      if (key === 'value' && typeof value === 'number') {
        if (!context.source) reject('LOSSLESS_JSON_UNAVAILABLE', 'value');
        return { numericLexeme: context.source };
      }
      return value;
    });
    // JSON.parse otherwise accepts duplicate names and silently replaces earlier source evidence.
    const stack: (Set<string> | null)[] = [];
    const tokens = original.match(/"(?:\\[\s\S]|[^"\\])*"|[{}\[\]:,]|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null/g)!;
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]!;
      if (token === '{') stack.push(new Set());
      else if (token === '[') stack.push(null);
      else if (token === '}' || token === ']') stack.pop();
      else if (token.startsWith('"') && tokens[i + 1] === ':') {
        const key = JSON.parse(token) as string, keys = stack.at(-1);
        if (!keys || keys.has(key)) reject('DUPLICATE_JSON_KEY', 'json');
        keys.add(key);
      }
    }
    return result;
  } catch (error) {
    if (error instanceof WorldBankSourceRejection) throw error;
    return reject('INVALID_JSON_UTF8', 'json');
  }
}
function object(value: unknown, locator: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('OBJECT_REQUIRED', locator);
  return value as Record<string, unknown>;
}
function text(value: unknown, locator: string, blank = false): string {
  if (typeof value !== 'string' || value.length > 10000 || (!blank && !value.trim())) reject('TEXT_REQUIRED', locator);
  return value;
}
function isoDate(value: unknown, locator: string): string {
  const raw = text(value, locator);
  const date = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== raw) reject('DATE_INVALID', locator);
  return raw;
}
function decimal(lexeme: string, locator: string): string {
  const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?(?:[eE]([+-]?\d{1,3}))?$/.exec(lexeme);
  if (!match || lexeme.length > 200) reject('DECIMAL_INVALID', locator);
  const fractional = match[3] ?? '', shift = Number(match[4] ?? '0') - fractional.length;
  if (Math.abs(shift) > 200) reject('DECIMAL_RANGE', locator);
  const digits = match[2]! + fractional;
  if (shift >= 0) return match[1]! + digits + '0'.repeat(shift);
  const padded = digits.padStart(1 - shift, '0');
  return match[1]! + padded.slice(0, shift) + '.' + padded.slice(shift);
}
function envelope(value: unknown, locator: string) {
  if (!Array.isArray(value) || value.length !== 2 || !Array.isArray(value[1])) reject('ENVELOPE_INVALID', locator);
  const page = object(value[0], `${locator}/pagination`);
  if (page.page !== 1 || page.pages !== 1 || !Number.isSafeInteger(page.total) || page.total !== value[1].length) reject('INCOMPLETE_PAGE', locator);
  return { page, records: value[1] as unknown[] };
}

/** Pure inert source projection. Metadata is the original indicator endpoint response, not an operator unit declaration.
 * No inferred currency, estimate, unit, geography, or category. Source text stays unchanged. */
export function inspectWorldBankSource(observationBytes: Uint8Array, metadataBytes: Uint8Array, sourceUrl: string, metadataUrl: string): Projection {
  const observation = envelope(sourceJson(observationBytes), 'observations');
  const metadata = envelope(sourceJson(metadataBytes), 'metadata');
  if (metadata.records.length !== 1 || observation.records.length < 1 || observation.records.length > 1000) reject('ROW_COUNT_INVALID', 'source');
  const indicator = object(metadata.records[0], 'metadata/0');
  const code = text(indicator.id, 'metadata/0/id');
  if (!(WORLD_BANK_INDICATORS as readonly string[]).includes(code)) reject('INDICATOR_NOT_ALLOWED', 'metadata/0/id');
  const expectedSource = `https://api.worldbank.org/v2/country/VN/indicator/${code}?format=json`;
  const expectedMetadata = `https://api.worldbank.org/v2/indicator/${code}?format=json`;
  if (sourceUrl !== expectedSource || metadataUrl !== expectedMetadata) reject('SOURCE_URL_MISMATCH', 'source');
  const name = text(indicator.name, 'metadata/0/name');
  const unitLiteral = text(indicator.unit, 'metadata/0/unit', true);
  const sourceNote = text(indicator.sourceNote, 'metadata/0/sourceNote', true);
  const sourceOrganization = text(indicator.sourceOrganization, 'metadata/0/sourceOrganization', true);
  const dataset = object(indicator.source, 'metadata/0/source');
  const datasetId = text(dataset.id, 'metadata/0/source/id');
  const datasetName = text(dataset.value, 'metadata/0/source/value');
  if (observation.page.sourceid !== datasetId) reject('DATASET_MISMATCH', 'observations/pagination/sourceid');
  const lastUpdated = isoDate(observation.page.lastupdated, 'observations/pagination/lastupdated');
  const years = new Set<string>();
  const rows = observation.records.map((raw, index) => {
    const locator = `observations/1/${index}`, row = object(raw, locator);
    const rowIndicator = object(row.indicator, `${locator}/indicator`), country = object(row.country, `${locator}/country`);
    if (rowIndicator.id !== code || rowIndicator.value !== name || country.id !== 'VN' || row.countryiso3code !== 'VNM') reject('SOURCE_IDENTITY_MISMATCH', locator);
    const countryName = text(country.value, `${locator}/country/value`);
    const year = text(row.date, `${locator}/date`);
    if (!/^\d{4}$/.test(year) || years.has(year)) reject('YEAR_INVALID_OR_DUPLICATE', locator);
    years.add(year);
    const rowUnit = text(row.unit, `${locator}/unit`, true);
    if (rowUnit !== '' && rowUnit !== unitLiteral) reject('UNIT_CONFLICT', locator);
    const statusLiteral = text(row.obs_status, `${locator}/obs_status`, true);
    if (!Number.isSafeInteger(row.decimal) || (row.decimal as number) < 0 || (row.decimal as number) > 100) reject('PRECISION_INVALID', locator);
    const footnote = row.footnote === undefined ? null : text(row.footnote, `${locator}/footnote`, true);
    let value: string | null = null, valueLexeme: string | null = null;
    if (row.value !== null) {
      const token = object(row.value, `${locator}/value`);
      valueLexeme = text(token.numericLexeme, `${locator}/value`);
      value = decimal(valueLexeme, `${locator}/value`);
    }
    return { locator: `/1/${index}`, indicatorCode: code as Row['indicatorCode'], indicatorName: name, countryCode: 'VN' as const, countryName, year,
      value, valueLexeme, unit: unitLiteral.trim() === '' ? null : unitLiteral, unitLiteral, observationUnitLiteral: rowUnit,
      lastUpdated, statusLiteral, footnote, decimal: row.decimal as number };
  });
  // The initial owning path supports E13's observed multi-year series condition only.
  // No caller boolean can claim missing official equivalents or international comparability.
  if (rows.filter(row => row.value !== null).length < 2) reject('E13_MULTI_YEAR_SERIES_REQUIRED', 'observations');
  return { profileId: WORLD_BANK_PROFILE, sourceSha256: hash(observationBytes), metadataSha256: hash(metadataBytes),
    sourceUrl, metadataUrl, datasetId, datasetName, sourceNote, sourceOrganization, rows: rows as Projection['rows'] };
}

/** E12/E13 values can accompany a sample; an attempted mixed arithmetic operation is rejected explicitly. */
export function rejectMacroSampleArithmetic(_operation: 'ADD' | 'SUBTRACT' | 'DIVIDE', _sample: string, _macro: string): never {
  return reject('MACRO_SAMPLE_ARITHMETIC_FORBIDDEN', 'display');
}

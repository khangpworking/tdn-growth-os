import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import quoteSchema from '../../../../contracts/analysis/generic-quote-unit.schema.json' with { type: 'json' };
import revisionSchema from '../../../../contracts/analysis/automation-quote-report-revision.schema.json' with { type: 'json' };
import snapshotSchema from '../../../../contracts/analysis/automation-quote-method-snapshot.schema.json' with { type: 'json' };
import intakeSchema from '../../../../contracts/foundation/source-package-intake-request.schema.json' with { type: 'json' };
import type { AutomationQuoteMethodSnapshot } from '../../../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import type { GenericQuoteUnit } from '../../../../contracts/analysis/generic-quote-unit.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import type { VerifiedSourcePackageFile } from '../../foundation/source-package-service.js';
import { buildGenericQuoteUnit, GenericQuoteUnitValidationError, validateGenericQuoteUnitInput } from '../generic-quote-unit.js';
import { ReportMethodPacketsExtensionError } from '../report-method-packets-extension.js';
import { MAX_JSON_ARTIFACT_BYTES } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
// The legacy quote contract uses research.local; alias the unchanged Foundation
// schema at its relative URL rather than duplicating the provenance contract.
ajv.addSchema(intakeSchema, new URL('../foundation/source-package-intake-request.schema.json', snapshotSchema.$id).href);
ajv.addSchema([quoteSchema, revisionSchema, snapshotSchema]);
type Binding = AutomationQuoteMethodSnapshot['binding'];
type Selection = AutomationQuoteMethodSnapshot['selection'];
type Input = GenericQuoteUnit['input'];
type Ref = Input['quotes'][number]['source'];
const snapshotValid = ajv.getSchema<AutomationQuoteMethodSnapshot>(snapshotSchema.$id)!;
const bindingValid = ajv.getSchema<Binding>(`${snapshotSchema.$id}#/$defs/binding`)!;
const selectionValid = ajv.getSchema<Selection>(`${revisionSchema.$id}#/$defs/selection`)!;
// Same explicit budget as the bounded G snapshot; each parsed JSON file is additionally capped.
const READ_BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 } as const;
const MAX_PARSED_BYTES = 8 * 1024 * 1024;
/** Versioned literal mapping profile; the descriptor's configuration.mappingRevision must equal it. */
const LITERAL_PROFILE_ID = 'literal-structured-quote-v1';
// SHA-256 of the exact committed contracts/analysis/generic-quote-unit.schema.json bytes (1.0.0 / clarification 1.1).
// A schema change must bump this pin; the retained profile must also canonically equal the executing schema.
const GENERIC_QUOTE_SCHEMA_SHA256 = 'c07bb17b1d6efe0c41c983c255be9f2004e7060960b4ae0c3333c190d66b86f9';
const REFERENCE_KEYS = new Set(['source', 'binding', 'basisBinding', 'checkoutBinding', 'massSelectionBinding']);
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
function fail(code: string): never { throw new ReportMethodPacketsExtensionError(code); }

function parseJson(file: VerifiedSourcePackageFile): unknown {
  if (file.byteSize !== file.bytes.length || file.sha256 !== sha(file.bytes)) fail('QUOTE_METHOD_SOURCE_BYTES_MISMATCH');
  if (file.mediaType !== 'application/json') fail('QUOTE_METHOD_JSON_SOURCE_REQUIRED');
  if (file.bytes.length > MAX_PARSED_BYTES) fail('QUOTE_METHOD_SOURCE_TOO_LARGE');
  let text = ''; let value: unknown;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(file.bytes); value = JSON.parse(text); }
  catch { return fail('QUOTE_METHOD_INVALID_JSON'); }
  rejectDuplicateKeys(text);
  return value;
}

// JSON.parse keeps the last duplicate key silently; a literal record must not hide a conflicting value.
// Runs only on text JSON.parse already accepted, so a string followed by ':' is always an object key.
function rejectDuplicateKeys(text: string): void {
  const stack: (Set<string> | null)[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      let j = i + 1;
      while (text[j] !== '"') j += text[j] === '\\' ? 2 : 1;
      let k = j + 1;
      while (' \t\n\r'.includes(text[k] ?? '.')) k++;
      const keys = stack.at(-1);
      if (keys && text[k] === ':') {
        const key = JSON.parse(text.slice(i, j + 1)) as string;
        if (keys.has(key)) fail('QUOTE_METHOD_DUPLICATE_JSON_KEY');
        keys.add(key);
      }
      i = j;
    } else if (c === '{') stack.push(new Set()); else if (c === '[') stack.push(null); else if (c === '}' || c === ']') stack.pop();
  }
}

function resolvePointer(document: unknown, fieldPointer: string): unknown {
  let value = document;
  for (const token of fieldPointer.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key) ||
        (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))) fail('QUOTE_METHOD_UNRESOLVED_POINTER');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/** Business payload: every field except reference fields, recursively, so no record carries its own digest. */
function businessPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(businessPayload);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !REFERENCE_KEYS.has(key)).map(([key, child]) => [key, businessPayload(child)]));
}

/**
 * literal-structured-quote-v1. Each listed source is exact JSON package bytes (no other media type is parsed).
 * A ref resolves only in the source whose logicalPath + fieldPointer equals its locator and whose digest matches.
 * Every non-null ref must resolve AND canonically equal the business value it binds (a resolvable pointer alone
 * proves nothing). Pointer suffix rules keep look-alike shapes apart (pack count vs mass quantity, NET vs DRAINED):
 *   quote.source                          -> any record             == payload(quote)
 *   identity.binding                      -> .../identity           == payload(identity) (IDs, variant state/ID/attributes, linkage)
 *   identity.variantAttributes[i].binding -> .../identity/variantAttributes/<n> == {name, literal}
 *   price.binding                         -> .../price              == payload(price) (state, value/range, currency, price state, conditions, tax, shipping)
 *   price.conditions[i].binding           -> .../price/conditions/<n> == {literal}
 *   price.checkoutBinding                 -> rejected: checkout evidence has no literal shape in this profile
 *   pack.binding                          -> .../pack               == payload(pack) (count, composition, linkage, components)
 *   pack.count.binding                    -> .../pack/count         == payload(count) (state, value, unit, dimension, origin, literal)
 *   netMass.basisBinding / quantity.binding -> .../netMass, .../netMass/quantity (same for drainedMass)
 *   massSelectionBinding                  -> .../selectedMassBases  == selectedMassBases
 *   configuration.parserProfileRef        -> pinned generic-quote-unit schema bytes, /$id
 *   configuration.configurationRef        -> .../mappingRevision    == 'literal-structured-quote-v1'
 * Roles stay descriptor declarations checked by validateGenericQuoteUnitInput (OWNER_DECLARED needs an
 * OWNER_DECLARATION file and remains SCENARIO). Authentication/review states are retained declarations only.
 */
function verifyLiteralProfile(input: Input, documents: ReadonlyMap<string, unknown>): void {
  const sources = new Map(input.sources.map(source => [source.logicalPath, source]));
  const pathOf = (ref: Ref): string => {
    const path = ref.locator.endsWith(ref.fieldPointer) ? ref.locator.slice(0, ref.locator.length - ref.fieldPointer.length) : '';
    if (sources.get(path)?.sha256 !== ref.sourceSha256) fail('QUOTE_METHOD_REFERENCE_LOCATOR_MISMATCH');
    return path;
  };
  const bind = (ref: Ref | null, suffix: RegExp | null, expected: unknown): void => {
    if (ref === null) return;
    if (suffix !== null && !suffix.test(ref.fieldPointer)) fail('QUOTE_METHOD_BINDING_FIELD_MISMATCH');
    if (canonicalJson(resolvePointer(documents.get(pathOf(ref)), ref.fieldPointer)) !== canonicalJson(expected)) fail('QUOTE_METHOD_BINDING_VALUE_MISMATCH');
  };
  const configuration = input.configuration;
  if (configuration.parserProfileId !== 'generic-quote-unit-v1' || configuration.parserRevision !== '1.0.0' ||
      configuration.mappingRevision !== LITERAL_PROFILE_ID) fail('QUOTE_METHOD_UNSUPPORTED_MAPPING_PROFILE');
  if (configuration.parserProfileSha256 !== GENERIC_QUOTE_SCHEMA_SHA256 || configuration.parserProfileRef.fieldPointer !== '/$id') fail('QUOTE_METHOD_PARSER_PROFILE_NOT_PINNED');
  bind(configuration.parserProfileRef, null, quoteSchema.$id);
  if (canonicalJson(documents.get(pathOf(configuration.parserProfileRef))) !== canonicalJson(quoteSchema)) fail('QUOTE_METHOD_PARSER_PROFILE_NOT_PINNED');
  bind(configuration.configurationRef, /\/mappingRevision$/, LITERAL_PROFILE_ID);
  for (const quote of input.quotes) {
    if (quote.price.checkoutBinding !== null) fail('QUOTE_METHOD_CHECKOUT_EVIDENCE_PROFILE_UNSUPPORTED');
    bind(quote.source, null, businessPayload(quote));
    bind(quote.identity.binding, /\/identity$/, businessPayload(quote.identity));
    for (const attribute of quote.identity.variantAttributes) bind(attribute.binding, /\/identity\/variantAttributes\/(?:0|[1-9][0-9]*)$/, businessPayload(attribute));
    bind(quote.price.binding, /\/price$/, businessPayload(quote.price));
    for (const condition of quote.price.conditions) bind(condition.binding, /\/price\/conditions\/(?:0|[1-9][0-9]*)$/, businessPayload(condition));
    bind(quote.pack.binding, /\/pack$/, businessPayload(quote.pack));
    bind(quote.pack.count.binding, /\/pack\/count$/, businessPayload(quote.pack.count));
    bind(quote.netMass.basisBinding, /\/netMass$/, businessPayload(quote.netMass));
    bind(quote.netMass.quantity.binding, /\/netMass\/quantity$/, businessPayload(quote.netMass.quantity));
    bind(quote.drainedMass.basisBinding, /\/drainedMass$/, businessPayload(quote.drainedMass));
    bind(quote.drainedMass.quantity.binding, /\/drainedMass\/quantity$/, businessPayload(quote.drainedMass.quantity));
    bind(quote.massSelectionBinding, /\/selectedMassBases$/, quote.selectedMassBases);
  }
}

/** Recomputes GenericQuoteUnit from one exact finalized package descriptor under literal-structured-quote-v1.
 * Structured source intake only: no extraction from arbitrary provider JSON, no title/pack inference, no
 * checkout or review authority, no database write and no latest-package lookup. */
export async function buildAutomationQuoteMethods(selection: Selection, binding: Binding, reader: FinalizedSourcePackageReader): Promise<AutomationQuoteMethodSnapshot> {
  if (!selectionValid(selection)) fail('QUOTE_METHOD_SELECTION_INVALID');
  if (!bindingValid(binding)) fail('QUOTE_METHOD_BINDING_INVALID');
  const retained = await reader.readFinalizedSourcePackage(selection.packageId, READ_BUDGET);
  if (retained.packageId !== selection.packageId || retained.manifestArtifactSha256 !== selection.manifestArtifactSha256 ||
      retained.packageContentSha256 !== selection.packageContentSha256 || retained.manifest.packageId !== selection.packageId ||
      retained.manifest.packageContentSha256 !== selection.packageContentSha256) fail('QUOTE_METHOD_PACKAGE_IDENTITY_MISMATCH');
  const byPath = new Map(retained.files.map(file => [file.path, file]));
  if (byPath.size !== retained.files.length) fail('QUOTE_METHOD_DUPLICATE_SOURCE_PATH');
  const descriptor = byPath.get(selection.descriptorPath) ?? fail('QUOTE_METHOD_DESCRIPTOR_MISSING');
  const declared = parseJson(descriptor);
  if (declared === null || typeof declared !== 'object' || Array.isArray(declared)) fail('QUOTE_METHOD_DESCRIPTOR_INVALID');
  if (Object.hasOwn(declared, 'sourcePackage')) fail('QUOTE_METHOD_DESCRIPTOR_AUTHORED_PACKAGE_IDENTITY');
  const sourcePackage: Input['sourcePackage'] = { packageId: retained.packageId, version: retained.manifest.version,
    manifestArtifactSha256: retained.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256 };
  let input: Input;
  try { input = validateGenericQuoteUnitInput({ ...declared, sourcePackage }); }
  catch (error) { if (error instanceof GenericQuoteUnitValidationError) fail(`QUOTE_METHOD_INPUT_INVALID:${error.message}`); throw error; }
  const documents = new Map<string, unknown>();
  for (const source of input.sources) {
    const file = byPath.get(source.logicalPath);
    if (!file || file.sha256 !== source.sha256) fail('QUOTE_METHOD_SOURCE_MEMBERSHIP_MISMATCH');
    if (file.path === descriptor.path || file.sha256 === descriptor.sha256) fail('QUOTE_METHOD_DESCRIPTOR_SELF_REFERENCE');
    documents.set(file.path, parseJson(file));
  }
  verifyLiteralProfile(input, documents);
  let output: GenericQuoteUnit;
  try { output = buildGenericQuoteUnit(input).output; }
  catch (error) { if (error instanceof GenericQuoteUnitValidationError) fail(`QUOTE_METHOD_OUTPUT_INVALID:${error.message}`); throw error; }
  const snapshot: AutomationQuoteMethodSnapshot = {
    contractVersion: 'automation-quote-method-snapshot-v1', binding: JSON.parse(canonicalJson(binding)) as Binding,
    selection: JSON.parse(canonicalJson(selection)) as Selection, descriptorSha256: descriptor.sha256,
    sourceMetadata: input.sources.map(source => {
      const metadata = retained.manifest.files.find(file => file.path === source.logicalPath);
      if (!metadata || metadata.sha256 !== source.sha256) fail('QUOTE_METHOD_MANIFEST_SOURCE_MISMATCH');
      return JSON.parse(canonicalJson(metadata)) as typeof metadata;
    }), output,
  };
  if (Buffer.byteLength(canonicalJson(snapshot)) > MAX_JSON_ARTIFACT_BYTES) fail('QUOTE_METHOD_SNAPSHOT_TOO_LARGE');
  if (!snapshotValid(snapshot)) fail('QUOTE_METHOD_SNAPSHOT_INVALID');
  return snapshot;
}

/** Replays a stored snapshot against the same exact package; any byte or derived difference is rejected. */
export async function verifyAutomationQuoteMethods(value: unknown, binding: Binding, selection: Selection, reader: FinalizedSourcePackageReader): Promise<AutomationQuoteMethodSnapshot> {
  if (Buffer.byteLength(canonicalJson(value)) > MAX_JSON_ARTIFACT_BYTES || !snapshotValid(value)) fail('QUOTE_METHOD_SNAPSHOT_INVALID');
  const expected = await buildAutomationQuoteMethods(selection, binding, reader);
  if (canonicalJson(value) !== canonicalJson(expected)) fail('QUOTE_METHOD_SNAPSHOT_REPLAY_MISMATCH');
  return expected;
}

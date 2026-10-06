import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/generic-quote-unit.schema.json' with { type: 'json' };
import type { GenericQuoteUnit } from '../../../contracts/analysis/generic-quote-unit.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
type Input = GenericQuoteUnit['input'];
type Quote = Input['quotes'][number];
type Quantity = Quote['pack']['count'];
type Ref = Quote['source'];
type Result = GenericQuoteUnit['quotes'][number]['pricePerPurchasedPack'];
type Reason = Result['reasons'][number];
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<GenericQuoteUnit>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
export class GenericQuoteUnitValidationError extends TypeError {}
function fail(code: string): never { throw new GenericQuoteUnitValidationError(code); }

// Existing tablet/economics arithmetic is private. Keep this method independent
// rather than changing a legacy method's public or semantic boundary.
type Rational = { n: bigint; d: bigint };
function rational(n: bigint, d = 1n): Rational {
  if (d <= 0n || n < 0n) fail('INVALID_RATIONAL');
  let a = n; let b = d;
  while (b) { [a, b] = [b, a % b]; }
  return { n: n / a, d: d / a };
}
function decimal(value: string): Rational {
  const [whole, fraction = ''] = value.split('.');
  return rational(BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length));
}
function multiply(a: Rational, b: Rational): Rational { return rational(a.n * b.n, a.d * b.d); }
function divide(a: Rational, b: Rational): Rational { return rational(a.n * b.d, a.d * b.n); }
function exact(value: Rational): NonNullable<Result['exact']> {
  return { numerator: value.n.toString(), denominator: value.d.toString() };
}
function display(value: Rational): string {
  const scaled = value.n * 100n;
  let rounded = scaled / value.d;
  const twiceRemainder = (scaled % value.d) * 2n;
  if (twiceRemainder > value.d || (twiceRemainder === value.d && rounded % 2n === 1n)) rounded++;
  return `${rounded / 100n}.${(rounded % 100n).toString().padStart(2, '0')}`;
}

const PHYSICAL_COUNT_UNIT_ALIASES_V1 = new Map<string, string>(Object.entries({
  item: ['item', 'items', 'piece', 'pieces', 'pc', 'pcs', 'unit', 'units', 'cái'],
  jar: ['jar', 'jars', 'lọ'],
  bottle: ['bottle', 'bottles', 'chai'],
  can: ['can', 'cans', 'lon'],
  box: ['box', 'boxes', 'hộp'],
  bag: ['bag', 'bags', 'túi'],
  sachet: ['sachet', 'sachets', 'gói'],
  packet: ['packet', 'packets'],
  tube: ['tube', 'tubes', 'ống'],
  tablet: ['tablet', 'tablets', 'viên'],
  capsule: ['capsule', 'capsules'],
}).flatMap(([canonical, aliases]) => aliases.map(alias => [alias, canonical] as [string, string])));

function physicalCountUnit(quantity: Quantity): string | null {
  return quantity.unit === null ? null
    : PHYSICAL_COUNT_UNIT_ALIASES_V1.get(quantity.unit.normalize('NFC').trim().toLowerCase()) ?? null;
}

/** Source-bound declarations only; exact retained package bytes and locators remain the caller's responsibility. */
export function validateGenericQuoteUnitInput(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('INPUT_TOO_LARGE');
  if (!validateInput(untrusted)) fail(`INVALID_GENERIC_QUOTE_INPUT:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  const sources = new Map<string, Input['sources'][number]>();
  const paths = new Set<string>();
  for (const source of input.sources) {
    if (paths.has(source.logicalPath)) fail('DUPLICATE_SOURCE_PATH');
    if (source.logicalPath.startsWith('/') || source.logicalPath.includes('\\') || /^[a-z]:/i.test(source.logicalPath) ||
      source.logicalPath.split('/').some(part => part === '' || part === '.' || part === '..')) fail('INVALID_SOURCE_PATH');
    paths.add(source.logicalPath);
    const previous = sources.get(source.sha256);
    if (previous && previous.role !== source.role) fail('CONFLICTING_SOURCE_ROLE');
    sources.set(source.sha256, source);
  }
  function checkRefs(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(checkRefs); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('sourceSha256' in object && 'locator' in object) {
      if (!sources.has(object.sourceSha256 as string)) fail('UNKNOWN_SOURCE_REFERENCE');
      if (!(object.locator as string).trim()) fail('EMPTY_SOURCE_LOCATOR');
    }
    Object.values(object).forEach(checkRefs);
  }
  checkRefs(input);
  if (input.configuration.parserProfileRef.sourceSha256 !== input.configuration.parserProfileSha256) fail('PARSER_PROFILE_DIGEST_MISMATCH');
  const role = (ref: Ref | null): string | undefined => ref ? sources.get(ref.sourceSha256)?.role : undefined;
  function quantity(value: Quantity): void {
    if (value.state === 'EXACT' && (value.value === null || !value.unit?.trim() || !value.literal?.trim() || value.origin === 'UNKNOWN' || value.binding === null)) fail('EXACT_QUANTITY_INCOMPLETE');
    if (['MISSING', 'UNREADABLE', 'UNKNOWN'].includes(value.state) && value.value !== null) fail('QUANTITY_STATE_MISMATCH');
    if (value.origin === 'SOURCE_STATED' && role(value.binding) !== 'SOURCE') fail('QUANTITY_SOURCE_ROLE_MISMATCH');
    if (value.origin === 'OWNER_DECLARED' && role(value.binding) !== 'OWNER_DECLARATION') fail('QUANTITY_DECLARATION_ROLE_MISMATCH');
  }
  const ids = new Set<string>();
  for (const quote of input.quotes) {
    if (!quote.quoteId.trim() || ids.has(quote.quoteId)) fail('INVALID_OR_DUPLICATE_QUOTE_ID');
    ids.add(quote.quoteId);
    if (role(quote.source) !== 'SOURCE') fail('QUOTE_SOURCE_ROLE_MISMATCH');
    const identity = quote.identity;
    if (identity.state === 'EXACT' && (!identity.platform?.trim() || !identity.shopId?.trim() || !identity.listingId?.trim() || role(identity.binding) !== 'SOURCE')) fail('EXACT_IDENTITY_INCOMPLETE');
    if (identity.variantState === 'EXACT' && (!identity.variantId?.trim() || role(identity.binding) !== 'SOURCE')) fail('EXACT_VARIANT_INCOMPLETE');
    if (identity.variantState === 'NOT_APPLICABLE' && (identity.variantId !== null || identity.binding === null)) fail('VARIANT_STATE_MISMATCH');
    if (identity.variantAttributes.some(attribute => role(attribute.binding) !== 'SOURCE')) fail('VARIANT_ATTRIBUTE_SOURCE_ROLE_MISMATCH');
    const price = quote.price;
    if (price.state === 'EXACT' && price.value === null) fail('PRICE_STATE_MISMATCH');
    if (['RANGE', 'MISSING', 'UNREADABLE', 'UNKNOWN'].includes(price.state) && price.value !== null) fail('PRICE_STATE_MISMATCH');
    if (price.state === 'RANGE' ? price.range === null : price.range !== null) fail('PRICE_RANGE_STATE_MISMATCH');
    if ((price.state === 'EXACT' || price.state === 'RANGE') && role(price.binding) !== 'SOURCE') fail('PRICE_SOURCE_BINDING_MISSING');
    if (price.range) {
      const low = decimal(price.range.minimum); const high = decimal(price.range.maximum);
      if (low.n * high.d > high.n * low.d) fail('PRICE_RANGE_REVERSED');
    }
    if (price.priceState === 'OBSERVED_CHECKOUT' && role(price.checkoutBinding) !== 'SOURCE') fail('CHECKOUT_SOURCE_BINDING_MISSING');
    if (price.priceState !== 'OBSERVED_CHECKOUT' && price.checkoutBinding !== null) fail('CHECKOUT_STATE_MISMATCH');
    if (price.priceState === 'PROMO_CONDITIONAL' && !price.conditions.length) fail('PROMO_CONDITIONS_MISSING');
    if (price.conditions.some(condition => role(condition.binding) !== 'SOURCE')) fail('PRICE_CONDITION_SOURCE_ROLE_MISMATCH');
    quantity(quote.pack.count);
    quantity(quote.netMass.quantity); quantity(quote.drainedMass.quantity);
    if (quote.pack.compositionState === 'HOMOGENEOUS' && quote.pack.binding === null) fail('PACK_COMPOSITION_BINDING_MISSING');
    for (const mass of [quote.netMass, quote.drainedMass]) {
      if (mass.quantity.state === 'EXACT' && mass.basis !== 'UNKNOWN' && mass.basisBinding === null) fail('MASS_BASIS_BINDING_MISSING');
    }
    if (quote.selectedMassBases.length && quote.massSelectionBinding === null) fail('MASS_SELECTION_BINDING_MISSING');
  }
  return input;
}

export function buildGenericQuoteUnit(untrusted: unknown): { output: GenericQuoteUnit; bytes: Buffer } {
  const input = validateGenericQuoteUnitInput(untrusted);
  const sources = new Map(input.sources.map(source => [source.sha256, source.role]));
  const isDeclared = (ref: Ref | null): boolean => ref !== null && sources.get(ref.sourceSha256) === 'OWNER_DECLARATION';
  const quotes: GenericQuoteUnit['quotes'] = input.quotes.map((quote, index) => {
    const pointer = `/input/quotes/${index}`;
    const priceReasons: Reason[] = [];
    if (quote.price.state !== 'EXACT') priceReasons.push('PRICE_NOT_EXACT');
    if (quote.price.currency === null) priceReasons.push('CURRENCY_UNKNOWN');
    const linkageReasons: Reason[] = [];
    if (quote.identity.state !== 'EXACT') linkageReasons.push('IDENTITY_UNRESOLVED');
    if (!['EXACT', 'NOT_APPLICABLE'].includes(quote.identity.variantState)) linkageReasons.push('VARIANT_UNRESOLVED');
    if (quote.identity.linkage !== 'MATCHED' || quote.pack.linkage !== 'MATCHED') linkageReasons.push('OFFER_LINKAGE_UNRESOLVED');
    const packReasons: Reason[] = quote.pack.compositionState === 'HOMOGENEOUS' ? [] : ['PACK_NOT_HOMOGENEOUS'];
    const count = quote.pack.count.value === null ? null : decimal(quote.pack.count.value);
    const countReasons: Reason[] = quote.pack.count.state === 'EXACT' ? [] : ['COUNT_NOT_EXACT'];
    if (quote.pack.count.dimension !== 'PHYSICAL_COUNT') countReasons.push('COUNT_UNIT_NOT_PHYSICAL');
    if (physicalCountUnit(quote.pack.count) === null) countReasons.push('UNSUPPORTED_PHYSICAL_COUNT_UNIT');
    if (count !== null && (count.n === 0n || count.d !== 1n)) countReasons.push('INVALID_COUNT_VALUE');
    const price = quote.price.value === null ? null : decimal(quote.price.value);
    function result(reasons: Reason[], value: Rational | null, denominator: Rational | null, scenario: boolean, operands: string[]): Result {
      const unique = [...new Set(reasons)];
      const ready = unique.length === 0 && value !== null;
      return {
        status: ready ? 'AVAILABLE' : 'UNAVAILABLE', basis: ready ? scenario ? 'SCENARIO' : 'SOURCED' : null,
        reasons: unique, exact: ready ? exact(value) : null, display: ready ? display(value) : null,
        rounding: 'decimal-2-half-even-v1', denominator: ready && denominator ? exact(denominator) : null,
        operandPointers: operands,
      };
    }
    const countScenario = quote.pack.count.origin === 'OWNER_DECLARED' || isDeclared(quote.pack.binding);
    function massResult(basis: 'NET' | 'DRAINED'): Result {
      const key = basis === 'NET' ? 'netMass' : 'drainedMass';
      const mass = quote[key];
      const reasons = [...priceReasons, ...linkageReasons, ...packReasons];
      const operands = [`${pointer}/price`, `${pointer}/${key}`, `${pointer}/selectedMassBases`, `${pointer}/identity`, `${pointer}/pack`];
      if (!quote.selectedMassBases.includes(basis)) reasons.push('MASS_BASIS_NOT_SELECTED');
      if (mass.quantity.state !== 'EXACT') reasons.push('MASS_NOT_EXACT');
      if (mass.quantity.value !== null && decimal(mass.quantity.value).n === 0n) reasons.push('INVALID_MASS_VALUE');
      if (mass.linkage !== 'MATCHED') reasons.push('MASS_LINKAGE_UNRESOLVED');
      if (mass.basis === 'UNKNOWN') reasons.push('MASS_BASIS_UNKNOWN');
      if (mass.quantity.dimension !== 'MASS' || !['g', 'kg'].includes(mass.quantity.unit ?? '')) reasons.push('UNSUPPORTED_MASS_UNIT');
      if (mass.basis === 'PER_ITEM') reasons.push(...countReasons);
      let grams: Rational | null = null;
      if (!reasons.length && mass.quantity.value !== null) {
        grams = decimal(mass.quantity.value);
        if (mass.quantity.unit === 'kg') grams = multiply(grams, rational(1000n));
        if (mass.basis === 'PER_ITEM') grams = multiply(grams, count!);
      }
      const scenario = mass.quantity.origin === 'OWNER_DECLARED' || isDeclared(mass.basisBinding) || isDeclared(quote.pack.binding) ||
        (mass.basis === 'PER_ITEM' && countScenario);
      return result(reasons, grams && price ? divide(multiply(price, rational(100n)), grams) : null, grams, scenario, operands);
    }
    const perItemReasons = [...priceReasons, ...linkageReasons, ...packReasons, ...countReasons];
    return {
      quoteId: quote.quoteId, quoteInputSha256: digest(quote), inventoryPointer: pointer,
      // A source price remains an unassigned observation when variant linkage is unresolved.
      pricePerPurchasedPack: result([...priceReasons, ...linkageReasons], price, rational(1n), false,
        [`${pointer}/price`, `${pointer}/identity`, `${pointer}/pack`]),
      pricePerPhysicalItem: result(perItemReasons, !perItemReasons.length && price && count ? divide(price, count) : null, count, countScenario,
        [`${pointer}/price`, `${pointer}/pack`, `${pointer}/identity`]),
      pricePer100gNet: massResult('NET'), pricePer100gDrained: massResult('DRAINED'),
    };
  });
  const body: Omit<GenericQuoteUnit, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'generic-quote-unit-v1', methodVersion: '1.0.0',
    physicalCountUnitMappingRevision: 'physical-count-unit-v1', inputSha256: digest(input), input, quotes,
    limitations: [
      'NORMALIZED_SOURCE_DECLARATION_NOT_VERIFIED_PROVIDER_TRUTH',
      'EXACT_PACKAGE_BYTES_FIELD_POINTERS_AND_PARSER_REPLAY_REQUIRE_CALLER_VERIFICATION',
      'DECLARED_AUTHENTICATION_AND_REVIEW_NOT_METHOD_ATTESTATION',
      'SOURCE_PRICE_STATE_CONDITIONS_TIME_TAX_AND_SHIPPING_RETAINED_WITHOUT_INFERENCE',
      'UNKNOWN_OBSERVATION_TIME_NOT_CURRENT_PRICE',
      'OWNER_DECLARED_DENOMINATOR_REMAINS_SCENARIO',
      'NO_VOLUME_CAPACITY_PERFORMANCE_DENOMINATOR_OR_MIXED_BUNDLE_ALLOCATION',
      'NO_RANK_EQUIVALENCE_COST_MARGIN_PROFIT_OR_TRANSACTION_AUTHENTICATION',
      'OFFLINE_UNREVIEWED_METHOD_NOT_LIVE_OR_COMPLETE_M08_SECTION',
    ],
  };
  const output: GenericQuoteUnit = { ...body, methodOutputId: digest(body) };
  if (!validateOutput(output)) fail(`INVALID_GENERIC_QUOTE_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  return { output, bytes };
}

/** Rebuild all results and metadata from frozen declarations, never refetch or resolve conflicts. */
export function verifyGenericQuoteUnit(untrusted: unknown): { output: GenericQuoteUnit; bytes: Buffer } {
  if (Buffer.byteLength(canonicalJson(untrusted)) > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  if (!validateOutput(untrusted)) fail(`INVALID_GENERIC_QUOTE_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const rebuilt = buildGenericQuoteUnit((untrusted as GenericQuoteUnit).input);
  if (canonicalJson(untrusted) !== canonicalJson(rebuilt.output)) fail('GENERIC_QUOTE_REPLAY_MISMATCH');
  return rebuilt;
}

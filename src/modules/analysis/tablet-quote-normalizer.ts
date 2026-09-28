import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import inputSchema from '../../../contracts/analysis/tablet-quote-input.schema.json' with { type: 'json' };
import outputSchema from '../../../contracts/analysis/tablet-quote-output.schema.json' with { type: 'json' };
import type { TabletQuoteInput } from '../../../contracts/analysis/tablet-quote-input.generated.js';
import type {
  TabletQuoteOutput,
  DisplayValue,
  Rational as OutputRational,
} from '../../../contracts/analysis/tablet-quote-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
const validateInput = ajv.getSchema<TabletQuoteInput>(inputSchema.$id)!;
const validateOutput = ajv.compile<TabletQuoteOutput>(outputSchema);

type ExactRational = { numerator: bigint; denominator: bigint };
type OutputCalculation = TabletQuoteOutput['pricePerPack'];

const LIMITATIONS = [
  'SCENARIO_QUOTE_NORMALIZATION_ONLY',
  'PACK_COUNT_OPERATOR_DECLARED_NOT_PARSED_OR_VERIFIED',
  'ARITHMETIC_PACKAGING_DENOMINATOR_ONLY',
  'PRICE_STATE_RETAINED_NOT_INTERCHANGEABLE',
  'OBSERVATION_PERIOD_DECLARED_NOT_VERIFIED_OR_COMPARED',
  'NO_GTIN_VARIANT_OR_VERSION_INFERENCE',
  'NO_EQUAL_DOSE_OR_EFFICACY_CLAIM',
  'NO_COMPARISON_RANKING_WTP_OR_RECOMMENDATION',
] as const;

export class TabletQuoteNormalizationValidationError extends TypeError {}

function gcd(a: bigint, b: bigint): bigint {
  let x = a < 0n ? -a : a;
  let y = b < 0n ? -b : b;
  while (y !== 0n) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1n;
}

function rational(numerator: bigint, denominator = 1n): ExactRational {
  if (denominator === 0n) throw new TabletQuoteNormalizationValidationError('ZERO_RATIONAL_DENOMINATOR');
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator * sign) / divisor, denominator: (denominator * sign) / divisor };
}

function divide(a: ExactRational, b: ExactRational): ExactRational {
  return rational(a.numerator * b.denominator, a.denominator * b.numerator);
}

function parseDecimal(value: string): ExactRational {
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new TabletQuoteNormalizationValidationError(`INVALID_DECIMAL:${value}`);
  const sign = match[1];
  const wholePart = match[2];
  if (sign === undefined || wholePart === undefined) throw new TabletQuoteNormalizationValidationError(`INVALID_DECIMAL:${value}`);
  const fraction = match[3] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const magnitude = BigInt(wholePart) * scale + (fraction ? BigInt(fraction) : 0n);
  return rational(sign === '-' ? -magnitude : magnitude, scale);
}

function exactValue(value: ExactRational): OutputRational {
  return { numerator: value.numerator.toString(), denominator: value.denominator.toString(), reduced: true };
}

function halfEvenDecimal2(value: ExactRational): string {
  const negative = value.numerator < 0n;
  const magnitude = negative ? -value.numerator : value.numerator;
  const scaled = magnitude * 100n;
  let quotient = scaled / value.denominator;
  const remainder = scaled % value.denominator;
  if (remainder * 2n > value.denominator ||
      (remainder * 2n === value.denominator && quotient % 2n === 1n)) quotient += 1n;
  const whole = quotient / 100n;
  const fraction = (quotient % 100n).toString().padStart(2, '0');
  return `${negative && quotient !== 0n ? '-' : ''}${whole.toString()}.${fraction}`;
}

function validateDomain(input: TabletQuoteInput): void {
  const hasObservedAt = input.observedAt !== null;
  const hasPeriod = input.observationPeriod !== null;
  if (input.observationTimeState === 'KNOWN' && !hasObservedAt && !hasPeriod) {
    throw new TabletQuoteNormalizationValidationError('KNOWN_OBSERVATION_TIME_MISSING');
  }
  if (input.observationTimeState === 'UNKNOWN' && (hasObservedAt || hasPeriod)) {
    throw new TabletQuoteNormalizationValidationError('UNKNOWN_OBSERVATION_TIME_HAS_VALUE');
  }
  if (input.packCount !== null && input.packCount.provenance.kind !== 'OWNER_DECLARED') {
    throw new TabletQuoteNormalizationValidationError('PACK_COUNT_MUST_BE_OPERATOR_DECLARED');
  }
}

function validatedInput(untrusted: unknown): TabletQuoteInput {
  if (!validateInput(untrusted)) {
    throw new TabletQuoteNormalizationValidationError(`Invalid tablet quote input: ${ajv.errorsText(validateInput.errors)}`);
  }
  const input = JSON.parse(canonicalJson(untrusted)) as TabletQuoteInput;
  validateDomain(input);
  return input;
}

function available(value: ExactRational): OutputCalculation {
  const displayValue: DisplayValue = { value: halfEvenDecimal2(value), roundingVersion: 'HALF_EVEN_DECIMAL_2_VND_V1' };
  return { state: 'AVAILABLE', exactValue: exactValue(value), displayValue, missingInputs: [], limitations: [...LIMITATIONS] };
}

function unavailable(missingInputs: string[]): OutputCalculation {
  return { state: 'UNAVAILABLE', exactValue: null, displayValue: null, missingInputs, limitations: [...LIMITATIONS, 'REQUIRED_QUOTE_INPUT_UNAVAILABLE'] };
}

function buildOutput(input: TabletQuoteInput): TabletQuoteOutput {
  const price = input.priceVnd === null ? null : parseDecimal(input.priceVnd.value);
  const packCount = input.packCount === null ? null : parseDecimal(input.packCount.value);
  const pricePerPack = price === null ? unavailable(['priceVnd']) : available(price);
  let pricePerTabletArithmetic: OutputCalculation;
  if (price === null && packCount === null) pricePerTabletArithmetic = unavailable(['priceVnd', 'packCount']);
  else if (price === null) pricePerTabletArithmetic = unavailable(['priceVnd']);
  else if (packCount === null) pricePerTabletArithmetic = unavailable(['packCount']);
  else pricePerTabletArithmetic = available(divide(price, packCount));
  const output: TabletQuoteOutput = {
    contractVersion: '1.0.0',
    methodVersion: 'tablet-quote-normalization-v1',
    quoteId: input.quoteId,
    sourceRef: input.sourceRef,
    observedAt: input.observedAt,
    observationPeriod: input.observationPeriod,
    observationTimeState: input.observationTimeState,
    entityTitle: input.entityTitle,
    packText: input.packText,
    packCount: input.packCount,
    priceVnd: input.priceVnd,
    currency: 'VND',
    priceState: input.priceState,
    identityTier: input.identityTier,
    variantStatus: input.variantStatus,
    gtinStatus: input.gtinStatus,
    versionStatus: input.versionStatus,
    sourceRole: input.sourceRole,
    status: 'SCENARIO',
    approvalState: 'UNREVIEWED',
    evidenceState: 'DECLARED_UNVERIFIED',
    sourceAuthenticity: 'NOT_AUTHENTICATED',
    inputSha256: createHash('sha256').update(canonicalJson(input)).digest('hex'),
    pricePerPack,
    pricePerTabletArithmetic,
    limitations: [...LIMITATIONS],
  };
  if (!validateOutput(output)) {
    throw new TabletQuoteNormalizationValidationError(`Invalid tablet quote output: ${ajv.errorsText(validateOutput.errors)}`);
  }
  return JSON.parse(canonicalJson(output)) as TabletQuoteOutput;
}

/** Pure P4 packaging arithmetic. Pack counts are explicit operator declarations, never title inference. */
export function normalizeTabletQuote(untrusted: unknown): TabletQuoteOutput {
  return buildOutput(validatedInput(untrusted));
}

/** Replays a previously emitted result and rejects changed inputs or edited arithmetic. */
export function replayTabletQuoteNormalization(input: unknown, output: unknown): TabletQuoteOutput {
  const expected = normalizeTabletQuote(input);
  if (!validateOutput(output)) throw new TabletQuoteNormalizationValidationError(`Invalid tablet quote output: ${ajv.errorsText(validateOutput.errors)}`);
  if (canonicalJson(expected) !== canonicalJson(output)) throw new TabletQuoteNormalizationValidationError('TABLET_QUOTE_REPLAY_MISMATCH');
  return JSON.parse(canonicalJson(output)) as TabletQuoteOutput;
}

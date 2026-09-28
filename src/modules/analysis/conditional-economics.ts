import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import inputSchema from '../../../contracts/analysis/conditional-economics-input.schema.json' with { type: 'json' };
import outputSchema from '../../../contracts/analysis/conditional-economics-output.schema.json' with { type: 'json' };
import type {
  ConditionalEconomicsInput,
  DecimalInput,
  NonNegativeDecimalInput,
  PositiveIntegerInput,
  Provenance,
} from '../../../contracts/analysis/conditional-economics-input.generated.js';
import type {
  CalculationOutput,
  ConditionalEconomicsOutput,
  DisplayValue,
  Rational as OutputRational,
} from '../../../contracts/analysis/conditional-economics-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
const validateInput = ajv.getSchema<ConditionalEconomicsInput>(inputSchema.$id)!;
const validateOutput = ajv.compile<ConditionalEconomicsOutput>(outputSchema);

type ExactRational = { numerator: bigint; denominator: bigint };
type InputEnvelope = DecimalInput | NonNegativeDecimalInput | PositiveIntegerInput;
type Output = ConditionalEconomicsOutput['outputs']['contributionPerUnit'];
type Warning = CalculationOutput['warnings'][number];

const ZERO: ExactRational = { numerator: 0n, denominator: 1n };
const ONE: ExactRational = { numerator: 1n, denominator: 1n };
const ROOT_LIMITATIONS = [
  'CONDITIONAL_SCENARIO_ONLY',
  'FIXED_SAME_FEE_BASE_N_TIMES_PRICE_PER_ORDER',
  'DECLARED_PROVENANCE_NOT_AUTHENTICATED',
  'EXCLUDED_TERMS_EXPLICITLY_NOT_MODELED',
  'NOT_REALIZED_PROFIT_FORECAST_OR_RECOMMENDATION',
] as const;
const COMMON_OUTPUT_LIMITATIONS = [
  'CONDITIONAL_SCENARIO_ONLY',
  'CATEGORY_AND_RATE_BINDINGS_DECLARED_NOT_VERIFIED',
  'EXCLUDED_TERMS_NOT_MODELED_OR_APPLIED',
] as const;

export class ConditionalEconomicsValidationError extends TypeError {}

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
  if (denominator === 0n) throw new ConditionalEconomicsValidationError('ZERO_RATIONAL_DENOMINATOR');
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = gcd(numerator, denominator);
  return { numerator: (numerator * sign) / divisor, denominator: (denominator * sign) / divisor };
}

function add(a: ExactRational, b: ExactRational): ExactRational {
  return rational(a.numerator * b.denominator + b.numerator * a.denominator, a.denominator * b.denominator);
}

function subtract(a: ExactRational, b: ExactRational): ExactRational {
  return rational(a.numerator * b.denominator - b.numerator * a.denominator, a.denominator * b.denominator);
}

function multiply(a: ExactRational, b: ExactRational): ExactRational {
  return rational(a.numerator * b.numerator, a.denominator * b.denominator);
}

function divide(a: ExactRational, b: ExactRational): ExactRational {
  return rational(a.numerator * b.denominator, a.denominator * b.numerator);
}

function compare(a: ExactRational, b: ExactRational): number {
  const left = a.numerator * b.denominator;
  const right = b.numerator * a.denominator;
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseDecimal(value: string): ExactRational {
  const match = /^(-?)([0-9]+)(?:\.([0-9]+))?$/.exec(value);
  if (!match) throw new ConditionalEconomicsValidationError(`INVALID_DECIMAL:${value}`);
  const fraction = match[3] ?? '';
  const scale = 10n ** BigInt(fraction.length);
  const whole = BigInt(match[2]!); // Mandatory integer capture in the matched decimal grammar.
  const fractional = fraction ? BigInt(fraction) : 0n;
  const magnitude = whole * scale + fractional;
  return rational(match[1] === '-' ? -magnitude : magnitude, scale);
}

function exactValue(value: ExactRational): OutputRational {
  return { numerator: value.numerator.toString(), denominator: value.denominator.toString(), reduced: true };
}

function ceilInteger(value: ExactRational): string {
  let quotient = value.numerator / value.denominator;
  if (value.numerator > 0n && value.numerator % value.denominator !== 0n) quotient += 1n;
  return quotient.toString();
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

function inputAt(input: ConditionalEconomicsInput, path: string): InputEnvelope | null {
  const [section, key] = path.split('.');
  if (section === 'inputs') return input.inputs[key as keyof ConditionalEconomicsInput['inputs']] as InputEnvelope | null;
  if (section === 'fees') return input.fees[key as keyof ConditionalEconomicsInput['fees']] as InputEnvelope | null;
  throw new ConditionalEconomicsValidationError(`UNKNOWN_INPUT_PATH:${path}`);
}

function inputProvenance(input: ConditionalEconomicsInput): ConditionalEconomicsOutput['inputProvenance'] {
  const from = (value: InputEnvelope | null): Provenance | null => value?.provenance ?? null;
  return {
    pricePerUnit: from(input.inputs.pricePerUnit),
    cogsPerUnit: from(input.inputs.cogsPerUnit),
    otherVariableCostPerUnit: from(input.inputs.otherVariableCostPerUnit),
    sharedMarketingPerUnit: from(input.inputs.sharedMarketingPerUnit),
    targetContributionPerUnit: from(input.inputs.targetContributionPerUnit),
    unitsPerOrder: from(input.inputs.unitsPerOrder),
    commissionRate: from(input.fees.commissionRate),
    transactionRate: from(input.fees.transactionRate),
    processingFeePerOrder: from(input.fees.processingFeePerOrder),
  };
}

function validateDomain(input: ConditionalEconomicsInput): void {
  const nonNegativePaths = [
    'inputs.pricePerUnit',
    'inputs.cogsPerUnit',
    'inputs.otherVariableCostPerUnit',
    'inputs.sharedMarketingPerUnit',
    'fees.commissionRate',
    'fees.transactionRate',
    'fees.processingFeePerOrder',
  ];
  for (const path of nonNegativePaths) {
    const value = inputAt(input, path);
    if (value !== null && compare(parseDecimal(value.value), ZERO) < 0) {
      throw new ConditionalEconomicsValidationError(`NEGATIVE_INPUT:${path}`);
    }
  }
  const units = input.inputs.unitsPerOrder;
  if (units !== null && compare(parseDecimal(units.value), ZERO) <= 0) {
    throw new ConditionalEconomicsValidationError('UNITS_PER_ORDER_NOT_POSITIVE');
  }
  for (const path of ['fees.commissionRate', 'fees.transactionRate']) {
    const value = inputAt(input, path);
    if (value !== null && (compare(parseDecimal(value.value), ZERO) < 0 || compare(parseDecimal(value.value), ONE) > 0)) {
      throw new ConditionalEconomicsValidationError(`FEE_RATE_OUT_OF_RANGE:${path}`);
    }
  }
  for (const [key, term] of Object.entries(input.excludedTerms)) {
    if (term.status === 'NOT_MODELED' && term.value !== null) throw new ConditionalEconomicsValidationError(`NOT_MODELED_TERM_HAS_VALUE:${key}`);
    if (term.status === 'SCENARIO_ASSUMED_ZERO' && term.value?.value !== '0') throw new ConditionalEconomicsValidationError(`SCENARIO_ZERO_TERM_NOT_ZERO:${key}`);
  }
  for (const [key, binding] of Object.entries(input.feeBindings)) {
    if (binding.bindingState === 'UNCONFIRMED') throw new ConditionalEconomicsValidationError(`FEE_CATEGORY_UNCONFIRMED:${key}`);
  }
  const commission = input.fees.commissionRate;
  const transaction = input.fees.transactionRate;
  if (commission !== null && transaction !== null &&
      compare(subtract(ONE, add(parseDecimal(commission.value), parseDecimal(transaction.value))), ZERO) <= 0) {
    throw new ConditionalEconomicsValidationError('FEE_DENOMINATOR_NON_POSITIVE');
  }
}

function validatedInput(untrusted: unknown): ConditionalEconomicsInput {
  if (!validateInput(untrusted)) {
    throw new ConditionalEconomicsValidationError(`Invalid conditional economics input: ${ajv.errorsText(validateInput.errors)}`);
  }
  const input = JSON.parse(canonicalJson(untrusted)) as ConditionalEconomicsInput;
  validateDomain(input);
  return input;
}

function unavailable(name: string, keys: readonly string[], input: ConditionalEconomicsInput): Output {
  const missingInputs = keys.filter(key => inputAt(input, key) === null);
  return {
    state: 'UNAVAILABLE',
    exactValue: null,
    displayValue: null,
    missingInputs,
    heldFixed: keys.filter(key => !missingInputs.includes(key)),
    warnings: [],
    limitations: [...COMMON_OUTPUT_LIMITATIONS, `MISSING_REQUIRED_INPUTS_FOR_${name.toUpperCase()}`],
  };
}

function available(
  name: string,
  keys: readonly string[],
  value: ExactRational,
  roundingVersion: DisplayValue['roundingVersion'],
): Output {
  const warnings: Warning[] = [];
  if (name === 'contributionPerUnit' && compare(value, ZERO) < 0) warnings.push('NEGATIVE_CONTRIBUTION');
  if ((name === 'cmax' || name === 'mmax') && compare(value, ZERO) < 0) warnings.push('INFEASIBLE_THRESHOLD');
  if (name === 'pmin' && compare(value, ZERO) <= 0) warnings.push('NON_POSITIVE_PRICE_THRESHOLD');
  const displayValue: DisplayValue = roundingVersion === 'CEIL_INTEGER_VND_V1'
    ? { value: ceilInteger(value), roundingVersion }
    : { value: halfEvenDecimal2(value), roundingVersion };
  return {
    state: 'AVAILABLE',
    exactValue: exactValue(value),
    displayValue,
    missingInputs: [],
    heldFixed: [...keys],
    warnings,
    limitations: [...COMMON_OUTPUT_LIMITATIONS, ...(name === 'contributionPerUnit' ? ['TARGET_COMPARISON_ONLY_WHEN_TARGET_IS_DECLARED'] : ['NOT_A_RECOMMENDATION_OR_OPTIMAL_PRICE'])],
  };
}

function calculateOutput(
  name: string,
  keys: readonly string[],
  input: ConditionalEconomicsInput,
  roundingVersion: DisplayValue['roundingVersion'],
  formula: (values: Map<string, ExactRational>) => ExactRational,
): Output {
  const values = new Map<string, ExactRational>();
  for (const key of keys) {
    const value = inputAt(input, key);
    if (value !== null) values.set(key, parseDecimal(value.value));
  }
  if (keys.some(key => !values.has(key))) return unavailable(name, keys, input);
  return available(name, keys, formula(values), roundingVersion);
}

function value(values: Map<string, ExactRational>, key: string): ExactRational {
  const result = values.get(key);
  if (!result) throw new ConditionalEconomicsValidationError(`MISSING_INTERNAL_INPUT:${key}`);
  return result;
}

const contributionKeys = [
  'inputs.pricePerUnit',
  'inputs.cogsPerUnit',
  'inputs.otherVariableCostPerUnit',
  'inputs.sharedMarketingPerUnit',
  'inputs.unitsPerOrder',
  'fees.commissionRate',
  'fees.transactionRate',
  'fees.processingFeePerOrder',
] as const;
const pminKeys = [
  'inputs.cogsPerUnit',
  'inputs.otherVariableCostPerUnit',
  'inputs.sharedMarketingPerUnit',
  'inputs.targetContributionPerUnit',
  'inputs.unitsPerOrder',
  'fees.commissionRate',
  'fees.transactionRate',
  'fees.processingFeePerOrder',
] as const;
const cmaxKeys = [
  'inputs.pricePerUnit',
  'inputs.otherVariableCostPerUnit',
  'inputs.sharedMarketingPerUnit',
  'inputs.targetContributionPerUnit',
  'inputs.unitsPerOrder',
  'fees.commissionRate',
  'fees.transactionRate',
  'fees.processingFeePerOrder',
] as const;
const mmaxKeys = [
  'inputs.pricePerUnit',
  'inputs.cogsPerUnit',
  'inputs.otherVariableCostPerUnit',
  'inputs.targetContributionPerUnit',
  'inputs.unitsPerOrder',
  'fees.commissionRate',
  'fees.transactionRate',
  'fees.processingFeePerOrder',
] as const;

function feeFactor(values: Map<string, ExactRational>): ExactRational {
  return subtract(ONE, add(value(values, 'fees.commissionRate'), value(values, 'fees.transactionRate')));
}

function perOrderFee(values: Map<string, ExactRational>): ExactRational {
  return divide(value(values, 'fees.processingFeePerOrder'), value(values, 'inputs.unitsPerOrder'));
}

function buildOutput(input: ConditionalEconomicsInput): ConditionalEconomicsOutput {
  const computed = {
    contributionPerUnit: calculateOutput('contributionPerUnit', contributionKeys, input, 'HALF_EVEN_DECIMAL_2_VND_V1', values => {
      const gross = multiply(value(values, 'inputs.pricePerUnit'), feeFactor(values));
      return subtract(subtract(subtract(gross, value(values, 'inputs.cogsPerUnit')), value(values, 'inputs.otherVariableCostPerUnit')), add(value(values, 'inputs.sharedMarketingPerUnit'), perOrderFee(values)));
    }),
    pmin: calculateOutput('pmin', pminKeys, input, 'CEIL_INTEGER_VND_V1', values => {
      const numerator = add(add(add(add(value(values, 'inputs.cogsPerUnit'), value(values, 'inputs.otherVariableCostPerUnit')), value(values, 'inputs.sharedMarketingPerUnit')), value(values, 'inputs.targetContributionPerUnit')), perOrderFee(values));
      return divide(numerator, feeFactor(values));
    }),
    cmax: calculateOutput('cmax', cmaxKeys, input, 'HALF_EVEN_DECIMAL_2_VND_V1', values => {
      const gross = multiply(value(values, 'inputs.pricePerUnit'), feeFactor(values));
      return subtract(subtract(subtract(gross, value(values, 'inputs.otherVariableCostPerUnit')), value(values, 'inputs.sharedMarketingPerUnit')), add(value(values, 'inputs.targetContributionPerUnit'), perOrderFee(values)));
    }),
    mmax: calculateOutput('mmax', mmaxKeys, input, 'HALF_EVEN_DECIMAL_2_VND_V1', values => {
      const gross = multiply(value(values, 'inputs.pricePerUnit'), feeFactor(values));
      return subtract(subtract(subtract(gross, value(values, 'inputs.cogsPerUnit')), value(values, 'inputs.otherVariableCostPerUnit')), add(value(values, 'inputs.targetContributionPerUnit'), perOrderFee(values)));
    }),
  };
  const outputs = Object.fromEntries(input.requestedOutputs.map(key => [key, computed[key]])) as ConditionalEconomicsOutput['outputs'];
  const output: ConditionalEconomicsOutput = {
    contractVersion: '1.0.0',
    methodVersion: 'conditional-economics-v1',
    scenarioId: input.scenarioId,
    currency: 'VND',
    unitBasis: 'VND_PER_UNIT',
    requestedOutputs: input.requestedOutputs,
    status: 'SCENARIO',
    approvalState: 'UNREVIEWED',
    evidenceState: 'DECLARED_UNVERIFIED',
    sourceAuthenticity: 'NOT_AUTHENTICATED',
    inputSha256: createHash('sha256').update(canonicalJson(input)).digest('hex'),
    feeBasePolicy: input.feeBasePolicy,
    feeBindings: input.feeBindings,
    inputProvenance: inputProvenance(input),
    modeledTerms: [
      'pricePerUnit',
      'cogsPerUnit',
      'otherVariableCostPerUnit',
      'sharedMarketingPerUnit',
      'targetContributionPerUnit',
      'unitsPerOrder',
      'commissionRate',
      'transactionRate',
      'processingFeePerOrder',
    ],
    excludedTerms: input.excludedTerms,
    outputs,
    limitations: [...ROOT_LIMITATIONS],
  };
  if (!validateOutput(output)) {
    throw new ConditionalEconomicsValidationError(`Invalid conditional economics output: ${ajv.errorsText(validateOutput.errors)}`);
  }
  return JSON.parse(canonicalJson(output)) as ConditionalEconomicsOutput;
}

/** Pure, deterministic P3 calculator. All arithmetic remains exact until declared display rounding. */
export function calculateConditionalEconomics(untrusted: unknown): ConditionalEconomicsOutput {
  return buildOutput(validatedInput(untrusted));
}

/** Replays a previously emitted result and rejects changed inputs or edited calculation payloads. */
export function replayConditionalEconomics(input: unknown, output: unknown): ConditionalEconomicsOutput {
  const expected = calculateConditionalEconomics(input);
  if (!validateOutput(output)) throw new ConditionalEconomicsValidationError(`Invalid conditional economics output: ${ajv.errorsText(validateOutput.errors)}`);
  if (canonicalJson(expected) !== canonicalJson(output)) throw new ConditionalEconomicsValidationError('CONDITIONAL_ECONOMICS_REPLAY_MISMATCH');
  return JSON.parse(canonicalJson(output)) as ConditionalEconomicsOutput;
}

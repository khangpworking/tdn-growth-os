import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/m08-tablet-quote-method.schema.json' with { type: 'json' };
import quoteInputSchema from '../../../contracts/analysis/tablet-quote-input.schema.json' with { type: 'json' };
import quoteOutputSchema from '../../../contracts/analysis/tablet-quote-output.schema.json' with { type: 'json' };
import type { M08TabletQuoteMethod } from '../../../contracts/analysis/m08-tablet-quote-method.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { normalizeTabletQuote } from './tablet-quote-normalizer.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(quoteInputSchema);
ajv.addSchema(quoteOutputSchema);
const validate = ajv.compile<M08TabletQuoteMethod>(schema);

const DIGEST = /^[0-9a-f]{64}$/;
const MAX_BYTES = 32 * 1024 * 1024;

export interface M08TabletQuoteSource {
  readonly role: 'tabletQuoteSource' | 'tabletQuoteInput';
  readonly logicalPath: string;
  readonly exportPath: 'raw-tablet-quote-source.json' | 'raw-tablet-quote-input.json';
  readonly sha256: string;
  readonly byteSize: number;
  readonly mediaType: 'application/json';
  readonly evidenceFamily: string;
  readonly representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
  readonly independence: 'independent' | 'non_independent';
  readonly providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
  readonly provenanceBasis: string;
  readonly period: { readonly start: string; readonly end: string } | null;
  readonly bytes: Buffer;
}

export interface M08TabletQuotePackage {
  readonly packageId: string;
  readonly packageKey: string;
  readonly version: number;
  readonly manifestArtifactSha256: string;
  readonly packageContentSha256: string;
  readonly sourceAcquiredAt: string | null;
  readonly finalizedAt: string;
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function verifiedSource(source: M08TabletQuoteSource, role: M08TabletQuoteSource['role']): Omit<M08TabletQuoteSource, 'bytes'> {
  if (source.role !== role || source.mediaType !== 'application/json' ||
      source.byteSize < 0 || source.byteSize !== source.bytes.byteLength || source.byteSize > MAX_BYTES ||
      !DIGEST.test(source.sha256) || sha256(source.bytes) !== source.sha256) {
    throw new TypeError(`M08 ${role}: SOURCE_BYTES_OR_METADATA_MISMATCH`);
  }
  const { bytes: _bytes, ...metadata } = source;
  return metadata;
}

function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new TypeError('M08 tablet quote input: INVALID_JSON_UTF8'); }
}

/**
 * Materializes one quote-scoped packaging calculation. It performs no
 * cross-quote comparison, market inference, identity upgrade or recommendation.
 */
export function buildM08TabletQuoteMethod(
  sourcePackage: M08TabletQuotePackage,
  rawSource: M08TabletQuoteSource,
  quoteInput: M08TabletQuoteSource,
): { readonly output: M08TabletQuoteMethod; readonly bytes: Buffer } {
  if (!DIGEST.test(sourcePackage.manifestArtifactSha256) || !DIGEST.test(sourcePackage.packageContentSha256)) {
    throw new TypeError('M08 source package: INVALID_DIGEST');
  }
  const rawSourceMetadata = verifiedSource(rawSource, 'tabletQuoteSource');
  const quoteInputMetadata = verifiedSource(quoteInput, 'tabletQuoteInput');
  if (rawSource.logicalPath === quoteInput.logicalPath) throw new TypeError('M08 sources: PATHS_NOT_DISTINCT');
  const quote = normalizeTabletQuote(parseJson(quoteInput.bytes));
  if (quote.sourceRef.artifactSha256 !== rawSource.sha256) {
    throw new TypeError('M08 quote: SOURCE_REF_DIGEST_MISMATCH');
  }
  const normalizedQuoteBytes = artifactBytes(quote);
  const content: Omit<M08TabletQuoteMethod, 'methodOutputId'> = {
    contractVersion: '1.0.0',
    sectionId: 'M08',
    sectionSliceId: 'M08/P4',
    sectionSliceTitle: 'Chuẩn hóa giá quote viên đơn lẻ',
    methodId: 'tablet-quote-normalization',
    methodVersion: '2.0.0',
    normalizerVersion: 'tablet-quote-normalization-v1',
    sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED',
    deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
    approvalState: 'UNREVIEWED',
    evidenceState: 'DECLARED_UNVERIFIED',
    sourceAuthenticity: 'NOT_AUTHENTICATED',
    sourcePackage,
    sources: [rawSourceMetadata, quoteInputMetadata],
    lineage: {
      rawSourceSha256: rawSource.sha256,
      quoteInputRawSha256: quoteInput.sha256,
      canonicalQuoteInputSha256: quote.inputSha256,
      normalizedQuoteOutputSha256: sha256(normalizedQuoteBytes),
    },
    quote,
    limitations: [
      'SINGLE_QUOTE_ONLY_NO_COMPARISON_OR_RANKING',
      'PACKAGING_DENOMINATOR_ONLY_NO_DOSE_OR_EFFICACY_EQUIVALENCE',
      'OPERATOR_DECLARED_TABLET_COUNT_NOT_PARSED_OR_INDEPENDENTLY_VERIFIED',
      'LISTED_AND_CHECKOUT_PRICES_NOT_INTERCHANGEABLE',
      'OBSERVATION_TIME_DECLARED_NOT_PROVIDER_VERIFIED',
      'IDENTITY_FLAGS_DECLARED_NOT_UPGRADED',
      'NO_COST_MARGIN_WTP_FORECAST_RECOMMENDATION_OR_PROVIDER_AUTHENTICITY',
      'NON_TABLET_UNITS_OUTSIDE_METHOD',
    ],
  };
  const output: M08TabletQuoteMethod = { ...content, methodOutputId: sha256(canonicalJson(content)) };
  if (!validate(output)) throw new TypeError(`M08 tablet quote method: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  return { output, bytes: artifactBytes(output) };
}

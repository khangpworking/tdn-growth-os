import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildM08TabletQuoteMethod, type M08TabletQuoteSource } from '../../src/modules/analysis/m08-tablet-quote-method.js';
import { tabletQuoteFixture } from '../helpers/tablet-quote-fixture.js';

const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const jsonBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture() {
  const rawSourceBytes = jsonBytes({ quote: { displayedPrice: '240000', packText: '30 tablets' } });
  const rawSourceSha256 = sha256(rawSourceBytes);
  const input = tabletQuoteFixture();
  input.sourceRef.artifactSha256 = rawSourceSha256;
  input.sourceRef.locator = 'json://quote-source#/quote';
  input.priceVnd!.provenance.sourceRef = { ...input.sourceRef };
  const inputBytes = jsonBytes(input);
  const source = (
    role: M08TabletQuoteSource['role'],
    logicalPath: string,
    exportPath: M08TabletQuoteSource['exportPath'],
    bytes: Buffer,
  ): M08TabletQuoteSource => ({
    role,
    logicalPath,
    exportPath,
    sha256: sha256(bytes),
    byteSize: bytes.byteLength,
    mediaType: 'application/json',
    evidenceFamily: 'synthetic-tablet-quote',
    representationRole: role === 'tabletQuoteSource' ? 'primary' : 'structured',
    independence: role === 'tabletQuoteSource' ? 'independent' : 'non_independent',
    providerProvenance: 'synthetic',
    provenanceBasis: 'Synthetic method-contract fixture',
    period: { start: '2026-09-21T00:00:00.000Z', end: '2026-09-21T23:59:59.999Z' },
    bytes,
  });
  return {
    rawSource: source('tabletQuoteSource', 'quote/source.json', 'raw-tablet-quote-source.json', rawSourceBytes),
    quoteInput: source('tabletQuoteInput', 'quote/input.json', 'raw-tablet-quote-input.json', inputBytes),
  };
}

const sourcePackage = {
  packageId: '11111111-1111-4111-8111-111111111111',
  packageKey: 'synthetic:m08-tablet-quote',
  version: 1,
  manifestArtifactSha256: 'a'.repeat(64),
  packageContentSha256: 'b'.repeat(64),
  sourceAcquiredAt: '2026-09-21T10:00:00.000Z',
  finalizedAt: '2026-09-21T11:00:00.000Z',
} as const;

// This owns the M08 method-artifact contract. Arithmetic edge cases remain
// owned by tablet-quote-normalizer.test.ts and are not duplicated here.
test('binds one replayable tablet quote to exact package bytes without upgrading its trust state', () => {
  const { rawSource, quoteInput } = fixture();
  const first = buildM08TabletQuoteMethod(sourcePackage, rawSource, quoteInput);
  const second = buildM08TabletQuoteMethod(sourcePackage, rawSource, quoteInput);

  assert.deepEqual(second, first);
  assert.equal(first.output.sectionSliceId, 'M08/P4');
  assert.equal(first.output.deliveryState, 'PARTIAL_DETERMINISTIC_DRAFT');
  assert.equal(first.output.approvalState, 'UNREVIEWED');
  assert.equal(first.output.evidenceState, 'DECLARED_UNVERIFIED');
  assert.equal(first.output.sourceAuthenticity, 'NOT_AUTHENTICATED');
  assert.equal(first.output.lineage.rawSourceSha256, rawSource.sha256);
  assert.equal(first.output.lineage.quoteInputRawSha256, quoteInput.sha256);
  assert.equal(first.output.quote.sourceRef.artifactSha256, rawSource.sha256);
  assert.equal(first.output.quote.pricePerTabletArithmetic.displayValue?.value, '8000.00');
  assert.ok(first.output.limitations.includes('SINGLE_QUOTE_ONLY_NO_COMPARISON_OR_RANKING'));
  assert.deepEqual(JSON.parse(first.bytes.toString('utf8')), first.output);
});

test('rejects changed bytes and a quote input that points at a different source artifact', () => {
  const { rawSource, quoteInput } = fixture();
  assert.throws(
    () => buildM08TabletQuoteMethod(sourcePackage, { ...rawSource, bytes: Buffer.from('{}\n') }, quoteInput),
    /SOURCE_BYTES_OR_METADATA_MISMATCH/,
  );

  const changedInput = JSON.parse(quoteInput.bytes.toString('utf8')) as ReturnType<typeof tabletQuoteFixture>;
  changedInput.sourceRef.artifactSha256 = 'c'.repeat(64);
  const changedBytes = jsonBytes(changedInput);
  assert.throws(
    () => buildM08TabletQuoteMethod(sourcePackage, rawSource, {
      ...quoteInput,
      sha256: sha256(changedBytes),
      byteSize: changedBytes.byteLength,
      bytes: changedBytes,
    }),
    /SOURCE_REF_DIGEST_MISMATCH/,
  );
});

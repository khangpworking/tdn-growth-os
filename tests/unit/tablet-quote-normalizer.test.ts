import assert from 'node:assert/strict';
import test from 'node:test';
import { tabletQuoteFixture } from '../helpers/tablet-quote-fixture.js';
import { normalizeTabletQuote, replayTabletQuoteNormalization } from '../../src/modules/analysis/tablet-quote-normalizer.js';

// Owner-boundary tests use hand-calculated synthetic quotes. They call the
// public production entry point and do not create a test-only production seam.

test('explicit 30-tablet quote preserves source identity and computes packaging arithmetic only', () => {
  const result = normalizeTabletQuote(tabletQuoteFixture());
  assert.equal(result.status, 'SCENARIO');
  assert.equal(result.approvalState, 'UNREVIEWED');
  assert.equal(result.evidenceState, 'DECLARED_UNVERIFIED');
  assert.equal(result.sourceAuthenticity, 'NOT_AUTHENTICATED');
  assert.equal(result.priceState, 'DISPLAYED_LISTED');
  assert.equal(result.packText, '30 tablets');
  assert.equal(result.packCount?.declaration, 'OPERATOR_DECLARED');
  assert.equal(result.packCount?.provenance.kind, 'OWNER_DECLARED');
  assert.equal(result.identityTier, 'TITLE_PACK_MATCH_ONLY');
  assert.equal(result.gtinStatus, 'UNKNOWN');
  assert.equal(result.versionStatus, 'UNKNOWN');
  assert.ok(result.limitations.includes('OBSERVATION_PERIOD_DECLARED_NOT_VERIFIED_OR_COMPARED'));
  assert.deepEqual(result.pricePerPack.exactValue, { numerator: '240000', denominator: '1', reduced: true });
  assert.equal(result.pricePerPack.displayValue?.value, '240000.00');
  assert.deepEqual(result.pricePerTabletArithmetic.exactValue, { numerator: '8000', denominator: '1', reduced: true });
  assert.equal(result.pricePerTabletArithmetic.displayValue?.value, '8000.00');
  assert.ok(result.limitations.includes('PACK_COUNT_OPERATOR_DECLARED_NOT_PARSED_OR_VERIFIED'));
  assert.ok(result.limitations.includes('NO_EQUAL_DOSE_OR_EFFICACY_CLAIM'));
});

test('exact rational per-tablet value and half-even display are separate', () => {
  const input = tabletQuoteFixture();
  input.priceVnd!.value = '100005';
  input.packCount!.value = '40';
  const result = normalizeTabletQuote(input);
  assert.deepEqual(result.pricePerPack.exactValue, { numerator: '100005', denominator: '1', reduced: true });
  assert.deepEqual(result.pricePerTabletArithmetic.exactValue, { numerator: '20001', denominator: '8', reduced: true });
  assert.equal(result.pricePerTabletArithmetic.displayValue?.value, '2500.12');
  assert.equal(result.pricePerTabletArithmetic.displayValue?.roundingVersion, 'HALF_EVEN_DECIMAL_2_VND_V1');
});

test('missing operator count leaves per-pack price available but never infers a count from title or pack text', () => {
  const input = tabletQuoteFixture();
  input.entityTitle = 'Synthetic calcium 30 tablets';
  input.packText = '30 tablets';
  input.packCount = null;
  const result = normalizeTabletQuote(input);
  assert.equal(result.pricePerPack.state, 'AVAILABLE');
  assert.equal(result.pricePerTabletArithmetic.state, 'UNAVAILABLE');
  assert.equal(result.pricePerTabletArithmetic.exactValue, null);
  assert.equal(result.pricePerTabletArithmetic.displayValue, null);
  assert.deepEqual(result.pricePerTabletArithmetic.missingInputs, ['packCount']);
  assert.ok(result.pricePerTabletArithmetic.limitations.includes('REQUIRED_QUOTE_INPUT_UNAVAILABLE'));
});

test('missing price makes both arithmetic outputs unavailable rather than zero', () => {
  const input = tabletQuoteFixture();
  input.priceVnd = null;
  const result = normalizeTabletQuote(input);
  assert.equal(result.pricePerPack.state, 'UNAVAILABLE');
  assert.equal(result.pricePerPack.exactValue, null);
  assert.deepEqual(result.pricePerPack.missingInputs, ['priceVnd']);
  assert.equal(result.pricePerTabletArithmetic.state, 'UNAVAILABLE');
  assert.deepEqual(result.pricePerTabletArithmetic.missingInputs, ['priceVnd']);
});

test('known and unknown observation times remain explicit and cannot be silently fabricated', () => {
  const unknown = tabletQuoteFixture();
  unknown.observedAt = null;
  unknown.observationPeriod = null;
  unknown.observationTimeState = 'UNKNOWN';
  const result = normalizeTabletQuote(unknown);
  assert.equal(result.observationTimeState, 'UNKNOWN');
  assert.equal(result.observedAt, null);
  assert.equal(result.observationPeriod, null);

  const knownWithoutTime = tabletQuoteFixture();
  knownWithoutTime.observedAt = null;
  knownWithoutTime.observationPeriod = null;
  assert.throws(() => normalizeTabletQuote(knownWithoutTime), /KNOWN_OBSERVATION_TIME_MISSING/);

  const unknownWithTime = tabletQuoteFixture();
  unknownWithTime.observationTimeState = 'UNKNOWN';
  assert.throws(() => normalizeTabletQuote(unknownWithTime), /UNKNOWN_OBSERVATION_TIME_HAS_VALUE/);
});

test('listed and checkout price states and identity flags are retained without comparison semantics', () => {
  const input = tabletQuoteFixture();
  input.priceState = 'CHECKOUT_FINAL';
  input.identityTier = 'EXACT_IDENTITY_DECLARED';
  input.variantStatus = 'DECLARED_MATCH';
  input.gtinStatus = 'DECLARED_MATCH';
  input.versionStatus = 'CONFLICT';
  const result = normalizeTabletQuote(input);
  assert.equal(result.priceState, 'CHECKOUT_FINAL');
  assert.equal(result.identityTier, 'EXACT_IDENTITY_DECLARED');
  assert.equal(result.variantStatus, 'DECLARED_MATCH');
  assert.equal(result.gtinStatus, 'DECLARED_MATCH');
  assert.equal(result.versionStatus, 'CONFLICT');
  assert.ok(result.limitations.includes('NO_COMPARISON_RANKING_WTP_OR_RECOMMENDATION'));
});

test('negative prices, zero counts, and non-operator count declarations are rejected', () => {
  const negativePrice = tabletQuoteFixture();
  negativePrice.priceVnd!.value = '-1';
  assert.throws(() => normalizeTabletQuote(negativePrice), /Invalid tablet quote input/);

  const zeroCount = tabletQuoteFixture();
  zeroCount.packCount!.value = '0';
  assert.throws(() => normalizeTabletQuote(zeroCount), /Invalid tablet quote input/);

  const otherUnit = tabletQuoteFixture();
  assert.throws(() => normalizeTabletQuote({ ...otherUnit, packCount: { ...otherUnit.packCount, unit: 'CAPSULE' } }), /Invalid tablet quote input/);

  const sourceDeclaredCount = tabletQuoteFixture();
  sourceDeclaredCount.packCount!.provenance = {
    kind: 'SOURCE_DECLARED',
    label: 'parsed count',
    note: 'not operator declared',
    sourceRef: sourceDeclaredCount.sourceRef,
  };
  assert.throws(() => normalizeTabletQuote(sourceDeclaredCount), /Invalid tablet quote input/);
});

test('canonical input identity supports replay and changes when quote data changes', () => {
  const input = tabletQuoteFixture();
  const first = normalizeTabletQuote(input);
  assert.deepEqual(replayTabletQuoteNormalization(structuredClone(input), structuredClone(first)), first);

  const changed = tabletQuoteFixture();
  changed.priceVnd!.value = '240001';
  const second = normalizeTabletQuote(changed);
  assert.notEqual(first.inputSha256, second.inputSha256);
  assert.throws(() => replayTabletQuoteNormalization(changed, first), /TABLET_QUOTE_REPLAY_MISMATCH/);
});

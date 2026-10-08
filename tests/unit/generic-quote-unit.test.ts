import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { GenericQuoteUnit } from '../../contracts/analysis/generic-quote-unit.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildGenericQuoteUnit, verifyGenericQuoteUnit } from '../../src/modules/analysis/generic-quote-unit.js';
import type { AutomationQuoteMethodSnapshot } from '../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import { quoteMethodSection } from '../../src/modules/analysis/research-automation/quote-method-report.js';
import { JSDOM } from 'jsdom';

type Input = GenericQuoteUnit['input'];
type Quote = Input['quotes'][number];
const sourceSha256 = '1'.repeat(64);
const declarationSha256 = '2'.repeat(64);
const ref = (fieldPointer: string, sha256 = sourceSha256) => ({ sourceSha256: sha256, locator: 'synthetic quote record 1', fieldPointer });
function fixture(): Input {
  const quantity = (value: string, unit: string): Quote['pack']['count'] => ({
    state: 'EXACT', value, unit, dimension: unit === 'g' ? 'MASS' : 'PHYSICAL_COUNT', origin: 'SOURCE_STATED', binding: ref(`/offer/${unit}`), literal: `${value} ${unit}`,
  });
  return {
    contractVersion: '1.0.0',
    sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: '3'.repeat(64), packageContentSha256: '4'.repeat(64) },
    sources: [{ logicalPath: 'quote.json', sha256: sourceSha256, role: 'SOURCE' }, { logicalPath: 'declaration.json', sha256: declarationSha256, role: 'OWNER_DECLARATION' }, { logicalPath: 'parser-profile.json', sha256: '5'.repeat(64), role: 'OWNER_DECLARATION' }],
    configuration: { parserProfileId: 'synthetic-literal-quote', parserRevision: '1.0.0', parserProfileSha256: '5'.repeat(64), parserProfileRef: ref('/profile', '5'.repeat(64)), mappingRevision: '1.0.0', configurationRef: ref('/configuration', declarationSha256) },
    quotes: [{
      quoteId: 'jelly-offer-1', source: ref('/offer'), acquiredAt: '2026-10-02T00:00:00Z', observedAt: null,
      authenticationState: 'UNKNOWN', reviewState: 'UNREVIEWED',
      identity: { state: 'EXACT', platform: 'synthetic', shopId: 'shop-1', listingId: 'listing-1', variantState: 'EXACT', variantId: 'variant-1', variantAttributes: [], binding: ref('/offer/identity'), linkage: 'MATCHED' },
      offerText: 'Synthetic jelly offer', packText: '2 jars, net 500g and drained 300g each',
      price: { state: 'EXACT', value: '60000', range: null, currency: 'VND', priceState: 'LISTED', binding: ref('/offer/price'), checkoutBinding: null, conditions: [], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
      pack: { count: quantity('2', 'jar'), compositionState: 'HOMOGENEOUS', linkage: 'MATCHED', binding: ref('/offer/pack'), components: ['two jars of same variant'] },
      netMass: { quantity: quantity('500', 'g'), basis: 'PER_ITEM', linkage: 'MATCHED', basisBinding: ref('/offer/netBasis') },
      drainedMass: { quantity: quantity('300', 'g'), basis: 'PER_ITEM', linkage: 'MATCHED', basisBinding: ref('/offer/drainedBasis') },
      selectedMassBases: ['NET', 'DRAINED'], massSelectionBinding: ref('/selection', declarationSha256),
    }],
  };
}

test('accepted quote metadata stays in retained input while unsafe reader literals are withheld', () => {
  for (const literal of ['Metric sample', 'a'.repeat(64), 'SOURCE_STATED_METADATA']) for (const field of ['offerText', 'packText', 'variantId', 'condition']) {
    const input = fixture();
    const quote = input.quotes[0]!;
    if (field === 'variantId') quote.identity.variantId = literal;
    else if (field === 'condition') quote.price.conditions = [{ literal, binding: ref('/offer/condition') }];
    else if (field === 'offerText') quote.offerText = literal;
    else quote.packText = literal;
    quote.source.locator = 'quote.json' + quote.source.fieldPointer;
    const output = buildGenericQuoteUnit(input).output;
    const original = JSON.stringify(output);
    const snapshot: AutomationQuoteMethodSnapshot = {
      contractVersion: 'automation-quote-method-snapshot-v1',
      binding: { workspaceId: '00000000-0000-4000-8000-000000000001', runId: '00000000-0000-4000-8000-000000000002', startSha256: '1'.repeat(64), scopeSha256: '2'.repeat(64), previousPairId: '3'.repeat(64) },
      selection: { decision: 'USE_PACKAGE', packageId: input.sourcePackage.packageId, manifestArtifactSha256: input.sourcePackage.manifestArtifactSha256, packageContentSha256: input.sourcePackage.packageContentSha256, descriptorPath: 'quote-methods/input.json' },
      descriptorSha256: output.inputSha256, output,
      sourceMetadata: [{ path: 'quote.json', sha256: sourceSha256, byteSize: 1, mediaType: 'application/json', evidenceFamily: 'synthetic', representationRole: 'structured', independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic source' }],
    };
    const html = quoteMethodSection(snapshot, { mark: () => 'Source 1' });
    const dom = new JSDOM(html);
    try { assert.ok(!dom.window.document.body.textContent?.includes(literal), field); } finally { dom.window.close(); }
    assert.equal(JSON.stringify(output), original);
    assert.ok(original.includes(literal));
    assert.deepEqual(output.input, input);
  }
});
const first = (input: Input) => buildGenericQuoteUnit(input).output.quotes[0]!;
const quote = (input: Input) => input.quotes[0]!;

test('M08 business fixtures retain separate net/drained pack mass and exact physical-unit calculations', () => {
  const input = fixture();
  const row = first(input);
  assert.deepEqual(row.pricePerPurchasedPack.exact, { numerator: '60000', denominator: '1' });
  assert.equal(row.pricePerPhysicalItem.display, '30000.00');
  assert.deepEqual(row.pricePer100gNet.denominator, { numerator: '1000', denominator: '1' });
  assert.equal(row.pricePer100gNet.display, '6000.00');
  assert.deepEqual(row.pricePer100gDrained.denominator, { numerator: '600', denominator: '1' });
  assert.equal(row.pricePer100gDrained.display, '10000.00');
  assert.equal(row.pricePer100gNet.basis, 'SOURCED');
  // Source already gives total purchased-pack mass: do not multiply count again.
  quote(input).netMass.basis = 'PER_PURCHASED_PACK';
  quote(input).netMass.quantity.value = '0.5'; quote(input).netMass.quantity.unit = 'kg';
  assert.equal(first(input).pricePer100gNet.display, '12000.00');
  const thermos = fixture(); quote(thermos).price.value = '240000'; quote(thermos).pack.count.unit = 'bottle';
  quote(thermos).identity.variantAttributes = [{ name: 'capacity', literal: '500ml', binding: ref('/offer/capacity') }];
  assert.equal(first(thermos).pricePerPhysicalItem.display, '120000.00');
});

test('each denominator is independently gated while missing/range/conflict inventory and conditions survive', async t => {
  const mutations: Array<{ mutate: (q: Quote) => void; operation: 'pricePerPhysicalItem' | 'pricePer100gNet'; reason: GenericQuoteUnit['quotes'][number]['pricePerPurchasedPack']['reasons'][number] }> = [
    { mutate: q => { q.netMass.quantity.unit = 'ml'; }, operation: 'pricePer100gNet', reason: 'UNSUPPORTED_MASS_UNIT' },
    { mutate: q => { q.selectedMassBases = []; q.massSelectionBinding = null; }, operation: 'pricePer100gNet', reason: 'MASS_BASIS_NOT_SELECTED' },
    { mutate: q => { q.pack.count = { state: 'MISSING', value: null, unit: null, dimension: 'UNKNOWN', origin: 'UNKNOWN', binding: null, literal: null }; }, operation: 'pricePerPhysicalItem', reason: 'COUNT_NOT_EXACT' },
    { mutate: q => { q.pack.count.dimension = 'OTHER'; q.pack.count.unit = 'mAh'; }, operation: 'pricePerPhysicalItem', reason: 'COUNT_UNIT_NOT_PHYSICAL' },
    { mutate: q => { q.pack.compositionState = 'WITH_GIFT'; }, operation: 'pricePerPhysicalItem', reason: 'PACK_NOT_HOMOGENEOUS' },
    { mutate: q => { q.netMass.linkage = 'CONFLICTING'; }, operation: 'pricePer100gNet', reason: 'MASS_LINKAGE_UNRESOLVED' },
  ];
  for (const { mutate, operation, reason } of mutations) {
    const input = fixture(); mutate(quote(input));
    const row = first(input);
    assert.equal(row.pricePerPurchasedPack.display, '60000.00');
    assert.equal(row[operation].exact, null);
    assert.ok(row[operation].reasons.includes(reason), reason);
    if (operation === 'pricePer100gNet') assert.equal(row.pricePerPhysicalItem.display, '30000.00');
  }
  const missingCount = fixture(); quote(missingCount).pack.count = { state: 'UNKNOWN', value: null, unit: null, dimension: 'UNKNOWN', origin: 'UNKNOWN', binding: null, literal: null };
  quote(missingCount).netMass.basis = 'PER_PURCHASED_PACK';
  assert.equal(first(missingCount).pricePerPurchasedPack.display, '60000.00');
  assert.equal(first(missingCount).pricePer100gNet.display, '12000.00');
  for (const value of ['0', '1.5']) await t.test(`invalid count ${value} is operation-local`, () => {
    const input = fixture(); quote(input).pack.count.value = value;
    quote(input).pack.count.literal = `${value} jar`;
    const unaffected = structuredClone(quote(fixture())); unaffected.quoteId = 'unaffected-quote'; input.quotes.push(unaffected);
    const { output, bytes } = buildGenericQuoteUnit(input);
    assert.equal(output.input.quotes[0]!.pack.count.value, value);
    assert.equal(output.input.quotes[0]!.pack.count.literal, `${value} jar`);
    const row = output.quotes[0]!;
    assert.equal(row.pricePerPurchasedPack.display, '60000.00');
    for (const result of [row.pricePerPhysicalItem, row.pricePer100gNet, row.pricePer100gDrained]) {
      assert.equal(result.status, 'UNAVAILABLE');
      assert.equal(result.exact, null); assert.equal(result.display, null); assert.equal(result.denominator, null);
      assert.ok(result.reasons.includes('INVALID_COUNT_VALUE'));
    }
    assert.equal(output.quotes[1]!.pricePerPhysicalItem.display, '30000.00');
    assert.equal(output.quotes[1]!.pricePer100gNet.display, '6000.00');
    assert.equal(verifyGenericQuoteUnit(JSON.parse(bytes.toString())).bytes.equals(bytes), true);
    quote(input).netMass.basis = 'PER_PURCHASED_PACK';
    assert.equal(first(input).pricePer100gNet.display, '12000.00');
    quote(input).pack.count.state = 'NON_EXACT';
    assert.ok(first(input).pricePerPhysicalItem.reasons.includes('COUNT_NOT_EXACT'));
  });
  for (const basis of ['NET', 'DRAINED'] as const) await t.test(`zero ${basis} mass is operation-local`, () => {
    const input = fixture();
    const key = basis === 'NET' ? 'netMass' : 'drainedMass';
    const operation = basis === 'NET' ? 'pricePer100gNet' : 'pricePer100gDrained';
    const otherOperation = basis === 'NET' ? 'pricePer100gDrained' : 'pricePer100gNet';
    quote(input)[key].quantity.value = '0'; quote(input)[key].quantity.literal = '0 g';
    const unaffected = structuredClone(quote(fixture())); unaffected.quoteId = 'unaffected-quote'; input.quotes.push(unaffected);
    const { output, bytes } = buildGenericQuoteUnit(input);
    assert.equal(output.input.quotes[0]![key].quantity.value, '0');
    assert.equal(output.input.quotes[0]![key].quantity.literal, '0 g');
    assert.equal(output.quotes[0]!.pricePerPurchasedPack.display, '60000.00');
    assert.equal(output.quotes[0]!.pricePerPhysicalItem.display, '30000.00');
    const result = output.quotes[0]![operation];
    assert.equal(result.status, 'UNAVAILABLE');
    assert.equal(result.exact, null); assert.equal(result.display, null); assert.equal(result.denominator, null);
    assert.ok(result.reasons.includes('INVALID_MASS_VALUE'));
    assert.equal(output.quotes[0]![otherOperation].display, basis === 'NET' ? '10000.00' : '6000.00');
    assert.equal(output.quotes[1]![operation].display, basis === 'NET' ? '6000.00' : '10000.00');
    assert.equal(verifyGenericQuoteUnit(JSON.parse(bytes.toString())).bytes.equals(bytes), true);
    quote(input).selectedMassBases = basis === 'NET' ? ['DRAINED'] : ['NET'];
    assert.ok(first(input)[operation].reasons.includes('MASS_BASIS_NOT_SELECTED'));
    assert.equal(first(input)[otherOperation].display, basis === 'NET' ? '10000.00' : '6000.00');
    quote(input).selectedMassBases = [basis]; quote(input)[key].basis = 'PER_PURCHASED_PACK';
    assert.ok(first(input)[operation].reasons.includes('INVALID_MASS_VALUE'));
    quote(input)[key].quantity.state = 'NON_EXACT';
    assert.ok(first(input)[operation].reasons.includes('MASS_NOT_EXACT'));
  });
  for (const [name, mutate, reason] of [
    ['unknown identity', (q: Quote) => { q.identity.state = 'UNKNOWN'; }, 'IDENTITY_UNRESOLVED'],
    ['conflicting identity', (q: Quote) => { q.identity.state = 'CONFLICTING'; }, 'IDENTITY_UNRESOLVED'],
    ['unknown variant', (q: Quote) => { q.identity.variantState = 'UNKNOWN'; }, 'VARIANT_UNRESOLVED'],
    ['conflicting variant', (q: Quote) => { q.identity.variantState = 'CONFLICTING'; }, 'VARIANT_UNRESOLVED'],
    ['unknown offer', (q: Quote) => { q.identity.linkage = 'UNKNOWN'; }, 'OFFER_LINKAGE_UNRESOLVED'],
    ['conflicting offer', (q: Quote) => { q.identity.linkage = 'CONFLICTING'; }, 'OFFER_LINKAGE_UNRESOLVED'],
    ['unknown pack', (q: Quote) => { q.pack.linkage = 'UNKNOWN'; }, 'OFFER_LINKAGE_UNRESOLVED'],
    ['conflicting pack', (q: Quote) => { q.pack.linkage = 'CONFLICTING'; }, 'OFFER_LINKAGE_UNRESOLVED'],
  ] as const) {
    const input = fixture(); mutate(quote(input));
    const output = buildGenericQuoteUnit(input).output;
    assert.deepEqual(output.input.quotes[0]!.price, quote(input).price, name);
    const packPrice = output.quotes[0]!.pricePerPurchasedPack;
    assert.equal(packPrice.status, 'UNAVAILABLE', name);
    assert.equal(packPrice.basis, null, name);
    assert.equal(packPrice.exact, null, name);
    assert.equal(packPrice.display, null, name);
    assert.equal(packPrice.denominator, null, name);
    assert.ok(packPrice.reasons.includes(reason), name);
  }
  for (const unit of ['watts', 'hours', 'milliliters', 'watt', 'mAh', 'w', 'ml', 'mystery-count', 'dozen']) {
    const input = fixture(); quote(input).pack.count.unit = unit;
    quote(input).pack.count.value = unit === 'watt' ? '1.5' : '2';
    const output = buildGenericQuoteUnit(input).output;
    assert.equal(output.input.quotes[0]!.pack.count.unit, unit);
    assert.equal(output.input.quotes[0]!.pack.count.value, unit === 'watt' ? '1.5' : '2');
    assert.equal(output.quotes[0]!.pricePerPurchasedPack.display, '60000.00');
    assert.equal(output.quotes[0]!.pricePerPhysicalItem.status, 'UNAVAILABLE', unit);
    assert.ok(output.quotes[0]!.pricePerPhysicalItem.reasons.includes('UNSUPPORTED_PHYSICAL_COUNT_UNIT'), unit);
    assert.ok(output.quotes[0]!.pricePer100gNet.reasons.includes('UNSUPPORTED_PHYSICAL_COUNT_UNIT'), unit);
    quote(input).netMass.basis = 'PER_PURCHASED_PACK';
    assert.equal(first(input).pricePer100gNet.display, '12000.00', unit);
  }
  for (const unit of ['items', 'pieces', 'PCS', ' Jars ', 'bottle', 'hộp', 'viên']) {
    const input = fixture(); quote(input).pack.count.unit = unit;
    assert.equal(first(input).pricePerPhysicalItem.display, '30000.00', unit);
    quote(input).pack.count.dimension = 'UNKNOWN';
    assert.ok(first(input).pricePerPhysicalItem.reasons.includes('COUNT_UNIT_NOT_PHYSICAL'), unit);
  }
  const capacityCount = fixture(); quote(capacityCount).pack.count.dimension = 'OTHER'; quote(capacityCount).pack.count.unit = 'mAh';
  assert.ok(first(capacityCount).pricePer100gNet.reasons.includes('COUNT_UNIT_NOT_PHYSICAL'));
  const range = fixture(); quote(range).price.state = 'RANGE'; quote(range).price.value = null;
  quote(range).price.range = { minimum: '99000', maximum: '199000' }; quote(range).identity.variantState = 'UNKNOWN';
  const built = buildGenericQuoteUnit(range).output;
  assert.deepEqual(built.input.quotes[0]!.price.range, { minimum: '99000', maximum: '199000' });
  assert.equal(built.quotes[0]!.pricePerPhysicalItem.display, null);
  assert.equal(built.quotes[0]!.pricePerPurchasedPack.display, null);
  for (const priceState of ['STRUCK_THROUGH', 'PROMO_CONDITIONAL'] as const) {
    const input = fixture(); quote(input).price.priceState = priceState;
    quote(input).price.conditions = [{ literal: 'Requires source voucher', binding: ref('/offer/conditions') }];
    const output = buildGenericQuoteUnit(input).output;
    assert.equal(output.input.quotes[0]!.price.priceState, priceState);
    assert.equal(output.input.quotes[0]!.price.conditions[0]!.literal, 'Requires source voucher');
    assert.equal(output.input.quotes[0]!.observedAt, null);
    assert.equal(output.input.quotes[0]!.price.shipping, 'UNKNOWN');
    assert.equal(output.quotes[0]!.pricePerPhysicalItem.display, '30000.00');
  }
});

test('zero, repeating ratios and half-even display stay exact; owner denominators remain scenarios', () => {
  for (const [value, count, numerator, denominator, display] of [
    ['0', '2', '0', '1', '0.00'], ['100', '3', '100', '3', '33.33'],
    ['1.005', '1', '201', '200', '1.00'], ['1.015', '1', '203', '200', '1.02'],
  ]) {
    const input = fixture(); quote(input).price.value = value!; quote(input).pack.count.value = count!;
    const item = first(input).pricePerPhysicalItem;
    assert.deepEqual(item.exact, { numerator, denominator }); assert.equal(item.display, display);
  }
  const input = fixture();
  quote(input).pack.count.origin = 'OWNER_DECLARED'; quote(input).pack.count.binding = ref('/assumptions/count', declarationSha256);
  const row = first(input);
  assert.equal(row.pricePerPurchasedPack.basis, 'SOURCED');
  assert.equal(row.pricePerPhysicalItem.basis, 'SCENARIO');
  assert.equal(row.pricePer100gNet.basis, 'SCENARIO');
  quote(input).netMass.basis = 'PER_PURCHASED_PACK';
  assert.equal(first(input).pricePer100gNet.basis, 'SOURCED');
});

test('invalid source bindings and malformed declarations reject the whole affected input', () => {
  const cases: Array<[string, (input: Input) => void, RegExp]> = [
    ['source digest', i => { quote(i).source.sourceSha256 = '9'.repeat(64); }, /UNKNOWN_SOURCE_REFERENCE/],
    ['field pointer', i => { quote(i).price.binding!.fieldPointer = '/invalid~2'; }, /INVALID_GENERIC_QUOTE_INPUT/],
    ['blank locator', i => { quote(i).source.locator = ' '; }, /EMPTY_SOURCE_LOCATOR/],
    ['source role', i => { quote(i).pack.count.binding = ref('/assumption', declarationSha256); }, /QUANTITY_SOURCE_ROLE_MISMATCH/],
    ['parser profile digest', i => { i.configuration.parserProfileRef = ref('/profile'); }, /PARSER_PROFILE_DIGEST_MISMATCH/],
    ['condition role', i => { quote(i).price.conditions = [{ literal: 'voucher required', binding: ref('/condition', declarationSha256) }]; }, /PRICE_CONDITION_SOURCE_ROLE_MISMATCH/],
    ['attribute role', i => { quote(i).identity.variantAttributes = [{ name: 'capacity', literal: '500ml', binding: ref('/capacity', declarationSha256) }]; }, /VARIANT_ATTRIBUTE_SOURCE_ROLE_MISMATCH/],
    ['negative price', i => { quote(i).price.value = '-1'; }, /INVALID_GENERIC_QUOTE_INPUT/],
    ['blank physical unit', i => { quote(i).pack.count.unit = ' '; }, /EXACT_QUANTITY_INCOMPLETE/],
    ['false checkout', i => { quote(i).price.priceState = 'OBSERVED_CHECKOUT'; }, /CHECKOUT_SOURCE_BINDING_MISSING/],
    ['conditional price', i => { quote(i).price.priceState = 'PROMO_CONDITIONAL'; }, /PROMO_CONDITIONS_MISSING/],
    ['invented variant', i => { quote(i).identity.variantId = null; }, /EXACT_VARIANT_INCOMPLETE/],
  ];
  for (const [name, mutate, error] of cases) {
    const input = fixture(); mutate(input); assert.throws(() => buildGenericQuoteUnit(input), error, name);
  }
});

test('canonical output replay is mutation-free and rejects altered arithmetic even with a recomputed hash', () => {
  const input = fixture(); const before = canonicalJson(input);
  const { output, bytes } = buildGenericQuoteUnit(input);
  assert.equal(output.physicalCountUnitMappingRevision, 'physical-count-unit-v1');
  assert.equal(canonicalJson(input), before);
  assert.equal(output.inputSha256, createHash('sha256').update(before).digest('hex'));
  assert.equal(output.quotes[0]!.quoteInputSha256, createHash('sha256').update(canonicalJson(quote(input))).digest('hex'));
  assert.equal(verifyGenericQuoteUnit(JSON.parse(bytes.toString())).bytes.equals(bytes), true);
  assert.deepEqual(output.quotes[0]!.pricePerPhysicalItem.operandPointers, ['/input/quotes/0/price', '/input/quotes/0/pack', '/input/quotes/0/identity']);
  const tampered = structuredClone(output);
  tampered.quotes[0]!.pricePerPhysicalItem.exact!.numerator = '30001';
  const { methodOutputId: _old, ...body } = tampered;
  tampered.methodOutputId = createHash('sha256').update(canonicalJson(body)).digest('hex');
  assert.throws(() => verifyGenericQuoteUnit(tampered), /GENERIC_QUOTE_REPLAY_MISMATCH/);
});

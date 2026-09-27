import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

const bytes = (v: unknown): Buffer => Buffer.from(canonicalJson(v) + '\n');
const sha = (v: Buffer): string => createHash('sha256').update(v).digest('hex');
const compose = (result = calculateMetricScopes(metricFixture()), definition: unknown = catalog) => {
  const r = bytes(result), c = bytes(definition);
  return createResearchReportPacket(r, sha(r), c, sha(c));
};

test('A3 packages declared scope and exact observed metrics with honest section states, without new Insight claims', () => {
  const result = calculateMetricScopes(metricFixture());
  const { packet, report } = compose(result);
  assert.equal(packet.sections.length, 30);
  assert.equal(packet.claims.find(c => c.claimId === 'M03:all:revenue')?.value, '185');
  assert.equal(packet.claims.find(c => c.claimId === 'M03:all:units')?.value, '23');
  assert.equal(packet.claims.find(c => c.claimId === 'M03:all:listings')?.value, 5);
  assert.equal(packet.claims.find(c => c.claimId === 'M04:all:top1')?.value, '81.08');
  assert.equal(packet.sections.find(s => s.sectionId === 'M03')?.deliveryState, 'PARTIAL_DETERMINISTIC_DRAFT');
  for (const id of ['M10', 'I11']) assert.equal(packet.sections.find(s => s.sectionId === id)?.deliveryState, 'BLOCKED');
  assert.equal(packet.sections.find(s => s.sectionId === 'M08')?.deliveryState, 'METHOD_ONLY');
  assert.equal(packet.sections.find(s => s.sectionId === 'I01')?.deliveryState, 'MANUAL_REVIEW_REQUIRED');
  assert.equal(packet.approvalState, 'UNREVIEWED');
  assert.equal(packet.sourceVerification, 'NORMALIZED_INPUT_ONLY');
  assert.ok(packet.claims.every(c => c.claimType === 'FACT' && c.evidenceState === 'DETERMINISTIC_NORMALIZED_OBSERVATION'));
  assert.ok(packet.sections.filter(s => s.sectionId.startsWith('I')).every(s => s.claimIds.length === 0));
  // Independently resolve every public pointer, including coverage and denominator context.
  const resolve = (pointer: string): unknown => pointer.slice(1).split('/').reduce<unknown>((v, key) => (v as Record<string, unknown>)[key], result);
  for (const claim of packet.claims) {
    assert.equal(resolve(claim.metricPointer), claim.value);
    assert.deepEqual(resolve(claim.scopePointer), result.input.scope);
    assert.ok(Array.isArray(resolve(claim.membershipPointer)));
    if (claim.denominatorPointer) assert.equal(typeof resolve(claim.denominatorPointer), 'string');
    if (claim.coveragePointer) assert.equal(typeof resolve(claim.coveragePointer), 'object');
  }
  assert.match(report, /185 VND/);
  assert.match(report, /mẫu số 185 VND/);
  assert.match(report, /chưa được OWNER duyệt/);
  const repeated = compose(result);
  assert.deepEqual(repeated, { packet, report });
});

test('A3 keeps missing, zero, non-exact observations and blocked labels distinct in both claims and rendered output', () => {
  const input = metricFixture();
  input.records[0]!.revenue = { ...input.records[0]!.revenue, state: 'missing', value: null, displayedValue: null };
  input.records[1]!.revenue = { ...input.records[1]!.revenue, state: 'missing', value: null, displayedValue: null };
  input.records[2]!.revenue.precision = 'estimated';
  input.records[0]!.label = null;
  const partial = compose(calculateMetricScopes(input));
  assert.equal(partial.packet.claims.find(c => c.claimId === 'M03:all:revenue')?.value, '35');
  assert.equal(partial.packet.claims.some(c => c.scopeKey !== 'all'), false);
  assert.equal(partial.packet.claims.some(c => c.statementKind === 'TOP_SHOP_SHARE'), false);
  assert.ok(partial.packet.sections.find(s => s.sectionId === 'M03')!.blockers.includes('wide:BLOCKED_LABELS'));
  assert.match(partial.report, /2 dòng thiếu, 1 dòng không có precision exact/);
  for (const row of input.records) row.revenue = { ...row.revenue, state: 'missing', value: null, displayedValue: null };
  const missing = compose(calculateMetricScopes(input));
  assert.equal(missing.packet.claims.some(c => c.statementKind === 'OBSERVED_REVENUE'), false);
  assert.ok(missing.packet.sections.find(s => s.sectionId === 'M03')!.blockers.includes('all:revenue:NO_OBSERVED_VALUE'));
  for (const row of input.records) row.revenue = { ...row.revenue, state: 'observed_zero', value: '0', displayedValue: '0' };
  const zero = compose(calculateMetricScopes(input));
  assert.equal(zero.packet.claims.find(c => c.claimId === 'M03:all:revenue')?.value, '0');
  assert.equal(zero.packet.claims.some(c => c.statementKind === 'TOP_SHOP_SHARE'), false);
});

test('A3 rejects tampered result/hash or unsupported manual claims; catalog changes cannot promote observations or approval', () => {
  const result = calculateMetricScopes(metricFixture()), r = bytes(result), c = bytes(catalog);
  assert.throws(() => createResearchReportPacket(r, '0'.repeat(64), c, sha(c)), /DIGEST_MISMATCH/);
  assert.throws(() => createResearchReportPacket(r, sha(r), c, '0'.repeat(64)), /DIGEST_MISMATCH/);
  const changed = structuredClone(result); changed.scopes[0].revenue.value = '999';
  assert.throws(() => compose(changed), /DETERMINISTIC_REPLAY_MISMATCH/);
  const noncanonical = Buffer.from(JSON.stringify(result));
  assert.throws(() => createResearchReportPacket(noncanonical, sha(noncanonical), c, sha(c)), /DETERMINISTIC_REPLAY_MISMATCH/);
  assert.throws(() => compose(result, { ...catalog, approvalState: 'OWNER_APPROVED' }), /INVALID_CONTRACT/);
  assert.throws(() => compose(result, { ...catalog, claims: [{ claimType: 'INFERENCE', text: 'invented' }] }), /INVALID_CONTRACT/);
  assert.throws(() => compose(result, { ...catalog, sections: [...catalog.sections, catalog.sections[0]] }), /DUPLICATE_SECTION_ID/);
  const future = structuredClone(catalog);
  future.sections.find(s => s.sectionId === 'M03')!.methodVersion = '2.0.0';
  future.sections.push({ ...future.sections[0]!, sectionId: 'M14', title: '<script>alert(1)</script>', fallbackState: 'NOT_IMPLEMENTED' });
  const extended = compose(result, future);
  assert.equal(extended.packet.sections.length, 31);
  assert.equal(extended.packet.sections.find(s => s.sectionId === 'M03')?.deliveryState, 'NOT_IMPLEMENTED');
  assert.equal(extended.packet.claims.some(c => c.sectionId === 'M03'), false);
  assert.equal(extended.packet.sections.find(s => s.sectionId === 'M14')?.deliveryState, 'NOT_IMPLEMENTED');
  assert.doesNotMatch(extended.report, /<script>/);
  assert.match(extended.report, /&lt;script&gt;/);
  assert.notEqual(extended.packet.packetId, compose(result).packet.packetId);
});

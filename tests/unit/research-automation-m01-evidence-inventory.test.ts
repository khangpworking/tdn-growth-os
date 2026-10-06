import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { ScopeSnapshot } from '../../src/modules/analysis/research-automation/model.js';
import { AutomationSourceClaimsValidationError } from '../../src/modules/analysis/research-automation/source-claims.js';
import {
  AutomationM01EvidenceInventoryValidationError, buildAutomationM01EvidenceInventory, verifyAutomationM01EvidenceInventory,
  type AutomationM01EvidenceInventoryInput,
} from '../../src/modules/analysis/research-automation/m01-evidence-inventory.js';

const runId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const scope: ScopeSnapshot = {
  contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic portable desk fans',
  includeTerms: ['quat mini'], excludeTerms: [], selectedProductIds: ['101'], peerProductIds: [],
};
const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const scopeSha256 = sha(scope);
const pkg = { packageId: '33333333-3333-4333-8333-333333333333', version: 1, manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) };
const claimScope = {
  scopeSha256, universe: null, geography: 'VN', frame: null, inclusionRule: null, exclusionRule: null, variantRule: null,
  description: 'Synthetic frozen run scope',
};
const sealed = <T extends object>(body: T): T & { claimId: string } => ({ claimId: sha(body), ...body });

const m05 = (row: number, value: string) => sealed({
  sectionId: 'M05',
  method: { methodId: 'descriptive-market-methods', methodVersion: '1.0.0', methodOutputId: 'c'.repeat(64), artifact: pkg, outputPointer: `/input/m05/${row}` },
  source: { package: pkg, logicalPath: 'synthetic/market.csv', sha256: 'd'.repeat(64), locator: `row:${row + 2}`, recordLocator: null, statement: null, attribution: null, spans: [] },
  observation: {
    basis: 'SOURCE_OBSERVED', state: 'observed_value',
    measure: { literal: 'Doanh thu', definition: 'Source-stated revenue for one listed row', entityLabel: `Synthetic fan ${row}` },
    value, unit: 'VND', precision: 'exact',
    period: { start: '2026-09-01', end: '2026-09-30', timezone: 'Asia/Ho_Chi_Minh', basis: 'SOURCE_STATED_PERIOD' },
    periodText: '01/09/2026 - 30/09/2026', scope: claimScope,
    coverage: { unit: 'SOURCE_OBSERVATIONS', observedCount: 3, zeroCount: 0, missingCount: 1, unknownCount: 0, nonExactCount: 0, description: 'Three observed rows and one missing row' },
    limitations: ['SOURCE_STATED_MEASURE_IS_NOT_DEMAND_OR_MARKET_SIZE'],
  },
  declaration: null,
  limitations: ['M05_BLOCKER:SYNTHETIC_FIXTURE'],
});

const declared = (sectionId: 'I02' | 'I04', line: number, statement: string) => sealed({
  sectionId,
  method: { methodId: 'automation-located-review', methodVersion: '2.0.0', methodOutputId: 'e'.repeat(64), artifact: pkg, outputPointer: `/input/${sectionId.toLowerCase()}/0` },
  source: {
    package: pkg, logicalPath: 'synthetic/reviews.jsonl', sha256: 'f'.repeat(64), locator: `line:${line}`, recordLocator: `review:R-${line}`,
    statement, attribution: `Synthetic reviewer R-${line}`,
    spans: [{ role: 'DECLARATION', start: 0, end: statement.length, quote: statement }, { role: 'COUNTEREVIDENCE', start: 0, end: 3, quote: statement.slice(0, 3) }],
  },
  observation: {
    basis: 'DECLARED', state: 'DECLARED', measure: null, value: null, unit: null, precision: 'not_applicable', period: null,
    periodText: 'Review date not stated', scope: claimScope,
    coverage: { unit: 'LOCATED_RECORDS', observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0, description: 'One located review record' },
    limitations: ['DECLARED_SOURCE_READING_NOT_AUTHENTICATED_OR_OWNER_APPROVED'],
  },
  declaration: {
    sourceAttribution: `Synthetic reviewer R-${line}`, annotationAttribution: 'Synthetic coder',
    provenance: { basis: 'DECLARED', coderRole: 'LITERAL_RULE', adjudication: 'ADOPTED_LITERAL_MAPPING', disagreement: null },
  },
  limitations: ['EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS'],
});

const m05First = m05(0, '40');
const m05Second = m05(1, '1250.5');
const m05Third = m05(2, '3');
const i02 = declared('I02', 7, 'I take the fan to work');
const i04 = declared('I04', 9, 'Too loud at night');

function inputFor(claims: readonly object[]): AutomationM01EvidenceInventoryInput {
  return {
    run: { runId, workspaceId }, scope, claimsSha256: sha(claims),
    sourceClaims: {
      contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0', runId, workspaceId, scopeSha256,
      claimsSha256: sha(claims), claims, limitations: ['SYNTHETIC_SOURCE_CLAIMS_FIXTURE'],
    },
  };
}

test('M01 inventories eligible claims in catalog section order without ranking, objective or conclusion', () => {
  const artifactOrder = [i04, m05First, i02, m05Second, m05Third];
  const { artifact } = buildAutomationM01EvidenceInventory(inputFor(artifactOrder));

  // M05 values 40, 1250.5, 3 keep their upstream order: neither ascending nor descending by value.
  assert.deepEqual(artifact.items.map((item) => item.claimId), [m05First.claimId, m05Second.claimId, m05Third.claimId, i02.claimId, i04.claimId]);
  assert.deepEqual(artifact.items.map((item) => item.sectionId), ['M05', 'M05', 'M05', 'I02', 'I04']);
  assert.deepEqual(
    { sectionId: artifact.sectionId, runId: artifact.runId, workspaceId: artifact.workspaceId, scopeSha256: artifact.scopeSha256, sourceClaims: artifact.sourceClaims,
      ownerQuestion: artifact.ownerQuestion, ordering: artifact.ordering, status: artifact.status, insufficientEvidence: artifact.insufficientEvidence, conclusion: artifact.conclusion },
    { sectionId: 'M01', runId, workspaceId, scopeSha256,
      sourceClaims: { methodId: 'automation-source-claims', methodVersion: '1.0.0', claimsSha256: sha(artifactOrder) },
      ownerQuestion: { state: 'UNSET', text: null }, ordering: 'CATALOG_SECTION_ORDER_M05_I02_I04_UNRANKED',
      status: 'UNRANKED_INVENTORY', insufficientEvidence: null, conclusion: null },
  );
});

test('each M01 item binds the exact upstream claim, source locator, method and observation without copying source text', () => {
  const { artifact } = buildAutomationM01EvidenceInventory(inputFor([i02, m05First]));

  assert.deepEqual(artifact.items, [
    {
      claimId: m05First.claimId, sectionId: 'M05', basis: 'SOURCE_OBSERVED', evidenceKind: 'SOURCE_OBSERVATION', state: 'observed_value',
      method: { methodId: 'descriptive-market-methods', methodVersion: '1.0.0', methodOutputId: 'c'.repeat(64), artifact: pkg, outputPointer: '/input/m05/0' },
      source: { package: pkg, logicalPath: 'synthetic/market.csv', sha256: 'd'.repeat(64), locator: 'row:2', recordLocator: null, attribution: null },
      measure: { literal: 'Doanh thu', definition: 'Source-stated revenue for one listed row', entityLabel: 'Synthetic fan 0' },
      value: '40', unit: 'VND', precision: 'exact',
      period: { start: '2026-09-01', end: '2026-09-30', timezone: 'Asia/Ho_Chi_Minh', basis: 'SOURCE_STATED_PERIOD' },
      periodText: '01/09/2026 - 30/09/2026', scope: claimScope,
      coverage: { unit: 'SOURCE_OBSERVATIONS', observedCount: 3, zeroCount: 0, missingCount: 1, unknownCount: 0, nonExactCount: 0, description: 'Three observed rows and one missing row' },
      declaration: null,
      observationLimitations: ['SOURCE_STATED_MEASURE_IS_NOT_DEMAND_OR_MARKET_SIZE'],
      claimLimitations: ['M05_BLOCKER:SYNTHETIC_FIXTURE'],
    },
    {
      claimId: i02.claimId, sectionId: 'I02', basis: 'DECLARED', evidenceKind: 'SELF_REPORTED_DECLARATION', state: 'DECLARED',
      method: { methodId: 'automation-located-review', methodVersion: '2.0.0', methodOutputId: 'e'.repeat(64), artifact: pkg, outputPointer: '/input/i02/0' },
      source: { package: pkg, logicalPath: 'synthetic/reviews.jsonl', sha256: 'f'.repeat(64), locator: 'line:7', recordLocator: 'review:R-7', attribution: 'Synthetic reviewer R-7' },
      measure: null, value: null, unit: null, precision: 'not_applicable', period: null, periodText: 'Review date not stated', scope: claimScope,
      coverage: { unit: 'LOCATED_RECORDS', observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0, description: 'One located review record' },
      declaration: {
        sourceAttribution: 'Synthetic reviewer R-7', annotationAttribution: 'Synthetic coder',
        provenance: { basis: 'DECLARED', coderRole: 'LITERAL_RULE', adjudication: 'ADOPTED_LITERAL_MAPPING', disagreement: null },
      },
      observationLimitations: ['DECLARED_SOURCE_READING_NOT_AUTHENTICATED_OR_OWNER_APPROVED'],
      claimLimitations: ['EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS'],
    },
  ]);
});

test('an empty eligible claim set yields explicit insufficient evidence and no content', () => {
  const { artifact } = buildAutomationM01EvidenceInventory(inputFor([]));

  assert.deepEqual(
    { status: artifact.status, insufficientEvidence: artifact.insufficientEvidence, items: artifact.items, ownerQuestion: artifact.ownerQuestion, conclusion: artifact.conclusion },
    { status: 'INSUFFICIENT_EVIDENCE', insufficientEvidence: 'NO_ELIGIBLE_UPSTREAM_CLAIMS', items: [], ownerQuestion: { state: 'UNSET', text: null }, conclusion: null },
  );
});

test('M01 rejects claims that are not bound to the exact run, workspace, scope and replayed claim set', () => {
  const base = inputFor([m05First, i02]);
  const otherRun = '44444444-4444-4444-8444-444444444444';
  const otherWorkspace = '55555555-5555-4555-8555-555555555555';
  const cases: readonly [string, AutomationM01EvidenceInventoryInput, string][] = [
    ['scope of another run', { ...base, scope: { ...scope, runId: otherRun } }, 'RUN_SCOPE_IDENTITY_MISMATCH'],
    ['claims of another run', { ...base, run: { runId: otherRun, workspaceId }, scope: { ...scope, runId: otherRun } }, 'RUN_IDENTITY_MISMATCH'],
    ['claims of another workspace', { ...base, run: { runId, workspaceId: otherWorkspace }, scope: { ...scope, workspaceId: otherWorkspace } }, 'WORKSPACE_IDENTITY_MISMATCH'],
    ['a different frozen scope', { ...base, scope: { ...scope, definition: 'Synthetic space heaters' } }, 'SCOPE_IDENTITY_MISMATCH'],
    ['a different replayed claim set', { ...base, claimsSha256: sha([m05First]) }, 'CLAIMS_IDENTITY_MISMATCH'],
  ];
  for (const [label, input, code] of cases)
    assert.throws(() => buildAutomationM01EvidenceInventory(input),
      (error: unknown) => error instanceof AutomationM01EvidenceInventoryValidationError && error.message === code, label);

  const tampered = [{ ...m05First, observation: { ...m05First.observation, value: '41' } }, i02];
  assert.throws(() => buildAutomationM01EvidenceInventory(inputFor(tampered)),
    (error: unknown) => error instanceof AutomationSourceClaimsValidationError && error.message === 'CLAIM_IDENTITY_MISMATCH');
});

test('a retained M01 inventory replays only when it equals the rebuilt unranked inventory', () => {
  const input = inputFor([m05First, i02]);
  const { artifact, bytes } = buildAutomationM01EvidenceInventory(input);
  assert.deepEqual(verifyAutomationM01EvidenceInventory(JSON.parse(bytes.toString('utf8')), input), artifact);

  const [first, second] = artifact.items;
  assert.throws(() => verifyAutomationM01EvidenceInventory({ ...artifact, items: [second, first] }, input),
    (error: unknown) => error instanceof AutomationM01EvidenceInventoryValidationError && error.message === 'M01_EVIDENCE_INVENTORY_REPLAY_MISMATCH');
  assert.throws(() => verifyAutomationM01EvidenceInventory({ ...artifact, conclusion: 'Launch the work fan now' }, input),
    (error: unknown) => error instanceof AutomationM01EvidenceInventoryValidationError && error.message.startsWith('INVALID_M01_EVIDENCE_INVENTORY:'));
});

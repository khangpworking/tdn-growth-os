import assert from 'node:assert/strict';
import test from 'node:test';
import { buildBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { automationDecisionSynthesisPrompt } from '../../src/modules/analysis/research-automation/decision-synthesis-input.js';
import { createHash } from 'node:crypto';
import { insightModelPrompt } from '../../src/modules/analysis/research-automation/insight-model-execution.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import legacyPromptSchemas from '../../src/modules/analysis/research-automation/insight-model-prompt-v1-schemas.json' with { type: 'json' };
import locatedSchema from '../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import { locatedInsightFixture } from '../helpers/located-insight-fixture.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';
import type { BoundedAnalysisGates } from '../../contracts/analysis/bounded-analysis-gates.generated.js';

type Cell = NonNullable<BoundedAnalysisGates['input']['i11']>['cells'][number];

// U-05 (E4): the persona ban is lifted only in the new prompt version, and "no people counts" is kept. v1 embeds a
// frozen pre-change schema fragment, so this digest is the v1 text as released before the U-02 contract fields
// existed: hash of the same template over the base-commit fragments. Re-deriving v1 from the current schema would
// silently rewrite the prompt a retained v1 execution was prepared with, which is the identity this pins.
const HISTORICAL_V1_SHA256 = 'b7fca3c33c55ba6531fa3eab9008d6da11cdad4391a3a7f7878db87efebb5e78';
test('U-05 lifts the persona ban in v2 and keeps the historical v1 prompt bytes', () => {
  const v1 = insightModelPrompt('insight-model-prompt-v1');
  const v2 = insightModelPrompt('insight-model-prompt-v2');
  assert.equal(v1.contractVersion, 'insight-model-prompt-v1');
  assert.equal(v2.contractVersion, 'insight-model-prompt-v2');
  assert.equal(createHash('sha256').update(v1.systemText, 'utf8').digest('hex'), HISTORICAL_V1_SHA256);
  assert.ok(v1.systemText.includes('Do not infer people counts, personas, causality'));
  assert.ok(v2.systemText.includes('Do not infer people counts, causality'));
  assert.ok(!v2.systemText.includes('personas'));
  // The frozen fragment predates the U-02 fields, and only v2 embeds the current contract fragment.
  assert.ok(v1.systemText.includes(canonicalJson(legacyPromptSchemas.locatedDefinitions)));
  assert.ok(!v1.systemText.includes('workingQuestionProposal'));
  assert.ok(v2.systemText.includes(canonicalJson(locatedSchema.$defs)));
  assert.ok(v2.systemText.includes('workingQuestionProposal'));
  // v1 and v2 differ by exactly the lifted persona ban plus the located-contract fragment change, nothing else.
  assert.equal(v1.systemText
    .replace('people counts, personas, causality', 'people counts, causality')
    .replace(canonicalJson(legacyPromptSchemas.locatedDefinitions), canonicalJson(locatedSchema.$defs)), v2.systemText);
});

// U-16 + U-07: the new decision prompt carries the no-purchase ban and the three labelled proposal fields, capped at 3.
test('U-16 decision prompt 1.3.0 bans purchases and adds the labelled proposal fields for M12 and I15', () => {
  for (const [sectionId, extra] of [['M12', ['proposedOwner', 'proposedDeadline', 'immediateTask']], ['I15', ['proposedOwner', 'proposedDeadline']]] as const) {
    const prompt = automationDecisionSynthesisPrompt(sectionId, '1.3.0').artifact;
    assert.equal(prompt.promptVersion, '1.3.0');
    assert.equal(prompt.inputContract.methodVersion, '1.2.0');
    assert.ok(prompt.systemText.includes('at most 3 distinct objects'));
    assert.ok(!prompt.systemText.includes('at most 20 distinct objects'));
    assert.match(prompt.systemText, /never propose, suggest or imply placing a trial order/i);
    for (const field of extra) assert.ok(prompt.systemText.includes(field), `${sectionId} prompt must mention ${field}`);
  }
  const m11 = automationDecisionSynthesisPrompt('M11', '1.3.0').artifact;
  assert.ok(m11.systemText.includes('at most 20 distinct objects'));
  assert.match(m11.systemText, /never propose, suggest or imply placing a trial order/i);
  // U-02: the owner question stays unset in every 1.3.0 prompt, with the working question called out as an AI proposal.
  assert.match(m11.systemText, /working question may be shown as an AI proposal awaiting the owner/i);
});

// U-02 (E7): a 1.1.0 input labels an AI-proposed working question and never inserts it into the owner brief fields.
test('U-02 labels an AI-proposed working question without changing evidence membership', () => {
  const legacy = buildLocatedInsightMethods(locatedInsightFixture()).output;
  const input: Record<string, unknown> = { ...locatedInsightFixture(), semanticsVersion: '1.1.0', workingQuestionProposal: 'Which barrier is stated?' };
  const output = buildLocatedInsightMethods(input).output;
  assert.equal(output.methodVersion, '1.1.0');
  assert.deepEqual(output.sections.I01.workingQuestion, {
    state: 'AI_PROPOSED_AWAITING_OWNER', label: 'câu hỏi làm việc do AI đề xuất, chờ chủ duyệt',
    text: 'Which barrier is stated?',
    ownerFieldsToAdd: ['questionText', 'decisionToInform', 'intendedAudience', 'scope', 'knownConstraints'],
  });
  assert.deepEqual(output.sections.I01.unresolvedFields, ['decisionToInform', 'intendedAudience', 'scope', 'knownConstraints']);
  assert.equal(output.input.brief, null);
  assert.ok(!output.sections.I01.unresolvedFields.includes('questionText'));
  assert.ok(!output.sections.I01.blockers.includes('I01_OWNER_QUESTION_REQUIRED'));
  // Evidence membership is unchanged: only I01 and the version marker may differ.
  const { I01: _legacy, ...legacyRest } = legacy.sections;
  const { I01: _new, ...newRest } = output.sections;
  assert.deepEqual(newRest, legacyRest);
});

// U-04 (E11 / §6.3): disjoint groups are derived only from source-stated platform + explicit retail/wholesale.
test('U-04 derives source-backed disjoint platform/buyer groups and gates descriptive rates at 30 located records', () => {
  const input = boundedAnalysisGatesFixture();
  const scope = input.i11!.cells[0]!.scope;
  const source = (locator: string) => ({ logicalPath: 'gate-source.json', sha256: '1'.repeat(64), locator });
  const member = (index: number, number_: number) => source(`/i11/cells/${index}/members/${number_}`);
  const cell = (index: number, platform: string, buyer: string, numerator: number, denominator: number): Cell => ({
    source: source(`/i11/cells/${index}`), group: null,
    assignment: { state: 'SOURCE_ASSIGNED', source: source(`/i11/cells/${index}/assignment`) },
    countUnit: 'LOCATED_RECORD', identityEvidence: null, scope: structuredClone(scope),
    numerator: { state: 'observed_value', value: String(numerator) }, denominator: { state: 'observed_value', value: String(denominator) },
    memberSources: Array.from({ length: denominator }, (_, memberIndex) => member(index, memberIndex)),
    numeratorMemberSources: Array.from({ length: numerator }, (_, memberIndex) => member(index, memberIndex)),
    groupBasis: {
      platform: { state: 'SOURCE_STATED', value: platform, source: source(`/i11/cells/${index}/platform`) },
      buyerType: { state: 'SOURCE_STATED', value: buyer, source: source(`/i11/cells/${index}/buyer`) },
    },
  });
  const versioned = { ...input, semanticsVersion: '1.1.0', i11: { ...input.i11!, groupPolicy: null, cells: [
    cell(0, 'Shopee', 'RETAIL', 12, 40), cell(1, 'Shopee', 'WHOLESALE', 5, 31), cell(2, 'Lazada', 'RETAIL', 9, 35),
  ] } };
  const result = buildBoundedAnalysisGates(versioned).output.sections.I11;
  assert.deepEqual(result.partitions[0]!.groupOrder, ['Shopee / RETAIL', 'Shopee / WHOLESALE', 'Lazada / RETAIL']);
  assert.deepEqual(result.partitions[0]!.unknownAssignmentPointers, []);
  assert.deepEqual(result.rates, { recordsPerGroupMinimum: 30, groups: [
    { partition: 0, group: 'Shopee / RETAIL', numerator: 12, denominator: 40, rate: 0.3 },
    { partition: 0, group: 'Shopee / WHOLESALE', numerator: 5, denominator: 31, rate: 5 / 31 },
    { partition: 0, group: 'Lazada / RETAIL', numerator: 9, denominator: 35, rate: 9 / 35 },
  ] });
  assert.equal(result.differences, null);
  assert.ok(!result.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));
  assert.ok(result.blockers.includes('I11_DIFFERENCES_AND_INFERENCE_DISABLED'));

  // A declared denominator that does not match the authenticated member set keeps the partition counts-only.
  const mismatched = structuredClone(versioned) as typeof versioned;
  mismatched.i11.cells[0]!.memberSources = mismatched.i11.cells[0]!.memberSources!.slice(0, 39);
  assert.equal(buildBoundedAnalysisGates(mismatched).output.sections.I11.rates, null);

  // A group with no stated buyer type is platform-only and, mixed with a buyer subdivision of the same platform,
  // describes overlapping universes; the partition stays counts-only and no buyer type is inferred.
  const unspecified = structuredClone(versioned) as typeof versioned;
  unspecified.i11.cells[1]!.groupBasis!.buyerType = { state: 'NOT_STATED', value: null, source: null };
  const countsOnly = buildBoundedAnalysisGates(unspecified).output.sections.I11;
  assert.deepEqual(countsOnly.partitions[0]!.groupOrder, ['Shopee / RETAIL', 'Shopee', 'Lazada / RETAIL']);
  assert.ok(countsOnly.partitions[0]!.blockers.includes('I11_PLATFORM_ONLY_GROUP_OVERLAPS_BUYER_SUBDIVISION'));
  assert.equal(countsOnly.rates, null);
  assert.ok(countsOnly.blockers.includes('I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS'));

  // A platform-only comparison is allowed on its own when exact text-record members prove disjointness and >=30 each.
  const platformOnly = structuredClone(versioned) as typeof versioned;
  platformOnly.i11.cells = [platformOnly.i11.cells[0]!, structuredClone(versioned.i11.cells[2]!)];
  for (const value of platformOnly.i11.cells) value.groupBasis!.buyerType = { state: 'NOT_STATED', value: null, source: null };
  assert.deepEqual(buildBoundedAnalysisGates(platformOnly).output.sections.I11.rates, { recordsPerGroupMinimum: 30, groups: [
    { partition: 0, group: 'Shopee', numerator: 12, denominator: 40, rate: 0.3 },
    { partition: 0, group: 'Lazada', numerator: 9, denominator: 35, rate: 9 / 35 },
  ] });

  // Below 30 located records per group the partition stays counts-only too.
  const small = structuredClone(versioned) as typeof versioned;
  small.i11.cells[0]!.denominator = { state: 'observed_value', value: '29' };
  assert.equal(buildBoundedAnalysisGates(small).output.sections.I11.rates, null);

  // Distinct group labels are not proof of disjoint membership: a record counted in two groups keeps rates blocked.
  const overlap = structuredClone(versioned) as typeof versioned;
  overlap.i11.cells[1]!.memberSources![0] = overlap.i11.cells[0]!.memberSources![0]!;
  const overlapped = buildBoundedAnalysisGates(overlap).output.sections.I11;
  assert.equal(overlapped.rates, null);
  assert.ok(overlapped.partitions[0]!.blockers.includes('I11_GROUP_MEMBER_OVERLAP'));

  // Repeating one member inside a group cannot inflate the numerator into the declared value.
  const inflated = structuredClone(versioned) as typeof versioned;
  inflated.i11.cells[0]!.numeratorMemberSources!.push(inflated.i11.cells[0]!.numeratorMemberSources![0]!);
  assert.equal(buildBoundedAnalysisGates(inflated).output.sections.I11.rates, null);
  const duplicatedMember = structuredClone(versioned) as typeof versioned;
  duplicatedMember.i11.cells[0]!.memberSources!.push(duplicatedMember.i11.cells[0]!.memberSources![0]!);
  assert.equal(buildBoundedAnalysisGates(duplicatedMember).output.sections.I11.rates, null);

  // Two cells for one group in one partition would overwrite the numerator/denominator: rejected, never merged.
  const duplicate = structuredClone(versioned) as typeof versioned;
  duplicate.i11.cells.push({ ...structuredClone(versioned.i11.cells[2]!), source: source('/i11/cells/3') });
  assert.throws(() => buildBoundedAnalysisGates(duplicate), /I11_DUPLICATE_GROUP_CELL/);
});

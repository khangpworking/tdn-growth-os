import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { AutomationSourceClaims } from '../../contracts/analysis/automation-source-claims.generated.js';
import { i14AdmissionSection, i14SynthesisSection } from '../../src/modules/analysis/research-automation/synthesis-evidence-report.js';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildLocatedInsightMethods, LocatedInsightValidationError } from '../../src/modules/analysis/located-insight-methods.js';
import type { ScopeSnapshot } from '../../src/modules/analysis/research-automation/model.js';
import {
  AutomationI14ValidationError, buildAutomationI14EvidenceAdmission, validateAutomationI14CandidateResponse, verifyAutomationI14EvidenceAdmission,
  type AutomationI14EvidenceAdmissionInput,
} from '../../src/modules/analysis/research-automation/i14-evidence-admission.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

const runId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const scope: ScopeSnapshot = {
  contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic portable desk fans',
  includeTerms: ['quat mini'], excludeTerms: [], selectedProductIds: ['101'], peerProductIds: [],
};
const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const scopeSha256 = sha(scope);
const pkg = { packageId: '33333333-3333-4333-8333-333333333333', version: 1, manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) };
const sealed = <T extends object>(body: T): T & { claimId: string } => ({ claimId: sha(body), ...body });

const workText = 'I take the fan to work, but it is too loud in the office.';
const studentText = 'As a student I used it last week.';
const parkText = 'If it is not raining I take it to the park.';
const provenance = { basis: 'DECLARED' as const, coderRole: 'synthetic coder', adjudication: null, disagreement: null };
const absent = { state: 'NOT_STATED' as const, span: null };
const stated = (text: string, quote: string) => ({ state: 'SOURCE_STATED' as const, span: locatedSpan(text, quote) });
const base = (recordIndex: number) => ({ recordIndex, provenance: { ...provenance }, qualifiers: [], counterevidence: [] });

function locatedOutput(question = 'Which actions and reasons are explicitly stated?'): LocatedInsightMethods {
  const input = locatedInsightFixture();
  input.question = question;
  [workText, studentText, parkText].forEach((text, index) => input.records.push({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic account', timeText: null, disposition: 'INCLUDED', dispositionReason: null }));
  input.i02 = [
    { ...base(0), counterevidence: [locatedSpan(workText, 'it is too loud in the office')],
      role: absent, situation: absent, task: absent, setting: stated(workText, 'to work'), time: absent },
    { ...base(1), role: stated(studentText, 'As a student'), situation: absent, task: absent, setting: absent, time: stated(studentText, 'last week') },
    { ...base(2), qualifiers: [locatedSpan(parkText, 'If it is not raining')],
      role: absent, situation: absent, task: absent, setting: stated(parkText, 'to the park'), time: absent },
  ];
  input.i04 = [{ ...base(1), span: locatedSpan(studentText, 'I used it'), eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  return buildLocatedInsightMethods(input).output;
}
const output = locatedOutput();

type SpanRole = 'DECLARATION' | 'QUALIFIER' | 'COUNTEREVIDENCE';
const claimSpan = (role: SpanRole, text: string, quote: string) => ({ role, ...locatedSpan(text, quote) });
const declared = (sectionId: 'I02' | 'I04', pointerIndex: number, recordIndex: number, spans: readonly object[]) => sealed({
  sectionId,
  method: { methodId: 'located-insight-methods', methodVersion: '1.0.0', methodOutputId: output.methodOutputId, artifact: pkg,
    outputPointer: `/input/${sectionId.toLowerCase()}/${pointerIndex}` },
  source: { package: pkg, logicalPath: 'accounts.json', sha256: '1'.repeat(64), locator: `/records/${recordIndex}/text`,
    recordLocator: `/records/${recordIndex}/text`, statement: null, attribution: 'Synthetic account', spans },
  observation: {
    basis: 'DECLARED', state: 'DECLARED', measure: null, value: null, unit: null, precision: 'not_applicable', period: null, periodText: null,
    scope: { scopeSha256, universe: null, geography: null, frame: null, inclusionRule: null, exclusionRule: null, variantRule: null, description: 'Synthetic frozen run scope' },
    coverage: { unit: 'LOCATED_RECORDS', observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0, description: 'One located record' },
    limitations: ['DECLARED_SOURCE_READING_NOT_AUTHENTICATED_OR_OWNER_APPROVED'],
  },
  declaration: { sourceAttribution: 'Synthetic account', annotationAttribution: sectionId === 'I04' ? 'SELF_REPORTED' : null, provenance },
  limitations: ['EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS'],
});

const workClaim = declared('I02', 0, 0, [claimSpan('DECLARATION', workText, 'to work'), claimSpan('COUNTEREVIDENCE', workText, 'it is too loud in the office')]);
const studentClaim = declared('I02', 1, 1, [claimSpan('DECLARATION', studentText, 'As a student'), claimSpan('DECLARATION', studentText, 'last week')]);
const parkClaim = declared('I02', 2, 2, [claimSpan('QUALIFIER', parkText, 'If it is not raining'), claimSpan('DECLARATION', parkText, 'to the park')]);
const usedClaim = declared('I04', 0, 1, [claimSpan('DECLARATION', studentText, 'I used it')]);
const allClaims = [workClaim, studentClaim, parkClaim, usedClaim];

function inputFor(claims: readonly object[], locatedMethodOutput: unknown = output): AutomationI14EvidenceAdmissionInput {
  return {
    run: { runId, workspaceId }, scope, claimsSha256: sha(claims), locatedMethodOutput,
    sourceClaims: {
      contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0', runId, workspaceId, scopeSha256,
      claimsSha256: sha(claims), claims, limitations: ['SYNTHETIC_SOURCE_CLAIMS_FIXTURE'],
    },
  };
}

const candidate = (overrides: Record<string, unknown> = {}) => ({
  candidateType: 'HYPOTHESIS', candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
  text: 'A portable fan may fit someone who takes it to work, if office noise is acceptable to them.',
  conciseEvidenceLinkedRationale: 'One located record states a work setting and also states the fan is too loud in the office.',
  citedClaimRefs: [workClaim.claimId], counterevidenceRefs: [],
  assumptions: ['The stated work setting describes ordinary use rather than a single trip.'],
  unknowns: ['Whether other located records describe work use at all.'],
  evidenceGaps: ['No source states noise tolerance in a comparable office.'],
  limitations: ['A located record is not a person, segment or market.'],
  ...overrides,
});
const rejects = (code: string) => (error: unknown) => error instanceof AutomationI14ValidationError && error.message === code;

test('I14 displays retained AI text as an unreviewed proposal with escaped prose and exact source links', () => {
  const input = inputFor(allClaims);
  const retained = validateAutomationI14CandidateResponse({ aiCandidates: [candidate({ text: '<script>not executable</script>', counterevidenceRefs: [parkClaim.claimId] })] }, input);
  const html = i14SynthesisSection({ status: 'VALID', executionId: 'synthetic', dispatched: false,
    candidates: { ...retained, sha256: createHash('sha256').update(retained.bytes).digest('hex') } }) +
    i14AdmissionSection(buildAutomationI14EvidenceAdmission(input).artifact, input.sourceClaims as AutomationSourceClaims);
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    assert.equal(document.querySelectorAll('script').length, 0);
    assert.ok(document.body.textContent?.includes('<script>not executable</script>'));
    assert.ok(document.body.textContent?.includes('Chưa được người dùng duyệt'));
    assert.ok(document.body.textContent?.includes('chưa được xác minh là đúng'));
    assert.deepEqual([...document.querySelectorAll('a')].map(link => link.getAttribute('href')), [`#claim-${workClaim.claimId}`, `#claim-${parkClaim.claimId}`]);
    for (const link of document.querySelectorAll('a')) assert.ok(document.querySelector(link.getAttribute('href')!));
    assert.ok(document.body.textContent?.includes(retained.artifact.aiCandidates[0]!.assumptions[0]!));
    assert.ok(document.body.textContent?.includes(retained.artifact.aiCandidates[0]!.unknowns[0]!));
  } finally { dom.window.close(); }
  assert.equal(i14SynthesisSection({ status: 'NOT_DISPATCHED', reason: 'INSUFFICIENT_EVIDENCE' }), '');
  assert.match(i14SynthesisSection({ status: 'DISPATCH_UNKNOWN', executionId: 'synthetic', dispatched: false, unknownCode: 'INTERRUPTED_AFTER_CLAIM' }), /không tự gọi lại/);
  assert.match(i14SynthesisSection({ status: 'INVALID', executionId: 'synthetic', dispatched: false, validationCode: 'RESPONSE_NOT_JSON' }), /không được đưa vào báo cáo/);
});

test('I14 admits only an unqualified I02 row with a source-stated situation, task or setting and keeps its exact bindings', () => {
  const { artifact } = buildAutomationI14EvidenceAdmission(inputFor(allClaims));

  assert.deepEqual(artifact.anchors, [{
    claimId: workClaim.claimId,
    method: { methodId: 'located-insight-methods', methodVersion: '1.0.0', methodOutputId: output.methodOutputId, artifact: pkg, outputPointer: '/input/i02/0' },
    source: { package: pkg, logicalPath: 'accounts.json', sha256: '1'.repeat(64), locator: '/records/0/text', recordLocator: '/records/0/text', attribution: 'Synthetic account' },
    contextFields: [{ field: 'setting', span: { start: 15, end: 22, quote: 'to work' } }],
    counterevidenceSpans: [{ start: 28, end: 56, quote: 'it is too loud in the office' }],
    declaration: { sourceAttribution: 'Synthetic account', annotationAttribution: null, provenance },
  }]);
  // Role/time alone, a qualified setting and a bare reported action stay accounted for but never become anchors.
  assert.deepEqual(artifact.unassigned, [
    { claimId: studentClaim.claimId, sectionId: 'I02', reason: 'NO_SOURCE_STATED_USE_CONTEXT_FIELD' },
    { claimId: parkClaim.claimId, sectionId: 'I02', reason: 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED' },
    { claimId: usedClaim.claimId, sectionId: 'I04', reason: 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT' },
  ]);
  assert.deepEqual(
    { status: artifact.status, insufficientEvidence: artifact.insufficientEvidence, ownerQuestion: artifact.ownerQuestion, locatedMethodOutputId: artifact.locatedMethodOutputId },
    { status: 'USE_CONTEXT_ADMITTED', insufficientEvidence: null, ownerQuestion: { state: 'UNSET', text: null }, locatedMethodOutputId: output.methodOutputId },
  );
  // Distinct presentation risk: storage may preserve the counterexample while
  // the visible opportunity section drops it or presents the setting as demand.
  const dom = new JSDOM(i14AdmissionSection(artifact, inputFor(allClaims).sourceClaims as AutomationSourceClaims));
  try {
    const entry = dom.window.document.querySelector('.evidence-entry')!;
    assert.equal(entry.querySelector('dd q')!.textContent, 'to work');
    assert.ok([...entry.querySelectorAll('q')].some(quote => quote.textContent === 'it is too loud in the office'));
    assert.match(dom.window.document.body.textContent!, /không chứng minh nhu cầu thị trường/);
    assert.equal(dom.window.document.querySelectorAll('tbody tr').length, 3);
    assert.ok(dom.window.document.getElementById(`claim-${workClaim.claimId}`));
  } finally { dom.window.close(); }
});

test('a bare reported action with role and time but no use context leaves I14 insufficient and blocks every candidate', () => {
  const input = inputFor([usedClaim, studentClaim]);
  const { artifact } = buildAutomationI14EvidenceAdmission(input);

  assert.deepEqual(
    { status: artifact.status, insufficientEvidence: artifact.insufficientEvidence, anchors: artifact.anchors, unassigned: artifact.unassigned },
    { status: 'INSUFFICIENT_EVIDENCE', insufficientEvidence: 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT', anchors: [], unassigned: [
      { claimId: usedClaim.claimId, sectionId: 'I04', reason: 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT' },
      { claimId: studentClaim.claimId, sectionId: 'I02', reason: 'NO_SOURCE_STATED_USE_CONTEXT_FIELD' },
    ] },
  );
  assert.throws(() => validateAutomationI14CandidateResponse({ aiCandidates: [candidate({ citedClaimRefs: [usedClaim.claimId] })] }, input),
    rejects('CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT'));
});

test('matching qualifier and field spans do not grant a custom I02 row the adopted literal exception', () => {
  const annotated = structuredClone(output.input);
  annotated.i02[0]!.qualifiers = [locatedSpan(workText, 'to work')];
  const custom = buildLocatedInsightMethods(annotated).output;
  const { claimId: _priorId, ...prior } = workClaim;
  const claim = sealed({ ...prior, method: { ...prior.method, methodOutputId: custom.methodOutputId } });
  const input = { ...inputFor([claim], custom), admissionVersion: '1.1.0' as const };
  const admission = buildAutomationI14EvidenceAdmission(input).artifact;
  assert.deepEqual(admission.anchors, []);
  assert.deepEqual(admission.unassigned, [{ claimId: claim.claimId, sectionId: 'I02', reason: 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED' }]);
  assert.equal(admission.literalProjection, null);
  assert.throws(() => validateAutomationI14CandidateResponse({ aiCandidates: [candidate({ citedClaimRefs: [claim.claimId] })] }, input),
    rejects('CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT'));
});

test('I14 rejects claims not bound to the exact run, scope, claim set, frozen located output and source row', () => {
  const bound = inputFor(allClaims);
  const otherRun = '44444444-4444-4444-8444-444444444444';
  const otherWorkspace = '55555555-5555-4555-8555-555555555555';
  const relocated = declared('I02', 0, 1, [claimSpan('DECLARATION', workText, 'to work'), claimSpan('COUNTEREVIDENCE', workText, 'it is too loud in the office')]);
  const counterevidenceDropped = declared('I02', 0, 0, [claimSpan('DECLARATION', workText, 'to work')]);
  const cases: readonly [string, AutomationI14EvidenceAdmissionInput, string][] = [
    ['claims of another run', { ...bound, run: { runId: otherRun, workspaceId }, scope: { ...scope, runId: otherRun } }, 'RUN_IDENTITY_MISMATCH'],
    ['claims of another workspace', { ...bound, run: { runId, workspaceId: otherWorkspace }, scope: { ...scope, workspaceId: otherWorkspace } }, 'WORKSPACE_IDENTITY_MISMATCH'],
    ['a different frozen scope', { ...bound, scope: { ...scope, definition: 'Synthetic space heaters' } }, 'SCOPE_IDENTITY_MISMATCH'],
    ['a different replayed claim set', { ...bound, claimsSha256: sha([workClaim]) }, 'CLAIMS_IDENTITY_MISMATCH'],
    ['located claims without their frozen output', inputFor(allClaims, null), 'LOCATED_METHOD_OUTPUT_REQUIRED'],
    ['a different frozen located output', inputFor(allClaims, locatedOutput('Which contexts of use are stated?')), 'LOCATED_METHOD_BINDING_MISMATCH'],
    ['a pointer outside the accepted I02 rows', inputFor([declared('I02', 9, 0, [claimSpan('DECLARATION', workText, 'to work')])]), 'LOCATED_OUTPUT_POINTER_NOT_ADMITTED'],
    ['a row bound to another record locator', inputFor([relocated]), 'LOCATED_SOURCE_RECORD_MISMATCH'],
    ['a claim that drops the row counterevidence', inputFor([counterevidenceDropped]), 'LOCATED_ROW_BINDING_MISMATCH'],
  ];
  for (const [label, input, code] of cases) assert.throws(() => buildAutomationI14EvidenceAdmission(input), rejects(code), label);

  // Same methodOutputId, altered body: only replay of the frozen located output catches it.
  const forged = { ...output, input: { ...output.input, question: 'Which contexts of use are stated?' } };
  assert.throws(() => buildAutomationI14EvidenceAdmission(inputFor(allClaims, forged)), (error: unknown) => error instanceof LocatedInsightValidationError);

  const { artifact } = buildAutomationI14EvidenceAdmission(bound);
  const demoted = { ...artifact, anchors: [], unassigned: [{ claimId: workClaim.claimId, sectionId: 'I02', reason: 'NO_SOURCE_STATED_USE_CONTEXT_FIELD' }, ...artifact.unassigned] };
  assert.throws(() => verifyAutomationI14EvidenceAdmission(demoted, bound), rejects('I14_EVIDENCE_ADMISSION_REPLAY_MISMATCH'));
});

test('validated candidates keep cited and counterevidence refs exactly, bind the admission and leave owner directions empty', () => {
  const input = inputFor(allClaims);
  const response = { aiCandidates: [
    candidate({ counterevidenceRefs: [parkClaim.claimId, usedClaim.claimId] }),
    candidate({ candidateType: 'OPPORTUNITY_DIRECTION', text: 'Explore a quieter variant for people who take a fan to work.' }),
  ] };
  const { artifact } = validateAutomationI14CandidateResponse(response, input);

  assert.deepEqual(artifact.aiCandidates, response.aiCandidates);
  assert.deepEqual(
    { runId: artifact.runId, workspaceId: artifact.workspaceId, scopeSha256: artifact.scopeSha256, admission: artifact.admission,
      ownerQuestion: artifact.ownerQuestion, ownerDirections: artifact.ownerDirections, validation: artifact.validation },
    { runId, workspaceId, scopeSha256,
      admission: { methodId: 'automation-i14-evidence-admission', methodVersion: '1.0.0',
        admissionSha256: createHash('sha256').update(buildAutomationI14EvidenceAdmission(input).bytes).digest('hex') },
      ownerQuestion: { state: 'UNSET', text: null }, ownerDirections: [],
      validation: { structural: 'SCHEMA_AND_REFERENCES_PASSED', semantic: 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED' } },
  );
  assert.ok(artifact.limitations.includes('EMPTY_COUNTEREVIDENCE_REFS_MEAN_NONE_SUPPLIED_NOT_NONE_EXISTS'));
});

test('candidate validation rejects owner fields, decision or reasoning fields, numbers, wrong type or status and ineligible refs', () => {
  const input = inputFor(allClaims);
  const schemaCases: readonly [string, unknown, string][] = [
    ['a rank field', { aiCandidates: [candidate({ rank: 1 })] }, '/aiCandidates/0 must NOT have additional properties'],
    ['a hidden reasoning field', { aiCandidates: [candidate({ reasoning: 'Step by step the model thought' })] }, '/aiCandidates/0 must NOT have additional properties'],
    ['a digit in candidate text', { aiCandidates: [candidate({ text: 'Fits about 3 office workers who take it to work.' })] }, '/aiCandidates/0/text must match pattern'],
    ['an owner-only status', { aiCandidates: [candidate({ candidateStatus: 'ACCEPTED' })] }, '/aiCandidates/0/candidateStatus must be equal to constant'],
    ['a type bound to another section', { aiCandidates: [candidate({ candidateType: 'STRATEGY_OPTION' })] }, '/aiCandidates/0/candidateType must be equal to one of the allowed values'],
  ];
  for (const [label, response, reason] of schemaCases)
    assert.throws(() => validateAutomationI14CandidateResponse(response, input),
      (error: unknown) => error instanceof AutomationI14ValidationError && error.message.startsWith('INVALID_I14_CANDIDATES:') && error.message.includes(reason), label);

  const referenceCases: readonly [string, unknown, string][] = [
    ['an owner direction supplied by the model', { aiCandidates: [candidate()], ownerDirections: ['Launch a work fan'] }, 'CANDIDATE_RESPONSE_FIELDS_INVALID'],
    ['a bare reported action cited as support', { aiCandidates: [candidate({ citedClaimRefs: [usedClaim.claimId] })] }, 'CITED_CLAIM_NOT_ADMITTED'],
    ['an unknown counterevidence claim', { aiCandidates: [candidate({ counterevidenceRefs: ['9'.repeat(64)] })] }, 'COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE'],
    ['one claim as both support and counterevidence', { aiCandidates: [candidate({ counterevidenceRefs: [workClaim.claimId] })] }, 'CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE'],
  ];
  for (const [label, response, code] of referenceCases) assert.throws(() => validateAutomationI14CandidateResponse(response, input), rejects(code), label);
});

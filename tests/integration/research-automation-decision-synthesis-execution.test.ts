import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AutomationDecisionSynthesisExecutions, type AutomationDecisionSynthesisConfiguration,
} from '../../src/modules/analysis/research-automation/decision-synthesis-execution.js';
import { AutomationI14SynthesisExecutions } from '../../src/modules/analysis/research-automation/i14-synthesis-execution.js';
import { AutomationSynthesisExecutionIntegrityError } from '../../src/modules/analysis/research-automation/synthesis-execution.js';
import { pausedI14Parent, syntheticI14Input, validI14Response, i14Now } from '../helpers/i14-execution-fixture.js';

const sections = ['M11', 'M12', 'I15'] as const;
function configuration(sectionId: typeof sections[number]): AutomationDecisionSynthesisConfiguration {
  return { contractVersion: '1.0.0', methodId: 'automation-decision-synthesis-configuration', sectionId,
    providerId: 'synthetic', modelId: 'synthetic-model', temperature: null, maxOutputTokens: 100,
    timeoutMs: 1000, maxResponseBytes: 65536 };
}
function source(sectionId: typeof sections[number]) { return { sectionId, evidence: { ...syntheticI14Input(), admissionVersion: '1.0.0' as const } }; }
function response(sectionId: typeof sections[number]) {
  return { aiCandidates: [{ ...validI14Response(syntheticI14Input()).aiCandidates[0],
    candidateType: sectionId === 'M11' ? 'HYPOTHESIS' : sectionId === 'M12' ? 'ACTION_OPTION' : 'STRATEGY_OPTION',
    counterevidenceRelations: [],
    ...(sectionId === 'M12' ? { prerequisites: ['Verify the reported work context before choosing an action.'] } : {}),
    ...(sectionId === 'I15' ? { conditions: ['Only if the owner confirms a compatible objective.'] } : {}),
  }] };
}

// Owning integration proof for section dispatch/retention; packet unit tests own
// candidate semantics. All ports are synthetic and never make network calls.
test('three decision sections retain separate exact inputs and replay after terminal parent without current AI configuration', async t => {
  const fixture = await pausedI14Parent({ reports: ['MARKET', 'INSIGHT'] });
  t.after(() => fixture.cleanup());
  let calls = 0;
  const executions = sections.map(sectionId => new AutomationDecisionSynthesisExecutions({ ...fixture,
    artifactStore: fixture.artifacts, now: i14Now, sectionId }));
  const outcomes = [];
  for (const [index, sectionId] of sections.entries()) {
    const owner = executions[index]!;
    const input = { ...source(sectionId), packetVersion: sectionId === 'M12' ? '1.0.0' as const : '1.1.0' as const };
    assert.deepEqual(await owner.execute({ parent: fixture.parent, source: input, ai: null }),
      { status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' });
    const result = await owner.execute({ parent: fixture.parent, source: input, ai: {
      configuration: configuration(sectionId),
      port: { async generateText(request) {
        calls += 1;
        const retained = fixture.db.prepare('SELECT input_sha256,prompt_sha256,configuration_sha256,state FROM analysis_research_automation_ai_executions WHERE section_id=?')
          .get(sectionId) as { input_sha256: string; prompt_sha256: string; configuration_sha256: string; state: string };
        assert.equal(retained.state, 'DISPATCHING');
        assert.equal(request.userText, (await fixture.artifacts.read(retained.input_sha256)).toString('utf8'));
        assert.equal(request.systemText, JSON.parse((await fixture.artifacts.read(retained.prompt_sha256)).toString('utf8')).systemText);
        assert.deepEqual(request.configuration, JSON.parse((await fixture.artifacts.read(retained.configuration_sha256)).toString('utf8')));
        assert.equal(JSON.parse(request.userText).sectionId, sectionId);
        assert.equal(JSON.parse(request.userText).methodVersion, input.packetVersion);
        const prompt = JSON.parse((await fixture.artifacts.read(retained.prompt_sha256)).toString('utf8'));
        assert.equal(prompt.promptVersion, input.packetVersion === '1.1.0' ? '1.2.0' : '1.0.0');
        assert.equal(prompt.inputContract.methodVersion, input.packetVersion);
        return { text: JSON.stringify(response(sectionId)) };
      } },
    } });
    assert.equal(result.status, 'VALID');
    if (result.status !== 'VALID') throw new Error('Expected retained synthetic candidates');
    assert.equal(result.candidates.artifact.sectionId, sectionId);
    assert.equal(result.candidates.artifact.validation.semantic, 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED');
    outcomes.push(result);
  }
  assert.equal(calls, 3);
  const rows = fixture.db.prepare('SELECT * FROM analysis_research_automation_ai_executions ORDER BY section_id').all();
  assert.equal(rows.length, 3);
  fixture.release();
  await fixture.reportPromise;
  fixture.db.pragma('query_only = ON');
  for (const [index, sectionId] of sections.entries()) {
    const changedCurrentVersion = { ...source(sectionId), packetVersion: '1.1.0' as const, evidence: { ...source(sectionId).evidence, admissionVersion: '1.1.0' as const } };
    const retry = await executions[index]!.execute({ parent: fixture.parent, source: changedCurrentVersion, ai: null });
    assert.equal(retry.status, 'VALID');
    if (retry.status !== 'VALID') throw new Error('Expected exact retry');
    assert.equal(retry.dispatched, false);
    assert.deepEqual(retry.candidates.bytes, outcomes[index]!.candidates.bytes);
    assert.deepEqual(await executions[index]!.read(fixture.parent, changedCurrentVersion), retry);
  }
  assert.equal(calls, 3);
  assert.deepEqual(fixture.db.prepare('SELECT * FROM analysis_research_automation_ai_executions ORDER BY section_id').all(), rows);
});

test('wrong-section configuration cannot dispatch and a stored invalid candidate response cannot be retried into valid', async t => {
  const fixture = await pausedI14Parent({ reports: ['MARKET', 'INSIGHT'] });
  t.after(() => fixture.cleanup());
  let calls = 0;
  for (const sectionId of sections) {
    const owner = new AutomationDecisionSynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now, sectionId });
    const port = { async generateText() { calls += 1; return { text: JSON.stringify({ aiCandidates: [{ candidateType: 'OWNER_DECISION' }] }) }; } };
    await assert.rejects(owner.execute({ parent: fixture.parent, source: source(sectionId), ai: { port,
      configuration: configuration(sectionId === 'I15' ? 'M11' : 'I15') } }), /INVALID_SYNTHESIS_CONFIGURATION/);
    const outcome = await owner.execute({ parent: fixture.parent, source: source(sectionId), ai: { port, configuration: configuration(sectionId) } });
    assert.equal(outcome.status, 'INVALID');
    if (outcome.status !== 'INVALID') throw new Error('Expected retained invalid verdict');
    assert.equal(outcome.validationCode, 'CANDIDATE_TYPE_SECTION_MISMATCH');
    assert.deepEqual(await owner.execute({ parent: fixture.parent, source: source(sectionId), ai: null }), { ...outcome, dispatched: false });
  }
  assert.equal(calls, 3);
  assert.equal((fixture.db.prepare('SELECT count(*) n FROM analysis_research_automation_ai_executions WHERE candidates_sha256 IS NOT NULL').get() as { n: bigint }).n, 0n);
});

// U-07/U-16: the new version guards reject a model response, and a rejection must be retained as an INVALID verdict
// instead of escaping the adapter as a dispatch failure. All ports are synthetic.
// U-07/U-16: the version guards reject a model response (the validator keeps its precise guard code, proved in the
// packet unit test), and the retained ledger stores the stable generic code for each rejection. A rejection must be
// retained and replayed as INVALID instead of escaping the adapter as a dispatch failure. Ports are synthetic.
test('new-version proposal rejections are stored and replayed as INVALID without redispatch', async t => {
  const words = ['Alpha', 'Beta', 'Gamma', 'Delta'];
  // The actual new service combination: packet 1.2.0 with the current I14 admission version 1.1.0.
  const versionedSource = (sectionId: typeof sections[number]) => ({ sectionId, packetVersion: '1.2.0' as const,
    evidence: { ...syntheticI14Input(), admissionVersion: '1.1.0' as const } });
  const proposal = (sectionId: typeof sections[number], index: number, overrides: Record<string, unknown> = {}) => ({
    ...response(sectionId).aiCandidates[0], text: `Retained observation reviewed for ${words[index]}`,
    immediateTask: `Owner reviews the retained observation for ${words[index]}`,
    proposedOwner: 'Owner to confirm', proposedDeadline: 'Within two weeks', ...overrides });
  // Each case owns its synthetic parent, so one section identity can never be reused by a later case and the
  // no-redispatch assertions stay exact. Owning ports are synthetic and make no network call.
  const cases = [
    // Positive control: a complete candidate must still be accepted, retained and replayed as VALID, so the
    // new version guards cannot pass by routing every response to rejection.
    { sectionId: 'M12' as const, expected: 'VALID' as const,
      aiCandidates: [proposal('M12', 0)] },
    // The guard code for each rejection stays distinct; the stored verdict code is the ledger-supported one.
    { sectionId: 'M11' as const, expected: 'INVALID' as const, code: 'INVALID_DECISION_CANDIDATES',
      aiCandidates: [(() => { const { immediateTask: _omitted, ...rest } = proposal('M11', 0) as Record<string, unknown>; return rest; })()] },
    { sectionId: 'M12' as const, expected: 'INVALID' as const, code: 'INVALID_DECISION_CANDIDATES',
      aiCandidates: [0, 1, 2, 3].map(index => proposal('M12', index)) },
    { sectionId: 'I15' as const, expected: 'INVALID' as const, code: 'INVALID_DECISION_CANDIDATES',
      aiCandidates: [proposal('I15', 0, { immediateTask: 'Owner reviews whether to mua thử one item' })] },
  ];
  let calls = 0;
  for (const { sectionId, expected, aiCandidates, ...rest } of cases) {
    const code = (rest as { code?: string }).code;
    const fixture = await pausedI14Parent({ reports: ['MARKET', 'INSIGHT'] });
    try {
      const owner = new AutomationDecisionSynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now, sectionId });
      const port = { async generateText() { calls += 1; return { text: JSON.stringify({ aiCandidates }) }; } };
      const outcome = await owner.execute({ parent: fixture.parent, source: versionedSource(sectionId), ai: { port, configuration: configuration(sectionId) } });
      assert.equal(outcome.status, expected, `${sectionId} ${code ?? 'complete candidate'}: ${JSON.stringify(outcome)}`);
      const replay = await owner.execute({ parent: fixture.parent, source: versionedSource(sectionId), ai: null });
      assert.equal(replay.status, expected, 'a retained verdict replays');
      assert.equal(replay.dispatched, false, 'a retained verdict is never redispatched');
      if (outcome.status === 'VALID' && replay.status === 'VALID') {
        assert.deepEqual(replay.candidates.bytes, outcome.candidates.bytes);
        assert.deepEqual(await owner.read(fixture.parent, versionedSource(sectionId)), replay);
      } else {
        if (outcome.status !== 'INVALID' || replay.status !== 'INVALID') throw new Error('Expected retained invalid verdicts');
        assert.equal(outcome.validationCode, code);
        assert.deepEqual(replay, { ...outcome, dispatched: false });
      }
    } finally { await fixture.cleanup(); }
  }
  assert.equal(calls, 4, 'a retained verdict is never redispatched');
});

test('I14 recovery cannot settle an active decision dispatch, and retained candidate corruption fails replay', async t => {
  const fixture = await pausedI14Parent({ reports: ['MARKET', 'INSIGHT'] });
  t.after(() => fixture.cleanup());
  const owner = new AutomationDecisionSynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now, sectionId: 'M11' });
  const i14 = new AutomationI14SynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now });
  let calls = 0;
  const outcome = await owner.execute({ parent: fixture.parent, source: source('M11'), ai: {
    configuration: configuration('M11'), port: { async generateText() {
      calls += 1;
      assert.throws(() => i14.recoverInterruptedDispatches(), /ACTIVE_DISPATCH_IN_PROCESS/);
      return { text: JSON.stringify(response('M11')) };
    } },
  } });
  assert.equal(outcome.status, 'VALID');
  if (outcome.status !== 'VALID') throw new Error('Expected valid synthetic response');
  fixture.db.prepare("UPDATE artifact_manifests SET retention_status='held' WHERE sha256=?").run(outcome.candidates.sha256);
  await assert.rejects(owner.read(fixture.parent, source('M11')), AutomationSynthesisExecutionIntegrityError);
  assert.equal(calls, 1);
});

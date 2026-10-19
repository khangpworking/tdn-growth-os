import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { AutomationMetricMethodBridge } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationIntegrityError } from '../../src/modules/analysis/research-automation/model.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { relevanceHarness, relevanceNow, type RelevanceMainFixture } from '../helpers/capture-relevance-fixture.js';

const original = JSON.parse(await fs.readFile(new URL('../fixtures/capture-relevance-retained-v3.json', import.meta.url), 'utf8')) as RelevanceMainFixture;
const oldDefinition = JSON.parse(await fs.readFile(new URL('../fixtures/capture-relevance-old-definition-v3.json', import.meta.url), 'utf8')) as { revision: string; variants: RelevanceMainFixture[] };
for (const prior of [original, ...oldDefinition.variants]) for (const operation of ['execute', 'verify'] as const) test(`${operation} rejects drifted retained capture rows before classifier or intake, without changing bytes (${prior.revision}, ${prior.input.start.keyword})`, async t => {
  // Historical packages come from real old code; no hash or membership has been edited.
  if (prior !== original) {
    assert.equal(oldDefinition.revision, 'f6430117690aecffada151c73a3429e74bf12e92');
    assert.equal(prior.revision, oldDefinition.revision);
    assert.equal(prior.method.capture!.rowPolicyVersion, 'automation-metric-capture-v3');
    assert.ok(prior.method.capture!.relevance!.decisions.every(d => d.label === 'UNSURE'));
    assert.equal(prior.method.capture!.excludedRows!.length, 2);
    assert.equal(prior.method.result.input.records.length, 40);
  }
  const f = await relevanceHarness(t, prior);
  const before = await f.packages.readVerified(prior.method.sourcePackage.packageId);
  const supplied = canonicalJson(prior);
  const databaseBefore = f.db.prepare('SELECT total_changes() n').get();
  const artifactsBefore = await Promise.all(prior.artifacts.map(a => f.artifacts.read(String(a.metadata.sha256))));
  let classifierCalls = 0;
  const intake = t.mock.method(SourcePackageService.prototype, 'intake', async () => {
    assert.fail('drift rejection must happen before source-package intake');
  });
  const bridge = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: f.workspaces, now: relevanceNow,
    captureRelevance: { configuration: captureRelevanceConfiguration('synthetic-lumo-model'), classifier: { async classify() {
      classifierCalls++; assert.fail('retained drift must never trigger classification');
    } } },
  });
  await assert.rejects(operation === 'execute' ? bridge.execute(prior.input) : bridge.verify(prior.method, prior.input), {
    constructor: ResearchAutomationIntegrityError, message: 'Capture rows differ from the frozen row policy.',
  });
  assert.equal(classifierCalls, 0);
  assert.equal(intake.mock.callCount(), 0);
  const after = await f.packages.readVerified(prior.method.sourcePackage.packageId);
  assert.deepEqual(after, before, 'retained metadata, membership and every file byte stay unchanged');
  assert.equal(canonicalJson(prior), supplied, 'supplied input and snapshot stay unchanged');
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), databaseBefore);
  assert.deepEqual(await Promise.all(prior.artifacts.map(a => f.artifacts.read(String(a.metadata.sha256)))), artifactsBefore, 'all original artifacts remain byte identical');
});

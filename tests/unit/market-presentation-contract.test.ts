import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import test from 'node:test';
import revision from '../../contracts/analysis/automation-market-presentation-revision.schema.json' with { type: 'json' };
import method from '../../contracts/analysis/automation-market-presentation-method.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;

test('Market presentation revision cannot change source membership or require reader approval', () => {
  const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
  const validate = ajv.compile(revision);
  const input = { contractVersion: 'automation-market-presentation-revision-v1', requestKey: '11111111-1111-4111-8111-111111111111',
    previousPairId: 'a'.repeat(64), sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  assert.ok(validate(input));
  assert.ok(validate({ ...input, unitSpecIntakeSha256: 'b'.repeat(64) }));
  for (const bad of [
    { ...input, sources: { ...input.sources, metric: { decision: 'SKIP' } } },
    { ...input, sources: { ...input.sources, nativeReview: { decision: 'USE_PACKAGE', packageId: input.requestKey } } },
    { ...input, unitSpecIntakeSha256: 'invalid' },
    { ...input, approvedReaderRevision: input.requestKey },
    { ...input, previousPairId: null },
  ]) assert.equal(validate(bad), false);
  // Pinned original bytes: works in shallow hosted checkouts without Git history.
  const bytes = fs.readFileSync(new URL('../../contracts/analysis/automation-report-revision.schema.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'ec52e33110e752e95093cd6630a56644d7883de42a85b2295cf6358e9a0d809a');
});

test('retained Market method has a closed versioned boundary with explicit absent inputs', () => {
  const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
  for (const path of ['analysis/default-market-peers', 'api/research-automation-api', 'analysis/reader-report-input',
    'api/research-automation-reader-report-api', 'analysis/metric-scope-input', 'analysis/metric-scope-output']) {
    ajv.addSchema(JSON.parse(fs.readFileSync(new URL(`../../contracts/${path}.schema.json`, import.meta.url), 'utf8')));
  }
  const validate = ajv.compile(method);
  const input = { contractVersion: 'automation-market-presentation-method-v1', methodVersion: 'market-presentation-v1',
    binding: { workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222',
      previousPairId: 'a'.repeat(64), scopeSha256: 'b'.repeat(64), metric: null },
    input: { metric: null, rows: [], unitSpec: null }, findings: [], unitPrices: [], advertising: 'UNAVAILABLE_UNCONFIRMED_RETAINED_SEMANTICS' };
  assert.ok(validate(input), JSON.stringify(validate.errors));
  assert.equal(validate({ ...input, advertising: 'CONFIRMED' }), false);
  assert.equal(validate({ ...input, input: { metric: null, rows: [] } }), false);
  assert.equal(validate({ ...input, adSpend: 5 }), false);
  assert.equal(validate({ ...input, findings: [{ id: 'demand', statement: '5', scope: 'sample', sectionId: 'M03', pending: true, evidence: [] }] }), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import sourceSchema from '../../contracts/analysis/world-bank-intake-v1.schema.json' with { type: 'json' };
import apiSchema from '../../contracts/api/research-automation-macro-intake-api.schema.json' with { type: 'json' };
import { inspectWorldBankSource } from '../../src/modules/analysis/research-automation/world-bank-intake.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';
import { worldBankDescriptor, worldBankPrepareRequest, worldBankConfirmRequest } from '../../frontend/src/generated/report-validators.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
test('canonical and isolated browser validators agree on source projection; bindings stay required and old contracts are not used', () => {
  const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
  ajv.addSchema(sourceSchema); ajv.addSchema(apiSchema);
  const validate = ajv.getSchema(sourceSchema.$id)!;
  const f = worldBankFixture();
  const descriptor = { contractVersion: 'world-bank-intake-v1', requestKey: 'fixture', sourceLabel: 'Synthetic official indicator',
    acquiredAt: '2026-07-14T00:00:00Z', condition: 'MULTI_YEAR_SERIES', observationPath: 'macro/observations.json', metadataPath: 'macro/metadata.json',
    binding: { workspaceId: '00000000-0000-4000-8000-000000000001', runId: '00000000-0000-4000-8000-000000000002',
      startSha256: '1'.repeat(64), scopeSha256: '2'.repeat(64), sourceSetSha256: '3'.repeat(64) },
    projection: inspectWorldBankSource(f.observations, f.metadata, f.sourceUrl, f.metadataUrl) };
  assert.equal(validate(descriptor), true, JSON.stringify(validate.errors)); assert.equal(worldBankDescriptor(descriptor), true);
  for (const corrupt of [{ ...descriptor, condition: 'CALLER_ASSERTED_OFFICIAL_UNAVAILABLE' },
    { ...descriptor, binding: { ...descriptor.binding, sourceSetSha256: null } },
    { ...descriptor, projection: { ...descriptor.projection, rows: [{ ...descriptor.projection.rows[0], value: 0 }] } },
    { ...descriptor, salt: 'forbidden' }]) {
    assert.equal(validate(corrupt), false); assert.equal(worldBankDescriptor(corrupt), false);
  }
  assert.equal(worldBankPrepareRequest({ contractVersion: 'automation-world-bank-prepare-v1', requestKey: 'fixture', sourceLabel: 'Synthetic source',
    acquiredAt: descriptor.acquiredAt, sourceUrl: f.sourceUrl, metadataUrl: f.metadataUrl }), true);
  assert.equal(worldBankConfirmRequest({ contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'fixture',
    source: { packageId: descriptor.binding.runId, manifestArtifactSha256: '4'.repeat(64), packageContentSha256: '5'.repeat(64) } }), true);
});

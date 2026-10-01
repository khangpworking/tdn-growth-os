import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import type { MetricInputPreparationResult } from '../../contracts/analysis/metric-input-preparation-result.generated.js';
import { MetricPreparationReadinessService } from '../../src/modules/analysis/metric-preparation-readiness.js';
import type { MetricInputPreparationReader, VerifiedMetricInputPreparation } from '../../src/modules/analysis/metric-input-preparation-service.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

// Test-authoring gate: this is the single owner of pre-calculation readiness.
// A30 owns preparation persistence; A28/A29 own the later report-version view.
const digest = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const sha = (label: string): string => digest(`synthetic:${label}`);

function fixture(withLabels = true): { service: MetricPreparationReadinessService; preparationSha256: string } {
  const input = metricFixture();
  input.wideUnknownPolicy = 'exclude';
  if (!withLabels) for (const row of input.records) row.label = null;
  const preparationSha256 = sha(withLabels ? 'preparation-with-labels' : 'preparation-without-labels');
  const result: MetricInputPreparationResult = {
    contractVersion: '1.0.0',
    preparationSha256,
    request: {
      contractVersion: '1.0.0', workspaceId: '11111111-1111-4111-8111-111111111111',
      packageId: '22222222-2222-4222-8222-222222222222', packageManifestSha256: sha('package-manifest'),
      workbookPath: 'metric/workbook.xlsx', manifestPath: 'metric/manifest.json',
      labelsPath: withLabels ? 'metric/labels.json' : null,
    },
    requestSha256: sha('request'),
    workspace: { workspaceId: '11111111-1111-4111-8111-111111111111', state: 'ACTIVE', snapshotSha256: sha('workspace') },
    sourcePackage: {
      packageId: '22222222-2222-4222-8222-222222222222',
      manifestArtifactSha256: sha('package-manifest'), packageContentSha256: sha('package-content'),
    },
    selectedSources: {
      workbook: source('workbook', 'metric/workbook.xlsx', sha('workbook')),
      manifest: source('manifest', 'metric/manifest.json', sha('manifest')),
      labels: withLabels ? source('labels', 'metric/labels.json', sha('labels')) : null,
    },
    normalizedInput: {
      artifactSha256: sha('normalized-input'), valueSha256: sha('normalized-value'),
      sourceCount: input.sources.length, rowCount: input.records.length,
    },
    normalizationReceiptSha256: sha('receipt'),
  };
  const reader: MetricInputPreparationReader = {
    async readVerified(identity: string): Promise<VerifiedMetricInputPreparation> {
      assert.equal(identity, preparationSha256);
      return { result, input: structuredClone(input) };
    },
  };
  return { service: new MetricPreparationReadinessService(reader), preparationSha256 };
}

function source<Role extends 'workbook' | 'manifest' | 'labels'>(role: Role, logicalPath: string, sha256: string) {
  return {
    role, logicalPath, sha256, byteSize: 100, mediaType: role === 'workbook'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/json',
    evidenceFamily: 'synthetic-metric', representationRole: role === 'workbook' ? 'structured' as const : 'derived' as const,
    independence: 'non_independent' as const, providerProvenance: 'synthetic' as const,
    provenanceBasis: 'Synthetic readiness fixture only',
  };
}

test('classifies all 30 pre-calculation sections from one exact preparation and fails closed on drift', async () => {
  const catalogBytes = fs.readFileSync('docs/research/report-section-catalog-v1.json');
  const catalogSha256 = digest(catalogBytes);
  const state = fixture();
  const first = await state.service.evaluate(state.preparationSha256, catalogBytes, catalogSha256);
  const replay = await state.service.evaluate(state.preparationSha256, catalogBytes, catalogSha256);
  assert.deepEqual(replay, first);
  assert.deepEqual(first.summary, { totalSections: 30, readyToCalculate: 4, blocked: 26, invalid: 0 });
  assert.deepEqual(first.sections.filter(section => section.state === 'READY_TO_CALCULATE').map(section => section.sectionId), [
    'M02', 'M03', 'M04', 'M13',
  ]);
  const byInput = new Map(first.inputs.map(check => [check.inputId, check]));
  assert.equal(byInput.get('normalized-metric-rows')?.state, 'PRESENT');
  assert.equal(byInput.get('frozen-label-decisions')?.state, 'PRESENT');
  assert.equal(byInput.get('validated-metrics')?.state, 'ABSENT');
  assert.equal(byInput.get('optional-owner-declared-tablet-count')?.blocking, false);

  const withoutLabels = fixture(false);
  const blocked = await withoutLabels.service.evaluate(withoutLabels.preparationSha256, catalogBytes, catalogSha256);
  assert.equal(blocked.inputs.find(check => check.inputId === 'frozen-label-decisions')?.state, 'ABSENT');
  assert.equal(blocked.sections.find(section => section.sectionId === 'M03')?.state, 'BLOCKED');
  assert.equal(blocked.summary.readyToCalculate, 2);

  await assert.rejects(state.service.evaluate(state.preparationSha256, Buffer.concat([catalogBytes, Buffer.from('\n')]), catalogSha256), /digest/i);
  const changed = JSON.parse(catalogBytes.toString('utf8')) as { sections: Array<{ requiredInputs: string[] }> };
  changed.sections[0]!.requiredInputs.push('future-unregistered-input');
  const changedBytes = Buffer.from(JSON.stringify(changed));
  await assert.rejects(state.service.evaluate(state.preparationSha256, changedBytes, digest(changedBytes)), /Unknown catalog input ID/);
});

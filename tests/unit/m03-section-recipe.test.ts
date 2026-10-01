import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import type { MetricInputPreparationResult } from '../../contracts/analysis/metric-input-preparation-result.generated.js';
import { M03SectionRecipeService } from '../../src/modules/analysis/m03-section-recipe.js';
import { MetricPreparationReadinessService } from '../../src/modules/analysis/metric-preparation-readiness.js';
import type { MetricInputPreparationReader, VerifiedMetricInputPreparation } from '../../src/modules/analysis/metric-input-preparation-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

// Test-authoring gate: one behavior owner for the new A30 -> A31 -> A32 boundary.
// Arithmetic remains owned by metric-scope-calculator.test.ts.
const digest = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const sha = (label: string): string => digest(`synthetic:${label}`);

function fixture(withValidLabels = true) {
  const input = metricFixture();
  input.wideUnknownPolicy = 'exclude';
  input.records[0]!.revenue = {
    state: 'missing', value: null, precision: 'unknown',
    source: input.records[0]!.revenue.source, displayedValue: null,
  };
  if (!withValidLabels) input.records[0]!.label = null;
  const preparationSha256 = sha(withValidLabels ? 'a32-preparation' : 'a32-blocked-preparation');
  const normalizedValueSha256 = digest(canonicalJson(input));
  const result: MetricInputPreparationResult = {
    contractVersion: '1.0.0',
    preparationSha256,
    request: {
      contractVersion: '1.0.0', workspaceId: '11111111-1111-4111-8111-111111111111',
      packageId: '22222222-2222-4222-8222-222222222222', packageManifestSha256: sha('package-manifest'),
      workbookPath: 'metric/workbook.xlsx', manifestPath: 'metric/manifest.json', labelsPath: 'metric/labels.json',
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
      labels: source('labels', 'metric/labels.json', sha('labels')),
    },
    normalizedInput: {
      artifactSha256: sha('normalized-input'), valueSha256: normalizedValueSha256,
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
  return { input, preparationSha256, reader };
}

function source<Role extends 'workbook' | 'manifest' | 'labels'>(role: Role, logicalPath: string, sha256: string) {
  return {
    role, logicalPath, sha256, byteSize: 100, mediaType: role === 'workbook'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'application/json',
    evidenceFamily: 'synthetic-metric', representationRole: role === 'workbook' ? 'structured' as const : 'derived' as const,
    independence: 'non_independent' as const, providerProvenance: 'synthetic' as const,
    provenanceBasis: 'Synthetic A32 fixture only',
  };
}

test('materializes one deterministic M03 metric set only after exact readiness and preserves evidence semantics', async () => {
  const catalogBytes = fs.readFileSync('docs/research/report-section-catalog-v1.json');
  const catalogSha256 = digest(catalogBytes);
  const state = fixture();
  const readiness = await new MetricPreparationReadinessService(state.reader).evaluate(
    state.preparationSha256, catalogBytes, catalogSha256,
  );
  const request = {
    contractVersion: '1.0.0', sectionId: 'M03', recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
    preparationSha256: state.preparationSha256, catalogSha256, readinessSha256: readiness.readinessSha256,
  };
  const service = new M03SectionRecipeService(state.reader);
  const first = await service.calculate(request, catalogBytes);
  assert.deepEqual(await service.calculate(request, catalogBytes), first);
  assert.deepEqual(first.scopes.map(scope => scope.key), ['all', 'wide', 'core']);
  assert.deepEqual(first.scopes.map(scope => scope.recordIndices), [[0, 1, 2, 3, 4], [0, 1], [0, 1]]);
  assert.equal(first.scopes[0].revenue.missingCount, 1);
  assert.equal(first.scopes[0].revenue.observedCount, 4);
  assert.equal(first.scopes[0].revenue.value, '85');
  assert.equal(first.labelPolicy.unknownRetention, 'RETAIN_IN_ALL_EXCLUDE_FROM_WIDE');
  assert.deepEqual(first.comparisons.map(comparison => comparison.to), ['wide', 'core']);
  assert.equal(first.calculation.inputSha256, first.preparation.normalizedInputValueSha256);
  assert.match(first.metricSetSha256, /^[0-9a-f]{64}$/);

  await assert.rejects(service.calculate({ ...request, readinessSha256: sha('wrong-readiness') }, catalogBytes), /Readiness identity/);
  await assert.rejects(service.calculate({ ...request, arbitraryInstruction: 'invent growth' }, catalogBytes), /Invalid M03 recipe request/);

  const blocked = fixture(false);
  const blockedReadiness = await new MetricPreparationReadinessService(blocked.reader).evaluate(
    blocked.preparationSha256, catalogBytes, catalogSha256,
  );
  await assert.rejects(new M03SectionRecipeService(blocked.reader).calculate({
    ...request,
    preparationSha256: blocked.preparationSha256,
    readinessSha256: blockedReadiness.readinessSha256,
  }, catalogBytes), /not ready/);
});

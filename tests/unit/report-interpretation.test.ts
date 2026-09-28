import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildEvidenceBoundReportInterpretation } from '../../src/modules/analysis/report-interpretation.js';
import { buildReportSemanticContent } from '../../src/modules/analysis/report-semantic-content.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

// Test-authoring gate: this file is the single owner for the new trust boundary.
// It does not retest A1 arithmetic, A3 rendering or A4 publication.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture(): SourceBackedReportBundle {
  const input = { input: 'exact' };
  const inputBytes = canonicalBytes(input);
  const result = { rendererVersion: 'metric-draft-vi-v1', result: 'exact' };
  const resultBytes = canonicalBytes(result);
  const catalog = {
    catalog: 'exact',
    sections: [
      { sectionId: 'M03', title: 'Quy mô', methodId: 'fixture-method', methodVersion: '1.0.0' },
      { sectionId: 'M10', title: 'Dự báo', methodId: 'blocked-method', methodVersion: '1.0.0' },
    ],
  };
  const catalogBytes = canonicalBytes(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const metricResultSha256 = sha256(resultBytes);
  const claim = {
    claimId: 'm03_wide_revenue',
    sectionId: 'M03',
    claimType: 'FACT',
    evidenceState: 'DETERMINISTIC_NORMALIZED_OBSERVATION',
    approvalState: 'UNREVIEWED',
    statementKind: 'OBSERVED_REVENUE',
    scopeKey: 'wide',
    value: '125000000',
    unit: 'VND',
    metricPointer: '/totals/wide/revenueVnd',
    scopePointer: '/input/scope',
    membershipPointer: '/scope/wide/recordIndices',
    denominatorPointer: null,
    coveragePointer: '/coverage/wide',
    limitations: ['OBSERVED_SCOPE_ONLY'],
  };
  const packet = {
    packetId: digest('packet-id'),
    policyVersion: 'report-packet-a3a-v1',
    rendererVersion: 'report-packet-vi-v1',
    metricMethodVersion: 'metric-scope-v1',
    metricRounding: 'percent-half-even-2-v1',
    metricResultSha256,
    catalogSha256,
    catalog,
    claims: [claim],
    sections: [
      {
        sectionId: 'M03', deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
        sectionSha256: digest('section-m03'), claimIds: [claim.claimId], contextPointers: [], blockers: [],
      },
      {
        sectionId: 'M10', deliveryState: 'BLOCKED',
        sectionSha256: digest('section-m10'), claimIds: [], contextPointers: [], blockers: ['DAILY_SERIES_REQUIRED'],
      },
    ],
  } as never;
  const packetBytes = canonicalBytes(packet);
  const charts = {
    approvalState: 'UNREVIEWED',
    resultSha256: metricResultSha256,
    catalogSha256,
    computation: {
      inputSha256: digest('input'), methodVersion: 'metric-scope-v1', rounding: 'percent-half-even-2-v1',
      rendererVersion: 'metric-draft-vi-v1', profileId: 'fixture', labelCodebookVersion: 'fixture',
      wideUnknownPolicy: 'exclude',
    },
    points: [{ resultSha256: metricResultSha256, value: 'exact' }],
  } as never;
  const chartBytes = canonicalBytes(charts);
  const envelope = {
    contractVersion: 'source-backed-report-v1',
    request: { catalogSha256 } as never,
    workspace: {
      workspaceId: '11111111-1111-4111-8111-111111111111', state: 'ACTIVE',
      snapshotSha256: digest('workspace'), snapshot: {} as never,
    },
    sourcePackage: {
      packageId: '22222222-2222-4222-8222-222222222222',
      manifestArtifactSha256: digest('manifest'), packageContentSha256: digest('package-content'), manifest: {} as never,
    },
    selectedSources: [{ sha256: digest('source-one') }, { sha256: digest('source-two') }] as never,
    rawByteMappings: [],
    artifacts: {
      workspaceSnapshotSha256: digest('workspace'), sourcePackageManifestSha256: digest('manifest'),
      normalizedInputSha256: sha256(inputBytes), receiptSha256: digest('receipt'), metricResultSha256,
      catalogSha256, packetSha256: sha256(packetBytes), chartSha256: sha256(chartBytes),
      reportSha256: digest('report'),
    },
    limitations: [],
  } as never;
  const files = new Map<string, Buffer>([
    ['packet.json', packetBytes],
    ['normalized-input.json', inputBytes],
    ['metric-result.json', resultBytes],
    ['charts.json', chartBytes],
    ['section-catalog.json', catalogBytes],
    ['report.md', Buffer.from('renderer')],
  ]);
  return {
    envelope,
    envelopeBytes: canonicalBytes(envelope),
    input: input as never,
    result: result as never,
    receipt: {} as never,
    packet,
    charts,
    files,
  };
}

const configuration = {
  providerId: 'fake-provider',
  modelId: 'fake-model',
  promptId: 'report-interpretation',
  promptVersion: 1,
  promptText: 'bounded fixture prompt',
  outputSchemaVersion: '1.0.0' as const,
};

const output = {
  items: [{
    sectionId: 'M03',
    kind: 'INTERPRETATION',
    conclusion: 'Doanh thu quan sát tập trung trong phạm vi đã phân loại.',
    evidenceLogic: 'Kết luận chỉ nối phép tổng hợp đã kiểm chứng với phạm vi wide.',
    supportingClaimIds: ['m03_wide_revenue'],
    assumptions: [],
    limitations: ['Không suy rộng ra toàn thị trường.'],
  }],
};

test('builds stable meaning with application-resolved citations and separate telemetry', () => {
  const bundle = fixture();
  const semantic = buildReportSemanticContent(bundle).content;
  const request = {
    contractVersion: '1.0.0', semanticVersionId: semantic.semanticVersionId,
    packetId: bundle.packet.packetId, sectionIds: ['M03'],
  };
  const first = buildEvidenceBoundReportInterpretation({
    request, output, bundle, configuration,
    telemetry: { providerRequestId: 'fake-one', inputTokenCount: 10, outputTokenCount: 20, latencyMs: 30 },
    now: () => new Date('2026-09-28T01:02:03.000Z'),
    createId: () => '33333333-3333-4333-8333-333333333333',
  });
  const replayedMeaning = buildEvidenceBoundReportInterpretation({
    request, output, bundle, configuration,
    telemetry: { providerRequestId: 'fake-two', inputTokenCount: 99, outputTokenCount: 88, latencyMs: 77 },
    now: () => new Date('2026-09-29T01:02:03.000Z'),
    createId: () => '44444444-4444-4444-8444-444444444444',
  });

  assert.equal(first.interpretationContentSha256, replayedMeaning.interpretationContentSha256);
  assert.notDeepEqual(first.artifactBytes, replayedMeaning.artifactBytes);
  assert.equal(first.artifact.source.semanticVersionId, semantic.semanticVersionId);
  assert.equal(first.artifact.items[0]?.citations[0]?.value, '125000000');
  assert.equal(first.artifact.items[0]?.citations[0]?.metricPointer, '/totals/wide/revenueVnd');
  assert.ok(!('chainOfThought' in first.artifact));
  assert.equal(first.artifactBytes.at(-1), 10);
});

test('fails closed for unsupported sections, citations, numbers, authority language and incomplete coverage', () => {
  const bundle = fixture();
  const semantic = buildReportSemanticContent(bundle).content;
  const request = {
    contractVersion: '1.0.0', semanticVersionId: semantic.semanticVersionId,
    packetId: bundle.packet.packetId, sectionIds: ['M03'],
  };
  const build = (candidateRequest: unknown, candidateOutput: unknown) => buildEvidenceBoundReportInterpretation({
    request: candidateRequest, output: candidateOutput, bundle, configuration,
    now: () => new Date('2026-09-28T01:02:03.000Z'),
    createId: () => '33333333-3333-4333-8333-333333333333',
  });

  assert.throws(() => build({ ...request, sectionIds: ['M10'] }, {
    ...output, items: [{ ...output.items[0], sectionId: 'M10' }],
  }), /SECTION_NOT_ELIGIBLE/);
  assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], supportingClaimIds: ['invented'] }],
  }), /CLAIM_NOT_IN_SECTION/);
  assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], conclusion: 'Doanh thu là 125 triệu.' }],
  }), /INVALID_CONTRACT|NUMERIC_LITERAL_FORBIDDEN/);
  assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], conclusion: 'Nên phê duyệt cơ hội này.' }],
  }), /DECISION_LANGUAGE_FORBIDDEN/);
  assert.throws(() => build({ ...request, sectionIds: ['M03', 'M04'] }, output), /SECTION_NOT_ELIGIBLE|SECTION_NOT_FOUND/);
  assert.throws(() => build({ ...request, semanticVersionId: digest('wrong') }, output), /SEMANTIC_VERSION_MISMATCH/);

  const duplicate = { items: [output.items[0], output.items[0]] };
  assert.throws(() => build(request, duplicate), /DUPLICATE_ITEM/);
});

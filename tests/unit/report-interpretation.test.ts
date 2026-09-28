import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { buildEvidenceBoundReportInterpretation } from '../../src/modules/analysis/report-interpretation.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';
import { buildReportSemanticContent } from '../../src/modules/analysis/report-semantic-content.js';
import type { SourceBackedReportBundle } from '../../src/modules/analysis/source-backed-report.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

// Test-authoring gate: this file is the single owner for the new trust boundary.
// It does not retest A1 arithmetic, A3 rendering or A4 publication.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function fixture(): SourceBackedReportBundle {
  const input = metricFixture();
  const inputBytes = canonicalBytes(input);
  const result = calculateMetricScopes(input);
  const resultBytes = canonicalBytes(result);
  const catalogBytes = canonicalBytes(catalog);
  const catalogSha256 = sha256(catalogBytes);
  const metricResultSha256 = sha256(resultBytes);
  const packet = createResearchReportPacket(resultBytes, metricResultSha256, catalogBytes, catalogSha256).packet;
  const packetBytes = canonicalBytes(packet);
  const charts = buildResearchReportChartData(resultBytes, metricResultSha256, catalogBytes, catalogSha256);
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
    result,
    receipt: {} as never,
    packet,
    charts,
    files,
  };
}

function withForgedPacketId(source: SourceBackedReportBundle): SourceBackedReportBundle {
  const packet = { ...source.packet, packetId: digest('forged-packet-id') };
  const packetBytes = canonicalBytes(packet);
  const envelope = {
    ...source.envelope,
    artifacts: { ...source.envelope.artifacts, packetSha256: sha256(packetBytes) },
  };
  const files = new Map(source.files);
  files.set('packet.json', packetBytes);
  return { ...source, packet, envelope, envelopeBytes: canonicalBytes(envelope), files };
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
    supportingClaimIds: ['M03:wide:revenue'],
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
  assert.equal(first.artifact.items[0]?.citations[0]?.value, '175');
  assert.equal(first.artifact.items[0]?.citations[0]?.metricPointer, '/scopes/1/revenue/value');
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
  for (const text of [
    'Reject this candidate.',
    'Instruct the team to launch.',
    'Proceed with investment and funding.',
  ]) assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], conclusion: text }],
  }), /DECISION_LANGUAGE_FORBIDDEN/);
  for (const text of [
    'This observation is safe and compliant.',
    'This is medical and legal evidence.',
    'The observed pattern causes adoption.',
  ]) assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], conclusion: text }],
  }), /AUTHORITY_LANGUAGE_FORBIDDEN/);
  for (const text of [
    'The source confirms raw-workbook.xlsx.',
    'Provider-verified evidence supports the interpretation.',
    'See https://nguon.example for confirmation.',
  ]) assert.throws(() => build(request, {
    ...output, items: [{ ...output.items[0], conclusion: text }],
  }), /PROVENANCE_LANGUAGE_FORBIDDEN/);
  assert.throws(() => build({ ...request, sectionIds: ['M03', 'M04'] }, output), /SECTION_NOT_ELIGIBLE|SECTION_NOT_FOUND/);
  assert.throws(() => build({ ...request, semanticVersionId: digest('wrong') }, output), /SEMANTIC_VERSION_MISMATCH/);

  const duplicate = { items: [output.items[0], output.items[0]] };
  assert.throws(() => build(request, duplicate), /DUPLICATE_ITEM/);
});

test('requires explicit assumptions for hypotheses and preserves them as unapproved meaning', () => {
  const bundle = fixture();
  const semantic = buildReportSemanticContent(bundle).content;
  const request = {
    contractVersion: '1.0.0', semanticVersionId: semantic.semanticVersionId,
    packetId: bundle.packet.packetId, sectionIds: ['M03'],
  };
  const hypothesis = {
    items: [{
      ...output.items[0],
      kind: 'HYPOTHESIS',
      conclusion: 'Phân bố quan sát có thể phản ánh sự tập trung trong phạm vi đã gắn nhãn.',
      evidenceLogic: 'Giả thuyết nối quan sát đã kiểm chứng với một cách diễn giải chưa được xác nhận.',
      assumptions: ['Giả định tập dữ liệu quan sát đại diện cho phạm vi đã khai báo.'],
    }],
  };
  const built = buildEvidenceBoundReportInterpretation({
    request, output: hypothesis, bundle, configuration,
    now: () => new Date('2026-09-28T01:02:03.000Z'),
    createId: () => '33333333-3333-4333-8333-333333333333',
  });
  assert.equal(built.artifact.items[0]?.kind, 'HYPOTHESIS');
  assert.deepEqual(built.artifact.items[0]?.assumptions, hypothesis.items[0].assumptions);
  assert.throws(() => buildEvidenceBoundReportInterpretation({
    request,
    output: { items: [{ ...hypothesis.items[0], assumptions: [] }] },
    bundle,
    configuration,
  }), /INVALID_CONTRACT/);
});

test('rejects a packet that matches its envelope bytes but cannot be reproduced by A3', () => {
  const bundle = withForgedPacketId(fixture());
  const semantic = buildReportSemanticContent(bundle).content;
  const request = {
    contractVersion: '1.0.0', semanticVersionId: semantic.semanticVersionId,
    packetId: bundle.packet.packetId, sectionIds: ['M03'],
  };
  assert.throws(() => buildEvidenceBoundReportInterpretation({
    request, output, bundle, configuration,
  }), /A3_PACKET_REPLAY_MISMATCH/);
});

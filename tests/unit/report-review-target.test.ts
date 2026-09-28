import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { ReportInterpretationArtifact } from '../../contracts/analysis/report-interpretation-artifact.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  buildReportReviewTarget,
  ReportReviewTargetIntegrityError,
} from '../../src/modules/analysis/report-review-target.js';
import type { VerifiedReportInterpretation } from '../../src/modules/analysis/report-interpretation-ledger.js';
import type { VerifiedReportInterpretationSource } from '../../src/modules/analysis/report-version-service.js';

// Test-authoring gate: this file owns only the new exact-composition boundary.
// Report replay, interpretation replay and their persistence remain owned by A10/A13 tests.
const sha256 = (value: Uint8Array): string => createHash('sha256').update(value).digest('hex');
const digest = (label: string): string => sha256(Buffer.from(label));
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

const reportId = '11111111-1111-4111-8111-111111111111';
const versionId = '22222222-2222-4222-8222-222222222222';
const interpretationId = '33333333-3333-4333-8333-333333333333';

function fixture(options: {
  readonly interpretationId?: string;
  readonly conclusion?: string;
  readonly forgedClaimId?: string;
  readonly forgedReportVersionId?: string;
  readonly renderedReportSha256?: string;
} = {}): {
  readonly source: VerifiedReportInterpretationSource;
  readonly interpretation: VerifiedReportInterpretation;
} {
  const claim = {
    claimId: 'M03:wide:revenue', sectionId: 'M03', claimType: 'FACT',
    evidenceState: 'DETERMINISTIC_NORMALIZED_OBSERVATION', approvalState: 'UNREVIEWED',
    statementKind: 'OBSERVED_REVENUE', scopeKey: 'wide', value: '175', unit: 'VND',
    metricPointer: '/scopes/1/revenue/value', scopePointer: '/input/scope',
    membershipPointer: '/scopes/1/membership', denominatorPointer: null, coveragePointer: null,
    limitations: ['Observed scope only.'],
  } as const;
  const packet = {
    packetId: digest('packet'), policyVersion: 'report-packet-a3a-v1',
    metricMethodVersion: 'metric-scope-v1', metricRounding: 'percent-half-even-2-v1',
    catalogSha256: digest('catalog'), claims: [claim],
    sections: [{
      sectionId: 'M03', sectionSha256: digest('section-M03'),
      deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT', claimIds: [claim.claimId],
    }],
  } as const;
  const packetSha256 = digest('packet-bytes');
  const claimsSha256 = sha256(Buffer.from(canonicalJson(packet.claims), 'utf8'));
  const source = {
    record: {
      contractVersion: '1.0.0', reportId, reportKey: 'calcium-market', versionId, version: 1,
      previousSemanticVersionId: null, semanticVersionId: digest('semantic'), requestSha256: digest('request'),
      workspaceId: '44444444-4444-4444-8444-444444444444', workspaceSnapshotSha256: digest('workspace'),
      sourcePackageId: '55555555-5555-4555-8555-555555555555',
      sourcePackageManifestSha256: digest('manifest'), packageContentSha256: digest('package'),
      evidenceEnvelopeSha256: digest('envelope'), semanticContentSha256: digest('semantic-content'),
      reviewStateSha256: digest('review-state'), interpretationState: 'NONE', reviewState: 'UNREVIEWED',
      createdAt: '2026-09-28T01:00:00.000Z', artifacts: [{
        fileName: 'report.html', sha256: options.renderedReportSha256 ?? digest('report-html'),
        mediaType: 'text/html; charset=utf-8', byteSize: 2048,
      }],
      selectedSources: [
        { ordinal: 0, role: 'workbook', logicalPath: 'metric.xlsx', sha256: digest('source-z') },
        { ordinal: 1, role: 'manifest', logicalPath: 'manifest.json', sha256: digest('source-a') },
      ],
    },
    bundle: {
      input: { scope: {
        key: 'canxi', platform: 'shopee', selection: 'ON', start: '2024-08-10', end: '2026-08-10',
        periodBasis: 'Provider-filtered reporting period.', acquiredAt: '2026-08-14T00:00:00.000Z',
      } },
      packet,
      envelope: { artifacts: { packetSha256, metricResultSha256: digest('metric-result') } },
    },
  } as unknown as VerifiedReportInterpretationSource;
  const selectedInterpretationId = options.interpretationId ?? interpretationId;
  const artifact = {
    contractVersion: '1.0.0', interpretationId: selectedInterpretationId,
    interpretationContentSha256: digest(options.conclusion ?? 'interpretation-content'),
    requestSha256: digest(`interpretation-request:${selectedInterpretationId}`),
    completedAt: '2026-09-28T02:00:00.000Z',
    source: { semanticVersionId: source.record.semanticVersionId, packetId: packet.packetId, packetSha256, claimsSha256 },
    generation: {
      providerId: 'fixture-provider', modelId: 'fixture-model', promptId: 'market-interpretation',
      promptVersion: 1, promptSha256: digest('prompt'), outputSchemaVersion: '1.0.0',
    },
    items: [{
      itemId: digest('item'), sectionId: 'M03', kind: 'INTERPRETATION',
      conclusion: options.conclusion ?? 'Observed revenue is concentrated in the declared scope.',
      evidenceLogic: 'Uses only the application-resolved claim.',
      supportingClaimIds: [options.forgedClaimId ?? claim.claimId],
      citations: [{
        claimId: claim.claimId, sectionId: 'M03', statementKind: claim.statementKind,
        scopeKey: claim.scopeKey, value: claim.value, unit: claim.unit, metricPointer: claim.metricPointer,
        scopePointer: claim.scopePointer, membershipPointer: claim.membershipPointer,
        denominatorPointer: null, coveragePointer: null, limitations: [...claim.limitations],
      }],
      assumptions: [], limitations: ['Does not establish the total market.'],
    }],
    limitations: ['Not approved.', 'Not source evidence.'],
  } satisfies ReportInterpretationArtifact;
  const artifactBytes = canonicalBytes(artifact);
  const interpretation = {
    record: {
      interpretationId: selectedInterpretationId, reportId, reportVersion: 1,
      reportVersionId: options.forgedReportVersionId ?? versionId, interpretationNumber: 1,
      interpretationContentSha256: artifact.interpretationContentSha256,
      requestSha256: artifact.requestSha256, artifactSha256: sha256(artifactBytes),
      artifactByteSize: artifactBytes.byteLength, promptArtifactSha256: digest('prompt-artifact'),
      promptByteSize: 10, sourceSemanticVersionId: artifact.source.semanticVersionId,
      sourcePacketId: artifact.source.packetId, sourcePacketSha256: artifact.source.packetSha256,
      sourceClaimsSha256: artifact.source.claimsSha256, providerId: artifact.generation.providerId,
      modelId: artifact.generation.modelId, promptId: artifact.generation.promptId,
      promptVersion: artifact.generation.promptVersion, outputSchemaVersion: '1.0.0',
      completedAt: artifact.completedAt, storedAt: '2026-09-28T02:00:01.000Z',
    },
    artifact,
    artifactBytes,
  } as VerifiedReportInterpretation;
  return { source, interpretation };
}

async function build(value = fixture()) {
  return buildReportReviewTarget({
    reportId,
    reportVersion: 1,
    interpretationId: value.interpretation.record.interpretationId,
    intendedUse: 'Internal market-opportunity review and decision support.',
    reports: { readInterpretationSource: async () => value.source },
    interpretations: { read: async () => value.interpretation },
  });
}

test('binds one exact report and interpretation into stable unreviewed bytes', async () => {
  const first = await build();
  const replay = await build();
  assert.deepEqual(replay.targetBytes, first.targetBytes);
  assert.equal(replay.target.reviewTargetId, first.target.reviewTargetId);
  assert.equal(first.target.reviewableContent.purpose, 'INTERNAL_REVIEW_ONLY');
  assert.deepEqual(first.target.reviewableContent.claimIds, ['M03:wide:revenue']);
  assert.deepEqual(first.target.approvalScope.selectedSources.map(item => item.ordinal), [0, 1]);
  assert.equal(first.targetBytes.at(-1), 10);

  const changed = await build(fixture({
    interpretationId: '66666666-6666-4666-8666-666666666666',
    conclusion: 'A separately generated interpretation is a different review target.',
  }));
  assert.notEqual(changed.target.reviewTargetId, first.target.reviewTargetId);
  const rerendered = await build(fixture({ renderedReportSha256: digest('report-html-rerendered') }));
  assert.notEqual(rerendered.target.reviewTargetId, first.target.reviewTargetId);
});

test('fails closed when exact report lineage or cited claim membership does not match', async () => {
  await assert.rejects(() => build(fixture({ forgedReportVersionId: '77777777-7777-4777-8777-777777777777' })), ReportReviewTargetIntegrityError);
  await assert.rejects(() => build(fixture({ forgedClaimId: 'M03:invented' })), ReportReviewTargetIntegrityError);
});

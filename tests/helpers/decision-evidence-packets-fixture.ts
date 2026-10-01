import { createHash } from 'node:crypto';
import type { DecisionEvidencePackets } from '../../contracts/analysis/decision-evidence-packets.generated.js';
import type { VersionedReportPacket } from '../../contracts/analysis/versioned-report-packet.generated.js';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

type Input = DecisionEvidencePackets['input'];
const sha = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`);
const unset = (): Input['question'] => ({ state: 'UNSET', text: null });

/** Owner declarations are synthetic. Optional packet/digest binds integration fixtures to their actual report. */
export function decisionEvidencePacketsFixture(packet?: VersionedReportPacket, metricResultSha256?: string): Input {
  if (packet === undefined) {
    const resultBytes = bytesOf(calculateMetricScopes(metricFixture()));
    const catalogBytes = bytesOf(catalog);
    packet = createResearchReportPacket(resultBytes, sha(resultBytes), catalogBytes, sha(catalogBytes)).packet;
  }
  const digest = metricResultSha256 ?? packet.metricResultSha256;
  const constraints = () => ({ cost: unset(), capability: unset(), time: unset(), risk: unset() });
  return {
    contractVersion: '1.0.0', synthesisProfileSha256: '5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a',
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    question: unset(), constraints: { ...constraints(), accountableRole: unset(), criteria: unset(), reviewTrigger: unset() },
    claims: packet.claims.map((payload, index) => ({
      claimKey: `${payload.claimId}@${digest}`, reference: { fileName: 'metric-result.json', sha256: digest, claimPointer: `/claims/${index}` },
      payload: structuredClone(payload), reviewDeclaration: { state: 'UNREVIEWED', reason: null }, counterclaimKeys: [],
    })),
    questionClaimKeys: [], ownerHypotheses: [], ownerDirections: [], ownerOptions: [],
  };
}

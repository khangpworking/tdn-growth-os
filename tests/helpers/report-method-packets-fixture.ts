import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ReportMethodPacketsInput } from '../../contracts/analysis/report-method-packets-input.generated.js';
import type { VersionedReportPacket } from '../../contracts/analysis/versioned-report-packet.generated.js';
import type { VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { boundedAnalysisGatesFixture } from './bounded-analysis-gates-fixture.js';
import { decisionEvidencePacketsFixture } from './decision-evidence-packets-fixture.js';

type Input = ReportMethodPacketsInput;
type GateInput = NonNullable<Input['gates']>;

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const GATE_SOURCE_PATH = 'method-packets/gate-source.json';
const DESCRIPTOR_PATH = 'method-packets/input.json';
const SOURCE_DRIFT_PATH = 'method-packets/input-source-drift.json';
const CLAIM_DRIFT_PATH = 'method-packets/input-claim-drift.json';
const SEMANTIC_INVALID_PATH = 'method-packets/input-semantic-invalid.json';
const ADVANCED_PROFILE_PATH = 'method-packets/advanced-profile.md';
const SYNTHESIS_PROFILE_PATH = 'method-packets/synthesis-ai-profile.md';
const ADOPTION_PATH = 'method-packets/adoption.md';

function stripSourceReferences(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripSourceReferences);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'source' && key !== 'protocolRef' && key !== 'identityEvidence')
    .map(([key, child]) => [key, stripSourceReferences(child)]));
}

function patchSourceReferences(value: unknown, sourceSha256: string): unknown {
  if (Array.isArray(value)) return value.map(child => patchSourceReferences(child, sourceSha256));
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    key === 'source' && child !== null && typeof child === 'object'
      ? { ...(child as Record<string, unknown>), logicalPath: GATE_SOURCE_PATH, sha256: sourceSha256 }
      : patchSourceReferences(child, sourceSha256),
  ]));
}

function file(
  path: string,
  bytes: Buffer,
  evidenceFamily: string,
  mediaType = 'application/json',
): VerifiedSourcePackageFile {
  return {
    path, bytes, sha256: digest(bytes), byteSize: bytes.length, mediaType, evidenceFamily,
    representationRole: 'structured', independence: 'non_independent', providerProvenance: 'synthetic',
    provenanceBasis: 'Synthetic fixture declarations; adopted method bytes are retained exactly',
  };
}

/** Synthetic package-bound method inputs. Claims bind exact metric-result bytes. */
export function reportMethodPacketsFixture(packet?: VersionedReportPacket, metricResultSha256?: string, includeSemanticInvalid = false): {
  logicalPath: string;
  sourceDriftPath: string;
  claimDriftPath: string;
  semanticInvalidPath: string;
  gateSourcePath: string;
  descriptor: Input;
  files: VerifiedSourcePackageFile[];
} {
  const unpatchedGates = boundedAnalysisGatesFixture();
  const gateSourceBytes = json(stripSourceReferences(unpatchedGates));
  const gateSourceSha256 = digest(gateSourceBytes);
  const gates = patchSourceReferences(unpatchedGates, gateSourceSha256) as GateInput;

  const decisions = decisionEvidencePacketsFixture(packet, metricResultSha256);
  const descriptor: Input = { contractVersion: 'report-method-packets-v1', gates, decisions };

  const sourceDrift = structuredClone(descriptor);
  const firstRow = sourceDrift.gates?.m10?.series[0]?.rows[0];
  if (firstRow) firstRow.source.locator = '/m10/series/0/rows/1';

  const claimDrift = structuredClone(descriptor);
  const claim = claimDrift.decisions?.claims[0];
  if (claim) {
    claim.payload.value = typeof claim.payload.value === 'number'
      ? claim.payload.value + 1 : claim.payload.value === '999' ? '998' : '999';
  }
  const semanticInvalid = structuredClone(descriptor);
  if (semanticInvalid.decisions) {
    semanticInvalid.decisions.question = { state: 'UNSET', text: 'Synthetic invalid supplied text' };
  }

  const advancedProfile = readFileSync(new URL('../../docs/research/method-configurations-v1/advanced-profile.md', import.meta.url));
  const synthesisProfile = readFileSync(new URL('../../docs/research/method-configurations-v1/synthesis-ai-profile.md', import.meta.url));
  const adoption = readFileSync(new URL('../../docs/research/method-configurations-v1-adoption.md', import.meta.url));
  const files = [
    file(DESCRIPTOR_PATH, json(descriptor), 'normalized-method-packets-input'),
    file(GATE_SOURCE_PATH, gateSourceBytes, 'synthetic-gate-source'),
    file(SOURCE_DRIFT_PATH, json(sourceDrift), 'normalized-method-packets-input'),
    file(CLAIM_DRIFT_PATH, json(claimDrift), 'normalized-method-packets-input'),
    ...(includeSemanticInvalid ? [file(SEMANTIC_INVALID_PATH, json(semanticInvalid), 'normalized-method-packets-input')] : []),
    file(ADVANCED_PROFILE_PATH, advancedProfile, 'method-authority', 'text/markdown'),
    file(SYNTHESIS_PROFILE_PATH, synthesisProfile, 'method-authority', 'text/markdown'),
    file(ADOPTION_PATH, adoption, 'method-authority', 'text/markdown'),
  ];
  return {
    logicalPath: DESCRIPTOR_PATH, sourceDriftPath: SOURCE_DRIFT_PATH, claimDriftPath: CLAIM_DRIFT_PATH,
    semanticInvalidPath: SEMANTIC_INVALID_PATH, gateSourcePath: GATE_SOURCE_PATH, descriptor, files,
  };
}

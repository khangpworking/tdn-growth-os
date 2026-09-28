import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import artifactSchema from '../../../contracts/analysis/report-interpretation-artifact.schema.json' with { type: 'json' };
import outputSchema from '../../../contracts/analysis/report-interpretation-output.schema.json' with { type: 'json' };
import requestSchema from '../../../contracts/analysis/report-interpretation-request.schema.json' with { type: 'json' };
import type { ReportInterpretationArtifact } from '../../../contracts/analysis/report-interpretation-artifact.generated.js';
import type { ReportInterpretationOutput } from '../../../contracts/analysis/report-interpretation-output.generated.js';
import type { ReportInterpretationRequest } from '../../../contracts/analysis/report-interpretation-request.generated.js';
import type { VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { buildReportSemanticContent } from './report-semantic-content.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateRequest = ajv.compile<ReportInterpretationRequest>(requestSchema);
const validateOutput = ajv.compile<ReportInterpretationOutput>(outputSchema);
const validateArtifact = ajv.compile<ReportInterpretationArtifact>(artifactSchema);

const forbiddenDecisionLanguage = /\b(?:recommend(?:ation|ed|s)?|approv(?:al|e|ed|es)|should|must|action|autonomous)\b|\bgo\s*\/\s*no-go\b|\bno-go\b|\b(?:khuyến\s*nghị|đề\s*xuất|phê\s*duyệt|chấp\s*thuận|nên|phải|hãy|triển\s*khai|thực\s*hiện)\b/iu;
const forbiddenAuthorityLanguage = /\b(?:cure|treat|prevent|cause[sd]?|guarantee[sd]?)\b|\b(?:chữa|điều\s*trị|ngăn\s*ngừa|gây\s*ra|dẫn\s*đến|bảo\s*đảm)\b/iu;
const numericLiteral = /\p{Number}/u;

export interface ReportInterpretationConfiguration {
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly promptText: string;
  readonly outputSchemaVersion: '1.0.0';
}

export interface ReportInterpretationTelemetry {
  readonly providerRequestId?: string;
  readonly inputTokenCount?: number;
  readonly outputTokenCount?: number;
  readonly latencyMs?: number;
}

export interface BuiltReportInterpretation {
  readonly artifact: ReportInterpretationArtifact;
  readonly artifactBytes: Buffer;
  readonly interpretationContentSha256: string;
}

type PacketClaim = VersionedReportPacket['claims'][number];
type OutputItem = ReportInterpretationOutput['items'][number];
type ResolvedItem = ReportInterpretationArtifact['items'][number];

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const identity = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), 'utf8'));
const artifactBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function validatedClone<T>(value: unknown, validate: { (candidate: unknown): candidate is T; errors?: unknown }, label: string): T {
  if (!validate(value)) throw new TypeError(`${label}: INVALID_CONTRACT`);
  return JSON.parse(canonicalJson(value)) as T;
}

function assertConfiguration(configuration: ReportInterpretationConfiguration): void {
  for (const [name, value, maximum] of [
    ['providerId', configuration.providerId, 120],
    ['modelId', configuration.modelId, 160],
    ['promptId', configuration.promptId, 160],
  ] as const) {
    if (value.trim() !== value || value.length < 1 || value.length > maximum) {
      throw new TypeError(`configuration: INVALID_${name.toUpperCase()}`);
    }
  }
  if (!Number.isSafeInteger(configuration.promptVersion) || configuration.promptVersion < 1) {
    throw new TypeError('configuration: INVALID_PROMPT_VERSION');
  }
  if (configuration.promptText.trim() !== configuration.promptText || configuration.promptText.length < 1) {
    throw new TypeError('configuration: INVALID_PROMPT_TEXT');
  }
  if (configuration.outputSchemaVersion !== '1.0.0') {
    throw new TypeError('configuration: INVALID_OUTPUT_SCHEMA_VERSION');
  }
}

function assertText(text: string, label: string): void {
  if (text.trim() !== text) throw new TypeError(`${label}: SURROUNDING_WHITESPACE`);
  if (numericLiteral.test(text)) throw new TypeError(`${label}: NUMERIC_LITERAL_FORBIDDEN`);
  if (forbiddenDecisionLanguage.test(text)) throw new TypeError(`${label}: DECISION_LANGUAGE_FORBIDDEN`);
  if (forbiddenAuthorityLanguage.test(text)) throw new TypeError(`${label}: AUTHORITY_LANGUAGE_FORBIDDEN`);
}

function resolvedCitation(claim: PacketClaim): ResolvedItem['citations'][number] {
  return {
    claimId: claim.claimId,
    sectionId: claim.sectionId,
    statementKind: claim.statementKind,
    scopeKey: claim.scopeKey,
    value: claim.value,
    unit: claim.unit,
    metricPointer: claim.metricPointer,
    scopePointer: claim.scopePointer,
    membershipPointer: claim.membershipPointer,
    denominatorPointer: claim.denominatorPointer,
    coveragePointer: claim.coveragePointer,
    limitations: [...claim.limitations],
  };
}

function resolveItem(item: OutputItem, packet: VersionedReportPacket, requested: ReadonlySet<string>): ResolvedItem {
  if (!requested.has(item.sectionId)) throw new TypeError('interpretation output: SECTION_NOT_REQUESTED');
  const section = packet.sections.find(candidate => candidate.sectionId === item.sectionId);
  if (!section) throw new TypeError('interpretation output: SECTION_NOT_FOUND');
  if (section.deliveryState !== 'PARTIAL_DETERMINISTIC_DRAFT' || section.claimIds.length === 0) {
    throw new TypeError('interpretation output: SECTION_NOT_ELIGIBLE');
  }
  for (const [label, text] of [
    ['CONCLUSION', item.conclusion],
    ['EVIDENCE_LOGIC', item.evidenceLogic],
    ...item.assumptions.map(value => ['ASSUMPTION', value] as const),
    ...item.limitations.map(value => ['LIMITATION', value] as const),
  ] as const) assertText(text, `interpretation output ${label}`);

  const claimIds = [...item.supportingClaimIds].sort();
  const sectionClaims = new Set(section.claimIds);
  const citations = claimIds.map(claimId => {
    if (!sectionClaims.has(claimId)) throw new TypeError('interpretation output: CLAIM_NOT_IN_SECTION');
    const claim = packet.claims.find(candidate => candidate.claimId === claimId);
    if (!claim || claim.sectionId !== item.sectionId) throw new TypeError('interpretation output: CLAIM_LINEAGE_MISMATCH');
    if (
      claim.claimType !== 'FACT' ||
      claim.evidenceState !== 'DETERMINISTIC_NORMALIZED_OBSERVATION' ||
      claim.approvalState !== 'UNREVIEWED'
    ) throw new TypeError('interpretation output: CLAIM_TRUST_STATE_MISMATCH');
    return resolvedCitation(claim);
  });
  const normalized = {
    sectionId: item.sectionId,
    kind: item.kind,
    conclusion: item.conclusion,
    evidenceLogic: item.evidenceLogic,
    supportingClaimIds: claimIds,
    citations,
    assumptions: [...item.assumptions].sort(),
    limitations: [...item.limitations].sort(),
  };
  return { itemId: identity(normalized), ...normalized };
}

function assertTelemetry(telemetry: ReportInterpretationTelemetry): void {
  if (telemetry.providerRequestId !== undefined && (
    telemetry.providerRequestId.trim() !== telemetry.providerRequestId ||
    telemetry.providerRequestId.length < 1 || telemetry.providerRequestId.length > 300
  )) throw new TypeError('telemetry: INVALID_PROVIDER_REQUEST_ID');
  for (const [name, value, maximum] of [
    ['INPUT_TOKEN_COUNT', telemetry.inputTokenCount, Number.MAX_SAFE_INTEGER],
    ['OUTPUT_TOKEN_COUNT', telemetry.outputTokenCount, Number.MAX_SAFE_INTEGER],
    ['LATENCY_MS', telemetry.latencyMs, 3_600_000],
  ] as const) {
    if (value !== undefined && (!Number.isSafeInteger(value) || value < 0 || value > maximum)) {
      throw new TypeError(`telemetry: INVALID_${name}`);
    }
  }
}

/**
 * Converts untrusted model-shaped output into an application-owned artifact.
 * Exact citation facts are copied from the verified report packet; model text
 * cannot supply values, provenance, authority or hidden reasoning.
 */
export function buildEvidenceBoundReportInterpretation(options: {
  readonly request: unknown;
  readonly output: unknown;
  readonly bundle: SourceBackedReportBundle;
  readonly configuration: ReportInterpretationConfiguration;
  readonly telemetry?: ReportInterpretationTelemetry;
  readonly now?: () => Date;
  readonly createId?: () => string;
}): BuiltReportInterpretation {
  const request = validatedClone(options.request, validateRequest, 'interpretation request');
  const output = validatedClone(options.output, validateOutput, 'interpretation output');
  assertConfiguration(options.configuration);
  const telemetry = options.telemetry ?? {};
  assertTelemetry(telemetry);

  const base = buildReportSemanticContent(options.bundle).content;
  if (base.semanticVersionId !== request.semanticVersionId) {
    throw new TypeError('interpretation request: SEMANTIC_VERSION_MISMATCH');
  }
  if (options.bundle.packet.packetId !== request.packetId) {
    throw new TypeError('interpretation request: PACKET_ID_MISMATCH');
  }
  if (new Set(options.bundle.packet.sections.map(section => section.sectionId)).size !== options.bundle.packet.sections.length) {
    throw new TypeError('interpretation source: DUPLICATE_SECTION_ID');
  }
  if (new Set(options.bundle.packet.claims.map(claim => claim.claimId)).size !== options.bundle.packet.claims.length) {
    throw new TypeError('interpretation source: DUPLICATE_CLAIM_ID');
  }
  if (options.bundle.packet.sections.some(section => new Set(section.claimIds).size !== section.claimIds.length)) {
    throw new TypeError('interpretation source: DUPLICATE_SECTION_CLAIM_ID');
  }
  const requested = new Set(request.sectionIds);
  for (const sectionId of requested) {
    const section = options.bundle.packet.sections.find(candidate => candidate.sectionId === sectionId);
    if (!section || section.deliveryState !== 'PARTIAL_DETERMINISTIC_DRAFT' || section.claimIds.length === 0) {
      throw new TypeError('interpretation request: SECTION_NOT_ELIGIBLE');
    }
  }

  const items = output.items.map(item => resolveItem(item, options.bundle.packet, requested))
    .sort((left, right) => left.sectionId < right.sectionId ? -1 : left.sectionId > right.sectionId ? 1
      : left.itemId < right.itemId ? -1 : left.itemId > right.itemId ? 1 : 0);
  if (new Set(items.map(item => item.itemId)).size !== items.length) {
    throw new TypeError('interpretation output: DUPLICATE_ITEM');
  }
  const covered = new Set(items.map(item => item.sectionId));
  if (covered.size !== requested.size || [...requested].some(sectionId => !covered.has(sectionId))) {
    throw new TypeError('interpretation output: REQUESTED_SECTION_MISSING');
  }

  const interpretationContent = {
    policyVersion: 'report-evidence-bound-interpretation-v1',
    sourceSemanticVersionId: base.semanticVersionId,
    items,
  };
  const interpretationContentSha256 = identity(interpretationContent);
  const promptSha256 = sha256(Buffer.from(options.configuration.promptText, 'utf8'));
  const normalizedRequest = { ...request, sectionIds: [...request.sectionIds].sort() };
  const requestSha256 = identity({
    request: normalizedRequest,
    providerId: options.configuration.providerId,
    modelId: options.configuration.modelId,
    promptId: options.configuration.promptId,
    promptVersion: options.configuration.promptVersion,
    promptSha256,
    outputSchemaVersion: options.configuration.outputSchemaVersion,
  });
  const completedAt = (options.now ?? (() => new Date()))().toISOString();
  const artifact: ReportInterpretationArtifact = {
    contractVersion: '1.0.0',
    interpretationId: (options.createId ?? randomUUID)(),
    interpretationContentSha256,
    requestSha256,
    completedAt,
    source: {
      semanticVersionId: base.semanticVersionId,
      packetId: options.bundle.packet.packetId,
      packetSha256: options.bundle.envelope.artifacts.packetSha256,
      claimsSha256: base.calculationLayer.claimsSha256,
    },
    generation: {
      providerId: options.configuration.providerId,
      modelId: options.configuration.modelId,
      promptId: options.configuration.promptId,
      promptVersion: options.configuration.promptVersion,
      promptSha256,
      outputSchemaVersion: options.configuration.outputSchemaVersion,
      ...(telemetry.providerRequestId === undefined ? {} : { providerRequestId: telemetry.providerRequestId }),
      ...(telemetry.inputTokenCount === undefined ? {} : { inputTokenCount: telemetry.inputTokenCount }),
      ...(telemetry.outputTokenCount === undefined ? {} : { outputTokenCount: telemetry.outputTokenCount }),
      ...(telemetry.latencyMs === undefined ? {} : { latencyMs: telemetry.latencyMs }),
    },
    items,
    limitations: [
      'UNAPPROVED_AI_INTERPRETATION; NOT_SOURCE_EVIDENCE_OR_A_BUSINESS_DECISION',
      'EXACT_NUMERIC_VALUES_AND_PROVENANCE_COME_ONLY_FROM_APPLICATION_RESOLVED_CITATIONS',
      'HIDDEN_MODEL_REASONING_IS_NOT_STORED',
    ],
  };
  if (!validateArtifact(artifact)) throw new TypeError('interpretation artifact: INVALID_CONTRACT');
  return { artifact, artifactBytes: artifactBytes(artifact), interpretationContentSha256 };
}

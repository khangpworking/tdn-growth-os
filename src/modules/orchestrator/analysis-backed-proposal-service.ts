import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { AnalysisBackedProposal } from '../../../contracts/orchestrator/analysis-backed-proposal.generated.js';
import type { AnalysisBackedProposalSubmission } from '../../../contracts/orchestrator/analysis-backed-proposal-submission.generated.js';
import type { ResearchEvidenceAuditReader, VerifiedResearchEvidenceAudit } from '../analysis/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/index.js';
import {
  OrchestratorValidationError,
  validateAnalysisBackedProposal,
  validateAnalysisBackedProposalSubmission,
} from './validation.js';

export interface AnalysisBackedProposalConfiguration {
  readonly producerId: string;
  readonly producerVersion: number;
}

export interface AnalysisBackedProposalExecution {
  readonly proposalId: string;
  readonly proposalArtifactSha256: string;
  readonly deduplicated: boolean;
}

interface ExistingProposal extends AnalysisBackedProposalExecution {
  readonly sourceAuditId: string;
  readonly sourceAuditArtifactSha256: string;
  readonly producerId: string;
  readonly producerVersion: bigint;
  readonly requestSha256: string;
}

interface ProposalRow {
  readonly proposalKey: string;
  readonly proposalVersion: bigint;
  readonly proposalType: string;
  readonly state: string;
  readonly sourceAuditId: string;
  readonly sourceAuditArtifactSha256: string;
  readonly producerId: string;
  readonly producerVersion: bigint;
  readonly requestSha256: string;
  readonly proposalArtifactSha256: string;
  readonly createdAt: string;
  readonly artifactByteSize: bigint;
  readonly artifactMediaType: string;
  readonly artifactRelativePath: string;
  readonly artifactContractVersion: string;
}

type AuditAssessment = VerifiedResearchEvidenceAudit['audit']['output']['claims'][number]['assessment'];
type EvidenceUse = AnalysisBackedProposalSubmission['proposal']['evidenceLinks'][number]['use'];

const allowedUses: Readonly<Record<AuditAssessment, ReadonlySet<EvidenceUse>>> = Object.freeze({
  supported: new Set<EvidenceUse>(['support']),
  contradicted: new Set<EvidenceUse>(['risk']),
  mixed: new Set<EvidenceUse>(['support', 'risk', 'uncertainty']),
  insufficient_evidence: new Set<EvidenceUse>(['uncertainty']),
});

export class AnalysisBackedProposalIdentityConflictError extends Error {}

export class AnalysisBackedProposalService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #audits: ResearchEvidenceAuditReader;
  readonly #config: AnalysisBackedProposalConfiguration;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly auditReader: ResearchEvidenceAuditReader;
    readonly configuration: AnalysisBackedProposalConfiguration;
    readonly now?: () => Date;
  }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#audits = options.auditReader;
    this.#config = options.configuration;
    this.#now = options.now ?? (() => new Date());
  }

  async submit(untrustedInput: unknown): Promise<AnalysisBackedProposalExecution> {
    const input = validateAnalysisBackedProposalSubmission(untrustedInput);
    const verified = await this.#audits.readVerifiedResearchEvidenceAudit(input.sourceAuditId);
    assertVerifiedAuditIdentity(verified, input.sourceAuditId);
    validateEvidenceLinks(input, verified);
    const requestSha256 = this.#requestSha256(input, verified.outputArtifactSha256);
    const existing = this.#existing(input.proposalKey, input.proposalVersion);
    if (existing) {
      if (existing.sourceAuditId !== verified.auditId ||
          existing.sourceAuditArtifactSha256 !== verified.outputArtifactSha256 ||
          existing.producerId !== this.#config.producerId ||
          existing.producerVersion !== BigInt(this.#config.producerVersion) ||
          existing.requestSha256 !== requestSha256) {
        throw new AnalysisBackedProposalIdentityConflictError('Proposal key/version exists with changed request, source, or producer identity');
      }
      return {
        proposalId: existing.proposalId,
        proposalArtifactSha256: existing.proposalArtifactSha256,
        deduplicated: true,
      };
    }
    this.#assertPredecessor(input.proposalKey, input.proposalVersion);

    const proposalId = randomUUID();
    const createdAt = this.#now().toISOString();
    const envelope = buildEnvelope(proposalId, createdAt, input, verified, this.#config);
    validateAnalysisBackedProposal(envelope);
    const stored = await this.#artifacts.put(Buffer.from(canonicalJson(envelope), 'utf8'));

    const transaction = this.#db.transaction((): AnalysisBackedProposalExecution => {
      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, createdAt, createdAt);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'application/json' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== '1.0.0') {
        throw new AnalysisBackedProposalIdentityConflictError('Proposal artifact metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO orchestrator_proposals(
           proposal_id, proposal_key, proposal_version, proposal_type, state,
           source_audit_id, source_audit_artifact_sha256, producer_id, producer_version,
           request_sha256, proposal_artifact_sha256, created_at
         ) VALUES (?, ?, ?, ?, 'PROPOSED', ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        proposalId, input.proposalKey, input.proposalVersion, input.proposalType,
        verified.auditId, verified.outputArtifactSha256, this.#config.producerId,
        this.#config.producerVersion, requestSha256, stored.sha256, createdAt,
      );
      return { proposalId, proposalArtifactSha256: stored.sha256, deduplicated: false };
    });
    return transaction();
  }

  getProposalArtifactSha256(proposalId: string): string {
    const row = this.#db.prepare(
      'SELECT proposal_artifact_sha256 AS proposalArtifactSha256 FROM orchestrator_proposals WHERE proposal_id = ?',
    ).get(proposalId) as { proposalArtifactSha256: string } | undefined;
    if (!row) throw new OrchestratorValidationError(`Proposal not found: ${proposalId}`);
    return row.proposalArtifactSha256;
  }

  async replay(proposalId: string): Promise<AnalysisBackedProposal> {
    const row = this.#db.prepare(
      `SELECT p.proposal_key AS proposalKey, p.proposal_version AS proposalVersion,
              p.proposal_type AS proposalType, p.state AS state,
              p.source_audit_id AS sourceAuditId,
              p.source_audit_artifact_sha256 AS sourceAuditArtifactSha256,
              p.producer_id AS producerId, p.producer_version AS producerVersion,
              p.request_sha256 AS requestSha256,
              p.proposal_artifact_sha256 AS proposalArtifactSha256,
              p.created_at AS createdAt, a.byte_size AS artifactByteSize,
              a.media_type AS artifactMediaType, a.relative_path AS artifactRelativePath,
              a.contract_version AS artifactContractVersion
         FROM orchestrator_proposals p
         JOIN artifact_manifests a ON a.sha256 = p.proposal_artifact_sha256
        WHERE p.proposal_id = ?`,
    ).get(proposalId) as ProposalRow | undefined;
    if (!row) throw new OrchestratorValidationError(`Proposal not found: ${proposalId}`);
    const bytes = await this.#artifacts.read(row.proposalArtifactSha256);
    if (row.artifactByteSize !== BigInt(bytes.byteLength) || row.artifactMediaType !== 'application/json' ||
        row.artifactRelativePath !== expectedPath(row.proposalArtifactSha256) || row.artifactContractVersion !== '1.0.0') {
      throw new AnalysisBackedProposalIdentityConflictError('Proposal artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new OrchestratorValidationError(`Invalid proposal JSON: ${(error as Error).message}`);
    }
    const envelope = validateAnalysisBackedProposal(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(envelope), 'utf8'))) {
      throw new OrchestratorValidationError('Proposal is not canonical JSON');
    }
    const verified = await this.#audits.readVerifiedResearchEvidenceAudit(row.sourceAuditId);
    assertVerifiedAuditIdentity(verified, row.sourceAuditId);
    const submission = submissionFromEnvelope(envelope);
    validateEvidenceLinks(submission, verified);
    const expectedRequestSha256 = this.#requestSha256(submission, verified.outputArtifactSha256);
    if (envelope.proposalId !== proposalId || envelope.proposalKey !== row.proposalKey ||
        BigInt(envelope.proposalVersion) !== row.proposalVersion || envelope.proposalType !== row.proposalType ||
        envelope.state !== row.state || envelope.state !== 'PROPOSED' || envelope.createdAt !== row.createdAt ||
        envelope.sourceAudit.auditId !== row.sourceAuditId ||
        envelope.sourceAudit.outputArtifactSha256 !== row.sourceAuditArtifactSha256 ||
        verified.outputArtifactSha256 !== row.sourceAuditArtifactSha256 ||
        envelope.producer.producerId !== row.producerId || envelope.producer.producerId !== this.#config.producerId ||
        BigInt(envelope.producer.producerVersion) !== row.producerVersion ||
        envelope.producer.producerVersion !== this.#config.producerVersion ||
        expectedRequestSha256 !== row.requestSha256) {
      throw new AnalysisBackedProposalIdentityConflictError('Proposal artifact does not match immutable metadata');
    }
    return envelope;
  }

  #existing(proposalKey: string, proposalVersion: number): ExistingProposal | undefined {
    return this.#db.prepare(
      `SELECT proposal_id AS proposalId, source_audit_id AS sourceAuditId,
              source_audit_artifact_sha256 AS sourceAuditArtifactSha256,
              producer_id AS producerId, producer_version AS producerVersion,
              request_sha256 AS requestSha256, proposal_artifact_sha256 AS proposalArtifactSha256,
              0 AS deduplicated
         FROM orchestrator_proposals WHERE proposal_key = ? AND proposal_version = ?`,
    ).get(proposalKey, proposalVersion) as ExistingProposal | undefined;
  }

  #assertPredecessor(proposalKey: string, proposalVersion: number): void {
    if (proposalVersion === 1) return;
    const exists = this.#db.prepare(
      'SELECT 1 FROM orchestrator_proposals WHERE proposal_key = ? AND proposal_version = ?',
    ).get(proposalKey, proposalVersion - 1);
    if (!exists) throw new OrchestratorValidationError(`Proposal version ${proposalVersion} requires version ${proposalVersion - 1}`);
  }

  #requestSha256(input: AnalysisBackedProposalSubmission, sourceAuditArtifactSha256: string): string {
    return sha256(Buffer.from(canonicalJson({
      submission: input,
      sourceAuditArtifactSha256,
      producer: { producerId: this.#config.producerId, producerVersion: this.#config.producerVersion },
    }), 'utf8'));
  }
}

function buildEnvelope(
  proposalId: string,
  createdAt: string,
  input: AnalysisBackedProposalSubmission,
  verified: VerifiedResearchEvidenceAudit,
  config: AnalysisBackedProposalConfiguration,
): AnalysisBackedProposal {
  return {
    contractVersion: '1.0.0',
    proposalId,
    proposalKey: input.proposalKey,
    proposalVersion: input.proposalVersion,
    proposalType: input.proposalType,
    state: 'PROPOSED',
    createdAt,
    sourceAudit: { auditId: verified.auditId, outputArtifactSha256: verified.outputArtifactSha256 },
    producer: { producerId: config.producerId, producerVersion: config.producerVersion },
    objective: input.objective,
    proposal: input.proposal,
    requestedNextStep: input.requestedNextStep,
  };
}

function submissionFromEnvelope(envelope: AnalysisBackedProposal): AnalysisBackedProposalSubmission {
  return {
    contractVersion: envelope.contractVersion,
    proposalKey: envelope.proposalKey,
    proposalVersion: envelope.proposalVersion,
    proposalType: envelope.proposalType,
    sourceAuditId: envelope.sourceAudit.auditId,
    objective: envelope.objective,
    proposal: envelope.proposal,
    requestedNextStep: envelope.requestedNextStep,
  };
}

function validateEvidenceLinks(input: AnalysisBackedProposalSubmission, verified: VerifiedResearchEvidenceAudit): void {
  const claims = new Map(verified.audit.output.claims.map((claim) => [claim.code, claim.assessment]));
  if (claims.size !== verified.audit.output.claims.length) {
    throw new OrchestratorValidationError('Verified audit contains duplicate claim codes');
  }
  const seen = new Set<string>();
  for (const link of input.proposal.evidenceLinks) {
    if (seen.has(link.claimCode)) throw new OrchestratorValidationError(`Duplicate evidence claim code: ${link.claimCode}`);
    seen.add(link.claimCode);
    const assessment = claims.get(link.claimCode);
    if (!assessment) throw new OrchestratorValidationError(`Unknown evidence claim code: ${link.claimCode}`);
    if (!allowedUses[assessment].has(link.use)) {
      throw new OrchestratorValidationError(`Evidence use ${link.use} is not allowed for ${assessment} claim ${link.claimCode}`);
    }
  }
}

function assertVerifiedAuditIdentity(verified: VerifiedResearchEvidenceAudit, expectedAuditId: string): void {
  if (verified.auditId !== expectedAuditId || verified.audit.auditId !== expectedAuditId) {
    throw new AnalysisBackedProposalIdentityConflictError('Verified Research Evidence Audit identity mismatch');
  }
}

function assertConfiguration(config: AnalysisBackedProposalConfiguration): void {
  if (!/^[a-z][a-z0-9:_-]{2,119}$/.test(config.producerId)) throw new TypeError('Invalid producer ID');
  if (!Number.isSafeInteger(config.producerVersion) || config.producerVersion < 1) throw new TypeError('Invalid producer version');
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}
function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

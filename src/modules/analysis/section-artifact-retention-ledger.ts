import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import requestSchema from '../../../contracts/analysis/section-artifact-retention-request.schema.json' with { type: 'json' };
import type { SectionArtifactRetentionRequest } from '../../../contracts/analysis/section-artifact-retention-request.generated.js';
import type { SectionArtifactRetentionRecord } from '../../../contracts/analysis/section-artifact-retention-record.generated.js';
import type { M03VerifiedMetricSet } from '../../../contracts/analysis/m03-verified-metric-set.generated.js';
import type { M03ChartBundle } from '../../../contracts/analysis/m03-chart-bundle.generated.js';
import type { M03NarrativeEvidence } from '../../../contracts/analysis/m03-narrative-evidence.generated.js';
import type { M03FactualNarrative } from '../../../contracts/analysis/m03-factual-narrative.generated.js';
import type { M03SectionArtifact } from '../../../contracts/analysis/m03-section-artifact.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { verifyM03VerifiedMetricSet } from './m03-section-recipe.js';
import { verifyM03ChartBundle } from './m03-chart-bundle.js';
import { verifyM03NarrativeEvidence } from './m03-narrative-evidence.js';
import { verifyM03FactualNarrative } from './m03-factual-narrative.js';
import { renderM03SectionArtifact } from './m03-section-artifact.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
const validateRequest = ajv.compile<SectionArtifactRetentionRequest>(requestSchema);

const JSON_MEDIA = 'application/json';
const HTML_MEDIA = 'text/html; charset=utf-8';
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;
const DIGEST = /^[0-9a-f]{64}$/;
const MEMBER_ROLES = ['metric_set', 'chart_bundle', 'envelope', 'narrative', 'receipt', 'html'] as const;
type MemberRole = (typeof MEMBER_ROLES)[number];

export class SectionArtifactRetentionValidationError extends Error {}
export class SectionArtifactRetentionConflictError extends Error {}
export class SectionArtifactRetentionIntegrityError extends Error {}

export interface SectionArtifactRetentionExecution {
  readonly sectionArtifactSha256: string;
  readonly preparationSha256: string;
  readonly metricSetSha256: string;
  readonly chartBundleSha256: string;
  readonly envelopeSha256: string;
  readonly narrativeSha256: string;
  readonly htmlSha256: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface SectionArtifactRetentionBytes {
  readonly metricSet: Buffer;
  readonly chartBundle: Buffer;
  readonly envelope: Buffer;
  readonly narrative: Buffer;
  readonly receipt: Buffer;
  readonly html: Buffer;
}

export interface VerifiedSectionArtifactRetention {
  readonly record: SectionArtifactRetentionRecord;
  readonly retainedAt: string;
  readonly metricSet: M03VerifiedMetricSet;
  readonly chartBundle: M03ChartBundle;
  readonly envelope: M03NarrativeEvidence;
  readonly narrative: M03FactualNarrative;
  readonly artifact: M03SectionArtifact;
  readonly html: string;
}

interface VerifiedBundle {
  readonly metricSet: M03VerifiedMetricSet;
  readonly chartBundle: M03ChartBundle;
  readonly envelope: M03NarrativeEvidence;
  readonly narrative: M03FactualNarrative;
  readonly artifact: M03SectionArtifact;
  readonly html: string;
}

interface Row {
  readonly sectionArtifactSha256: string;
  readonly sectionId: 'M03';
  readonly rendererProfile: string;
  readonly preparationSha256: string;
  readonly metricSetSha256: string;
  readonly chartBundleSha256: string;
  readonly envelopeSha256: string;
  readonly narrativeSha256: string;
  readonly htmlSha256: string;
  readonly htmlByteSize: bigint;
  readonly retainedAt: string;
}

interface CreatedArtifact {
  readonly stored: StoredArtifact;
  readonly removeOnFailure: boolean;
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class SectionArtifactRetentionLedgerService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
  }

  async retain(untrustedRequest: unknown, bytes: SectionArtifactRetentionBytes): Promise<SectionArtifactRetentionExecution> {
    const bundle = await this.#verify(untrustedRequest, bytes);
    const existing = this.#row(bundle.artifact.artifactSha256);
    if (existing) return this.#verifiedRetry(existing, bundle, bytes);

    const createdArtifacts: CreatedArtifact[] = [];
    const stored = await this.#putManyTracked(bytes, createdArtifacts);
    const retainedAt = exactTimestamp(this.#now());
    let execution: SectionArtifactRetentionExecution;
    try {
      execution = await withDatabaseMutationMutex(this.#db, async () => {
        this.#db.exec('BEGIN IMMEDIATE');
        try {
          const raced = this.#row(bundle.artifact.artifactSha256);
          if (raced) {
            const retry = await this.#verifiedRetry(raced, bundle, bytes);
            this.#db.exec('COMMIT');
            return retry;
          }
          let databaseMutations = 0;
          for (const role of MEMBER_ROLES) databaseMutations += this.#registerArtifact(stored[role], mediaTypeFor(role), retainedAt);
          databaseMutations += this.#insert(bundle, stored, retainedAt);
          for (const role of MEMBER_ROLES) databaseMutations += this.#insertMember(bundle.artifact.artifactSha256, role, stored[role].sha256);
          this.#db.exec('COMMIT');
          return executionFrom(bundle, false, databaseMutations);
        } catch (error) {
          if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
          throw error;
        }
      });
    } catch (error) {
      await this.#removeUnregisteredArtifacts(createdArtifacts);
      throw error;
    }
    const verified = await this.read(execution.sectionArtifactSha256);
    if (!Buffer.from(verified.html, 'utf8').equals(bytes.html)) {
      throw new SectionArtifactRetentionIntegrityError('Persisted section artifact does not match its receipt');
    }
    return execution;
  }

  async read(sectionArtifactSha256: string): Promise<VerifiedSectionArtifactRetention> {
    if (!DIGEST.test(sectionArtifactSha256)) throw new SectionArtifactRetentionValidationError('Invalid sectionArtifactSha256');
    const row = this.#row(sectionArtifactSha256);
    if (!row) throw new SectionArtifactRetentionValidationError('Section artifact retention not found');
    const members = this.#members(sectionArtifactSha256);
    const rebuiltBytes: SectionArtifactRetentionBytes = {
      metricSet: await this.#readRegisteredArtifact(members.metric_set.artifactSha256, JSON_MEDIA),
      chartBundle: await this.#readRegisteredArtifact(members.chart_bundle.artifactSha256, JSON_MEDIA),
      envelope: await this.#readRegisteredArtifact(members.envelope.artifactSha256, JSON_MEDIA),
      narrative: await this.#readRegisteredArtifact(members.narrative.artifactSha256, JSON_MEDIA),
      receipt: await this.#readRegisteredArtifact(members.receipt.artifactSha256, JSON_MEDIA),
      html: await this.#readRegisteredArtifact(members.html.artifactSha256, HTML_MEDIA),
    };
    const request: SectionArtifactRetentionRequest = {
      contractVersion: '1.0.0',
      sectionId: 'M03',
      rendererProfile: 'm03-section-artifact-html-vi-v1',
      metricSetSha256: row.metricSetSha256,
      chartBundleSha256: row.chartBundleSha256,
      envelopeSha256: row.envelopeSha256,
      narrativeSha256: row.narrativeSha256,
      sectionArtifactSha256: row.sectionArtifactSha256,
      htmlSha256: row.htmlSha256,
    };
    const bundle = await this.#verify(request, rebuiltBytes);
    this.#assertRow(row, bundle);
    return {
      record: recordFrom(bundle, members),
      retainedAt: row.retainedAt,
      metricSet: bundle.metricSet,
      chartBundle: bundle.chartBundle,
      envelope: bundle.envelope,
      narrative: bundle.narrative,
      artifact: bundle.artifact,
      html: bundle.html,
    };
  }

  async #verify(untrustedRequest: unknown, bytes: SectionArtifactRetentionBytes): Promise<VerifiedBundle> {
    const request = requestSnapshot(untrustedRequest);
    const metricSetJson = parseJson(bytes.metricSet, 'M03 metric set');
    const chartBundleJson = parseJson(bytes.chartBundle, 'M03 chart bundle');
    const envelopeJson = parseJson(bytes.envelope, 'M03 narrative evidence');
    const narrativeJson = parseJson(bytes.narrative, 'M03 factual narrative');
    const receiptJson = parseJson(bytes.receipt, 'M03 section artifact receipt');

    const metricSet = verifyM03VerifiedMetricSet(metricSetJson, request.metricSetSha256);
    const chartBundle = verifyM03ChartBundle(chartBundleJson, request.chartBundleSha256, metricSet);
    const envelope = verifyM03NarrativeEvidence(envelopeJson, request.envelopeSha256, metricSet, chartBundle);
    const narrative = verifyM03FactualNarrative(narrativeJson, request.narrativeSha256, envelope, metricSet, chartBundle);

    if (typeof receiptJson !== 'object' || receiptJson === null || !('request' in receiptJson)) {
      throw new SectionArtifactRetentionValidationError('M03 section artifact receipt is missing its render request');
    }
    const rendered = renderM03SectionArtifact(
      (receiptJson as { request: unknown }).request, metricSet, chartBundle, envelope, narrative,
    );
    if (canonicalJson(rendered.artifact) !== canonicalJson(receiptJson)) {
      throw new SectionArtifactRetentionIntegrityError('M03 section artifact receipt does not replay from exact dependencies');
    }
    if (rendered.artifact.artifactSha256 !== request.sectionArtifactSha256) {
      throw new SectionArtifactRetentionIntegrityError('Declared section artifact identity does not match exact content');
    }
    const htmlSha256 = digest(bytes.html);
    if (htmlSha256 !== request.htmlSha256 || htmlSha256 !== rendered.artifact.html.sha256 ||
        bytes.html.byteLength !== rendered.artifact.html.byteSize) {
      throw new SectionArtifactRetentionIntegrityError('Declared HTML identity does not match exact content');
    }
    if (!Buffer.from(rendered.html, 'utf8').equals(bytes.html)) {
      throw new SectionArtifactRetentionIntegrityError('Given HTML bytes do not match the exact deterministic rendering');
    }
    return { metricSet, chartBundle, envelope, narrative, artifact: rendered.artifact, html: rendered.html };
  }

  async #verifiedRetry(
    row: Row, bundle: VerifiedBundle, bytes: SectionArtifactRetentionBytes,
  ): Promise<SectionArtifactRetentionExecution> {
    const verified = await this.read(row.sectionArtifactSha256);
    if (!Buffer.from(verified.html, 'utf8').equals(bytes.html) ||
        canonicalJson(verified.metricSet) !== canonicalJson(bundle.metricSet) ||
        canonicalJson(verified.chartBundle) !== canonicalJson(bundle.chartBundle) ||
        canonicalJson(verified.envelope) !== canonicalJson(bundle.envelope) ||
        canonicalJson(verified.narrative) !== canonicalJson(bundle.narrative)) {
      throw new SectionArtifactRetentionConflictError('Section artifact identity already retained with changed bytes or metadata');
    }
    return executionFrom(bundle, true, 0);
  }

  #row(sectionArtifactSha256: string): Row | undefined {
    return this.#db.prepare(`
      SELECT section_artifact_sha256 sectionArtifactSha256, section_id sectionId, renderer_profile rendererProfile,
             preparation_sha256 preparationSha256, metric_set_sha256 metricSetSha256,
             chart_bundle_sha256 chartBundleSha256, envelope_sha256 envelopeSha256,
             narrative_sha256 narrativeSha256, html_sha256 htmlSha256, html_byte_size htmlByteSize,
             retained_at retainedAt
      FROM analysis_section_artifacts WHERE section_artifact_sha256 = ?
    `).get(sectionArtifactSha256) as Row | undefined;
  }

  #members(sectionArtifactSha256: string): Record<MemberRole, { artifactSha256: string; byteSize: number }> {
    const rows = this.#db.prepare(`
      SELECT m.member_role memberRole, m.artifact_sha256 artifactSha256, a.byte_size byteSize
      FROM analysis_section_artifact_members m
      JOIN artifact_manifests a ON a.sha256 = m.artifact_sha256
      WHERE m.section_artifact_sha256 = ?
    `).all(sectionArtifactSha256) as { memberRole: MemberRole; artifactSha256: string; byteSize: bigint }[];
    const byRole = new Map(rows.map(entry => [entry.memberRole, { artifactSha256: entry.artifactSha256, byteSize: Number(entry.byteSize) }]));
    if (byRole.size !== MEMBER_ROLES.length || MEMBER_ROLES.some(role => !byRole.has(role))) {
      throw new SectionArtifactRetentionIntegrityError('Section artifact membership is incomplete');
    }
    return Object.fromEntries(MEMBER_ROLES.map(role => [role, byRole.get(role)!])) as Record<MemberRole, { artifactSha256: string; byteSize: number }>;
  }

  #assertRow(row: Row, bundle: VerifiedBundle): void {
    if (
      row.sectionArtifactSha256 !== bundle.artifact.artifactSha256 ||
      row.sectionId !== bundle.artifact.section.sectionId ||
      row.rendererProfile !== bundle.artifact.renderer.rendererProfile ||
      row.preparationSha256 !== bundle.metricSet.preparation.preparationSha256 ||
      row.metricSetSha256 !== bundle.artifact.dependencies.metricSetSha256 ||
      row.chartBundleSha256 !== bundle.artifact.dependencies.chartBundleSha256 ||
      row.envelopeSha256 !== bundle.artifact.dependencies.envelopeSha256 ||
      row.narrativeSha256 !== bundle.artifact.dependencies.narrativeSha256 ||
      row.htmlSha256 !== bundle.artifact.html.sha256 ||
      Number(row.htmlByteSize) !== bundle.artifact.html.byteSize
    ) throw new SectionArtifactRetentionIntegrityError('Section artifact row does not match deterministic replay');
  }

  #insert(bundle: VerifiedBundle, stored: Record<MemberRole, StoredArtifact>, retainedAt: string): number {
    return this.#db.prepare(`
      INSERT INTO analysis_section_artifacts(
        section_artifact_sha256, section_id, renderer_profile, preparation_sha256,
        metric_set_sha256, chart_bundle_sha256, envelope_sha256, narrative_sha256,
        html_sha256, html_byte_size, retained_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      bundle.artifact.artifactSha256, bundle.artifact.section.sectionId, bundle.artifact.renderer.rendererProfile,
      bundle.metricSet.preparation.preparationSha256,
      bundle.artifact.dependencies.metricSetSha256, bundle.artifact.dependencies.chartBundleSha256,
      bundle.artifact.dependencies.envelopeSha256, bundle.artifact.dependencies.narrativeSha256,
      stored.html.sha256, bundle.artifact.html.byteSize, retainedAt,
    ).changes;
  }

  #insertMember(sectionArtifactSha256: string, role: MemberRole, artifactSha256: string): number {
    return this.#db.prepare(`
      INSERT INTO analysis_section_artifact_members(section_artifact_sha256, member_role, artifact_sha256)
      VALUES (?, ?, ?)
    `).run(sectionArtifactSha256, role, artifactSha256).changes;
  }

  async #putManyTracked(
    bytes: SectionArtifactRetentionBytes, created: CreatedArtifact[],
  ): Promise<Record<MemberRole, StoredArtifact>> {
    const entries = await Promise.all(MEMBER_ROLES.map(async role => [role, await this.#putTracked(bytes[roleKey(role)], created)] as const));
    return Object.fromEntries(entries) as Record<MemberRole, StoredArtifact>;
  }

  async #putTracked(value: Buffer, created: CreatedArtifact[]): Promise<StoredArtifact> {
    const sha256 = digest(value);
    const absolutePath = this.#artifacts.pathForDigest(sha256);
    const existed = await pathExists(absolutePath);
    const registered = this.#db.prepare('SELECT 1 found FROM artifact_manifests WHERE sha256 = ?').get(sha256) !== undefined;
    const stored = await this.#artifacts.put(value);
    if (!existed) created.push({ stored, removeOnFailure: !registered });
    return stored;
  }

  async #removeUnregisteredArtifacts(created: readonly CreatedArtifact[]): Promise<void> {
    const unique = new Map(created.map(item => [item.stored.sha256, item]));
    for (const { stored, removeOnFailure } of unique.values()) {
      if (!removeOnFailure) continue;
      if (this.#db.prepare('SELECT 1 found FROM artifact_manifests WHERE sha256 = ?').get(stored.sha256)) continue;
      const retained = await this.#artifacts.read(stored.sha256, { maxBytes: stored.byteSize });
      if (retained.byteLength !== stored.byteSize || digest(retained) !== stored.sha256) {
        throw new SectionArtifactRetentionIntegrityError('Section artifact bytes changed before cleanup');
      }
      await fs.rm(stored.absolutePath);
    }
  }

  #registerArtifact(stored: StoredArtifact, mediaType: string, acquiredAt: string): number {
    const inserted = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, mediaType, stored.relativePath, acquiredAt, acquiredAt);
    const row = this.#manifestRow(stored.sha256);
    if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== mediaType ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new SectionArtifactRetentionConflictError('Section artifact manifest metadata conflict');
    }
    return inserted.changes;
  }

  #manifestRow(sha256: string): {
    byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
  } | undefined {
    return this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
    } | undefined;
  }

  async #readRegisteredArtifact(sha256: string, mediaType: string): Promise<Buffer> {
    if (!DIGEST.test(sha256)) throw new SectionArtifactRetentionValidationError('Invalid artifact sha256');
    const row = this.#manifestRow(sha256);
    if (!row || row.mediaType !== mediaType || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new SectionArtifactRetentionIntegrityError('Section artifact manifest is missing or incompatible');
    }
    const bytes = await this.#artifacts.read(sha256, { maxBytes: MAX_ARTIFACT_BYTES });
    const expectedPath = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    if (row.byteSize !== BigInt(bytes.byteLength) || row.relativePath !== expectedPath) {
      throw new SectionArtifactRetentionIntegrityError('Section artifact metadata does not match immutable bytes');
    }
    return bytes;
  }
}

export class AnalysisSectionArtifactRetentionReader {
  readonly #service: SectionArtifactRetentionLedgerService;
  constructor(service: SectionArtifactRetentionLedgerService) { this.#service = service; }
  read(sectionArtifactSha256: string): Promise<VerifiedSectionArtifactRetention> {
    return this.#service.read(sectionArtifactSha256);
  }
}

function roleKey(role: MemberRole): keyof SectionArtifactRetentionBytes {
  return ({
    metric_set: 'metricSet', chart_bundle: 'chartBundle', envelope: 'envelope',
    narrative: 'narrative', receipt: 'receipt', html: 'html',
  } as const)[role];
}

function mediaTypeFor(role: MemberRole): string {
  return role === 'html' ? HTML_MEDIA : JSON_MEDIA;
}

function requestSnapshot(value: unknown): SectionArtifactRetentionRequest {
  if (!validateRequest(value)) {
    throw new SectionArtifactRetentionValidationError(`Invalid section artifact retention request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(value)) as SectionArtifactRetentionRequest;
}

function parseJson(bytes: Buffer, label: string): unknown {
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new SectionArtifactRetentionValidationError(`${label} is not valid UTF-8`); }
  try { return JSON.parse(text); }
  catch { throw new SectionArtifactRetentionValidationError(`${label} is not valid JSON`); }
}

function executionFrom(bundle: VerifiedBundle, deduplicated: boolean, databaseMutations: number): SectionArtifactRetentionExecution {
  return {
    sectionArtifactSha256: bundle.artifact.artifactSha256,
    preparationSha256: bundle.metricSet.preparation.preparationSha256,
    metricSetSha256: bundle.artifact.dependencies.metricSetSha256,
    chartBundleSha256: bundle.artifact.dependencies.chartBundleSha256,
    envelopeSha256: bundle.artifact.dependencies.envelopeSha256,
    narrativeSha256: bundle.artifact.dependencies.narrativeSha256,
    htmlSha256: bundle.artifact.html.sha256,
    deduplicated,
    databaseMutations,
  };
}

function recordFrom(
  bundle: VerifiedBundle, members: Record<MemberRole, { artifactSha256: string; byteSize: number }>,
): SectionArtifactRetentionRecord {
  return {
    contractVersion: '1.0.0',
    sectionArtifactSha256: bundle.artifact.artifactSha256,
    section: { sectionId: 'M03', title: 'Quy mô và diễn biến' },
    renderer: { rendererProfile: 'm03-section-artifact-html-vi-v1' },
    dependencies: {
      preparationSha256: bundle.metricSet.preparation.preparationSha256,
      metricSetSha256: bundle.artifact.dependencies.metricSetSha256,
      chartBundleSha256: bundle.artifact.dependencies.chartBundleSha256,
      envelopeSha256: bundle.artifact.dependencies.envelopeSha256,
      narrativeSha256: bundle.artifact.dependencies.narrativeSha256,
    },
    members: {
      metricSet: members.metric_set,
      chartBundle: members.chart_bundle,
      envelope: members.envelope,
      narrative: members.narrative,
      receipt: members.receipt,
      html: members.html,
    },
  };
}

function exactTimestamp(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new SectionArtifactRetentionValidationError('Retention clock returned an invalid date');
  return now.toISOString();
}

async function pathExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

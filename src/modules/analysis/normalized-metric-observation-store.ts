import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { MetricScopeInput } from '../../../contracts/analysis/metric-scope-input.generated.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { validateMetricScopeInput } from './metric-scope-calculator.js';
import type { AnalysisReportVersionReader } from './report-version-service.js';

const DIGEST = /^[0-9a-f]{64}$/;

export class NormalizedMetricObservationIntegrityError extends Error {}
export class NormalizedMetricObservationValidationError extends Error {}

export interface NormalizedMetricObservationExecution {
  readonly normalizedInputSha256: string;
  readonly rowCount: number;
  readonly sourceCount: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface VerifiedNormalizedMetricProjection {
  readonly normalizedInputSha256: string;
  readonly rowCount: number;
  readonly sourceCount: number;
  readonly input: MetricScopeInput;
}

interface DatasetRow {
  normalizedInputSha256: string;
  contractVersion: '1.0.0';
  scopeKey: string;
  platform: 'shopee' | 'tiktok';
  selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  periodStart: string;
  periodEnd: string;
  periodBasis: string;
  acquiredAt: string | null;
  profileId: string;
  labelCodebookVersion: string;
  wideUnknownPolicy: 'include' | 'exclude';
  sourceCount: bigint;
  rowCount: bigint;
}

interface SourceRow {
  ordinal: bigint;
  sha256: string;
  label: string;
  representationRole: 'primary' | 'structured' | 'derived';
  evidenceFamily: string;
  provenanceBasis: string;
}

interface ObservationRow {
  recordIndex: bigint;
  shopId: string; listingId: string; title: string; category: string;
  rowSourceSha256: string; rowSourceLocator: string;
  revenueState: 'missing' | 'observed_zero' | 'observed_value'; revenueValue: string | null;
  revenuePrecision: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  revenueSourceSha256: string; revenueSourceLocator: string; revenueDisplayedValue: string | null;
  unitsState: 'missing' | 'observed_zero' | 'observed_value'; unitsValue: string | null;
  unitsPrecision: 'exact' | 'display_rounded' | 'estimated' | 'unknown';
  unitsSourceSha256: string; unitsSourceLocator: string; unitsDisplayedValue: string | null;
  labelClassification: 'CORE_CANDIDATE' | 'ADJACENT' | 'OUTSIDE' | 'UNKNOWN' | null;
  labelGroup: string | null; labelContentSha256: string | null; labelMethodVersion: string | null;
  labelAdjudication: 'human' | 'assistant' | 'unknown' | null;
  labelSourceSha256: string | null; labelSourceLocator: string | null;
}

interface OriginRow {
  normalizedInputSha256: string;
  sourcePackageId: string;
  sourcePackageManifestSha256: string;
  packageContentSha256: string;
}

export class NormalizedMetricObservationStore {
  readonly #db: Database.Database;
  readonly #reports: AnalysisReportVersionReader | undefined;

  constructor(options: { readonly db: Database.Database; readonly reports?: AnalysisReportVersionReader }) {
    this.#db = options.db;
    this.#reports = options.reports;
  }

  async materializeReportVersion(reportId: string, version: number): Promise<NormalizedMetricObservationExecution> {
    const reports = this.#requireReports();
    const artifact = await reports.readArtifact(reportId, version, 'normalized-input.json');
    const input = parseCanonicalInput(artifact.bytes);
    const sha256 = digest(artifact.bytes);
    if (artifact.record.artifacts.find(item => item.fileName === 'normalized-input.json')?.sha256 !== sha256) {
      throw new NormalizedMetricObservationIntegrityError('Normalized input identity does not match the report version');
    }
    return withDatabaseMutationMutex(this.#db, async () => {
      this.#db.exec('BEGIN IMMEDIATE');
      let mutations = 0;
      let deduplicated = false;
      try {
        const origin = this.#origin(reportId, version);
        if (origin) {
          this.#assertOrigin(origin, artifact.record, sha256);
          deduplicated = true;
        } else {
          if (this.#dataset(sha256)) {
            this.#assertExactProjection(sha256, input, artifact.bytes);
          } else {
            mutations += this.#insertProjection(sha256, input);
          }
          mutations += this.#db.prepare(`
            INSERT INTO analysis_metric_dataset_origins(
              report_id, report_version, normalized_input_sha256, source_package_id,
              source_package_manifest_sha256, package_content_sha256
            ) VALUES (?, ?, ?, ?, ?, ?)
          `).run(
            reportId, version, sha256, artifact.record.sourcePackageId,
            artifact.record.sourcePackageManifestSha256, artifact.record.packageContentSha256,
          ).changes;
        }
        this.#db.exec('COMMIT');
      } catch (error) {
        if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
        throw error;
      }
      await this.readVerifiedForReport(reportId, version);
      return {
        normalizedInputSha256: sha256,
        rowCount: input.records.length,
        sourceCount: input.sources.length,
        deduplicated,
        databaseMutations: mutations,
      };
    });
  }

  async readVerifiedForReport(reportId: string, version: number): Promise<MetricScopeInput> {
    return (await this.readVerifiedProjectionForReport(reportId, version)).input;
  }

  async readVerifiedProjectionForReport(reportId: string, version: number): Promise<VerifiedNormalizedMetricProjection> {
    const reports = this.#requireReports();
    const artifact = await reports.readArtifact(reportId, version, 'normalized-input.json');
    const sha256 = digest(artifact.bytes);
    const origin = this.#origin(reportId, version);
    if (!origin) {
      throw new NormalizedMetricObservationValidationError('Report version has no exact normalized dataset projection');
    }
    this.#assertOrigin(origin, artifact.record, sha256);
    const input = parseCanonicalInput(artifact.bytes);
    this.#assertExactProjection(sha256, input, artifact.bytes);
    return {
      normalizedInputSha256: sha256,
      rowCount: input.records.length,
      sourceCount: input.sources.length,
      input: structuredClone(input),
    };
  }

  /** Caller-owned transaction seam for a pre-report normalized preparation. */
  materializeCanonicalInputInTransaction(bytes: Buffer): NormalizedMetricObservationExecution {
    if (!this.#db.inTransaction) {
      throw new NormalizedMetricObservationValidationError('Normalized projection materialization requires an active transaction');
    }
    const input = parseCanonicalInput(bytes);
    const sha256 = digest(bytes);
    const existing = this.#dataset(sha256);
    if (existing) this.#assertExactProjection(sha256, input, bytes);
    const databaseMutations = existing ? 0 : this.#insertProjection(sha256, input);
    return {
      normalizedInputSha256: sha256,
      rowCount: input.records.length,
      sourceCount: input.sources.length,
      deduplicated: existing !== undefined,
      databaseMutations,
    };
  }

  readVerifiedProjection(normalizedInputSha256: string, bytes: Buffer): VerifiedNormalizedMetricProjection {
    assertDigest(normalizedInputSha256);
    if (digest(bytes) !== normalizedInputSha256) {
      throw new NormalizedMetricObservationIntegrityError('Normalized input bytes do not match their artifact identity');
    }
    const input = parseCanonicalInput(bytes);
    this.#assertExactProjection(normalizedInputSha256, input, bytes);
    return {
      normalizedInputSha256,
      rowCount: input.records.length,
      sourceCount: input.sources.length,
      input: structuredClone(input),
    };
  }

  #insertProjection(sha256: string, input: MetricScopeInput): number {
    let mutations = 0;
    const insertSource = this.#db.prepare(`
      INSERT INTO analysis_metric_dataset_sources(
        normalized_input_sha256, ordinal, source_sha256, label, representation_role, evidence_family, provenance_basis
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [ordinal, source] of input.sources.entries()) {
      mutations += insertSource.run(
        sha256, ordinal, source.sha256, source.label, source.representationRole,
        source.evidenceFamily, source.provenanceBasis,
      ).changes;
    }
    const insertRow = this.#db.prepare(`
      INSERT INTO analysis_metric_dataset_rows(
        normalized_input_sha256, record_index, shop_id, listing_id, title, category,
        row_source_sha256, row_source_locator,
        revenue_state, revenue_value, revenue_precision, revenue_source_sha256, revenue_source_locator, revenue_displayed_value,
        units_state, units_value, units_precision, units_source_sha256, units_source_locator, units_displayed_value,
        label_classification, label_group, label_content_sha256, label_method_version, label_adjudication,
        label_source_sha256, label_source_locator
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const [index, row] of input.records.entries()) {
      mutations += insertRow.run(
        sha256, index, row.shopId, row.listingId, row.title, row.category,
        row.source.sourceSha256, row.source.locator,
        row.revenue.state, row.revenue.value, row.revenue.precision, row.revenue.source.sourceSha256,
        row.revenue.source.locator, row.revenue.displayedValue,
        row.units.state, row.units.value, row.units.precision, row.units.source.sourceSha256,
        row.units.source.locator, row.units.displayedValue,
        row.label?.classification ?? null, row.label?.group ?? null, row.label?.contentSha256 ?? null,
        row.label?.methodVersion ?? null, row.label?.adjudication ?? null,
        row.label?.source.sourceSha256 ?? null, row.label?.source.locator ?? null,
      ).changes;
    }
    mutations += this.#db.prepare(`
      INSERT INTO analysis_metric_datasets(
        normalized_input_sha256, contract_version, scope_key, platform, selection,
        period_start, period_end, period_basis, acquired_at, profile_id,
        label_codebook_version, wide_unknown_policy, source_count, row_count
      ) VALUES (?, '1.0.0', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sha256, input.scope.key, input.scope.platform, input.scope.selection,
      input.scope.start, input.scope.end, input.scope.periodBasis, input.scope.acquiredAt,
      input.profileId, input.labelCodebookVersion, input.wideUnknownPolicy,
      input.sources.length, input.records.length,
    ).changes;
    return mutations;
  }

  #assertExactProjection(sha256: string, input: MetricScopeInput, bytes: Buffer): void {
    const reconstructed = this.#reconstruct(sha256);
    if (canonicalJson(reconstructed) !== canonicalJson(input) || !canonicalBytes(reconstructed).equals(bytes)) {
      throw new NormalizedMetricObservationIntegrityError('Queryable normalized rows do not match the immutable input bytes');
    }
  }

  #reconstruct(sha256: string): MetricScopeInput {
    const dataset = this.#dataset(sha256);
    if (!dataset) throw new NormalizedMetricObservationIntegrityError('Normalized dataset projection is missing');
    const sources = this.#db.prepare(`
      SELECT ordinal, source_sha256 sha256, label, representation_role representationRole,
             evidence_family evidenceFamily, provenance_basis provenanceBasis
      FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = ? ORDER BY ordinal
    `).all(sha256) as SourceRow[];
    const rows = this.#db.prepare(`
      SELECT record_index recordIndex, shop_id shopId, listing_id listingId, title, category,
             row_source_sha256 rowSourceSha256, row_source_locator rowSourceLocator,
             revenue_state revenueState, revenue_value revenueValue, revenue_precision revenuePrecision,
             revenue_source_sha256 revenueSourceSha256, revenue_source_locator revenueSourceLocator,
             revenue_displayed_value revenueDisplayedValue,
             units_state unitsState, units_value unitsValue, units_precision unitsPrecision,
             units_source_sha256 unitsSourceSha256, units_source_locator unitsSourceLocator,
             units_displayed_value unitsDisplayedValue,
             label_classification labelClassification, label_group labelGroup,
             label_content_sha256 labelContentSha256, label_method_version labelMethodVersion,
             label_adjudication labelAdjudication, label_source_sha256 labelSourceSha256,
             label_source_locator labelSourceLocator
      FROM analysis_metric_dataset_rows WHERE normalized_input_sha256 = ? ORDER BY record_index
    `).all(sha256) as ObservationRow[];
    if (BigInt(sources.length) !== dataset.sourceCount || BigInt(rows.length) !== dataset.rowCount ||
        sources.some((row, index) => Number(row.ordinal) !== index) || rows.some((row, index) => Number(row.recordIndex) !== index)) {
      throw new NormalizedMetricObservationIntegrityError('Normalized dataset membership is incomplete');
    }
    const input: MetricScopeInput = {
      contractVersion: dataset.contractVersion,
      scope: {
        key: dataset.scopeKey, platform: dataset.platform, selection: dataset.selection,
        start: dataset.periodStart, end: dataset.periodEnd, periodBasis: dataset.periodBasis,
        acquiredAt: dataset.acquiredAt,
      },
      sources: sources.map(source => ({
        sha256: source.sha256, label: source.label, representationRole: source.representationRole,
        evidenceFamily: source.evidenceFamily, provenanceBasis: source.provenanceBasis,
      })) as MetricScopeInput['sources'],
      records: rows.map(row => ({
        shopId: row.shopId, listingId: row.listingId, title: row.title, category: row.category,
        source: { sourceSha256: row.rowSourceSha256, locator: row.rowSourceLocator },
        revenue: {
          state: row.revenueState, value: row.revenueValue, precision: row.revenuePrecision,
          source: { sourceSha256: row.revenueSourceSha256, locator: row.revenueSourceLocator },
          displayedValue: row.revenueDisplayedValue,
        },
        units: {
          state: row.unitsState, value: row.unitsValue, precision: row.unitsPrecision,
          source: { sourceSha256: row.unitsSourceSha256, locator: row.unitsSourceLocator },
          displayedValue: row.unitsDisplayedValue,
        },
        label: row.labelClassification === null ? null : {
          classification: row.labelClassification,
          group: row.labelGroup!, contentSha256: row.labelContentSha256!, methodVersion: row.labelMethodVersion!,
          adjudication: row.labelAdjudication!,
          source: { sourceSha256: row.labelSourceSha256!, locator: row.labelSourceLocator! },
        },
        measurement: {
          profileId: dataset.profileId, scopeKey: dataset.scopeKey, platform: dataset.platform,
          selection: dataset.selection, start: dataset.periodStart, end: dataset.periodEnd, currency: 'VND',
        },
      })),
      profileId: dataset.profileId,
      labelCodebookVersion: dataset.labelCodebookVersion,
      wideUnknownPolicy: dataset.wideUnknownPolicy,
    };
    try { return validateMetricScopeInput(input); }
    catch { throw new NormalizedMetricObservationIntegrityError('Queryable normalized rows break normalized-input invariants'); }
  }

  #dataset(sha256: string): DatasetRow | undefined {
    assertDigest(sha256);
    return this.#db.prepare(`
      SELECT normalized_input_sha256 normalizedInputSha256, contract_version contractVersion,
             scope_key scopeKey, platform, selection, period_start periodStart, period_end periodEnd,
             period_basis periodBasis, acquired_at acquiredAt, profile_id profileId,
             label_codebook_version labelCodebookVersion, wide_unknown_policy wideUnknownPolicy,
             source_count sourceCount, row_count rowCount
      FROM analysis_metric_datasets WHERE normalized_input_sha256 = ?
    `).get(sha256) as DatasetRow | undefined;
  }

  #origin(reportId: string, version: number): OriginRow | undefined {
    return this.#db.prepare(`
      SELECT normalized_input_sha256 normalizedInputSha256, source_package_id sourcePackageId,
             source_package_manifest_sha256 sourcePackageManifestSha256,
             package_content_sha256 packageContentSha256
      FROM analysis_metric_dataset_origins
      WHERE report_id = ? AND report_version = ?
    `).get(reportId, version) as OriginRow | undefined;
  }

  #assertOrigin(origin: OriginRow, record: Awaited<ReturnType<AnalysisReportVersionReader['readVersion']>>, sha256: string): void {
    if (
      origin.normalizedInputSha256 !== sha256 ||
      origin.sourcePackageId !== record.sourcePackageId ||
      origin.sourcePackageManifestSha256 !== record.sourcePackageManifestSha256 ||
      origin.packageContentSha256 !== record.packageContentSha256
    ) throw new NormalizedMetricObservationIntegrityError('Normalized dataset origin does not match the report lineage');
  }

  #requireReports(): AnalysisReportVersionReader {
    if (!this.#reports) throw new NormalizedMetricObservationValidationError('A report reader is required for report-origin replay');
    return this.#reports;
  }
}

function parseCanonicalInput(bytes: Buffer): MetricScopeInput {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new NormalizedMetricObservationIntegrityError('Normalized input is not valid UTF-8 JSON'); }
  let input: MetricScopeInput;
  try { input = validateMetricScopeInput(value); }
  catch { throw new NormalizedMetricObservationIntegrityError('Normalized input breaks normalized-input invariants'); }
  if (!canonicalBytes(input).equals(bytes)) throw new NormalizedMetricObservationIntegrityError('Normalized input is not canonical JSON');
  return input;
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown): Buffer {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

function assertDigest(value: string): void {
  if (!DIGEST.test(value)) throw new NormalizedMetricObservationValidationError('Invalid normalized input digest');
}

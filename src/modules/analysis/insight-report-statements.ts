import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import schema from '../../../contracts/analysis/insight-report-statement.schema.json' with { type: 'json' };
import type { InsightReportStatement } from '../../../contracts/analysis/insight-report-statement.generated.js';
import type { ContentInsightReport } from '../../../contracts/api/content-insight-reports-api.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { AutomationReaderReports } from './research-automation/reader-report-revisions.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv);
const valid = ajv.compile<InsightReportStatement>(schema);

export class InsightReportStatementError extends Error {}
export function validateInsightReportStatement(value: unknown): InsightReportStatement {
  if (!valid(value)) throw new InsightReportStatementError(ajv.errorsText(valid.errors));
  if (value.evidence.some(entry => entry.denominator !== undefined && entry.count > entry.denominator))
    throw new InsightReportStatementError('Evidence count exceeds denominator');
  return JSON.parse(canonicalJson(value)) as InsightReportStatement;
}

/** Box 2 owns statement writes. V1 has no runtime writer, seed or writer endpoint. */
export class InsightReportStatementService {
  constructor(private readonly db: Database.Database) {}
  retainStatement(value: unknown): InsightReportStatement {
    const statement = validateInsightReportStatement(value);
    const payload = canonicalJson(statement);
    return this.db.transaction(() => {
      const prior = this.db.prepare('SELECT payload_json payload FROM analysis_insight_report_statements WHERE statement_id=?').get(statement.statementId) as { payload: string } | undefined;
      if (prior) {
        if (prior.payload !== payload) throw new InsightReportStatementError('Statement identity already retained with different content');
        return statement;
      }
      this.db.prepare('INSERT INTO analysis_insight_report_statements(statement_id,revision_id,payload_json) VALUES (?,?,?)').run(statement.statementId, statement.revisionId, payload);
      return statement;
    })();
  }
}

export interface InsightReportStatementQuery {
  listApprovedReports(): Promise<ContentInsightReport[]>;
  readApprovedStatements(revisionId: string): Promise<{ report: ContentInsightReport; statements: InsightReportStatement[] } | undefined>;
  readApprovedStatement(revisionId: string, statementId: string): Promise<InsightReportStatement | undefined>;
  findNewerApprovedRevision(revisionId: string): Promise<ContentInsightReport | undefined>;
}
interface ReportRow { revisionId: string; runId: string; revisionNumber: number | bigint; createdAt: string }
const SELECT = `SELECT v.revision_id revisionId,v.run_id runId,v.revision_number revisionNumber,v.created_at createdAt
 FROM analysis_reader_report_revisions v JOIN analysis_reader_report_decisions d ON d.revision_id=v.revision_id
 WHERE v.report_kind='INSIGHT' AND d.decision='APPROVED'`;

export class AnalysisInsightReportStatementQuery implements InsightReportStatementQuery {
  private readonly readers: AutomationReaderReports;
  constructor(private readonly db: Database.Database, artifacts: ContentAddressedArtifactStore) {
    this.readers = new AutomationReaderReports(db, artifacts, () => new Date());
  }
  async #report(row: ReportRow): Promise<ContentInsightReport> {
    const scope = await this.readers.insightScope(row.runId, row.revisionId);
    return { ...row, revisionNumber: Number(row.revisionNumber), reportKind: 'INSIGHT', keyword: scope.keyword, period: scope.requestedPeriod ?? null };
  }
  async listApprovedReports(): Promise<ContentInsightReport[]> {
    const rows = this.db.prepare(`${SELECT} AND EXISTS (SELECT 1 FROM analysis_insight_report_statements s WHERE s.revision_id=v.revision_id)
      ORDER BY v.created_at DESC,v.revision_number DESC,v.revision_id ASC`).all() as ReportRow[];
    return Promise.all(rows.map(row => this.#report(row)));
  }
  async readApprovedStatements(revisionId: string) {
    const row = this.db.prepare(`${SELECT} AND v.revision_id=? AND EXISTS (SELECT 1 FROM analysis_insight_report_statements s WHERE s.revision_id=v.revision_id)`).get(revisionId) as ReportRow | undefined;
    if (!row) return undefined;
    const statements = (this.db.prepare('SELECT statement_id statementId,payload_json payload FROM analysis_insight_report_statements WHERE revision_id=? ORDER BY statement_id').all(revisionId) as { statementId: string; payload: string }[]).map(entry => {
      const statement = validateInsightReportStatement(JSON.parse(entry.payload));
      if (statement.statementId !== entry.statementId || statement.revisionId !== revisionId || canonicalJson(statement) !== entry.payload)
        throw new InsightReportStatementError('Stored statement identity mismatch');
      return statement;
    });
    return { report: await this.#report(row), statements };
  }
  async readApprovedStatement(revisionId: string, statementId: string) {
    return (await this.readApprovedStatements(revisionId))?.statements.find(statement => statement.statementId === statementId);
  }
  async findNewerApprovedRevision(revisionId: string) {
    const row = this.db.prepare(`${SELECT} AND v.run_id=(SELECT run_id FROM analysis_reader_report_revisions WHERE revision_id=?)
      AND v.revision_number>(SELECT revision_number FROM analysis_reader_report_revisions WHERE revision_id=?)
      ORDER BY v.revision_number DESC LIMIT 1`).get(revisionId, revisionId) as ReportRow | undefined;
    return row ? this.#report(row) : undefined;
  }
}

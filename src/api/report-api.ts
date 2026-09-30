import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type {
  ReportApiErrorResponse,
  ReportHistoryResponse,
  ReportInterpretationDetail,
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
  ReportInterpretationSummary,
  ReportSectionReadinessResponse,
  ReportVersionSummary,
  WorkspaceReportIndexResponse,
} from '../../contracts/api/report-api.generated.js';
import type { VersionedReportPacket } from '../../contracts/analysis/versioned-report-packet.generated.js';
import type { ReportVersionRecord } from '../../contracts/analysis/report-version-record.generated.js';
import type { ReportReviewTarget } from '../../contracts/analysis/report-review-target.generated.js';
import {
  AnalysisReportInterpretationReader,
  ReportInterpretationLedgerService,
  type VerifiedReportInterpretation,
} from '../modules/analysis/report-interpretation-ledger.js';
import {
  ReportReviewTargetLedgerService,
  ReportReviewTargetLedgerValidationError,
} from '../modules/analysis/report-review-target-ledger.js';
import { buildReportInputReadiness, REPORT_INPUT_READINESS_PROFILE } from '../modules/analysis/report-input-readiness.js';
import { AnalysisReportVersionReader, ReportVersionService, type VerifiedReportInterpretationSource } from '../modules/analysis/report-version-service.js';
import { FoundationSourcePackageReader, SourcePackageService } from '../modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/index.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;
const FILE_NAME = /^[a-z0-9._-]{1,120}$/;

export interface ReportApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
}
export interface ReportApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  diagnostics(): { readonly queryOnly: boolean };
  close(): void;
}

export function openReportApi(configuration: ReportApiConfiguration): ReportApiApplication {
  if (!configuration.databasePath || !configuration.artifactRoot) throw new TypeError('Explicit databasePath and artifactRoot are required');
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { readonly: true, fileMustExist: true });
  try {
    db.pragma('query_only = ON');
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    assertReportTables(db);
    const artifacts = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
    const sourcePackages = new SourcePackageService({ db, artifactStore: artifacts });
    const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts });
    const workspaceReader = new FlowDiscoveryWorkspaceReader(workspaces);
    const reportService = new ReportVersionService({
      db,
      artifactStore: artifacts,
      dependencies: {
        sourcePackages: new FoundationSourcePackageReader(sourcePackages),
        workspaces: workspaceReader,
      },
    });
    const reportReader = new AnalysisReportVersionReader(reportService);
    const interpretationReader = new AnalysisReportInterpretationReader(new ReportInterpretationLedgerService({
      db, artifactStore: artifacts, reports: reportReader,
    }));
    const reviewTargets = new ReportReviewTargetLedgerService({
      db,
      artifactStore: artifacts,
      reports: reportReader,
      interpretations: interpretationReader,
    });

    const index = async (workspaceId: string): Promise<WorkspaceReportIndexResponse | undefined> => {
      try {
        const workspace = await workspaceReader.readVerifiedWorkspace(workspaceId);
        if (workspace.workspaceId !== workspaceId) throw new Error('Verified workspace has wrong identity');
      } catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
      return {
        contractVersion: '1.0.0',
        workspaceId,
        reports: reportReader.listSeriesByWorkspace(workspaceId).map(series => ({
          reportId: series.reportId,
          reportKey: series.reportKey,
          createdAt: series.createdAt,
        })),
      };
    };
    const history = async (reportId: string): Promise<ReportHistoryResponse | undefined> => {
      let records: readonly ReportVersionRecord[];
      try { records = await reportReader.readHistory(reportId); }
      catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
      const versions: ReportVersionSummary[] = [];
      for (const record of records) {
        const packetArtifact = await reportReader.readArtifact(reportId, record.version, 'packet.json');
        const packet = parsePacket(packetArtifact.bytes);
        if (packet.approvalState !== record.reviewState) throw new Error('Report packet approval state does not match version metadata');
        versions.push({
          versionId: record.versionId,
          version: record.version,
          previousSemanticVersionId: record.previousSemanticVersionId,
          semanticVersionId: record.semanticVersionId,
          createdAt: record.createdAt,
          status: packet.status,
          interpretationState: record.interpretationState,
          reviewState: record.reviewState,
          scope: packet.scope,
          sectionCounts: countSections(packet),
          selectedSourceCount: record.selectedSources.length,
          artifacts: record.artifacts.map(({ fileName, mediaType, byteSize }) => ({ fileName, mediaType, byteSize })),
        });
      }
      const first = records[0]!;
      return { contractVersion: '1.0.0', reportId, reportKey: first.reportKey, workspaceId: first.workspaceId, versions };
    };
    const interpretations = async (
      reportId: string,
      version: number,
    ): Promise<ReportInterpretationIndexResponse | undefined> => {
      try {
        const entries = await interpretationReader.list(reportId, version);
        return {
          contractVersion: '1.0.0', reportId, reportVersion: version,
          interpretations: entries.map(interpretationSummary),
        };
      } catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
    };
    const sectionReadiness = async (
      reportId: string,
      version: number,
    ): Promise<ReportSectionReadinessResponse | undefined> => {
      let verified: VerifiedReportInterpretationSource;
      try { verified = await reportReader.readInterpretationSource(reportId, version); }
      catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
      const { record, bundle } = verified;
      const packet = bundle.packet;
      const packets = new Map(packet.sections.map(section => [section.sectionId, section]));
      if (packets.size !== packet.sections.length || packet.catalog.sections.length !== packet.sections.length) {
        throw new Error('Report packet and section catalog membership differ');
      }
      const sections = packet.catalog.sections.map(definition => {
        const section = packets.get(definition.sectionId);
        if (!section) throw new Error('Report packet is missing a catalog section');
        return {
          ...definition,
          moduleIds: [...definition.moduleIds],
          requiredInputs: [...definition.requiredInputs],
          inputChecks: buildReportInputReadiness(record, packet, definition.requiredInputs, bundle.files),
          fallbackReasons: [...definition.fallbackReasons],
          deliveryState: section.deliveryState,
          claimIds: [...section.claimIds],
          contextPointers: [...section.contextPointers],
          blockers: [...section.blockers],
          sectionSha256: section.sectionSha256,
          ...(section.methodArtifact === undefined ? {} : { methodArtifact: { ...section.methodArtifact } }),
        };
      });
      return {
        contractVersion: '1.0.0', readinessProfile: REPORT_INPUT_READINESS_PROFILE,
        reportId, reportVersion: version,
        versionId: record.versionId, semanticVersionId: record.semanticVersionId,
        packetId: packet.packetId, catalogId: packet.catalog.catalogId,
        catalogVersion: packet.catalog.catalogVersion, catalogSha256: packet.catalogSha256,
        sections,
      };
    };
    const interpretation = async (
      reportId: string,
      version: number,
      interpretationId: string,
    ): Promise<ReportInterpretationDetailResponse | undefined> => {
      try {
        const verified = await interpretationReader.read(reportId, version, interpretationId);
        return {
          contractVersion: '1.0.0', reportId, reportVersion: version,
          interpretation: interpretationDetail(verified),
        };
      } catch (error) {
        if (/not found/i.test((error as Error).message)) return undefined;
        throw error;
      }
    };
    const reviewTarget = async (reviewTargetId: string): Promise<ReportReviewTarget | undefined> => {
      try {
        return (await reviewTargets.read(reviewTargetId)).target;
      } catch (error) {
        if (error instanceof ReportReviewTargetLedgerValidationError && /not found/i.test(error.message)) return undefined;
        throw error;
      }
    };
    const artifact = (reportId: string, version: number, fileName: string) => reportReader.readArtifact(reportId, version, fileName);
    const handler = (request: IncomingMessage, response: ServerResponse): void => {
      void route(request, response, { index, history, sectionReadiness, interpretations, interpretation, reviewTarget, artifact });
    };
    return { handler, diagnostics: () => ({ queryOnly: db.pragma('query_only', { simple: true }) === 1n }), close: () => db.close() };
  } catch (error) {
    db.close();
    throw error;
  }
}

export function createReportApiServer(configuration: ReportApiConfiguration): { readonly server: http.Server; close(): Promise<void> } {
  const application = openReportApi(configuration);
  const server = http.createServer(application.handler);
  return {
    server,
    close: () => new Promise<void>((resolve, reject) => server.close(error => { application.close(); error ? reject(error) : resolve(); })),
  };
}

async function route(request: IncomingMessage, response: ServerResponse, methods: {
  index(workspaceId: string): Promise<WorkspaceReportIndexResponse | undefined>;
  history(reportId: string): Promise<ReportHistoryResponse | undefined>;
  sectionReadiness(reportId: string, version: number): Promise<ReportSectionReadinessResponse | undefined>;
  interpretations(reportId: string, version: number): Promise<ReportInterpretationIndexResponse | undefined>;
  interpretation(reportId: string, version: number, interpretationId: string): Promise<ReportInterpretationDetailResponse | undefined>;
  reviewTarget(reviewTargetId: string): Promise<ReportReviewTarget | undefined>;
  artifact(reportId: string, version: number, fileName: string): ReturnType<AnalysisReportVersionReader['readArtifact']>;
}): Promise<void> {
  try {
    if (request.method !== 'GET') { response.setHeader('Allow', 'GET'); return sendError(response, 405, 'method_not_allowed', 'Only GET is supported'); }
    const parts = routeParts(request.url);
    if (!parts) return sendError(response, 400, 'bad_request', 'Malformed request URL');
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'workspaces' && parts[3] === 'reports') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Workspace ID must be a UUID');
      const result = await methods.index(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Workspace not found');
    }
    if (parts.length === 4 && parts[0] === 'api' && parts[1] === 'reports' && parts[3] === 'versions') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Report ID must be a UUID');
      const result = await methods.history(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Report series not found');
    }
    if (parts.length === 3 && parts[0] === 'api' && parts[1] === 'report-review-targets') {
      if (!DIGEST.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Review target ID must be a lowercase SHA-256 digest');
      const result = await methods.reviewTarget(parts[2]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Review target not found');
    }
    if (parts.length === 6 && parts[0] === 'api' && parts[1] === 'reports' && parts[3] === 'versions' && parts[5] === 'sections') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Report ID must be a UUID');
      const version = strictVersion(parts[4]!);
      if (version === null) return sendError(response, 400, 'bad_request', 'Report version is invalid');
      const result = await methods.sectionReadiness(parts[2]!, version);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Report version not found');
    }
    if (parts.length === 6 && parts[0] === 'api' && parts[1] === 'reports' && parts[3] === 'versions' && parts[5] === 'interpretations') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Report ID must be a UUID');
      const version = strictVersion(parts[4]!);
      if (version === null) return sendError(response, 400, 'bad_request', 'Report version is invalid');
      const result = await methods.interpretations(parts[2]!, version);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Report version not found');
    }
    if (parts.length === 7 && parts[0] === 'api' && parts[1] === 'reports' && parts[3] === 'versions' && parts[5] === 'interpretations') {
      if (!UUID.test(parts[2]!) || !UUID.test(parts[6]!)) return sendError(response, 400, 'bad_request', 'Report or interpretation ID must be a UUID');
      const version = strictVersion(parts[4]!);
      if (version === null) return sendError(response, 400, 'bad_request', 'Report version is invalid');
      const result = await methods.interpretation(parts[2]!, version, parts[6]!);
      return result ? sendJson(response, 200, result) : sendError(response, 404, 'not_found', 'Interpretation not found for the exact report version');
    }
    if (parts.length === 7 && parts[0] === 'api' && parts[1] === 'reports' && parts[3] === 'versions' && parts[5] === 'files') {
      if (!UUID.test(parts[2]!)) return sendError(response, 400, 'bad_request', 'Report ID must be a UUID');
      const version = strictVersion(parts[4]!);
      if (version === null || !FILE_NAME.test(parts[6]!)) return sendError(response, 400, 'bad_request', 'Version or artifact name is invalid');
      try {
        const result = await methods.artifact(parts[2]!, version, parts[6]!);
        return sendArtifact(response, result.fileName, result.mediaType, result.bytes);
      } catch (error) {
        if (/not found/i.test((error as Error).message)) return sendError(response, 404, 'not_found', 'Report version or artifact not found');
        throw error;
      }
    }
    return sendError(response, 404, 'not_found', 'Route not found');
  } catch {
    return sendError(response, 500, 'integrity_error', 'Stored report data failed integrity verification');
  }
}

function routeParts(raw: string | undefined): string[] | null {
  if (!raw || /%(?:2e|2f|5c)/i.test(raw)) return null;
  let url: URL;
  try { url = new URL(raw, 'http://report-api.local'); } catch { return null; }
  if (url.search || url.hash || url.pathname.includes('//')) return null;
  let parts: string[];
  try { parts = url.pathname.split('/').slice(1).map(part => decodeURIComponent(part)); } catch { return null; }
  return parts.some(part => part === '.' || part === '..' || part.includes('/') || part.includes('\\') || part.includes('\0')) ? null : parts;
}

function parsePacket(bytes: Buffer): VersionedReportPacket {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error('Stored report packet is invalid JSON'); }
  if (!record(value) || value.contractVersion !== '1.0.0' || value.status !== 'DRAFT' || value.approvalState !== 'UNREVIEWED' ||
      !record(value.scope) || !Array.isArray(value.sections)) throw new Error('Stored report packet breaks its contract');
  return value as unknown as VersionedReportPacket;
}

function countSections(packet: VersionedReportPacket): ReportVersionSummary['sectionCounts'] {
  const counts = { total: packet.sections.length, partialDeterministicDraft: 0, methodOnly: 0, blocked: 0, manualReviewRequired: 0, notImplemented: 0 };
  for (const section of packet.sections) {
    if (section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT') counts.partialDeterministicDraft += 1;
    else if (section.deliveryState === 'METHOD_ONLY') counts.methodOnly += 1;
    else if (section.deliveryState === 'BLOCKED') counts.blocked += 1;
    else if (section.deliveryState === 'MANUAL_REVIEW_REQUIRED') counts.manualReviewRequired += 1;
    else counts.notImplemented += 1;
  }
  if (counts.total < 1 || counts.total > 100 || Object.values(counts).slice(1).reduce((sum, count) => sum + count, 0) !== counts.total) {
    throw new Error('Stored report section states are invalid');
  }
  return counts;
}

function interpretationSummary(verified: VerifiedReportInterpretation): ReportInterpretationSummary {
  const { record, artifact } = verified;
  return {
    interpretationId: record.interpretationId,
    interpretationNumber: record.interpretationNumber,
    interpretationContentSha256: record.interpretationContentSha256,
    completedAt: record.completedAt,
    storedAt: record.storedAt,
    sourceSemanticVersionId: record.sourceSemanticVersionId,
    sourcePacketId: record.sourcePacketId,
    providerId: record.providerId,
    modelId: record.modelId,
    promptId: record.promptId,
    promptVersion: record.promptVersion,
    itemCount: artifact.items.length,
    sectionIds: [...new Set(artifact.items.map(item => item.sectionId))].sort(),
  };
}

function interpretationDetail(verified: VerifiedReportInterpretation): ReportInterpretationDetail {
  const { record, artifact } = verified;
  return {
    interpretationId: record.interpretationId,
    interpretationNumber: record.interpretationNumber,
    interpretationContentSha256: record.interpretationContentSha256,
    completedAt: record.completedAt,
    storedAt: record.storedAt,
    source: { ...artifact.source },
    generation: {
      providerId: artifact.generation.providerId,
      modelId: artifact.generation.modelId,
      promptId: artifact.generation.promptId,
      promptVersion: artifact.generation.promptVersion,
      outputSchemaVersion: artifact.generation.outputSchemaVersion,
    },
    items: artifact.items.map(item => ({
      ...item,
      supportingClaimIds: [...item.supportingClaimIds],
      citations: item.citations.map(citation => ({ ...citation, limitations: [...citation.limitations] })),
      assumptions: [...item.assumptions],
      limitations: [...item.limitations],
    })),
    limitations: [...artifact.limitations],
  };
}

function strictVersion(value: string): number | null {
  if (!/^[1-9]\d{0,4}$/.test(value)) return null;
  const version = Number(value);
  return version <= 10000 ? version : null;
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function sendJson(response: ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body));
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.byteLength, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  response.end(bytes);
}
function sendError(response: ServerResponse, status: number, code: ReportApiErrorResponse['error']['code'], message: string): void {
  sendJson(response, status, { error: { code, message } } satisfies ReportApiErrorResponse);
}
function sendArtifact(response: ServerResponse, fileName: string, mediaType: string, bytes: Buffer): void {
  const inline = fileName === 'report.html';
  response.writeHead(200, {
    'Content-Type': mediaType,
    'Content-Length': bytes.byteLength,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    ...(inline ? {
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",
      'X-Frame-Options': 'SAMEORIGIN',
    } : {}),
  });
  response.end(bytes);
}
function assertReportTables(db: BetterSqlite3.Database): void {
  const required = ['artifact_manifests', 'foundation_source_packages', 'foundation_source_package_files', 'flow_discovery_workspaces', 'analysis_report_series', 'analysis_report_versions', 'analysis_report_version_artifacts', 'analysis_report_version_sources', 'analysis_report_interpretation_runs', 'analysis_report_review_targets'];
  const rows = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[];
  const names = new Set(rows.map(row => row.name));
  if (required.some(name => !names.has(name))) throw new Error('Database is missing required report tables');
}

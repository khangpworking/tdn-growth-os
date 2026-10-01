import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { FoundationSourcePackageReader, SourcePackageService } from '../modules/foundation/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../modules/flow/index.js';
import { RequestScopedArtifactStore } from '../platform/artifacts/request-scoped-artifact-store.js';
import {
  ReportGenerationService, ResearchGenerationSelectionError, ResearchGenerationValidationError,
} from '../modules/analysis/report-generation-service.js';
import { ReportVersionIdentityConflictError } from '../modules/analysis/report-version-service.js';
import { MetricSourceRejection } from '../modules/analysis/metric-source-profile.js';
import {
  assertOwnerHttpConfiguration, EmptyBodyError, ownerAuthorized, PayloadTooLargeError,
  readOwnerBytes, sendApiJson, singleHeader, type OwnerHttpConfiguration,
} from './owner-http.js';

export interface ResearchGenerationApiApplication {
  readonly handler: (request: IncomingMessage, response: ServerResponse) => void;
  close(): void;
}

/** Opens the existing database only. Source intake and migrations are separate operations. */
export function openResearchGenerationApi(configuration: OwnerHttpConfiguration): ResearchGenerationApiApplication {
  assertOwnerHttpConfiguration(configuration);
  const db = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
  try {
    db.pragma('foreign_keys = ON');
    db.defaultSafeIntegers(true);
    for (const table of ['analysis_metric_input_preparations', 'analysis_section_artifacts', 'analysis_report_series', 'analysis_report_versions']) {
      if (!db.prepare('SELECT name FROM sqlite_master WHERE type = ? AND name = ?').get('table', table)) {
        throw new TypeError('Research generation requires the existing research schema');
      }
    }
    const artifacts = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
    const service = new ReportGenerationService({
      db, artifactStore: artifacts,
      sourcePackages: new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts })),
      workspaces: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })),
      catalogBytes: fs.readFileSync(new URL('../../docs/research/report-section-catalog-v1.json', import.meta.url)),
    });
    return {
      handler: (request, response) => { void route(request, response, configuration, service).catch(() => {
        if (!response.headersSent) sendError(response, 500, 'integrity_error', 'Stored research evidence failed verification');
        else response.destroy();
      }); },
      close: () => db.close(),
    };
  } catch (error) { db.close(); throw error; }
}

async function route(
  request: IncomingMessage, response: ServerResponse,
  configuration: OwnerHttpConfiguration, service: ReportGenerationService,
): Promise<void> {
  const allowed = new URL(configuration.allowedOrigin);
  if (singleHeader(request.headers.host) !== allowed.host) return sendError(response, 403, 'forbidden', 'Host is not allowed');
  const origin = singleHeader(request.headers.origin);
  if (origin !== undefined && origin !== allowed.origin) return sendError(response, 403, 'forbidden', 'Origin is not allowed');
  if (origin) {
    response.setHeader('Access-Control-Allow-Origin', origin);
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.setHeader('Vary', 'Origin');
  }
  const rawUrl = request.url ?? '';
  if (!rawUrl.startsWith('/') || rawUrl.startsWith('//') || rawUrl.includes('#')) return sendError(response, 404, 'not_found', 'Route not found');
  const url = new URL(rawUrl, allowed);
  const method = url.pathname === '/owner-api/research-generation/inputs' ? 'GET'
    : url.pathname === '/owner-api/research-generation/reports' ? 'POST' : null;
  if (method === null) return sendError(response, 404, 'not_found', 'Route not found');
  response.setHeader('Allow', `${method}, OPTIONS`);
  if (origin) response.setHeader('Access-Control-Allow-Methods', method);
  if (request.method === 'OPTIONS') {
    const headers = (singleHeader(request.headers['access-control-request-headers']) ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
    if (!origin || singleHeader(request.headers['access-control-request-method']) !== method ||
        !headers.includes('authorization') || headers.some(value => value !== 'authorization' && value !== 'content-type')) {
      return sendError(response, 403, 'forbidden', 'Preflight is not allowed');
    }
    response.writeHead(204, { 'Content-Length': '0', 'Cache-Control': 'no-store', 'Access-Control-Max-Age': '600' });
    response.end(); return;
  }
  if (request.method !== method) return sendError(response, 405, 'method_not_allowed', 'Method is not supported');
  if (!ownerAuthorized(request, configuration.token)) {
    response.setHeader('WWW-Authenticate', 'Bearer');
    return sendError(response, 401, 'unauthorized', 'Authentication required');
  }
  try {
    if (method === 'GET') {
      if ([...url.searchParams.keys()].join(',') !== 'workspaceId') return sendError(response, 400, 'bad_request', 'Choose one workspace');
      return sendApiJson(response, 200, await service.inputs(url.searchParams.get('workspaceId')!));
    }
    if (url.search) return sendError(response, 400, 'bad_request', 'Query parameters are not supported');
    if (singleHeader(request.headers['content-type']) !== 'application/json') return sendError(response, 400, 'bad_request', 'Content-Type must be application/json');
    let body: unknown;
    const bytes = await readOwnerBytes(request, 4096);
    try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { return sendError(response, 400, 'bad_request', 'Request body must be valid UTF-8 JSON'); }
    const receipt = await service.create(body);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof ReportVersionIdentityConflictError) return sendError(response, 409, 'conflict', 'This request key is already bound to another source selection');
    if (error instanceof ResearchGenerationSelectionError) return sendError(response, 409, 'conflict', 'The selected source is unavailable; refresh the source choices');
    if (error instanceof ResearchGenerationValidationError || error instanceof PayloadTooLargeError || error instanceof EmptyBodyError) {
      return sendError(response, 400, 'bad_request', 'Choose a supported source and submit the original request key');
    }
    if (error instanceof MetricSourceRejection) return sendError(response, 422, 'unsupported_source', 'The workbook or labels do not match the supported source profile; check the declared scope and coverage');
    return sendError(response, 500, 'integrity_error', 'Stored research evidence failed verification');
  }
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  sendApiJson(response, status, { error: { code, message } });
}

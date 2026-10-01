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
import { BoundedAnalysisGatesValidationError } from '../modules/analysis/bounded-analysis-gates.js';
import { DecisionEvidencePacketsValidationError } from '../modules/analysis/decision-evidence-packets.js';
import { DescriptiveMarketValidationError } from '../modules/analysis/descriptive-market-methods.js';
import { LocatedInsightValidationError } from '../modules/analysis/located-insight-methods.js';
import { ReportDescriptiveExtensionError } from '../modules/analysis/report-descriptive-extension.js';
import { ReportLocatedInsightExtensionError } from '../modules/analysis/report-located-insight-extension.js';
import { ReportMethodPacketsExtensionError } from '../modules/analysis/report-method-packets-extension.js';
import type { ResearchGenerationMethodInputError } from '../../contracts/api/research-generation-api.generated.js';
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
    const family = rejectedMethodFamily(error);
    if (family) {
      const body: ResearchGenerationMethodInputError = { error: {
        code: 'method_input_rejected', family,
        message: 'The selected method input does not match its declared evidence; choose another input or none',
      } };
      return sendApiJson(response, 422, body);
    }
    if (error instanceof ReportVersionIdentityConflictError) return sendError(response, 409, 'conflict', 'This request key is already bound to another source selection');
    if (error instanceof ResearchGenerationSelectionError) return sendError(response, 409, 'conflict', 'The selected source is unavailable; refresh the source choices');
    if (error instanceof ResearchGenerationValidationError || error instanceof PayloadTooLargeError || error instanceof EmptyBodyError) {
      return sendError(response, 400, 'bad_request', 'Choose a supported source and submit the original request key');
    }
    if (error instanceof MetricSourceRejection) return sendError(response, 422, 'unsupported_source', 'The workbook or labels do not match the supported source profile; check the declared scope and coverage');
    return sendError(response, 500, 'integrity_error', 'Stored research evidence failed verification');
  }
}

// Only known input mismatches are actionable. Package identity, byte verification,
// missing artifacts and unexpected consumer failures remain generic integrity errors.
function rejectedMethodFamily(error: unknown): ResearchGenerationMethodInputError['error']['family'] | undefined {
  if (!(error instanceof Error)) return undefined;
  if (error instanceof DescriptiveMarketValidationError && new Set([
    'INPUT_TOO_LARGE', 'PERIOD_REVERSED', 'INVALID_TIMEZONE', 'VALUE_STATE_MISMATCH',
    'DUPLICATE_SOURCE_PATH', 'INVALID_SOURCE_LOGICAL_PATH', 'CONFLICTING_SOURCE_METADATA',
    'UNKNOWN_EVIDENCE_SOURCE', 'SOURCE_LOCATOR_MISSING', 'PEER_DECLARATION_SCOPE_MISMATCH',
    'ANCHOR_REPEATED_AS_PEER', 'UNRESOLVED_EVENT_CONFLICT_REFERENCE', 'SELF_EVENT_CONFLICT',
  ]).has(error.message)) return 'descriptiveMethods';
  if (error instanceof DescriptiveMarketValidationError && error.message.startsWith('CONFLICTING_RECORD_REFERENCE:')) return 'descriptiveMethods';
  if (error instanceof LocatedInsightValidationError && new Set([
    'INPUT_TOO_LARGE', 'UNKNOWN_RECORD_INDEX', 'SPAN_QUOTE_MISMATCH', 'SPAN_SPLITS_SURROGATE_PAIR',
    'RELATION_CONTEXT_EXCLUDES_EVIDENCE', 'RELATION_REQUIRES_DISTINCT_SPANS',
    'DUPLICATE_SOURCE_PATH', 'INVALID_SOURCE_LOGICAL_PATH', 'UNKNOWN_EVIDENCE_SOURCE',
    'RECORD_READABILITY_MISMATCH', 'RECORD_DISPOSITION_REASON_REQUIRED',
    'CONFLICTING_RECORD_REFERENCE', 'UNREADABLE_SPAN_REFERENCE', 'ADJUDICATION_DECLARATION_REQUIRED',
    'SOURCE_STATED_SPAN_REQUIRED', 'FIELD_STATE_SPAN_MISMATCH', 'OWNER_FIELD_STATE_MISMATCH',
    'ANNOTATION_RECORD_NOT_INCLUDED', 'GAP_RELATION_REQUIRES_BOTH_STATES', 'CONFLICTING_CLAUSE_CODE',
  ]).has(error.message)) return 'locatedInsightMethods';
  if (error instanceof BoundedAnalysisGatesValidationError && new Set([
    'INPUT_TOO_LARGE', 'PERIOD_REVERSED', 'CALENDAR_RESOURCE_LIMIT', 'VALUE_STATE_MISMATCH', 'INVALID_TIMEZONE',
    'INVALID_SOURCE_LOGICAL_PATH', 'M10_DUPLICATE_SERIES_DATE', 'M10_ROW_OUTSIDE_PERIOD',
    'I11_DUPLICATE_GROUP_LABEL', 'I11_SOURCE_ASSIGNMENT_EVIDENCE_REQUIRED',
    'I11_ENTITY_IDENTITY_EVIDENCE_REQUIRED', 'I12_PRESENCE_CANNOT_MEASURE_EXPOSURE_OR_OUTCOME',
    'I16_DESIGN_ONLY_HAS_RESULT_DATA', 'I11_CONFLICTING_SOURCE_CELL', 'I12_CONFLICTING_SOURCE_RECORD',
  ]).has(error.message)) return 'methodPackets';
  if (error instanceof DecisionEvidencePacketsValidationError && new Set([
    'DECISION_INPUT_TOO_LARGE', 'OWNER_FIELD_STATE_MISMATCH', 'QUESTION_LINKS_WITHOUT_QUESTION', 'CLAIM_KEY_IDENTITY_MISMATCH',
    'UNKNOWN_CATALOG_SECTION', 'CLAIM_IDENTITY_DRIFT', 'CLAIM_REFERENCE_COLLISION',
    'UNKNOWN_CLAIM_KEY', 'SELF_COUNTERCLAIM', 'EMPTY_OWNER_LABEL', 'DUPLICATE_OWNER_LABEL',
  ]).has(error.message)) return 'methodPackets';
  if (error instanceof ReportDescriptiveExtensionError && new Set([
    'DESCRIPTIVE_SOURCE_TOO_LARGE', 'DESCRIPTIVE_JSON_POINTER_REQUIRED', 'DESCRIPTIVE_LOCATOR_UNRESOLVED',
    'DESCRIPTIVE_METHOD_AUTHORITY_MISMATCH', 'DESCRIPTIVE_METHOD_AUTHORITY_NOT_RETAINED',
    'DESCRIPTIVE_SOURCE_MEMBERSHIP_MISMATCH', 'DESCRIPTIVE_UNREGISTERED_SOURCE',
    'DESCRIPTIVE_RUN_CONFIGURATION_MISMATCH', 'DESCRIPTIVE_OBSERVATION_SOURCE_MISMATCH',
    'DESCRIPTIVE_SUPPLY_SOURCE_MISMATCH', 'DESCRIPTIVE_ADDITIVITY_PROOF_MISMATCH',
    'DESCRIPTIVE_MEMBER_KEY_MISMATCH', 'DESCRIPTIVE_PEER_DECLARATION_MISMATCH',
    'DESCRIPTIVE_EVENT_SOURCE_MISMATCH', 'DESCRIPTIVE_EVENT_TARGET_LINK_MISMATCH',
  ]).has(error.message)) return 'descriptiveMethods';
  if (error instanceof ReportLocatedInsightExtensionError && new Set([
    'LOCATED_SOURCE_TOO_LARGE', 'LOCATED_JSON_POINTER_REQUIRED', 'LOCATED_POINTER_UNRESOLVED',
    'LOCATED_METHOD_AUTHORITY_NOT_RETAINED', 'LOCATED_SOURCE_MEMBERSHIP_MISMATCH',
    'LOCATED_SOURCE_UNREGISTERED', 'LOCATED_RECORD_TEXT_MISMATCH',
  ]).has(error.message)) return 'locatedInsightMethods';
  if (error instanceof ReportMethodPacketsExtensionError && new Set([
    'METHOD_PACKET_SOURCE_TOO_LARGE', 'METHOD_PACKET_EMPTY_SELECTION', 'METHOD_PACKET_AUTHORITY_MISSING',
    'METHOD_PACKET_SOURCE_MEMBERSHIP_MISMATCH', 'METHOD_PACKET_INVALID_POINTER',
    'METHOD_PACKET_UNRESOLVED_POINTER', 'METHOD_PACKET_LITERAL_PAYLOAD_MISMATCH',
    'METHOD_PACKET_EMPTY_EVIDENCE_REFERENCE', 'METHOD_PACKET_CLAIM_REPLAY_MISMATCH',
  ]).has(error.message)) return 'methodPackets';
  return undefined;
}

function sendError(response: ServerResponse, status: number, code: string, message: string): void {
  sendApiJson(response, status, { error: { code, message } });
}

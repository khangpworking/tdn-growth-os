import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import BetterSqlite3 from 'better-sqlite3';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import schema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../modules/flow/index.js';
import { ResearchAutomationService } from '../modules/analysis/research-automation/service.js';
import { ResearchAutomationWorker } from '../modules/analysis/research-automation/worker.js';
import { bindResearchAutomationProvider } from '../modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ResearchAutomationProviderConfig, type ProviderTransport } from '../modules/analysis/research-automation/providers.js';
import { buildResearchAutomationReport } from '../modules/analysis/research-automation/reports.js';
import { createChromiumPdfRenderer } from '../modules/analysis/research-automation/pdf.js';
import { ResearchAutomationConflictError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from '../modules/analysis/research-automation/model.js';
import { assertOwnerHttpConfiguration, EmptyBodyError, ownerAuthorized, PayloadTooLargeError, readOwnerBytes, sendApiJson, singleHeader, type OwnerHttpConfiguration } from './owner-http.js';

export interface ResearchAutomationApiConfiguration {
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly origin: string;
  readonly owner?: OwnerHttpConfiguration;
  readonly providers?: ResearchAutomationProviderConfig;
  readonly pdfExecutablePath?: string;
}
export interface ResearchAutomationApiApplication {
  handler(request: IncomingMessage, response: ServerResponse): void;
  close(): Promise<void>;
}
const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;
const ajv = new Ajv({ allErrors: false, strict: true });
addFormats(ajv);
ajv.addSchema(schema);
const validates = {
  start: ajv.compile({ $ref: `${schema.$id}#/$defs/startRequest` }),
  confirm: ajv.compile({ $ref: `${schema.$id}#/$defs/confirmRequest` }),
  cancel: ajv.compile({ $ref: `${schema.$id}#/$defs/cancelRequest` }),
};

export function researchAutomationApiPath(pathname: string): boolean {
  return /^\/(?:api|owner-api)\/workspaces\/[^/]+\/research-automation(?:\/|$)/.test(pathname);
}

/** Two application handles: GET is query-only; only the existing operator executor owns the worker. */
export function openResearchAutomationApi(configuration: ResearchAutomationApiConfiguration, transport?: ProviderTransport): ResearchAutomationApiApplication {
  const origin = new URL(configuration.origin);
  if (origin.origin !== configuration.origin || !['http:', 'https:'].includes(origin.protocol)) throw new TypeError('Automation requires an exact origin');
  if (configuration.owner) {
    assertOwnerHttpConfiguration(configuration.owner);
    if (configuration.owner.allowedOrigin !== configuration.origin ||
        path.resolve(configuration.owner.databasePath) !== path.resolve(configuration.databasePath) ||
        path.resolve(configuration.owner.artifactRoot) !== path.resolve(configuration.artifactRoot)) {
      throw new TypeError('Automation OWNER configuration must match its read application');
    }
  }
  const reader = new BetterSqlite3(path.resolve(configuration.databasePath), { readonly: true, fileMustExist: true });
  let writer: BetterSqlite3.Database | undefined;
  let worker: ResearchAutomationWorker | undefined;
  let pdf: ReturnType<typeof createChromiumPdfRenderer> | undefined;
  let ready: Promise<void> = Promise.resolve();
  let startupFailed = false;
  let closing = false;
  const artifacts = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
  const create = (db: BetterSqlite3.Database, extra: Partial<ConstructorParameters<typeof ResearchAutomationService>[0]> = {}) => new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })), ...extra,
  });
  let readService: ResearchAutomationService;
  let writeService: ResearchAutomationService | undefined;
  try {
    reader.pragma('query_only = ON'); reader.pragma('foreign_keys = ON'); reader.defaultSafeIntegers(true);
    if (!reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_research_automation_runs'").get()) throw new TypeError('Apply the automation migration before startup');
    readService = create(reader);
    if (configuration.owner) {
      writer = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
      writer.pragma('foreign_keys = ON'); writer.pragma('busy_timeout = 5000'); writer.defaultSafeIntegers(true);
      const registry = createResearchAutomationProviderRegistry(configuration.providers ?? { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, transport);
      // A web-search snapshot is not a substitute for product-period evidence.
      const selected = registry.get('KALODATA');
      if (configuration.pdfExecutablePath) pdf = createChromiumPdfRenderer({ executablePath: configuration.pdfExecutablePath });
      writeService = create(writer, {
        actorId: configuration.owner.actorId, source: bindResearchAutomationProvider(selected),
        renderer: async (input, kind, signal) => {
          const report = buildResearchAutomationReport(input, kind);
          if (!pdf) return { ...report, pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' };
          try { return { ...report, pdf: await pdf.render(report.html, signal) }; }
          catch { if (signal?.aborted) throw new Error('Research rendering stopped'); return { ...report, pdfUnavailableCode: 'PDF_RENDER_FAILED' }; }
        },
      });
      worker = new ResearchAutomationWorker({ service: writeService, db: writer });
      ready = worker.start().catch(() => { startupFailed = true; });
    }
  } catch (error) { void pdf?.close(); writer?.close(); reader.close(); throw error; }
  let closePromise: Promise<void> | undefined;
  return {
    handler: (request, response) => { void route(request, response).catch(() => { if (!response.headersSent) fail(response, 500, 'integrity_error', 'Stored research evidence failed verification'); else response.destroy(); }); },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        const failures: unknown[] = [];
        try { await ready; await worker?.close(); } catch (error) { failures.push(error); }
        try { await pdf?.close(); } catch (error) { failures.push(error); }
        try { writer?.close(); } catch (error) { failures.push(error); }
        try { reader.close(); } catch (error) { failures.push(error); }
        if (failures.length) throw failures[0];
      })();
      return closePromise;
    },
  };

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (closing) return fail(response, 503, 'service_unavailable', 'Research executor is stopping');
    if (singleHeader(request.headers.host) !== origin.host) return fail(response, 403, 'forbidden', 'Host is not allowed');
    const suppliedOrigin = singleHeader(request.headers.origin);
    if (suppliedOrigin !== undefined && suppliedOrigin !== origin.origin) return fail(response, 403, 'forbidden', 'Origin is not allowed');
    const raw = request.url ?? '';
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('#') || raw.includes('%')) return fail(response, 400, 'bad_request', 'Malformed request route');
    const url = new URL(raw, origin);
    if (url.search) return fail(response, 400, 'bad_request', 'Query parameters are not supported');
    const match = /^\/(api|owner-api)\/workspaces\/([0-9a-f-]{36})\/research-automation\/runs(?:\/([0-9a-f-]{36})(?:\/(confirm-scope|cancel|reports\/(market|insight)(\/pdf)?))?)?$/.exec(url.pathname);
    if (!match) return fail(response, 404, 'not_found', 'Route not found');
    const [, prefix, workspaceId, runId, action, report, pdfSuffix] = match;
    const mutation = prefix === 'owner-api';
    if ((mutation && (report || (runId && !action))) || (!mutation && action && !report)) return fail(response, 404, 'not_found', 'Route not found');
    const method = mutation ? 'POST' : 'GET';
    response.setHeader('Allow', mutation ? 'POST, OPTIONS' : 'GET');
    if (mutation) {
      if (!configuration.owner || !writeService) return fail(response, 403, 'forbidden', 'OWNER writes are disabled');
      if (suppliedOrigin !== origin.origin) return fail(response, 403, 'forbidden', 'Exact Origin is required');
      response.setHeader('Access-Control-Allow-Origin', origin.origin); response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); response.setHeader('Access-Control-Allow-Methods', 'POST');
      if (request.method === 'OPTIONS') {
        const headers = (singleHeader(request.headers['access-control-request-headers']) ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (singleHeader(request.headers['access-control-request-method']) !== 'POST' || !headers.includes('authorization') || headers.some(header => !['authorization', 'content-type'].includes(header))) return fail(response, 403, 'forbidden', 'Preflight is not allowed');
        response.writeHead(204, { 'Content-Length': '0', 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (!ownerAuthorized(request, configuration.owner.token)) { response.setHeader('WWW-Authenticate', 'Bearer'); return fail(response, 401, 'unauthorized', 'Authentication required'); }
    }
    if (request.method !== method) return fail(response, 405, 'method_not_allowed', 'Method is not supported');
    try {
      if (!mutation) {
        if (!runId) return sendApiJson(response, 200, await readService.listRuns(workspaceId!));
        if (!report) return sendApiJson(response, 200, await readService.getRun(workspaceId!, runId));
        const output = await readService.readReport(workspaceId!, runId, report === 'market' ? 'MARKET' : 'INSIGHT', Boolean(pdfSuffix));
        response.writeHead(200, { 'Content-Type': output.mediaType, 'Content-Length': output.bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'", ...(pdfSuffix ? { 'Content-Disposition': `attachment; filename="${report}-report.pdf"` } : {}) });
        response.end(output.bytes); return;
      }
      await ready;
      if (startupFailed || worker?.lastError !== undefined) return fail(response, 503, 'service_unavailable', 'Research executor is unavailable');
      if (singleHeader(request.headers['content-type']) !== 'application/json') return fail(response, 400, 'bad_request', 'Content-Type must be application/json');
      let body: unknown;
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readOwnerBytes(request, 16 * 1024))); }
      catch (error) { if (error instanceof PayloadTooLargeError || error instanceof EmptyBodyError) throw error; return fail(response, 400, 'bad_request', 'Request body must be valid UTF-8 JSON'); }
      const validate = !runId ? validates.start : action === 'confirm-scope' ? validates.confirm : validates.cancel;
      if (!validate(body)) return fail(response, 400, 'bad_request', 'Research request failed validation');
      const receipt = !runId ? await writeService!.start(workspaceId!, body) : action === 'confirm-scope' ? await writeService!.confirmScope(workspaceId!, runId, body) : await writeService!.cancel(workspaceId!, runId, body);
      worker!.wake();
      sendApiJson(response, action === 'cancel' || receipt.exactRetry ? 200 : 202, receipt);
    } catch (error) {
      if (error instanceof ResearchAutomationNotFoundError) return fail(response, 404, error.code, 'Research record or output was not found');
      if (error instanceof ResearchAutomationConflictError) return fail(response, 409, error.code, 'Research state changed; refresh before submitting');
      if (error instanceof PayloadTooLargeError) return fail(response, 413, 'payload_too_large', 'Request body exceeds the limit');
      if (error instanceof ResearchAutomationValidationError || error instanceof EmptyBodyError) return fail(response, 400, 'bad_request', 'Research request failed validation');
      return fail(response, 500, 'integrity_error', 'Stored research evidence failed verification');
    }
  }
}
function fail(response: ServerResponse, status: number, code: string, message: string): void { sendApiJson(response, status, { error: { code, message } }); }

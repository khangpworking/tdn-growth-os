import type { IncomingMessage, ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import type { ContentPackageDetailResponse } from '../../contracts/api/content-api.generated.js';
import type {
  OwnerContentCampaignDefaultsReceipt,
  OwnerContentPackageApiErrorResponse,
  OwnerContentPackageCreateReceipt,
  OwnerContentPackageGenerateReceipt,
  OwnerContentPackageStateReceipt,
  OwnerContentPackageVersionReceipt,
} from '../../contracts/api/owner-content-package-api.generated.js';
import { CREATIVE_AI_ERROR_MESSAGES, CreativeAiError, type CreativeAiErrorCode } from '../platform/ai/creative-ai-gateway.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import type { ContentCampaignService } from '../modules/flow/content-campaign-service.js';
import type { ContentIdeaService } from '../modules/flow/content-idea-service.js';
import {
  ContentPackageConflictError,
  ContentPackageReferenceError,
  type ContentPackageDetail,
  type ContentPackageService,
} from '../modules/flow/content-package-service.js';
import {
  FlowValidationError,
  validateContentCampaignDefaultsRequest,
  validateContentPackageCreateRequest,
  validateContentPackageGenerateRequest,
  validateContentPackageStateRequest,
  validateContentPackageVersionRequest,
} from '../modules/flow/validation.js';
import { EmptyBodyError, PayloadTooLargeError, readOwnerBytes, sendApiJson, singleHeader } from './owner-http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// Create and defaults carry two prompt choices, either of which may be a freestyle creative text.
const CREATE_BODY_BYTES = 192 * 1024;
const DEFAULTS_BODY_BYTES = 192 * 1024;
const VERSION_BODY_BYTES = 32 * 1024;
const SMALL_BODY_BYTES = 4 * 1024;
/** Every package attempt is recorded under this OWNER actor (ADR 0004 attempt ledger). */
export const CONTENT_PACKAGE_ACTOR_ID = 'owner:content-studio';

export type ContentPackageOwnerRoute =
  | { readonly kind: 'package-create'; readonly campaignId: string }
  | { readonly kind: 'package-defaults'; readonly campaignId: string }
  | { readonly kind: 'package-generate'; readonly packageId: string }
  | { readonly kind: 'package-version'; readonly packageId: string }
  | { readonly kind: 'package-state'; readonly packageId: string };

export interface ContentPackageOwnerWriters {
  create(serviceRequest: Record<string, unknown>): Promise<OwnerContentPackageCreateReceipt>;
  defaults(serviceRequest: Record<string, unknown>): Promise<OwnerContentCampaignDefaultsReceipt>;
  generate(serviceRequest: Record<string, unknown>): Promise<OwnerContentPackageGenerateReceipt>;
  version(serviceRequest: Record<string, unknown>): Promise<OwnerContentPackageVersionReceipt>;
  state(serviceRequest: Record<string, unknown>): Promise<OwnerContentPackageStateReceipt>;
}

class UnknownPackageCampaignError extends Error {}
class UnknownPackageError extends Error {}

const EXPECTED_KEYS: Readonly<Record<ContentPackageOwnerRoute['kind'], { readonly required: string; readonly optional: readonly string[] }>> = {
  'package-create': { required: 'caption,contractVersion,poster,requestId,rows', optional: [] },
  'package-defaults': { required: 'contractVersion,defaults,expectedVersion', optional: [] },
  'package-generate': { required: 'contractVersion,part,plannedCallCount,requestId', optional: ['retryOfAttemptId'] },
  'package-version': { required: 'action,contractVersion,expectedVersion,part,requestId', optional: ['post', 'restoreVersion'] },
  'package-state': { required: 'action,contractVersion,expectedSequence', optional: [] },
};

/** Package routes of the OWNER content API; null when the path is not one of them. */
export function contentPackageOwnerRoute(parts: string[] | null): ContentPackageOwnerRoute | 'invalid-id' | null {
  if (parts === null || parts[0] !== 'owner-api' || parts[1] !== 'content' || parts.length !== 5) return null;
  const id = parts[3]!;
  if (parts[2] === 'campaigns' && (parts[4] === 'packages' || parts[4] === 'defaults')) {
    if (!UUID.test(id)) return 'invalid-id';
    return parts[4] === 'packages' ? { kind: 'package-create', campaignId: id } : { kind: 'package-defaults', campaignId: id };
  }
  if (parts[2] === 'packages' && (parts[4] === 'generate' || parts[4] === 'versions' || parts[4] === 'state')) {
    if (!UUID.test(id)) return 'invalid-id';
    if (parts[4] === 'generate') return { kind: 'package-generate', packageId: id };
    return parts[4] === 'versions' ? { kind: 'package-version', packageId: id } : { kind: 'package-state', packageId: id };
  }
  return null;
}

export function createContentPackageOwnerWriters(dependencies: {
  readonly db: BetterSqlite3.Database;
  readonly packages: ContentPackageService;
  readonly ideas: ContentIdeaService;
  readonly campaigns: ContentCampaignService;
  /** Runs an integrity read and turns any failure into the API's integrity error. */
  readonly integrity: <T>(operation: () => Promise<T>) => Promise<T>;
  /** Verifies the campaign's revision chain and its Insight chain and lock. */
  readonly verifyCampaignInputs: (campaignId: string) => Promise<void>;
}): ContentPackageOwnerWriters {
  const { db, packages, ideas, campaigns, integrity, verifyCampaignInputs } = dependencies;
  const verifyPackage = (packageId: string) => integrity(() => packages.readPackage(packageId));
  /** The package's campaign, after its inputs and the package's own chain verify. */
  const openPackage = async (packageId: string): Promise<void> => {
    const campaignId = packages.packageCampaign(packageId);
    if (campaignId === undefined) throw new UnknownPackageError();
    await verifyCampaignInputs(campaignId);
    await verifyPackage(packageId);
  };
  return {
    // Create makes no AI call; the mutex keeps the pinned campaign, Insight lock and Angle states stable while it commits.
    create: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const campaignId = serviceRequest.campaignId as string;
      if (!campaigns.campaignExists(campaignId)) throw new UnknownPackageCampaignError();
      await verifyCampaignInputs(campaignId);
      const rows = Array.isArray(serviceRequest.rows) ? serviceRequest.rows as { angleId?: unknown }[] : [];
      for (const row of rows) if (typeof row?.angleId === 'string' && ideas.ideaExists(row.angleId)) await integrity(() => ideas.readIdea(row.angleId as string));
      const result = await packages.create(serviceRequest);
      for (const created of result.packages) await verifyPackage(created.packageId);
      return {
        contractVersion: '1.0.0', campaignId: result.campaignId, requestId: result.requestId,
        packages: result.packages.map((created) => ({ packageId: created.packageId, angleId: created.angleId, code: created.code, createdAt: created.createdAt })),
        exactRetry: result.deduplicated,
      };
    }),
    defaults: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const campaignId = serviceRequest.campaignId as string;
      if (!campaigns.campaignExists(campaignId)) throw new UnknownPackageCampaignError();
      await verifyCampaignInputs(campaignId);
      const result = await packages.saveDefaults(serviceRequest);
      await integrity(async () => packages.readDefaults(campaignId));
      return { contractVersion: '1.0.0', campaignId: result.campaignId, version: result.version, createdAt: result.createdAt, exactRetry: result.deduplicated };
    }),
    // The provider call can take a minute, so generation holds no database mutex; the attempt ledger, the in-flight
    // slot and the synchronous commit step keep the write exact (the service re-checks versions inside it).
    generate: async (serviceRequest) => {
      const packageId = serviceRequest.packageId as string;
      await openPackage(packageId);
      const result = await packages.generate(serviceRequest, CONTENT_PACKAGE_ACTOR_ID);
      const verified = await verifyPackage(packageId);
      const version = (result.part === 'CAPTION' ? verified.caption : verified.poster).find((item) => item.version === result.version);
      if (!version || version.attemptId === undefined || version.attemptId !== result.attemptId) throw new Error('Generated version is missing after commit');
      return {
        contractVersion: '1.0.0', packageId, part: result.part, version: result.version, attemptId: version.attemptId,
        createdAt: version.createdAt, exactRetry: result.deduplicated,
      };
    },
    version: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const packageId = serviceRequest.packageId as string;
      await openPackage(packageId);
      const result = await packages.changeVersion(serviceRequest);
      await verifyPackage(packageId);
      return {
        contractVersion: '1.0.0', packageId, part: result.part, version: result.version, source: result.source,
        createdAt: result.createdAt, exactRetry: result.deduplicated,
      };
    }),
    state: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const packageId = serviceRequest.packageId as string;
      await openPackage(packageId);
      const result = packages.changeState(serviceRequest);
      return {
        contractVersion: '1.0.0', packageId: result.packageId, sequence: result.sequence, action: result.action, createdAt: result.createdAt,
        ...(result.restorableUntil ? { restorableUntil: result.restorableUntil } : {}), exactRetry: result.deduplicated,
      };
    }),
  };
}

/** Handles a package route after the shared OWNER preamble (origin, preflight, method, token) has passed. */
export async function routeContentPackageOwner(request: IncomingMessage, response: ServerResponse, route: ContentPackageOwnerRoute, writers: ContentPackageOwnerWriters): Promise<void> {
  if (singleHeader(request.headers['content-type']) !== 'application/json') return sendPackageError(response, 400, 'bad_request', 'Content-Type must be application/json');
  try {
    const limit = route.kind === 'package-create' ? CREATE_BODY_BYTES : route.kind === 'package-defaults' ? DEFAULTS_BODY_BYTES : route.kind === 'package-version' ? VERSION_BODY_BYTES : SMALL_BODY_BYTES;
    const raw = (await readOwnerBytes(request, limit)).toString('utf8');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendPackageError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendPackageError(response, 400, 'bad_request', 'Invalid request');
    const fields = body as Record<string, unknown>;
    const expected = EXPECTED_KEYS[route.kind];
    const keys = Object.keys(fields).filter((key) => !expected.optional.includes(key)).sort().join(',');
    if (keys !== expected.required) return sendPackageError(response, 400, 'bad_request', 'Invalid request');
    const serviceRequest = 'campaignId' in route ? { ...fields, campaignId: route.campaignId } : { ...fields, packageId: route.packageId };
    try {
      if (route.kind === 'package-create') validateContentPackageCreateRequest(serviceRequest);
      else if (route.kind === 'package-defaults') validateContentCampaignDefaultsRequest(serviceRequest);
      else if (route.kind === 'package-generate') validateContentPackageGenerateRequest(serviceRequest);
      else if (route.kind === 'package-version') validateContentPackageVersionRequest(serviceRequest);
      else validateContentPackageStateRequest(serviceRequest);
    } catch (error) {
      if (error instanceof FlowValidationError) return sendPackageError(response, 400, 'bad_request', 'Invalid request');
      throw error;
    }
    const receipt = route.kind === 'package-create' ? await writers.create(serviceRequest)
      : route.kind === 'package-defaults' ? await writers.defaults(serviceRequest)
      : route.kind === 'package-generate' ? await writers.generate(serviceRequest)
      : route.kind === 'package-version' ? await writers.version(serviceRequest)
      : await writers.state(serviceRequest);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return sendPackageError(response, 400, 'bad_request', 'Request body is too large');
    if (error instanceof EmptyBodyError) return sendPackageError(response, 400, 'bad_request', 'Request body is required');
    if (error instanceof UnknownPackageCampaignError) return sendPackageError(response, 404, 'not_found', 'Campaign not found');
    if (error instanceof UnknownPackageError) return sendPackageError(response, 404, 'not_found', 'Package not found');
    // Service-level validation (batch size, duplicate Angles, MANUAL/RESTORE field pairing).
    if (error instanceof FlowValidationError) return sendPackageError(response, 400, 'bad_request', 'Invalid request');
    if (error instanceof ContentPackageReferenceError) return sendPackageError(response, 400, 'bad_request', 'Invalid package reference');
    if (error instanceof ContentPackageConflictError) return sendPackageError(response, 409, 'conflict', 'Request conflicts with current state');
    if (error instanceof CreativeAiError && error.code === 'ai_not_configured') return sendPackageError(response, 503, 'ai_unavailable', CREATIVE_AI_ERROR_MESSAGES.ai_not_configured, 'ai_not_configured');
    if (error instanceof CreativeAiError) return sendPackageError(response, 502, 'ai_failed', CREATIVE_AI_ERROR_MESSAGES[error.code], error.code);
    return sendPackageError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

function sendPackageError(response: ServerResponse, status: number, code: OwnerContentPackageApiErrorResponse['error']['code'], message: string, reason?: CreativeAiErrorCode): void {
  sendApiJson(response, status, { error: { code, message, ...(reason === undefined ? {} : { reason }) } } satisfies OwnerContentPackageApiErrorResponse);
}

/** The read view of one package: settings and display from the pin, then every version of each part and its attempts. */
export function packageDetailView(detail: ContentPackageDetail, campaign: { readonly name: string; readonly deleted: boolean }): ContentPackageDetailResponse {
  const { pin } = detail;
  const common = (version: ContentPackageDetail['caption'][number]) => ({
    version: version.version, source: version.source,
    ...(version.attemptId === undefined ? {} : { attemptId: version.attemptId }),
    ...(version.restoredFromVersion === undefined ? {} : { restoredFromVersion: version.restoredFromVersion }),
  });
  return {
    contractVersion: '1.0.0', packageId: detail.packageId, campaignId: detail.campaignId, campaignName: campaign.name, campaignDeleted: campaign.deleted,
    angleId: detail.angleId, code: detail.code, deleted: detail.state.deleted !== undefined,
    ...(detail.state.deleted ? { restorableUntil: detail.state.deleted.restorableUntil } : {}),
    ...(detail.state.hiddenBy ? { hiddenByParent: true as const } : {}), stateSequence: detail.state.sequence,
    settings: {
      brandId: pin.brand.brandId, purposes: [...pin.purposes],
      captionPromptName: pin.caption.prompt.name, captionModel: pin.caption.model, captionStyle: pin.caption.style, captionLength: pin.caption.length,
      posterPromptName: pin.poster.prompt.name, posterModel: pin.poster.model, posterFormat: pin.poster.format, includeLogo: pin.poster.includeLogo,
      ...(pin.poster.logoMediaSha256 === undefined ? {} : { logoMediaSha256: pin.poster.logoMediaSha256 }),
      referenceMediaSha256s: [...pin.poster.referenceMediaSha256s],
      captionDisplay: { ...pin.display.caption }, posterDisplay: { ...pin.display.poster },
    },
    footer: pin.footer,
    captions: detail.caption.map((version) => {
      const body = version.caption!;
      return { ...common(version), post: body.post, footer: body.footer, text: body.text, factCheck: body.factCheck.map((row) => ({ element: row.element, state: row.state, found: [...row.found] })), createdAt: version.createdAt };
    }),
    posters: detail.poster.map((version) => {
      const body = version.poster!;
      return {
        ...common(version), mediaType: body.mediaType, width: body.width, height: body.height, sizeMatchesFormat: body.sizeMatchesFormat,
        captionVersion: body.captionVersion, createdAt: version.createdAt,
      };
    }),
    attempts: detail.attempts.map((attempt) => ({ ...attempt })),
    createdAt: pin.createdAt,
  };
}

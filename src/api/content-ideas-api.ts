import type { IncomingMessage, ServerResponse } from 'node:http';
import type BetterSqlite3 from 'better-sqlite3';
import type {
  OwnerContentIdeaApiErrorResponse,
  OwnerContentIdeaReceipt,
  OwnerContentIdeaStateReceipt,
  OwnerContentPurposeTagReceipt,
} from '../../contracts/api/owner-content-idea-api.generated.js';
import { CREATIVE_AI_ERROR_MESSAGES, CreativeAiError, type CreativeAiErrorCode } from '../platform/ai/creative-ai-gateway.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import type { ContentCampaignService } from '../modules/flow/content-campaign-service.js';
import {
  ContentIdeaConflictError,
  ContentIdeaOutputError,
  ContentIdeaReferenceError,
  type ContentIdeaService,
} from '../modules/flow/content-idea-service.js';
import {
  FlowValidationError,
  validateContentIdeaGenerateRequest,
  validateContentIdeaStateRequest,
  validateContentPurposeTagRequest,
} from '../modules/flow/validation.js';
import { EmptyBodyError, PayloadTooLargeError, readOwnerBytes, sendApiJson, singleHeader } from './owner-http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// A freestyle prompt carries its creative text, so generation takes the prompt body limit.
const GENERATE_BODY_BYTES = 96 * 1024;
const STATE_BODY_BYTES = 4 * 1024;
const TAG_BODY_BYTES = 4 * 1024;
/** Every idea attempt is recorded under this OWNER actor (ADR 0004 attempt ledger). */
export const CONTENT_IDEA_ACTOR_ID = 'owner:content-studio';

export type ContentIdeaOwnerRoute =
  | { readonly kind: 'idea-generate'; readonly campaignId: string }
  | { readonly kind: 'idea-state'; readonly ideaId: string }
  | { readonly kind: 'purpose-tag' };

export interface ContentIdeaOwnerWriters {
  generate(serviceRequest: Record<string, unknown>): Promise<OwnerContentIdeaReceipt>;
  state(serviceRequest: Record<string, unknown>): Promise<OwnerContentIdeaStateReceipt>;
  purposeTag(serviceRequest: Record<string, unknown>): Promise<OwnerContentPurposeTagReceipt>;
}

class UnknownIdeaCampaignError extends Error {}
class UnknownIdeaError extends Error {}

/** Idea routes of the OWNER content API; null when the path is not one of them. */
export function contentIdeaOwnerRoute(parts: string[] | null): ContentIdeaOwnerRoute | 'invalid-id' | null {
  if (parts === null || parts[0] !== 'owner-api' || parts[1] !== 'content') return null;
  if (parts.length === 3 && parts[2] === 'purpose-tags') return { kind: 'purpose-tag' };
  if (parts.length === 5 && parts[2] === 'campaigns' && parts[4] === 'ideas') return UUID.test(parts[3]!) ? { kind: 'idea-generate', campaignId: parts[3]! } : 'invalid-id';
  if (parts.length === 5 && parts[2] === 'ideas' && parts[4] === 'state') return UUID.test(parts[3]!) ? { kind: 'idea-state', ideaId: parts[3]! } : 'invalid-id';
  return null;
}

export function createContentIdeaOwnerWriters(dependencies: {
  readonly db: BetterSqlite3.Database;
  readonly ideas: ContentIdeaService;
  readonly campaigns: ContentCampaignService;
  /** Runs an integrity read and turns any failure into the API's integrity error. */
  readonly integrity: <T>(operation: () => Promise<T>) => Promise<T>;
  /** Verifies the campaign's revision chain and its Insight chain and lock. */
  readonly verifyCampaignInputs: (campaignId: string) => Promise<void>;
}): ContentIdeaOwnerWriters {
  const { db, ideas, campaigns, integrity, verifyCampaignInputs } = dependencies;
  const verifyIdea = (ideaId: string) => integrity(() => ideas.readIdea(ideaId));
  return {
    // The provider call can take a minute, so generation holds no database mutex; the attempt ledger and the
    // synchronous commit step keep the write exact (the idea service re-checks the lock and parent inside it).
    generate: async (serviceRequest) => {
      const campaignId = serviceRequest.campaignId as string;
      if (!campaigns.campaignExists(campaignId)) throw new UnknownIdeaCampaignError();
      await verifyCampaignInputs(campaignId);
      const parentIdeaId = serviceRequest.parentIdeaId;
      if (typeof parentIdeaId === 'string' && ideas.ideaExists(parentIdeaId)) await verifyIdea(parentIdeaId);
      const result = await ideas.generate(serviceRequest, CONTENT_IDEA_ACTOR_ID);
      const verified = await verifyIdea(result.ideaId);
      return {
        contractVersion: '1.0.0', ideaId: verified.ideaId, campaignId: verified.campaignId, kind: verified.kind, code: result.code,
        attemptId: verified.attemptId, createdAt: verified.createdAt, exactRetry: result.deduplicated,
      };
    },
    state: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const ideaId = serviceRequest.ideaId as string;
      if (!ideas.ideaExists(ideaId)) throw new UnknownIdeaError();
      await verifyIdea(ideaId);
      const result = ideas.changeState(serviceRequest);
      return {
        contractVersion: '1.0.0', ideaId: result.ideaId, sequence: result.sequence, action: result.action, createdAt: result.createdAt,
        ...(result.restorableUntil ? { restorableUntil: result.restorableUntil } : {}), exactRetry: result.deduplicated,
      };
    }),
    purposeTag: (serviceRequest) => withDatabaseMutationMutex(db, async () => {
      const result = ideas.createPurposeTag(serviceRequest);
      return {
        contractVersion: '1.0.0', tagId: result.tagId, label: result.label, displayLike: result.displayLike, createdAt: result.createdAt,
        exactRetry: result.deduplicated,
      };
    }),
  };
}

/** Handles an idea route after the shared OWNER preamble (origin, preflight, method, token) has passed. */
export async function routeContentIdeaOwner(request: IncomingMessage, response: ServerResponse, route: ContentIdeaOwnerRoute, writers: ContentIdeaOwnerWriters): Promise<void> {
  if (singleHeader(request.headers['content-type']) !== 'application/json') return sendIdeaError(response, 400, 'bad_request', 'Content-Type must be application/json');
  try {
    const limit = route.kind === 'idea-generate' ? GENERATE_BODY_BYTES : route.kind === 'idea-state' ? STATE_BODY_BYTES : TAG_BODY_BYTES;
    const raw = (await readOwnerBytes(request, limit)).toString('utf8');
    let body: unknown;
    try { body = JSON.parse(raw); } catch { return sendIdeaError(response, 400, 'bad_request', 'Request body must be valid JSON'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return sendIdeaError(response, 400, 'bad_request', 'Invalid request');
    const fields = body as Record<string, unknown>;
    const optional = route.kind === 'idea-generate' ? 'parentIdeaId' : route.kind === 'idea-state' ? 'purposes' : undefined;
    const keys = Object.keys(fields).filter((key) => key !== optional).sort().join(',');
    const expectedKeys = {
      'idea-generate': 'contractVersion,kind,model,plannedCallCount,prompt,requestId',
      'idea-state': 'action,contractVersion,expectedSequence',
      'purpose-tag': 'contractVersion,displayLike,label',
    }[route.kind];
    if (keys !== expectedKeys) return sendIdeaError(response, 400, 'bad_request', 'Invalid request');
    const serviceRequest = route.kind === 'idea-generate' ? { ...fields, campaignId: route.campaignId }
      : route.kind === 'idea-state' ? { ...fields, ideaId: route.ideaId }
      : { ...fields };
    try {
      if (route.kind === 'idea-generate') validateContentIdeaGenerateRequest(serviceRequest);
      else if (route.kind === 'idea-state') validateContentIdeaStateRequest(serviceRequest);
      else validateContentPurposeTagRequest(serviceRequest);
    } catch (error) {
      if (error instanceof FlowValidationError) return sendIdeaError(response, 400, 'bad_request', 'Invalid request');
      throw error;
    }
    const receipt = route.kind === 'idea-generate' ? await writers.generate(serviceRequest)
      : route.kind === 'idea-state' ? await writers.state(serviceRequest)
      : await writers.purposeTag(serviceRequest);
    return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
  } catch (error) {
    if (error instanceof PayloadTooLargeError) return sendIdeaError(response, 400, 'bad_request', 'Request body is too large');
    if (error instanceof EmptyBodyError) return sendIdeaError(response, 400, 'bad_request', 'Request body is required');
    if (error instanceof UnknownIdeaCampaignError) return sendIdeaError(response, 404, 'not_found', 'Campaign not found');
    if (error instanceof UnknownIdeaError) return sendIdeaError(response, 404, 'not_found', 'Idea not found');
    // Service-level validation (e.g. parentIdeaId only for ANGLE, purposes only with PURPOSES).
    if (error instanceof FlowValidationError) return sendIdeaError(response, 400, 'bad_request', 'Invalid request');
    if (error instanceof ContentIdeaReferenceError) return sendIdeaError(response, 400, 'bad_request', 'Invalid idea reference');
    if (error instanceof ContentIdeaConflictError) return sendIdeaError(response, 409, 'conflict', 'Request conflicts with current state');
    if (error instanceof CreativeAiError && error.code === 'ai_not_configured') return sendIdeaError(response, 503, 'ai_unavailable', CREATIVE_AI_ERROR_MESSAGES.ai_not_configured);
    if (error instanceof CreativeAiError) return sendIdeaError(response, 502, 'ai_failed', CREATIVE_AI_ERROR_MESSAGES[error.code], error.code);
    if (error instanceof ContentIdeaOutputError) return sendIdeaError(response, 502, 'ai_failed', CREATIVE_AI_ERROR_MESSAGES.schema_mismatch, 'schema_mismatch');
    return sendIdeaError(response, 500, 'integrity_error', 'Stored content data failed integrity verification');
  }
}

function sendIdeaError(response: ServerResponse, status: number, code: OwnerContentIdeaApiErrorResponse['error']['code'], message: string, reason?: CreativeAiErrorCode): void {
  sendApiJson(response, status, { error: { code, message, ...(reason === undefined ? {} : { reason }) } } satisfies OwnerContentIdeaApiErrorResponse);
}

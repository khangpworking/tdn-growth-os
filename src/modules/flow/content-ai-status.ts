import {
  CREATIVE_MODEL_ROUTES,
  CREATIVE_MODELS,
  CreativeAiError,
  type CreativeAiErrorCode,
  type CreativeAiGateway,
  type CreativeModelAvailability,
} from '../../platform/ai/index.js';

/** AI availability for Content Studio: the five known models intersected with the gateway's listing (never added to). */
export interface ContentAiStatus {
  readonly configured: boolean;
  readonly checkedAt: string | null;
  readonly error?: CreativeAiErrorCode;
  readonly models: readonly CreativeModelAvailability[];
}

export interface ContentAiStatusSource { read(): Promise<ContentAiStatus> }

const SUCCESS_TTL_MS = 300_000;
const FAILURE_TTL_MS = 30_000;

function modelsWith(available: (id: CreativeModelAvailability['id']) => boolean): readonly CreativeModelAvailability[] {
  return CREATIVE_MODELS.map((id) => ({ id, kind: CREATIVE_MODEL_ROUTES[id].kind, available: available(id) }));
}

export const CONTENT_AI_NOT_CONFIGURED: ContentAiStatus = Object.freeze({
  configured: false, checkedAt: null, models: modelsWith(() => false),
});

export function createContentAiStatusSource(options: {
  gateway: CreativeAiGateway;
  clock: () => Date;
  successTtlMs?: number;
  failureTtlMs?: number;
}): ContentAiStatusSource {
  const { gateway, clock } = options;
  const successTtl = options.successTtlMs ?? SUCCESS_TTL_MS;
  const failureTtl = options.failureTtlMs ?? FAILURE_TTL_MS;
  let cached: { readonly status: ContentAiStatus; readonly expiresAt: number } | undefined;
  let inFlight: Promise<ContentAiStatus> | undefined;

  const refresh = async (): Promise<ContentAiStatus> => {
    let status: ContentAiStatus;
    let ttl: number;
    try {
      const listed = await gateway.listModels();
      const available = new Set(Array.isArray(listed) ? listed.filter((model) => model?.available === true).map((model) => model.id) : []);
      status = { configured: true, checkedAt: clock().toISOString(), models: modelsWith((id) => available.has(id)) };
      ttl = successTtl;
    } catch (error) {
      const code = error instanceof CreativeAiError ? error.code : 'network_error';
      status = { configured: true, checkedAt: clock().toISOString(), error: code, models: modelsWith(() => false) };
      ttl = failureTtl;
    }
    cached = { status, expiresAt: clock().getTime() + ttl };
    return status;
  };

  return {
    read() {
      if (!gateway.configured) return Promise.resolve(CONTENT_AI_NOT_CONFIGURED);
      if (cached && clock().getTime() < cached.expiresAt) return Promise.resolve(cached.status);
      inFlight ??= refresh().finally(() => { inFlight = undefined; });
      return inFlight;
    },
  };
}

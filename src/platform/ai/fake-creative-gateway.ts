import {
  CreativeAiError,
  type CreativeAiGateway,
  type CreativeImageRequest,
  type CreativeImageResult,
  type CreativeModelAvailability,
  type CreativeTextRequest,
  type CreativeTextResult,
} from './creative-ai-gateway.js';

/** One scripted reply: a result, or an error (any value) to reject with. */
export type FakeCreativeReply<T> = { readonly result: T } | { readonly error: unknown };

export interface FakeCreativeGatewayScript {
  readonly text?: readonly FakeCreativeReply<CreativeTextResult>[];
  readonly image?: readonly FakeCreativeReply<CreativeImageResult>[];
  readonly models?: readonly FakeCreativeReply<readonly CreativeModelAvailability[]>[];
}

export type FakeCreativeCall =
  | { readonly operation: 'generateText'; readonly request: CreativeTextRequest }
  | { readonly operation: 'generateImage'; readonly request: CreativeImageRequest }
  | { readonly operation: 'listModels' };

export interface FakeCreativeGateway extends CreativeAiGateway {
  readonly calls: readonly FakeCreativeCall[];
}

/** Scriptable gateway for tests: replies are consumed in order; an exhausted queue rejects. */
export function createFakeCreativeGateway(script: FakeCreativeGatewayScript = {}): FakeCreativeGateway {
  const text = [...(script.text ?? [])];
  const image = [...(script.image ?? [])];
  const models = [...(script.models ?? [])];
  const calls: FakeCreativeCall[] = [];
  const next = async <T>(queue: FakeCreativeReply<T>[], operation: string): Promise<T> => {
    const reply = queue.shift();
    if (!reply) throw new Error(`Fake creative gateway has no scripted ${operation} reply`);
    if ('error' in reply) throw reply.error;
    return reply.result;
  };
  return {
    configured: true,
    calls,
    generateText(request) {
      calls.push({ operation: 'generateText', request });
      return next(text, 'generateText');
    },
    generateImage(request) {
      calls.push({ operation: 'generateImage', request });
      return next(image, 'generateImage');
    },
    listModels() {
      calls.push({ operation: 'listModels' });
      return next(models, 'listModels');
    },
  };
}

/** Gateway used when CLIProxy is not configured: every operation rejects with `ai_not_configured`. */
export function disabledCreativeGateway(): CreativeAiGateway {
  const reject = () => Promise.reject(new CreativeAiError('ai_not_configured'));
  return { configured: false, generateText: reject, generateImage: reject, listModels: reject };
}

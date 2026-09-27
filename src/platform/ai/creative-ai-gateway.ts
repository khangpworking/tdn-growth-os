import type { ContentPromptModel } from '../../../contracts/api/content-api.generated.js';

/**
 * Port for Content Studio creative AI calls (text and image generation) through CLIProxy.
 * Separate from the analysis `AiGateway`, which stays unchanged.
 */

export type CreativeTextModel = 'gpt-5.6-sol' | 'gpt-5.6-luna' | 'gemini-3.5-flash-low';
export type CreativeImageModel = 'gpt-image-2' | 'gemini-3.1-flash-image';
export type CreativeModel = CreativeTextModel | CreativeImageModel;
export type CreativeEndpointFamily = 'openai-chat' | 'openai-image' | 'gemini-image';

// Compile-time proof that the creative model set equals the prompt library's model enum.
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const creativeModelMatchesPromptModel: MutuallyAssignable<CreativeModel, ContentPromptModel> = true;
void creativeModelMatchesPromptModel;

export interface CreativeModelRoute {
  readonly kind: 'text' | 'image';
  readonly family: CreativeEndpointFamily;
  /** Provisional: equals the enum value until Task 053 verifies the ids CLIProxy exposes. */
  readonly providerModelId: string;
}

export const CREATIVE_MODEL_ROUTES: Readonly<Record<CreativeModel, CreativeModelRoute>> = Object.freeze({
  'gpt-5.6-sol': Object.freeze({ kind: 'text', family: 'openai-chat', providerModelId: 'gpt-5.6-sol' }),
  'gpt-5.6-luna': Object.freeze({ kind: 'text', family: 'openai-chat', providerModelId: 'gpt-5.6-luna' }),
  'gemini-3.5-flash-low': Object.freeze({ kind: 'text', family: 'openai-chat', providerModelId: 'gemini-3.5-flash-low' }),
  'gpt-image-2': Object.freeze({ kind: 'image', family: 'openai-image', providerModelId: 'gpt-image-2' }),
  'gemini-3.1-flash-image': Object.freeze({ kind: 'image', family: 'gemini-image', providerModelId: 'gemini-3.1-flash-image' }),
});

export const CREATIVE_MODELS: readonly CreativeModel[] = Object.freeze(Object.keys(CREATIVE_MODEL_ROUTES) as CreativeModel[]);

export interface CreativeUsage { readonly inputTokens?: number; readonly outputTokens?: number }

export interface CreativeTextRequest {
  readonly model: CreativeTextModel;
  readonly systemLayer: string;
  readonly creativeLayer: string;
  readonly userInput: string;
  /** 0–2, default 0.7. */
  readonly temperature?: number;
  readonly responseFormat?: { readonly name: string; readonly jsonSchema: Readonly<Record<string, unknown>> };
  /** Integer 1–32768. */
  readonly maxOutputTokens?: number;
}

export interface CreativeTextResult {
  readonly text: string;
  readonly usage?: CreativeUsage;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface CreativeReferenceImage { readonly bytes: Buffer; readonly mediaType: 'image/png' | 'image/jpeg' }

export type CreativeImageFormat = 'square' | 'portrait' | 'story' | 'landscape';

/** Presets carried over from the old runner (content-automation-poster-jobs-contract.mjs). */
export const CREATIVE_IMAGE_FORMATS: Readonly<Record<CreativeImageFormat, {
  readonly gptSize: string;
  readonly geminiAspectRatio: string;
  readonly width: number;
  readonly height: number;
}>> = Object.freeze({
  square: Object.freeze({ gptSize: '1088x1088', geminiAspectRatio: '1:1', width: 1088, height: 1088 }),
  portrait: Object.freeze({ gptSize: '1088x1360', geminiAspectRatio: '4:5', width: 1088, height: 1360 }),
  story: Object.freeze({ gptSize: '1152x2048', geminiAspectRatio: '9:16', width: 1152, height: 2048 }),
  landscape: Object.freeze({ gptSize: '2048x1152', geminiAspectRatio: '16:9', width: 2048, height: 1152 }),
});

export interface CreativeImageRequest {
  readonly model: CreativeImageModel;
  readonly prompt: string;
  readonly format: CreativeImageFormat;
  /** 0–4 references; order is preserved on the wire. */
  readonly references: readonly CreativeReferenceImage[];
}

export interface CreativeImageResult {
  readonly bytes: Buffer;
  /** From the envelope or data URL, if any; the attempts service sniffs the bytes and cross-checks. */
  readonly declaredMediaType?: string;
  readonly usage?: CreativeUsage;
  readonly latencyMs: number;
  readonly providerRequestId?: string;
}

export interface CreativeModelAvailability { readonly id: CreativeModel; readonly kind: 'text' | 'image'; readonly available: boolean }

export interface CreativeAiGateway {
  readonly configured: boolean;
  generateText(request: CreativeTextRequest): Promise<CreativeTextResult>;
  generateImage(request: CreativeImageRequest): Promise<CreativeImageResult>;
  listModels(): Promise<readonly CreativeModelAvailability[]>;
}

export type CreativeAiErrorCode =
  | 'ai_not_configured'
  | 'model_not_allowed'
  | 'request_too_large'
  | 'timeout'
  | 'network_error'
  | 'gateway_http_error'
  | 'malformed_envelope'
  | 'response_too_large'
  | 'invalid_image'
  | 'schema_mismatch';

export const CREATIVE_AI_ERROR_MESSAGES: Readonly<Record<CreativeAiErrorCode, string>> = Object.freeze({
  ai_not_configured: 'Chưa cấu hình AI',
  model_not_allowed: 'Mô hình AI không được phép dùng',
  request_too_large: 'Yêu cầu gửi AI vượt quá giới hạn',
  timeout: 'AI không phản hồi trong thời hạn',
  network_error: 'Không kết nối được tới cổng AI',
  gateway_http_error: 'Cổng AI trả về lỗi',
  malformed_envelope: 'Phản hồi của AI không đúng định dạng',
  response_too_large: 'Phản hồi của AI vượt quá giới hạn',
  invalid_image: 'Ảnh AI trả về không hợp lệ',
  schema_mismatch: 'Kết quả AI không khớp cấu trúc yêu cầu',
});

export const CREATIVE_AI_ERROR_CODES: readonly CreativeAiErrorCode[] = Object.freeze(Object.keys(CREATIVE_AI_ERROR_MESSAGES) as CreativeAiErrorCode[]);

/** Safe error: fixed message per code, never provider text, URLs, headers or the key, and never a `cause`. */
export class CreativeAiError extends Error {
  constructor(readonly code: CreativeAiErrorCode, readonly httpStatus?: number) {
    super(CREATIVE_AI_ERROR_MESSAGES[code]);
    this.name = 'CreativeAiError';
  }
}

export function isCreativeModel(value: unknown): value is CreativeModel {
  return typeof value === 'string' && Object.hasOwn(CREATIVE_MODEL_ROUTES, value);
}

export function isCreativeAiErrorCode(value: unknown): value is CreativeAiErrorCode {
  return typeof value === 'string' && Object.hasOwn(CREATIVE_AI_ERROR_MESSAGES, value);
}

import { createHash } from 'node:crypto';

import { CoverImageError, MAX_COVER_JPEG_BYTES, fallbackCoverJpeg, optimizeCoverPng } from './cover-image-codec.js';

/** One generic, truthful cover per Market report: AI illustration when configured, else a procedural fallback. Provenance, never a licence. */
export const MARKET_COVER_CONTRACT = 'automation-market-cover-v1';
export const MARKET_COVER_PROMPT_VERSION = 'market-cover-prompt-v1';
export const MARKET_COVER_MODEL = 'gpt-image-2';
export const MARKET_COVER_TIMEOUT_MS = 180_000;
export type MarketCoverFallbackReason = 'COVER_AI_NOT_CONFIGURED' | 'COVER_AI_FAILED' | 'COVER_AI_TOO_LARGE' | 'COVER_AI_INVALID_IMAGE';
export type MarketCoverProvenance = 'ai-generated' | 'fallback';
export interface MarketCoverRecord {
  contractVersion: typeof MARKET_COVER_CONTRACT; provenance: MarketCoverProvenance; model: typeof MARKET_COVER_MODEL | null;
  promptVersion: typeof MARKET_COVER_PROMPT_VERSION; promptSha256: string; imageSha256: string; mime: 'image/jpeg';
  byteSize: number; width: number; height: number; fallbackReason?: MarketCoverFallbackReason;
}
export interface MarketCoverAi { generate(prompt: string): Promise<{ bytes: Buffer; model: typeof MARKET_COVER_MODEL }> }
export interface MarketCover { record: MarketCoverRecord; bytes: Buffer }

const sha256 = (value: string | Uint8Array): string => createHash('sha256').update(value).digest('hex');
const REASONS: readonly string[] = ['COVER_AI_NOT_CONFIGURED', 'COVER_AI_FAILED', 'COVER_AI_TOO_LARGE', 'COVER_AI_INVALID_IMAGE'];

export function marketCoverKeyword(keyword: string): string {
  return [...String(keyword).normalize('NFC').replace(/[\p{Cc}"'`<>“”‘’«»]/gu, ' ').replace(/\s+/gu, ' ').trim()].slice(0, 120).join('').trim();
}

export function marketCoverPrompt(keyword: string): string {
  const category = marketCoverKeyword(keyword) || 'everyday consumer goods';
  return `A generic, truthful editorial illustration of the product category "${category}". Show the category in general, not a specific product, brand, shop or package. `
    + 'No text, letters, numbers, logos, brand marks, packaging labels, prices, charts, marketplace or platform marks, user interface, watermarks or people\'s faces. '
    + 'Soft light background, calm natural lighting, landscape composition.';
}

export function marketCoverAlt(keyword: string, provenance: MarketCoverProvenance): string {
  return provenance === 'ai-generated'
    ? `Minh hoạ chung do AI tạo cho nhóm sản phẩm “${marketCoverKeyword(keyword)}”; không phải ảnh sản phẩm hoặc gian hàng cụ thể.`
    : 'Hình trang trí chung cho báo cáo; không phải ảnh sản phẩm.';
}

export function verifyMarketCoverRecord(value: unknown): MarketCoverRecord {
  const fail = (): never => { throw new TypeError('Market cover record is invalid.'); };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  const record = value as Record<string, unknown>, fallback = record.provenance === 'fallback';
  const keys = ['contractVersion', 'provenance', 'model', 'promptVersion', 'promptSha256', 'imageSha256', 'mime', 'byteSize', 'width', 'height', ...(fallback ? ['fallbackReason'] : [])];
  const hex = (item: unknown): boolean => typeof item === 'string' && /^[a-f0-9]{64}$/.test(item);
  const size = (item: unknown, max: number): boolean => Number.isSafeInteger(item) && (item as number) > 0 && (item as number) <= max;
  if (Object.keys(record).sort().join(',') !== [...keys].sort().join(',') || record.contractVersion !== MARKET_COVER_CONTRACT ||
      (record.provenance !== 'ai-generated' && !fallback) || record.model !== (fallback ? null : MARKET_COVER_MODEL) ||
      record.promptVersion !== MARKET_COVER_PROMPT_VERSION || !hex(record.promptSha256) || !hex(record.imageSha256) || record.mime !== 'image/jpeg' ||
      !size(record.byteSize, MAX_COVER_JPEG_BYTES) || !size(record.width, 1024) || !size(record.height, 576) ||
      (fallback && !REASONS.includes(record.fallbackReason as string))) return fail();
  return record as unknown as MarketCoverRecord;
}

const reusable = (reuse: MarketCover | undefined, promptSha256: string): boolean => {
  if (!reuse) return false;
  try {
    const record = verifyMarketCoverRecord(reuse.record);
    return record.provenance === 'ai-generated' && record.promptSha256 === promptSha256 && Buffer.isBuffer(reuse.bytes) &&
      reuse.bytes.byteLength === record.byteSize && sha256(reuse.bytes) === record.imageSha256;
  } catch { return false; }
};

export async function buildMarketCover(options: { keyword: string; ai?: MarketCoverAi | undefined; timeoutMs?: number; reuse?: MarketCover | undefined }): Promise<MarketCover> {
  const prompt = marketCoverPrompt(options.keyword), promptSha256 = sha256(prompt);
  const base = { contractVersion: MARKET_COVER_CONTRACT, promptVersion: MARKET_COVER_PROMPT_VERSION, promptSha256, mime: 'image/jpeg' } as const;
  if (reusable(options.reuse, promptSha256)) return { record: { ...options.reuse!.record }, bytes: options.reuse!.bytes };
  const fallback = (fallbackReason: MarketCoverFallbackReason): MarketCover => {
    const bytes = fallbackCoverJpeg();
    return { bytes, record: { contractVersion: base.contractVersion, provenance: 'fallback', model: null, promptVersion: base.promptVersion, promptSha256,
      imageSha256: sha256(bytes), mime: 'image/jpeg', byteSize: bytes.byteLength, width: 1024, height: 576, fallbackReason } };
  };
  if (!options.ai) return fallback('COVER_AI_NOT_CONFIGURED');
  let timer: NodeJS.Timeout | undefined;
  try {
    const generated = await Promise.race([
      options.ai.generate(prompt),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Cover generation timed out.')), options.timeoutMs ?? MARKET_COVER_TIMEOUT_MS); }),
    ]);
    if (generated?.model !== MARKET_COVER_MODEL || !Buffer.isBuffer(generated.bytes)) return fallback('COVER_AI_FAILED');
    const image = optimizeCoverPng(generated.bytes);
    return { bytes: image.bytes, record: { contractVersion: base.contractVersion, provenance: 'ai-generated', model: MARKET_COVER_MODEL,
      promptVersion: base.promptVersion, promptSha256, imageSha256: sha256(image.bytes), mime: 'image/jpeg', byteSize: image.bytes.byteLength,
      width: image.width, height: image.height } };
  } catch (error) {
    return fallback(error instanceof CoverImageError ? error.code : 'COVER_AI_FAILED');
  } finally { if (timer) clearTimeout(timer); }
}

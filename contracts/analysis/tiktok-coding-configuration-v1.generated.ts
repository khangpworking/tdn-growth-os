/* Generated from tiktok-coding-configuration-v1.schema.json. Do not edit by hand. */

/**
 * Explicit TikTok draft-coding model dispatch configuration. The model id records what was requested; it is never selected automatically. Enabling TikTok coding never enables any other model path.
 */
export interface TikTokCodingConfiguration {
  contractVersion: 'tiktok-coding-configuration-v1';
  providerId: string;
  modelId: string;
  temperature: null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}

/* Generated from automation-i14-synthesis-configuration.schema.json. Do not edit by hand. */

/**
 * Resolved non-secret I14 text-generation configuration. Credentials, endpoints and headers belong to the transport and are never retained here. A provider or model id records what was resolved; it does not establish availability.
 */
export interface AutomationI14SynthesisConfiguration {
  contractVersion: '1.0.0';
  methodId: 'automation-i14-synthesis-configuration';
  providerId: string;
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}

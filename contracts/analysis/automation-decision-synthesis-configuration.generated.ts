/* Generated from automation-decision-synthesis-configuration.schema.json. Do not edit by hand. */

/**
 * Explicit non-secret text configuration for one M11/M12/I15 synthesis. This does not enable I14 or any provider. Secrets and endpoints remain transport-only.
 */
export interface AutomationDecisionSynthesisConfiguration {
  contractVersion: '1.0.0';
  methodId: 'automation-decision-synthesis-configuration';
  sectionId: 'M11' | 'M12' | 'I15';
  providerId: string;
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}

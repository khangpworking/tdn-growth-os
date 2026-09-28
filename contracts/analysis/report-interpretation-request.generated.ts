/* Generated from report-interpretation-request.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportInterpretationRequest {
  contractVersion: '1.0.0';
  semanticVersionId: Digest;
  packetId: Digest;
  /**
   * @minItems 1
   * @maxItems 30
   */
  sectionIds: string[];
}

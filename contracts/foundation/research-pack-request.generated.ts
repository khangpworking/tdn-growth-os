/* Generated from research-pack-request.schema.json. Do not edit by hand. */

export interface ResearchPackRequest {
  contractVersion: '1.0.0';
  packKey: string;
  version: number;
  purpose: string;
  /**
   * @minItems 1
   */
  documentIds: [string, ...string[]];
  supersedesPackId?: string;
}

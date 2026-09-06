/* Generated from data-pack-request.schema.json. Do not edit by hand. */

export interface DataPackRequest {
  contractVersion: '1.0.0';
  packKey: string;
  version: number;
  purpose: string;
  /**
   * @minItems 1
   */
  observationIds: [string, ...string[]];
  supersedesPackId?: string;
}

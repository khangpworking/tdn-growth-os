/* Generated from report-interpretation-output.schema.json. Do not edit by hand. */

export type Item = {
  [k: string]: unknown;
} & {
  sectionId: string;
  kind: 'INTERPRETATION' | 'HYPOTHESIS';
  conclusion: Text;
  evidenceLogic: Text;
  /**
   * @minItems 1
   * @maxItems 12
   */
  supportingClaimIds: string[];
  /**
   * @maxItems 8
   */
  assumptions: ShortText[];
  /**
   * @minItems 1
   * @maxItems 8
   */
  limitations: ShortText[];
};
export type Text = string;
export type ShortText = string;

export interface ReportInterpretationOutput {
  /**
   * @minItems 1
   * @maxItems 30
   */
  items: Item[];
}

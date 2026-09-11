/* Generated from stp-content.schema.json. Do not edit by hand. */

export type SegmentKey = string;

export interface StpContent {
  /**
   * @minItems 1
   * @maxItems 100
   */
  segments: [Segment, ...Segment[]];
  primaryTargetSegmentKey: SegmentKey;
  /**
   * @maxItems 99
   */
  secondaryTargetSegmentKeys?: SegmentKey[];
  positioningStatement: string;
}
export interface Segment {
  key: SegmentKey;
  label: string;
  description?: string;
}

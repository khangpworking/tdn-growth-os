/* Generated from stp-working-save-request.schema.json. Do not edit by hand. */

/**
 * @minItems 1
 * @maxItems 100
 */
export type Segments = [Segment, ...Segment[]];
/**
 * @maxItems 99
 */
export type SecondaryTargetSegmentKeys = string[];

export interface StpWorkingSaveRequest {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  b8ClearanceId: string;
  expectedWorkingDigest: null | string;
  segments: Segments;
  primaryTargetSegmentKey: string;
  secondaryTargetSegmentKeys?: SecondaryTargetSegmentKeys;
  positioningStatement: string;
}
export interface Segment {
  key: string;
  label: string;
  description?: string;
}

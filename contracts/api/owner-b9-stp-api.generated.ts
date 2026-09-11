/* Generated from owner-b9-stp-api.schema.json. Do not edit by hand. */

export type OwnerB9StpApiContract =
  OwnerB9WorkingRequest | OwnerB9WorkingReceipt | OwnerB9LockRequest | OwnerB9LockReceipt;
export type Uuid = string;
export type WorkingRevision = string;
export type SegmentKey = string;

export interface OwnerB9WorkingRequest {
  contractVersion: '1.0.0';
  b8ClearanceId: Uuid;
  expectedWorkingRevision: null | WorkingRevision;
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
export interface OwnerB9WorkingReceipt {
  contractVersion: '1.0.0';
  workingStpId: Uuid;
  productWorkspaceId: Uuid;
  workingRevision: WorkingRevision;
  createdAt: string;
  updatedAt: string;
  exactRetry: boolean;
}
export interface OwnerB9LockRequest {
  contractVersion: '1.0.0';
  expectedWorkingRevision: WorkingRevision;
}
export interface OwnerB9LockReceipt {
  contractVersion: '1.0.0';
  lockId: Uuid;
  state: 'LOCKED_STP';
  lockedAt: string;
  exactRetry: boolean;
}

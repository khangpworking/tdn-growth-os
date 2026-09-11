/* Generated from owner-b8-clearance-api.schema.json. Do not edit by hand. */

export type OwnerB8ClearanceApiContract = OwnerB8ClearanceRequest | OwnerB8ClearanceReceipt;
export type Uuid = string;

export interface OwnerB8ClearanceRequest {
  contractVersion: '1.0.0';
  decisionIds: {
    LEGAL: Uuid;
    SCIENTIFIC: Uuid;
    QUALITY: Uuid;
    FINANCE: Uuid;
  };
}
export interface OwnerB8ClearanceReceipt {
  contractVersion: '1.0.0';
  clearanceId: Uuid;
  state: 'READY_FOR_B9';
  clearedAt: string;
  exactRetry: boolean;
}

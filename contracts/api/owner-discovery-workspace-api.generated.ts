/* Generated from owner-discovery-workspace-api.schema.json. Do not edit by hand. */

export type OwnerDiscoveryWorkspaceApiContract = OwnerDiscoveryWorkspaceRequest | OwnerDiscoveryWorkspaceReceipt;
export type Uuid = string;

export interface OwnerDiscoveryWorkspaceRequest {
  contractVersion: '1.0.0';
  workspaceKey: string;
  title: string;
  description?: string;
}
export interface OwnerDiscoveryWorkspaceReceipt {
  contractVersion: '1.0.0';
  workspaceId: Uuid;
  workspaceKey: string;
  state: 'ACTIVE';
  title: string;
  description?: string;
  createdAt: string;
  exactRetry: boolean;
}

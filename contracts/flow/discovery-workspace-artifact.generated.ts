/* Generated from discovery-workspace-artifact.schema.json. Do not edit by hand. */

export interface DiscoveryWorkspaceArtifact {
  contractVersion: '1.0.0';
  workspaceId: string;
  workspaceKey: string;
  state: 'ACTIVE';
  title: string;
  description?: string;
  createdAt: string;
  requestSha256: string;
}

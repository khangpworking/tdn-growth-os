/* Generated from b8-clearance-create-request.schema.json. Do not edit by hand. */

export interface B8ClearanceCreateRequest {
  contractVersion: '1.0.0';
  productWorkspaceId: string;
  decisions: {
    LEGAL: string;
    SCIENTIFIC: string;
    QUALITY: string;
    FINANCE: string;
  };
}

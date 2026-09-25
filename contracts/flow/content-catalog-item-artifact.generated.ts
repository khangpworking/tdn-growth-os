/* Generated from content-catalog-item-artifact.schema.json. Do not edit by hand. */

export type ContentCatalogItemType = 'PHYSICAL' | 'SERVICE';

export interface ContentCatalogItemArtifact {
  contractVersion: '1.0.0';
  itemId: string;
  brandId: string;
  itemKey: string;
  version: number;
  item: ContentCatalogItemContent;
  createdAt: string;
  requestSha256: string;
}
export interface ContentCatalogItemContent {
  itemType: ContentCatalogItemType;
  name: string;
  description?: string;
  /**
   * @maxItems 8
   */
  tiers:
    | []
    | [ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ];
  /**
   * @maxItems 12
   */
  photos:
    | []
    | [ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ];
}
export interface ContentCatalogTier {
  tierKey: string;
  name: string;
  priceText?: string;
  /**
   * @maxItems 12
   */
  inclusions:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}
export interface ContentCatalogPhoto {
  mediaSha256: string;
  posterDefault: boolean;
}

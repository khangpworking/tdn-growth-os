/* Generated from content-catalog-item-revision-request.schema.json. Do not edit by hand. */

export type ContentCatalogItemType = 'PHYSICAL' | 'SERVICE';

export interface ContentCatalogItemRevisionRequest {
  contractVersion: '1.0.0';
  itemId: string;
  expectedVersion: number;
  item: ContentCatalogItemContent;
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

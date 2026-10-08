/* Generated from private-review-report-view.schema.json. Do not edit by hand. */

/**
 * Author/key-free report evidence view. Exact retained corpus digest and source locators support owning-service replay; neither schema validation nor counts authenticate people. Verbatim source prose may still contain personal data.
 */
export interface PrivateReviewReportView {
  contractVersion: 'private-review-report-view-v1';
  corpus: {
    artifactSha256: string;
    corpusId: string;
    collectionId: string;
    collectionSha256: string;
    requestSha256: string;
  };
  capture: {
    mode: 'fixture' | 'live';
    retrievedAt: string;
  };
  /**
   * @maxItems 2500
   */
  records: {
    recordId: string;
    shopId: string | null;
    itemId: string | null;
    text: string | null;
    textState: 'READABLE' | 'EMPTY' | 'UNREADABLE';
    /**
     * Source rating presence/state; never manufacture an absent source field. Invalid finite safe numeric source values survive, arbitrary strings/nested values do not.
     */
    rating:
      | {
          fieldPresent: false;
          state: 'ABSENT';
          value: null;
        }
      | {
          fieldPresent: true;
          state: 'MISSING';
          value: null;
        }
      | {
          fieldPresent: true;
          state: 'VALID';
          value: number;
        }
      | {
          fieldPresent: true;
          state: 'INVALID';
          value: null | number;
        };
    createdAt: string | null;
    region: string | null;
    admission: 'SELECTED_TEXT' | 'OTHER_LISTING' | 'UNRESOLVED_LISTING' | 'NO_READABLE_TEXT';
    locator: Locator;
  }[];
  accounting: {
    retainedRecords: number;
    selectedTextRecords: number;
    distinctContents: number;
    missingIdentityRecords: number;
    invalidIdentityRecords: number;
  };
  missingIdentityLabel: 'nguồn không có mã người viết';
  fallbackRequirement: '>=5 distinct contents, chưa xác minh là 5 người';
  limits: [
    'SOURCE_REPORTED_IDS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE',
    'WITHIN_SHOPEE_AND_ONE_KEY_ONLY',
    'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA',
    'SANITIZED_BYTES_NOT_ERASED_RAW_BYTE_RECONSTRUCTION',
    'NO_PERSONA_ELIGIBILITY_DECISION',
  ];
}
export interface Locator {
  collectionId: string;
  pageSha256: string;
  pageIndex: number;
  rowIndex: number;
  textPointer: string;
}

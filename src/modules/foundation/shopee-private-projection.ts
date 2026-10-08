import type { VerifiedPrivateShopeeCollection } from './shopee-collection-service.js';
import type { ShopeePrivateProjection } from '../../../contracts/foundation/shopee-private-projection.generated.js';
import { validatePrivateCollection, validatePrivateProjection, validatePrivateRows } from './shopee-private-contracts.js';
import { digest, jsonBytes, parseJsonBytes } from './shopee-selection.js';

/** Reads only finalized sanitized bytes. Hashes attest reported IDs, not independently verified people. */
export function projectPrivateShopeeCollection(source: VerifiedPrivateShopeeCollection): ShopeePrivateProjection {
  const packet = validatePrivateCollection(source.packet);
  if (digest(jsonBytes(packet)) !== source.sha256) throw new Error('Private source packet integrity mismatch');
  if (packet.pages.length !== source.pages.length) throw new Error('Private source page membership mismatch');
  const selected = new Set(packet.selected.map(row => `${row.shopId}:${row.itemId}`));
  const records: ShopeePrivateProjection['records'] = [];
  const hashes = new Set<string>(); const distinctContents = new Set<string>();
  let missing = 0; let invalid = 0;
  source.pages.forEach((page, pageIndex) => {
    const retained = packet.pages[pageIndex]!;
    if (digest(page.bytes) !== page.sha256 || retained.sha256 !== page.sha256 || retained.byteSize !== page.bytes.length || retained.offset !== page.offset) throw new Error('Private source page integrity mismatch');
    validatePrivateRows(parseJsonBytes(page.bytes)).forEach((row, rowIndex) => {
      const admission = row.shopId === null || row.itemId === null ? 'UNRESOLVED_LISTING' as const
        : !selected.has(`${row.shopId}:${row.itemId}`) ? 'OTHER_LISTING' as const
        : row.comment === null || row.comment.trim() === '' ? 'NO_READABLE_TEXT' as const : 'SELECTED_TEXT' as const;
      if (admission === 'SELECTED_TEXT') {
        distinctContents.add(row.comment!);
        if (row.authorIdentity.state === 'HASHED') hashes.add(row.authorIdentity.hash!);
        else if (row.authorIdentity.state === 'MISSING') missing++; else invalid++;
      }
      records.push({ ...row, admission, locator: { collectionId: packet.collectionId, pageSha256: page.sha256,
        pageIndex, rowIndex, textPointer: `/${rowIndex}/comment` } });
    });
  });
  const selectedTextRecords = records.filter(row => row.admission === 'SELECTED_TEXT').length;
  return validatePrivateProjection({ contractVersion: 'shopee-private-projection-v1', collectionId: packet.collectionId,
    collectionSha256: source.sha256, privacy: packet.privacy, records,
    accounting: { retainedRecords: records.length, selectedTextRecords, distinctContents: distinctContents.size,
      reportedAuthorHashes: hashes.size === 0 ? null : hashes.size, missingIdentityRecords: missing, invalidIdentityRecords: invalid,
      identityCoverage: hashes.size === 0 ? 'UNAVAILABLE' : missing + invalid > 0 ? 'PARTIAL' : 'COMPLETE_IN_CAPTURE' },
    missingIdentityLabel: 'nguồn không có mã người viết',
    fallbackRequirement: '>=5 distinct contents, chưa xác minh là 5 người',
    limits: ['SOURCE_REPORTED_IDS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE', 'WITHIN_SHOPEE_AND_ONE_KEY_ONLY',
      'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA', 'SANITIZED_BYTES_NOT_ERASED_RAW_BYTE_RECONSTRUCTION', 'NO_PERSONA_ELIGIBILITY_DECISION'] });
}

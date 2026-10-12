/** No authentic pinned sheet/header witness is present in ST-20261008-08.
 * Reject before parsing, storing, admission or model/provider calls. A caller's sheet label is not a witness. */
export const MAX_OFFICIAL_STATISTICS_UPLOAD_BYTES = 20 * 1024 * 1024;
export class OfficialStatisticsSourceRejection extends Error {
  constructor(readonly code: 'OFFICIAL_STATS_LAYOUT_UNKNOWN' | 'OFFICIAL_STATS_FILE_SIZE_LIMIT', readonly locator: string) {
    super(`${locator}: ${code}`);
  }
}
export function inspectOfficialStatisticsSource(bytes: Uint8Array): never {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_OFFICIAL_STATISTICS_UPLOAD_BYTES) {
    throw new OfficialStatisticsSourceRejection('OFFICIAL_STATS_FILE_SIZE_LIMIT', 'workbook');
  }
  throw new OfficialStatisticsSourceRejection('OFFICIAL_STATS_LAYOUT_UNKNOWN', 'workbook');
}

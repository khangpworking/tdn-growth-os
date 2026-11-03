/**
 * The declared shape of db-v1 `review.attributes_json`, one per source (data/raw-sources/KHUON-CSDL.md §3). The column
 * stays per source; every review insert path checks its value here, and a wrong shape fails the whole load.
 * - S05: NULL, or a non-empty JSON array of non-empty strings (the Shopee review tags, in source order).
 * - S06: NULL only (no attributes are stored yet).
 * - S07: a JSON object with `textForm` = "SANITIZED" and only these optional keys: `byVideoAuthor` (true),
 *   `likedByAuthor` and `pinnedByAuthor` (booleans), `exclusionReason` (REPLY, EMPTY, TAG_ONLY, EMOJI_ONLY).
 */
const S07_EXCLUSIONS = new Set(['REPLY', 'EMPTY', 'TAG_ONLY', 'EMOJI_ONLY']);

const SHAPES: Record<string, (value: unknown) => boolean> = {
  S05: value => value === null || (Array.isArray(value) && value.length > 0 && value.every(item => typeof item === 'string' && item.trim() !== '')),
  S06: value => value === null,
  S07: value => {
    if (!isRecord(value) || value.textForm !== 'SANITIZED') return false;
    return Object.entries(value).every(([key, item]) =>
      key === 'textForm' ||
      key === 'byVideoAuthor' && item === true ||
      (key === 'likedByAuthor' || key === 'pinnedByAuthor') && typeof item === 'boolean' ||
      key === 'exclusionReason' && typeof item === 'string' && S07_EXCLUSIONS.has(item));
  },
};

/** Throws RAW_DB_ATTRIBUTES_SHAPE unless `attributesJson` (the column text, or NULL) has the declared shape of `sourceCode`. */
export function assertAttributesShape(sourceCode: string, attributesJson: string | null, where: string): void {
  const shape = Object.hasOwn(SHAPES, sourceCode) ? SHAPES[sourceCode] : undefined;
  if (!shape) throw new Error(`RAW_DB_ATTRIBUTES_SHAPE: no declared attributes_json shape for source ${sourceCode}`);
  let value: unknown = null;
  if (attributesJson !== null) {
    try { value = JSON.parse(attributesJson); } catch { value = undefined; }
    // JSON null text is not the SQL NULL the column uses for "none".
    if (value === null) value = undefined;
  }
  if (!shape(value)) throw new Error(`RAW_DB_ATTRIBUTES_SHAPE: ${where} attributes_json does not have the ${sourceCode} shape`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

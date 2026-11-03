-- db-v1 `video` table (data/raw-sources/KHUON-CSDL.md §4.1a, §5): one row per video, first used by S07 TikTok
-- comments (review.video_url → video). Product link only when the source records it; never guessed.
-- Rows are append-only. Touches no existing table.
CREATE TABLE video (
  video_url   TEXT PRIMARY KEY,
  video_id    TEXT,
  platform    TEXT NOT NULL DEFAULT 'tiktok',
  product_key TEXT REFERENCES product(product_key),
  brand       TEXT,
  author_key  TEXT,
  link_basis  TEXT NOT NULL CHECK (link_basis IN ('PROVIDER_LINK','SELECTED_FROM_PRODUCT','UNKNOWN')),
  capture_id  TEXT NOT NULL REFERENCES raw_capture(capture_id),
  CHECK (link_basis = 'UNKNOWN' OR product_key IS NOT NULL)
) STRICT;

CREATE TRIGGER video_no_update BEFORE UPDATE ON video BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video'); END;
CREATE TRIGGER video_no_delete BEFORE DELETE ON video BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video'); END;

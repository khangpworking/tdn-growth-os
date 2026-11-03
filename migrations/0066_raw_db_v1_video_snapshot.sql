-- db-v1 `video_snapshot` table (data/raw-sources/KHUON-CSDL.md §4.1b, §5): one row per ranked video of one S02b
-- Kalodata video call (kalodata.video.rank). Figures are provider estimates for the request's date window; the title
-- is kept exactly as the source gives it. Rows are append-only. Touches no existing table.
CREATE TABLE video_snapshot (
  capture_id           TEXT NOT NULL REFERENCES raw_capture(capture_id),
  video_url            TEXT NOT NULL REFERENCES video(video_url),
  source_code          TEXT NOT NULL CHECK (source_code = 'S02b'),
  window_start         TEXT NOT NULL,
  window_end           TEXT NOT NULL,
  rank                 INTEGER NOT NULL CHECK (rank >= 1),
  title                TEXT,
  published_at         TEXT,
  revenue_vnd          REAL CHECK (revenue_vnd BETWEEN 0 AND 1.7976931348623157e308),
  revenue_growth_rate  REAL CHECK (revenue_growth_rate BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
  views                INTEGER CHECK (views >= 0),
  likes                INTEGER CHECK (likes >= 0),
  shares               INTEGER CHECK (shares >= 0),
  comments             INTEGER CHECK (comments >= 0),
  is_ad                INTEGER CHECK (is_ad IN (0,1)),
  ad_revenue_share_pct REAL CHECK (ad_revenue_share_pct BETWEEN 0 AND 1.7976931348623157e308),
  ad_view_share_pct    REAL CHECK (ad_view_share_pct BETWEEN 0 AND 1.7976931348623157e308),
  ads_roas             REAL CHECK (ads_roas BETWEEN 0 AND 1.7976931348623157e308),
  is_ai_video          INTEGER CHECK (is_ai_video IN (0,1)),
  precision            TEXT NOT NULL CHECK (precision = 'provider_estimate'),
  PRIMARY KEY (capture_id, video_url)
) STRICT;

CREATE TRIGGER video_snapshot_no_update BEFORE UPDATE ON video_snapshot BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_snapshot'); END;
CREATE TRIGGER video_snapshot_no_delete BEFORE DELETE ON video_snapshot BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_snapshot'); END;

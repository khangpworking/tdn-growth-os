-- db-v1 `video_reading` and `video_segment` tables (data/raw-sources/KHUON-CSDL.md §4.1c, §5): one row per S14 video
-- reading (the Gemini videowatch.generate call that produced it) and one row per spoken line or on-screen text line,
-- text exactly as read. No AI judgement is stored (owner F354, F356). Rows are append-only. Touches no existing table.
CREATE TABLE video_reading (
  capture_id     TEXT PRIMARY KEY REFERENCES raw_capture(capture_id),
  video_url      TEXT NOT NULL REFERENCES video(video_url),
  origin         TEXT NOT NULL CHECK (origin IN ('SELECTION','TOP_SELLING','EXPANDED_SEARCH')),
  duration_s     REAL CHECK (duration_s BETWEEN 0 AND 1.7976931348623157e308),
  caption_source TEXT NOT NULL CHECK (caption_source IN ('NATIVE_SUBTITLE','MODEL_TRANSCRIBED')),
  model_id       TEXT NOT NULL,
  media_sha256   TEXT,
  media_bytes    INTEGER CHECK (media_bytes >= 0),
  read_at        TEXT NOT NULL
) STRICT;

CREATE TABLE video_segment (
  capture_id   TEXT NOT NULL REFERENCES video_reading(capture_id),
  segment_type TEXT NOT NULL CHECK (segment_type IN ('speech','on_screen')),
  seq          INTEGER NOT NULL CHECK (seq >= 0),
  start_s      REAL CHECK (start_s BETWEEN 0 AND 1.7976931348623157e308),
  end_s        REAL CHECK (end_s BETWEEN 0 AND 1.7976931348623157e308),
  text         TEXT NOT NULL,
  PRIMARY KEY (capture_id, segment_type, seq)
) STRICT;

CREATE TRIGGER video_reading_no_update BEFORE UPDATE ON video_reading BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_reading'); END;
CREATE TRIGGER video_reading_no_delete BEFORE DELETE ON video_reading BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_reading'); END;
CREATE TRIGGER video_segment_no_update BEFORE UPDATE ON video_segment BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_segment'); END;
CREATE TRIGGER video_segment_no_delete BEFORE DELETE ON video_segment BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_video_segment'); END;

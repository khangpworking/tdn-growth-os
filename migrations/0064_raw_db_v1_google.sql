-- db-v1 Google tables (data/raw-sources/KHUON-CSDL.md §4.4, §4.5, §5): S19b search suggestions and S29 Google
-- AI Overview. Owner-approved (03/11/2026) changes to §5: block_type is CHECKed and each list bullet is its own
-- 'list_item' row; ai_overview_reference gets a snippet column. Rows are append-only. Touches no existing table.
CREATE TABLE search_suggestion (
  prefix       TEXT NOT NULL,
  rank         INTEGER NOT NULL,
  suggestion   TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  capture_id   TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, prefix, rank)
) STRICT;

CREATE TABLE ai_overview_block (
  query             TEXT NOT NULL,
  block_seq         INTEGER NOT NULL,
  block_type        TEXT CHECK (block_type IN ('heading','paragraph','list_item')),
  text              TEXT,
  reference_indexes TEXT,
  capture_id        TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, block_seq)
) STRICT;

CREATE TABLE ai_overview_reference (
  query      TEXT NOT NULL,
  ref_index  INTEGER NOT NULL,
  title      TEXT,
  link       TEXT,
  site       TEXT,
  snippet    TEXT,
  capture_id TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, ref_index)
) STRICT;

CREATE TRIGGER search_suggestion_no_update BEFORE UPDATE ON search_suggestion BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_search_suggestion'); END;
CREATE TRIGGER search_suggestion_no_delete BEFORE DELETE ON search_suggestion BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_search_suggestion'); END;
CREATE TRIGGER ai_overview_block_no_update BEFORE UPDATE ON ai_overview_block BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_ai_overview_block'); END;
CREATE TRIGGER ai_overview_block_no_delete BEFORE DELETE ON ai_overview_block BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_ai_overview_block'); END;
CREATE TRIGGER ai_overview_reference_no_update BEFORE UPDATE ON ai_overview_reference BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_ai_overview_reference'); END;
CREATE TRIGGER ai_overview_reference_no_delete BEFORE DELETE ON ai_overview_reference BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_ai_overview_reference'); END;

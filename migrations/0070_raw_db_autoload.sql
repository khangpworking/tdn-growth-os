-- Automatic db-v1 load after a research run's collection is final (owner F368, F389; KHUON-CSDL.md §5): one row per
-- attempt (the app hook or `raw-db-load --source AUTOLOAD`). Each source column holds that source's result JSON
-- (loaded counts, a SKIPPED_* status or an error code); `labelling` holds the Jev labelling result. Insert-only.
-- Touches no existing table.
CREATE TABLE raw_db_autoload (
  attempt_id  INTEGER PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id),
  origin      TEXT NOT NULL CHECK (origin IN ('APP','CLI')),
  started_at  TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  s05         TEXT NOT NULL CHECK (json_valid(s05)),
  s06         TEXT NOT NULL CHECK (json_valid(s06)),
  s07         TEXT NOT NULL CHECK (json_valid(s07)),
  s02b        TEXT NOT NULL CHECK (json_valid(s02b)),
  s14         TEXT NOT NULL CHECK (json_valid(s14)),
  s19b        TEXT NOT NULL CHECK (json_valid(s19b)),
  s29         TEXT NOT NULL CHECK (json_valid(s29)),
  labelling   TEXT NOT NULL CHECK (json_valid(labelling)),
  CHECK (finished_at >= started_at)
) STRICT;
CREATE INDEX raw_db_autoload_by_run ON raw_db_autoload(run_id, attempt_id);
CREATE TRIGGER raw_db_autoload_no_update BEFORE UPDATE ON raw_db_autoload BEGIN SELECT RAISE(ABORT,'immutable_raw_db_autoload'); END;
CREATE TRIGGER raw_db_autoload_no_delete BEFORE DELETE ON raw_db_autoload BEGIN SELECT RAISE(ABORT,'immutable_raw_db_autoload'); END;

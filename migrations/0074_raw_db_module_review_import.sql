-- Explicit, persistence-only imports of verified module M3 sources. No autorun records/backfill.
CREATE TABLE raw_db_module_review_import (
  source_sha256 TEXT PRIMARY KEY CHECK(length(source_sha256)=64),
  import_policy_version TEXT NOT NULL CHECK(import_policy_version='module-m3-s05-v1'),
  module_run_id TEXT NOT NULL,
  source_kind TEXT NOT NULL CHECK(source_kind IN ('legacy','custom')),
  attempt_id TEXT,
  dataset_id TEXT NOT NULL UNIQUE,
  archive_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256),
  row_count INTEGER NOT NULL CHECK(row_count>=0),
  imported_at TEXT NOT NULL,
  receipt_json TEXT NOT NULL CHECK(json_valid(receipt_json)),
  CHECK((source_kind='legacy' AND attempt_id IS NULL) OR (source_kind='custom' AND attempt_id IS NOT NULL))
) STRICT;
CREATE TRIGGER raw_db_module_review_import_no_update BEFORE UPDATE ON raw_db_module_review_import
BEGIN SELECT RAISE(ABORT,'immutable_raw_db_module_review_import'); END;
CREATE TRIGGER raw_db_module_review_import_no_delete BEFORE DELETE ON raw_db_module_review_import
BEGIN SELECT RAISE(ABORT,'immutable_raw_db_module_review_import'); END;

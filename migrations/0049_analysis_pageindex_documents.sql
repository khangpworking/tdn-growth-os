-- PageIndex document-indexing ledger (P3): one row per exact source SHA-256, so the
-- same PDF is never uploaded twice across runs. Deletes are blocked; state only
-- moves forward through the owning service. A separate single-row flag table
-- records a vendor usage-limit signal; while set, no new upload may start.
CREATE TABLE analysis_pageindex_documents (
  source_sha256 TEXT PRIMARY KEY NOT NULL
    CHECK(length(source_sha256) = 64 AND source_sha256 NOT GLOB '*[^0-9a-f]*'),
  cloud_doc_id TEXT CHECK(cloud_doc_id IS NULL OR (length(trim(cloud_doc_id)) BETWEEN 1 AND 256)),
  cloud_file_name TEXT NOT NULL
    CHECK(length(trim(cloud_file_name)) BETWEEN 1 AND 256),
  page_count INTEGER NOT NULL
    CHECK(typeof(page_count) = 'integer' AND page_count BETWEEN 1 AND 1000),
  uploaded_at TEXT CHECK(uploaded_at IS NULL OR (
    julianday(uploaded_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', uploaded_at) = uploaded_at
  )),
  status TEXT NOT NULL
    CHECK(status IN ('INDEXING', 'READY', 'FAILED', 'SKIPPED_LOW_BALANCE', 'SKIPPED_USAGE_LIMIT')),
  failure_code TEXT CHECK(failure_code IS NULL OR length(trim(failure_code)) BETWEEN 1 AND 120),
  updated_at TEXT NOT NULL CHECK(
    julianday(updated_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
  ),
  upload_attempted INTEGER NOT NULL DEFAULT 0 CHECK(upload_attempted IN (0, 1)),
  upload_attempted_at TEXT,
  CHECK(upload_attempted=0 OR (upload_attempted_at IS NOT NULL AND julianday(upload_attempted_at) IS NOT NULL)),
  CHECK(status <> 'READY' OR (uploaded_at IS NOT NULL AND cloud_doc_id IS NOT NULL AND failure_code IS NULL)),
  CHECK(status <> 'FAILED' OR failure_code IS NOT NULL)
) STRICT;

CREATE TRIGGER analysis_pageindex_documents_no_retry
BEFORE UPDATE ON analysis_pageindex_documents WHEN OLD.upload_attempted = 1 AND
  (NEW.upload_attempted <> 1 OR NEW.upload_attempted_at IS NOT OLD.upload_attempted_at)
BEGIN SELECT RAISE(ABORT, 'immutable_pageindex_attempt'); END;

CREATE TRIGGER analysis_pageindex_documents_no_delete
BEFORE DELETE ON analysis_pageindex_documents
BEGIN SELECT RAISE(ABORT, 'immutable_pageindex_document'); END;

CREATE TABLE analysis_pageindex_flags (
  flag_key TEXT PRIMARY KEY NOT NULL CHECK(flag_key IN ('usage_limit_reached')),
  flag_value TEXT NOT NULL CHECK(flag_value IN ('0', '1')),
  updated_at TEXT NOT NULL CHECK(
    julianday(updated_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
  )
) STRICT;

CREATE TRIGGER analysis_pageindex_flags_no_delete
BEFORE DELETE ON analysis_pageindex_flags
BEGIN SELECT RAISE(ABORT, 'immutable_pageindex_flag'); END;

INSERT INTO analysis_pageindex_flags(flag_key, flag_value, updated_at)
VALUES ('usage_limit_reached', '0', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE analysis_pageindex_connector_checks (
  singleton INTEGER PRIMARY KEY CHECK(singleton=1),
  last_call_at TEXT NOT NULL,
  succeeded INTEGER NOT NULL CHECK(succeeded IN (0,1)),
  active_pages INTEGER CHECK(active_pages IS NULL OR active_pages>=0)
) STRICT;

CREATE TABLE analysis_pageindex_run_pdfs (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  file_name TEXT NOT NULL,
  package_id TEXT NOT NULL REFERENCES foundation_source_packages(package_id) ON DELETE RESTRICT,
  manifest_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  logical_path TEXT NOT NULL,
  PRIMARY KEY(run_id, source_sha256)
) STRICT;

CREATE TABLE analysis_pageindex_questions (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  section_id TEXT NOT NULL,
  attempted_at TEXT NOT NULL,
  result_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  failure_code TEXT,
  PRIMARY KEY(run_id, source_sha256, section_id)
) STRICT;

CREATE TRIGGER analysis_pageindex_questions_no_delete
BEFORE DELETE ON analysis_pageindex_questions
BEGIN SELECT RAISE(ABORT, 'immutable_pageindex_question_attempt'); END;

CREATE TABLE analysis_pageindex_run_quotes (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT
) STRICT;

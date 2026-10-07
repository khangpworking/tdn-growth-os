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
  CHECK(status <> 'READY' OR (uploaded_at IS NOT NULL AND cloud_doc_id IS NOT NULL AND failure_code IS NULL)),
  CHECK(status <> 'FAILED' OR failure_code IS NOT NULL)
) STRICT;

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

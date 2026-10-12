-- Retained Shopee report-consumption ledger. Acquisition and source-createdAt
-- timestamps are data only and never prove consumption; a successful Shopee reader
-- build publication does, recorded atomically with the revision insert, binding the
-- U22 sample, the coding proposal/report identities, the reader revision and
-- the genuine build timestamp. Reads, reopens, and retries stay configless and
-- mutation-free and record nothing. Decisions are recorded separately in the existing
-- reader-decision table. Existing flows and tables are untouched.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE analysis_shopee_report_consumption (
  revision_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_reader_report_revisions(revision_id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  sample_id TEXT NOT NULL CHECK(length(sample_id) = 64 AND sample_id NOT GLOB '*[^0-9a-f]*'),
  coding_draft_sha256 TEXT NOT NULL CHECK(length(coding_draft_sha256) = 64 AND coding_draft_sha256 NOT GLOB '*[^0-9a-f]*'),
  report_identity_sha256 TEXT NOT NULL CHECK(length(report_identity_sha256) = 64 AND report_identity_sha256 NOT GLOB '*[^0-9a-f]*'),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 1 AND 120),
  consumed_at TEXT NOT NULL CHECK(
    julianday(consumed_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', consumed_at) = consumed_at
  )
) STRICT;
CREATE INDEX analysis_shopee_report_consumption_run
  ON analysis_shopee_report_consumption(run_id, consumed_at);

CREATE TRIGGER analysis_shopee_report_consumption_no_update
BEFORE UPDATE ON analysis_shopee_report_consumption
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_report_consumption'); END;
CREATE TRIGGER analysis_shopee_report_consumption_no_delete
BEFORE DELETE ON analysis_shopee_report_consumption
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_report_consumption'); END;

-- Reader reports for the OWNER: one immutable built page per revision, rebuilt
-- only from a DRAFT_READY automation run, and at most one OWNER decision per
-- revision. Review state is derived: no decision = PENDING_OWNER_REVIEW; an older
-- undecided revision is superseded by a newer one. Nothing here edits the draft.
CREATE TABLE analysis_reader_report_revisions (
  revision_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(revision_id) = 36 AND lower(revision_id) = revision_id AND revision_id NOT GLOB '*[^0-9a-f-]*'),
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  revision_number INTEGER NOT NULL CHECK(typeof(revision_number) = 'integer' AND revision_number BETWEEN 1 AND 10000),
  request_key TEXT NOT NULL UNIQUE CHECK(length(request_key) BETWEEN 8 AND 128 AND request_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  draft_pair_id TEXT NOT NULL CHECK(length(draft_pair_id) = 64 AND draft_pair_id NOT GLOB '*[^0-9a-f]*'),
  metric_package_id TEXT NOT NULL CHECK(length(metric_package_id) = 36),
  platforms TEXT NOT NULL CHECK(platforms IN ('shopee', 'tiktok', 'shopee,tiktok')),
  profile_status TEXT NOT NULL CHECK(profile_status IN ('proposed', 'approved')),
  input_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  profile_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  cover_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  html_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  metrics_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  claims_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  builder_version TEXT NOT NULL CHECK(length(builder_version) BETWEEN 1 AND 64),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL CHECK(
    julianday(created_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
  ),
  UNIQUE(run_id, revision_number)
) STRICT;

CREATE INDEX analysis_reader_report_revisions_run
  ON analysis_reader_report_revisions(run_id, revision_number DESC);

-- A reader page restates a finished draft; it is never built for a live run,
-- and revision numbers are gap-free per run.
CREATE TRIGGER analysis_reader_report_revisions_exact_run
BEFORE INSERT ON analysis_reader_report_revisions
WHEN NOT EXISTS (
  SELECT 1 FROM analysis_research_automation_runs r
  WHERE r.run_id = NEW.run_id AND r.workspace_id = NEW.workspace_id AND r.status = 'DRAFT_READY'
) OR NEW.revision_number != 1 + COALESCE(
  (SELECT max(revision_number) FROM analysis_reader_report_revisions WHERE run_id = NEW.run_id), 0)
BEGIN SELECT RAISE(ABORT, 'reader_report_requires_draft_ready_sequence'); END;

CREATE TRIGGER analysis_reader_report_revisions_no_update
BEFORE UPDATE ON analysis_reader_report_revisions
BEGIN SELECT RAISE(ABORT, 'immutable_reader_report_revision'); END;
CREATE TRIGGER analysis_reader_report_revisions_no_delete
BEFORE DELETE ON analysis_reader_report_revisions
BEGIN SELECT RAISE(ABORT, 'immutable_reader_report_revision'); END;

CREATE TABLE analysis_reader_report_decisions (
  revision_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_reader_report_revisions(revision_id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK(decision IN ('APPROVED', 'REJECTED')),
  request_key TEXT NOT NULL UNIQUE CHECK(length(request_key) BETWEEN 8 AND 128 AND request_key NOT GLOB '*[^A-Za-z0-9_-]*'),
  reason TEXT CHECK(reason IS NULL OR length(trim(reason)) BETWEEN 1 AND 1000),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 1 AND 120),
  decided_at TEXT NOT NULL CHECK(
    julianday(decided_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', decided_at) = decided_at
  )
) STRICT;

-- Only the newest revision of a run can be decided; a decision never moves to
-- another page.
CREATE TRIGGER analysis_reader_report_decisions_latest
BEFORE INSERT ON analysis_reader_report_decisions
WHEN NOT EXISTS (
  SELECT 1 FROM analysis_reader_report_revisions v
  WHERE v.revision_id = NEW.revision_id AND v.run_id = NEW.run_id
    AND v.revision_number = (SELECT max(revision_number) FROM analysis_reader_report_revisions WHERE run_id = NEW.run_id)
)
BEGIN SELECT RAISE(ABORT, 'reader_report_decision_requires_latest_revision'); END;

CREATE TRIGGER analysis_reader_report_decisions_no_update
BEFORE UPDATE ON analysis_reader_report_decisions
BEGIN SELECT RAISE(ABORT, 'immutable_reader_report_decision'); END;
CREATE TRIGGER analysis_reader_report_decisions_no_delete
BEFORE DELETE ON analysis_reader_report_decisions
BEGIN SELECT RAISE(ABORT, 'immutable_reader_report_decision'); END;

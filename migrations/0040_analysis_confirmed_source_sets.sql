-- Analysis admission, separate from Foundation's authored-storage origin.
-- No source-package foreign key crosses a module boundary. Package content is
-- verified through Foundation before accepting and during historical replay.
ALTER TABLE analysis_research_automation_runs ADD COLUMN confirmed_source_set_sha256 TEXT
  REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT
  CHECK(confirmed_source_set_sha256 IS NULL OR (length(confirmed_source_set_sha256)=64 AND confirmed_source_set_sha256 NOT GLOB '*[^0-9a-f]*'));

CREATE TABLE analysis_research_automation_source_sets (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  execution_id TEXT UNIQUE NOT NULL CHECK(length(execution_id)=36 AND execution_id NOT GLOB '*[^0-9a-f-]*'),
  source_set_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  request_key TEXT UNIQUE NOT NULL REFERENCES analysis_research_automation_requests(request_key) ON DELETE RESTRICT,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  start_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  scope_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  confirmed_at TEXT NOT NULL CHECK(length(trim(confirmed_at))>0)
) STRICT;

CREATE TRIGGER analysis_research_automation_source_sets_insert
BEFORE INSERT ON analysis_research_automation_source_sets
WHEN NOT EXISTS (
  SELECT 1 FROM analysis_research_automation_runs r
  JOIN analysis_research_automation_requests q ON q.run_id=r.run_id
  WHERE r.run_id=NEW.run_id AND r.status='COLLECTION_QUEUED'
    AND r.start_request_sha256=NEW.start_sha256 AND r.scope_request_sha256=NEW.scope_sha256
    AND r.scope_confirmed_at=NEW.confirmed_at
    AND r.confirmed_source_set_sha256=NEW.source_set_sha256
    AND q.request_key=NEW.request_key AND q.request_kind='CONFIRM'
    AND q.request_sha256=NEW.request_sha256 AND q.accepted_at=NEW.confirmed_at
)
BEGIN SELECT RAISE(ABORT, 'analysis_source_set_requires_exact_confirmation'); END;

CREATE TRIGGER analysis_research_automation_source_sets_no_update
BEFORE UPDATE ON analysis_research_automation_source_sets
BEGIN SELECT RAISE(ABORT, 'immutable_analysis_source_set'); END;
CREATE TRIGGER analysis_research_automation_source_sets_no_delete
BEFORE DELETE ON analysis_research_automation_source_sets
BEGIN SELECT RAISE(ABORT, 'immutable_analysis_source_set'); END;

CREATE TRIGGER analysis_research_automation_source_set_binding_no_update
BEFORE UPDATE OF confirmed_source_set_sha256 ON analysis_research_automation_runs
WHEN OLD.confirmed_source_set_sha256 IS NOT NULL AND NEW.confirmed_source_set_sha256 IS NOT OLD.confirmed_source_set_sha256
BEGIN SELECT RAISE(ABORT, 'immutable_analysis_source_set_binding'); END;

CREATE TRIGGER analysis_research_automation_source_set_binding_requires_confirmation
BEFORE UPDATE OF confirmed_source_set_sha256 ON analysis_research_automation_runs
WHEN OLD.confirmed_source_set_sha256 IS NULL AND NEW.confirmed_source_set_sha256 IS NOT NULL
  AND NOT (OLD.status='AWAITING_SCOPE' AND NEW.status='COLLECTION_QUEUED'
    AND OLD.scope_request_sha256 IS NULL AND NEW.scope_request_sha256 IS NOT NULL)
BEGIN SELECT RAISE(ABORT, 'analysis_source_set_binding_requires_confirmation'); END;

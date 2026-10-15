-- Durable state of the Market auto-runner (P6-209 follow-up). A row exists only
-- for a run started while the auto-runner flag was exactly "1" and MARKET was
-- requested; flag-off runs never get a row, so their projection and data stay as
-- before. Kept as its own table so the run schema and its API contract are not
-- touched. The capture directory is derived from the run id and never stored as
-- a path. Stop details are short and path-free.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE research_automation_autorun (
  run_id TEXT PRIMARY KEY NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  phase TEXT NOT NULL CHECK(phase IN ('WAITING_SCOPE','CAPTURE','PREPARE','PICK','CONFIRM','WAIT_DRAFT','PRESENT','DONE','STOPPED')),
  phase_state TEXT NOT NULL CHECK(phase_state IN ('QUEUED','RUNNING')),
  stop_code TEXT CHECK(stop_code IS NULL OR (length(stop_code) BETWEEN 1 AND 64 AND stop_code NOT GLOB '*[^A-Z0-9_]*')),
  stop_detail TEXT CHECK(stop_detail IS NULL OR length(stop_detail) BETWEEN 1 AND 300),
  capture_dir_key TEXT NOT NULL CHECK(capture_dir_key = run_id),
  capture_ready INTEGER NOT NULL DEFAULT 0 CHECK(capture_ready IN (0, 1)),
  prepare_request_key TEXT NOT NULL CHECK(length(prepare_request_key) = 36),
  confirm_request_key TEXT NOT NULL CHECK(length(confirm_request_key) = 36),
  revision_request_key TEXT NOT NULL CHECK(length(revision_request_key) = 36),
  confirm_expected_revision INTEGER CHECK(confirm_expected_revision IS NULL OR confirm_expected_revision >= 1),
  package_id TEXT CHECK(package_id IS NULL OR length(package_id) BETWEEN 1 AND 200),
  pick_artifact_id TEXT CHECK(pick_artifact_id IS NULL OR (length(pick_artifact_id) = 64 AND pick_artifact_id NOT GLOB '*[^0-9a-f]*')),
  revision_attempt_id TEXT CHECK(revision_attempt_id IS NULL OR length(revision_attempt_id) = 36),
  created_at TEXT NOT NULL CHECK(
    julianday(created_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
  ),
  updated_at TEXT NOT NULL CHECK(
    julianday(updated_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) = updated_at
  ),
  CHECK((phase = 'STOPPED') = (stop_code IS NOT NULL)),
  CHECK(phase <> 'STOPPED' OR phase_state = 'QUEUED')
) STRICT;
CREATE INDEX research_automation_autorun_claim
  ON research_automation_autorun(phase_state, phase, created_at, run_id);
CREATE INDEX research_automation_autorun_workspace
  ON research_automation_autorun(workspace_id, phase, phase_state);

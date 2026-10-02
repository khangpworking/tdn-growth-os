-- Research automation v1 (ADR 0005): one durable, owner-started run per explicit
-- Start inside a verified discovery workspace. A run records the exact start and
-- scope-confirmation snapshots, one row per executed step, the exact raw provider
-- bytes and actual usage each step captured, and immutable draft outputs. A run
-- never approves anything (B7-B10) and never replaces historical report series.
CREATE TABLE analysis_research_automation_runs (
  run_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(run_id) = 36 AND lower(run_id) = run_id AND run_id NOT GLOB '*[^0-9a-f-]*'),
  -- Workspace identity belongs to Flow (Box 4). The analysis module validates
  -- it through its declared reader before writing; SQLite does not own a
  -- cross-Box business foreign key here.
  workspace_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(typeof(revision) = 'integer' AND revision >= 1),
  status TEXT NOT NULL CHECK(status IN (
    'QUICK_SEARCH_QUEUED', 'QUICK_SEARCH_RUNNING', 'AWAITING_SCOPE', 'COLLECTION_QUEUED', 'COLLECTING',
    'RENDERING', 'CANCELLING', 'DRAFT_READY', 'FAILED', 'CANCELLED', 'INTERRUPTED'
  )),
  mode TEXT NOT NULL CHECK(mode IN ('PRODUCT', 'CATEGORY')),
  keyword TEXT NOT NULL CHECK(length(keyword) BETWEEN 1 AND 120),
  period_start TEXT NOT NULL CHECK(date(period_start) IS period_start),
  period_end TEXT NOT NULL CHECK(date(period_end) IS period_end AND period_end >= period_start),
  reports TEXT NOT NULL CHECK(reports IN ('MARKET', 'INSIGHT', 'MARKET,INSIGHT')),
  start_request_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  scope_request_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  scope_confirmed_at TEXT CHECK(scope_confirmed_at IS NULL OR length(trim(scope_confirmed_at)) > 0),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK(length(trim(updated_at)) > 0),
  CHECK((scope_request_sha256 IS NULL) = (scope_confirmed_at IS NULL))
) STRICT;

CREATE INDEX analysis_research_automation_runs_workspace
  ON analysis_research_automation_runs(workspace_id, created_at DESC, run_id);
CREATE INDEX analysis_research_automation_runs_status
  ON analysis_research_automation_runs(status, updated_at);

-- Every accepted state change is exactly one revision step. Identity columns and
-- terminal runs are immutable; the confirmed scope is written once.
CREATE TRIGGER analysis_research_automation_runs_guard
BEFORE UPDATE ON analysis_research_automation_runs
WHEN NEW.revision IS NOT OLD.revision + 1
  OR NEW.run_id IS NOT OLD.run_id OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.mode IS NOT OLD.mode OR NEW.keyword IS NOT OLD.keyword
  OR NEW.period_start IS NOT OLD.period_start OR NEW.period_end IS NOT OLD.period_end
  OR NEW.reports IS NOT OLD.reports OR NEW.start_request_sha256 IS NOT OLD.start_request_sha256
  OR NEW.actor_id IS NOT OLD.actor_id OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.scope_request_sha256 IS NOT NULL AND NEW.scope_request_sha256 IS NOT OLD.scope_request_sha256)
  OR (OLD.scope_confirmed_at IS NOT NULL AND NEW.scope_confirmed_at IS NOT OLD.scope_confirmed_at)
  OR OLD.status IN ('DRAFT_READY', 'FAILED', 'CANCELLED', 'INTERRUPTED')
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_run_transition_invalid'); END;

CREATE TRIGGER analysis_research_automation_runs_no_delete
BEFORE DELETE ON analysis_research_automation_runs
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_run_immutable'); END;

-- Exact request-key idempotency across start, confirm and cancel.
CREATE TABLE analysis_research_automation_requests (
  request_key TEXT PRIMARY KEY NOT NULL
    CHECK(length(request_key) = 36 AND lower(request_key) = request_key AND request_key NOT GLOB '*[^0-9a-f-]*'),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK(request_kind IN ('START', 'CONFIRM', 'CANCEL')),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  accepted_at TEXT NOT NULL CHECK(length(trim(accepted_at)) > 0)
) STRICT;

CREATE TRIGGER analysis_research_automation_requests_no_update
BEFORE UPDATE ON analysis_research_automation_requests
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_request_immutable'); END;
CREATE TRIGGER analysis_research_automation_requests_no_delete
BEFORE DELETE ON analysis_research_automation_requests
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_request_immutable'); END;

-- One row per step; a step executes at most once and is never retried.
CREATE TABLE analysis_research_automation_steps (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  step_id TEXT NOT NULL CHECK(step_id IN ('QUICK_SEARCH', 'COLLECTION', 'REPORTS')),
  state TEXT NOT NULL CHECK(state IN (
    'PENDING', 'QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'UNAVAILABLE', 'FAILED', 'CANCELLED', 'INTERRUPTED', 'SKIPPED'
  )),
  message_code TEXT CHECK(message_code IS NULL OR (length(message_code) BETWEEN 1 AND 80 AND message_code NOT GLOB '*[^A-Z0-9_]*')),
  result_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  started_at TEXT,
  finished_at TEXT,
  PRIMARY KEY(run_id, step_id),
  CHECK(state NOT IN ('PENDING', 'QUEUED') OR (started_at IS NULL AND finished_at IS NULL AND result_sha256 IS NULL)),
  CHECK(state <> 'RUNNING' OR (started_at IS NOT NULL AND finished_at IS NULL AND result_sha256 IS NULL)),
  CHECK(state IN ('PENDING', 'QUEUED', 'RUNNING') OR finished_at IS NOT NULL)
) STRICT;

CREATE TRIGGER analysis_research_automation_steps_settled
BEFORE UPDATE ON analysis_research_automation_steps
WHEN OLD.state NOT IN ('PENDING', 'QUEUED', 'RUNNING') OR NEW.run_id IS NOT OLD.run_id OR NEW.step_id IS NOT OLD.step_id
  OR (OLD.state = 'RUNNING' AND NEW.state IN ('PENDING', 'RUNNING'))
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_step_settled'); END;
CREATE TRIGGER analysis_research_automation_steps_no_delete
BEFORE DELETE ON analysis_research_automation_steps
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_step_immutable'); END;

-- Raw lineage: the exact provider bytes a step captured, with the actual query window.
CREATE TABLE analysis_research_automation_captures (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  step_id TEXT NOT NULL CHECK(step_id IN ('QUICK_SEARCH', 'COLLECTION')),
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal >= 0),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK(length(trim(media_type)) BETWEEN 1 AND 120),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 40 AND provider NOT GLOB '*[^a-z0-9-]*'),
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 80 AND operation NOT GLOB '*[^a-z0-9./_-]*'),
  retrieved_at TEXT NOT NULL CHECK(length(trim(retrieved_at)) > 0),
  window_start TEXT CHECK(window_start IS NULL OR date(window_start) IS window_start),
  window_end TEXT CHECK(window_end IS NULL OR date(window_end) IS window_end),
  truncated INTEGER NOT NULL CHECK(truncated IN (0, 1)),
  retained_at TEXT NOT NULL CHECK(length(trim(retained_at)) > 0),
  PRIMARY KEY(run_id, step_id, ordinal),
  CHECK((window_start IS NULL) = (window_end IS NULL) AND (window_end IS NULL OR window_end >= window_start))
) STRICT;

CREATE TRIGGER analysis_research_automation_captures_no_update
BEFORE UPDATE ON analysis_research_automation_captures
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_capture_immutable'); END;
CREATE TRIGGER analysis_research_automation_captures_no_delete
BEFORE DELETE ON analysis_research_automation_captures
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_capture_immutable'); END;

-- Actual usage ledger. Unknown cost is explicit and never stored as zero.
CREATE TABLE analysis_research_automation_usage (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  step_id TEXT NOT NULL CHECK(step_id IN ('QUICK_SEARCH', 'COLLECTION')),
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal >= 0),
  provider TEXT NOT NULL CHECK(length(provider) BETWEEN 1 AND 40 AND provider NOT GLOB '*[^a-z0-9-]*'),
  operation TEXT NOT NULL CHECK(length(operation) BETWEEN 1 AND 80 AND operation NOT GLOB '*[^a-z0-9./_-]*'),
  request_count INTEGER NOT NULL CHECK(typeof(request_count) = 'integer' AND request_count >= 0),
  cost_state TEXT NOT NULL CHECK(cost_state IN ('KNOWN', 'UNKNOWN')),
  cost_unit TEXT CHECK(cost_unit IS NULL OR cost_unit IN ('USD', 'CREDITS')),
  cost_amount TEXT CHECK(cost_amount IS NULL OR (length(cost_amount) BETWEEN 1 AND 32 AND cost_amount GLOB '[0-9]*' AND cost_amount NOT GLOB '*[^0-9.]*')),
  recorded_at TEXT NOT NULL CHECK(length(trim(recorded_at)) > 0),
  PRIMARY KEY(run_id, step_id, ordinal),
  CHECK((cost_state = 'KNOWN' AND cost_unit IS NOT NULL AND cost_amount IS NOT NULL) OR
        (cost_state = 'UNKNOWN' AND cost_unit IS NULL AND cost_amount IS NULL))
) STRICT;

CREATE TRIGGER analysis_research_automation_usage_no_update
BEFORE UPDATE ON analysis_research_automation_usage
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_usage_immutable'); END;
CREATE TRIGGER analysis_research_automation_usage_no_delete
BEFORE DELETE ON analysis_research_automation_usage
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_usage_immutable'); END;

-- Immutable draft outputs: one frozen semantic version per report kind, its HTML
-- and, only when a real renderer produced it, the PDF of that exact HTML.
CREATE TABLE analysis_research_automation_outputs (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  report_kind TEXT NOT NULL CHECK(report_kind IN ('MARKET', 'INSIGHT')),
  version_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  html_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  pdf_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  pdf_unavailable_code TEXT CHECK(pdf_unavailable_code IS NULL OR pdf_unavailable_code IN ('PDF_RENDERER_NOT_CONFIGURED', 'PDF_RENDER_FAILED')),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(run_id, report_kind),
  CHECK((pdf_sha256 IS NULL) <> (pdf_unavailable_code IS NULL))
) STRICT;

CREATE TRIGGER analysis_research_automation_outputs_no_update
BEFORE UPDATE ON analysis_research_automation_outputs
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_output_immutable'); END;
CREATE TRIGGER analysis_research_automation_outputs_no_delete
BEFORE DELETE ON analysis_research_automation_outputs
BEGIN SELECT RAISE(ABORT, 'analysis_research_automation_output_immutable'); END;

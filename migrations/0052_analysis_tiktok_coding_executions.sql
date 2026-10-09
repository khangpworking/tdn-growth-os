-- TikTok draft-coding execution claims and immutable outcomes. The shared synthesis
-- kernel unions and the shared AI-execution ledger stay untouched: TikTok dispatch needs
-- no human adoption, so it must not borrow INSIGHT_CODING parentage. One row per model
-- requestKey, claimed atomically before dispatch: a second instance with the same key
-- observes the existing claim instead of dispatching again. Transport-unknown and invalid
-- outcomes are terminal for their key; only a new owner requestKey may dispatch again.
-- State moves forward only (PREPARED to DISPATCHING to COMPLETED or DISPATCH_UNKNOWN);
-- identity columns never change after the claim.
-- Never apply this migration to runtime data as part of implementation tests.
CREATE TABLE analysis_tiktok_coding_executions (
  execution_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(execution_id) = 36 AND lower(execution_id) = execution_id AND execution_id NOT GLOB '*[^0-9a-f-]*'),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256) = 64 AND scope_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_key TEXT NOT NULL UNIQUE
    CHECK(length(request_key) = 36 AND lower(request_key) = request_key AND request_key NOT GLOB '*[^0-9a-f-]*'),
  admission_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  input_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  prompt_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  configuration_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('PREPARED', 'DISPATCHING', 'COMPLETED', 'DISPATCH_UNKNOWN')),
  validation_status TEXT CHECK(validation_status IS NULL OR validation_status IN ('VALID', 'INVALID')),
  validation_code TEXT CHECK(validation_code IS NULL OR validation_code IN ('TIKTOK_CODING_RESPONSE_INVALID')),
  unknown_code TEXT CHECK(unknown_code IS NULL OR unknown_code IN ('TRANSPORT_OUTCOME_AMBIGUOUS', 'INTERRUPTED_AFTER_CLAIM')),
  created_at TEXT NOT NULL CHECK(
    julianday(created_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
  ),
  dispatch_claimed_at TEXT CHECK(dispatch_claimed_at IS NULL OR (
    julianday(dispatch_claimed_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', dispatch_claimed_at) = dispatch_claimed_at
  )),
  settled_at TEXT CHECK(settled_at IS NULL OR (
    julianday(settled_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', settled_at) = settled_at
  ))
) STRICT;
CREATE INDEX analysis_tiktok_coding_executions_run
  ON analysis_tiktok_coding_executions(run_id, created_at);

CREATE TRIGGER analysis_tiktok_coding_execution_update
BEFORE UPDATE ON analysis_tiktok_coding_executions
WHEN NEW.execution_id IS NOT OLD.execution_id OR NEW.run_id IS NOT OLD.run_id OR NEW.workspace_id IS NOT OLD.workspace_id
  OR NEW.scope_sha256 IS NOT OLD.scope_sha256 OR NEW.request_key IS NOT OLD.request_key
  OR NEW.admission_sha256 IS NOT OLD.admission_sha256 OR NEW.input_sha256 IS NOT OLD.input_sha256
  OR NEW.prompt_sha256 IS NOT OLD.prompt_sha256 OR NEW.configuration_sha256 IS NOT OLD.configuration_sha256
  OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.state = 'DISPATCHING' AND NEW.dispatch_claimed_at IS NOT OLD.dispatch_claimed_at)
  OR NOT ((OLD.state = 'PREPARED' AND NEW.state = 'DISPATCHING' AND EXISTS(
      SELECT 1 FROM analysis_research_automation_runs r
      WHERE r.run_id = NEW.run_id AND r.workspace_id = NEW.workspace_id AND r.scope_request_sha256 = NEW.scope_sha256
        AND r.status NOT IN ('FAILED', 'CANCELLING', 'CANCELLED', 'INTERRUPTED')))
    OR (OLD.state = 'DISPATCHING' AND NEW.state IN ('COMPLETED', 'DISPATCH_UNKNOWN')))
BEGIN SELECT RAISE(ABORT, 'invalid_tiktok_coding_execution_transition'); END;

CREATE TRIGGER analysis_tiktok_coding_executions_no_delete
BEFORE DELETE ON analysis_tiktok_coding_executions
BEGIN SELECT RAISE(ABORT, 'immutable_tiktok_coding_execution'); END;

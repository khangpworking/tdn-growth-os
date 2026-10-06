-- P5 I14 AI synthesis execution subrecord. One retained execution per exact parent:
-- the initial REPORTS step of a run (attempt_id NULL) or one supplemental report
-- attempt. It is not a report series and never publishes, ranks, approves or decides.
-- Exact admission, model-facing input, prompt and non-secret configuration are
-- committed (PREPARED) before a separate committed dispatch claim (DISPATCHING). A
-- claimed dispatch settles once: COMPLETED with a validated outcome, or terminal
-- DISPATCH_UNKNOWN that is never retried under the same identity. Only a VALID
-- outcome references retained candidate bytes; an INVALID outcome keeps its code only.
CREATE TABLE analysis_research_automation_ai_executions (
  execution_id TEXT PRIMARY KEY NOT NULL
    CHECK(length(execution_id) = 36 AND lower(execution_id) = execution_id AND execution_id NOT GLOB '*[^0-9a-f-]*'),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  attempt_id TEXT REFERENCES analysis_research_automation_attempts(attempt_id) ON DELETE RESTRICT,
  section_id TEXT NOT NULL CHECK(section_id = 'I14'),
  workspace_id TEXT NOT NULL CHECK(length(trim(workspace_id)) > 0),
  scope_sha256 TEXT NOT NULL CHECK(length(scope_sha256) = 64 AND scope_sha256 NOT GLOB '*[^0-9a-f]*'),
  admission_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  input_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  prompt_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  configuration_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('PREPARED', 'DISPATCHING', 'COMPLETED', 'DISPATCH_UNKNOWN')),
  validation_status TEXT CHECK(validation_status IS NULL OR validation_status IN ('VALID', 'INVALID')),
  validation_code TEXT CHECK(validation_code IS NULL OR validation_code IN (
    'RESPONSE_NOT_TEXT', 'RESPONSE_TOO_LARGE', 'RESPONSE_NOT_JSON', 'CANDIDATE_RESPONSE_FIELDS_INVALID',
    'INVALID_I14_CANDIDATES', 'CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT', 'CITED_CLAIM_NOT_ADMITTED',
    'COUNTEREVIDENCE_CLAIM_NOT_ELIGIBLE', 'CLAIM_CITED_AS_SUPPORT_AND_COUNTEREVIDENCE'
  )),
  candidates_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  unknown_code TEXT CHECK(unknown_code IS NULL OR unknown_code IN (
    'INTERRUPTED_AFTER_CLAIM', 'TRANSPORT_OUTCOME_AMBIGUOUS', 'RESPONSE_NOT_RETAINED'
  )),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  dispatch_claimed_at TEXT CHECK(dispatch_claimed_at IS NULL OR length(trim(dispatch_claimed_at)) > 0),
  settled_at TEXT CHECK(settled_at IS NULL OR length(trim(settled_at)) > 0),
  CHECK(state <> 'PREPARED' OR (dispatch_claimed_at IS NULL AND settled_at IS NULL)),
  CHECK(state = 'PREPARED' OR dispatch_claimed_at IS NOT NULL),
  CHECK((state IN ('COMPLETED', 'DISPATCH_UNKNOWN')) = (settled_at IS NOT NULL)),
  CHECK((state = 'COMPLETED') = (validation_status IS NOT NULL)),
  CHECK((state = 'DISPATCH_UNKNOWN') = (unknown_code IS NOT NULL)),
  CHECK((validation_status IS 'VALID') = (candidates_sha256 IS NOT NULL)),
  CHECK((validation_status IS 'INVALID') = (validation_code IS NOT NULL))
) STRICT;

-- At most one execution identity per exact parent and section.
CREATE UNIQUE INDEX analysis_research_automation_ai_executions_initial
  ON analysis_research_automation_ai_executions(run_id, section_id) WHERE attempt_id IS NULL;
CREATE UNIQUE INDEX analysis_research_automation_ai_executions_attempt
  ON analysis_research_automation_ai_executions(attempt_id, section_id) WHERE attempt_id IS NOT NULL;

-- Preparation requires the exact running parent, its workspace and its frozen scope.
CREATE TRIGGER analysis_research_automation_ai_execution_insert
BEFORE INSERT ON analysis_research_automation_ai_executions
WHEN NEW.state <> 'PREPARED'
  OR NOT ((NEW.attempt_id IS NULL AND EXISTS(
      SELECT 1 FROM analysis_research_automation_runs r
      JOIN analysis_research_automation_steps s ON s.run_id = r.run_id AND s.step_id = 'REPORTS'
      WHERE r.run_id = NEW.run_id AND r.workspace_id = NEW.workspace_id AND r.scope_request_sha256 = NEW.scope_sha256
        AND r.reports IN ('INSIGHT', 'MARKET,INSIGHT') AND r.status = 'RENDERING' AND s.state = 'RUNNING'))
    OR (NEW.attempt_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM analysis_research_automation_attempts a
      JOIN analysis_research_automation_runs r ON r.run_id = a.run_id
      WHERE a.attempt_id = NEW.attempt_id AND a.run_id = NEW.run_id AND a.state = 'RUNNING'
        AND r.workspace_id = NEW.workspace_id AND r.scope_request_sha256 = NEW.scope_sha256
        AND r.reports IN ('INSIGHT', 'MARKET,INSIGHT') AND r.status = 'DRAFT_READY')))
BEGIN SELECT RAISE(ABORT, 'invalid_analysis_ai_execution'); END;

-- Identity and committed references are immutable. A dispatch claim also requires the
-- running parent; settlement does not, so a late response is still retained.
CREATE TRIGGER analysis_research_automation_ai_execution_update
BEFORE UPDATE ON analysis_research_automation_ai_executions
WHEN NEW.execution_id IS NOT OLD.execution_id OR NEW.run_id IS NOT OLD.run_id OR NEW.attempt_id IS NOT OLD.attempt_id
  OR NEW.section_id IS NOT OLD.section_id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.scope_sha256 IS NOT OLD.scope_sha256
  OR NEW.admission_sha256 IS NOT OLD.admission_sha256 OR NEW.input_sha256 IS NOT OLD.input_sha256
  OR NEW.prompt_sha256 IS NOT OLD.prompt_sha256 OR NEW.configuration_sha256 IS NOT OLD.configuration_sha256
  OR NEW.created_at IS NOT OLD.created_at
  OR (OLD.state = 'DISPATCHING' AND NEW.dispatch_claimed_at IS NOT OLD.dispatch_claimed_at)
  OR NOT ((OLD.state = 'PREPARED' AND NEW.state = 'DISPATCHING' AND (
      (NEW.attempt_id IS NULL AND EXISTS(
        SELECT 1 FROM analysis_research_automation_runs r
        JOIN analysis_research_automation_steps s ON s.run_id = r.run_id AND s.step_id = 'REPORTS'
        WHERE r.run_id = NEW.run_id AND r.status = 'RENDERING' AND s.state = 'RUNNING'))
      OR (NEW.attempt_id IS NOT NULL AND EXISTS(
        SELECT 1 FROM analysis_research_automation_attempts a
        JOIN analysis_research_automation_runs r ON r.run_id = a.run_id
        WHERE a.attempt_id = NEW.attempt_id AND a.state = 'RUNNING' AND r.status = 'DRAFT_READY'))))
    OR (OLD.state = 'DISPATCHING' AND NEW.state IN ('COMPLETED', 'DISPATCH_UNKNOWN')))
BEGIN SELECT RAISE(ABORT, 'invalid_analysis_ai_execution_transition'); END;

CREATE TRIGGER analysis_research_automation_ai_execution_no_delete
BEFORE DELETE ON analysis_research_automation_ai_executions
BEGIN SELECT RAISE(ABORT, 'analysis_ai_execution_immutable'); END;

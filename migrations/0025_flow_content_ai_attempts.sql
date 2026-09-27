-- One audit row per Content Studio creative AI call attempt (ADR 0004). Every CHECK and trigger
-- condition evaluates to exactly 0 or 1 (IS / IS NOT / coalesce), so NULL cannot slip a row through.
CREATE TABLE flow_content_ai_attempts (
  attempt_id TEXT PRIMARY KEY NOT NULL CHECK(length(attempt_id) = 36),
  kind TEXT NOT NULL CHECK(kind IN ('generate', 'edit')),
  modality TEXT NOT NULL CHECK(modality IN ('text', 'image')),
  target_type TEXT NOT NULL CHECK(length(target_type) BETWEEN 3 AND 64 AND target_type GLOB '[a-z]*' AND target_type NOT GLOB '*[^a-z0-9_]*'),
  target_id TEXT NOT NULL CHECK(length(target_id) BETWEEN 1 AND 128 AND target_id NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*')),
  model TEXT NOT NULL CHECK(model IN ('gpt-5.6-sol', 'gpt-5.6-luna', 'gemini-3.5-flash-low', 'gpt-image-2', 'gemini-3.1-flash-image')),
  prompt_ref TEXT NOT NULL CHECK(length(prompt_ref) BETWEEN 1 AND 200 AND prompt_ref NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*')),
  input_bundle_sha256 TEXT NOT NULL CHECK(length(input_bundle_sha256) = 64 AND input_bundle_sha256 NOT GLOB '*[^0-9a-f]*'),
  output_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT
    CHECK(output_sha256 IS NULL OR (length(output_sha256) = 64 AND output_sha256 NOT GLOB '*[^0-9a-f]*')),
  planned_action_call_count INTEGER NOT NULL CHECK(typeof(planned_action_call_count) = 'integer' AND planned_action_call_count BETWEEN 1 AND 100),
  state TEXT NOT NULL CHECK(state IN ('running', 'succeeded', 'failed', 'interrupted')),
  error_code TEXT CHECK(error_code IS NULL OR error_code IN (
    'ai_not_configured', 'model_not_allowed', 'request_too_large', 'timeout', 'network_error', 'gateway_http_error',
    'malformed_envelope', 'response_too_large', 'invalid_image', 'schema_mismatch', 'persist_failed', 'interrupted_by_restart'
  )),
  retry_of TEXT REFERENCES flow_content_ai_attempts(attempt_id) ON DELETE RESTRICT CHECK(retry_of IS NOT attempt_id),
  actor_id TEXT NOT NULL CHECK(length(actor_id) BETWEEN 3 AND 120 AND actor_id GLOB '[a-z]*' AND actor_id NOT GLOB '*[^a-z0-9:_-]*'),
  created_at TEXT NOT NULL CHECK(typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  closed_at TEXT CHECK(closed_at IS NULL OR (
    typeof(closed_at) = 'text' AND length(closed_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', closed_at) IS closed_at AND closed_at >= created_at
  )),
  latency_ms INTEGER CHECK(latency_ms IS NULL OR (typeof(latency_ms) = 'integer' AND latency_ms BETWEEN 0 AND 3600000)),
  provider_request_id TEXT CHECK(provider_request_id IS NULL OR (length(provider_request_id) BETWEEN 1 AND 128 AND provider_request_id NOT GLOB '*[^!-~]*')),
  input_tokens INTEGER CHECK(input_tokens IS NULL OR (typeof(input_tokens) = 'integer' AND input_tokens BETWEEN 0 AND 1000000000)),
  output_tokens INTEGER CHECK(output_tokens IS NULL OR (typeof(output_tokens) = 'integer' AND output_tokens BETWEEN 0 AND 1000000000)),
  -- Model and modality agree.
  CHECK((modality = 'text') = (model IN ('gpt-5.6-sol', 'gpt-5.6-luna', 'gemini-3.5-flash-low'))),
  -- closed_at is NULL exactly while running.
  CHECK((state = 'running') = (closed_at IS NULL)),
  -- Output/state matrix: running and succeeded carry no error code; failed and interrupted always do.
  CHECK((error_code IS NULL) = (state IN ('running', 'succeeded'))),
  CHECK((state = 'interrupted') = (error_code IS 'interrupted_by_restart')),
  CHECK(CASE state
    WHEN 'succeeded' THEN output_sha256 IS NOT NULL
    WHEN 'failed' THEN error_code IS 'persist_failed' OR output_sha256 IS NULL
    ELSE output_sha256 IS NULL
  END),
  -- Provider metadata only on success; no closing metadata while running.
  CHECK(state = 'succeeded' OR (input_tokens IS NULL AND output_tokens IS NULL AND provider_request_id IS NULL)),
  CHECK(state <> 'running' OR latency_ms IS NULL)
) STRICT;

CREATE INDEX flow_content_ai_attempts_running ON flow_content_ai_attempts(state) WHERE state = 'running';
CREATE INDEX flow_content_ai_attempts_by_target ON flow_content_ai_attempts(target_type, target_id, created_at);

-- Blocks INSERT OR REPLACE from silently replacing an existing (possibly closed) row.
CREATE TRIGGER flow_content_ai_attempts_insert_unique
BEFORE INSERT ON flow_content_ai_attempts
WHEN EXISTS (SELECT 1 FROM flow_content_ai_attempts WHERE attempt_id = NEW.attempt_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_exists'); END;

CREATE TRIGGER flow_content_ai_attempts_insert_running
BEFORE INSERT ON flow_content_ai_attempts
WHEN NEW.state IS NOT 'running'
  OR NEW.closed_at IS NOT NULL OR NEW.error_code IS NOT NULL OR NEW.output_sha256 IS NOT NULL
  OR NEW.input_tokens IS NOT NULL OR NEW.output_tokens IS NOT NULL OR NEW.latency_ms IS NOT NULL OR NEW.provider_request_id IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_must_start_running'); END;

CREATE TRIGGER flow_content_ai_attempts_insert_retry
BEFORE INSERT ON flow_content_ai_attempts
WHEN NEW.retry_of IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM flow_content_ai_attempts parent
  WHERE parent.attempt_id = NEW.retry_of
    AND parent.state IN ('failed', 'interrupted')
    AND parent.target_type = NEW.target_type
    AND parent.target_id = NEW.target_id
    AND parent.modality = NEW.modality
)
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_retry_invalid'); END;

-- Only running -> terminal, once, with identity columns unchanged (NULL-safe). The table CHECKs
-- above enforce the output/state matrix on the closing row.
CREATE TRIGGER flow_content_ai_attempts_close_once
BEFORE UPDATE ON flow_content_ai_attempts
WHEN NOT (
  OLD.state IS 'running'
  AND coalesce(NEW.state IN ('succeeded', 'failed', 'interrupted'), 0)
  AND NEW.closed_at IS NOT NULL
  AND NEW.attempt_id IS OLD.attempt_id
  AND NEW.kind IS OLD.kind
  AND NEW.modality IS OLD.modality
  AND NEW.target_type IS OLD.target_type
  AND NEW.target_id IS OLD.target_id
  AND NEW.model IS OLD.model
  AND NEW.prompt_ref IS OLD.prompt_ref
  AND NEW.input_bundle_sha256 IS OLD.input_bundle_sha256
  AND NEW.planned_action_call_count IS OLD.planned_action_call_count
  AND NEW.retry_of IS OLD.retry_of
  AND NEW.actor_id IS OLD.actor_id
  AND NEW.created_at IS OLD.created_at
)
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_close_invalid'); END;

CREATE TRIGGER flow_content_ai_attempts_no_delete
BEFORE DELETE ON flow_content_ai_attempts
BEGIN SELECT RAISE(ABORT, 'flow_content_ai_attempt_immutable'); END;

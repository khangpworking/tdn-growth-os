CREATE TABLE analysis_research_audits (
  audit_id TEXT PRIMARY KEY CHECK (length(audit_id) = 36),
  source_result_id TEXT NOT NULL REFERENCES analysis_research_results(result_id) ON DELETE RESTRICT,
  source_result_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  provider_id TEXT NOT NULL CHECK (length(trim(provider_id)) BETWEEN 1 AND 120),
  model_id TEXT NOT NULL CHECK (length(trim(model_id)) BETWEEN 1 AND 160),
  prompt_id TEXT NOT NULL CHECK (length(trim(prompt_id)) BETWEEN 1 AND 160),
  prompt_version INTEGER NOT NULL CHECK (typeof(prompt_version) = 'integer' AND prompt_version > 0),
  prompt_sha256 TEXT NOT NULL CHECK (
    length(prompt_sha256) = 64 AND prompt_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  output_schema_version TEXT NOT NULL CHECK (length(trim(output_schema_version)) > 0),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  output_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  completed_at TEXT NOT NULL CHECK (length(trim(completed_at)) > 0),
  provider_request_id TEXT,
  input_token_count INTEGER CHECK (input_token_count IS NULL OR (typeof(input_token_count) = 'integer' AND input_token_count >= 0)),
  output_token_count INTEGER CHECK (output_token_count IS NULL OR (typeof(output_token_count) = 'integer' AND output_token_count >= 0)),
  latency_ms INTEGER CHECK (latency_ms IS NULL OR (typeof(latency_ms) = 'integer' AND latency_ms >= 0)),
  UNIQUE (source_result_id, provider_id, model_id, prompt_id, prompt_version, output_schema_version)
) STRICT;

CREATE INDEX analysis_research_audits_result_idx
  ON analysis_research_audits(source_result_id);
CREATE INDEX analysis_research_audits_artifact_idx
  ON analysis_research_audits(output_artifact_sha256);

CREATE TRIGGER analysis_research_audits_no_update
BEFORE UPDATE ON analysis_research_audits
BEGIN
  SELECT RAISE(ABORT, 'analysis_research_audit_immutable');
END;

CREATE TRIGGER analysis_research_audits_no_delete
BEFORE DELETE ON analysis_research_audits
BEGIN
  SELECT RAISE(ABORT, 'analysis_research_audit_immutable');
END;

-- Layer-three interpretations are immutable overlays on an exact report
-- version. The report version itself remains unchanged and UNREVIEWED.
CREATE TABLE analysis_report_interpretation_runs (
  interpretation_id TEXT PRIMARY KEY NOT NULL CHECK(length(interpretation_id) = 36),
  report_id TEXT NOT NULL,
  report_version INTEGER NOT NULL CHECK(typeof(report_version) = 'integer' AND report_version BETWEEN 1 AND 10000),
  report_version_id TEXT NOT NULL CHECK(length(report_version_id) = 36),
  interpretation_number INTEGER NOT NULL CHECK(typeof(interpretation_number) = 'integer' AND interpretation_number BETWEEN 1 AND 10000),
  interpretation_content_sha256 TEXT NOT NULL CHECK(length(interpretation_content_sha256) = 64 AND interpretation_content_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_byte_size INTEGER NOT NULL CHECK(typeof(artifact_byte_size) = 'integer' AND artifact_byte_size > 0),
  prompt_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  prompt_byte_size INTEGER NOT NULL CHECK(typeof(prompt_byte_size) = 'integer' AND prompt_byte_size > 0),
  source_semantic_version_id TEXT NOT NULL CHECK(length(source_semantic_version_id) = 64 AND source_semantic_version_id NOT GLOB '*[^0-9a-f]*'),
  source_packet_id TEXT NOT NULL CHECK(length(source_packet_id) = 64 AND source_packet_id NOT GLOB '*[^0-9a-f]*'),
  source_packet_sha256 TEXT NOT NULL CHECK(length(source_packet_sha256) = 64 AND source_packet_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_claims_sha256 TEXT NOT NULL CHECK(length(source_claims_sha256) = 64 AND source_claims_sha256 NOT GLOB '*[^0-9a-f]*'),
  provider_id TEXT NOT NULL CHECK(length(trim(provider_id)) BETWEEN 1 AND 120),
  model_id TEXT NOT NULL CHECK(length(trim(model_id)) BETWEEN 1 AND 160),
  prompt_id TEXT NOT NULL CHECK(length(trim(prompt_id)) BETWEEN 1 AND 160),
  prompt_version INTEGER NOT NULL CHECK(typeof(prompt_version) = 'integer' AND prompt_version BETWEEN 1 AND 10000),
  prompt_sha256 TEXT NOT NULL CHECK(length(prompt_sha256) = 64 AND prompt_sha256 NOT GLOB '*[^0-9a-f]*'),
  output_schema_version TEXT NOT NULL CHECK(output_schema_version = '1.0.0'),
  provider_request_id TEXT CHECK(provider_request_id IS NULL OR length(trim(provider_request_id)) BETWEEN 1 AND 300),
  input_token_count INTEGER CHECK(input_token_count IS NULL OR (typeof(input_token_count) = 'integer' AND input_token_count >= 0)),
  output_token_count INTEGER CHECK(output_token_count IS NULL OR (typeof(output_token_count) = 'integer' AND output_token_count >= 0)),
  latency_ms INTEGER CHECK(latency_ms IS NULL OR (typeof(latency_ms) = 'integer' AND latency_ms BETWEEN 0 AND 3600000)),
  completed_at TEXT NOT NULL CHECK(
    julianday(completed_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', completed_at) = completed_at
  ),
  stored_at TEXT NOT NULL CHECK(
    julianday(stored_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', stored_at) = stored_at
  ),
  UNIQUE(report_id, report_version, interpretation_number),
  FOREIGN KEY(report_id, report_version) REFERENCES analysis_report_versions(report_id, version) ON DELETE RESTRICT
) STRICT;

CREATE INDEX analysis_report_interpretation_runs_report_idx
  ON analysis_report_interpretation_runs(report_id, report_version, interpretation_number);

CREATE TRIGGER analysis_report_interpretation_runs_no_update
BEFORE UPDATE ON analysis_report_interpretation_runs
BEGIN SELECT RAISE(ABORT, 'analysis_report_interpretation_immutable'); END;

CREATE TRIGGER analysis_report_interpretation_runs_no_delete
BEFORE DELETE ON analysis_report_interpretation_runs
BEGIN SELECT RAISE(ABORT, 'analysis_report_interpretation_immutable'); END;

CREATE TRIGGER analysis_report_interpretation_runs_sequential
BEFORE INSERT ON analysis_report_interpretation_runs
WHEN NEW.interpretation_number <> COALESCE((
  SELECT MAX(interpretation_number) + 1
  FROM analysis_report_interpretation_runs
  WHERE report_id = NEW.report_id AND report_version = NEW.report_version
), 1)
BEGIN SELECT RAISE(ABORT, 'analysis_report_interpretation_not_sequential'); END;

CREATE TRIGGER analysis_report_interpretation_runs_report_identity
BEFORE INSERT ON analysis_report_interpretation_runs
WHEN
  NEW.report_version_id IS NOT (
    SELECT version_id FROM analysis_report_versions
    WHERE report_id = NEW.report_id AND version = NEW.report_version
  ) OR
  NEW.source_semantic_version_id IS NOT (
    SELECT semantic_version_id FROM analysis_report_versions
    WHERE report_id = NEW.report_id AND version = NEW.report_version
  )
BEGIN SELECT RAISE(ABORT, 'analysis_report_interpretation_report_mismatch'); END;

CREATE TRIGGER analysis_report_interpretation_runs_artifacts
BEFORE INSERT ON analysis_report_interpretation_runs
WHEN
  NEW.artifact_byte_size IS NOT (
    SELECT byte_size FROM artifact_manifests
    WHERE sha256 = NEW.artifact_sha256 AND media_type = 'application/json'
      AND contract_version = '1.0.0' AND retention_status = 'active'
  ) OR
  NEW.prompt_byte_size IS NOT (
    SELECT byte_size FROM artifact_manifests
    WHERE sha256 = NEW.prompt_artifact_sha256 AND media_type = 'text/plain; charset=utf-8'
      AND contract_version = '1.0.0' AND retention_status = 'active'
  ) OR
  NEW.prompt_sha256 IS NOT NEW.prompt_artifact_sha256
BEGIN SELECT RAISE(ABORT, 'analysis_report_interpretation_artifact_mismatch'); END;

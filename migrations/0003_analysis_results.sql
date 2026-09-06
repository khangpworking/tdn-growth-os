CREATE TABLE analysis_results (
  result_id TEXT PRIMARY KEY CHECK (length(result_id) = 36),
  data_pack_id TEXT NOT NULL REFERENCES foundation_data_packs(pack_id) ON DELETE RESTRICT,
  calculation_key TEXT NOT NULL CHECK (calculation_key = 'market_snapshot_v1'),
  calculation_version INTEGER NOT NULL CHECK (typeof(calculation_version) = 'integer' AND calculation_version = 1),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  result_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  completed_at TEXT NOT NULL CHECK (length(trim(completed_at)) > 0),
  UNIQUE (data_pack_id, calculation_key, calculation_version)
) STRICT;

CREATE INDEX analysis_results_artifact_idx
  ON analysis_results(result_artifact_sha256);

CREATE TRIGGER analysis_results_no_update
BEFORE UPDATE ON analysis_results
BEGIN
  SELECT RAISE(ABORT, 'analysis_result_immutable');
END;

CREATE TRIGGER analysis_results_no_delete
BEFORE DELETE ON analysis_results
BEGIN
  SELECT RAISE(ABORT, 'analysis_result_immutable');
END;

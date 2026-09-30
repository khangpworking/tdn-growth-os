-- Freeze one exact, verified Metric source selection and its normalized SQLite
-- projection that downstream readiness/calculation gates can require before
-- report calculation, chart, interpretation or review.
CREATE TABLE analysis_metric_input_preparations (
  preparation_sha256 TEXT PRIMARY KEY NOT NULL
    CHECK(length(preparation_sha256) = 64 AND preparation_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_sha256 TEXT NOT NULL
    CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  workspace_snapshot_sha256 TEXT NOT NULL
    CHECK(length(workspace_snapshot_sha256) = 64 AND workspace_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_package_id TEXT NOT NULL CHECK(length(source_package_id) = 36),
  source_package_manifest_sha256 TEXT NOT NULL
    CHECK(length(source_package_manifest_sha256) = 64 AND source_package_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_content_sha256 TEXT NOT NULL
    CHECK(length(package_content_sha256) = 64 AND package_content_sha256 NOT GLOB '*[^0-9a-f]*'),
  workbook_path TEXT NOT NULL CHECK(length(trim(workbook_path)) BETWEEN 1 AND 500),
  workbook_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  metric_manifest_path TEXT NOT NULL CHECK(length(trim(metric_manifest_path)) BETWEEN 1 AND 500),
  metric_manifest_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  labels_path TEXT CHECK(labels_path IS NULL OR length(trim(labels_path)) BETWEEN 1 AND 500),
  labels_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  normalized_input_sha256 TEXT NOT NULL
    REFERENCES analysis_metric_datasets(normalized_input_sha256) ON DELETE RESTRICT,
  normalization_receipt_sha256 TEXT NOT NULL
    REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  result_artifact_sha256 TEXT NOT NULL UNIQUE
    REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  CHECK((labels_path IS NULL AND labels_sha256 IS NULL) OR
        (labels_path IS NOT NULL AND labels_sha256 IS NOT NULL)),
  CHECK(workbook_path <> metric_manifest_path),
  CHECK(labels_path IS NULL OR (labels_path <> workbook_path AND labels_path <> metric_manifest_path))
) STRICT;

CREATE INDEX analysis_metric_input_preparations_workspace_package
  ON analysis_metric_input_preparations(workspace_id, source_package_id);
CREATE INDEX analysis_metric_input_preparations_dataset
  ON analysis_metric_input_preparations(normalized_input_sha256);

CREATE TRIGGER analysis_metric_input_preparations_no_update
BEFORE UPDATE ON analysis_metric_input_preparations
BEGIN SELECT RAISE(ABORT, 'analysis_metric_input_preparation_immutable'); END;

CREATE TRIGGER analysis_metric_input_preparations_no_delete
BEFORE DELETE ON analysis_metric_input_preparations
BEGIN SELECT RAISE(ABORT, 'analysis_metric_input_preparation_immutable'); END;

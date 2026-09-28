-- An immutable internal-review target binds one exact report version, one
-- exact interpretation run, one intended use and the exact rendered report.
-- It is not a human decision or publication authorization.
CREATE TABLE analysis_report_review_targets (
  review_target_id TEXT PRIMARY KEY NOT NULL CHECK(
    length(review_target_id) = 64 AND review_target_id NOT GLOB '*[^0-9a-f]*'
  ),
  report_id TEXT NOT NULL,
  report_version INTEGER NOT NULL CHECK(typeof(report_version) = 'integer' AND report_version BETWEEN 1 AND 10000),
  report_version_id TEXT NOT NULL CHECK(length(report_version_id) = 36),
  semantic_version_id TEXT NOT NULL CHECK(length(semantic_version_id) = 64 AND semantic_version_id NOT GLOB '*[^0-9a-f]*'),
  interpretation_id TEXT NOT NULL CHECK(length(interpretation_id) = 36),
  interpretation_content_sha256 TEXT NOT NULL CHECK(
    length(interpretation_content_sha256) = 64 AND interpretation_content_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  rendered_report_sha256 TEXT NOT NULL CHECK(
    length(rendered_report_sha256) = 64 AND rendered_report_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  intended_use TEXT NOT NULL CHECK(length(intended_use) BETWEEN 1 AND 300 AND trim(intended_use) = intended_use),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_byte_size INTEGER NOT NULL CHECK(typeof(artifact_byte_size) = 'integer' AND artifact_byte_size > 0),
  stored_at TEXT NOT NULL CHECK(
    julianday(stored_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', stored_at) = stored_at
  ),
  UNIQUE(report_id, report_version, interpretation_id, intended_use),
  FOREIGN KEY(report_id, report_version) REFERENCES analysis_report_versions(report_id, version) ON DELETE RESTRICT,
  FOREIGN KEY(interpretation_id) REFERENCES analysis_report_interpretation_runs(interpretation_id) ON DELETE RESTRICT
) STRICT;

CREATE INDEX analysis_report_review_targets_report_idx
  ON analysis_report_review_targets(report_id, report_version, interpretation_id);

CREATE TRIGGER analysis_report_review_targets_no_update
BEFORE UPDATE ON analysis_report_review_targets
BEGIN SELECT RAISE(ABORT, 'analysis_report_review_target_immutable'); END;

CREATE TRIGGER analysis_report_review_targets_no_delete
BEFORE DELETE ON analysis_report_review_targets
BEGIN SELECT RAISE(ABORT, 'analysis_report_review_target_immutable'); END;

CREATE TRIGGER analysis_report_review_targets_exact_lineage
BEFORE INSERT ON analysis_report_review_targets
WHEN
  NEW.report_version_id IS NOT (
    SELECT version_id FROM analysis_report_versions
    WHERE report_id = NEW.report_id AND version = NEW.report_version
  ) OR
  NEW.semantic_version_id IS NOT (
    SELECT semantic_version_id FROM analysis_report_versions
    WHERE report_id = NEW.report_id AND version = NEW.report_version
  ) OR
  NEW.report_id IS NOT (
    SELECT report_id FROM analysis_report_interpretation_runs
    WHERE interpretation_id = NEW.interpretation_id
  ) OR
  NEW.report_version IS NOT (
    SELECT report_version FROM analysis_report_interpretation_runs
    WHERE interpretation_id = NEW.interpretation_id
  ) OR
  NEW.report_version_id IS NOT (
    SELECT report_version_id FROM analysis_report_interpretation_runs
    WHERE interpretation_id = NEW.interpretation_id
  ) OR
  NEW.semantic_version_id IS NOT (
    SELECT source_semantic_version_id FROM analysis_report_interpretation_runs
    WHERE interpretation_id = NEW.interpretation_id
  ) OR
  NEW.interpretation_content_sha256 IS NOT (
    SELECT interpretation_content_sha256 FROM analysis_report_interpretation_runs
    WHERE interpretation_id = NEW.interpretation_id
  )
BEGIN SELECT RAISE(ABORT, 'analysis_report_review_target_lineage_mismatch'); END;

CREATE TRIGGER analysis_report_review_targets_artifact
BEFORE INSERT ON analysis_report_review_targets
WHEN NEW.artifact_byte_size IS NOT (
  SELECT byte_size FROM artifact_manifests
  WHERE sha256 = NEW.artifact_sha256 AND media_type = 'application/json'
    AND contract_version = '1.0.0' AND retention_status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_review_target_artifact_mismatch'); END;

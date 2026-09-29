-- Preserve the original Metric source ledger while allowing one exact pair of
-- supplemental M08 quote sources. Existing report versions remain valid with
-- supplemental_source_count = 0.
ALTER TABLE analysis_report_versions
ADD COLUMN supplemental_source_count INTEGER NOT NULL DEFAULT 0 CHECK(
  typeof(supplemental_source_count) = 'integer' AND
  supplemental_source_count IN (0, 2)
);

CREATE TABLE analysis_report_version_supplemental_sources (
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal BETWEEN 0 AND 19),
  role TEXT NOT NULL CHECK(role IN ('tabletQuoteSource', 'tabletQuoteInput')),
  logical_path TEXT NOT NULL CHECK(length(trim(logical_path)) BETWEEN 1 AND 500),
  source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  PRIMARY KEY(report_id, version, ordinal),
  UNIQUE(report_id, version, role),
  FOREIGN KEY(report_id, version) REFERENCES analysis_report_versions(report_id, version)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TRIGGER analysis_report_version_supplemental_sources_no_update
BEFORE UPDATE ON analysis_report_version_supplemental_sources
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_supplemental_source_immutable'); END;

CREATE TRIGGER analysis_report_version_supplemental_sources_no_delete
BEFORE DELETE ON analysis_report_version_supplemental_sources
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_supplemental_source_immutable'); END;

CREATE TRIGGER analysis_report_version_supplemental_sources_no_append
BEFORE INSERT ON analysis_report_version_supplemental_sources
WHEN EXISTS (
  SELECT 1 FROM analysis_report_versions
  WHERE report_id = NEW.report_id AND version = NEW.version
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_supplemental_source_frozen'); END;

DROP TRIGGER analysis_report_versions_membership_complete;

CREATE TRIGGER analysis_report_versions_membership_complete
BEFORE INSERT ON analysis_report_versions
WHEN
  NEW.artifact_count <> (
    SELECT count(*) FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.version
  ) OR
  NEW.source_count <> (
    SELECT count(*) FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version
  ) OR
  NEW.supplemental_source_count <> (
    SELECT count(*) FROM analysis_report_version_supplemental_sources
    WHERE report_id = NEW.report_id AND version = NEW.version
  ) OR
  0 IS NOT (
    SELECT min(ordinal) FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version
  ) OR
  NEW.source_count - 1 IS NOT (
    SELECT max(ordinal) FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version
  ) OR
  'workbook' IS NOT (
    SELECT role FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version AND ordinal = 0
  ) OR
  'manifest' IS NOT (
    SELECT role FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version AND ordinal = 1
  ) OR
  (NEW.source_count = 3 AND 'labels' IS NOT (
    SELECT role FROM analysis_report_version_sources
    WHERE report_id = NEW.report_id AND version = NEW.version AND ordinal = 2
  )) OR
  (NEW.supplemental_source_count = 2 AND 'tabletQuoteSource' IS NOT (
    SELECT role FROM analysis_report_version_supplemental_sources
    WHERE report_id = NEW.report_id AND version = NEW.version AND ordinal = NEW.source_count
  )) OR
  (NEW.supplemental_source_count = 2 AND 'tabletQuoteInput' IS NOT (
    SELECT role FROM analysis_report_version_supplemental_sources
    WHERE report_id = NEW.report_id AND version = NEW.version AND ordinal = NEW.source_count + 1
  )) OR
  NEW.request_artifact_sha256 IS NOT (
    SELECT artifact_sha256 FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.version AND file_name = 'create-request.json'
  ) OR
  NEW.evidence_envelope_sha256 IS NOT (
    SELECT artifact_sha256 FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.version AND file_name = 'evidence-envelope.json'
  ) OR
  NEW.semantic_content_sha256 IS NOT (
    SELECT artifact_sha256 FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.version AND file_name = 'semantic-content.json'
  ) OR
  NEW.review_state_sha256 IS NOT (
    SELECT artifact_sha256 FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.version AND file_name = 'review-state.json'
  )
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_membership_incomplete'); END;

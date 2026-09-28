-- Immutable report-version ledger. Cross-box source/workspace identities are
-- retained as verified snapshots rather than relational foreign keys; replay
-- goes back through the owning readers.
CREATE TABLE analysis_report_series (
  report_id TEXT PRIMARY KEY NOT NULL CHECK(length(report_id) = 36),
  report_key TEXT NOT NULL UNIQUE CHECK(
    length(report_key) BETWEEN 3 AND 128 AND
    report_key GLOB '[a-z0-9]*' AND
    report_key NOT GLOB '*[^a-z0-9_-]*'
  ),
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  created_at TEXT NOT NULL CHECK(
    julianday(created_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
  )
) STRICT;

CREATE TABLE analysis_report_versions (
  version_id TEXT PRIMARY KEY NOT NULL CHECK(length(version_id) = 36),
  report_id TEXT NOT NULL REFERENCES analysis_report_series(report_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version BETWEEN 1 AND 10000),
  previous_semantic_version_id TEXT CHECK(
    previous_semantic_version_id IS NULL OR
    (length(previous_semantic_version_id) = 64 AND previous_semantic_version_id NOT GLOB '*[^0-9a-f]*')
  ),
  semantic_version_id TEXT NOT NULL CHECK(length(semantic_version_id) = 64 AND semantic_version_id NOT GLOB '*[^0-9a-f]*'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  evidence_envelope_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  semantic_content_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  review_state_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL CHECK(length(workspace_id) = 36),
  workspace_snapshot_sha256 TEXT NOT NULL CHECK(length(workspace_snapshot_sha256) = 64 AND workspace_snapshot_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_package_id TEXT NOT NULL CHECK(length(source_package_id) = 36),
  source_package_manifest_sha256 TEXT NOT NULL CHECK(length(source_package_manifest_sha256) = 64 AND source_package_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_content_sha256 TEXT NOT NULL CHECK(length(package_content_sha256) = 64 AND package_content_sha256 NOT GLOB '*[^0-9a-f]*'),
  artifact_count INTEGER NOT NULL CHECK(typeof(artifact_count) = 'integer' AND artifact_count BETWEEN 1 AND 40),
  source_count INTEGER NOT NULL CHECK(typeof(source_count) = 'integer' AND source_count BETWEEN 2 AND 3),
  interpretation_state TEXT NOT NULL CHECK(interpretation_state = 'NONE'),
  review_state TEXT NOT NULL CHECK(review_state = 'UNREVIEWED'),
  created_at TEXT NOT NULL CHECK(
    julianday(created_at) IS NOT NULL AND
    strftime('%Y-%m-%dT%H:%M:%fZ', created_at) = created_at
  ),
  UNIQUE(report_id, version),
  UNIQUE(report_id, semantic_version_id),
  UNIQUE(report_id, request_sha256)
) STRICT;

CREATE TABLE analysis_report_version_artifacts (
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  file_name TEXT NOT NULL CHECK(
    length(file_name) BETWEEN 1 AND 120 AND
    file_name NOT GLOB '*[^a-z0-9._-]*'
  ),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK(length(trim(media_type)) BETWEEN 1 AND 120),
  byte_size INTEGER NOT NULL CHECK(typeof(byte_size) = 'integer' AND byte_size >= 0),
  PRIMARY KEY(report_id, version, file_name),
  FOREIGN KEY(report_id, version) REFERENCES analysis_report_versions(report_id, version)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE analysis_report_version_sources (
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal BETWEEN 0 AND 19),
  role TEXT NOT NULL CHECK(role IN ('workbook', 'manifest', 'labels')),
  logical_path TEXT NOT NULL CHECK(length(trim(logical_path)) BETWEEN 1 AND 500),
  source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  PRIMARY KEY(report_id, version, ordinal),
  UNIQUE(report_id, version, role),
  FOREIGN KEY(report_id, version) REFERENCES analysis_report_versions(report_id, version)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TRIGGER analysis_report_series_no_update BEFORE UPDATE ON analysis_report_series
BEGIN SELECT RAISE(ABORT, 'analysis_report_series_immutable'); END;
CREATE TRIGGER analysis_report_series_no_delete BEFORE DELETE ON analysis_report_series
BEGIN SELECT RAISE(ABORT, 'analysis_report_series_immutable'); END;
CREATE TRIGGER analysis_report_versions_no_update BEFORE UPDATE ON analysis_report_versions
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_immutable'); END;
CREATE TRIGGER analysis_report_versions_no_delete BEFORE DELETE ON analysis_report_versions
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_immutable'); END;
CREATE TRIGGER analysis_report_version_artifacts_no_update BEFORE UPDATE ON analysis_report_version_artifacts
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_artifact_immutable'); END;
CREATE TRIGGER analysis_report_version_artifacts_no_delete BEFORE DELETE ON analysis_report_version_artifacts
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_artifact_immutable'); END;
CREATE TRIGGER analysis_report_version_sources_no_update BEFORE UPDATE ON analysis_report_version_sources
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_source_immutable'); END;
CREATE TRIGGER analysis_report_version_sources_no_delete BEFORE DELETE ON analysis_report_version_sources
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_source_immutable'); END;

CREATE TRIGGER analysis_report_versions_series_workspace
BEFORE INSERT ON analysis_report_versions
WHEN NEW.workspace_id IS NOT (
  SELECT workspace_id FROM analysis_report_series WHERE report_id = NEW.report_id
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_workspace_mismatch'); END;

CREATE TRIGGER analysis_report_version_artifacts_no_append
BEFORE INSERT ON analysis_report_version_artifacts
WHEN EXISTS (
  SELECT 1 FROM analysis_report_versions
  WHERE report_id = NEW.report_id AND version = NEW.version
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_artifact_frozen'); END;

CREATE TRIGGER analysis_report_version_sources_no_append
BEFORE INSERT ON analysis_report_version_sources
WHEN EXISTS (
  SELECT 1 FROM analysis_report_versions
  WHERE report_id = NEW.report_id AND version = NEW.version
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_source_frozen'); END;

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

CREATE TRIGGER analysis_report_versions_sequential
BEFORE INSERT ON analysis_report_versions
WHEN NEW.version <> COALESCE(
  (SELECT MAX(version) + 1 FROM analysis_report_versions WHERE report_id = NEW.report_id),
  1
)
BEGIN SELECT RAISE(ABORT, 'analysis_report_version_not_sequential'); END;

CREATE TRIGGER analysis_report_versions_previous_semantic
BEFORE INSERT ON analysis_report_versions
WHEN
  (NEW.version = 1 AND NEW.previous_semantic_version_id IS NOT NULL) OR
  (NEW.version > 1 AND NEW.previous_semantic_version_id IS NOT (
    SELECT semantic_version_id FROM analysis_report_versions
    WHERE report_id = NEW.report_id AND version = NEW.version - 1
  ))
BEGIN SELECT RAISE(ABORT, 'analysis_report_previous_semantic_mismatch'); END;

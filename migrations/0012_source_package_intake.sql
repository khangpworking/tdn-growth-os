CREATE TABLE foundation_source_packages (
  package_id TEXT PRIMARY KEY CHECK(length(package_id) = 36 AND trim(package_id) <> ''),
  package_key TEXT NOT NULL CHECK(trim(package_key) <> ''),
  version INTEGER NOT NULL CHECK(version > 0),
  source_acquired_at TEXT,
  source_label TEXT NOT NULL CHECK(trim(source_label) <> ''),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_content_sha256 TEXT NOT NULL CHECK(length(package_content_sha256) = 64 AND package_content_sha256 NOT GLOB '*[^0-9a-f]*'),
  manifest_artifact_sha256 TEXT NOT NULL CHECK(length(manifest_artifact_sha256) = 64 AND manifest_artifact_sha256 NOT GLOB '*[^0-9a-f]*') REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  finalized_at TEXT,
  UNIQUE(package_key, version)
) STRICT;

CREATE TABLE foundation_source_package_files (
  package_id TEXT NOT NULL REFERENCES foundation_source_packages(package_id) ON DELETE RESTRICT,
  logical_path TEXT NOT NULL CHECK(trim(logical_path) <> ''),
  artifact_sha256 TEXT NOT NULL CHECK(length(artifact_sha256) = 64 AND artifact_sha256 NOT GLOB '*[^0-9a-f]*') REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  byte_size INTEGER NOT NULL CHECK(byte_size >= 0),
  media_type TEXT NOT NULL CHECK(trim(media_type) <> ''),
  evidence_family TEXT NOT NULL CHECK(trim(evidence_family) <> ''),
  representation_role TEXT NOT NULL CHECK(representation_role IN ('primary','alternate','structured','derived')),
  independence TEXT NOT NULL CHECK(independence IN ('independent','non_independent')),
  provider_provenance TEXT NOT NULL CHECK(provider_provenance IN ('verified','provider_reported','operator_supplied_unverified','synthetic')),
  provenance_basis TEXT NOT NULL CHECK(length(trim(provenance_basis)) BETWEEN 1 AND 1000),
  period_start TEXT,
  period_end TEXT,
  CHECK((period_start IS NULL) = (period_end IS NULL)),
  CHECK(period_start IS NULL OR (
    julianday(period_start) IS NOT NULL AND
    julianday(period_end) IS NOT NULL AND
    julianday(period_start) <= julianday(period_end)
  )),
  CHECK(representation_role NOT IN ('structured','derived') OR independence = 'non_independent'),
  PRIMARY KEY(package_id, logical_path)
) STRICT;

CREATE TABLE analysis_source_package_field_audit_results (
  result_id TEXT PRIMARY KEY CHECK(length(result_id) = 36 AND trim(result_id) <> ''),
  package_id TEXT NOT NULL REFERENCES foundation_source_packages(package_id) ON DELETE RESTRICT,
  package_manifest_sha256 TEXT NOT NULL CHECK(length(package_manifest_sha256) = 64 AND package_manifest_sha256 NOT GLOB '*[^0-9a-f]*') REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  result_artifact_sha256 TEXT NOT NULL UNIQUE CHECK(length(result_artifact_sha256) = 64 AND result_artifact_sha256 NOT GLOB '*[^0-9a-f]*') REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  completed_at TEXT NOT NULL CHECK(trim(completed_at) <> ''),
  UNIQUE(package_id, request_sha256)
) STRICT;

CREATE TRIGGER foundation_source_packages_must_start_unfinalized
BEFORE INSERT ON foundation_source_packages
WHEN NEW.finalized_at IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'source_package_must_start_unfinalized');
END;

CREATE TRIGGER foundation_source_packages_no_update
BEFORE UPDATE ON foundation_source_packages
WHEN OLD.finalized_at IS NOT NULL OR
     NEW.finalized_at IS NULL OR
     NEW.package_id <> OLD.package_id OR
     NEW.package_key <> OLD.package_key OR
     NEW.version <> OLD.version OR
     NEW.source_acquired_at IS NOT OLD.source_acquired_at OR
     NEW.source_label <> OLD.source_label OR
     NEW.request_sha256 <> OLD.request_sha256 OR
     NEW.package_content_sha256 <> OLD.package_content_sha256 OR
     NEW.manifest_artifact_sha256 <> OLD.manifest_artifact_sha256
BEGIN SELECT RAISE(ABORT, 'immutable_source_package'); END;
CREATE TRIGGER foundation_source_packages_no_delete BEFORE DELETE ON foundation_source_packages BEGIN SELECT RAISE(ABORT, 'immutable_source_package'); END;
CREATE TRIGGER foundation_source_package_files_no_update BEFORE UPDATE ON foundation_source_package_files BEGIN SELECT RAISE(ABORT, 'immutable_source_package_file'); END;
CREATE TRIGGER foundation_source_package_files_no_delete BEFORE DELETE ON foundation_source_package_files BEGIN SELECT RAISE(ABORT, 'immutable_source_package_file'); END;
CREATE TRIGGER analysis_source_package_field_audits_no_update BEFORE UPDATE ON analysis_source_package_field_audit_results BEGIN SELECT RAISE(ABORT, 'immutable_source_package_field_audit'); END;
CREATE TRIGGER analysis_source_package_field_audits_no_delete BEFORE DELETE ON analysis_source_package_field_audit_results BEGIN SELECT RAISE(ABORT, 'immutable_source_package_field_audit'); END;

CREATE TRIGGER foundation_source_package_files_no_insert_after_finalize
BEFORE INSERT ON foundation_source_package_files
WHEN (SELECT finalized_at FROM foundation_source_packages WHERE package_id = NEW.package_id) IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'finalized_source_package');
END;

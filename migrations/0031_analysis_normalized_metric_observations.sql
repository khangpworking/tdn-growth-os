-- Queryable, immutable projection of one replay-verified normalized Metric input.
-- The content digest remains the authority; SQL rows are an exact projection.
CREATE TABLE analysis_metric_datasets (
  normalized_input_sha256 TEXT PRIMARY KEY NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT
    CHECK(length(normalized_input_sha256) = 64 AND normalized_input_sha256 NOT GLOB '*[^0-9a-f]*'),
  contract_version TEXT NOT NULL CHECK(contract_version = '1.0.0'),
  scope_key TEXT NOT NULL CHECK(length(scope_key) BETWEEN 1 AND 100),
  platform TEXT NOT NULL CHECK(platform IN ('shopee', 'tiktok')),
  selection TEXT NOT NULL CHECK(selection IN ('ON', 'OFF', 'UNSPECIFIED')),
  period_start TEXT NOT NULL CHECK(date(period_start) IS NOT NULL AND date(period_start) = period_start),
  period_end TEXT NOT NULL CHECK(date(period_end) IS NOT NULL AND date(period_end) = period_end AND date(period_start) <= date(period_end)),
  period_basis TEXT NOT NULL CHECK(length(period_basis) BETWEEN 1 AND 1000),
  acquired_at TEXT CHECK(acquired_at IS NULL OR julianday(acquired_at) IS NOT NULL),
  profile_id TEXT NOT NULL CHECK(length(profile_id) BETWEEN 1 AND 100),
  label_codebook_version TEXT NOT NULL CHECK(length(label_codebook_version) BETWEEN 1 AND 100),
  wide_unknown_policy TEXT NOT NULL CHECK(wide_unknown_policy IN ('include', 'exclude')),
  source_count INTEGER NOT NULL CHECK(typeof(source_count) = 'integer' AND source_count BETWEEN 1 AND 100),
  row_count INTEGER NOT NULL CHECK(typeof(row_count) = 'integer' AND row_count BETWEEN 0 AND 10000)
) STRICT;

CREATE TABLE analysis_metric_dataset_sources (
  normalized_input_sha256 TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal BETWEEN 0 AND 99),
  source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200),
  representation_role TEXT NOT NULL CHECK(representation_role IN ('primary', 'structured', 'derived')),
  evidence_family TEXT NOT NULL CHECK(length(trim(evidence_family)) BETWEEN 1 AND 200),
  provenance_basis TEXT NOT NULL CHECK(length(trim(provenance_basis)) BETWEEN 1 AND 1000),
  PRIMARY KEY(normalized_input_sha256, ordinal),
  FOREIGN KEY(normalized_input_sha256) REFERENCES analysis_metric_datasets(normalized_input_sha256)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE analysis_metric_dataset_rows (
  normalized_input_sha256 TEXT NOT NULL,
  record_index INTEGER NOT NULL CHECK(typeof(record_index) = 'integer' AND record_index BETWEEN 0 AND 9999),
  shop_id TEXT NOT NULL CHECK(length(shop_id) BETWEEN 1 AND 128),
  listing_id TEXT NOT NULL CHECK(length(listing_id) BETWEEN 1 AND 128),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 1000),
  category TEXT NOT NULL CHECK(length(category) BETWEEN 1 AND 500),
  row_source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  row_source_locator TEXT NOT NULL CHECK(length(row_source_locator) BETWEEN 1 AND 1000),
  revenue_state TEXT NOT NULL CHECK(revenue_state IN ('missing', 'observed_zero', 'observed_value')),
  revenue_value TEXT CHECK(revenue_value IS NULL OR (length(revenue_value) BETWEEN 1 AND 40 AND revenue_value NOT GLOB '*[^0-9]*')),
  revenue_precision TEXT NOT NULL CHECK(revenue_precision IN ('exact', 'display_rounded', 'estimated', 'unknown')),
  revenue_source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  revenue_source_locator TEXT NOT NULL CHECK(length(revenue_source_locator) BETWEEN 1 AND 1000),
  revenue_displayed_value TEXT CHECK(revenue_displayed_value IS NULL OR length(revenue_displayed_value) <= 200),
  units_state TEXT NOT NULL CHECK(units_state IN ('missing', 'observed_zero', 'observed_value')),
  units_value TEXT CHECK(units_value IS NULL OR (length(units_value) BETWEEN 1 AND 40 AND units_value NOT GLOB '*[^0-9]*')),
  units_precision TEXT NOT NULL CHECK(units_precision IN ('exact', 'display_rounded', 'estimated', 'unknown')),
  units_source_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  units_source_locator TEXT NOT NULL CHECK(length(units_source_locator) BETWEEN 1 AND 1000),
  units_displayed_value TEXT CHECK(units_displayed_value IS NULL OR length(units_displayed_value) <= 200),
  label_classification TEXT CHECK(label_classification IS NULL OR label_classification IN ('CORE_CANDIDATE', 'ADJACENT', 'OUTSIDE', 'UNKNOWN')),
  label_group TEXT CHECK(label_group IS NULL OR length(label_group) BETWEEN 1 AND 128),
  label_content_sha256 TEXT CHECK(label_content_sha256 IS NULL OR (length(label_content_sha256) = 64 AND label_content_sha256 NOT GLOB '*[^0-9a-f]*')),
  label_method_version TEXT CHECK(label_method_version IS NULL OR length(label_method_version) BETWEEN 1 AND 100),
  label_adjudication TEXT CHECK(label_adjudication IS NULL OR label_adjudication IN ('human', 'assistant', 'unknown')),
  label_source_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  label_source_locator TEXT CHECK(label_source_locator IS NULL OR length(label_source_locator) BETWEEN 1 AND 1000),
  PRIMARY KEY(normalized_input_sha256, record_index),
  UNIQUE(normalized_input_sha256, shop_id, listing_id),
  CHECK(
    (revenue_state = 'missing' AND revenue_value IS NULL) OR
    (revenue_state = 'observed_zero' AND revenue_value = '0') OR
    (revenue_state = 'observed_value' AND revenue_value IS NOT NULL AND revenue_value <> '0')
  ),
  CHECK(
    (units_state = 'missing' AND units_value IS NULL) OR
    (units_state = 'observed_zero' AND units_value = '0') OR
    (units_state = 'observed_value' AND units_value IS NOT NULL AND units_value <> '0')
  ),
  CHECK(
    (label_classification IS NULL AND label_group IS NULL AND label_content_sha256 IS NULL AND
     label_method_version IS NULL AND label_adjudication IS NULL AND label_source_sha256 IS NULL AND label_source_locator IS NULL) OR
    (label_classification IS NOT NULL AND label_group IS NOT NULL AND label_content_sha256 IS NOT NULL AND
     label_method_version IS NOT NULL AND label_adjudication IS NOT NULL AND label_source_sha256 IS NOT NULL AND label_source_locator IS NOT NULL)
  ),
  FOREIGN KEY(normalized_input_sha256) REFERENCES analysis_metric_datasets(normalized_input_sha256)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED
) STRICT;

CREATE TABLE analysis_metric_dataset_origins (
  report_id TEXT NOT NULL,
  report_version INTEGER NOT NULL CHECK(typeof(report_version) = 'integer' AND report_version BETWEEN 1 AND 10000),
  normalized_input_sha256 TEXT NOT NULL REFERENCES analysis_metric_datasets(normalized_input_sha256) ON DELETE RESTRICT,
  source_package_id TEXT NOT NULL CHECK(length(source_package_id) = 36),
  source_package_manifest_sha256 TEXT NOT NULL CHECK(length(source_package_manifest_sha256) = 64 AND source_package_manifest_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_content_sha256 TEXT NOT NULL CHECK(length(package_content_sha256) = 64 AND package_content_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(report_id, report_version),
  FOREIGN KEY(report_id, report_version) REFERENCES analysis_report_versions(report_id, version) ON DELETE RESTRICT
) STRICT;

CREATE INDEX analysis_metric_dataset_rows_listing
  ON analysis_metric_dataset_rows(normalized_input_sha256, shop_id, listing_id);
CREATE INDEX analysis_metric_dataset_rows_label
  ON analysis_metric_dataset_rows(normalized_input_sha256, label_classification, label_group);
CREATE INDEX analysis_metric_dataset_origins_digest
  ON analysis_metric_dataset_origins(normalized_input_sha256);

CREATE TRIGGER analysis_metric_dataset_sources_no_update BEFORE UPDATE ON analysis_metric_dataset_sources
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_source_immutable'); END;
CREATE TRIGGER analysis_metric_dataset_sources_no_delete BEFORE DELETE ON analysis_metric_dataset_sources
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_source_immutable'); END;
CREATE TRIGGER analysis_metric_dataset_rows_no_update BEFORE UPDATE ON analysis_metric_dataset_rows
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_row_immutable'); END;
CREATE TRIGGER analysis_metric_dataset_rows_no_delete BEFORE DELETE ON analysis_metric_dataset_rows
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_row_immutable'); END;
CREATE TRIGGER analysis_metric_datasets_no_update BEFORE UPDATE ON analysis_metric_datasets
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_immutable'); END;
CREATE TRIGGER analysis_metric_datasets_no_delete BEFORE DELETE ON analysis_metric_datasets
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_immutable'); END;
CREATE TRIGGER analysis_metric_dataset_origins_no_update BEFORE UPDATE ON analysis_metric_dataset_origins
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_origin_immutable'); END;
CREATE TRIGGER analysis_metric_dataset_origins_no_delete BEFORE DELETE ON analysis_metric_dataset_origins
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_origin_immutable'); END;

CREATE TRIGGER analysis_metric_dataset_sources_no_append
BEFORE INSERT ON analysis_metric_dataset_sources
WHEN EXISTS(SELECT 1 FROM analysis_metric_datasets WHERE normalized_input_sha256 = NEW.normalized_input_sha256)
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_source_frozen'); END;
CREATE TRIGGER analysis_metric_dataset_rows_no_append
BEFORE INSERT ON analysis_metric_dataset_rows
WHEN EXISTS(SELECT 1 FROM analysis_metric_datasets WHERE normalized_input_sha256 = NEW.normalized_input_sha256)
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_row_frozen'); END;

CREATE TRIGGER analysis_metric_dataset_rows_sources_known
BEFORE INSERT ON analysis_metric_dataset_rows
WHEN
  NOT EXISTS(SELECT 1 FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256 AND source_sha256 = NEW.row_source_sha256) OR
  NOT EXISTS(SELECT 1 FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256 AND source_sha256 = NEW.revenue_source_sha256) OR
  NOT EXISTS(SELECT 1 FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256 AND source_sha256 = NEW.units_source_sha256) OR
  (NEW.label_source_sha256 IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM analysis_metric_dataset_sources
    WHERE normalized_input_sha256 = NEW.normalized_input_sha256 AND source_sha256 = NEW.label_source_sha256
  ))
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_row_source_unknown'); END;

CREATE TRIGGER analysis_metric_datasets_membership_complete
BEFORE INSERT ON analysis_metric_datasets
WHEN
  NEW.source_count <> (SELECT count(*) FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256) OR
  NEW.row_count <> (SELECT count(*) FROM analysis_metric_dataset_rows WHERE normalized_input_sha256 = NEW.normalized_input_sha256) OR
  0 IS NOT (SELECT min(ordinal) FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256) OR
  NEW.source_count - 1 IS NOT (SELECT max(ordinal) FROM analysis_metric_dataset_sources WHERE normalized_input_sha256 = NEW.normalized_input_sha256) OR
  (NEW.row_count > 0 AND 0 IS NOT (SELECT min(record_index) FROM analysis_metric_dataset_rows WHERE normalized_input_sha256 = NEW.normalized_input_sha256)) OR
  (NEW.row_count > 0 AND NEW.row_count - 1 IS NOT (SELECT max(record_index) FROM analysis_metric_dataset_rows WHERE normalized_input_sha256 = NEW.normalized_input_sha256))
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_membership_incomplete'); END;

CREATE TRIGGER analysis_metric_dataset_origins_verified
BEFORE INSERT ON analysis_metric_dataset_origins
WHEN
  NEW.normalized_input_sha256 IS NOT (
    SELECT artifact_sha256 FROM analysis_report_version_artifacts
    WHERE report_id = NEW.report_id AND version = NEW.report_version AND file_name = 'normalized-input.json'
  ) OR
  NEW.source_package_id IS NOT (
    SELECT source_package_id FROM analysis_report_versions WHERE report_id = NEW.report_id AND version = NEW.report_version
  ) OR
  NEW.source_package_manifest_sha256 IS NOT (
    SELECT source_package_manifest_sha256 FROM analysis_report_versions WHERE report_id = NEW.report_id AND version = NEW.report_version
  ) OR
  NEW.package_content_sha256 IS NOT (
    SELECT package_content_sha256 FROM analysis_report_versions WHERE report_id = NEW.report_id AND version = NEW.report_version
  )
BEGIN SELECT RAISE(ABORT, 'analysis_metric_dataset_origin_mismatch'); END;

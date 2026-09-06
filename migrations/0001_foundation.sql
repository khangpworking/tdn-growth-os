CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (typeof(version) = 'integer' AND version > 0),
  name TEXT NOT NULL UNIQUE CHECK (length(trim(name)) > 0),
  checksum_sha256 TEXT NOT NULL CHECK (
    length(checksum_sha256) = 64 AND checksum_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  applied_at TEXT NOT NULL CHECK (length(trim(applied_at)) > 0)
) STRICT;

CREATE TABLE foundation_sources (
  source_id TEXT PRIMARY KEY CHECK (
    length(source_id) BETWEEN 3 AND 160 AND
    instr(source_id, ':') > 1 AND
    source_id NOT GLOB '*[[:space:]]*'
  ),
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'provider_export', 'provider_api')),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 200),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE foundation_ingestion_runs (
  ingestion_id TEXT PRIMARY KEY CHECK (length(ingestion_id) = 36),
  source_id TEXT NOT NULL REFERENCES foundation_sources(source_id) ON DELETE RESTRICT,
  idempotency_key TEXT NOT NULL CHECK (length(trim(idempotency_key)) BETWEEN 1 AND 200),
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  acquired_at TEXT NOT NULL CHECK (length(trim(acquired_at)) > 0),
  started_at TEXT NOT NULL CHECK (length(trim(started_at)) > 0),
  completed_at TEXT,
  artifact_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  request_sha256 TEXT NOT NULL CHECK (length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  contract_version TEXT NOT NULL CHECK (length(trim(contract_version)) > 0),
  UNIQUE (source_id, idempotency_key),
  CHECK (
    (status = 'processing' AND completed_at IS NULL AND artifact_sha256 IS NULL) OR
    (status = 'completed' AND completed_at IS NOT NULL AND artifact_sha256 IS NOT NULL) OR
    (status = 'failed' AND completed_at IS NOT NULL)
  )
) STRICT;

CREATE TABLE artifact_manifests (
  sha256 TEXT PRIMARY KEY CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  byte_size INTEGER NOT NULL CHECK (typeof(byte_size) = 'integer' AND byte_size >= 0),
  media_type TEXT NOT NULL CHECK (length(trim(media_type)) BETWEEN 1 AND 120),
  relative_path TEXT NOT NULL UNIQUE CHECK (
    length(trim(relative_path)) > 0 AND
    relative_path NOT LIKE '/%' AND
    relative_path NOT LIKE '%\\%' AND
    relative_path NOT LIKE '%..%'
  ),
  acquired_at TEXT NOT NULL CHECK (length(trim(acquired_at)) > 0),
  contract_version TEXT NOT NULL CHECK (length(trim(contract_version)) > 0),
  retention_status TEXT NOT NULL DEFAULT 'active' CHECK (retention_status IN ('active', 'held', 'eligible_for_deletion')),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE foundation_evidence (
  evidence_id TEXT PRIMARY KEY CHECK (length(evidence_id) = 36),
  ingestion_id TEXT NOT NULL UNIQUE REFERENCES foundation_ingestion_runs(ingestion_id) ON DELETE RESTRICT,
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  evidence_grade TEXT NOT NULL CHECK (
    evidence_grade IN ('synthetic', 'unverified', 'provider_reported', 'corroborated', 'verified')
  ),
  evidence_grade_basis TEXT NOT NULL CHECK (length(trim(evidence_grade_basis)) BETWEEN 1 AND 1000),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE foundation_products (
  product_id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL CHECK (length(trim(platform)) BETWEEN 1 AND 80),
  platform_product_id TEXT NOT NULL CHECK (length(trim(platform_product_id)) BETWEEN 1 AND 160),
  product_name TEXT NOT NULL CHECK (length(trim(product_name)) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK (length(trim(updated_at)) > 0),
  UNIQUE (platform, platform_product_id)
) STRICT;

CREATE TABLE foundation_observations (
  observation_id INTEGER PRIMARY KEY,
  identity_key TEXT NOT NULL UNIQUE CHECK (length(identity_key) = 64 AND identity_key NOT GLOB '*[^0-9a-f]*'),
  product_id INTEGER NOT NULL REFERENCES foundation_products(product_id) ON DELETE RESTRICT,
  metric_code TEXT NOT NULL CHECK (
    metric_code IN ('period_revenue_vnd', 'lifetime_revenue_vnd', 'units_sold', 'revenue_growth_percent', 'trends_interest_index')
  ),
  integer_value INTEGER NOT NULL CHECK (typeof(integer_value) = 'integer'),
  unit TEXT NOT NULL CHECK (unit IN ('VND', 'count', 'percent', 'relative_interest_index_0_100')),
  scale INTEGER CHECK (scale IS NULL OR (typeof(scale) = 'integer' AND scale >= 1)),
  scope TEXT NOT NULL CHECK (length(trim(scope)) BETWEEN 1 AND 100),
  period_start TEXT NOT NULL CHECK (length(trim(period_start)) > 0),
  period_end TEXT NOT NULL CHECK (length(trim(period_end)) > 0),
  period_grain TEXT NOT NULL CHECK (length(trim(period_grain)) BETWEEN 1 AND 80),
  observed_at TEXT NOT NULL CHECK (length(trim(observed_at)) > 0),
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  CHECK (
    julianday(period_start) IS NOT NULL AND
    julianday(period_end) IS NOT NULL AND
    julianday(period_start) <= julianday(period_end)
  ),
  CHECK (
    (metric_code IN ('period_revenue_vnd', 'lifetime_revenue_vnd') AND unit = 'VND' AND scale IS NULL AND integer_value >= 0) OR
    (metric_code = 'units_sold' AND unit = 'count' AND scale IS NULL AND integer_value >= 0) OR
    (metric_code = 'revenue_growth_percent' AND unit = 'percent' AND scale IS NOT NULL) OR
    (metric_code = 'trends_interest_index' AND unit = 'relative_interest_index_0_100' AND scale IS NULL AND integer_value BETWEEN 0 AND 100)
  )
) STRICT;

CREATE TABLE foundation_observation_evidence (
  observation_id INTEGER NOT NULL REFERENCES foundation_observations(observation_id) ON DELETE RESTRICT,
  evidence_id TEXT NOT NULL REFERENCES foundation_evidence(evidence_id) ON DELETE RESTRICT,
  PRIMARY KEY (observation_id, evidence_id)
) WITHOUT ROWID, STRICT;

CREATE INDEX foundation_ingestion_source_idx
  ON foundation_ingestion_runs(source_id, acquired_at);
CREATE INDEX foundation_observation_product_period_idx
  ON foundation_observations(product_id, period_start, period_end, metric_code);
CREATE INDEX foundation_observation_evidence_evidence_idx
  ON foundation_observation_evidence(evidence_id);

CREATE TRIGGER schema_migrations_no_update
BEFORE UPDATE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations_append_only');
END;

CREATE TRIGGER schema_migrations_no_delete
BEFORE DELETE ON schema_migrations
BEGIN
  SELECT RAISE(ABORT, 'schema_migrations_append_only');
END;

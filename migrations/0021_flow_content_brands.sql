CREATE TABLE flow_content_brands (
  brand_id TEXT PRIMARY KEY CHECK(length(brand_id) = 36),
  brand_key TEXT NOT NULL UNIQUE CHECK(length(brand_key) BETWEEN 3 AND 80 AND brand_key GLOB '[a-z]*' AND brand_key NOT GLOB '*[^a-z0-9_-]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE flow_content_brand_revisions (
  brand_id TEXT NOT NULL REFERENCES flow_content_brands(brand_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  brand_name TEXT NOT NULL CHECK(length(trim(brand_name)) BETWEEN 1 AND 120 AND brand_name = trim(brand_name)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  brand_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(brand_id, version)
) STRICT;

CREATE TRIGGER flow_content_brands_no_update BEFORE UPDATE ON flow_content_brands BEGIN SELECT RAISE(ABORT, 'flow_content_brand_immutable'); END;
CREATE TRIGGER flow_content_brands_no_delete BEFORE DELETE ON flow_content_brands BEGIN SELECT RAISE(ABORT, 'flow_content_brand_immutable'); END;
CREATE TRIGGER flow_content_brand_revisions_no_update BEFORE UPDATE ON flow_content_brand_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_brand_revision_immutable'); END;
CREATE TRIGGER flow_content_brand_revisions_no_delete BEFORE DELETE ON flow_content_brand_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_brand_revision_immutable'); END;
CREATE TRIGGER flow_content_brand_revisions_sequential
BEFORE INSERT ON flow_content_brand_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_brand_revisions WHERE brand_id = NEW.brand_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_brand_revision_not_sequential'); END;

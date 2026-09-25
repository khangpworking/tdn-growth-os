CREATE TABLE flow_content_media (
  brand_id TEXT NOT NULL REFERENCES flow_content_brands(brand_id) ON DELETE RESTRICT,
  media_kind TEXT NOT NULL CHECK(media_kind IN ('LOGO', 'PHOTO')),
  media_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/png', 'image/jpeg')),
  width INTEGER NOT NULL CHECK(typeof(width) = 'integer' AND width BETWEEN 64 AND 8192),
  height INTEGER NOT NULL CHECK(typeof(height) = 'integer' AND height BETWEEN 64 AND 8192),
  byte_size INTEGER NOT NULL CHECK(typeof(byte_size) = 'integer' AND byte_size BETWEEN 1 AND 8388608),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(brand_id, media_kind, media_sha256)
) STRICT;

CREATE TABLE flow_content_catalog_items (
  item_id TEXT PRIMARY KEY CHECK(length(item_id) = 36),
  brand_id TEXT NOT NULL REFERENCES flow_content_brands(brand_id) ON DELETE RESTRICT,
  item_key TEXT NOT NULL CHECK(length(item_key) BETWEEN 3 AND 80 AND item_key GLOB '[a-z]*' AND item_key NOT GLOB '*[^a-z0-9_-]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  UNIQUE(brand_id, item_key)
) STRICT;

CREATE TABLE flow_content_catalog_item_revisions (
  item_id TEXT NOT NULL REFERENCES flow_content_catalog_items(item_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  item_name TEXT NOT NULL CHECK(length(trim(item_name)) BETWEEN 1 AND 120 AND item_name = trim(item_name)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  item_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(item_id, version)
) STRICT;

CREATE INDEX flow_content_catalog_items_by_brand ON flow_content_catalog_items(brand_id, created_at, item_id);

CREATE TRIGGER flow_content_media_no_update BEFORE UPDATE ON flow_content_media BEGIN SELECT RAISE(ABORT, 'flow_content_media_immutable'); END;
CREATE TRIGGER flow_content_media_no_delete BEFORE DELETE ON flow_content_media BEGIN SELECT RAISE(ABORT, 'flow_content_media_immutable'); END;
CREATE TRIGGER flow_content_catalog_items_no_update BEFORE UPDATE ON flow_content_catalog_items BEGIN SELECT RAISE(ABORT, 'flow_content_catalog_item_immutable'); END;
CREATE TRIGGER flow_content_catalog_items_no_delete BEFORE DELETE ON flow_content_catalog_items BEGIN SELECT RAISE(ABORT, 'flow_content_catalog_item_immutable'); END;
CREATE TRIGGER flow_content_catalog_item_revisions_no_update BEFORE UPDATE ON flow_content_catalog_item_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_catalog_item_revision_immutable'); END;
CREATE TRIGGER flow_content_catalog_item_revisions_no_delete BEFORE DELETE ON flow_content_catalog_item_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_catalog_item_revision_immutable'); END;
CREATE TRIGGER flow_content_catalog_item_revisions_sequential
BEFORE INSERT ON flow_content_catalog_item_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_catalog_item_revisions WHERE item_id = NEW.item_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_catalog_item_revision_not_sequential'); END;

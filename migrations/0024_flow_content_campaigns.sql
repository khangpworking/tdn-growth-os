CREATE TABLE flow_content_campaigns (
  campaign_id TEXT PRIMARY KEY CHECK(length(campaign_id) = 36),
  campaign_key TEXT NOT NULL UNIQUE CHECK(length(campaign_key) BETWEEN 3 AND 80 AND campaign_key GLOB '[a-z]*' AND campaign_key NOT GLOB '*[^a-z0-9_-]*'),
  brand_id TEXT NOT NULL REFERENCES flow_content_brands(brand_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE flow_content_campaign_revisions (
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  campaign_name TEXT NOT NULL CHECK(length(trim(campaign_name)) BETWEEN 1 AND 120 AND campaign_name = trim(campaign_name)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  campaign_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(campaign_id, version)
) STRICT;

CREATE TABLE flow_content_campaign_lifecycle (
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(typeof(sequence) = 'integer' AND sequence > 0),
  action TEXT NOT NULL CHECK(action IN ('DELETE', 'RESTORE')),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0 AND julianday(created_at) IS NOT NULL),
  PRIMARY KEY(campaign_id, sequence)
) STRICT;

CREATE INDEX flow_content_campaigns_by_brand ON flow_content_campaigns(brand_id, created_at, campaign_id);

CREATE TRIGGER flow_content_campaigns_no_update BEFORE UPDATE ON flow_content_campaigns BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_immutable'); END;
CREATE TRIGGER flow_content_campaigns_no_delete BEFORE DELETE ON flow_content_campaigns BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_immutable'); END;
CREATE TRIGGER flow_content_campaign_revisions_no_update BEFORE UPDATE ON flow_content_campaign_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_revision_immutable'); END;
CREATE TRIGGER flow_content_campaign_revisions_no_delete BEFORE DELETE ON flow_content_campaign_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_revision_immutable'); END;
CREATE TRIGGER flow_content_campaign_revisions_sequential
BEFORE INSERT ON flow_content_campaign_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_campaign_revisions WHERE campaign_id = NEW.campaign_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_revision_not_sequential'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_no_update BEFORE UPDATE ON flow_content_campaign_lifecycle BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_lifecycle_immutable'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_no_delete BEFORE DELETE ON flow_content_campaign_lifecycle BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_lifecycle_immutable'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_sequential
BEFORE INSERT ON flow_content_campaign_lifecycle
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) + 1 FROM flow_content_campaign_lifecycle WHERE campaign_id = NEW.campaign_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_lifecycle_not_sequential'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_alternates
BEFORE INSERT ON flow_content_campaign_lifecycle
WHEN NEW.action = COALESCE((SELECT action FROM flow_content_campaign_lifecycle WHERE campaign_id = NEW.campaign_id ORDER BY sequence DESC LIMIT 1), 'RESTORE')
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_lifecycle_not_alternating'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_chronological
BEFORE INSERT ON flow_content_campaign_lifecycle
WHEN julianday(NEW.created_at) < (SELECT julianday(created_at) FROM flow_content_campaign_lifecycle WHERE campaign_id = NEW.campaign_id ORDER BY sequence DESC LIMIT 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_lifecycle_not_chronological'); END;
CREATE TRIGGER flow_content_campaign_lifecycle_restore_window
BEFORE INSERT ON flow_content_campaign_lifecycle
WHEN NEW.action = 'RESTORE' AND julianday(NEW.created_at) - (SELECT julianday(created_at) FROM flow_content_campaign_lifecycle WHERE campaign_id = NEW.campaign_id ORDER BY sequence DESC LIMIT 1) > 30
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_restore_window_expired'); END;

CREATE TABLE flow_content_insight_revisions (
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('TYPED', 'STP')),
  locked_stp_id TEXT CHECK(locked_stp_id IS NULL OR length(locked_stp_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  insight_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(campaign_id, version),
  CHECK((source_kind = 'STP') = (locked_stp_id IS NOT NULL))
) STRICT;

CREATE TABLE flow_content_insight_locks (
  campaign_id TEXT PRIMARY KEY REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  insight_version INTEGER NOT NULL CHECK(typeof(insight_version) = 'integer' AND insight_version > 0),
  campaign_version INTEGER NOT NULL CHECK(typeof(campaign_version) = 'integer' AND campaign_version > 0),
  b10_decision_id TEXT CHECK(b10_decision_id IS NULL OR length(b10_decision_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  lock_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  FOREIGN KEY(campaign_id, insight_version) REFERENCES flow_content_insight_revisions(campaign_id, version) ON DELETE RESTRICT,
  FOREIGN KEY(campaign_id, campaign_version) REFERENCES flow_content_campaign_revisions(campaign_id, version) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER flow_content_insight_revisions_no_update BEFORE UPDATE ON flow_content_insight_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_immutable'); END;
CREATE TRIGGER flow_content_insight_revisions_no_delete BEFORE DELETE ON flow_content_insight_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_immutable'); END;
CREATE TRIGGER flow_content_insight_revisions_sequential
BEFORE INSERT ON flow_content_insight_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_insight_revisions WHERE campaign_id = NEW.campaign_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_not_sequential'); END;
CREATE TRIGGER flow_content_insight_revisions_after_lock
BEFORE INSERT ON flow_content_insight_revisions
WHEN EXISTS (SELECT 1 FROM flow_content_insight_locks WHERE campaign_id = NEW.campaign_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_locked'); END;
CREATE TRIGGER flow_content_insight_locks_no_update BEFORE UPDATE ON flow_content_insight_locks BEGIN SELECT RAISE(ABORT, 'flow_content_insight_lock_immutable'); END;
CREATE TRIGGER flow_content_insight_locks_no_delete BEFORE DELETE ON flow_content_insight_locks BEGIN SELECT RAISE(ABORT, 'flow_content_insight_lock_immutable'); END;
CREATE TRIGGER flow_content_insight_locks_latest_insight
BEFORE INSERT ON flow_content_insight_locks
WHEN NEW.insight_version <> (SELECT MAX(version) FROM flow_content_insight_revisions WHERE campaign_id = NEW.campaign_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_lock_not_latest'); END;
CREATE TRIGGER flow_content_insight_locks_latest_campaign
BEFORE INSERT ON flow_content_insight_locks
WHEN NEW.campaign_version <> (SELECT MAX(version) FROM flow_content_campaign_revisions WHERE campaign_id = NEW.campaign_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_lock_campaign_not_latest'); END;

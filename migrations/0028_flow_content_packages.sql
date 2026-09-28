-- Caption and Poster packages (task 051). A package pins every input for one Angle in a canonical
-- artifact; its Caption and Poster parts gain append-only versions (GENERATED from one audited AI
-- attempt per ADR 0004, MANUAL caption edits, or RESTORE copies of an earlier version).
CREATE TABLE flow_content_packages (
  package_id TEXT PRIMARY KEY NOT NULL CHECK(length(package_id) = 36),
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  angle_id TEXT NOT NULL REFERENCES flow_content_ideas(idea_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal BETWEEN 1 AND 10000),
  request_id TEXT NOT NULL CHECK(length(request_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  package_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  UNIQUE(request_id, angle_id),
  UNIQUE(angle_id, ordinal)
) STRICT;

CREATE INDEX flow_content_packages_campaign ON flow_content_packages(campaign_id);

CREATE TRIGGER flow_content_packages_no_update BEFORE UPDATE ON flow_content_packages BEGIN SELECT RAISE(ABORT, 'flow_content_package_immutable'); END;
CREATE TRIGGER flow_content_packages_no_delete BEFORE DELETE ON flow_content_packages BEGIN SELECT RAISE(ABORT, 'flow_content_package_immutable'); END;
CREATE TRIGGER flow_content_packages_sequential
BEFORE INSERT ON flow_content_packages
WHEN NEW.ordinal <> COALESCE((SELECT MAX(ordinal) + 1 FROM flow_content_packages WHERE angle_id = NEW.angle_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_not_sequential'); END;
CREATE TRIGGER flow_content_packages_angle
BEFORE INSERT ON flow_content_packages
WHEN NOT EXISTS (SELECT 1 FROM flow_content_ideas WHERE idea_id = NEW.angle_id AND kind = 'ANGLE' AND campaign_id = NEW.campaign_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_angle_invalid'); END;

-- Version 1..n per part; the highest version is current. Only GENERATED versions carry an attempt.
CREATE TABLE flow_content_package_versions (
  package_id TEXT NOT NULL REFERENCES flow_content_packages(package_id) ON DELETE RESTRICT,
  part TEXT NOT NULL CHECK(part IN ('CAPTION', 'POSTER')),
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version BETWEEN 1 AND 10000),
  source TEXT NOT NULL CHECK(source IN ('GENERATED', 'MANUAL', 'RESTORE')),
  attempt_id TEXT UNIQUE REFERENCES flow_content_ai_attempts(attempt_id) ON DELETE RESTRICT,
  restored_from_version INTEGER CHECK(restored_from_version IS NULL OR (typeof(restored_from_version) = 'integer' AND restored_from_version > 0)),
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  version_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(package_id, part, version),
  CHECK((source = 'GENERATED') = (attempt_id IS NOT NULL)),
  CHECK((source = 'RESTORE') = (restored_from_version IS NOT NULL)),
  CHECK(source <> 'MANUAL' OR part = 'CAPTION'),
  CHECK(restored_from_version IS NULL OR restored_from_version < version)
) STRICT;

CREATE TRIGGER flow_content_package_versions_no_update BEFORE UPDATE ON flow_content_package_versions BEGIN SELECT RAISE(ABORT, 'flow_content_package_version_immutable'); END;
CREATE TRIGGER flow_content_package_versions_no_delete BEFORE DELETE ON flow_content_package_versions BEGIN SELECT RAISE(ABORT, 'flow_content_package_version_immutable'); END;
CREATE TRIGGER flow_content_package_versions_sequential
BEFORE INSERT ON flow_content_package_versions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_package_versions WHERE package_id = NEW.package_id AND part = NEW.part), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_version_not_sequential'); END;
CREATE TRIGGER flow_content_package_versions_attempt
BEFORE INSERT ON flow_content_package_versions
WHEN NEW.attempt_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM flow_content_ai_attempts
  WHERE attempt_id = NEW.attempt_id AND target_id = NEW.package_id
    AND ((NEW.part = 'CAPTION' AND target_type = 'content_caption' AND modality = 'text')
      OR (NEW.part = 'POSTER' AND target_type = 'content_poster' AND modality = 'image'))
)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_version_attempt_mismatch'); END;
CREATE TRIGGER flow_content_package_versions_restore_target
BEFORE INSERT ON flow_content_package_versions
WHEN NEW.restored_from_version IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM flow_content_package_versions
  WHERE package_id = NEW.package_id AND part = NEW.part AND version = NEW.restored_from_version
)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_version_restore_invalid'); END;

-- Full state after each OWNER delete/restore; sequence 0 (not deleted) is implicit.
CREATE TABLE flow_content_package_states (
  package_id TEXT NOT NULL REFERENCES flow_content_packages(package_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(typeof(sequence) = 'integer' AND sequence > 0),
  action TEXT NOT NULL CHECK(action IN ('DELETE', 'RESTORE')),
  deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(package_id, sequence),
  CHECK((action = 'DELETE') = (deleted = 1))
) STRICT;

CREATE TRIGGER flow_content_package_states_no_update BEFORE UPDATE ON flow_content_package_states BEGIN SELECT RAISE(ABORT, 'flow_content_package_state_immutable'); END;
CREATE TRIGGER flow_content_package_states_no_delete BEFORE DELETE ON flow_content_package_states BEGIN SELECT RAISE(ABORT, 'flow_content_package_state_immutable'); END;
CREATE TRIGGER flow_content_package_states_sequential
BEFORE INSERT ON flow_content_package_states
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) + 1 FROM flow_content_package_states WHERE package_id = NEW.package_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_package_state_not_sequential'); END;

-- Package settings saved as the campaign default ("Lưu làm mặc định cho chiến dịch"). This is not a
-- campaign content revision, so it never moves the Insight lock pin.
CREATE TABLE flow_content_campaign_defaults (
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  defaults_json TEXT NOT NULL CHECK(json_valid(defaults_json) AND json_type(defaults_json) = 'object' AND length(defaults_json) <= 65536),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(campaign_id, version)
) STRICT;

CREATE TRIGGER flow_content_campaign_defaults_no_update BEFORE UPDATE ON flow_content_campaign_defaults BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_defaults_immutable'); END;
CREATE TRIGGER flow_content_campaign_defaults_no_delete BEFORE DELETE ON flow_content_campaign_defaults BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_defaults_immutable'); END;
CREATE TRIGGER flow_content_campaign_defaults_sequential
BEFORE INSERT ON flow_content_campaign_defaults
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_campaign_defaults WHERE campaign_id = NEW.campaign_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_campaign_defaults_not_sequential'); END;

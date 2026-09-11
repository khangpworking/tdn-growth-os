CREATE TABLE flow_stp_working_records (
  working_stp_id TEXT PRIMARY KEY CHECK(length(working_stp_id) = 36),
  product_workspace_id TEXT NOT NULL UNIQUE CHECK(length(product_workspace_id) = 36),
  product_workspace_artifact_sha256 TEXT NOT NULL CHECK(length(product_workspace_artifact_sha256) = 64 AND product_workspace_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  b8_clearance_id TEXT NOT NULL UNIQUE CHECK(length(b8_clearance_id) = 36),
  b8_clearance_artifact_sha256 TEXT NOT NULL CHECK(length(b8_clearance_artifact_sha256) = 64 AND b8_clearance_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  content_json TEXT NOT NULL CHECK(json_valid(content_json) AND json(content_json) = content_json),
  working_digest TEXT NOT NULL CHECK(length(working_digest) = 64 AND working_digest NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  updated_at TEXT NOT NULL CHECK(length(trim(updated_at)) > 0)
) STRICT;

CREATE TABLE flow_locked_stps (
  lock_id TEXT PRIMARY KEY CHECK(length(lock_id) = 36),
  product_workspace_id TEXT NOT NULL UNIQUE CHECK(length(product_workspace_id) = 36),
  working_stp_id TEXT NOT NULL UNIQUE REFERENCES flow_stp_working_records(working_stp_id) ON DELETE RESTRICT,
  working_digest TEXT NOT NULL CHECK(length(working_digest) = 64 AND working_digest NOT GLOB '*[^0-9a-f]*'),
  product_workspace_artifact_sha256 TEXT NOT NULL CHECK(length(product_workspace_artifact_sha256) = 64 AND product_workspace_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  b8_clearance_id TEXT NOT NULL UNIQUE CHECK(length(b8_clearance_id) = 36),
  b8_clearance_artifact_sha256 TEXT NOT NULL CHECK(length(b8_clearance_artifact_sha256) = 64 AND b8_clearance_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 3 AND 120 AND actor_id = trim(actor_id)),
  role_snapshot TEXT NOT NULL CHECK(role_snapshot = 'OWNER'),
  required_capability TEXT NOT NULL CHECK(required_capability = 'governance:product-b9-lock'),
  policy_id TEXT NOT NULL CHECK(policy_id = 'governance:product-b9-lock-v1'),
  policy_version INTEGER NOT NULL CHECK(typeof(policy_version) = 'integer' AND policy_version = 1),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  lock_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  locked_at TEXT NOT NULL CHECK(length(trim(locked_at)) > 0)
) STRICT;

CREATE TRIGGER flow_locked_stps_consistent_working BEFORE INSERT ON flow_locked_stps
WHEN NOT EXISTS(
  SELECT 1 FROM flow_stp_working_records w
  WHERE w.working_stp_id = NEW.working_stp_id
    AND w.product_workspace_id = NEW.product_workspace_id
    AND w.working_digest = NEW.working_digest
    AND w.product_workspace_artifact_sha256 = NEW.product_workspace_artifact_sha256
    AND w.b8_clearance_id = NEW.b8_clearance_id
    AND w.b8_clearance_artifact_sha256 = NEW.b8_clearance_artifact_sha256
)
BEGIN SELECT RAISE(ABORT, 'flow_locked_stp_working_mismatch'); END;

CREATE TRIGGER flow_stp_working_records_stable_identity BEFORE UPDATE ON flow_stp_working_records
WHEN OLD.working_stp_id != NEW.working_stp_id OR OLD.product_workspace_id != NEW.product_workspace_id OR OLD.product_workspace_artifact_sha256 != NEW.product_workspace_artifact_sha256 OR OLD.b8_clearance_id != NEW.b8_clearance_id OR OLD.b8_clearance_artifact_sha256 != NEW.b8_clearance_artifact_sha256 OR OLD.created_at != NEW.created_at
BEGIN SELECT RAISE(ABORT, 'flow_stp_working_identity_immutable'); END;
CREATE TRIGGER flow_stp_working_records_locked_no_update BEFORE UPDATE ON flow_stp_working_records
WHEN EXISTS(SELECT 1 FROM flow_locked_stps WHERE working_stp_id = OLD.working_stp_id)
BEGIN SELECT RAISE(ABORT, 'flow_stp_working_locked'); END;
CREATE TRIGGER flow_stp_working_records_no_delete BEFORE DELETE ON flow_stp_working_records BEGIN SELECT RAISE(ABORT, 'flow_stp_working_no_delete'); END;
CREATE TRIGGER flow_locked_stps_no_update BEFORE UPDATE ON flow_locked_stps BEGIN SELECT RAISE(ABORT, 'flow_locked_stp_immutable'); END;
CREATE TRIGGER flow_locked_stps_no_delete BEFORE DELETE ON flow_locked_stps BEGIN SELECT RAISE(ABORT, 'flow_locked_stp_immutable'); END;

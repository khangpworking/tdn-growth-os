CREATE TABLE flow_b8_clearances (
  clearance_id TEXT PRIMARY KEY CHECK(length(clearance_id) = 36),
  product_workspace_id TEXT NOT NULL UNIQUE CHECK(length(product_workspace_id) = 36),
  product_workspace_artifact_sha256 TEXT NOT NULL CHECK(length(product_workspace_artifact_sha256) = 64 AND product_workspace_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  product_workspace_key TEXT NOT NULL CHECK(length(product_workspace_key) BETWEEN 3 AND 80 AND product_workspace_key GLOB '[a-z]*' AND product_workspace_key NOT GLOB '*[^a-z0-9_-]*'),
  product_workspace_title TEXT NOT NULL CHECK(length(trim(product_workspace_title)) BETWEEN 1 AND 200 AND product_workspace_title = trim(product_workspace_title)),
  state TEXT NOT NULL CHECK(state = 'READY_FOR_B9'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  clearance_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  cleared_at TEXT NOT NULL CHECK(length(trim(cleared_at)) > 0)
) STRICT;

CREATE TABLE flow_b8_clearance_decisions (
  clearance_id TEXT NOT NULL REFERENCES flow_b8_clearances(clearance_id) ON DELETE RESTRICT,
  lane_ordinal INTEGER NOT NULL CHECK(lane_ordinal BETWEEN 1 AND 4),
  lane TEXT NOT NULL CHECK(lane IN ('LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE')),
  decision_id TEXT NOT NULL UNIQUE CHECK(length(decision_id) = 36),
  decision_version INTEGER NOT NULL CHECK(typeof(decision_version) = 'integer' AND decision_version > 0),
  decision_artifact_sha256 TEXT NOT NULL CHECK(length(decision_artifact_sha256) = 64 AND decision_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  decided_at TEXT NOT NULL CHECK(length(trim(decided_at)) > 0),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 3 AND 120 AND actor_id = trim(actor_id)),
  role_snapshot TEXT NOT NULL CHECK(role_snapshot = 'OWNER'),
  required_capability TEXT NOT NULL CHECK(required_capability = 'governance:product-b8-review'),
  policy_id TEXT NOT NULL CHECK(policy_id = 'governance:product-b8-review-v1'),
  policy_version INTEGER NOT NULL CHECK(typeof(policy_version) = 'integer' AND policy_version = 1),
  PRIMARY KEY(clearance_id, lane),
  UNIQUE(clearance_id, lane_ordinal),
  CHECK((lane_ordinal = 1 AND lane = 'LEGAL') OR (lane_ordinal = 2 AND lane = 'SCIENTIFIC') OR (lane_ordinal = 3 AND lane = 'QUALITY') OR (lane_ordinal = 4 AND lane = 'FINANCE'))
) STRICT;

CREATE TRIGGER flow_b8_clearances_no_update BEFORE UPDATE ON flow_b8_clearances BEGIN SELECT RAISE(ABORT, 'flow_b8_clearance_immutable'); END;
CREATE TRIGGER flow_b8_clearances_no_delete BEFORE DELETE ON flow_b8_clearances BEGIN SELECT RAISE(ABORT, 'flow_b8_clearance_immutable'); END;
CREATE TRIGGER flow_b8_clearance_decisions_no_update BEFORE UPDATE ON flow_b8_clearance_decisions BEGIN SELECT RAISE(ABORT, 'flow_b8_clearance_decision_immutable'); END;
CREATE TRIGGER flow_b8_clearance_decisions_no_delete BEFORE DELETE ON flow_b8_clearance_decisions BEGIN SELECT RAISE(ABORT, 'flow_b8_clearance_decision_immutable'); END;

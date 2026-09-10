CREATE TABLE governance_product_b8_lane_decisions (
  decision_id TEXT PRIMARY KEY CHECK(length(decision_id) = 36),
  product_workspace_id TEXT NOT NULL CHECK(length(product_workspace_id) = 36),
  product_workspace_artifact_sha256 TEXT NOT NULL CHECK(length(product_workspace_artifact_sha256) = 64 AND product_workspace_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  lane TEXT NOT NULL CHECK(lane IN ('LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE')),
  decision_version INTEGER NOT NULL CHECK(typeof(decision_version) = 'integer' AND decision_version > 0),
  decision TEXT NOT NULL CHECK(decision IN ('PASS', 'HOLD', 'REJECT')),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 3 AND 120 AND actor_id = trim(actor_id)),
  role_snapshot TEXT NOT NULL CHECK(role_snapshot = 'OWNER'),
  required_capability TEXT NOT NULL CHECK(required_capability = 'governance:product-b8-review'),
  policy_id TEXT NOT NULL CHECK(policy_id = 'governance:product-b8-review-v1'),
  policy_version INTEGER NOT NULL CHECK(typeof(policy_version) = 'integer' AND policy_version = 1),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  decision_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  decided_at TEXT NOT NULL CHECK(length(trim(decided_at)) > 0),
  UNIQUE(product_workspace_id, lane, decision_version)
) STRICT;

CREATE INDEX governance_product_b8_lane_decisions_status
  ON governance_product_b8_lane_decisions(product_workspace_id, lane, decision_version DESC);

CREATE TRIGGER governance_product_b8_lane_decisions_no_update BEFORE UPDATE ON governance_product_b8_lane_decisions BEGIN SELECT RAISE(ABORT, 'governance_product_b8_lane_decision_immutable'); END;
CREATE TRIGGER governance_product_b8_lane_decisions_no_delete BEFORE DELETE ON governance_product_b8_lane_decisions BEGIN SELECT RAISE(ABORT, 'governance_product_b8_lane_decision_immutable'); END;

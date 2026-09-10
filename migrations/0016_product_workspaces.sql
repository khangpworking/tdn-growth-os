CREATE TABLE flow_product_workspaces (
  product_workspace_id TEXT PRIMARY KEY CHECK(length(product_workspace_id) = 36),
  product_workspace_key TEXT NOT NULL UNIQUE CHECK(length(product_workspace_key) BETWEEN 3 AND 80 AND product_workspace_key GLOB '[a-z]*' AND product_workspace_key NOT GLOB '*[^a-z0-9_-]*'),
  state TEXT NOT NULL CHECK(state = 'ACTIVE'),
  entry_step TEXT NOT NULL CHECK(entry_step = 'B8'),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200 AND title = trim(title)),
  source_workspace_id TEXT NOT NULL CHECK(length(source_workspace_id) = 36),
  source_basket_id TEXT NOT NULL CHECK(length(source_basket_id) = 36),
  source_basket_artifact_sha256 TEXT NOT NULL CHECK(length(source_basket_artifact_sha256) = 64 AND source_basket_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_basket_key TEXT NOT NULL CHECK(length(source_basket_key) BETWEEN 3 AND 80 AND source_basket_key GLOB '[a-z]*' AND source_basket_key NOT GLOB '*[^a-z0-9_-]*'),
  source_basket_version INTEGER NOT NULL CHECK(typeof(source_basket_version) = 'integer' AND source_basket_version > 0),
  source_candidate_id TEXT NOT NULL CHECK(length(source_candidate_id) = 36),
  source_candidate_version INTEGER NOT NULL CHECK(typeof(source_candidate_version) = 'integer' AND source_candidate_version > 0),
  source_candidate_artifact_sha256 TEXT NOT NULL CHECK(length(source_candidate_artifact_sha256) = 64 AND source_candidate_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_candidate_key TEXT NOT NULL CHECK(length(source_candidate_key) BETWEEN 3 AND 80 AND source_candidate_key GLOB '[a-z]*' AND source_candidate_key NOT GLOB '*[^a-z0-9_-]*'),
  source_candidate_label TEXT NOT NULL CHECK(length(trim(source_candidate_label)) BETWEEN 1 AND 200 AND source_candidate_label = trim(source_candidate_label)),
  source_candidate_state TEXT NOT NULL CHECK(source_candidate_state = 'EXPLORING'),
  source_b7_decision_id TEXT NOT NULL UNIQUE CHECK(length(source_b7_decision_id) = 36),
  source_b7_decision_artifact_sha256 TEXT NOT NULL CHECK(length(source_b7_decision_artifact_sha256) = 64 AND source_b7_decision_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  source_b7_decided_at TEXT NOT NULL CHECK(length(trim(source_b7_decided_at)) > 0),
  source_b7_decision TEXT NOT NULL CHECK(source_b7_decision = 'PASS'),
  source_actor_id TEXT NOT NULL CHECK(length(trim(source_actor_id)) BETWEEN 3 AND 120 AND source_actor_id = trim(source_actor_id)),
  source_role_snapshot TEXT NOT NULL CHECK(source_role_snapshot = 'OWNER'),
  source_required_capability TEXT NOT NULL CHECK(source_required_capability = 'governance:candidate-b7-review'),
  source_policy_id TEXT NOT NULL CHECK(source_policy_id = 'governance:candidate-b7-review-v1'),
  source_policy_version INTEGER NOT NULL CHECK(typeof(source_policy_version) = 'integer' AND source_policy_version = 1),
  source_b7_request_sha256 TEXT NOT NULL CHECK(length(source_b7_request_sha256) = 64 AND source_b7_request_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  product_workspace_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TRIGGER flow_product_workspaces_no_update BEFORE UPDATE ON flow_product_workspaces BEGIN SELECT RAISE(ABORT, 'flow_product_workspace_immutable'); END;
CREATE TRIGGER flow_product_workspaces_no_delete BEFORE DELETE ON flow_product_workspaces BEGIN SELECT RAISE(ABORT, 'flow_product_workspace_immutable'); END;

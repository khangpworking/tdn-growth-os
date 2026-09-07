CREATE TABLE flow_authorized_plans (
  plan_id TEXT PRIMARY KEY CHECK (length(plan_id) = 36),
  plan_key TEXT NOT NULL UNIQUE CHECK (
    length(plan_key) BETWEEN 3 AND 80 AND plan_key GLOB '[a-z]*' AND plan_key NOT GLOB '*[^a-z0-9_-]*'
  ),
  plan_type TEXT NOT NULL CHECK (plan_type = 'approved_proposal_intake_v1'),
  state TEXT NOT NULL CHECK (state = 'AUTHORIZED_PLAN'),
  source_proposal_id TEXT NOT NULL REFERENCES orchestrator_proposals(proposal_id) ON DELETE RESTRICT,
  source_proposal_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  approved_decision_id TEXT NOT NULL UNIQUE REFERENCES governance_proposal_decisions(decision_id) ON DELETE RESTRICT,
  approved_decision_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  approved_decision_version INTEGER NOT NULL CHECK (typeof(approved_decision_version) = 'integer' AND approved_decision_version > 0),
  authorization_actor_id TEXT NOT NULL CHECK (
    length(authorization_actor_id) BETWEEN 3 AND 120 AND authorization_actor_id GLOB '[a-z]*' AND authorization_actor_id NOT GLOB '*[^a-z0-9:_-]*'
  ),
  authorization_role_snapshot TEXT NOT NULL CHECK (
    length(authorization_role_snapshot) BETWEEN 1 AND 120 AND authorization_role_snapshot = trim(authorization_role_snapshot)
  ),
  authorization_policy_id TEXT NOT NULL CHECK (authorization_policy_id = 'governance:proposal-review-v1'),
  authorization_policy_version INTEGER NOT NULL CHECK (typeof(authorization_policy_version) = 'integer' AND authorization_policy_version > 0),
  approval_timestamp TEXT NOT NULL CHECK (length(trim(approval_timestamp)) > 0),
  producer_id TEXT NOT NULL CHECK (
    length(producer_id) BETWEEN 8 AND 120 AND producer_id GLOB 'flow:[a-z]*' AND producer_id NOT GLOB '*[^a-z0-9:_-]*'
  ),
  producer_version INTEGER NOT NULL CHECK (typeof(producer_version) = 'integer' AND producer_version > 0),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  plan_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0)
) STRICT;

CREATE INDEX flow_authorized_plans_source_proposal_idx
  ON flow_authorized_plans(source_proposal_id);
CREATE INDEX flow_authorized_plans_artifact_idx
  ON flow_authorized_plans(plan_artifact_sha256);

CREATE TRIGGER flow_authorized_plans_no_update
BEFORE UPDATE ON flow_authorized_plans
BEGIN
  SELECT RAISE(ABORT, 'flow_authorized_plan_immutable');
END;

CREATE TRIGGER flow_authorized_plans_no_delete
BEFORE DELETE ON flow_authorized_plans
BEGIN
  SELECT RAISE(ABORT, 'flow_authorized_plan_immutable');
END;

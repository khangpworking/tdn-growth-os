CREATE TABLE governance_proposal_decisions (
  decision_id TEXT PRIMARY KEY CHECK (length(decision_id) = 36),
  proposal_id TEXT NOT NULL REFERENCES orchestrator_proposals(proposal_id) ON DELETE RESTRICT,
  decision_version INTEGER NOT NULL CHECK (typeof(decision_version) = 'integer' AND decision_version > 0),
  action TEXT NOT NULL CHECK (action IN ('APPROVE', 'REJECT', 'HOLD')),
  previous_state TEXT NOT NULL CHECK (previous_state IN ('PROPOSED', 'HOLD')),
  result_state TEXT NOT NULL CHECK (result_state IN ('APPROVED', 'REJECTED', 'HOLD')),
  actor_id TEXT NOT NULL CHECK (
    length(actor_id) BETWEEN 3 AND 120 AND actor_id GLOB '[a-z]*' AND actor_id NOT GLOB '*[^a-z0-9:_-]*'
  ),
  role_snapshot TEXT NOT NULL CHECK (
    length(role_snapshot) BETWEEN 1 AND 120 AND role_snapshot = trim(role_snapshot)
  ),
  required_capability TEXT NOT NULL CHECK (required_capability = 'governance:proposal-review'),
  policy_id TEXT NOT NULL CHECK (policy_id = 'governance:proposal-review-v1'),
  policy_version INTEGER NOT NULL CHECK (typeof(policy_version) = 'integer' AND policy_version > 0),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  decision_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  CHECK (
    (decision_version = 1 AND previous_state = 'PROPOSED') OR
    (decision_version > 1 AND previous_state = 'HOLD')
  ),
  CHECK (
    (previous_state = 'PROPOSED' AND action = 'APPROVE' AND result_state = 'APPROVED') OR
    (previous_state = 'PROPOSED' AND action = 'REJECT' AND result_state = 'REJECTED') OR
    (previous_state = 'PROPOSED' AND action = 'HOLD' AND result_state = 'HOLD') OR
    (previous_state = 'HOLD' AND action = 'APPROVE' AND result_state = 'APPROVED') OR
    (previous_state = 'HOLD' AND action = 'REJECT' AND result_state = 'REJECTED')
  ),
  UNIQUE (proposal_id, decision_version)
) STRICT;

CREATE INDEX governance_proposal_decisions_artifact_idx
  ON governance_proposal_decisions(decision_artifact_sha256);

CREATE TRIGGER governance_proposal_decisions_no_update
BEFORE UPDATE ON governance_proposal_decisions
BEGIN
  SELECT RAISE(ABORT, 'governance_proposal_decision_immutable');
END;

CREATE TRIGGER governance_proposal_decisions_no_delete
BEFORE DELETE ON governance_proposal_decisions
BEGIN
  SELECT RAISE(ABORT, 'governance_proposal_decision_immutable');
END;

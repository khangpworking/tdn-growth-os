CREATE TABLE governance_candidate_b7_decisions (
  decision_id TEXT PRIMARY KEY CHECK(length(decision_id) = 36),
  basket_id TEXT NOT NULL CHECK(length(basket_id) = 36),
  candidate_id TEXT NOT NULL CHECK(length(candidate_id) = 36),
  candidate_version INTEGER NOT NULL CHECK(typeof(candidate_version) = 'integer' AND candidate_version > 0),
  decision TEXT NOT NULL CHECK(decision IN ('PASS', 'HOLD', 'REJECT')),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 3 AND 120 AND actor_id = trim(actor_id)),
  role_snapshot TEXT NOT NULL CHECK(role_snapshot = 'OWNER'),
  required_capability TEXT NOT NULL CHECK(required_capability = 'governance:candidate-b7-review'),
  policy_id TEXT NOT NULL CHECK(policy_id = 'governance:candidate-b7-review-v1'),
  policy_version INTEGER NOT NULL CHECK(typeof(policy_version) = 'integer' AND policy_version = 1),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  decision_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  decided_at TEXT NOT NULL CHECK(length(trim(decided_at)) > 0),
  UNIQUE(basket_id, candidate_id, candidate_version)
) STRICT;

CREATE TRIGGER governance_candidate_b7_decisions_no_update BEFORE UPDATE ON governance_candidate_b7_decisions BEGIN SELECT RAISE(ABORT, 'candidate_b7_decision_immutable'); END;
CREATE TRIGGER governance_candidate_b7_decisions_no_delete BEFORE DELETE ON governance_candidate_b7_decisions BEGIN SELECT RAISE(ABORT, 'candidate_b7_decision_immutable'); END;

CREATE TABLE governance_product_b10_decisions (
  decision_id TEXT PRIMARY KEY CHECK(length(decision_id) = 36),
  locked_stp_id TEXT NOT NULL CHECK(length(locked_stp_id) = 36),
  locked_stp_artifact_sha256 TEXT NOT NULL CHECK(length(locked_stp_artifact_sha256) = 64 AND locked_stp_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  product_workspace_id TEXT NOT NULL CHECK(length(product_workspace_id) = 36),
  decision_number INTEGER NOT NULL CHECK(typeof(decision_number) = 'integer' AND decision_number > 0),
  previous_decision_id TEXT UNIQUE CHECK(previous_decision_id IS NULL OR length(previous_decision_id) = 36),
  decision TEXT NOT NULL CHECK(decision IN ('APPROVE', 'HOLD', 'REJECT')),
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 3 AND 120 AND actor_id = trim(actor_id)),
  role_snapshot TEXT NOT NULL CHECK(role_snapshot = 'OWNER'),
  required_capability TEXT NOT NULL CHECK(required_capability = 'governance:product-b10-review'),
  policy_id TEXT NOT NULL CHECK(policy_id = 'governance:product-b10-review-v1'),
  policy_version INTEGER NOT NULL CHECK(typeof(policy_version) = 'integer' AND policy_version = 1),
  request_sha256 TEXT NOT NULL UNIQUE CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  decision_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  decided_at TEXT NOT NULL CHECK(length(trim(decided_at)) > 0),
  UNIQUE(locked_stp_id, decision_number),
  UNIQUE(product_workspace_id, decision_number),
  CHECK((decision_number = 1 AND previous_decision_id IS NULL) OR (decision_number > 1 AND previous_decision_id IS NOT NULL))
) STRICT;

CREATE INDEX governance_product_b10_decisions_effective_lock
  ON governance_product_b10_decisions(locked_stp_id, decision_number DESC);
CREATE INDEX governance_product_b10_decisions_effective_workspace
  ON governance_product_b10_decisions(product_workspace_id, decision_number DESC);

CREATE TRIGGER governance_product_b10_decisions_chain BEFORE INSERT ON governance_product_b10_decisions
WHEN (NEW.decision_number > 1 AND NOT EXISTS(
  SELECT 1 FROM governance_product_b10_decisions previous
  WHERE previous.decision_id = NEW.previous_decision_id
    AND previous.locked_stp_id = NEW.locked_stp_id
    AND previous.locked_stp_artifact_sha256 = NEW.locked_stp_artifact_sha256
    AND previous.product_workspace_id = NEW.product_workspace_id
    AND previous.decision_number = NEW.decision_number - 1
    AND previous.decision != NEW.decision
)) OR EXISTS(
  SELECT 1 FROM governance_product_b10_decisions successor
  WHERE successor.locked_stp_id = NEW.locked_stp_id
    AND successor.decision_number >= NEW.decision_number
)
BEGIN SELECT RAISE(ABORT, 'governance_product_b10_decision_chain_invalid'); END;

CREATE TRIGGER governance_product_b10_decisions_no_update BEFORE UPDATE ON governance_product_b10_decisions BEGIN SELECT RAISE(ABORT, 'governance_product_b10_decision_immutable'); END;
CREATE TRIGGER governance_product_b10_decisions_no_delete BEFORE DELETE ON governance_product_b10_decisions BEGIN SELECT RAISE(ABORT, 'governance_product_b10_decision_immutable'); END;

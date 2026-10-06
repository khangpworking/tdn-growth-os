-- Proposal and explicit OWNER acceptance remain distinct from rule adoption.
CREATE TABLE analysis_metric_membership_proposals (
  proposal_id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  adoption_id TEXT NOT NULL REFERENCES analysis_metric_rule_adoptions(adoption_id) ON DELETE RESTRICT,
  preparation_sha256 TEXT NOT NULL,
  pair_sha256 TEXT NOT NULL,
  request_key TEXT UNIQUE NOT NULL,
  artifact_sha256 TEXT UNIQUE NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_json TEXT NOT NULL CHECK(json_valid(artifact_json))
) STRICT;

CREATE TABLE analysis_metric_membership_receipts (
  receipt_id TEXT PRIMARY KEY NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES analysis_metric_membership_proposals(proposal_id) ON DELETE RESTRICT,
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  adoption_id TEXT NOT NULL REFERENCES analysis_metric_rule_adoptions(adoption_id) ON DELETE RESTRICT,
  preparation_sha256 TEXT NOT NULL,
  pair_sha256 TEXT NOT NULL,
  request_key TEXT UNIQUE NOT NULL,
  artifact_sha256 TEXT UNIQUE NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_json TEXT NOT NULL CHECK(json_valid(artifact_json))
) STRICT;

CREATE TABLE analysis_metric_membership_accepted (
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  adoption_id TEXT NOT NULL REFERENCES analysis_metric_rule_adoptions(adoption_id) ON DELETE RESTRICT,
  preparation_sha256 TEXT NOT NULL,
  pair_sha256 TEXT NOT NULL,
  record_key TEXT NOT NULL,
  proposal_id TEXT NOT NULL REFERENCES analysis_metric_membership_proposals(proposal_id) ON DELETE RESTRICT,
  receipt_id TEXT NOT NULL REFERENCES analysis_metric_membership_receipts(receipt_id) ON DELETE RESTRICT,
  PRIMARY KEY(run_id,adoption_id,preparation_sha256,pair_sha256,record_key)
) STRICT;

CREATE TRIGGER metric_membership_proposal_scope BEFORE INSERT ON analysis_metric_membership_proposals
WHEN NOT EXISTS(SELECT 1 FROM analysis_metric_rule_adoptions a WHERE a.adoption_id=NEW.adoption_id AND a.run_id=NEW.run_id)
BEGIN SELECT RAISE(ABORT, 'metric_proposal_rule_scope_mismatch'); END;
CREATE TRIGGER metric_membership_receipt_proposal BEFORE INSERT ON analysis_metric_membership_receipts
WHEN NOT EXISTS(SELECT 1 FROM analysis_metric_membership_proposals p WHERE p.proposal_id=NEW.proposal_id
  AND p.run_id=NEW.run_id AND p.adoption_id=NEW.adoption_id AND p.preparation_sha256=NEW.preparation_sha256 AND p.pair_sha256=NEW.pair_sha256)
BEGIN SELECT RAISE(ABORT, 'metric_receipt_proposal_mismatch'); END;
CREATE TRIGGER metric_membership_accepted_receipt BEFORE INSERT ON analysis_metric_membership_accepted
WHEN NOT EXISTS(SELECT 1 FROM analysis_metric_membership_receipts r WHERE r.receipt_id=NEW.receipt_id
  AND r.proposal_id=NEW.proposal_id AND r.run_id=NEW.run_id AND r.adoption_id=NEW.adoption_id AND r.preparation_sha256=NEW.preparation_sha256 AND r.pair_sha256=NEW.pair_sha256)
BEGIN SELECT RAISE(ABORT, 'metric_accepted_receipt_mismatch'); END;

CREATE TRIGGER metric_membership_proposals_no_update BEFORE UPDATE ON analysis_metric_membership_proposals
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;
CREATE TRIGGER metric_membership_proposals_no_delete BEFORE DELETE ON analysis_metric_membership_proposals
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;
CREATE TRIGGER metric_membership_receipts_no_update BEFORE UPDATE ON analysis_metric_membership_receipts
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;
CREATE TRIGGER metric_membership_receipts_no_delete BEFORE DELETE ON analysis_metric_membership_receipts
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;
CREATE TRIGGER metric_membership_accepted_no_update BEFORE UPDATE ON analysis_metric_membership_accepted
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;
CREATE TRIGGER metric_membership_accepted_no_delete BEFORE DELETE ON analysis_metric_membership_accepted
BEGIN SELECT RAISE(ABORT, 'immutable_metric_membership'); END;

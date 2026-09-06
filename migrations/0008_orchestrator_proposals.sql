CREATE TABLE orchestrator_proposals (
  proposal_id TEXT PRIMARY KEY CHECK (length(proposal_id) = 36),
  proposal_key TEXT NOT NULL CHECK (length(proposal_key) BETWEEN 3 AND 80),
  proposal_version INTEGER NOT NULL CHECK (typeof(proposal_version) = 'integer' AND proposal_version > 0),
  proposal_type TEXT NOT NULL CHECK (proposal_type = 'research_evidence_review_v1'),
  state TEXT NOT NULL CHECK (state = 'PROPOSED'),
  source_audit_id TEXT NOT NULL REFERENCES analysis_research_audits(audit_id) ON DELETE RESTRICT,
  source_audit_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  producer_id TEXT NOT NULL CHECK (length(producer_id) BETWEEN 3 AND 120),
  producer_version INTEGER NOT NULL CHECK (typeof(producer_version) = 'integer' AND producer_version > 0),
  request_sha256 TEXT NOT NULL CHECK (
    length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'
  ),
  proposal_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK (length(trim(created_at)) > 0),
  UNIQUE (proposal_key, proposal_version)
) STRICT;

CREATE INDEX orchestrator_proposals_source_audit_idx
  ON orchestrator_proposals(source_audit_id);
CREATE INDEX orchestrator_proposals_artifact_idx
  ON orchestrator_proposals(proposal_artifact_sha256);

CREATE TRIGGER orchestrator_proposals_no_update
BEFORE UPDATE ON orchestrator_proposals
BEGIN
  SELECT RAISE(ABORT, 'orchestrator_proposal_immutable');
END;

CREATE TRIGGER orchestrator_proposals_no_delete
BEFORE DELETE ON orchestrator_proposals
BEGIN
  SELECT RAISE(ABORT, 'orchestrator_proposal_immutable');
END;

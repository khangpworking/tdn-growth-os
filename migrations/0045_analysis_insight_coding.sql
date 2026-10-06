-- Insight-specific evidence, not a shared approval engine or report ledger.
CREATE TABLE analysis_insight_coding_evidence (
  evidence_id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('ADOPTION','PROPOSAL','RECEIPT')),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  pair_sha256 TEXT NOT NULL,
  parent_id TEXT REFERENCES analysis_insight_coding_evidence(evidence_id) ON DELETE RESTRICT,
  request_key TEXT UNIQUE NOT NULL,
  sequence INTEGER NOT NULL CHECK(sequence > 0),
  artifact_sha256 TEXT UNIQUE NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_json TEXT NOT NULL CHECK(json_valid(artifact_json)),
  CHECK((kind='ADOPTION' AND parent_id IS NULL) OR (kind!='ADOPTION' AND parent_id IS NOT NULL)),
  UNIQUE(parent_id,kind,sequence)
) STRICT;
CREATE TRIGGER insight_coding_parent BEFORE INSERT ON analysis_insight_coding_evidence
WHEN NEW.parent_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM analysis_insight_coding_evidence p WHERE p.evidence_id=NEW.parent_id
  AND p.run_id=NEW.run_id AND p.pair_sha256=NEW.pair_sha256
  AND ((NEW.kind='PROPOSAL' AND p.kind='ADOPTION') OR (NEW.kind='RECEIPT' AND p.kind='PROPOSAL'))
)
BEGIN SELECT RAISE(ABORT, 'insight_coding_parent_mismatch'); END;
CREATE TRIGGER insight_coding_no_update BEFORE UPDATE ON analysis_insight_coding_evidence
BEGIN SELECT RAISE(ABORT, 'immutable_insight_coding'); END;
CREATE TRIGGER insight_coding_no_delete BEFORE DELETE ON analysis_insight_coding_evidence
BEGIN SELECT RAISE(ABORT, 'immutable_insight_coding'); END;

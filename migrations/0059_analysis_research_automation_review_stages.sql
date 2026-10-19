-- Immutable non-review checkpoint; final step state settles the public review tail.
CREATE TABLE analysis_research_automation_review_stages (
  run_id TEXT PRIMARY KEY REFERENCES analysis_research_automation_runs(run_id),
  confirmed_source_set_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256)
    CHECK (length(confirmed_source_set_sha256)=64 AND confirmed_source_set_sha256 NOT GLOB '*[^0-9a-f]*'),
  base_step_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256)
    CHECK (length(base_step_sha256)=64 AND base_step_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK (length(created_at)>0)
) STRICT;
CREATE TRIGGER analysis_research_automation_review_stages_no_update
BEFORE UPDATE ON analysis_research_automation_review_stages
BEGIN SELECT RAISE(ABORT,'review checkpoint is immutable'); END;
CREATE TRIGGER analysis_research_automation_review_stages_no_delete
BEFORE DELETE ON analysis_research_automation_review_stages
BEGIN SELECT RAISE(ABORT,'review checkpoint is immutable'); END;

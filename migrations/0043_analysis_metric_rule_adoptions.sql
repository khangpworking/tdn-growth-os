-- Exact OWNER adoption of classification rules, not acceptance of any row label.
CREATE TABLE analysis_metric_rule_adoptions (
  adoption_id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL,
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  request_key TEXT UNIQUE NOT NULL,
  request_json TEXT NOT NULL CHECK(json_valid(request_json)),
  rule_id TEXT NOT NULL,
  rule_revision INTEGER NOT NULL CHECK(rule_revision >= 1),
  start_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  scope_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  rulebook_sha256 TEXT NOT NULL CHECK(length(rulebook_sha256)=64 AND rulebook_sha256 NOT GLOB '*[^0-9a-f]*'),
  artifact_sha256 TEXT UNIQUE NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  actor_id TEXT NOT NULL CHECK(length(trim(actor_id)) BETWEEN 1 AND 200),
  adopted_at TEXT NOT NULL CHECK(length(trim(adopted_at)) > 0),
  UNIQUE(run_id, rule_id, rule_revision)
) STRICT;

CREATE TRIGGER analysis_metric_rule_adoptions_exact_scope
BEFORE INSERT ON analysis_metric_rule_adoptions
WHEN NOT EXISTS (
  SELECT 1 FROM analysis_research_automation_runs r
  WHERE r.run_id=NEW.run_id AND r.workspace_id=NEW.workspace_id
    AND r.start_request_sha256=NEW.start_sha256 AND r.scope_request_sha256=NEW.scope_sha256
    AND r.scope_confirmed_at IS NOT NULL
)
BEGIN SELECT RAISE(ABORT, 'metric_rule_requires_confirmed_scope'); END;

CREATE TRIGGER analysis_metric_rule_adoptions_no_update
BEFORE UPDATE ON analysis_metric_rule_adoptions
BEGIN SELECT RAISE(ABORT, 'immutable_metric_rule_adoption'); END;
CREATE TRIGGER analysis_metric_rule_adoptions_no_delete
BEFORE DELETE ON analysis_metric_rule_adoptions
BEGIN SELECT RAISE(ABORT, 'immutable_metric_rule_adoption'); END;

CREATE TABLE flow_discovery_workspaces (
  workspace_id TEXT PRIMARY KEY CHECK(length(workspace_id) = 36),
  workspace_key TEXT NOT NULL UNIQUE CHECK(length(workspace_key) BETWEEN 3 AND 80 AND workspace_key GLOB '[a-z]*' AND workspace_key NOT GLOB '*[^a-z0-9_-]*'),
  state TEXT NOT NULL CHECK(state = 'ACTIVE'),
  title TEXT NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 200 AND title = trim(title)),
  description TEXT CHECK(length(trim(description)) BETWEEN 1 AND 1000 AND description = trim(description)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  workspace_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE flow_product_candidates (
  candidate_id TEXT PRIMARY KEY CHECK(length(candidate_id) = 36),
  workspace_id TEXT NOT NULL REFERENCES flow_discovery_workspaces(workspace_id) ON DELETE RESTRICT,
  candidate_key TEXT NOT NULL CHECK(length(candidate_key) BETWEEN 3 AND 80 AND candidate_key GLOB '[a-z]*' AND candidate_key NOT GLOB '*[^a-z0-9_-]*'),
  state TEXT NOT NULL CHECK(state = 'EXPLORING'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  UNIQUE(workspace_id, candidate_key)
) STRICT;

CREATE TABLE flow_product_candidate_revisions (
  candidate_id TEXT NOT NULL REFERENCES flow_product_candidates(candidate_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200 AND label = trim(label)),
  summary TEXT CHECK(length(trim(summary)) BETWEEN 1 AND 1000 AND summary = trim(summary)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  candidate_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(candidate_id, version)
) STRICT;

CREATE TRIGGER flow_discovery_workspaces_no_update BEFORE UPDATE ON flow_discovery_workspaces BEGIN SELECT RAISE(ABORT, 'flow_discovery_workspace_immutable'); END;
CREATE TRIGGER flow_discovery_workspaces_no_delete BEFORE DELETE ON flow_discovery_workspaces BEGIN SELECT RAISE(ABORT, 'flow_discovery_workspace_immutable'); END;
CREATE TRIGGER flow_product_candidates_no_update BEFORE UPDATE ON flow_product_candidates BEGIN SELECT RAISE(ABORT, 'flow_product_candidate_immutable'); END;
CREATE TRIGGER flow_product_candidates_no_delete BEFORE DELETE ON flow_product_candidates BEGIN SELECT RAISE(ABORT, 'flow_product_candidate_immutable'); END;
CREATE TRIGGER flow_product_candidate_revisions_no_update BEFORE UPDATE ON flow_product_candidate_revisions BEGIN SELECT RAISE(ABORT, 'flow_product_candidate_revision_immutable'); END;
CREATE TRIGGER flow_product_candidate_revisions_no_delete BEFORE DELETE ON flow_product_candidate_revisions BEGIN SELECT RAISE(ABORT, 'flow_product_candidate_revision_immutable'); END;
CREATE TRIGGER flow_product_candidate_revisions_sequential
BEFORE INSERT ON flow_product_candidate_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_product_candidate_revisions WHERE candidate_id = NEW.candidate_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_product_candidate_revision_not_sequential'); END;

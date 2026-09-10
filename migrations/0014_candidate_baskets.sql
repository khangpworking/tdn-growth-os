CREATE TABLE flow_candidate_baskets (
  basket_id TEXT PRIMARY KEY CHECK(length(basket_id) = 36),
  workspace_id TEXT NOT NULL REFERENCES flow_discovery_workspaces(workspace_id) ON DELETE RESTRICT,
  basket_key TEXT NOT NULL CHECK(length(basket_key) BETWEEN 3 AND 80 AND basket_key GLOB '[a-z]*' AND basket_key NOT GLOB '*[^a-z0-9_-]*'),
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  basket_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  member_count INTEGER NOT NULL CHECK(typeof(member_count) = 'integer' AND member_count > 0),
  frozen_at TEXT NOT NULL CHECK(length(trim(frozen_at)) > 0),
  UNIQUE(workspace_id, basket_key, version)
) STRICT;

CREATE TABLE flow_candidate_basket_members (
  basket_id TEXT NOT NULL REFERENCES flow_candidate_baskets(basket_id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK(typeof(position) = 'integer' AND position >= 0),
  candidate_id TEXT NOT NULL,
  candidate_version INTEGER NOT NULL CHECK(typeof(candidate_version) = 'integer' AND candidate_version > 0),
  candidate_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT CHECK(length(candidate_artifact_sha256) = 64 AND candidate_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  candidate_key TEXT NOT NULL CHECK(length(candidate_key) BETWEEN 3 AND 80 AND candidate_key GLOB '[a-z]*' AND candidate_key NOT GLOB '*[^a-z0-9_-]*'),
  label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 200 AND label = trim(label)),
  summary TEXT CHECK(length(trim(summary)) BETWEEN 1 AND 1000 AND summary = trim(summary)),
  state TEXT NOT NULL CHECK(state = 'EXPLORING'),
  PRIMARY KEY(basket_id, position),
  UNIQUE(basket_id, candidate_id),
  FOREIGN KEY(candidate_id, candidate_version) REFERENCES flow_product_candidate_revisions(candidate_id, version) ON DELETE RESTRICT
) STRICT;

CREATE TRIGGER flow_candidate_baskets_no_update BEFORE UPDATE ON flow_candidate_baskets BEGIN SELECT RAISE(ABORT, 'flow_candidate_basket_immutable'); END;
CREATE TRIGGER flow_candidate_baskets_no_delete BEFORE DELETE ON flow_candidate_baskets BEGIN SELECT RAISE(ABORT, 'flow_candidate_basket_immutable'); END;
CREATE TRIGGER flow_candidate_basket_members_insert_guard
BEFORE INSERT ON flow_candidate_basket_members
WHEN NEW.position <> (SELECT count(*) FROM flow_candidate_basket_members WHERE basket_id = NEW.basket_id)
  OR NEW.position >= (SELECT member_count FROM flow_candidate_baskets WHERE basket_id = NEW.basket_id)
  OR (SELECT c.workspace_id FROM flow_product_candidates c WHERE c.candidate_id = NEW.candidate_id)
     <> (SELECT b.workspace_id FROM flow_candidate_baskets b WHERE b.basket_id = NEW.basket_id)
BEGIN SELECT RAISE(ABORT, 'flow_candidate_basket_member_invalid'); END;
CREATE TRIGGER flow_candidate_basket_members_no_update BEFORE UPDATE ON flow_candidate_basket_members BEGIN SELECT RAISE(ABORT, 'flow_candidate_basket_member_immutable'); END;
CREATE TRIGGER flow_candidate_basket_members_no_delete BEFORE DELETE ON flow_candidate_basket_members BEGIN SELECT RAISE(ABORT, 'flow_candidate_basket_member_immutable'); END;

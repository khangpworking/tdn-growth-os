-- Big Ideas and Angles (task 050b). Each idea is one audited AI attempt output (ADR 0004) bound to
-- the locked Insight it was generated from. Ideas and their state history are append-only.
CREATE TABLE flow_content_ideas (
  idea_id TEXT PRIMARY KEY NOT NULL CHECK(length(idea_id) = 36),
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('BIG_IDEA', 'ANGLE')),
  parent_idea_id TEXT REFERENCES flow_content_ideas(idea_id) ON DELETE RESTRICT,
  ordinal INTEGER NOT NULL CHECK(typeof(ordinal) = 'integer' AND ordinal BETWEEN 1 AND 10000),
  insight_version INTEGER NOT NULL CHECK(typeof(insight_version) = 'integer' AND insight_version > 0),
  request_id TEXT NOT NULL UNIQUE CHECK(length(request_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  attempt_id TEXT NOT NULL UNIQUE REFERENCES flow_content_ai_attempts(attempt_id) ON DELETE RESTRICT,
  idea_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  CHECK((kind = 'BIG_IDEA') = (parent_idea_id IS NULL)),
  FOREIGN KEY(campaign_id, insight_version) REFERENCES flow_content_insight_revisions(campaign_id, version) ON DELETE RESTRICT
) STRICT;

CREATE UNIQUE INDEX flow_content_ideas_ordinal ON flow_content_ideas(campaign_id, kind, COALESCE(parent_idea_id, ''), ordinal);
CREATE INDEX flow_content_ideas_parent ON flow_content_ideas(parent_idea_id);

CREATE TRIGGER flow_content_ideas_no_update BEFORE UPDATE ON flow_content_ideas BEGIN SELECT RAISE(ABORT, 'flow_content_idea_immutable'); END;
CREATE TRIGGER flow_content_ideas_no_delete BEFORE DELETE ON flow_content_ideas BEGIN SELECT RAISE(ABORT, 'flow_content_idea_immutable'); END;
CREATE TRIGGER flow_content_ideas_sequential
BEFORE INSERT ON flow_content_ideas
WHEN NEW.ordinal <> COALESCE((
  SELECT MAX(ordinal) + 1 FROM flow_content_ideas
  WHERE campaign_id = NEW.campaign_id AND kind = NEW.kind AND COALESCE(parent_idea_id, '') = COALESCE(NEW.parent_idea_id, '')
), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_not_sequential'); END;
CREATE TRIGGER flow_content_ideas_locked_insight
BEFORE INSERT ON flow_content_ideas
WHEN NOT EXISTS (SELECT 1 FROM flow_content_insight_locks WHERE campaign_id = NEW.campaign_id AND insight_version = NEW.insight_version)
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_insight_not_locked'); END;
CREATE TRIGGER flow_content_ideas_parent
BEFORE INSERT ON flow_content_ideas
WHEN NEW.parent_idea_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM flow_content_ideas WHERE idea_id = NEW.parent_idea_id AND kind = 'BIG_IDEA' AND campaign_id = NEW.campaign_id
)
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_parent_invalid'); END;
CREATE TRIGGER flow_content_ideas_attempt
BEFORE INSERT ON flow_content_ideas
WHEN NOT EXISTS (
  SELECT 1 FROM flow_content_ai_attempts
  WHERE attempt_id = NEW.attempt_id AND modality = 'text' AND target_id = NEW.idea_id
    AND target_type = CASE NEW.kind WHEN 'BIG_IDEA' THEN 'content_big_idea' ELSE 'content_angle' END
)
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_attempt_mismatch'); END;

-- Full state after each OWNER action; sequence 0 (not developing, not deleted, no purposes) is implicit.
CREATE TABLE flow_content_idea_states (
  idea_id TEXT NOT NULL REFERENCES flow_content_ideas(idea_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(typeof(sequence) = 'integer' AND sequence > 0),
  action TEXT NOT NULL CHECK(action IN ('DEVELOP', 'STOP', 'DELETE', 'RESTORE', 'PURPOSES')),
  developing INTEGER NOT NULL CHECK(developing IN (0, 1)),
  deleted INTEGER NOT NULL CHECK(deleted IN (0, 1)),
  purposes_json TEXT NOT NULL CHECK(json_valid(purposes_json) AND json_type(purposes_json) = 'array' AND json_array_length(purposes_json) <= 6),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(idea_id, sequence),
  CHECK(action <> 'DEVELOP' OR (developing = 1 AND deleted = 0)),
  CHECK(action <> 'STOP' OR (developing = 0 AND deleted = 0)),
  CHECK(action <> 'DELETE' OR deleted = 1),
  CHECK(action <> 'RESTORE' OR deleted = 0),
  CHECK(action <> 'PURPOSES' OR deleted = 0)
) STRICT;

CREATE TRIGGER flow_content_idea_states_no_update BEFORE UPDATE ON flow_content_idea_states BEGIN SELECT RAISE(ABORT, 'flow_content_idea_state_immutable'); END;
CREATE TRIGGER flow_content_idea_states_no_delete BEFORE DELETE ON flow_content_idea_states BEGIN SELECT RAISE(ABORT, 'flow_content_idea_state_immutable'); END;
CREATE TRIGGER flow_content_idea_states_sequential
BEFORE INSERT ON flow_content_idea_states
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) + 1 FROM flow_content_idea_states WHERE idea_id = NEW.idea_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_state_not_sequential'); END;
CREATE TRIGGER flow_content_idea_states_purposes_angle_only
BEFORE INSERT ON flow_content_idea_states
WHEN json_array_length(NEW.purposes_json) > 0
  AND (SELECT kind FROM flow_content_ideas WHERE idea_id = NEW.idea_id) <> 'ANGLE'
BEGIN SELECT RAISE(ABORT, 'flow_content_idea_purposes_angle_only'); END;

-- Owner-defined purpose tags, shared by all campaigns ("Của bạn"). Append-only.
CREATE TABLE flow_content_purpose_tags (
  tag_id TEXT PRIMARY KEY NOT NULL CHECK(length(tag_id) = 36),
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 40 AND label = trim(label)),
  label_key TEXT NOT NULL UNIQUE CHECK(length(label_key) BETWEEN 1 AND 40),
  display_like TEXT NOT NULL CHECK(display_like IN ('EDUCATION', 'ENTERTAINMENT', 'SALES', 'TRUST', 'ENGAGEMENT')),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TRIGGER flow_content_purpose_tags_no_update BEFORE UPDATE ON flow_content_purpose_tags BEGIN SELECT RAISE(ABORT, 'flow_content_purpose_tag_immutable'); END;
CREATE TRIGGER flow_content_purpose_tags_no_delete BEFORE DELETE ON flow_content_purpose_tags BEGIN SELECT RAISE(ABORT, 'flow_content_purpose_tag_immutable'); END;

CREATE TABLE flow_content_prompts (
  prompt_id TEXT PRIMARY KEY CHECK(length(prompt_id) = 36),
  prompt_key TEXT NOT NULL UNIQUE CHECK(length(prompt_key) BETWEEN 3 AND 80 AND prompt_key GLOB '[a-z]*' AND prompt_key NOT GLOB '*[^a-z0-9_-]*'),
  prompt_type TEXT NOT NULL CHECK(prompt_type IN ('BIG_IDEA', 'ANGLE', 'CAPTION', 'POSTER')),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0)
) STRICT;

CREATE TABLE flow_content_prompt_revisions (
  prompt_id TEXT NOT NULL REFERENCES flow_content_prompts(prompt_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  prompt_name TEXT NOT NULL CHECK(length(trim(prompt_name)) BETWEEN 1 AND 120 AND prompt_name = trim(prompt_name)),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  prompt_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(prompt_id, version)
) STRICT;

CREATE TABLE flow_content_prompt_lifecycle (
  prompt_id TEXT NOT NULL REFERENCES flow_content_prompts(prompt_id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK(typeof(sequence) = 'integer' AND sequence > 0),
  action TEXT NOT NULL CHECK(action IN ('DELETE', 'RESTORE')),
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0 AND julianday(created_at) IS NOT NULL),
  PRIMARY KEY(prompt_id, sequence)
) STRICT;

CREATE INDEX flow_content_prompts_by_type ON flow_content_prompts(prompt_type, created_at, prompt_id);

CREATE TRIGGER flow_content_prompts_no_update BEFORE UPDATE ON flow_content_prompts BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_immutable'); END;
CREATE TRIGGER flow_content_prompts_no_delete BEFORE DELETE ON flow_content_prompts BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_immutable'); END;
CREATE TRIGGER flow_content_prompt_revisions_no_update BEFORE UPDATE ON flow_content_prompt_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_revision_immutable'); END;
CREATE TRIGGER flow_content_prompt_revisions_no_delete BEFORE DELETE ON flow_content_prompt_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_revision_immutable'); END;
CREATE TRIGGER flow_content_prompt_revisions_sequential
BEFORE INSERT ON flow_content_prompt_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_prompt_revisions WHERE prompt_id = NEW.prompt_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_revision_not_sequential'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_no_update BEFORE UPDATE ON flow_content_prompt_lifecycle BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_lifecycle_immutable'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_no_delete BEFORE DELETE ON flow_content_prompt_lifecycle BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_lifecycle_immutable'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_sequential
BEFORE INSERT ON flow_content_prompt_lifecycle
WHEN NEW.sequence <> COALESCE((SELECT MAX(sequence) + 1 FROM flow_content_prompt_lifecycle WHERE prompt_id = NEW.prompt_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_lifecycle_not_sequential'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_alternates
BEFORE INSERT ON flow_content_prompt_lifecycle
WHEN NEW.action = COALESCE((SELECT action FROM flow_content_prompt_lifecycle WHERE prompt_id = NEW.prompt_id ORDER BY sequence DESC LIMIT 1), 'RESTORE')
BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_lifecycle_not_alternating'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_chronological
BEFORE INSERT ON flow_content_prompt_lifecycle
WHEN julianday(NEW.created_at) < (SELECT julianday(created_at) FROM flow_content_prompt_lifecycle WHERE prompt_id = NEW.prompt_id ORDER BY sequence DESC LIMIT 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_lifecycle_not_chronological'); END;
CREATE TRIGGER flow_content_prompt_lifecycle_restore_window
BEFORE INSERT ON flow_content_prompt_lifecycle
WHEN NEW.action = 'RESTORE' AND julianday(NEW.created_at) - (SELECT julianday(created_at) FROM flow_content_prompt_lifecycle WHERE prompt_id = NEW.prompt_id ORDER BY sequence DESC LIMIT 1) > 30
BEGIN SELECT RAISE(ABORT, 'flow_content_prompt_restore_window_expired'); END;

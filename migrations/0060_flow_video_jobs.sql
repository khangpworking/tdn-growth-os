-- Video Factory slice 1 (ADR 0007): projects and jobs only. Scenes, libraries, provider attempts
-- and render snapshots arrive in later checkpoints. States follow 055-Q1; jobs follow 055-Q2.
CREATE TABLE flow_video_projects (
  project_id TEXT PRIMARY KEY NOT NULL CHECK(length(project_id) = 36),
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 2000 AND title NOT GLOB ('*[' || char(1) || '-' || char(31) || char(127) || ']*')),
  state TEXT NOT NULL CHECK(state IN ('stop_1', 'stop_2', 'voicing', 'rendering', 'stop_3', 'final')),
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version >= 1),
  hidden INTEGER NOT NULL CHECK(hidden IN (0, 1)),
  created_at TEXT NOT NULL CHECK(typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  updated_at TEXT NOT NULL CHECK(typeof(updated_at) = 'text' AND length(updated_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', updated_at) IS updated_at AND updated_at >= created_at)
) STRICT;

CREATE TABLE flow_video_jobs (
  job_id TEXT PRIMARY KEY NOT NULL CHECK(length(job_id) = 36),
  project_id TEXT NOT NULL REFERENCES flow_video_projects(project_id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK(kind IN ('import', 'voice', 'render')),
  state TEXT NOT NULL CHECK(state IN ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'interrupted')),
  progress INTEGER CHECK(progress IS NULL OR (typeof(progress) = 'integer' AND progress BETWEEN 0 AND 100)),
  error_code TEXT CHECK(error_code IS NULL OR error_code IN ('process_failed', 'timeout', 'cancelled_by_owner', 'interrupted_by_restart')),
  -- Project state the job started from; failed/cancelled/interrupted restore it (055-Q1).
  entry_state TEXT NOT NULL CHECK(entry_state IN ('stop_1', 'stop_2', 'voicing', 'rendering', 'stop_3', 'final')),
  created_at TEXT NOT NULL CHECK(typeof(created_at) = 'text' AND length(created_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', created_at) IS created_at),
  started_at TEXT CHECK(started_at IS NULL OR (
    typeof(started_at) = 'text' AND length(started_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', started_at) IS started_at AND started_at >= created_at
  )),
  finished_at TEXT CHECK(finished_at IS NULL OR (
    typeof(finished_at) = 'text' AND length(finished_at) = 24 AND strftime('%Y-%m-%dT%H:%M:%fZ', finished_at) IS finished_at AND finished_at >= created_at
  )),
  -- started_at is set exactly when running; finished_at exactly when not queued/running.
  CHECK((state = 'running') = (started_at IS NOT NULL AND finished_at IS NULL)),
  CHECK((state = 'queued') = (started_at IS NULL AND finished_at IS NULL)),
  CHECK((error_code IS NULL) = (state IN ('queued', 'running', 'succeeded'))),
  CHECK(state <> 'interrupted' OR error_code IS 'interrupted_by_restart'),
  CHECK(state <> 'cancelled' OR error_code IS 'cancelled_by_owner'),
  -- Succeeded jobs carry progress 100; active/queued jobs carry null or a partial value; closed failures keep their last value.
  CHECK(state <> 'succeeded' OR progress IS 100),
  CHECK(state <> 'queued' OR progress IS NULL)
) STRICT;

CREATE INDEX flow_video_jobs_running ON flow_video_jobs(state) WHERE state = 'running';
CREATE INDEX flow_video_jobs_queued ON flow_video_jobs(created_at, job_id) WHERE state = 'queued';
CREATE INDEX flow_video_jobs_by_project ON flow_video_jobs(project_id, created_at, job_id);

-- One video job running at a time across the whole flow (ADR 0007: one VideoWorker, no second queue).
CREATE UNIQUE INDEX flow_video_jobs_one_running ON flow_video_jobs((1)) WHERE state = 'running';

-- Allowed transitions: queued -> running (claim) or cancelled (owner); running -> terminal once.
-- Identity columns never change; entry_state never changes; progress moves only while running.
CREATE TRIGGER flow_video_jobs_transition
BEFORE UPDATE ON flow_video_jobs
WHEN NOT (
  (OLD.state IS 'queued' AND NEW.state IN ('running', 'cancelled'))
  OR (OLD.state IS 'running' AND NEW.state IN ('running', 'succeeded', 'failed', 'cancelled', 'interrupted'))
) OR NOT (
  NEW.job_id IS OLD.job_id AND NEW.project_id IS OLD.project_id AND NEW.kind IS OLD.kind
  AND NEW.entry_state IS OLD.entry_state AND NEW.created_at IS OLD.created_at
) OR NOT (
  (OLD.state IS 'queued' AND NEW.state IS 'running' AND NEW.started_at IS NOT NULL AND NEW.finished_at IS NULL AND NEW.progress IS NULL)
  OR (OLD.state IS 'queued' AND NEW.state IS 'cancelled' AND NEW.started_at IS NULL AND NEW.finished_at IS NOT NULL)
  OR (OLD.state IS 'running' AND NEW.state IS 'running' AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS NULL
    AND NEW.progress IS NOT NULL AND NEW.progress > coalesce(OLD.progress, -1))
  OR (OLD.state IS 'running' AND NEW.state <> 'running' AND NEW.started_at IS OLD.started_at AND NEW.finished_at IS NOT NULL
    AND ((NEW.progress IS OLD.progress) OR (NEW.state IS 'succeeded' AND NEW.progress IS 100)))
)
BEGIN SELECT RAISE(ABORT, 'flow_video_job_transition_invalid'); END;

CREATE TRIGGER flow_video_jobs_no_delete
BEFORE DELETE ON flow_video_jobs
BEGIN SELECT RAISE(ABORT, 'flow_video_job_immutable'); END;

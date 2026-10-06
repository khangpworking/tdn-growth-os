-- Supplemental rendering owns its state, never reopens a terminal source run.
CREATE TABLE analysis_research_automation_attempts (
  attempt_id TEXT PRIMARY KEY NOT NULL CHECK(length(attempt_id)=36 AND attempt_id NOT GLOB '*[^0-9a-f-]*'),
  run_id TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id) ON DELETE RESTRICT,
  attempt_number INTEGER NOT NULL CHECK(attempt_number>=1),
  previous_pair_sha256 TEXT NOT NULL CHECK(length(previous_pair_sha256)=64 AND previous_pair_sha256 NOT GLOB '*[^0-9a-f]*'),
  request_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  source_set_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  state TEXT NOT NULL CHECK(state IN ('QUEUED','RUNNING','COMMITTED','FAILED','CANCELLED')),
  version_number INTEGER CHECK(version_number>=2),
  pair_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at))>0),
  started_at TEXT,
  finished_at TEXT,
  UNIQUE(run_id,attempt_number), UNIQUE(run_id,version_number),
  CHECK((state='COMMITTED')=(version_number IS NOT NULL AND pair_sha256 IS NOT NULL)),
  CHECK(state='COMMITTED' OR (version_number IS NULL AND pair_sha256 IS NULL)),
  CHECK((state IN ('COMMITTED','FAILED','CANCELLED'))=(finished_at IS NOT NULL)),
  CHECK(state<>'QUEUED' OR started_at IS NULL),
  CHECK(state<>'RUNNING' OR started_at IS NOT NULL)
) STRICT;
CREATE UNIQUE INDEX analysis_research_automation_one_open_attempt
ON analysis_research_automation_attempts(run_id) WHERE state IN ('QUEUED','RUNNING');
CREATE TRIGGER analysis_research_automation_attempt_insert
BEFORE INSERT ON analysis_research_automation_attempts
WHEN NEW.state<>'QUEUED' OR NEW.attempt_number<>(SELECT coalesce(max(attempt_number),0)+1 FROM analysis_research_automation_attempts WHERE run_id=NEW.run_id)
 OR NOT EXISTS(SELECT 1 FROM analysis_research_automation_runs WHERE run_id=NEW.run_id AND status='DRAFT_READY' AND scope_request_sha256 IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'invalid_analysis_report_attempt'); END;
CREATE TRIGGER analysis_research_automation_attempt_update
BEFORE UPDATE ON analysis_research_automation_attempts
WHEN NEW.attempt_id IS NOT OLD.attempt_id OR NEW.run_id IS NOT OLD.run_id OR NEW.attempt_number IS NOT OLD.attempt_number
 OR NEW.previous_pair_sha256 IS NOT OLD.previous_pair_sha256 OR NEW.request_sha256 IS NOT OLD.request_sha256
 OR NEW.source_set_sha256 IS NOT OLD.source_set_sha256 OR NEW.created_at IS NOT OLD.created_at
 OR NOT ((OLD.state='QUEUED' AND NEW.state IN ('RUNNING','CANCELLED'))
   OR (OLD.state='RUNNING' AND NEW.state IN ('QUEUED','COMMITTED','FAILED','CANCELLED')))
 OR (NEW.state='COMMITTED' AND (NEW.version_number<>(SELECT coalesce(max(version_number),1)+1 FROM analysis_research_automation_attempts WHERE run_id=NEW.run_id AND state='COMMITTED')
   OR (SELECT count(*) FROM analysis_research_automation_attempt_outputs WHERE attempt_id=NEW.attempt_id)<>(SELECT CASE reports WHEN 'MARKET,INSIGHT' THEN 2 ELSE 1 END FROM analysis_research_automation_runs WHERE run_id=NEW.run_id)))
BEGIN SELECT RAISE(ABORT,'invalid_analysis_report_attempt_transition'); END;
CREATE TRIGGER analysis_research_automation_attempt_no_delete
BEFORE DELETE ON analysis_research_automation_attempts BEGIN SELECT RAISE(ABORT,'immutable_analysis_report_attempt'); END;

CREATE TABLE analysis_research_automation_attempt_requests (
  request_key TEXT PRIMARY KEY NOT NULL CHECK(length(request_key)=36 AND request_key NOT GLOB '*[^0-9a-f-]*'),
  attempt_id TEXT NOT NULL REFERENCES analysis_research_automation_attempts(attempt_id) ON DELETE RESTRICT,
  request_kind TEXT NOT NULL CHECK(request_kind IN ('CREATE','CANCEL')),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256)=64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  accepted_at TEXT NOT NULL CHECK(length(trim(accepted_at))>0)
) STRICT;
CREATE TRIGGER analysis_research_automation_attempt_request_no_update BEFORE UPDATE ON analysis_research_automation_attempt_requests
BEGIN SELECT RAISE(ABORT,'immutable_analysis_attempt_request'); END;
CREATE TRIGGER analysis_research_automation_attempt_request_no_delete BEFORE DELETE ON analysis_research_automation_attempt_requests
BEGIN SELECT RAISE(ABORT,'immutable_analysis_attempt_request'); END;

CREATE TABLE analysis_research_automation_attempt_outputs (
  attempt_id TEXT NOT NULL REFERENCES analysis_research_automation_attempts(attempt_id) ON DELETE RESTRICT,
  report_kind TEXT NOT NULL CHECK(report_kind IN ('MARKET','INSIGHT')),
  version_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  html_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  pdf_sha256 TEXT REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  pdf_unavailable_code TEXT CHECK(pdf_unavailable_code IS NULL OR pdf_unavailable_code IN ('PDF_RENDERER_NOT_CONFIGURED','PDF_RENDER_FAILED')),
  created_at TEXT NOT NULL CHECK(length(trim(created_at))>0),
  PRIMARY KEY(attempt_id,report_kind), CHECK((pdf_sha256 IS NULL)<>(pdf_unavailable_code IS NULL))
) STRICT;
CREATE TRIGGER analysis_research_automation_attempt_output_insert BEFORE INSERT ON analysis_research_automation_attempt_outputs
WHEN NOT EXISTS(SELECT 1 FROM analysis_research_automation_attempts a JOIN analysis_research_automation_runs r ON r.run_id=a.run_id
 WHERE a.attempt_id=NEW.attempt_id AND a.state='RUNNING'
 AND (r.reports='MARKET,INSIGHT' OR r.reports=NEW.report_kind))
BEGIN SELECT RAISE(ABORT,'analysis_attempt_output_requires_running_attempt'); END;
CREATE TRIGGER analysis_research_automation_attempt_output_no_update BEFORE UPDATE ON analysis_research_automation_attempt_outputs
BEGIN SELECT RAISE(ABORT,'immutable_analysis_attempt_output'); END;
CREATE TRIGGER analysis_research_automation_attempt_output_no_delete BEFORE DELETE ON analysis_research_automation_attempt_outputs
BEGIN SELECT RAISE(ABORT,'immutable_analysis_attempt_output'); END;

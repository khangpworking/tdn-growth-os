CREATE TABLE analysis_insight_report_statements (
 statement_id TEXT PRIMARY KEY NOT NULL CHECK(length(statement_id)=36),
 revision_id TEXT NOT NULL REFERENCES analysis_reader_report_revisions(revision_id) ON DELETE RESTRICT,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json) AND json_extract(payload_json,'$.statementId') IS statement_id AND json_extract(payload_json,'$.revisionId') IS revision_id)
) STRICT;
CREATE INDEX analysis_insight_report_statements_revision ON analysis_insight_report_statements(revision_id);
CREATE TRIGGER analysis_insight_report_statements_kind BEFORE INSERT ON analysis_insight_report_statements
WHEN NOT EXISTS (SELECT 1 FROM analysis_reader_report_revisions WHERE revision_id=NEW.revision_id AND report_kind='INSIGHT')
BEGIN SELECT RAISE(ABORT,'insight_statement_requires_insight_revision'); END;
CREATE TRIGGER analysis_insight_report_statements_no_update BEFORE UPDATE ON analysis_insight_report_statements BEGIN SELECT RAISE(ABORT,'immutable_insight_report_statement'); END;
CREATE TRIGGER analysis_insight_report_statements_no_delete BEFORE DELETE ON analysis_insight_report_statements BEGIN SELECT RAISE(ABORT,'immutable_insight_report_statement'); END;

PRAGMA defer_foreign_keys = ON;
CREATE TEMP TABLE content_insights_0062 AS SELECT * FROM flow_content_insight_revisions;
DROP TABLE flow_content_insight_revisions;
CREATE TABLE flow_content_insight_revisions (
  campaign_id TEXT NOT NULL REFERENCES flow_content_campaigns(campaign_id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK(typeof(version) = 'integer' AND version > 0),
  source_kind TEXT NOT NULL CHECK(source_kind IN ('TYPED', 'STP', 'INSIGHT_REPORT')),
  locked_stp_id TEXT CHECK(locked_stp_id IS NULL OR length(locked_stp_id) = 36),
  request_sha256 TEXT NOT NULL CHECK(length(request_sha256) = 64 AND request_sha256 NOT GLOB '*[^0-9a-f]*'),
  insight_artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL CHECK(length(trim(created_at)) > 0),
  PRIMARY KEY(campaign_id, version),
  CHECK((source_kind = 'STP') = (locked_stp_id IS NOT NULL))
) STRICT;

INSERT INTO flow_content_insight_revisions SELECT * FROM content_insights_0062;
DROP TABLE content_insights_0062;
CREATE TRIGGER flow_content_insight_revisions_no_update BEFORE UPDATE ON flow_content_insight_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_immutable'); END;
CREATE TRIGGER flow_content_insight_revisions_no_delete BEFORE DELETE ON flow_content_insight_revisions BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_immutable'); END;
CREATE TRIGGER flow_content_insight_revisions_sequential
BEFORE INSERT ON flow_content_insight_revisions
WHEN NEW.version <> COALESCE((SELECT MAX(version) + 1 FROM flow_content_insight_revisions WHERE campaign_id = NEW.campaign_id), 1)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_revision_not_sequential'); END;
CREATE TRIGGER flow_content_insight_revisions_after_lock
BEFORE INSERT ON flow_content_insight_revisions
WHEN EXISTS (SELECT 1 FROM flow_content_insight_locks WHERE campaign_id = NEW.campaign_id)
BEGIN SELECT RAISE(ABORT, 'flow_content_insight_locked'); END;

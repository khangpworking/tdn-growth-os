-- Retain one exact, verified deterministic section artifact (A36) as immutable,
-- replayable application state, keyed by its own content identity, together with
-- the exact upstream artifacts required to replay it. This is layer-two
-- retention only: no report version, interpretation, review target, approval,
-- PDF, UI/API or deployment is created here.
CREATE TABLE analysis_section_artifacts (
  section_artifact_sha256 TEXT PRIMARY KEY NOT NULL
    CHECK(length(section_artifact_sha256) = 64 AND section_artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  section_id TEXT NOT NULL CHECK(section_id = 'M03'),
  renderer_profile TEXT NOT NULL CHECK(renderer_profile = 'm03-section-artifact-html-vi-v1'),
  preparation_sha256 TEXT NOT NULL
    REFERENCES analysis_metric_input_preparations(preparation_sha256) ON DELETE RESTRICT,
  metric_set_sha256 TEXT NOT NULL
    CHECK(length(metric_set_sha256) = 64 AND metric_set_sha256 NOT GLOB '*[^0-9a-f]*'),
  chart_bundle_sha256 TEXT NOT NULL
    CHECK(length(chart_bundle_sha256) = 64 AND chart_bundle_sha256 NOT GLOB '*[^0-9a-f]*'),
  envelope_sha256 TEXT NOT NULL
    CHECK(length(envelope_sha256) = 64 AND envelope_sha256 NOT GLOB '*[^0-9a-f]*'),
  narrative_sha256 TEXT NOT NULL
    CHECK(length(narrative_sha256) = 64 AND narrative_sha256 NOT GLOB '*[^0-9a-f]*'),
  html_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  html_byte_size INTEGER NOT NULL CHECK(typeof(html_byte_size) = 'integer' AND html_byte_size > 0),
  retained_at TEXT NOT NULL CHECK(length(trim(retained_at)) > 0)
) STRICT;

CREATE INDEX analysis_section_artifacts_preparation
  ON analysis_section_artifacts(preparation_sha256);

-- Deterministic membership: the exact bytes of every artifact required to
-- replay this section artifact from scratch (A32-A36 JSON plus rendered HTML).
CREATE TABLE analysis_section_artifact_members (
  section_artifact_sha256 TEXT NOT NULL
    REFERENCES analysis_section_artifacts(section_artifact_sha256) ON DELETE RESTRICT,
  member_role TEXT NOT NULL
    CHECK(member_role IN ('metric_set', 'chart_bundle', 'envelope', 'narrative', 'receipt', 'html')),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT
    CHECK(length(artifact_sha256) = 64 AND artifact_sha256 NOT GLOB '*[^0-9a-f]*'),
  PRIMARY KEY(section_artifact_sha256, member_role)
) STRICT;

CREATE TRIGGER analysis_section_artifacts_no_update
BEFORE UPDATE ON analysis_section_artifacts
BEGIN SELECT RAISE(ABORT, 'analysis_section_artifact_immutable'); END;

CREATE TRIGGER analysis_section_artifacts_no_delete
BEFORE DELETE ON analysis_section_artifacts
BEGIN SELECT RAISE(ABORT, 'analysis_section_artifact_immutable'); END;

CREATE TRIGGER analysis_section_artifact_members_no_update
BEFORE UPDATE ON analysis_section_artifact_members
BEGIN SELECT RAISE(ABORT, 'analysis_section_artifact_member_immutable'); END;

CREATE TRIGGER analysis_section_artifact_members_no_delete
BEFORE DELETE ON analysis_section_artifact_members
BEGIN SELECT RAISE(ABORT, 'analysis_section_artifact_member_immutable'); END;

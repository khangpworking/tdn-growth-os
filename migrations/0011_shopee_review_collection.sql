CREATE TABLE foundation_shopee_collections (
  collection_id TEXT PRIMARY KEY CHECK(length(collection_id) = 36),
  run_key TEXT NOT NULL UNIQUE,
  request_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  evidence_id TEXT NOT NULL REFERENCES foundation_evidence(evidence_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL
) STRICT;

CREATE TABLE analysis_shopee_review_results (
  collection_id TEXT NOT NULL,
  filter_sha256 TEXT NOT NULL CHECK(length(filter_sha256) = 64),
  artifact_sha256 TEXT NOT NULL REFERENCES artifact_manifests(sha256) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(collection_id, filter_sha256)
) STRICT;

CREATE TRIGGER foundation_shopee_collections_no_update BEFORE UPDATE ON foundation_shopee_collections
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_collection'); END;
CREATE TRIGGER foundation_shopee_collections_no_delete BEFORE DELETE ON foundation_shopee_collections
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_collection'); END;
CREATE TRIGGER analysis_shopee_review_results_no_update BEFORE UPDATE ON analysis_shopee_review_results
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_result'); END;
CREATE TRIGGER analysis_shopee_review_results_no_delete BEFORE DELETE ON analysis_shopee_review_results
BEGIN SELECT RAISE(ABORT, 'immutable_shopee_result'); END;

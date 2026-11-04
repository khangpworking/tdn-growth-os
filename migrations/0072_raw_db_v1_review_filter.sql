-- db-v1 review filter in shadow mode (owner F424, F427, F429, F430; R-RF01 to R-RF10; KHUON-CSDL.md db-v1): one
-- insert-only row per review and filter policy version. Jev decides whether a Shopee or TikTok Shop product review is
-- about the product or order; code guards low stars and complaints. Nothing but the filter pass and `raw-db-load
-- --source FILTER` reads this table: counts, labels, reports and the MCP are unchanged. `raw_db_autoload.filtering`
-- holds the filter result of an automatic load (NULL for rows written before 0072). Other tables keep every row.
CREATE TABLE review_filter_assessment (
  review_key      TEXT NOT NULL REFERENCES review(review_key),
  policy_version  TEXT NOT NULL,
  policy_sha256   TEXT NOT NULL,
  run_id          TEXT NOT NULL,
  outcome         TEXT NOT NULL CHECK (outcome IN ('KEEP','EXCLUDE','UNRESOLVED','NO_CONTENT')),
  reason          TEXT NOT NULL CHECK (reason IN ('JEV_KEEP','JEV_EXCLUDE','JEV_UNRESOLVED','GUARD_LOW_STAR','GUARD_NO_STAR','GUARD_COMPLAINT','EMPTY')),
  p_keep          REAL CHECK (p_keep BETWEEN 0 AND 1),
  p_exclude       REAL CHECK (p_exclude BETWEEN 0 AND 1),
  p_unresolved    REAL CHECK (p_unresolved BETWEEN 0 AND 1),
  p_complaint     REAL CHECK (p_complaint BETWEEN 0 AND 1),
  rating_star     INTEGER,
  model           TEXT,
  -- sha256 of the exact state sent to Jev (of the empty string for NO_CONTENT); response_sha256 = the raw Jev
  -- response body in the content-addressed artifact store.
  text_sha256     TEXT NOT NULL,
  response_sha256 TEXT,
  assessed_at     TEXT NOT NULL,
  PRIMARY KEY (review_key, policy_version),
  -- NO_CONTENT = not sent to Jev: no probability, model or response. Every other outcome has all of them.
  CHECK (CASE WHEN outcome = 'NO_CONTENT'
              THEN reason = 'EMPTY' AND p_keep IS NULL AND p_exclude IS NULL AND p_unresolved IS NULL AND p_complaint IS NULL
                AND model IS NULL AND response_sha256 IS NULL
              ELSE reason <> 'EMPTY' AND p_keep IS NOT NULL AND p_exclude IS NOT NULL AND p_unresolved IS NOT NULL AND p_complaint IS NOT NULL
                AND model IS NOT NULL AND response_sha256 IS NOT NULL END)
) STRICT;
CREATE INDEX review_filter_assessment_by_outcome ON review_filter_assessment(policy_version, outcome);
CREATE TRIGGER review_filter_assessment_no_update BEFORE UPDATE ON review_filter_assessment BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_filter'); END;
CREATE TRIGGER review_filter_assessment_no_delete BEFORE DELETE ON review_filter_assessment BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_filter'); END;

ALTER TABLE raw_db_autoload ADD COLUMN filtering TEXT;

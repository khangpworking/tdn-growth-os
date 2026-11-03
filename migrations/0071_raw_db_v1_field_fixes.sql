-- db-v1 field fixes after the Astra audit (data/raw-sources/KHUON-CSDL.md §2.1, §2.2a, §3, §5; owner F381, F385).
-- 1. review.state is only the review's own state (VALID, HIDDEN, DELETED); a rating problem is never a state.
-- 2. product_name_source: where each product name was read (insert-only; backfilled by loader replay, not here).
-- 3. raw_capture.response_sha256_basis: what each response_sha256 covers; existing rows are backfilled per loader.
-- Fails loudly (CHECK constraint raw_db_0071_*) when existing rows cannot meet these rules.
CREATE TEMP TABLE raw_db_0071_guard (
  review_state_not_review_own_state INTEGER CONSTRAINT raw_db_0071_review_state CHECK (review_state_not_review_own_state = 0),
  sha_without_basis                 INTEGER CONSTRAINT raw_db_0071_response_sha256_basis CHECK (sha_without_basis = 0)
);
INSERT INTO raw_db_0071_guard VALUES ((SELECT count(*) FROM review WHERE state NOT IN ('VALID','HIDDEN','DELETED')), 0);

CREATE TRIGGER review_state_check BEFORE INSERT ON review
WHEN NEW.state NOT IN ('VALID','HIDDEN','DELETED')
BEGIN SELECT RAISE(ABORT,'raw_db_v1_review_state'); END;

CREATE TABLE product_name_source (
  product_key     TEXT PRIMARY KEY REFERENCES product(product_key),
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('METRIC_LIST','RAW_CAPTURE')),
  artifact_sha256 TEXT,
  capture_id      TEXT REFERENCES raw_capture(capture_id),
  json_path       TEXT NOT NULL,
  recorded_at     TEXT NOT NULL,
  CHECK (source_kind <> 'METRIC_LIST' OR (artifact_sha256 IS NOT NULL AND capture_id IS NULL)),
  CHECK (source_kind <> 'RAW_CAPTURE' OR (capture_id IS NOT NULL AND artifact_sha256 IS NULL))
) STRICT;

CREATE TRIGGER product_name_source_no_update BEFORE UPDATE ON product_name_source BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_product_name_source'); END;
CREATE TRIGGER product_name_source_no_delete BEFORE DELETE ON product_name_source BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_product_name_source'); END;

ALTER TABLE raw_capture ADD COLUMN response_sha256_basis TEXT
  CHECK (response_sha256_basis IN ('ORIGINAL_BYTES','RETAINED_ENVELOPE','CANONICAL_JSON','SUPPLIED_FILE'));

-- Backfill: the same per-loader mapping as each loader's INSERT (KHUON §2.1). App-run loads have an `artifact:` raw_path,
-- kẽm-file loads a `file:` one. S02b file loads are not mapped: their basis depends on the file's declare, which is not
-- stored, so such a row stops this migration (raw_db_0071_response_sha256_basis) for the owner to decide.
DROP TRIGGER raw_capture_no_update;
UPDATE raw_capture SET response_sha256_basis = CASE
    WHEN source_code = 'S05' THEN 'RETAINED_ENVELOPE'
    WHEN source_code = 'S06'  AND raw_path LIKE 'artifact:%' THEN 'ORIGINAL_BYTES'
    WHEN source_code = 'S07'  AND raw_path LIKE 'artifact:%' THEN 'RETAINED_ENVELOPE'
    WHEN source_code = 'S07'  AND raw_path LIKE 'file:%'     THEN 'SUPPLIED_FILE'
    WHEN source_code = 'S19b' AND raw_path LIKE 'artifact:%' THEN 'ORIGINAL_BYTES'
    WHEN source_code = 'S19b' AND raw_path LIKE 'file:%'     THEN 'CANONICAL_JSON'
    WHEN source_code = 'S29'  AND raw_path LIKE 'artifact:%' THEN 'ORIGINAL_BYTES'
    WHEN source_code = 'S29'  AND raw_path LIKE 'file:%'     THEN 'RETAINED_ENVELOPE'
    WHEN source_code = 'S02b' AND raw_path LIKE 'artifact:%' THEN 'ORIGINAL_BYTES'
    WHEN source_code = 'S14'  AND raw_path LIKE 'artifact:%' THEN 'ORIGINAL_BYTES'
    WHEN source_code = 'S14'  AND raw_path LIKE 'file:%'     THEN 'SUPPLIED_FILE'
  END
WHERE response_sha256 IS NOT NULL;
CREATE TRIGGER raw_capture_no_update BEFORE UPDATE ON raw_capture BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_raw_capture'); END;
UPDATE raw_db_0071_guard SET sha_without_basis = (SELECT count(*) FROM raw_capture WHERE response_sha256 IS NOT NULL AND response_sha256_basis IS NULL);

CREATE TRIGGER raw_capture_basis_required BEFORE INSERT ON raw_capture
WHEN NEW.response_sha256 IS NOT NULL AND NEW.response_sha256_basis IS NULL
BEGIN SELECT RAISE(ABORT,'raw_db_v1_raw_capture_basis_missing'); END;

DROP TABLE raw_db_0071_guard;

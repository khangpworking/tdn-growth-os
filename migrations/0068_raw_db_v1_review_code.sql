-- db-v1 theme labels (data/raw-sources/KHUON-CSDL.md §3.3, §5): `codebook` (one row per theme-list version, the JSON
-- file text as read) and `review_code` (one row per review × theme × codebook version, no review text), plus the
-- `review_star_sentiment` view over review.rating_star (owner F361–F363). The JSON file stays where the list is edited.
-- Rows are append-only; the only allowed codebook change is DRAFT → APPROVED. Touches no existing table.
CREATE TABLE codebook (
  codebook_version  TEXT PRIMARY KEY,
  contract_version  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED')),
  approved_by       TEXT,
  approved_at       TEXT,
  definition_json   TEXT NOT NULL,
  definition_sha256 TEXT NOT NULL,
  loaded_at         TEXT NOT NULL,
  CHECK ((status = 'DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
      OR (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
) STRICT;

CREATE TABLE review_code (
  review_key       TEXT NOT NULL REFERENCES review(review_key),
  codebook_version TEXT NOT NULL REFERENCES codebook(codebook_version),
  theme_code       TEXT NOT NULL,
  block_key        TEXT,
  polarity         TEXT CHECK (polarity IN ('khen','che','ke','khong_ro_huong')),
  journey_step     TEXT,
  status           TEXT NOT NULL CHECK (status IN ('kept','unclear')),
  confidence       REAL CHECK (confidence BETWEEN 0 AND 1),
  coder            TEXT NOT NULL,
  text_sha256      TEXT NOT NULL,
  coded_at         TEXT NOT NULL,
  origin           TEXT NOT NULL CHECK (origin IN ('MCP_IMPORT')),
  import_sha256    TEXT NOT NULL,
  PRIMARY KEY (review_key, codebook_version, theme_code),
  -- NO_THEME = coded, no theme: no polarity, step or confidence, always kept. A theme row always has polarity and step.
  CHECK (CASE WHEN theme_code = 'NO_THEME'
              THEN polarity IS NULL AND journey_step IS NULL AND confidence IS NULL AND status = 'kept'
              ELSE polarity IS NOT NULL AND journey_step IS NOT NULL END)
) STRICT;
CREATE INDEX review_code_by_theme ON review_code(codebook_version, theme_code);

-- F363: star sentiment is derived, never copied. 1–3 → tieu_cuc, 4–5 → tich_cuc, other/NULL → NULL.
CREATE VIEW review_star_sentiment AS
SELECT r.review_key,
       r.source_code,
       r.platform,
       r.product_key,
       r.rating_star,
       CASE WHEN r.rating_star BETWEEN 1 AND 3 THEN 'tieu_cuc'
            WHEN r.rating_star BETWEEN 4 AND 5 THEN 'tich_cuc' END AS star_sentiment
FROM review r;

CREATE TRIGGER codebook_no_delete BEFORE DELETE ON codebook BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_codebook'); END;
-- Only an approval may change a row: DRAFT → APPROVED with approver and time, every other column unchanged.
CREATE TRIGGER codebook_no_update BEFORE UPDATE ON codebook
WHEN NOT (OLD.status = 'DRAFT' AND NEW.status = 'APPROVED'
          AND NEW.approved_by IS NOT NULL AND NEW.approved_at IS NOT NULL
          AND NEW.codebook_version IS OLD.codebook_version
          AND NEW.contract_version IS OLD.contract_version
          AND NEW.definition_json IS OLD.definition_json
          AND NEW.definition_sha256 IS OLD.definition_sha256
          AND NEW.loaded_at IS OLD.loaded_at)
BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_codebook'); END;
CREATE TRIGGER review_code_no_update BEFORE UPDATE ON review_code BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_code'); END;
CREATE TRIGGER review_code_no_delete BEFORE DELETE ON review_code BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_code'); END;

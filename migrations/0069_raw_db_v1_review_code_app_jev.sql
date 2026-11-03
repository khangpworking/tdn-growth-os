-- db-v1 theme labels made by the app with Jev (owner F366/F367, KHUON-CSDL.md §3.3): `review_code.origin` also allows
-- 'APP_JEV'. SQLite cannot widen a CHECK in place, so the table is rebuilt with every row, the primary key, both
-- foreign keys, the theme index and the no-UPDATE/no-DELETE triggers. Nothing references review_code. Other tables
-- are untouched.
CREATE TABLE review_code_0069 (
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
  -- MCP_IMPORT: copied from an Insight MCP run file; APP_JEV: the app asked Jev. import_sha256 = sha256 of that
  -- MCP file, or of the raw Jev response body (kept in the content-addressed artifact store).
  origin           TEXT NOT NULL CHECK (origin IN ('MCP_IMPORT','APP_JEV')),
  import_sha256    TEXT NOT NULL,
  PRIMARY KEY (review_key, codebook_version, theme_code),
  -- NO_THEME = coded, no theme: no polarity, step or confidence, always kept. A theme row always has polarity and step.
  CHECK (CASE WHEN theme_code = 'NO_THEME'
              THEN polarity IS NULL AND journey_step IS NULL AND confidence IS NULL AND status = 'kept'
              ELSE polarity IS NOT NULL AND journey_step IS NOT NULL END)
) STRICT;

INSERT INTO review_code_0069(review_key,codebook_version,theme_code,block_key,polarity,journey_step,status,confidence,coder,text_sha256,coded_at,origin,import_sha256)
SELECT review_key,codebook_version,theme_code,block_key,polarity,journey_step,status,confidence,coder,text_sha256,coded_at,origin,import_sha256
FROM review_code;

DROP TABLE review_code;
ALTER TABLE review_code_0069 RENAME TO review_code;
CREATE INDEX review_code_by_theme ON review_code(codebook_version, theme_code);
CREATE TRIGGER review_code_no_update BEFORE UPDATE ON review_code BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_code'); END;
CREATE TRIGGER review_code_no_delete BEFORE DELETE ON review_code BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review_code'); END;

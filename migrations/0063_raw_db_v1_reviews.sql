-- db-v1 standardised copy of collected source rows (data/raw-sources/KHUON-CSDL.md §2.1, §2.2, §3, §3.2, §5).
-- First slice: raw_capture, product, review, run_review and the writer_count view. Raw artifacts stay in the
-- artifact store unchanged; every row points back to them. Rows are append-only. Touches no existing table.
CREATE TABLE raw_capture (
  capture_id          TEXT PRIMARY KEY,
  run_id              TEXT,
  source_code         TEXT NOT NULL,
  provider            TEXT NOT NULL,
  operation           TEXT NOT NULL,
  endpoint            TEXT,
  request_params_json TEXT,
  keyword             TEXT,
  period_start        TEXT,
  period_end          TEXT,
  requested_at        TEXT NOT NULL,
  completed_at        TEXT,
  http_status         INTEGER,
  outcome             TEXT NOT NULL CHECK (outcome IN ('OK','EMPTY','PROVIDER_REJECTED','BLOCKED','LOGIN_REQUIRED','FAILED','NOT_COLLECTED')),
  billing             TEXT,
  cost_unit           TEXT,
  cost_amount         REAL,
  response_sha256     TEXT,
  raw_path            TEXT
) STRICT;

CREATE TABLE product (
  product_key      TEXT PRIMARY KEY,
  platform         TEXT NOT NULL CHECK (platform IN ('shopee','tiktok_shop')),
  item_id          TEXT NOT NULL,
  shop_id          TEXT,
  shop_name        TEXT,
  product_name     TEXT NOT NULL,
  brand            TEXT,
  category_path    TEXT,
  product_url      TEXT,
  launch_date      TEXT,
  first_capture_id TEXT NOT NULL REFERENCES raw_capture(capture_id),
  UNIQUE (platform, item_id)
) STRICT;

CREATE TABLE review (
  review_key             TEXT PRIMARY KEY,
  source_code            TEXT NOT NULL CHECK (source_code IN ('S05','S06','S07')),
  platform               TEXT NOT NULL CHECK (platform IN ('shopee','tiktok_shop','tiktok')),
  kind                   TEXT NOT NULL CHECK (kind IN ('product_review','video_comment')),
  external_id            TEXT NOT NULL,
  product_key            TEXT REFERENCES product(product_key),
  video_url              TEXT,
  reviewer_key           TEXT,
  reviewer_name          TEXT,  -- private DB only; never exported or printed
  reviewer_name_state    TEXT NOT NULL CHECK (reviewer_name_state IN ('real','masked_by_source','not_provided')),
  rating_star            INTEGER CHECK (rating_star BETWEEN 1 AND 5),
  text                   TEXT,
  variation              TEXT,
  attributes_json        TEXT,
  posted_at              TEXT,
  like_count             INTEGER,
  reply_count            INTEGER,
  replies_to_external_id TEXT,
  media_count            INTEGER,
  state                  TEXT NOT NULL DEFAULT 'VALID',
  collected_at           TEXT NOT NULL,
  capture_id             TEXT NOT NULL REFERENCES raw_capture(capture_id),
  source_position        TEXT NOT NULL,
  UNIQUE (source_code, external_id),
  CHECK (kind = 'video_comment' OR product_key IS NOT NULL),
  CHECK (kind = 'product_review' OR video_url IS NOT NULL)
) STRICT;
CREATE INDEX review_by_product  ON review(product_key);
CREATE INDEX review_by_reviewer ON review(reviewer_key);

CREATE TABLE run_review (
  run_id          TEXT NOT NULL,
  review_key      TEXT NOT NULL REFERENCES review(review_key),
  capture_id      TEXT NOT NULL REFERENCES raw_capture(capture_id),
  source_position TEXT,
  PRIMARY KEY (run_id, review_key)
) STRICT;

CREATE VIEW writer_count AS
SELECT r.platform,
       r.product_key,
       count(DISTINCT r.reviewer_key) + sum(r.reviewer_key IS NULL) AS writers,
       sum(r.reviewer_key IS NULL) > 0                               AS counted_by_review
FROM review r
WHERE r.product_key IS NOT NULL
GROUP BY r.platform, r.product_key;

CREATE TRIGGER raw_capture_no_update BEFORE UPDATE ON raw_capture BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_raw_capture'); END;
CREATE TRIGGER raw_capture_no_delete BEFORE DELETE ON raw_capture BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_raw_capture'); END;
CREATE TRIGGER product_no_update BEFORE UPDATE ON product BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_product'); END;
CREATE TRIGGER product_no_delete BEFORE DELETE ON product BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_product'); END;
CREATE TRIGGER review_no_update BEFORE UPDATE ON review BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review'); END;
CREATE TRIGGER review_no_delete BEFORE DELETE ON review BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_review'); END;
CREATE TRIGGER run_review_no_update BEFORE UPDATE ON run_review BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_run_review'); END;
CREATE TRIGGER run_review_no_delete BEFORE DELETE ON run_review BEGIN SELECT RAISE(ABORT,'immutable_raw_db_v1_run_review'); END;

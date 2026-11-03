"""RAWDB-Z synthetic app rows; sources still use the existing MCP harness.

COMMON-Z pins the warehouse columns, not the star response envelope. The star
adapter accepts long count rows in ``rows`` (product_key absent or product
"all" for platform totals), or separate ``by_platform``/``by_product`` lists.
Products may be app or warehouse keys, or private refs with the listing
``product_name``; no choice changes the hand-counted oracle.
Coverage metadata may be an integer or a per-platform integer mapping.
"""

import json
import os
import sqlite3
import urllib.parse
from contextlib import closing, contextmanager
from pathlib import Path

from insight_test_support import INSIGHT, REPO, RUN, canonical, sha


AT = "2026-11-03T00:00:00Z"
OTHER_VERSION = "synthetic-other-version"
MIGRATIONS = (
    "0063_raw_db_v1_reviews.sql", "0064_raw_db_v1_google.sql",
    "0065_raw_db_v1_video.sql", "0066_raw_db_v1_video_snapshot.sql",
    "0067_raw_db_v1_video_reading.sql", "0068_raw_db_v1_review_code.sql",
)


def review_id(row):
    return f"{row['platform']}:{row['id']}"


def app_key(row):
    return "synthetic-app:" + review_id(row)


def app_product(row):
    return f"synthetic-product:{row['platform']}:{row['product']}"


def warehouse_product(row):
    return (f"shopee:700:{row['product']}" if row["platform"] == "shopee"
            else f"tiktok_shop:{row['product']}")


def full_text(row):
    # db-v1 text proof: exact UTF-8 text, then two spaces per attribute.
    return row["text"] + "".join("  " + a for a in row["attributes"])


class AppLabels:
    def __init__(self, box, *, app_jev=False):
        self.box = box
        self.definition = (INSIGHT / "data" / "insight-theme-codebook.json").read_bytes()
        self.book = json.loads(self.definition)
        self.version = self.book["version"]
        with closing(self.connect()) as db, db:
            for migration in MIGRATIONS:
                sql = (REPO / "migrations" / migration).read_text()
                if app_jev and migration == "0068_raw_db_v1_review_code.sql":
                    # COMMON-Z2 includes the future app labeller origin. This
                    # checkout's migration still permits only MCP_IMPORT; widen
                    # that one fixture constraint, keeping the real migrations.
                    sql = sql.replace("origin IN ('MCP_IMPORT')", "origin IN ('MCP_IMPORT','APP_JEV')")
                db.executescript(sql)

    def connect(self):
        db = sqlite3.connect(self.box.db)
        db.execute("PRAGMA foreign_keys=ON")
        return db

    def codebook(self, *, version=None, digest=None):
        definition = self.definition
        if version is not None:
            definition = canonical(dict(self.book, version=version)).encode()
        book = json.loads(definition)
        with closing(self.connect()) as db, db:
            db.execute("INSERT INTO codebook VALUES (?,?,?,?,?,?,?,?)", (
                book["version"], book["contractVersion"], book["status"],
                book["approvedBy"], book["approvedAt"], definition.decode(),
                digest if digest is not None else sha(definition), AT,
            ))

    def seed(self, rows, *, app_rows=None):
        self.box.seed(rows)
        for row in rows if app_rows is None else app_rows:
            self.add_review(row)

    def add_review(self, row):
        source = "S05" if row["platform"] == "shopee" else "S06"
        capture = "synthetic-capture:" + row["platform"]
        with closing(self.connect()) as db, db:
            db.execute("""INSERT OR IGNORE INTO raw_capture
                (capture_id,run_id,source_code,provider,operation,requested_at,outcome)
                VALUES (?,?,?,?,?,?,?)""", (capture, RUN, source, "synthetic", "fixture", AT, "OK"))
            db.execute("""INSERT OR IGNORE INTO product
                (product_key,platform,item_id,shop_id,product_name,first_capture_id)
                VALUES (?,?,?,?,?,?)""", (app_product(row), row["platform"], row["product"],
                                         "700", "Sản phẩm thử " + row["product"], capture))
            db.execute("""INSERT INTO review
                (review_key,source_code,platform,kind,external_id,product_key,
                 reviewer_name_state,rating_star,text,attributes_json,collected_at,capture_id,source_position)
                VALUES (?,?,?,'product_review',?,?,'not_provided',?,?,?,?,?,?)""", (
                    app_key(row), source, row["platform"], row["id"], app_product(row),
                    row["rating"], row["text"], canonical(row["attributes"]), AT, capture, row["id"],
                ))
            db.execute("INSERT INTO run_review VALUES (?,?,?,?)", (RUN, app_key(row), capture, row["id"]))

    def label(self, row, theme="T-GIA", *, version=None, block="thuc_pham",
              polarity="khen", step="Sau mua", status="kept", confidence=0.94, digest=None,
              origin="MCP_IMPORT"):
        if theme == "NO_THEME":
            polarity, step, confidence = None, None, None
        with closing(self.connect()) as db, db:
            db.execute("INSERT INTO review_code VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", (
                app_key(row), version or self.version, theme, block, polarity, step, status,
                confidence, "synthetic-app-coder", digest if digest is not None else sha(full_text(row)),
                AT, origin, "a" * 64,
            ))


def success(result):
    assert "error" not in result, result
    return result


def coverage(result, coded, uncoded):
    success(result)
    assert result["labelSource"] == "app_db"
    for field, expected in (("codedReviews", coded), ("uncodedReviews", uncoded)):
        value = result[field]
        if isinstance(value, dict):
            assert all(type(n) is int and n >= 0 for n in value.values())
            value = sum(value.values())
        assert type(value) is int and value == expected, (field, value, expected)


def theme_numbers(result):
    success(result)
    rows = result["rows"]
    numbers = {(r["platform"], r["theme_code"], r["polarity"]): r["reviews"] for r in rows}
    assert len(numbers) == len(rows), "duplicate theme count row"
    return numbers


def star_rows(result):
    """Normalize only envelope choices absent from COMMON-Z; keep actual rows/IDs."""
    success(result)
    rows = result.get("rows", [])
    def total(row):
        return row.get("product_key") is None and row.get("product", "all") == "all"
    platforms = result.get("by_platform", [r for r in rows if total(r)])
    products = result.get("by_product", [r for r in rows if not total(r)])
    assert platforms and products, "star counts must expose both platform and product rows"
    return platforms, products


def star_numbers(rows, products=None):
    numbers = {}
    for row in rows:
        sentiment = row["star_sentiment"]
        # COMMON-Z names the two sentiments but leaves the no-star token open.
        if sentiment in (None, "no_star", "khong_sao", "khong_co_sao"):
            sentiment = None
        assert sentiment in ("tich_cuc", "tieu_cuc", None)
        assert type(row["reviews"]) is int and row["reviews"] >= 0
        if products is None:
            key = (row["platform"], sentiment)
        else:
            product = row.get("product_key") or row["product_name"]
            key = (row["platform"], products[product], sentiment)
        assert key not in numbers, "duplicate star count row"
        numbers[key] = row["reviews"]
    return {key: count for key, count in numbers.items() if count}


@contextmanager
def unchanged_app(box):
    """Check bytes/writes and forbid even plain reads of the live DB/WAL/SHM."""
    before = {str(p.relative_to(box.app)): p.read_bytes() for p in box.app.rglob("*") if p.is_file()}
    start = len(box.guard.events)
    box.guard.strict = True
    try:
        yield
    finally:
        box.guard.strict = False
        events = box.guard.events[start:]
        after = {str(p.relative_to(box.app)): p.read_bytes() for p in box.app.rglob("*") if p.is_file()}
        assert after == before, "MCP changed the synthetic app home"
        live_files = {box.db, Path(str(box.db) + "-wal"), Path(str(box.db) + "-shm")}
        for event, args in events:
            if event == "open" and isinstance(args[0], (str, bytes, Path)):
                assert Path(os.fsdecode(args[0])).resolve() not in live_files, "MCP opened a live app DB file"
            if event == "sqlite3.connect":
                database = str(args[0]).removeprefix("file:").split("?")[0]
                path = Path(urllib.parse.unquote(database)).resolve()
                assert not path.is_relative_to(box.app), "MCP opened SQLite in the app home"

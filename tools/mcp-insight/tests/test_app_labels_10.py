"""R-RV01/R-RV07: codebook compatibility and uncoded post-deploy snapshots, offline only."""

import json
from contextlib import closing

import pytest

from app_labels_support import AT, AppLabels, app_key, coverage, full_text, success
from insight_test_support import REPO, error, review, sha


NEW_BOOK = REPO / "tests" / "fixtures" / "review-labels-10-codebook.json"
OLD_BOOK = REPO / "tools" / "mcp-insight" / "tests" / "fixtures" / "reference-codebook.json"
OLD_VERSION = "2026-10-30.4"


def use_app_book(subject, sandbox, monkeypatch, source=NEW_BOOK):
    """Reuse the app/snapshot harness while pinning independent contract bytes."""
    definition = source.read_bytes()
    target = sandbox.root / "active-codebook.json"
    target.write_bytes(definition)
    monkeypatch.setattr(subject, "CODEBOOK_PATH", target)
    app = AppLabels(sandbox)
    app.definition = definition
    app.book = json.loads(definition)
    app.version = app.book["version"]
    return app


@pytest.fixture
def app_labels_10(subject, sandbox, monkeypatch):
    return use_app_book(subject, sandbox, monkeypatch)


@pytest.mark.parametrize("source", [OLD_BOOK, NEW_BOOK], ids=["old-four-options", "new-per-theme-options"])
def test_r_rv07_mcp_accepts_old_and_new_codebook_shapes(subject, sandbox, monkeypatch, source):
    """NC: a fixed four-option check rejects the new file; requiring only new keys rejects the old file."""
    app = use_app_book(subject, sandbox, monkeypatch, source)
    row = review(710)
    app.codebook()
    app.seed([row])
    app.label(row, block=None)
    success(sandbox.call("build_warehouse"))
    coverage(sandbox.call("theme_counts"), 1, 0)


@pytest.mark.parametrize("code", ["T-GIAOHANG", "T-DONGGOI", "T-DICHVU"])
def test_r_rv01_mcp_still_rejects_logistics_in_the_new_shape(app_labels_10, sandbox, subject, code):
    """NC: accepting arbitrary new option sets must not bypass the excluded-code guard."""
    app = app_labels_10
    book = json.loads(app.definition)
    next(theme for theme in book["core"] if theme["code"] == "T-GIA")["code"] = code
    subject.CODEBOOK_PATH.write_text(json.dumps(book, ensure_ascii=False), encoding="utf-8")
    app.seed([review(711)])
    error(sandbox.call("build_warehouse"), "CODEBOOK_EXCLUDED_THEME")


@pytest.mark.parametrize("location", ["options", "theme_options"])
def test_r_rv07_option_lists_still_require_khong_nhac(app_labels_10, sandbox, subject, location):
    """NC: dropping the fixed four-option check cannot turn it into accepting any option list."""
    book = json.loads(app_labels_10.definition)
    holder = book if location == "options" else book["core"][1]
    holder["options"] = [option for option in holder["options"] if option["key"] != "KHONG_NHAC"]
    subject.CODEBOOK_PATH.write_text(json.dumps(book, ensure_ascii=False), encoding="utf-8")
    app_labels_10.seed([review(712)])
    error(sandbox.call("build_warehouse"), "CODEBOOK_INVALID")


@pytest.mark.parametrize("legacy_rows", [False, True], ids=["empty-codebook-table", "old-version-only"])
def test_r_rv07_missing_current_book_and_labels_is_uncoded(app_labels_10, sandbox, legacy_rows):
    """NC: the former unconditional missing-row mismatch rejects this valid post-deploy snapshot."""
    app = app_labels_10
    row = review(713)
    app.seed([row])
    if legacy_rows:
        # A real old-shaped definition and old labels remain in the snapshot.
        old_bytes = OLD_BOOK.read_bytes()
        old = json.loads(old_bytes)
        with closing(app.connect()) as db, db:
            db.execute("INSERT INTO codebook VALUES (?,?,?,?,?,?,?,?)", (
                OLD_VERSION, old["contractVersion"], old["status"], old["approvedBy"], old["approvedAt"],
                old_bytes.decode(), sha(old_bytes), AT,
            ))
        app.label(row, version=OLD_VERSION)
    success(sandbox.call("build_warehouse"))
    counts = success(sandbox.call("theme_counts"))
    coverage(counts, 0, 1)
    assert counts["rows"] == []
    assert sandbox.rows("label") == []
    assert "chưa gán nhãn" in json.dumps(counts, ensure_ascii=False).lower()


@pytest.mark.parametrize("digest", ["0" * 64, ""], ids=["differing-sha", "missing-sha"])
def test_r_rv07_existing_current_book_with_bad_sha_fails_even_without_labels(app_labels_10, sandbox, digest):
    """NC: guarding identity checks only by review_code presence silently accepts this mismatched row."""
    app = app_labels_10
    app.codebook(digest=digest)
    app.seed([review(714)])
    error(sandbox.call("build_warehouse"), "APP_CODEBOOK_MISMATCH")


def test_r_rv07_current_labels_without_their_codebook_row_still_fail(app_labels_10, sandbox):
    """NC: returning uncoded for every missing book would conceal orphan current-version labels."""
    app = app_labels_10
    row = review(715)
    app.seed([row])
    # Deliberately incomplete synthetic snapshot. Disable only the fixture's FK
    # enforcement so this trust-boundary input can exist; no app trigger is changed.
    with closing(app.connect()) as db, db:
        db.execute("PRAGMA foreign_keys=OFF")
        db.execute("""INSERT INTO review_code(review_key,codebook_version,theme_code,block_key,polarity,
            journey_step,status,confidence,coder,text_sha256,coded_at,origin,import_sha256)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)""", (
                app_key(row), app.version, "T-GIA", None, "khen", "Sau mua", "kept", 0.94,
                "synthetic-app-coder", sha(full_text(row)), AT, "MCP_IMPORT", "a" * 64,
            ))
    error(sandbox.call("build_warehouse"), "APP_CODEBOOK_MISMATCH")


def test_r_rv05_high_confidence_wait_row_is_coded_but_never_counted(app_labels_10, sandbox):
    """NC: counting by confidence instead of status turns this 0.90 wait row into a result."""
    app = app_labels_10
    row = review(716)
    app.codebook()
    app.seed([row])
    # MCP deliberately does not read choice in this revision; the persisted
    # status and confidence are enough to exercise the new wait-row count risk.
    app.label(row, "T-CONGDUNG", block=None, status="unclear", polarity="khong_ro_huong", confidence=0.90)
    success(sandbox.call("build_warehouse"))
    counts = success(sandbox.call("theme_counts"))
    coverage(counts, 1, 0)
    assert counts["rows"] == []

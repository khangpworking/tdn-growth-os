"""COMMON-Z2 contract owners: A proof exception and the published-snapshot consumer.

Only synthetic app data; the app publisher is modelled with SQLite backup and
atomic rename. No assertion calls a private implementation helper. Snapshot
metadata may be nested; publishedAt is UTC ISO text or epoch seconds, and age
is a numeric number of seconds (ageSeconds, age_seconds or age).
"""

import builtins
import io
import os
import sqlite3
import time
import urllib.parse
from contextlib import closing
from datetime import datetime
from pathlib import Path

import pytest

from app_labels_support import (
    AppLabels, coverage, full_text, success, theme_numbers, unchanged_app,
)
from insight_test_support import canonical, error, review, sha


@pytest.fixture
def app(subject, sandbox, monkeypatch):
    monkeypatch.setenv("INSIGHT_MCP_APP_DB_SNAPSHOT",
                       str(sandbox.app / "app-db-snapshot" / "app-db.snapshot.sqlite"))
    return AppLabels(sandbox, app_jev=True)


def publish(box, target=None):
    """Fixture publisher, outside any MCP tool call; never copies a live WAL."""
    target = target or box.app / "app-db-snapshot" / "app-db.snapshot.sqlite"
    target.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    pending = target.with_suffix(".pending")
    with closing(sqlite3.connect(box.db)) as source, closing(sqlite3.connect(pending)) as output:
        source.backup(output)
    pending.chmod(0o600)
    pending.replace(target)
    return target


def legacy_input_hash(row, version, product_name=None):
    # Historical MCP coding-input format, independently assembled from fixture
    # values. This hash is deliberately different from the whole-text proof.
    return sha(canonical(dict(text=full_text(row), platform=row["platform"],
                              product_name=product_name, block_key="thuc_pham", codebook_version=version)))


def test_z2_a_only_imported_no_theme_bypasses_whole_text_proof(app, sandbox):
    """NC: exempting all NO_THEME, rejecting legacy imports, or retaining a partial group changes coverage."""
    rows = [review(i, attributes=[f"Công dụng: zqvz2attr{i} 🧪"]) for i in range(201, 208)]
    app.codebook()
    app.seed(rows)
    app.label(rows[0], "NO_THEME", digest=legacy_input_hash(rows[0], app.version, "Sản phẩm lúc mã hóa"))
    app.label(rows[1], digest=sha(rows[1]["text"]))
    app.label(rows[1], "T-VI")  # One good theme must not rescue a failing review group.
    app.label(rows[2], origin="APP_JEV", digest=sha(rows[2]["text"]))
    app.label(rows[3], "NO_THEME", origin="APP_JEV", digest=legacy_input_hash(rows[3], app.version))
    app.label(rows[4], "NO_THEME", origin="APP_JEV")
    app.label(rows[5], origin="APP_JEV")
    app.label(rows[6])
    publish(sandbox)

    built = success(sandbox.call("build_warehouse"))
    assert built["labels"]["labelTextMismatch"] == 3
    assert {r["review_id"] for r in sandbox.rows("v_coded_review")} == {
        "shopee:201", "shopee:205", "shopee:206", "shopee:207",
    }
    counts = sandbox.call("theme_counts")
    coverage(counts, 4, 3)
    assert theme_numbers(counts) == {
        ("shopee", "T-GIA", "all"): 2, ("shopee", "T-GIA", "khen"): 2,
    }


def test_z2_snapshot_is_authoritative_and_live_home_is_never_opened(app, sandbox, monkeypatch):
    """NC: copying/opening the live DB or WAL cannot resolve this published-only run."""
    app.codebook()
    rows = [review(211)]
    app.seed(rows)
    app.label(rows[0])
    publish(sandbox)
    keeper = app.connect()
    try:
        assert keeper.execute("PRAGMA journal_mode=WAL").fetchone() == ("wal",)
        keeper.execute("DELETE FROM analysis_research_automation_runs")
        keeper.commit()
        assert Path(str(sandbox.db) + "-wal").stat().st_size > 0
        with unchanged_app(sandbox):
            built = success(sandbox.call("build_warehouse"))
            assert built["reviews_by_platform"]["shopee"] == 1
            coverage(sandbox.call("theme_counts"), 1, 0)
            for tool in ("star_counts", "keyword_counts", "portrait_counts", "report_plan"):
                success(sandbox.call(tool))
        # APP_DB locates the home; it need not name an existing live DB file.
        monkeypatch.setenv("INSIGHT_MCP_APP_DB", str(sandbox.app / "home-anchor-only.sqlite"))
        with unchanged_app(sandbox):
            success(sandbox.call("build_warehouse"))
    finally:
        keeper.close()


@pytest.mark.parametrize("configured", [False, True], ids=["unset", "absent-file"])
def test_z2_missing_snapshot_is_an_explicit_error_without_live_fallback(app, sandbox, monkeypatch, configured):
    """NC: a successful live-DB fallback hides the missing published snapshot."""
    app.codebook()
    app.seed([review(221)])
    if not configured:
        monkeypatch.delenv("INSIGHT_MCP_APP_DB_SNAPSHOT")
    result = sandbox.call("build_warehouse")
    error(result, "APP_DB_SNAPSHOT_MISSING")
    assert "app chưa xuất bản sao sạch" in str(result).lower()
    assert not sandbox.warehouse.exists()
    assert not list(sandbox.tmp.iterdir())


@pytest.mark.parametrize("damage", ["header", "btree"])
def test_z2_snapshot_validation_rejects_bad_header_and_failed_quick_check(app, sandbox, damage):
    """NC: checking only a header, skipping quick_check, or falling back to live data accepts corruption."""
    app.codebook()
    app.seed([review(231)])
    with closing(app.connect()) as db, db:
        db.execute("CREATE TABLE synthetic_integrity_probe(value TEXT)")
        db.execute("INSERT INTO synthetic_integrity_probe VALUES ('synthetic-committed')")
        page_size = db.execute("PRAGMA page_size").fetchone()[0]
        page = db.execute("SELECT rootpage FROM sqlite_master WHERE name='synthetic_integrity_probe'").fetchone()[0]
    snapshot = publish(sandbox)
    data = bytearray(snapshot.read_bytes())
    if damage == "header":
        data[:16] = b"not a sqlite db!\x00"
    else:
        data[(page - 1) * page_size] = 0xFF  # Invalid B-tree page type; schema and used tables remain intact.
    snapshot.write_bytes(data)
    if damage == "btree":
        assert data[:16] == b"SQLite format 3\x00"
        # Independent fixture sanity: this is specifically an integrity failure,
        # not an absent file or a malformed SQLite header.
        with closing(sqlite3.connect(snapshot)) as db:
            try:
                check = db.execute("PRAGMA quick_check").fetchall()
            except sqlite3.DatabaseError:
                check = []
            assert check != [("ok",)]
    result = sandbox.call("build_warehouse")
    assert "error" in result, result
    assert not sandbox.warehouse.exists()
    assert not list(sandbox.tmp.iterdir())


def freshness(result):
    """Locate contract metadata without pinning an otherwise unspecified envelope."""
    if isinstance(result, dict):
        if "publishedAt" in result:
            published = result["publishedAt"]
            at = (float(published) if isinstance(published, (int, float))
                  else datetime.fromisoformat(published.replace("Z", "+00:00")).timestamp())
            ages = [result[k] for k in ("ageSeconds", "age_seconds", "age") if k in result]
            assert len(ages) == 1 and type(ages[0]) in (int, float), result
            return at, ages[0]
        for value in result.values():
            found = freshness(value)
            if found is not None:
                return found
    return None


def test_z2_one_descriptor_survives_atomic_replace_and_binds_freshness_to_private_copy(
    app, sandbox, monkeypatch,
):
    """NC: reopening the source, statting the new pathname, or reading SQLite in place mixes generations."""
    app.codebook()
    first, second = review(241), review(242)
    app.seed([first])
    snapshot = publish(sandbox)
    first_bytes = snapshot.read_bytes()
    first_mtime = int(time.time()) - 300
    os.utime(snapshot, (first_mtime, first_mtime))
    # Prepare the app's next complete generation before the MCP starts reading.
    sandbox.replace_sources([first, second])
    app.add_review(second)
    replacement = publish(sandbox, sandbox.app / "next-generation.sqlite")
    second_mtime = first_mtime + 120
    os.utime(replacement, (second_mtime, second_mtime))
    reads, copies, capture_paths = [], [], []
    connect = sqlite3.connect

    def watched_open(opener):
        def opening(path, *args, **kwargs):
            handle = opener(path, *args, **kwargs)
            if isinstance(path, (str, bytes, Path)) and Path(os.fsdecode(path)).resolve() == snapshot:
                reads.append(path)
                if replacement.exists():
                    replacement.replace(snapshot)  # The opened descriptor must keep generation one.
            return handle
        return opening

    def checked_connect(database, *args, **kwargs):
        path = Path(urllib.parse.unquote(str(database).removeprefix("file:").split("?")[0])).resolve()
        assert not path.is_relative_to(sandbox.app), "SQLite opened the published or live app DB in place"
        if path.is_relative_to(sandbox.tmp):
            assert path.parent.stat().st_mode & 0o077 == 0, "snapshot temp directory is not private"
            copies.append((path, path.read_bytes()))
        return connect(database, *args, **kwargs)

    monkeypatch.setattr(builtins, "open", watched_open(builtins.open))
    monkeypatch.setattr(io, "open", watched_open(io.open))
    monkeypatch.setattr(os, "open", watched_open(os.open))
    monkeypatch.setattr(sqlite3, "connect", checked_connect)
    for expected_count, expected_mtime in ((1, first_mtime), (2, second_mtime)):
        copy_start = len(copies)
        before = time.time()
        result = success(sandbox.call("build_warehouse"))
        after = time.time()
        assert result["reviews_by_platform"]["shopee"] == expected_count
        assert len(reads) == expected_count, "published snapshot was reopened within one capture"
        metadata = freshness(result)
        assert metadata is not None, "snapshot publishedAt and age are missing"
        published_at, age = metadata
        assert published_at == expected_mtime
        assert before - expected_mtime - 1 <= age <= after - expected_mtime + 1
        captured = copies[copy_start:]
        assert captured, "SQLite never read a private snapshot copy"
        assert all(not path.exists() for path, _ in captured), "per-call snapshot copy was not cleaned up"
        capture_paths.append({path.parent for path, _ in captured})
        if expected_count == 1:
            assert all(data == first_bytes for _, data in captured)
    assert capture_paths[0].isdisjoint(capture_paths[1]), "snapshot captures reused a temp directory"
    assert not list(sandbox.tmp.iterdir())

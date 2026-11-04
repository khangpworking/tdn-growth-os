"""COMMON-Z contract owners Z1–Z8; no MCP theme coding or fake successful counts.

Run: PYTHONDONTWRITEBYTECODE=1 python -m pytest tools/mcp-insight/tests/test_app_labels.py -q -p no:cacheprovider
The production read path is intentionally absent on the authoring baseline.
"""

import json
import sqlite3
from contextlib import closing

import pytest

from app_labels_support import (
    AppLabels, OTHER_VERSION, app_product, coverage, full_text, review_id,
    star_numbers, star_rows, success, theme_numbers, unchanged_app,
)
from insight_test_support import OTHER, RUN, error, review, sha, sync


@pytest.fixture
def app_labels(subject, sandbox):
    return AppLabels(sandbox)


def test_im_q174_product_keys_match_db_v1(app_labels, sandbox):
    """NC: the old Shopee shop-qualified key fails; an old listing lookup loses the public name."""
    app = app_labels
    app.codebook()
    rows = [review(271, product=901), review(272, product=901, platform="tiktok_shop")]
    app.seed(rows)
    for row in rows:
        app.label(row)
    sandbox.metric_products({"901": "Sản phẩm thử 901"})
    success(sandbox.call("build_warehouse"))

    expected = {"shopee:901", "tiktok_shop:901"}
    assert {r["product_key"] for r in sandbox.rows("review")} == expected
    assert {r["product_key"] for r in sandbox.rows("product")} == expected
    with closing(app.connect()) as db:
        assert {key for key, in db.execute("SELECT product_key FROM product")} == expected
    _, products = star_rows(sandbox.call("star_counts"))
    assert {(r["platform"], r["product_name"], r["reviews"]) for r in products} == {
        ("shopee", "Sản phẩm thử 901", 1), ("tiktok_shop", "Sản phẩm thử 901", 1),
    }


def test_z1_app_labels_are_projected_and_no_theme_is_coded(app_labels, sandbox):
    """NC: recoding, dropping unclear/NO_THEME, merging platforms or changing spans changes this hand count."""
    app = app_labels
    rows = [
        review(11, text="zqvz1a tiếng Việt e\u0301 🧪", attributes=["Công dụng: mẫu thử", "Hương vị: zqvz1attr"]),
        review(12), review(13), review(14),
        review(11, platform="tiktok_shop", text="zqvz1tt mẫu đối chứng"),
    ]
    app.codebook()
    app.seed(rows)
    app.label(rows[0])
    app.label(rows[0], "T-VI", polarity="ke", confidence=0.82)
    app.label(rows[1], polarity="che", confidence=0.83)
    app.label(rows[2], status="unclear", polarity="khong_ro_huong", confidence=0.49, step="Quan tâm")
    app.label(rows[3], "NO_THEME")
    app.label(rows[4], polarity="ke", confidence=0.87)
    success(sandbox.call("build_warehouse"))

    labels = sandbox.rows("label")
    assert {(r["review_id"], r["theme_code"], r["p_yes"], r["polarity"], r["status"], r["step"]) for r in labels} == {
        ("shopee:11", "T-GIA", 0.94, "khen", "kept", "Sau mua"),
        ("shopee:11", "T-VI", 0.82, "ke", "kept", "Sau mua"),
        ("shopee:12", "T-GIA", 0.83, "che", "kept", "Sau mua"),
        ("shopee:13", "T-GIA", 0.49, "khong_ro_huong", "unclear", "Quan tâm"),
        ("tiktok_shop:11", "T-GIA", 0.87, "ke", "kept", "Sau mua"),
    }
    assert len(labels) == 5
    texts = {review_id(r): full_text(r) for r in rows}
    for label in labels:
        assert (label["codebook_version"], label["block_key"], label["block_norm"]) == (
            app.version, "thuc_pham", "thuc_pham")
        text = texts[label["review_id"]]
        assert (label["text_ref"], label["text_start"], label["text_end"], label["text_sha256"]) == (
            label["review_id"], 0, len(text), sha(text))
        assert "MCP_IMPORT" in label["note"] and "synthetic-app-coder" in label["note"]
    targets = sandbox.rows("coding_target")
    assert len(targets) == 1
    assert (targets[0]["codebook_version"], targets[0]["block_key"], targets[0]["match_basis"]) == (
        app.version, "thuc_pham", "app_db")
    assert sandbox.sql("""SELECT s.review_id FROM coding_state s JOIN review_input i
        ON i.review_id=s.review_id AND i.codebook_version=s.codebook_version AND i.block_norm=s.block_norm
        AND i.input_sha256=s.input_sha256 WHERE s.status='done' ORDER BY s.review_id""") == [
            ("shopee:11",), ("shopee:12",), ("shopee:13",), ("shopee:14",), ("tiktok_shop:11",)]
    assert {r["review_id"] for r in sandbox.rows("v_coded_review")} == set(texts)
    counts = sandbox.call("theme_counts")
    coverage(counts, 5, 0)
    assert theme_numbers(counts) == {
        ("shopee", "T-GIA", "all"): 2, ("shopee", "T-GIA", "khen"): 1,
        ("shopee", "T-GIA", "che"): 1, ("shopee", "T-VI", "all"): 1,
        ("shopee", "T-VI", "ke"): 1, ("tiktok_shop", "T-GIA", "all"): 1,
        ("tiktok_shop", "T-GIA", "ke"): 1,
    }


@pytest.mark.parametrize("codebook_state", ["missing", "different_sha"])
def test_z2_repo_codebook_identity_is_required(app_labels, sandbox, codebook_state):
    """NC: trusting the version string alone accepts an absent or byte-different app codebook."""
    app = app_labels
    app.seed([review(20)])
    if codebook_state == "different_sha":
        app.codebook(digest="0" * 64)
    else:
        # IM-Q175: a missing row is only a mismatch when labels of the version exist; plant one past the foreign key.
        app.connect = lambda: sqlite3.connect(sandbox.db)
    app.label(sandbox.reviews[0])
    error(sandbox.call("build_warehouse"), "APP_CODEBOOK_MISMATCH")


def test_z3_text_proof_rejects_stale_app_labels(app_labels, sandbox):
    """NC: importing without text proof exposes shopee:22; hashing only comment also fails."""
    app = app_labels
    rows = [review(21), review(22, attributes=["Công dụng: zqvz3attr 🧪"])]
    app.codebook()
    app.seed(rows)
    app.label(rows[0])
    # The comment hash is stale: the warehouse text includes the attribute.
    app.label(rows[1], digest=sha(rows[1]["text"]))
    built = success(sandbox.call("build_warehouse"))
    assert {r["review_id"] for r in sandbox.rows("label")} == {"shopee:21"}
    assert {r["review_id"] for r in sandbox.rows("coding_state")} == {"shopee:21"}
    assert built["labels"]["labelTextMismatch"] == 1
    counts = sandbox.call("theme_counts")
    coverage(counts, 1, 1)
    assert theme_numbers(counts) == {
        ("shopee", "T-GIA", "all"): 1, ("shopee", "T-GIA", "khen"): 1,
    }


@pytest.mark.parametrize("labels_present", [True, False])
def test_z4_unmatched_reviews_stay_uncoded_and_empty_run_is_explicit(app_labels, sandbox, labels_present):
    """NC: fallback MCP labels or treating missing labels as done changes the denominator/empty result."""
    app = app_labels
    rows = [review(31), review(32)]
    app.codebook()
    # Row 32 has warehouse evidence but no matching app review at all.
    app.seed(rows, app_rows=rows[:1])
    if labels_present:
        app.label(rows[0])
    success(sandbox.call("build_warehouse"))
    assert {r["review_id"] for r in sandbox.rows("coding_state")} == ({"shopee:31"} if labels_present else set())
    counts = success(sandbox.call("theme_counts"))
    coverage(counts, int(labels_present), 2 - int(labels_present))
    if not labels_present:
        assert counts["rows"] == []
        assert "chưa gán nhãn" in json.dumps(counts, ensure_ascii=False).lower()


@pytest.mark.parametrize("paid", [False, True])
@pytest.mark.parametrize("dry_run", [True, False])
def test_z5_code_reviews_refuses_without_any_socket_or_key_read(app_labels, sandbox, monkeypatch, paid, dry_run):
    """NC: retaining either the dry-run coding path or paid Jev path cannot return LABELS_FROM_APP offline."""
    app_labels.codebook()
    app_labels.seed([review(41)])
    success(sandbox.call("build_warehouse"))
    if paid:
        monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", "1")
    else:
        monkeypatch.delenv("INSIGHT_MCP_ALLOW_PAID", raising=False)
    # A valid synthetic key makes an accidentally retained paid path reach the
    # audit boundary; the guard blocks network attempts even if caught by a tool.
    sandbox.key.write_text("TYPESAFE_API_KEY=synthetic-z-unused\n")
    start = len(sandbox.guard.events)
    result = sandbox.call("code_reviews", dry_run=dry_run, max_calls=1)
    events = sandbox.guard.events[start:]
    assert not [event for event, _ in events if event.startswith("socket.")], "code_reviews opened a socket"
    assert not [args for event, args in events if event == "open" and str(args[0]) == str(sandbox.key)]
    error(result, "LABELS_FROM_APP")


def test_z6_star_counts_use_app_view_per_platform_and_product_and_are_citable(app_labels, sandbox, subject):
    """NC: 3 stars as positive, source ratings, off-run rows, platform pooling or unregistered IDs fail."""
    app = app_labels
    # Source artifacts deliberately say five stars for every review. The app
    # view is authoritative for stars, with collisions in external/product IDs.
    sources = [review(i, product=str(101 + (i - 1) // 2)) for i in range(1, 7)] + [
        review(i, platform="tiktok_shop", product="101" if i == 1 else "102") for i in range(1, 5)]
    app_rows = [dict(r, rating=rating) for r, rating in zip(sources, [1, 2, 3, 4, 5, None, 3, 4, 5, None])]
    app.codebook()
    app.seed(sources + [review(888)], app_rows=app_rows)
    app.add_review(review(999, product="101"))  # app row outside this run's warehouse
    # Shopee listing names come from Metric; star rows name products, never keys.
    sandbox.metric_products({p: "Sản phẩm thử " + p for p in ("101", "102", "103")})
    success(sandbox.call("build_warehouse"))
    # Exercise the registered tool through the existing FastMCP transport.
    blocks = sync(subject.mcp.call_tool("star_counts", {"run_id": RUN}))
    result = json.loads(next(block.text for block in blocks if block.type == "text"))
    sandbox.public_results.append(result)
    platform_rows, product_rows = star_rows(result)
    assert star_numbers(platform_rows) == {
        ("shopee", "tieu_cuc"): 3, ("shopee", "tich_cuc"): 2, ("shopee", None): 1,
        ("tiktok_shop", "tieu_cuc"): 1, ("tiktok_shop", "tich_cuc"): 2, ("tiktok_shop", None): 1,
    }
    products = {key: r["product"] for r in app_rows
                for key in (app_product(r), "Sản phẩm thử " + r["product"])}
    assert star_numbers(product_rows, products) == {
        ("shopee", "101", "tieu_cuc"): 2,
        ("shopee", "102", "tieu_cuc"): 1, ("shopee", "102", "tich_cuc"): 1,
        ("shopee", "103", "tich_cuc"): 1, ("shopee", "103", None): 1,
        ("tiktok_shop", "101", "tieu_cuc"): 1,
        ("tiktok_shop", "102", "tich_cuc"): 2, ("tiktok_shop", "102", None): 1,
    }
    registry = {r["count_id"]: r for r in sandbox.rows("count_registry")}
    all_rows = platform_rows + product_rows
    assert len({r["count_id"] for r in all_rows}) == len(all_rows)
    for row in all_rows:
        stored = registry[row["count_id"]]
        assert stored["tool"] == "star_counts"
        assert json.loads(stored["numbers_json"])["reviews"] == row["reviews"]
    cited = next(r for r in platform_rows if r["platform"] == "shopee" and r["star_sentiment"] == "tieu_cuc")
    section = success(sandbox.call("submit_section", part=13,
        text="Có 3 đánh giá theo số sao sau mua, dưới ngưỡng [^c1].", claims=[dict(
            ref="c1", evidence=[dict(count_id=cited["count_id"], part=None)],
            confidence="Yếu", step="Sau mua", hypothesis=False, conclusion=False,
        )]))
    assert section["accepted"] is True, section


@pytest.mark.parametrize("scenario", ["success", "unknown_run", "codebook_mismatch"])
def test_z7_app_home_is_byte_identical_on_success_and_errors(app_labels, sandbox, scenario):
    """NC: a live SQLite WAL read or even an attempted app write violates the byte/audit boundary."""
    app = app_labels
    app.codebook(digest="0" * 64 if scenario == "codebook_mismatch" else None)
    app.seed([review(51)])
    app.label(sandbox.reviews[0])
    # Keep an uncheckpointed WAL and SHM alive. Opening the live DB with SQLite
    # instead of the byte snapshot can alter SHM even in mode=ro.
    keeper = app.connect()
    try:
        assert keeper.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        keeper.execute("""INSERT INTO raw_capture
            (capture_id,source_code,provider,operation,requested_at,outcome)
            VALUES ('synthetic-wal','S05','synthetic','fixture','2026-11-03T00:00:00Z','OK')""")
        keeper.commit()
        assert (sandbox.app / "app.sqlite-wal").stat().st_size > 0
        with unchanged_app(sandbox):
            built = sandbox.call("build_warehouse")
        if scenario == "codebook_mismatch":
            assert "error" in built
            return
        else:
            success(built)
        run_id = OTHER if scenario == "unknown_run" else RUN
        for tool in ("build_warehouse", "theme_counts", "star_counts", "code_reviews"):
            with unchanged_app(sandbox):
                result = sandbox.call(tool, run_id)
            if scenario == "success" and tool != "code_reviews":
                success(result)
            else:
                assert "error" in result
    finally:
        keeper.close()


def test_z8_rebuild_follows_new_app_rows_and_ignores_other_versions(app_labels, sandbox):
    """NC: keeping a stale label projection or importing all versions changes these literal totals."""
    app = app_labels
    rows = [review(i) for i in range(61, 65)]
    app.codebook()
    app.codebook(version=OTHER_VERSION)
    app.seed(rows)
    app.label(rows[0])
    app.label(rows[1], version=OTHER_VERSION)
    app.label(rows[3], "NO_THEME", version=OTHER_VERSION)
    success(sandbox.call("build_warehouse"))
    before = sandbox.call("theme_counts")
    coverage(before, 1, 3)
    assert theme_numbers(before) == {
        ("shopee", "T-GIA", "all"): 1, ("shopee", "T-GIA", "khen"): 1,
    }
    app.label(rows[2])  # new app label, unchanged source artifacts
    for _ in range(2):
        success(sandbox.call("build_warehouse"))
        after = sandbox.call("theme_counts")
        coverage(after, 2, 2)
        assert theme_numbers(after) == {
            ("shopee", "T-GIA", "all"): 2, ("shopee", "T-GIA", "khen"): 2,
        }
        assert {r["review_id"] for r in sandbox.rows("coding_state")} == {"shopee:61", "shopee:63"}
        assert {r["codebook_version"] for r in sandbox.rows("label")} == {app.version}

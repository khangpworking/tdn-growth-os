"""R-IM02: source selection and isolated, reproducible warehouse projection."""

import copy
import json
import sqlite3
import unicodedata

import pytest

from insight_test_support import (
    AMBIGUOUS, NO_DATA, OTHER, RUN, error, label_all, no_leak, review,
    scope_record, sha,
)


def test_im_q7_full_uuid_unique_prefix_and_ambiguous_prefix(subject, sandbox):
    """NC: the same prefix resolving to two runs creates no warehouse."""
    sandbox.seed()
    assert "error" not in sandbox.call("build_warehouse", RUN)
    assert "error" not in sandbox.call("build_warehouse", RUN[:8])
    sandbox.warehouse.unlink()
    sandbox.seed([], run_id=AMBIGUOUS)
    error(sandbox.call("build_warehouse", RUN[:8]), "RUN_AMBIGUOUS")
    error(sandbox.call("build_warehouse", OTHER), "RUN_NOT_FOUND")
    assert list((sandbox.data / "runs").glob("*.sqlite")) == []


def test_im_q8_stored_sources_are_scoped_and_missing_is_not_zero(subject, sandbox):
    """NC: foreign run captures cannot leak; an absent platform is not 0."""
    sandbox.seed([review(1)], keywords=["canxi cho bé", "cách uống kẽm"],
                 trends=[{"location": "Tỉnh thử A", "extracted_value": 23}], scope=scope_record())
    sandbox.metric_products({"2": "Sản phẩm thử A"})
    sandbox.seed([review(900, platform="tiktok_shop", name="synthetic_foreign_writer")],
                 run_id=OTHER, keywords=["foreign synthetic keyword"])
    result = sandbox.call("build_warehouse")
    assert "error" not in result
    assert result["reviews_by_platform"] == {"shopee": 1, "tiktok_shop": NO_DATA}
    assert result["sources"]["keywords"] == 2
    assert result["sources"]["trends"] == 1
    assert {r["review_id"] for r in sandbox.rows("review")} == {"shopee:1"}
    assert {r["keyword"] for r in sandbox.rows("keyword")} == {"canxi cho bé", "cách uống kẽm"}
    assert len(sandbox.rows("trend")) == 1
    products = sandbox.rows("product")
    assert any(r["product_name"] == "Sản phẩm thử A" for r in products)
    facts = sandbox.rows("run_facts")[0]
    assert facts["keyword"] == "canxi" and facts["created_at"] == "2026-10-30T00:00:00Z"
    assert facts["category_evidence_label"] == "Làm Đẹp"
    assert facts["category_evidence_reason"] == "DOMINANT"
    assert "foreign synthetic keyword" not in "\n".join(sandbox.dump())


@pytest.mark.parametrize("available", [False, True])
def test_im_q8_unavailable_capture_is_not_observed_zero(subject, sandbox, available):
    """NC: successful empty responses are zero; failed responses have no data."""
    sandbox.seed([])
    sources = [
        ("kalodata", "kalodata.product.comment.insight", {}, {"data": {"original_comments": []}}),
        ("kalodata", "kalodata.product.detail", {}, {"data": {}}),
        ("serpapi", "serpapi.google.search", {}, {}),
        ("serpapi", "serpapi.google.trends", {"data_type": "GEO_MAP"}, {"interest_by_region": []}),
    ]
    for provider, operation, parameters, payload in sources:
        digest = sandbox.capture(RUN, provider, operation, payload, parameters)
        if not available:
            path = sandbox.artifacts / "sha256" / digest[:2] / digest
            envelope = json.loads(path.read_text())
            envelope.update(outcome="HTTP_ERROR", responseBytesBase64=None)
            replacement = sandbox.artifact(envelope)
            with sqlite3.connect(sandbox.db) as db:
                db.execute("UPDATE analysis_research_automation_captures SET artifact_sha256=? "
                           "WHERE artifact_sha256=?", (replacement, digest))
    result = sandbox.call("build_warehouse")
    expected = 0 if available else NO_DATA
    assert result["reviews_by_platform"]["tiktok_shop"] == expected
    for source in ("tiktok_shop_reviews", "tiktok_shop_product_names", "keywords", "trends"):
        assert result["sources"][source] == expected


@pytest.mark.parametrize("version", ["autorun-scope-record-v1", "autorun-scope-record-v2"])
@pytest.mark.parametrize("outcome,expected_category,expected_keywords", [
    ("AWAITING_KEYWORD2", None, ["canxi"]), ("PENDING", None, ["canxi"]),
    ("CATEGORY_NOT_SELECTABLE", None, ["canxi"]),
    ("OK", "Làm Đẹp", ["canxi", "sữa rửa mặt"]), (None, None, ["canxi"]),
])
def test_im_q8_scope_uses_only_applied_capture(subject, sandbox, version, outcome, expected_category, expected_keywords):
    """NC: non-null pending capture/category evidence must not activate scope 2."""
    scope = scope_record(outcome, version=version)
    if outcome is None:
        scope["capture2"] = None
    sandbox.seed(scope=scope)
    assert "error" not in sandbox.call("build_warehouse")
    facts = sandbox.rows("run_facts")[0]
    assert facts["applied_category"] == expected_category
    assert json.loads(facts["applied_keywords"]) == expected_keywords
    assert facts["category_evidence_label"] == "Làm Đẹp"


@pytest.mark.parametrize("kind", ["bad-json", "wrong-run", "wrong-version"])
def test_im_q8_invalid_scope_fails_without_creating_warehouse(subject, sandbox, kind):
    """NC: a present invalid scope must not silently fall back to run keyword."""
    sandbox.seed(scope=scope_record())
    path = sandbox.captures / RUN / "scope.json"
    if kind == "bad-json":
        path.write_text("{not json")
    else:
        value = json.loads(path.read_text())
        value["runId" if kind == "wrong-run" else "contractVersion"] = OTHER if kind == "wrong-run" else "unknown-v99"
        path.write_text(json.dumps(value))
    error(sandbox.call("build_warehouse"), "SCOPE_RECORD_INVALID")
    assert not sandbox.warehouse.exists()


def test_im_q9_writer_keys_are_normalized_hashed_and_unknown_when_masked(subject, sandbox):
    """NC: shared normalized names deduplicate, distinct/masked names do not."""
    rows = [review(1), review(2, platform="tiktok_shop", name="  SyNthÉtic  "),
            review(3, platform="tiktok_shop", name=unicodedata.normalize("NFD", "synthétic")),
            review(4, platform="tiktok_shop", name="synthetic_other"),
            review(5, platform="tiktok_shop", name="a*****b"),
            review(6, platform="tiktok_shop", name="synthetic_anonymous", anonymous=True)]
    sandbox.seed(rows)
    assert "error" not in sandbox.call("build_warehouse")
    actual = {r["review_id"]: r for r in sandbox.rows("review")}
    expected = "w:" + sha("synthétic")[:16]
    assert actual["tiktok_shop:2"]["writer_key"] == actual["tiktok_shop:3"]["writer_key"] == expected
    assert actual["tiktok_shop:4"]["writer_key"] != expected
    assert actual["tiktok_shop:2"]["writer_known"] == 1
    for key in ["shopee:1", "tiktok_shop:5", "tiktok_shop:6"]:
        assert actual[key]["writer_known"] == 0
        assert actual[key]["writer_key"] == key
    no_leak("\n".join(sandbox.dump()), [r["name"] for r in rows if r["name"]])


def scan_nontext_tables(box):
    with sqlite3.connect(box.warehouse) as db:
        objects = db.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%'").fetchall()
        for (table,) in objects:
            if table == "review_text":
                continue
            quoted = '"' + table.replace('"', '""') + '"'
            columns = {r[1].casefold() for r in db.execute("PRAGMA table_info(" + quoted + ")")}
            assert not columns & {"text", "comment", "name", "user", "attributes"}
            for row in db.execute("SELECT * FROM " + quoted):
                for cell in row:
                    if isinstance(cell, str):
                        no_leak(cell, box.sentinels())


def test_im_q10_review_text_is_confined_including_label_state_and_registry(subject, sandbox):
    """NC: a short comment inserted in a generic note is caught by cell scan."""
    sandbox.seed([review(7, text="zqv07 ok"), review(8, attributes=["zqvattr đối tượng sử dụng: trẻ em"])])
    assert "error" not in sandbox.call("build_warehouse")
    sandbox.code(label_all())
    sandbox.call("theme_counts")
    sandbox.call("portrait_counts")
    scan_nontext_tables(sandbox)
    texts = {r["review_id"]: r["text"] for r in sandbox.rows("review_text")}
    assert texts["shopee:7"] == "zqv07 ok"
    assert "zqvattr" in texts["shopee:8"]
    # Deliberate warehouse-only mutant; the production DB is never touched.
    sandbox.sql("CREATE TABLE synthetic_label_note(note TEXT)")
    sandbox.sql("INSERT INTO synthetic_label_note VALUES (?)", ("zqv07 ok",))
    with pytest.raises(AssertionError):
        scan_nontext_tables(sandbox)


def test_im_q11_same_source_id_on_two_platforms_remains_two_reviews(subject, sandbox):
    """NC: deduplicating by provider ID alone would collapse these two rows."""
    sandbox.seed([review(11), review(11, platform="tiktok_shop", name="synthetic_q11", text="zqv0011t mẫu thử")])
    assert "error" not in sandbox.call("build_warehouse")
    actual = {(r["review_id"], r["platform"]) for r in sandbox.rows("review")}
    assert actual == {("shopee:11", "shopee"), ("tiktok_shop:11", "tiktok_shop")}


def test_im_q12_shopee_pages_deduplicate_and_excluded_is_not_ingested(subject, sandbox):
    """NC: reading packet excluded[] or blindly concatenating pages gives >1."""
    sandbox.seed([review(12)])
    with sqlite3.connect(sandbox.db) as db:
        digest = db.execute("SELECT artifact_sha256 FROM foundation_shopee_collections").fetchone()[0]
        path = sandbox.artifacts / "sha256" / digest[:2] / digest
        packet = json.loads(path.read_text())
        packet["pages"].append(copy.deepcopy(packet["pages"][0]))
        packet["selected"][0]["excluded"] = [{"reviewId": "999998", "comment": "zqv9998 excluded"}]
        digest = sandbox.artifact(packet)
        db.execute("UPDATE foundation_shopee_collections SET artifact_sha256=?", (digest,))
    assert "error" not in sandbox.call("build_warehouse")
    assert [r["review_id"] for r in sandbox.rows("review")] == ["shopee:12"]


def test_im_q13_artifact_bytes_must_match_stored_digest(subject, sandbox):
    """NC: a valid JSON page with an altered rating cannot reuse its old digest."""
    sandbox.seed([review(1)])
    assert "error" not in sandbox.call("build_warehouse")
    with sqlite3.connect(sandbox.db) as db:
        digest = db.execute("SELECT artifact_sha256 FROM foundation_shopee_collections").fetchone()[0]
    packet = json.loads((sandbox.artifacts / "sha256" / digest[:2] / digest).read_text())
    page_digest = packet["pages"][0]["sha256"]
    page_path = sandbox.artifacts / "sha256" / page_digest[:2] / page_digest
    page = json.loads(page_path.read_text())
    page[0]["ratingStar"] = 1
    page_path.write_text(json.dumps(page, ensure_ascii=False))
    error(sandbox.call("build_warehouse"), "ARTIFACT_INVALID")


def test_im_q13_build_hash_is_deterministic_but_rating_sensitive(built):
    """NC: changing only a source rating changes content_sha256."""
    first = built.call("build_warehouse")["content_sha256"]
    assert built.call("build_warehouse")["content_sha256"] == first
    built.code(label_all())
    built.call("theme_counts")
    registry = built.rows("count_registry")
    labels = built.rows("label")
    assert built.call("build_warehouse")["content_sha256"] == first
    assert built.rows("count_registry") == registry
    assert built.rows("label") == labels
    changed = copy.deepcopy(built.reviews[:5])
    changed[0]["rating"] = 1
    built.replace_sources(changed)
    assert built.call("build_warehouse")["content_sha256"] != first
    assert built.rows("count_registry") == registry


@pytest.mark.parametrize("names", [[None, ""], [" ", "\t"], ["a*****b", None]])
def test_im_q41_missing_names_use_per_review_keys_and_no_guesses(subject, sandbox, names):
    """NC: hashing empty/blank names creates a shared key and false portraits."""
    sandbox.seed([review(i + 1, platform="tiktok_shop", name=n) for i, n in enumerate(names)])
    assert "error" not in sandbox.call("build_warehouse")
    rows = sandbox.rows("review")
    assert len({r["writer_key"] for r in rows}) == 2
    assert all(r["writer_known"] == 0 and r["writer_key"] == r["review_id"] for r in rows)
    assert sandbox.rows("writer_guess") == []
    result = sandbox.call("portrait_counts")
    assert result["demographics"]["tiktok_shop"] == {"Giới": NO_DATA, "Nhóm tuổi": NO_DATA}


def test_im_q41_absent_name_field_is_unknown(subject, sandbox):
    """NC: absent review_user.name is not a usable string or known writer."""
    sandbox.seed([])
    sandbox.capture(RUN, "kalodata", "kalodata.product.comment.insight", {"success": True, "data": {
        "product_id": "1", "original_comments": [{"review_user": {}, "review": {
            "review_id": "99", "display_text": "zqv99 mẫu thử"}}]}}, {"product_id": "1"})
    assert "error" not in sandbox.call("build_warehouse")
    row = sandbox.rows("review")[0]
    assert row["writer_key"] == row["review_id"] == "tiktok_shop:99" and row["writer_known"] == 0

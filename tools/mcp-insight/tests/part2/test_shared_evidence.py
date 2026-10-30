"""IM-Q77 local writer validation; IM-Q73 frozen .4 overlap data."""

import copy
import json
import sqlite3

import pytest

from insight_test_support import AMBIGUOUS, OTHER, RUN, VERSION, no_leak, review, sha, theme_row
from p2_support import DATE, PAIR, candidate_ids, check, checked_item, keyword_row, reason_row


def writer_args(function):
    common = dict(checked_by="synthetic-owner", checked_at=DATE)
    return {
        "record_sample_review": dict(rules_kind="codebook", rules_version=VERSION, reviewed_by="synthetic-owner",
                                     reviewed_at=DATE, sample_size=30, passed=True),
        "record_method_approval": dict(method_key="theme_counts:shopee_reviews:" + VERSION, subject_key="canxi",
                                       run_id=RUN, approved_by="synthetic-owner", approved_at=DATE),
        "record_diversity_check": dict(count_id="IMC-123456789abc", brands=3, **common),
        "record_revenue_share": dict(run_id=RUN, platform="tiktok_shop", share_percent=50,
                                     recorded_by="synthetic-owner", recorded_at=DATE),
        "record_reason_check": dict(run_id=RUN, review_id="shopee:1", theme_a=PAIR[0], theme_b=PAIR[1], linked=True, **common),
    }[function]


TABLES = {"record_sample_review": "sample_review", "record_method_approval": "method_ledger",
          "record_diversity_check": "diversity_check", "record_revenue_share": "revenue_share",
          "record_reason_check": "reason_check"}


@pytest.mark.parametrize("function", list(TABLES))
def test_im_q77_each_writer_creates_only_one_valid_synthetic_record(p2, function):
    """NC: global sample/diversity signatures have no run parameter or run column."""
    p2.seed([review(1, text="zqvwriter ngon vì chính hãng")])
    assert not p2.store.exists()
    args = writer_args(function)
    p2.write(function, **args)
    rows = p2.rows(TABLES[function])
    assert len(rows) == 1
    for key, value in args.items():
        if key not in {"theme_a", "theme_b"}:
            assert rows[0][key] == value
    if function in {"record_sample_review", "record_diversity_check"}:
        assert "run_id" not in rows[0]
    if function == "record_reason_check":
        assert rows[0]["theme_pair"] == "T-CHINHHANG|T-VI"
        assert rows[0]["text_sha256"] == sha("zqvwriter ngon vì chính hãng")
    p2.scan_storage()


@pytest.mark.parametrize("changes", [
    {"sample_size": 0}, {"sample_size": -1}, {"sample_size": True}, {"sample_size": 1.5},
    {"reviewed_by": "  "}, {"reviewed_at": "hôm qua"}, {"passed": 1}, {"rules_kind": "codebook2"},
    {"rules_version": " "}, {"reviewed_at": "2026-02-30"},
])
def test_im_q77_invalid_sample_is_atomic_and_never_echoes_review_text(p2, changes):
    """NC: removing size/type/date/key validation accepts one of these records."""
    p2.sample()
    before = p2.rows("sample_review")
    args = writer_args("record_sample_review")
    args.update(changes)
    with pytest.raises(ValueError) as raised:
        p2.write("record_sample_review", **args)
    no_leak(str(raised.value), p2.box.sentinels())
    assert p2.rows("sample_review") == before


@pytest.mark.parametrize("function,changes", [
    ("record_method_approval", {"method_key": "unknown:shopee_reviews:v1"}),
    ("record_method_approval", {"method_key": "theme_counts:unknown:v1"}),
    ("record_method_approval", {"method_key": "theme_counts"}),
    ("record_method_approval", {"subject_key": " "}),
    ("record_method_approval", {"approved_by": ""}),
    ("record_method_approval", {"approved_at": "invalid"}),
    ("record_diversity_check", {"count_id": "not-a-count"}),
    ("record_diversity_check", {"brands": 0}),
    ("record_diversity_check", {"brands": 2.5}),
    ("record_diversity_check", {"checked_by": " "}),
    ("record_diversity_check", {"checked_at": "invalid"}),
    ("record_revenue_share", {"share_percent": 100.5}),
    ("record_revenue_share", {"share_percent": -0.1}),
    ("record_revenue_share", {"share_percent": float("nan")}),
    ("record_revenue_share", {"share_percent": float("inf")}),
    ("record_revenue_share", {"share_percent": True}),
    ("record_revenue_share", {"platform": "google"}),
    ("record_revenue_share", {"recorded_by": " "}),
    ("record_revenue_share", {"recorded_at": "invalid"}),
    ("record_reason_check", {"review_id": "shopee:missing"}),
    ("record_reason_check", {"theme_b": "T-GIAOHANG"}),
    ("record_reason_check", {"theme_b": PAIR[0]}),
    ("record_reason_check", {"linked": 1}),
    ("record_reason_check", {"checked_by": " "}),
    ("record_reason_check", {"checked_at": "invalid"}),
])
def test_im_q77_invalid_other_writer_records_do_not_insert(p2, function, changes):
    """NC: invalid numeric, metadata, source, pair or review input cannot write a row."""
    p2.seed([review(1, text="zqvbadwriter ngon vì chính hãng")])
    args = writer_args(function)
    p2.write(function, **args)
    before = p2.rows(TABLES[function])
    args.update(changes)
    with pytest.raises(ValueError) as raised:
        p2.write(function, **args)
    no_leak(str(raised.value), p2.box.sentinels())
    assert p2.rows(TABLES[function]) == before


@pytest.mark.parametrize("function", ["record_method_approval", "record_revenue_share", "record_reason_check"])
@pytest.mark.parametrize("scenario", ["prefix", "unbuilt", "ambiguous"])
def test_im_q77_run_scoped_writers_resolve_built_full_ids(p2, function, scenario):
    """NC R2-2: storing the prefix or accepting unbuilt/ambiguous runs fails."""
    p2.seed([review(1)])
    args = writer_args(function)
    if scenario == "prefix":
        args["run_id"] = "aaaaaaaa"
        p2.write(function, **args)
        assert p2.rows(TABLES[function])[0]["run_id"] == RUN
    else:
        if scenario == "unbuilt":
            p2.box.seed([], run_id=OTHER)
            args["run_id"] = OTHER
        else:
            p2.box.seed([review(1)], run_id=AMBIGUOUS)
            assert "error" not in p2.box.call("build_warehouse", AMBIGUOUS)
            args["run_id"] = "aaaaaaaa"
        with pytest.raises(ValueError):
            p2.write(function, **args)
        assert p2.rows(TABLES[function]) == []


def test_im_q77_failed_and_old_version_samples_store_but_never_pass(coded_p2, codebook):
    """NC: a failed review is a valid record; neither it nor .3 approves .4."""
    data = codebook()
    data.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
    codebook(data)
    row = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    coded_p2.sample(version="2026-10-30.3")
    coded_p2.sample(passed=False)
    assert len(coded_p2.rows("sample_review")) == 2
    check(checked_item(coded_p2.confidence(row, 8)), 3, "NO_OWNER_SAMPLE_REVIEW")
    coded_p2.sample()
    check(checked_item(coded_p2.confidence(row, 8)), 3)


def test_im_q77_reason_hash_uses_exact_utf8_text_not_normalized_text_or_id(p2):
    """NC: hashing ID, NFC text or source metadata cannot match these exact bytes."""
    text = "zqvhash ngo\u0302n vì chính hãng\n"
    p2.seed([review(1, text=text)], keywords=())
    stored = p2.box.rows("review_text")[0]["text"]
    p2.reading("shopee:1", pair=PAIR[::-1])
    record = p2.rows("reason_check")[0]
    assert record["text_sha256"] == sha(stored.encode("utf-8"))
    assert record["theme_pair"] == "T-CHINHHANG|T-VI"
    assert "text" not in record and "text" not in writer_args("record_reason_check")


@pytest.mark.parametrize("kind", ["sample", "diversity", "method", "revenue", "reason"])
def test_im_q77_readers_ignore_malformed_direct_sql_rows(coded_p2, keyword_groups, kind):
    """NC: reader trust of direct-SQL invalid evidence would pass a missing check/gate."""
    p2 = coded_p2
    groups = keyword_groups(approved=True)
    kw = keyword_row(p2.box)
    if kind == "sample":
        p2.sample("keyword_groups", groups["version"])
        with sqlite3.connect(p2.store) as db:
            db.execute("UPDATE sample_review SET reviewed_at='invalid'")
        check(checked_item(p2.confidence(kw)), 3, "NO_OWNER_SAMPLE_REVIEW")
    elif kind == "diversity":
        p2.diversity(kw["count_id"])
        with sqlite3.connect(p2.store) as db:
            db.execute("UPDATE diversity_check SET brands=0")
        check(checked_item(p2.confidence(kw)), 2, "DIVERSITY_NOT_VERIFIED")
    elif kind == "method":
        p2.method("keyword_counts:search_suggestions:" + groups["version"])
        with sqlite3.connect(p2.store) as db:
            db.execute("UPDATE method_ledger SET approved_by=' '")
        check(checked_item(p2.confidence(kw)), 4, "METHOD_ON_0_PRODUCTS")
    elif kind == "revenue":
        p2.share()
        with sqlite3.connect(p2.store) as db:
            db.execute("UPDATE revenue_share SET share_percent=?", (float("inf"),))
        theme = theme_row(p2.call("theme_counts"), theme="T-CHINHHANG", platform="tiktok_shop")
        assert checked_item(p2.confidence(theme, 13))["blocked"] == "REVENUE_SHARE_UNKNOWN"
    else:
        p2.reading("shopee:1")
        with sqlite3.connect(p2.store) as db:
            db.execute("UPDATE reason_check SET linked=2")
        result = p2.links()
        assert reason_row(result)["reviews"] == 0
        assert "shopee:1" in candidate_ids(result)
    p2.scan_storage()


OVERLAP = (
    "Màu sắc, kiểu dáng, thiết kế của chính sản phẩm (đẹp/xấu, sang/trông rẻ, hợp mắt) = T-THIETKE. "
    "Màu hoặc kiểu khác ảnh/mô tả = T-CHINHHANG. Vẻ ngoài bao bì/hộp (đẹp, xấu, bắt mắt) = T-THIETKE (F311). "
    "Cách gói, chèn, seal: no theme (F310)."
)


def overlap_assertion(data):
    assert data["version"] == "2026-10-30.4"
    rules = [item["rule"] for item in data["overlaps"]]
    assert OVERLAP in rules
    assert not any("Bao bì/hộp: no theme" in rule for rule in rules)


def test_im_q73_codebook_and_reference_freeze_the_owner_overlap(p2):
    """NC: independent old-rule and old-version mutations each fail the frozen oracle."""
    paths = [p2.box.insight / "data/insight-theme-codebook.json",
             p2.box.insight / "tests/fixtures/reference-codebook.json"]
    copies = []
    for path in paths:
        raw = path.read_bytes()
        assert b"\r" not in raw
        data = json.loads(raw)
        overlap_assertion(data)
        copies.append(data)
    assert copies[0] == copies[1]
    old_rule = copy.deepcopy(copies[0])
    next(item for item in old_rule["overlaps"] if item["rule"] == OVERLAP)["rule"] = "Bao bì/hộp: no theme (F310)."
    with pytest.raises(AssertionError):
        overlap_assertion(old_rule)
    old_version = copy.deepcopy(copies[0])
    old_version["version"] = "2026-10-30.3"
    with pytest.raises(AssertionError):
        overlap_assertion(old_version)

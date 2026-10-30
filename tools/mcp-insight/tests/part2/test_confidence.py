"""R-IM08: confidence is computed from independent human evidence, per claim."""

import copy
import sqlite3

import pytest

from insight_test_support import VERSION, error, review, theme_row
from p2_support import (
    DATE, KEYWORDS, cell, check, checked_item, keyword_row,
)


def keyword_setup(p2, keyword_groups, *, sample=True, subjects=("canxi", "kem", "sat"), diversity=3):
    p2.seed([], keywords=KEYWORDS)
    groups = keyword_groups(approved=True)
    row = keyword_row(p2.box)
    if diversity is not None:
        p2.diversity(row["count_id"], diversity)
    p2.method("keyword_counts:search_suggestions:" + groups["version"], subjects)
    if sample:
        p2.sample("keyword_groups", groups["version"])
    return row, groups


@pytest.mark.parametrize("number,evidence", [
    (0, []), (19, []), (2, []), (3, []), (18, []),
    (1, [{"count_id": "IMC-000000000000", "part": 2}]),
    (1, [{"count_id": "IMC-000000000000", "part": None}]),
    (8, [{"count_id": "IMC-000000000000", "part": 13}]),
    (8, [{"count_id": "IMC-000000000000", "part": None}] * 51),
])
def test_im_q62_invalid_part_and_support_shape(coded_p2, number, evidence):
    """NC: frames, out-of-range parts and invalid support parts cannot be graded."""
    error(coded_p2.call("confidence_ceiling", part=number, evidence=evidence), "INVALID_ARGUMENT")


@pytest.mark.parametrize("number", [6, 16])
def test_im_q62_empty_evidence_and_unknown_id(coded_p2, number):
    """NC: neither registry defaults nor potential support supplies missing evidence."""
    empty = coded_p2.call("confidence_ceiling", part=number, evidence=[])
    assert (empty["ceiling"], empty["reason"]) == ("Không", "NO_EVIDENCE")
    error(coded_p2.call("confidence_ceiling", part=number,
                       evidence=[{"count_id": "IMC-000000000000", "part": 6}]), "COUNT_ID_UNKNOWN")


def test_im_q62_registry_history_does_not_make_an_old_id_current(coded_p2):
    """NC: registry-only resolution accepts a historical label-state ID."""
    row = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    coded_p2.box.sql("UPDATE label SET theme_code='T-GIA' WHERE theme_code='T-CHINHHANG' AND review_id='shopee:1'")
    fresh = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    assert fresh["reviews"] == row["reviews"] - 1 and fresh["count_id"] != row["count_id"]
    assert coded_p2.box.rows("count_registry", "WHERE count_id=?", (row["count_id"],))
    error(coded_p2.confidence(row, 8), "COUNT_ID_STALE")
    assert "error" not in coded_p2.confidence(fresh, 8)


def test_im_q62_reason_link_id_is_not_ordinary_claim_evidence(coded_p2):
    """NC: accepting any current IMC ID confuses relation and count evidence."""
    coded_p2.reading("shopee:1")
    row = coded_p2.links()["rows"][0]
    error(coded_p2.confidence(row, 8), "INVALID_ARGUMENT")


def test_im_q63_source_role_depends_on_the_question(coded_p2):
    """NC: every captured source treated as primary fails secondary/null cases."""
    shopee = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    check(checked_item(coded_p2.confidence(shopee, 8)), 1)
    secondary = checked_item(coded_p2.confidence(shopee, 6))
    check(secondary, 1, "SECONDARY_SOURCE")
    tiktok = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG", platform="tiktok_shop")
    blocked = checked_item(coded_p2.confidence(tiktok, 8))
    check(blocked, 1, "SOURCE_NOT_FOR_QUESTION")
    assert blocked["blocked"] == "SOURCE_NOT_FOR_QUESTION" and blocked["ceiling"] == "Không"
    coded_p2.share()
    assert checked_item(coded_p2.confidence(tiktok, 8))["blocked"] == "SOURCE_NOT_FOR_QUESTION"


def test_im_q63_hint_source_forces_hypothesis(p2, keyword_groups, frame):
    """NC: hint-only cannot become a non-hypothesis strong claim."""
    row, _ = keyword_setup(p2, keyword_groups)
    data = frame()
    source = next(s for s in data["sources"] if s["key"] == "search_suggestions")
    source["roles"]["2"] = "Gợi ý"
    frame(data)
    result = p2.confidence(row)
    item = checked_item(result)
    check(item, 1, "HINT_ONLY")
    assert result["hypothesis"] is True and item["ceiling"] == result["ceiling"] == "Yếu"


def test_im_q64_five_keywords_do_not_prove_multiple_brands(p2):
    """NC: threshold-only, wrong-ID and one-brand diversity shortcuts fail."""
    p2.seed([], keywords=KEYWORDS)
    row = keyword_row(p2.box)
    assert row["threshold_met"] is True
    check(checked_item(p2.confidence(row)), 2, "DIVERSITY_NOT_VERIFIED")
    p2.diversity("IMC-123456789abc")
    check(checked_item(p2.confidence(row)), 2, "DIVERSITY_NOT_VERIFIED")
    p2.diversity(row["count_id"], 1)
    check(checked_item(p2.confidence(row)), 2, "ONE_BRAND")
    p2.diversity(row["count_id"], 3)
    check(checked_item(p2.confidence(row)), 2)


def test_im_q64_size_and_writer_identity_precede_diversity(p2):
    """NC: a diversity record cannot rescue four keywords or unnamed writers."""
    p2.seed([review(i) for i in range(1, 6)], keywords=KEYWORDS[:4])
    assert "error" not in p2.code()[0]
    kw = keyword_row(p2.box)
    p2.diversity(kw["count_id"])
    check(checked_item(p2.confidence(kw)), 2, "BELOW_THRESHOLD")
    row = theme_row(p2.call("theme_counts"), theme="T-CHINHHANG")
    assert row["threshold_met"] is True
    p2.diversity(row["count_id"])
    check(checked_item(p2.confidence(row, 8)), 2, "WRITER_UNKNOWN")


def test_im_q64_named_threshold_still_requires_brand_evidence(coded_p2):
    """NC: five known writers on three products do not establish brand diversity."""
    coded_p2.share()
    row = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG", platform="tiktok_shop")
    assert (row["writers"], row["products"], row["threshold_met"]) == (5, 3, True)
    check(checked_item(coded_p2.confidence(row, 13)), 2, "DIVERSITY_NOT_VERIFIED")


def test_im_q64_diverse_but_small_named_review_sample_stays_below_threshold(p2):
    """NC: an explicit diversity record cannot replace the review-size threshold."""
    p2.seed([review(i, platform="tiktok_shop", name=f"synthetic_small_{i}") for i in range(1, 5)])
    assert "error" not in p2.code()[0]
    p2.share()
    row = theme_row(p2.call("theme_counts"), theme="T-CHINHHANG", platform="tiktok_shop")
    p2.diversity(row["count_id"])
    check(checked_item(p2.confidence(row, 13)), 2, "BELOW_THRESHOLD")


@pytest.mark.parametrize("case", ["draft", "none", "wrong_version", "failed", "zero_sql", "blank_sql", "valid"])
def test_im_q65_codebook_approval_requires_a_valid_current_sample(coded_p2, codebook, case):
    """NC: status-only, wrong-version and malformed direct-SQL receipts fail."""
    row = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    book = codebook()
    if case != "draft":
        book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
        codebook(book)
    if case not in {"none", "zero_sql", "blank_sql"}:
        coded_p2.sample(version="2026-10-30.3" if case == "wrong_version" else VERSION, passed=case != "failed")
    if case in {"zero_sql", "blank_sql"}:
        coded_p2.sample(passed=False)
        with sqlite3.connect(coded_p2.store) as db:
            db.execute("DELETE FROM sample_review")
            db.execute("INSERT INTO sample_review(rules_kind,rules_version,reviewed_by,reviewed_at,sample_size,passed) VALUES (?,?,?,?,?,?)",
                       ("codebook", VERSION, "" if case == "blank_sql" else "synthetic-owner", DATE,
                        0 if case == "zero_sql" else 30, 1))
    expected = "CODEBOOK_NOT_APPROVED" if case == "draft" else None if case == "valid" else "NO_OWNER_SAMPLE_REVIEW"
    check(checked_item(coded_p2.confidence(row, 8)), 3, expected)


def test_im_q65_keyword_and_portrait_rules_use_their_own_sample_versions(coded_p2, keyword_groups):
    """NC: a codebook review cannot pass keyword or portrait classification."""
    groups = keyword_groups()
    kw = keyword_row(coded_p2.box)
    coded_p2.sample("keyword_groups", groups["version"])
    check(checked_item(coded_p2.confidence(kw)), 3, "KEYWORD_GROUPS_NOT_APPROVED")
    # Start the approved-path controls with no matching keyword review.
    with sqlite3.connect(coded_p2.store) as db:
        db.execute("DELETE FROM sample_review")
    groups = keyword_groups(approved=True)
    kw = keyword_row(coded_p2.box)
    portrait = next(r for r in coded_p2.call("portrait_counts")["rows"]
                    if r.get("dimension") == "Mua cho ai" and r["platform"] == "shopee")
    coded_p2.sample()
    for row, number in [(kw, 6), (portrait, 4)]:
        check(checked_item(coded_p2.confidence(row, number)), 3, "NO_OWNER_SAMPLE_REVIEW")
    coded_p2.sample("keyword_groups", groups["version"])
    check(checked_item(coded_p2.confidence(kw)), 3)
    check(checked_item(coded_p2.confidence(portrait, 4)), 3, "NO_OWNER_SAMPLE_REVIEW")
    coded_p2.sample("portrait_rules", coded_p2.box.module.PORTRAIT_RULES_VERSION)
    check(checked_item(coded_p2.confidence(portrait, 4)), 3)


def test_im_q66_stability_counts_distinct_subjects_for_exact_method(p2):
    """NC: counting runs or other rule versions makes two subjects look like three."""
    p2.seed([], keywords=KEYWORDS)
    row = keyword_row(p2.box)
    key = "keyword_counts:search_suggestions:kwg-2026-10-30.1"
    check(checked_item(p2.confidence(row)), 4, "METHOD_ON_0_PRODUCTS")
    p2.method(key, ("canxi", "kem"))
    p2.box.seed([], run_id="cccccccc-1111-4111-8111-111111111111")
    assert "error" not in p2.box.call("build_warehouse", "cccccccc-1111-4111-8111-111111111111")
    p2.method(key, ("canxi",), run_id="cccccccc")
    p2.method("keyword_counts:search_suggestions:wrong-version", ("sat",))
    check(checked_item(p2.confidence(row)), 4, "METHOD_ON_2_PRODUCTS")
    p2.method(key, ("sat",))
    check(checked_item(p2.confidence(row)), 4)


@pytest.mark.parametrize("sample,subjects,diversity,expected,missing", [
    (False, ("canxi", "kem", "sat"), 3, "Khá", 1),
    (True, ("canxi", "kem", "sat"), 3, "Chắc", 0),
    (True, ("canxi", "kem"), 3, "Khá", 1),
    (False, ("canxi", "kem"), 3, "Yếu", 2),
    (True, ("canxi", "kem", "sat"), None, "Khá", 1),
    (True, ("canxi", "kem", "sat"), 1, "Khá", 1),
])
def test_im_q68_each_missing_check_lowers_the_full_keyword_setup(p2, keyword_groups, sample, subjects, diversity, expected, missing):
    """NC: independently remove sample, third subject or diverse brands from Chắc."""
    row, _ = keyword_setup(p2, keyword_groups, sample=sample, subjects=subjects, diversity=diversity)
    result = p2.confidence(row)
    item = checked_item(result)
    assert item["missing_count"] == missing
    assert item["ceiling"] == result["ceiling"] == expected
    check(item, 1)
    check(item, 2, "DIVERSITY_NOT_VERIFIED" if diversity is None else "ONE_BRAND" if diversity == 1 else None)
    check(item, 3, None if sample else "NO_OWNER_SAMPLE_REVIEW")
    check(item, 4, None if len(subjects) == 3 else "METHOD_ON_2_PRODUCTS")


@pytest.mark.parametrize("strong", ["Chắc", "Khá"])
def test_im_q67_synthesis_uses_the_lowest_actual_support(coded_p2, keyword_groups, strong):
    """NC: max support gives Chắc/Khá instead of the theme support's Yếu."""
    groups = keyword_groups(approved=True)
    kw = keyword_row(coded_p2.box)
    coded_p2.diversity(kw["count_id"])
    coded_p2.method("keyword_counts:search_suggestions:" + groups["version"])
    if strong == "Chắc":
        coded_p2.sample("keyword_groups", groups["version"])
    assert coded_p2.confidence(kw)["ceiling"] == strong
    weak = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG")
    coded_p2.method("theme_counts:shopee_reviews:" + VERSION, ("canxi", "kem"))
    item = checked_item(coded_p2.confidence(weak, 8))
    assert item["missing_count"] == 3 and item["ceiling"] == "Yếu"
    for number in (1, 16, 17):
        result = coded_p2.call("confidence_ceiling", part=number, evidence=[
            {"count_id": kw["count_id"], "part": 6}, {"count_id": weak["count_id"], "part": 8}])
        assert result["ceiling"] == "Yếu"
        assert [i["ceiling"] for i in result["items"]] == [strong, "Yếu"]


def test_im_q67_explicit_hypothesis_caps_zero_missing_at_weak(p2, keyword_groups):
    """NC: ignoring hypothesis=True incorrectly leaves the full setup at Chắc."""
    row, _ = keyword_setup(p2, keyword_groups)
    result = p2.confidence(row, hypothesis=True)
    assert result["hypothesis"] is True and result["ceiling"] == "Yếu"
    assert checked_item(result)["missing_count"] == 0


@pytest.mark.parametrize("dimension", ["Giới", "Nhóm tuổi"])
def test_im_q67_demographic_hypotheses_keep_source_applicability(p2, frame, dimension):
    """NC: demographic data has no frozen Q1 role; a valid role still carries hypothesis."""
    p2.seed([review(1, platform="tiktok_shop", name="synthetic_age1992")], keywords=())
    assert "error" not in p2.code()[0]
    p2.share()
    age = next(r for r in p2.call("portrait_counts")["rows"] if r.get("dimension") == dimension)
    original = checked_item(p2.confidence(age, 4))
    assert original["blocked"] == "SOURCE_NOT_FOR_QUESTION" and original["ceiling"] == "Không"
    data = frame()
    source = next(s for s in data["sources"] if s["key"] == "tiktok_shop_reviews")
    source["roles"]["1"] = "Phụ"
    frame(data)
    result = p2.confidence(age, 4)
    item = checked_item(result)
    check(item, 2, "HYPOTHESIS_ROW")
    assert result["hypothesis"] is True and item["partial"] is False and item["ceiling"] == "Yếu"


@pytest.mark.parametrize("shares,expected", [
    ([], "REVENUE_SHARE_UNKNOWN"), ([("tiktok_shop", 49.9)], "REVENUE_SHARE_BELOW_MIN"),
    ([("tiktok_shop", 50)], None), ([("shopee", 60)], "REVENUE_SHARE_UNKNOWN"),
    ([("tiktok_shop", 60), ("tiktok_shop", 40)], "REVENUE_SHARE_BELOW_MIN"),
])
def test_im_q75_tiktok_gate_uses_latest_matching_share_and_includes_50(coded_p2, shares, expected):
    """NC: missing-as-pass, >50, wrong-platform, first-row and old-tool gating fail."""
    before = {tool: coded_p2.call(tool) for tool in ("theme_counts", "portrait_counts")}
    row = theme_row(before["theme_counts"], theme="T-CHINHHANG", platform="tiktok_shop")
    for platform, value in shares:
        coded_p2.share(value, platform)
    c = cell(coded_p2.call("report_plan"), 13, "tiktok_shop_reviews")
    item = checked_item(coded_p2.confidence(row, 13))
    assert item["blocked"] == expected
    if expected:
        assert c["status"] == "Chưa dùng được" and c["reason"] == expected
        assert c["count_ids"] == [] and item["ceiling"] == "Không"
    else:
        assert c["status"] == "Có dữ liệu"
        assert c["count_ids"] == [r["count_id"] for r in before["theme_counts"]["rows"] if r["platform"] == "tiktok_shop"]
        assert item["ceiling"] != "Không"
    for tool, result in before.items():
        assert coded_p2.call(tool) == result


def test_im_q76_partial_and_nonpartial_secondary_sources_have_different_caps(coded_p2, codebook, keyword_groups):
    """NC: ignoring partial mapping gives Khá; capping every secondary gives Yếu."""
    groups = keyword_groups(approved=True)
    kw = keyword_row(coded_p2.box)
    coded_p2.diversity(kw["count_id"])
    coded_p2.sample("keyword_groups", groups["version"])
    coded_p2.method("keyword_counts:search_suggestions:" + groups["version"])
    partial = checked_item(coded_p2.confidence(kw, 4))
    check(partial, 1, "SECONDARY_SOURCE")
    assert (partial["missing_count"], partial["partial"], partial["ceiling"]) == (1, True, "Yếu")
    theme = theme_row(coded_p2.call("theme_counts"), theme="T-CHINHHANG", platform="tiktok_shop")
    coded_p2.approve_theme(theme, codebook)
    nonpartial = checked_item(coded_p2.confidence(theme, 13))
    check(nonpartial, 1, "SECONDARY_SOURCE")
    assert (nonpartial["missing_count"], nonpartial["partial"], nonpartial["ceiling"]) == (1, False, "Khá")
    for n in (2, 3, 4):
        check(nonpartial, n)


def test_im_q78_new_passing_evidence_never_rewrites_part1_flags_or_ids(coded_p2, codebook, keyword_groups):
    """NC: writing new evaluator checks back into count rows breaks exact equality."""
    # Metadata changes are made before the baseline; only shared-store state
    # changes afterwards. Thus equal IDs are an independent compatibility check.
    book = codebook()
    book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
    codebook(book)
    groups = keyword_groups(approved=True)
    before = {tool: copy.deepcopy(coded_p2.call(tool)) for tool in ("theme_counts", "keyword_counts", "portrait_counts")}
    registry = {r["count_id"]: r for r in coded_p2.box.rows("count_registry")}
    theme = theme_row(before["theme_counts"], theme="T-CHINHHANG", platform="tiktok_shop")
    coded_p2.sample()
    coded_p2.share()
    for tool, result in before.items():
        for row in result["rows"]:
            coded_p2.diversity(row["count_id"])
    coded_p2.method("theme_counts:tiktok_shop_reviews:" + VERSION)
    coded_p2.sample("keyword_groups", groups["version"])
    coded_p2.sample("portrait_rules", coded_p2.box.module.PORTRAIT_RULES_VERSION)
    new = checked_item(coded_p2.confidence(theme, 13))
    for number in (2, 3, 4):
        check(new, number)
    assert theme["check2_missing"] is True and theme["check2_reason"] == "DIVERSITY_NOT_ASSESSED"
    assert theme["check3_missing"] is True
    coded_p2.call("report_plan")
    for tool, result in before.items():
        assert coded_p2.call(tool) == result
    assert {r["count_id"]: r for r in coded_p2.box.rows("count_registry")} == registry

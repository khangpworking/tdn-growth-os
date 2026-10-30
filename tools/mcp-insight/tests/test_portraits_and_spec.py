"""R-IM06 aggregate portrait rules and task 2.8's explicit R-I39 text gate."""

import json
import re

import pytest

from insight_test_support import NO_DATA, REPO, UNKNOWN_NOTE, error, no_leak, review, sync
from test_boundaries import perturb


@pytest.mark.parametrize("text,attributes,who,for_whom", [
    ("zqv1 ok", ["Đối tượng sử dụng: Bà bầu, trẻ em"],
     {"Bà bầu, sau sinh, cho con bú", "Trẻ em, học sinh"}, set()),
    ("zqv2 ĐỐI TƯỢNG SỬ DỤNG: người lớn  Công dụng: cho trẻ em", [],
     {"Người lớn, trưởng thành"}, set()),
    ("zqv3 đối tượng sử dụng: xyz", [], {"Khác / không rõ"}, set()),
    ("zqv4 mua cho mẹ và cho con dùng", [], set(), {"Mua cho bố mẹ, ông bà", "Mua cho con, bé"}),
    ("zqv5 mình uống thấy ổn", [], set(), {"Tự dùng"}),
    ("zqv6 không có gì", [], set(), set()),
])
def test_im_q33_reference_multimatch_field_boundary_and_self_report(
        subject, sandbox, text, attributes, who, for_whom):
    """NC: first-match loses the child group; whole-text field search adds it falsely."""
    sandbox.seed([review(1, text=text, attributes=attributes)])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("portrait_counts")
    assert "error" not in result
    actual = {dimension: {r["group"] for r in result["rows"] if r["dimension"] == dimension}
              for dimension in ["Ai dùng", "Mua cho ai"]}
    assert actual == {"Ai dùng": who, "Mua cho ai": for_whom}
    for row in result["rows"]:
        if row["dimension"] in {"Ai dùng", "Mua cho ai"}:
            assert (row["reviews"], row["writers"], row["products"], row["threshold_count"]) == (1, 1, 1, 1)
            assert row["threshold_met"] is False and "dưới ngưỡng" in row["threshold_note"]
            assert UNKNOWN_NOTE in row["threshold_note"]


def test_im_q34_name_rules_distinct_writers_bounded_years_and_hypothesis(subject, sandbox):
    """NC: no dedup gives female 5; permissive years/ambiguous binh alter fixed totals."""
    names = ["huyentran1992"] * 3 + ["minhquan05", "abc2010", "xyz19501", "binh88", "trangtuan",
                                           "thanhha1949", "ngocmai2008x", "kim07", "a*****b", None]
    sandbox.seed([review(i + 1, platform="tiktok_shop", name=n) for i, n in enumerate(names)])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("portrait_counts")
    rows = [r for r in result["rows"] if r["dimension"] in {"Giới", "Nhóm tuổi"}]
    actual = {dimension: {r["group"]: r["writers"] for r in rows if r["dimension"] == dimension}
              for dimension in ["Giới", "Nhóm tuổi"]}
    assert actual == {
        "Giới": {"Nữ": 3, "Nam": 1, "Không đoán được": 5},
        "Nhóm tuổi": {"Dưới 20": 2, "20–29": 1, "30–39": 2, "Không đoán được": 4},
    }
    assert all(sum(groups.values()) == 9 for groups in actual.values())
    assert all(r["platform"] == "tiktok_shop" and r["label"] == "Giả thuyết"
               and r["max_confidence"] == "Yếu" for r in rows)
    guesses = sandbox.rows("writer_guess")
    assert len(guesses) == 9
    assert {c for c in guesses[0]} == {"writer_key", "gender", "age_band", "year_basis"}
    assert len({r["writer_key"] for r in guesses}) == 9


def test_im_q34_age_uses_run_utc_year_not_current_clock(subject, sandbox):
    """NC: a 1992 writer in a 2032 run is 40–49, not the 2026 age band."""
    import sqlite3
    sandbox.seed([review(1, platform="tiktok_shop", name="synthetic1992")])
    with sqlite3.connect(sandbox.db) as db:
        db.execute("UPDATE analysis_research_automation_runs SET created_at='2032-01-01T00:00:00Z'")
    assert "error" not in sandbox.call("build_warehouse")
    rows = sandbox.call("portrait_counts")["rows"]
    assert {r["group"]: r["writers"] for r in rows if r["dimension"] == "Nhóm tuổi"} == {"40–49": 1}


@pytest.mark.parametrize("platform", ["shopee", "tiktok_shop"])
def test_im_q35_platform_without_names_has_no_numeric_demographics(subject, sandbox, platform):
    """NC: missing/masked names cannot produce even an 'unknown' numeric guess row."""
    sandbox.seed([review(1, platform=platform), review(2, platform=platform, name="a*****b")])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("portrait_counts")
    assert result["demographics"][platform] == {"Giới": NO_DATA, "Nhóm tuổi": NO_DATA}
    assert not [r for r in result["rows"] if r["platform"] == platform and r["dimension"] in {"Giới", "Nhóm tuổi"}]


def assert_aggregate_only(value, private):
    no_leak(value, private)
    if isinstance(value, dict):
        assert not {"writer_key", "review_id", "name", "user"}.intersection(value)
        for child in value.values():
            assert_aggregate_only(child, [])
    elif isinstance(value, list):
        for child in value:
            assert_aggregate_only(child, [])


def test_im_q36_no_individual_names_ids_or_guesses_in_results(subject, sandbox):
    """NC: an appended per-writer list fails the identical aggregate-only scanner."""
    names = ["synthetic_huyen1992", "synthetic_quan05"]
    sandbox.seed([review(i + 1, platform="tiktok_shop", name=n, text=f"zqv36{i} mua cho mẹ") for i, n in enumerate(names)])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("portrait_counts")
    private = [*names, *(r["writer_key"] for r in sandbox.rows("review")),
               *(r["review_id"] for r in sandbox.rows("review"))]
    assert_aggregate_only(result, private)
    stored = "\n".join(sandbox.dump())
    no_leak(stored, names)
    mutant = {**result, "individuals": [{"writer_key": private[2], "gender": "Nữ"}]}
    with pytest.raises(AssertionError):
        assert_aggregate_only(mutant, private)


def test_im_q37_portrait_slayer_mismatch_refuses_numbers(subject, sandbox, monkeypatch):
    """NC: change one real portrait result while fixed reference SQL stays intact."""
    sandbox.seed([review(1, text="zqv37 mua cho mẹ")])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("portrait_counts")
    assert any(r.get("group") == "Mua cho bố mẹ, ông bà" and r["reviews"] == 1 for r in result["rows"])
    real = subject._slayer_query
    monkeypatch.setattr(subject, "_slayer_query", lambda *a, **k: perturb(sync(real(*a, **k))))
    error(sandbox.call("portrait_counts"), "SLAYER_SQL_MISMATCH")


KEPT = "Câu insight SHALL chỉ giữ động cơ và rào cản có trong lời khách: công dụng, giá, quy cách, chất lượng;"
OWNER_SENTENCE = (
    "Ngày 30/10/2026 chủ viết: «bỏ tag, vì nó liên quan đến logistic và thương mại điện tử, "
    "không phục vụ insight. Vẫn lấy comment, nhưng không hiện và tổng hợp, phân loại hay xử lý "
    "cho các loại tag này» (F310)."
)


def requirement(text, code):
    return re.search(r"^### Requirement: " + re.escape(code) + r"\b.*?(?=^### Requirement:|\Z)", text, re.M | re.S).group()


def check_ri39(method_text, mcp_text):
    section = requirement(method_text, "R-I39")
    assert KEPT in section
    assert "giao hàng" not in section.casefold()
    because = next(line for line in section.splitlines() if line.startswith("- Vì sao:"))
    assert because.endswith(OWNER_SENTENCE)
    mcp_because = next(line for line in requirement(mcp_text, "R-IM03").splitlines() if line.startswith("- Vì sao:"))
    assert OWNER_SENTENCE.encode() in mcp_because.encode()


def test_im_q49_ri39_kept_motives_and_exact_owner_f310_sentence():
    """NC: reintroduced delivery, changed attribution, or sentence-only-in-IM03 fails."""
    method_text = (REPO / "openspec/changes/insight-method-v1/specs/insight-report/spec.md").read_text()
    mcp_text = (REPO / "openspec/changes/insight-mcp-v1/specs/insight-mcp/spec.md").read_text()
    check_ri39(method_text, mcp_text)
    start = method_text.index("### Requirement: R-I39")
    prefix, section = method_text[:start], method_text[start:]
    for mutant in [section.replace("quy cách, chất lượng;", "quy cách, chất lượng, giao hàng;"),
                   section.replace("không phục vụ insight", "không phục vụ báo cáo"),
                   section.replace(" (F310).", "."), section.replace(OWNER_SENTENCE, "")]:
        with pytest.raises(AssertionError):
            check_ri39(prefix + mutant, mcp_text)

"""R-IM07: independent frozen-frame, source, stage and limitation oracles."""

import copy
import re

import pytest

from insight_test_support import AMBIGUOUS, OTHER, RUN, error, review, sync
from p2_support import (
    KEYWORDS, QUESTION_NOS, QUESTIONS, TITLES, cell, keyword_row, part, reader_scan,
)
from test_boundaries import perturb


def test_im_q55_roles_are_loaded_from_the_selected_data_file(coded_p2, frame):
    """NC: hardcoded source roles ignore a valid temporary frame change."""
    data = frame()
    assert coded_p2.call("report_plan")["frame_version"] == "frame-2026-10-30.1"
    assert coded_p2.call("report_plan")["frame_status"] == "UNREVIEWED"
    source = next(s for s in data["sources"] if s["key"] == "search_suggestions")
    source["roles"]["2"] = "Phụ"
    frame(data)
    changed = coded_p2.call("report_plan")
    for n in (6, 7):
        assert cell(changed, n, "search_suggestions")["role"] == "Phụ"


@pytest.mark.parametrize("fault", [
    "contract", "version", "status", "questions", "role", "17_parts", "swap", "q6",
    "partial_primary", "share150", "duplicate_source", "empty_basis", "frame_question",
])
def test_im_q55_invalid_frame_has_no_parts(coded_p2, frame, fault):
    """NC: malformed copies must fail validation rather than produce a plan."""
    data = frame()
    suggest = next(s for s in data["sources"] if s["key"] == "search_suggestions")
    tiktok = next(s for s in data["sources"] if s["key"] == "tiktok_shop_reviews")
    if fault == "contract":
        data["contractVersion"] = "wrong"
    elif fault in {"version", "status"}:
        data.pop(fault)
    elif fault == "questions":
        data["questions"].pop()
    elif fault == "role":
        suggest["roles"]["2"] = "Chinh"
    elif fault == "17_parts":
        data["parts"].pop()
    elif fault == "swap":
        data["parts"][5:7] = reversed(data["parts"][5:7])
    elif fault == "q6":
        data["parts"][15]["question"] = 6
    elif fault == "partial_primary":
        suggest["partial_questions"] = [2]
    elif fault == "share150":
        tiktok["usable_when"]["min_percent"] = 150
    elif fault == "duplicate_source":
        data["sources"].append(copy.deepcopy(data["sources"][0]))
    elif fault == "empty_basis":
        data["parts"][15]["basis_parts"] = []
    else:
        data["parts"][1]["question"] = 1
    frame(data)
    error(coded_p2.call("report_plan"), "FRAME_INVALID")


def test_im_q56_exact_18_parts_and_question_five_syntheses(coded_p2):
    """NC: absent appendix, graded frame or Q3/null on parts 16/17 fails."""
    coded_p2.share()
    plan = coded_p2.call("report_plan")
    assert [p["part"] for p in plan["parts"]] == list(range(1, 19))
    assert [p["title"] for p in plan["parts"]] == TITLES
    assert [p["question_no"] for p in plan["parts"]] == QUESTION_NOS
    for p, question in zip(plan["parts"], QUESTION_NOS):
        assert p["question"] == (QUESTIONS[question - 1] if question else None)
        assert {"part", "title", "question_no", "question", "kind", "label", "steps", "sources", "ceiling"} <= p.keys()
        if p["part"] in (2, 3, 18):
            assert (p["kind"], p["label"], p["ceiling"], p["sources"], p["steps"]) == ("frame", "Khung", None, [], None)
        elif p["part"] in (1, 16, 17):
            assert (p["kind"], p["label"], p["sources"], p["steps"], p["ceiling"]) == ("synthesis", None, [], None, None)
            assert p["basis_parts"] == list(range(4, 16))
            assert "potential_ceiling" in p
        else:
            assert p["kind"] == "data"


def test_im_q57_source_roles_missing_and_empty_capture(p2):
    """NC: all-source-per-part and captured-zero-as-available implementations fail."""
    p2.seed([review(1)], keywords=KEYWORDS)
    plan = p2.call("report_plan")
    sources = part(plan, 4)["sources"]
    assert [c["source"] for c in sources] == [
        "product_names", "shopee_reviews", "search_suggestions", "search_trends",
        "population_stats", "simulated_personas",
    ]
    assert cell(plan, 4, "shopee_reviews")["status"] == "Có dữ liệu"
    assert cell(plan, 4, "search_suggestions")["status"] == "Có dữ liệu"
    for source in ("product_names", "search_trends"):
        assert cell(plan, 4, source)["reason"] == "NOT_CAPTURED"
    for source in ("population_stats", "simulated_personas"):
        assert cell(plan, 4, source)["reason"] == "NOT_COLLECTED"
    assert len(part(plan, 13)["sources"]) == 2
    assert cell(plan, 13, "tiktok_shop_reviews")["reason"] == "NOT_CAPTURED"
    p2.box.capture(RUN, "kalodata", "kalodata.product.comment.insight",
                   {"success": True, "data": {"product_id": "99", "original_comments": []}})
    assert "error" not in p2.call("build_warehouse")
    empty = cell(p2.call("report_plan"), 13, "tiktok_shop_reviews")
    assert (empty["status"], empty["reason"], empty["count_ids"], empty["count_items"], empty["steps"], empty["ceiling"]) == (
        "Chưa có dữ liệu", "EMPTY_CAPTURE", [], [], [], "Không")


def test_im_q57_no_usable_source_labels_data_parts_missing(p2):
    """NC: a frame/default source cannot manufacture available data."""
    p2.seed([], keywords=())
    for n in range(4, 16):
        p = part(p2.call("report_plan"), n)
        assert p["label"] == "Chưa có dữ liệu" and p["ceiling"] == "Không"


def test_im_q57_complete_frozen_role_matrix_is_question_specific(coded_p2):
    """NC: assigning a source to every question or flattening secondary roles fails."""
    roles = [
        ("product_names", ["Phụ", None, "Phụ", None, "Phụ"], "Muốn mua"),
        ("sales_numbers", [None, None, "Phụ", None, None], "Mua"),
        ("tiktok_video_subtitles", [None, None, "Phụ", None, "Phụ"], "Muốn mua"),
        ("shopee_reviews", ["Chính", "Phụ", "Chính", "Chính", "Chính"], "Sau mua"),
        ("tiktok_shop_reviews", [None, "Phụ", None, "Phụ", "Phụ"], "Sau mua"),
        ("search_suggestions", ["Phụ", "Chính", "Phụ", None, "Phụ"], "Quan tâm"),
        ("search_results", [None, None, "Phụ", None, None], "Quan tâm"),
        ("search_trends", ["Phụ", None, None, None, "Phụ"], "Chưa rõ bước"),
        ("population_stats", ["Phụ", None, None, None, None], "Chưa rõ bước"),
        ("simulated_personas", ["Phụ", None, None, None, None], "Chưa rõ bước"),
        ("ai_answer", [None, "Gợi ý", "Gợi ý", None, None], "Chưa rõ bước"),
    ]
    coded_p2.share()
    plan = coded_p2.call("report_plan")
    assert sum(len(part(plan, n)["sources"]) for n in range(4, 16)) == 65
    for n in range(4, 16):
        q = QUESTION_NOS[n - 1]
        expected = [(key, matrix[q - 1], step) for key, matrix, step in roles if matrix[q - 1]]
        actual = part(plan, n)["sources"]
        assert [(c["source"], c["role"], c["default_step"]) for c in actual] == expected
        for c in actual:
            is_partial = c["role"] == "Phụ" and not (c["source"] == "tiktok_shop_reviews" and q in (4, 5))
            assert c["partial"] is is_partial


def test_im_q58_ids_match_the_correct_direct_tool_and_are_deterministic(coded_p2):
    """NC: portrait IDs in a theme part or invented plan IDs fail exact membership."""
    themes = coded_p2.call("theme_counts")
    portraits = coded_p2.call("portrait_counts")
    plan = coded_p2.call("report_plan")
    assert plan == coded_p2.call("report_plan")
    for n, result in [(8, themes), (4, portraits)]:
        expected = [r["count_id"] for r in result["rows"] if r["platform"] == "shopee"]
        assert expected
        assert cell(plan, n, "shopee_reviews")["count_ids"] == expected
    before = {r["count_id"]: r for r in coded_p2.box.rows("count_registry")}
    coded_p2.call("report_plan")
    assert {r["count_id"]: r for r in coded_p2.box.rows("count_registry")} == before


def test_im_q58_not_coded_is_cell_metadata_but_slayer_failure_aborts(p2, monkeypatch):
    """NC: NOT_CODED must not abort; a real numeric mismatch must abort."""
    p2.seed([review(1)])
    plan = p2.call("report_plan")
    c = cell(plan, 8, "shopee_reviews")
    assert (c["reason"], c["count_ids"], c["status"]) == ("NOT_CODED", [], "Có dữ liệu")
    assert not any(x["reason"] == "NOT_CODED" for x in plan["unanswered"])
    assert "error" not in p2.code()[0]
    real = p2.box.module._slayer_query
    monkeypatch.setattr(p2.box.module, "_slayer_query", lambda *a, **k: perturb(sync(real(*a, **k))))
    error(p2.call("report_plan"), "SLAYER_SQL_MISMATCH")


def test_im_q59_limitations_are_per_cell_and_revenue_aware(p2):
    """NC: source-deduplication gives 7 lines instead of 32; gate omission gives 27."""
    p2.seed([review(i) for i in range(1, 6)], all_sources=True)
    assert "error" not in p2.code()[0]
    first = p2.call("report_plan")
    assert len(first["unanswered"]) == 32
    tt = [x for x in first["unanswered"] if x["source"] == "tiktok_shop_reviews"]
    assert [x["part"] for x in tt] == [6, 7, 13, 14, 15]
    assert {x["reason"] for x in tt} == {"NOT_CAPTURED"}
    assert sum(x["reason"] == "NOT_COLLECTED" for x in first["unanswered"]) == 27
    for x in first["unanswered"]:
        c = cell(first, x["part"], x["source"])
        assert x["unknown"] == f'Phần {x["part"]} «{TITLES[x["part"] - 1]}»: {c["name"]}'
        assert x["step"] == c["default_step"]
        assert x["why"] == ("Bản 1 chưa thu nguồn này" if x["reason"] == "NOT_COLLECTED" else "Lần chạy chưa thu nguồn này")
        assert x["needs"] == f'Thu {c["name"]} cho lần chạy'
    p2.box.replace_sources([review(1), review(2, platform="tiktok_shop", name="synthetic_limit_writer")],
                           keywords=KEYWORDS, trends=[{"location": "Tỉnh thử", "extracted_value": 12}])
    assert "error" not in p2.call("build_warehouse")
    assert "error" not in p2.code()[0]
    unknown = p2.call("report_plan")
    assert len(unknown["unanswered"]) == 32
    for x in [x for x in unknown["unanswered"] if x["source"] == "tiktok_shop_reviews"]:
        assert x["reason"] == "REVENUE_SHARE_UNKNOWN"
        assert x["why"] == "Chưa biết TikTok Shop chiếm bao nhiêu doanh thu"
        assert x["needs"] == "Ghi tỉ lệ doanh thu TikTok Shop cho lần chạy"
    p2.share(49.9)
    below = p2.call("report_plan")
    for x in [x for x in below["unanswered"] if x["source"] == "tiktok_shop_reviews"]:
        assert x["why"] == "TikTok Shop chiếm dưới 50% doanh thu" and x["needs"] is None
    p2.share(50)
    passed = p2.call("report_plan")
    assert len(passed["unanswered"]) == 27
    assert all(x["source"] != "tiktok_shop_reviews" for x in passed["unanswered"])


def test_im_q60_plan_potential_is_separate_from_a_synthesis_claim(coded_p2, keyword_groups):
    """NC: min cell aggregation and assigning max basis as synthesis ceiling fail."""
    initial = coded_p2.call("report_plan")
    assert all(part(initial, n)["ceiling"] in {"Yếu", "Không"} for n in range(4, 16))
    groups = keyword_groups(approved=True)
    row = keyword_row(coded_p2.box)
    coded_p2.diversity(row["count_id"])
    coded_p2.method("keyword_counts:search_suggestions:" + groups["version"])
    plan = coded_p2.call("report_plan")
    assert cell(plan, 6, "search_suggestions")["ceiling"] == part(plan, 6)["ceiling"] == "Khá"
    assert any(c["ceiling"] == "Không" for c in part(plan, 6)["sources"])
    for n in (1, 16, 17):
        assert part(plan, n)["ceiling"] is None
        assert part(plan, n)["potential_ceiling"] == "Khá"


@pytest.mark.parametrize("run_id,expected", [(RUN, "WAREHOUSE_NOT_BUILT"), (OTHER, "RUN_NOT_FOUND"), ("aaaaaaaa", "RUN_AMBIGUOUS")])
def test_im_q61_run_resolution_errors_have_no_parts(p2, run_id, expected):
    """NC: no fallback to another run or unbuilt warehouse is allowed."""
    p2.box.seed([])
    if expected == "RUN_AMBIGUOUS":
        p2.box.seed([], run_id=AMBIGUOUS)
        for rid in (RUN, AMBIGUOUS):
            assert "error" not in p2.box.call("build_warehouse", rid)
    error(p2.box.call("report_plan", run_id), expected)


@pytest.mark.parametrize("name", [
    "Gợi ý tìm kiếm Google", "METRIC", "Metric", "OpenAI", "Gemini", "CloakBrowser",
    "World Bank", "gpt-synthetic-model", "CLAUDE-synthetic", "aPiFy", "SLAYER",
])
def test_im_q61_hidden_names_are_rejected_in_frame_copies(p2, frame, name):
    """NC: each formerly omitted AI/collector/Metric/model name independently fails."""
    p2.seed([], keywords=KEYWORDS)
    data = frame()
    next(s for s in data["sources"] if s["key"] == "search_suggestions")["name"] = name
    frame(data)
    error(p2.call("report_plan"), "FRAME_INVALID")


@pytest.mark.parametrize("name", ["metric tons", "Shopee", "TikTok Shop", "xOpenAIx", "_Gemini_", "METRICx"])
def test_im_q61_allowed_names_and_unicode_edges_load(p2, frame, name):
    """NC: case-insensitive Metric or substring matching wrongly rejects these."""
    p2.seed([], keywords=KEYWORDS)
    data = frame()
    next(s for s in data["sources"] if s["key"] == "search_suggestions")["name"] = name
    frame(data)
    plan = p2.call("report_plan")
    reader_scan(plan)
    assert cell(plan, 6, "search_suggestions")["name"] == name


def test_im_q61_full_name_list_tracks_the_app_without_importing_it(coded_p2):
    """NC: removing OpenAI from the module list fails the independent drift guard."""
    path = coded_p2.box.insight.parents[1] / "src/modules/analysis/report-language/hidden-names.ts"
    text = path.read_text()
    groups = re.findall(r"\['(?:DATA|TOOL|AI_SEARCH|PUBLIC_REVIEW)',\s*\[(.*?)\]\]", text)
    names = {name for group in groups for name in re.findall(r"'([^']+)'", group)}
    assert len(names) == 26
    actual = set(coded_p2.box.module.HIDDEN_NAMES)
    assert names | {"World Bank", "SLAYER"} <= actual
    with pytest.raises(AssertionError):
        assert names <= actual - {"OpenAI"}
    reader_scan(coded_p2.call("report_plan"))
    assert all(c["source"] != "google_suggest" for p in coded_p2.call("report_plan")["parts"] for c in p["sources"])


@pytest.mark.parametrize("mixed", [False, True])
def test_im_q74_count_items_preserve_how_to_unknown_stage(p2, mixed):
    """NC: source-default Quan tâm must neither replace nor add to unknown steps."""
    p2.seed([], keywords=["cách uống kẽm", "uống canxi lúc nào tốt nhất"] + (KEYWORDS if mixed else []))
    before = p2.call("keyword_counts")
    plan = p2.call("report_plan")
    c = cell(plan, 12, "search_suggestions")
    assert c["default_step"] == "Quan tâm"
    assert c["count_items"] == [{"count_id": r["count_id"], "tool": "keyword_counts", "step": r["step"]}
                                 for r in before["rows"]]
    assert c["count_ids"] == [x["count_id"] for x in c["count_items"]]
    expected = ["Quan tâm", "Chưa rõ bước"] if mixed else ["Chưa rõ bước"]
    assert c["steps"] == part(plan, 12)["steps"] == expected
    assert p2.call("keyword_counts") == before
    assert before["step_totals"]["Quan tâm"] == (5 if mixed else 0)

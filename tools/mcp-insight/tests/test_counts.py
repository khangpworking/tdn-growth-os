"""Fixed semantic counts, thresholds, platform boundaries and retained IDs."""

import copy
import json
import re
import shutil
import unicodedata

import pytest

from insight_test_support import (
    OPTIONS, RUN, UNKNOWN_NOTE, VERSION, canonical, choice, error, label_all,
    review, sync, theme_row, tree_snapshot,
)
from test_boundaries import perturb


def build_and_code(box, rows, *, keywords=(), policy=None):
    box.seed(rows, keywords=keywords)
    assert "error" not in box.call("build_warehouse")
    result, _ = box.code(policy or label_all())
    assert "error" not in result


def test_im_q22_real_local_slayer_executes_all_fixed_measure_families(subject, sandbox, monkeypatch):
    """NC: measure/column name collision is rejected by the real model loader."""
    build_and_code(sandbox, [review(i, text=f"zqv{i} mua cho mẹ") for i in range(1, 6)],
                   keywords=["có nên uống canxi", "canxi cho bé"])
    real, seen = subject._slayer_query, []

    def record(*args, **kwargs):
        result = sync(real(*args, **kwargs))  # actual local SLAYER, never canned success
        seen.append((args, kwargs))
        return result

    monkeypatch.setattr(subject, "_slayer_query", record)
    row = theme_row(sandbox.call("theme_counts"))
    assert (row["reviews"], row["writers"], row["products"]) == (5, 5, 3)
    keywords = sandbox.call("keyword_counts")
    assert sum(r["keywords"] for r in keywords["rows"]) == 2
    portraits = sandbox.call("portrait_counts")
    assert any(r.get("group") == "Mua cho bố mẹ, ông bà" and r["reviews"] == 5 for r in portraits["rows"])
    assert len(seen) >= 3
    # Mutate a copy of an actual valid model so rejection exercises the naming
    # guard, rather than feeding the loader an invented/invalid YAML envelope.
    import yaml
    directory = sandbox.root / "bad-semantic"
    shutil.copytree(sandbox.insight / "semantic", directory)

    def collide(node):
        if isinstance(node, dict):
            measures = node.get("measures")
            if isinstance(measures, list) and measures and isinstance(measures[0], dict):
                measures[0]["name"] = "platform"
                return True
            if isinstance(measures, dict) and measures:
                first = next(iter(measures))
                measures["platform"] = measures.pop(first)
                return True
            return any(collide(child) for child in node.values())
        if isinstance(node, list):
            return any(collide(child) for child in node)
        return False

    mutated = False
    for path in sorted([*directory.glob("*.yaml"), *directory.glob("*.yml")]):
        document = yaml.safe_load(path.read_text())
        if collide(document):
            path.write_text(yaml.safe_dump(document, allow_unicode=True))
            mutated = True
            break
    assert mutated, "semantic measure envelope differs; adapt the loader assumption in README"
    with pytest.raises(ValueError, match="measure|column|collision"):
        subject._load_semantic_models(directory)


@pytest.mark.parametrize("tool", ["theme_counts", "keyword_counts"])
@pytest.mark.parametrize("difference", [1, 0.5])
def test_im_q23_one_numeric_slayer_difference_refuses_all_numbers(subject, sandbox, monkeypatch, tool, difference):
    """NC: perturb one actual result; reference SQL must detect it."""
    build_and_code(sandbox, [review(i) for i in range(1, 6)], keywords=["canxi cho bé"])
    assert "error" not in sandbox.call(tool)
    real = subject._slayer_query
    def changed(*args, **kwargs):
        rows = copy.deepcopy(sync(real(*args, **kwargs)))
        measure = next(key for key, value in rows[0].items() if type(value) in (int, float))
        rows[0][measure] += difference
        return rows

    monkeypatch.setattr(subject, "_slayer_query", changed)
    error(sandbox.call(tool), "SLAYER_SQL_MISMATCH")


@pytest.mark.parametrize("run_id", ["x", "", None, True, "../../secret", "aaaaaaaa' OR 1=1", "aaaaaaaaa", "g" * 8, 7])
def test_im_q24_run_ids_are_validated_before_query(subject, sandbox, run_id):
    """NC: malformed IDs cannot become SQL, paths, or prefix queries."""
    for tool in ["build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts"]:
        error(sandbox.call(tool, run_id), "INVALID_ARGUMENT")
    assert list(sandbox.data.rglob("*.sqlite")) == []


@pytest.mark.parametrize("question", ["T-GIA' OR 1=1", "T-NOT-A-THEME", "T-GIAOHANG", "COUNT(*)"])
def test_im_q24_only_active_theme_codes_are_valid_filters(built, question):
    """NC: SQL-shaped or excluded theme input is INVALID_ARGUMENT."""
    built.code(label_all())
    error(built.call("theme_counts", question=question), "INVALID_ARGUMENT")
    valid = built.call("theme_counts", question="T-GIA")
    assert theme_row(valid)["reviews"] == 5


@pytest.mark.parametrize("outcome", ["success", "mismatch", "exception"])
def test_im_q25_slayer_per_call_temp_is_removed_on_every_exit(built, monkeypatch, outcome):
    """NC: leaked insight-slayer-* storage fails directory cleanup assertion."""
    built.code(label_all())
    semantic = built.insight / "semantic"
    before = tree_snapshot(semantic)
    real, during = built.module._slayer_query, []

    def inspect_call(*args, **kwargs):
        paths = list(built.tmp.glob("insight-slayer-*"))
        assert paths, "SLAYER storage must exist in its per-call temp directory"
        during.extend(paths)
        if outcome == "exception":
            raise RuntimeError("synthetic SLAYER failure")
        value = sync(real(*args, **kwargs))
        return perturb(value) if outcome == "mismatch" else value

    monkeypatch.setattr(built.module, "_slayer_query", inspect_call)
    result = built.call("theme_counts")
    if outcome == "mismatch":
        error(result, "SLAYER_SQL_MISMATCH")
    elif outcome == "success":
        assert theme_row(result)["reviews"] == 5
    else:
        assert "error" in result
    assert during and list(built.tmp.glob("insight-slayer-*")) == []
    assert tree_snapshot(semantic) == before
    # A second successful call uses fresh storage rather than stale mutable state.
    if outcome == "success":
        first, boundary = set(during), len(during)
        sandbox_result = built.call("theme_counts")
        assert "error" not in sandbox_result
        assert first.isdisjoint(during[boundary:])
        assert len(set(during)) >= 2


def test_im_q26_coded_review_counts_are_per_platform_even_with_zero_labels(subject, sandbox):
    """NC: 2 Shopee + 3 TikTok is an object of counts, never scalar total 5."""
    sandbox.seed([review(1), review(2)] + [review(i, platform="tiktok_shop", name=f"synthetic_{i}") for i in range(3, 6)])
    assert "error" not in sandbox.call("build_warehouse")
    error(sandbox.call("theme_counts"), "NOT_CODED")
    sandbox.code()  # all-negative but successful completion
    result = sandbox.call("theme_counts")
    assert result["coded_reviews"] == {"shopee": 2, "tiktok_shop": 3}
    assert result["rows"] == []
    assert not any(type(value) is int and value == 5 for value in result.values())
    assert result["coding_target"] == {"codebook_version": VERSION, "block_key": "thuc_pham"}


def test_im_q26_theme_rows_have_complete_contract_fields(built):
    """NC: unclear labels cannot enter counted rows or inflate kept counts."""
    def policy(body, answers, index):
        answers["T-GIA"] = choice(khen=0.69 if index == 1 else 0.9)

    built.code(policy)
    result = built.call("theme_counts")
    required = {"platform", "theme_code", "theme_name", "polarity", "step", "reviews", "writers", "products",
                "writer_basis", "threshold_count", "threshold_met", "threshold_note", "check2_missing", "check2_reason",
                "check3_missing", "check3_reason", "count_id"}
    assert all(required <= set(r) for r in result["rows"])
    assert theme_row(result)["reviews"] == 4
    assert theme_row(result, polarity="khen")["reviews"] == 4


@pytest.mark.parametrize("writers,products,met", [(4, 3, False), (5, 2, False), (5, 3, True)])
def test_im_q27_five_writers_and_three_products_are_both_inclusive(subject, sandbox, writers, products, met):
    """NC: strict > rejects 5/3; dropping product minimum accepts 5/2."""
    build_and_code(sandbox, [review(i, platform="tiktok_shop", name=f"synthetic_q27_{i}", product=i % products + 1)
                            for i in range(1, writers + 1)])
    row = theme_row(sandbox.call("theme_counts"), platform="tiktok_shop")
    assert row["writers"] == row["threshold_count"] == writers and row["products"] == products
    assert row["threshold_met"] is met
    if not met:
        assert "dưới ngưỡng" in row["threshold_note"]


@pytest.mark.parametrize("names,writers,basis,met,reason", [
    (["syntheticA", "syntheticB", "syntheticA", "syntheticB", "syntheticA"], 2, "writer", False, "BELOW_THRESHOLD"),
    ([f"synthetic{i}" for i in range(5)], 5, "writer", True, "DIVERSITY_NOT_ASSESSED"),
    ([None] * 5, 5, "review", True, "WRITER_UNKNOWN"),
    (["syntheticA"] * 4 + [None], 2, "review", False, "WRITER_UNKNOWN"),
])
def test_im_q28_named_unknown_and_mixed_writer_rules(subject, sandbox, names, writers, basis, met, reason):
    """NC: whole-row review counting, missing notes, and check-2 pass claims fail."""
    platform = "shopee" if all(n is None for n in names) else "tiktok_shop"
    build_and_code(sandbox, [review(i + 1, platform=platform, name=n) for i, n in enumerate(names)])
    row = theme_row(sandbox.call("theme_counts"), platform=platform)
    assert row["reviews"] == 5 and row["writers"] == row["threshold_count"] == writers
    assert row["writer_basis"] == basis and row["threshold_met"] is met
    assert row["check2_missing"] is True and row["check2_reason"] == reason
    assert (UNKNOWN_NOTE in row["threshold_note"]) is (basis == "review")
    if not met:
        assert "dưới ngưỡng" in row["threshold_note"]


def assert_separate_platforms(result):
    forbidden = {"total", "all_platforms", "combined"}
    assert not forbidden.intersection(result)
    for row in result["rows"]:
        assert row["platform"] in {"shopee", "tiktok_shop"}
        assert not forbidden.intersection(row)


def test_im_q29_shared_and_one_platform_only_themes_never_combine(subject, sandbox):
    """NC: positive unequal counts and one-platform U distinguish illegal aggregates."""
    rows = [review(i) for i in range(1, 7)] + [review(i, platform="tiktok_shop", name=f"synthetic_q29_{i}") for i in range(7, 10)]

    def policy(body, answers, index):
        answers["T-GIA"] = choice(khen=0.9)
        if body["platform"] == "shopee" and body["text"] != "zqv0006 mẫu thử ổn":
            answers["T-CONGDUNG"] = choice(khen=0.9)

    build_and_code(sandbox, rows, policy=policy)
    result = sandbox.call("theme_counts")
    actual = {(r["platform"], r["theme_code"]): r["reviews"] for r in result["rows"] if r["polarity"] == "all"}
    assert actual == {("shopee", "T-GIA"): 6, ("tiktok_shop", "T-GIA"): 3, ("shopee", "T-CONGDUNG"): 5}
    assert_separate_platforms(result)
    for mutant in [{**result, "total": 9}, {**result, "rows": [*result["rows"], {"platform": "all", "reviews": 9}]}]:
        with pytest.raises(AssertionError):
            assert_separate_platforms(mutant)


def test_im_q30_ids_bind_label_state_and_retain_old_numbers(built):
    """NC: source-only hashes cannot distinguish this label-only count change."""
    def policy(body, answers, index):
        answers["T-GIA" if index != 5 else "T-CONGDUNG"] = choice(khen=0.9)

    built.code(policy)
    first = built.call("theme_counts")
    assert built.call("theme_counts") == first
    ids = [r["count_id"] for r in first["rows"]]
    assert len(set(ids)) == len(ids) and all(re.fullmatch(r"IMC-[0-9a-f]{12}", i) for i in ids)
    source_hash = built.call("build_warehouse")["content_sha256"]
    old = theme_row(first)
    assert old["reviews"] == 4
    old_registry = {r["count_id"]: r for r in built.rows("count_registry")}
    built.sql("UPDATE label SET theme_code='T-GIA' WHERE theme_code='T-CONGDUNG'")
    current = theme_row(built.call("theme_counts"))
    assert current["reviews"] == 5 and current["count_id"] != old["count_id"]
    # Read run source metadata without rebuilding away the deliberately mutated label.
    assert source_hash == built.rows("run_facts")[0]["content_sha256"]
    registry = {r["count_id"]: r for r in built.rows("count_registry")}
    assert registry[old["count_id"]] == old_registry[old["count_id"]]
    assert json.loads(registry[old["count_id"]]["numbers_json"])["reviews"] == 4
    assert json.loads(registry[current["count_id"]]["numbers_json"])["reviews"] == 5
    # Existing count ID with conflicting numbers must fail closed.
    wrong = json.loads(registry[current["count_id"]]["numbers_json"])
    wrong["reviews"] = 999
    built.sql("UPDATE count_registry SET numbers_json=? WHERE count_id=?", (canonical(wrong), current["count_id"]))
    error(built.call("theme_counts"), "COUNT_ID_CONFLICT")


KEYWORDS = [
    ("canxi có tác dụng phụ không", "tac_dung_phu"), ("canxi nano vs canxi hữu cơ", "so_sanh"),
    ("uống canxi lúc nào tốt nhất", "cach_dung"), ("canxi cho bà bầu uống khi nào", "cach_dung"),
    ("canxi cho bà bầu loại nào tốt", "cho_ai"), ("kẽm cho bé loại nào tốt", "cho_ai"),
    ("có nên uống canxi", "co_nen"), ("review canxi nano", "co_nen"),
    ("canxi loại nào tốt", "loai_nao"), ("canxi của nhật", "loai_nao"),
    ("cách uống kẽm", "cach_dung"), ("canxi giá bao nhiêu", "khac"),
]


@pytest.mark.parametrize("keyword,group", KEYWORDS)
def test_im_q31_frozen_keyword_membership_and_priority(subject, sandbox, keyword, group):
    """NC: overlapping phrases must select the first group in frozen file order."""
    sandbox.seed([], keywords=[keyword])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("keyword_counts")
    assert [(r["group_key"], r["keywords"]) for r in result["rows"]] == [(group, 1)]
    assert result["keyword_groups_version"] == "kwg-2026-10-30.1"
    assert result["keyword_groups_status"] == "UNREVIEWED"
    assert result["rows"][0]["platform"] == "google"
    expected_names = {"tac_dung_phu": "Tác dụng phụ, an toàn", "so_sanh": "So sánh",
                      "cach_dung": "Cách dùng, khi nào dùng", "cho_ai": "Cho ai dùng",
                      "co_nen": "Có nên dùng", "loai_nao": "Loại nào, hãng nào", "khac": "Khác"}
    row = result["rows"][0]
    assert row["group_name"] == expected_names[group]
    assert row["step"] == ("Chưa rõ bước" if group in {"cach_dung", "khac"} else "Quan tâm")
    assert row["threshold_met"] is False and "dưới ngưỡng" in row["threshold_note"]
    assert re.fullmatch(r"IMC-[0-9a-f]{12}", row["count_id"])


@pytest.mark.parametrize("count", [4, 5])
def test_im_q31_distinct_normalized_keywords_and_threshold(subject, sandbox, count):
    """NC: four is below, five meets; case/spacing/NFC variants count once."""
    keywords = [f"có nên uống mẫu thử {i}" for i in range(count)]
    keywords += ["  CÓ NÊN   UỐNG MẪU THỬ 0 ", "có nên uống mẫu thử 0", unicodedata.normalize("NFD", keywords[0])]
    sandbox.seed([], keywords=keywords)
    assert "error" not in sandbox.call("build_warehouse")
    row = sandbox.call("keyword_counts")["rows"][0]
    assert row["group_key"] == "co_nen" and row["keywords"] == count
    assert row["threshold_met"] is (count == 5)
    if count == 4:
        assert "dưới ngưỡng" in row["threshold_note"]


def test_im_q31_usage_and_other_are_not_added_to_interest_step(subject, sandbox):
    """NC: trying loai_nao before cach_dung incorrectly adds the second term."""
    sandbox.seed([], keywords=["cách uống kẽm", "uống canxi lúc nào tốt nhất", "canxi giá bao nhiêu"])
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("keyword_counts")
    assert {r["group_key"]: r["keywords"] for r in result["rows"]} == {"cach_dung": 2, "khac": 1}
    assert result["step_totals"]["Quan tâm"] == 0
    assert all(r["step"] == "Chưa rõ bước" for r in result["rows"])


@pytest.mark.parametrize("status", ["DRAFT", "APPROVED"])
def test_im_q32_no_check3_pass_without_sample_review_evidence(built, codebook, status):
    """NC: APPROVED alone with null reviewer metadata still leaves check 3 missing."""
    data = codebook()
    data["status"] = status
    codebook(data)
    built.code(label_all())
    rows = built.call("theme_counts")["rows"]
    assert rows and all(r["check3_missing"] is True and r["check3_reason"] for r in rows)


def test_im_q44_kept_unclear_direction_counts_only_all_and_unknown(built):
    """NC: argmax without direction=0.5 would incorrectly produce a khen row."""
    def policy(body, answers, index):
        if index == 1:
            answers["T-GIA"] = choice(khen=0.40, che=0.35, ke=0, no=0.25)

    built.code(policy)
    result = built.call("theme_counts")
    assert {(r["polarity"], r["reviews"]) for r in result["rows"]} == {("all", 1), ("khong_ro_huong", 1)}
    assert built.rows("label")[0]["polarity"] == "khong_ro_huong"


def test_im_q45_partial_new_block_filters_old_labels_and_state(subject, sandbox):
    """NC: dropping the current-state join returns 5 and a false threshold pass."""
    build_and_code(sandbox, [review(i, platform="tiktok_shop", name=f"synthetic_q45_{i}") for i in range(1, 6)])
    assert theme_row(sandbox.call("theme_counts"), platform="tiktok_shop")["reviews"] == 5

    def fail_second(body, answers, index):
        if index == 2:
            raise RuntimeError("synthetic new-block failure")
        answers["T-GIA"] = choice(khen=0.9)

    result, fake = sandbox.code(fail_second, block_override="my_pham")
    assert len(fake.calls) == 2 and result["stopped"] == "JEV_THEME_UNAVAILABLE"
    counts = sandbox.call("theme_counts")
    assert counts["coding_target"] == {"codebook_version": VERSION, "block_key": "my_pham"}
    row = theme_row(counts, platform="tiktok_shop")
    assert row["reviews"] == 1 and row["threshold_met"] is False


@pytest.mark.parametrize("named_only", [False, True])
def test_im_q50_owner_mixed_case_shared_by_theme_and_portrait(subject, sandbox, named_only):
    """NC: named-only/collapsed-unknown counting, missing note or wrong reason fail."""
    names = [f"synthetic_q50_{i}" for i in range(5)] if named_only else ["synthetic_q50_named"] + [None] * 4
    build_and_code(sandbox, [review(i + 1, platform="tiktok_shop", name=name,
                                    text=f"zqv50{i} mua cho mẹ") for i, name in enumerate(names)])
    theme = theme_row(sandbox.call("theme_counts"), platform="tiktok_shop")
    portrait = sandbox.call("portrait_counts")
    groups = [r for r in portrait["rows"] if r.get("dimension") == "Mua cho ai"
              and r["group"] == "Mua cho bố mẹ, ông bà" and r["platform"] == "tiktok_shop"]
    assert len(groups) == 1
    for row in [theme, groups[0]]:
        assert (row["reviews"], row["writers"], row["products"], row["threshold_count"]) == (5, 5, 3, 5)
        assert row["threshold_met"] is True and row["check2_missing"] is True
        assert row["writer_basis"] == ("writer" if named_only else "review")
        assert (UNKNOWN_NOTE in row["threshold_note"]) is (not named_only)
        assert row["check2_reason"] == ("DIVERSITY_NOT_ASSESSED" if named_only else "WRITER_UNKNOWN")

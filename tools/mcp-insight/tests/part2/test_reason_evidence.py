"""R-IM09: pair-specific readings, exact-text freshness, local raw reads."""

import copy
import re
import unicodedata

import pytest

from insight_test_support import OTHER, RUN, VERSION, choice, error, review, sha, sync
from p2_support import (
    PAIR, RULES, candidate_ids, reason_row, registry_numbers,
)
from test_boundaries import perturb


def test_im_q69_baseline_r1_r13_counts_checked_pairs_per_platform(reason_baseline_r1_r13):
    """NC: co-occurrence, substring do, unclear/stale labels and unverified candidates fail.

    Baseline excludes R12's separate interrupted-target scenario and lifecycle
    R14/R15. Its expected Shopee count is therefore exactly R1, never R15.
    """
    p2 = reason_baseline_r1_r13
    result = p2.links()
    assert result["run_id"] == RUN
    assert (result["theme_a"], result["theme_b"]) == PAIR
    assert result["connectors"] == ["vì", "nên", "do", "để"]
    assert result["link_basis"] == "CHECKED_READING"
    assert {r["platform"] for r in result["rows"]} == {"shopee", "tiktok_shop"}
    row = reason_row(result)
    assert (row["reviews"], row["review_ids"]) == (1, ["shopee:1"])
    assert reason_row(result, "tiktok_shop")["review_ids"] == ["tiktok_shop:20"]
    assert reason_row(result, "tiktok_shop")["reviews"] == 1
    assert candidate_ids(result) == sorted([f"shopee:{i}" for i in (6, 7, 8, 9, 10)])
    assert candidate_ids(result, "tiktok_shop") == []
    assert all(set(c) == {"platform", "review_ids"} for c in result["candidates"])
    # The unrelated price reason, recommendation nên and storage-duration để
    # are reading candidates; a connector alone cannot establish this pair.
    p2.reading("shopee:6", False)
    assert candidate_ids(p2.links()) == sorted([f"shopee:{i}" for i in (7, 8, 9, 10)])
    assert reason_row(p2.links())["review_ids"] == ["shopee:1"]


def test_im_q69_wrong_target_r12_uses_real_interrupted_block_change(p2):
    """NC: joining all kept labels leaks T-VI from the old thuc_pham target."""
    p2.seed([review(1, text="zqvr12a ngon vì chính hãng"), review(12, text="zqv82 ngon vì chính hãng")], keywords=())
    assert "error" not in p2.code()[0]
    p2.reading("shopee:12")

    def interrupted(body, answers, index):
        if index == 2:
            raise RuntimeError("synthetic interrupted target")
        answers["T-CHINHHANG"] = choice(khen=0.9)

    result, fake = p2.code(interrupted, block_override="my_pham")
    assert result["stopped"] == "JEV_THEME_UNAVAILABLE" and len(fake.calls) == 2
    assert p2.box.rows("label", "WHERE review_id=? AND theme_code=? AND status='kept'", ("shopee:12", "T-VI"))
    assert reason_row(p2.links())["review_ids"] == []
    assert candidate_ids(p2.links()) == []


def test_im_q69_lifecycle_r14_changed_text_requires_a_new_reading_after_recode(reason_lifecycle_r14):
    """NC R2-1: current kept labels after recoding cannot revive an old-text verdict."""
    p2 = reason_lifecycle_r14
    assert reason_row(p2.links())["review_ids"] == ["shopee:14"]
    old_hash = sha("zqv80 ngon vì chính hãng")
    changed = "zqv81 vị ngon, chính hãng; rẻ nên mua"
    p2.box.replace_sources([review(14, text=changed)])
    assert "error" not in p2.call("build_warehouse")
    # The freshness assertion is deliberately AFTER successful fake recoding,
    # so stale-label rejection alone cannot satisfy this control.
    result, fake = p2.code()
    assert "error" not in result and len(fake.calls) == 1
    labels = p2.box.rows("label", "WHERE review_id=? AND status='kept'", ("shopee:14",))
    assert {r["theme_code"] for r in labels} == set(PAIR)
    assert p2.box.rows("coding_state", "WHERE review_id=? AND codebook_version=? AND block_key='thuc_pham'",
                       ("shopee:14", VERSION))
    assert p2.rows("reason_check")[0]["text_sha256"] == old_hash
    candidate = p2.links()
    assert reason_row(candidate)["review_ids"] == [] and reason_row(candidate)["reviews"] == 0
    assert candidate_ids(candidate) == ["shopee:14"]
    assert p2.box.rows("reason_verdict") == []
    p2.reading("shopee:14", False)
    negative = p2.links()
    assert reason_row(negative)["review_ids"] == [] and candidate_ids(negative) == []
    p2.reading("shopee:14", True)
    positive = p2.links()
    assert reason_row(positive)["review_ids"] == ["shopee:14"] and candidate_ids(positive) == []
    assert [r["text_sha256"] for r in p2.rows("reason_check")] == [old_hash, sha(changed), sha(changed)]


def test_im_q69_lifecycle_r15_identical_text_reading_survives_rebuild(reason_lifecycle_r15):
    """NC: blanket rebuild invalidation wrongly discards an unchanged-text reading."""
    p2 = reason_lifecycle_r15
    first = p2.links()
    before = p2.rows("reason_check")
    assert reason_row(first)["review_ids"] == ["shopee:15"]
    assert "error" not in p2.call("build_warehouse")
    after = p2.links()
    assert reason_row(after)["reviews"] == 1 and reason_row(after)["review_ids"] == ["shopee:15"]
    assert candidate_ids(after) == []
    assert p2.rows("reason_check") == before


@pytest.mark.parametrize("connector", ["VÌ", "nên", "do", "để", unicodedata.normalize("NFD", "vì")])
def test_im_q69_connectors_normalize_nfc_case_and_require_word_edges(p2, connector):
    """NC: ASCII-only/literal matching loses accented, uppercase or NFD connectors."""
    p2.seed([review(1, text=f"zqvword ngon {connector} chính hãng")], keywords=())
    assert "error" not in p2.code()[0]
    p2.reading("shopee:1")
    assert reason_row(p2.links())["review_ids"] == ["shopee:1"]
    p2.box.replace_sources([review(1, text=f"zqvword2 ngon x{connector}7 chính hãng")])
    assert "error" not in p2.call("build_warehouse")
    assert "error" not in p2.code()[0]
    p2.reading("shopee:1")
    assert reason_row(p2.links())["review_ids"] == []


@pytest.mark.parametrize("pair", [("T-GIAOHANG", "T-VI"), ("T-VI", "T-VI"), ("T-NO", "T-VI")])
def test_im_q70_invalid_theme_pair_and_uncoded_run(p2, pair):
    """NC: excluded, equal and unknown themes cannot reach relation counting."""
    p2.seed([review(1)])
    error(p2.links(pair), "INVALID_ARGUMENT")
    error(p2.links(), "NOT_CODED")


def test_im_q70_missing_store_candidates_and_materialized_verdicts(coded_p2):
    """NC: no-store matches are candidates, not counts; text never enters caches."""
    assert not coded_p2.store.exists()
    result = coded_p2.links()
    assert reason_row(result)["reviews"] == 0
    assert candidate_ids(result) == [f"shopee:{i}" for i in range(1, 6)]
    assert not coded_p2.store.exists()
    assert coded_p2.box.rows("reason_verdict") == []
    flags = coded_p2.box.rows("reason_flag")
    assert len(flags) == 10 and {r["rules_version"] for r in flags} == {RULES}
    coded_p2.reading("shopee:1")
    coded_p2.reading("shopee:2", False)
    coded_p2.links()
    assert {(r["review_id"], r["theme_pair"], r["linked"]) for r in coded_p2.box.rows("reason_verdict")} == {
        ("shopee:1", "T-CHINHHANG|T-VI", 1), ("shopee:2", "T-CHINHHANG|T-VI", 0)}
    coded_p2.scan_storage()


def test_im_q70_real_slayer_difference_rejects_counts_and_candidates(coded_p2, monkeypatch):
    """NC: removing the independent SQL comparison accepts a perturbed real count."""
    coded_p2.reading("shopee:1")
    assert reason_row(coded_p2.links())["reviews"] == 1
    real = coded_p2.box.module._slayer_query
    seen = []

    def changed(*args, **kwargs):
        value = sync(real(*args, **kwargs))
        seen.append((args, kwargs))
        return perturb(value)

    monkeypatch.setattr(coded_p2.box.module, "_slayer_query", changed)
    error(coded_p2.links(), "SLAYER_SQL_MISMATCH")
    assert seen, "reason evidence must execute the real local semantic boundary"


@pytest.mark.parametrize("replacement", [False, True])
def test_im_q71_ids_bind_contributor_membership_and_retain_old_snapshot(reason_baseline_r1_r13, replacement):
    """NC: count-only hashes fail equal-count replacement; sorted pair reversal is stable."""
    p2 = reason_baseline_r1_r13
    first = p2.links()
    old = reason_row(first)
    assert old["reviews"] == 1 and old["review_ids"] == ["shopee:1"]
    assert re.fullmatch(r"IMC-[0-9a-f]{12}", old["count_id"])
    assert p2.links() == first
    old_registry = copy.deepcopy(registry_numbers(p2.box, old["count_id"]))
    if replacement:
        p2.reading("shopee:1", False)
    p2.reading("shopee:8")
    changed = p2.links()
    current = reason_row(changed)
    expected = ["shopee:8"] if replacement else ["shopee:1", "shopee:8"]
    assert current["reviews"] == len(expected) and current["review_ids"] == expected
    assert current["count_id"] != old["count_id"]
    assert registry_numbers(p2.box, old["count_id"]) == old_registry
    assert old_registry["reviews"] == 1 and old_registry["review_ids"] == ["shopee:1"]
    reverse = p2.links(PAIR[::-1])
    assert reverse["rows"] == changed["rows"] and reverse["candidates"] == changed["candidates"]


def test_im_q72_local_read_is_exact_ordered_deduplicated_and_private(p2):
    """NC: truncation, raw writer metadata and cross-run lookup fail explicit controls."""
    rows = [review(i, text=f"zqvread{i} mẫu thử "+("a\nb" if i == 1 else "ổn")) for i in range(1, 20)]
    rows += [review(20, platform="tiktok_shop", name="synthetic_raw_writer1992", text="zqvread20 mẫu thử")]
    p2.seed(rows, keywords=())
    p2.box.seed([review(99, text="zqvforeign mẫu thử")], run_id=OTHER)
    assert "error" not in p2.box.call("build_warehouse", OTHER)
    ids = ["tiktok_shop:20"] + [f"shopee:{i}" for i in range(19, 0, -1)]
    result = p2.call("read_reviews", ids=ids + ids[:5])
    assert result["run_id"] == RUN and result["not_found"] == []
    assert result["notice"] == "Chỉ để đọc trên máy chủ. Không đưa chữ này vào báo cáo (R-I11)."
    assert [r["review_id"] for r in result["reviews"]] == ids
    expected = {r["platform"] + ":" + r["id"]: r for r in rows}
    for r in result["reviews"]:
        assert set(r) == {"review_id", "platform", "text"}
        assert r["text"].encode("utf-8") == expected[r["review_id"]]["text"].encode("utf-8")
        assert r["platform"] == expected[r["review_id"]]["platform"]
    foreign = p2.call("read_reviews", ids=["shopee:99", "shopee:1", "shopee:99"])
    assert foreign["not_found"] == ["shopee:99"]
    assert [r["review_id"] for r in foreign["reviews"]] == ["shopee:1"]
    assert "synthetic_raw_writer1992" not in str(result) and "w:" not in str(result)


@pytest.mark.parametrize("ids", [[], [1], [None], ["shopee:1", False], [f"shopee:{i}" for i in range(21)]])
def test_im_q72_invalid_read_request_never_truncates_or_returns_text(coded_p2, ids):
    """NC: 21 distinct IDs must error, even if some do not exist; no truncation."""
    error(coded_p2.call("read_reviews", ids=ids), "INVALID_ARGUMENT")

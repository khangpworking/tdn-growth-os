"""Independent arithmetic for R-IM15–R-IM18, all counts through real local SLAYER."""

import copy
import datetime as dt
import json
import random
import shutil
import unicodedata

import pytest

from claim_support import BOTH, BURST, ONE, THEME, catalogue
from insight_test_support import UNKNOWN_NOTE, canonical, error, review, sync
from p2_support import registry_numbers


def grouped(p4):
    return {r["review_id"]: r["group_id"] for r in p4.box.rows("near_dup")}


@pytest.mark.parametrize("left,right,merged", [
    ("q00 q01 q02 q03 q04 q05 q06 q07 q08 q09 q10", "q00 zz01 q02 q03 q04 q05 q06 q07 q08 q09 q10", True),
    ("q00 q01 q02 q03 q04 q05 q06 q07 q08 q09 q10", "q00 zzz01 q02 q03 q04 q05 q06 q07 q08 q09 q10", False),
    ("q00 q01 q02 q03 q04 q05 q06", "q00 q01 q02 q03 q04 q05 q06", False),
    ("q00 q01 q02 q03 q04 q05 q06 q07", "q00 q01 q02 q03 q04 q05 q06 q07", True),
    (unicodedata.normalize("NFD", "Zqv300: Rất TỐT, dùng ổn định cả tháng nay!"),
     "zqv300 rất tốt dùng ổn định cả tháng nay", True),
])
def test_im_q146_exact_jaccard_minimum_words_normalization_and_stable_minimum_id(p4, left, right, merged):
    """NC: >0.80, >=9 words or missing NFC/case/punctuation steps fail distinct pairs."""
    # Independently reviewed shingle constants: base 40; intersection 36;
    # unions 45 (36/45=0.80) and 46 (36/46<0.80). No production similarity helper.
    p4.seed([review(20, text=right), review(10, text=left)])
    groups = grouped(p4)
    assert (groups["shopee:10"] == groups["shopee:20"]) is merged
    assert groups["shopee:10"] == "shopee:10"
    if merged: assert groups["shopee:20"] == "shopee:10"


def test_im_q146_transitive_components_are_run_wide_across_platforms_and_themes(p4):
    """NC: pair-only or per-theme/platform clustering cannot connect both endpoints through the bridge."""
    # Each edge changes two characters in one word: 71/81 4-gram
    # Jaccard. Two edits give 66/86 <.80, so the fourth is near only
    # the third and needs transitive component grouping.
    base = [f"q{i:02d}" for i in range(20)]
    texts = []
    for n in range(4):
        words = base[:]
        for i in (2, 8, 14)[:n]: words[i] = "zz" + words[i][2:]
        texts.append(" ".join(words))
    p4.seed([review(i + 1, platform="shopee" if i < 2 else "tiktok_shop", text=t)
             for i, t in enumerate(texts)])
    groups = grouped(p4)
    assert set(groups.values()) == {"shopee:1"}
    p4.catalogue()
    p4.code_claims()
    a = p4.row()["evidence"]
    p4.catalogue(catalogue("T-VI"), theme="T-VI")
    p4.code_claims()
    assert p4.row()["evidence"] == a == 1 and grouped(p4) == groups
    assert len(p4.box.rows("review")) == 4


def test_im_q147_duplicates_reduce_evidence_without_deleting_records(p4):
    """NC: deleting duplicate records returns one review instead of three and loses stored labels."""
    long = " ".join(f"q{i:02d}" for i in range(20))
    p4.seed([review(i, text=long) for i in range(1, 4)] + [review(i, text="ngon quá") for i in range(4, 9)])
    p4.catalogue()
    p4.code_claims(lambda body, n: {p4.codes[0]: .9 if n <= 3 else .1, "GEN": .1 if n <= 3 else .9})
    first, generic = p4.row(), p4.row(p4.codes[-1])
    assert (first["reviews"], first["evidence"], first["merged_reviews"]) == (3, 1, 2)
    assert (generic["reviews"], generic["evidence"]) == (5, 5)
    assert len(p4.box.rows("review")) == len(p4.box.rows("claim_label")) == 8


def test_im_q148_five_measures_and_shop_identity(p4):
    """NC: treating a Shopee product key as its shop overcounts 3 shops instead of 2."""
    rows = [review(i, product=(i - 1) % 3 + 1, text=f"zqvmeasure{i} fixture") for i in range(1, 7)]
    for r in rows: r["shop"] = "11" if r["product"] in {"1", "2"} else "12"
    rows[0]["text"] = rows[1]["text"] = "q00 q01 q02 q03 q04 q05 q06 q07"
    p4.seed(rows)
    p4.catalogue()
    p4.code_claims(lambda body, n: {"SPEC": .9 if n <= 4 else .1})
    row = p4.row()
    assert (row["reviews"], row["evidence"], row["merged_reviews"], row["products"], row["shops"],
            row["specific"], row["specific_share"]) == (6, 5, 1, 3, 2, 4, .67)
    assert row["step"] == "Sau mua" and row["catalogue_version"] == 1
    assert set(row) == {"platform", "theme_code", "catalogue_version", "claim_code", "claim_name", "generic",
        "step", "reviews", "evidence", "merged_reviews", "writers", "writer_basis", "threshold_count",
        "threshold_met", "threshold_note", "products", "shops", "top_product_share", "specific", "specific_share",
        "dated_reviews", "max_7day", "flags", "on_both_platforms", "count_id"}


def test_im_q148_im_q156_all_attribute_only_themes_succeed_with_zero_sample(p4):
    """NC: NOT_CODED, dropped zero-sample platforms or NaN violates excluded-only accounting."""
    p4.seed([review(i, platform="shopee" if i <= 3 else "tiktok_shop", text="", attributes=["Công dụng: canxi"])
             for i in range(1, 6)])
    p4.catalogue()
    result, fake = p4.code_claims()
    assert fake.calls == []
    counts = p4.counts()
    assert counts["rows"] == [] and set(counts["platforms"]) == {"shopee", "tiktok_shop"}
    for platform, n in (("shopee", 3), ("tiktok_shop", 2)):
        data = counts["platforms"][platform]
        assert data["attribute_only"] == n and data["sample"] == data["spam"] == data["no_claim"] == 0
        assert data["no_claim_share"] is data["claims_per_review"] is data["period"] is None
        assert data["e15"] is False and not data.get("e15_note") and data["dated_sample"] == 0
        assert data["saturation"] == dict(seed=42, reviews=0, curve=[], claims_reaching_3=0, last_new_claim_at=None)
        assert data["ranking"] == dict(specific=[], generic=None, measure="bằng chứng sau khi gộp lời gần trùng")


def test_im_q148_im_q156_spam_only_platform_stays_present_and_uncoded_is_distinct(p4):
    """NC: listing platforms from sample alone erases Shopee's four spam records."""
    p4.seed([review(i, platform="shopee" if i <= 4 else "tiktok_shop") for i in range(1, 8)])
    p4.catalogue()
    error(p4.call("claim_counts", theme_code=THEME, catalogue_version=1), "NOT_CODED")
    p4.code_claims(lambda body, n: {"RAC": .9 if body["platform"] == "shopee" else .1})
    result = p4.counts()
    assert result["platforms"]["shopee"]["sample"] == 0
    assert result["platforms"]["shopee"]["spam"] == 4
    assert result["platforms"]["tiktok_shop"]["sample"] == 3
    assert all(r["platform"] == "tiktok_shop" for r in result["rows"])
    p4.packet()
    samples = [json.loads(line) for line in (p4.packet_dir / "sample.jsonl").read_text().splitlines()]
    assert len(samples) == 3 and {r["platform"] for r in samples} == {"tiktok_shop"}


@pytest.mark.parametrize("top,total,share,flagged", [(31, 36, .86, True), (28, 36, .78, False),
    (4, 5, .8, True), (159, 200, .8, False), (160, 200, .8, True)])
def test_im_q149_top_product_flag_uses_exact_ratio_before_rounding(p4, top, total, share, flagged):
    """NC: >.80 misses 4/5; rounding before comparison wrongly flags 159/200."""
    p4.seed([review(i, product=1 if i <= top else 2) for i in range(1, total + 1)])
    p4.catalogue()
    p4.code_claims()
    row = p4.row()
    assert row["top_product_share"] == share and (ONE in row["flags"]) is flagged


@pytest.mark.parametrize("days,undated,maximum,flagged", [
    ([1, 2, 3, 4, 5, 7] + list(range(20, 191, 20)), 0, 6, True),
    ([1, 2, 3, 4, 7] + list(range(20, 201, 20)), 0, 5, False),
    ([1, 7, 40, 80, 120], 0, 2, True), ([1, 8, 40, 80, 120], 0, 1, False),
    ([1, 2, 40, 80], 0, 2, False), ([1, 2, 40, 80, 120], 0, 2, True),
    ([1, 2, 3, 4, 5] + list(range(20, 141, 20)), 0, 5, True),
    ([1, 2, 3, 4, 40, 80], 4, 4, True), ([1, 2, 3, 40, 80, 120], 4, 3, False),
])
def test_im_q150_seven_days_reviews_minimum_and_undated_denominator(p4, days, undated, maximum, flagged):
    """NC OQ39/R5-3: 8-day windows, window>=5 and dated-only denominator each fail a fixed case."""
    base = dt.date(2026, 1, 1)
    rows = [review(i + 1) for i in range(len(days) + undated)]
    for row, day in zip(rows, days): row["postedAtLocal"] = (base + dt.timedelta(days=day - 1)).isoformat()
    p4.seed(rows)
    p4.catalogue()
    p4.code_claims()
    row = p4.row()
    assert row["reviews"] == len(days) + undated and row["dated_reviews"] == len(days)
    assert row["max_7day"] == maximum and (BURST in row["flags"]) is flagged


@pytest.mark.parametrize("names,products,writers,met,basis", [
    (["writer_count_a", "writer_count_b", "writer_count_a", "writer_count_b", "writer_count_a"], 3, 2, False, "writer"),
    (["writer_count_a", "writer_count_b", "writer_count_c", "writer_count_d", "writer_count_e"], 3, 5, True, "writer"),
    ([None] * 5, 3, 5, True, "review"),
    (["writer_count_a", "writer_count_b", "writer_count_c", "writer_count_d", "writer_count_e"], 2, 5, False, "writer"),
    (["writer_count_a", "writer_count_a", "writer_count_b", "writer_count_c", None, None], 3, 5, True, "review"),
])
def test_im_q151_named_unnamed_mixed_writer_and_product_thresholds(p4, names, products, writers, met, basis):
    """NC: raw review counts, writers-only threshold and dropping/counting mixed names twice all differ."""
    platform = "shopee" if all(n is None for n in names) else "tiktok_shop"
    p4.seed([review(i + 1, platform=platform, name=name, product=i % products + 1) for i, name in enumerate(names)])
    p4.catalogue()
    p4.code_claims()
    row = p4.row(platform=platform)
    assert row["writers"] == row["threshold_count"] == writers
    assert row["threshold_met"] is met and row["writer_basis"] == basis
    if not met: assert "dưới ngưỡng" in row["threshold_note"]
    if basis == "review": assert UNKNOWN_NOTE in row["threshold_note"]


def test_im_q152_platform_rows_and_metadata_never_pool(coded_claims):
    """NC OQ36: an all row, total field or pooled curve violates exact per-platform shapes."""
    p4 = coded_claims
    # A second source rebuild keeps original claim rows; fake coding fills only new reviews.
    rows = p4.box.reviews + [review(i, platform="tiktok_shop") for i in range(101, 104)]
    p4.box.replace_sources(rows)
    p4.source_fields(rows)
    p4.call("build_warehouse")
    p4.theme_code_reviews()
    p4.code_claims()
    result = p4.counts()
    assert set(result) == {"run_id", "theme_code", "theme_name", "catalogue_version", "catalogue_status",
                           "codebook_version", "rules_version", "rows", "platforms"}
    assert set(result["platforms"]) == {"shopee", "tiktok_shop"}
    assert [(r["platform"], r["reviews"]) for r in result["rows"]] == [("shopee", 6), ("tiktok_shop", 3)]
    for row in result["rows"]: assert row["on_both_platforms"] is True and BOTH in row["flags"]
    for platform, n in (("shopee", 6), ("tiktok_shop", 3)):
        assert result["platforms"][platform]["sample"] == result["platforms"][platform]["saturation"]["reviews"] == n


@pytest.mark.parametrize("dimension", ["n_evidence", "posted_date"])
def test_im_q153_semantic_difference_never_returns_numbers_or_leaks_temp(coded_claims, monkeypatch, dimension):
    """NC: perturb actual SLAYER cells, including a date dimension's counts; Python must not bypass verification."""
    p4 = coded_claims
    # Supply dates so the dimension query has numeric rows to perturb.
    rows = copy.deepcopy(p4.box.reviews)
    for row in rows: row["postedAtLocal"] = "2026-03-01"
    p4.box.replace_sources(rows)
    p4.source_fields(rows)
    p4.call("build_warehouse")
    p4.theme_code_reviews()
    real, touched = p4.box.module._slayer_query, []
    def changed(*args, **kwargs):
        result = copy.deepcopy(sync(real(*args, **kwargs)))
        assert list(p4.box.tmp.glob("insight-slayer-*"))
        for row in result:
            if dimension in row:
                key = dimension if dimension == "n_evidence" else next(k for k, v in row.items() if type(v) in (int, float))
                row[key] += 1
                touched.append(key)
                break
        return result
    monkeypatch.setattr(p4.box.module, "_slayer_query", changed)
    error(p4.call("claim_counts", theme_code=THEME, catalogue_version=1), "SLAYER_SQL_MISMATCH")
    assert touched and list(p4.box.tmp.glob("insight-slayer-*")) == []


def test_im_q153_claim_models_reject_measure_column_collision(coded_claims):
    """NC: collision guard must apply to the new real claim models too."""
    import yaml
    p4 = coded_claims
    directory = p4.box.root / "claim-semantic-copy"
    shutil.copytree(p4.box.insight / "semantic", directory)
    changed = False
    for path in sorted([*directory.glob("*.yaml"), *directory.glob("*.yml")]):
        data = yaml.safe_load(path.read_text())
        if "claim_label" not in canonical(data): continue
        def collide(node):
            if isinstance(node, dict):
                measures = node.get("measures")
                if isinstance(measures, dict) and "n_evidence" in measures:
                    measures["platform"] = measures.pop("n_evidence")
                    return True
                if isinstance(measures, list):
                    for measure in measures:
                        if measure.get("name") == "n_evidence": measure["name"] = "platform"; return True
                return any(collide(v) for v in node.values())
            if isinstance(node, list): return any(collide(v) for v in node)
            return False
        if collide(data):
            path.write_text(yaml.safe_dump(data, allow_unicode=True))
            changed = True
            break
    assert changed, "claim semantic model shape is unspecified; reconcile README adapter"
    with pytest.raises(ValueError, match="measure|column|collision"):
        p4.box.module._load_semantic_models(directory)


def test_im_q154_ids_keep_old_numbers_bind_flags_and_preserve_theme_ids(p4):
    """NC: shared-state contamination changes old theme IDs; omitted flags/status lose registry obligations."""
    p4.seed()
    themes = p4.call("theme_counts")
    p4.catalogue()
    p4.code_claims(max_calls=4)
    old = p4.row()
    assert p4.row()["count_id"] == old["count_id"]
    p4.code_claims()
    new = p4.row()
    assert old["count_id"] != new["count_id"]
    assert registry_numbers(p4.box, old["count_id"])["reviews"] == 4
    numbers = registry_numbers(p4.box, new["count_id"])
    assert numbers["reviews"] == 5 and numbers["flags"] == sorted(new["flags"])
    assert numbers["catalogue_status"] == "DRAFT"
    assert p4.call("theme_counts") == themes
    p4.pass_catalogue()
    passed = p4.row()
    assert passed["count_id"] != new["count_id"]
    wrong = registry_numbers(p4.box, passed["count_id"])
    wrong["reviews"] += 1
    p4.box.sql("UPDATE count_registry SET numbers_json=? WHERE count_id=?", (canonical(wrong), passed["count_id"]))
    error(p4.call("claim_counts", theme_code=THEME, catalogue_version=1), "COUNT_ID_CONFLICT")


def test_im_q155_seeded_third_mention_curve_includes_last_partial_step(p4):
    """NC: seed 13, counting unclear and dropping the final partial batch each change the literal curve."""
    p4.seed([review(i, text=f"zqvsat{i} fixture") for i in range(1, 61)])
    p4.catalogue(catalogue(size=4))
    ids = sorted(r["review_id"] for r in p4.box.rows("review"))
    random.Random(42).shuffle(ids)
    # Fixture assignments are fixed by source identity; the expected curve below
    # is hand-calculated from the independent shuffled order, not subject output.
    kept = {ids[i]: p4.codes[c] for i, c in [(0, 0), (10, 0), (24, 0),
        (25, 1), (35, 1), (49, 1), (50, 2), (58, 2), (59, 2)]}
    source_ids = {r["text"]: r["review_id"] for r in p4.box.rows("review_text")}
    def policy(body, n):
        rid = source_ids[body["text"]]
        return {code: .9 if kept.get(rid) == code else (.6 if code == p4.codes[2] else .1)
                for code in p4.codes[:-1]} | {"GEN": .1}
    p4.code_claims(policy)
    saturation = p4.counts()["platforms"]["shopee"]["saturation"]
    assert saturation == dict(seed=42, reviews=60, curve=[[25, 1], [50, 2], [60, 3]],
                             claims_reaching_3=3, last_new_claim_at=60)


@pytest.mark.parametrize("no_claim,total,spam,e15", [(22, 100, 0, True), (20, 100, 0, False), (22, 100, 20, True)])
def test_im_q156_other_share_is_strict_and_excludes_spam(p4, no_claim, total, spam, e15):
    """NC: >=20% or a denominator containing spam changes the boundary outcome."""
    p4.seed([review(i) for i in range(1, total + spam + 1)])
    p4.catalogue()
    p4.code_claims(lambda body, n: {p4.codes[0]: .6 if n <= no_claim else .9,
                                   "GEN": .1, "RAC": .9 if n > total else .1})
    data = p4.counts()["platforms"]["shopee"]
    assert data["sample"] == total and data["no_claim"] == no_claim and data["spam"] == spam
    assert data["no_claim_share"] == no_claim / total and data["e15"] is e15
    if e15: assert data["e15_note"] == "Khác trên 20%: thu thêm tối đa 1 vòng hoặc ghi rõ phần Khác"


def test_im_q157_ranking_uses_evidence_then_reviews_code_and_separates_generic(p4):
    """NC: ranking by reviews puts A before B; pooling generic puts it above all specific claims."""
    p4.seed([review(i, text="q00 q01 q02 q03 q04 q05 q06 q07" if i <= 5 else f"zqvrank{i} fixture")
             for i in range(1, 41)])
    p4.catalogue(catalogue(size=5))
    def policy(body, n):
        i = 1 if body["text"].startswith("q00 ") else int(body["text"].split()[0].removeprefix("zqvrank"))
        ps = {c: .1 for c in p4.codes[:-1]}
        if i <= 9: ps[p4.codes[0]] = .9
        elif i <= 15: ps[p4.codes[1]] = .9
        elif i <= 20: ps[p4.codes[2]] = .9; ps[p4.codes[3]] = .9
        else: ps["GEN"] = .9
        return ps
    p4.code_claims(policy)
    ranking = p4.counts()["platforms"]["shopee"]["ranking"]
    assert [r["claim_code"] for r in ranking["specific"]] == [p4.codes[i] for i in (1, 0, 2, 3)]
    assert [(r["evidence"], r["reviews"]) for r in ranking["specific"]] == [(6, 6), (5, 9), (5, 5), (5, 5)]
    assert ranking["generic"]["claim_code"] == p4.codes[-1] and ranking["generic"]["evidence"] == 20
    assert ranking["measure"] == "bằng chứng sau khi gộp lời gần trùng"
    assert all(set(r) == {"claim_code", "evidence", "reviews", "flags", "count_id"} for r in ranking["specific"])

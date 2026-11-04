"""R-IM03: the warehouse holds the app's theme labels (owner F361–F367), not model semantic accuracy.

The app labels reviews in its DB; the synthetic app DB here is labelled by `Sandbox.code`, which plays the app's
labeller with the FakeJev policies. Jev request, answer-check and cap tests moved out with the coding."""

import copy
import json
import sqlite3
import unicodedata
from pathlib import Path

import pytest

from insight_test_support import (
    EXCLUDED, VERSION, canonical, choice, error, label_all, review, sha, theme_row,
)


REFERENCE = Path(__file__).parent / "fixtures" / "reference-codebook.json"


@pytest.mark.parametrize("missing", ["status", "version"])
def test_im_q14_versioned_draft_codebook_and_required_metadata(built, codebook, missing):
    """NC: removing either required metadata field is CODEBOOK_INVALID."""
    path = Path(built.module.CODEBOOK_PATH)  # IM-Q175: the harness loads a temporary copy of the old reference
    raw = path.read_bytes()
    expected = json.loads(REFERENCE.read_text())
    actual = built.module.load_codebook()
    assert b"\r\n" not in raw
    # No assertion interprets or selects an overlap rule (owner question 15).
    actual.pop("overlaps", None)
    expected.pop("overlaps", None)
    assert actual == expected
    assert actual["version"] == VERSION and actual["status"] == "DRAFT"
    assert actual["approvedBy"] is None and actual["approvedAt"] is None
    assert len(actual["core"]) == 13
    assert {k: len(v["themes"]) for k, v in actual["blocks"].items()} == {
        "thuc_pham": 2, "dien_may": 3, "thoi_trang": 1, "my_pham": 4, "gia_dung": 2}
    assert {t["code"] for t in actual["core"]}.isdisjoint(EXCLUDED)
    assert {t["code"] for t in actual["excluded"]["codes"]} == EXCLUDED
    data = codebook()
    data.pop(missing)
    codebook(data)
    error(built.call("build_warehouse"), "CODEBOOK_INVALID")


@pytest.mark.parametrize("yes,status", [(0.49, None), (0.50, "unclear"), (0.69, "unclear"), (0.70, "kept")])
def test_im_q19_probability_boundaries_and_unclear_not_counted(built, yes, status):
    """NC: 0.69 is retained unclear and cannot increase any theme count."""
    result, _ = built.code(label_all(answer=choice(khen=yes)))
    assert "error" not in result
    labels = built.rows("label")
    assert len(labels) == (0 if status is None else 5)
    for label in labels:
        assert label["status"] == status and label["p_yes"] == pytest.approx(yes)
        assert label["codebook_version"] == VERSION and label["block_key"] == "thuc_pham"
        assert label["step"] == "Sau mua"
    counts = built.call("theme_counts")
    if status == "kept":
        assert theme_row(counts)["reviews"] == 5
    else:
        assert counts["rows"] == [] and counts["coded_reviews"] == {"shopee": 5}


def test_im_q21_partial_and_full_app_labels_are_idempotent(built):
    """NC: two of five labelled reviews count two; a rebuild with the same app rows changes nothing."""
    built.code(label_all(), max_calls=2)
    partial = built.call("theme_counts")
    assert partial["codedReviews"] == {"shopee": 2} and partial["uncodedReviews"] == {"shopee": 3}
    assert theme_row(partial)["reviews"] == 2
    _, fake = built.code(label_all())
    assert len(fake.calls) == 3
    state = built.dump()
    _, fake = built.code(label_all())
    assert fake.calls == []
    assert [line for line in built.dump() if "run_facts" not in line] == [
        line for line in state if "run_facts" not in line]
    assert theme_row(built.call("theme_counts"))["reviews"] == 5


def assert_locators(box):
    texts = {r["review_id"]: r["text"] for r in box.rows("review_text")}
    for row in box.rows("label"):
        assert row["text_ref"] == row["review_id"]
        text = texts[row["text_ref"]]
        assert row["text_start"] == 0 and row["text_end"] == len(text)
        assert row["text_sha256"] == sha(text)


def test_im_q42_every_label_resolves_exact_source_locator(built):
    """NC: swapping R2's locator onto R1 fails; NULL locator fails SQLite."""
    built.code(label_all())
    assert_locators(built)
    rows = built.rows("label")
    for column in ["review_id", "text_ref", "text_start", "text_end", "text_sha256"]:
        with pytest.raises(sqlite3.IntegrityError):
            built.sql(f'UPDATE label SET "{column}"=NULL WHERE review_id=?', (rows[0]["review_id"],))
    built.sql("UPDATE label SET text_ref=?,text_end=?,text_sha256=? WHERE review_id=?",
              (rows[1]["text_ref"], rows[1]["text_end"], rows[1]["text_sha256"], rows[0]["review_id"]))
    with pytest.raises(AssertionError):
        assert_locators(built)


def test_im_q43_zero_label_completion_is_real_coding_state(built):
    """NC: an app NO_THEME row is a coded review, never uncoded or «chưa gán nhãn»."""
    built.code()
    assert built.rows("label") == []
    assert len(built.rows("coding_state")) == 5
    assert all(r["status"] == "done" for r in built.rows("coding_state"))
    result = built.call("theme_counts")
    assert result["rows"] == [] and result["coded_reviews"] == {"shopee": 5}
    assert result["uncodedReviews"] == {"shopee": 0} and "note" not in result


@pytest.mark.parametrize("changed", ["text", "product-name"])
def test_im_q43_changed_text_invalidates_one_review(built, changed):
    """The app's text proof decides: a changed review text drops that review's app labels; a changed product
    name keeps them under a fresh input fingerprint (F361–F367).
    NC: identity-only matching keeps the changed text; a whole-run reset drops the other reviews."""
    built.code(label_all())
    old = built.rows("coding_state")
    original = {r["review_id"]: r for r in old}
    if changed == "text":
        rows = copy.deepcopy(built.reviews[:5])
        rows[0]["text"] = "zqvchanged văn bản thử mới"
        built.replace_sources(rows)
        invalid = {"shopee:1"}
    else:
        # Only one review on product 1 in this fixture; use that identity to
        # distinguish per-review exact-input invalidation from a whole-run reset.
        built.metric_products({"1": "Sản phẩm thử A"})
        invalid = set()
    result = built.call("build_warehouse")
    assert result["labels"]["labelTextMismatch"] == len(invalid)
    assert {r["review_id"] for r in built.rows("coding_state")} == set(original) - invalid
    assert {r["review_id"] for r in built.rows("label")} == set(original) - invalid
    for row in built.rows("coding_state"):
        same = changed == "text" or row["review_id"] != "shopee:3"
        assert (row["input_sha256"] == original[row["review_id"]]["input_sha256"]) is same


def test_im_q43_input_fingerprint_covers_canonical_exact_data_inputs(built):
    """NC: text-only hashes differ from the contract's full input fingerprint."""
    _, fake = built.code()
    states = {r["review_id"]: r for r in built.rows("coding_state")}
    texts = {r["text"]: r["review_id"] for r in built.rows("review_text")}
    for body in fake.calls:
        expected = sha(canonical({"text": body["text"], "platform": body["platform"],
                                  "product_name": body["product_name"], "block_key": "thuc_pham",
                                  "codebook_version": VERSION}))
        assert states[texts[body["text"]]]["input_sha256"] == expected
        assert expected != sha(body["text"])


@pytest.mark.parametrize("mutation", ["core-code", "block-code", "block-name", "packing-name", "service-name", "no-excluded", "normalized-name"])
@pytest.mark.parametrize("tool", ["build", "theme"])
def test_im_q46_fixed_excluded_list_rejects_before_calls_or_writes(built, codebook, mutation, tool):
    """NC: core/block, aliases, removed metadata and a build that reads labels first all reject."""
    data = codebook()
    extra = copy.deepcopy(data["core"][0])
    if mutation == "core-code":
        extra.update(code="T-GIAOHANG", name="synthetic delivery")
        data["core"].append(extra)
    elif mutation == "block-code":
        extra.update(code="T-DICHVU", name="synthetic service")
        data["blocks"]["my_pham"]["themes"].append(extra)
    elif mutation in {"block-name", "packing-name", "service-name", "normalized-name"}:
        names = {"block-name": "Giao hàng", "packing-name": "Đóng gói", "service-name": "Dịch vụ shop, tư vấn",
                 "normalized-name": unicodedata.normalize("NFD", "  GIAO HÀNG  ")}
        extra.update(code="T-SHIP", name=names[mutation])
        data["blocks"]["my_pham"]["themes"].append(extra)
    else:
        data.pop("excluded")
        extra.update(code="T-DONGGOI", name="synthetic packing")
        data["core"].append(extra)
    codebook(data)
    before = built.dump()
    result = built.call("theme_counts" if tool == "theme" else "build_warehouse")
    error(result, "CODEBOOK_EXCLUDED_THEME")
    assert built.dump() == before
    assert built.rows("coding_target") == []


def test_im_q46_excluded_metadata_is_not_the_prohibition_source(built, codebook):
    """NC: removing only excluded[] remains valid, not a required-field error."""
    data = codebook()
    data.pop("excluded")
    codebook(data)
    assert built.call("build_warehouse")["reviews_by_platform"]["shopee"] == 5


@pytest.mark.parametrize("excluded", sorted(EXCLUDED))
def test_im_q48_logistics_review_is_retained_and_excluded_labels_never_count(subject, sandbox, excluded):
    """NC: dropping the source gives 4; a kept excluded label cannot add a row."""
    rows = [review(i) for i in range(1, 5)] + [review(5, text="zqv50 giao nhanh")]
    sandbox.seed(rows)
    built = sandbox.call("build_warehouse")
    assert len(sandbox.rows("review")) == 5 and built["reviews_by_platform"]["shopee"] == 5

    def policy(body, answers, index):
        if "zqv50" not in body["text"]:
            answers["T-GIA"] = choice(khen=0.9)

    coded, _ = sandbox.code(policy)
    assert any(r["review_id"] == "shopee:5" and r["status"] == "done" for r in sandbox.rows("coding_state"))
    assert sandbox.rows("label", "WHERE review_id=?", ("shopee:5",)) == []
    assert sandbox.rows("review_text", "WHERE review_id=?", ("shopee:5",))[0]["text"] == "zqv50 giao nhanh"
    before = sandbox.call("theme_counts")
    # Insert a hostile current-state label using a valid existing label's shape.
    template = sandbox.rows("label")[0]
    text = sandbox.rows("review_text", "WHERE review_id=?", ("shopee:5",))[0]["text"]
    template.update(review_id="shopee:5", text_ref="shopee:5", text_start=0,
                    text_end=len(text), text_sha256=sha(text), theme_code=excluded)
    columns = list(template)
    # Contract labels use (review_id, theme_code, version, block) identity; no
    # invented receipt/state is inserted, only a deliberately hostile label.
    sandbox.sql('INSERT INTO label (' + ','.join('"' + c + '"' for c in columns) + ') VALUES (' + ','.join('?' for _ in columns) + ')',
                tuple(template[c] for c in columns))
    after = sandbox.call("theme_counts")
    assert sorted((r["platform"], r["theme_code"], r["polarity"], r["reviews"]) for r in after["rows"]) == sorted(
        (r["platform"], r["theme_code"], r["polarity"], r["reviews"]) for r in before["rows"])
    outputs = [built, coded, after, sandbox.call("keyword_counts"), sandbox.call("portrait_counts")]
    for result in outputs:
        assert not any(code in canonical(result) for code in EXCLUDED)
    error(sandbox.call("theme_counts", question="T-GIAOHANG"), "INVALID_ARGUMENT")


def test_im_q51_packaging_appearance_guidance_label_and_exact_count(subject, sandbox):
    """NC: stale include, missing exclude, or a packing theme fails the codebook checks; a second label
    changes the exact count."""
    sandbox.seed([review(1, text="zqv60 hộp đẹp bắt mắt"), review(2, text="zqv61 gói kỹ chèn nhiều"),
                  review(3), review(4), review(5)])
    assert "error" not in sandbox.call("build_warehouse")

    def policy(body, answers, index):
        # Exactly ONE contributor. B and the other three have all four valid
        # options with KHONG_NHAC=1, so this isolates the reviewed Q51 total.
        if body["text"] == "zqv60 hộp đẹp bắt mắt":
            answers["T-THIETKE"] = choice(khen=0.9, che=0, ke=0, no=0.1)

    result, fake = sandbox.code(policy)
    assert "error" not in result and len(fake.calls) == 5
    labels = sandbox.rows("label")
    assert len(labels) == 1
    assert (labels[0]["review_id"], labels[0]["theme_code"], labels[0]["status"], labels[0]["polarity"]) == (
        "shopee:1", "T-THIETKE", "kept", "khen")
    assert sandbox.rows("label", "WHERE review_id=?", ("shopee:2",)) == []
    assert sandbox.rows("coding_state", "WHERE review_id=?", ("shopee:2",))[0]["status"] == "done"
    counts = sandbox.call("theme_counts")
    assert theme_row(counts, "T-THIETKE")["reviews"] == 1
    assert theme_row(counts, "T-THIETKE", polarity="khen")["reviews"] == 1
    assert len(counts["rows"]) == 2
    # The app labels with the repo codebook (its sha256 is checked at build): the definition is the file's.
    book = subject.load_codebook()  # the codebook the module reads here (IM-Q175)
    definition = next(t for t in book["core"] if t["code"] == "T-THIETKE")
    assert definition == next(t for t in json.loads(REFERENCE.read_text())["core"] if t["code"] == "T-THIETKE")
    assert "vẻ ngoài của bao bì, hộp, nhãn: đẹp, xấu, bắt mắt, sang (F311)" in definition["include"]
    assert "cách gói, chèn, seal, mở hộp (không gán chủ đề, F310)" in definition["exclude"]
    themes = book["core"] + [t for block in book["blocks"].values() for t in block["themes"]]
    assert {t["code"] for t in themes}.isdisjoint(EXCLUDED)

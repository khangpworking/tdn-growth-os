"""R-IM03: offline transport/warehouse proof, not model semantic accuracy."""

import copy
import json
import sqlite3
import unicodedata
from pathlib import Path

import pytest

from insight_test_support import (
    EXCLUDED, EXCLUDED_NAMES, OPTIONS, RUN, VERSION, canonical, choice, error,
    label_all, no_leak, review, scope_record, sha, theme_row,
)


REFERENCE = Path(__file__).parent / "fixtures" / "reference-codebook.json"


@pytest.mark.parametrize("missing", ["status", "version"])
def test_im_q14_versioned_draft_codebook_and_required_metadata(built, codebook, missing):
    """NC: removing either required metadata field is CODEBOOK_INVALID."""
    path = built.insight / "data" / "insight-theme-codebook.json"
    raw = path.read_bytes()
    expected = json.loads(REFERENCE.read_text())
    actual = json.loads(raw)
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
    error(built.call("code_reviews"), "CODEBOOK_INVALID")


@pytest.mark.parametrize("keyword,scope,override,block,basis,term,questions", [
    ("canxi", scope_record(category="Sức Khoẻ"), "thoi_trang", "thoi_trang", "OVERRIDE", None, 14),
    ("canxi", scope_record(category="Điện Máy"), None, "dien_may", "CATEGORY_LABEL", None, 16),
    ("canxi", None, None, "thuc_pham", "KEYWORD", "canxi", 15),
    ("canxi", {**scope_record(category="Đồ Chơi"), "capture2": {
        "outcome": "OK", "keywords": ["canxi"], "category": "Đồ Chơi"}}, None, "thuc_pham", "KEYWORD", "canxi", 15),
    ("canxi", scope_record("AWAITING_KEYWORD2"), None, "thuc_pham", "KEYWORD", "canxi", 15),
    ("canxi", scope_record("PENDING"), None, "thuc_pham", "KEYWORD", "canxi", 15),
    ("canxi", scope_record("CATEGORY_NOT_SELECTABLE"), None, "thuc_pham", "KEYWORD", "canxi", 15),
    ("canxi", scope_record("OK"), None, "my_pham", "CATEGORY_LABEL", None, 17),
    ("canxi", scope_record("OK", category=None), None, "my_pham", "KEYWORD", "sữa rửa mặt", 17),
    ("sữa rửa mặt cho da dầu", None, None, "my_pham", "KEYWORD", "sữa rửa mặt", 17),
    ("giày quạt", None, None, "dien_may", "KEYWORD", "quạt", 16),
    ("cháo yến", None, None, None, "NO_MATCH", None, 13),
    (unicodedata.normalize("NFD", "SỮA RỬA MẶT"), None, None, "my_pham", "KEYWORD", "sữa rửa mặt", 17),
])
def test_im_q15_block_precedence_applied_scope_and_whole_words(
        subject, sandbox, keyword, scope, override, block, basis, term, questions):
    """NC: conflicting inputs detect reversed precedence, pending scope, substring/tie bugs."""
    sandbox.seed(keyword=keyword, scope=scope)
    assert "error" not in sandbox.call("build_warehouse")
    result = sandbox.call("code_reviews", block_override=override)
    assert "error" not in result
    assert (result["blockKey"], result["matchBasis"], result["matchedTerm"]) == (block, basis, term)
    assert result["codebookVersion"] == VERSION and result["questions_per_call"] == questions


def test_im_q15_unknown_owner_override_is_rejected(built):
    """NC: a typo is BLOCK_UNKNOWN, never keyword fallback."""
    error(built.call("code_reviews", block_override="khong_co"), "BLOCK_UNKNOWN")


def test_im_q16_default_dry_run_counts_without_key_or_transport(subject, sandbox, monkeypatch, codebook):
    """NC: a transport that raises and a blank review distinguish planning from calling/listing."""
    sandbox.seed([review(i) for i in range(1, 6)] + [review(6, text="   ")])
    assert "error" not in sandbox.call("build_warehouse")

    def forbidden(*args, **kwargs):
        raise AssertionError("dry run reached transport")

    monkeypatch.setattr(subject, "_jev_transport", forbidden)
    result = sandbox.call("code_reviews", max_calls=3)
    assert type(result["eligible_reviews"]) is int and result["eligible_reviews"] == 5
    assert result["eligible_by_platform"] == {"shopee": 5}
    assert type(result["already_coded"]) is int and result["already_coded"] == 0
    assert type(result["planned_calls"]) is int and result["planned_calls"] == 3
    assert not sandbox.key.exists()
    data = codebook()
    data["limits"]["maxCallsPerRun"] = 2
    codebook(data)
    assert sandbox.call("code_reviews")["planned_calls"] == 2


@pytest.mark.parametrize("cap", [None, 0, -1, 1501, True, 1.5, "3"])
def test_im_q17_paid_calls_require_bounded_integer_cap(built, cap):
    """NC: invalid/missing caps cannot reach a fake transport."""
    fake = built.fake_paid()
    error(built.call("code_reviews", dry_run=False, max_calls=cap), "MAX_CALLS_INVALID")
    assert fake.calls == [] and built.rows("coding_state") == []


def test_im_q17_stops_at_explicit_cap(built):
    """NC: five eligible reviews with cap three make exactly three calls."""
    result, fake = built.code(label_all(), max_calls=3)
    assert result["stopped"] == "CAP_REACHED" and result["calls_made"] == 3
    assert len(fake.calls) == len(built.rows("coding_state")) == 3


@pytest.mark.parametrize("failure,stopped", [
    ("exception", "JEV_THEME_UNAVAILABLE"), ("timeout", "JEV_THEME_UNAVAILABLE"),
    ("http", "JEV_THEME_UNAVAILABLE"), ("json", "JEV_THEME_UNAVAILABLE"),
    ("model", "JEV_THEME_INVALID"), ("missing", "JEV_THEME_INVALID"),
    ("type", "JEV_THEME_INVALID"), ("choice", "JEV_THEME_INVALID"),
    ("options", "JEV_THEME_INVALID"), ("probability-high", "JEV_THEME_INVALID"),
    ("probability-low", "JEV_THEME_INVALID"), ("sum", "JEV_THEME_INVALID"),
    ("confidence-high", "JEV_THEME_INVALID"), ("confidence-low", "JEV_THEME_INVALID"),
])
def test_im_q18_first_failure_stops_without_retry_or_partial_review(built, failure, stopped):
    """NC: failure on call 2 leaves only review 1 complete, never partial labels."""
    def policy(body, answers, index):
        answers["T-GIA"] = choice(khen=0.9)
        if index != 2:
            return None
        if failure == "exception":
            raise RuntimeError("synthetic transport failure")
        if failure == "timeout":
            raise TimeoutError("synthetic timeout")
        if failure == "http":
            return 503, b"{}"
        if failure == "json":
            return 200, b"{broken"
        last = next(reversed(answers))
        if failure == "missing":
            del answers[last]
        elif failure == "type":
            answers[last]["type"] = "text"
        elif failure == "choice":
            answers[last]["choice"] = "UNKNOWN"
        elif failure == "options":
            del answers[last]["probabilities"]["CO_KE"]
        elif failure.startswith("probability"):
            # Keep the sum valid, so a missing range check cannot be hidden by
            # rejection at the independently tested probability-sum guard.
            answers[last]["probabilities"] = dict(zip(OPTIONS,
                [1.1, 0, 0, -0.1] if failure.endswith("high") else [-0.1, 0, 0, 1.1]))
        elif failure == "sum":
            answers[last]["probabilities"] = dict.fromkeys(OPTIONS, 0.4)
        elif failure.startswith("confidence"):
            answers[last]["confidence"] = 1.1 if failure.endswith("high") else -0.1
        return 200, canonical({"model": "wrong-model" if failure == "model" else "jev-1.13.0", "answers": answers}).encode()

    result, fake = built.code(policy, max_calls=5)
    assert result["stopped"] == stopped and result["calls_made"] == 2
    assert len(fake.calls) == 2
    state = built.rows("coding_state")
    assert len(state) == 1 and state[0]["status"] == "done"
    assert {r["review_id"] for r in built.rows("label")} == {state[0]["review_id"]}
    assert built.call("code_reviews")["planned_calls"] == 4


@pytest.mark.parametrize("tolerance,valid", [(0.05, True), (0.01, False)])
def test_im_q18_probability_sum_tolerance_comes_from_file(built, codebook, tolerance, valid):
    """NC: sum 0.97 passes tolerance 0.05 but fails a changed 0.01 copy."""
    data = codebook()
    data["thresholds"]["probabilitySumTolerance"] = tolerance
    codebook(data)

    def policy(body, answers, index):
        for answer in answers.values():
            answer["probabilities"]["KHONG_NHAC"] = 0.97

    result, fake = built.code(policy)
    if valid:
        assert "error" not in result and len(fake.calls) == 5
        assert len(built.rows("coding_state")) == 5
    else:
        assert result["stopped"] == "JEV_THEME_INVALID" and len(fake.calls) == 1
        assert built.rows("coding_state") == []


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


def test_im_q19_thresholds_are_loaded_from_codebook(built, codebook):
    """NC: a keep=0.6 copy promotes 0.69, detecting hardcoded 0.7."""
    data = codebook()
    data["thresholds"]["keep"] = 0.6
    codebook(data)
    built.code(label_all(answer=choice(khen=0.69)))
    assert all(r["status"] == "kept" for r in built.rows("label"))
    assert theme_row(built.call("theme_counts"))["reviews"] == 5


@pytest.mark.parametrize("field,value,answer,status,polarity", [
    ("unclear", 0.3, choice(khen=0.4), "unclear", None),
    ("direction", 0.6, choice(khen=0.55, che=0.20), "kept", "khong_ro_huong"),
])
def test_im_q19_unclear_and_direction_thresholds_are_data(built, codebook, field, value, answer, status, polarity):
    """NC: hardcoded 0.5 would drop the first label or wrongly praise the second."""
    data = codebook()
    data["thresholds"][field] = value
    codebook(data)
    built.code(label_all(answer=answer))
    labels = built.rows("label")
    assert len(labels) == 5 and all(r["status"] == status for r in labels)
    if polarity is not None:
        assert all(r["polarity"] == polarity for r in labels)


def test_im_q20_requests_contain_only_coding_inputs(subject, sandbox):
    """NC: writer keys, names, review identifiers and URLs cannot enter a body."""
    sandbox.seed([review(1, platform="tiktok_shop", name="synthetic_private_q20")])
    assert "error" not in sandbox.call("build_warehouse")
    _, fake = sandbox.code()
    body = fake.calls[0]
    assert set(body) == {"text", "platform", "product_name", "block_label", "codebook_version", "questions"}
    assert body["platform"] == "tiktok_shop" and body["codebook_version"] == VERSION
    assert body["text"] == "zqv0001 mẫu thử ổn" and body["product_name"] == "Sản phẩm thử 2"
    assert 0 < len(body["questions"]) <= 20
    for question in body["questions"]:
        assert set(question) == {"code", "name", "include", "exclude", "options"}
        assert [o["key"] for o in question["options"]] == list(OPTIONS)
    keys = [r["writer_key"] for r in sandbox.rows("review")]
    no_leak(body, ["synthetic_private_q20", "tiktok_shop:1", *keys])
    assert "https://" not in canonical(body)


def test_im_q21_partial_and_full_coding_are_idempotent(built):
    """NC: two of five done reviews leave three calls; full second pass calls zero."""
    built.code(label_all(), max_calls=2)
    dry = built.call("code_reviews")
    assert dry["planned_calls"] == 3 and dry["already_coded"] == 2
    _, fake = built.code(label_all())
    assert len(fake.calls) == 3
    _, fake = built.code(label_all())
    assert fake.calls == [] and built.call("code_reviews")["planned_calls"] == 0


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
    """NC: all-negative answers must not be called again or reported NOT_CODED."""
    built.code()
    assert built.rows("label") == []
    assert len(built.rows("coding_state")) == 5
    assert all(r["status"] == "done" for r in built.rows("coding_state"))
    assert built.call("code_reviews")["planned_calls"] == 0
    result = built.call("theme_counts")
    assert result["rows"] == [] and result["coded_reviews"] == {"shopee": 5}


@pytest.mark.parametrize("changed", ["text", "product-name"])
def test_im_q43_changed_exact_inputs_invalidate_one_review(built, changed):
    """NC: identity-only/text-only caches miss text/name changes respectively."""
    built.code(label_all())
    assert built.call("code_reviews")["planned_calls"] == 0
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
        invalid = {"shopee:3"}
    assert "error" not in built.call("build_warehouse")
    assert built.call("code_reviews")["planned_calls"] == 1
    assert {r["review_id"] for r in built.rows("coding_state")} == set(original) - invalid
    assert {r["review_id"] for r in built.rows("label")} == set(original) - invalid
    for row in built.rows("coding_state"):
        assert row["input_sha256"] == original[row["review_id"]]["input_sha256"]


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
@pytest.mark.parametrize("tool", ["dry", "paid", "theme"])
def test_im_q46_fixed_excluded_list_rejects_before_calls_or_writes(built, codebook, mutation, tool):
    """NC: core/block, aliases, removed metadata and dry-run bypasses all reject."""
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
    fake = built.fake_paid()
    before = built.dump()
    if tool == "theme":
        result = built.call("theme_counts")
    else:
        result = built.call("code_reviews", dry_run=tool == "dry", max_calls=1)
    error(result, "CODEBOOK_EXCLUDED_THEME")
    assert fake.calls == [] and built.dump() == before
    assert built.rows("coding_target") == []


def test_im_q46_excluded_metadata_is_not_the_prohibition_source(built, codebook):
    """NC: removing only excluded[] remains valid, not a required-field error."""
    data = codebook()
    data.pop("excluded")
    codebook(data)
    assert built.call("code_reviews")["eligible_reviews"] == 5


@pytest.mark.parametrize("block,total", [("thuc_pham", 15), ("dien_may", 16), ("thoi_trang", 14),
                                         ("my_pham", 17), ("gia_dung", 15), (None, 13)])
def test_im_q47_exact_active_question_inventory_and_no_logistics(subject, sandbox, block, total):
    """NC: appending the three excluded questions changes exact ordered codes."""
    sandbox.seed([review(1)], keyword="cháo yến")
    assert "error" not in sandbox.call("build_warehouse")
    result, fake = sandbox.code(max_calls=1, block_override=block)
    assert result["questions_per_call"] == total
    data = json.loads(REFERENCE.read_text())
    active = data["core"] + (data["blocks"][block]["themes"] if block else [])
    actual = fake.calls[0]["questions"]
    assert [q["code"] for q in actual] == [t["code"] for t in active]
    assert len(actual) == total
    assert {q["code"] for q in actual}.isdisjoint(EXCLUDED)
    assert {q["name"] for q in actual}.isdisjoint(EXCLUDED_NAMES)
    for question, theme in zip(actual, active):
        assert question["exclude"] == theme["exclude"]
    assert any("giao hàng" in q["exclude"].lower() for q in actual), "guidance is allowed to mention excluded topics"


@pytest.mark.parametrize("excluded", sorted(EXCLUDED))
def test_im_q47_unasked_logistics_answer_invalidates_entire_review(built, excluded):
    """NC: otherwise valid extra answer must neither be ignored nor stored."""
    def policy(body, answers, index):
        answers["T-GIA"] = choice(khen=0.9)
        answers[excluded] = choice(khen=0.9)  # four options, sum 1, valid confidence

    result, fake = built.code(policy)
    assert result["stopped"] == "JEV_THEME_INVALID" and len(fake.calls) == 1
    assert built.rows("label") == [] and built.rows("coding_state") == []


@pytest.mark.parametrize("excluded", sorted(EXCLUDED))
def test_im_q48_logistics_review_is_retained_and_excluded_labels_never_count(subject, sandbox, excluded):
    """NC: dropping the source gives 4; a kept excluded label cannot add a row."""
    rows = [review(i) for i in range(1, 5)] + [review(5, text="zqv50 giao nhanh")]
    sandbox.seed(rows)
    built = sandbox.call("build_warehouse")
    assert len(sandbox.rows("review")) == 5
    assert sandbox.call("code_reviews")["eligible_reviews"] == 5

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
    outputs = [built, coded, after, sandbox.call("code_reviews"), sandbox.call("keyword_counts"), sandbox.call("portrait_counts")]
    for result in outputs:
        assert not any(code in canonical(result) for code in EXCLUDED)
    error(sandbox.call("theme_counts", question="T-GIAOHANG"), "INVALID_ARGUMENT")


def test_im_q51_packaging_appearance_guidance_label_and_exact_count(subject, sandbox):
    """NC: stale include, missing exclude, or a packing question fails the sent-body checks."""
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
    definition = next(t for t in json.loads(REFERENCE.read_text())["core"] if t["code"] == "T-THIETKE")
    for body in fake.calls:
        question = next(q for q in body["questions"] if q["code"] == "T-THIETKE")
        assert question["include"] == definition["include"]
        assert question["exclude"] == definition["exclude"]
        assert "vẻ ngoài của bao bì, hộp, nhãn: đẹp, xấu, bắt mắt, sang (F311)" in question["include"]
        assert "cách gói, chèn, seal, mở hộp (không gán chủ đề, F310)" in question["exclude"]
        assert {q["code"] for q in body["questions"]}.isdisjoint(EXCLUDED)
        assert "overlaps" not in body

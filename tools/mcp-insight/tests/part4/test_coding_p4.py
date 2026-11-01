"""R-IM14: one fake Jev call per eligible review, strict answers and current inputs."""

import copy
import json

import pytest

from claim_support import THEME, ClaimJev, catalogue, no_leak
from insight_test_support import canonical, choice, error, review, sha


def test_im_q139_customer_words_keep_first_and_non_attribute_segments(p4):
    """NC: stripping only one attribute or every segment (including comments) sends the wrong text."""
    p4.seed([review(1, text="zqv200 rất tốt", attributes=["Công dụng: chắc xương", "Đối tượng: mẹ"]),
             review(2, text="", attributes=["Hương vị: ngọt", "Công dụng: canxi"]),
             review(3, text="zqv201 tốt  dùng 2 tuần thấy khỏe"),
             review(4, text="Công dụng: zqv202 nhận xét riêng")])
    p4.catalogue()
    _, fake = p4.code_claims()
    assert [r["text"] for r in fake.calls] == ["zqv200 rất tốt", "zqv201 tốt dùng 2 tuần thấy khỏe",
                                             "Công dụng: zqv202 nhận xét riêng"]
    assert p4.counts()["platforms"]["shopee"]["attribute_only"] == 1
    assert len(p4.box.rows("claim_coding_state")) == 3


def test_im_q140_default_dry_run_excludes_unclear_old_target_and_attributes(p4, monkeypatch):
    """NC: unclear/old-target labels inflate 5 eligible; dry-run persistence changes the byte hash."""
    p4.seed([review(i, text="" if i == 6 else f"zqvdry{i} fixture",
                    attributes=["Công dụng: canxi"] if i == 6 else []) for i in range(1, 10)])
    p4.catalogue(catalogue(size=12))
    p4.box.sql("UPDATE label SET status='unclear' WHERE review_id IN ('shopee:7','shopee:8') AND theme_code=?", (THEME,))
    p4.box.sql("UPDATE label SET codebook_version='old-target' WHERE review_id='shopee:9' AND theme_code=?", (THEME,))
    def deny(*args): raise AssertionError("dry run read a key or reached a transport")
    monkeypatch.setattr(p4.box.module, "_read_key", deny)
    monkeypatch.setattr(p4.box.module, "_jev_transport", deny)
    result = p4.call("code_claims", theme_code=THEME, catalogue_version=1)
    assert result["eligible_reviews"] == 5 and result["attribute_only"] == 1
    assert result["eligible_by_platform"]["shopee"] == 5
    assert result["attribute_only_by_platform"]["shopee"] == 1
    assert result["questions_per_call"] == 14 and result["planned_calls"] == 5
    assert result["dry_run"] is True and result["jev_calls"] == 0 and result["already_coded"] == 0
    assert result["catalogue_status"] == "DRAFT"
    capped = p4.call("code_claims", theme_code=THEME, catalogue_version=1, max_calls=3)
    assert capped["planned_calls"] == 3
    book = p4.book()
    book["limits"]["maxCallsPerRun"] = 2
    p4.book(book)
    assert p4.call("code_claims", theme_code=THEME, catalogue_version=1)["planned_calls"] == 2


def test_im_q141_paid_flag_is_exact_and_cap_stops_at_three(p4, monkeypatch):
    """NC: truthy flag values must not read keys; a fake paid run proves the gate alone prevented calls."""
    p4.seed()
    p4.catalogue()
    monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", "true")
    def deny(): raise AssertionError("refusal read a key")
    monkeypatch.setattr(p4.box.module, "_read_key", deny)
    fake = ClaimJev()
    monkeypatch.setattr(p4.box.module, "_jev_transport", fake)
    result = p4.call("code_claims", theme_code=THEME, catalogue_version=1, dry_run=False, max_calls=3)
    assert result["refused"] is True and result["reason"] == "PAID_FLAG_MISSING"
    assert fake.calls == [] and result["jev_calls"] == 0
    result, fake = p4.code_claims(max_calls=3)
    assert len(fake.calls) == result["calls_made"] == result["coded_now"] == 3
    assert result["remaining"] == 2 and result["stopped"] == "CAP_REACHED"


@pytest.mark.parametrize("cap", [None, 0, -1, True, 1.5, "3", 1501])
def test_im_q141_invalid_paid_cap_never_calls_transport(coded_claims, cap):
    """NC: booleans, defaults and values above the configured limit cannot be paid caps."""
    p4 = coded_claims
    result, fake = p4.code_claims(max_calls=cap)
    error(result, "MAX_CALLS_INVALID")
    assert fake.calls == []


def test_im_q142_exact_request_questions_omit_generic_and_private_identifiers(p4):
    """NC: adding a generic question or passing a named writer/key violates the actual wire body."""
    p4.seed([review(1, platform="tiktok_shop", name="writer_claim_body", text="zqvbody fixture")])
    cat = catalogue(size=12)
    p4.catalogue(cat)
    _, fake = p4.code_claims()
    assert len(fake.calls) == 1
    body = fake.calls[0]
    assert set(body) == {"kind", "text", "platform", "product_name", "theme_name", "catalogue_version", "questions"}
    assert body["kind"] == "claims" and body["catalogue_version"] == 1
    assert [q["code"] for q in body["questions"]] == p4.codes[:-1] + ["SPEC", "RAC", "GEN"]
    assert len(body["questions"]) == 14
    spec = body["questions"][-3]
    assert cat["specific_rule"] in canonical(spec)
    for c, q in zip(cat["claims"][:-1], body["questions"]):
        assert all(c[key] in canonical(q) for key in ("name", "include", "exclude"))
    no_leak(body, ["writer_claim_body"] + [r[k] for r in p4.box.rows("review")
                                         for k in ("review_id", "writer_key", "product_key")])
    p4.storage_privacy()


@pytest.mark.parametrize("bad,expected", [
    ("exception", "JEV_CLAIM_UNAVAILABLE"), ("http", "JEV_CLAIM_UNAVAILABLE"), ("json", "JEV_CLAIM_UNAVAILABLE"),
    ("model", "JEV_CLAIM_INVALID"), ("extra", "JEV_CLAIM_INVALID"), ("missing", "JEV_CLAIM_INVALID"),
    ("type", "JEV_CLAIM_INVALID"), ("choice", "JEV_CLAIM_INVALID"), ("prob_keys", "JEV_CLAIM_INVALID"),
    ("range", "JEV_CLAIM_INVALID"), ("sum", "JEV_CLAIM_INVALID"), ("confidence", "JEV_CLAIM_INVALID")])
def test_im_q143_first_failure_stops_without_retry_or_partial_failed_state(p4, bad, expected):
    """NC: a failed second review must not get labels/state; skip-extra-key and retry mutants fail."""
    p4.seed()
    p4.catalogue()
    def invalid(value, n):
        if n != 2: return None
        if bad == "exception": raise RuntimeError("synthetic-offline-token")
        if bad == "http": return 503, b"{}"
        if bad == "json": return 200, b"not json"
        answers = value["answers"]
        if bad == "model": value["model"] = "wrong-model"
        elif bad == "extra": answers[p4.codes[-1]] = copy.deepcopy(answers[p4.codes[0]])
        elif bad == "missing": answers.pop("GEN")
        elif bad == "type": answers["SPEC"]["type"] = "text"
        elif bad == "choice": answers["SPEC"]["choice"] = "CO_KHEN"
        elif bad == "prob_keys": answers["SPEC"]["probabilities"] = {"CO_KHEN": 1}
        elif bad == "range": answers["RAC"]["probabilities"] = {"THAT": 1.1, "RAC": -0.1}
        elif bad == "sum": answers["RAC"]["probabilities"] = {"THAT": 0.8, "RAC": 0.4}
        elif bad == "confidence": answers["GEN"]["confidence"] = 1.1
        return 200, canonical(value).encode()
    result, fake = p4.code_claims(invalid=invalid)
    assert result["stopped"] == expected and len(fake.calls) == 2
    assert len(p4.box.rows("claim_coding_state")) == 1
    labels = p4.box.rows("claim_label")
    assert {r["review_id"] for r in labels} == {p4.box.rows("claim_coding_state")[0]["review_id"]}
    assert "synthetic-offline-token" not in canonical(result)


@pytest.mark.parametrize("specific,gen,rac,spec,expected_label,expected_generic,spam,is_specific", [
    (0.49, .1, .1, .9, None, None, False, True), (.50, .1, .1, .9, "unclear", None, False, True),
    (.69, .1, .1, .9, "unclear", None, False, True), (.70, .95, .1, .9, "kept", None, False, True),
    (.1, .49, .1, .9, None, None, False, True), (.1, .50, .1, .9, None, "unclear", False, True),
    (.1, .69, .1, .9, None, "unclear", False, True), (.1, .70, .1, .9, None, "kept", False, True),
    (.60, .80, .1, .9, "unclear", "kept", False, True),
    (.9, .1, .69, .9, "kept", None, False, True), (.9, .1, .70, .9, "kept", None, True, True),
    (.9, .1, .1, .49, "kept", None, False, False), (.9, .1, .1, .50, "kept", None, False, True),
    (.499, .1, .1, .9, None, None, False, True), (.699, .1, .1, .9, "unclear", None, False, True),
    (.1, .699, .1, .9, None, "unclear", False, True), (.9, .1, .699, .9, "kept", None, False, True),
    (.9, .1, .1, .499, "kept", None, False, False),
])
def test_im_q144_probability_boundaries_generic_exclusion_and_spam(p4, specific, gen, rac, spec,
        expected_label, expected_generic, spam, is_specific):
    """NC: strict thresholds, rounding, unclear-blocks-generic and spam-in-sample give wrong labels/counts."""
    p4.seed([review(1)])
    p4.catalogue()
    p4.code_claims(lambda body, n: {p4.codes[0]: specific, "GEN": gen, "RAC": rac, "SPEC": spec})
    labels = {r["claim_code"]: r["status"] for r in p4.box.rows("claim_label")}
    assert labels.get(p4.codes[0]) == expected_label and labels.get(p4.codes[-1]) == expected_generic
    state = p4.box.rows("claim_coding_state")[0]
    assert (state["spec_p"], state["rac_p"], state["gen_p"]) == (spec, rac, gen)
    result = p4.counts()
    platform = result["platforms"]["shopee"]
    assert platform["spam"] == int(spam) and platform["sample"] == int(not spam)
    if spam:
        assert result["rows"] == [] and platform["saturation"]["reviews"] == 0
    else:
        for row in result["rows"]:
            assert row["specific"] == int(is_specific)


def test_im_q145_resume_input_digest_and_attribute_only_change(p4):
    """NC: reusing stale input or hashing full stored text gives incorrect remaining calls/counts."""
    rows = p4.seed()
    p4.catalogue()
    p4.code_claims(max_calls=2)
    assert p4.call("code_claims", theme_code=THEME, catalogue_version=1)["planned_calls"] == 3
    p4.code_claims()
    assert len(p4.code_claims()[1].calls) == 0
    state = p4.box.rows("claim_coding_state")[0]
    row = next(r for r in p4.box.rows("review") if r["review_id"] == state["review_id"])
    text = next(r["text"] for r in p4.box.rows("review_text") if r["review_id"] == row["review_id"])
    product = next(r for r in p4.box.rows("product") if r["product_key"] == row["product_key"])
    payload = dict(text=text, platform=row["platform"], product_name=product["product_name"],
                   theme_code=THEME, catalogue_version=1)
    assert state["input_sha256"] == sha(canonical(payload))
    rows[0]["attributes"] = ["Công dụng: synthetic attribute"]
    p4.box.replace_sources(rows)
    p4.source_fields(rows)
    p4.call("build_warehouse")
    p4.theme_code_reviews()
    assert p4.call("code_claims", theme_code=THEME, catalogue_version=1)["planned_calls"] == 0
    rows[0]["text"] = "zqvchanged customer input"
    p4.box.replace_sources(rows)
    p4.source_fields(rows)
    p4.call("build_warehouse")
    p4.theme_code_reviews()
    assert p4.call("code_claims", theme_code=THEME, catalogue_version=1)["planned_calls"] == 1
    assert p4.row()["reviews"] == 4
    p4.code_claims()
    assert p4.row()["reviews"] == 5
    p4.box.sql("UPDATE label SET status='unclear' WHERE review_id='shopee:1' AND theme_code=?", (THEME,))
    assert p4.row()["reviews"] == 4 and len(p4.box.rows("claim_coding_state")) == 5


def test_im_q145_product_name_change_invalidates_only_affected_input(p4):
    """NC: hashing only review text reuses claim coding after its product-name input changes."""
    p4.seed([review(1, product=99), review(2, product=2)])
    p4.catalogue()
    p4.code_claims()
    p4.box.metric_products({"99": "Tên sản phẩm mới"})
    p4.call("build_warehouse")
    p4.theme_code_reviews()
    assert p4.call("code_claims", theme_code=THEME, catalogue_version=1)["planned_calls"] == 1
    assert p4.row()["reviews"] == 1

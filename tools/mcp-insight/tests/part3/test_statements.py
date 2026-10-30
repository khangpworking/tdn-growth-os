"""R-IM11 nine-field statements, persisted receipts and reason-chain evidence."""

import copy
import json
import sqlite3
import uuid

import pytest

from insight_test_support import OTHER, RUN, VERSION, error
from p2_support import DATE, keyword_row
from p3_support import PAIRS, accepted, codes, immutable, line, statement


@pytest.mark.parametrize("fault", ["extra", "missing", "step", "three_c", "why_null", "why_11",
                                   "why_themes", "side_themes", "count_part", "reason_part", "unknown_replace",
                                   "bool_layer", "long_field", "extra_line"])
def test_im_q94_exact_nine_fields_and_nested_line_rules(coded_p3, fault):
    """NC: permissive nested validation accepts malformed evidence/import objects."""
    p3 = coded_p3
    value, kwargs = statement(p3.theme()), {}
    if fault == "extra":
        value["title"] = "Title"
    elif fault == "missing":
        del value["conflict"]
    elif fault == "step":
        value["step"] = "Chưa rõ bước"
    elif fault == "three_c":
        value["three_c"] = dict(customer="Khách")
    elif fault.startswith("why_") or fault == "bool_layer":
        value["evidence"] = p3.chain()
        value["evidence"][0].update({"why_null": dict(layer=None), "why_11": dict(layer=11),
                                      "why_themes": dict(themes=None), "bool_layer": dict(layer=True)}[fault])
    elif fault == "side_themes":
        value["evidence"][0]["themes"] = list(PAIRS[0])
    elif fault == "count_part":
        value["evidence"][0]["part"] = 2
    elif fault == "reason_part":
        value["evidence"] = p3.chain()
        value["evidence"][0]["part"] = None
    elif fault == "unknown_replace":
        kwargs["replaces"] = str(uuid.UUID(int=7))
    elif fault == "long_field":
        value["customer"] = "x" * 2001
    else:
        value["evidence"][0]["sql"] = "not executable"
    error(p3.submit(value, **kwargs), "INVALID_ARGUMENT")
    assert p3.report_rows("statement_version") == []


def test_im_q94_cannot_replace_other_run_statement(coded_p3):
    """NC: UUID lookup without run binding allows cross-run replacement."""
    p3 = coded_p3
    sid = accepted(p3.submit())["statement_id"]
    p3.box.seed([], run_id=OTHER)
    assert "error" not in p3.box.call("build_warehouse", OTHER)
    value = statement(p3.theme())
    value["evidence"] = []
    result = p3.box.call("submit_statement", OTHER, statement=value, replaces=sid)
    error(result, "INVALID_ARGUMENT")
    assert len(p3.report_rows("statement_version")) == 1


@pytest.mark.parametrize("side", ["hidden_truth", "motivation", "conflict"])
@pytest.mark.parametrize("hypothesis,level,ok", [(False, "Yếu", False), (True, "Khá", False), (True, "Yếu", True)])
def test_im_q95_every_missing_side_requires_weak_hypothesis(coded_p3, side, hypothesis, level, ok):
    """NC: checking only motivation/conflict misses the hidden-truth side."""
    value = statement(coded_p3.theme(), hypothesis=hypothesis, level=level)
    value["evidence"] = [r for r in value["evidence"] if r["supports"] != side]
    result = coded_p3.submit(value)
    assert ("HYPOTHESIS_REQUIRED" not in codes(result)) is ok
    if not ok:
        assert any(side in r["detail"] for r in result["reasons"] if r["code"] == "HYPOTHESIS_REQUIRED")
    if ok:
        accepted(result)


@pytest.mark.parametrize("fault,code", [("conflict", "NO_CONFLICT"), ("evidence", "NO_EVIDENCE")])
def test_im_q95_conflict_and_nonempty_evidence_are_required(coded_p3, fault, code):
    """NC: a hypothesis does not waive the conflict or evidence container."""
    value = statement(coded_p3.theme(), hypothesis=True, level="Không")
    value[fault] = " " if fault == "conflict" else []
    assert code in codes(coded_p3.submit(value))


def test_im_q95_zero_link_does_not_back_side(coded_p3):
    """NC: existence of an ID, without any linked review, supplies false evidence."""
    p3 = coded_p3
    value = statement(p3.theme())
    value["evidence"][-1] = line(p3.why(PAIRS[0], linked=False), "conflict")
    assert "HYPOTHESIS_REQUIRED" in codes(p3.submit(value))


@pytest.mark.parametrize("fault,code", [("gap", "WHY_LAYER_WITHOUT_EVIDENCE"),
                                        ("zero", "WHY_LAYER_WITHOUT_EVIDENCE"),
                                        ("theme", "WHY_LAYER_WITHOUT_EVIDENCE"),
                                        ("short", "WHY_CHAIN_SHORT_UNMARKED"), ("valid", None)])
def test_im_q96_reason_layers_need_real_contiguous_evidence(coded_p3, fault, code):
    """NC: treating three unchecked candidates as evidence or counting lines hides gaps."""
    p3 = coded_p3
    value = statement(p3.theme())
    value["hidden_truth"] = "Khách cân nhắc tính phù hợp"
    chain = p3.chain()
    if fault == "gap":
        chain.pop(1)
    elif fault == "zero":
        for rid in ("shopee:2", "shopee:3"):
            p3.reading(rid, False, pair=PAIRS[1])
        chain[1]["count_id"] = p3.why(PAIRS[1], linked=False)["count_id"]
        candidates = p3.links(PAIRS[1])["candidates"]
        assert len(next(r["review_ids"] for r in candidates if r["platform"] == "shopee")) == 3
    elif fault == "theme":
        chain[1]["count_id"] = p3.theme()["count_id"]
    elif fault == "short":
        chain.pop()
    value["evidence"] += chain
    result = p3.submit(value)
    if code:
        assert code in codes(result)
    else:
        accepted(result)


@pytest.mark.parametrize("path,text,ok", [("insight", "Tôi muốn uống canxi mà không bị táo bón", False),
                                           ("motivation", "mình kể lại cân nhắc giá", False),
                                           ("note", "our wording", False),
                                           ("insight", "Khách muốn uống canxi mà không bị táo bón", True),
                                           ("insight", "Người tiêu dùng", True)])
def test_im_q97_first_person_checks_fields_and_notes(coded_p3, path, text, ok):
    """NC: insight-only checks miss first person in motivation and evidence notes."""
    value = statement(coded_p3.theme())
    if path == "note":
        value["evidence"][0]["note"] = text
    else:
        value[path] = text
    result = coded_p3.submit(value)
    assert ("FIRST_PERSON" not in codes(result)) is ok
    if ok:
        accepted(result)


def test_im_q98_step_and_platform_bind_even_reason_lines(coded_p3):
    """NC: ignoring reason steps or accepting another platform's count fails."""
    p3 = coded_p3
    value = statement(p3.theme())
    accepted(p3.submit(value))
    value["step"] = "Quan tâm"
    assert "MIXED_STEPS" in codes(p3.submit(value))
    value["evidence"] = p3.chain()
    assert "MIXED_STEPS" in codes(p3.submit(value))
    p3.share()
    value = statement(p3.theme())
    value["evidence"][0]["count_id"] = p3.theme(platform="tiktok_shop")["count_id"]
    assert "PLATFORM_MISMATCH" in codes(p3.submit(value))


def test_im_q99_customer_words_guard_isolated_by_portrait_pair(coded_p3):
    """NC: skipping NOT_CUSTOMER_WORDS admits a matched-platform gender guess."""
    p3 = coded_p3
    p3.share()
    portraits = p3.call("portrait_counts")["rows"]
    value = statement(p3.theme(), hypothesis=True)
    for dimension, rejected in (("Mua cho ai", False), ("Giới", True)):
        row = next(r for r in portraits if r["dimension"] == dimension and r["platform"] == "tiktok_shop")
        value["evidence"][0] = line(row, part=13, note="dưới ngưỡng")
        result = p3.submit(value)
        assert ("NOT_CUSTOMER_WORDS" in codes(result)) is rejected
        assert "PLATFORM_MISMATCH" not in codes(result)
        if not rejected:
            accepted(result)


def test_im_q99_keywords_fail_named_customer_guard_and_platform(coded_p3):
    """NC: generic rejection hides a missing customer-words guard on keywords."""
    p3 = coded_p3
    value = statement(p3.theme(), hypothesis=True)
    value["step"] = "Quan tâm"
    value["evidence"] = [dict(line(keyword_row(p3.box), "motivation", part=6), platform="shopee")]
    result = p3.submit(value)
    assert {"NOT_CUSTOMER_WORDS", "PLATFORM_MISMATCH"} <= set(codes(result))
    assert "NOT_CUSTOMER_WORDS" not in codes(p3.submit(statement(p3.theme())))


@pytest.mark.parametrize("fault,code", [("strong", "CONFIDENCE_ABOVE_CEILING"),
                                        ("note_quote", "VERBATIM_QUOTE"), ("number", "NUMBER_MISMATCH"),
                                        ("three_c", "HIDDEN_NAME"), ("conversion", "CONVERSION_RATE"),
                                        ("currency", "MARKET_NUMBER"), ("buyer", "BUYER_WORD")])
def test_im_q100_text_gates_cover_every_field_and_note(coded_p3, fault, code):
    """NC: skipping notes or 3C leaves text gates bypassable outside insight."""
    p3 = coded_p3
    value = statement(p3.theme())
    if fault == "strong":
        value["confidence"]["level"] = "Khá"
    elif fault == "note_quote":
        value["evidence"][0]["note"] = "mẫu thử tổng hợp có nhiều đặc điểm"  # exactly eight words
    elif fault == "number":
        value["customer"] = "6 khách"
    elif fault == "three_c":
        value["three_c"] = dict(customer="Khách", brand="Nhãn mẫu", category="Google")
    elif fault == "conversion":
        value["evidence"][0]["note"] = "từ quan tâm sang mua"
    elif fault == "currency":
        value["customer"] = "Giá 150k"
    else:
        value["customer"] = "12 người mua"
    assert code in codes(p3.submit(value))


@pytest.mark.parametrize("three_c", [None, dict(customer="Khách mẫu", brand="Nhãn mẫu", category="Ngành mẫu")])
@pytest.mark.parametrize("level,app_level", [("Yếu", "WEAK"), ("Không", "NONE")])
def test_im_q101_uuid_append_only_storage_and_app_schema(coded_p3, three_c, level, app_level):
    """NC: tiktok_shop in app payload, replacement writes or app DB writes fail."""
    from jsonschema import Draft202012Validator, FormatChecker

    p3 = coded_p3
    p3.share()
    value = statement(p3.theme(), level=level)
    value["three_c"] = three_c
    value["evidence"].append(line(p3.theme(platform="tiktok_shop"), part=13))
    first = accepted(p3.submit(value))
    uuid.UUID(first["statement_id"])
    assert first["version"] == 1 and first["ceiling"] == "Yếu"
    before = copy.deepcopy(p3.report_rows("statement_version")[0])
    second = accepted(p3.submit(value, replaces=first["statement_id"]))
    assert second["statement_id"] == first["statement_id"] and second["version"] == 2
    rows = p3.report_rows("statement_version")
    assert rows[0] == before and [r["version"] for r in rows] == [1, 2]
    assert set(json.loads(before["statement_json"])) == set(value)
    payload = json.loads(before["app_payload_json"])
    assert "revisionId" not in payload
    assert payload["statementId"] == first["statement_id"]
    assert payload["purchaseStage"] == "POST_PURCHASE"
    assert payload["threeC"] == three_c
    assert payload["confidence"] == dict(level=app_level, hypothesis=False)
    assert payload["evidence"] == [dict(platform="shopee", count=6)] * 3 + [dict(platform="tiktok", count=6)]
    schema_path = p3.box.insight.parents[1] / "contracts/analysis/insight-report-statement.schema.json"
    validator = Draft202012Validator(json.loads(schema_path.read_text()), format_checker=FormatChecker())
    imported = dict(payload, revisionId=str(uuid.UUID(int=5)))
    validator.validate(imported)
    bad = copy.deepcopy(imported)
    bad["evidence"][-1]["platform"] = "tiktok_shop"
    assert list(validator.iter_errors(bad))
    evidence = json.loads(before["evidence_json"])
    assert p3.theme()["count_id"] in json.dumps(evidence)
    assert "Yếu" in json.dumps(evidence, ensure_ascii=False)
    immutable(p3.report_store, "statement_version", "statement_id=? AND version=?", (first["statement_id"], 1))


def test_im_q109_statement_banned_ideas(coded_p3):
    """NC: limiting the recommendation ban to section prose admits campaign insight."""
    value = statement(coded_p3.theme())
    value["insight"] = "ý tưởng chiến dịch Tết"
    assert "BANNED_IDEA" in codes(coded_p3.submit(value))


def test_im_q110_statement_motive_is_marked_retold(coded_p3):
    """NC: correct POST_PURCHASE alone does not preserve the retold qualification."""
    value = statement(coded_p3.theme())
    accepted(coded_p3.submit(value))
    value["motivation"] = "Khách cân nhắc giá"
    assert "RETOLD_NOT_MARKED" in codes(coded_p3.submit(value))
    value["evidence"][1]["note"] = "kể lại"
    accepted(coded_p3.submit(value))


@pytest.mark.parametrize("size,hypothesis,note,ok", [(4, False, True, False), (4, True, False, False),
                                                    (4, True, True, True), (5, False, False, True)])
def test_im_q112_statement_threshold_is_distinct_from_positive_count(p3, size, hypothesis, note, ok):
    """NC: reviews>=1 cannot promote a four-writer motive to a conclusion."""
    from insight_test_support import review, choice

    p3.seed([review(i) for i in range(1, 6)], keywords=())
    def policy(body, answers, index):
        answers["T-CONGDUNG"] = choice(khen=0.9)
        if index <= size:
            answers["T-GIA"] = choice(khen=0.9)
    assert "error" not in p3.code(policy)[0]
    value = statement(p3.theme("T-CONGDUNG"), hypothesis=hypothesis)
    value["evidence"][1] = line(p3.theme(), "motivation", note="dưới ngưỡng" if note else None)
    result = p3.submit(value)
    assert ("BELOW_THRESHOLD_CONCLUSION" not in codes(result)) is ok
    if ok:
        accepted(result)


@pytest.mark.parametrize("side,theme,ok", [("motivation", "T-GIA", True), ("motivation", "T-VI", False),
                                           ("motivation", "T-CAMGIAC", False), ("conflict", "T-CHATLUONG", True),
                                           ("conflict", "T-THIETKE", False), ("motivation", "T-QUYCACH", True),
                                           ("hidden_truth", "T-VI", True)])
def test_im_q113_only_four_kept_motive_and_barrier_kinds(coded_p3, side, theme, ok):
    """NC: broad core-theme acceptance or a map missing quy cách fails."""
    value = statement(coded_p3.theme())
    replacement = line(coded_p3.theme(theme), side)
    value["evidence"] = [replacement if r["supports"] == side else r for r in value["evidence"]]
    result = coded_p3.submit(value)
    assert ("MOTIVE_KIND_NOT_KEPT" not in codes(result)) is ok
    if ok:
        accepted(result)


@pytest.mark.parametrize("fault,code", [("wrong", "WHY_LAYER_WRONG_PAIR"),
                                        ("repeat", "WHY_LAYER_WRONG_PAIR"),
                                        ("disjoint", "WHY_LAYER_WRONG_PAIR"),
                                        ("unexplained", "WHY_LAYER_UNEXPLAINED"), ("valid", None)])
def test_im_q114_pair_identity_chain_continuity_and_explanation(coded_p3, fault, code):
    """NC: IDs alone, repeated pair or blank explanation cannot establish three whys."""
    p3 = coded_p3
    value = statement(p3.theme())
    chain = p3.chain()
    if fault == "wrong":
        chain[1]["themes"] = ["T-GIA", "T-VI"]
    elif fault == "repeat":
        chain = [dict(chain[0], layer=i) for i in range(1, 4)]
    elif fault == "disjoint":
        pair = ("T-VI", "T-CAMGIAC")
        chain[2] = line(p3.why(pair), "why", layer=3, themes=list(pair), note="Hai ý được nối trong bằng chứng")
    elif fault == "unexplained":
        chain[1]["note"] = " "
    value["evidence"] += chain
    result = p3.submit(value)
    if code:
        assert code in codes(result)
    else:
        accepted(result)
        # All three real receipts refer to one review. No invented distinct-ID requirement.
        assert {r["review_id"] for r in p3.rows("reason_check")} == {"shopee:1"}


@pytest.mark.parametrize("side,pair,motive,ok", [
    ("motivation", ("T-GIA", "T-VI"), "khách kể lại chọn vì giá", False),
    ("motivation", ("T-GIA", "T-VI"), "khách kể lại chọn vì vị", False),
    ("motivation", ("T-GIA", "T-CHATLUONG"), "khách kể lại chọn vì giá", True),
    ("conflict", ("T-CHATLUONG", "T-THIETKE"), "Nhưng băn khoăn", False),
    ("hidden_truth", ("T-GIA", "T-VI"), "Khách cân nhắc", True),
])
def test_im_q122_mixed_pair_cannot_launder_excluded_kind(coded_p3, side, pair, motive, ok):
    """NC: accepting at least one kept endpoint lets the same mixed pair carry taste."""
    p3 = coded_p3
    value = statement(p3.theme(), hypothesis=True)
    value[side] = motive + "; dưới ngưỡng; chưa đủ bằng chứng"
    value["evidence"] = [line(p3.why(pair), side, note="dưới ngưỡng") if r["supports"] == side else r
                         for r in value["evidence"]]
    result = p3.submit(value)
    assert ("MOTIVE_KIND_NOT_KEPT" not in codes(result)) is ok
    assert not (set(codes(result)) - {"MOTIVE_KIND_NOT_KEPT"})
    if ok:
        accepted(result)


def test_im_q113_portrait_group_is_not_a_kept_motive(coded_p3):
    """NC: all review-derived rows as motives would admit a portrait group."""
    p3 = coded_p3
    value = statement(p3.theme(), hypothesis=True)
    row = next(r for r in p3.call("portrait_counts")["rows"] if r["dimension"] == "Mua cho ai" and r["platform"] == "shopee")
    value["evidence"][1] = line(row, "motivation", part=4, note="dưới ngưỡng")
    assert "MOTIVE_KIND_NOT_KEPT" in codes(p3.submit(value))


def reason_only(p3, *, linked=True, level="Yếu", platform="shopee"):
    row = p3.why(PAIRS[0], linked=linked, platform=platform)
    value = statement(p3.theme(), hypothesis=True, level=level)
    value["evidence"] = [line(row, "why", part=8 if platform == "shopee" else 13, layer=1,
                              themes=list(PAIRS[0]), note="Giá và công dụng được nối trong bằng chứng")]
    return value, row


def test_im_q115_reason_source_is_weak_not_source_free(coded_p3):
    """NC: grading every reason ID Không rejects a genuine linked source."""
    p3 = coded_p3
    value, row = reason_only(p3)
    assert accepted(p3.submit(value))["ceiling"] == "Yếu"
    value["confidence"]["level"] = "Khá"
    assert "CONFIDENCE_ABOVE_CEILING" in codes(p3.submit(value))
    zero, _ = reason_only(p3, linked=False)
    assert "CONFIDENCE_ABOVE_CEILING" in codes(p3.submit(zero))
    tiktok, _ = reason_only(p3, platform="tiktok_shop")
    assert "CONFIDENCE_ABOVE_CEILING" in codes(p3.submit(tiktok))
    error(p3.confidence(row, 8), "INVALID_ARGUMENT")


@pytest.mark.parametrize("ledger_version,expected", [("current", "Khá"), ("reason", "Yếu"),
                                                     ("codebook", "Yếu"), ("absent", "Yếu"),
                                                     ("sample_missing", "Yếu"), ("sample_failed", "Yếu")])
def test_im_q115_real_reason_approvals_bind_both_versions(coded_p3, codebook, ledger_version, expected):
    """NC: unconditional check-2 pass gives Chắc; reused wrong-version ledger gives Khá."""
    p3 = coded_p3
    book = codebook()
    book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
    codebook(book)
    if ledger_version != "sample_missing":
        p3.sample(passed=ledger_version != "sample_failed")
    p3.method("theme_counts:shopee_reviews:" + VERSION)
    version = VERSION if ledger_version != "codebook" else "2026-10-30.3"
    rules = p3.box.module.REASON_RULES_VERSION if ledger_version != "reason" else "reason-old"
    if ledger_version != "absent":
        p3.method(f"find_reason_links:shopee_reviews:{version}+{rules}")
    value = statement(p3.theme(), level=expected)
    value["evidence"] += p3.chain()
    result = accepted(p3.submit(value))
    assert result["ceiling"] == expected
    saved = json.loads(p3.report_rows("statement_version")[-1]["evidence_json"])
    app = json.loads(p3.report_rows("statement_version")[-1]["app_payload_json"])
    assert app["confidence"] == dict(level="FAIR" if expected == "Khá" else "WEAK", hypothesis=False)
    # Representation is unspecified; contract tokens must be retained in grading.
    encoded = json.dumps(saved, ensure_ascii=False)
    assert "REASON_LINK_NO_THRESHOLD" in encoded
    if ledger_version in {"reason", "codebook", "absent"}:
        assert "METHOD_ON_0_PRODUCTS" in encoded
    if ledger_version.startswith("sample_"):
        assert "NO_OWNER_SAMPLE_REVIEW" in encoded


def test_im_q124_reason_ledger_writer_reader_and_old_domains(coded_p3):
    """NC: broad COUNT_TOOLS extension, wrong source or incomplete versions must fail."""
    p3 = coded_p3
    key = f"find_reason_links:shopee_reviews:{VERSION}+reason-2026-10-30.1"
    p3.method(key, subjects=("canxi",))
    assert len(p3.rows("method_ledger")) == 1
    assert p3.box.module.load_shared_store(RUN)["ledger"][key] == {"canxi"}
    for bad in (f"find_reason_links:search_suggestions:{VERSION}+reason-2026-10-30.1",
                "find_reason_links:shopee_reviews:reason-2026-10-30.1",
                f"find_reason_links:shopee_reviews:{VERSION}+", "code_reviews:shopee_reviews:x"):
        before = p3.digest(p3.store)
        with pytest.raises(ValueError):
            p3.method(bad, subjects=("canxi",))
        assert p3.digest(p3.store) == before
    # Malformed direct SQL is only a reader trust-boundary control, never positive evidence.
    bad = "find_reason_links:search_suggestions:x+y"
    with sqlite3.connect(p3.store) as db:
        db.execute("INSERT INTO method_ledger VALUES (?,?,?,?,?)", (bad, "canxi", RUN, "synthetic-owner", DATE))
    assert bad not in p3.box.module.load_shared_store(RUN)["ledger"]
    for old in ("theme_counts:shopee_reviews:x", "keyword_counts:search_suggestions:x", "portrait_counts:tiktok_shop_reviews:x"):
        p3.method(old, subjects=("canxi",))
        assert old in p3.box.module.load_shared_store(RUN)["ledger"]


@pytest.mark.parametrize("target", ["source", "part"])
def test_im_q124_reason_ledger_extension_does_not_widen_frame(coded_p3, p3_frame, target):
    """NC: adding find_reason_links to the frame/count allowlist admits these copies."""
    p3 = coded_p3
    p3.method(f"find_reason_links:shopee_reviews:{VERSION}+{p3.box.module.REASON_RULES_VERSION}")
    frame = p3_frame()
    node = next(s for s in frame["sources"] if s["key"] == "shopee_reviews") if target == "source" else frame["parts"][7]
    node["count_tools"] = ["find_reason_links"]
    p3_frame(frame)
    error(p3.call("report_plan"), "FRAME_INVALID")


@pytest.mark.parametrize("recorded,graded", [("find_reason_links", "theme_counts"), ("theme_counts", "find_reason_links")])
def test_im_q124_method_approvals_do_not_cross_categories(coded_p3, codebook, recorded, graded):
    """NC: a source-only ledger lookup reuses count stability as reason stability."""
    p3 = coded_p3
    book = codebook()
    book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
    codebook(book)
    p3.sample()
    suffix = VERSION + ("+" + p3.box.module.REASON_RULES_VERSION if recorded == "find_reason_links" else "")
    p3.method(f"{recorded}:shopee_reviews:{suffix}")
    if graded == "theme_counts":
        result = p3.confidence(p3.theme(), 8)
        assert result["items"][0]["checks"]["4"] == dict(missing=True, reason="METHOD_ON_0_PRODUCTS")
    else:
        value = statement(p3.theme())
        value["evidence"] += p3.chain()
        assert accepted(p3.submit(value))["ceiling"] == "Yếu"
        assert "METHOD_ON_0_PRODUCTS" in p3.report_rows("statement_version")[-1]["evidence_json"]

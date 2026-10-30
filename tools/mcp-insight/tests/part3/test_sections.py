"""R-IM10 public submissions, including all eight refusal reasons."""

import copy

import pytest

from insight_test_support import OTHER, error, review
from p3_support import accepted, claim, codes, immutable, mutate_label
from p2_support import keyword_row


@pytest.mark.parametrize("change", [
    {"part": 18}, {"part": 0}, {"part": True}, {"text": " "}, {"text": "x" * 20001},
    {"claims": "invalid"},
])
def test_im_q82_input_limits_are_atomic(coded_p3, change):
    """NC: accepting the generated appendix or wrong primitive types writes a version."""
    args = dict(part=8, text="Khách kể lại cân nhắc giá [^c1].", claims=[claim(coded_p3.theme())])
    args.update(change)
    error(coded_p3.call("submit_section", **args), "INVALID_ARGUMENT")
    assert coded_p3.report_rows("section_version") == []


@pytest.mark.parametrize("fault", ["extra", "duplicate", "unknown_marker", "missing_marker", "twice",
                                   "level", "boolean", "empty", "frame", "too_many", "reason_id"])
def test_im_q82_claim_shape_and_marker_bijection(coded_p3, fault):
    """NC: lenient claims or marker matching accept at least one invalid packet."""
    p3 = coded_p3
    c = claim(p3.theme())
    text, claims, part = "Khách kể lại cân nhắc giá [^c1].", [c], 8
    if fault == "extra":
        c["numbers"] = []
    elif fault == "duplicate":
        claims.append(copy.deepcopy(c))
    elif fault == "unknown_marker":
        text += " Ý khác [^c2]."
    elif fault == "missing_marker":
        text = "Khách kể lại cân nhắc giá."
    elif fault == "twice":
        text += " Ý khác [^c1]."
    elif fault == "level":
        c["confidence"] = "Cao"
    elif fault == "boolean":
        c["hypothesis"] = 1
    elif fault == "empty":
        c["evidence"] = []
    elif fault == "frame":
        part = 2
    elif fault == "too_many":
        claims *= 51
    else:
        c["evidence"][0]["count_id"] = p3.why(("T-GIA", "T-CONGDUNG"))["count_id"]
    error(p3.call("submit_section", part=part, text=text, claims=claims), "INVALID_ARGUMENT")


def test_im_q82_stale_and_unknown_ids_are_distinct(coded_p3):
    """NC: registry-only lookup treats historical evidence as current."""
    p3 = coded_p3
    old = p3.theme()
    mutate_label(p3)
    error(p3.section(row=old), "COUNT_ID_STALE")
    unknown = dict(old, count_id="IMC-000000000000")
    error(p3.section(row=unknown), "COUNT_ID_UNKNOWN")
    accepted(p3.section(row=p3.theme()))


def test_im_q83_all_reasons_are_ordered_not_fail_fast(coded_p3):
    """NC: fail-fast or unordered gate aggregation misses this exact three-code result."""
    result = coded_p3.section("Khách kể lại: Google có 99 người mua [^c1].")
    assert codes(result) == ["NUMBER_MISMATCH", "HIDDEN_NAME", "BUYER_WORD"]
    assert "version" not in result and "claims" not in result
    good = accepted(coded_p3.section())
    assert good["part"] == 8 and good["version"] == 1
    assert good["claims"] == [dict(ref="c1", confidence="Yếu", ceiling="Yếu", hypothesis=False)]


@pytest.mark.parametrize("text,ok", [
    ("6 đánh giá trên 3 sản phẩm kể lại nhắc vị [^c1].", True),
    ("6/40 đánh giá kể lại nhắc vị [^c1].", True),
    ("Vị có 6 đánh giá kể lại [^c1], giá có 9 đánh giá kể lại [^c2].", True),
    ("Như Phần 6, vị có 6 đánh giá kể lại [^c1].", True),
    ("R-I33 zqv01 T-VI được kể lại [^c1].", True),
    ("7 đánh giá kể lại nhắc vị [^c1].", False),
    ("Vị có 9 đánh giá kể lại [^c1], giá có 6 đánh giá kể lại [^c2].", False),
    ("6 đánh giá trên 4 sản phẩm kể lại [^c1].", False),
    ("6% khách kể lại khen vị [^c1].", False),
    ("6 phần trăm khách kể lại khen vị [^c1].", False),
    ("6 khách kể lại khen vị [^c1].", False),
    ("sáu đánh giá kể lại nhắc vị [^c1].", False),
    ("6/50 đánh giá kể lại nhắc vị [^c1].", False),
    ("6,5 đánh giá kể lại [^c1].", False),
    ("6.5 đánh giá kể lại [^c1].", False),
    ("6 đánh giá kể lại [^c1]. Có 12 đánh giá.", False),
])
def test_im_q84_numbers_bind_to_own_claim_and_unit(numeric_p3, text, ok):
    """NC: union-of-values, first-number-only, unitless and unmarked bypass mutants."""
    p3 = numeric_p3
    claims = [claim(p3.theme("T-VI"))]
    if "[^c2]" in text:
        claims.append(claim(p3.theme(), "c2"))
    result = p3.section(text, claims=claims)
    assert ("NUMBER_MISMATCH" not in codes(result)) is ok
    if text.startswith("7 đánh giá"):
        detail = next(r["detail"] for r in result["reasons"] if r["code"] == "NUMBER_MISMATCH")
        assert "7" in detail and "c1" in detail
        assert "reviews" in detail or "đánh giá" in detail
    if ok:
        accepted(result)


def test_im_q84_numeric_claim_requires_exactly_one_id(numeric_p3):
    """NC: matching against either ID credits an ambiguous quantitative claim."""
    c = claim(numeric_p3.theme("T-VI"))
    c["evidence"].append(dict(count_id=numeric_p3.theme()["count_id"], part=None))
    assert "NUMBER_MISMATCH" in codes(numeric_p3.section("6 đánh giá kể lại [^c1].", claims=[c]))


def test_im_q84_grouped_thousands_are_integers(p3):
    """NC: parsing 1.248 as decimal or token 1 rejects a supported grouped integer."""
    p3.seed([], keywords=[f"có nên dùng mẫu thử {i}" for i in range(1248)])
    row = keyword_row(p3.box)
    accepted(p3.section("Có 1.248 từ khóa [^c1].", row=row, part=6))
    assert "NUMBER_MISMATCH" in codes(p3.section("Có 1.249 từ khóa [^c1].", row=row, part=6))


@pytest.mark.parametrize("confidence,ok", [("Khá", False), ("Yếu", True), ("Không", True)])
def test_im_q85_draft_theme_caps_at_weak(coded_p3, confidence, ok):
    """NC: taking the submitted level on trust accepts Khá on DRAFT evidence."""
    c = claim(coded_p3.theme(), confidence=confidence)
    result = coded_p3.section(claims=[c])
    assert ("CONFIDENCE_ABOVE_CEILING" not in codes(result)) is ok
    if not ok:
        assert any("Yếu" in r["detail"] for r in result["reasons"] if r["code"] == "CONFIDENCE_ABOVE_CEILING")
    if ok:
        accepted(result)


def test_im_q85_keyword_certain_and_lowest_item(coded_p3, p3_groups):
    """NC: highest-item aggregation accepts Khá despite a weak second item."""
    p3 = coded_p3
    groups = p3_groups()
    kw = keyword_row(p3.box)
    p3.sample("keyword_groups", groups["version"])
    p3.diversity(kw["count_id"])
    p3.method("keyword_counts:search_suggestions:" + groups["version"])
    accepted(p3.section("Chủ đề hỏi cách chọn [^c1].", part=6,
                        claims=[claim(kw, confidence="Chắc")]))
    c = claim(kw, confidence="Khá", conclusion=False, part=6)
    # Both items are Quan tâm. In part 4 the second item misses check 1
    # (secondary source) and check 2 (below threshold), giving Yếu under Q67.
    weak = next(r for r in p3.call("keyword_counts")["rows"] if r["group_key"] == "loai_nao")
    weak_grade = p3.confidence(weak, 4)
    assert weak_grade["ceiling"] == "Yếu"
    assert weak_grade["items"][0]["checks"]["1"] == dict(missing=True, reason="SECONDARY_SOURCE")
    assert weak_grade["items"][0]["checks"]["2"] == dict(missing=True, reason="BELOW_THRESHOLD")
    c["evidence"].append(dict(count_id=weak["count_id"], part=4))
    result = p3.section("Quan sát dưới ngưỡng [^c1].", part=1, claims=[c])
    assert codes(result) == ["CONFIDENCE_ABOVE_CEILING"]
    c["confidence"] = "Yếu"
    accepted(p3.section("Quan sát dưới ngưỡng [^c1].", part=1, claims=[c]))


@pytest.mark.parametrize("hypothesis,ok", [(False, False), (True, True)])
def test_im_q85_gender_requires_hypothesis(coded_p3, hypothesis, ok):
    """NC: omitting the computed hypothesis flag accepts a demographic guess as fact."""
    p3 = coded_p3
    p3.share()
    row = next(r for r in p3.call("portrait_counts")["rows"] if r["dimension"] == "Giới")
    c = claim(row, confidence="Yếu", hypothesis=hypothesis)
    result = p3.section("Nhóm chỉ mang tính gợi ý [^c1].", row=row, part=13, claims=[c])
    assert ("CONFIDENCE_ABOVE_CEILING" not in codes(result)) is ok


@pytest.mark.parametrize("size,conclusion,note,ok", [
    (4, True, True, False), (4, False, False, False), (4, False, True, True), (5, True, False, True),
])
def test_im_q86_threshold_needs_both_observation_flag_and_note(p3, size, conclusion, note, ok):
    """NC: checking only conclusion or using >5 instead of >=5 breaks paired cases."""
    p3.seed([], keywords=[f"có nên dùng mẫu thử {i}" for i in range(size)])
    row = keyword_row(p3.box)
    text = f"{size} từ khóa hỏi có nên dùng" + (", dưới ngưỡng" if note else "") + " [^c1]."
    result = p3.section(text, part=6, claims=[claim(row, conclusion=conclusion)])
    assert ("BELOW_THRESHOLD_CONCLUSION" not in codes(result)) is ok
    if ok:
        accepted(result)


@pytest.mark.parametrize("text,ok", [
    ("Uống viên này, hai tuần thấy ngủ NGON", False),
    ("viên này hai tuần thấy ngủ ngon", True),
    ("uong vien nay hai tuan thay ngu ngon", True),
])
def test_im_q87_exact_eight_words_normalization(p3, text, ok):
    """NC: raw-substring and nine-word-minimum mutants miss the exact-eight case."""
    p3.seed([review(1, text="zqv90 uống viên này hai tuần thấy ngủ ngon hơn hẳn mọi khi")], keywords=())
    result = p3.call("submit_section", part=3, text=text, claims=[])
    assert ("VERBATIM_QUOTE" not in codes(result)) is ok
    if not ok:
        assert not p3.report_store.exists()
        quote = next(r for r in result["reasons"] if r["code"] == "VERBATIM_QUOTE")
        assert any(c.isdigit() for c in quote["detail"])


def test_im_q87_quote_check_is_run_local(p3):
    """NC: scanning another run's warehouse rejects unrelated local prose."""
    p3.seed([review(1, text="zqvlocal dữ liệu mẫu")], keywords=())
    p3.box.seed([review(2, text="zqvremote uống viên này hai tuần thấy ngủ ngon hơn")], run_id=OTHER)
    assert "error" not in p3.box.call("build_warehouse", OTHER)
    accepted(p3.call("submit_section", part=3, text="Uống viên này hai tuần thấy ngủ ngon", claims=[]))


@pytest.mark.parametrize("text,ok", [
    ("tỷ lệ chuyển đổi", False), ("từ quan tâm sang mua", False),
    ("Từ Biết đến tới Sau mua", False), ("từ quan tâm", True),
    ("khách chuyển sang dạng viên", True),
])
def test_im_q88_conversion_phrases_and_step_pattern(coded_p3, text, ok):
    """NC: a conversion-word-only matcher misses different purchase-step hops."""
    result = coded_p3.call("submit_section", part=3, text=text, claims=[])
    assert ("CONVERSION_RATE" not in codes(result)) is ok


@pytest.mark.parametrize("text,ok", [
    ("Thị phần 35%", False), ("doanh thu 120 triệu", False), ("giá 150k", False),
    ("giá 150.000 đ", False), ("thương hiệu A xếp hạng cao hơn vì 4,9 sao", False),
    ("Doanh thu và thị phần xem ở báo cáo Market.", True), ("tại sao khách chọn", True),
])
def test_im_q89_market_currency_and_star_ranking(coded_p3, text, ok):
    """NC: dropping the currency branch accepts 150k without any Market term."""
    result = coded_p3.call("submit_section", part=3, text=text, claims=[])
    assert ("MARKET_NUMBER" not in codes(result)) is ok


@pytest.mark.parametrize("text,ok", [(s, False) for s in ("Google", "METRIC", "Jev", "OpenAI", "World Bank", "gpt-4o")]
                         + [(s, True) for s in ("metric tons", "Shopee", "TikTok Shop")])
def test_im_q90_full_hidden_name_rule(coded_p3, text, ok):
    """NC: a four-name list misses OpenAI and lowercase Metric overmatching fails."""
    result = coded_p3.call("submit_section", part=3, text=text, claims=[])
    assert ("HIDDEN_NAME" not in codes(result)) is ok
    if not ok:
        assert any(text.lower() in r["detail"].lower() for r in result["reasons"] if r["code"] == "HIDDEN_NAME")


@pytest.mark.parametrize("text,ok", [("12 người mua khen vị [^c1].", False),
                                       ("Người mua nói về giá [^c1].", False),
                                       ("Chưa có dữ liệu về người mua thật.", True)])
def test_im_q91_buyer_word_requires_quantity_or_claim(coded_p3, text, ok):
    """NC: rejecting every buyer mention rejects the approved missing-data sentence."""
    result = coded_p3.section(text, part=13, claims=[] if ok else [claim(coded_p3.theme())])
    assert ("BUYER_WORD" not in codes(result)) is ok


def test_im_q92_steps_follow_every_evidence_item(coded_p3):
    """NC: assigning a section default or ignoring the second item merges two steps."""
    p3 = coded_p3
    kw = keyword_row(p3.box)
    accepted(p3.section("Chủ đề hỏi cách chọn [^c1].", part=6, row=kw))
    assert "STEP_NOT_FROM_EVIDENCE" in codes(p3.section("Chủ đề hỏi cách chọn [^c1].", part=6,
                                                      claims=[claim(kw, step="Sau mua")]))
    use = next(r for r in p3.call("keyword_counts")["rows"] if r["group_key"] == "cach_dung")
    for step in ("Chưa rõ bước", "Quan tâm"):
        result = p3.section("Cách dùng, dưới ngưỡng [^c1].", part=12,
                            claims=[claim(use, step=step, conclusion=False)])
        assert ("STEP_NOT_FROM_EVIDENCE" not in codes(result)) is (step == "Chưa rõ bước")
    for step in ("Quan tâm", "Sau mua"):
        c = claim(kw, step=step, part=6)
        c["evidence"].append(dict(count_id=p3.theme()["count_id"], part=8))
        assert "STEP_NOT_FROM_EVIDENCE" in codes(p3.section("Khách cân nhắc [^c1].", part=1, claims=[c]))


def test_im_q93_append_only_versions_are_per_part(coded_p3):
    """NC: replacement, rejected-version gaps and run-global counters all fail."""
    p3 = coded_p3
    assert accepted(p3.section())["version"] == 1
    first = copy.deepcopy(p3.report_rows("section_version")[0])
    assert "NUMBER_MISMATCH" in codes(p3.section("99 đánh giá kể lại [^c1]."))
    assert accepted(p3.section("Nhóm khách cân nhắc [^c1].", part=4))["version"] == 1
    assert accepted(p3.section())["version"] == 2
    rows = p3.report_rows("section_version")
    assert [r["version"] for r in rows if r["part"] == 8] == [1, 2]
    assert rows[0] == first
    assert first["run_id"] == p3.box.run_id
    assert first["frame_version"] and first["codebook_version"]
    assert first["claims_json"] and first["graded_json"]
    immutable(p3.report_store, "section_version", "part=? AND version=?", (8, 1))


@pytest.mark.parametrize("text,ok", [("Giá rẻ là lý do khách chọn sản phẩm này.", False),
                                       ("# Lý do chọn\nChưa có dữ liệu về lý do chọn trên TikTok Shop.", True)])
def test_im_q108_every_substantive_sentence_needs_claim(coded_p3, text, ok):
    """NC: number-free qualitative conclusions cannot bypass evidence coverage."""
    result = coded_p3.section(text, claims=[])
    assert ("UNSUPPORTED_SENTENCE" not in codes(result)) is ok
    if ok:
        accepted(result)
    accepted(coded_p3.call("submit_section", part=3, text="Báo cáo dùng đánh giá trên sàn.", claims=[]))


@pytest.mark.parametrize("part,text,kind", [
    (17, "Nên chạy chiến dịch quảng cáo cảm xúc dịp Tết", "campaign"),
    (9, "Đối thủ nên giảm giá hộp lớn", "competitor"),
    (17, "Nên đặt hàng thử ở shop mới", "trial_order"),
    (17, "Thử nghiệm ghi rõ quy cách trên trang sản phẩm", None),
])
def test_im_q109_section_recommendation_gates_have_valid_claims(coded_p3, part, text, kind):
    """NC: campaign-only and statement-only guards miss competitor/section cases."""
    c = claim(coded_p3.theme(), part=8 if part == 17 else None)
    result = coded_p3.section(text + " [^c1].", part=part, claims=[c])
    reasons = [r for r in result["reasons"] if r["code"] == "BANNED_IDEA"]
    assert bool(reasons) is (kind is not None)
    assert "UNSUPPORTED_SENTENCE" not in codes(result)
    if kind:
        assert kind in reasons[0]["detail"]
    else:
        accepted(result)


@pytest.mark.parametrize("part,text,ok", [(8, "Khách kể lại chọn vì giá", True),
                                           (8, "Khách chọn vì giá", False),
                                           (13, "Khách khen vị sau khi dùng", True),
                                           (13, "Khách nói lý do mua là giá", False)])
def test_im_q110_buying_reasons_are_retold_after_purchase(coded_p3, part, text, ok):
    """NC: a part-8-only guard misses a buying-reason claim in part 13."""
    result = coded_p3.section(text + " [^c1].", part=part)
    assert ("RETOLD_NOT_MARKED" not in codes(result)) is ok


@pytest.mark.parametrize("text,ok", [
    ("# Khách chọn vì giá thấp", False), ("# Giá thấp là lý do chính", False),
    ("Chưa có dữ liệu trên TikTok Shop, nhưng khách chọn vì giá thấp.", False),
    ("Chưa có dữ liệu về TikTok Shop nên khách chọn Shopee.", False),
    ("Chưa có dữ liệu về tuổi chứng tỏ khách thích vị ngọt.", False),
    ("# Lý do chọn", True), ("## Sau mua", True), ("## Shopee", True),
    ("Chưa có dữ liệu về lý do chọn trên TikTok Shop.", True),
    ("Chưa có dữ liệu về tuổi.", True), ("Chưa có dữ liệu.", True),
])
def test_im_q120_exemptions_use_closed_titles_and_topics(coded_p3, text, ok):
    """NC: arbitrary # titles, substring exemptions and the old inference-tail mutant."""
    result = coded_p3.section(text, claims=[])
    assert codes(result) == ([] if ok else ["UNSUPPORTED_SENTENCE"])
    if not ok:
        detail = result["reasons"][0]["detail"]
        assert "0" in detail and text not in detail


@pytest.mark.parametrize("text,code", [
    ("Báo cáo không tính tỷ lệ chuyển đổi giữa các bước.", None),
    ("Báo cáo không xếp hạng thương hiệu theo số sao.", None),
    ("Báo cáo không đưa ý tưởng quảng cáo.", None),
    ("Tỷ lệ chuyển đổi không cao.", "CONVERSION_RATE"),
    ("Không có 12% chuyển đổi.", "CONVERSION_RATE"),
    ("tỷ lệ chuyển đổi từ quan tâm sang mua là 5%", "CONVERSION_RATE"),
])
def test_im_q117_methodological_denial_is_complete_form(coded_p3, text, code):
    """NC: blanket phrase rejection and word-order-insensitive exemptions fail."""
    result = coded_p3.call("submit_section", part=3, text=text, claims=[])
    if code:
        assert code in codes(result)
    else:
        accepted(result)


def test_im_q117_marker_prevents_denial_exemption(coded_p3):
    """NC: treating a cited assertion as neutral methodology hides conversion claims."""
    kw = keyword_row(coded_p3.box)
    result = coded_p3.section("Khách không chuyển đổi [^c1].", row=kw, part=6)
    assert "CONVERSION_RATE" in codes(result)


@pytest.mark.parametrize("text,code", [
    ("Có không ít ý tưởng quảng cáo cảm xúc nên triển khai.", "BANNED_IDEA"),
    ("Báo cáo không chỉ đưa ý tưởng quảng cáo.", "BANNED_IDEA"),
    ("Báo cáo không đưa ý tưởng quảng cáo nhưng nên chạy chiến dịch Tết.", "BANNED_IDEA"),
    ("Báo cáo không chỉ tính tỷ lệ chuyển đổi.", "CONVERSION_RATE"),
    ("Báo cáo chưa đo tỷ lệ chuyển đổi.", None),
    ("Báo cáo không tính tỷ lệ chuyển đổi giữa các bước.", None),
    ("Báo cáo không xếp hạng thương hiệu theo số sao.", None),
    ("Báo cáo không đưa ý tưởng quảng cáo.", None),
])
def test_im_q123_affirmative_negations_and_second_clauses(coded_p3, text, code):
    """NC: three-word negation windows and missing DENIAL_STOP accept recommendations."""
    result = coded_p3.call("submit_section", part=3, text=text, claims=[])
    assert codes(result) == ([] if code is None else [code])

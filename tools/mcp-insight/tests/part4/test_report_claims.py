"""Claim IDs at report boundaries: row-bound context, flags, numbers and downgrade."""

import copy
import hashlib
import json

import pytest

from claim_support import BOTH, BURST, ONE, RULES, THEME, catalogue
from insight_test_support import VERSION, canonical, error, review
from p2_support import DATE
from p3_support import accepted, claim, codes, line, statement


@pytest.fixture
def numeric_claims(p4):
    rows = [review(i, text=f"zqvnum{i} fixture") for i in range(1, 215)]
    rows += [review(i, platform="tiktok_shop", name=f"writer_numeric_{i}", text=f"zqvnum{i} fixture")
             for i in range(1001, 1051)]
    for r in rows:
        i = int(r["id"])
        if r["platform"] == "shopee":
            r["postedAtLocal"] = f"2023-{i:02d}-01" if i <= 10 else "2026-10-22"
            if i == 11: r["postedAtLocal"] = "2022-02-21"
        else: r["review_timestamp_fmt"] = "01/03/2026" if i < 1050 else "30/06/2026"
    p4.seed(rows)
    cat = catalogue(size=3)
    cat["claims"][0]["name"] = "xương chắc hơn"
    p4.catalogue(cat)
    def policy(body, n):
        i = int(body["text"].split()[0].removeprefix("zqvnum"))
        return {p4.codes[0]: .9 if i <= 10 else .1, p4.codes[1]: .9 if 1001 <= i <= 1004 else .1}
    p4.code_claims(policy)
    a, b = p4.row(), p4.row(p4.codes[1], "tiktok_shop")
    assert a["reviews"] == 10 and a["flags"] == [] and b["reviews"] == 4 and b["flags"] == []
    return p4, a, b


GOOD = "Trên Shopee, theo bằng chứng sau gộp, ý xương chắc hơn được nhắc nhiều nhất: 10/214 đánh giá, từ 21/02/2022 đến 22/10/2026 [^c1]."


@pytest.mark.parametrize("text,missing", [
    ("Ý được nhắc nhiều nhất là xương chắc hơn [^c1].", ("measure", "platform", "sample", "period")),
    ("Theo bằng chứng, ý xương chắc hơn nhiều nhất [^c1].", ("platform", "sample", "period")),
    (GOOD.replace("Trên Shopee, ", ""), ("platform",)),
    (GOOD.replace("Trên Shopee", "Trên TikTok Shop"), ("platform",)),
    (GOOD.replace("21/02/2022", "01/01/2020"), ("period",)),
    (GOOD, ()),
    ("Ý xương chắc hơn được nhắc nhiều nhất [^c1]: trên Shopee, theo bằng chứng, 10/214 đánh giá, từ 21/02/2022 đến 22/10/2026.", ()),
    ("Ý xương chắc hơn được nhắc nhiều nhất [^c1]: trên Shopee, theo bằng chứng, từ 21/02/2022 đến 22/10/2026.", ("sample",)),
    ("10 đánh giá nói xương chắc hơn [^c1].", ()),
])
def test_im_q158_claim_rank_context_binds_platform_sample_period_and_trailing_region(numeric_claims, text, missing):
    """NC R2-2: suffix-only region, any-date and broad 'hơn' rank-term mutants each disagree."""
    p4, row, _ = numeric_claims
    result = p4.section(text, row=row)
    rank = [r for r in result["reasons"] if r["code"] == "CLAIM_RANK_UNSCOPED"]
    if missing:
        assert rank and rank[0]["claim"] == "c1"
        for key in missing: assert key in rank[0]["detail"]
    else: accepted(result)


def test_im_q158_two_markers_cannot_borrow_another_platforms_context(numeric_claims):
    """NC: a sentence-wide scope check incorrectly lets c2 borrow c1's unequal dates and denominator."""
    p4, a, b = numeric_claims
    first = GOOD[:-1] + "; "
    second = "trên TikTok Shop, theo bằng chứng, 4/50 đánh giá, từ 01/03/2026 đến 30/06/2026, dưới ngưỡng [^c2]."
    # Semicolon joins the regions into a single sentence.
    claims = [claim(a), claim(b, ref="c2", conclusion=False)]
    p4.share(60)
    accepted(p4.section(first + second, claims=claims, part=13))
    bad = first + "trên TikTok Shop, theo bằng chứng, ý B [^c2]."
    result = p4.section(bad, claims=claims)
    detail = next(r for r in result["reasons"] if r["code"] == "CLAIM_RANK_UNSCOPED" and r["claim"] == "c2")
    assert "sample" in detail["detail"] and "period" in detail["detail"]
    after = "Ý A nhiều nhất [^c1] trên Shopee, theo bằng chứng, 10/214 đánh giá, từ 21/02/2022 đến 22/10/2026, ý B có 4 đánh giá [^c2]."
    result = p4.section(after, claims=claims)
    detail = next(r for r in result["reasons"] if r["code"] == "CLAIM_RANK_UNSCOPED" and r["claim"] == "c1")
    assert all(k in detail["detail"] for k in ("measure", "platform", "sample", "period"))


@pytest.mark.parametrize("text,valid", [("10 bằng chứng [^c1].", True), ("11 bằng chứng [^c1].", False),
    ("10/214 đánh giá [^c1].", True), ("10/200 đánh giá [^c1].", False),
    ("từ 21/2/2022 đến 22/10/2026 [^c1].", True), ("từ 20/02/2022 đến 22/10/2026 [^c1].", False),
    ("1 gian hàng [^c1].", True), ("2 gian hàng [^c1].", False)])
def test_im_q159_claim_measure_fraction_dates_are_registry_bound(numeric_claims, text, valid):
    """NC: accepting any evidence value/denominator/date or omitting new shop units changes paired results."""
    p4, row, _ = numeric_claims
    result = p4.section(text, row=row)
    assert ("NUMBER_MISMATCH" not in codes(result)) is valid
    if valid: accepted(result)


def test_im_q159_new_units_and_dates_do_not_widen_theme_or_frame_gates(numeric_claims):
    """NC: globally enabling claim units or dates weakens the unchanged IM-Q84 boundaries."""
    p4, _, _ = numeric_claims
    theme = p4.theme()
    assert "NUMBER_MISMATCH" in codes(p4.section("6 bằng chứng [^c1].", row=theme))
    assert "NUMBER_MISMATCH" in codes(p4.section("30/10/2026 [^c1].", row=theme))
    result = p4.section("3 gian hàng", claims=[], part=3)
    assert "NUMBER_MISMATCH" not in codes(result)


def flag_rows(p4, collision=False):
    rows = [review(i, product=1, text=f"zqvflag{i} fixture") for i in range(1, 10)]
    rows += [review(i, product=i % 3 + 1, text=f"zqvflag{i} fixture") for i in range(101, 107)]
    rows += [review(i, product=i % 3 + 1, text=f"zqvflag{i} fixture") for i in range(201, 206)]
    rows += [review(301, platform="tiktok_shop", text="zqvflag301 fixture")]
    if collision: rows += [review(401, text="dồn thời gian")]
    for row in rows:
        if 101 <= int(row["id"]) <= 106: row["postedAtLocal"] = "2026-03-01"
    p4.seed(rows)
    p4.catalogue(catalogue(size=4))
    def policy(body, n):
        i = 401 if body["text"] == "dồn thời gian" else int(body["text"].split()[0].removeprefix("zqvflag"))
        return {p4.codes[0]: .9 if i <= 9 else .1,
                p4.codes[1]: .9 if 101 <= i <= 106 or i == 301 else .1,
                p4.codes[2]: .9 if 201 <= i <= 205 else .1}
    p4.code_claims(policy)
    a, b, c = [p4.row(code) for code in p4.codes[:3]]
    assert a["flags"] == [ONE] and set(b["flags"]) == {BURST, BOTH} and c["flags"] == []
    return a, b, c


@pytest.mark.parametrize("text,reason,ref,missing", [
    ("Ý A có 9 bằng chứng, chủ yếu từ một sản phẩm [^c3].", None, None, None),
    ("[^c3] Ý A có 9 bằng chứng, chủ yếu từ một sản phẩm.", None, None, None),
    ("Ý B có 6 đánh giá, dồn thời gian, có ở cả 2 sàn [^c4].", None, None, None),
    ("Khách nhắc ý A [^c3].", None, None, None),
    ("Ý A có 9 bằng chứng [^c3].", "CLAIM_FLAG_MISSING", "c3", "one_product"),
    ("[^c3] Ý A có 9 bằng chứng.", "CLAIM_FLAG_MISSING", "c3", "one_product"),
    ("Ý B có 6 đánh giá, dồn thời gian [^c4].", "CLAIM_FLAG_MISSING", "c4", "both_platforms"),
    ("Ý A có 9 bằng chứng [^c3], chủ yếu từ một sản phẩm, ý C có 5 bằng chứng [^c5].", "CLAIM_FLAG_MISSING", "c3", "one_product"),
    ("Ý C có 5 bằng chứng, chủ yếu từ một sản phẩm [^c5].", "NUMBER_MISMATCH", None, None),
    ("Ý C có 5 bằng chứng, có ở cả 2 sàn [^c7].", "NUMBER_MISMATCH", None, None),
    ("Ý A có 9 bằng chứng, chủ yếu từ một sản phẩm, bán ở 2 sàn [^c3].", "NUMBER_MISMATCH", None, None),
])
def test_im_q162_required_flag_spans_are_exempt_only_for_the_bound_row(p4, text, reason, ref, missing):
    """NC R2-1/R2-2: global exemptions, whole-sentence flags or pre-marker-only binding all fail."""
    a, b, c = flag_rows(p4)
    present = [claim(row, ref=r, conclusion=row["threshold_met"]) for row, r in
               ((a, "c3"), (b, "c4"), (c, "c5"), (c, "c7")) if f"[^{r}]" in text]
    if any(not c["conclusion"] for c in present):
        text = "Dưới ngưỡng, " + text
    result = p4.section(text, claims=present)
    if reason is None: accepted(result)
    else:
        assert reason in codes(result)
        if ref:
            entry = next(r for r in result["reasons"] if r["code"] == reason and r["claim"] == ref)
            assert missing in entry["detail"]


def test_im_q162_quote_collision_flags_survive_text_appendix_and_statement_lines(p4):
    """NC: unconditional quote masking admits c6, while redacting flags loses mandatory rendered warnings."""
    a, b, c = flag_rows(p4, collision=True)
    text = "Dưới ngưỡng, ý A có 9 bằng chứng, chủ yếu từ một sản phẩm [^c3]."
    accepted(p4.section(text, claims=[claim(a, ref="c3", conclusion=False)]))
    btext = "Ý B có 6 đánh giá, dồn thời gian, có ở cả 2 sàn [^c4]."
    accepted(p4.section(btext, part=6, claims=[claim(b, ref="c4")]))
    assert "VERBATIM_QUOTE" in codes(p4.section("Ý D dồn thời gian [^c6].", claims=[claim(c, ref="c6")]))
    value = statement(b)
    accepted(p4.submit(value))
    p4.render()
    page = p4.page()
    assert text.split(" [^")[0] in page.section(8).text
    assert btext.split(" [^")[0] in page.section(6).text
    assert any("9 bằng chứng" in n.text and ONE in n.text for n in page.section(8).all("p"))
    appendix = page.section(18).text
    assert ONE in appendix and BURST in appendix and BOTH in appendix
    a_nodes = [n for n in page.section(18).all("tr") if a["count_id"] in n.text]
    assert a_nodes and all(ONE in n.text and a["claim_name"] in n.text for n in a_nodes)
    assert "Công dụng" in a_nodes[0].text
    # Locate each evidence line's smallest containing node. Both flags must
    # appear on that line, rather than elsewhere in the statements section.
    block = page.root.all("section", id="statements")[0]
    links = [node for node in block.all("a") if node.attrs.get("href", "").startswith("#fn-")]
    assert len(links) == 3
    for link in links:
        candidates = [node for node in block.all() if node.tag in {"li", "dd", "p"} and
                      node.all("a", href=link.attrs["href"])]
        assert candidates
        evidence_line = min(candidates, key=lambda n: len(n.text))
        assert BURST in evidence_line.text and BOTH in evidence_line.text


def test_im_q138_im_q160_real_approvals_draft_cap_and_status_only_downgrade(p4):
    """NC: omitting status from IDs leaves previously accepted stronger sections/statements valid after downgrade."""
    book = p4.book()
    book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
    p4.book(book)
    p4.seed([review(i) for i in range(1, 10)])
    # Q138 explicitly calls for a named Shopee warehouse fixture. The PR 1
    # source adapter deliberately has no named-Shopee carrier, so populate only
    # synthetic normalized identity metadata, never receipts/labels/count IDs.
    for i in range(1, 10):
        key = "w:" + hashlib.sha256(f"claim_writer_{i}".encode()).hexdigest()[:16]
        p4.box.sql("UPDATE review SET writer_known=1, writer_key=? WHERE review_id=?", (key, f"shopee:{i}"))
    p4.catalogue(catalogue() | dict(version="PASSED"))
    p4.code_claims()
    draft = p4.row()
    p4.sample()
    p4.method(f"claim_counts:shopee_reviews:{VERSION}+{RULES}")
    p4.diversity(draft["count_id"])
    assert p4.confidence(draft, 8)["ceiling"] == "Yếu"
    p4.pass_catalogue()
    passed = p4.row()
    p4.diversity(passed["count_id"])
    assert p4.confidence(passed, 8)["ceiling"] == "Chắc"
    accepted(p4.section("Khách kể lại cân nhắc tính phù hợp [^c1].", row=passed,
                        claims=[claim(passed, confidence="Khá")]))
    value = statement(passed, level="Khá")
    accepted(p4.submit(value))
    saved_sections = copy.deepcopy(p4.report_rows("section_version"))
    saved_statements = copy.deepcopy(p4.report_rows("statement_version"))
    p4.packet(seed=8)
    files = p4.grades()
    for grader in ("astra", "opus"): files[f"r1-{grader}.out"]["catalogue"][0]["verdict"] = "QUA_HEP"
    assert p4.record(files)["status"] == "DRAFT"
    current = p4.row()
    assert current["count_id"] != passed["count_id"]
    error(p4.confidence(passed, 8), "COUNT_ID_STALE")
    p4.render()
    assert "Cần gửi lại: số liệu đã đổi" in p4.page().section(8).text
    assert "Cần gửi lại: số liệu đã đổi" in p4.page().root.all("section", id="statements")[0].text
    assert p4.report_rows("section_version") == saved_sections and p4.report_rows("statement_version") == saved_statements
    p4.diversity(current["count_id"])
    result = p4.section("Khách kể lại cân nhắc tính phù hợp [^c1].", row=current,
                        claims=[claim(current, confidence="Khá")])
    assert "CONFIDENCE_ABOVE_CEILING" in codes(result)
    rejected = p4.submit(statement(current, level="Khá"))
    assert "CONFIDENCE_ABOVE_CEILING" in codes(rejected)
    accepted(p4.section("Khách kể lại cân nhắc tính phù hợp [^c1].", row=current))
    totals = p4.call("report_plan")
    assert current["count_id"] not in canonical(totals)


def test_im_q160_tiktok_claim_keeps_revenue_gate(numeric_claims):
    """NC: treating a claim as unscoped evidence bypasses the platform revenue prerequisite."""
    p4, _, row = numeric_claims
    assert p4.confidence(row, 13)["items"][0]["blocked"] == "REVENUE_SHARE_UNKNOWN"


def test_im_q160_claim_ledger_writer_reader_and_motive_kind(coded_claims):
    """NC: rejecting claim IDs as reason IDs or allowing every claim theme as a motive violates R-IM08/11."""
    p4 = coded_claims
    key = f"claim_counts:shopee_reviews:{VERSION}+{RULES}"
    p4.method(key, subjects=("canxi",))
    assert p4.box.module.load_shared_store(p4.box.run_id)["ledger"][key] == {"canxi"}
    with pytest.raises(ValueError): p4.method("claim_counts:search_suggestions:x+" + RULES)
    assert "MOTIVE_KIND_NOT_KEPT" not in codes(p4.submit(statement(p4.row())))
    p4.catalogue(catalogue("T-VI"), theme="T-VI")
    p4.code_claims()
    value = statement(p4.row())
    assert "MOTIVE_KIND_NOT_KEPT" in codes(p4.submit(value))

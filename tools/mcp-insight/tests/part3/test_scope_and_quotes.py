"""Scope context and before-storage whole-review controls from rounds 3–5."""

import pytest

from insight_test_support import no_leak, review
from p3_support import all_themes, codes, statement


@pytest.fixture
def scope_p3(p3):
    rows = [review(i, product=i % 3 + 1) for i in range(1, 41)]
    rows += [review(i, platform="tiktok_shop", product=i % 2 + 1,
                    name=f"synthetic_scope_writer{i}") for i in range(101, 161)]
    p3.seed(rows, keywords=[f"có nên dùng mẫu phạm vi {i}" for i in range(25)])
    assert "error" not in p3.code(all_themes)[0]
    # Missing completion receipts, not forged counts/registry IDs: seven reviews
    # have not completed coding. All source rows and text bytes remain intact.
    for rid in ["shopee:39", "shopee:40"] + [f"tiktok_shop:{i}" for i in range(156, 161)]:
        p3.box.sql("DELETE FROM coding_state WHERE review_id=?", (rid,))
    counts = p3.call("theme_counts")
    assert counts["coded_reviews"] == {"shopee": 38, "tiktok_shop": 55}
    return p3


@pytest.mark.parametrize("text,ok", [
    ("Thu 40 đánh giá Shopee, mã hóa 38 đánh giá.", True),
    ("Thu 60 đánh giá TikTok Shop.", True),
    ("Shopee có 3 sản phẩm.", True), ("TikTok Shop có 2 sản phẩm.", True),
    ("Thu 25 từ khóa ngày 30/10/2026.", True),
    ("Thu 40 đánh giá Shopee ngày 30/10/2026.", True),
    ("Thu 40 đánh giá Shopee.", True), ("Đã mã hóa 38 đánh giá Shopee.", True),
    ("Thu 60 đánh giá Shopee.", False),
    ("Shopee có 60 đánh giá, TikTok Shop có 40 đánh giá.", False),
    ("Mã hóa 40 đánh giá Shopee.", False), ("Thu 38 đánh giá Shopee.", False),
    ("Thu 40 đánh giá.", False), ("Thu 40 đánh giá trên Shopee và TikTok Shop.", False),
    ("Thu 25 từ khóa Shopee.", False), ("Có 12 người viết.", False),
    ("Chưa mã hóa 38 đánh giá Shopee.", False),
    ("Chưa gắn nhãn 38 đánh giá Shopee.", False),
    ("Không mã hoá 38 đánh giá Shopee.", False),
    ("Chưa mã hóa 2 đánh giá Shopee.", False),
    ("Số đánh giá chưa mã hóa: 40 đánh giá Shopee.", False),
    ("Số đánh giá đã mã hóa: 40 đánh giá Shopee.", False),
    ("Số đánh giá đã mã hóa: 38 đánh giá Shopee.", False),
    ("Đã mã hóa 38 đánh giá Shopee, 60 đánh giá TikTok Shop.", False),
])
def test_im_q121_scope_platform_measure_negation_and_split_context(scope_p3, text, ok):
    """NC: pooled values, ignored measure/negation and colon/comma collected fallback."""
    result = scope_p3.call("submit_section", part=3, text=text, claims=[])
    assert set(codes(result)) == (set() if ok else {"NUMBER_MISMATCH"})


@pytest.mark.parametrize("review_text,submitted,target,ok", [
    ("zqv77 hộp nhỏ gọn", "Zqv77, hộp nhỏ gọn", "section", False),
    ("zqv78 rất ổn", "zqv78 rất ổn", "note", False),
    ("zqv11 ngon", "zqv11 ngon", "note", False),
    ("zqv12", "Mã zqv12", "section", False),
    ("zqv13 mẫu ngắn gồm năm", "zqv13 mẫu ngắn gồm năm", "section", False),
    ("zqv14 mẫu ngắn có sáu từ", "zqv14 mẫu ngắn có sáu từ", "note", False),
    ("zqv15 mẫu ngắn này có bảy từ", "zqv15 mẫu ngắn này có bảy từ", "section", False),
    ("ngon", "vị ngon", "section", False),
    ("zqv77 hộp nhỏ gọn", "hộp nhỏ gọn", "section", True),
    ("zqv77 hộp nhỏ gọn", "vị ngọt dễ uống", "section", True),
])
def test_im_q111_every_short_review_length_rejects_before_storage(p3, review_text, submitted, target, ok,
                                                               capsys, caplog):
    """NC: >=8, >=4 and >=3 word guards all miss an adopted short-review case."""
    # Extra distinct reviews permit all unrelated statement gates to pass.
    p3.seed([review(1, text=review_text)] + [review(i) for i in range(2, 7)], keywords=())
    assert "error" not in p3.code(all_themes)[0]
    before = p3.digest(p3.report_store)
    if target == "section":
        result = p3.section(submitted + " [^c1].", part=13)
    else:
        value = statement(p3.theme())
        value["evidence"][0]["note"] = submitted
        result = p3.submit(value)
    assert codes(result) == ([] if ok else ["VERBATIM_QUOTE"])
    if not ok:
        assert p3.digest(p3.report_store) == before
        assert p3.report_rows("section_version") == []
        assert p3.report_rows("statement_version") == []
        captured = capsys.readouterr()
        for value in (result, captured.out, captured.err, caplog.text):
            no_leak(value, [review_text])
        p3.render()
        p3.privacy([v.decode() for v in p3.artifacts().values()])

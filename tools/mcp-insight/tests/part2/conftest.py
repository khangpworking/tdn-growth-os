"""New fixtures are local to part2; part 1 fixtures remain byte-for-byte intact."""

import copy
import json

import pytest

from insight_test_support import choice, review
from p2_support import Part2


@pytest.fixture
def p2(subject, sandbox):
    return Part2(sandbox)


@pytest.fixture
def frame(p2, monkeypatch):
    path = p2.box.insight / "data" / "report-frame.json"
    assert path.is_file(), "part 2 report frame has not landed"
    original = json.loads(path.read_text())
    target = p2.box.root / "report-frame.json"

    def use(value=None):
        data = copy.deepcopy(original if value is None else value)
        target.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(p2.box.module, "REPORT_FRAME_PATH", target)
        return data

    use()
    return use


@pytest.fixture
def keyword_groups(p2, monkeypatch):
    original = json.loads((p2.box.insight / "data" / "keyword-groups.json").read_text())
    target = p2.box.root / "keyword-groups.json"

    def use(approved=False):
        data = copy.deepcopy(original)
        if approved:
            data.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt="2026-10-30")
        target.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(p2.box.module, "KEYWORD_GROUPS_PATH", target)
        return data

    use()
    return use


@pytest.fixture
def coded_p2(p2):
    p2.seed()
    result, fake = p2.code()
    assert "error" not in result and len(fake.calls) == 10
    return p2


@pytest.fixture
def privacy_p2(p2):
    """Short whole-review and long nonce-free eight-word leak controls."""
    p2.seed([
        review(1, text="zqvp2short ok"),
        review(2, text="zqvp2long mẫu thử dài gồm nhiều từ độc lập dùng để kiểm tra phạm vi sao chép"),
        review(3, platform="tiktok_shop", name="synthetic_privacy_writer", text="zqvp2private ổn"),
    ], keywords=())
    assert "error" not in p2.code()[0]
    return p2


@pytest.fixture
def reason_baseline_r1_r13(p2):
    """IM-Q69 BASELINE only: R1..R13. R14/R15 use lifecycle fixtures below."""
    texts = {
        1: "zqv70 ngon vì chính hãng", 2: "zqv71 ngon và chính hãng", 3: "zqv72 rẻ nên mua",
        4: "zqv73 dona hàng ổn", 5: "zqv73b ngon vì chính hãng",
        6: "zqv74 vị ngon, chính hãng; rẻ nên mua", 7: "zqv75 ngon, chính hãng, nên dùng",
        8: "zqv76 ngon vì chính hãng", 9: "zqv77 chính hãng, để lâu vẫn ngon",
        10: "zqv78 ngon vì chính hãng", 11: "zqv79 ngon vì chính hãng",
        13: "zqv83 ngon vì chính hãng",
    }
    p2.seed([review(i, text=text) for i, text in texts.items()] + [
        review(20, platform="tiktok_shop", name="synthetic_reason_writer", text="zqv84 ngon vì chính hãng")],
        keywords=())

    def policy(body, answers, index):
        if body["text"] == texts[3]:
            answers["T-GIA"] = choice(khen=0.9)
        else:
            answers["T-CHINHHANG"] = choice(khen=0.9)
            answers["T-VI"] = choice(khen=0.69 if body["text"] == texts[5] else 0.9)

    result, fake = p2.code(policy)
    assert "error" not in result and len(fake.calls) == 13
    for i in [1, 2, 4, 5, 11, 13]:
        p2.reading(f"shopee:{i}")
    p2.reading("tiktok_shop:20")
    p2.reading("shopee:10", pair=("T-GIA", "T-VI"))
    p2.reading("shopee:11", False)
    # R12 uses its own real interrupted-block test; R13 retains stale state.
    p2.box.sql("UPDATE review_input SET input_sha256=? WHERE review_id=?", ("0" * 64, "shopee:13"))
    return p2


@pytest.fixture
def reason_lifecycle_r14(p2):
    """IM-Q69 LIFECYCLE R14 only: changed bytes, rebuild, successful recode."""
    p2.seed([review(14, text="zqv80 ngon vì chính hãng")], keywords=())
    assert "error" not in p2.code()[0]
    p2.reading("shopee:14")
    return p2


@pytest.fixture
def reason_lifecycle_r15(p2):
    """IM-Q69 LIFECYCLE R15 only: identical source bytes survive rebuilding."""
    p2.seed([review(15, text="zqv85 ngon vì chính hãng")], keywords=())
    assert "error" not in p2.code()[0]
    p2.reading("shopee:15")
    return p2

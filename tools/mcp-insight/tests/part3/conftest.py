"""P3-only fixtures; P1/P2 files and receipts remain unchanged."""

import copy
import json

import pytest

from insight_test_support import choice, review
from p3_support import Part3, all_themes


@pytest.fixture
def p3(subject, sandbox):
    return Part3(sandbox)


@pytest.fixture
def p3_frame(p3, monkeypatch):
    original = json.loads((p3.box.insight / "data/report-frame.json").read_text())
    target = p3.box.root / "p3-frame.json"

    def use(data=None):
        value = copy.deepcopy(original if data is None else data)
        target.write_text(json.dumps(value, ensure_ascii=False))
        monkeypatch.setattr(p3.box.module, "REPORT_FRAME_PATH", target)
        return value

    use()
    return use


@pytest.fixture
def p3_groups(p3, monkeypatch):
    original = json.loads((p3.box.insight / "data/keyword-groups.json").read_text())
    target = p3.box.root / "p3-groups.json"

    def use():
        value = copy.deepcopy(original)
        value.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt="2026-10-30")
        target.write_text(json.dumps(value, ensure_ascii=False))
        monkeypatch.setattr(p3.box.module, "KEYWORD_GROUPS_PATH", target)
        return value

    return use


@pytest.fixture
def coded_p3(p3):
    rows = [review(i, text=f"zqvp3s{i} mua cho mẹ vì mẫu thử tổng hợp có nhiều đặc điểm để đối chiếu")
            for i in range(1, 7)]
    rows += [review(i, platform="tiktok_shop", name=f"synthetic_p3_writer{i}",
                    text=f"zqvp3t{i} mua cho mẹ vì mẫu thử tổng hợp có nhiều đặc điểm để đối chiếu")
             for i in range(101, 107)]
    p3.seed(rows, keywords=[f"có nên dùng mẫu thử {i}" for i in range(5)] + ["cách uống mẫu thử", "loại nào mẫu thử"])
    result, fake = p3.code(all_themes)
    assert "error" not in result and len(fake.calls) == 12
    return p3


@pytest.fixture
def numeric_p3(p3):
    p3.seed([review(i, text=f"zqvp3num{i} dữ liệu mẫu chỉ phục vụ phép kiểm tra cơ học")
             for i in range(1, 41)])

    def policy(body, answers, index):
        if index <= 6:
            answers["T-VI"] = choice(khen=0.9)
        if index <= 9:
            answers["T-GIA"] = choice(khen=0.9)

    assert "error" not in p3.code(policy)[0]
    return p3


@pytest.fixture
def collision_p3(p3):
    """Adapt P1's pre-Q125 scanner only for a known generated count-label field."""
    try:
        yield p3
    finally:
        # These are the harness's captured COPIES, never subject output. Q125
        # independently checks original counts, new results, files and archive.
        for result in p3.box.public_results:
            for row in result.get("rows", []):
                if row.get("theme_name") == "Chất lượng, độ bền":
                    row["theme_name"] = "[coded label independently checked by IM-Q125]"

"""Part 2 contract helpers. All sources, approvals and readings are synthetic."""

import copy
import json
import os
import re
import sqlite3
from contextlib import contextmanager

from insight_test_support import (
    FakeJev, RUN, VERSION, choice, no_leak, review, sync, tree_snapshot,
)

DATE = "2026-10-30T00:00:00Z"
KEYWORDS = [f"có nên uống mẫu thử {i}" for i in range(5)]
PAIR = ("T-CHINHHANG", "T-VI")
RULES = "reason-2026-10-30.1"
TITLES = [
    "Kết luận chính", "Câu hỏi kinh doanh", "Phạm vi và cách làm", "Khách hàng là ai",
    "Khác biệt giữa các nhóm", "Chủ đề quan tâm", "Nỗi lo trước khi mua", "Lý do chọn",
    "Thương hiệu và đối thủ", "Hành trình mua", "Khách gặp sản phẩm ở đâu", "Cách mua và dùng",
    "Cảm nhận", "Điều khách chê", "Nhu cầu chưa đáp ứng", "Hướng cơ hội",
    "Thử nghiệm và đo lường", "Phụ lục: nguồn của từng con số",
]
QUESTIONS = ["Ai dùng, ai mua?", "Băn khoăn gì trước khi mua?", "Chọn sản phẩm dựa vào đâu?",
             "Dùng xong thấy thế nào?", "Nhóm khách nào bị bỏ ngỏ?"]
QUESTION_NOS = [None, None, None, 1, 1, 2, 2, 3, 3, 3, 3, 3, 4, 4, 5, 5, 5, None]
HIDDEN = [
    "Metric", "Kalodata", "TradeInt", "Dami", "SerpApi", "Apify", "PageIndex", "Agent-Reach",
    "OpenCLI", "zen-studio", "Jev", "TypeSafe", "CLIProxy", "OpenAI", "Anthropic", "GLM",
    "Gemini", "Google", "Nemotron", "NVIDIA", "CloakBrowser", "Cloak Browser", "cloak-browser",
    "cloak_browser", "ShopeePublicReviewCollector", "shopee-public-review", "World Bank", "SLAYER",
]


def part(plan, number):
    assert "error" not in plan
    return next(p for p in plan["parts"] if p["part"] == number)


def cell(plan, number, source):
    return next(c for c in part(plan, number)["sources"] if c["source"] == source)


def keyword_row(box):
    rows = box.call("keyword_counts")["rows"]
    return next(r for r in rows if r["group_key"] == "co_nen")


def checked_item(result):
    assert "error" not in result
    assert {"run_id", "part", "hypothesis", "ceiling", "items"} <= result.keys()
    assert result["run_id"] == RUN and type(result["hypothesis"]) is bool
    assert len(result["items"]) == 1
    item = result["items"][0]
    assert {"count_id", "part", "tool", "source", "platform", "step", "role", "partial",
            "blocked", "checks", "missing_count", "ceiling"} <= item.keys()
    assert item["tool"] in {"theme_counts", "keyword_counts", "portrait_counts"}
    assert item["platform"] in {"shopee", "tiktok_shop", "google"}
    assert type(item["partial"]) is bool
    assert result["ceiling"] == item["ceiling"]
    assert set(item["checks"]) == {"1", "2", "3", "4"}
    assert all(type(c["missing"]) is bool for c in item["checks"].values())
    assert item["missing_count"] == sum(c["missing"] for c in item["checks"].values())
    return item


def check(item, number, reason=None):
    assert item["checks"][str(number)] == {"missing": reason is not None, "reason": reason}


def reason_row(result, platform="shopee"):
    assert "error" not in result
    return next(r for r in result["rows"] if r["platform"] == platform)


def candidate_ids(result, platform="shopee"):
    return next(r["review_ids"] for r in result["candidates"] if r["platform"] == platform)


def reader_scan(value):
    """Independent READER name oracle, used only on reader-visible fields."""
    if isinstance(value, dict):
        for key, child in value.items():
            if key in {"title", "question", "name", "note", "unknown", "why", "needs"} and isinstance(child, str):
                for name in HIDDEN:
                    pattern = r"(?<!\w)" + (r"(?:Metric|METRIC)" if name == "Metric" else re.escape(name)) + r"(?!\w)"
                    assert not re.search(pattern, child, 0 if name == "Metric" else re.I)
                assert not re.search(r"(?<!\w)(?:gpt|claude)-[a-z0-9]", child, re.I)
            else:
                reader_scan(child)
    elif isinstance(value, list):
        for child in value:
            reader_scan(child)


class Part2:
    def __init__(self, box):
        self.box = box

    @property
    def store(self):
        return self.box.data / "insight-shared.sqlite"

    @contextmanager
    def boundary(self):
        """Q53 guards every exercised success/error, not only the named smoke cases."""
        before, environment = tree_snapshot(self.box.app), dict(os.environ)
        previous = self.box.guard.strict
        self.box.guard.strict = True
        try:
            yield
        finally:
            self.box.guard.strict = previous
            assert tree_snapshot(self.box.app) == before
            assert dict(os.environ) == environment

    def call(self, tool, **kwargs):
        with self.boundary():
            return self._call(tool, **kwargs)

    def _call(self, tool, **kwargs):
        if tool != "read_reviews":
            return self.box.call(tool, **kwargs)
        # Parent Q40 teardown predates the explicitly allowed raw-reading tool.
        # Retain every field except the one Q54 permits, without changing Q40.
        value = sync(self.box.module.read_reviews(self.box.run_id, **kwargs))
        public = copy.deepcopy(value)
        for row in public.get("reviews", []):
            row.pop("text", None)
        self.box.public_results.append(public)
        no_leak(public, self.box.sentinels())
        return value

    def write(self, function, **kwargs):
        with self.boundary():
            try:
                value = sync(getattr(self.box.module, function)(**kwargs))
            except Exception as exc:
                no_leak(str(exc), self.box.sentinels())
                raise
        no_leak(value, self.box.sentinels())
        return value

    def rows(self, table):
        if not self.store.exists():
            return []
        assert re.fullmatch(r"[a-z_]+", table)
        with sqlite3.connect(self.store) as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute(f'SELECT * FROM "{table}"')]

    def sample(self, kind="codebook", version=VERSION, **changes):
        args = dict(rules_kind=kind, rules_version=version, reviewed_by="synthetic-owner",
                    reviewed_at=DATE, sample_size=30, passed=True)
        args.update(changes)
        return self.write("record_sample_review", **args)

    def diversity(self, count_id, brands=3):
        return self.write("record_diversity_check", count_id=count_id, brands=brands,
                          checked_by="synthetic-owner", checked_at=DATE)

    def share(self, value=60, platform="tiktok_shop", run_id=RUN):
        return self.write("record_revenue_share", run_id=run_id, platform=platform,
                          share_percent=value, recorded_by="synthetic-owner", recorded_at=DATE)

    def method(self, key, subjects=("canxi", "kem", "sat"), run_id=RUN):
        for subject in subjects:
            self.write("record_method_approval", method_key=key, subject_key=subject, run_id=run_id,
                       approved_by="synthetic-owner", approved_at=DATE)

    def reading(self, rid, linked=True, pair=PAIR, run_id=RUN):
        return self.write("record_reason_check", run_id=run_id, review_id=rid, theme_a=pair[0],
                          theme_b=pair[1], linked=linked, checked_by="synthetic-owner", checked_at=DATE)

    def confidence(self, row, number=6, **kwargs):
        return self.call("confidence_ceiling", part=number,
                         evidence=[{"count_id": row["count_id"], "part": None}], **kwargs)

    def links(self, pair=PAIR):
        return self.call("find_reason_links", theme_a=pair[0], theme_b=pair[1])

    def code(self, policy=None, **kwargs):
        # Reuse the part 1 wire protocol, bypassing all key-file reads. The real
        # transport is replaced before exercising the non-dry-run branch.
        self.box.monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", "1")
        self.box.monkeypatch.setattr(self.box.module, "_read_key", lambda: "synthetic-offline-token")
        fake = FakeJev(policy or pair_policy)
        self.box.monkeypatch.setattr(self.box.module, "_jev_transport", fake)
        result = self.call("code_reviews", dry_run=False, max_calls=1500, **kwargs)
        return result, fake

    def seed(self, rows=None, *, keywords=KEYWORDS, all_sources=False):
        if rows is None:
            rows = [review(i, text=f"zqvp2s{i} mua cho mẹ vì chính hãng") for i in range(1, 6)]
            rows += [review(i, platform="tiktok_shop", name=f"synthetic_p2_writer{i}",
                            text=f"zqvp2t{i} mua cho mẹ vì chính hãng") for i in range(6, 11)]
        self.box.seed(rows, keywords=keywords,
                      trends=[{"location": "Tỉnh thử", "extracted_value": 12}] if all_sources else ())
        if all_sources:
            self.box.metric_products({"1": "Sản phẩm thử A", "2": "Sản phẩm thử B", "3": "Sản phẩm thử C"})
        assert "error" not in self.call("build_warehouse")
        return rows

    def approve_theme(self, row, codebook):
        book = codebook()
        book.update(status="APPROVED", approvedBy="synthetic-owner", approvedAt=DATE)
        codebook(book)
        self.sample()
        self.diversity(row["count_id"])
        self.method(f"theme_counts:tiktok_shop_reviews:{VERSION}")
        self.share()

    def scan_storage(self):
        for path, skip in [(self.box.warehouse, {"review_text"}), (self.store, set())]:
            if not path.exists():
                continue
            with sqlite3.connect(path) as db:
                tables = db.execute("SELECT name FROM sqlite_master WHERE type IN ('table','view')").fetchall()
                for (table,) in tables:
                    if table in skip:
                        continue
                    escaped = table.replace('"', '""')
                    for row in db.execute(f'SELECT * FROM "{escaped}"'):
                        for value in row:
                            if isinstance(value, str):
                                no_leak(value, self.box.sentinels())


def pair_policy(body, answers, index):
    for theme in PAIR:
        if theme in answers:
            answers[theme] = choice(khen=0.9)


def registry_numbers(box, count_id):
    rows = box.rows("count_registry", "WHERE count_id=?", (count_id,))
    assert len(rows) == 1
    return json.loads(rows[0]["numbers_json"])

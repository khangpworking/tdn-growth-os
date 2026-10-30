"""Public-boundary helpers for revision 15; all evidence is synthetic."""

import copy
import json
import re
import sqlite3
import sys
import unicodedata
from html.parser import HTMLParser
from pathlib import Path

from insight_test_support import RUN, canonical, choice, no_leak, sha, theme_row

# Reuse the existing read-only P2 harness without changing its fixtures.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "part2"))
from p2_support import HIDDEN, Part2, reason_row  # noqa: E402

THEMES = ("T-GIA", "T-CONGDUNG", "T-CHATLUONG", "T-QUYCACH", "T-VI", "T-CAMGIAC", "T-THIETKE")
PAIRS = [("T-GIA", "T-CONGDUNG"), ("T-CONGDUNG", "T-CHATLUONG"),
         ("T-CHATLUONG", "T-QUYCACH")]
FILES = {"report.html", "themes.json", "keywords.json", "portraits.json", "parts.json"}


def all_themes(body, answers, index):
    for code in THEMES:
        if code in answers:
            answers[code] = choice(khen=0.9)


def codes(result):
    assert "error" not in result, result.get("error")
    assert type(result["accepted"]) is bool
    assert result["accepted"] is (not result["reasons"])
    for reason in result["reasons"]:
        assert set(reason) == {"code", "claim", "detail"}
        assert isinstance(reason["detail"], str)
    return [r["code"] for r in result["reasons"]]


def accepted(result):
    assert codes(result) == []
    assert result["run_id"] == RUN
    return result


def claim(row, ref="c1", *, step=None, confidence="Yếu", hypothesis=False,
          conclusion=True, part=None):
    return dict(ref=ref, evidence=[dict(count_id=row["count_id"], part=part)],
                confidence=confidence, step=step or row.get("step", "Sau mua"),
                hypothesis=hypothesis, conclusion=conclusion)


def line(row, supports="hidden_truth", *, part=8, layer=None, themes=None, note=None):
    return dict(supports=supports, layer=layer, themes=themes, platform=row["platform"],
                count_id=row["count_id"], part=part, note=note)


def statement(row, *, hypothesis=False, level="Yếu"):
    return dict(step="Sau mua", customer="Khách dùng sản phẩm mẫu",
                hidden_truth="Khách cân nhắc tính phù hợp; chưa đủ bằng chứng",
                motivation="Khách kể lại cân nhắc giá",
                conflict="Nhưng còn băn khoăn về độ bền", insight="Khách cân nhắc lợi ích cùng giới hạn",
                three_c=None,
                evidence=[line(row, side) for side in ("hidden_truth", "motivation", "conflict")],
                confidence=dict(level=level, hypothesis=hypothesis))


def words(text):
    return re.findall(r"[^\W_]+", unicodedata.normalize("NFC", text).lower())


def hidden_scan(text):
    for name in HIDDEN:
        pattern = r"(?<!\w)" + (r"(?:Metric|METRIC)" if name == "Metric" else re.escape(name)) + r"(?!\w)"
        assert not re.search(pattern, text, 0 if name == "Metric" else re.I), "hidden name in exported bytes"
    assert not re.search(r"(?<!\w)(?:gpt|claude)-[a-z0-9]", text, re.I)


class Node:
    def __init__(self, tag="document", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    @property
    def text(self):
        return "".join(c if isinstance(c, str) else c.text for c in self.children)

    def all(self, tag=None, **attrs):
        found = []
        if (tag is None or self.tag == tag) and all(self.attrs.get(k) == v for k, v in attrs.items()):
            found.append(self)
        for child in self.children:
            if isinstance(child, Node):
                found.extend(child.all(tag, **attrs))
        return found


class Page(HTMLParser):
    """Minimal DOM oracle; avoids assuming non-contract CSS/layout wrappers."""
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]
        self.feed(text)

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "wbr"}:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.stack[-1].children.append(Node(tag, attrs))

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                break

    def handle_data(self, data):
        self.stack[-1].children.append(data)

    def section(self, number):
        nodes = self.root.all("section", id=f"part-{number}")
        assert len(nodes) == 1
        return nodes[0]


class Part3(Part2):
    def __init__(self, box):
        super().__init__(box)
        self.results = []

    @property
    def report_store(self):
        return self.box.data / "insight-report.sqlite"

    @property
    def report_dir(self):
        return self.box.data / "reports" / self.box.run_id

    def report_rows(self, table):
        if not self.report_store.exists():
            return []
        assert table in {"section_version", "statement_version", "render_archive"}
        with sqlite3.connect(self.report_store) as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute(f'SELECT * FROM "{table}" ORDER BY rowid')]

    @staticmethod
    def digest(path):
        return sha(path.read_bytes()) if path.exists() else None

    def call(self, tool, **kwargs):
        if tool not in {"submit_section", "submit_statement", "render_report"}:
            return super().call(tool, **kwargs)
        before = (self.digest(self.box.warehouse), self.digest(self.store), self.digest(self.report_store))
        with self.boundary():
            result = self.box.call(tool, **kwargs)
        self.results.append(copy.deepcopy(result))
        assert self.digest(self.box.warehouse) == before[0], "new tools must calculate on a warehouse copy"
        assert self.digest(self.store) == before[1], "shared store must be read-only and never created"
        if "error" in result or result.get("accepted") is False:
            assert self.digest(self.report_store) == before[2], "rejection must not create or change report SQLite"
        return result

    def section(self, text="Khách kể lại cân nhắc giá [^c1].", row=None, part=8, claims=None):
        row = row or self.theme()
        return self.call("submit_section", part=part, text=text,
                         claims=[claim(row)] if claims is None else claims)

    def submit(self, value=None, **kwargs):
        return self.call("submit_statement", statement=statement(self.theme()) if value is None else value, **kwargs)

    def theme(self, code="T-GIA", platform="shopee"):
        return theme_row(self.call("theme_counts"), theme=code, platform=platform)

    def why(self, pair, *, platform="shopee", linked=True):
        self.reading("shopee:1" if platform == "shopee" else "tiktok_shop:101", linked, pair=pair)
        return reason_row(self.links(pair), platform)

    def chain(self, count=3):
        return [line(self.why(pair), "why", layer=i, themes=list(pair),
                     note=f"Liên hệ về {['giá và công dụng', 'công dụng và độ bền', 'độ bền và quy cách'][i-1]}")
                for i, pair in enumerate(PAIRS[:count], 1)]

    def render(self):
        result = self.call("render_report")
        assert "error" not in result
        assert set(result) == {"run_id", "archive_id", "stored", "parts", "statements", "files", "versions", "statement_versions"}
        assert result["run_id"] == RUN and type(result["stored"]) is bool
        assert set(result["parts"]) == {"written", "missing", "stale"}
        assert all(type(v) is int and v >= 0 for v in result["parts"].values())
        names = result["files"].values() if isinstance(result["files"], dict) else result["files"]
        assert {Path(name).name for name in names} == FILES
        assert set(p.name for p in self.report_dir.iterdir()) == FILES
        return result

    def artifacts(self):
        return {name: (self.report_dir / name).read_bytes() for name in FILES}

    def page(self):
        return Page((self.report_dir / "report.html").read_text(encoding="utf-8"))

    def total(self, name):
        value = json.loads((self.report_dir / (name + ".json")).read_text())
        assert set(value) == {"rows"}
        return value["rows"]

    def privacy(self, values, *, fixed=()):
        sentinels = self.box.sentinels()
        sentinels += [r["review_id"] for r in self.box.rows("review")]
        sentinels += [r["writer_key"] for r in self.box.rows("review")]
        for value in values:
            text = value if isinstance(value, str) else canonical(value)
            for wording in sorted(fixed, key=len, reverse=True):
                text = text.replace(wording, " [fixed wording] ")
            no_leak(text, sentinels)
        for table in ("section_version", "statement_version", "render_archive"):
            for row in self.report_rows(table):
                self._scan_row(row, sentinels, fixed)

    @staticmethod
    def _scan_row(row, sentinels, fixed):
        text = canonical(row)
        for wording in sorted(fixed, key=len, reverse=True):
            text = text.replace(wording, " [fixed wording] ")
        no_leak(text, sentinels)


def mutate_label(p3, code="T-GIA"):
    # A real label-state change; don't invent current receipts or successful counts.
    p3.box.sql("UPDATE label SET status='unclear' WHERE theme_code=? AND review_id='shopee:1'", (code,))


def immutable(path, table, where, parameters):
    with sqlite3.connect(path) as db:
        before = db.execute(f'SELECT * FROM "{table}"').fetchall()
        for sql in (f'UPDATE "{table}" SET version=version+10 WHERE {where}',
                    f'DELETE FROM "{table}" WHERE {where}'):
            try:
                db.execute(sql, parameters)
            except sqlite3.DatabaseError:
                db.rollback()
            else:
                raise AssertionError("append-only table accepted a mutation")
            assert db.execute(f'SELECT * FROM "{table}"').fetchall() == before

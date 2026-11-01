"""Adapters for reviewed PR 4 interfaces, with synthetic source evidence only.

Expected arithmetic lives in the tests, never in subject helpers or fake counts.
"""

import copy
import hashlib
import json
import os
import re
import sqlite3
from contextlib import closing
from pathlib import Path

from insight_test_support import RUN, VERSION, canonical, choice, no_leak as no_word_leak, review, sha, sync, tree_snapshot
from p3_support import Part3

THEME = "T-CONGDUNG"
RULES = "claim-2026-10-31.1"
ONE = "chủ yếu từ một sản phẩm"
BURST = "dồn thời gian"
BOTH = "có ở cả 2 sàn"
NEW_TOOLS = {
    "claim_catalogue_packet": dict(run_id={"string"}, theme_code={"string"}, out_dir={"string"}, seed={"integer"}),
    "submit_claim_catalogue": dict(run_id={"string"}, theme_code={"string"}, catalogue={"object"}),
    "code_claims": dict(run_id={"string"}, theme_code={"string"}, catalogue_version={"integer"},
                        dry_run={"boolean"}, max_calls={"integer", "null"}),
    "claim_counts": dict(run_id={"string"}, theme_code={"string"}, catalogue_version={"integer"}),
    "claim_grading_packet": dict(run_id={"string"}, theme_code={"string"}, catalogue_version={"integer"},
                                 out_dir={"string"}, seed={"integer"}),
    "record_claim_grades": dict(run_id={"string"}, theme_code={"string"}, catalogue_version={"integer"},
                                grades_dir={"string"}),
}


def no_leak(value, sentinels):
    """Private IDs are literal tokens; review words and names retain word checks."""
    text = value if isinstance(value, str) else canonical(value)
    words = []
    for sentinel in sentinels:
        if re.fullmatch(r"(?:shopee|tiktok_shop):\S+|w:[0-9a-f]{16}", sentinel):
            # Punctuation is part of an identifier. Word-folding shopee:5
            # would falsely match the required {"shopee": 5} count maps.
            assert sentinel not in text, "synthetic private identifier escaped"
        else:
            words.append(sentinel)
    no_word_leak(value, words)


def catalogue(theme=THEME, size=2):
    prefix = "Y-" + theme.removeprefix("T-") + "-"
    return dict(version="synthetic-label", theme=theme, specific_rule="Nêu một đặc điểm quan sát được",
                claims=[dict(code=f"{prefix}{i:02d}", name=f"Đặc điểm mẫu {i}",
                             include=f"Có nêu đặc điểm thứ {i}", exclude="Không nói đến đặc điểm này",
                             generic=i == size) for i in range(1, size + 1)], notes="Phân loại thử")


def binary(options, p):
    return dict(type="choice", choice=options[0] if p >= 0.5 else options[1],
                probabilities={options[0]: p, options[1]: 1 - p}, confidence=0.95)


class ClaimJev:
    def __init__(self, policy=None, invalid=None):
        self.calls, self.policy, self.invalid = [], policy, invalid

    def __call__(self, body, api_key):
        self.calls.append(copy.deepcopy(body))
        # The policy supplies probabilities only, never labels or count results.
        ps = self.policy(body, len(self.calls)) if self.policy else {}
        ps = ps or {}
        answers = {}
        for q in body["questions"]:
            code = q["code"]
            options = ("CU_THE", "CHUNG_CHUNG") if code == "SPEC" else (
                ("THAT", "RAC") if code == "RAC" else ("CO", "KHONG"))
            p = ps.get(code, 0.9 if code != "GEN" else 0.1)
            if code == "RAC":
                p = 1 - ps.get("RAC", 0.1)
            answers[code] = binary(options, p)
            if code == "RAC":
                # Keep the supplied probability exact; 1 - (1 - 0.1)
                # otherwise changes the test input before the subject sees it.
                answers[code]["probabilities"]["RAC"] = ps.get("RAC", 0.1)
        value = dict(model="jev-1.13.0", answers=answers)
        if self.invalid:
            replacement = self.invalid(value, len(self.calls))
            if replacement is not None:
                return replacement
        return 200, canonical(value).encode()


def warehouse_tables(path):
    if not path.exists():
        return {}
    with closing(sqlite3.connect(path)) as db:
        names = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")]
        return {name: sorted(db.execute('SELECT * FROM "' + name.replace('"', '""') + '"').fetchall(), key=repr)
                for name in names}


class ClaimLayer(Part3):
    def __init__(self, box, codebook):
        super().__init__(box)
        self.book = codebook
        self.theme_code, self.version = THEME, 1
        self.cat = catalogue()
        self.packet_dir = None
        self.packet_number = 0
        self.token = "synthetic-offline-token"
        self.box.guard.synthetic_secrets.append(self.token)

    @property
    def codes(self):
        return [c["code"] for c in self.cat["claims"]]

    def seed(self, rows=None, **kwargs):
        rows = rows if rows is not None else [review(i) for i in range(1, 6)]
        self.box.seed(rows, **kwargs)
        self.source_fields(rows)
        result = self.call("build_warehouse")
        assert "error" not in result
        self.theme_code_reviews()
        return rows

    def source_fields(self, rows):
        """Add date/shop fields to our own retained synthetic source packets."""
        box = self.box
        shopee = [r for r in rows if r["platform"] == "shopee"]
        if shopee:
            page = [dict(reviewId=r["id"], itemId=r["product"], shopId=r.get("shop", "700"),
                         ratingStar=5, comment=r["text"], attributes=r["attributes"],
                         **{k: r[k] for k in ("postedAtLocal", "createdAt") if k in r}) for r in shopee]
            raw = canonical(page).encode()
            digest = box.artifact(dict(contractVersion="4.0.0", runKey="auto-" + RUN,
                                       pages=[dict(sha256=box.artifact(page), offset=0, byteSize=len(raw))],
                                       selected=[dict(platform="shopee", shopId=r.get("shop", "700"),
                                                      itemId=r["product"]) for r in shopee]))
            with sqlite3.connect(box.db) as db:
                db.execute("UPDATE foundation_shopee_collections SET artifact_sha256=? WHERE run_key=?",
                           (digest, "auto-" + RUN))
        tiktok = [r for r in rows if r["platform"] == "tiktok_shop"]
        if tiktok:
            # Replace only these fixture comment captures; leave synthetic detail captures.
            with sqlite3.connect(box.db) as db:
                db.execute("DELETE FROM analysis_research_automation_captures WHERE operation=?",
                           ("kalodata.product.comment.insight",))
            for product in sorted({r["product"] for r in tiktok}):
                comments = [dict(product_id=product, review_user=dict(name=r["name"]),
                                 is_anonymous=r["anonymous"], review=dict(review_id=r["id"],
                                     display_text=(r["text"] + "  " + "  ".join(r["attributes"]))
                                                  if r["attributes"] else r["text"], rating=5,
                                     **{k: r[k] for k in ("review_timestamp", "review_timestamp_fmt") if k in r}))
                            for r in tiktok if r["product"] == product]
                box.capture(RUN, "kalodata", "kalodata.product.comment.insight",
                            dict(success=True, data=dict(product_id=product, original_comments=comments)),
                            dict(product_id=product))

    def theme_code_reviews(self, policy=None):
        def kept(body, answers, n):
            for code in ("T-CONGDUNG", "T-VI", "T-GIA"):
                answers[code] = choice(khen=0.9)
            if policy:
                policy(body, answers, n)
        result, _ = self.code(kept)
        assert "error" not in result

    def call(self, tool, **kwargs):
        if tool not in NEW_TOOLS:
            return super().call(tool, **kwargs)
        box = self.box
        before = warehouse_tables(box.warehouse)
        digest = self.digest(box.warehouse)
        files = tree_snapshot(box.data)
        transport = box.module._jev_transport
        calls_before = len(getattr(transport, "calls", []))
        with self.boundary():
            start = len(box.guard.events)
            result = box.call(tool, **kwargs)
            call_events = box.guard.events[start:]
        if tool != "code_claims" or kwargs.get("dry_run", True) or "error" in result or result.get("refused"):
            assert len(getattr(transport, "calls", [])) == calls_before, "only paid code_claims may use Jev"
        after = warehouse_tables(box.warehouse)
        changed = {t for t in before.keys() | after.keys() if before.get(t) != after.get(t)}
        allowed = {"submit_claim_catalogue": {"claim_catalogue"},
                   "code_claims": {"claim_label", "claim_coding_state"},
                   "claim_counts": {"count_registry"}, "claim_grading_packet": {"claim_packet"},
                   "record_claim_grades": {"claim_grade"}, "claim_catalogue_packet": set()}[tool]
        assert changed <= allowed, "claim tool changed another table"
        if "error" in result or result.get("dry_run") or result.get("refused") or tool == "claim_catalogue_packet":
            assert self.digest(box.warehouse) == digest
        after_files = tree_snapshot(box.data)
        changed_files = {p for p in files.keys() | after_files.keys() if files.get(p) != after_files.get(p)}
        permitted = {str(box.warehouse.relative_to(box.data))}
        if tool in {"claim_catalogue_packet", "claim_grading_packet"} and "error" not in result:
            names = {"claim_catalogue_packet": {"reviews.jsonl", "prompt-draft.md", "packet.json"},
                     "claim_grading_packet": {"catalogue.json", "sample.jsonl", "dup-groups.json",
                                              "packet.json", "prompt-r1.md"}}[tool]
            target = Path(kwargs["out_dir"])
            permitted |= {str((target / name).relative_to(box.data)) for name in names}
        assert changed_files <= permitted, "claim tool wrote outside its declared files"
        for event, args in call_events:
            if event in {"open", "sqlite3.connect"}:
                assert not any(str(p) in str(args[0]) for p in (self.store, self.report_store)), \
                    "claim tool opened shared or report store"
        public = copy.deepcopy(result)
        if tool == "claim_counts":
            # IM-Q162 fixed flags can collide with a whole short synthetic
            # review. Mask only the declared flag fields of captured COPIES.
            def mask_flags(node):
                if isinstance(node, dict):
                    for key, value in node.items():
                        if key == "flags" and isinstance(value, list):
                            node[key] = ["[fixed flag]" if flag in (ONE, BURST, BOTH) else flag for flag in value]
                        else: mask_flags(value)
                elif isinstance(node, list):
                    for value in node: mask_flags(value)
            mask_flags(public)
            box.public_results[-1] = copy.deepcopy(public)
        no_leak(public, self.private())
        return result

    def private(self):
        values = list(self.box.sentinels()) + [self.token]
        if self.box.warehouse.exists():
            for row in self.box.rows("review"):
                values.extend(row[k] for k in ("review_id", "writer_key", "product_key"))
        return values

    def catalogue(self, value=None, theme=THEME):
        value = catalogue(theme) if value is None else copy.deepcopy(value)
        result = self.call("submit_claim_catalogue", theme_code=theme, catalogue=value)
        assert "error" not in result
        self.theme_code, self.version, self.cat = theme, result["catalogue_version"], value
        return result

    def code_claims(self, policy=None, *, max_calls=1500, invalid=None):
        self.box.monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", "1")
        self.box.monkeypatch.setattr(self.box.module, "_read_key", lambda: self.token)
        fake = ClaimJev(policy, invalid)
        self.box.monkeypatch.setattr(self.box.module, "_jev_transport", fake)
        result = self.call("code_claims", theme_code=self.theme_code, catalogue_version=self.version,
                           dry_run=False, max_calls=max_calls)
        return result, fake

    def counts(self):
        value = self.call("claim_counts", theme_code=self.theme_code, catalogue_version=self.version)
        assert "error" not in value
        return value

    def row(self, code=None, platform="shopee"):
        rows = [r for r in self.counts()["rows"] if r["platform"] == platform and
                r["claim_code"] == (code or self.codes[0])]
        assert len(rows) == 1
        return rows[0]

    def directory(self, label):
        self.packet_number += 1
        return self.box.data / "packets" / f"{label}-{self.packet_number}"

    def packet(self, seed=7):
        self.packet_dir = self.directory("grade")
        result = self.call("claim_grading_packet", theme_code=self.theme_code, catalogue_version=self.version,
                           out_dir=str(self.packet_dir), seed=seed)
        assert "error" not in result
        return result

    def draft_packet(self, seed=7):
        directory = self.directory("draft")
        result = self.call("claim_catalogue_packet", theme_code=self.theme_code,
                           out_dir=str(directory), seed=seed)
        assert "error" not in result
        return result, directory

    def grades(self):
        samples = [json.loads(line) for line in (self.packet_dir / "sample.jsonl").read_text().splitlines()]
        groups = sorted({s["dup_group"] for s in samples if s["dup_group"]})
        # Packet may name groups without drawing every member. Read every G alias.
        group_file = json.loads((self.packet_dir / "dup-groups.json").read_text())
        groups = sorted(set(groups) | set(re.findall(r'"(G\d+)"', canonical(group_file))))
        files = {}
        for grader in ("astra", "opus"):
            files[f"r1-{grader}.out"] = dict(grader=grader,
                catalogue=[dict(code=c, verdict="OK", note="checked") for c in self.codes], missing=[],
                items=[dict(id=s["id"], ok=True, wrong=[], missed=[], specific_ok=True, note="checked")
                       for s in samples],
                dup_groups=[dict(group=g, same_idea_copy=True, note="checked") for g in groups], method_gaps="")
            files[f"r2-{grader}.out"] = dict(grader=grader, decisions=[], missing_agree=[], method_gaps_comment="")
        return files

    def write_grades(self, files):
        for name, value in files.items():
            (self.packet_dir / name).write_text(value if isinstance(value, str) else canonical(value), encoding="utf-8")

    def record(self, files):
        self.write_grades(files)
        return self.call("record_claim_grades", theme_code=self.theme_code, catalogue_version=self.version,
                         grades_dir=str(self.packet_dir))

    def pass_catalogue(self):
        self.packet()
        result = self.record(self.grades())
        assert result["status"] == "PASSED"
        return result

    def storage_privacy(self):
        for table, rows in warehouse_tables(self.box.warehouse).items():
            if table != "review_text":
                no_leak(canonical(rows), self.box.sentinels())
        for table in ("claim_catalogue", "claim_grade"):
            no_leak(self.box.rows(table), self.private())
        for row in self.box.rows("count_registry"):
            if row["tool"] == "claim_counts":
                no_leak(row, self.private())
        identifiers = [row[key] for row in self.box.rows("review")
                       for key in ("review_id", "writer_key", "product_key")]
        for table, permitted in {"claim_coding_state": {"review_id"}, "claim_label": {"review_id"},
                                 "claim_packet": {"review_id"}, "near_dup": {"review_id", "group_id"}}.items():
            for row in self.box.rows(table):
                no_leak({key: value for key, value in row.items() if key not in permitted}, identifiers)


def packet_digest(directory, names, prefix):
    payloads = {name: (directory / name).read_text(encoding="utf-8") for name in names}
    for text in payloads.values():
        assert text.endswith("\n") and not text.endswith("\n\n") and "\r" not in text
    return prefix + hashlib.sha256(canonical(payloads).encode("utf-8")).hexdigest()[:12]

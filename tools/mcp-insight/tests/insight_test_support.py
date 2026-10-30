"""Synthetic source packets and contract assertions; no production imports.

Private interface assumptions are centralized here and listed in README.md.
Neither the subject nor its output computes any expected business result.
"""

import asyncio
import base64
import copy
import hashlib
import inspect
import json
import os
import re
import sqlite3
import unicodedata
import urllib.parse
from contextlib import contextmanager
from pathlib import Path


RUN = "aaaaaaaa-1111-4111-8111-111111111111"
OTHER = "bbbbbbbb-2222-4222-8222-222222222222"
AMBIGUOUS = "aaaaaaaa-3333-4333-8333-333333333333"
VERSION = "2026-10-30.3"
NO_DATA = "Chưa có dữ liệu"
UNKNOWN_NOTE = "đếm theo đánh giá, nguồn không có tên người viết"
EXCLUDED = {"T-GIAOHANG", "T-DONGGOI", "T-DICHVU"}
EXCLUDED_NAMES = {"Giao hàng", "Đóng gói", "Dịch vụ shop, tư vấn"}
OPTIONS = ("CO_KHEN", "CO_CHE", "CO_KE", "KHONG_NHAC")
INSIGHT = Path(__file__).resolve().parents[1]
REPO = INSIGHT.parents[1]
DEFAULT_RUN = object()


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def sha(value):
    return hashlib.sha256(value.encode() if isinstance(value, str) else value).hexdigest()


def sync(value):
    return asyncio.run(value) if inspect.isawaitable(value) else value


def tree_snapshot(root):
    return {str(p.relative_to(root)): (p.stat().st_size, sha(p.read_bytes()))
            for p in root.rglob("*") if p.is_file()}


class AuditGuard:
    """Audit attempts even when the subject catches the raised exception."""

    root = None
    strict = False

    def __init__(self):
        self.violations = []
        self.events = []
        self.synthetic_secrets = []

    @staticmethod
    def audit_path(value, directory_fd=None):
        path = Path(os.fsdecode(value))
        if not path.is_absolute() and isinstance(directory_fd, int) and directory_fd >= 0:
            # shutil.rmtree uses fd-relative unlink/rmdir on Linux. Resolve the
            # fd's directory so legitimate per-call cleanup is not mistaken for
            # a write relative to the repository's cwd.
            path = Path(os.readlink(f"/proc/self/fd/{directory_fd}")) / path
        return path.resolve()

    def __call__(self, event, args):
        if self.root is None:
            return
        reason = None
        if event in {"socket.connect", "socket.connect_ex", "socket.bind", "socket.sendto",
                     "socket.sendmsg", "socket.getaddrinfo", "socket.gethostbyname", "socket.gethostbyaddr"}:
            reason = "NETWORK_FORBIDDEN"
        if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            if ("secrets" in path.parts or ".config" in path.parts) and not path.is_relative_to(self.root):
                reason = "LIVE_SECRET_FORBIDDEN"
            if self.strict:
                mode, flags = args[1:3]
                writing = (isinstance(mode, str) and any(c in mode for c in "wax+")) or (
                    isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC))
                if writing and not self.allowed_write(path):
                    reason = "WRITE_OUTSIDE_DATA_OR_CALL_TEMP"
        if event == "sqlite3.connect":
            value = os.fsdecode(args[0])
            if value != ":memory:" and not value.startswith("file::memory:") and "mode=memory" not in value:
                path = Path(urllib.parse.unquote(value.removeprefix("file:").split("?")[0])).resolve()
                if not path.is_relative_to(self.root):
                    reason = "LIVE_DATABASE_FORBIDDEN"
        if self.strict:
            if event in {"subprocess.Popen", "os.system", "os.exec", "os.posix_spawn"}:
                reason = "SUBPROCESS_FORBIDDEN"
            if event == "import" and str(args[0]).startswith("src."):
                reason = "APP_IMPORT_FORBIDDEN"
            if event in {"os.putenv", "os.unsetenv"}:
                reason = "ENV_MUTATION_FORBIDDEN"
            if event in {"os.rename", "os.remove", "os.rmdir", "os.mkdir"}:
                destinations = [(args[0], args[2]), (args[1], args[3])] if event == "os.rename" else [
                    (args[0], args[2] if event == "os.mkdir" else args[1])]
                for value, directory_fd in destinations:
                    if isinstance(value, (str, bytes, os.PathLike)) and not self.allowed_write(self.audit_path(value, directory_fd)):
                        reason = "WRITE_OUTSIDE_DATA_OR_CALL_TEMP"
        if event == "import" and str(args[0]).split(".")[0] == "slayer":
            if os.environ.get("DO_NOT_TRACK") != "1" or os.environ.get("SLAYER_USAGE_REPORTING") != "off":
                reason = "TELEMETRY_NOT_DISABLED_BEFORE_IMPORT"
        self.events.append((event, args))
        if reason:
            self.violations.append(reason)
            raise AssertionError(reason)

    def allowed_write(self, path):
        return path.is_relative_to(self.root / "data") or (
            path.is_relative_to(self.root / "tmp") and
            any(p.startswith("insight-") for p in path.relative_to(self.root / "tmp").parts))

    @contextmanager
    def expected_violation(self):
        start = len(self.violations)
        try:
            yield
        finally:
            del self.violations[start:]


def review(i, *, platform="shopee", product=None, name=None, text=None, attributes=None, anonymous=False):
    return {"id": str(i), "platform": platform, "product": str(product or (i % 3 + 1)),
            "name": name, "text": text if text is not None else f"zqv{i:04d} mẫu thử ổn",
            "attributes": attributes or [], "anonymous": anonymous, "rating": 5}


class Sandbox:
    insight = INSIGHT

    def __init__(self, root, monkeypatch, guard):
        self.root, self.monkeypatch, self.guard = root, monkeypatch, guard
        self.app = root / "app"
        self.db = self.app / "app.sqlite"
        self.artifacts = self.app / "artifacts"
        self.captures = self.app / "metric-captures"
        self.data = root / "data"
        self.tmp = root / "tmp"
        self.key = root / "synthetic-key.env"
        self.run_id = RUN
        self.module = None
        self.reviews = []
        self.transport = None
        self.public_results = []
        for path in [self.app, self.artifacts, self.captures, self.data, self.tmp]:
            path.mkdir(parents=True, exist_ok=True)
        (self.app / ".env").write_text("SYNTHETIC_CONFIG=unchanged\n")
        (self.app / "config.json").write_text('{"fixture": true}\n')
        for key, value in {"INSIGHT_MCP_APP_DB": self.db, "INSIGHT_MCP_APP_ARTIFACTS": self.artifacts,
                           "INSIGHT_MCP_APP_CAPTURES": self.captures, "INSIGHT_MCP_DATA_DIR": self.data,
                           "INSIGHT_MCP_JEV_KEY_FILE": self.key, "TMPDIR": self.tmp}.items():
            monkeypatch.setenv(key, str(value))
        # tempfile caches gettempdir(): honor this fixture's TMPDIR.
        import tempfile
        monkeypatch.setattr(tempfile, "tempdir", None)
        assert tempfile.gettempdir() == str(self.tmp)
        with sqlite3.connect(self.db) as db:
            db.executescript("""
                CREATE TABLE analysis_research_automation_runs (
                  run_id TEXT PRIMARY KEY, keyword TEXT, created_at TEXT,
                  workspace_id TEXT, status TEXT, mode TEXT, reports TEXT);
                CREATE TABLE foundation_shopee_collections (
                  collection_id TEXT PRIMARY KEY, run_key TEXT, request_sha256 TEXT,
                  artifact_sha256 TEXT, evidence_id TEXT, created_at TEXT);
                CREATE TABLE analysis_research_automation_captures (
                  run_id TEXT, step_id TEXT, ordinal INTEGER, artifact_sha256 TEXT,
                  media_type TEXT, provider TEXT, operation TEXT, retrieved_at TEXT,
                  window_start TEXT, window_end TEXT, truncated INTEGER, retained_at TEXT);
            """)

    @property
    def warehouse(self):
        return self.data / "runs" / (self.run_id + ".sqlite")

    def artifact(self, value):
        raw = canonical(value).encode()
        digest = sha(raw)
        path = self.artifacts / "sha256" / digest[:2] / digest
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        return digest

    def seed(self, reviews=None, *, run_id=RUN, keyword="canxi", keywords=(), trends=(), scope=None):
        rows = reviews if reviews is not None else [review(i) for i in range(1, 6)]
        self.reviews.extend(copy.deepcopy(rows))
        with sqlite3.connect(self.db) as db:
            db.execute("INSERT OR REPLACE INTO analysis_research_automation_runs VALUES (?,?,?,?,?,?,?)",
                       (run_id, keyword, "2026-10-30T00:00:00Z", "synthetic-workspace", "DRAFT_READY", "PRODUCT", "INSIGHT"))
        shopee = [r for r in rows if r["platform"] == "shopee"]
        if shopee:
            packet_rows = [{"reviewId": r["id"], "itemId": r["product"], "shopId": "700",
                            "ratingStar": r["rating"], "comment": r["text"], "attributes": r["attributes"],
                            "attribution": "synthetic"} for r in shopee]
            page = self.artifact(packet_rows)
            packet = {"contractVersion": "4.0.0", "runKey": "auto-" + run_id,
                      "pages": [{"sha256": page, "offset": 0, "byteSize": len(canonical(packet_rows).encode())}],
                      "selected": [{"platform": "shopee", "itemId": p, "shopId": "700"}
                                   for p in sorted({r["product"] for r in shopee})],
                      "excluded": [{"reviewId": "999999", "comment": "zqv9999 excluded synthetic"}]}
            digest = self.artifact(packet)
            with sqlite3.connect(self.db) as db:
                db.execute("DELETE FROM foundation_shopee_collections WHERE run_key=?", ("auto-" + run_id,))
                db.execute("INSERT INTO foundation_shopee_collections VALUES (?,?,?,?,?,?)",
                           (run_id, "auto-" + run_id, "0" * 64, digest, "fixture", "2026-10-30T00:00:00Z"))
        tiktok = [r for r in rows if r["platform"] == "tiktok_shop"]
        for product in sorted({r["product"] for r in tiktok}):
            comments = [{"product_id": product, "review_user": {"name": r["name"]}, "is_anonymous": r["anonymous"],
                         "review": {"review_id": r["id"], "display_text": r["text"], "rating": r["rating"]},
                         "sku_specification": "synthetic"}
                        for r in tiktok if r["product"] == product]
            self.capture(run_id, "kalodata", "kalodata.product.comment.insight",
                         {"success": True, "data": {"product_id": product, "original_comments": comments}},
                         {"product_id": product})
            self.capture(run_id, "kalodata", "kalodata.product.detail",
                         {"success": True, "data": {"product_id": product, "product_name": "Sản phẩm thử " + product}},
                         {"product_id": product})
        if keywords:
            self.capture(run_id, "serpapi", "serpapi.google.search", {
                "related_searches": [{"query": k} for k in keywords[::2]],
                "related_questions": [{"question": k} for k in keywords[1::2]]})
        if trends:
            self.capture(run_id, "serpapi", "serpapi.google.trends", {"interest_by_region": list(trends)},
                         {"data_type": "GEO_MAP"})
        if scope is not None:
            self.scope(scope, run_id)
        return rows

    def capture(self, run_id, provider, operation, payload, parameters=None):
        raw = canonical(payload).encode()
        envelope = {"contractVersion": "research-provider-capture-v1", "provider": provider,
                    "operation": operation, "outcome": "OK", "httpStatus": 200,
                    "requestParameters": parameters or {}, "responseSha256": sha(raw),
                    "responseBytesBase64": base64.b64encode(raw).decode()}
        digest = self.artifact(envelope)
        with sqlite3.connect(self.db) as db:
            n = db.execute("SELECT count(*) FROM analysis_research_automation_captures WHERE run_id=?", (run_id,)).fetchone()[0]
            db.execute("INSERT INTO analysis_research_automation_captures VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
                       (run_id, "COLLECTION", n, digest, "application/json", provider, operation,
                        "2026-10-30T00:00:00Z", None, None, 0, "2026-10-30T00:00:00Z"))
        return digest

    def scope(self, value, run_id=RUN):
        path = self.captures / run_id / "scope.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(canonical(value), encoding="utf-8")

    def replace_sources(self, reviews, **kwargs):
        with sqlite3.connect(self.db) as db:
            db.execute("DELETE FROM foundation_shopee_collections WHERE run_key=?", ("auto-" + self.run_id,))
            db.execute("DELETE FROM analysis_research_automation_captures WHERE run_id=?", (self.run_id,))
        return self.seed(reviews, run_id=self.run_id, **kwargs)

    def metric_products(self, names):
        """Stored Metric response entries use the app's product_base_id identity."""
        path = self.captures / self.run_id / "run1" / "raw-responses.json"
        path.parent.mkdir(parents=True, exist_ok=True)
        products = [{"product_base_id": "1__" + item + "__700", "product_name": name,
                     "revenue": 100, "bee_categories": []} for item, name in names.items()]
        path.write_text(canonical([{"urlPath": "/api/products", "status": 200,
                                    "requestBody": {"include_query": {"queries": ["canxi"]}},
                                    "body": {"data": {"products": products}}}]), encoding="utf-8")

    def call(self, tool, run_id=DEFAULT_RUN, **kwargs):
        result = sync(getattr(self.module, tool)(self.run_id if run_id is DEFAULT_RUN else run_id, **kwargs))
        self.public_results.append(copy.deepcopy(result))
        return result

    def rows(self, table, where="", parameters=()):
        assert re.fullmatch(r"[A-Za-z_][A-Za-z_0-9]*", table)
        with sqlite3.connect(self.warehouse) as db:
            db.row_factory = sqlite3.Row
            return [dict(r) for r in db.execute(f'SELECT * FROM "{table}" ' + where, parameters)]

    def sql(self, sql, parameters=()):
        with sqlite3.connect(self.warehouse) as db:
            return db.execute(sql, parameters).fetchall()

    def fake_paid(self, policy=None):
        self.monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", "1")
        # Random synthetic value is deliberately never used in assertion output.
        import uuid
        self.secret = "synthetic-" + uuid.uuid4().hex
        self.guard.synthetic_secrets.append(self.secret)
        self.key.write_text("TYPESAFE_API_KEY=" + self.secret + "\n", encoding="utf-8")
        self.transport = FakeJev(policy)
        self.monkeypatch.setattr(self.module, "_jev_transport", self.transport)
        return self.transport

    def code(self, policy=None, max_calls=1500, **kwargs):
        fake = self.fake_paid(policy)
        result = self.call("code_reviews", dry_run=False, max_calls=max_calls, **kwargs)
        return result, fake

    def dump(self):
        with sqlite3.connect(self.warehouse) as db:
            return list(db.iterdump())

    def sentinels(self):
        result = []
        for r in self.reviews:
            text = r["text"]
            if text:
                result.append(text)
                result.extend(re.findall(r"zqv\w+", text))
                words = re.findall(r"\w+", text.casefold())
                result.extend(" ".join(words[i:i + 8]) for i in range(len(words) - 7))
            # A whitespace-only name (IM-Q41) identifies no one; as a substring it would match every space.
            if r["name"] and r["name"].strip():
                result.append(r["name"])
            result.extend(r["attributes"])
            for attribute in r["attributes"]:
                result.extend(re.findall(r"zqv\w+", attribute))
        return result


def scope_record(outcome="OK", category="Làm Đẹp", *, version="autorun-scope-record-v2"):
    return {"contractVersion": version, "runId": RUN, "keyword1": "canxi",
            "category": {"category": {"label": "Làm Đẹp", "id": "synthetic-category"}, "reason": "DOMINANT"},
            "keyword2": {"candidates": [], "chosen": {"term": "sữa rửa mặt"}},
            "capture2": {"outcome": outcome, "keywords": ["canxi", "sữa rửa mặt"], "category": category}}


def choice(khen=0, che=0, ke=0, no=None):
    values = [khen, che, ke, 1 - khen - che - ke if no is None else no]
    return {"type": "choice", "choice": OPTIONS[values.index(max(values))],
            "probabilities": dict(zip(OPTIONS, values)), "confidence": 0.95}


class FakeJev:
    """Contract transport: (body, api_key) -> (HTTP status, JSON bytes)."""

    def __init__(self, policy=None):
        self.calls = []
        self.policy = policy

    def __call__(self, body, api_key):
        self.calls.append(copy.deepcopy(body))
        answers = {q["code"]: choice() for q in body["questions"]}
        if self.policy:
            replacement = self.policy(body, answers, len(self.calls))
            if replacement is not None:
                return replacement
        return 200, canonical({"model": "jev-1.13.0", "answers": answers}).encode()


def label_all(theme="T-GIA", answer=None):
    def policy(body, answers, index):
        answers[theme] = copy.deepcopy(answer or choice(khen=0.9))
    return policy


def error(result, code):
    assert result.get("error") == code
    assert set(result) == {"error", "message"}, "errors must not return counts"
    assert isinstance(result["message"], str)


def theme_row(result, theme="T-GIA", platform="shopee", polarity="all"):
    assert "error" not in result
    found = [r for r in result["rows"] if (r["platform"], r["theme_code"], r["polarity"]) == (platform, theme, polarity)]
    assert len(found) == 1
    return found[0]


def no_leak(value, sentinels):
    text = canonical(value) if not isinstance(value, str) else value
    normalized = " ".join(re.findall(r"\w+", unicodedata.normalize("NFC", text).casefold()))
    for sentinel in sentinels:
        assert sentinel not in text, "synthetic private material escaped"
        words = " ".join(re.findall(r"\w+", unicodedata.normalize("NFC", sentinel).casefold()))
        if words:
            assert words not in normalized, "synthetic private material escaped after normalization"

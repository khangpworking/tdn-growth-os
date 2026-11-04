"""Local stdio MCP server `tdn-insight`: run warehouse with the app's theme labels, SLAYER counts (part 1); report
plan, confidence ceiling and reason links (part 2); checked report parts, insight statements and the rendered report
(part 3).

Theme labels and star sentiment come from the app DB (`review_code`, `codebook`, `review_star_sentiment`; owner
F361–F367). The app labels reviews; the MCP only reads them and never calls Jev for themes.

Part 4 adds the claim layer (ý con) under each theme: claim catalogues, Jev claim coding, claim counts with five
measures, and the two-grader cross-check, whose graders run outside the MCP.

Reads stored run data only. The app DB is read from the app's published snapshot (INSIGHT_MCP_APP_DB_SNAPSHOT,
copied privately, opened read-only); INSIGHT_MCP_APP_DB only locates the app home and is never opened. The
artifact store and capture root are read-only. Each run gets its own warehouse file under
INSIGHT_MCP_DATA_DIR. Evidence from people (sample reviews, method approvals, brand checks, revenue shares,
reason readings) lives in the shared store `<data dir>/insight-shared.sqlite`, written only by the `record_*`
functions, which are not tools. A real Jev claim call needs INSIGHT_MCP_ALLOW_PAID=1 and a call cap; everything
else, including `code_claims(dry_run=True)`, makes no network call. Accepted report parts, statements and rendered
reports live in the report store `<data dir>/insight-report.sqlite`, never in the app DB. Contract: CONTRACT.md.
"""

import base64
import functools
import hashlib
import html
import json
import math
import os
import random
import re
import shutil
import sqlite3
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from fractions import Fraction
from pathlib import Path
from typing import NotRequired, TypedDict

# Set before SLAYER is ever imported (it is imported lazily, per call).
os.environ["DO_NOT_TRACK"] = "1"
os.environ["SLAYER_USAGE_REPORTING"] = "off"

from mcp.server.fastmcp import FastMCP  # noqa: E402

HERE = Path(__file__).resolve().parent
CODEBOOK_PATH = HERE / "data" / "insight-theme-codebook.json"
KEYWORD_GROUPS_PATH = HERE / "data" / "keyword-groups.json"
REPORT_FRAME_PATH = HERE / "data" / "report-frame.json"
SEMANTIC_DIR = HERE / "semantic"
DEFAULT_DATA_DIR = HERE / "out"
DEFAULT_KEY_FILE = "~/.config/tdn-growth-os/secrets/typesafe-jev.env"

JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
JEV_MODEL = "jev-1.13.0"
JEV_TIMEOUT_SECONDS = 30

PLATFORMS = ("shopee", "tiktok_shop")
NO_DATA = "Chưa có dữ liệu"
STEP_AFTER_PURCHASE = "Sau mua"
NOTE_BELOW = "dưới ngưỡng"
NOTE_NO_NAME = "đếm theo đánh giá, nguồn không có tên người viết"
PORTRAIT_RULES_VERSION = "portrait-2026-10-25"
LABEL_SOURCE = "app_db"
NOTE_NOT_LABELLED = "chưa gán nhãn"
NO_THEME = "NO_THEME"
ORIGIN_MCP_IMPORT = "MCP_IMPORT"
STAR_RULES_VERSION = "star-2026-11-03"  # F363: 1–3 sao tieu_cuc, 4–5 sao tich_cuc, the app view's rule
STAR_NONE = "khong_sao"
STAR_SENTIMENTS = ("tich_cuc", "tieu_cuc", STAR_NONE)
REVIEW_THRESHOLD_WRITERS = 5
REVIEW_THRESHOLD_PRODUCTS = 3
KEYWORD_THRESHOLD = 5

RUN_ID_RE = re.compile(r"^[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$")
THEME_CODE_RE = re.compile(r"^T-[A-Z0-9]+$")
BLOCK_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
SHOPEE_BASE_ID = re.compile(r"^1__([1-9][0-9]{0,19})__([1-9][0-9]{0,19})$")
SCOPE_VERSIONS = {"autorun-scope-record-v1", "autorun-scope-record-v2"}

# Owner rule F310: these themes are never asked, labelled, counted or shown. Fixed here, not read from
# the codebook's own `excluded` field, so a codebook cannot bring one back by dropping that field.
EXCLUDED_THEME_CODES = frozenset({"T-GIAOHANG", "T-DONGGOI", "T-DICHVU"})
EXCLUDED_THEME_NAMES = ("Giao hàng", "Đóng gói", "Dịch vụ shop, tư vấn")

# Portrait rules, exactly as `6-tao-sqlite-nhan.py` (25/10/2026, phương pháp chân dung khách).
AI_DUNG_FIELD = re.compile(
    r"đối tượng sử dụng\s*:\s*(.+?)(?=(công dụng|màu sắc|chất liệu|đúng với mô tả|hương vị|$|\s{2}))", re.I)
AI_DUNG_GROUPS = (
    ("Bà bầu, sau sinh, cho con bú", r"bầu|bau|thai|sau sinh|cho con bú|bỉm|mẹ bỉm"),
    ("Trẻ em, học sinh", r"trẻ|tre |trẻ em|\bbé\b|em bé|con nhỏ|học sinh|tuổi dậy thì|dậy thì|thiếu nhi|\d+\s*tuổi"),
    ("Người cao tuổi, loãng xương",
     r"già|cao tuổi|lớn tuổi|loãng xương|loang xuong|trung niên|ông bà|người lớn tuổi|xương khớp"),
    ("Người lớn, trưởng thành", r"người lớn|ng lớn|nguoi lon|trưởng thành|truong thanh|người trưởng"),
    ("Mọi người, ai cần", r"mọi|moi nguoi|tất cả|ai cũng|cần bổ sung|có nhu cầu|nhu cau|gia đình|cả nhà"),
)
AI_DUNG_OTHER = "Khác / không rõ"
MUA_CHO_AI_GROUPS = (
    ("Mua cho bố mẹ, ông bà", r"cho (bố|ba|mẹ|má|bố mẹ|ba mẹ|ông|bà|ông bà|cha mẹ|mẹ chồng|mẹ vợ|bố chồng)\b"),
    ("Mua cho con, bé", r"cho (con|bé|các con|con gái|con trai|bạn nhỏ|cháu)\b"),
    ("Mua cho vợ, chồng", r"cho (vợ|chồng|ông xã|bà xã|ck|vk)\b"),
    ("Đang mang bầu, sau sinh",
     r"(mang bầu|đang bầu|bầu bí|bầu mình|mẹ bầu|sau sinh|cho con bú|bầu được|bầu tháng|tháng thứ|tuần thai)"),
    ("Tự dùng", r"(mình|tôi|em|tớ) (uống|dùng|đã uống|đang uống|bị)"),
)
_F_NAMES = set(("huyen|trang|mai|linh|thao|ngoc|hoa|lan|huong|hang|thu|thuy|nhung|nga|van|yen|anh|my|vy|nhi|ha|hanh|"
                "phuong|quynh|loan|dung|tam|nhu|uyen|chi|hien|diep|tuyet|oanh|giang|ly|xuan|thanh|be|meo|kim|hong|duyen|"
                "hue|nhan|tien|trinh|mo|ngan|nguyet|cuc|lien").split("|"))
_M_NAMES = set(("hung|tuan|minh|duc|khoa|cuong|phong|long|hieu|nam|quang|dat|son|thang|trung|huy|vinh|khanh|bao|tai|"
                "toan|kien|hai|hoang|tung|thinh|phuc|duy|loc|tien|viet|thai|quan|tri|binh|dung|nghia|manh|hao|luan|vu|"
                "hau").split("|"))
AMBIGUOUS_NAMES = (_F_NAMES & _M_NAMES) | {"anh", "thanh", "hai", "ha", "tien", "dung", "khanh", "binh", "van"}
FEMALE_NAMES = tuple(sorted(x for x in _F_NAMES - AMBIGUOUS_NAMES if len(x) >= 4))
MALE_NAMES = tuple(sorted(x for x in _M_NAMES - AMBIGUOUS_NAMES if len(x) >= 4))
GENDER_UNKNOWN = "Không đoán được"
AGE_BANDS = ("Dưới 20", "20–29", "30–39", "40–49", "50 trở lên")

# Part 2: report frame, confidence levels, shared store, reason links.
FRAME_CONTRACT_VERSION = "insight-report-frame-v1"
FRAME_KINDS = ("frame", "data", "synthesis")
ROLES = ("Chính", "Phụ", "Gợi ý")
LEVELS = ("Không", "Yếu", "Khá", "Chắc")  # low to high
COUNT_TOOLS = ("theme_counts", "keyword_counts", "portrait_counts", "star_counts")
COUNT_ROW_SOURCES = ("shopee_reviews", "tiktok_shop_reviews", "search_suggestions")
REVIEW_SOURCES = ("shopee_reviews", "tiktok_shop_reviews")
REASON_TOOL = "find_reason_links"
PLATFORM_NAMES = {"shopee": "Shopee", "tiktok_shop": "TikTok Shop"}
STATUS_DATA = "Có dữ liệu"
STATUS_BLOCKED = "Chưa dùng được"
LABEL_FRAME = "Khung"
MAX_EVIDENCE = 50
MAX_READ_REVIEWS = 20
SHARED_STORE_NAME = "insight-shared.sqlite"
SAMPLE_RULES_KINDS = ("codebook", "keyword_groups", "portrait_rules")
REASON_RULES_VERSION = "reason-2026-10-30.1"
REASON_CONNECTORS = ("vì", "nên", "do", "để")
REASON_RE = re.compile(r"(?<![^\W_])(?:" + "|".join(REASON_CONNECTORS) + r")(?![^\W_])")
LINK_BASIS = "CHECKED_READING"
COUNT_ID_RE = re.compile(r"^IMC-[0-9a-f]{12}$")
READ_NOTICE = "Chỉ để đọc trên máy chủ. Không đưa chữ này vào báo cáo (R-I11)."

# R-L01 / R-I29: the 26 names of HIDDEN_NAMES in src/modules/analysis/report-language/hidden-names.ts, in its order,
# plus World Bank and SLAYER. A test reads that file as text and checks every app name is here.
HIDDEN_NAMES = (
    "Metric", "Kalodata", "TradeInt", "Dami",
    "SerpApi", "Apify", "PageIndex", "Agent-Reach", "OpenCLI", "zen-studio",
    "Jev", "TypeSafe", "CLIProxy", "OpenAI", "Anthropic", "GLM", "Gemini", "Google", "Nemotron", "NVIDIA",
    "CloakBrowser", "Cloak Browser", "cloak-browser", "cloak_browser", "ShopeePublicReviewCollector",
    "shopee-public-review",
    "World Bank", "SLAYER",
)
# The app's READER rule: a whole name with Unicode edges (no letter, digit or `_` next to it), case-insensitive;
# `Metric` only as `Metric` or `METRIC`.
_HIDDEN_PATTERNS = tuple(
    re.compile(r"(?<!\w)(?:Metric|METRIC)(?!\w)") if name == "Metric"
    else re.compile(r"(?<!\w)" + re.escape(name) + r"(?!\w)", re.I)
    for name in HIDDEN_NAMES)
_MODEL_ID = re.compile(r"\b(?:gpt|claude)-[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?", re.I)

mcp = FastMCP("tdn-insight")


class InsightError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(code)
        self.code = code
        self.message = message


def _error(code: str, message: str) -> dict:
    return {"error": code, "message": message}


def _tool(fn):
    """Return error dicts, never raw exception text (it can hold a key or review text)."""
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        try:
            return fn(*args, **kwargs)
        except InsightError as exc:
            return _error(exc.code, exc.message)
        except Exception as exc:  # noqa: BLE001
            return _error("INTERNAL_ERROR", f"unexpected {type(exc).__name__}; no details are returned")
    return wrapper


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------

def _nz(text: str) -> str:
    return unicodedata.normalize("NFC", text).lower()


def _fold(text: str) -> str:
    return unicodedata.normalize("NFC", text).casefold().strip()


def _sha256(data: str | bytes) -> str:
    return hashlib.sha256(data.encode("utf-8") if isinstance(data, str) else data).hexdigest()


def _canonical(value) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def _check_run_id(run_id) -> str:
    if not isinstance(run_id, str) or not RUN_ID_RE.match(run_id):
        raise InsightError("INVALID_ARGUMENT", "run_id must be a lowercase run UUID or its first 8 hex characters")
    return run_id


def _env_path(name: str, default: Path) -> Path:
    value = os.environ.get(name)
    return Path(value).expanduser() if value else default


def _data_dir() -> Path:
    return _env_path("INSIGHT_MCP_DATA_DIR", DEFAULT_DATA_DIR)


def _app_db_path() -> Path:
    """The live app DB. It only locates the app home (artifacts, captures); the MCP never opens or copies it."""
    value = os.environ.get("INSIGHT_MCP_APP_DB")
    if not value:
        raise InsightError("APP_DB_NOT_SET", "INSIGHT_MCP_APP_DB is not set; it names the app SQLite file")
    return Path(value).expanduser()


def _app_snapshot_path() -> Path:
    """The app's published snapshot (app-db.snapshot.sqlite, written by the app with SQLite backup + rename)."""
    value = os.environ.get("INSIGHT_MCP_APP_DB_SNAPSHOT")
    if not value:
        raise InsightError("APP_DB_SNAPSHOT_MISSING", "app chưa xuất bản sao sạch")
    return Path(value).expanduser()


def open_app_db(path: Path) -> sqlite3.Connection:
    """The only way the module opens an app DB copy: read-only URI, never a creating open."""
    uri = "file:" + urllib.parse.quote(str(path)) + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


def _copy_bytes(source: Path, target: Path) -> None:
    with open(source, "rb") as reader, open(target, "wb") as writer:
        shutil.copyfileobj(reader, writer)


SQLITE_HEADER = b"SQLite format 3\x00"


def _open_snapshot_fd(path: Path) -> int:
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0)
    try:
        return os.open(path, flags | getattr(os, "O_NOATIME", 0))
    except PermissionError:
        # O_NOATIME needs file ownership; a plain read-only open is the fallback.
        return os.open(path, flags)


@contextmanager
def published_app_db(path: Path):
    """A read-only connection to a private copy of the app's published snapshot (IM-Q39, IM-Q172). The snapshot
    file is opened once; its bytes are copied through that one descriptor into a fresh temp dir, so the app may
    replace the file (atomic rename) at any time. The copy must have a SQLite header and pass PRAGMA quick_check.
    The live app DB and its -wal/-shm are never opened. Yields (connection, publishedAt as file mtime)."""
    try:
        fd = _open_snapshot_fd(path)
    except FileNotFoundError:
        raise InsightError("APP_DB_SNAPSHOT_MISSING", "app chưa xuất bản sao sạch") from None
    except OSError:
        raise InsightError("APP_DB_SNAPSHOT_UNREADABLE", "the app's published snapshot cannot be read") from None
    directory = Path(tempfile.mkdtemp(prefix="insight-app-"))
    try:
        copy = directory / "app.sqlite"
        try:
            with os.fdopen(fd, "rb") as reader, open(copy, "wb") as writer:
                fd = None
                published = os.fstat(reader.fileno()).st_mtime_ns
                shutil.copyfileobj(reader, writer)
        except OSError:
            raise InsightError("APP_DB_SNAPSHOT_UNREADABLE", "the app's published snapshot cannot be read") from None
        finally:
            if fd is not None:
                os.close(fd)
        with open(copy, "rb") as header:
            if header.read(len(SQLITE_HEADER)) != SQLITE_HEADER:
                raise InsightError("APP_DB_SNAPSHOT_INVALID", "the app's published snapshot is not a SQLite DB")
        con = None
        try:
            con = open_app_db(copy)
            ok = con.execute("PRAGMA quick_check").fetchone() == ("ok",)
        except sqlite3.DatabaseError:
            ok = False
        if not ok:
            if con is not None:
                con.close()
            raise InsightError("APP_DB_SNAPSHOT_INVALID", "the app's published snapshot fails PRAGMA quick_check")
        published_at = datetime.fromtimestamp(published / 1e9, timezone.utc).isoformat(timespec="seconds")
        try:
            yield con, published_at
        finally:
            con.close()
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def _snapshot_age(published_at: str) -> dict:
    age = datetime.now(timezone.utc) - datetime.fromisoformat(published_at)
    return {"publishedAt": published_at, "ageSeconds": max(0, int(age.total_seconds()))}


# ---------------------------------------------------------------------------
# Codebook and keyword groups
# ---------------------------------------------------------------------------

def _theme_entry_ok(theme) -> bool:
    return (isinstance(theme, dict) and isinstance(theme.get("code"), str) and THEME_CODE_RE.match(theme["code"])
            and all(isinstance(theme.get(k), str) and theme.get(k).strip() for k in ("name", "include"))
            and isinstance(theme.get("exclude", ""), str) and ("options" not in theme or _options_ok(theme["options"])))


def _options_ok(options) -> bool:
    """An answer option list (IM-Q175): non-empty dicts with string key and meaning, holding KHONG_NHAC."""
    return (isinstance(options, list) and bool(options)
            and all(isinstance(o, dict) and isinstance(o.get("key"), str) and isinstance(o.get("meaning"), str) for o in options)
            and any(o["key"] == "KHONG_NHAC" for o in options))


def load_codebook(path: Path | None = None) -> dict:
    """Load and check the theme codebook. Rejects a codebook that holds an F310 theme."""
    path = CODEBOOK_PATH if path is None else path
    try:
        book = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise InsightError("CODEBOOK_INVALID", "the theme codebook cannot be read as JSON") from None
    if not isinstance(book, dict):
        raise InsightError("CODEBOOK_INVALID", "the theme codebook is not an object")
    for key in ("version", "status"):
        if not isinstance(book.get(key), str) or not book[key].strip():
            raise InsightError("CODEBOOK_INVALID", f"the theme codebook has no {key}")
    core, blocks = book.get("core"), book.get("blocks")
    if not isinstance(core, list) or not core or not all(_theme_entry_ok(t) for t in core):
        raise InsightError("CODEBOOK_INVALID", "the codebook core themes are missing or malformed")
    if not isinstance(blocks, dict) or not all(
            isinstance(k, str) and BLOCK_KEY_RE.match(k) and isinstance(b, dict) and isinstance(b.get("label"), str)
            and isinstance(b.get("themes"), list) and all(_theme_entry_ok(t) for t in b["themes"])
            and isinstance(b.get("match"), dict) for k, b in blocks.items()):
        raise InsightError("CODEBOOK_INVALID", "the codebook blocks are missing or malformed")
    themes = list(core) + [t for b in blocks.values() for t in b["themes"]]
    banned_names = {_fold(n) for n in EXCLUDED_THEME_NAMES}
    for theme in themes:
        if theme["code"] in EXCLUDED_THEME_CODES or _fold(theme["name"]) in banned_names:
            raise InsightError("CODEBOOK_EXCLUDED_THEME",
                               "the codebook contains a logistics theme dropped by the owner (F310)")
    codes = [t["code"] for t in core]
    for block in blocks.values():
        block_codes = codes + [t["code"] for t in block["themes"]]
        if len(set(block_codes)) != len(block_codes):
            raise InsightError("CODEBOOK_INVALID", "a theme code repeats within one block selection")
    if not _options_ok(book.get("options")):
        raise InsightError("CODEBOOK_INVALID", "the codebook answer options are missing or lack KHONG_NHAC")
    thresholds, limits = book.get("thresholds"), book.get("limits")
    if not isinstance(thresholds, dict) or not all(
            isinstance(thresholds.get(k), (int, float)) and not isinstance(thresholds.get(k), bool)
            for k in ("keep", "unclear", "direction", "probabilitySumTolerance")):
        raise InsightError("CODEBOOK_INVALID", "the codebook thresholds are missing")
    if not isinstance(limits, dict) or not all(
            isinstance(limits.get(k), int) and not isinstance(limits.get(k), bool) and limits[k] > 0
            for k in ("maxQuestionsPerCall", "maxCallsPerRun")):
        raise InsightError("CODEBOOK_INVALID", "the codebook limits are missing")
    return book


def _theme_codes(book: dict) -> dict:
    """Every askable theme code of the codebook, with its name."""
    out = {t["code"]: t["name"] for t in book["core"]}
    for block in book["blocks"].values():
        out.update({t["code"]: t["name"] for t in block["themes"]})
    return out


def load_keyword_groups(path: Path | None = None) -> dict:
    path = KEYWORD_GROUPS_PATH if path is None else path
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    data["_compiled"] = [(g, re.compile(g["regex"])) for g in data["groups"]]
    return data


# ---------------------------------------------------------------------------
# Writers and portrait rules
# ---------------------------------------------------------------------------

def _writer_key_for_name(name: str) -> str:
    return "w:" + _sha256(_fold(name))[:16]


def _usable_name(name, anonymous) -> bool:
    return isinstance(name, str) and bool(name.strip()) and "*" not in name and anonymous is not True


def guess_gender(name: str) -> str:
    letters = re.sub(r"[^a-z]", "", name.lower())
    female = any(x in letters for x in FEMALE_NAMES)
    male = any(x in letters for x in MALE_NAMES)
    if female and not male:
        return "Nữ"
    if male and not female:
        return "Nam"
    return GENDER_UNKNOWN


def guess_birth_year(name: str):
    four = re.search(r"(19[5-9]\d|200[0-8])(?!\d)", name)
    if four:
        return int(four.group(1)), "4 số năm sinh"
    two = re.search(r"(?<!\d)([6-9]\d|0[0-8])$", name)
    if two:
        value = int(two.group(1))
        return (1900 + value if value >= 60 else 2000 + value), "2 số cuối"
    return None, None


def age_band(run_year: int, birth_year) -> str:
    if birth_year is None:
        return GENDER_UNKNOWN
    age = run_year - birth_year
    if age < 20:
        return "Dưới 20"
    if age >= 50:
        return "50 trở lên"
    return f"{age // 10 * 10}–{age // 10 * 10 + 9}"


def portrait_groups(text: str) -> list[tuple[str, str]]:
    """(dimension, group) pairs for one review text (comment plus attribute lines)."""
    t = _nz(text)
    out = []
    if "đối tượng sử dụng" in t:
        match = AI_DUNG_FIELD.search(t)
        value = match.group(1) if match else ""
        for group in [n for n, rx in AI_DUNG_GROUPS if re.search(rx, value)] or [AI_DUNG_OTHER]:
            out.append(("Ai dùng", group))
    for group, rx in MUA_CHO_AI_GROUPS:
        if re.search(rx, t):
            out.append(("Mua cho ai", group))
    return out


# ---------------------------------------------------------------------------
# Warehouse schema
# ---------------------------------------------------------------------------

SOURCE_SCHEMA = """
CREATE TABLE app_snapshot(published_at TEXT NOT NULL);
CREATE TABLE run_facts(run_id TEXT PRIMARY KEY, keyword TEXT NOT NULL, created_at TEXT NOT NULL, run_year INTEGER NOT NULL,
  applied_keywords TEXT NOT NULL, applied_category TEXT, scope_capture INTEGER, category_evidence_label TEXT,
  category_evidence_reason TEXT, content_sha256 TEXT NOT NULL, built_at TEXT NOT NULL);
CREATE TABLE source_status(source TEXT PRIMARY KEY, platform TEXT NOT NULL, captured INTEGER NOT NULL,
  row_count INTEGER NOT NULL);
CREATE TABLE review(review_id TEXT PRIMARY KEY, platform TEXT NOT NULL, source_review_id TEXT NOT NULL,
  product_key TEXT NOT NULL, writer_key TEXT NOT NULL, writer_known INTEGER NOT NULL CHECK(writer_known IN (0, 1)),
  rating INTEGER, posted_date TEXT, shop_key TEXT NOT NULL);
CREATE TABLE review_text(review_id TEXT PRIMARY KEY REFERENCES review(review_id), text TEXT NOT NULL);
CREATE TABLE product(product_key TEXT PRIMARY KEY, platform TEXT NOT NULL, product_name TEXT);
CREATE TABLE writer_guess(writer_key TEXT PRIMARY KEY, gender TEXT NOT NULL,
  age_band TEXT NOT NULL, year_basis TEXT NOT NULL);
CREATE TABLE keyword(keyword TEXT PRIMARY KEY, platform TEXT NOT NULL);
CREATE TABLE trend(location TEXT NOT NULL, value INTEGER, query TEXT, PRIMARY KEY(location, query));
CREATE TABLE portrait_label(review_id TEXT NOT NULL, dimension TEXT NOT NULL, grp TEXT NOT NULL,
  PRIMARY KEY(review_id, dimension, grp));
CREATE TABLE near_dup(review_id TEXT PRIMARY KEY, group_id TEXT NOT NULL);
CREATE TABLE review_star(review_id TEXT PRIMARY KEY REFERENCES review(review_id), star_sentiment TEXT NOT NULL);
"""
SOURCE_TABLES = ("app_snapshot", "run_facts", "source_status", "review", "review_text", "product", "writer_guess", "keyword",
                 "trend", "portrait_label", "near_dup", "review_star")
# Copied from the app DB on every build (F361–F367): never kept across builds, never written by a tool.
APP_LABEL_TABLES = ("coding_target", "coding_state", "review_input", "label")

STATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS coding_target(target_id INTEGER PRIMARY KEY AUTOINCREMENT, codebook_version TEXT NOT NULL,
  block_key TEXT, block_norm TEXT NOT NULL, match_basis TEXT NOT NULL, matched_term TEXT, started_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coding_state(review_id TEXT NOT NULL, codebook_version TEXT NOT NULL, block_key TEXT,
  block_norm TEXT NOT NULL, input_sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status = 'done'),
  PRIMARY KEY(review_id, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS review_input(review_id TEXT NOT NULL, codebook_version TEXT NOT NULL,
  block_norm TEXT NOT NULL, input_sha256 TEXT NOT NULL, PRIMARY KEY(review_id, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS label(review_id TEXT NOT NULL,
  theme_code TEXT NOT NULL, codebook_version TEXT NOT NULL, block_key TEXT, block_norm TEXT NOT NULL,
  p_yes REAL, polarity TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('kept', 'unclear')),
  step TEXT NOT NULL, text_ref TEXT NOT NULL, text_start INTEGER NOT NULL, text_end INTEGER NOT NULL,
  text_sha256 TEXT NOT NULL, note TEXT, UNIQUE(review_id, theme_code, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS keyword_group(keyword TEXT NOT NULL, groups_version TEXT NOT NULL, group_key TEXT NOT NULL,
  PRIMARY KEY(keyword, groups_version));
CREATE TABLE IF NOT EXISTS count_registry(count_id TEXT PRIMARY KEY, tool TEXT NOT NULL, row_key TEXT NOT NULL,
  rules_version TEXT NOT NULL, numbers_json TEXT NOT NULL, state_sha256 TEXT NOT NULL, created_at TEXT NOT NULL);
DROP VIEW IF EXISTS v_theme_label;
CREATE VIEW v_theme_label AS
  SELECT r.platform, l.theme_code, l.polarity, l.step, l.codebook_version, l.block_norm, r.review_id, r.writer_key,
         1 - r.writer_known AS writer_unknown, r.product_key
  FROM label l
  JOIN review r ON r.review_id = l.review_id
  JOIN coding_state s ON s.review_id = l.review_id AND s.codebook_version = l.codebook_version
       AND s.block_norm = l.block_norm AND s.status = 'done'
  JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
       AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
  WHERE l.status = 'kept';
DROP VIEW IF EXISTS v_coded_review;
CREATE VIEW v_coded_review AS
  SELECT r.platform, s.codebook_version, s.block_norm, r.review_id
  FROM coding_state s
  JOIN review r ON r.review_id = s.review_id
  JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
       AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
  WHERE s.status = 'done';
DROP VIEW IF EXISTS v_star_review;
CREATE VIEW v_star_review AS
  SELECT r.platform, r.product_key, s.star_sentiment, r.review_id, r.writer_key, 1 - r.writer_known AS writer_unknown
  FROM review_star s JOIN review r ON r.review_id = s.review_id;
DROP VIEW IF EXISTS v_portrait;
CREATE VIEW v_portrait AS
  SELECT r.platform, p.dimension, p.grp, r.review_id, r.writer_key, 1 - r.writer_known AS writer_unknown, r.product_key
  FROM portrait_label p JOIN review r ON r.review_id = p.review_id;
DROP VIEW IF EXISTS v_writer_guess;
CREATE VIEW v_writer_guess AS
  SELECT DISTINCT r.platform, w.gender, w.age_band, w.writer_key
  FROM writer_guess w JOIN review r ON r.writer_key = w.writer_key;
DROP VIEW IF EXISTS v_keyword_group;
CREATE VIEW v_keyword_group AS
  SELECT k.platform, g.groups_version, g.group_key, k.keyword
  FROM keyword k JOIN keyword_group g ON g.keyword = k.keyword;
""" + """
CREATE TABLE IF NOT EXISTS reason_flag(review_id TEXT NOT NULL, rules_version TEXT NOT NULL,
  PRIMARY KEY(review_id, rules_version));
CREATE TABLE IF NOT EXISTS reason_verdict(review_id TEXT NOT NULL, theme_pair TEXT NOT NULL,
  linked INTEGER NOT NULL CHECK(linked IN (0, 1)), PRIMARY KEY(review_id, theme_pair));
CREATE VIEW IF NOT EXISTS v_reason_link AS
  SELECT r.platform, l1.codebook_version, l1.block_norm, l1.theme_code AS theme_lo, l2.theme_code AS theme_hi,
         f.rules_version, r.review_id,
         CASE WHEN v.linked = 1 THEN 'linked' WHEN v.linked IS NULL THEN 'candidate' ELSE 'not_linked' END AS link_state
  FROM label l1
  JOIN label l2 ON l2.review_id = l1.review_id AND l2.codebook_version = l1.codebook_version
       AND l2.block_norm = l1.block_norm AND l2.theme_code > l1.theme_code AND l2.status = 'kept'
  JOIN review r ON r.review_id = l1.review_id
  JOIN coding_state s ON s.review_id = l1.review_id AND s.codebook_version = l1.codebook_version
       AND s.block_norm = l1.block_norm AND s.status = 'done'
  JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
       AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
  JOIN reason_flag f ON f.review_id = r.review_id
  LEFT JOIN reason_verdict v ON v.review_id = r.review_id AND v.theme_pair = l1.theme_code || '|' || l2.theme_code
  WHERE l1.status = 'kept';
"""
# The reason-link part of STATE_SCHEMA; `find_reason_links` runs it so a warehouse built before part 2 gets it too.
REASON_SCHEMA = STATE_SCHEMA[STATE_SCHEMA.index("CREATE TABLE IF NOT EXISTS reason_flag"):]

# Part 4 claim tables (state tables: a rebuild keeps them; PR 4 conventions).
CLAIM_SCHEMA = """
CREATE TABLE IF NOT EXISTS claim_catalogue(theme_code TEXT NOT NULL, catalogue_version INTEGER NOT NULL,
  label TEXT NOT NULL, catalogue_json TEXT NOT NULL, codebook_version TEXT NOT NULL, submitted_at TEXT NOT NULL,
  PRIMARY KEY(theme_code, catalogue_version));
CREATE TRIGGER IF NOT EXISTS claim_catalogue_no_update BEFORE UPDATE ON claim_catalogue
  BEGIN SELECT RAISE(ABORT, 'claim_catalogue rows are never changed or removed'); END;
CREATE TRIGGER IF NOT EXISTS claim_catalogue_no_delete BEFORE DELETE ON claim_catalogue
  BEGIN SELECT RAISE(ABORT, 'claim_catalogue rows are never changed or removed'); END;
CREATE TABLE IF NOT EXISTS claim_coding_state(review_id TEXT NOT NULL, theme_code TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL, input_sha256 TEXT NOT NULL, spec_p REAL NOT NULL, rac_p REAL NOT NULL,
  gen_p REAL NOT NULL, status TEXT NOT NULL CHECK(status = 'done'), PRIMARY KEY(review_id, theme_code, catalogue_version));
CREATE TABLE IF NOT EXISTS claim_label(review_id TEXT NOT NULL, theme_code TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL, claim_code TEXT NOT NULL, p_co REAL NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('kept', 'unclear')), PRIMARY KEY(review_id, theme_code, catalogue_version, claim_code));
CREATE TABLE IF NOT EXISTS claim_packet(packet_id TEXT NOT NULL, theme_code TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL, seed INTEGER NOT NULL, sample_id TEXT NOT NULL, review_id TEXT NOT NULL,
  kind TEXT NOT NULL, PRIMARY KEY(packet_id, sample_id));
CREATE TABLE IF NOT EXISTS claim_grade(grade_id TEXT PRIMARY KEY, theme_code TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL, packet_id TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('DRAFT', 'PASSED')),
  summary_json TEXT NOT NULL, raw_json TEXT NOT NULL, recorded_at TEXT NOT NULL);
"""
# The counting helper of claim_counts, created only in its per-call copy of the warehouse (IM-Q153): the theme's
# reviews with their kind, and the two views the SLAYER models `claim_label` and `claim_review` read.
CLAIM_COUNT_SCHEMA = """
CREATE TABLE claim_scope(review_id TEXT PRIMARY KEY, platform TEXT NOT NULL, theme_code TEXT NOT NULL,
  catalogue_version INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('sample', 'spam', 'attribute_only')),
  specific INTEGER NOT NULL, shop_key TEXT NOT NULL);
CREATE VIEW v_claim_label AS
  SELECT r.platform, s.theme_code, s.catalogue_version, l.claim_code, r.review_id, r.writer_key,
         1 - r.writer_known AS writer_unknown, r.product_key, s.shop_key, COALESCE(r.posted_date, '') AS posted_date,
         n.group_id, s.specific
  FROM claim_label l
  JOIN claim_scope s ON s.review_id = l.review_id AND s.theme_code = l.theme_code
       AND s.catalogue_version = l.catalogue_version AND s.kind = 'sample'
  JOIN review r ON r.review_id = l.review_id
  JOIN near_dup n ON n.review_id = l.review_id
  WHERE l.status = 'kept';
CREATE VIEW v_claim_review AS
  SELECT s.platform, s.theme_code, s.catalogue_version, s.review_id, COALESCE(r.posted_date, '') AS posted_date,
         CASE WHEN s.kind = 'sample' THEN 1 ELSE 0 END AS is_sample,
         CASE WHEN s.kind = 'attribute_only' THEN 1 ELSE 0 END AS is_attribute_only,
         CASE WHEN s.kind = 'spam' THEN 1 ELSE 0 END AS is_spam,
         CASE WHEN s.kind = 'sample' AND k.mentions IS NULL THEN 1 ELSE 0 END AS no_claim,
         CASE WHEN s.kind = 'sample' THEN COALESCE(k.mentions, 0) ELSE 0 END AS mentions
  FROM claim_scope s
  JOIN review r ON r.review_id = s.review_id
  LEFT JOIN (SELECT review_id, theme_code, catalogue_version, COUNT(*) AS mentions FROM claim_label
             WHERE status = 'kept' GROUP BY review_id, theme_code, catalogue_version) k
       ON k.review_id = s.review_id AND k.theme_code = s.theme_code AND k.catalogue_version = s.catalogue_version;
"""


def _runs_dir() -> Path:
    return _data_dir() / "runs"


def _find_warehouse(run_id: str) -> Path:
    """The run's warehouse. A run_id names an app run: when the app DB is configured, the ID is resolved there
    first (in a read-only snapshot), so an unknown or ambiguous ID gives RUN_NOT_FOUND or RUN_AMBIGUOUS in every tool."""
    value = os.environ.get("INSIGHT_MCP_APP_DB_SNAPSHOT")
    if value and Path(value).expanduser().is_file():
        with published_app_db(Path(value).expanduser()) as (con, _):
            run_id = _resolve_run(con, run_id)[0]
    runs = _runs_dir()
    matches = sorted(runs.glob(run_id + "*.sqlite")) if runs.is_dir() else []
    if not matches:
        raise InsightError("WAREHOUSE_NOT_BUILT", "no warehouse for this run; call build_warehouse first")
    if len(matches) > 1:
        raise InsightError("RUN_AMBIGUOUS", "the run_id prefix matches more than one warehouse")
    return matches[0]


def _open_warehouse(path: Path) -> sqlite3.Connection:
    con = sqlite3.connect(str(path), isolation_level=None)
    con.execute("PRAGMA foreign_keys = OFF")
    return con


@contextmanager
def _tx(con: sqlite3.Connection):
    """One explicit transaction, DDL included; rolled back on any error."""
    con.execute("BEGIN IMMEDIATE")
    try:
        yield con
    except BaseException:
        con.execute("ROLLBACK")
        raise
    con.execute("COMMIT")


# ---------------------------------------------------------------------------
# Reading stored run data (read-only)
# ---------------------------------------------------------------------------

def _artifact_root(app_db: Path) -> Path:
    return _env_path("INSIGHT_MCP_APP_ARTIFACTS", app_db.parent / "artifacts")


def _capture_root(app_db: Path) -> Path:
    return _env_path("INSIGHT_MCP_APP_CAPTURES", app_db.parent / "metric-captures")


def _read_artifact(root: Path, sha: str) -> bytes:
    if not isinstance(sha, str) or not re.fullmatch(r"[0-9a-f]{64}", sha):
        raise InsightError("ARTIFACT_INVALID", "a stored artifact reference is not a sha256")
    path = root / "sha256" / sha[:2] / sha
    try:
        with open(path, "rb") as handle:
            data = handle.read()
    except FileNotFoundError:
        raise InsightError("ARTIFACT_MISSING", f"stored artifact {sha[:12]} is missing from the artifact store") from None
    if _sha256(data) != sha:
        raise InsightError("ARTIFACT_INVALID", f"stored artifact {sha[:12]} does not match its sha256")
    return data


def _artifact_json(root: Path, sha: str):
    try:
        return json.loads(_read_artifact(root, sha))
    except ValueError:
        raise InsightError("ARTIFACT_INVALID", f"stored artifact {sha[:12]} is not JSON") from None


def _capture_response(root: Path, sha: str):
    """The provider response inside a research-automation capture envelope, or None when it has none."""
    envelope = _artifact_json(root, sha)
    if not isinstance(envelope, dict) or envelope.get("outcome") != "OK":
        return None
    encoded = envelope.get("responseBytesBase64")
    if not isinstance(encoded, str):
        return None
    try:
        return json.loads(base64.b64decode(encoded, validate=True))
    except ValueError:
        raise InsightError("ARTIFACT_INVALID", f"capture {sha[:12]} has an unreadable response") from None


def _resolve_run(con: sqlite3.Connection, run_id: str):
    if len(run_id) == 36:
        rows = con.execute("SELECT run_id, keyword, created_at FROM analysis_research_automation_runs WHERE run_id = ?",
                           (run_id,)).fetchall()
    else:
        rows = con.execute("SELECT run_id, keyword, created_at FROM analysis_research_automation_runs "
                           "WHERE substr(run_id, 1, 8) = ?", (run_id,)).fetchall()
    if not rows:
        raise InsightError("RUN_NOT_FOUND", "no stored run matches this run_id")
    if len(rows) > 1:
        raise InsightError("RUN_AMBIGUOUS", "the run_id prefix matches more than one run")
    return rows[0]


def _scope(capture_root: Path, run_id: str, run_keyword: str) -> dict:
    """Applied scope by the app's usedScope rule; category evidence is kept apart and never applied."""
    path = capture_root / run_id / "scope.json"
    if not path.exists():
        return {"applied_keywords": [run_keyword], "applied_category": None, "scope_capture": None,
                "category_evidence": None, "category_reason": None}
    try:
        record = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise InsightError("SCOPE_RECORD_INVALID", "the run scope record cannot be read") from None
    if not isinstance(record, dict) or record.get("contractVersion") not in SCOPE_VERSIONS \
            or record.get("runId") != run_id or not isinstance(record.get("keyword1"), str):
        raise InsightError("SCOPE_RECORD_INVALID", "the run scope record does not match this run")
    category = record.get("category")
    if category is not None and not isinstance(category, dict):
        raise InsightError("SCOPE_RECORD_INVALID", "the run scope record has a malformed category")
    chosen = (category or {}).get("category")
    evidence = chosen.get("label") if isinstance(chosen, dict) else None
    reason = (category or {}).get("reason")
    capture2 = record.get("capture2")
    if capture2 is not None:
        if not isinstance(capture2, dict) or not isinstance(capture2.get("keywords"), list) \
                or not all(isinstance(k, str) for k in capture2["keywords"]) \
                or not (capture2.get("category") is None or isinstance(capture2.get("category"), str)) \
                or capture2.get("outcome") not in ("AWAITING_KEYWORD2", "PENDING", "OK", "CATEGORY_NOT_SELECTABLE"):
            raise InsightError("SCOPE_RECORD_INVALID", "the run scope record has a malformed second capture")
    if capture2 is not None and capture2["outcome"] == "OK":
        applied = {"applied_keywords": list(capture2["keywords"]), "applied_category": capture2["category"],
                   "scope_capture": 2}
    else:
        applied = {"applied_keywords": [record["keyword1"]], "applied_category": None, "scope_capture": 1}
    return {**applied, "category_evidence": evidence if isinstance(evidence, str) else None,
            "category_reason": reason if isinstance(reason, str) else None}


def _captures(con: sqlite3.Connection, run_id: str, operation: str) -> list[str]:
    return [row[0] for row in con.execute(
        "SELECT artifact_sha256 FROM analysis_research_automation_captures WHERE run_id = ? AND operation = ? "
        "ORDER BY step_id, ordinal", (run_id, operation))]


def _shopee_reviews(con, root: Path, run_id: str):
    row = con.execute("SELECT artifact_sha256 FROM foundation_shopee_collections WHERE run_key = ?",
                      ("auto-" + run_id,)).fetchone()
    if row is None:
        return None
    collection = _artifact_json(root, row[0])
    if not isinstance(collection, dict):
        raise InsightError("ARTIFACT_INVALID", "the Shopee collection artifact is not an object")
    excluded = set()
    for listing in collection.get("listings") or []:
        for entry in (listing.get("excluded") or []) if isinstance(listing, dict) else []:
            value = entry.get("reviewId", entry.get("review_id")) if isinstance(entry, dict) else entry
            if value is not None:
                excluded.add(str(value))
    reviews = {}
    for page in collection.get("pages") or []:
        rows = _artifact_json(root, page.get("sha256") if isinstance(page, dict) else None)
        if not isinstance(rows, list):
            raise InsightError("ARTIFACT_INVALID", "a Shopee page artifact is not a list")
        for item in rows:
            if not isinstance(item, dict) or item.get("reviewId") in (None, ""):
                continue
            source_id = str(item["reviewId"])
            if source_id in excluded or source_id in reviews:
                continue
            comment = item.get("comment") if isinstance(item.get("comment"), str) else ""
            attributes = [a for a in item.get("attributes") or [] if isinstance(a, str)]
            text = comment + "  " + "  ".join(attributes) if attributes else comment
            rating = item.get("ratingStar")
            reviews[source_id] = {
                "review_id": "shopee:" + source_id, "platform": "shopee", "source_review_id": source_id,
                "product_key": f"shopee:{item.get('itemId')}",
                "shop_key": f"shopee:{item.get('shopId')}",
                "writer_key": "shopee:" + source_id, "writer_known": 0,
                "rating": rating if isinstance(rating, int) and not isinstance(rating, bool) else None,
                "text": text, "name": None, "posted_date": _first_date(item.get("postedAtLocal"), item.get("createdAt")),
            }
    return list(reviews.values())


def _tiktok_reviews(con, root: Path, run_id: str):
    shas = _captures(con, run_id, "kalodata.product.comment.insight")
    if not shas:
        return None
    reviews, available = {}, False
    for sha in shas:
        response = _capture_response(root, sha)
        if response is None:
            continue
        available = True
        data = response.get("data") if isinstance(response, dict) else None
        for item in (data or {}).get("original_comments") or []:
            review = item.get("review") if isinstance(item, dict) else None
            if not isinstance(review, dict) or review.get("review_id") in (None, ""):
                continue
            source_id = str(review["review_id"])
            if source_id in reviews:
                continue
            user = item.get("review_user") if isinstance(item.get("review_user"), dict) else {}
            name = user.get("name")
            known = _usable_name(name, item.get("is_anonymous"))
            text = review.get("display_text") if isinstance(review.get("display_text"), str) else ""
            rating = review.get("rating")
            product_id = item.get("product_id") or (data or {}).get("product_id")
            reviews[source_id] = {
                "review_id": "tiktok_shop:" + source_id, "platform": "tiktok_shop", "source_review_id": source_id,
                "product_key": f"tiktok_shop:{product_id}",
                "shop_key": f"tiktok_shop:{product_id}",
                "writer_key": _writer_key_for_name(name) if known else "tiktok_shop:" + source_id,
                "writer_known": 1 if known else 0,
                "rating": rating if isinstance(rating, int) and not isinstance(rating, bool) else None,
                "text": text, "name": name if known else None,
                "posted_date": _first_date(review.get("review_timestamp"), review.get("review_timestamp_fmt")),
            }
    return list(reviews.values()) if available else None


def _tiktok_product_names(con, root: Path, run_id: str):
    shas = _captures(con, run_id, "kalodata.product.detail")
    names, available = {}, False
    for sha in shas:
        response = _capture_response(root, sha)
        if response is None:
            continue
        available = True
        data = response.get("data") if isinstance(response, dict) else None
        if isinstance(data, dict) and data.get("product_id") and isinstance(data.get("product_name"), str):
            names.setdefault(f"tiktok_shop:{data['product_id']}", data["product_name"])
    return names if available else None


def _shopee_product_names(capture_root: Path, run_id: str):
    run_dir = capture_root / run_id
    files = sorted(p for p in run_dir.glob("run*/raw-responses.json") if re.fullmatch(r"run\d+", p.parent.name)) \
        if run_dir.is_dir() else []
    if not files:
        return None
    names = {}
    for path in files:
        try:
            stack = [json.loads(path.read_text(encoding="utf-8"))]
        except (OSError, ValueError):
            raise InsightError("ARTIFACT_INVALID", "a stored product response file cannot be read") from None
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(reversed(node))
            elif isinstance(node, dict):
                base = node.get("product_base_id")
                match = SHOPEE_BASE_ID.match(base) if isinstance(base, str) else None
                if match and isinstance(node.get("product_name"), str) and node["product_name"].strip():
                    names.setdefault(f"shopee:{match.group(1)}", node["product_name"].strip())
                stack.extend(reversed(list(node.values())))
    return names


def _search_keywords(con, root: Path, run_id: str):
    shas = _captures(con, run_id, "serpapi.google.search")
    if not shas:
        return None
    keywords, available = set(), False
    for sha in shas:
        response = _capture_response(root, sha)
        if not isinstance(response, dict):
            continue
        available = True
        texts = [x.get("query") for x in response.get("related_searches") or [] if isinstance(x, dict)]
        texts += [x.get("question") for x in response.get("related_questions") or [] if isinstance(x, dict)]
        for text in texts:
            if isinstance(text, str):
                normalized = re.sub(r"\s+", " ", _nz(text).strip())
                if normalized:
                    keywords.add(normalized)
    return sorted(keywords) if available else None


def _trends_regions(con, root: Path, run_id: str):
    shas = []
    for sha in _captures(con, run_id, "serpapi.google.trends"):
        envelope = _artifact_json(root, sha)
        params = envelope.get("requestParameters") if isinstance(envelope, dict) else None
        if isinstance(params, dict) and str(params.get("data_type", "")).startswith("GEO_MAP"):
            shas.append(sha)
    if not shas:
        return None
    rows, available = {}, False
    for sha in shas:
        response = _capture_response(root, sha)
        if not isinstance(response, dict):
            continue
        available = True
        query = (response.get("search_parameters") or {}).get("q") if isinstance(response.get("search_parameters"), dict) else None
        for item in response.get("interest_by_region") or []:
            if isinstance(item, dict) and isinstance(item.get("location"), str):
                value = item.get("extracted_value")
                rows.setdefault((item["location"], query), value if isinstance(value, int) else None)
    return sorted((loc, val, q) for (loc, q), val in rows.items()) if available else None


def _run_year(created_at: str) -> int:
    try:
        stamp = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    except ValueError:
        raise InsightError("RUN_INVALID", "the stored run has an unreadable created_at") from None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc).year


# ---------------------------------------------------------------------------
# Coding inputs and state
# ---------------------------------------------------------------------------

def _block_norm(block_key) -> str:
    return block_key or ""


def coding_input(text: str, platform: str, product_name, block_key, codebook_version: str) -> dict:
    return {"text": text, "platform": platform, "product_name": product_name, "block_key": block_key,
            "codebook_version": codebook_version}


def _input_sha(review: dict, block_key, version: str) -> str:
    return _sha256(_canonical(coding_input(review["text"], review["platform"], review["product_name"], block_key,
                                           version)))


def _refresh_review_input(con, reviews: list[dict], version: str, block_key) -> None:
    norm = _block_norm(block_key)
    con.execute("DELETE FROM review_input WHERE codebook_version = ? AND block_norm = ?", (version, norm))
    con.executemany("INSERT INTO review_input VALUES (?, ?, ?, ?)",
                    [(r["review_id"], version, norm, _input_sha(r, block_key, version)) for r in reviews])


# ---------------------------------------------------------------------------
# Theme labels and star sentiment from the app DB (read only; owner F361–F367)
# ---------------------------------------------------------------------------

def _codebook_sha() -> str:
    """sha256 of the repo codebook file bytes: the app stores the same hash as `codebook.definition_sha256`."""
    try:
        return _sha256(Path(CODEBOOK_PATH).read_bytes())
    except OSError:
        raise InsightError("CODEBOOK_INVALID", "the theme codebook cannot be read") from None


def _chunks(items: list, size: int = 500):
    for index in range(0, len(items), size):
        yield items[index:index + size]


def _app_rows(con, reviews: list[dict], version: str) -> dict:
    """The app's db-v1 rows for the warehouse reviews, read from the snapshot. A review matches the one
    `product_review` row with its platform and source review ID; two or more matches leave it unmatched."""
    tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type IN ('table', 'view')")}
    out = {"matched": {}, "ambiguous": 0, "stars": {}, "codes": {}, "codebook_sha256": None,
           "codebook_required": False}
    if "codebook" in tables:
        stored = con.execute("SELECT definition_sha256 FROM codebook WHERE codebook_version = ?", (version,)).fetchone()
        out["codebook_sha256"] = stored[0] if stored else None
        out["codebook_required"] = stored is not None
    if not out["codebook_required"] and "review_code" in tables:
        out["codebook_required"] = con.execute(
            "SELECT 1 FROM review_code WHERE codebook_version = ? LIMIT 1", (version,)).fetchone() is not None
    if "review" not in tables:
        return out
    found = {}
    for platform in sorted({r["platform"] for r in reviews}):
        ids = sorted({r["source_review_id"] for r in reviews if r["platform"] == platform})
        for chunk in _chunks(ids):
            for external_id, review_key in con.execute(
                    "SELECT external_id, review_key FROM review WHERE kind = 'product_review' AND platform = ? "
                    f"AND external_id IN ({', '.join('?' * len(chunk))})", (platform, *chunk)):
                found.setdefault((platform, external_id), []).append(review_key)
    for review in reviews:
        keys = found.get((review["platform"], review["source_review_id"]), [])
        if len(keys) == 1:
            out["matched"][review["review_id"]] = keys[0]
        elif keys:
            out["ambiguous"] += 1
    by_key = {key: review_id for review_id, key in out["matched"].items()}
    keys = sorted(by_key)
    if "review_star_sentiment" in tables:
        for chunk in _chunks(keys):
            for review_key, sentiment in con.execute(
                    "SELECT review_key, star_sentiment FROM review_star_sentiment "
                    f"WHERE review_key IN ({', '.join('?' * len(chunk))})", chunk):
                out["stars"][by_key[review_key]] = sentiment or STAR_NONE
    if "review_code" in tables:
        columns = ("review_key", "theme_code", "block_key", "polarity", "journey_step", "status", "confidence",
                   "coder", "text_sha256", "origin")
        for chunk in _chunks(keys):
            for row in con.execute(
                    f"SELECT {', '.join(columns)} FROM review_code WHERE codebook_version = ? "
                    f"AND review_key IN ({', '.join('?' * len(chunk))}) ORDER BY review_key, theme_code",
                    (version, *chunk)):
                code = dict(zip(columns, row))
                out["codes"].setdefault(by_key[code["review_key"]], []).append(code)
    return out


def _proved_codes(app: dict, reviews: list[dict], version: str) -> tuple[dict, int]:
    """The app rows whose review text is the warehouse text (the app's text proof: sha256 of text + attributes).
    A NO_THEME row of origin MCP_IMPORT is not text-proven: it means "coded under this version, no theme" and its
    stored hash is the MCP coding-input hash, so it is accepted without the check (IM-Q173). Every other row
    (themes of any origin, NO_THEME of APP_JEV) needs the whole-text proof. One failing row drops all the
    review's rows: the review is uncoded, never NO_THEME. Returns (rows by review, reviews dropped).
    A codebook table without a row and without labels for the version is an uncoded run, not a mismatch (IM-Q175)."""
    if app["codebook_required"] and app["codebook_sha256"] != _codebook_sha():
        raise InsightError("APP_CODEBOOK_MISMATCH",
                           "the app codebook row of the repo version is missing or has a different definition_sha256")
    by_id = {r["review_id"]: r for r in reviews}
    proved, mismatch = {}, 0
    for review_id, rows in app["codes"].items():
        review = by_id[review_id]
        text_sha = _sha256(review["text"])
        if all(row["text_sha256"] == text_sha or (row["theme_code"] == NO_THEME and row["origin"] == ORIGIN_MCP_IMPORT)
               for row in rows):
            proved[review_id] = rows
        else:
            mismatch += 1
    return proved, mismatch


def _most_common(values) -> object:
    """The most common value; a tie goes to the first in (no block, then block key) order."""
    tally = {}
    for value in values:
        tally[value] = tally.get(value, 0) + 1
    return min(tally, key=lambda v: (-tally[v], _block_norm(v)))


def _write_app_labels(wh, reviews: list[dict], codes: dict, version: str, built_at: str) -> dict:
    """Fill coding_target, review_input, coding_state and label from the proved app rows, so the existing views
    count them. A review's rows that disagree on block are stored under its most common block; the coding target
    is the most common review block of the run."""
    if not codes:
        return {"block_key": None, "coded": 0, "other_block": 0}
    by_id = {r["review_id"]: r for r in reviews}
    blocks = {review_id: _most_common(row["block_key"] for row in rows) for review_id, rows in codes.items()}
    target = _most_common(blocks.values())
    wh.execute("INSERT INTO coding_target(codebook_version, block_key, block_norm, match_basis, matched_term, "
               "started_at) VALUES (?, ?, ?, ?, NULL, ?)", (version, target, _block_norm(target), LABEL_SOURCE, built_at))
    for block in sorted(set(blocks.values()), key=_block_norm):
        _refresh_review_input(wh, reviews, version, block)
    for review_id, rows in sorted(codes.items()):
        review, block = by_id[review_id], blocks[review_id]
        norm = _block_norm(block)
        wh.execute("INSERT INTO coding_state VALUES (?, ?, ?, ?, ?, 'done')",
                   (review_id, version, block, norm, _input_sha(review, block, version)))
        wh.executemany(
            "INSERT INTO label(review_id, theme_code, codebook_version, block_key, block_norm, p_yes, polarity, "
            "status, step, text_ref, text_start, text_end, text_sha256, note) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)",
            [(review_id, row["theme_code"], version, block, norm, row["confidence"], row["polarity"], row["status"],
              row["journey_step"], review_id, len(review["text"]), row["text_sha256"],
              f"{row['origin']} {row['coder']}") for row in rows if row["theme_code"] != NO_THEME])
    other = sum(1 for block in blocks.values() if block != target)
    return {"block_key": target, "coded": len(codes) - other, "other_block": other}


# ---------------------------------------------------------------------------
# build_warehouse
# ---------------------------------------------------------------------------

def _count_or_no_data(value):
    return NO_DATA if value is None else value


@mcp.tool()
@_tool
def build_warehouse(run_id: str) -> dict:
    """Build (or rebuild) the run warehouse from stored run data only, with the app's theme labels and star
    sentiment for the run's reviews (the MCP never labels). Returns counts per platform and source, and `labels`."""
    run_id = _check_run_id(run_id)
    version = load_codebook()["version"]
    app_db = _app_db_path()
    artifacts, captures = _artifact_root(app_db), _capture_root(app_db)
    with published_app_db(_app_snapshot_path()) as (con, published_at):
        full_id, keyword, created_at = _resolve_run(con, run_id)
        scope = _scope(captures, full_id, keyword)
        shopee = _shopee_reviews(con, artifacts, full_id)
        tiktok = _tiktok_reviews(con, artifacts, full_id)
        tiktok_names = _tiktok_product_names(con, artifacts, full_id)
        keywords = _search_keywords(con, artifacts, full_id)
        trends = _trends_regions(con, artifacts, full_id)
        reviews = sorted((shopee or []) + (tiktok or []), key=lambda r: r["review_id"])
        app = _app_rows(con, reviews, version)
    shopee_names = _shopee_product_names(captures, full_id)
    run_year = _run_year(created_at)

    names = {**(shopee_names or {}), **(tiktok_names or {})}
    products = {}
    for review in reviews:
        products.setdefault(review["product_key"], (review["platform"], names.get(review["product_key"])))
        review["product_name"] = names.get(review["product_key"])
    guesses = {}
    for review in reviews:
        if review["writer_known"] and review["writer_key"] not in guesses:
            birth, basis = guess_birth_year(review["name"])
            guesses[review["writer_key"]] = (guess_gender(review["name"]),
                                             age_band(run_year, birth), basis or "Không có")
    portrait = sorted({(r["review_id"], d, g) for r in reviews for d, g in portrait_groups(r["text"])})
    codes, text_mismatch = _proved_codes(app, reviews, version)
    star_rows = sorted(app["stars"].items())

    review_rows = [(r["review_id"], r["platform"], r["source_review_id"], r["product_key"], r["writer_key"],
                    r["writer_known"], r["rating"], r["posted_date"], r["shop_key"]) for r in reviews]
    dup_rows = sorted(near_dup_groups([(r["review_id"], customer_words(r["text"])) for r in reviews]).items())
    text_rows = [(r["review_id"], r["text"]) for r in reviews]
    product_rows = sorted((k, p, n) for k, (p, n) in products.items())
    keyword_rows = [(k, "google") for k in keywords or []]
    trend_rows = list(trends or [])
    fact = {"run_id": full_id, "keyword": keyword, "created_at": created_at, "run_year": run_year, **scope}
    content_sha256 = _sha256(_canonical({
        "review": review_rows, "review_text": text_rows, "product": product_rows, "keyword": keyword_rows,
        "trend": trend_rows, "run_facts": fact}))
    sources = {
        "shopee_reviews": ("shopee", None if shopee is None else len(shopee)),
        "tiktok_shop_reviews": ("tiktok_shop", None if tiktok is None else len(tiktok)),
        "tiktok_shop_product_names": ("tiktok_shop", None if tiktok_names is None else len(tiktok_names)),
        "shopee_product_names": ("shopee", None if shopee_names is None else len(shopee_names)),
        "keywords": ("google", None if keywords is None else len(keywords)),
        "trends": ("google", None if trends is None else len(trends)),
    }

    runs = _runs_dir()
    runs.mkdir(parents=True, exist_ok=True)
    path = runs / f"{full_id}.sqlite"
    built_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    wh = _open_warehouse(path)
    try:
        with _tx(wh):
            for table in SOURCE_TABLES + APP_LABEL_TABLES:
                wh.execute(f"DROP TABLE IF EXISTS {table}")
            for statement in SOURCE_SCHEMA.strip().split(";\n"):
                if statement.strip():
                    wh.execute(statement)
            for statement in (STATE_SCHEMA + CLAIM_SCHEMA).strip().split(";\n"):
                if statement.strip():
                    wh.execute(statement)
            wh.execute("INSERT INTO run_facts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                full_id, keyword, created_at, run_year, _canonical(scope["applied_keywords"]),
                scope["applied_category"], scope["scope_capture"], scope["category_evidence"],
                scope["category_reason"], content_sha256, built_at))
            wh.executemany("INSERT INTO source_status VALUES (?, ?, ?, ?)",
                           [(k, p, 0 if n is None else 1, n or 0) for k, (p, n) in sources.items()])
            wh.execute("INSERT INTO app_snapshot VALUES (?)", (published_at,))
            wh.executemany("INSERT INTO review VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", review_rows)
            wh.executemany("INSERT INTO near_dup VALUES (?, ?)", dup_rows)
            wh.executemany("INSERT INTO review_text VALUES (?, ?)", text_rows)
            wh.executemany("INSERT INTO product VALUES (?, ?, ?)", product_rows)
            wh.executemany("INSERT INTO writer_guess VALUES (?, ?, ?, ?)",
                           [(k, *v) for k, v in sorted(guesses.items())])
            wh.executemany("INSERT INTO keyword VALUES (?, ?)", keyword_rows)
            wh.executemany("INSERT INTO trend VALUES (?, ?, ?)", trend_rows)
            wh.executemany("INSERT INTO portrait_label VALUES (?, ?, ?)", portrait)
            wh.executemany("INSERT INTO review_star VALUES (?, ?)", star_rows)
            coded = _write_app_labels(wh, reviews, codes, version, built_at)
    finally:
        wh.close()

    def per_platform(values):
        return {p: (NO_DATA if (shopee if p == "shopee" else tiktok) is None else values.get(p, 0)) for p in PLATFORMS}

    count = {}
    for review in reviews:
        count[review["platform"]] = count.get(review["platform"], 0) + 1
    known = {}
    for review in reviews:
        known[review["platform"]] = known.get(review["platform"], 0) + review["writer_known"]
    product_count = {}
    for platform, _ in products.values():
        product_count[platform] = product_count.get(platform, 0) + 1
    dated = {}
    for review in reviews:
        dated[review["platform"]] = dated.get(review["platform"], 0) + (review["posted_date"] is not None)
    return {
        "run_id": full_id,
        "warehouse": str(path),
        "content_sha256": content_sha256,
        "scope": {"applied_keywords": scope["applied_keywords"], "applied_category": scope["applied_category"],
                  "scope_capture": scope["scope_capture"], "category_evidence": scope["category_evidence"]},
        "reviews_by_platform": per_platform(count),
        "products": per_platform(product_count),
        "writer_known": per_platform(known),
        "dated_reviews": per_platform(dated),
        "sources": {k: _count_or_no_data(n) for k, (_, n) in sources.items()},
        "appSnapshot": _snapshot_age(published_at),
        "labels": {"labelSource": LABEL_SOURCE, "codebook_version": version, "block_key": coded["block_key"],
                   "matchedReviews": len(app["matched"]), "unmatchedReviews": len(reviews) - len(app["matched"]),
                   "ambiguousReviews": app["ambiguous"], "codedReviews": coded["coded"],
                   "uncodedReviews": len(reviews) - coded["coded"], "otherBlockReviews": coded["other_block"],
                   "labelTextMismatch": text_mismatch, "starReviews": len(star_rows)},
    }


# ---------------------------------------------------------------------------
# code_reviews (retired: the app labels reviews) and the Jev path of the claim layer
# ---------------------------------------------------------------------------

@mcp.tool()
@_tool
def code_reviews(run_id: str, dry_run: bool = True, max_calls: int | None = None,
                 block_override: str | None = None) -> dict:
    """Retired (owner F361–F367): theme labels come from the app DB; build_warehouse reads them. Always returns
    LABELS_FROM_APP, opens nothing and calls nothing. The arguments stay so old clients get this error."""
    raise InsightError("LABELS_FROM_APP", "nhãn do app gán; MCP chỉ đọc")


def _wire_body(request: dict) -> dict:
    """The Jev wire form of one claim request (part 4): one choice question per claim question, each with the
    review as its state."""
    state = (f"Nền tảng: {request['platform']}. Sản phẩm: {request['product_name'] or 'không rõ'}. "
             f"Chủ đề: {request['theme_name']}. Danh mục ý con bản {request['catalogue_version']}. "
             f"Lời khách: {request['text']}")
    questions, states = {}, {}
    for question in request["questions"]:
        instructions = f"{question['code']} {question['name']}. Tính khi: {question['include']}."
        if question["exclude"]:
            instructions += f" Không tính khi: {question['exclude']}."
        questions[question["code"]] = {"type": "choice", "instructions": instructions,
                                       "criteria": {o["key"]: o["meaning"] for o in question["options"]}}
        states[question["code"]] = state
    return {"model": JEV_MODEL, "state": states, "questions": questions}


def _jev_transport(request: dict, api_key: str):
    """The only network path: POST one claim request to Jev. Returns (HTTP status, raw response bytes).
    Injectable: tests replace it with an offline fake."""
    http = urllib.request.Request(JEV_ENDPOINT, data=json.dumps(_wire_body(request)).encode("utf-8"), method="POST",
                                  headers={"Authorization": "Bearer " + api_key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(http, timeout=JEV_TIMEOUT_SECONDS) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, b""


class _CallFailed(Exception):
    def __init__(self, stop: str):
        super().__init__(stop)
        self.stop = stop


def _number(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def _read_key() -> str:
    path = Path(os.environ.get("INSIGHT_MCP_JEV_KEY_FILE") or DEFAULT_KEY_FILE).expanduser()
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if line.startswith("TYPESAFE_API_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if key:
                        return key
    except OSError:
        pass
    raise InsightError("JEV_KEY_MISSING", "the Jev key file is missing or has no TYPESAFE_API_KEY line")


# ---------------------------------------------------------------------------
# SLAYER and reference SQL
# ---------------------------------------------------------------------------

def _load_semantic_models(directory: Path | None = None) -> list[dict]:
    """Repo YAML models. A measure named like a column of its model is rejected."""
    import yaml
    directory = SEMANTIC_DIR if directory is None else directory
    models = []
    for path in sorted(Path(directory).glob("*.yaml")):
        model = yaml.safe_load(path.read_text(encoding="utf-8"))
        columns = {c["name"] for c in model.get("columns", [])}
        clash = [m["name"] for m in model.get("measures", []) if m.get("name") in columns]
        if clash:
            raise ValueError(f"model {model.get('name')}: measure named like a column (collision): {', '.join(clash)}")
        models.append(model)
    return models


class _Slayer:
    """A SLAYER engine whose storage and datasource live in a fresh temp dir, removed on close."""

    def __init__(self, warehouse: Path):
        self.dir = tempfile.mkdtemp(prefix="insight-slayer-")
        try:
            from slayer.async_utils import run_sync
            from slayer.core.models import DatasourceConfig, SlayerModel
            from slayer.engine.query_engine import SlayerQueryEngine
            from slayer.storage.yaml_storage import YAMLStorage
            storage = YAMLStorage(base_dir=os.path.join(self.dir, "store"))
            try:
                models = _load_semantic_models()
            except ValueError:
                raise InsightError("SEMANTIC_MODEL_INVALID", "a semantic model has a measure named like a column") from None

            async def setup():
                await storage.save_datasource(DatasourceConfig(name="warehouse", type="sqlite", database=str(warehouse)))
                for model in models:
                    await storage.save_model(SlayerModel(**model))
            run_sync(setup())
            self.engine = SlayerQueryEngine(storage=storage)
        except BaseException:
            self.close()
            raise

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def _slayer_query(slayer: _Slayer, model: str, measures: list[str], dimensions: list[str], filters: list[str]) -> list[dict]:
    from slayer.core.query import SlayerQuery
    response = slayer.engine.execute_sync(SlayerQuery(source_model=model, measures=list(measures),
                                                      dimensions=list(dimensions), filters=list(filters)))
    rows = response.data if hasattr(response, "data") else response
    return [{k.split(".", 1)[-1]: v for k, v in row.items()} for row in rows]


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _verified(slayer, warehouse, model, measures, dimensions, filters, sql, params) -> list[dict]:
    """Run one count through SLAYER and through its reference SQL; any difference is an error with no numbers."""
    try:
        slayer_rows = _slayer_query(slayer, model, measures, dimensions, filters)
    except Exception:  # noqa: BLE001 - SLAYER error text is not returned
        raise InsightError("SLAYER_FAILED", f"SLAYER could not compute {model}; no numbers returned") from None
    sql_rows = [dict(zip(dimensions + measures, row)) for row in warehouse.execute(sql, params).fetchall()]

    def key(rows):
        return sorted(tuple((k, None if row.get(k) is None else (row[k] if k in measures else str(row[k])))
                            for k in dimensions + measures) for row in rows)
    try:
        same = key(slayer_rows) == key(sql_rows)
    except (TypeError, ValueError):
        same = False
    if not same:
        raise InsightError("SLAYER_SQL_MISMATCH", f"SLAYER and the reference SQL disagree on {model}; no numbers returned")
    return [{k: (int(row[k]) if k in measures else row[k]) for k in dimensions + measures} for row in sql_rows]


# Reference SQL beside each fixed measure. Each is written against the base tables, not the views.
REF_THEME = """
SELECT r.platform, l.theme_code{pol_col}, COUNT(DISTINCT r.review_id), COUNT(DISTINCT r.writer_key),
       COUNT(DISTINCT r.product_key), SUM(1 - r.writer_known)
FROM label l
JOIN review r ON r.review_id = l.review_id
JOIN coding_state s ON s.review_id = l.review_id AND s.codebook_version = l.codebook_version
     AND s.block_norm = l.block_norm AND s.status = 'done'
JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
     AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
WHERE l.status = 'kept' AND l.codebook_version = ? AND l.block_norm = ? AND l.theme_code IN ({themes})
GROUP BY r.platform, l.theme_code{pol_col}
"""
REF_CODED = """
SELECT r.platform, COUNT(DISTINCT r.review_id)
FROM coding_state s
JOIN review r ON r.review_id = s.review_id
JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
     AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
WHERE s.status = 'done' AND s.codebook_version = ? AND s.block_norm = ?
GROUP BY r.platform
"""
REF_STAR = """
SELECT r.platform{product_col}, s.star_sentiment, COUNT(DISTINCT r.review_id), COUNT(DISTINCT r.writer_key),
       COUNT(DISTINCT r.product_key), SUM(1 - r.writer_known)
FROM review_star s JOIN review r ON r.review_id = s.review_id
GROUP BY r.platform{product_col}, s.star_sentiment
"""
REF_PORTRAIT = """
SELECT r.platform, p.dimension, p.grp, COUNT(DISTINCT r.review_id), COUNT(DISTINCT r.writer_key),
       COUNT(DISTINCT r.product_key), SUM(1 - r.writer_known)
FROM portrait_label p JOIN review r ON r.review_id = p.review_id
GROUP BY r.platform, p.dimension, p.grp
"""
REF_WRITER = """
SELECT r.platform, w.{dim}, COUNT(DISTINCT w.writer_key)
FROM writer_guess w JOIN review r ON r.writer_key = w.writer_key
GROUP BY r.platform, w.{dim}
"""
REF_KEYWORD = """
SELECT k.platform, g.group_key, COUNT(DISTINCT k.keyword)
FROM keyword k JOIN keyword_group g ON g.keyword = k.keyword
WHERE g.groups_version = ?
GROUP BY k.platform, g.group_key
"""


# ---------------------------------------------------------------------------
# Count IDs and threshold fields
# ---------------------------------------------------------------------------

def _state_sha(wh) -> str:
    content = wh.execute("SELECT content_sha256 FROM run_facts").fetchone()[0]
    labels = wh.execute("SELECT review_id, theme_code, codebook_version, block_norm, p_yes, polarity, status, step, "
                        "text_ref, text_start, text_end, text_sha256 FROM label ORDER BY 1, 2, 3, 4").fetchall()
    states = wh.execute("SELECT review_id, codebook_version, block_norm, input_sha256, status FROM coding_state "
                        "ORDER BY 1, 2, 3").fetchall()
    return _sha256(content + _canonical({"label": labels, "coding_state": states}))


def _count_id(run_id, tool, row_key, rules_version, numbers, state_sha) -> str:
    return "IMC-" + _sha256(_canonical({"run_id": run_id, "tool": tool, "row_key": row_key,
                                        "rules_version": rules_version, "numbers": numbers,
                                        "state_sha256": state_sha}))[:12]


def _require_app_labels(wh) -> None:
    """Only warehouses with the current app labels and product identity schema may be counted."""
    columns = {r[1] for r in wh.execute("PRAGMA table_info(review)")}
    if wh.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name IN ('review_star', 'app_snapshot')"
                  ).fetchone()[0] != 2 or "shop_key" not in columns:
        raise InsightError("WAREHOUSE_REBUILD_NEEDED", "this warehouse needs the current app labels and product schema; "
                           "call build_warehouse again")


def _stored_snapshot(wh) -> dict:
    """When the app published the snapshot this warehouse was built from. Count results stay repeatable, so the
    age is reported by build_warehouse (at read time), not here."""
    return {"publishedAt": wh.execute("SELECT published_at FROM app_snapshot").fetchone()[0]}


def _register(wh, run_id, tool, rules_version, rows, key_fields, number_fields) -> None:
    """Attach count IDs and store them in count_registry (insert if new; conflict is an error)."""
    state = _state_sha(wh)
    pending, seen = [], set()
    for row in rows:
        row_key = [row[k] for k in key_fields]
        numbers = {k: row[k] for k in number_fields if k in row}
        count_id = _count_id(run_id, tool, row_key, rules_version, numbers, state)
        if count_id in seen:
            raise InsightError("COUNT_ID_CONFLICT", "two rows in one response got the same count ID")
        seen.add(count_id)
        stored = wh.execute("SELECT numbers_json FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
        if stored is not None and stored[0] != _canonical(numbers):
            raise InsightError("COUNT_ID_CONFLICT", "a count ID is already stored with different numbers")
        pending.append((count_id, tool, _canonical(row_key), rules_version, _canonical(numbers), state))
        row["count_id"] = count_id
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with _tx(wh):
        wh.executemany("INSERT OR IGNORE INTO count_registry VALUES (?, ?, ?, ?, ?, ?, ?)",
                       [(*p, now) for p in pending])


def _review_threshold(reviews: int, writers: int, products: int, unknown: int) -> dict:
    """IMCP-O1: writers = distinct named writers + one per unnamed review; any unnamed review adds the note."""
    met = writers >= REVIEW_THRESHOLD_WRITERS and products >= REVIEW_THRESHOLD_PRODUCTS
    notes = []
    if not met:
        notes.append(NOTE_BELOW)
    if unknown > 0:
        notes.append(NOTE_NO_NAME)
    return {
        "reviews": reviews, "writers": writers, "products": products,
        "writer_basis": "review" if unknown > 0 else "writer", "threshold_count": writers, "threshold_met": met,
        "threshold_note": "; ".join(notes), "check2_missing": True,
        "check2_reason": "WRITER_UNKNOWN" if unknown > 0 else ("BELOW_THRESHOLD" if not met else "DIVERSITY_NOT_ASSESSED"),
    }


# ---------------------------------------------------------------------------
# theme_counts, keyword_counts, portrait_counts
# ---------------------------------------------------------------------------

@mcp.tool()
@_tool
def theme_counts(run_id: str, question: str | None = None) -> dict:
    """Theme counts per platform, theme and polarity from the app's labels (labelSource app_db), with R-I33
    thresholds and count IDs. With no labelled review the rows are empty and `note` is «chưa gán nhãn».
    `question` is an optional theme code filter."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    codes = _theme_codes(book)
    if question is not None and (not isinstance(question, str) or question not in codes):
        raise InsightError("INVALID_ARGUMENT", "question must be a theme code of the codebook")
    return _theme_counts_at(_find_warehouse(run_id), book, question)


def _theme_counts_at(path: Path, book: dict, question=None) -> dict:
    codes = _theme_codes(book)
    wh = _open_warehouse(path)
    try:
        _require_app_labels(wh)
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        version = book["version"]
        platforms = [r[0] for r in wh.execute("SELECT DISTINCT platform FROM review ORDER BY 1")]
        totals = dict(wh.execute("SELECT platform, COUNT(*) FROM review GROUP BY platform").fetchall())
        target = wh.execute("SELECT block_key FROM coding_target WHERE codebook_version = ? "
                            "ORDER BY target_id DESC LIMIT 1", (version,)).fetchone()
        base = {"run_id": full_id, "codebook_version": version, "codebook_status": book["status"],
                "labelSource": LABEL_SOURCE, "appSnapshot": _stored_snapshot(wh)}
        # Rows come only from the app's labels; with none, the result says so and never counts from elsewhere.
        # Coded and uncoded reviews are per platform (IM-Q26), never one total.
        not_labelled = {**base, "coding_target": None, "coded_reviews": {p: 0 for p in platforms},
                        "codedReviews": {p: 0 for p in platforms}, "uncodedReviews": totals,
                        "note": NOTE_NOT_LABELLED, "rows": []}
        if target is None:
            return not_labelled
        block_key = target[0]
        norm = _block_norm(block_key)
        allowed = sorted(codes) if question is None else [question]
        theme_list = ", ".join(_sql_literal(c) for c in allowed)
        target_filters = [f"codebook_version = {_sql_literal(version)}", f"block_norm = {_sql_literal(norm)}"]
        slayer = _Slayer(path)
        try:
            coded = _verified(slayer, wh, "coded_review", ["n_reviews"], ["platform"], target_filters,
                              REF_CODED, (version, norm))
            coded_reviews = {p: 0 for p in platforms}
            coded_reviews.update({row["platform"]: row["n_reviews"] for row in coded})
            if not any(coded_reviews.values()):
                return not_labelled
            measures = ["n_reviews", "n_writers", "n_products", "n_unknown_writer_labels"]
            # SLAYER does not parse a one-item IN list, so a single theme uses `=`.
            theme_filter = f"theme_code = {theme_list}" if len(allowed) == 1 else f"theme_code in ({theme_list})"
            filters = target_filters + [theme_filter]
            all_rows = _verified(slayer, wh, "theme_label", measures, ["platform", "theme_code"], filters,
                                 REF_THEME.format(pol_col="", themes=theme_list), (version, norm))
            pol_rows = _verified(slayer, wh, "theme_label", measures, ["platform", "theme_code", "polarity"], filters,
                                 REF_THEME.format(pol_col=", l.polarity", themes=theme_list), (version, norm))
        finally:
            slayer.close()
        approved = book["status"] == "APPROVED"
        rows = []
        for row in [{**r, "polarity": "all"} for r in all_rows] + pol_rows:
            rows.append({
                "platform": row["platform"], "theme_code": row["theme_code"], "theme_name": codes[row["theme_code"]],
                "polarity": row["polarity"], "step": STEP_AFTER_PURCHASE,
                **_review_threshold(row["n_reviews"], row["n_writers"], row["n_products"], row["n_unknown_writer_labels"]),
                "check3_missing": True,
                "check3_reason": "NO_HUMAN_SAMPLE_REVIEW" if approved else "CODEBOOK_NOT_APPROVED",
            })
        order = {"all": 0, "khen": 1, "che": 2, "ke": 3, "khong_ro_huong": 4}
        rows.sort(key=lambda r: (r["platform"], r["theme_code"], order[r["polarity"]]))
        _register(wh, full_id, "theme_counts", version, rows, ("platform", "theme_code", "polarity"),
                  ("reviews", "writers", "products", "threshold_count", "threshold_met", "check2_missing",
                   "check3_missing"))
        return {**base, "coding_target": {"codebook_version": version, "block_key": block_key},
                "coded_reviews": coded_reviews, "codedReviews": dict(coded_reviews),
                "uncodedReviews": {p: totals[p] - coded_reviews[p] for p in platforms}, "rows": rows}
    finally:
        wh.close()


@mcp.tool()
@_tool
def keyword_counts(run_id: str) -> dict:
    """Search-suggestion keywords per frozen keyword group (UNREVIEWED groups), with the 5-keyword threshold."""
    run_id = _check_run_id(run_id)
    groups = load_keyword_groups()
    return _keyword_counts_at(_find_warehouse(run_id), groups)


def _keyword_counts_at(path: Path, groups: dict) -> dict:
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        captured = wh.execute("SELECT captured FROM source_status WHERE source = 'keywords'").fetchone()
        base = {"run_id": full_id, "keyword_groups_version": groups["version"],
                "keyword_groups_status": groups["status"]}
        if not captured or not captured[0]:
            return {**base, "keywords": NO_DATA, "rows": [], "step_totals": NO_DATA}
        meta = {g["group_key"]: g for g in groups["groups"]}
        meta[groups["fallback"]["group_key"]] = groups["fallback"]
        assignments = []
        for (keyword,) in wh.execute("SELECT keyword FROM keyword ORDER BY keyword").fetchall():
            group = next((g["group_key"] for g, rx in groups["_compiled"] if rx.search(keyword)),
                         groups["fallback"]["group_key"])
            assignments.append((keyword, groups["version"], group))
        with _tx(wh):
            wh.execute("DELETE FROM keyword_group WHERE groups_version = ?", (groups["version"],))
            wh.executemany("INSERT INTO keyword_group VALUES (?, ?, ?)", assignments)
        slayer = _Slayer(path)
        try:
            counted = _verified(slayer, wh, "keyword_group", ["n_keywords"], ["platform", "group_key"],
                                [f"groups_version = {_sql_literal(groups['version'])}"], REF_KEYWORD,
                                (groups["version"],))
        finally:
            slayer.close()
        rows = []
        for row in sorted(counted, key=lambda r: list(meta).index(r["group_key"])):
            met = row["n_keywords"] >= KEYWORD_THRESHOLD
            rows.append({"platform": row["platform"], "group_key": row["group_key"],
                         "group_name": meta[row["group_key"]]["group_name"], "step": meta[row["group_key"]]["step"],
                         "keywords": row["n_keywords"], "threshold_met": met,
                         "threshold_note": "" if met else NOTE_BELOW})
        step_totals = {"Quan tâm": sum(r["keywords"] for r in rows if r["step"] == "Quan tâm")}
        _register(wh, full_id, "keyword_counts", groups["version"], rows, ("platform", "group_key"),
                  ("keywords", "threshold_met"))
        return {**base, "rows": rows, "step_totals": step_totals}
    finally:
        wh.close()


@mcp.tool()
@_tool
def portrait_counts(run_id: str) -> dict:
    """Customer portrait totals per platform: «Ai dùng», «Mua cho ai», and gender and age guesses from
    account names (Giả thuyết, at most Yếu). Totals only, never per person."""
    run_id = _check_run_id(run_id)
    return _portrait_counts_at(_find_warehouse(run_id))


def _portrait_counts_at(path: Path) -> dict:
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        platforms = [r[0] for r in wh.execute("SELECT DISTINCT platform FROM review ORDER BY 1")]
        slayer = _Slayer(path)
        try:
            groups = _verified(slayer, wh, "portrait_group",
                               ["n_reviews", "n_writers", "n_products", "n_unknown_writer_labels"],
                               ["platform", "dimension", "grp"], [], REF_PORTRAIT, ())
            gender = _verified(slayer, wh, "writer_guess", ["n_writers"], ["platform", "gender"], [],
                               REF_WRITER.format(dim="gender"), ())
            ages = _verified(slayer, wh, "writer_guess", ["n_writers"], ["platform", "age_band"], [],
                             REF_WRITER.format(dim="age_band"), ())
        finally:
            slayer.close()
        group_rows = []
        for row in groups:
            group_rows.append({"platform": row["platform"], "dimension": row["dimension"], "group": row["grp"],
                               **_review_threshold(row["n_reviews"], row["n_writers"], row["n_products"],
                                                   row["n_unknown_writer_labels"])})
        group_rows.sort(key=lambda r: (r["platform"], r["dimension"], -r["writers"], r["group"]))
        demo_rows = []
        for dimension, rows, field in (("Giới", gender, "gender"), ("Nhóm tuổi", ages, "age_band")):
            for row in rows:
                demo_rows.append({"platform": row["platform"], "dimension": dimension, "group": row[field],
                                  "writers": row["n_writers"], "label": "Giả thuyết", "max_confidence": "Yếu"})
        band_order = {b: i for i, b in enumerate(AGE_BANDS + (GENDER_UNKNOWN,))}
        demo_rows.sort(key=lambda r: (r["platform"], r["dimension"], band_order.get(r["group"], -1), r["group"]))
        _register(wh, full_id, "portrait_counts", PORTRAIT_RULES_VERSION, group_rows,
                  ("platform", "dimension", "group"),
                  ("reviews", "writers", "products", "threshold_count", "threshold_met", "check2_missing"))
        _register(wh, full_id, "portrait_counts", PORTRAIT_RULES_VERSION, demo_rows,
                  ("platform", "dimension", "group"), ("writers",))
        demographics = {}
        for platform in platforms:
            cells = {}
            for dimension in ("Giới", "Nhóm tuổi"):
                known = sum(r["writers"] for r in demo_rows if r["platform"] == platform and r["dimension"] == dimension)
                cells[dimension] = known or NO_DATA
            demographics[platform] = cells
        return {"run_id": full_id, "portrait_rules_version": PORTRAIT_RULES_VERSION,
                "rows": group_rows + demo_rows, "demographics": demographics}
    finally:
        wh.close()


@mcp.tool()
@_tool
def star_counts(run_id: str) -> dict:
    """Star sentiment of the run's reviews matched in the app DB, from the app view `review_star_sentiment`
    (1–3 sao tieu_cuc, 4–5 sao tich_cuc, khong_sao when there is no star), per platform and per product, with
    R-I33 thresholds and count IDs. Counts only: no ranking of brands or products by stars (IM-Q89)."""
    run_id = _check_run_id(run_id)
    return _star_counts_at(_find_warehouse(run_id))


def _star_counts_at(path: Path) -> dict:
    wh = _open_warehouse(path)
    try:
        _require_app_labels(wh)
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        total = wh.execute("SELECT COUNT(*) FROM review").fetchone()[0]
        matched = wh.execute("SELECT COUNT(*) FROM review_star").fetchone()[0]
        measures = ["n_reviews", "n_writers", "n_products", "n_unknown_writer_labels"]
        slayer = _Slayer(path)
        try:
            by_platform = _verified(slayer, wh, "star_review", measures, ["platform", "star_sentiment"], [],
                                    REF_STAR.format(product_col=""), ())
            by_product = _verified(slayer, wh, "star_review", measures, ["platform", "product_key", "star_sentiment"],
                                   [], REF_STAR.format(product_col=", r.product_key"), ())
        finally:
            slayer.close()
        # Products are shown as P1, P2… per platform (by product key) with their listing name; product keys
        # (shop and item IDs) stay in the warehouse, as in the claim layer.
        products = wh.execute("SELECT DISTINCT r.platform, r.product_key, p.product_name FROM review_star s "
                              "JOIN review r ON r.review_id = s.review_id "
                              "LEFT JOIN product p ON p.product_key = r.product_key ORDER BY 1, 2").fetchall()
        refs, names, seen = {}, {}, {}
        for platform, key, name in products:
            seen[platform] = seen.get(platform, 0) + 1
            refs[(platform, key)], names[(platform, key)] = f"P{seen[platform]}", name
        order = {k: i for i, k in enumerate(STAR_SENTIMENTS)}
        rows = []
        for row in [{**r, "product_key": None} for r in by_platform] + by_product:
            product = (row["platform"], row["product_key"])
            rows.append({"platform": row["platform"], "product": refs.get(product, "all"),
                         "product_name": names.get(product), "star_sentiment": row["star_sentiment"],
                         "step": STEP_AFTER_PURCHASE,
                         **_review_threshold(row["n_reviews"], row["n_writers"], row["n_products"],
                                             row["n_unknown_writer_labels"])})
        rows.sort(key=lambda r: (r["platform"], r["product"] != "all", len(r["product"]), r["product"],
                                 order[r["star_sentiment"]]))
        _register(wh, full_id, "star_counts", STAR_RULES_VERSION, rows, ("platform", "product", "star_sentiment"),
                  ("reviews", "writers", "products", "threshold_count", "threshold_met", "check2_missing"))
        return {"run_id": full_id, "source": LABEL_SOURCE, "star_rules_version": STAR_RULES_VERSION,
                "appSnapshot": _stored_snapshot(wh), "matchedReviews": matched, "unmatchedReviews": total - matched, "rows": rows}
    finally:
        wh.close()


# ---------------------------------------------------------------------------
# Part 2: hidden names and the report frame (R-IM07)
# ---------------------------------------------------------------------------

def hidden_name_hits(text) -> list[str]:
    """Hidden names and model IDs in one reader text, by the app's READER rule (R-L01)."""
    if not isinstance(text, str):
        return []
    hits = [name for name, pattern in zip(HIDDEN_NAMES, _HIDDEN_PATTERNS) if pattern.search(text)]
    hits += dict.fromkeys(m.group(0) for m in _MODEL_ID.finditer(text))
    return hits


def _int(value) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _text(value) -> bool:
    return isinstance(value, str) and bool(value.strip())


def _frame_invalid(message: str) -> InsightError:
    return InsightError("FRAME_INVALID", message)


def _check_frame_source(source, steps, seen: set) -> None:
    if not isinstance(source, dict) or not isinstance(source.get("key"), str) or not BLOCK_KEY_RE.match(source["key"]) \
            or source["key"] in seen:
        raise _frame_invalid("the frame source keys are missing, malformed or repeated")
    seen.add(source["key"])
    if not _text(source.get("name")) or source.get("step") not in steps:
        raise _frame_invalid("a frame source has no name or an unknown step")
    roles = source.get("roles")
    if not isinstance(roles, dict) or set(roles) != {"1", "2", "3", "4", "5"} \
            or not all(role is None or role in ROLES for role in roles.values()):
        raise _frame_invalid("a frame source must have a role (Chính, Phụ, Gợi ý or null) for each of the 5 questions")
    partial = source.get("partial_questions")
    if not isinstance(partial, list) or len(set(partial)) != len(partial) \
            or not all(_int(q) and 1 <= q <= 5 and roles[str(q)] == "Phụ" for q in partial):
        raise _frame_invalid("partial_questions must list questions where the source's role is Phụ")
    gate = source.get("usable_when")
    if gate is not None and not (
            isinstance(gate, dict) and set(gate) == {"revenue_share_platform", "min_percent"}
            and gate["revenue_share_platform"] in PLATFORMS and _number(gate["min_percent"])
            and 0 <= gate["min_percent"] <= 100):
        raise _frame_invalid("usable_when must name a review platform and a min_percent from 0 to 100")
    if not isinstance(source.get("warehouse_sources"), list) or not all(_text(w) for w in source["warehouse_sources"]):
        raise _frame_invalid("a frame source has malformed warehouse_sources")
    if not isinstance(source.get("count_tools"), list) or not all(t in COUNT_TOOLS for t in source["count_tools"]):
        raise _frame_invalid("a frame source names an unknown count tool")
    if source.get("note") is not None and not isinstance(source["note"], str):
        raise _frame_invalid("a frame source note is not text")


def _check_frame_part(part, index: int, data_parts: set) -> None:
    if not isinstance(part, dict) or not _int(part.get("part")) or part["part"] != index:
        raise _frame_invalid("the frame must have 18 parts numbered 1 to 18 in order")
    if not _text(part.get("title")) or part.get("kind") not in FRAME_KINDS:
        raise _frame_invalid(f"part {index} has no title or an unknown kind")
    question = part.get("question")
    if part["kind"] == "frame":
        if set(part) != {"part", "title", "kind"}:
            raise _frame_invalid(f"frame part {index} must have no question, tools or basis")
    elif part["kind"] == "data":
        if not (_int(question) and 1 <= question <= 5) or "basis_parts" in part:
            raise _frame_invalid(f"data part {index} must have a question from 1 to 5")
        if not isinstance(part.get("count_tools"), list) or not all(t in COUNT_TOOLS for t in part["count_tools"]):
            raise _frame_invalid(f"data part {index} names an unknown count tool")
    else:
        if "question" not in part or not (question is None or (_int(question) and 1 <= question <= 5)):
            raise _frame_invalid(f"synthesis part {index} must have a question from 1 to 5, or null")
        basis = part.get("basis_parts")
        if not isinstance(basis, list) or not basis or len(set(basis)) != len(basis) \
                or not all(_int(n) and n in data_parts for n in basis):
            raise _frame_invalid(f"synthesis part {index} must have basis_parts that are data parts")


def load_frame(path: Path | None = None) -> dict:
    """Load and check the 18-part report frame (IM-Q55). Any defect is FRAME_INVALID."""
    path = REPORT_FRAME_PATH if path is None else path
    try:
        frame = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        raise _frame_invalid("the report frame cannot be read as JSON") from None
    if not isinstance(frame, dict) or frame.get("contractVersion") != FRAME_CONTRACT_VERSION:
        raise _frame_invalid(f"the report frame is not {FRAME_CONTRACT_VERSION}")
    if not _text(frame.get("version")) or not _text(frame.get("status")):
        raise _frame_invalid("the report frame has no version or status")
    steps = frame.get("steps")
    if not isinstance(steps, list) or not steps or not all(_text(s) for s in steps) or len(set(steps)) != len(steps):
        raise _frame_invalid("the report frame steps are missing or repeated")
    questions = frame.get("questions")
    if not isinstance(questions, list) or len(questions) != 5 or not all(
            isinstance(q, dict) and _int(q.get("no")) and q["no"] == n and _text(q.get("text"))
            for n, q in enumerate(questions, 1)):
        raise _frame_invalid("the report frame must have 5 questions numbered 1 to 5")
    sources = frame.get("sources")
    if not isinstance(sources, list) or not sources:
        raise _frame_invalid("the report frame has no sources")
    seen = set()
    for source in sources:
        _check_frame_source(source, steps, seen)
    parts = frame.get("parts")
    if not isinstance(parts, list) or len(parts) != 18:
        raise _frame_invalid("the frame must have 18 parts numbered 1 to 18 in order")
    data_parts = {p.get("part") for p in parts if isinstance(p, dict) and p.get("kind") == "data"}
    for index, part in enumerate(parts, 1):
        _check_frame_part(part, index, data_parts)
    texts = [p["title"] for p in parts] + [q["text"] for q in questions] + [s["name"] for s in sources] \
        + [s["note"] for s in sources if s.get("note")]
    if any(hidden_name_hits(text) for text in texts):
        raise _frame_invalid("a frame text holds a hidden provider or tool name (R-L01)")
    frame["_parts"] = {p["part"]: p for p in parts}
    frame["_sources"] = {s["key"]: s for s in sources}
    frame["_questions"] = {q["no"]: q["text"] for q in questions}
    return frame


# ---------------------------------------------------------------------------
# Shared store (design decision 6): evidence from people, written only by the record_* functions
# ---------------------------------------------------------------------------

SHARED_SCHEMA = """
CREATE TABLE IF NOT EXISTS sample_review(rules_kind TEXT, rules_version TEXT, reviewed_by TEXT, reviewed_at TEXT,
  sample_size INTEGER, passed INTEGER);
CREATE TABLE IF NOT EXISTS method_ledger(method_key TEXT, subject_key TEXT, run_id TEXT, approved_by TEXT,
  approved_at TEXT);
CREATE TABLE IF NOT EXISTS diversity_check(count_id TEXT, brands INTEGER, checked_by TEXT, checked_at TEXT);
CREATE TABLE IF NOT EXISTS revenue_share(run_id TEXT, platform TEXT, share_percent REAL, recorded_by TEXT,
  recorded_at TEXT);
CREATE TABLE IF NOT EXISTS reason_check(run_id TEXT, review_id TEXT, theme_pair TEXT, text_sha256 TEXT, linked INTEGER,
  checked_by TEXT, checked_at TEXT);
"""


def _shared_store_path() -> Path:
    return _data_dir() / SHARED_STORE_NAME


def _iso(value) -> bool:
    if not _text(value):
        return False
    try:
        datetime.fromisoformat(value)
    except ValueError:
        return False
    return True


def _full_run_id(value) -> bool:
    return isinstance(value, str) and len(value) == 36 and RUN_ID_RE.match(value) is not None


def _method_key_ok(value) -> bool:
    """`<count tool>:<source>:<rules version>`, or the reason-link form
    `find_reason_links:<review source>:<codebook version>+<reason rules version>` (IM-Q124), or the claim form
    `claim_counts:<review source>:<codebook version>+<claim rules version>` (IM-Q160)."""
    parts = value.split(":", 2) if isinstance(value, str) else []
    if len(parts) != 3 or parts[1] not in COUNT_ROW_SOURCES or not _text(parts[2]):
        return False
    if parts[0] in COUNT_TOOLS:
        return True
    codebook, plus, rules = parts[2].partition("+")
    return parts[0] in (REASON_TOOL, CLAIM_TOOL) and parts[1] in REVIEW_SOURCES and bool(plus) and _text(codebook) \
        and _text(rules)


def _pair_ok(value) -> bool:
    codes = value.split("|") if isinstance(value, str) else []
    return len(codes) == 2 and all(THEME_CODE_RE.match(c) for c in codes) and codes[0] < codes[1]


def _signed(by, at) -> bool:
    return _text(by) and _iso(at)


@contextmanager
def _warehouse_ro(path: Path):
    """A read-only connection; the file is never created or changed."""
    con = sqlite3.connect("file:" + urllib.parse.quote(str(path)) + "?mode=ro", uri=True)
    try:
        yield con
    finally:
        con.close()


def _store_rows(con, table: str, columns: str) -> list[tuple]:
    try:
        return con.execute(f"SELECT {columns} FROM {table} ORDER BY rowid").fetchall()
    except sqlite3.DatabaseError:
        return []


def load_shared_store(run_id: str) -> dict:
    """The valid shared-store evidence for one run (IM-Q77 rules; invalid rows are ignored). Read-only; a missing
    store reads as empty and is not created. The latest valid row applies per key."""
    out = {"samples": set(), "ledger": {}, "diversity": {}, "revenue": {}, "reasons": {}}
    path = _shared_store_path()
    if not path.is_file():
        return out
    with _warehouse_ro(path) as con:
        for kind, version, by, at, size, passed in _store_rows(
                con, "sample_review", "rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, passed"):
            if kind in SAMPLE_RULES_KINDS and _text(version) and _signed(by, at) and _int(size) and size >= 1 \
                    and _int(passed) and passed == 1:
                out["samples"].add((kind, version))
        for key, subject, run, by, at in _store_rows(
                con, "method_ledger", "method_key, subject_key, run_id, approved_by, approved_at"):
            if _method_key_ok(key) and _text(subject) and _full_run_id(run) and _signed(by, at):
                out["ledger"].setdefault(key, set()).add(subject)
        for count_id, brands, by, at in _store_rows(con, "diversity_check", "count_id, brands, checked_by, checked_at"):
            if isinstance(count_id, str) and COUNT_ID_RE.match(count_id) and _int(brands) and brands >= 1 \
                    and _signed(by, at):
                out["diversity"][count_id] = brands
        for run, platform, share, by, at in _store_rows(
                con, "revenue_share", "run_id, platform, share_percent, recorded_by, recorded_at"):
            if run == run_id and platform in PLATFORMS and _number(share) and 0 <= share <= 100 and _signed(by, at):
                out["revenue"][platform] = share
        for run, review_id, pair, text_sha, linked, by, at in _store_rows(
                con, "reason_check", "run_id, review_id, theme_pair, text_sha256, linked, checked_by, checked_at"):
            if run == run_id and _text(review_id) and _pair_ok(pair) and isinstance(text_sha, str) \
                    and re.fullmatch(r"[0-9a-f]{64}", text_sha) and _int(linked) and linked in (0, 1) and _signed(by, at):
                out["reasons"][(review_id, pair, text_sha)] = linked
    return out


def _need(ok: bool, message: str) -> None:
    if not ok:
        raise ValueError(message)


def _need_signed(by_name: str, by, at_name: str, at) -> None:
    _need(_text(by), f"{by_name} must be a non-empty string")
    _need(_iso(at), f"{at_name} must be an ISO 8601 date or date-time")


def _writer_run(run_id) -> tuple[str, Path]:
    """Resolve a writer's run_id like the tools do; any failure is a ValueError."""
    try:
        path = _find_warehouse(_check_run_id(run_id))
    except InsightError as exc:
        raise ValueError(f"run_id cannot be used: {exc.code}") from None
    with _warehouse_ro(path) as wh:
        return wh.execute("SELECT run_id FROM run_facts").fetchone()[0], path


def _store_insert(table: str, values: tuple) -> None:
    path = _shared_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), isolation_level=None)
    try:
        with _tx(con):
            for statement in SHARED_SCHEMA.strip().split(";\n"):
                if statement.strip():
                    con.execute(statement)
            con.execute(f"INSERT INTO {table} VALUES ({', '.join('?' for _ in values)})", values)
    finally:
        con.close()


def record_sample_review(rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, passed) -> None:
    """An owner review of a sample of one automatic classification (check 3). Not an MCP tool."""
    _need(rules_kind in SAMPLE_RULES_KINDS, "rules_kind must be codebook, keyword_groups or portrait_rules")
    _need(_text(rules_version), "rules_version must be a non-empty string")
    _need_signed("reviewed_by", reviewed_by, "reviewed_at", reviewed_at)
    _need(_int(sample_size) and sample_size >= 1, "sample_size must be an integer of at least 1")
    _need(isinstance(passed, bool), "passed must be true or false")
    _store_insert("sample_review", (rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, int(passed)))


def record_method_approval(method_key, subject_key, run_id, approved_by, approved_at) -> None:
    """One owner-approved report that used a method on one researched product (check 4). Not an MCP tool."""
    _need(_method_key_ok(method_key), "method_key must be <count tool>:<source key>:<rules version>, "
                                      "find_reason_links:<review source>:<codebook version>+<reason rules version> or "
                                      "claim_counts:<review source>:<codebook version>+<claim rules version>")
    _need(_text(subject_key), "subject_key must be a non-empty string")
    _need_signed("approved_by", approved_by, "approved_at", approved_at)
    full_id, _ = _writer_run(run_id)
    _store_insert("method_ledger", (method_key, subject_key, full_id, approved_by, approved_at))


def record_diversity_check(count_id, brands, checked_by, checked_at) -> None:
    """A person counted the brands behind one count ID (check 2 diversity). Not an MCP tool."""
    _need(isinstance(count_id, str) and COUNT_ID_RE.match(count_id) is not None, "count_id must be IMC- and 12 hex")
    _need(_int(brands) and brands >= 1, "brands must be an integer of at least 1")
    _need_signed("checked_by", checked_by, "checked_at", checked_at)
    _store_insert("diversity_check", (count_id, brands, checked_by, checked_at))


def record_revenue_share(run_id, platform, share_percent, recorded_by, recorded_at) -> None:
    """A platform's share of the run's revenue, copied from the Market numbers (R-I34 gate). Not an MCP tool."""
    _need(platform in PLATFORMS, "platform must be shopee or tiktok_shop")
    _need(_number(share_percent) and 0 <= share_percent <= 100, "share_percent must be a number from 0 to 100")
    _need_signed("recorded_by", recorded_by, "recorded_at", recorded_at)
    full_id, _ = _writer_run(run_id)
    _store_insert("revenue_share", (full_id, platform, share_percent, recorded_by, recorded_at))


def record_reason_check(run_id, review_id, theme_a, theme_b, linked, checked_by, checked_at) -> None:
    """A person read one review on the host and judged whether the customer joins the two themes with a reason.
    The reading is bound to the sha256 of the review's current text. Not an MCP tool."""
    _need(_text(review_id), "review_id must be a non-empty string")
    _need(isinstance(linked, bool), "linked must be true or false")
    _need_signed("checked_by", checked_by, "checked_at", checked_at)
    try:
        pair = _theme_pair(load_codebook(), theme_a, theme_b)
    except InsightError as exc:
        raise ValueError(f"themes cannot be used: {exc.code}") from None
    full_id, path = _writer_run(run_id)
    with _warehouse_ro(path) as wh:
        row = wh.execute("SELECT text FROM review_text WHERE review_id = ?", (review_id,)).fetchone()
    _need(row is not None, "review_id is not a review of this run")
    _store_insert("reason_check", (full_id, review_id, pair, _sha256(row[0]), int(linked), checked_by, checked_at))


# ---------------------------------------------------------------------------
# Count rows and the 4 checks (R-IM08)
# ---------------------------------------------------------------------------

def _row_info(tool: str, row: dict, book: dict, groups: dict) -> dict:
    if tool == "keyword_counts":
        return {"count_id": row["count_id"], "tool": tool, "source": "search_suggestions", "platform": row["platform"],
                "step": row["step"], "kind": "keyword", "rules": ("keyword_groups", groups["version"]), "row": row}
    if tool == "theme_counts":
        kind, rules, step = "theme", ("codebook", book["version"]), row["step"]
    elif tool == "star_counts":
        kind, rules, step = "star", ("star_rules", STAR_RULES_VERSION), row["step"]
    else:
        kind = "portrait_guess" if row.get("label") == "Giả thuyết" else "portrait_group"
        rules, step = ("portrait_rules", PORTRAIT_RULES_VERSION), STEP_AFTER_PURCHASE
    return {"count_id": row["count_id"], "tool": tool, "source": row["platform"] + "_reviews",
            "platform": row["platform"], "step": step, "kind": kind, "rules": rules, "row": row}


def _count_responses(path: Path, book: dict, groups: dict) -> dict:
    """The three count tools' responses for the run now (same IDs, same registry rows), plus one row info per
    count row. `themes` is None when no review of the run is labelled; any count error is raised."""
    themes = _theme_counts_at(path, book)
    if not any(themes["codedReviews"].values()):
        themes = None
    keywords = _keyword_counts_at(path, groups)
    portraits = _portrait_counts_at(path)
    stars = _star_counts_at(path)
    infos = [_row_info(tool, row, book, groups) for tool, rows in
             (("theme_counts", themes["rows"] if themes else []), ("keyword_counts", keywords["rows"]),
              ("portrait_counts", portraits["rows"]), ("star_counts", stars["rows"]))
             for row in rows]
    return {"themes": themes, "keywords": keywords, "portraits": portraits, "stars": stars, "infos": infos}


def _count_rows(path: Path, book: dict, groups: dict) -> tuple[list[dict], bool]:
    """Every current count row of the run. The second value is false when no review of the run is labelled."""
    counted = _count_responses(path, book, groups)
    return counted["infos"], counted["themes"] is not None


def _revenue_gate(source: dict, store: dict):
    """None when the source may be used; otherwise the IM-Q75 reason."""
    gate = source.get("usable_when")
    if not gate:
        return None
    share = store["revenue"].get(gate["revenue_share_platform"])
    if share is None:
        return "REVENUE_SHARE_UNKNOWN"
    return "REVENUE_SHARE_BELOW_MIN" if share < gate["min_percent"] else None


def _codebook_approved(book: dict) -> bool:
    return book["status"] == "APPROVED" and _text(book.get("approvedBy")) and _text(book.get("approvedAt"))


def _rank(level: str) -> int:
    return LEVELS.index(level)


def _check(reason) -> dict:
    return {"missing": reason is not None, "reason": reason}


def _grade(ctx: dict, info: dict, part_no: int, hypothesis: bool) -> tuple[dict, bool]:
    """One evidence item graded by the 4 checks of R-I32 (IM-Q63 to IM-Q67, IM-Q75, IM-Q76).
    Returns the item and whether it is a hypothesis."""
    frame, store, row = ctx["frame"], ctx["store"], info["row"]
    question = frame["_parts"][part_no]["question"]
    source = frame["_sources"].get(info["source"])
    role = source["roles"][str(question)] if source else None
    partial = bool(source) and question in source["partial_questions"]
    blocked = None
    if role == "Chính":
        check1 = None
    elif role == "Phụ":
        check1 = "SECONDARY_SOURCE"
    elif role == "Gợi ý":
        check1, hypothesis = "HINT_ONLY", True
    else:
        check1 = blocked = "SOURCE_NOT_FOR_QUESTION"
    if blocked is None and source:
        blocked = _revenue_gate(source, store)

    if info["kind"] == "reason":
        check2 = "REASON_LINK_NO_THRESHOLD"
    elif info["kind"] == "portrait_guess":
        check2, hypothesis = "HYPOTHESIS_ROW", True
    elif info["kind"] != "keyword" and row["writer_basis"] == "review":
        check2 = "WRITER_UNKNOWN"
    elif not row["threshold_met"]:
        check2 = "BELOW_THRESHOLD"
    else:
        brands = store["diversity"].get(info["count_id"])
        check2 = "DIVERSITY_NOT_VERIFIED" if brands is None else ("ONE_BRAND" if brands < 2 else None)

    if info["kind"] in ("theme", "reason", "claim") and not _codebook_approved(ctx["book"]):
        check3 = "CODEBOOK_NOT_APPROVED"
    elif info["kind"] == "keyword" and ctx["groups"]["status"] != "APPROVED":
        check3 = "KEYWORD_GROUPS_NOT_APPROVED"
    else:
        check3 = None if info["rules"] in store["samples"] else "NO_OWNER_SAMPLE_REVIEW"

    if info["kind"] == "reason":
        method_key = f"{REASON_TOOL}:{info['source']}:{info['rules'][1]}+{REASON_RULES_VERSION}"
        if blocked is None and not row["reviews"]:
            blocked = "NO_LINKED_REVIEW"
    elif info["kind"] == "claim":
        method_key = f"{CLAIM_TOOL}:{info['source']}:{info['rules'][1]}+{CLAIM_RULES_VERSION}"
    else:
        method_key = f"{info['tool']}:{info['source']}:{info['rules'][1]}"
    products = len(store["ledger"].get(method_key, ()))
    check4 = None if products >= 3 else f"METHOD_ON_{products}_PRODUCTS"

    checks = {str(n): _check(reason) for n, reason in enumerate((check1, check2, check3, check4), 1)}
    missing = sum(c["missing"] for c in checks.values())
    if blocked:
        ceiling = "Không"
    else:
        ceiling = ("Chắc", "Khá", "Yếu")[min(missing, 2)]
        if (partial or hypothesis) and _rank(ceiling) > _rank("Yếu"):
            ceiling = "Yếu"
    item = {"count_id": info["count_id"], "part": part_no, "tool": info["tool"], "source": info["source"],
            "platform": info["platform"], "step": info["step"], "role": role, "partial": partial, "blocked": blocked,
            "checks": checks, "missing_count": missing, "ceiling": ceiling}
    if info["kind"] == "claim":
        # IM-Q138: a claim row of a DRAFT catalogue is capped at Yếu, after the four checks.
        item["catalogue_status"] = info["catalogue_status"]
        if info["catalogue_status"] != "PASSED" and _rank(ceiling) > _rank("Yếu"):
            item["ceiling"] = "Yếu"
    return item, hypothesis


# ---------------------------------------------------------------------------
# report_plan (R-IM07)
# ---------------------------------------------------------------------------

def _ordered_steps(frame: dict, steps) -> list[str]:
    steps = set(steps)
    return [s for s in frame["steps"] if s in steps] + sorted(steps - set(frame["steps"]))


def _percent(value) -> str:
    return str(int(value)) if float(value).is_integer() else str(value)


def _unanswered(part: dict, source: dict, cell: dict) -> dict:
    reason, name = cell["reason"], source["name"]
    platform = PLATFORM_NAMES.get((source.get("usable_when") or {}).get("revenue_share_platform"), "")
    why, needs = {
        "NOT_COLLECTED": ("Bản 1 chưa thu nguồn này", f"Thu {name} cho lần chạy"),
        "NOT_CAPTURED": ("Lần chạy chưa thu nguồn này", f"Thu {name} cho lần chạy"),
        "EMPTY_CAPTURE": ("Lần chạy có thu nhưng không có dòng nào", f"Thu {name} cho lần chạy"),
        "REVENUE_SHARE_UNKNOWN": (f"Chưa biết {platform} chiếm bao nhiêu doanh thu",
                                  f"Ghi tỉ lệ doanh thu {platform} cho lần chạy"),
        "REVENUE_SHARE_BELOW_MIN": (
            f"{platform} chiếm dưới {_percent((source.get('usable_when') or {}).get('min_percent', 0))}% doanh thu",
            None),
    }[reason]
    return {"part": part["part"], "source": source["key"], "unknown": f"Phần {part['part']} «{part['title']}»: {name}",
            "step": source["step"], "reason": reason, "why": why, "needs": needs}


def _plan_cell(ctx: dict, part: dict, source: dict, status: dict, infos: list[dict], theme_coded: bool) -> dict:
    cell = {"source": source["key"], "name": source["name"], "role": source["roles"][str(part["question"])],
            "partial": part["question"] in source["partial_questions"], "default_step": source["step"],
            "steps": [], "status": NO_DATA, "reason": None, "note": source.get("note"), "count_items": [],
            "count_ids": [], "ceiling": "Không"}
    captured = [status.get(w, (0, 0)) for w in source["warehouse_sources"]]
    if not source["warehouse_sources"]:
        cell["reason"] = "NOT_COLLECTED"
    elif not any(c for c, _ in captured):
        cell["reason"] = "NOT_CAPTURED"
    elif not any(c and n >= 1 for c, n in captured):
        cell["reason"] = "EMPTY_CAPTURE"
    elif _revenue_gate(source, ctx["store"]):
        cell["status"], cell["reason"] = STATUS_BLOCKED, _revenue_gate(source, ctx["store"])
    else:
        tools = [t for t in part["count_tools"] if t in source["count_tools"]]
        items = [i for t in tools for i in infos if i["tool"] == t and i["source"] == source["key"]]
        cell.update(status=STATUS_DATA, reason="NOT_CODED" if "theme_counts" in tools and not theme_coded else None,
                    count_items=[{"count_id": i["count_id"], "tool": i["tool"], "step": i["step"]} for i in items],
                    count_ids=[i["count_id"] for i in items], steps=_ordered_steps(ctx["frame"], [i["step"] for i in items]))
        levels = [_grade(ctx, i, part["part"], False)[0]["ceiling"] for i in items]
        cell["ceiling"] = max(levels, key=_rank, default="Không")
    return cell


@mcp.tool()
@_tool
def report_plan(run_id: str) -> dict:
    """The 18 report parts (R-I30) with question, steps, source roles (R-I34), usable count IDs, ceilings and the
    «Những gì báo cáo chưa trả lời được» lines (R-I37)."""
    run_id = _check_run_id(run_id)
    frame = load_frame()
    book, groups = load_codebook(), load_keyword_groups()
    return _plan(_find_warehouse(run_id), frame, book, groups)


def _plan(path: Path, frame: dict, book: dict, groups: dict, counted: dict | None = None) -> dict:
    """The report_plan result for one warehouse file (`render_report` passes its per-call copy)."""
    counted = _count_responses(path, book, groups) if counted is None else counted
    infos, theme_coded = counted["infos"], counted["themes"] is not None
    with _warehouse_ro(path) as wh:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        status = {s: (c, n) for s, c, n in wh.execute("SELECT source, captured, row_count FROM source_status")}
    ctx = {"frame": frame, "store": load_shared_store(full_id), "book": book, "groups": groups}
    parts, unanswered, ceilings = [], [], {}
    for part in frame["parts"]:
        question = part.get("question")
        out = {"part": part["part"], "title": part["title"], "question_no": question,
               "question": frame["_questions"].get(question), "kind": part["kind"]}
        if part["kind"] == "frame":
            out.update(label=LABEL_FRAME, steps=None, sources=[], ceiling=None)
        elif part["kind"] == "synthesis":
            out.update(label=None, steps=None, sources=[], ceiling=None, basis_parts=list(part["basis_parts"]))
        else:
            cells = []
            for source in frame["sources"]:
                if source["roles"][str(question)] is None:
                    continue
                cell = _plan_cell(ctx, part, source, status, infos, theme_coded)
                cells.append(cell)
                if cell["status"] != STATUS_DATA:
                    unanswered.append(_unanswered(part, source, cell))
            has_data = any(c["status"] == STATUS_DATA for c in cells)
            ceilings[part["part"]] = max((c["ceiling"] for c in cells), key=_rank, default="Không")
            out.update(label=None if has_data else NO_DATA,
                       steps=_ordered_steps(frame, [s for c in cells for s in c["steps"]]), sources=cells,
                       ceiling=ceilings[part["part"]])
        parts.append(out)
    for out in parts:
        if out["kind"] == "synthesis":
            out["potential_ceiling"] = max((ceilings[n] for n in out["basis_parts"]), key=_rank, default="Không")
    return {"run_id": full_id, "frame_version": frame["version"], "frame_status": frame["status"], "parts": parts,
            "unanswered": unanswered}


# ---------------------------------------------------------------------------
# confidence_ceiling (R-IM08)
# ---------------------------------------------------------------------------

class EvidenceItem(TypedDict):
    count_id: str
    part: NotRequired[int | None]


@contextmanager
def _warehouse_copy(path: Path):
    """A per-call byte copy of the warehouse, so recomputing the current count IDs writes nothing to the real file."""
    directory = Path(tempfile.mkdtemp(prefix="insight-ceiling-"))
    try:
        copy = directory / "warehouse.sqlite"
        _copy_bytes(path, copy)
        yield copy
    finally:
        shutil.rmtree(directory, ignore_errors=True)


def _evidence_items(frame: dict, part: int, evidence) -> list[tuple[str, int]]:
    spec = frame["_parts"][part]
    if not isinstance(evidence, list) or len(evidence) > MAX_EVIDENCE:
        raise InsightError("INVALID_ARGUMENT", f"evidence must be a list of at most {MAX_EVIDENCE} items")
    items = []
    for item in evidence:
        if not isinstance(item, dict) or not set(item) <= {"count_id", "part"} \
                or not isinstance(item.get("count_id"), str):
            raise InsightError("INVALID_ARGUMENT", "each evidence item is {count_id, part}")
        item_part = item.get("part")
        if item_part is not None and not _int(item_part):
            raise InsightError("INVALID_ARGUMENT", "an evidence item's part must be an integer or null")
        if spec["kind"] == "data":
            if item_part is not None and item_part != part:
                raise InsightError("INVALID_ARGUMENT", "an evidence item of a data part must have that part or null")
            item_part = part
        elif item_part not in spec["basis_parts"]:
            raise InsightError("INVALID_ARGUMENT", "an evidence item of a synthesis part must name one of its basis parts")
        items.append((item["count_id"], item_part))
    return items


def _reason_infos(copy: Path, book: dict, row_key: str, cache: dict) -> dict:
    """The current reason-link rows of a stored row key's pair, by count ID (computed once per pair and call)."""
    try:
        _, themes = json.loads(row_key)
        pair = _theme_pair(book, *themes)
    except (ValueError, TypeError, InsightError):
        return {}
    if pair not in cache:
        try:
            _, rows, _ = _reason_links_at(copy, book, pair)
        except InsightError as exc:
            if exc.code != "NOT_CODED":
                raise
            rows = []
        cache[pair] = {row["count_id"]: {
            "count_id": row["count_id"], "tool": REASON_TOOL, "source": row["platform"] + "_reviews",
            "platform": row["platform"], "step": STEP_AFTER_PURCHASE, "kind": "reason",
            "rules": ("codebook", book["version"]), "row": row, "themes": pair.split("|")} for row in rows}
    return cache[pair]


def _resolve_id(copy: Path, current: dict, count_id: str, book: dict, reasons: dict | None = None,
                claims: dict | None = None) -> dict:
    """The row info of a current count ID (PR 2 conventions). A reason-link ID is refused with INVALID_ARGUMENT
    unless a per-call `reasons` cache is given; then it is current when find_reason_links for its stored pair,
    run on the copy, returns it. A claim ID is current when claim_counts for its stored theme and catalogue
    version, run on the copy, returns it (IM-Q160); `claims` is the per-call cache of those results."""
    if count_id in current:
        return current[count_id]
    with _warehouse_ro(copy) as wh:
        stored = wh.execute("SELECT tool, row_key FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
    if stored is None:
        raise InsightError("COUNT_ID_UNKNOWN", "the count ID is not a count of this run")
    if stored[0] == CLAIM_TOOL:
        info = _claim_infos(copy, book, stored[1], {} if claims is None else claims).get(count_id)
        if info is not None:
            return info
    if stored[0] == REASON_TOOL:
        if reasons is None:
            raise InsightError("INVALID_ARGUMENT", "a reason-link ID is evidence for R-IM11, not a count")
        info = _reason_infos(copy, book, stored[1], reasons).get(count_id)
        if info is not None:
            return info
    raise InsightError("COUNT_ID_STALE", "the count ID is no longer current; call the count tool again")


@mcp.tool()
@_tool
def confidence_ceiling(run_id: str, part: int, evidence: list[EvidenceItem], hypothesis: bool = False) -> dict:
    """The highest confidence a claim in `part` may have, from the 4 checks of R-I32 on each cited count ID. A
    synthesis claim cites items of its basis parts and gets the lowest of their ceilings. Writes nothing."""
    run_id = _check_run_id(run_id)
    frame = load_frame()
    if not _int(part) or not 1 <= part <= 18:
        raise InsightError("INVALID_ARGUMENT", "part must be an integer from 1 to 18")
    if frame["_parts"][part]["kind"] == "frame":
        raise InsightError("INVALID_ARGUMENT", "frame parts (2, 3, 18) are not graded")
    if not isinstance(hypothesis, bool):
        raise InsightError("INVALID_ARGUMENT", "hypothesis must be true or false")
    items = _evidence_items(frame, part, evidence)
    book, groups = load_codebook(), load_keyword_groups()
    path = _find_warehouse(run_id)
    with _warehouse_copy(path) as copy:
        with _warehouse_ro(copy) as wh:
            full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        if not items:
            return {"run_id": full_id, "part": part, "hypothesis": hypothesis, "ceiling": "Không",
                    "reason": "NO_EVIDENCE", "items": []}
        infos, _ = _count_rows(copy, book, groups)
        current, claims_cache = {i["count_id"]: i for i in infos}, {}
        for count_id, _ in items:
            current[count_id] = _resolve_id(copy, current, count_id, book, claims=claims_cache)
    ctx = {"frame": frame, "store": load_shared_store(full_id), "book": book, "groups": groups}
    graded = [_grade(ctx, current[count_id], item_part, hypothesis) for count_id, item_part in items]
    return {"run_id": full_id, "part": part, "hypothesis": hypothesis or any(h for _, h in graded),
            "ceiling": min((g["ceiling"] for g, _ in graded), key=_rank), "reason": None,
            "items": [g for g, _ in graded]}


# ---------------------------------------------------------------------------
# find_reason_links and read_reviews (R-IM09)
# ---------------------------------------------------------------------------

REF_REASON = """
SELECT r.platform,
       CASE WHEN v.linked = 1 THEN 'linked' WHEN v.linked IS NULL THEN 'candidate' ELSE 'not_linked' END AS link_state,
       {select}
FROM label l1
JOIN label l2 ON l2.review_id = l1.review_id AND l2.codebook_version = l1.codebook_version
     AND l2.block_norm = l1.block_norm AND l2.status = 'kept'
JOIN review r ON r.review_id = l1.review_id
JOIN coding_state s ON s.review_id = l1.review_id AND s.codebook_version = l1.codebook_version
     AND s.block_norm = l1.block_norm AND s.status = 'done'
JOIN review_input i ON i.review_id = s.review_id AND i.codebook_version = s.codebook_version
     AND i.block_norm = s.block_norm AND i.input_sha256 = s.input_sha256
JOIN reason_flag f ON f.review_id = r.review_id
LEFT JOIN reason_verdict v ON v.review_id = r.review_id AND v.theme_pair = ?
WHERE l1.status = 'kept' AND l1.codebook_version = ? AND l1.block_norm = ? AND l1.theme_code = ? AND l2.theme_code = ?
      AND f.rules_version = ?
{tail}
"""


def _theme_pair(book: dict, theme_a, theme_b) -> str:
    codes = _theme_codes(book)
    if not isinstance(theme_a, str) or not isinstance(theme_b, str) or theme_a not in codes or theme_b not in codes \
            or theme_a == theme_b:
        raise InsightError("INVALID_ARGUMENT", "theme_a and theme_b must be two different theme codes of the codebook")
    return "|".join(sorted((theme_a, theme_b)))


@mcp.tool()
@_tool
def find_reason_links(run_id: str, theme_a: str, theme_b: str) -> dict:
    """Per platform, the reviews where a person checked that the customer joins the two themes with a reason
    (R-IM09, R-I39). Reviews with both labels and a reason word but no reading are candidates: not counted."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    pair = _theme_pair(book, theme_a, theme_b)
    full_id, rows, candidates = _reason_links_at(_find_warehouse(run_id), book, pair)
    return {"run_id": full_id, "theme_a": theme_a, "theme_b": theme_b, "connectors": list(REASON_CONNECTORS),
            "link_basis": LINK_BASIS, "rules_version": REASON_RULES_VERSION, "rows": rows, "candidates": candidates}


def _reason_links_at(path: Path, book: dict, pair: str) -> tuple[str, list[dict], list[dict]]:
    """Reason-link rows and candidates of one sorted pair, registered in this warehouse file's count_registry."""
    low, high = pair.split("|")
    wh = _open_warehouse(path)
    try:
        _require_app_labels(wh)
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        target = wh.execute("SELECT block_key FROM coding_target ORDER BY target_id DESC LIMIT 1").fetchone()
        if target is None:
            raise InsightError("NOT_CODED", "no review of this run is coded yet")
        version, norm = book["version"], _block_norm(target[0])
        texts = wh.execute("SELECT review_id, text FROM review_text ORDER BY review_id").fetchall()
        flags = [(review_id, REASON_RULES_VERSION) for review_id, text in texts if REASON_RE.search(_nz(text))]
        current_sha = {review_id: _sha256(text) for review_id, text in texts}
        verdicts = sorted((review_id, theme_pair, linked) for (review_id, theme_pair, text_sha), linked
                          in load_shared_store(full_id)["reasons"].items() if current_sha.get(review_id) == text_sha)
        with _tx(wh):
            for statement in REASON_SCHEMA.strip().split(";\n"):
                if statement.strip():
                    wh.execute(statement)
            wh.execute("DELETE FROM reason_flag")
            wh.executemany("INSERT INTO reason_flag VALUES (?, ?)", flags)
            wh.execute("DELETE FROM reason_verdict")
            wh.executemany("INSERT INTO reason_verdict VALUES (?, ?, ?)", verdicts)
        params = (pair, version, norm, low, high, REASON_RULES_VERSION)
        filters = [f"codebook_version = {_sql_literal(version)}", f"block_norm = {_sql_literal(norm)}",
                   f"theme_lo = {_sql_literal(low)}", f"theme_hi = {_sql_literal(high)}",
                   f"rules_version = {_sql_literal(REASON_RULES_VERSION)}"]
        slayer = _Slayer(path)
        try:
            counted = _verified(slayer, wh, "reason_link", ["n_reviews"], ["platform", "link_state"], filters,
                                REF_REASON.format(select="COUNT(DISTINCT r.review_id)", tail="GROUP BY 1, 2"), params)
        finally:
            slayer.close()
        listed = wh.execute(REF_REASON.format(select="r.review_id", tail="ORDER BY 1, 2, 3"), params).fetchall()
        platforms = [r[0] for r in wh.execute("SELECT DISTINCT platform FROM review ORDER BY 1")]
        totals = {(row["platform"], row["link_state"]): row["n_reviews"] for row in counted}
        rows, candidates = [], []
        for platform in platforms:
            ids = {state: sorted({rid for p, s, rid in listed if p == platform and s == state})
                   for state in ("linked", "candidate")}
            if any(len(ids[state]) != totals.get((platform, state), 0) for state in ids):
                raise InsightError("SLAYER_SQL_MISMATCH", "SLAYER and the reference SQL disagree on reason_link")
            rows.append({"platform": platform, "theme_pair": [low, high], "reviews": len(ids["linked"]),
                         "review_ids": ids["linked"]})
            candidates.append({"platform": platform, "review_ids": ids["candidate"]})
        _register(wh, full_id, "find_reason_links", f"{REASON_RULES_VERSION}+{version}", rows,
                  ("platform", "theme_pair"), ("reviews", "review_ids"))
        for row in rows:
            del row["theme_pair"]
        return full_id, rows, candidates
    finally:
        wh.close()


@mcp.tool()
@_tool
def read_reviews(run_id: str, ids: list[str]) -> dict:
    """The stored text of 1 to 20 reviews, for reading on the host only (R-IM09). Never put it in a report (R-I11)."""
    run_id = _check_run_id(run_id)
    if not isinstance(ids, list) or not ids or not all(isinstance(i, str) for i in ids):
        raise InsightError("INVALID_ARGUMENT", "ids must be a non-empty list of review IDs")
    unique = list(dict.fromkeys(ids))
    if len(unique) > MAX_READ_REVIEWS:
        raise InsightError("INVALID_ARGUMENT", f"at most {MAX_READ_REVIEWS} distinct review IDs per call")
    path = _find_warehouse(run_id)
    reviews, not_found = [], []
    with _warehouse_ro(path) as wh:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        for review_id in unique:
            row = wh.execute("SELECT r.platform, t.text FROM review r JOIN review_text t ON t.review_id = r.review_id "
                             "WHERE r.review_id = ?", (review_id,)).fetchone()
            if row is None:
                not_found.append(review_id)
            else:
                reviews.append({"review_id": review_id, "platform": row[0], "text": row[1]})
    return {"run_id": full_id, "reviews": reviews, "not_found": not_found, "notice": READ_NOTICE}


# ---------------------------------------------------------------------------
# Part 3: frozen wording and the text rules (R-IM10, R-IM11; CONTRACT.md PR 3 conventions)
# ---------------------------------------------------------------------------

REPORT_STORE_NAME = "insight-report.sqlite"
REPORT_FILES = ("report.html", "themes.json", "keywords.json", "portraits.json", "parts.json")
STEPS = ("Biết đến", "Quan tâm", "Muốn mua", "Mua", "Sau mua", "Chưa rõ bước")
STATEMENT_STEPS = STEPS[:5]
PURCHASE_STAGES = dict(zip(STATEMENT_STEPS, ("AWARENESS", "INTEREST", "DESIRE", "PURCHASE", "POST_PURCHASE")))
APP_LEVELS = {"Chắc": "CERTAIN", "Khá": "FAIR", "Yếu": "WEAK", "Không": "NONE"}
APP_PLATFORMS = {"shopee": "shopee", "tiktok_shop": "tiktok"}
STATEMENT_CONTRACT_VERSION = "1.0.0"
MAX_SECTION_CHARS = 20000
MAX_CLAIMS = 50
MAX_FIELD_CHARS = 2000
MAX_NOTE_CHARS = 500
MAX_WHY_LAYER = 10
QUOTE_WORDS = 8
SCOPE_PARTS = (2, 3)
REASON_PART = 8
APPENDIX_PART = 18
CLAIM_KEYS = frozenset({"ref", "evidence", "confidence", "step", "hypothesis", "conclusion"})
STATEMENT_KEYS = frozenset({"step", "customer", "hidden_truth", "motivation", "conflict", "insight", "three_c",
                            "evidence", "confidence"})
LINE_KEYS = frozenset({"supports", "layer", "themes", "platform", "count_id", "part", "note"})
THREE_C_KEYS = ("customer", "brand", "category")
TEXT_FIELDS = ("customer", "hidden_truth", "motivation", "conflict", "insight")
SIDES = ("hidden_truth", "motivation", "conflict")
SUPPORTS = SIDES + ("why",)
# R-I39: the four kinds of motive and barrier, frozen here; a new codebook version does not change them.
KEPT_KINDS = {"công dụng": "T-CONGDUNG", "giá": "T-GIA", "quy cách": "T-QUYCACH", "chất lượng": "T-CHATLUONG"}
NUMBER_KEYS = ("reviews", "writers", "products", "keywords", "threshold_count")
REVIEW_KINDS = ("theme", "portrait_group", "reason", "claim")
STATUS_WRITTEN, STATUS_MISSING, STATUS_RESUBMIT, STATUS_BUILT = "Đã viết", "Chưa viết", "Cần gửi lại", "Tự dựng"
MARK_STALE = "Cần gửi lại: số liệu đã đổi"
LABEL_HYPOTHESIS = "Giả thuyết"
PORTRAIT_DIMENSIONS = ("ai dùng", "mua cho ai", "giới tính", "tuổi")
NO_DATA_EXTRA_TOPICS = ("người mua thật", "lý do mua", "doanh thu", "thị phần")

UNIT_WORDS = {"đánh giá": "reviews", "người viết": "writers", "sản phẩm": "products", "từ khóa": "keywords",
              "từ khoá": "keywords"}
NUMBER_WORDS = ("một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín", "mười", "mươi", "chục", "trăm",
                "nghìn", "ngàn")
CODED_WORDS = ("mã hóa", "mã hoá", "gắn nhãn")
SCOPE_NEGATIONS = ("không", "chưa", "chẳng", "chả")
CONVERSION_PHRASES = ("chuyển đổi", "conversion", "tỷ lệ chuyển", "tỉ lệ chuyển")
CONVERSION_STEPS = ("biết đến", "quan tâm", "muốn mua", "mua", "sau mua")
MARKET_TERMS = ("doanh thu", "doanh số", "thị phần", "gmv", "revenue", "market share")
CURRENCY_SCALES = ("k", "nghìn", "ngàn", "triệu", "tr", "tỷ", "tỉ")
CURRENCY_UNITS = ("đ", "₫", "vnđ", "vnd", "đồng")
STAR_PHRASES = ("số sao", "điểm sao", "sao trung bình", "điểm đánh giá", "rating", "★", "⭐")
RANK_TERMS = ("xếp hạng", "hạng", "cao hơn", "thấp hơn", "tốt hơn", "kém hơn", "hơn", "đứng đầu", "dẫn đầu", "top",
              "nhất")
BUYER_TERMS = ("người mua", "buyer", "buyers")
FIRST_PERSON = ("tôi", "mình", "tớ", "tao", "chúng tôi", "chúng mình", "chúng ta", "bọn mình", "bọn tôi", "i", "me",
                "my", "we", "our")
BANNED_IDEAS = {
    "campaign": ("chiến dịch", "ý tưởng quảng cáo", "quảng cáo cảm xúc", "insight cảm xúc", "campaign"),
    "competitor": ("đối thủ nên", "khuyên đối thủ", "gợi ý cho đối thủ", "lời khuyên cho đối thủ"),
    "trial_order": ("đơn thử", "đặt thử", "đặt hàng thử", "mua thử để"),
}
BUYING_REASON = ("lý do chọn", "lý do mua", "vì sao chọn", "vì sao mua", "tại sao chọn", "tại sao mua", "chọn vì",
                 "mua vì", "quyết định mua")
RETOLD_NOTE = "kể lại"
SHORT_CHAIN_NOTE = "chưa đủ bằng chứng"
NO_DATA_NOTE = "chưa có dữ liệu"
DENIAL_SUBJECTS = ("báo cáo", "báo cáo này", "phần này", "số liệu", "dữ liệu")
DENIAL_LINKS = ("tính", "đưa", "ra", "nêu", "có", "dùng", "làm", "đề", "xuất", "gợi", "ý", "đo", "so", "sánh")
DENIAL_STOP = ("nhưng", "mà", "và", "còn", "thì", "rồi", "nên", "hãy", "cần", "vẫn")

SECTION_CODES = ("NUMBER_MISMATCH", "CONFIDENCE_ABOVE_CEILING", "BELOW_THRESHOLD_CONCLUSION", "VERBATIM_QUOTE",
                 "CONVERSION_RATE", "MARKET_NUMBER", "HIDDEN_NAME", "BUYER_WORD", "STEP_NOT_FROM_EVIDENCE",
                 "RETOLD_NOT_MARKED", "UNSUPPORTED_SENTENCE", "BANNED_IDEA", "CLAIM_RANK_UNSCOPED", "CLAIM_FLAG_MISSING")
STATEMENT_CODES = ("NO_EVIDENCE", "NO_CONFLICT", "HYPOTHESIS_REQUIRED", "BELOW_THRESHOLD_CONCLUSION",
                   "WHY_LAYER_WITHOUT_EVIDENCE", "WHY_LAYER_WRONG_PAIR", "WHY_LAYER_UNEXPLAINED",
                   "WHY_CHAIN_SHORT_UNMARKED", "FIRST_PERSON", "MIXED_STEPS", "PLATFORM_MISMATCH",
                   "NOT_CUSTOMER_WORDS", "MOTIVE_KIND_NOT_KEPT", "RETOLD_NOT_MARKED", "BANNED_IDEA",
                   "CONFIDENCE_ABOVE_CEILING", "NUMBER_MISMATCH", "VERBATIM_QUOTE", "CONVERSION_RATE",
                   "MARKET_NUMBER", "HIDDEN_NAME", "BUYER_WORD")


def _alts(phrases) -> str:
    """One regex alternation of frozen phrases after nz, longest first; a space matches any run of spaces."""
    items = sorted({_nz(p) for p in phrases}, key=len, reverse=True)
    return "|".join(re.escape(p).replace(r"\ ", r"\s+") for p in items)


def _phrase_re(phrases) -> re.Pattern:
    """Whole phrase: no letter, digit or `_` right before or after it."""
    return re.compile(r"(?<!\w)(?:" + _alts(phrases) + r")(?!\w)")


_NUM = r"(?<![\w-])[0-9]+(?:[.,][0-9]+)*"
MARKER_RE = re.compile(r"\[\^([a-z0-9][a-z0-9_-]{0,15})\]")
MARKER_ANY_CASE_RE = re.compile(r"\[\^([A-Za-z0-9][A-Za-z0-9_-]{0,15})\]")
REF_RE = re.compile(r"[a-z0-9][a-z0-9_-]{0,15}")
HEADING_RE = re.compile(r"#{1,3}\s(.+)")
SENTENCE_END_RE = re.compile(r"(?<=[.!?…])(?=\s|$)")
CLAUSE_CUT_RE = re.compile(r";|,(?![0-9])|(?<![0-9]),|:(?![0-9])|(?<![0-9]):")
WORD_RE = re.compile(r"[^\W_]+")
NUMBER_GROUP_RE = re.compile(_NUM + r"(?:/[0-9]+(?:[.,][0-9]+)*)*")
DOTTED_INTEGER_RE = re.compile(r"[0-9]{1,3}(?:\.[0-9]{3})+")
REFERENCE_BEFORE_RE = re.compile(r"(?<!\w)(?:phần|câu|tầng)\s*$")
# «phần» of the Market term «thị phần» is not a reference word, so «Thị phần 35%» keeps its number (IM-Q89).
MARKET_SHARE_BEFORE_RE = re.compile(r"(?<!\w)thị\s+phần\s*$")
UNIT_KEYS = {_nz(k): v for k, v in UNIT_WORDS.items()}
UNIT_AFTER_RE = re.compile(r"\s*(?:(?P<unit>" + _alts(UNIT_WORDS) + r")(?!\w)|(?P<percent>%|phần\s+trăm(?!\w)))")
# PR 4 (IM-Q159): in parts 1 and 4 to 17 only, «bằng chứng» and «gian hàng» are units too.
CLAIM_UNIT_WORDS = {**UNIT_WORDS, "bằng chứng": "evidence", "gian hàng": "shops"}
CLAIM_UNIT_KEYS = {_nz(k): v for k, v in CLAIM_UNIT_WORDS.items()}
CLAIM_UNIT_AFTER_RE = re.compile(r"\s*(?:(?P<unit>" + _alts(CLAIM_UNIT_WORDS) + r")(?!\w)|(?P<percent>%|phần\s+trăm(?!\w)))")
DATE_PIECES_RE = (re.compile(r"[0-9]{1,2}"), re.compile(r"[0-9]{1,2}"), re.compile(r"[0-9]{4}"))
NUMBER_WORD_RE = re.compile(r"(?<!\w)(?:" + _alts(NUMBER_WORDS) + r")\s*(?:" + _alts(UNIT_WORDS) + r")(?!\w)")
PLATFORM_RE = re.compile(r"(?<!\w)(shopee|tiktok\s+shop)(?!\w)")
CODED_RE = _phrase_re(CODED_WORDS)
SCOPE_NEGATION_RE = _phrase_re(SCOPE_NEGATIONS)
CONVERSION_RE = _phrase_re(CONVERSION_PHRASES)
STEP_PAIR_RE = re.compile(r"(?<!\w)từ\s+(" + _alts(CONVERSION_STEPS) + r")\s+(?:sang|đến|tới)\s+("
                          + _alts(CONVERSION_STEPS) + r")(?!\w)")
MARKET_RE = _phrase_re(MARKET_TERMS)
CURRENCY_RE = re.compile(_NUM + r"(?:\s*(?:(?:" + _alts(CURRENCY_SCALES) + r")\s*)?(?:" + _alts(CURRENCY_UNITS)
                         + r")(?!\w)|k(?!\w))")
STAR_RE = _phrase_re(STAR_PHRASES)
STAR_NUMBER_RE = re.compile(_NUM + r"\s*(?:sao(?!\w)|★|⭐)")
RANK_RE = _phrase_re(RANK_TERMS)
BUYER_RE = _phrase_re(BUYER_TERMS)
FIRST_PERSON_RE = _phrase_re(FIRST_PERSON)
BANNED_RES = {kind: _phrase_re(phrases) for kind, phrases in BANNED_IDEAS.items()}
BUYING_REASON_RE = _phrase_re(BUYING_REASON)
RETOLD_RE = _phrase_re((RETOLD_NOTE,))
SHORT_CHAIN_RE = _phrase_re((SHORT_CHAIN_NOTE,))
BELOW_RE = _phrase_re((NOTE_BELOW,))
NEGATION_RE = _phrase_re(("không", "chưa"))
DENIAL_STOP_RE = _phrase_re(DENIAL_STOP)
DENIAL_PREFIX_RE = re.compile(r"\W*(?:" + _alts(DENIAL_SUBJECTS) + r")\s+(?:không|chưa)(?:\s+(?:"
                              + _alts(DENIAL_LINKS) + r")){0,2}\s+")


def _now() -> datetime:
    """The only clock of the part 3 tools (UTC). It is written only into submitted_at and rendered_at."""
    return datetime.now(timezone.utc)


def _stamp() -> str:
    moment = _now()
    return moment.isoformat() if isinstance(moment, datetime) else str(moment)


def _strip_markers(text: str) -> tuple[str, list[tuple[int, str]]]:
    """The text without markers, and each marker's ref with its position in that text."""
    plain, marks, last, length = [], [], 0, 0
    for match in MARKER_RE.finditer(text):
        plain.append(text[last:match.start()])
        length += match.start() - last
        marks.append((length, match.group(1)))
        last = match.end()
    plain.append(text[last:])
    return "".join(plain), marks


def _value(token: str):
    """The integer value of a number token, or None when it is not an integer (`6,5`)."""
    if DOTTED_INTEGER_RE.fullmatch(token):
        return int(token.replace(".", ""))
    return None if "." in token or "," in token else int(token)


def _date_of(pieces: list[str]):
    """The ISO date of a `d/m/yyyy` group (day and month with or without a leading zero), or None."""
    if len(pieces) != 3 or not all(rx.fullmatch(p) for rx, p in zip(DATE_PIECES_RE, pieces)):
        return None
    try:
        return datetime(int(pieces[2]), int(pieces[1]), int(pieces[0])).date().isoformat()
    except ValueError:
        return None


def _numbers(text: str, claim_units: bool = False) -> list[dict]:
    """Number tokens and fractions (PR 3 conventions) of a marker-free nz text; references («Phần 8») are left out.
    A date (three or more tokens joined by `/`) gives one token per piece, with no unit; a `d/m/yyyy` date's pieces
    carry its ISO `date`. `claim_units` adds the PR 4 units of parts 1 and 4 to 17 (IM-Q159)."""
    out = []
    unit_after, unit_keys = (CLAIM_UNIT_AFTER_RE, CLAIM_UNIT_KEYS) if claim_units else (UNIT_AFTER_RE, UNIT_KEYS)
    for match in NUMBER_GROUP_RE.finditer(text):
        before = text[:match.start()]
        if REFERENCE_BEFORE_RE.search(before) and not MARKET_SHARE_BEFORE_RE.search(before):
            continue
        pieces = match.group().split("/")
        unit = None
        after = unit_after.match(text, match.end())
        if after and len(pieces) <= 2:
            unit = "percent" if after.group("percent") else unit_keys[re.sub(r"\s+", " ", after.group("unit"))]
        base = {"start": match.start(), "end": match.end(), "raw": match.group()}
        if len(pieces) == 1:
            out.append({**base, "kind": "token", "values": [_value(pieces[0])], "unit": unit})
        elif len(pieces) == 2:
            out.append({**base, "kind": "fraction", "values": [_value(p) for p in pieces], "unit": unit})
        else:
            date = _date_of(pieces)
            out.extend({**base, "kind": "token", "values": [_value(p)], "unit": None, "date": date} for p in pieces)
    return out


def _units(text: str, titles=frozenset()) -> list[dict]:
    """Headings and sentences of an nz text (PR 3 conventions). Sentences are numbered from 0."""
    units, index = [], 0
    for line in _nz(text).splitlines():
        line = line.strip()
        if not line:
            continue
        heading = HEADING_RE.fullmatch(line)
        if heading and not MARKER_RE.search(line) and not _numbers(line) and heading.group(1).strip() in titles:
            units.append({"kind": "heading"})
            continue
        for piece in SENTENCE_END_RE.split(line):
            piece = piece.strip()
            if piece:
                plain, marks = _strip_markers(piece)
                units.append({"kind": "sentence", "index": index, "text": plain, "markers": marks})
                index += 1
    return units


def _sentences(text: str, titles=frozenset()) -> list[dict]:
    return [u for u in _units(text, titles) if u["kind"] == "sentence"]


def _words(text: str) -> tuple:
    return tuple(WORD_RE.findall(_strip_markers(_nz(text))[0]))


def _platforms(text: str) -> set:
    return {"shopee" if m.group(1) == "shopee" else "tiktok_shop" for m in PLATFORM_RE.finditer(text)}


def _structural_titles(frame: dict, book: dict, groups: dict, part: int) -> frozenset:
    titles = [frame["_parts"][part]["title"], *STEPS, "shopee", "tiktok shop",
              *(s["name"] for s in frame["sources"]), *_theme_codes(book).values(),
              *(g["group_name"] for g in groups["groups"]), groups["fallback"]["group_name"]]
    return frozenset(_nz(t).strip() for t in titles)


def _no_data_re(frame: dict, book: dict, groups: dict) -> re.Pattern:
    """The complete missing-data sentence with a topic from the closed NO_DATA_TOPICS table (IM-Q120)."""
    topics = [p["title"] for p in frame["parts"]] + list(STEPS) + [s["name"] for s in frame["sources"]] \
        + list(_theme_codes(book).values()) + [g["group_name"] for g in groups["groups"]] \
        + [groups["fallback"]["group_name"]] + list(PORTRAIT_DIMENSIONS) + list(NO_DATA_EXTRA_TOPICS)
    topic = "|".join(re.escape(t) for t in sorted({_nz(t) for t in topics}, key=len, reverse=True))
    return re.compile(re.escape(NO_DATA_NOTE) + r"(?: (?:về|cho) (?:" + topic + r"))?(?: (?:trên|ở) (?:shopee|tiktok shop))?"
                      r"[.!…]?")


# ---------------------------------------------------------------------------
# Part 3: gates shared by sections and statements
# ---------------------------------------------------------------------------

def _denial(unit: dict, starts: list[int]) -> bool:
    """The complete denial form for one gate (IM-Q117, IM-Q123); `starts` are that gate's match positions."""
    text = unit["text"]
    if not starts or unit["markers"] or re.search(r"[,;:]", text) or _numbers(text) or DENIAL_STOP_RE.search(text) \
            or len(NEGATION_RE.findall(text)) != 1:
        return False
    return DENIAL_PREFIX_RE.fullmatch(text[:min(starts)]) is not None


def _conversion_starts(text: str) -> list[int]:
    starts = [m.start() for m in CONVERSION_RE.finditer(text)]
    for match in STEP_PAIR_RE.finditer(text):
        if re.sub(r"\s+", " ", match.group(1)) != re.sub(r"\s+", " ", match.group(2)):
            starts.append(match.start())
    return starts


def _conversion_fails(sentences: list[dict]) -> list[int]:
    return [u["index"] for u in sentences
            if (starts := _conversion_starts(u["text"])) and not _denial(u, starts)]


def _market_fails(sentences: list[dict]) -> list[tuple[int, str]]:
    out = []
    for unit in sentences:
        text = unit["text"]
        if MARKET_RE.search(text) and _numbers(text):
            out.append((unit["index"], "market number"))
        elif CURRENCY_RE.search(text):
            out.append((unit["index"], "currency amount"))
        else:
            stars = [m.start() for m in STAR_RE.finditer(text)] + [m.start() for m in STAR_NUMBER_RE.finditer(text)]
            ranks = [m.start() for m in RANK_RE.finditer(text)]
            if stars and ranks and not _denial(unit, stars + ranks):
                out.append((unit["index"], "star ranking"))
    return out


def _buyer_fails(sentences: list[dict]) -> list[int]:
    return [u["index"] for u in sentences if BUYER_RE.search(u["text"]) and (_numbers(u["text"]) or u["markers"])]


def _banned_fails(sentences: list[dict]) -> list[tuple[int, str]]:
    out = []
    for unit in sentences:
        found = {kind: [m.start() for m in rx.finditer(unit["text"])] for kind, rx in BANNED_RES.items()}
        starts = [s for hits in found.values() for s in hits]
        if starts and not _denial(unit, starts):
            out.extend((unit["index"], kind) for kind, hits in found.items() if hits)
    return out


def _review_words(path: Path) -> dict:
    """The run's review words for VERBATIM_QUOTE, held in memory only: every 8-word run of a long review and every
    whole review of 1 to 7 words (IM-Q87, IM-Q111)."""
    runs, short = set(), {}
    with _warehouse_ro(path) as wh:
        for (text,) in wh.execute("SELECT text FROM review_text"):
            words = tuple(WORD_RE.findall(_nz(text)))
            if len(words) >= QUOTE_WORDS:
                runs.update(words[i:i + QUOTE_WORDS] for i in range(len(words) - QUOTE_WORDS + 1))
            elif words:
                short.setdefault(len(words), set()).add(words)
    return {"runs": runs, "short": short}


def _quote_at(text: str, reviews: dict, masks=()):
    """The word index where a review run or a whole short review starts in the text, or None. `masks` are spans of
    the marker-free nz text (required flag spans, IM-Q162): their words are left out and no run crosses them."""
    if not masks:
        segments = [list(enumerate(_words(text)))]
    else:
        segments, current = [], []
        plain = _strip_markers(_nz(text))[0]
        for index, match in enumerate(WORD_RE.finditer(plain)):
            if any(start < match.end() and match.start() < end for start, end in masks):
                segments.append(current)
                current = []
            else:
                current.append((index, match.group()))
        segments.append(current)
    for segment in segments:
        words = tuple(word for _, word in segment)
        for i in range(len(words)):
            if words[i:i + QUOTE_WORDS] in reviews["runs"]:
                return segment[i][0]
            if any(words[i:i + n] in group for n, group in reviews["short"].items()):
                return segment[i][0]
    return None


def _text_gates(text: str, reviews: dict, add, claim, label: str, *, numbers: bool, titles=frozenset(),
                quote_masks=()) -> None:
    """VERBATIM_QUOTE, CONVERSION_RATE, MARKET_NUMBER, HIDDEN_NAME, BUYER_WORD (and, for statement texts, the
    any-number NUMBER_MISMATCH rule) on one text. `label` prefixes each detail; no detail holds the text."""
    sentences = _sentences(text, titles)
    if numbers:
        for unit in sentences:
            for number in _numbers(unit["text"]):
                add("NUMBER_MISMATCH", claim, f"{label} sentence {unit['index']}: number {number['raw']} in text; "
                                              "counts belong to the evidence lines")
            for _ in NUMBER_WORD_RE.finditer(unit["text"]):
                add("NUMBER_MISMATCH", claim, f"{label} sentence {unit['index']}: a number word before a unit")
    at = _quote_at(text, reviews, quote_masks)
    if at is not None:
        add("VERBATIM_QUOTE", claim, f"{label} word {at}: matches the words of a stored review")
    for index in _conversion_fails(sentences):
        add("CONVERSION_RATE", claim, f"{label} sentence {index}: a conversion rate between steps")
    for index, kind in _market_fails(sentences):
        add("MARKET_NUMBER", claim, f"{label} sentence {index}: {kind}")
    hits = hidden_name_hits(unicodedata.normalize("NFC", text))
    if hits:
        add("HIDDEN_NAME", claim, f"{label} hidden names: {', '.join(hits)}")
    for index in _buyer_fails(sentences):
        add("BUYER_WORD", claim, f"{label} sentence {index}: «người mua» with a number or a claim")


class _Reasons:
    """Gate results in the frozen code order, then claim or line order (PR 3 conventions)."""

    def __init__(self, codes):
        self.found = {code: [] for code in codes}

    def add(self, code: str, claim, detail: str) -> None:
        self.found[code].append({"code": code, "claim": claim, "detail": detail})

    def ordered(self) -> list[dict]:
        return [reason for reasons in self.found.values() for reason in reasons]


def _registry_numbers(path: Path, count_ids) -> dict:
    """The numbers of each count ID (PR 3 conventions), from count_registry; never `review_ids`."""
    out = {}
    with _warehouse_ro(path) as wh:
        for count_id in count_ids:
            row = wh.execute("SELECT numbers_json FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
            stored = json.loads(row[0]) if row else {}
            numbers = {k: stored[k] for k in NUMBER_KEYS if _int(stored.get(k))}
            if isinstance(stored.get("threshold_met"), bool):
                numbers["threshold_met"] = stored["threshold_met"]
            if "catalogue_status" in stored:
                # A claim row (IM-Q154): evidence, shops, the sample and period, and the flags it must show.
                numbers.update({k: stored[k] for k in CLAIM_NUMBER_KEYS if _int(stored.get(k))})
                numbers.update({k: stored.get(k) for k in ("period_first", "period_last")})
                numbers["flags"] = list(stored.get("flags") or [])
            out[count_id] = numbers
    return out


STAR_NAMES = {"tich_cuc": "sao tích cực", "tieu_cuc": "sao tiêu cực", STAR_NONE: "không có sao"}
POLARITY_NAMES = {"all": "mọi hướng", "khen": "khen", "che": "chê", "ke": "kể", "khong_ro_huong": "không rõ hướng"}


def _row_label(info: dict, book: dict) -> str:
    row = info["row"]
    if info["kind"] == "theme":
        return f"{row['theme_name']} ({POLARITY_NAMES.get(row['polarity'], row['polarity'])})"
    if info["kind"] == "keyword":
        return row["group_name"]
    if info["kind"] == "reason":
        names = _theme_codes(book)
        return " + ".join(names.get(code, code) for code in info["themes"])
    if info["kind"] == "claim":
        return info["label"]
    if info["kind"] == "star":
        return f"{STAR_NAMES[row['star_sentiment']]} ({'mọi sản phẩm' if row['product'] == 'all' else row['product']})"
    return f"{row['dimension']}: {row['group']}"


def _cited(info: dict, book: dict, numbers: dict) -> dict:
    """What the report store keeps about one cited count ID, so a stale citation still shows its old numbers."""
    return {"count_id": info["count_id"], "tool": info["tool"], "kind": info["kind"], "source": info["source"],
            "platform": info["platform"], "step": info["step"], "label": _row_label(info, book), "numbers": numbers,
            "threshold_note": info["row"].get("threshold_note")}


def _scope_numbers(path: Path, themes) -> dict:
    """Scope numbers of the run (PR 3 conventions): (unit, platform, measure) to value."""
    with _warehouse_ro(path) as wh:
        rows = {s: n for s, _, n in wh.execute("SELECT source, captured, row_count FROM source_status")}
        products = dict(wh.execute("SELECT platform, COUNT(*) FROM product GROUP BY platform").fetchall())
    scope = {("keywords", None, "collected"): rows.get("keywords", 0)}
    for platform in PLATFORMS:
        scope[("reviews", platform, "collected")] = rows.get(f"{platform}_reviews", 0)
        scope[("products", platform, "collected")] = products.get(platform, 0)
        scope[("reviews", platform, "coded")] = themes["coded_reviews"].get(platform, 0) if themes else 0
    return scope


def _scope_fails(sentences: list[dict], scope: dict) -> list[str]:
    """NUMBER_MISMATCH for frame parts 2 and 3: each number with a unit equals the scope number of its unit,
    platform and measure (IM-Q84, IM-Q121). Affirmative forms only."""
    out = []
    for unit in sentences:
        text, where = unit["text"], f"sentence {unit['index']}"
        cuts = [m.start() for m in CLAUSE_CUT_RE.finditer(text)]
        starts, ends = [0] + [c + 1 for c in cuts], cuts + [len(text)]
        for number in _numbers(text):
            kind = number["unit"]
            if kind is None:
                continue
            if kind == "percent":
                out.append(f"{where}: {number['raw']} is a percent, not a scope number")
                continue
            clause = next(i for i, end in enumerate(ends) if number["start"] <= end)
            own, earlier = text[starts[clause]:ends[clause]], text[:starts[clause]]
            if SCOPE_NEGATION_RE.search(own):
                out.append(f"{where}: {number['raw']} {kind} is in a negated clause")
                continue
            if CODED_RE.search(own):
                measure = "coded"
            elif CODED_RE.search(earlier) or SCOPE_NEGATION_RE.search(earlier):
                out.append(f"{where}: {number['raw']} {kind} has its measure or negation in an earlier clause")
                continue
            else:
                measure = "collected"
            if kind == "keywords":
                platform = None
                if _platforms(own):
                    out.append(f"{where}: {number['raw']} keywords in a clause that names a platform")
                    continue
            else:
                place = _platforms(own) or _platforms(text)
                platform = next(iter(place)) if len(place) == 1 else None
            expected = scope.get((kind, platform, measure))
            if expected is None or any(v != expected for v in number["values"]):
                out.append(f"{where}: {number['raw']} {kind}, platform {platform or 'none'}, measure {measure}")
        for _ in NUMBER_WORD_RE.finditer(text):
            out.append(f"{where}: a number word before a unit")
    return out


def _bound_ref(marks: list, number: dict) -> str:
    """PR 3 binding: the first marker after the number in its sentence, else the last marker before it."""
    return next((r for pos, r in marks if pos >= number["end"]), None) \
        or [r for pos, r in marks if pos <= number["start"]][-1]


def _mask(text: str, spans) -> str:
    """The text with each span blanked out (positions kept)."""
    for start, end in spans:
        text = text[:start] + " " * (end - start) + text[end:]
    return text


def _claim_number_fails(sentences: list[dict], claims: dict, cited: dict, numbers: dict, denominators: dict,
                        masks: dict | None = None):
    """NUMBER_MISMATCH for parts 1 and 4 to 17 (IM-Q84): each number binds to one claim and equals its count.
    A claim row also takes «bằng chứng», «gian hàng», `reviews/sample` and its period dates (IM-Q159); required flag
    spans are masked (IM-Q162)."""
    out = []
    for unit in sentences:
        marks, where = unit["markers"], f"sentence {unit['index']}"
        text = _mask(unit["text"], (masks or {}).get(unit["index"], ()))
        for plain, with_claim_units in zip(_numbers(text), _numbers(text, claim_units=True)):
            if not marks:
                out.append((None, f"{where}: number {plain['raw']} is in a sentence with no claim marker"))
                continue
            ref = _bound_ref(marks, plain)
            ids = list(dict.fromkeys(item[0] for item in claims[ref]["_items"]))
            claim_row = len(ids) == 1 and cited[ids[0]]["tool"] == CLAIM_TOOL
            number = with_claim_units if claim_row else plain
            kind, ok = number["unit"], False
            if claim_row and number.get("date") is not None:
                counted = numbers[ids[0]]
                ok = number["date"] in (counted.get("period_first"), counted.get("period_last"))
            elif kind not in (None, "percent") and len(ids) == 1:
                counted, info = numbers[ids[0]], cited[ids[0]]
                if number["kind"] == "token":
                    ok = number["values"][0] is not None and counted.get(kind) == number["values"][0]
                elif claim_row:
                    ok = kind == "reviews" and number["values"] == [counted.get("reviews"), counted.get("sample")]
                else:
                    ok = kind == "reviews" and info["tool"] == "theme_counts" \
                        and number["values"] == [counted.get("reviews"), denominators.get(info["platform"])]
            if not ok:
                out.append((ref, f"{where}: {number['raw']} {kind or 'no unit'} bound to claim {ref}"))
        for _ in NUMBER_WORD_RE.finditer(text):
            out.append((None, f"{where}: a number word before a unit"))
    return out


def _claim_regions(unit: dict) -> dict:
    """Claim region of each marker (PR 4 conventions): from the previous marker (or the sentence start) to this
    marker; the last marker's region runs to the sentence end."""
    regions, start, marks = {}, 0, unit["markers"]
    for i, (pos, ref) in enumerate(marks):
        regions[ref] = (start, len(unit["text"]) if i == len(marks) - 1 else pos)
        start = pos
    return regions


def _claim_ids(claim: dict, cited: dict) -> list[str]:
    return list(dict.fromkeys(i for i, _ in claim["_items"] if cited[i]["tool"] == CLAIM_TOOL))


def _flag_spans(sentences: list[dict], claims: dict, cited: dict, numbers: dict) -> dict:
    """Required flag spans per sentence (IM-Q162): a flag phrase in the region of a marker whose cited claim row
    carries that flag."""
    out = {}
    for unit in sentences:
        regions = _claim_regions(unit)
        for _, ref in unit["markers"]:
            phrases = {f for i in _claim_ids(claims[ref], cited) for f in numbers[i].get("flags") or []}
            start, end = regions[ref]
            for phrase in sorted(phrases):
                out.setdefault(unit["index"], []).extend(
                    m.span() for m in CLAIM_FLAG_RES[phrase].finditer(unit["text"]) if start <= m.start() and m.end() <= end)
    return out


def _text_spans(text: str, sentences: list[dict], spans: dict) -> list[tuple[int, int]]:
    """Sentence spans moved onto the marker-free nz text of the whole section (for the quote check)."""
    plain, cursor, out = _strip_markers(_nz(text))[0], 0, []
    for unit in sentences:
        at = plain.find(unit["text"], cursor)
        if at < 0:
            continue
        cursor = at + len(unit["text"])
        out += [(at + start, at + end) for start, end in spans.get(unit["index"], ())]
    return out


def _claim_rank_fails(sentences: list[dict], claims: dict, cited: dict, numbers: dict) -> list[tuple[str, str]]:
    """CLAIM_RANK_UNSCOPED (IM-Q158): a sentence that ranks claims states, in each claim marker's region, the
    measure, the platform, the sample and the period of its one claim row."""
    out = []
    for unit in sentences:
        text = unit["text"]
        cited_refs = [ref for _, ref in unit["markers"] if _claim_ids(claims[ref], cited)]
        if not cited_refs or not CLAIM_RANK_RE.search(text):
            continue
        regions, found = _claim_regions(unit), _numbers(text, claim_units=True)
        for ref in cited_refs:
            ids = _claim_ids(claims[ref], cited)
            start, end = regions[ref]
            if len(ids) != 1:
                out.append((ref, f"claim {ref}: a ranked claim cites exactly one claim row"))
                continue
            row, region = numbers[ids[0]], text[start:end]
            inside = [n for n in found if start <= n["start"] and n["end"] <= end]
            dates = {n["date"] for n in inside if n.get("date")}
            missing = [name for name, ok in (
                ("measure", CLAIM_MEASURE_RE.search(region) is not None),
                ("platform", cited[ids[0]]["platform"] in _platforms(region)),
                ("sample", any(n["kind"] == "fraction" and n["unit"] == "reviews"
                               and n["values"] == [row.get("reviews"), row.get("sample")] for n in inside)),
                ("period", row.get("period_first") is not None and {row["period_first"], row["period_last"]} <= dates),
            ) if not ok]
            if missing:
                out.append((ref, f"claim {ref}: missing {', '.join(missing)}"))
    return out


def _claim_flag_fails(sentences: list[dict], claims: dict, cited: dict, numbers: dict,
                      masks: dict) -> list[tuple[str, str]]:
    """CLAIM_FLAG_MISSING (IM-Q162): a number bound to a marker whose claim row has flags needs each flag phrase in
    that marker's region."""
    out = []
    for unit in sentences:
        if not unit["markers"]:
            continue
        regions = _claim_regions(unit)
        text = _mask(unit["text"], masks.get(unit["index"], ()))
        bound = {_bound_ref(unit["markers"], n) for n in _numbers(text, claim_units=True)}
        for _, ref in unit["markers"]:
            flags = {f for i in _claim_ids(claims[ref], cited) for f in numbers[i].get("flags") or []}
            if ref not in bound or not flags:
                continue
            start, end = regions[ref]
            missing = [FLAG_KEYS[f] for f in sorted(flags, key=list(CLAIM_FLAGS.values()).index)
                       if not any(start <= m.start() and m.end() <= end
                                  for m in CLAIM_FLAG_RES[f].finditer(unit["text"]))]
            if missing:
                out.append((ref, f"claim {ref}: missing flags {', '.join(missing)}"))
    return out


# ---------------------------------------------------------------------------
# Part 3: report store (R-IM10 to R-IM12): versions and archives are never changed or removed
# ---------------------------------------------------------------------------

REPORT_TABLES = ("section_version", "statement_version", "render_archive")
REPORT_SCHEMA = (
    "CREATE TABLE IF NOT EXISTS section_version(run_id TEXT NOT NULL, part INTEGER NOT NULL, version INTEGER NOT NULL, "
    "text TEXT NOT NULL, claims_json TEXT NOT NULL, graded_json TEXT NOT NULL, frame_version TEXT NOT NULL, "
    "codebook_version TEXT NOT NULL, submitted_at TEXT NOT NULL, PRIMARY KEY(run_id, part, version))",
    "CREATE TABLE IF NOT EXISTS statement_version(statement_id TEXT NOT NULL, version INTEGER NOT NULL, "
    "run_id TEXT NOT NULL, step TEXT NOT NULL, statement_json TEXT NOT NULL, evidence_json TEXT NOT NULL, "
    "app_payload_json TEXT NOT NULL, codebook_version TEXT NOT NULL, submitted_at TEXT NOT NULL, "
    "PRIMARY KEY(statement_id, version))",
    "CREATE TABLE IF NOT EXISTS render_archive(archive_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, html TEXT NOT NULL, "
    "totals_json TEXT NOT NULL, statements_json TEXT NOT NULL, codebook_version TEXT NOT NULL, "
    "frame_version TEXT NOT NULL, rendered_at TEXT NOT NULL)",
) + tuple(
    f"CREATE TRIGGER IF NOT EXISTS {table}_no_{action.lower()} BEFORE {action} ON {table} "
    f"BEGIN SELECT RAISE(ABORT, '{table} rows are never changed or removed'); END"
    for table in REPORT_TABLES for action in ("UPDATE", "DELETE"))


def _report_store_path() -> Path:
    return _data_dir() / REPORT_STORE_NAME


@contextmanager
def _report_store():
    """One write transaction on the report store, created when needed. Used only after a submission is accepted,
    or by render_report."""
    path = _report_store_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(str(path), isolation_level=None)
    try:
        with _tx(con):
            for statement in REPORT_SCHEMA:
                con.execute(statement)
            yield con
    finally:
        con.close()


def _report_rows(sql: str, params: tuple) -> list[tuple]:
    """Read-only rows of the report store; a missing store reads as empty and is not created."""
    path = _report_store_path()
    if not path.is_file():
        return []
    with _warehouse_ro(path) as con:
        try:
            return con.execute(sql, params).fetchall()
        except sqlite3.DatabaseError:
            return []


@contextmanager
def _current_state(run_id: str, book: dict, groups: dict):
    """The current count rows of the run, worked out on a per-call byte copy of the warehouse (IM-Q80)."""
    path = _find_warehouse(run_id)
    with _warehouse_copy(path) as copy:
        counted = _count_responses(copy, book, groups)
        with _warehouse_ro(copy) as wh:
            counted["run_id"] = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        counted["current"] = {i["count_id"]: i for i in counted["infos"]}
        counted["copy"] = copy
        yield counted


# ---------------------------------------------------------------------------
# submit_section (R-IM10)
# ---------------------------------------------------------------------------

def _check_section(frame: dict, part, text, claims) -> list[dict]:
    """IM-Q82 input rules; any failure is INVALID_ARGUMENT. Returns the claims with their evidence items."""
    if not _int(part) or not 1 <= part <= 17:
        raise InsightError("INVALID_ARGUMENT", "part must be an integer from 1 to 17; part 18 is built by render_report")
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_SECTION_CHARS:
        raise InsightError("INVALID_ARGUMENT", f"text must be a non-blank string of at most {MAX_SECTION_CHARS} characters")
    if not isinstance(claims, list) or len(claims) > MAX_CLAIMS:
        raise InsightError("INVALID_ARGUMENT", f"claims must be a list of at most {MAX_CLAIMS} objects")
    if part in SCOPE_PARTS and claims:
        raise InsightError("INVALID_ARGUMENT", "frame parts 2 and 3 take no claims")
    out = []
    for claim in claims:
        if not isinstance(claim, dict) or set(claim) != CLAIM_KEYS:
            raise InsightError("INVALID_ARGUMENT", "a claim has exactly ref, evidence, confidence, step, hypothesis, "
                                                   "conclusion")
        if not isinstance(claim["ref"], str) or not REF_RE.fullmatch(claim["ref"]) \
                or claim["ref"] in {c["ref"] for c in out}:
            raise InsightError("INVALID_ARGUMENT", "each claim ref is a unique marker ref ([a-z0-9][a-z0-9_-]{0,15})")
        if not isinstance(claim["evidence"], list) or not claim["evidence"]:
            raise InsightError("INVALID_ARGUMENT", "a claim needs at least one evidence item")
        items = _evidence_items(frame, part, claim["evidence"])
        if claim["confidence"] not in LEVELS or claim["step"] not in STEPS:
            raise InsightError("INVALID_ARGUMENT", "a claim's confidence is one of the 4 levels and its step one of the "
                                                   "6 steps")
        if not isinstance(claim["hypothesis"], bool) or not isinstance(claim["conclusion"], bool):
            raise InsightError("INVALID_ARGUMENT", "a claim's hypothesis and conclusion are true or false")
        out.append({**claim, "_items": items})
    marks = MARKER_RE.findall(_nz(text))
    if any(marks.count(c["ref"]) != 1 for c in out) or not set(marks) <= {c["ref"] for c in out}:
        raise InsightError("INVALID_ARGUMENT", "each claim's marker [^ref] appears exactly once in the text, and every "
                                               "marker names a claim")
    return out


def _section_gates(ctx: dict, part: int, text: str, claims: list[dict], state: dict) -> tuple[list[dict], dict]:
    frame, book, groups = ctx["frame"], ctx["book"], ctx["groups"]
    cited, numbers = state["cited"], state["numbers"]
    titles = _structural_titles(frame, book, groups, part)
    sentences = _sentences(text, titles)
    by_ref = {c["ref"]: c for c in claims}
    sentence_of = {ref: unit for unit in sentences for _, ref in unit["markers"]}
    reasons = _Reasons(SECTION_CODES)

    masks = {} if part in SCOPE_PARTS else _flag_spans(sentences, by_ref, cited, numbers)
    if part in SCOPE_PARTS:
        for detail in _scope_fails(sentences, state["scope"]):
            reasons.add("NUMBER_MISMATCH", None, detail)
    else:
        for ref, detail in _claim_number_fails(sentences, by_ref, cited, numbers, state["denominators"], masks):
            reasons.add("NUMBER_MISMATCH", ref, detail)

    graded = {}
    for claim in claims:
        ref = claim["ref"]
        items = [_grade(ctx, cited[count_id], item_part, claim["hypothesis"]) for count_id, item_part in claim["_items"]]
        ceiling = min((g["ceiling"] for g, _ in items), key=_rank)
        hypothesis = claim["hypothesis"] or any(h for _, h in items)
        graded[ref] = {"ref": ref, "ceiling": ceiling, "hypothesis": hypothesis,
                       "items": [{**g, **_cited(cited[g["count_id"]], book, numbers[g["count_id"]])} for g, _ in items]}
        if _rank(claim["confidence"]) > _rank(ceiling) or (hypothesis and not claim["hypothesis"]):
            reasons.add("CONFIDENCE_ABOVE_CEILING", ref,
                        f"claim {ref}: ceiling {ceiling}" + (", hypothesis required" if hypothesis else ""))

    for claim in claims:
        below = [i for i, _ in claim["_items"] if numbers[i].get("threshold_met") is False]
        if below and (claim["conclusion"] or not BELOW_RE.search(sentence_of[claim["ref"]]["text"])):
            reasons.add("BELOW_THRESHOLD_CONCLUSION", claim["ref"],
                        f"claim {claim['ref']}: below threshold; conclusion must be false and the sentence must say "
                        f"«{NOTE_BELOW}»")

    _text_gates(text, state["reviews"], reasons.add, None, "text", numbers=False, titles=titles,
                quote_masks=_text_spans(text, sentences, masks) if masks else ())

    for claim in claims:
        steps = {cited[i]["step"] for i, _ in claim["_items"]}
        if steps != {claim["step"]}:
            reasons.add("STEP_NOT_FROM_EVIDENCE", claim["ref"],
                        f"claim {claim['ref']}: step {claim['step']}; evidence steps {', '.join(_ordered_steps(frame, steps))}")

    for claim in claims:
        sentence = sentence_of[claim["ref"]]["text"]
        if any(cited[i]["kind"] in REVIEW_KINDS for i, _ in claim["_items"]) and not RETOLD_RE.search(sentence) \
                and (part == REASON_PART or BUYING_REASON_RE.search(sentence)):
            reasons.add("RETOLD_NOT_MARKED", claim["ref"], f"claim {claim['ref']}: a buying reason from reviews needs "
                                                           f"«{RETOLD_NOTE}»")

    if part not in SCOPE_PARTS:
        no_data = _no_data_re(frame, book, groups)
        for unit in sentences:
            if not unit["markers"] and not no_data.fullmatch(unit["text"]):
                reasons.add("UNSUPPORTED_SENTENCE", None, f"sentence {unit['index']}: no claim marker")

    for index, kind in _banned_fails(sentences):
        reasons.add("BANNED_IDEA", None, f"sentence {index}: {kind}")

    if part not in SCOPE_PARTS:
        for ref, detail in _claim_rank_fails(sentences, by_ref, cited, numbers):
            reasons.add("CLAIM_RANK_UNSCOPED", ref, detail)
        for ref, detail in _claim_flag_fails(sentences, by_ref, cited, numbers, masks):
            reasons.add("CLAIM_FLAG_MISSING", ref, detail)
    return reasons.ordered(), graded


@mcp.tool()
@_tool
def submit_section(run_id: str, part: int, text: str, claims: list[dict]) -> dict:
    """Submit one report part (1 to 17) written by the agent. The MCP checks it (R-IM10) and, when every gate
    passes, stores it as a new version. A rejection lists every reason code; nothing is stored."""
    run_id = _check_run_id(run_id)
    frame = load_frame()
    claims = _check_section(frame, part, text, claims)
    book, groups = load_codebook(), load_keyword_groups()
    with _current_state(run_id, book, groups) as state:
        cited, claims_cache = {}, {}
        for claim in claims:
            for count_id, _ in claim["_items"]:
                cited[count_id] = _resolve_id(state["copy"], state["current"], count_id, book, claims=claims_cache)
        themes = state["themes"]
        gate_state = {"cited": cited, "numbers": _registry_numbers(state["copy"], cited),
                      "reviews": _review_words(state["copy"]), "scope": _scope_numbers(state["copy"], themes),
                      "denominators": themes["coded_reviews"] if themes else {}}
        full_id = state["run_id"]
    ctx = {"frame": frame, "store": load_shared_store(full_id), "book": book, "groups": groups}
    reasons, graded = _section_gates(ctx, part, text, claims, gate_state)
    result = {"run_id": full_id, "part": part, "accepted": not reasons, "reasons": reasons}
    if reasons:
        return result
    stored_claims = [{k: v for k, v in c.items() if k != "_items"} for c in claims]
    with _report_store() as con:
        version = 1 + con.execute("SELECT COALESCE(MAX(version), 0) FROM section_version WHERE run_id = ? AND part = ?",
                                  (full_id, part)).fetchone()[0]
        con.execute("INSERT INTO section_version VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            full_id, part, version, text, _canonical(stored_claims), _canonical([graded[c["ref"]] for c in claims]),
            frame["version"], book["version"], _stamp()))
    result.update(version=version, claims=[{"ref": c["ref"], "confidence": c["confidence"],
                                            "ceiling": graded[c["ref"]]["ceiling"],
                                            "hypothesis": graded[c["ref"]]["hypothesis"]} for c in claims])
    return result


# ---------------------------------------------------------------------------
# submit_statement (R-IM11)
# ---------------------------------------------------------------------------

def _check_statement(frame: dict, book: dict, statement, replaces) -> None:
    """IM-Q94 input rules; any failure is INVALID_ARGUMENT."""
    def need(ok: bool, message: str) -> None:
        if not ok:
            raise InsightError("INVALID_ARGUMENT", message)

    need(isinstance(statement, dict) and set(statement) == STATEMENT_KEYS,
         "statement has exactly the 9 fields of R-C01: step, customer, hidden_truth, motivation, conflict, insight, "
         "three_c, evidence, confidence")
    need(statement["step"] in STATEMENT_STEPS, "step is one of Biết đến, Quan tâm, Muốn mua, Mua, Sau mua")
    for name in TEXT_FIELDS:
        value = statement[name]
        need(isinstance(value, str) and len(value) <= MAX_FIELD_CHARS and (name == "conflict" or bool(value.strip())),
             f"{name} must be a non-blank string of at most {MAX_FIELD_CHARS} characters")
    three_c = statement["three_c"]
    need(three_c is None or (isinstance(three_c, dict) and set(three_c) == set(THREE_C_KEYS) and all(
        _text(three_c[k]) and len(three_c[k]) <= MAX_FIELD_CHARS for k in THREE_C_KEYS)),
        "three_c is null or exactly the non-blank strings customer, brand, category")
    evidence = statement["evidence"]
    need(isinstance(evidence, list) and len(evidence) <= MAX_EVIDENCE,
         f"evidence must be a list of at most {MAX_EVIDENCE} lines")
    codes = _theme_codes(book)
    for line in evidence:
        need(isinstance(line, dict) and set(line) == LINE_KEYS,
             "an evidence line has exactly supports, layer, themes, platform, count_id, part, note")
        need(line["supports"] in SUPPORTS, "supports is hidden_truth, motivation, conflict or why")
        why = line["supports"] == "why"
        need(_int(line["layer"]) and 1 <= line["layer"] <= MAX_WHY_LAYER if why else line["layer"] is None,
             f"layer is an integer 1 to {MAX_WHY_LAYER} on a why line and null otherwise")
        themes = line["themes"]
        need(isinstance(themes, list) and len(themes) == 2 and all(isinstance(t, str) and t in codes for t in themes)
             and themes[0] != themes[1] if why else themes is None,
             "themes is two different theme codes of the codebook on a why line and null otherwise")
        need(line["platform"] in PLATFORMS, "platform is shopee or tiktok_shop")
        need(isinstance(line["count_id"], str), "count_id is a string")
        need(_int(line["part"]) and frame["_parts"].get(line["part"], {}).get("kind") == "data",
             "part is a data part (4 to 15)")
        need(line["note"] is None or (isinstance(line["note"], str) and len(line["note"]) <= MAX_NOTE_CHARS),
             f"note is null or a string of at most {MAX_NOTE_CHARS} characters")
    confidence = statement["confidence"]
    need(isinstance(confidence, dict) and set(confidence) == {"level", "hypothesis"}
         and confidence["level"] in LEVELS and isinstance(confidence["hypothesis"], bool),
         "confidence is {level, hypothesis}: one of the 4 levels and true or false")
    need(replaces is None or isinstance(replaces, str), "replaces is null or a statement_id")


def _statement_texts(statement: dict) -> list[tuple[str, object, str]]:
    """Each text field and note on its own: (label, line index or None, text)."""
    out = [(name, None, statement[name]) for name in TEXT_FIELDS]
    if statement["three_c"] is not None:
        out += [(f"three_c.{k}", None, statement["three_c"][k]) for k in THREE_C_KEYS]
    out += [(f"evidence[{i}].note", i, line["note"]) for i, line in enumerate(statement["evidence"])
            if line["note"] is not None]
    return out


def _statement_gates(ctx: dict, statement: dict, cited: dict, numbers: dict, reviews: dict):
    lines, texts = statement["evidence"], _statement_texts(statement)
    level, flag = statement["confidence"]["level"], statement["confidence"]["hypothesis"]
    infos = [cited[line["count_id"]] for line in lines]
    reasons = _Reasons(STATEMENT_CODES)
    add = reasons.add

    if not lines:
        add("NO_EVIDENCE", None, "the statement has no evidence line")
    if not statement["conflict"].strip():
        add("NO_CONFLICT", None, "conflict is blank")
    side_lines = {side: [i for i, line in enumerate(lines) if line["supports"] == side] for side in SIDES}
    evidenced = {side: any((numbers[lines[i]["count_id"]].get("reviews") or 0) >= 1 for i in side_lines[side])
                 for side in SIDES}
    for side in SIDES:
        if not evidenced[side] and not (flag and level in ("Yếu", "Không")):
            add("HYPOTHESIS_REQUIRED", None, f"{side} has no evidence; it needs hypothesis true at Yếu or Không")
    for side in SIDES:
        if evidenced[side] and not any(numbers[lines[i]["count_id"]].get("threshold_met") is True
                                       for i in side_lines[side]):
            notes = [statement[side]] + [lines[i]["note"] or "" for i in side_lines[side]]
            if not (flag and any(BELOW_RE.search(_nz(t)) for t in notes)):
                add("BELOW_THRESHOLD_CONCLUSION", None,
                    f"{side} is below the threshold; it needs hypothesis true and «{NOTE_BELOW}»")

    why = [(i, line, infos[i]) for i, line in enumerate(lines) if line["supports"] == "why"]
    layers = sorted({line["layer"] for _, line, _ in why})
    depth = max(layers, default=0)
    for i, line, info in why:
        if info["kind"] != "reason":
            add("WHY_LAYER_WITHOUT_EVIDENCE", i, f"layer {line['layer']}: the line cites a count row, not a reason link")
    for k in range(1, depth + 1):
        if k not in layers:
            add("WHY_LAYER_WITHOUT_EVIDENCE", None, f"layer {k} has no line")
        elif not any(info["kind"] == "reason" and info["row"]["reviews"] >= 1
                     for _, line, info in why if line["layer"] == k):
            add("WHY_LAYER_WITHOUT_EVIDENCE", None, f"layer {k} has no reason link with a linked review")
    pairs = {}
    for k in layers:
        group = [(line, info) for _, line, info in why if line["layer"] == k]
        declared = {frozenset(line["themes"]) for line, _ in group}
        wrong = len(declared) != 1 or any(info["kind"] == "reason" and frozenset(info["themes"]) != frozenset(line["themes"])
                                          for line, info in group)
        pair = next(iter(declared)) if len(declared) == 1 else None
        previous = pairs.get(k - 1)
        if pair is not None and previous is not None and (pair == previous or len(pair & previous) != 1):
            wrong = True
        pairs[k] = pair
        if wrong:
            add("WHY_LAYER_WRONG_PAIR", None, f"layer {k}: its pair must be the reason link's pair and share exactly "
                                              "one theme with the layer before")
    for i, line, _ in why:
        if not _text(line["note"]):
            add("WHY_LAYER_UNEXPLAINED", i, f"layer {line['layer']}: the note must explain how the two ideas join")
    if depth < 3 and not any(SHORT_CHAIN_RE.search(_nz(t)) for _, _, t in texts):
        add("WHY_CHAIN_SHORT_UNMARKED", None, f"the «Tại sao» chain has {depth} layers; say «{SHORT_CHAIN_NOTE}»")

    for label, claim, text in texts:
        if FIRST_PERSON_RE.search(_strip_markers(_nz(text))[0]):
            add("FIRST_PERSON", claim, f"{label}: first person")
    for i, (line, info) in enumerate(zip(lines, infos)):
        if info["step"] != statement["step"]:
            add("MIXED_STEPS", i, f"line {i}: the row's step is {info['step']}")
    for i, (line, info) in enumerate(zip(lines, infos)):
        if line["platform"] != info["platform"]:
            add("PLATFORM_MISMATCH", i, f"line {i}: the row is not a {line['platform']} row")
    for i, info in enumerate(infos):
        if info["kind"] not in REVIEW_KINDS:
            add("NOT_CUSTOMER_WORDS", i, f"line {i}: the row is not from customer reviews")
    kept = set(KEPT_KINDS.values())
    for i, (line, info) in enumerate(zip(lines, infos)):
        if line["supports"] in ("motivation", "conflict") and (
                (info["kind"] in ("theme", "claim") and info["row"]["theme_code"] not in kept)
                or info["kind"] == "portrait_group"
                or (info["kind"] == "reason" and not set(info["themes"]) <= kept)):
            add("MOTIVE_KIND_NOT_KEPT", i, f"line {i}: a {line['supports']} must be công dụng, giá, quy cách or "
                                           "chất lượng")
    motives = side_lines["motivation"]
    if motives and not any(RETOLD_RE.search(_nz(t)) for t in
                           [statement["motivation"]] + [lines[i]["note"] or "" for i in motives]):
        add("RETOLD_NOT_MARKED", None, f"motivation: a buying reason from reviews needs «{RETOLD_NOTE}»")
    for label, claim, text in texts:
        for index, kind in _banned_fails(_sentences(text)):
            add("BANNED_IDEA", claim, f"{label} sentence {index}: {kind}")

    graded = [_grade(ctx, info, line["part"], flag) for line, info in zip(lines, infos)]
    ceiling = min((g["ceiling"] for g, _ in graded), key=_rank, default="Không")
    hypothesis = flag or any(h for _, h in graded)
    if _rank(level) > _rank(ceiling) or (hypothesis and not flag):
        add("CONFIDENCE_ABOVE_CEILING", None, f"ceiling {ceiling}" + (", hypothesis required" if hypothesis else ""))

    for label, claim, text in texts:
        _text_gates(text, reviews, add, claim, label, numbers=True)
    return reasons.ordered(), ceiling, [g for g, _ in graded]


def _app_payload(statement_id: str, statement: dict, numbers: dict) -> dict:
    """The app import shape (contracts/analysis/insight-report-statement.schema.json) without revisionId."""
    three_c = statement["three_c"]
    return {
        "contractVersion": STATEMENT_CONTRACT_VERSION, "statementId": statement_id,
        "purchaseStage": PURCHASE_STAGES[statement["step"]], "customer": statement["customer"],
        "hiddenTruth": statement["hidden_truth"], "motivation": statement["motivation"],
        "conflict": statement["conflict"], "insight": statement["insight"],
        "threeC": None if three_c is None else {k: three_c[k] for k in THREE_C_KEYS},
        "evidence": [{"platform": APP_PLATFORMS[line["platform"]], "count": numbers[line["count_id"]].get("reviews", 0)}
                     for line in statement["evidence"]],
        "confidence": {"level": APP_LEVELS[statement["confidence"]["level"]],
                       "hypothesis": statement["confidence"]["hypothesis"]},
    }


@mcp.tool()
@_tool
def submit_statement(run_id: str, statement: dict, replaces: str | None = None) -> dict:
    """Submit one insight statement in the 9 fields of R-C01 (R-IM11). The MCP checks it and, when every gate
    passes, stores it as a new version (`replaces` names the statement it revises) with a payload the app can
    import later. A rejection lists every reason code; nothing is stored."""
    run_id = _check_run_id(run_id)
    frame, book, groups = load_frame(), load_codebook(), load_keyword_groups()
    _check_statement(frame, book, statement, replaces)
    with _current_state(run_id, book, groups) as state:
        full_id, reasons_cache, claims_cache, cited = state["run_id"], {}, {}, {}
        if replaces is not None and not _report_rows(
                "SELECT 1 FROM statement_version WHERE statement_id = ? AND run_id = ?", (replaces, full_id)):
            raise InsightError("INVALID_ARGUMENT", "replaces names no stored statement of this run")
        for line in statement["evidence"]:
            cited[line["count_id"]] = _resolve_id(state["copy"], state["current"], line["count_id"], book,
                                                  reasons_cache, claims_cache)
        numbers = _registry_numbers(state["copy"], cited)
        reviews = _review_words(state["copy"])
    ctx = {"frame": frame, "store": load_shared_store(full_id), "book": book, "groups": groups}
    reasons, ceiling, graded = _statement_gates(ctx, statement, cited, numbers, reviews)
    result = {"run_id": full_id, "accepted": not reasons, "reasons": reasons}
    if reasons:
        return result
    lines = []
    for line, g in zip(statement["evidence"], graded):
        info = cited[line["count_id"]]
        lines.append({**line, **_cited(info, book, numbers[line["count_id"]]), "ceiling": g["ceiling"],
                      "blocked": g["blocked"], "checks": g["checks"], "missing_count": g["missing_count"]})
        if info["kind"] == "reason":
            lines[-1]["pair"] = info["themes"]
    with _report_store() as con:
        if replaces is None:
            statement_id, version = str(uuid.uuid4()), 1
        else:
            statement_id = replaces
            version = 1 + con.execute("SELECT MAX(version) FROM statement_version WHERE statement_id = ?",
                                      (statement_id,)).fetchone()[0]
        con.execute("INSERT INTO statement_version VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (
            statement_id, version, full_id, statement["step"], _canonical(statement), _canonical(lines),
            _canonical(_app_payload(statement_id, statement, numbers)), book["version"], _stamp()))
    result.update(statement_id=statement_id, version=version, ceiling=ceiling)
    return result


# ---------------------------------------------------------------------------
# render_report (R-IM12)
# ---------------------------------------------------------------------------

PAGE_TITLE = "Báo cáo insight"
PAGE_STYLE = ("body{font-family:sans-serif;max-width:60rem;margin:0 auto;padding:1rem;line-height:1.5}"
              ".claim{color:#555;font-size:.9em}.stale{color:#a00;font-weight:bold}.missing{color:#777}"
              "table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:.3rem;vertical-align:top}")
FIELD_NAMES = (("customer", "Khách hàng"), ("hidden_truth", "Sự thật ngầm"), ("motivation", "Động lực"),
               ("conflict", "Xung đột"), ("insight", "Câu insight"))
THREE_C_NAMES = (("customer", "Khách"), ("brand", "Thương hiệu"), ("category", "Ngành"))
NUMBER_NAMES = {"reviews": "đánh giá", "writers": "người viết", "products": "sản phẩm", "keywords": "từ khóa",
                "threshold_count": "số tính ngưỡng"}
SOURCE_PLATFORM = {"shopee_reviews": "shopee", "tiktok_shop_reviews": "tiktok_shop"}


def _h(value) -> str:
    return html.escape(str(value), quote=True)


def _numbers_text(numbers: dict) -> str:
    parts = [f"{numbers[k]} {NUMBER_NAMES[k]}" for k in NUMBER_KEYS if k in numbers]
    parts += [f"{numbers[k]} {CLAIM_NUMBER_NAMES[k]}" for k in CLAIM_NUMBER_KEYS if k in numbers]
    if "threshold_met" in numbers:
        parts.append("đạt ngưỡng" if numbers["threshold_met"] else NOTE_BELOW)
    parts += numbers.get("flags") or []
    return "; ".join(parts)


def _claim_label(hypothesis: bool, confidence: str, step: str) -> str:
    return " · ".join(([LABEL_HYPOTHESIS] if hypothesis else []) + [confidence, step])


def _render_text(text: str, titles: frozenset, claims: dict, footnote) -> str:
    """A part body: the agent's text, HTML-escaped, with each marker shown in place as its label and footnote."""
    out = []
    for line in unicodedata.normalize("NFC", text).splitlines():
        line = line.strip()
        if not line:
            continue
        if _units(line, titles) == [{"kind": "heading"}]:
            out.append(f"<h3>{_h(line.lstrip('#').strip())}</h3>")
            continue
        pieces, last = [], 0
        for match in MARKER_ANY_CASE_RE.finditer(line):
            pieces.append(_h(line[last:match.start()]))
            claim = claims.get(match.group(1).lower())
            if claim is None:
                pieces.append(_h(match.group()))
            else:
                k = footnote(claim)
                label = _claim_label(claim["hypothesis"], claim["confidence"], claim["step"])
                pieces.append(f'<span class="claim">({_h(label)})<sup><a href="#fn-{k}">{k}</a></sup></span>')
            last = match.end()
        pieces.append(_h(line[last:]))
        out.append("<p>" + "".join(pieces) + "</p>")
    return "\n".join(out)


def _appendix_row(row: dict, frame: dict, current: set) -> str:
    items = []
    for item in row["items"]:
        source = frame["_sources"].get(item["source"], {}).get("name", item["source"])
        platform = PLATFORM_NAMES.get(item["platform"], "—")
        state = "còn hiện hành" if item["count_id"] in current else "không còn hiện hành"
        cells = [item["count_id"], source, platform, item["label"], _numbers_text(item["numbers"]),
                 item.get("threshold_note") or "", state]
        items.append("<li>" + " · ".join(_h(c) for c in cells if c != "") + "</li>")
    why = "" if row["layer"] is None else f"Tầng {row['layer']}: {row['explanation'] or ''}"
    cells = [row["where"], row["ref"], row["step"], f"{row['confidence']} (trần {row['ceiling']})",
             LABEL_HYPOTHESIS if row["hypothesis"] else "", why]
    return (f'<tr id="fn-{row["k"]}"><td>{row["k"]}</td>' + "".join(f"<td>{_h(c)}</td>" for c in cells)
            + f"<td><ul>{''.join(items)}</ul></td></tr>")


def _source_rows(frame: dict, status: dict, scope: dict) -> list[str]:
    """One appendix row per frame source the run captured, with its scope numbers (IM-Q103)."""
    rows = []
    for source in frame["sources"]:
        captured = [w for w in source["warehouse_sources"] if status.get(w, (0, 0))[0]]
        if not captured:
            continue
        platform = SOURCE_PLATFORM.get(source["key"])
        if platform:
            numbers = [f"đã thu {scope[('reviews', platform, 'collected')]} đánh giá",
                       f"đã mã hóa {scope[('reviews', platform, 'coded')]} đánh giá",
                       f"{scope[('products', platform, 'collected')]} sản phẩm"]
        elif source["key"] == "search_suggestions":
            numbers = [f"đã thu {scope[('keywords', None, 'collected')]} từ khóa"]
        else:
            numbers = [f"{sum(status[w][1] for w in captured)} dòng"]
        rows.append(f"<tr><td>{_h(source['name'])}</td><td>{_h(PLATFORM_NAMES.get(platform, '—'))}</td>"
                    f"<td>{_h('; '.join(numbers))}</td></tr>")
    return rows


def _json_file(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


@mcp.tool()
@_tool
def render_report(run_id: str) -> dict:
    """Render the report of a run from its latest accepted parts and statements (R-IM12): `report.html`, four JSON
    files of totals for the dashboard, and an archive row in the report store (an identical report is stored once).
    Parts that were never accepted show «Chưa viết»; nothing is filled in from other data."""
    run_id = _check_run_id(run_id)
    frame, book, groups = load_frame(), load_codebook(), load_keyword_groups()
    with _current_state(run_id, book, groups) as state:
        full_id, copy = state["run_id"], state["copy"]
        plan = _plan(copy, frame, book, groups, state)
        scope = _scope_numbers(copy, state["themes"])
        with _warehouse_ro(copy) as wh:
            status = {s: (c, n) for s, c, n in wh.execute("SELECT source, captured, row_count FROM source_status")}
        sections = {}
        for part, version, text, claims_json, graded_json in _report_rows(
                "SELECT part, version, text, claims_json, graded_json FROM section_version WHERE run_id = ? "
                "ORDER BY part, version", (full_id,)):
            sections[part] = {"version": version, "text": text, "claims": json.loads(claims_json),
                              "graded": json.loads(graded_json)}
        statements = {}
        for statement_id, version, step, statement_json, evidence_json, payload_json in _report_rows(
                "SELECT statement_id, version, step, statement_json, evidence_json, app_payload_json "
                "FROM statement_version WHERE run_id = ? ORDER BY rowid", (full_id,)):
            first = statements.get(statement_id, {}).get("first", len(statements))
            statements[statement_id] = {"id": statement_id, "version": version, "step": step, "first": first,
                                        "statement": json.loads(statement_json), "lines": json.loads(evidence_json),
                                        "payload": json.loads(payload_json)}
        current, reasons_cache = set(state["current"]), {}
        for entry in statements.values():
            for line in entry["lines"]:
                if line["tool"] == REASON_TOOL and line["count_id"] not in current:
                    row_key = _canonical([line["platform"], line["pair"]])
                    current |= set(_reason_infos(copy, book, row_key, reasons_cache))
        claim_ids = {item["count_id"] for s in sections.values() for g in s["graded"] for item in g["items"]
                     if item["tool"] == CLAIM_TOOL} | {line["count_id"] for e in statements.values()
                                                       for line in e["lines"] if line["tool"] == CLAIM_TOOL}
        current |= _current_claim_ids(copy, book, claim_ids - current)
        themes_rows = state["themes"]["rows"] if state["themes"] else []
        keyword_rows = state["keywords"]["rows"]
        portrait_rows = state["portraits"]["rows"]

    footnotes = []
    page = ["<!DOCTYPE html>", '<html lang="vi">', "<head>", '<meta charset="utf-8">', f"<title>{PAGE_TITLE}</title>",
            f"<style>{PAGE_STYLE}</style>", "</head>", "<body>", "<header>", f"<h1>{PAGE_TITLE}</h1>",
            f"<p>Lần chạy: {_h(full_id)}</p>", f"<p>Khung báo cáo: {_h(frame['version'])} ({_h(frame['status'])})</p>",
            f"<p>Bộ chủ đề: {_h(book['version'])} ({_h(book['status'])})</p>", "</header>"]
    parts_rows, written, missing, stale = [], [], [], []
    for spec in frame["parts"][:APPENDIX_PART - 1]:
        part = spec["part"]
        page.append(f'<section id="part-{part}">')
        page.append(f"<h2>Phần {part}. {_h(spec['title'])}</h2>")
        section = sections.get(part)
        if section is None:
            missing.append(part)
            page.append(f'<p class="missing">{STATUS_MISSING}</p>')
            parts_rows.append({"part": part, "title": spec["title"], "status": STATUS_MISSING,
                               "content_sha256": None, "claims": 0, "lowest_confidence": None})
        else:
            written.append(part)
            graded = {g["ref"]: g for g in section["graded"]}
            is_stale = any(item["count_id"] not in current for g in graded.values() for item in g["items"])
            if is_stale:
                stale.append(part)
                page.append(f'<p class="stale">{MARK_STALE}</p>')
            claims = {c["ref"]: c for c in section["claims"]}

            def footnote(claim, part=part, graded=graded):
                g = graded[claim["ref"]]
                footnotes.append({"k": len(footnotes) + 1, "where": f"Phần {part}", "ref": f"ý {claim['ref']}",
                                  "step": claim["step"], "confidence": claim["confidence"], "ceiling": g["ceiling"],
                                  "hypothesis": g["hypothesis"], "layer": None, "explanation": None,
                                  "items": g["items"]})
                return len(footnotes)

            page.append(_render_text(section["text"], _structural_titles(frame, book, groups, part), claims, footnote))
            levels = [c["confidence"] for c in section["claims"]]
            parts_rows.append({
                "part": part, "title": spec["title"], "status": STATUS_RESUBMIT if is_stale else STATUS_WRITTEN,
                "content_sha256": _sha256(_canonical({"text": section["text"], "claims": section["claims"]})),
                "claims": len(levels), "lowest_confidence": min(levels, key=_rank) if levels else None})
        page.append("</section>")

    page += ['<section id="statements">', "<h2>Câu insight</h2>"]
    ordered = sorted(statements.values(), key=lambda e: (STEPS.index(e["step"]), e["first"]))
    for n, entry in enumerate(ordered, 1):
        statement, lines = entry["statement"], entry["lines"]
        confidence = statement["confidence"]
        page.append(f'<article class="statement" id="statement-{_h(entry["id"])}">')
        page.append(f'<p class="label">{_h(_claim_label(confidence["hypothesis"], confidence["level"], statement["step"]))}</p>')
        if any(line["count_id"] not in current for line in lines):
            page.append(f'<p class="stale">{MARK_STALE}</p>')
        marks, numbers = {}, []
        for i, line in enumerate(lines):
            footnotes.append({"k": len(footnotes) + 1, "where": f"Câu insight {n}", "ref": f"dòng {i}",
                              "step": statement["step"], "confidence": confidence["level"], "ceiling": line["ceiling"],
                              "hypothesis": confidence["hypothesis"], "layer": line["layer"],
                              "explanation": line["note"] if line["supports"] == "why" else None,
                              "items": [line]})
            marks.setdefault(line["supports"], []).append((line, len(footnotes)))
            numbers.append(len(footnotes))
        page.append("<dl>")
        for key, name in FIELD_NAMES:
            refs = ""
            for line, k in marks.get(key, []):
                link = f'<sup><a href="#fn-{k}">{k}</a></sup>'
                flags = (line.get("numbers") or {}).get("flags")
                if flags:
                    link += f' <span class="flags">({_h("; ".join(flags))})</span>'
                refs += (f'<p class="evidence-note">{_h(line["note"])}{link}</p>'
                         if _text(line["note"]) else link)
            page.append(f"<dt>{name}</dt><dd>{_h(statement[key])}{refs}</dd>")
        if statement["three_c"] is not None:
            three_c = "; ".join(f"{name}: {statement['three_c'][key]}" for key, name in THREE_C_NAMES)
            page.append(f"<dt>3C</dt><dd>{_h(three_c)}</dd>")
        page.append("</dl>")
        why = [(line, k) for line, k in zip(lines, numbers) if line["supports"] == "why"]
        if why:
            page.append("<h3>Tại sao</h3>")
            page.append("<ol class=\"why\">")
            for layer in sorted({line["layer"] for line, _ in why}):
                notes = "; ".join(f'{_h(line["note"])}<sup><a href="#fn-{k}">{k}</a></sup>'
                                  for line, k in why if line["layer"] == layer)
                page.append(f"<li>Tầng {layer}: {notes}</li>")
            page.append("</ol>")
        page.append("</article>")
    page.append("</section>")

    page += ['<section id="unanswered">', "<h2>Những gì báo cáo chưa trả lời được</h2>", "<ul>"]
    for line in plan["unanswered"]:
        needs = f" Cần: {line['needs']}." if line["needs"] else ""
        page.append(f"<li>{_h(line['unknown'])} (bước {_h(line['step'])}): {_h(line['why'])}.{_h(needs)}</li>")
    page += ["</ul>", "</section>"]

    appendix = frame["_parts"][APPENDIX_PART]
    page += [f'<section id="part-{APPENDIX_PART}">', f"<h2>Phần {APPENDIX_PART}. {_h(appendix['title'])}</h2>",
             "<h3>Nguồn đã thu</h3>", "<table>", "<tr><th>Nguồn</th><th>Sàn</th><th>Số đã dùng</th></tr>",
             *_source_rows(frame, status, scope), "</table>", "<h3>Nguồn của từng con số</h3>", "<table>",
             "<tr><th>Số</th><th>Ở đâu</th><th>Ý hoặc dòng</th><th>Bước</th><th>Mức tin</th><th>Giả thuyết</th>"
             "<th>Tầng</th><th>Số đếm</th></tr>",
             *(_appendix_row(row, frame, current) for row in footnotes), "</table>", "</section>",
             "</body>", "</html>"]
    page_html = "\n".join(page) + "\n"
    parts_rows.append({"part": APPENDIX_PART, "title": appendix["title"], "status": STATUS_BUILT,
                       "content_sha256": None, "claims": 0, "lowest_confidence": None})

    keyword_source = frame["_sources"]["search_suggestions"]["name"]
    totals = {
        "themes": {"rows": themes_rows},
        "keywords": {"rows": [{"source": keyword_source, **{k: row[k] for k in (
            "group_key", "group_name", "step", "keywords", "threshold_met", "threshold_note", "count_id")}}
            for row in keyword_rows]},
        "portraits": {"rows": portrait_rows},
        "parts": {"rows": parts_rows},
    }
    payloads = [entry["payload"] for entry in ordered]
    archive_id = _sha256(_canonical({"run_id": full_id, "html": page_html, "totals": totals, "statements": payloads,
                                     "codebook_version": book["version"]}))
    with _report_store() as con:
        stored = con.execute("SELECT 1 FROM render_archive WHERE archive_id = ?", (archive_id,)).fetchone() is None
        if stored:
            con.execute("INSERT INTO render_archive VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
                archive_id, full_id, page_html, _canonical(totals), _canonical(payloads), book["version"],
                frame["version"], _stamp()))
    contents = {"report.html": page_html, "themes.json": _json_file(totals["themes"]),
                "keywords.json": _json_file(totals["keywords"]), "portraits.json": _json_file(totals["portraits"]),
                "parts.json": _json_file(totals["parts"])}
    out_dir = _data_dir() / "reports" / full_id
    out_dir.mkdir(parents=True, exist_ok=True)
    for name in REPORT_FILES:
        (out_dir / name).write_bytes(contents[name].encode("utf-8"))
    return {"run_id": full_id, "archive_id": archive_id, "stored": stored,
            "parts": {"written": len(written), "missing": len(missing), "stale": len(stale)}, "statements": len(ordered),
            "files": list(REPORT_FILES), "versions": {str(p): s["version"] for p, s in sorted(sections.items())},
            "statement_versions": {e["id"]: e["version"] for e in ordered}}


# ---------------------------------------------------------------------------
# Part 4: the claim layer (R-IM13 to R-IM18; CONTRACT.md PR 4 conventions)
# ---------------------------------------------------------------------------

CLAIMS_DIR = HERE / "claims"
CLAIM_TOOL = "claim_counts"
CLAIM_RULES_VERSION = "claim-2026-10-31.1"
CLAIM_KEEP = 0.70
CLAIM_UNCLEAR = 0.50
CLAIM_SPECIFIC = 0.50
CLAIM_SPAM = 0.70
CLAIM_GENERIC = 0.70
NEAR_DUP_MIN_WORDS = 8
NEAR_DUP_JACCARD = 0.80
BURST_DAYS = 7
BURST_SHARE = 0.40
BURST_MIN = 5
ONE_PRODUCT_SHARE = 0.80
OTHER_SHARE_E15 = 0.20
CATALOGUE_PACKET_MAX = 400
SATURATION_SEED = 42
SATURATION_STEP = 25
SATURATION_MENTIONS = 3
MAX_CLAIMS_PER_CATALOGUE = 12
MAX_CLAIM_NAME_WORDS = 7
GRADING_DRAWS = (("with_claim", 18), ("no_claim", 6), ("near_dup", 6))

ATTRIBUTE_LINE_RE = re.compile(r"^\s*[^:]{1,40}:")
JOINER_RE = re.compile(r"(?<! )  (?! )")
TZ_SUFFIX_RE = re.compile(r"(?:Z|[+-][0-9]{2}:[0-9]{2})$")
DATE_FORMATS = ("%Y-%m-%d", "%d/%m/%Y", "%Y/%m/%d")
UTC7 = timezone(timedelta(hours=7))

CLAIM_FLAGS = {"one_product": "chủ yếu từ một sản phẩm", "burst": "dồn thời gian", "both_platforms": "có ở cả 2 sàn"}
FLAG_KEYS = {phrase: key for key, phrase in CLAIM_FLAGS.items()}
CLAIM_FLAG_RES = {phrase: _phrase_re((phrase,)) for phrase in CLAIM_FLAGS.values()}
E15_NOTE = "Khác trên 20%: thu thêm tối đa 1 vòng hoặc ghi rõ phần Khác"
RANKING_MEASURE = "bằng chứng sau khi gộp lời gần trùng"
CLAIM_RANK_TERMS = ("nhiều nhất", "ít nhất", "phổ biến nhất", "nhiều hơn", "ít hơn", "phổ biến hơn", "đứng đầu",
                    "dẫn đầu", "hàng đầu", "xếp thứ", "xếp hạng", "thứ nhất", "thứ nhì", "top")
CLAIM_RANK_RE = _phrase_re(CLAIM_RANK_TERMS)
CLAIM_MEASURE_RE = _phrase_re(("bằng chứng",))
CLAIM_NUMBER_KEYS = ("evidence", "shops", "sample")
CLAIM_NUMBER_NAMES = {"evidence": "bằng chứng", "shops": "gian hàng", "sample": "đánh giá trong mẫu"}
CLAIM_QUESTIONS = {
    "CLAIM": (("CO", "Lời khách có nói ý con này"), ("KHONG", "Lời khách không nói ý con này")),
    "SPEC": (("CU_THE", "Lời cụ thể theo luật của chủ đề"), ("CHUNG_CHUNG", "Lời chung chung, không có chi tiết")),
    "RAC": (("THAT", "Lời nhận xét thật về sản phẩm"),
            ("RAC", "Văn rác: quảng cáo lạc đề, nội dung không liên quan hoặc chữ vô nghĩa")),
    "GEN": (("CO", "Lời khách có khen hoặc chê chủ đề này"), ("KHONG", "Lời khách không khen cũng không chê chủ đề này")),
}
VERDICTS = ("OK", "QUA_RONG", "QUA_HEP", "TEN_SAI", "NGOAI_CHU_DE")
CHONG_NGHIA = "CHONG_NGHIA:"
GRADER_FILES = (("r1-astra.out", 1, "astra"), ("r1-opus.out", 1, "opus"), ("r2-astra.out", 2, "astra"),
                ("r2-opus.out", 2, "opus"))
GRADE_SHAPES = {
    "round1": {"grader": "str", "catalogue": "catalogue", "missing": "missing", "items": "items",
               "dup_groups": "dup_groups", "method_gaps": "str"},
    "round2": {"grader": "str", "decisions": "decisions", "missing_agree": "strs", "method_gaps_comment": "str"},
    "catalogue": {"code": "str", "verdict": "str", "note": "str"},
    "missing": {"name": "str", "why": "str"},
    "items": {"id": "str", "ok": "bool", "wrong": "strs", "missed": "strs", "specific_ok": "bool", "note": "str"},
    "dup_groups": {"group": "str", "same_idea_copy": "bool", "note": "str"},
    "decisions": {"n": "int", "agree_other": "bool", "why": "str"},
}
GRADE_KEY_NAMES = frozenset(k for shape in GRADE_SHAPES.values() for k in shape)
PACKET_FILES = ("catalogue.json", "dup-groups.json", "prompt-r1.md", "sample.jsonl")
DRAFT_FILES = ("prompt-draft.md", "reviews.jsonl")


# --- dates, customer words and near duplicates (built by build_warehouse) ---

def _posted_date(value):
    """One source value as an ISO date in Asia/Ho_Chi_Minh time (IM-Q129), or None when it is not usable."""
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, str) and re.fullmatch(r"[0-9]+", value):
        value = int(value)
    if isinstance(value, (int, float)):
        if not math.isfinite(value):
            return None
        seconds = value / 1000 if value > 10 ** 11 else value
        try:
            return datetime.fromtimestamp(seconds, UTC7).date().isoformat()
        except (OverflowError, OSError, ValueError):
            return None
    if not isinstance(value, str):
        return None
    text = value.strip()
    if TZ_SUFFIX_RE.search(text):
        try:
            stamp = datetime.fromisoformat(text[:-1] + "+00:00" if text.endswith("Z") else text)
            if stamp.tzinfo is not None:
                return stamp.astimezone(UTC7).date().isoformat()
        except ValueError:
            pass
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(value[:10], fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _first_date(*values):
    """The first usable value wins."""
    return next((d for d in map(_posted_date, values) if d is not None), None)


def customer_words(text: str) -> str:
    """The review's own words (R-IM14): the first segment, then each later segment that is not an attribute line,
    joined with one space. Segments are split at each run of exactly two spaces (the joiner of IM-Q33)."""
    segments = JOINER_RE.split(text)
    kept = segments[:1] + [s for s in segments[1:] if not ATTRIBUTE_LINE_RE.match(s)]
    return " ".join(s for s in kept if s.strip())


def _dup_text(text: str) -> str:
    text = re.sub(r"[^\w\s]", " ", unicodedata.normalize("NFC", text).lower())
    return re.sub(r"\s+", " ", text).strip()


def near_dup_groups(items) -> dict:
    """Near-duplicate groups over (review_id, customer words) pairs (IM-Q146): texts of at least 8 words whose
    character 4-gram sets have a Jaccard index of at least 0.80 are joined; groups are connected components, named
    by their smallest review ID. Candidate pairs come from a prefix filter, then each pair is checked exactly."""
    grams = {}
    for review_id, text in items:
        norm = _dup_text(text)
        if len(norm.split(" ")) >= NEAR_DUP_MIN_WORDS:
            grams[review_id] = {norm[i:i + 4] for i in range(len(norm) - 3)}
    frequency = {}
    for found in grams.values():
        for gram in found:
            frequency[gram] = frequency.get(gram, 0) + 1
    share = Fraction(str(NEAR_DUP_JACCARD))
    parent = {review_id: review_id for review_id, _ in items}

    def root(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    index = {}
    for review_id in sorted(grams):
        found = grams[review_id]
        ordered = sorted(found, key=lambda g: (frequency[g], g))
        prefix = ordered[:len(ordered) - math.ceil(share * len(ordered)) + 1]
        candidates = {other for gram in prefix for other in index.get(gram, ())}
        for other in sorted(candidates):
            theirs = grams[other]
            together = len(found & theirs)
            if Fraction(together, len(found) + len(theirs) - together) >= share:
                low, high = sorted((root(review_id), root(other)))
                parent[high] = low
        for gram in prefix:
            index.setdefault(gram, []).append(review_id)
    members = {}
    for review_id in parent:
        members.setdefault(root(review_id), []).append(review_id)
    return {review_id: min(group) for group in members.values() for review_id in group}


# --- shared claim helpers ---

def _ratio_at_least(part: int, whole: int, share: float) -> bool:
    """The exact ratio part / whole compared with a share constant, never a rounded value."""
    return whole > 0 and Fraction(part, whole) >= Fraction(str(share))


def _rounded(part: int, whole: int, places: int):
    if not whole:
        return None
    value = Decimal(part) / Decimal(whole)
    return float(value.quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP))


def _check_theme(book: dict, theme_code) -> str:
    if not isinstance(theme_code, str) or theme_code not in _theme_codes(book):
        raise InsightError("INVALID_ARGUMENT", "theme_code must be a theme code of the codebook")
    return theme_code


def _check_version(version) -> int:
    if not _int(version) or version < 1:
        raise InsightError("INVALID_ARGUMENT", "catalogue_version must be a positive integer")
    return version


def _check_seed(seed) -> int:
    if not _int(seed):
        raise InsightError("INVALID_ARGUMENT", "seed must be an integer")
    return seed


def _claim_ready(wh) -> None:
    """The claim tools need the current warehouse, including shop identity separate from product keys."""
    columns = {row[1] for row in wh.execute("PRAGMA table_info(review)")}
    tables = {row[0] for row in wh.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    if not {"posted_date", "shop_key"} <= columns or not {"near_dup", "claim_catalogue"} <= tables:
        raise InsightError("WAREHOUSE_REBUILD_NEEDED", "this warehouse needs the current product and claim schema; "
                                                       "call build_warehouse again")


def _claim_warehouse(run_id) -> Path:
    path = _find_warehouse(run_id)
    with _warehouse_ro(path) as wh:
        _claim_ready(wh)
    return path


def _stored_catalogue(wh, theme_code: str, version: int) -> dict:
    row = wh.execute("SELECT catalogue_json FROM claim_catalogue WHERE theme_code = ? AND catalogue_version = ?",
                     (theme_code, version)).fetchone()
    if row is None:
        raise InsightError("CATALOGUE_NOT_FOUND", "no stored claim catalogue of this theme has this version")
    return json.loads(row[0])


def _catalogue_status(wh, theme_code: str, version: int) -> str:
    row = wh.execute("SELECT status FROM claim_grade WHERE theme_code = ? AND catalogue_version = ? "
                     "ORDER BY rowid DESC LIMIT 1", (theme_code, version)).fetchone()
    return row[0] if row else "DRAFT"


def _current_norm(wh) -> str:
    target = wh.execute("SELECT block_key FROM coding_target ORDER BY target_id DESC LIMIT 1").fetchone()
    if target is None:
        raise InsightError("NOT_CODED", "no review of this run is coded yet")
    return _block_norm(target[0])


def claim_input(text: str, platform: str, product_name, theme_code: str, catalogue_version: int) -> dict:
    return {"text": text, "platform": platform, "product_name": product_name, "theme_code": theme_code,
            "catalogue_version": catalogue_version}


def _theme_reviews(wh, book: dict, theme_code: str, version: int | None = None) -> list[dict]:
    """The theme's reviews: a counted kept label of the theme under the current coding target (IM-Q45), in
    review_id order, with their customer words and, for a catalogue version, their claim coding state."""
    norm = _current_norm(wh)
    rows = wh.execute(
        "SELECT v.review_id, v.platform, v.polarity, v.product_key, t.text, p.product_name, r.posted_date, r.shop_key "
        "FROM v_theme_label v JOIN review r ON r.review_id = v.review_id "
        "JOIN review_text t ON t.review_id = v.review_id LEFT JOIN product p ON p.product_key = v.product_key "
        "WHERE v.codebook_version = ? AND v.block_norm = ? AND v.theme_code = ? ORDER BY v.review_id",
        (book["version"], norm, theme_code)).fetchall()
    states = {} if version is None else {row[0]: row[1:] for row in wh.execute(
        "SELECT review_id, input_sha256, spec_p, rac_p, gen_p FROM claim_coding_state "
        "WHERE theme_code = ? AND catalogue_version = ? AND status = 'done'", (theme_code, version))}
    out = []
    for review_id, platform, polarity, product_key, text, product_name, posted, shop_key in rows:
        words = customer_words(text)
        review = {"review_id": review_id, "platform": platform, "polarity": polarity, "product_key": product_key,
                  "product_name": product_name, "words": words, "posted_date": posted, "shop_key": shop_key,
                  "coded": False}
        if version is not None:
            review["input_sha256"] = _sha256(_canonical(claim_input(words, platform, product_name, theme_code, version)))
            state = states.get(review_id)
            if words.strip() and state is not None and state[0] == review["input_sha256"]:
                review.update(coded=True, spec_p=state[1], rac_p=state[2], gen_p=state[3])
        if not words.strip():
            review["kind"] = "attribute_only"
        elif not review["coded"]:
            review["kind"] = "uncoded"
        else:
            review["kind"] = "spam" if review["rac_p"] >= CLAIM_SPAM else "sample"
        out.append(review)
    return out


def _labels(wh, theme_code: str, version: int) -> dict:
    """review_id -> {"kept": [codes], "unclear": [codes]} for a theme and catalogue version."""
    out = {}
    for review_id, code, status in wh.execute(
            "SELECT review_id, claim_code, status FROM claim_label WHERE theme_code = ? AND catalogue_version = ? "
            "ORDER BY review_id, claim_code", (theme_code, version)):
        out.setdefault(review_id, {"kept": [], "unclear": []})[status].append(code)
    return out


def _out_dir(out_dir) -> Path:
    """IM-Q133: an absolute path outside the repository and the app home, missing or an empty directory."""
    if not isinstance(out_dir, str) or not out_dir or not Path(out_dir).is_absolute():
        raise InsightError("OUT_DIR_INVALID", "out_dir must be an absolute path")
    path = Path(out_dir).resolve()
    repo = next((p for p in (HERE, *HERE.parents) if (p / ".git").exists()), HERE)
    forbidden = [repo]
    app_db = os.environ.get("INSIGHT_MCP_APP_DB")
    if app_db:
        db = Path(app_db).expanduser()
        forbidden += [db.parent, _artifact_root(db), _capture_root(db)]
    snapshot = os.environ.get("INSIGHT_MCP_APP_DB_SNAPSHOT")
    if snapshot:
        forbidden.append(Path(snapshot).expanduser().parent)
    if any(path == f.resolve() or path.is_relative_to(f.resolve()) for f in forbidden):
        raise InsightError("OUT_DIR_INVALID", "out_dir must be outside the repository and the app home")
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise InsightError("OUT_DIR_INVALID", "out_dir must be missing or an empty directory")
    return path


def _write_files(directory: Path, contents: dict) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    for name, text in contents.items():
        (directory / name).write_bytes(text.encode("utf-8"))


def _jsonl(rows) -> str:
    return "".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows)


def _packet_digest(contents: dict) -> str:
    return _sha256(json.dumps(contents, sort_keys=True, ensure_ascii=False, separators=(",", ":")))[:12]


def _template(name: str) -> str:
    return (CLAIMS_DIR / name).read_text(encoding="utf-8")


# --- claim_catalogue_packet (IM-Q163) ---

@mcp.tool()
@_tool
def claim_catalogue_packet(run_id: str, theme_code: str, out_dir: str, seed: int) -> dict:
    """Write the drafting input for the external agent that drafts a claim catalogue (open question 37): the
    theme's customer words and the filled drafting prompt, into out_dir outside the repository. The MCP makes no
    AI call; the draft comes back only through submit_claim_catalogue. Returns counts only."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    seed = _check_seed(seed)
    target = _out_dir(out_dir)
    path = _claim_warehouse(run_id)
    with _warehouse_ro(path) as wh:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        reviews = _theme_reviews(wh, book, theme_code)
        groups = dict(wh.execute("SELECT review_id, group_id FROM near_dup").fetchall())
    pool = [r for r in reviews if r["kind"] != "attribute_only"]
    copies, first = {}, {}
    for review in pool:
        group = groups.get(review["review_id"], review["review_id"])
        copies[group] = copies.get(group, 0) + 1
        first.setdefault(group, review)
    lines = [(r, copies[groups.get(r["review_id"], r["review_id"])]) for r in pool if first[
        groups.get(r["review_id"], r["review_id"])] is r]
    sampled = len(lines) > CATALOGUE_PACKET_MAX
    if sampled:
        chosen = {id(line[0]) for line in random.Random(seed).sample(lines, CATALOGUE_PACKET_MAX)}
        lines = [line for line in lines if id(line[0]) in chosen]
    aliases, rows = {}, []
    for n, (review, count) in enumerate(lines, 1):
        product = aliases.setdefault(review["product_key"], f"P{len(aliases) + 1}")
        rows.append({"id": f"R{n:03d}", "platform": review["platform"], "product": product,
                     "polarity": review["polarity"], "copies": count, "text": review["words"]})
    prompt = _template("prompt-draft.md")
    for token, value in (("{theme_code}", theme_code), ("{theme_name}", _theme_codes(book)[theme_code]),
                         ("{code_prefix}", f"Y-{theme_code[2:]}-"), ("{line_count}", str(len(rows)))):
        prompt = prompt.replace(token, value)
    contents = {"prompt-draft.md": prompt, "reviews.jsonl": _jsonl(rows)}
    packet_id = "CDP-" + _packet_digest(contents)
    files = list(DRAFT_FILES) + ["packet.json"]
    contents["packet.json"] = _json_file({
        "packet_id": packet_id, "run_id": full_id, "theme_code": theme_code, "codebook_version": book["version"],
        "seed": seed, "reviews": len(rows), "sampled": sampled, "files": list(DRAFT_FILES)})
    _write_files(target, contents)
    return {"run_id": full_id, "theme_code": theme_code, "packet_id": packet_id, "files": files,
            "reviews": len(rows), "merged": len(pool) - len(first), "attribute_only": len(reviews) - len(pool),
            "sampled": sampled}


# --- submit_claim_catalogue (IM-Q131, IM-Q132) ---

def _quote_rule(text: str, reviews: dict, *, min_short_words: int = 1):
    words = _words(text)
    for i in range(len(words)):
        if words[i:i + QUOTE_WORDS] in reviews["runs"]:
            return "quote_8_words"
    for i in range(len(words)):
        if any(n >= min_short_words and words[i:i + n] in group for n, group in reviews["short"].items()):
            return "whole_short_review"
    return None


def _check_catalogue(catalogue, theme_code: str, reviews: dict, writer_keys: set, private_ids: set) -> None:
    def bad(rule: str, where: str):
        raise InsightError("CATALOGUE_INVALID", f"catalogue rule {rule} failed at {where}")

    required = {"version", "theme", "specific_rule", "claims"}
    if not isinstance(catalogue, dict) or not required <= set(catalogue) or not set(catalogue) <= required | {"notes"}:
        bad("keys", "$")
    if not _text(catalogue["version"]):
        bad("non_blank", "$.version")
    if catalogue["theme"] != theme_code:
        bad("theme", "$.theme")
    if not _text(catalogue["specific_rule"]):
        bad("non_blank", "$.specific_rule")
    if "notes" in catalogue and not isinstance(catalogue["notes"], str):
        bad("type", "$.notes")
    claims = catalogue["claims"]
    if not isinstance(claims, list) or not 1 <= len(claims) <= MAX_CLAIMS_PER_CATALOGUE:
        bad("claim_count", "$.claims")
    code_re = re.compile(re.escape(f"Y-{theme_code[2:]}-") + r"[0-9]{2}")
    codes, texts = set(), [("$.version", catalogue["version"]), ("$.specific_rule", catalogue["specific_rule"])]
    if "notes" in catalogue:
        texts.append(("$.notes", catalogue["notes"]))
    for i, claim in enumerate(claims):
        where = f"$.claims[{i}]"
        if not isinstance(claim, dict) or set(claim) != {"code", "name", "include", "exclude", "generic"}:
            bad("keys", where)
        if not isinstance(claim["code"], str) or not code_re.fullmatch(claim["code"]) or claim["code"] in codes:
            bad("code", f"{where}.code")
        codes.add(claim["code"])
        for field in ("name", "include", "exclude"):
            if not _text(claim[field]):
                bad("non_blank", f"{where}.{field}")
            texts.append((f"{where}.{field}", claim[field]))
        if len(_words(claim["name"])) > MAX_CLAIM_NAME_WORDS:
            bad("name_words", f"{where}.name")
        if not isinstance(claim["generic"], bool):
            bad("type", f"{where}.generic")
    if sum(claim["generic"] for claim in claims) != 1:
        bad("one_generic", "$.claims")
    for where, text in texts:
        if len(text) > MAX_FIELD_CHARS:
            bad("length", where)
        # Catalogue guidance can share common 1–3-word phrases with short reviews (IM-Q131).
        # Grader output and report submissions retain their stricter quote checks.
        rule = _quote_rule(text, reviews, min_short_words=1 if where == "$.version" else 4)
        if rule:
            bad(rule, where)
        if hidden_name_hits(unicodedata.normalize("NFC", text)):
            bad("hidden_name", where)
        if _writer_name_hit(text, writer_keys):
            bad("writer_name", where)
        if any(value in text for value in private_ids):
            bad("private_id", where)


@mcp.tool()
@_tool
def submit_claim_catalogue(run_id: str, theme_code: str, catalogue: dict) -> dict:
    """Store a claim catalogue for one theme (R-IM13), drafted outside the MCP from the run's customer words. Each
    accepted submit is a new version that is never changed; it starts DRAFT until record_claim_grades passes it."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    path = _claim_warehouse(run_id)
    with _warehouse_ro(path) as wh:
        private_ids = {r for (r,) in wh.execute("SELECT review_id FROM review")} \
            | {r for (r,) in wh.execute("SELECT writer_key FROM review")} \
            | {r for (r,) in wh.execute("SELECT product_key FROM review")}
        writer_keys = {r for (r,) in wh.execute("SELECT DISTINCT writer_key FROM review WHERE writer_known = 1")}
    _check_catalogue(catalogue, theme_code, _review_words(path), writer_keys, private_ids)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        with _tx(wh):
            version = 1 + wh.execute("SELECT COALESCE(MAX(catalogue_version), 0) FROM claim_catalogue "
                                     "WHERE theme_code = ?", (theme_code,)).fetchone()[0]
            wh.execute("INSERT INTO claim_catalogue VALUES (?, ?, ?, ?, ?, ?)", (
                theme_code, version, catalogue["version"],
                json.dumps(catalogue, ensure_ascii=False, separators=(",", ":")), book["version"],
                datetime.now(timezone.utc).isoformat(timespec="seconds")))
    finally:
        wh.close()
    return {"run_id": full_id, "theme_code": theme_code, "catalogue_version": version, "status": "DRAFT",
            "claims": len(catalogue["claims"])}


# --- code_claims (IM-Q139 to IM-Q145) ---

def _question(code: str, name: str, include: str, exclude: str, kind: str) -> dict:
    return {"code": code, "name": name, "include": include, "exclude": exclude,
            "options": [{"key": key, "meaning": meaning} for key, meaning in CLAIM_QUESTIONS[kind]]}


def build_claim_request(catalogue: dict, theme_name: str, version: int, review: dict) -> dict:
    """One Jev request per review (IM-Q142): customer words, platform, product name, theme name, catalogue version
    and the questions. No review ID, writer key, writer name, product key or URL."""
    questions = [_question(c["code"], c["name"], c["include"], c["exclude"], "CLAIM")
                 for c in catalogue["claims"] if not c["generic"]]
    questions += [
        _question("SPEC", "Lời cụ thể", catalogue["specific_rule"], "", "SPEC"),
        _question("RAC", "Văn rác", "Quảng cáo lạc đề, nội dung không liên quan đến sản phẩm hoặc chữ vô nghĩa", "",
                  "RAC"),
        _question("GEN", "Khen hoặc chê chủ đề", f"Lời khách khen hoặc chê {theme_name}, dù không nói chi tiết", "",
                  "GEN"),
    ]
    return {"kind": "claims", "text": review["words"], "platform": review["platform"],
            "product_name": review["product_name"], "theme_name": theme_name, "catalogue_version": version,
            "questions": questions}


def parse_claim_answer(book: dict, body: dict, status, raw) -> dict:
    """Check one Jev claim answer (IM-Q143). Raises _CallFailed with JEV_CLAIM_UNAVAILABLE or JEV_CLAIM_INVALID."""
    if status != 200:
        raise _CallFailed("JEV_CLAIM_UNAVAILABLE")
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        raise _CallFailed("JEV_CLAIM_UNAVAILABLE") from None
    if not isinstance(payload, dict):
        raise _CallFailed("JEV_CLAIM_UNAVAILABLE")
    if payload.get("model") != JEV_MODEL or not isinstance(payload.get("answers"), dict):
        raise _CallFailed("JEV_CLAIM_INVALID")
    answers = payload["answers"]
    if set(answers) != {q["code"] for q in body["questions"]}:
        raise _CallFailed("JEV_CLAIM_INVALID")
    tolerance = book["thresholds"]["probabilitySumTolerance"]
    out = {}
    for question in body["questions"]:
        options = [o["key"] for o in question["options"]]
        answer = answers[question["code"]]
        if not isinstance(answer, dict) or answer.get("type") != "choice" or answer.get("choice") not in options:
            raise _CallFailed("JEV_CLAIM_INVALID")
        probs = answer.get("probabilities")
        if not isinstance(probs, dict) or set(probs) != set(options) \
                or not all(_number(v) and 0 <= v <= 1 for v in probs.values()):
            raise _CallFailed("JEV_CLAIM_INVALID")
        if abs(sum(probs.values()) - 1) > tolerance + 1e-9:
            raise _CallFailed("JEV_CLAIM_INVALID")
        confidence = answer.get("confidence")
        if not _number(confidence) or not 0 <= confidence <= 1:
            raise _CallFailed("JEV_CLAIM_INVALID")
        out[question["code"]] = probs
    return out


def claim_label_rows(catalogue: dict, answers: dict) -> list[dict]:
    """Kept and unclear claim labels from checked answers (IM-Q144). The generic claim is decided after the call."""
    rows = []
    for claim in catalogue["claims"]:
        if claim["generic"]:
            continue
        p_co = answers[claim["code"]]["CO"]
        if p_co >= CLAIM_UNCLEAR:
            rows.append({"claim_code": claim["code"], "p_co": p_co, "status": "kept" if p_co >= CLAIM_KEEP else "unclear"})
    if not any(row["status"] == "kept" for row in rows):
        gen = answers["GEN"]["CO"]
        generic = next(c["code"] for c in catalogue["claims"] if c["generic"])
        if gen >= CLAIM_UNCLEAR:
            rows.append({"claim_code": generic, "p_co": gen, "status": "kept" if gen >= CLAIM_GENERIC else "unclear"})
    return rows


@mcp.tool()
@_tool
def code_claims(run_id: str, theme_code: str, catalogue_version: int, dry_run: bool = True,
                max_calls: int | None = None) -> dict:
    """Plan (dry_run, default) or run Jev claim coding of one theme's reviews under one catalogue version, on the
    customer words only. A real run needs INSIGHT_MCP_ALLOW_PAID=1 and max_calls; it stops at the cap and at the
    first failed call."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    version = _check_version(catalogue_version)
    if not isinstance(dry_run, bool):
        raise InsightError("INVALID_ARGUMENT", "dry_run must be true or false")
    if max_calls is not None and not _int(max_calls):
        raise InsightError("MAX_CALLS_INVALID", "max_calls must be an integer or null")
    path = _claim_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        catalogue = _stored_catalogue(wh, theme_code, version)
        status = _catalogue_status(wh, theme_code, version)
        reviews = _theme_reviews(wh, book, theme_code, version)
        platforms = [r[0] for r in wh.execute("SELECT DISTINCT platform FROM review ORDER BY 1")]
        eligible = [r for r in reviews if r["kind"] == "uncoded"]
        attribute_only = [r for r in reviews if r["kind"] == "attribute_only"]
        limit = book["limits"]["maxCallsPerRun"]
        cap = limit if max_calls is None else max(0, min(max_calls, limit))
        planned = min(len(eligible), cap)

        def by_platform(items):
            counts = {p: 0 for p in platforms}
            for item in items:
                counts[item["platform"]] = counts.get(item["platform"], 0) + 1
            return counts

        base = {"run_id": full_id, "theme_code": theme_code, "catalogue_version": version, "catalogue_status": status,
                "eligible_reviews": len(eligible), "eligible_by_platform": by_platform(eligible),
                "attribute_only": len(attribute_only), "attribute_only_by_platform": by_platform(attribute_only),
                "already_coded": sum(r["coded"] for r in reviews), "planned_calls": planned,
                "questions_per_call": sum(not c["generic"] for c in catalogue["claims"]) + 3}
        if dry_run:
            return {**base, "dry_run": True, "jev_calls": 0}
        if os.environ.get("INSIGHT_MCP_ALLOW_PAID") != "1":
            return {**base, "dry_run": False, "refused": True, "reason": "PAID_FLAG_MISSING", "jev_calls": 0,
                    "message": "a real Jev run needs INSIGHT_MCP_ALLOW_PAID=1, set by the owner"}
        if max_calls is None or not 1 <= max_calls <= limit:
            raise InsightError("MAX_CALLS_INVALID", f"a real run needs max_calls from 1 to {limit}")
        key = _read_key()
        theme_name = _theme_codes(book)[theme_code]
        calls, done, stopped = 0, 0, None
        for review in eligible:
            if calls >= max_calls:
                stopped = "CAP_REACHED"
                break
            body = build_claim_request(catalogue, theme_name, version, review)
            calls += 1
            try:
                try:
                    status_code, raw = _jev_transport(body, key)
                except Exception:  # noqa: BLE001 - any transport failure; its text may hold the key
                    raise _CallFailed("JEV_CLAIM_UNAVAILABLE") from None
                answers = parse_claim_answer(book, body, status_code, raw)
            except _CallFailed as failure:
                stopped = failure.stop
                break
            rows = claim_label_rows(catalogue, answers)
            with _tx(wh):
                wh.execute("DELETE FROM claim_label WHERE review_id = ? AND theme_code = ? AND catalogue_version = ?",
                           (review["review_id"], theme_code, version))
                wh.executemany("INSERT INTO claim_label VALUES (?, ?, ?, ?, ?, ?)",
                               [(review["review_id"], theme_code, version, row["claim_code"], row["p_co"],
                                 row["status"]) for row in rows])
                wh.execute("INSERT OR REPLACE INTO claim_coding_state VALUES (?, ?, ?, ?, ?, ?, ?, 'done')", (
                    review["review_id"], theme_code, version, review["input_sha256"], answers["SPEC"]["CU_THE"],
                    answers["RAC"]["RAC"], answers["GEN"]["CO"]))
            done += 1
        if stopped is None and done < len(eligible):
            stopped = "CAP_REACHED"
        return {**base, "dry_run": False, "calls_made": calls, "coded_now": done, "remaining": len(eligible) - done,
                "stopped": stopped or "COMPLETE"}
    finally:
        wh.close()


# --- claim_counts (IM-Q147 to IM-Q157) ---

REF_CLAIM_LABEL = """
SELECT r.platform, l.claim_code{dims}, {measures}
FROM claim_label l
JOIN claim_scope s ON s.review_id = l.review_id AND s.theme_code = l.theme_code
     AND s.catalogue_version = l.catalogue_version AND s.kind = 'sample'
JOIN review r ON r.review_id = l.review_id
JOIN near_dup n ON n.review_id = l.review_id
WHERE l.status = 'kept' AND l.theme_code = ? AND l.catalogue_version = ?
GROUP BY r.platform, l.claim_code{dims}
"""
REF_CLAIM_LABEL_MEASURES = ("COUNT(DISTINCT r.review_id), COUNT(DISTINCT n.group_id), COUNT(DISTINCT r.writer_key), "
                            "COUNT(DISTINCT r.product_key), COUNT(DISTINCT s.shop_key), SUM(s.specific), "
                            "SUM(1 - r.writer_known)")
REF_CLAIM_REVIEW = """
SELECT s.platform{dims}, {measures}
FROM claim_scope s
JOIN review r ON r.review_id = s.review_id
LEFT JOIN (SELECT review_id, theme_code, catalogue_version, COUNT(*) AS mentions FROM claim_label
           WHERE status = 'kept' GROUP BY review_id, theme_code, catalogue_version) k
     ON k.review_id = s.review_id AND k.theme_code = s.theme_code AND k.catalogue_version = s.catalogue_version
WHERE s.theme_code = ? AND s.catalogue_version = ?
GROUP BY s.platform{dims}
"""
REF_CLAIM_REVIEW_MEASURES = (
    "SUM(CASE WHEN s.kind = 'sample' THEN 1 ELSE 0 END), SUM(CASE WHEN s.kind = 'attribute_only' THEN 1 ELSE 0 END), "
    "SUM(CASE WHEN s.kind = 'spam' THEN 1 ELSE 0 END), "
    "SUM(CASE WHEN s.kind = 'sample' AND k.mentions IS NULL THEN 1 ELSE 0 END), "
    "SUM(CASE WHEN s.kind = 'sample' THEN COALESCE(k.mentions, 0) ELSE 0 END)")
REF_SAMPLE_MEASURE = "SUM(CASE WHEN s.kind = 'sample' THEN 1 ELSE 0 END)"
DATE_DIM = ", COALESCE(r.posted_date, '')"


def _max_window(counts: dict) -> int:
    """The largest number of reviews in any BURST_DAYS consecutive calendar days (d to d + 6)."""
    days = sorted((datetime.fromisoformat(d).date(), n) for d, n in counts.items() if d)
    best, total, low = 0, 0, 0
    for day, n in days:
        total += n
        while (day - days[low][0]).days >= BURST_DAYS:
            total -= days[low][1]
            low += 1
        best = max(best, total)
    return best


def _saturation(order: list[str], mentions: dict) -> dict:
    """IM-Q155: walk the seeded order and note where each claim reaches SATURATION_MENTIONS kept mentions."""
    order = sorted(order)
    random.Random(SATURATION_SEED).shuffle(order)
    counts, reached = {}, []
    for position, review_id in enumerate(order, 1):
        for code in mentions.get(review_id, ()):
            counts[code] = counts.get(code, 0) + 1
            if counts[code] == SATURATION_MENTIONS:
                reached.append(position)
    marks = [k for k in range(SATURATION_STEP, len(order) + 1, SATURATION_STEP)]
    if order and (not marks or marks[-1] != len(order)):
        marks.append(len(order))
    return {"seed": SATURATION_SEED, "reviews": len(order), "curve": [[k, sum(p <= k for p in reached)] for k in marks],
            "claims_reaching_3": len(reached), "last_new_claim_at": max(reached) if reached else None}


def _claim_state_sha(wh, theme_code: str, version: int) -> str:
    """IM-Q154: the IM-Q30 state sha256 plus the claim coding state and labels of this theme and version and the
    near-duplicate groups. The IM-Q30 state itself is unchanged."""
    states = wh.execute("SELECT review_id, input_sha256, spec_p, rac_p, gen_p, status FROM claim_coding_state "
                        "WHERE theme_code = ? AND catalogue_version = ? ORDER BY 1", (theme_code, version)).fetchall()
    labels = wh.execute("SELECT review_id, claim_code, p_co, status FROM claim_label WHERE theme_code = ? "
                        "AND catalogue_version = ? ORDER BY 1, 2", (theme_code, version)).fetchall()
    groups = wh.execute("SELECT review_id, group_id FROM near_dup ORDER BY 1").fetchall()
    return _sha256(_state_sha(wh) + _canonical({"claim_coding_state": states, "claim_label": labels,
                                               "near_dup": groups}))


def _claim_counts_at(path: Path, book: dict, theme_code: str, version: int) -> dict:
    """The claim_counts result for one warehouse file, registered in its count_registry (IM-Q148, IM-Q154)."""
    codes = _theme_codes(book)
    wh = _open_warehouse(path)
    try:
        _claim_ready(wh)
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        catalogue = _stored_catalogue(wh, theme_code, version)
        status = _catalogue_status(wh, theme_code, version)
        reviews = _theme_reviews(wh, book, theme_code, version)
        codable = [r for r in reviews if r["kind"] != "attribute_only"]
        if codable and not any(r["coded"] for r in codable):
            raise InsightError("NOT_CODED", "no review of this theme is coded under this catalogue version")
        scope = [(r["review_id"], r["platform"], theme_code, version, r["kind"],
                  int(r["kind"] == "sample" and r["spec_p"] >= CLAIM_SPECIFIC), r["shop_key"])
                 for r in reviews if r["kind"] != "uncoded"]
        params = (theme_code, version)
        filters = [f"theme_code = {_sql_literal(theme_code)}", f"catalogue_version = {version}"]
        label_measures = ["n_reviews", "n_evidence", "n_writers", "n_products", "n_shops", "n_specific",
                          "n_unknown_writer"]
        review_measures = ["n_sample", "n_attribute_only", "n_spam", "n_no_claim", "n_claim_mentions"]
        with _warehouse_copy(path) as copy:
            counter = _open_warehouse(copy)
            try:
                with _tx(counter):
                    for statement in CLAIM_COUNT_SCHEMA.strip().split(";\n"):
                        counter.execute(statement)
                    counter.executemany("INSERT INTO claim_scope VALUES (?, ?, ?, ?, ?, ?, ?)", scope)
                slayer = _Slayer(copy)
                try:
                    def label_query(dims, sql_dims, measures, sql_measures):
                        return _verified(slayer, counter, "claim_label", measures, ["platform", "claim_code"] + dims,
                                         filters, REF_CLAIM_LABEL.format(dims=sql_dims, measures=sql_measures), params)

                    def review_query(dims, sql_dims, measures, sql_measures):
                        return _verified(slayer, counter, "claim_review", measures, ["platform"] + dims, filters,
                                         REF_CLAIM_REVIEW.format(dims=sql_dims, measures=sql_measures), params)

                    main = label_query([], "", label_measures, REF_CLAIM_LABEL_MEASURES)
                    by_product = label_query(["product_key"], ", r.product_key", ["n_reviews"],
                                             "COUNT(DISTINCT r.review_id)")
                    by_date = label_query(["posted_date"], DATE_DIM, ["n_reviews"], "COUNT(DISTINCT r.review_id)")
                    by_review = label_query(["review_id"], ", r.review_id", ["n_reviews"], "COUNT(DISTINCT r.review_id)")
                    theme_rows = review_query([], "", review_measures, REF_CLAIM_REVIEW_MEASURES)
                    theme_dates = review_query(["posted_date"], DATE_DIM, ["n_sample"], REF_SAMPLE_MEASURE)
                    samples = review_query(["review_id"], ", s.review_id", ["n_sample"], REF_SAMPLE_MEASURE)
                finally:
                    slayer.close()
            finally:
                counter.close()

        order = {c["code"]: i for i, c in enumerate(catalogue["claims"])}
        claims = {c["code"]: c for c in catalogue["claims"]}
        top, dates = {}, {}
        for row in by_product:
            key = (row["platform"], row["claim_code"])
            top[key] = max(top.get(key, 0), row["n_reviews"])
        for row in by_date:
            dates.setdefault((row["platform"], row["claim_code"]), {})[row["posted_date"]] = row["n_reviews"]
        per_platform = {}
        for row in main:
            per_platform.setdefault(row["claim_code"], set()).add(row["platform"])
        theme = {row["platform"]: row for row in theme_rows}
        periods = {}
        for row in theme_dates:
            if row["posted_date"] and row["n_sample"]:
                periods.setdefault(row["platform"], []).append((row["posted_date"], row["n_sample"]))

        rows = []
        for row in sorted(main, key=lambda r: (r["platform"], order[r["claim_code"]])):
            key, code = (row["platform"], row["claim_code"]), row["claim_code"]
            reviews_n, evidence = row["n_reviews"], row["n_evidence"]
            counted_dates = dates.get(key, {})
            dated = sum(n for d, n in counted_dates.items() if d)
            max7 = _max_window(counted_dates)
            flags = []
            if _ratio_at_least(top[key], reviews_n, ONE_PRODUCT_SHARE):
                flags.append(CLAIM_FLAGS["one_product"])
            if reviews_n >= BURST_MIN and _ratio_at_least(max7, reviews_n, BURST_SHARE):
                flags.append(CLAIM_FLAGS["burst"])
            both = len(per_platform[code]) > 1
            if both:
                flags.append(CLAIM_FLAGS["both_platforms"])
            threshold = _review_threshold(reviews_n, row["n_writers"], row["n_products"], row["n_unknown_writer"])
            rows.append({
                "platform": row["platform"], "theme_code": theme_code, "catalogue_version": version, "claim_code": code,
                "claim_name": claims[code]["name"], "generic": claims[code]["generic"], "step": STEP_AFTER_PURCHASE,
                "reviews": reviews_n, "evidence": evidence, "merged_reviews": reviews_n - evidence,
                **{k: threshold[k] for k in ("writers", "writer_basis", "threshold_count", "threshold_met",
                                             "threshold_note")},
                "products": row["n_products"], "shops": row["n_shops"],
                "top_product_share": _rounded(top[key], reviews_n, 2),
                "specific": row["n_specific"], "specific_share": _rounded(row["n_specific"], reviews_n, 2),
                "dated_reviews": dated, "max_7day": max7, "flags": sorted(flags), "on_both_platforms": both,
                "_top": top[key]})

        mentions = {}
        for row in by_review:
            mentions.setdefault(row["review_id"], []).append(row["claim_code"])
        platforms = {}
        for platform in sorted(theme):
            counted = theme[platform]
            sample, no_claim = counted["n_sample"], counted["n_no_claim"]
            dated = sorted(periods.get(platform, []))
            share = _rounded(no_claim, sample, 4)
            e15 = sample > 0 and Fraction(no_claim, sample) > Fraction(str(OTHER_SHARE_E15))
            entry = {"sample": sample, "attribute_only": counted["n_attribute_only"], "spam": counted["n_spam"],
                     "no_claim": no_claim, "no_claim_share": share, "e15": e15}
            if e15:
                entry["e15_note"] = E15_NOTE
            sample_ids = [row["review_id"] for row in samples if row["platform"] == platform and row["n_sample"]]
            entry.update({
                "claims_per_review": _rounded(counted["n_claim_mentions"], sample, 2),
                "period": [dated[0][0], dated[-1][0]] if dated else None, "dated_sample": sum(n for _, n in dated),
                "saturation": _saturation(sample_ids, mentions)})
            platforms[platform] = entry

        rules = f"{book['version']}+{CLAIM_RULES_VERSION}"
        state = _claim_state_sha(wh, theme_code, version)
        pending, seen = [], set()
        for row in rows:
            entry = platforms[row["platform"]]
            period = entry["period"] or [None, None]
            row_key = [row["platform"], theme_code, version, row["claim_code"]]
            numbers = {k: row[k] for k in ("reviews", "evidence", "merged_reviews", "writers", "products", "shops")}
            numbers.update(top_product_reviews=row.pop("_top"), specific=row["specific"],
                           dated_reviews=row["dated_reviews"], max_7day=row["max_7day"],
                           threshold_count=row["threshold_count"], threshold_met=row["threshold_met"],
                           sample=entry["sample"], period_first=period[0], period_last=period[1],
                           flags=row["flags"], catalogue_status=status)
            count_id = _count_id(full_id, CLAIM_TOOL, row_key, rules, numbers, state)
            if count_id in seen:
                raise InsightError("COUNT_ID_CONFLICT", "two rows in one response got the same count ID")
            seen.add(count_id)
            stored = wh.execute("SELECT numbers_json FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
            if stored is not None and stored[0] != _canonical(numbers):
                raise InsightError("COUNT_ID_CONFLICT", "a count ID is already stored with different numbers")
            pending.append((count_id, CLAIM_TOOL, _canonical(row_key), rules, _canonical(numbers), state))
            row["count_id"] = count_id
        if pending:
            now = datetime.now(timezone.utc).isoformat(timespec="seconds")
            with _tx(wh):
                wh.executemany("INSERT OR IGNORE INTO count_registry VALUES (?, ?, ?, ?, ?, ?, ?)",
                               [(*p, now) for p in pending])

        for platform, entry in platforms.items():
            ranked = [r for r in rows if r["platform"] == platform]

            def rank_entry(r):
                return {k: r[k] for k in ("claim_code", "evidence", "reviews", "flags", "count_id")}
            specific = sorted((r for r in ranked if not r["generic"]),
                              key=lambda r: (-r["evidence"], -r["reviews"], r["claim_code"]))
            generic = next((r for r in ranked if r["generic"]), None)
            entry["ranking"] = {"specific": [rank_entry(r) for r in specific],
                                "generic": rank_entry(generic) if generic else None, "measure": RANKING_MEASURE}
        return {"run_id": full_id, "theme_code": theme_code, "theme_name": codes[theme_code],
                "catalogue_version": version, "catalogue_status": status, "codebook_version": book["version"],
                "rules_version": CLAIM_RULES_VERSION, "rows": rows, "platforms": platforms}
    finally:
        wh.close()


@mcp.tool()
@_tool
def claim_counts(run_id: str, theme_code: str, catalogue_version: int) -> dict:
    """Claim counts of one theme and catalogue version, per platform (never added together): records, evidence
    after merging near duplicates, writers, products, shops, specific share, the 7-day peak and flags, with count
    IDs; and per platform the sample, «Khác» share, saturation and the ranking by evidence."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    version = _check_version(catalogue_version)
    return _claim_counts_at(_claim_warehouse(run_id), book, theme_code, version)


def _claim_infos(copy: Path, book: dict, row_key: str, cache: dict) -> dict:
    """The current claim rows of a stored row key's theme and version, by count ID (once per call and version)."""
    try:
        _, theme_code, version, _ = json.loads(row_key)
    except (ValueError, TypeError):
        return {}
    if (theme_code, version) not in cache:
        names = _theme_codes(book)
        try:
            result = _claim_counts_at(copy, book, theme_code, version) if theme_code in names else None
        except InsightError as exc:
            if exc.code not in ("NOT_CODED", "CATALOGUE_NOT_FOUND", "WAREHOUSE_REBUILD_NEEDED"):
                raise
            result = None
        cache[(theme_code, version)] = {} if result is None else {row["count_id"]: {
            "count_id": row["count_id"], "tool": CLAIM_TOOL, "source": row["platform"] + "_reviews",
            "platform": row["platform"], "step": STEP_AFTER_PURCHASE, "kind": "claim",
            "rules": ("codebook", book["version"]), "row": row, "catalogue_status": result["catalogue_status"],
            "label": f"{names[theme_code]} · {row['claim_name']}"} for row in result["rows"]}
    return cache[(theme_code, version)]


def _current_claim_ids(copy: Path, book: dict, count_ids) -> set:
    """The current claim IDs among the theme versions of the given stored claim IDs."""
    cache, current = {}, set()
    with _warehouse_ro(copy) as wh:
        keys = [wh.execute("SELECT row_key FROM count_registry WHERE count_id = ? AND tool = ?",
                           (count_id, CLAIM_TOOL)).fetchone() for count_id in sorted(count_ids)]
    for key in keys:
        if key is not None:
            current |= set(_claim_infos(copy, book, key[0], cache))
    return current


# --- claim_grading_packet (IM-Q133) ---

@mcp.tool()
@_tool
def claim_grading_packet(run_id: str, theme_code: str, catalogue_version: int, out_dir: str, seed: int) -> dict:
    """Write the two graders' input for one catalogue version into out_dir outside the repository: the catalogue, a
    seeded sample of up to 30 coded reviews (customer words), the near-duplicate groups and the round 1 prompt.
    Returns counts, the packet ID and file names only."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    version = _check_version(catalogue_version)
    seed = _check_seed(seed)
    target = _out_dir(out_dir)
    path = _claim_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        catalogue = _stored_catalogue(wh, theme_code, version)
        reviews = _theme_reviews(wh, book, theme_code, version)
        if not any(r["coded"] for r in reviews):
            raise InsightError("NOT_CODED", "no review of this theme is coded under this catalogue version")
        labels = _labels(wh, theme_code, version)
        groups = dict(wh.execute("SELECT review_id, group_id FROM near_dup").fetchall())
        sizes = {}
        for group in groups.values():
            sizes[group] = sizes.get(group, 0) + 1
        pool = [r for r in reviews if r["kind"] == "sample"]

        def kept(review):
            return bool(labels.get(review["review_id"], {}).get("kept"))

        def in_group(review):
            return sizes.get(groups.get(review["review_id"]), 1) >= 2

        candidates = {"with_claim": [r for r in pool if kept(r) and not in_group(r)],
                      "no_claim": [r for r in pool if not kept(r)], "near_dup": [r for r in pool if in_group(r)]}
        rng, drawn, kinds = random.Random(seed), [], {}
        for kind, size in GRADING_DRAWS:
            left = [r for r in candidates[kind] if r["review_id"] not in kinds]
            for review in rng.sample(left, min(size, len(left))):
                drawn.append(review)
                kinds[review["review_id"]] = kind
        members = {}
        for review in pool:
            if in_group(review):
                members.setdefault(groups[review["review_id"]], []).append(review)
        ordered_groups = sorted(members.items(), key=lambda g: (-len(g[1]), g[0]))
        names = {group: f"G{n:02d}" for n, (group, _) in enumerate(ordered_groups, 1)}
        aliases = {}

        def alias(review):
            return aliases.setdefault(review["product_key"], f"P{len(aliases) + 1}")

        sample_rows = []
        for n, review in enumerate(drawn, 1):
            label = labels.get(review["review_id"], {"kept": [], "unclear": []})
            sample_rows.append({"id": f"S{n:02d}", "platform": review["platform"], "product": alias(review),
                                "text": review["words"], "assigned": sorted(label["kept"]),
                                "unclear": sorted(label["unclear"]), "specific": review["spec_p"] >= CLAIM_SPECIFIC,
                                "dup_group": names.get(groups.get(review["review_id"]))})
        dup_rows = [{"group": names[group], "members": [{"product": alias(r), "date": r["posted_date"],
                                                         "text": r["words"]} for r in items]}
                    for group, items in ordered_groups]
        prompt = _template("prompt-r1.md").replace("{theme_name}", _theme_codes(book)[theme_code])
        contents = {"catalogue.json": _json_file({**catalogue, "catalogue_version": version}),
                    "dup-groups.json": _json_file(dup_rows), "prompt-r1.md": prompt,
                    "sample.jsonl": _jsonl(sample_rows)}
        packet_id = "CPK-" + _packet_digest(contents)
        contents["packet.json"] = _json_file({
            "packet_id": packet_id, "run_id": full_id, "theme_code": theme_code, "catalogue_version": version,
            "seed": seed, "sample_size": len(sample_rows), "files": list(PACKET_FILES)})
        with _tx(wh):
            wh.executemany("INSERT OR IGNORE INTO claim_packet VALUES (?, ?, ?, ?, ?, ?, ?)",
                           [(packet_id, theme_code, version, seed, row["id"], review["review_id"],
                             kinds[review["review_id"]]) for row, review in zip(sample_rows, drawn)]
                           + [(packet_id, theme_code, version, seed, names[group], group, "group")
                              for group, _ in ordered_groups])
    finally:
        wh.close()
    _write_files(target, contents)
    counts = {kind: sum(k == kind for k in kinds.values()) for kind, _ in GRADING_DRAWS}
    return {"run_id": full_id, "packet_id": packet_id, "files": list(PACKET_FILES) + ["packet.json"],
            "sample": counts, "dup_groups": len(ordered_groups)}


# --- record_claim_grades (IM-Q135 to IM-Q137) ---

def claim_grade_keys(round1: dict) -> dict:
    """The grade keys of one round 1 grader object (PR 4 conventions). Shared with claims/crosscheck.py."""
    keys = {}
    for line in round1["catalogue"]:
        keys[("catalogue", line["code"], "verdict")] = line["verdict"]
    for item in round1["items"]:
        keys[("item", item["id"], "wrong")] = sorted(item["wrong"])
        keys[("item", item["id"], "missed")] = sorted(item["missed"])
        keys[("item", item["id"], "specific_ok")] = item["specific_ok"]
    for group in round1["dup_groups"]:
        keys[("dup", group["group"], "same_idea_copy")] = group["same_idea_copy"]
    return keys


def claim_grade_diffs(keys_a: dict, keys_b: dict) -> list[tuple]:
    """The keys whose two round 1 values differ, in sorted key order; diff n is the n-th (from 1)."""
    return [key for key in sorted(set(keys_a) | set(keys_b)) if keys_a.get(key) != keys_b.get(key)]


class _Members(list):
    """The members of one JSON object in file order, so a repeated name is seen before a dict drops it."""


def _grades_invalid(name: str, rule: str, where: str) -> InsightError:
    return InsightError("GRADES_INVALID", f"{name}: rule {rule} failed at {where}")


def _members_to_dict(value, name: str, where: str):
    if isinstance(value, _Members):
        names = [k for k, _ in value]
        if len(set(names)) != len(names):
            raise _grades_invalid(name, "duplicate_key", where)
        return {k: _members_to_dict(v, name, f"{where}.{k if k in GRADE_KEY_NAMES else '<key>'}") for k, v in value}
    if isinstance(value, list):
        return [_members_to_dict(v, name, f"{where}[{i}]") for i, v in enumerate(value)]
    return value


def _check_shape(value, shape: str, name: str, where: str) -> None:
    fields = GRADE_SHAPES[shape]
    if not isinstance(value, dict) or set(value) != set(fields):
        raise _grades_invalid(name, "keys", where)
    for key, kind in fields.items():
        item, at = value[key], f"{where}.{key}"
        if kind == "str":
            ok = isinstance(item, str)
        elif kind == "bool":
            ok = isinstance(item, bool)
        elif kind == "int":
            ok = _int(item)
        elif kind == "strs":
            ok = isinstance(item, list) and all(isinstance(x, str) for x in item)
        else:
            ok = isinstance(item, list)
            if ok:
                for i, entry in enumerate(item):
                    _check_shape(entry, kind, name, f"{at}[{i}]")
        if not ok:
            raise _grades_invalid(name, "type", at)


def _read_grader_file(directory: Path, name: str, shape: str, grader: str) -> tuple[dict, str]:
    try:
        text = (directory / name).read_bytes().decode("utf-8")
    except (OSError, UnicodeDecodeError):
        raise _grades_invalid(name, "file", "$") from None
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise _grades_invalid(name, "json", "$")
    raw = text[start:end + 1]
    try:
        parsed = json.loads(raw, object_pairs_hook=_Members)
    except ValueError:
        raise _grades_invalid(name, "json", "$") from None
    if not isinstance(parsed, _Members):
        raise _grades_invalid(name, "json", "$")
    value = _members_to_dict(parsed, name, "$")
    _check_shape(value, shape, name, "$")
    if value["grader"] != grader:
        raise _grades_invalid(name, "grader", "$.grader")
    return value, raw


def _check_coverage(name: str, entries: list, field: str, allowed: list, where: str) -> None:
    found = [entry[field] for entry in entries]
    for i, value in enumerate(found):
        if value not in allowed or found.index(value) != i:
            raise _grades_invalid(name, "coverage", f"{where}[{i}].{field}")
    if len(found) != len(allowed):
        raise _grades_invalid(name, "coverage", where)


def _free_texts(value: dict, round_no: int) -> list[tuple[str, str]]:
    if round_no == 1:
        out = [("$.method_gaps", value["method_gaps"])]
        for list_name in ("catalogue", "items", "dup_groups"):
            out += [(f"$.{list_name}[{i}].note", e["note"]) for i, e in enumerate(value[list_name])]
        for i, entry in enumerate(value["missing"]):
            out += [(f"$.missing[{i}].name", entry["name"]), (f"$.missing[{i}].why", entry["why"])]
        return out
    out = [("$.method_gaps_comment", value["method_gaps_comment"])]
    out += [(f"$.decisions[{i}].why", d["why"]) for i, d in enumerate(value["decisions"])]
    return out + [(f"$.missing_agree[{i}]", s) for i, s in enumerate(value["missing_agree"])]


def _writer_name_hit(text: str, keys: set) -> bool:
    """IM-Q137 rule writer_name: some substring with word-edge ends, in its source spelling, has a writer key of the
    run (the unchanged PR 1 key rule)."""
    if not keys:
        return False
    s = unicodedata.normalize("NFC", text)
    starts = [i for i, c in enumerate(s) if not c.isspace() and not (c.isalnum() and i and s[i - 1].isalnum())]
    ends = [j for j, c in enumerate(s) if not c.isspace() and not (c.isalnum() and j + 1 < len(s) and s[j + 1].isalnum())]
    return any(_writer_key_for_name(s[i:j + 1]) in keys for i in starts for j in ends if j >= i)


@mcp.tool()
@_tool
def record_claim_grades(run_id: str, theme_code: str, catalogue_version: int, grades_dir: str) -> dict:
    """Settle the two-grader cross-check of one claim packet from the four grader files in grades_dir (round 1 and
    round 2 of Astra and Opus) and record the catalogue status: PASSED only when no claim is flagged by both graders
    and at least 80% of the settled sample items are fully right. Malformed or text-bearing output is refused."""
    run_id = _check_run_id(run_id)
    book = load_codebook()
    theme_code = _check_theme(book, theme_code)
    version = _check_version(catalogue_version)
    if not isinstance(grades_dir, str) or not grades_dir:
        raise InsightError("INVALID_ARGUMENT", "grades_dir must be a directory path")
    path = _claim_warehouse(run_id)
    directory = Path(grades_dir).expanduser()
    with _warehouse_ro(path) as wh:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        catalogue = _stored_catalogue(wh, theme_code, version)
        try:
            packet = json.loads((directory / "packet.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise _grades_invalid("packet.json", "file", "$") from None
        packet_id = packet.get("packet_id") if isinstance(packet, dict) else None
        rows = wh.execute("SELECT sample_id, kind FROM claim_packet WHERE packet_id = ? AND theme_code = ? "
                          "AND catalogue_version = ? ORDER BY sample_id", (packet_id, theme_code, version)).fetchall() \
            if isinstance(packet_id, str) and packet.get("run_id") == full_id else []
        if not rows:
            raise InsightError("PACKET_UNKNOWN", "packet.json does not name a stored claim packet of this run, theme "
                                                 "and catalogue version")
        reviews = _review_words(path)
        ids = {r for (r,) in wh.execute("SELECT review_id FROM review")} \
            | {r for (r,) in wh.execute("SELECT writer_key FROM review")} \
            | {r for (r,) in wh.execute("SELECT product_key FROM review")}
        writer_keys = {r for (r,) in wh.execute("SELECT DISTINCT writer_key FROM review WHERE writer_known = 1")}
    samples = [s for s, kind in rows if kind != "group"]
    groups = [s for s, kind in rows if kind == "group"]
    codes = [c["code"] for c in catalogue["claims"]]

    files = {}
    for name, round_no, grader in GRADER_FILES:
        files[name] = _read_grader_file(directory, name, f"round{round_no}", grader)
    for name, round_no, _ in GRADER_FILES:
        value = files[name][0]
        if round_no != 1:
            continue
        _check_coverage(name, value["catalogue"], "code", codes, "$.catalogue")
        for i, line in enumerate(value["catalogue"]):
            verdict = line["verdict"]
            if verdict not in VERDICTS and not (verdict.startswith(CHONG_NGHIA) and verdict[len(CHONG_NGHIA):] in codes):
                raise _grades_invalid(name, "verdict", f"$.catalogue[{i}].verdict")
        _check_coverage(name, value["items"], "id", samples, "$.items")
        for i, item in enumerate(value["items"]):
            for field in ("wrong", "missed"):
                if any(c not in codes for c in item[field]) or len(set(item[field])) != len(item[field]):
                    raise _grades_invalid(name, "codes", f"$.items[{i}].{field}")
        _check_coverage(name, value["dup_groups"], "group", groups, "$.dup_groups")
    keys = {g: claim_grade_keys(files[f"r1-{g}.out"][0]) for g in ("astra", "opus")}
    diffs = claim_grade_diffs(keys["astra"], keys["opus"])
    decisions = {}
    for grader in ("astra", "opus"):
        name = f"r2-{grader}.out"
        found = [d["n"] for d in files[name][0]["decisions"]]
        for i, n in enumerate(found):
            if not 1 <= n <= len(diffs) or found.index(n) != i:
                raise _grades_invalid(name, "decisions", f"$.decisions[{i}].n")
        if len(found) != len(diffs):
            raise _grades_invalid(name, "decisions", "$.decisions")
        decisions[grader] = {d["n"]: d["agree_other"] for d in files[name][0]["decisions"]}
    for name, round_no, _ in GRADER_FILES:
        for where, text in _free_texts(files[name][0], round_no):
            if _quote_rule(text, reviews) or hidden_name_hits(unicodedata.normalize("NFC", text)):
                raise _grades_invalid(name, "customer_text", where)
            if _writer_name_hit(text, writer_keys):
                raise _grades_invalid(name, "writer_name", where)
            if any(i in text for i in ids):
                raise _grades_invalid(name, "private_id", where)

    settled, disputes = {}, set()
    effective = {"astra": dict(keys["astra"]), "opus": dict(keys["opus"])}
    for key in keys["astra"]:
        if key not in diffs:
            settled[key] = keys["astra"][key]
    for n, key in enumerate(diffs, 1):
        astra, opus = decisions["astra"][n], decisions["opus"][n]
        if astra:
            effective["astra"][key] = keys["opus"][key]
        if opus:
            effective["opus"][key] = keys["astra"][key]
        if astra != opus:
            settled[key] = keys["opus"][key] if astra else keys["astra"][key]
        else:
            disputes.add(key)
    items_settled = [s for s in samples if not any(("item", s, f) in disputes
                                                   for f in ("wrong", "missed", "specific_ok"))]
    fully_right = [s for s in items_settled if not settled[("item", s, "wrong")] and not settled[("item", s, "missed")]]
    flagged = [c for c in codes if all(effective[g][("catalogue", c, "verdict")] != "OK" for g in ("astra", "opus"))]
    passed = not flagged and bool(items_settled) and _ratio_at_least(len(fully_right), len(items_settled), 0.80)
    status = "PASSED" if passed else "DRAFT"
    summary = {"run_id": full_id, "theme_code": theme_code, "catalogue_version": version, "packet_id": packet_id,
               "status": status, "round1_keys": len(keys["astra"]),
               "round1_agreement": _rounded(len(keys["astra"]) - len(diffs), len(keys["astra"]), 4),
               "diffs": len(diffs), "settled_in_round2": len(diffs) - len(disputes), "disputes": len(disputes),
               "items": len(samples), "items_settled": len(items_settled), "items_fully_right": len(fully_right),
               "fully_right_share": _rounded(len(fully_right), len(items_settled), 4), "flagged_by_both": flagged}
    raw = {name: files[name][1] for name, _, _ in GRADER_FILES}
    wh = _open_warehouse(path)
    try:
        with _tx(wh):
            wh.execute("INSERT INTO claim_grade VALUES (?, ?, ?, ?, ?, ?, ?, ?)", (
                "CGR-" + uuid.uuid4().hex[:12], theme_code, version, packet_id, status, _canonical(summary),
                _canonical(raw), datetime.now(timezone.utc).isoformat(timespec="seconds")))
    finally:
        wh.close()
    return summary


if __name__ == "__main__":
    mcp.run(transport="stdio")

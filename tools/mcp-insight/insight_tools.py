"""Local stdio MCP server `tdn-insight`: run warehouse, Jev theme coding, SLAYER counts (part 1); report plan,
confidence ceiling and reason links (part 2).

Reads stored run data only. The app DB is opened read-only (INSIGHT_MCP_APP_DB, no default); the
artifact store and capture root are read-only. Each run gets its own warehouse file under
INSIGHT_MCP_DATA_DIR. Evidence from people (sample reviews, method approvals, brand checks, revenue shares,
reason readings) lives in the shared store `<data dir>/insight-shared.sqlite`, written only by the `record_*`
functions, which are not tools. A real Jev call needs INSIGHT_MCP_ALLOW_PAID=1 and a call cap; everything
else, including `code_reviews(dry_run=True)`, makes no network call. Contract: CONTRACT.md.
"""

import base64
import functools
import hashlib
import json
import math
import os
import re
import shutil
import sqlite3
import tempfile
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from contextlib import contextmanager
from datetime import datetime, timezone
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
REVIEW_THRESHOLD_WRITERS = 5
REVIEW_THRESHOLD_PRODUCTS = 3
KEYWORD_THRESHOLD = 5

RUN_ID_RE = re.compile(r"^[0-9a-f]{8}(?:-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})?$")
THEME_CODE_RE = re.compile(r"^T-[A-Z0-9]+$")
BLOCK_KEY_RE = re.compile(r"^[a-z][a-z0-9_]{0,39}$")
SHOPEE_BASE_ID = re.compile(r"^1__([1-9][0-9]{0,19})__([1-9][0-9]{0,19})$")
SCOPE_VERSIONS = {"autorun-scope-record-v1", "autorun-scope-record-v2"}
OPTION_KEYS = ("CO_KHEN", "CO_CHE", "CO_KE", "KHONG_NHAC")
POLARITY_BY_OPTION = {"CO_KHEN": "khen", "CO_CHE": "che", "CO_KE": "ke"}

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
COUNT_TOOLS = ("theme_counts", "keyword_counts", "portrait_counts")
COUNT_ROW_SOURCES = ("shopee_reviews", "tiktok_shop_reviews", "search_suggestions")
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
# The app's READER rule: a whole name with Unicode edges, case-insensitive; `Metric` only as `Metric` or `METRIC`.
_HIDDEN_PATTERNS = tuple(
    re.compile(r"(?<![^\W_])(?:Metric|METRIC)(?![^\W_])") if name == "Metric"
    else re.compile(r"(?<![^\W_])" + re.escape(name) + r"(?![^\W_])", re.I)
    for name in HIDDEN_NAMES)
_MODEL_ID = re.compile(r"\b(?:gpt|claude)-[A-Za-z0-9]", re.I)

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
    value = os.environ.get("INSIGHT_MCP_APP_DB")
    if not value:
        raise InsightError("APP_DB_NOT_SET", "INSIGHT_MCP_APP_DB is not set; it names the app SQLite file")
    path = Path(value).expanduser()
    if not path.is_file():
        raise InsightError("APP_DB_NOT_FOUND", "the file named by INSIGHT_MCP_APP_DB does not exist")
    return path


def open_app_db(path: Path) -> sqlite3.Connection:
    """The only way the module opens an app DB snapshot: read-only URI, never a creating open."""
    uri = "file:" + urllib.parse.quote(str(path)) + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


SNAPSHOT_RETRIES = 3


def _copy_bytes(source: Path, target: Path) -> None:
    with open(source, "rb") as reader, open(target, "wb") as writer:
        shutil.copyfileobj(reader, writer)


@contextmanager
def app_db_snapshot(path: Path):
    """A read-only connection to a per-call copy of the app DB (IM-Q39). The live DB is never opened by SQLite:
    even a mode=ro reader changes a WAL database's -shm file. The DB and its -wal are copied with plain byte reads,
    the copy must pass PRAGMA quick_check, and the copy is removed when the call ends."""
    directory = Path(tempfile.mkdtemp(prefix="insight-app-"))
    try:
        copy = directory / "app.sqlite"
        wal = Path(str(path) + "-wal")
        for _ in range(1 + SNAPSHOT_RETRIES):
            for stale in directory.iterdir():
                stale.unlink()
            con = None
            try:
                _copy_bytes(path, copy)
                if wal.is_file():
                    _copy_bytes(wal, Path(str(copy) + "-wal"))
                con = open_app_db(copy)
                if con.execute("PRAGMA quick_check").fetchone() == ("ok",):
                    break
            except (OSError, sqlite3.DatabaseError):
                pass
            if con is not None:
                con.close()
            con = None
        if con is None:
            raise InsightError("SOURCE_SNAPSHOT_FAILED", "the app DB could not be copied into a consistent snapshot")
        try:
            yield con
        finally:
            con.close()
    finally:
        shutil.rmtree(directory, ignore_errors=True)


# ---------------------------------------------------------------------------
# Codebook and keyword groups
# ---------------------------------------------------------------------------

def _theme_entry_ok(theme) -> bool:
    return (isinstance(theme, dict) and isinstance(theme.get("code"), str) and THEME_CODE_RE.match(theme["code"])
            and all(isinstance(theme.get(k), str) and theme.get(k).strip() for k in ("name", "include"))
            and isinstance(theme.get("exclude", ""), str))


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
    options = book.get("options")
    if not isinstance(options, list) or [o.get("key") if isinstance(o, dict) else None for o in options] != list(OPTION_KEYS) \
            or not all(isinstance(o.get("meaning"), str) for o in options):
        raise InsightError("CODEBOOK_INVALID", "the codebook must have the 4 answer options in order")
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
CREATE TABLE run_facts(run_id TEXT PRIMARY KEY, keyword TEXT NOT NULL, created_at TEXT NOT NULL, run_year INTEGER NOT NULL,
  applied_keywords TEXT NOT NULL, applied_category TEXT, scope_capture INTEGER, category_evidence_label TEXT,
  category_evidence_reason TEXT, content_sha256 TEXT NOT NULL, built_at TEXT NOT NULL);
CREATE TABLE source_status(source TEXT PRIMARY KEY, platform TEXT NOT NULL, captured INTEGER NOT NULL,
  row_count INTEGER NOT NULL);
CREATE TABLE review(review_id TEXT PRIMARY KEY, platform TEXT NOT NULL, source_review_id TEXT NOT NULL,
  product_key TEXT NOT NULL, writer_key TEXT NOT NULL, writer_known INTEGER NOT NULL CHECK(writer_known IN (0, 1)),
  rating INTEGER);
CREATE TABLE review_text(review_id TEXT PRIMARY KEY REFERENCES review(review_id), text TEXT NOT NULL);
CREATE TABLE product(product_key TEXT PRIMARY KEY, platform TEXT NOT NULL, product_name TEXT);
CREATE TABLE writer_guess(writer_key TEXT PRIMARY KEY, gender TEXT NOT NULL,
  age_band TEXT NOT NULL, year_basis TEXT NOT NULL);
CREATE TABLE keyword(keyword TEXT PRIMARY KEY, platform TEXT NOT NULL);
CREATE TABLE trend(location TEXT NOT NULL, value INTEGER, query TEXT, PRIMARY KEY(location, query));
CREATE TABLE portrait_label(review_id TEXT NOT NULL, dimension TEXT NOT NULL, grp TEXT NOT NULL,
  PRIMARY KEY(review_id, dimension, grp));
"""
SOURCE_TABLES = ("run_facts", "source_status", "review", "review_text", "product", "writer_guess", "keyword",
                 "trend", "portrait_label")

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
  p_yes REAL NOT NULL, polarity TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('kept', 'unclear')),
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


def _runs_dir() -> Path:
    return _data_dir() / "runs"


def _find_warehouse(run_id: str) -> Path:
    """The run's warehouse. A run_id names an app run: when the app DB is configured, the ID is resolved there
    first (in a read-only snapshot), so an unknown or ambiguous ID gives RUN_NOT_FOUND or RUN_AMBIGUOUS in every tool."""
    value = os.environ.get("INSIGHT_MCP_APP_DB")
    if value and Path(value).expanduser().is_file():
        with app_db_snapshot(Path(value).expanduser()) as con:
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
                "product_key": f"shopee:{item.get('shopId')}:{item.get('itemId')}",
                "writer_key": "shopee:" + source_id, "writer_known": 0,
                "rating": rating if isinstance(rating, int) and not isinstance(rating, bool) else None,
                "text": text, "name": None,
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
                "writer_key": _writer_key_for_name(name) if known else "tiktok_shop:" + source_id,
                "writer_known": 1 if known else 0,
                "rating": rating if isinstance(rating, int) and not isinstance(rating, bool) else None,
                "text": text, "name": name if known else None,
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
                    names.setdefault(f"shopee:{match.group(2)}:{match.group(1)}", node["product_name"].strip())
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


def _load_reviews(con: sqlite3.Connection) -> list[dict]:
    rows = con.execute(
        "SELECT r.review_id, r.platform, r.product_key, t.text, p.product_name FROM review r "
        "JOIN review_text t ON t.review_id = r.review_id LEFT JOIN product p ON p.product_key = r.product_key "
        "ORDER BY r.review_id").fetchall()
    return [{"review_id": a, "platform": b, "product_key": c, "text": d, "product_name": e} for a, b, c, d, e in rows]


def _refresh_review_input(con, reviews: list[dict], version: str, block_key) -> None:
    norm = _block_norm(block_key)
    con.execute("DELETE FROM review_input WHERE codebook_version = ? AND block_norm = ?", (version, norm))
    con.executemany("INSERT INTO review_input VALUES (?, ?, ?, ?)",
                    [(r["review_id"], version, norm, _input_sha(r, block_key, version)) for r in reviews])


def _invalidate_changed(con, reviews: list[dict]) -> None:
    """IM-Q43: a review whose coding inputs changed loses its labels and done row; unchanged ones keep them."""
    by_id = {r["review_id"]: r for r in reviews}
    targets = set(con.execute("SELECT codebook_version, block_key FROM coding_state").fetchall())
    targets |= set(con.execute("SELECT codebook_version, block_key FROM coding_target").fetchall())
    con.execute("DELETE FROM review_input")
    for version, block_key in sorted(targets, key=lambda t: (t[0], t[1] or "")):
        _refresh_review_input(con, reviews, version, block_key)
    for review_id, version, block_key, norm, sha in con.execute(
            "SELECT review_id, codebook_version, block_key, block_norm, input_sha256 FROM coding_state").fetchall():
        review = by_id.get(review_id)
        if review is None or _input_sha(review, block_key, version) != sha:
            con.execute("DELETE FROM label WHERE review_id = ? AND codebook_version = ? AND block_norm = ?",
                        (review_id, version, norm))
            con.execute("DELETE FROM coding_state WHERE review_id = ? AND codebook_version = ? AND block_norm = ?",
                        (review_id, version, norm))
    con.execute("DELETE FROM label WHERE review_id NOT IN (SELECT review_id FROM review)")


# ---------------------------------------------------------------------------
# build_warehouse
# ---------------------------------------------------------------------------

def _count_or_no_data(value):
    return NO_DATA if value is None else value


@mcp.tool()
@_tool
def build_warehouse(run_id: str) -> dict:
    """Build (or rebuild) the run warehouse from stored run data only. Returns counts per platform and source."""
    run_id = _check_run_id(run_id)
    app_db = _app_db_path()
    artifacts, captures = _artifact_root(app_db), _capture_root(app_db)
    with app_db_snapshot(app_db) as con:
        full_id, keyword, created_at = _resolve_run(con, run_id)
        scope = _scope(captures, full_id, keyword)
        shopee = _shopee_reviews(con, artifacts, full_id)
        tiktok = _tiktok_reviews(con, artifacts, full_id)
        tiktok_names = _tiktok_product_names(con, artifacts, full_id)
        keywords = _search_keywords(con, artifacts, full_id)
        trends = _trends_regions(con, artifacts, full_id)
    shopee_names = _shopee_product_names(captures, full_id)
    run_year = _run_year(created_at)

    reviews = sorted((shopee or []) + (tiktok or []), key=lambda r: r["review_id"])
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

    review_rows = [(r["review_id"], r["platform"], r["source_review_id"], r["product_key"], r["writer_key"],
                    r["writer_known"], r["rating"]) for r in reviews]
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
    wh = _open_warehouse(path)
    try:
        with _tx(wh):
            for table in SOURCE_TABLES:
                wh.execute(f"DROP TABLE IF EXISTS {table}")
            for statement in SOURCE_SCHEMA.strip().split(";\n"):
                if statement.strip():
                    wh.execute(statement)
            for statement in STATE_SCHEMA.strip().split(";\n"):
                if statement.strip():
                    wh.execute(statement)
            wh.execute("INSERT INTO run_facts VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                full_id, keyword, created_at, run_year, _canonical(scope["applied_keywords"]),
                scope["applied_category"], scope["scope_capture"], scope["category_evidence"],
                scope["category_reason"], content_sha256, datetime.now(timezone.utc).isoformat(timespec="seconds")))
            wh.executemany("INSERT INTO source_status VALUES (?, ?, ?, ?)",
                           [(k, p, 0 if n is None else 1, n or 0) for k, (p, n) in sources.items()])
            wh.executemany("INSERT INTO review VALUES (?, ?, ?, ?, ?, ?, ?)", review_rows)
            wh.executemany("INSERT INTO review_text VALUES (?, ?)", text_rows)
            wh.executemany("INSERT INTO product VALUES (?, ?, ?)", product_rows)
            wh.executemany("INSERT INTO writer_guess VALUES (?, ?, ?, ?)",
                           [(k, *v) for k, v in sorted(guesses.items())])
            wh.executemany("INSERT INTO keyword VALUES (?, ?)", keyword_rows)
            wh.executemany("INSERT INTO trend VALUES (?, ?, ?)", trend_rows)
            wh.executemany("INSERT INTO portrait_label VALUES (?, ?, ?)", portrait)
            _invalidate_changed(wh, reviews)
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
    return {
        "run_id": full_id,
        "warehouse": str(path),
        "content_sha256": content_sha256,
        "scope": {"applied_keywords": scope["applied_keywords"], "applied_category": scope["applied_category"],
                  "scope_capture": scope["scope_capture"], "category_evidence": scope["category_evidence"]},
        "reviews_by_platform": per_platform(count),
        "products": per_platform(product_count),
        "writer_known": per_platform(known),
        "sources": {k: _count_or_no_data(n) for k, (_, n) in sources.items()},
    }


# ---------------------------------------------------------------------------
# code_reviews
# ---------------------------------------------------------------------------

def _term_matches(term: str, keyword: str) -> bool:
    return re.search(r"(?<![^\W_])" + re.escape(_nz(term).strip()) + r"(?![^\W_])", _nz(keyword).strip()) is not None


def select_block(book: dict, keywords: list[str], category, block_override=None) -> dict:
    blocks = book["blocks"]
    if block_override is not None:
        if block_override not in blocks:
            raise InsightError("BLOCK_UNKNOWN", "block_override is not a block of the codebook")
        key, basis, term = block_override, "OVERRIDE", None
    else:
        key, basis, term = None, "NO_MATCH", None
        if category is not None:
            for name, block in blocks.items():
                if category in (block["match"].get("categoryLabels") or []):
                    key, basis = name, "CATEGORY_LABEL"
                    break
        if key is None:
            best = None
            for index, (name, block) in enumerate(blocks.items()):
                for candidate in block["match"].get("keywords") or []:
                    if any(_term_matches(candidate, k) for k in keywords):
                        rank = (len(_nz(candidate).strip()), -index)
                        if best is None or rank > best[0]:
                            best = (rank, name, candidate)
            if best is not None:
                key, basis, term = best[1], "KEYWORD", best[2]
    questions = list(book["core"]) + (list(blocks[key]["themes"]) if key else [])
    if len(questions) > book["limits"]["maxQuestionsPerCall"]:
        raise InsightError("CODEBOOK_INVALID", "the selected block needs more questions than one call allows")
    return {"codebookVersion": book["version"], "blockKey": key, "matchBasis": basis, "matchedTerm": term,
            "questions_per_call": len(questions), "_questions": questions}


def build_request(book: dict, selection: dict, review: dict) -> dict:
    """One Jev request (IM-Q20): review text, platform, product name, block label, codebook version, and the
    questions built from the codebook. Nothing else: no review ID, writer key, name or URL."""
    block = book["blocks"][selection["blockKey"]]["label"] if selection["blockKey"] else None
    options = [{"key": o["key"], "meaning": o["meaning"]} for o in book["options"]]
    return {"text": review["text"], "platform": review["platform"], "product_name": review["product_name"],
            "block_label": block, "codebook_version": book["version"],
            "questions": [{"code": t["code"], "name": t["name"], "include": t["include"],
                           "exclude": t.get("exclude") or "", "options": [dict(o) for o in options]}
                          for t in selection["_questions"]]}


def _wire_body(request: dict) -> dict:
    """The Jev wire form of one request: one choice question per theme, each with the review as its state."""
    state = (f"Nền tảng: {request['platform']}. Sản phẩm: {request['product_name'] or 'không rõ'}. "
             f"Nhóm ngành: {request['block_label'] or 'Chỉ chủ đề lõi'}. Bộ chủ đề: {request['codebook_version']}. "
             f"Đánh giá: {request['text']}")
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
    """The only network path: POST one request to Jev. Returns (HTTP status, raw response bytes).
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


def parse_answer(book: dict, body: dict, status, raw) -> dict:
    """Check one Jev answer. Raises _CallFailed with JEV_THEME_UNAVAILABLE or JEV_THEME_INVALID."""
    if status != 200:
        raise _CallFailed("JEV_THEME_UNAVAILABLE")
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        raise _CallFailed("JEV_THEME_UNAVAILABLE") from None
    if not isinstance(payload, dict):
        raise _CallFailed("JEV_THEME_UNAVAILABLE")
    if payload.get("model") != JEV_MODEL or not isinstance(payload.get("answers"), dict):
        raise _CallFailed("JEV_THEME_INVALID")
    answers = payload["answers"]
    asked = [q["code"] for q in body["questions"]]
    if set(answers) != set(asked):
        raise _CallFailed("JEV_THEME_INVALID")
    tolerance = book["thresholds"]["probabilitySumTolerance"]
    out = {}
    for code in asked:
        answer = answers[code]
        if not isinstance(answer, dict) or answer.get("type") != "choice" or answer.get("choice") not in OPTION_KEYS:
            raise _CallFailed("JEV_THEME_INVALID")
        probs = answer.get("probabilities")
        if not isinstance(probs, dict) or set(probs) != set(OPTION_KEYS) \
                or not all(_number(v) and 0 <= v <= 1 for v in probs.values()):
            raise _CallFailed("JEV_THEME_INVALID")
        if abs(sum(probs.values()) - 1) > tolerance + 1e-9:
            raise _CallFailed("JEV_THEME_INVALID")
        confidence = answer.get("confidence")
        if not _number(confidence) or not 0 <= confidence <= 1:
            raise _CallFailed("JEV_THEME_INVALID")
        out[code] = probs
    return out


def label_rows(book: dict, answers: dict) -> list[dict]:
    """Kept and unclear labels from checked answers (thresholds from the codebook)."""
    keep, unclear, direction = (book["thresholds"][k] for k in ("keep", "unclear", "direction"))
    rows = []
    for code, probs in answers.items():
        p_yes = round(probs["CO_KHEN"] + probs["CO_CHE"] + probs["CO_KE"], 9)
        if p_yes < unclear:
            continue
        top = max(POLARITY_BY_OPTION, key=lambda k: probs[k])
        polarity = POLARITY_BY_OPTION[top] if probs[top] >= direction else "khong_ro_huong"
        rows.append({"theme_code": code, "p_yes": p_yes, "polarity": polarity,
                     "status": "kept" if p_yes >= keep else "unclear"})
    return rows


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


def _run_scope(wh) -> tuple[list[str], object]:
    keywords, category = wh.execute("SELECT applied_keywords, applied_category FROM run_facts").fetchone()
    return json.loads(keywords), category


def _coded_ids(wh, version: str, block_key, reviews: list[dict]) -> set:
    norm = _block_norm(block_key)
    done = dict(wh.execute("SELECT review_id, input_sha256 FROM coding_state WHERE codebook_version = ? "
                           "AND block_norm = ? AND status = 'done'", (version, norm)).fetchall())
    return {r["review_id"] for r in reviews if done.get(r["review_id"]) == _input_sha(r, block_key, version)}


@mcp.tool()
@_tool
def code_reviews(run_id: str, dry_run: bool = True, max_calls: int | None = None,
                 block_override: str | None = None) -> dict:
    """Plan (dry_run, default) or run Jev theme coding for the run's reviews. A real run needs
    INSIGHT_MCP_ALLOW_PAID=1 and max_calls; it stops at the cap and at the first failed call."""
    run_id = _check_run_id(run_id)
    if not isinstance(dry_run, bool):
        raise InsightError("INVALID_ARGUMENT", "dry_run must be true or false")
    if max_calls is not None and (not isinstance(max_calls, int) or isinstance(max_calls, bool)):
        raise InsightError("MAX_CALLS_INVALID", "max_calls must be an integer or null")
    if block_override is not None and (not isinstance(block_override, str) or not BLOCK_KEY_RE.match(block_override)):
        raise InsightError("BLOCK_UNKNOWN", "block_override is not a block of the codebook")
    book = load_codebook()
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        keywords, category = _run_scope(wh)
        selection = select_block(book, keywords, category, block_override)
        version, block_key = book["version"], selection["blockKey"]
        reviews = _load_reviews(wh)
        coded = _coded_ids(wh, version, block_key, reviews)
        eligible = [r for r in reviews if r["text"].strip() and r["review_id"] not in coded]
        limit = book["limits"]["maxCallsPerRun"]
        cap = limit if max_calls is None else max(0, min(max_calls, limit))
        planned = min(len(eligible), cap)
        by_platform = {p: 0 for p in sorted({r["platform"] for r in reviews})}
        for review in eligible:
            by_platform[review["platform"]] += 1
        plan = {k: v for k, v in selection.items() if not k.startswith("_")}
        base = {"run_id": full_id, "eligible_reviews": len(eligible), "eligible_by_platform": by_platform,
                "already_coded": len(coded), "planned_calls": planned, "codebook_status": book["status"], **plan}
        if dry_run:
            return {**base, "dry_run": True, "jev_calls": 0}
        if os.environ.get("INSIGHT_MCP_ALLOW_PAID") != "1":
            return {"run_id": full_id, "refused": True, "reason": "PAID_FLAG_MISSING",
                    "eligible_reviews": len(eligible), "planned_calls": planned,
                    "message": "a real Jev run needs INSIGHT_MCP_ALLOW_PAID=1, set by the owner"}
        if max_calls is None or not 1 <= max_calls <= limit:
            raise InsightError("MAX_CALLS_INVALID", f"a real run needs max_calls from 1 to {limit}")
        key = _read_key()
        with _tx(wh):
            wh.execute("INSERT INTO coding_target(codebook_version, block_key, block_norm, match_basis, matched_term, "
                       "started_at) VALUES (?, ?, ?, ?, ?, ?)",
                       (version, block_key, _block_norm(block_key), selection["matchBasis"], selection["matchedTerm"],
                        datetime.now(timezone.utc).isoformat(timespec="seconds")))
            _refresh_review_input(wh, reviews, version, block_key)
        calls, done, stopped = 0, 0, None
        for review in eligible:
            if calls >= max_calls:
                stopped = "CAP_REACHED"
                break
            body = build_request(book, selection, review)
            calls += 1
            try:
                try:
                    status, raw = _jev_transport(body, key)
                except Exception:  # noqa: BLE001 - any transport failure; its text may hold the key
                    raise _CallFailed("JEV_THEME_UNAVAILABLE") from None
                answers = parse_answer(book, body, status, raw)
            except _CallFailed as failure:
                stopped = failure.stop
                break
            rows = label_rows(book, answers)
            text_sha = _sha256(review["text"])
            norm = _block_norm(block_key)
            with _tx(wh):
                wh.execute("DELETE FROM label WHERE review_id = ? AND codebook_version = ? AND block_norm = ?",
                           (review["review_id"], version, norm))
                wh.executemany(
                    "INSERT INTO label(review_id, theme_code, codebook_version, block_key, block_norm, p_yes, polarity, "
                    "status, step, text_ref, text_start, text_end, text_sha256, note) "
                    "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, NULL)",
                    [(review["review_id"], row["theme_code"], version, block_key, norm, row["p_yes"], row["polarity"],
                      row["status"], STEP_AFTER_PURCHASE, review["review_id"], len(review["text"]), text_sha)
                     for row in rows])
                wh.execute("INSERT OR REPLACE INTO coding_state VALUES (?, ?, ?, ?, ?, 'done')",
                           (review["review_id"], version, block_key, norm, _input_sha(review, block_key, version)))
            done += 1
        if stopped is None and done < len(eligible):
            stopped = "CAP_REACHED"
        return {**base, "dry_run": False, "calls_made": calls, "coded_now": done,
                "remaining": len(eligible) - done, "stopped": stopped or "COMPLETE"}
    finally:
        wh.close()


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
    """Theme counts per platform, theme and polarity, with R-I33 thresholds and count IDs. `question` is an
    optional theme code filter."""
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
        full_id = wh.execute("SELECT run_id FROM run_facts").fetchone()[0]
        target = wh.execute("SELECT block_key FROM coding_target ORDER BY target_id DESC LIMIT 1").fetchone()
        if target is None:
            raise InsightError("NOT_CODED", "no review of this run is coded yet")
        version, block_key = book["version"], target[0]
        norm = _block_norm(block_key)
        platforms = [r[0] for r in wh.execute("SELECT DISTINCT platform FROM review ORDER BY 1")]
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
                raise InsightError("NOT_CODED", "no review of this run is coded under the current coding target")
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
        return {"run_id": full_id, "codebook_version": version, "codebook_status": book["status"],
                "coding_target": {"codebook_version": version, "block_key": block_key},
                "coded_reviews": coded_reviews, "rows": rows}
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


# ---------------------------------------------------------------------------
# Part 2: hidden names and the report frame (R-IM07)
# ---------------------------------------------------------------------------

def hidden_name_hits(text) -> list[str]:
    """Hidden names and model IDs in one reader text, by the app's READER rule (R-L01)."""
    if not isinstance(text, str):
        return []
    hits = [name for name, pattern in zip(HIDDEN_NAMES, _HIDDEN_PATTERNS) if pattern.search(text)]
    if _MODEL_ID.search(text):
        hits.append("MODEL_ID")
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
    parts = value.split(":", 2) if isinstance(value, str) else []
    return len(parts) == 3 and parts[0] in COUNT_TOOLS and parts[1] in COUNT_ROW_SOURCES and _text(parts[2])


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
    _need(_method_key_ok(method_key), "method_key must be <count tool>:<source key>:<rules version>")
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
    else:
        kind = "portrait_guess" if row.get("label") == "Giả thuyết" else "portrait_group"
        rules, step = ("portrait_rules", PORTRAIT_RULES_VERSION), STEP_AFTER_PURCHASE
    return {"count_id": row["count_id"], "tool": tool, "source": row["platform"] + "_reviews",
            "platform": row["platform"], "step": step, "kind": kind, "rules": rules, "row": row}


def _count_rows(path: Path, book: dict, groups: dict) -> tuple[list[dict], bool]:
    """Every current count row of the run, as the three count tools return it now (same IDs, same registry rows).
    The second value is false when theme_counts gives NOT_CODED; any other count error is raised."""
    try:
        themes = _theme_counts_at(path, book)["rows"]
    except InsightError as exc:
        if exc.code != "NOT_CODED":
            raise
        themes = None
    keywords = _keyword_counts_at(path, groups)["rows"]
    portraits = _portrait_counts_at(path)["rows"]
    infos = [_row_info(tool, row, book, groups) for tool, rows in
             (("theme_counts", themes or []), ("keyword_counts", keywords), ("portrait_counts", portraits))
             for row in rows]
    return infos, themes is not None


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

    if info["kind"] == "portrait_guess":
        check2, hypothesis = "HYPOTHESIS_ROW", True
    elif info["kind"] != "keyword" and row["writer_basis"] == "review":
        check2 = "WRITER_UNKNOWN"
    elif not row["threshold_met"]:
        check2 = "BELOW_THRESHOLD"
    else:
        brands = store["diversity"].get(info["count_id"])
        check2 = "DIVERSITY_NOT_VERIFIED" if brands is None else ("ONE_BRAND" if brands < 2 else None)

    if info["kind"] == "theme" and not _codebook_approved(ctx["book"]):
        check3 = "CODEBOOK_NOT_APPROVED"
    elif info["kind"] == "keyword" and ctx["groups"]["status"] != "APPROVED":
        check3 = "KEYWORD_GROUPS_NOT_APPROVED"
    else:
        check3 = None if info["rules"] in store["samples"] else "NO_OWNER_SAMPLE_REVIEW"

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
    path = _find_warehouse(run_id)
    infos, theme_coded = _count_rows(path, book, groups)
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
        current = {i["count_id"]: i for i in infos}
        with _warehouse_ro(copy) as wh:
            for count_id, _ in items:
                if count_id in current:
                    continue
                stored = wh.execute("SELECT tool FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
                if stored is not None and stored[0] == "find_reason_links":
                    raise InsightError("INVALID_ARGUMENT", "a reason-link ID is evidence for R-IM11, not a count")
                if stored is not None:
                    raise InsightError("COUNT_ID_STALE", "the count ID is no longer current; call the count tool again")
                raise InsightError("COUNT_ID_UNKNOWN", "the count ID is not a count of this run")
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
    low, high = pair.split("|")
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
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
        return {"run_id": full_id, "theme_a": theme_a, "theme_b": theme_b, "connectors": list(REASON_CONNECTORS),
                "link_basis": LINK_BASIS, "rules_version": REASON_RULES_VERSION, "rows": rows,
                "candidates": candidates}
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


if __name__ == "__main__":
    mcp.run(transport="stdio")

"""Local stdio MCP server `tdn-insight`, part 1: run warehouse, Jev theme coding, SLAYER counts.

Reads stored run data only. The app DB is opened read-only (INSIGHT_MCP_APP_DB, no default); the
artifact store and capture root are read-only. Each run gets its own warehouse file under
INSIGHT_MCP_DATA_DIR. A real Jev call needs INSIGHT_MCP_ALLOW_PAID=1 and a call cap; everything
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

# Set before SLAYER is ever imported (it is imported lazily, per call).
os.environ["DO_NOT_TRACK"] = "1"
os.environ["SLAYER_USAGE_REPORTING"] = "off"

from mcp.server.fastmcp import FastMCP  # noqa: E402

HERE = Path(__file__).resolve().parent
CODEBOOK_PATH = HERE / "data" / "insight-theme-codebook.json"
KEYWORD_GROUPS_PATH = HERE / "data" / "keyword-groups.json"
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
    """The only way the module opens the app DB: read-only URI, never a creating open."""
    uri = "file:" + urllib.parse.quote(str(path)) + "?mode=ro"
    return sqlite3.connect(uri, uri=True)


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
CREATE TABLE run_fact(run_id TEXT PRIMARY KEY, keyword TEXT NOT NULL, created_at TEXT NOT NULL, run_year INTEGER NOT NULL,
  applied_keywords TEXT NOT NULL, applied_category TEXT, scope_capture INTEGER, category_evidence TEXT,
  category_reason TEXT, content_sha256 TEXT NOT NULL, built_at TEXT NOT NULL);
CREATE TABLE source_status(source TEXT PRIMARY KEY, platform TEXT NOT NULL, captured INTEGER NOT NULL,
  row_count INTEGER NOT NULL);
CREATE TABLE review(review_id TEXT PRIMARY KEY, platform TEXT NOT NULL, source_review_id TEXT NOT NULL,
  product_key TEXT NOT NULL, writer_key TEXT NOT NULL, writer_known INTEGER NOT NULL CHECK(writer_known IN (0, 1)),
  rating INTEGER);
CREATE TABLE review_text(review_id TEXT PRIMARY KEY REFERENCES review(review_id), text TEXT NOT NULL);
CREATE TABLE product(product_key TEXT PRIMARY KEY, platform TEXT NOT NULL, product_name TEXT);
CREATE TABLE writer_guess(writer_key TEXT PRIMARY KEY, platform TEXT NOT NULL, gender TEXT NOT NULL,
  age_band TEXT NOT NULL, year_basis TEXT NOT NULL);
CREATE TABLE search_keyword(keyword TEXT PRIMARY KEY, platform TEXT NOT NULL);
CREATE TABLE trends_region(location TEXT NOT NULL, value INTEGER, query TEXT, PRIMARY KEY(location, query));
CREATE TABLE portrait_label(review_id TEXT NOT NULL, dimension TEXT NOT NULL, grp TEXT NOT NULL,
  PRIMARY KEY(review_id, dimension, grp));
"""
SOURCE_TABLES = ("run_fact", "source_status", "review", "review_text", "product", "writer_guess", "search_keyword",
                 "trends_region", "portrait_label")

STATE_SCHEMA = """
CREATE TABLE IF NOT EXISTS coding_target(target_id INTEGER PRIMARY KEY AUTOINCREMENT, codebook_version TEXT NOT NULL,
  block_key TEXT, block_norm TEXT NOT NULL, match_basis TEXT NOT NULL, matched_term TEXT, started_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS coding_state(review_id TEXT NOT NULL, codebook_version TEXT NOT NULL, block_key TEXT,
  block_norm TEXT NOT NULL, input_sha256 TEXT NOT NULL, status TEXT NOT NULL CHECK(status = 'done'),
  PRIMARY KEY(review_id, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS review_input(review_id TEXT NOT NULL, codebook_version TEXT NOT NULL,
  block_norm TEXT NOT NULL, input_sha256 TEXT NOT NULL, PRIMARY KEY(review_id, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS label(label_id INTEGER PRIMARY KEY AUTOINCREMENT, review_id TEXT NOT NULL,
  theme_code TEXT NOT NULL, codebook_version TEXT NOT NULL, block_key TEXT, block_norm TEXT NOT NULL,
  p_yes REAL NOT NULL, polarity TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('kept', 'unclear')),
  step TEXT NOT NULL, text_ref TEXT NOT NULL, text_start INTEGER NOT NULL, text_end INTEGER NOT NULL,
  text_sha256 TEXT NOT NULL, note TEXT, UNIQUE(review_id, theme_code, codebook_version, block_norm));
CREATE TABLE IF NOT EXISTS keyword_group(keyword TEXT NOT NULL, groups_version TEXT NOT NULL, group_key TEXT NOT NULL,
  PRIMARY KEY(keyword, groups_version));
CREATE TABLE IF NOT EXISTS count_registry(count_id TEXT PRIMARY KEY, tool TEXT NOT NULL, row_key TEXT NOT NULL,
  rules_version TEXT NOT NULL, numbers TEXT NOT NULL, state_sha256 TEXT NOT NULL, created_at TEXT NOT NULL);
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
CREATE VIEW v_writer_guess AS SELECT platform, gender, age_band, writer_key FROM writer_guess;
DROP VIEW IF EXISTS v_keyword_group;
CREATE VIEW v_keyword_group AS
  SELECT k.platform, g.groups_version, g.group_key, k.keyword
  FROM search_keyword k JOIN keyword_group g ON g.keyword = k.keyword;
"""


def _runs_dir() -> Path:
    return _data_dir() / "runs"


def _find_warehouse(run_id: str) -> Path:
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
            return handle.read()
    except FileNotFoundError:
        raise InsightError("ARTIFACT_MISSING", f"stored artifact {sha[:12]} is missing from the artifact store") from None


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
    reviews = {}
    for sha in shas:
        response = _capture_response(root, sha)
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
    return list(reviews.values())


def _tiktok_product_names(con, root: Path, run_id: str):
    shas = _captures(con, run_id, "kalodata.product.detail")
    names = {}
    for sha in shas:
        response = _capture_response(root, sha)
        data = response.get("data") if isinstance(response, dict) else None
        if isinstance(data, dict) and data.get("product_id") and isinstance(data.get("product_name"), str):
            names.setdefault(f"tiktok_shop:{data['product_id']}", data["product_name"])
    return names if shas else None


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
            raise InsightError("ARTIFACT_INVALID", "a stored Metric response file cannot be read") from None
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
    keywords = set()
    for sha in shas:
        response = _capture_response(root, sha)
        if not isinstance(response, dict):
            continue
        texts = [x.get("query") for x in response.get("related_searches") or [] if isinstance(x, dict)]
        texts += [x.get("question") for x in response.get("related_questions") or [] if isinstance(x, dict)]
        for text in texts:
            if isinstance(text, str):
                normalized = re.sub(r"\s+", " ", _nz(text).strip())
                if normalized:
                    keywords.add(normalized)
    return sorted(keywords)


def _trends_regions(con, root: Path, run_id: str):
    shas = []
    for sha in _captures(con, run_id, "serpapi.google.trends"):
        envelope = _artifact_json(root, sha)
        params = envelope.get("requestParameters") if isinstance(envelope, dict) else None
        if isinstance(params, dict) and str(params.get("data_type", "")).startswith("GEO_MAP"):
            shas.append(sha)
    if not shas:
        return None
    rows = {}
    for sha in shas:
        response = _capture_response(root, sha)
        if not isinstance(response, dict):
            continue
        query = (response.get("search_parameters") or {}).get("q") if isinstance(response.get("search_parameters"), dict) else None
        for item in response.get("interest_by_region") or []:
            if isinstance(item, dict) and isinstance(item.get("location"), str):
                value = item.get("extracted_value")
                rows.setdefault((item["location"], query), value if isinstance(value, int) else None)
    return sorted((loc, val, q) for (loc, q), val in rows.items())


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
    con = open_app_db(app_db)
    try:
        full_id, keyword, created_at = _resolve_run(con, run_id)
        scope = _scope(captures, full_id, keyword)
        shopee = _shopee_reviews(con, artifacts, full_id)
        tiktok = _tiktok_reviews(con, artifacts, full_id)
        tiktok_names = _tiktok_product_names(con, artifacts, full_id)
        keywords = _search_keywords(con, artifacts, full_id)
        trends = _trends_regions(con, artifacts, full_id)
    finally:
        con.close()
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
            guesses[review["writer_key"]] = (review["platform"], guess_gender(review["name"]),
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
        "review": review_rows, "review_text": text_rows, "product": product_rows, "search_keyword": keyword_rows,
        "trends_region": trend_rows, "run_fact": fact}))
    sources = {
        "shopee_reviews": ("shopee", None if shopee is None else len(shopee)),
        "tiktok_shop_reviews": ("tiktok_shop", None if tiktok is None else len(tiktok)),
        "tiktok_shop_product_names": ("tiktok_shop", None if tiktok_names is None else len(tiktok_names)),
        "shopee_product_names": ("shopee", None if shopee_names is None else len(shopee_names)),
        "search_suggestions": ("google", None if keywords is None else len(keywords)),
        "trends_regions": ("google", None if trends is None else len(trends)),
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
            wh.execute("INSERT INTO run_fact VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (
                full_id, keyword, created_at, run_year, _canonical(scope["applied_keywords"]),
                scope["applied_category"], scope["scope_capture"], scope["category_evidence"],
                scope["category_reason"], content_sha256, datetime.now(timezone.utc).isoformat(timespec="seconds")))
            wh.executemany("INSERT INTO source_status VALUES (?, ?, ?, ?)",
                           [(k, p, 0 if n is None else 1, n or 0) for k, (p, n) in sources.items()])
            wh.executemany("INSERT INTO review VALUES (?, ?, ?, ?, ?, ?, ?)", review_rows)
            wh.executemany("INSERT INTO review_text VALUES (?, ?)", text_rows)
            wh.executemany("INSERT INTO product VALUES (?, ?, ?)", product_rows)
            wh.executemany("INSERT INTO writer_guess VALUES (?, ?, ?, ?, ?)",
                           [(k, *v) for k, v in sorted(guesses.items())])
            wh.executemany("INSERT INTO search_keyword VALUES (?, ?)", keyword_rows)
            wh.executemany("INSERT INTO trends_region VALUES (?, ?, ?)", trend_rows)
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
        "reviews": per_platform(count),
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
    """One Jev request: review text, platform, product name, block label, codebook version, and the questions."""
    block = book["blocks"][selection["blockKey"]]["label"] if selection["blockKey"] else "Chỉ chủ đề lõi"
    state = (f"Nền tảng: {review['platform']}. Sản phẩm: {review['product_name'] or 'không rõ'}. "
             f"Nhóm ngành: {block}. Bộ chủ đề: {book['version']}. Đánh giá: {review['text']}")
    criteria = {o["key"]: o["meaning"] for o in book["options"]}
    questions, states = {}, {}
    for theme in selection["_questions"]:
        instructions = f"{theme['code']} {theme['name']}. Tính khi: {theme['include']}."
        if theme.get("exclude"):
            instructions += f" Không tính khi: {theme['exclude']}."
        questions[theme["code"]] = {"type": "choice", "instructions": instructions, "criteria": dict(criteria)}
        states[theme["code"]] = state
    return {"model": JEV_MODEL, "state": states, "questions": questions}


def _http_transport(body: dict, key: str, timeout: float):
    """POST one request to Jev. Returns (HTTP status, raw response bytes)."""
    request = urllib.request.Request(JEV_ENDPOINT, data=json.dumps(body).encode("utf-8"), method="POST",
                                     headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as exc:
        return exc.code, b""


# Injectable: tests replace this with an offline fake.
JEV_TRANSPORT = _http_transport


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
    if not isinstance(payload, dict) or payload.get("model") != JEV_MODEL or not isinstance(payload.get("answers"), dict):
        raise _CallFailed("JEV_THEME_UNAVAILABLE")
    answers = payload["answers"]
    if set(answers) != set(body["questions"]):
        raise _CallFailed("JEV_THEME_INVALID")
    tolerance = book["thresholds"]["probabilitySumTolerance"]
    out = {}
    for code in body["questions"]:
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
    keywords, category = wh.execute("SELECT applied_keywords, applied_category FROM run_fact").fetchone()
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
        raise InsightError("INVALID_ARGUMENT", "max_calls must be an integer or null")
    if block_override is not None and (not isinstance(block_override, str) or not BLOCK_KEY_RE.match(block_override)):
        raise InsightError("BLOCK_UNKNOWN", "block_override is not a block of the codebook")
    book = load_codebook()
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_fact").fetchone()[0]
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
                    status, raw = JEV_TRANSPORT(body, key, JEV_TIMEOUT_SECONDS)
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

def load_semantic_models(directory: Path | None = None) -> list[dict]:
    """Repo YAML models. A measure named like a column of its model is rejected."""
    import yaml
    directory = SEMANTIC_DIR if directory is None else directory
    models = []
    for path in sorted(Path(directory).glob("*.yaml")):
        model = yaml.safe_load(path.read_text(encoding="utf-8"))
        columns = {c["name"] for c in model.get("columns", [])}
        clash = [m["name"] for m in model.get("measures", []) if m.get("name") in columns]
        if clash:
            raise InsightError("SEMANTIC_MODEL_INVALID", f"model {model.get('name')} has a measure named like a column")
        models.append(model)
    return models


class _Slayer:
    """A SLAYER engine whose storage and datasource live in a fresh temp dir, removed on close."""

    def __init__(self, warehouse: Path):
        self.dir = tempfile.mkdtemp(prefix="insight-slayer-")
        try:
            import asyncio
            from slayer.core.models import DatasourceConfig, SlayerModel
            from slayer.engine.query_engine import SlayerQueryEngine
            from slayer.storage.yaml_storage import YAMLStorage
            storage = YAMLStorage(base_dir=os.path.join(self.dir, "store"))
            models = load_semantic_models()

            async def setup():
                await storage.save_datasource(DatasourceConfig(name="warehouse", type="sqlite", database=str(warehouse)))
                for model in models:
                    await storage.save_model(SlayerModel(**model))
            asyncio.run(setup())
            self.engine = SlayerQueryEngine(storage=storage)
        except BaseException:
            self.close()
            raise

    def close(self):
        shutil.rmtree(self.dir, ignore_errors=True)


def _slayer_rows(slayer: _Slayer, model: str, measures: list[str], dimensions: list[str], filters: list[str]) -> list[dict]:
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
        slayer_rows = _slayer_rows(slayer, model, measures, dimensions, filters)
    except Exception:  # noqa: BLE001 - SLAYER error text is not returned
        raise InsightError("SLAYER_FAILED", f"SLAYER could not compute {model}; no numbers returned") from None
    sql_rows = [dict(zip(dimensions + measures, row)) for row in warehouse.execute(sql, params).fetchall()]

    def key(rows):
        return sorted(tuple((k, None if row.get(k) is None else (int(row[k]) if k in measures else str(row[k])))
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
REF_WRITER = "SELECT platform, {dim}, COUNT(DISTINCT writer_key) FROM writer_guess GROUP BY platform, {dim}"
REF_KEYWORD = """
SELECT k.platform, g.group_key, COUNT(DISTINCT k.keyword)
FROM search_keyword k JOIN keyword_group g ON g.keyword = k.keyword
WHERE g.groups_version = ?
GROUP BY k.platform, g.group_key
"""


# ---------------------------------------------------------------------------
# Count IDs and threshold fields
# ---------------------------------------------------------------------------

def _state_sha(wh) -> str:
    content = wh.execute("SELECT content_sha256 FROM run_fact").fetchone()[0]
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
        stored = wh.execute("SELECT numbers FROM count_registry WHERE count_id = ?", (count_id,)).fetchone()
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
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_fact").fetchone()[0]
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
            filters = target_filters + [f"theme_code in ({theme_list})"]
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
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_fact").fetchone()[0]
        captured = wh.execute("SELECT captured FROM source_status WHERE source = 'search_suggestions'").fetchone()
        base = {"run_id": full_id, "keyword_groups_version": groups["version"],
                "keyword_groups_status": groups["status"]}
        if not captured or not captured[0]:
            return {**base, "keywords": NO_DATA, "rows": [], "step_totals": NO_DATA}
        meta = {g["group_key"]: g for g in groups["groups"]}
        meta[groups["fallback"]["group_key"]] = groups["fallback"]
        assignments = []
        for (keyword,) in wh.execute("SELECT keyword FROM search_keyword ORDER BY keyword").fetchall():
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
    path = _find_warehouse(run_id)
    wh = _open_warehouse(path)
    try:
        full_id = wh.execute("SELECT run_id FROM run_fact").fetchone()[0]
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
        out = []
        for platform in platforms:
            gender_rows = [r for r in demo_rows if r["platform"] == platform and r["dimension"] == "Giới"]
            age_rows = [r for r in demo_rows if r["platform"] == platform and r["dimension"] == "Nhóm tuổi"]
            out.append({"platform": platform,
                        "groups": [r for r in group_rows if r["platform"] == platform],
                        "gender": gender_rows or NO_DATA, "age": age_rows or NO_DATA})
        return {"run_id": full_id, "portrait_rules_version": PORTRAIT_RULES_VERSION, "platforms": out}
    finally:
        wh.close()


if __name__ == "__main__":
    mcp.run()

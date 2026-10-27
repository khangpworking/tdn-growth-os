"""Local stdio MCP server for the TDN Market flow (read-only unless MCP_PROTO_ALLOW_WRITES=1).

Every tool needs TDN_WORKSPACE_ID; no workspace id is built in. The app host and
port are pinned to 127.0.0.1:8787.
"""

import http.client
import json
import os
import re
import subprocess
import sys
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from mcp.server.fastmcp import FastMCP

HOST = "127.0.0.1"
PORT = 8787
ORIGIN = "http://127.0.0.1:8787"
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$")
OUT_DIR = Path(__file__).resolve().parent / "out"
HTML_MAX_BYTES = 2 * 1024 * 1024
V3_CATEGORY = {
    "id": "c2035652732",
    "label": "Sức Khoẻ",
    "children": [
        {"id": "c407923064", "label": "Chăm sóc sức khỏe"},
        {"id": "c1221630203", "label": "Dinh dưỡng thể thao, protein"},
        {"id": "c1110582659", "label": "Sức khỏe khác"},
        {"id": "c2140822537", "label": "Thực phẩm chức năng"},
    ],
}
CHILD_IDS = [child["id"] for child in V3_CATEGORY["children"]]

# Owner-facing wording mirrored from frontend/src/research-automation/autorun-text.ts.
PHASE_TEXT = {
    "WAITING_SCOPE": "Đang chờ tìm sản phẩm xong để tự lấy số liệu.",
    "CAPTURE": "Đang tự lấy số liệu bán hàng Shopee và TikTok Shop (có thể mất đến 25 phút).",
    "PREPARE": "Đang kiểm tra số liệu và chọn 5 sản phẩm Shopee bán chạy.",
    "PICK": "Đang kiểm tra số liệu và chọn 5 sản phẩm Shopee bán chạy.",
    "CONFIRM": "Đang kiểm tra số liệu và chọn 5 sản phẩm Shopee bán chạy.",
    "WAIT_DRAFT": "Đang viết báo cáo nháp.",
    "PRESENT": "Đang làm bìa và biểu đồ cho báo cáo.",
    "DONE": "Phần tự động đã xong: bản nháp, bìa và biểu đồ. Bản đọc để xem và duyệt nằm ở mục \"Bản đọc\" phía trên.",
}
LOGIN_TEXT = "Cần đăng nhập lại công cụ số liệu trên máy chạy. Báo cáo đã dừng, chưa tốn thêm lượt tra cứu."
LOGIN_SUFFIX = " Chủ sở hữu cần tự đăng nhập Metric trên web; MCP không tự sửa nguồn."
FALLBACK_TEXT = "Phần tự động đã dừng. Bạn có thể làm tiếp thủ công như trước."
DISABLED_TEXT = "Chế độ tự lấy số liệu đang tắt hoặc chưa cài đặt xong. Có thể làm thủ công như trước."
PERIOD_TEXT = "Khoảng thời gian của báo cáo không khớp 30 ngày gần nhất nên không tự lấy được."
FILTER_TEXT = "Bộ lọc tìm kiếm không áp dụng đúng. Số liệu không được dùng."
CHANGED_TEXT = "Trang số liệu đã thay đổi hoặc bộ công cụ không đúng phiên bản. Cần kỹ thuật kiểm tra."
INCOMPLETE_TEXT = "Số liệu thu được không đầy đủ hoặc không hợp lệ nên không được dùng."
INTERRUPTED_TEXT = "Lấy số liệu bị gián đoạn. Bấm \"Thử lại\" sẽ tốn thêm một lượt tra cứu."
OWNER_TEXT = "Bạn đã tự xác nhận hoặc chỉnh báo cáo, nên phần tự động dừng lại."
RUN_ENDED_TEXT = "Phiên nghiên cứu đã kết thúc hoặc bị hủy, nên phần tự động dừng lại."
STEP_FAILED_TEXT = "Bước tự kiểm tra số liệu chưa làm được. Bạn có thể làm tiếp thủ công như trước."
STOP_TEXT = {
    "METRIC_LOGIN_REQUIRED": LOGIN_TEXT,
    "METRIC_CAPTCHA": "Trang số liệu yêu cầu xác minh người dùng. Cần người mở máy xử lý.",
    "BRIDGE_DISCONNECTED": "Trình duyệt trên máy chạy chưa kết nối. Cần mở lại trình duyệt rồi bấm \"Thử lại\".",
    "EXECUTOR_DISABLED": DISABLED_TEXT,
    "EXECUTOR_NOT_CONFIGURED": DISABLED_TEXT,
    "METRIC_PERIOD_UNSUPPORTED": PERIOD_TEXT,
    "PERIOD_OUTSIDE_RUN": PERIOD_TEXT,
    "METRIC_FILTER_MISMATCH": FILTER_TEXT,
    "METRIC_SEARCH_NOT_APPLIED": FILTER_TEXT,
    "METRIC_UI_CHANGED": CHANGED_TEXT,
    "MANIFEST_HASH_MISMATCH": CHANGED_TEXT,
    "METRIC_ROW_CAP": INCOMPLETE_TEXT,
    "TIMEOUT": INTERRUPTED_TEXT,
    "CAPTURE_INTERRUPTED": INTERRUPTED_TEXT,
    "CAPTURE_INPUT_INVALID": INCOMPLETE_TEXT,
    "CAPTURE_IO_FAILED": INTERRUPTED_TEXT,
    "CAPTURE_SMART_QUERY_OFF": FILTER_TEXT,
    "CAPTURE_CATEGORY_NOT_SELECTABLE": FILTER_TEXT,
    "CAPTURE_PRESET_INVALID": INCOMPLETE_TEXT,
    "CAPTURE_ORIGIN_CHANGED": CHANGED_TEXT,
    "CAPTURE_LOGIN_REQUIRED": LOGIN_TEXT,
    "CAPTURE_ACCESS_RESTRICTED": CHANGED_TEXT,
    "CAPTURE_UI_CHANGED": CHANGED_TEXT,
    "CAPTURE_CONTROL_NOT_SELECTABLE": FILTER_TEXT,
    "CAPTURE_APPLIED_STATE_MISMATCH": FILTER_TEXT,
    "CAPTURE_COMPARISON_MISMATCH": FILTER_TEXT,
    "CAPTURE_RESPONSE_MISSING": INCOMPLETE_TEXT,
    "CAPTURE_REQUEST_SCOPE_MISMATCH": FILTER_TEXT,
    "CAPTURE_TREND_INTERVAL_MISMATCH": INCOMPLETE_TEXT,
    "CAPTURE_INITIAL_STATE_UNEXPECTED": FILTER_TEXT,
    "CAPTURE_KEYWORDS_NOT_APPLIED": FILTER_TEXT,
    "CAPTURE_RESPONSE_LIMIT": INCOMPLETE_TEXT,
    "CAPTURE_RESPONSE_TIMEOUT": INTERRUPTED_TEXT,
    "CAPTURE_PERIOD_NOT_SELECTABLE": FILTER_TEXT,
    "CAPTURE_TAB_UNAVAILABLE": CHANGED_TEXT,
    "CAPTURE_FAILED": INTERRUPTED_TEXT,
    "CAPTURE_BRIDGE_TIMEOUT": INTERRUPTED_TEXT,
    "CAPTURE_SELECTOR_TIMEOUT": CHANGED_TEXT,
    "CAPTURE_PROVIDER_DATA_ERROR": INCOMPLETE_TEXT,
    "CAPTURE_PAGE_REQUEST_FAILED": INTERRUPTED_TEXT,
    "CAPTURE_FALLBACK_FAILED": INTERRUPTED_TEXT,
    "CAPTURE_PAGE_SESSION_UNAVAILABLE": CHANGED_TEXT,
    "CAPTURE_OVERSIZE": INCOMPLETE_TEXT,
    "CAPTURE_INVALID_JSON": INCOMPLETE_TEXT,
    "CAPTURE_SCHEMA_INVALID": INCOMPLETE_TEXT,
    "CAPTURE_MANIFEST_INVALID": INCOMPLETE_TEXT,
    "CAPTURE_GATE_NOT_CLEARED": INCOMPLETE_TEXT,
    "CAPTURE_DIGEST_MISMATCH": INCOMPLETE_TEXT,
    "CAPTURE_SCOPE_MISMATCH": INCOMPLETE_TEXT,
    "CAPTURE_PRODUCTS_MISSING": INCOMPLETE_TEXT,
    "CAPTURE_INTEGRITY_FAILED": INCOMPLETE_TEXT,
    "CAPTURE_RAW_MISMATCH": INCOMPLETE_TEXT,
    "CAPTURE_FILES_MISSING": INCOMPLETE_TEXT,
    "CAPTURE_PREPARE_FAILED": STEP_FAILED_TEXT,
    "CAPTURE_V3_PREPARE_UNSUPPORTED": STEP_FAILED_TEXT,
    "PICK_FAILED": STEP_FAILED_TEXT,
    "CONFIRM_FAILED": STEP_FAILED_TEXT,
    "CONFIRM_REJECTED": STEP_FAILED_TEXT,
    "PROVIDER_UNAVAILABLE": "Máy chủ nguồn dữ liệu trả lỗi nên bước tìm sản phẩm đã dừng. Thường chỉ xảy ra một lần; tạo lượt mới để thử lại.",
    "PROVIDER_FAILED": "Nguồn dữ liệu gặp lỗi ở bước tìm sản phẩm nên phần tự động dừng. Tạo lượt mới để thử lại.",
    "PROVIDER_CREDIT_EXHAUSTED": "Nguồn dữ liệu đã hết lượt tra cứu nên phần tự động dừng. Cần nạp thêm lượt rồi tạo lượt mới.",
    "PROVIDER_OUTPUT_INVALID": "Dữ liệu nguồn không vượt qua kiểm tra nên phần tự động dừng.",
    "KALODATA_REPLAY_MISS": "Bản chạy thử thiếu dữ liệu đã lưu cho một yêu cầu nên phần tự động dừng.",
    "KALODATA_REPLAY_SCOPE_MISMATCH": "Bản chạy thử khác từ khóa hoặc khoảng thời gian của lần chạy gốc nên phần tự động dừng.",
    "NO_PRINCIPAL_PRODUCTS": "Không có sản phẩm chính để xác nhận phạm vi.",
    "SCOPE_CHANGED_BY_OWNER": OWNER_TEXT,
    "OWNER_REVISION_EXISTS": OWNER_TEXT,
    "PRESENTATION_FAILED": "Báo cáo nháp đã có, nhưng chưa làm được bìa và biểu đồ.",
    "RUN_FAILED": RUN_ENDED_TEXT,
    "RUN_CANCELLED": RUN_ENDED_TEXT,
    "RUN_INTERRUPTED": RUN_ENDED_TEXT,
    "CANCELLED": RUN_ENDED_TEXT,
    "KEYWORD2_AWAITING": "Đã lấy số liệu lượt đầu. Chờ bạn duyệt từ khóa 2 trước lượt lấy số liệu thứ hai.",
}
LOGIN_CODES = {"METRIC_LOGIN_REQUIRED", "CAPTURE_LOGIN_REQUIRED"}

mcp = FastMCP("tdn-market")


class _AppHTTPError(RuntimeError):
    def __init__(self, status: int, body: object):
        self.status = status
        super().__init__(f"BLOCKED: app GET returned HTTP {status}: {_short(body)}")


def _log(message: str) -> None:
    print(f"[tdn-market] {message}", file=sys.stderr, flush=True)


def _check_uuid(value: str, name: str) -> str:
    if not isinstance(value, str) or not UUID_RE.match(value):
        raise ValueError(f"{name} must be a lowercase UUID")
    return value


def _workspace() -> str:
    """Required for every tool: there is no default workspace id."""
    value = os.environ.get("TDN_WORKSPACE_ID")
    if not value:
        raise ValueError("TDN_WORKSPACE_ID is required: set it to the workspace UUID; no default is built in")
    return _check_uuid(value, "workspace_id")


def _request(method: str, path: str, body: dict | None = None, timeout: int = 20) -> dict:
    """One HTTP call, pinned to 127.0.0.1:8787 and Origin. Returns status + JSON body."""
    headers = {"Origin": ORIGIN, "Host": f"{HOST}:{PORT}", "Accept": "application/json"}
    payload = None
    if body is not None:
        payload = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
        headers["Authorization"] = "Bearer " + _runtime_token()
    connection = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    try:
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        raw = response.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = raw[:500]
        if method == "GET" and response.status >= 400:
            raise _AppHTTPError(response.status, parsed)
        return {"http": response.status, "body": parsed}
    finally:
        connection.close()


def _request_bytes(method: str, path: str, timeout: int = 120) -> dict:
    """Raw GET for HTML/PDF; no token is read or sent."""
    connection = http.client.HTTPConnection(HOST, PORT, timeout=timeout)
    try:
        connection.request(method, path, headers={"Origin": ORIGIN, "Host": f"{HOST}:{PORT}"})
        response = connection.getresponse()
        raw = response.read()
        status = response.status
        content_type = response.getheader("Content-Type") or ""
    finally:
        connection.close()
    if status != 200:
        raise _AppHTTPError(status, raw.decode("utf-8", "replace"))
    return {"http": status, "bytes": raw, "content_type": content_type}


def _runtime_token() -> str:
    """Read the dev token at runtime; never logged or stored."""
    token = os.environ.get("TDN_APP_TOKEN")
    if not token:
        result = _request_without_auth("POST", "/owner-api/local-test-session", {})
        body = result.get("body") or {}
        token = body.get("token") if isinstance(body, dict) else None
    if not token:
        raise RuntimeError("could not obtain a runtime token")
    # http.client puts malformed header values into exceptions; reject them here
    # with a fixed message before a credential can reach its header encoder.
    if not isinstance(token, str) or not re.fullmatch(r"[\x21-\x7e]+", token):
        raise RuntimeError("runtime token is not a valid HTTP bearer token")
    return token


def _request_without_auth(method: str, path: str, body: dict) -> dict:
    connection = http.client.HTTPConnection(HOST, PORT, timeout=20)
    try:
        connection.request(
            method,
            path,
            body=json.dumps(body).encode(),
            headers={"Origin": ORIGIN, "Host": f"{HOST}:{PORT}", "Content-Type": "application/json"},
        )
        response = connection.getresponse()
        raw = response.read().decode("utf-8", "replace")
        try:
            parsed = json.loads(raw) if raw else None
        except ValueError:
            parsed = raw[:500]
        return {"http": response.status, "body": parsed}
    finally:
        connection.close()


def _writes_allowed() -> bool:
    return os.environ.get("MCP_PROTO_ALLOW_WRITES") == "1"


def _refusal(tool: str) -> dict:
    _log(f"refused {tool}: owner approval needed; no network call made")
    return {"refused": "owner approval needed", "tool": tool, "network_call": False}


def _error(message: str, **extra) -> dict:
    return {"error": message, "network_call": False, **extra}


def _short(value: object) -> object:
    text = value if isinstance(value, str) else json.dumps(value, ensure_ascii=False)
    return text[:500]


def _write_result(tool: str, request_key: str, response: dict) -> dict:
    if response["http"] >= 400:
        hint = " Một lượt nghiên cứu khác đang chạy; chờ lượt đó xong rồi thử lại." if response["http"] == 409 else ""
        return {"tool": tool, "http": response["http"], "error": f"app rejected the request.{hint}".strip(),
                "body": _short(response["body"]), "requestKey": request_key}
    return {"tool": tool, "http": response["http"], "receipt": response["body"], "requestKey": request_key}


def _path(workspace_id: str, run_id: str | None = None, suffix: str = "") -> str:
    base = f"/api/workspaces/{workspace_id}/research-automation/runs"
    if run_id is None:
        return base
    return f"{base}/{run_id}{suffix}"


def _owner_path(workspace_id: str, run_id: str, suffix: str) -> str:
    return f"/owner-api/workspaces/{workspace_id}/research-automation/runs/{run_id}{suffix}"


def _run(workspace_id: str, run_id: str) -> dict:
    response = _request("GET", _path(workspace_id, run_id))
    return response["body"] if isinstance(response["body"], dict) else {}


def _reader_revisions(workspace_id: str, run_id: str) -> list[dict]:
    try:
        response = _request("GET", _path(workspace_id, run_id, "/reader-reports/v2"))
        body = response["body"]
        if isinstance(body, dict) and isinstance(body.get("revisions"), list):
            return body["revisions"]
    except _AppHTTPError as exc:
        if exc.status != 404:
            raise
    response = _request("GET", _path(workspace_id, run_id, "/reader-reports"))
    body = response["body"]
    if isinstance(body, dict) and isinstance(body.get("revisions"), list):
        return body["revisions"]
    return []


def _latest_market_revision(workspace_id: str, run_id: str) -> dict | None:
    revisions = [r for r in _reader_revisions(workspace_id, run_id) if isinstance(r, dict)]
    markets = [r for r in revisions if r.get("reportKind", "MARKET") == "MARKET"]
    if not markets:
        return None
    return max(markets, key=lambda r: int(r.get("revisionNumber") or 0))


def _owner_message(auto: dict) -> str:
    phase = auto.get("phase")
    stop_code = auto.get("stopCode")
    if stop_code:
        text = STOP_TEXT.get(stop_code, FALLBACK_TEXT)
        return text + (LOGIN_SUFFIX if stop_code in LOGIN_CODES else "")
    return PHASE_TEXT.get(phase, FALLBACK_TEXT)


def _compact_run(run: dict) -> dict:
    auto = run.get("autoRun") or {}
    steps = run.get("steps") or []
    suggestion = auto.get("keyword2Suggestion")
    result = {
        "runId": run.get("runId"),
        "status": run.get("status"),
        "revision": run.get("revision"),
        "keyword": run.get("keyword"),
        "period": run.get("requestedPeriod"),
        "reports": run.get("reports"),
        "steps": [{"id": s.get("stepId") or s.get("id"), "state": s.get("state"), "code": s.get("code")} for s in steps],
        "autoRun": {k: auto.get(k) for k in ("phase", "state", "stopCode", "canRetry")},
        "owner_message": _owner_message(auto),
    }
    if auto.get("phase") == "STOPPED" and auto.get("stopCode") == "KEYWORD2_AWAITING" and suggestion:
        result["keyword2Suggestion"] = {
            "keyword1": suggestion.get("keyword1"),
            "term": suggestion.get("term"),
            "titles": suggestion.get("titles"),
            "titleCount": suggestion.get("titleCount"),
            "brands": suggestion.get("brands"),
        }
        result["categoryId"] = suggestion.get("categoryId")
    return result


def _nfc(value: str) -> str:
    return unicodedata.normalize("NFC", value).strip()


def resolve_category_ids(category_ids: list[str] | None) -> list[str]:
    """The retained metric-v3-capture-spec-v1 preset needs exactly the 4 verified children."""
    if category_ids is None:
        return list(CHILD_IDS)
    if not isinstance(category_ids, list) or not all(isinstance(item, str) for item in category_ids):
        raise ValueError("category_ids must be a list of Sức Khoẻ child ids")
    unknown = [item for item in category_ids if item not in CHILD_IDS]
    if unknown:
        raise ValueError(f"unknown category id(s) {unknown}; allowed children are {CHILD_IDS}")
    if len(set(category_ids)) != 4:
        raise ValueError("metric-v3-capture-spec-v1 needs exactly all 4 verified Sức Khoẻ children; omit category_ids to use them")
    return list(CHILD_IDS)


def metric_v3_defaults(keyword1: str, keyword2: str, end_date: str, category_ids: list[str] | None = None) -> dict:
    """Same category, filters and windows as src/shared/metric-v3-preset.ts, on the retained v1 contract."""
    end = date.fromisoformat(end_date)
    start = lambda days: (end - timedelta(days=days - 1)).isoformat()
    children = [dict(child) for child in V3_CATEGORY["children"] if child["id"] in resolve_category_ids(category_ids)]
    return {
        "contractVersion": "metric-v3-capture-spec-v1",
        "preset": {
            "keywords": [keyword1, keyword2],
            "smartQuery": True,
            "category": {"id": V3_CATEGORY["id"], "label": V3_CATEGORY["label"], "children": children},
            "usefulFilters": {"fake": True, "gifts": True, "deleted": True},
            "advancedFilter": {
                "firstField": "rating_count",
                "operator": ">",
                "firstRate": 1,
                "secondField": "order_count",
                "secondRate": 0.02,
            },
            "shopTypes": ["mall", "regular"],
            "platforms": ["shopee", "lazada", "tiki", "tiktok"],
            "aiNormalisation": False,
            "customizeCategory": False,
            "exclusions": [],
        },
        "windows": [
            {"id": "30d", "period": {"startDate": start(30), "endDate": end_date}, "intervalDays": 7},
            {"id": "12m", "period": {"startDate": start(365), "endDate": end_date}, "intervalDays": 30},
        ],
    }


def build_confirm_body(keyword1: str, keyword2: str, end_date: str, category_ids: list[str] | None = None,
                       request_key: str | None = None) -> dict:
    """Pure builder for the keyword-2 answer the form sends; used by confirm_preset and the dry-run probe."""
    keyword1 = _nfc(keyword1)
    keyword2 = _nfc(keyword2)
    if not keyword1 or len(keyword1) > 120:
        raise ValueError("keyword1 (the run keyword) must be 1-120 characters")
    if not keyword2 or len(keyword2) > 80:
        raise ValueError("keyword2 must be 1-80 characters")
    if keyword1.casefold() == keyword2.casefold():
        raise ValueError("keyword2 must differ from keyword1")
    if not isinstance(end_date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", end_date):
        raise ValueError("the run has no valid requestedPeriod.endDate")
    preset = metric_v3_defaults(keyword1, keyword2, end_date, category_ids)
    return {
        "contractVersion": "research-automation-autorun-keyword-v2",
        "requestKey": request_key or str(uuid.uuid4()),
        "keyword2": keyword2,
        "metricV3Preset": preset,
    }


def _yesterday_vn() -> date:
    return (datetime.now(timezone.utc) + timedelta(hours=7)).date() - timedelta(days=1)


def _pdf_info(path: Path) -> tuple[int | None, str | None]:
    try:
        result = subprocess.run(["pdfinfo", str(path)], capture_output=True, text=True, timeout=30)
        pages = re.search(r"^Pages:\s+(\d+)", result.stdout, re.MULTILINE)
        size = re.search(r"^Page size:\s+(.+)$", result.stdout, re.MULTILINE)
        if pages:
            return int(pages.group(1)), size.group(1).strip() if size else None
    except (OSError, subprocess.SubprocessError):
        pass
    data = path.read_bytes()
    return len(re.findall(rb"/Type\s*/Page\b(?!s)", data)), None


@mcp.tool()
def start_market(product: str, keyword1: str, period_days: int = 365) -> dict:
    """Start a Market-only auto-run. Guarded: refuses unless MCP_PROTO_ALLOW_WRITES=1 is set by the owner."""
    if not _writes_allowed():
        return _refusal("start_market")
    if not isinstance(period_days, int) or period_days < 365:
        return _error("period_days must be at least 365: the v3 preset needs the 12-month window inside the run period")
    product = _nfc(product)
    keyword1 = _nfc(keyword1)
    if not product or not keyword1:
        return _error("product and keyword1 must not be empty")
    end = _yesterday_vn()
    start = end - timedelta(days=period_days - 1)
    request_key = str(uuid.uuid4())
    body = {
        "contractVersion": "research-automation-start-v2",
        "requestKey": request_key,
        "mode": "PRODUCT",
        "keyword": keyword1,
        "description": product,
        "requestedPeriod": {"startDate": start.isoformat(), "endDate": end.isoformat()},
        "reports": ["MARKET"],
    }
    response = _request("POST", f"/owner-api/workspaces/{_workspace()}/research-automation/runs", body)
    return _write_result("start_market", request_key, response)


@mcp.tool()
def run_status(run_id: str) -> dict:
    """Read one Market run: status, steps, auto-run phase, keyword-2 suggestion, report revisions. Read-only."""
    run_id = _check_uuid(run_id, "run_id")
    workspace_id = _workspace()
    result = _compact_run(_run(workspace_id, run_id))
    rewrites = [
        {
            "revisionId": r.get("revisionId"),
            "revisionNumber": r.get("revisionNumber"),
            "reportKind": r.get("reportKind", "MARKET"),
            "state": r.get("state"),
        }
        for r in _reader_revisions(workspace_id, run_id)
        if isinstance(r, dict)
    ]
    result["reportRevisions"] = rewrites
    return result


@mcp.tool()
def confirm_preset(run_id: str, keyword2: str, category_ids: list[str] | None = None) -> dict:
    """Answer the keyword-2 wait with the v3 preset. Guarded: refuses unless MCP_PROTO_ALLOW_WRITES=1."""
    run_id = _check_uuid(run_id, "run_id")
    if not _writes_allowed():
        return _refusal("confirm_preset")
    try:
        category_ids = resolve_category_ids(category_ids)
    except ValueError as exc:
        return _error(str(exc))
    workspace_id = _workspace()
    try:
        run = _run(workspace_id, run_id)
    except RuntimeError as exc:
        return _error(str(exc))
    auto = run.get("autoRun") or {}
    if auto.get("phase") != "STOPPED" or auto.get("stopCode") != "KEYWORD2_AWAITING":
        return {"refused": "run is not waiting for keyword 2", "send": False, "state": _compact_run(run)}
    end_date = (run.get("requestedPeriod") or {}).get("endDate")
    try:
        body = build_confirm_body(run.get("keyword") or "", keyword2, end_date, category_ids)
    except ValueError as exc:
        return _error(str(exc))
    response = _request("POST", _owner_path(workspace_id, run_id, "/auto-run/retry"), body)
    return _write_result("confirm_preset", body["requestKey"], response)


@mcp.tool()
def get_report(run_id: str, format: str = "html") -> dict:
    """Read the latest Market Reader revision as HTML text, a saved PDF, or the KPI JSON when the app exposes one."""
    run_id = _check_uuid(run_id, "run_id")
    if format not in ("html", "pdf", "numbers"):
        return _error("format must be one of html, pdf, numbers")
    workspace_id = _workspace()
    revision = _latest_market_revision(workspace_id, run_id)
    if revision is None:
        return {"available": False, "reason": "this run has no Market Reader revision yet"}
    revision_id = revision.get("revisionId")
    revision_number = revision.get("revisionNumber")
    base = {
        "runId": run_id,
        "revisionId": revision_id,
        "revisionNumber": revision_number,
        "builderVersion": revision.get("builderVersion"),
    }
    if format == "numbers":
        capture = _request("GET", _path(workspace_id, run_id, "/sources/metric-capture"))
        captured = _request("GET", _path(workspace_id, run_id, "/sources/metric"))
        capture_body = capture["body"] if isinstance(capture["body"], dict) else {}
        captured_body = captured["body"] if isinstance(captured["body"], dict) else {}
        entries = (capture_body.get("sources") or []) + (captured_body.get("sources") or [])
        if not entries:
            return {**base, "available": False,
                    "reason": "no app API returns captured KPI values for this run: "
                              "automation-prepared-metric-capture-list-v1 and the prepared metric list are empty. "
                              "KPI numbers exist only inside the Reader HTML, which this tool does not parse."}
        return {**base, "available": False,
                "reason": "the prepared source inventories expose package metadata only, not KPI values.",
                "inventoryEntries": len(entries)}
    if format == "html":
        page = _request_bytes("GET", _path(workspace_id, run_id, f"/reader-reports/{revision_id}/html"))
        data = page["bytes"]
        if len(data) <= HTML_MAX_BYTES:
            return {**base, "format": "html", "bytes": len(data), "html": data.decode("utf-8", "replace")}
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        path = OUT_DIR / f"{run_id}-r{revision_number}.html"
        path.write_bytes(data)
        return {**base, "format": "html", "bytes": len(data), "path": str(path), "html": None}
    page = _request_bytes("GET", _path(workspace_id, run_id, f"/reader-reports/{revision_id}/pdf"))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / f"{run_id}-r{revision_number}.pdf"
    path.write_bytes(page["bytes"])
    pages, page_size = _pdf_info(path)
    return {**base, "format": "pdf", "path": str(path), "bytes": len(page["bytes"]), "pageCount": pages, "pageSize": page_size}


@mcp.tool()
def cancel_run(run_id: str, expected_revision: int | None = None) -> dict:
    """Cancel a Market run. Guarded: refuses unless MCP_PROTO_ALLOW_WRITES=1 is set by the owner."""
    run_id = _check_uuid(run_id, "run_id")
    if not _writes_allowed():
        return _refusal("cancel_run")
    workspace_id = _workspace()
    if expected_revision is None:
        expected_revision = _run(workspace_id, run_id).get("revision")
    if not isinstance(expected_revision, int):
        return _error("expected_revision is required when the run revision cannot be read")
    request_key = str(uuid.uuid4())
    body = {
        "contractVersion": "research-automation-cancel-v1",
        "requestKey": request_key,
        "expectedRevision": expected_revision,
    }
    response = _request("POST", _owner_path(workspace_id, run_id, "/cancel"), body)
    return _write_result("cancel_run", request_key, response)


if __name__ == "__main__":
    mcp.run()

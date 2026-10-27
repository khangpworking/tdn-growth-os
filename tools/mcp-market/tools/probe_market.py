"""Stored-data probe for market_tools: reads only, proves no write request escapes.

The run id comes from --run-id or TDN_RUN_ID; the workspace comes from
TDN_WORKSPACE_ID (required). No live start, cancel or confirm is issued.
"""

import argparse
import json
import os
import sys
from pathlib import Path

MARKET = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(MARKET))
os.environ.pop("MCP_PROTO_ALLOW_WRITES", None)

import market_tools as mt  # noqa: E402

calls: list[tuple[str, str]] = []
_real_request = mt._request


def counting_request(method, path, body=None, **kwargs):
    calls.append((method, path))
    return _real_request(method, path, body, **kwargs)


mt._request = counting_request


def writes():
    return [call for call in calls if call[0] != "GET"]


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run-id", default=os.environ.get("TDN_RUN_ID"),
                        help="research run UUID; TDN_RUN_ID is used when omitted")
    return parser.parse_args()


args = parse_args()
if not args.run_id:
    sys.exit("a run id is required: pass --run-id or set TDN_RUN_ID")
RUN = args.run_id

summary: dict = {}

status = mt.run_status(RUN)
summary["run_status"] = {
    "status": status.get("status"),
    "autoRunPhase": (status.get("autoRun") or {}).get("phase"),
    "revision": status.get("revision"),
    "stepCount": len(status.get("steps") or []),
    "reportRevisions": [r.get("revisionId") for r in status.get("reportRevisions") or []],
    "owner_message": status.get("owner_message"),
}

html = mt.get_report(RUN, "html")
summary["html"] = {
    "revisionId": html.get("revisionId"),
    "bytes": html.get("bytes"),
    "returnedText": bool(html.get("html")),
    "path": html.get("path"),
    "startsWith": (html.get("html") or "")[:15],
}

pdf = mt.get_report(RUN, "pdf")
summary["pdf"] = {
    "path": pdf.get("path"),
    "bytes": pdf.get("bytes"),
    "pageCount": pdf.get("pageCount"),
    "pageSize": pdf.get("pageSize"),
    "a4": "A4" in (pdf.get("pageSize") or "") if pdf.get("pageSize") else None,
}

summary["numbers"] = mt.get_report(RUN, "numbers")

before = len(calls)
refusals = {
    "start_market": mt.start_market("Sản phẩm mẫu", "sản phẩm mẫu"),
    "confirm_preset": mt.confirm_preset(RUN, "sản phẩm mẫu phụ"),
    "cancel_run": mt.cancel_run(RUN),
}
summary["refusals"] = {
    name: {"refused": value.get("refused"), "network_call": value.get("network_call")}
    for name, value in refusals.items()
}
summary["refusal_write_requests"] = writes()
summary["refusal_http_calls"] = len(calls) - before

requests_before_bad = len(calls)
try:
    mt.build_confirm_body("sản phẩm mẫu", "sản phẩm mẫu phụ", "2026-01-15", ["c999999999"])
    bad = {"rejected": False}
except ValueError as exc:
    bad = {"rejected": True, "error": str(exc)}
bad["http_calls"] = len(calls) - requests_before_bad
summary["bad_category"] = bad

summary["http_calls_total"] = len(calls)
summary["write_requests_total"] = writes()
summary["checks"] = {
    "run_done_with_revision": summary["run_status"]["autoRunPhase"] == "DONE"
        and bool(summary["run_status"]["reportRevisions"]),
    "html_is_text": summary["html"]["returnedText"] and summary["html"]["startsWith"] == "<!doctype html>",
    "pdf_has_pages": bool(summary["pdf"]["pageCount"]),
    "refusals_sent_no_write": not summary["refusal_write_requests"] and summary["refusal_http_calls"] == 0,
    "bad_category_no_request": summary["bad_category"]["rejected"] and summary["bad_category"]["http_calls"] == 0,
}
summary["PASS"] = all(summary["checks"].values())
print(json.dumps(summary, ensure_ascii=False, indent=1))

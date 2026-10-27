"""Offline contract tests for the Market MCP; no live service or agent CLI."""

import copy
import io
import json
from contextlib import redirect_stderr, redirect_stdout
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from offline_support import FakeConnection, FIXTURES, MARKET, OfflineMarketCase, SHARED_PRESET


class MarketContracts(OfflineMarketCase):
    def test_writes_require_flag(self):
        """Row 1: all three public writes must refuse before even a GET."""
        for flag in (None, "0", "true"):
            for name in ("start_market", "confirm_preset", "cancel_run"):
                with self.subTest(flag=flag, tool=name):
                    self.mt.os.environ.pop("MCP_PROTO_ALLOW_WRITES", None)
                    if flag is not None:
                        self.mt.os.environ["MCP_PROTO_ALLOW_WRITES"] = flag
                    self.fake.calls.clear()
                    result = self.invoke_write(name)
                    self.assertEqual(self.fake.calls, [], "WRITE_GUARD_HTTP: refusal must make zero HTTP calls")
                    self.assertTrue(result.get("refused"), "write tool did not refuse")
                    self.assertIs(result.get("network_call"), False)

    def test_workspace_id_is_required_for_every_tool(self):
        """No default workspace id: every tool fails before any HTTP call."""
        self.enable_fake_writes()
        self.mt.os.environ.pop("TDN_WORKSPACE_ID")
        tools = {
            "start_market": lambda: self.mt.start_market("Sản phẩm mẫu", "sản phẩm mẫu"),
            "run_status": lambda: self.mt.run_status(self.run_id),
            "confirm_preset": lambda: self.mt.confirm_preset(self.run_id, self.confirm["keyword2"]),
            "get_report": lambda: self.mt.get_report(self.run_id),
            "cancel_run": lambda: self.mt.cancel_run(self.run_id, 1),
        }
        for name, call in tools.items():
            with self.subTest(tool=name):
                with self.assertRaisesRegex(ValueError, "TDN_WORKSPACE_ID"):
                    call()
                self.assertEqual(self.fake.calls, [], "WORKSPACE_REQUIRED: no HTTP call without TDN_WORKSPACE_ID")

    def test_start_body_period_timezone_and_fresh_keys(self):
        """Row 2: UTC/Vietnam date boundary, year/leap day, and inclusive days."""
        self.enable_fake_writes()
        cases = [
            ("2026-10-25T17:00:00+00:00", None, "2025-10-26", "2026-10-25"),
            ("2026-10-25T16:59:59+00:00", 365, "2025-10-25", "2026-10-24"),
            ("2026-10-25T17:00:00+00:00", 365, "2025-10-26", "2026-10-25"),
            ("2026-12-31T17:01:00+00:00", 400, "2025-11-27", "2026-12-31"),
            ("2024-03-01T02:00:00+00:00", 365, "2023-03-02", "2024-02-29"),
        ]
        keys = []
        for instant, days, start, end in cases:
            with self.subTest(instant=instant, days=days):
                frozen = datetime.fromisoformat(instant)

                class FrozenDateTime(datetime):
                    @classmethod
                    def now(cls, tz=None):
                        return frozen.astimezone(tz) if tz else frozen.replace(tzinfo=None)

                with patch.object(self.mt, "datetime", FrozenDateTime):
                    for _ in range(2):
                        if days is None:
                            result = self.mt.start_market("Sản phẩm mẫu", "sản phẩm mẫu")
                        else:
                            result = self.mt.start_market("Sản phẩm mẫu", "sản phẩm mẫu", days)
                        method, path, body = self.fake.calls[-1]
                        self.assertEqual(method, "POST")
                        self.assertEqual(path, f"/owner-api/workspaces/{self.workspace}/research-automation/runs")
                        expected = {
                            "contractVersion": "research-automation-start-v2",
                            "requestKey": body["requestKey"], "mode": "PRODUCT",
                            "keyword": "sản phẩm mẫu", "description": "Sản phẩm mẫu",
                            "requestedPeriod": {"startDate": start, "endDate": end}, "reports": ["MARKET"],
                        }
                        self.assertEqual(body, expected)
                        self.assert_repo_body(body, "startRequest")
                        self.assertEqual(result["http"], 202)
                        self.assertIsNone(result["receipt"])
                        self.assertEqual(result["requestKey"], body["requestKey"])
                        keys.append(body["requestKey"])
        self.assert_fresh_keys(keys)

    def test_start_rejects_short_period_before_http(self):
        self.enable_fake_writes()
        for days in (-1, 0, 30, 364):
            with self.subTest(days=days):
                result = self.mt.start_market("Sản phẩm mẫu", "sản phẩm mẫu", days)
                self.assertRegex(result.get("error", ""), r"365|12.month")
                self.assertEqual(self.fake.calls, [])

    def test_confirm_body_matches_recording_and_uses_run_end(self):
        """Row 3: verify the public write body, including defaults, not its builder."""
        self.enable_fake_writes()
        keys = []
        for end, windows in (
            ("2026-01-15", self.confirm["metricV3Preset"]["windows"]),
            ("2024-02-29", [
                {"id": "30d", "period": {"startDate": "2024-01-31", "endDate": "2024-02-29"}, "intervalDays": 7},
                {"id": "12m", "period": {"startDate": "2023-03-02", "endDate": "2024-02-29"}, "intervalDays": 30},
            ]),
        ):
            for category_ids in (None, [c["id"] for c in reversed(self.confirm["metricV3Preset"]["preset"]["category"]["children"])]):
                with self.subTest(end=end, category_ids=category_ids):
                    self.fake.run["requestedPeriod"]["endDate"] = end
                    result = self.mt.confirm_preset(self.run_id, self.confirm["keyword2"], category_ids)
                    method, path, body = self.fake.calls[-1]
                    self.assertEqual((method, path), ("POST", self.owner_path + "/auto-run/retry"))
                    expected = copy.deepcopy(self.confirm)
                    expected.pop("requestKey")
                    expected["metricV3Preset"]["windows"] = copy.deepcopy(windows)
                    actual = copy.deepcopy(body)
                    keys.append(actual.pop("requestKey"))
                    self.assertEqual(actual, expected)
                    # Retained two-keyword v1 stays the default until the v2 contract is deployed.
                    self.assertEqual(body["metricV3Preset"]["contractVersion"], "metric-v3-capture-spec-v1")
                    self.assert_repo_body(body, "autoRunKeywordRequest")
                    self.assertEqual(result["http"], 202)
                    self.assertEqual(result["requestKey"], body["requestKey"])
        self.assert_fresh_keys(keys)

    def test_confirm_only_posts_at_keyword2_wait(self):
        self.enable_fake_writes()
        variants = [self.latest]
        for phase, code in (("STOPPED", "METRIC_LOGIN_REQUIRED"), ("CAPTURE", "KEYWORD2_AWAITING"), ("STOPPED", None)):
            run = copy.deepcopy(self.wait)
            run["autoRun"].update(phase=phase, stopCode=code)
            variants.append(run)
        for run in variants:
            with self.subTest(auto=run["autoRun"]):
                self.fake.calls.clear()
                self.fake.run = copy.deepcopy(run)
                result = self.mt.confirm_preset(self.run_id, self.confirm["keyword2"])
                self.assertEqual([method for method, _, _ in self.fake.calls], ["GET"])
                self.assertIs(result.get("send"), False)
                self.assertTrue(result.get("refused"))
                self.assertEqual(result["state"]["status"], run["status"])

    def bad_categories(self):
        children = self.confirm["metricV3Preset"]["preset"]["category"]["children"]
        # Four distinct ids prevent the separate cardinality check from hiding a
        # missing allow-list check in the required category negative control.
        return [c["id"] for c in children[:3]] + ["c999999999"]

    def test_unknown_category_is_rejected_before_any_http(self):
        """Row 3: reject a foreign child at the public boundary, before any GET."""
        self.enable_fake_writes()
        result = self.mt.confirm_preset(self.run_id, self.confirm["keyword2"], self.bad_categories())
        self.assertIn("c999999999", result.get("error", ""), "CATEGORY_REJECTION: unknown id must be rejected")
        self.assertEqual(self.fake.calls, [], "CATEGORY_ZERO_HTTP: validate before any HTTP, including GET")

    def test_partial_category_subset_is_incompatible_with_the_retained_schema(self):
        self.enable_fake_writes()
        for ids in ([], [self.bad_categories()[0]]):
            with self.subTest(ids=ids):
                self.fake.calls.clear()
                result = self.mt.confirm_preset(self.run_id, self.confirm["keyword2"], ids)
                self.assertIn("exactly all 4", result.get("error", ""))
                self.assertEqual(self.fake.calls, [])

    def test_category_tree_matches_the_shared_preset(self):
        """Ids and labels are the app's public taxonomy; keep them in step with src/shared/metric-v3-preset.ts."""
        source = SHARED_PRESET.read_text(encoding="utf-8")
        category = self.mt.V3_CATEGORY
        self.assertIn(f"id: '{category['id']}', label: '{category['label']}'", source)
        for child in category["children"]:
            self.assertIn(f"id: '{child['id']}', label: '{child['label']}'", source)

    def test_wait_status_contains_suggestion_category_and_vietnamese_message(self):
        result = self.mt.run_status(self.run_id)
        expected = copy.deepcopy(self.wait["autoRun"]["keyword2Suggestion"])
        category_id = expected.pop("categoryId")
        self.assertEqual(result["keyword2Suggestion"], expected)
        self.assertEqual(result["categoryId"], category_id)
        self.assertIn("Chờ", result["owner_message"])
        self.assertIn("từ khóa 2", result["owner_message"])
        self.assertEqual(result["status"], self.wait["status"])
        self.assertEqual(result["autoRun"]["stopCode"], "KEYWORD2_AWAITING")
        self.assertEqual(result["steps"], [{"id": s["stepId"], "state": s["state"], "code": s["code"]} for s in self.wait["steps"]])
        self.assertTrue(all(method == "GET" for method, _, _ in self.fake.calls))

    def test_completed_status_matches_stored_probe(self):
        self.fake.run = copy.deepcopy(self.latest)
        result = self.mt.run_status(self.run_id)
        recorded = self.probe["run_status"]
        self.assertEqual(result["status"], recorded["status"])
        self.assertEqual(result["revision"], recorded["revision"])
        self.assertEqual(result["autoRun"]["phase"], recorded["autoRunPhase"])
        self.assertEqual(result["owner_message"], recorded["owner_message"])
        self.assertEqual([r["revisionId"] for r in result["reportRevisions"]], recorded["reportRevisions"])

    def test_stop_status_never_exposes_raw_review(self):
        sentinel = "PRIVATE_RAW_REVIEW_SENTINEL"
        for code in ("METRIC_LOGIN_REQUIRED", "CAPTURE_LOGIN_REQUIRED", "METRIC_FILTER_MISMATCH", "NEW_UNKNOWN_STOP"):
            with self.subTest(stop_code=code):
                self.fake.run = copy.deepcopy(self.wait)
                self.fake.run.update(review=sentinel, reviewText=sentinel)
                self.fake.run["autoRun"].update(stopCode=code, review=sentinel, reviewText=sentinel, message=sentinel)
                for step in self.fake.run["steps"]:
                    step.update(message=sentinel, reviewText=sentinel)
                result = self.mt.run_status(self.run_id)
                self.assertNotIn(sentinel, json.dumps(result, ensure_ascii=False))
                self.assertRegex(result["owner_message"], r"[Đđăâêôơưàảãáạềếệừữự]")
                if code in ("METRIC_LOGIN_REQUIRED", "CAPTURE_LOGIN_REQUIRED"):
                    self.assertIn("đăng nhập Metric trên web", result["owner_message"])

    def test_run_status_get_4xx_surfaces_clear_error(self):
        for status in (400, 401, 403, 404, 409):
            with self.subTest(status=status), patch.object(self.mt, "_request", self.real_request):
                connection = FakeConnection(lambda path: (status, {"error": "synthetic GET failure" + "x" * 600}))
                with patch.object(self.mt.http.client, "HTTPConnection", return_value=connection):
                    with self.assertRaisesRegex(RuntimeError, f"HTTP {status}") as raised:
                        self.mt.run_status(self.run_id)
                self.assertIn("synthetic GET failure", str(raised.exception))
                self.assertLessEqual(len(str(raised.exception).split(": ", 2)[-1]), 500)
                self.assertTrue(connection.closed)
                self.assertEqual(len(connection.calls), 1)

    def test_reader_http_failures_surface_clear_error(self):
        """Reader failures must not masquerade as missing reports in either tool."""
        for status in (400, 401, 403, 409, 500):
            for name in ("run_status", "get_report"):
                with self.subTest(status=status, tool=name):
                    connection = FakeConnection(lambda path: (200, self.wait) if path == self.run_path else (status, {}))
                    with patch.object(self.mt, "_request", self.real_request), patch.object(self.mt.http.client, "HTTPConnection", return_value=connection):
                        with self.assertRaisesRegex(RuntimeError, f"HTTP {status}"):
                            getattr(self.mt, name)(self.run_id)
                    self.assertEqual(len(connection.calls), 2 if name == "run_status" else 1)

    def test_reader_v2_404_falls_back_but_legacy_failure_surfaces(self):
        for legacy_status in (200, 403):
            with self.subTest(legacy_status=legacy_status):
                def respond(path):
                    if path == self.run_path:
                        return 200, self.wait
                    if path.endswith("/v2"):
                        return 404, {}
                    return legacy_status, {"revisions": self.fake.revisions}

                connection = FakeConnection(respond)
                with patch.object(self.mt, "_request", self.real_request), patch.object(self.mt.http.client, "HTTPConnection", return_value=connection):
                    if legacy_status == 200:
                        result = self.mt.run_status(self.run_id)
                        self.assertEqual(result["reportRevisions"][0]["revisionId"], self.fake.revisions[0]["revisionId"])
                    else:
                        with self.assertRaisesRegex(RuntimeError, "HTTP 403"):
                            self.mt.run_status(self.run_id)
                self.assertEqual(len(connection.calls), 3)

    def test_reports_choose_latest_market_revision(self):
        latest = copy.deepcopy(self.fake.revisions[0])
        older = latest | {"revisionId": "11111111-1111-4111-8111-111111111111", "revisionNumber": 0}
        insight = latest | {"revisionId": "22222222-2222-4222-8222-222222222222", "revisionNumber": 99, "reportKind": "INSIGHT"}
        self.fake.revisions = [latest, insight, older]
        path = self.run_path + f"/reader-reports/{latest['revisionId']}/html"
        self.fake.assets[path] = b"<!doctype html><p>offline Market Reader</p>"
        result = self.mt.get_report(self.run_id)
        self.assertEqual(result["revisionId"], self.probe["html"]["revisionId"])
        self.assertEqual(result["revisionNumber"], self.probe["numbers"]["revisionNumber"])
        self.assertEqual(result["html"], self.fake.assets[path].decode())
        self.assertEqual(self.fake.resources, [("GET", path)])

    def test_pdf_saved_under_market_out_with_synthetic_pages(self):
        data = (FIXTURES / "sample-report.pdf").read_bytes()
        revision = self.fake.revisions[0]
        self.fake.assets[self.run_path + f"/reader-reports/{revision['revisionId']}/pdf"] = data
        self.assertEqual(self.mt.OUT_DIR.resolve(), (MARKET / "out").resolve())
        # Real file writing and the real pdfinfo/fallback path; never overwrite a saved report.
        with self.make_out_dir() as directory:
            with patch.object(self.mt, "OUT_DIR", Path(directory)):
                result = self.mt.get_report(self.run_id, "pdf")
            saved = Path(result["path"])
            self.assertTrue(saved.is_relative_to(MARKET / "out"))
            self.assertEqual(saved.name, f"{self.run_id}-r{revision['revisionNumber']}.pdf")
            self.assertEqual(saved.read_bytes(), data)
            self.assertEqual(result["bytes"], len(data))
            self.assertEqual(saved.stat().st_size, len(data))
            self.assertEqual(result["pageCount"], 2)
            # pdfinfo reports the A4 size when installed; the stdlib fallback counts pages only.
            if result["pageSize"] is not None:
                self.assertIn("A4", result["pageSize"])

    def test_report_asset_failures_include_short_body(self):
        for format in ("html", "pdf"):
            with self.subTest(format=format):
                connection = FakeConnection(lambda path: (503, {"error": "synthetic asset failure" + "x" * 600}))
                with patch.object(self.mt, "_request_bytes", self.real_request_bytes), \
                        patch.object(self.mt.http.client, "HTTPConnection", return_value=connection):
                    with self.assertRaisesRegex(RuntimeError, "HTTP 503") as raised:
                        self.mt.get_report(self.run_id, format)
                self.assertIn("synthetic asset failure", str(raised.exception))
                self.assertLessEqual(len(str(raised.exception).split(": ", 2)[-1]), 500)
                self.assertTrue(connection.closed)

    def test_html_limit_is_bytes_and_oversized_html_is_saved(self):
        revision = self.fake.revisions[0]
        path = self.run_path + f"/reader-reports/{revision['revisionId']}/html"
        with self.make_out_dir() as directory:
            for size in (2 * 1024 * 1024, 2 * 1024 * 1024 + 1):
                with self.subTest(bytes=size), patch.object(self.mt, "OUT_DIR", Path(directory)):
                    # UTF-8 content is shorter in characters than in bytes.
                    data = ("ế" * (size // 3)).encode() + b"x" * (size % 3)
                    self.fake.assets[path] = data
                    result = self.mt.get_report(self.run_id, "html")
                    self.assertEqual(result["bytes"], size)
                    if size == 2 * 1024 * 1024:
                        self.assertEqual(result["html"].encode(), data)
                        self.assertFalse(result.get("path"))
                    else:
                        saved = Path(result["path"])
                        self.assertTrue(saved.is_relative_to(MARKET / "out"))
                        self.assertEqual(saved.read_bytes(), data)
                        self.assertIsNone(result.get("html"))

    def test_numbers_are_unavailable_without_kpi_api_and_do_not_fetch_html(self):
        for metadata_only in (False, True):
            with self.subTest(metadata_only=metadata_only):
                if metadata_only:
                    self.fake.inventories["metric-capture"]["sources"] = [{"packageId": "offline-metadata-only"}]
                result = self.mt.get_report(self.run_id, "numbers")
                self.assertIs(result.get("available"), False)
                self.assertTrue(result.get("reason"))
                self.assertEqual(self.fake.resources, [], "numbers must not fetch or parse HTML")
                self.assertTrue(all(method == "GET" for method, _, _ in self.fake.calls))

    def test_app_409_is_returned_as_lock_message_for_every_write(self):
        self.enable_fake_writes()
        self.fake.write_status = 409
        self.fake.write_body = {"code": "RUN_LOCKED", "message": "synthetic app lock"}
        for name in ("start_market", "confirm_preset", "cancel_run"):
            with self.subTest(tool=name):
                result = self.invoke_write(name)
                self.assertEqual(result["http"], 409)
                self.assertIn("đang chạy", result["error"])
                self.assertIn("RUN_LOCKED", result["body"])

    def test_cancel_has_revision_and_fresh_request_keys(self):
        self.enable_fake_writes()
        keys = []
        for revision in (None, 7):
            result = self.mt.cancel_run(self.run_id, revision)
            method, path, body = self.fake.calls[-1]
            self.assertEqual((method, path), ("POST", self.owner_path + "/cancel"))
            self.assertEqual(body["contractVersion"], "research-automation-cancel-v1")
            self.assertEqual(body["expectedRevision"], self.wait["revision"] if revision is None else revision)
            self.assert_repo_body(body, "cancelRequest")
            self.assertEqual(result["requestKey"], body["requestKey"])
            self.assertEqual(result["http"], 202)
            keys.append(body["requestKey"])
        self.assert_fresh_keys(keys)

    def test_pinned_transports_and_token_stays_in_authorization_header(self):
        """Public reads/writes exercise the real helpers with synthetic auth only."""
        calls = []
        token = "offline-synthetic-auth-sentinel"
        self.mt.os.environ.update({
            "HTTP_PROXY": "http://untrusted.invalid:9999",
            "HTTPS_PROXY": "http://untrusted.invalid:9999",
            "ALL_PROXY": "http://untrusted.invalid:9999",
            "TDN_APP_BASE_URL": "http://untrusted.invalid:9999",
            "MCP_PROTO_BASE_URL": "http://untrusted.invalid:9999",
            "MCP_PROTO_ALLOW_WRITES": "1",
        })
        run_path, wait, revisions = self.run_path, self.wait, self.fake.revisions

        class Connection:
            def __init__(self, host, port, **kwargs):
                self.target = (host, port)

            def request(self, method, path, body=None, headers=None):
                calls.append((self.target, method, path, headers.copy()))
                if path == "/owner-api/local-test-session":
                    self.payload = {"token": token}
                elif path == run_path:
                    self.payload = wait
                elif path.endswith("/reader-reports/v2"):
                    self.payload = {"revisions": revisions}
                elif path.endswith("/html"):
                    self.payload = b"<!doctype html><p>stored report</p>"
                else:
                    self.payload = {"accepted": True}

            def getresponse(self):
                data = self.payload if isinstance(self.payload, bytes) else json.dumps(self.payload).encode()
                return SimpleNamespace(status=200, read=lambda: data, getheader=lambda name: "text/html")

            def close(self):
                pass

        output, results = io.StringIO(), []
        with patch.multiple(self.mt, _request=self.real_request, _request_bytes=self.real_request_bytes,
                            _runtime_token=self.real_runtime_token, _request_without_auth=self.real_request_without_auth), \
                patch.object(self.mt.http.client, "HTTPConnection", Connection), \
                redirect_stdout(output), redirect_stderr(output):
            results.append(self.mt.run_status(self.run_id))
            results.append(self.mt.get_report(self.run_id, "html"))
            for source in ("environment", "local-session"):
                if source == "environment":
                    self.mt.os.environ["TDN_APP_TOKEN"] = token
                else:
                    self.mt.os.environ.pop("TDN_APP_TOKEN")
                for name in ("start_market", "confirm_preset", "cancel_run"):
                    results.append(self.invoke_write(name))
        self.assertNotIn(token, output.getvalue() + json.dumps(results, ensure_ascii=False))
        self.assertEqual(sum(path == "/owner-api/local-test-session" for _, _, path, _ in calls), 3)
        for target, method, path, headers in calls:
            self.assertEqual(target, ("127.0.0.1", 8787))
            self.assertEqual(headers["Host"], "127.0.0.1:8787")
            self.assertEqual(headers["Origin"], "http://127.0.0.1:8787")
            if method == "POST" and path != "/owner-api/local-test-session":
                self.assertEqual(headers["Authorization"], "Bearer " + token)
            else:
                self.assertNotIn("Authorization", headers)

    def test_malformed_runtime_token_cannot_escape_through_transport_error(self):
        """http.client includes invalid header values in its exception text."""
        self.mt.os.environ["MCP_PROTO_ALLOW_WRITES"] = "1"
        for token in ("offline-private-sentinel\nextra", "offline-private-sentinel-密"):
            with self.subTest(kind="newline" if "\n" in token else "unicode"):
                self.mt.os.environ["TDN_APP_TOKEN"] = token
                error = None
                with patch.multiple(self.mt, _request=self.real_request, _runtime_token=self.real_runtime_token):
                    try:
                        self.mt.cancel_run(self.run_id, expected_revision=1)
                    except Exception as exc:
                        error = exc
                # Check outside the except block so failure output cannot include
                # the original exception context, even for synthetic credentials.
                self.assertIsNotNone(error, "invalid bearer token must be rejected before HTTP")
                self.assertTrue("offline-private-sentinel" not in str(error),
                                "TOKEN_ERROR_LEAK: transport error exposed the runtime token")
                self.assertIsInstance(error, RuntimeError)

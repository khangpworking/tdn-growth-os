"""EVR2 A5: real MCP GET transport, synthetic app replies, no sockets or write gate."""

import copy
import io
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from offline_support import FakeConnection, OfflineMarketCase, SOURCE


REPORT = "44444444-4444-4444-8444-444444444444"
OTHER_WORKSPACE = "99999999-9999-4999-8999-999999999999"


def evidence_reply():
    # The TS acceptance test owns actual app lookup, authorization and fake-R2
    # presigning. This independent fixture owns transport and lossless forwarding.
    return {
        "reportRevisionId": REPORT, "numberRef": "n42", "token": "123",
        "sectionName": "Synthetic top products", "capturedAt": "2026-10-26T07:00:00.000Z",
        "settings": {
            "keywords": ["synthetic zinc", "synthetic zinc capsule"],
            "category": {"id": "c1", "label": "Synthetic category", "children": []},
            "platforms": ["shopee", "tiktok"],
            "period": {"startDate": "2026-09-20", "endDate": "2026-10-19"},
            "smartQuery": True, "windowId": "30d", "captureMethod": "ui",
            "adapterVersion": {"contract": "synthetic-adapter-v1", "sourceSha256": "a" * 64},
        },
        "evidenceStatus": "UPLOADED", "code": None,
        "sourcePdf": {"sha256": "c" * 64, "byteSize": 12345, "pageCount": 8, "kind": "screenshot-pdf"},
        "urls": {
            name: {"url": f"https://fake-r2.invalid/{file}?X-Amz-Expires=86400&X-Amz-Signature={'b' * 64}",
                   "expiresAt": "2026-10-27T07:00:00.000Z"}
            for name, file in (("section", "sections/top-products.png"), ("fullPage", "full-page.png"), ("sourcePdf", "source-page.pdf"))
        },
    }


class NumberEvidenceContracts(OfflineMarketCase):
    def arrange_evidence_transport(self):
        self.mt.os.environ["TDN_APP_TOKEN"] = "synthetic-owner-token-for-evidence"
        self.connections = []
        root = f"/owner-api/workspaces/{self.workspace}/research-automation/reports/{REPORT}/numbers"

        def respond(path):
            if OTHER_WORKSPACE in path:
                return 404, {"error": {"code": "report_not_available"}}
            if path == root:
                return 200, {"reportRevisionId": REPORT, "numbers": [{"numberRef": "n42", "token": "123"}]}
            if path == root + "/n42":
                return 200, copy.deepcopy(evidence_reply())
            return 404, {"error": {"code": "number_ref_unknown"}}

        def connect(host, port, timeout):
            self.assertEqual((host, port, timeout), (self.mt.HOST, self.mt.PORT, 20))
            connection = FakeConnection(respond)
            real_request = connection.request

            def request(method, path, body=None, headers=None):
                self.assertEqual(method, "GET")
                self.assertIsNone(body)
                self.assertEqual(headers, {"Origin": self.mt.ORIGIN, "Host": f"{host}:{port}",
                                          "Accept": "application/json", "Authorization": "Bearer synthetic-owner-token-for-evidence"})
                return real_request(method, path, body, headers)

            connection.request = request
            self.connections.append(connection)
            return connection

        self.enterContext(patch.object(self.mt, "http", SimpleNamespace(client=SimpleNamespace(HTTPConnection=connect))))
        return root

    def test_A5_explain_number_forwards_section_time_settings_and_two_24h_links_read_only(self):
        """A5: public MCP entrypoint must send the exact revision/ref and preserve app metadata."""
        root = self.arrange_evidence_transport()
        for write_flag in (None, "0"):
            with self.subTest(write_flag=write_flag):
                if write_flag is None:
                    self.mt.os.environ.pop("MCP_PROTO_ALLOW_WRITES", None)
                else:
                    self.mt.os.environ["MCP_PROTO_ALLOW_WRITES"] = write_flag
                result = self.mt.explain_number(REPORT, "n42")
                self.assertEqual(result, evidence_reply(), "A5_RESPONSE_METADATA")
                self.assertEqual(self.connections[-1].calls, [("GET", root + "/n42")])
                self.assertTrue(self.connections[-1].closed)
        listed = self.mt.list_number_refs(REPORT)
        self.assertEqual(listed["numbers"], [{"numberRef": "n42", "token": "123"}])
        self.assertEqual(self.connections[-1].calls, [("GET", root)])
        self.assertTrue(self.connections[-1].closed)
        self.assertEqual(self.fake.calls, [], "no session mint, source lookup or write transport")

    def test_A5_negative_workspace_unknown_ref_and_invalid_inputs_are_explicit(self):
        self.arrange_evidence_transport()
        for workspace, ref, code in ((OTHER_WORKSPACE, "n42", "report_not_available"),
                                     (self.workspace, "n999999", "number_ref_unknown")):
            with self.subTest(code=code):
                self.mt.os.environ["TDN_WORKSPACE_ID"] = workspace
                with self.assertRaises(self.mt._AppHTTPError) as raised:
                    self.mt.explain_number(REPORT, ref)
                self.assertEqual(raised.exception.status, 404)
                self.assertIn(code, str(raised.exception))
                self.assertTrue(self.connections[-1].closed)
        self.mt.os.environ["TDN_WORKSPACE_ID"] = self.workspace
        count = len(self.connections)
        for ref in ("../n42", "n42?other=1", "bad-ref"):
            with self.subTest(ref=ref), self.assertRaisesRegex(ValueError, "number_ref"):
                self.mt.explain_number(REPORT, ref)
        self.mt.os.environ.pop("TDN_APP_TOKEN")
        with self.assertRaisesRegex(ValueError, "TDN_APP_TOKEN"):
            self.mt.explain_number(REPORT, "n42")
        self.assertEqual(len(self.connections), count, "invalid requests must stop before HTTP")


class EvidenceNegativeControl(unittest.TestCase):
    def test_A5_negative_control_detects_dropped_number_ref(self):
        """An isolated bad forwarding implementation must fail the same A5 contract, never CI."""
        source = SOURCE.read_text(encoding="utf-8")
        old = "return _evidence_get(report_id, number_ref)"
        self.assertEqual(source.count(old), 1)
        with tempfile.TemporaryDirectory(prefix="evr2-mcp-negative-") as directory:
            mutated = Path(directory) / "market_tools.py"
            mutated.write_text(source.replace(old, "return _evidence_get(report_id)"), encoding="utf-8")
            stream = io.StringIO()
            with patch.object(NumberEvidenceContracts, "source_path", mutated):
                result = unittest.TextTestRunner(stream=stream).run(unittest.TestSuite([
                    NumberEvidenceContracts("test_A5_explain_number_forwards_section_time_settings_and_two_24h_links_read_only")
                ]))
            self.assertFalse(result.wasSuccessful())
            self.assertEqual(result.errors, [])
            self.assertIn("A5_RESPONSE_METADATA", stream.getvalue())

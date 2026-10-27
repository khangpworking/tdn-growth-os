"""Offline fixtures and fail-closed transport for the Market contract tests.

Fixtures are synthetic and live in tests/fixtures. Contract schemas are read from
this repository, never from a deployed checkout.
"""

import copy
import importlib.util
import json
import sys
import tempfile
import unittest
import uuid
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from jsonschema import Draft202012Validator, FormatChecker

MARKET = Path(__file__).resolve().parents[1]
SOURCE = MARKET / "market_tools.py"
FIXTURES = Path(__file__).resolve().parent / "fixtures"
REPO_ROOT = MARKET.parents[1]
API_SCHEMA = REPO_ROOT / "contracts/api/research-automation-api.schema.json"
SHARED_PRESET = REPO_ROOT / "src/shared/metric-v3-preset.ts"
CAPTURE_SCHEMAS = {
    "metric-v3-capture-spec-v1": REPO_ROOT / "contracts/analysis/metric-v3-capture-spec-v1.schema.json",
    "metric-v3-capture-spec-v2": REPO_ROOT / "contracts/analysis/metric-v3-capture-spec.schema.json",
}
NETWORK_ATTEMPTS = []


def _deny_network(event, args):
    if event in {
        "socket.connect", "socket.connect_ex", "socket.bind", "socket.sendto",
        "socket.sendmsg", "socket.getaddrinfo", "socket.gethostbyname",
        "socket.gethostbyaddr",
    }:
        NETWORK_ATTEMPTS.append(event)
        raise AssertionError("OFFLINE_ONLY: network access prohibited")


# Installed before importing mcp or the subject; caught attempts still fail teardown.
sys.addaudithook(_deny_network)


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


class FakeTransport:
    """Replay synthetic projections; reject routes a test did not arrange."""

    def __init__(self, wait, probe):
        self.run = copy.deepcopy(wait)
        self.calls = []
        self.resources = []
        self.write_status = 202
        # No owner receipt is invented: success bodies are deliberately empty.
        self.write_body = None
        self.revisions = [
            {key: probe["numbers"][key] for key in
             ("revisionId", "revisionNumber", "builderVersion")}
            | {"reportKind": "MARKET"}
        ]
        self.inventories = {
            "metric-capture": {"contractVersion": "automation-prepared-metric-capture-list-v1", "sources": []},
            "metric": {"sources": []},
        }
        self.assets = {}

    def request(self, method, path, body=None, **kwargs):
        self.calls.append((method, path, copy.deepcopy(body)))
        if method == "POST":
            if not (path.endswith("/research-automation/runs")
                    or path.endswith("/auto-run/retry") or path.endswith("/cancel")):
                raise AssertionError("unexpected fake write route")
            return {"http": self.write_status, "body": copy.deepcopy(self.write_body)}
        if method == "GET":
            if path.endswith("/" + self.run["runId"]):
                return {"http": 200, "body": copy.deepcopy(self.run)}
            if path.endswith(("/reader-reports/v2", "/reader-reports")):
                return {"http": 200, "body": {"revisions": copy.deepcopy(self.revisions)}}
            for name, inventory in self.inventories.items():
                if path.endswith("/sources/" + name):
                    return {"http": 200, "body": copy.deepcopy(inventory)}
        raise AssertionError(f"unarranged fake HTTP route: {method} {path}")

    def request_bytes(self, method, path, **kwargs):
        self.resources.append((method, path))
        if method != "GET" or path not in self.assets:
            raise AssertionError(f"unarranged fake asset: {method} {path}")
        return {"http": 200, "bytes": self.assets[path], "content_type": "application/octet-stream"}


class FakeConnection:
    """Connection boundary for exercising the real GET error handling."""

    def __init__(self, responder):
        self.responder = responder
        self.calls = []
        self.closed = False

    def request(self, method, path, body=None, headers=None):
        if method != "GET":
            raise AssertionError("connection-level tests allow GET only")
        self.calls.append((method, path))
        self.status, self.payload = self.responder(path)

    def getresponse(self):
        return SimpleNamespace(
            status=self.status,
            read=lambda: json.dumps(self.payload).encode(),
            getheader=lambda name: "application/json",
        )

    def close(self):
        self.closed = True


class OfflineMarketCase(unittest.TestCase):
    source_path = SOURCE

    def setUp(self):
        self.network_before = len(NETWORK_ATTEMPTS)
        self.wait = read_json(FIXTURES / "keyword2-wait.json")
        self.latest = read_json(FIXTURES / "latest-run.json")
        self.confirm = read_json(FIXTURES / "confirm.json")
        self.probe = read_json(FIXTURES / "probe_market.json")
        self.run_id = self.wait["runId"]
        self.workspace = self.wait["workspaceId"]
        self.run_path = f"/api/workspaces/{self.workspace}/research-automation/runs/{self.run_id}"
        self.owner_path = f"/owner-api/workspaces/{self.workspace}/research-automation/runs/{self.run_id}"
        spec = importlib.util.spec_from_file_location("market_contract_" + uuid.uuid4().hex, self.source_path)
        self.mt = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.mt)
        self.real_request = self.mt._request
        self.real_request_bytes = self.mt._request_bytes
        self.real_runtime_token = self.mt._runtime_token
        self.real_request_without_auth = self.mt._request_without_auth
        self.fake = FakeTransport(self.wait, self.probe)
        self.env = {"TDN_WORKSPACE_ID": self.workspace}
        self.enterContext(patch.multiple(
            self.mt,
            _request=self.fake.request,
            _request_bytes=self.fake.request_bytes,
            _runtime_token=self.fail_token_access,
            _request_without_auth=self.fail_token_access,
            # Replace the module's os reference, never process os.environ.
            os=SimpleNamespace(environ=self.env),
        ))

    @staticmethod
    def fail_token_access(*args, **kwargs):
        raise AssertionError("token acquisition is prohibited in offline tests")

    def enable_fake_writes(self):
        self.assertEqual(self.mt._request, self.fake.request)
        self.mt.os.environ["MCP_PROTO_ALLOW_WRITES"] = "1"

    def make_out_dir(self):
        """Create the module's output directory and a temporary child to write into."""
        out = MARKET / "out"
        out.mkdir(exist_ok=True)
        return tempfile.TemporaryDirectory(prefix="mcp-market-tests-", dir=out)

    def invoke_write(self, name):
        if name == "start_market":
            return self.mt.start_market(self.wait["description"], self.wait["keyword"])
        if name == "confirm_preset":
            return self.mt.confirm_preset(self.run_id, self.confirm["keyword2"])
        return self.mt.cancel_run(self.run_id)

    def assert_fresh_keys(self, keys):
        self.assertEqual(len(keys), len(set(keys)), "requestKey must be fresh per call")
        for key in keys:
            parsed = uuid.UUID(key)
            self.assertEqual(str(parsed), key)
            self.assertEqual(parsed.version, 4)

    def assert_repo_body(self, body, definition):
        """Validate an emitted body against this repository's own contracts."""
        schema = read_json(API_SCHEMA)
        schema = {**schema, "oneOf": [{"$ref": f"#/$defs/{definition}"}]}
        Draft202012Validator(schema, format_checker=FormatChecker()).validate(body)
        preset = body.get("metricV3Preset")
        if preset is not None:
            version = preset.get("contractVersion")
            capture_path = CAPTURE_SCHEMAS.get(version)
            self.assertIsNotNone(capture_path, f"no repository schema for capture spec version {version!r}")
            Draft202012Validator(read_json(capture_path), format_checker=FormatChecker()).validate(preset)

    def tearDown(self):
        self.assertEqual(len(NETWORK_ATTEMPTS), self.network_before, "a network operation was attempted")

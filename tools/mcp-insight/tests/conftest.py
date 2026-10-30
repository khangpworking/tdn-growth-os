"""Offline-only Insight contract fixtures. The subject imports at test time."""

import copy
import importlib.util
import json
import logging
import os
import socket
import sys
import uuid
from pathlib import Path

import pytest

from insight_test_support import AuditGuard, Sandbox, no_leak


GUARD = AuditGuard()
sys.addaudithook(GUARD)


@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """A failing confidentiality mutant must not print even a synthetic key."""
    report = (yield).get_result()

    def redact(value):
        for secret in GUARD.synthetic_secrets:
            value = value.replace(secret, "[synthetic credential redacted]")
        return value

    report.sections = [(name, redact(value)) for name, value in report.sections]
    if report.longrepr:
        original = str(report.longrepr)
        cleaned = redact(original)
        if cleaned != original:
            report.longrepr = cleaned


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    # Remove inherited configuration before importing the subject. Never open a
    # developer's default DB, key, output directory, or capture directory.
    for key in tuple(os.environ):
        if key.startswith("INSIGHT_MCP_") or key == "TYPESAFE_API_KEY":
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("PYTHONDONTWRITEBYTECODE", "1")
    box = Sandbox(tmp_path, monkeypatch, GUARD)
    GUARD.root = tmp_path
    GUARD.violations.clear()

    def deny_listen(*args, **kwargs):
        # CPython has no portable socket.listen audit event; listening without
        # explicit bind can otherwise implicitly allocate a port.
        GUARD.violations.append("LISTEN_FORBIDDEN")
        raise AssertionError("LISTEN_FORBIDDEN")

    monkeypatch.setattr(socket.socket, "listen", deny_listen)
    yield box
    GUARD.root = None
    assert not GUARD.violations, "offline/read-only boundary was attempted"


@pytest.fixture
def subject(sandbox, capsys, caplog):
    path = sandbox.insight / "insight_tools.py"
    assert path.is_file(), "implementation has not landed: tools/mcp-insight/insight_tools.py"
    name = "insight_contract_" + uuid.uuid4().hex
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    before = sys.dont_write_bytecode
    sys.dont_write_bytecode = True
    caplog.set_level(logging.DEBUG)
    try:
        spec.loader.exec_module(module)
        sandbox.module = module
        yield module
        # Q40's scanner runs at the public boundary for every exercised success
        # and failure, including invalid Jev/codebook/count paths in other rows.
        captured = capsys.readouterr()
        for value in [sandbox.public_results, captured.out, captured.err, caplog.text]:
            no_leak(value, sandbox.sentinels())
    finally:
        sys.dont_write_bytecode = before
        sys.modules.pop(name, None)


@pytest.fixture
def codebook(subject, sandbox, monkeypatch):
    """Mutations affect a temporary copy, never the repository data file."""
    path = sandbox.insight / "data" / "insight-theme-codebook.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    target = sandbox.root / "codebook.json"

    def use(value=None):
        target.write_text(json.dumps(data if value is None else value, ensure_ascii=False), encoding="utf-8")
        monkeypatch.setattr(subject, "CODEBOOK_PATH", target)
        return copy.deepcopy(data if value is None else value)

    use()
    return use


@pytest.fixture
def built(subject, sandbox):
    sandbox.seed()
    result = sandbox.call("build_warehouse")
    assert "error" not in result
    assert sandbox.warehouse.is_file()
    return sandbox

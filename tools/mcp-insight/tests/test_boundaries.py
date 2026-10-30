"""R-IM01: MCP protocol, configuration, read-only and confidentiality contracts."""

import ast
import copy
import importlib.util
import json
import logging
import os
import socket
import sqlite3
import subprocess
import sys
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

from insight_test_support import (
    AMBIGUOUS, OTHER, RUN, FakeJev, error, label_all, no_leak,
    review, sync, tree_snapshot,
)


def schemas(tools):
    expected = {
        "build_warehouse": {"run_id": {"string"}},
        "code_reviews": {"run_id": {"string"}, "dry_run": {"boolean"},
                         "max_calls": {"integer", "null"}, "block_override": {"string", "null"}},
        "theme_counts": {"run_id": {"string"}, "question": {"string", "null"}},
        "keyword_counts": {"run_id": {"string"}},
        "portrait_counts": {"run_id": {"string"}},
        # IM-Q52 (amends IM-Q1): the four PR 2 tools.
        "report_plan": {"run_id": {"string"}},
        "confidence_ceiling": {"run_id": {"string"}, "part": {"integer"}, "evidence": {"array"},
                               "hypothesis": {"boolean"}},
        "find_reason_links": {"run_id": {"string"}, "theme_a": {"string"}, "theme_b": {"string"}},
        "read_reviews": {"run_id": {"string"}, "ids": {"array"}},
        # IM-Q79 amends Q52's registry (and Q1's inherited exact set).
        "submit_section": {"run_id": {"string"}, "part": {"integer"}, "text": {"string"}, "claims": {"array"}},
        "submit_statement": {"run_id": {"string"}, "statement": {"object"}, "replaces": {"string", "null"}},
        "render_report": {"run_id": {"string"}},
    }
    assert set(tools) == set(expected)
    for name, arguments in expected.items():
        props = tools[name]["properties"]
        assert set(props) == set(arguments)
        for key, types in arguments.items():
            schema = props[key]
            actual = set()
            for part in schema.get("anyOf", schema.get("oneOf", [schema])):
                value = part["type"]
                actual.update(value if isinstance(value, list) else [value])
            assert actual == types


def test_im_q1_fastmcp_surface_and_stdio(subject, sandbox):
    """NC: a sixth query tool and an added SQL argument fail distinct checks."""
    assert subject.mcp.name == "tdn-insight"
    tools = {t.name: t.inputSchema for t in sync(subject.mcp.list_tools())}
    schemas(tools)
    extra_tool = copy.deepcopy(tools)
    extra_tool["query"] = {"properties": {}}
    with pytest.raises(AssertionError):
        schemas(extra_tool)
    extra_argument = copy.deepcopy(tools)
    extra_argument["theme_counts"]["properties"]["sql"] = {"type": "string"}
    assert set(extra_argument) == set(tools)  # isolates the schema assertion
    with pytest.raises(AssertionError):
        schemas(extra_argument)
    # Inspect only the independent entry-point transport contract, not business
    # implementation. Starting stdio here would block the pytest process.
    tree = ast.parse((sandbox.insight / "insight_tools.py").read_text())
    runs = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
            and isinstance(n.func, ast.Attribute) and n.func.attr == "run"]
    assert any(any(k.arg == "transport" and isinstance(k.value, ast.Constant)
                   and k.value.value == "stdio" for k in n.keywords) for n in runs)


def test_im_q2_app_connection_is_uri_readonly(subject, sandbox, monkeypatch):
    """NC: switching to mode=rw makes the actual INSERT assertion fail; opening the live DB fails too.
    The module's app connection is its per-call snapshot of the app DB (IM-Q39 note)."""
    sandbox.seed()
    before = tree_snapshot(sandbox.app)
    connect = sqlite3.connect
    observed, live = [], []

    def checked_connect(database, *args, **kwargs):
        db = connect(database, *args, **kwargs)
        if str(sandbox.db) in str(database):
            live.append(str(database))
        if "insight-app-" in str(database):
            observed.append(str(database))
            with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
                db.execute("INSERT INTO analysis_research_automation_runs(run_id) VALUES ('synthetic-write')")
        return db

    # Import a fresh subject with the connection boundary already patched. This
    # also covers `from sqlite3 import connect` without naming private helpers.
    name = "insight_readonly_" + uuid.uuid4().hex
    spec = importlib.util.spec_from_file_location(name, sandbox.insight / "insight_tools.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    try:
        with monkeypatch.context() as patch:
            patch.setattr(sqlite3, "connect", checked_connect)
            spec.loader.exec_module(module)
            sandbox.module = module
            result = sandbox.call("build_warehouse")
    finally:
        sandbox.module = subject
        sys.modules.pop(name, None)
    assert "error" not in result
    assert observed and all(uri.startswith("file:") and "mode=ro" in uri for uri in observed)
    assert not live
    assert tree_snapshot(sandbox.app) == before
    assert not Path(str(sandbox.db) + "-wal").exists()
    assert not Path(str(sandbox.db) + "-journal").exists()


@pytest.mark.parametrize("tool,field,expected", [
    ("theme_counts", "reviews", 5),
    ("keyword_counts", "keywords", 1),
    ("portrait_counts", "reviews", 5),
])
def test_im_q1_count_tools_execute_through_fastmcp(subject, sandbox, tool, field, expected):
    """NC: nested asyncio.run fails through MCP even when direct Python calls work."""
    sandbox.seed([review(i, text=f"zqvproto{i} mua cho mẹ") for i in range(1, 6)],
                 keywords=["có nên uống canxi"])
    assert "error" not in sandbox.call("build_warehouse")
    sandbox.code(label_all())
    blocks = sync(subject.mcp.call_tool(tool, {"run_id": RUN}))
    result = json.loads(next(block.text for block in blocks if block.type == "text"))
    assert "error" not in result
    assert any(row.get(field) == expected for row in result["rows"])


def tool_calls(box):
    return [box.call("build_warehouse"), box.call("code_reviews"), box.call("theme_counts"),
            box.call("keyword_counts"), box.call("portrait_counts")]


def test_im_q3_every_offline_tool_is_socket_and_dns_free(built):
    """NC: a dry-run wrapper doing DNS trips the same audit hook."""
    tool_calls(built)
    original = built.module.code_reviews

    def dns_mutant(*args, **kwargs):
        socket.getaddrinfo("synthetic.invalid", 443)
        return original(*args, **kwargs)

    with built.monkeypatch.context() as patch:
        patch.setattr(built.module, "code_reviews", dns_mutant)
        with built.guard.expected_violation(), pytest.raises(AssertionError, match="NETWORK_FORBIDDEN"):
            built.call("code_reviews")
    with socket.socket(socket.AF_UNIX) as sock:
        with built.guard.expected_violation(), pytest.raises(AssertionError, match="LISTEN_FORBIDDEN"):
            sock.listen()
    assert not built.guard.violations


@pytest.mark.parametrize("flag", [None, "true", " 1", "0"])
def test_im_q4_paid_flag_refuses_before_key_read(built, monkeypatch, flag):
    """NC: exact flag 1 with synthetic key and fake transport reaches coding."""
    fake = FakeJev()
    monkeypatch.setattr(built.module, "_jev_transport", fake)
    if flag is not None:
        monkeypatch.setenv("INSIGHT_MCP_ALLOW_PAID", flag)
    start = len(built.guard.events)
    result = built.call("code_reviews", dry_run=False, max_calls=1)
    assert result["refused"] is True and result["reason"] == "PAID_FLAG_MISSING"
    assert type(result["eligible_reviews"]) is int and result["eligible_reviews"] == 5
    assert type(result["planned_calls"]) is int and result["planned_calls"] == 1
    assert not fake.calls
    assert not any(event == "open" and str(args[0]) == str(built.key)
                   for event, args in built.guard.events[start:])
    allowed, fake = built.code(max_calls=1)
    assert len(fake.calls) == 1 and "error" not in allowed


def test_im_q5_key_is_file_only_and_redacted_on_transport_error(built, capsys, caplog):
    """NC: an exception deliberately containing Authorization cannot escape."""
    fake = built.fake_paid()
    key_checks = []

    def unsafe_reply(body, api_key):
        fake.calls.append(body)
        key_checks.append(api_key == built.secret)
        raise RuntimeError("Authorization: Bearer " + api_key)

    built.monkeypatch.setattr(built.module, "_jev_transport", unsafe_reply)
    with caplog.at_level(logging.INFO):
        result = built.call("code_reviews", dry_run=False, max_calls=1)
    assert result["stopped"] == "JEV_THEME_UNAVAILABLE"
    assert len(fake.calls) == 1
    assert key_checks == [True], "transport did not use the selected synthetic file credential"
    captured = capsys.readouterr()
    public = json.dumps(result) + captured.out + captured.err + caplog.text
    assert built.secret not in public, "synthetic credential escaped"
    for path in built.data.rglob("*"):
        if path.is_file():
            assert built.secret.encode() not in path.read_bytes(), "synthetic credential persisted"
    for contents in [None, "OTHER_SYNTHETIC_SETTING=unused\n"]:
        if contents is None:
            built.key.unlink()
        else:
            built.key.write_text(contents)
        missing = built.call("code_reviews", dry_run=False, max_calls=1)
        error(missing, "JEV_KEY_MISSING")
        assert "OTHER_SYNTHETIC_SETTING" not in json.dumps(missing)


def test_im_q6_database_configuration_is_required_and_selected(subject, sandbox, monkeypatch):
    """NC: a creating open or a hardcoded DB A fails absence/B-only assertions."""
    sandbox.seed(run_id=RUN)
    monkeypatch.delenv("INSIGHT_MCP_APP_DB")
    error(sandbox.call("build_warehouse"), "APP_DB_NOT_SET")
    missing = sandbox.root / "never-created.sqlite"
    monkeypatch.setenv("INSIGHT_MCP_APP_DB", str(missing))
    error(sandbox.call("build_warehouse"), "APP_DB_NOT_FOUND")
    assert not missing.exists()
    db_b = sandbox.app / "b.sqlite"
    with sqlite3.connect(sandbox.db) as src, sqlite3.connect(db_b) as dst:
        src.backup(dst)
        dst.execute("DELETE FROM analysis_research_automation_runs")
        dst.execute("INSERT INTO analysis_research_automation_runs(run_id,keyword,created_at) VALUES (?,?,?)",
                    (OTHER, "canxi", "2026-10-30T00:00:00Z"))
    monkeypatch.setenv("INSIGHT_MCP_APP_DB", str(db_b))
    assert "error" not in sandbox.call("build_warehouse", OTHER[:8])
    error(sandbox.call("build_warehouse", RUN[:8]), "RUN_NOT_FOUND")


def arrange_failure(built, failure):
    if failure == "RUN_AMBIGUOUS":
        built.seed([], run_id=AMBIGUOUS)
    if failure == "ARTIFACT_MISSING":
        next(p for p in built.artifacts.rglob("*") if p.is_file()).unlink()
    if failure == "SLAYER_SQL_MISMATCH":
        built.code(label_all())
        real = built.module._slayer_query

        def off_by_one(*args, **kwargs):
            return perturb(sync(real(*args, **kwargs)))

        built.monkeypatch.setattr(built.module, "_slayer_query", off_by_one)


def scenario_calls(built, failure):
    if failure == "RUN_NOT_FOUND":
        return [built.call(t, OTHER) for t in ["build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts"]]
    elif failure == "RUN_AMBIGUOUS":
        return [built.call(t, RUN[:8]) for t in ["build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts"]]
    elif failure == "ARTIFACT_MISSING":
        return [built.call("build_warehouse")]
    elif failure == "SLAYER_SQL_MISMATCH":
        return [built.call("theme_counts")]
    return tool_calls(built)


@pytest.mark.parametrize("failure", [None, "RUN_NOT_FOUND", "RUN_AMBIGUOUS", "ARTIFACT_MISSING", "SLAYER_SQL_MISMATCH"])
def test_im_q38_artifacts_unchanged_on_success_and_failure(built, failure):
    """NC: byte truncation or a cache file changes the exact artifact inventory."""
    arrange_failure(built, failure)
    before, event_start = tree_snapshot(built.artifacts), len(built.guard.events)
    results = scenario_calls(built, failure)
    if failure:
        for result in results:
            error(result, failure)
    assert tree_snapshot(built.artifacts) == before
    for event, args in built.guard.events[event_start:]:
        if event == "open" and isinstance(args[0], (str, bytes, os.PathLike)):
            path = Path(os.fsdecode(args[0])).resolve()
            if path.is_relative_to(built.artifacts):
                mode, flags = args[1:3]
                assert not (isinstance(mode, str) and any(c in mode for c in "wax+"))
                assert not (isinstance(flags, int) and flags & (os.O_WRONLY | os.O_RDWR | os.O_CREAT | os.O_TRUNC))
    # Exercise both named mutants against real synthetic files, then restore.
    source = next(p for p in built.artifacts.rglob("*") if p.is_file())
    original = source.read_bytes()
    try:
        source.write_bytes(b"")
        with pytest.raises(AssertionError):
            assert tree_snapshot(built.artifacts) == before
    finally:
        source.write_bytes(original)
    cache = built.artifacts / "synthetic-cache.json"
    try:
        cache.write_text("{}")
        with pytest.raises(AssertionError):
            assert tree_snapshot(built.artifacts) == before
    finally:
        cache.unlink()


def perturb(value):
    """Alter one actual numeric SLAYER result, never supply successful counts."""
    value = copy.deepcopy(value)

    def alter(item):
        if isinstance(item, dict):
            for key, child in item.items():
                if type(child) in (int, float):
                    item[key] = child + 1
                    return True
                if alter(child):
                    return True
        elif isinstance(item, list):
            for i, child in enumerate(item):
                if type(child) in (int, float):
                    item[i] = child + 1
                    return True
                if alter(child):
                    return True
        return False

    assert alter(value), "SLAYER result has no numeric cell to perturb (see contract gaps)"
    return value


@pytest.mark.parametrize("failure", [None, "RUN_NOT_FOUND", "RUN_AMBIGUOUS", "ARTIFACT_MISSING", "SLAYER_SQL_MISMATCH"])
def test_im_q39_tools_cannot_write_app_mutate_env_or_spawn(built, failure):
    """NC: app .env append, TDN flag write, and subprocess are all denied."""
    built.code(label_all())
    arrange_failure(built, failure)
    before, env = tree_snapshot(built.app), dict(os.environ)
    built.guard.strict = True
    try:
        results = scenario_calls(built, failure)
        if failure:
            for result in results:
                error(result, failure)
        for tool in ["build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts"]:
            error(built.call(tool, OTHER), "RUN_NOT_FOUND")
        assert dict(os.environ) == env
        assert tree_snapshot(built.app) == before
        for mutation in [lambda: (built.app / ".env").open("a"),
                         lambda: os.environ.__setitem__("TDN_RESEARCH_JEV_ENABLED", "1"),
                         lambda: subprocess.run(["true"], check=True)]:
            with built.guard.expected_violation(), pytest.raises(AssertionError):
                mutation()
    finally:
        built.guard.strict = False
    assert os.environ["DO_NOT_TRACK"] == "1"
    assert os.environ["SLAYER_USAGE_REPORTING"] == "off"


@pytest.mark.parametrize("live_open", [False, True])
def test_im_q39_wal_app_siblings_are_byte_identical(subject, sandbox, monkeypatch, live_open):
    """NC: the old path, a mode=ro open of the live WAL DB, changes app.sqlite-shm and fails."""
    sandbox.seed()
    writer = sqlite3.connect(sandbox.db)
    try:
        assert writer.execute("PRAGMA journal_mode=WAL").fetchone()[0] == "wal"
        writer.execute("PRAGMA wal_autocheckpoint=0")
        # These rows are committed only in the WAL while the writer stays open.
        sandbox.seed([review(i) for i in range(1, 4)])
        if live_open:
            @contextmanager
            def live(path):
                con = subject.open_app_db(path)
                try:
                    yield con
                finally:
                    con.close()
            monkeypatch.setattr(subject, "app_db_snapshot", live)
        before = tree_snapshot(sandbox.app)
        assert {"app.sqlite", "app.sqlite-wal", "app.sqlite-shm"} <= {Path(k).name for k in before}
        result = sandbox.call("build_warehouse")
        assert result["reviews_by_platform"]["shopee"] == 3
        if live_open:
            assert tree_snapshot(sandbox.app) != before
        else:
            assert tree_snapshot(sandbox.app) == before
            assert not list(sandbox.tmp.glob("insight-app-*"))
    finally:
        writer.close()


@pytest.mark.parametrize("torn_copies,expected", [(1, None), (4, "SOURCE_SNAPSHOT_FAILED")])
def test_im_q39_torn_snapshot_is_retried_then_refused(subject, sandbox, monkeypatch, torn_copies, expected):
    """NC: one torn copy is retried; a copy that never passes quick_check is refused, not read."""
    sandbox.seed([review(1)])
    before = tree_snapshot(sandbox.app)
    real, torn = subject._copy_bytes, []

    def copy_bytes(source, target):
        real(source, target)
        if Path(source) == sandbox.db and len(torn) < torn_copies:
            torn.append(target)
            data = Path(target).read_bytes()
            Path(target).write_bytes(data[:100] + b"\xff" * (len(data) - 100))

    monkeypatch.setattr(subject, "_copy_bytes", copy_bytes)
    result = sandbox.call("build_warehouse")
    if expected is None:
        assert result["reviews_by_platform"]["shopee"] == 1
    else:
        error(result, expected)
    assert len(torn) == torn_copies
    assert tree_snapshot(sandbox.app) == before
    assert not list(sandbox.tmp.glob("insight-app-*"))


def test_im_q40_all_public_surfaces_and_logs_are_counts_only(subject, sandbox, capsys, caplog):
    """NC: INFO logging and a short-review note both fail the shared scanner."""
    sandbox.seed([review(7, text="zqv07 ok"), review(8, platform="tiktok_shop", name="synthetic_writer_q40",
                   text="zqv08 một hai ba bốn năm sáu bảy tám chín mười")])
    with caplog.at_level(logging.DEBUG):
        results = tool_calls(sandbox)
        results.append(sandbox.call("code_reviews", dry_run=False, max_calls=1))
        sandbox.code(label_all())
        results.extend(tool_calls(sandbox))
        results.extend(sandbox.call(t, OTHER) for t in ["build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts"])
        error(sandbox.call("theme_counts", question="T-GIA' OR 1=1"), "INVALID_ARGUMENT")
        sandbox.fake_paid(lambda *args: (_ for _ in ()).throw(RuntimeError("zqv07 ok")))
        results.append(sandbox.call("code_reviews", dry_run=False, max_calls=1, block_override="my_pham"))
    captured = capsys.readouterr()
    for value in [results, captured.out, captured.err, caplog.text]:
        no_leak(value, sandbox.sentinels())
    for result in results:
        for key in ["eligible_reviews", "planned_calls", "already_coded"]:
            if key in result:
                assert type(result[key]) is int
    for leaked in [{"note": "zqv07 ok"}, "INFO synthetic log: zqv07 ok"]:
        with pytest.raises(AssertionError):
            no_leak(leaked, sandbox.sentinels())

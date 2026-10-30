"""Part 2 protocol, privacy and local read-only boundaries (IM-Q52..54)."""

import copy
import json
import logging
import os
import socket
import sqlite3

import pytest

from insight_test_support import AMBIGUOUS, OTHER, RUN, error, no_leak, sha, sync, tree_snapshot
from p2_support import PAIR, keyword_row


def types(schema):
    result = set()
    for branch in schema.get("anyOf", schema.get("oneOf", [schema])):
        value = branch["type"]
        result.update(value if isinstance(value, list) else [value])
    return result


def assert_surface(tools):
    expected = {
        "build_warehouse": {"run_id": {"string"}},
        "code_reviews": {"run_id": {"string"}, "dry_run": {"boolean"}, "max_calls": {"integer", "null"},
                         "block_override": {"string", "null"}},
        "theme_counts": {"run_id": {"string"}, "question": {"string", "null"}},
        "keyword_counts": {"run_id": {"string"}}, "portrait_counts": {"run_id": {"string"}},
        "report_plan": {"run_id": {"string"}},
        "confidence_ceiling": {"run_id": {"string"}, "part": {"integer"}, "evidence": {"array"}, "hypothesis": {"boolean"}},
        "find_reason_links": {"run_id": {"string"}, "theme_a": {"string"}, "theme_b": {"string"}},
        "read_reviews": {"run_id": {"string"}, "ids": {"array"}},
    }
    assert set(tools) == set(expected)
    for tool, arguments in expected.items():
        props = tools[tool]["properties"]
        assert set(props) == set(arguments)
        for name, allowed in arguments.items():
            assert types(props[name]) == allowed
    assert tools["confidence_ceiling"]["properties"]["hypothesis"]["default"] is False
    assert types(tools["read_reviews"]["properties"]["ids"]["items"]) == {"string"}
    item = tools["confidence_ceiling"]["properties"]["evidence"]["items"]
    if "$ref" in item:
        item = tools["confidence_ceiling"]["$defs"][item["$ref"].rsplit("/", 1)[-1]]
    assert types(item) == {"object"}
    assert set(item["properties"]) == {"count_id", "part"}
    assert types(item["properties"]["count_id"]) == {"string"}
    assert types(item["properties"]["part"]) == {"integer", "null"}


def test_im_q52_nine_tools_and_exact_nested_input_schemas(p2):
    """NC: extra approval/reason writers and an added SQL argument fail independently."""
    tools = {t.name: t.inputSchema for t in sync(p2.box.module.mcp.list_tools())}
    assert_surface(tools)
    for writer in ("record_method_approval", "record_reason_check"):
        changed = copy.deepcopy(tools)
        changed[writer] = {"properties": {}}
        with pytest.raises(AssertionError):
            assert_surface(changed)
    changed = copy.deepcopy(tools)
    changed["find_reason_links"]["properties"]["sql"] = {"type": "string"}
    assert set(changed) == set(tools)
    with pytest.raises(AssertionError):
        assert_surface(changed)


def test_im_q52_new_tools_execute_through_fastmcp(coded_p2):
    """NC: a direct-only implementation with nested asyncio.run fails the MCP boundary."""
    row = keyword_row(coded_p2.box)
    for tool, arguments in [
        ("report_plan", {}),
        ("confidence_ceiling", {"part": 6, "evidence": [{"count_id": row["count_id"], "part": None}]}),
        ("find_reason_links", {"theme_a": PAIR[0], "theme_b": PAIR[1]}),
        ("read_reviews", {"ids": ["shopee:1"]}),
    ]:
        blocks = sync(coded_p2.box.module.mcp.call_tool(tool, {"run_id": RUN, **arguments}))
        result = json.loads(next(b.text for b in blocks if b.type == "text"))
        assert "error" not in result
        assert result == coded_p2.call(tool, **arguments)


def database_snapshot(path):
    with sqlite3.connect(path) as db:
        names = [r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")]
        return {name: (db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone()[0],
                       sorted(db.execute('SELECT * FROM "' + name.replace('"', '""') + '"').fetchall(), key=repr))
                for name in names}


def test_im_q53_new_tools_preserve_app_environment_and_only_allowed_tables(coded_p2):
    """NC: a warehouse schema write by read_reviews or an unrelated table write fails."""
    p2 = coded_p2
    row = keyword_row(p2.box)
    calls = [
        ("report_plan", {}, {"count_registry", "keyword_group"}),
        ("confidence_ceiling", {"part": 6, "evidence": [{"count_id": row["count_id"], "part": None}]}, set()),
        ("find_reason_links", {"theme_a": PAIR[0], "theme_b": PAIR[1]}, {"count_registry", "reason_flag", "reason_verdict"}),
        ("read_reviews", {"ids": ["shopee:1"]}, set()),
    ]
    for tool, args, allowed in calls:
        before_app, before_env = tree_snapshot(p2.box.app), dict(os.environ)
        before = database_snapshot(p2.box.warehouse)
        digest = sha(p2.box.warehouse.read_bytes())
        p2.box.guard.strict = True
        try:
            result = p2.call(tool, **args)
        finally:
            p2.box.guard.strict = False
        assert "error" not in result
        assert tree_snapshot(p2.box.app) == before_app and dict(os.environ) == before_env
        after = database_snapshot(p2.box.warehouse)
        assert {k: v for k, v in before.items() if k not in allowed} == {k: v for k, v in after.items() if k not in allowed}
        if not allowed:
            assert sha(p2.box.warehouse.read_bytes()) == digest
        assert not p2.store.exists()


@pytest.mark.parametrize("tool,args", [
    ("report_plan", {}), ("confidence_ceiling", {"part": 6, "evidence": []}),
    ("find_reason_links", {"theme_a": PAIR[0], "theme_b": PAIR[1]}), ("read_reviews", {"ids": ["shopee:1"]}),
])
@pytest.mark.parametrize("scenario,expected", [("unbuilt", "WAREHOUSE_NOT_BUILT"), ("missing", "RUN_NOT_FOUND"), ("ambiguous", "RUN_AMBIGUOUS")])
def test_im_q53_error_paths_preserve_app_home_and_offline_boundary(p2, tool, args, scenario, expected):
    """NC: failed run resolution must not create a warehouse/store or mutate app files."""
    p2.box.seed([])
    rid = RUN if scenario == "unbuilt" else OTHER
    if scenario == "ambiguous":
        p2.box.seed([], run_id=AMBIGUOUS)
        for run in (RUN, AMBIGUOUS):
            assert "error" not in p2.box.call("build_warehouse", run)
        rid = "aaaaaaaa"
    before, environment = tree_snapshot(p2.box.app), dict(os.environ)
    warehouses = tree_snapshot(p2.box.data)
    p2.box.guard.strict = True
    try:
        # read_reviews errors contain no exempt text and may use the old scanner.
        result = p2.box.call(tool, rid, **args)
    finally:
        p2.box.guard.strict = False
    error(result, expected)
    assert tree_snapshot(p2.box.app) == before and dict(os.environ) == environment
    assert tree_snapshot(p2.box.data) == warehouses and not p2.store.exists()


def test_im_q53_existing_shared_store_is_opened_readonly(coded_p2, monkeypatch):
    """NC: a shared-store rw connection allows the INSERT probe and fails."""
    p2 = coded_p2
    p2.sample()
    before = sha(p2.store.read_bytes())
    real = sqlite3.connect
    opened = []

    def guarded(database, *args, **kwargs):
        db = real(database, *args, **kwargs)
        if str(p2.store) in str(database):
            opened.append(str(database))
            with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
                db.execute("INSERT INTO sample_review VALUES ('codebook','probe','synthetic','2026-10-30',1,1)")
        return db

    row = keyword_row(p2.box)
    with monkeypatch.context() as patch:
        patch.setattr(sqlite3, "connect", guarded)
        for tool, args in [("report_plan", {}), ("find_reason_links", {"theme_a": PAIR[0], "theme_b": PAIR[1]}),
                           ("confidence_ceiling", {"part": 6, "evidence": [{"count_id": row["count_id"], "part": None}]})]:
            boundary = len(opened)
            assert "error" not in p2.call(tool, **args)
            assert len(opened) > boundary
    assert all(uri.startswith("file:") and "mode=ro" in uri for uri in opened)
    assert sha(p2.store.read_bytes()) == before


def test_im_q53_read_reviews_warehouse_connection_rejects_writes(coded_p2, monkeypatch):
    """NC: mode=rw without an incidental schema change still fails the write probe."""
    p2 = coded_p2
    real, opened = sqlite3.connect, []

    def guarded(database, *args, **kwargs):
        db = real(database, *args, **kwargs)
        if str(p2.box.warehouse) in str(database):
            opened.append(str(database))
            with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
                db.execute("UPDATE review_text SET text=text")
        return db

    with monkeypatch.context() as patch:
        patch.setattr(sqlite3, "connect", guarded)
        assert len(p2.call("read_reviews", ids=["shopee:1"])["reviews"]) == 1
    assert opened and all(uri.startswith("file:") and "mode=ro" in uri for uri in opened)


def test_im_q53_socket_and_store_creation_negative_controls(coded_p2, monkeypatch):
    """NC: intentional network attempt and missing-store creation are detected."""
    p2 = coded_p2
    real = p2.box.module.report_plan

    def dns(*a, **k):
        socket.getaddrinfo("synthetic.invalid", 443)
        return real(*a, **k)

    with monkeypatch.context() as patch:
        patch.setattr(p2.box.module, "report_plan", dns)
        with p2.box.guard.expected_violation(), pytest.raises(AssertionError, match="NETWORK_FORBIDDEN"):
            p2.call("report_plan")
    # This is a control of the same absence assertion used for the real tools.
    assert not p2.store.exists()
    with sqlite3.connect(p2.store):
        pass
    with pytest.raises(AssertionError):
        assert not p2.store.exists()


def test_im_q54_raw_text_has_exactly_the_two_allowed_locations(privacy_p2, capsys, caplog):
    """NC: raw-text deletion/redaction and any non-exempt copy must fail."""
    p2 = privacy_p2
    before = {r["review_id"]: r["text"] for r in p2.box.rows("review_text")}
    p2.reading("shopee:1")
    p2.call("report_plan")
    p2.call("confidence_ceiling", part=6, evidence=[])
    p2.links()
    raw = p2.call("read_reviews", ids=["shopee:1"])
    assert raw["reviews"][0]["text"] == before["shopee:1"]
    assert {r["review_id"]: r["text"] for r in p2.box.rows("review_text")} == before
    p2.scan_storage()
    captured = capsys.readouterr()
    for value in [p2.box.public_results, captured.out, captured.err, caplog.text]:
        no_leak(value, p2.box.sentinels())
    p2.box.sql("UPDATE review_text SET text='' WHERE review_id='shopee:1'")
    with pytest.raises(AssertionError):
        assert {r["review_id"]: r["text"] for r in p2.box.rows("review_text")} == before


@pytest.mark.parametrize("location", ["reason_flag", "reason_verdict", "count_registry", "shared", "result", "debug_log"])
def test_im_q54_each_nonexempt_copy_is_detected(privacy_p2, caplog, location):
    """NC: independently inject a short synthetic review into each forbidden sink."""
    p2 = privacy_p2
    p2.reading("shopee:1")
    result = p2.links()
    text = p2.box.rows("review_text")[0]["text"]
    if location in {"reason_flag", "reason_verdict"}:
        p2.box.sql(f"ALTER TABLE {location} ADD COLUMN note TEXT")
        p2.box.sql(f"UPDATE {location} SET note=?", (text,))
    elif location == "count_registry":
        p2.box.sql("UPDATE count_registry SET numbers_json=?", (json.dumps({"leak": text}),))
    elif location == "shared":
        with sqlite3.connect(p2.store) as db:
            db.execute("ALTER TABLE reason_check ADD COLUMN note TEXT")
            db.execute("UPDATE reason_check SET note=?", (text,))
    elif location == "result":
        long_text = p2.box.rows("review_text", "WHERE review_id='shopee:2'")[0]["text"]
        # This eight-word run excludes the nonce. A nonce-only scanner misses it.
        result["connector_sentence"] = " ".join(long_text.split()[2:10])
        with pytest.raises(AssertionError):
            no_leak(result, p2.box.sentinels())
        return
    else:
        logger = logging.getLogger("insight-p2-synthetic-leak-control")
        try:
            with caplog.at_level(logging.DEBUG):
                logger.debug("%s", text)
            with pytest.raises(AssertionError):
                no_leak(caplog.text, p2.box.sentinels())
        finally:
            # Intentional mutant records must not contaminate parent Q40 teardown.
            caplog.clear()
        return
    with pytest.raises(AssertionError):
        p2.scan_storage()

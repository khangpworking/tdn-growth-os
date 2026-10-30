"""Offline protocol, write scope, privacy and task-4.4 document contracts."""

import copy
import json
import re
import shlex
import socket
import sqlite3
import tomllib

import pytest

from insight_test_support import AMBIGUOUS, OTHER, RUN, error, sync, tree_snapshot
from p3_support import FILES, accepted, claim, codes, statement


OLD_TOOLS = {"build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts",
             "report_plan", "confidence_ceiling", "find_reason_links", "read_reviews"}


def types(schema):
    result = set()
    for branch in schema.get("anyOf", schema.get("oneOf", [schema])):
        value = branch["type"]
        result.update(value if isinstance(value, list) else [value])
    return result


def assert_surface(tools):
    assert set(tools) == OLD_TOOLS | {"submit_section", "submit_statement", "render_report"}
    expected = {
        "submit_section": dict(run_id={"string"}, part={"integer"}, text={"string"}, claims={"array"}),
        "submit_statement": dict(run_id={"string"}, statement={"object"}, replaces={"string", "null"}),
        "render_report": dict(run_id={"string"}),
    }
    for name, props in expected.items():
        actual = tools[name]["properties"]
        assert set(actual) == set(props)
        for key, allowed in props.items():
            assert types(actual[key]) == allowed
    assert types(tools["submit_section"]["properties"]["claims"]["items"]) == {"object"}
    assert tools["submit_statement"]["properties"]["replaces"].get("default") is None


def test_im_q79_twelve_tool_surface_and_no_arbitrary_output_path(p3):
    """NC: exposed approval writer and render out_dir each fail the exact schema."""
    tools = {t.name: t.inputSchema for t in sync(p3.box.module.mcp.list_tools())}
    assert_surface(tools)
    changed = copy.deepcopy(tools)
    changed["record_method_approval"] = dict(properties={})
    with pytest.raises(AssertionError):
        assert_surface(changed)
    changed = copy.deepcopy(tools)
    changed["render_report"]["properties"]["out_dir"] = dict(type="string")
    with pytest.raises(AssertionError):
        assert_surface(changed)


def test_im_q79_new_tools_execute_through_fastmcp(coded_p3):
    """NC: direct-only functions or nested asyncio.run fail real MCP dispatch."""
    p3 = coded_p3
    row = p3.theme()
    for tool, args in [
        ("submit_section", dict(part=8, text="Khách kể lại cân nhắc giá [^c1].", claims=[claim(row)])),
        ("submit_statement", dict(statement=statement(row))), ("render_report", {}),
    ]:
        before = p3.digest(p3.box.warehouse)
        with p3.boundary():
            blocks = sync(p3.box.module.mcp.call_tool(tool, dict(run_id=RUN, **args)))
        value = json.loads(next(b.text for b in blocks if b.type == "text"))
        p3.box.public_results.append(value)
        p3.results.append(value)
        assert "error" not in value
        if tool != "render_report":
            accepted(value)
        else:
            assert value["stored"] is True and value["versions"] == {"8": 1}
        assert p3.digest(p3.box.warehouse) == before


@pytest.mark.parametrize("tool", ["submit_section", "submit_statement", "render_report"])
def test_im_q80_only_report_store_and_five_files_may_change(coded_p3, tool):
    """NC: computing current IDs on the real warehouse changes its hash."""
    p3 = coded_p3
    args = {"submit_section": dict(part=8, text="Khách kể lại cân nhắc giá [^c1].", claims=[claim(p3.theme())]),
            "submit_statement": dict(statement=statement(p3.theme())), "render_report": {}}[tool]
    before = tree_snapshot(p3.box.data)
    assert "error" not in p3.call(tool, **args)
    after = tree_snapshot(p3.box.data)
    changed = {p for p in before.keys() | after.keys() if before.get(p) != after.get(p)}
    allowed = {"insight-report.sqlite"}
    if tool == "render_report":
        allowed |= {f"reports/{RUN}/{name}" for name in FILES}
    assert changed and changed <= allowed
    assert not p3.store.exists()


def test_im_q80_rejected_first_submissions_do_not_create_store(coded_p3):
    """NC: early SQLite initialization before validation/gates creates a forbidden file."""
    p3 = coded_p3
    assert not p3.report_store.exists()
    assert "HIDDEN_NAME" in codes(p3.section("Google kể lại [^c1]."))
    assert not p3.report_store.exists()
    value = statement(p3.theme())
    value["insight"] = "Tôi muốn chọn mẫu"
    assert "FIRST_PERSON" in codes(p3.submit(value))
    assert not p3.report_store.exists() and not p3.store.exists()
    accepted(p3.section())
    before = p3.digest(p3.report_store)
    error(p3.call("submit_section", part=18, text="invalid", claims=[]), "INVALID_ARGUMENT")
    assert "HIDDEN_NAME" in codes(p3.section("Google kể lại [^c1]."))
    assert p3.digest(p3.report_store) == before


@pytest.mark.parametrize("tool", ["submit_section", "submit_statement", "render_report"])
@pytest.mark.parametrize("scenario,expected", [("unbuilt", "WAREHOUSE_NOT_BUILT"),
                                                ("missing", "RUN_NOT_FOUND"), ("ambiguous", "RUN_AMBIGUOUS")])
def test_im_q80_run_errors_preserve_all_files(p3, tool, scenario, expected):
    """NC: error paths must neither initialize stores nor repair live app data."""
    p3.box.seed([])
    rid = RUN if scenario == "unbuilt" else OTHER
    if scenario == "ambiguous":
        p3.box.seed([], run_id=AMBIGUOUS)
        for run in (RUN, AMBIGUOUS):
            assert "error" not in p3.box.call("build_warehouse", run)
        rid = "aaaaaaaa"
    args = {"submit_section": dict(part=3, text="Báo cáo dùng dữ liệu mẫu.", claims=[]),
            "submit_statement": dict(statement=statement(dict(count_id="IMC-000000000000", platform="shopee"))),
            "render_report": {}}[tool]
    before = tree_snapshot(p3.box.data)
    with p3.boundary():
        result = p3.box.call(tool, rid, **args)
    error(result, expected)
    assert tree_snapshot(p3.box.data) == before


def test_im_q80_shared_store_connections_reject_writes(coded_p3, monkeypatch):
    """NC: rw shared-store access fails a write probe even if no incidental bytes change."""
    p3 = coded_p3
    p3.sample()
    real, opened = sqlite3.connect, []

    def guarded(database, *args, **kwargs):
        db = real(database, *args, **kwargs)
        if str(p3.store) in str(database):
            opened.append(str(database))
            with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
                db.execute("INSERT INTO sample_review VALUES ('codebook','probe','synthetic','2026-10-30',1,1)")
        return db

    row = p3.theme()
    with monkeypatch.context() as patch:
        patch.setattr(sqlite3, "connect", guarded)
        for tool, args in [("submit_section", dict(part=8, text="Khách kể lại [^c1].", claims=[claim(row)])),
                           ("submit_statement", dict(statement=statement(row))), ("render_report", {})]:
            boundary = len(opened)
            assert "error" not in p3.call(tool, **args)
            assert len(opened) > boundary
    assert all(uri.startswith("file:") and "mode=ro" in uri for uri in opened)


def test_im_q80_original_warehouse_never_gets_a_writable_connection(coded_p3, monkeypatch):
    """NC: real-warehouse recomputation fails even when all count IDs already exist."""
    p3 = coded_p3
    row = p3.theme()
    real = sqlite3.connect

    def guarded(database, *args, **kwargs):
        db = real(database, *args, **kwargs)
        if str(p3.box.warehouse) in str(database):
            with pytest.raises(sqlite3.OperationalError, match="readonly|read-only"):
                db.execute("UPDATE review_text SET text=text")
        return db

    with monkeypatch.context() as patch:
        patch.setattr(sqlite3, "connect", guarded)
        accepted(p3.section(row=row))
        accepted(p3.submit(statement(row)))
        p3.render()


def test_im_q80_network_attempt_is_detected_even_if_caught(coded_p3, monkeypatch):
    """NC: intentional render DNS attempt proves that the offline audit is active."""
    p3 = coded_p3
    real = p3.box.module.render_report

    def wrong(*args, **kwargs):
        try:
            socket.getaddrinfo("synthetic.invalid", 443)
        except AssertionError:
            pass
        return real(*args, **kwargs)

    with monkeypatch.context() as patch:
        patch.setattr(p3.box.module, "render_report", wrong)
        with p3.box.guard.expected_violation():
            p3.call("render_report")
            assert "NETWORK_FORBIDDEN" in p3.box.guard.violations


def test_im_q81_full_flow_has_no_private_results_logs_store_or_files(coded_p3, capsys, caplog):
    """NC: echoed quote details, reason member IDs and DEBUG rejection logs are scanned."""
    p3 = coded_p3
    accepted(p3.section())
    value = statement(p3.theme())
    value["evidence"] += p3.chain()
    accepted(p3.submit(value))
    rejected = p3.section("mẫu thử tổng hợp có nhiều đặc điểm [^c1].", part=13)
    assert "VERBATIM_QUOTE" in codes(rejected)
    p3.render()
    captured = capsys.readouterr()
    values = [p3.results, captured.out, captured.err, caplog.text]
    values += [v.decode() for v in p3.artifacts().values()]
    p3.privacy(values)
    for leak in ("mẫu thử tổng hợp có nhiều đặc điểm", "shopee:1", "synthetic_p3_writer101"):
        with pytest.raises(AssertionError):
            p3.privacy([dict(detail=leak)])
    for raw in p3.artifacts().values():
        assert "review_ids" not in raw.decode() and "writer_key" not in raw.decode()


def registration_contract(text):
    assert "Register the MCP" in text
    snippets = {}
    for name in ("Claude Code", "Codex", "OpenCode"):
        match = re.search(r"^#{2,6}\s+" + re.escape(name) + r"[^\n]*\n(.*?)(?=^#{2,6}\s|\Z)", text, re.M | re.S)
        assert match, f"missing {name} subsection"
        section = match[1]
        assert "INSIGHT_MCP_ALLOW_PAID" not in section
        assert not re.search(r"(?:API_KEY|api[_-]?key)\s*[:=]", section, re.I)
        fences = re.findall(r"```([^\n]*)\n(.*?)```", section, re.S)
        assert fences
        parsed = []
        for language, snippet in fences:
            if language.strip() in {"json", "jsonc"}:
                parsed.append(json.loads(snippet))
            elif language.strip() == "toml":
                parsed.append(tomllib.loads(snippet))
            else:
                # Command registration is explicitly permitted; parse shell
                # quoting without executing, inspecting config or spawning CLI.
                tokens = shlex.split(snippet)
                assert "tdn-insight" in tokens
        assert "tdn-insight" in section and "tools/mcp-insight/insight_tools.py" in section
        assert "INSIGHT_MCP_APP_DB" in section
        for value in parsed:
            container = {"Claude Code": "mcpServers", "Codex": "mcp_servers", "OpenCode": "mcp"}[name]
            assert "tdn-insight" in value.get(container, {})
            server = value[container]["tdn-insight"]
            server_text = json.dumps(server)
            assert "tools/mcp-insight/insight_tools.py" in server_text
            assert "INSIGHT_MCP_APP_DB" in server_text
            assert "url" not in server
            assert server.get("transport", "stdio") == "stdio"
            assert server.get("type", "stdio") in {"stdio", "local"}
        snippets[name] = section
    return snippets


def skill_contract(text):
    assert len(text.splitlines()) <= 60
    assert text.startswith("---\n")
    front = text.split("---", 2)[1]
    assert re.search(r"^name:\s*tdn-insight-report\s*$", front, re.M)
    assert re.search(r"^description:\s*\S", front, re.M)
    order = ["report_plan", "theme_counts", "keyword_counts", "portrait_counts", "find_reason_links",
             "submit_section", "submit_statement", "render_report"]
    positions = [text.index(name) for name in order]
    assert positions[0] < min(positions[1:4]) and max(positions[1:4]) < positions[4]
    assert positions[4] < min(positions[5:7]) and max(positions[5:7]) < positions[7]
    assert "code_reviews" in text and "dry_run=False" in text
    assert re.search(r"owner|chủ", text, re.I)
    assert re.search(r"OK|approv|đồng ý|cho phép", text, re.I)


def test_im_q107_registration_examples_are_parseable_and_unpaid(p3):
    """NC: adding the paid flag to OpenCode fails the complete example check."""
    text = (p3.box.insight / "README.md").read_text()
    snippets = registration_contract(text)
    changed = text.replace(snippets["OpenCode"], snippets["OpenCode"] + "\nINSIGHT_MCP_ALLOW_PAID=1\n")
    with pytest.raises(AssertionError):
        registration_contract(changed)
    example = json.loads((p3.box.insight / ".mcp.json.example").read_text())
    encoded = json.dumps(example)
    assert "tdn-insight" in encoded and "insight_tools.py" in encoded and "INSIGHT_MCP_APP_DB" in encoded
    assert "INSIGHT_MCP_ALLOW_PAID" not in encoded


def test_im_q107_short_skill_order_and_owner_paid_permission(p3):
    """NC: render-first ordering and 61 lines independently fail the skill contract."""
    text = (p3.box.insight / "skills/tdn-insight-report/SKILL.md").read_text()
    skill_contract(text)
    with pytest.raises(AssertionError):
        skill_contract(text.replace("submit_section", "render_report submit_section", 1))
    with pytest.raises(AssertionError):
        skill_contract("\n".join(text.splitlines() + [""] * (61 - len(text.splitlines()))) + "\n")

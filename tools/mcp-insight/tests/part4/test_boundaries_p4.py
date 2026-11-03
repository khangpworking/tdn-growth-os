"""PR 4 protocol, source dates/rebuilds and preserved PR 1–3 state."""

import copy
import json
import socket

import pytest

from claim_support import NEW_TOOLS, RULES, THEME, catalogue, no_leak, warehouse_tables
from insight_test_support import RUN, VERSION, error, review, sha, sync
from p3_support import accepted, claim, codes


OLD = {"build_warehouse", "code_reviews", "theme_counts", "keyword_counts", "portrait_counts", "star_counts", "report_plan",
       "confidence_ceiling", "find_reason_links", "read_reviews", "submit_section", "submit_statement", "render_report"}


def schema_types(schema):
    result = set()
    for node in schema.get("anyOf", schema.get("oneOf", [schema])):
        kind = node["type"]
        result.update(kind if isinstance(kind, list) else [kind])
    return result


def surface(tools):
    assert set(tools) == OLD | NEW_TOOLS.keys()
    for name, expected in NEW_TOOLS.items():
        actual = tools[name]["properties"]
        assert set(actual) == set(expected)
        for key, types in expected.items(): assert schema_types(actual[key]) == types
    assert tools["code_claims"]["properties"]["dry_run"]["default"] is True


def test_im_q126_exact_eighteen_tools_and_typed_path_boundary(p4):
    """NC: missing either packet/record tool, exposed writer, SQL or counts out_dir fails exact schema."""
    tools = {t.name: t.inputSchema for t in sync(p4.box.module.mcp.list_tools())}
    surface(tools)
    for missing in ("record_claim_grades", "claim_catalogue_packet"):
        altered = copy.deepcopy(tools)
        altered.pop(missing)
        with pytest.raises(AssertionError): surface(altered)
    for name, argument in (("code_claims", "sql"), ("claim_counts", "out_dir"), ("submit_claim_catalogue", "draft_path")):
        altered = copy.deepcopy(tools)
        altered[name]["properties"][argument] = dict(type="string")
        with pytest.raises(AssertionError): surface(altered)
    altered = copy.deepcopy(tools)
    altered["record_method_approval"] = dict(properties={})
    with pytest.raises(AssertionError): surface(altered)


def test_im_q126_all_six_tools_execute_via_fastmcp(p4):
    """NC: direct-only implementations or nested asyncio.run fail at real FastMCP dispatch."""
    p4.seed()
    def call(name, **args):
        with p4.boundary():
            blocks = sync(p4.box.module.mcp.call_tool(name, dict(run_id=RUN, **args)))
        value = json.loads(next(b.text for b in blocks if b.type == "text"))
        assert "error" not in value
        no_leak(value, p4.private())
        return value
    call("claim_catalogue_packet", theme_code=THEME, seed=7, out_dir=str(p4.directory("mcp-draft")))
    call("submit_claim_catalogue", theme_code=THEME, catalogue=catalogue())
    assert call("code_claims", theme_code=THEME, catalogue_version=1)["dry_run"] is True
    p4.code_claims()
    call("claim_counts", theme_code=THEME, catalogue_version=1)
    p4.packet_dir = p4.directory("mcp-grade")
    call("claim_grading_packet", theme_code=THEME, catalogue_version=1, seed=7, out_dir=str(p4.packet_dir))
    p4.write_grades(p4.grades())
    assert call("record_claim_grades", theme_code=THEME, catalogue_version=1,
                grades_dir=str(p4.packet_dir))["status"] == "PASSED"


def test_im_q127_write_scope_and_guards_cover_success_and_failure(coded_claims):
    """NC: each call's adapter audits DNS/subprocess/env and limits table/file changes, even on rejection."""
    p4 = coded_claims
    before = sha(p4.box.warehouse.read_bytes())
    p4.call("code_claims", theme_code=THEME, catalogue_version=1)
    assert sha(p4.box.warehouse.read_bytes()) == before
    p4.draft_packet()
    p4.counts()
    p4.pass_catalogue()
    error(p4.call("record_claim_grades", theme_code=THEME, catalogue_version=1,
                  grades_dir=str(p4.directory("absent"))), "GRADES_INVALID")
    assert not p4.store.exists() and not p4.report_store.exists()
    # Prove the inherited guard records attempted calls even when caught.
    with p4.box.guard.expected_violation():
        with p4.boundary(), pytest.raises(AssertionError, match="NETWORK_FORBIDDEN"):
            socket.getaddrinfo("synthetic.invalid", 443)


def test_im_q127_store_audit_covers_tool_reads_but_not_harness_snapshots(p4, monkeypatch):
    """NC: a real tool-side store read still fails after excluding snapshot bookkeeping."""
    p4.seed()
    p4.method(f"claim_counts:shopee_reviews:{VERSION}+{RULES}")
    assert p4.store.exists()
    p4.draft_packet()
    real = p4.box.module.claim_catalogue_packet

    def reads_store(*args, **kwargs):
        p4.store.read_bytes()
        return sync(real(*args, **kwargs))

    monkeypatch.setattr(p4.box.module, "claim_catalogue_packet", reads_store)
    with pytest.raises(AssertionError, match="claim tool opened shared or report store"):
        p4.draft_packet()


@pytest.mark.parametrize("field", ["review_id", "writer_key", "product_key"])
def test_im_q128_platform_counts_pass_but_literal_private_identifiers_fail(p4, monkeypatch, field):
    """NC: omitting the ID scan admits the injected field; word-folding IDs rejects the valid 5-count map."""
    p4.seed([review(i) for i in range(1, 6)] +
            [review(6, platform="tiktok_shop", name="writer_count_map")])
    p4.catalogue()
    result = p4.call("code_claims", theme_code=THEME, catalogue_version=1)
    assert result["eligible_by_platform"] == {"shopee": 5, "tiktok_shop": 1}
    identifier = next(row for row in p4.box.rows("review") if row["writer_known"])[field]
    real = p4.box.module.code_claims

    def leaks_identifier(*args, **kwargs):
        return sync(real(*args, **kwargs)) | {"unexpected_private": identifier}

    monkeypatch.setattr(p4.box.module, "code_claims", leaks_identifier)
    with pytest.raises(AssertionError, match="synthetic private identifier escaped"):
        p4.call("code_claims", theme_code=THEME, catalogue_version=1)


def test_im_q128_claim_flow_keeps_near_dup_and_existing_reason_registry_ids(p4):
    """NC R2-3: globally banning stored IDs destroys legitimate reason links and duplicate/sample joins."""
    rows = [review(1, text="zqvprivacy cân nhắc giá vì công dụng"),
            review(2, platform="tiktok_shop", name="writer_privacy_flow")]
    p4.seed(rows)
    p4.reading("shopee:1", pair=("T-GIA", THEME))
    result = p4.links(("T-GIA", THEME))
    assert result["rows"][0]["reviews"] == 1
    reason_entries = [r for r in p4.box.rows("count_registry") if r["tool"] == "find_reason_links"]
    assert any("shopee:1" in r["numbers_json"] for r in reason_entries)
    p4.draft_packet()
    p4.catalogue()
    p4.code_claims()
    p4.counts()
    p4.pass_catalogue()
    assert [r for r in p4.box.rows("count_registry") if r["tool"] == "find_reason_links"] == reason_entries
    assert len(p4.box.rows("near_dup")) == 2
    assert p4.box.rows("claim_packet") and p4.box.rows("claim_label")
    p4.storage_privacy()
    # Identifier scan is intentionally restricted to claim registry entries.
    for row in p4.box.rows("count_registry"):
        if row["tool"] == "claim_counts": no_leak(row, p4.private())
    identifiers = [r[k] for r in p4.box.rows("review") for k in ("review_id", "writer_key", "product_key")]
    for file in (p4.box.data / "packets").rglob("*"):
        if file.is_file(): no_leak(file.read_text(), identifiers + ["writer_privacy_flow"])


@pytest.mark.parametrize("platform,fields,expected", [
    ("shopee", {"postedAtLocal": "2026-03-01 23:30:00"}, "2026-03-01"),
    ("shopee", {"createdAt": "2026-03-01T17:30:00Z"}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": 1772386200000}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": 1772386200}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": "1772386200"}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": 1772386200.0}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": "abc", "review_timestamp_fmt": "01/03/2026"}, "2026-03-01"),
    ("shopee", {}, None),
    ("shopee", {"postedAtLocal": "2026-03-01 23:30:00", "createdAt": "2026-02-15T00:00:00Z"}, "2026-03-01"),
    ("shopee", {"postedAtLocal": "abc", "createdAt": "2026-02-15T00:00:00Z"}, "2026-02-15"),
    ("tiktok_shop", {"review_timestamp": 1772386200000, "review_timestamp_fmt": "05/03/2026"}, "2026-03-02"),
    ("tiktok_shop", {"review_timestamp": True, "review_timestamp_fmt": "05/03/2026"}, "2026-03-05"),
    ("shopee", {"postedAtLocal": "2026/03/01 trailing"}, "2026-03-01"),
    ("shopee", {"postedAtLocal": "2026-03-01T20:30:00-05:00"}, "2026-03-02"),
])
def test_im_q129_date_priority_fallback_epoch_units_and_utc_plus_seven(p4, platform, fields, expected):
    """NC: reversed source priority, bool-as-int, ms-as-seconds and missing UTC+7 conversion each differ."""
    row = review(1, platform=platform)
    row.update(fields)
    p4.box.seed([row])
    p4.source_fields([row])
    result = p4.call("build_warehouse")
    assert p4.box.rows("review")[0]["posted_date"] == expected
    assert result["dated_reviews"][platform] == int(expected is not None)
    other = "shopee" if platform == "tiktok_shop" else "tiktok_shop"
    assert result["dated_reviews"][other] == "Chưa có dữ liệu"


def test_im_q130_rebuild_is_deterministic_dates_hash_and_claim_tables_survive(coded_claims):
    """NC: omitting posted_date from content hash or rebuilding state tables loses retained coding."""
    p4 = coded_claims
    before = warehouse_tables(p4.box.warehouse)
    first = p4.call("build_warehouse")
    second = p4.call("build_warehouse")
    assert first["content_sha256"] == second["content_sha256"]
    assert p4.box.rows("near_dup") == [dict(zip(("review_id", "group_id"), r)) for r in before["near_dup"]]
    after = warehouse_tables(p4.box.warehouse)
    for table in ("claim_catalogue", "claim_coding_state", "claim_label", "claim_packet", "claim_grade"):
        assert after[table] == before[table]
    rows = copy.deepcopy(p4.box.reviews)
    rows[0]["postedAtLocal"] = "2026-03-01"
    p4.box.replace_sources(rows)
    p4.source_fields(rows)
    changed = p4.call("build_warehouse")
    assert changed["content_sha256"] != first["content_sha256"]


def test_im_q130_every_new_tool_requires_rebuilt_warehouse_old_counts_still_work(coded_claims):
    """NC: a new tool silently using an old warehouse must return the explicit rebuild error."""
    p4 = coded_claims
    p4.box.sql("ALTER TABLE review DROP COLUMN posted_date")
    for tool in NEW_TOOLS:
        args = dict(theme_code=THEME)
        if tool == "submit_claim_catalogue": args["catalogue"] = catalogue()
        elif tool == "claim_catalogue_packet": args.update(seed=7, out_dir=str(p4.directory("old")))
        else:
            args["catalogue_version"] = 1
            if tool == "claim_grading_packet": args.update(seed=7, out_dir=str(p4.directory("old")))
            if tool == "record_claim_grades": args["grades_dir"] = str(p4.directory("old"))
        error(p4.call(tool, **args), "WAREHOUSE_REBUILD_NEEDED")
    assert "error" not in p4.call("theme_counts")


@pytest.mark.parametrize("tool", list(NEW_TOOLS))
def test_im_q126_invalid_run_theme_and_boolean_packet_seed_are_safe(p4, tool):
    """NC: excluded F310 theme/path-shaped run or bool seed cannot reach files/queries."""
    p4.seed()
    p4.catalogue()
    args = dict(theme_code=THEME)
    if tool == "submit_claim_catalogue": args["catalogue"] = catalogue()
    elif tool == "claim_catalogue_packet": args.update(out_dir=str(p4.directory("arg")), seed=7)
    else:
        args["catalogue_version"] = 1
        if tool == "claim_grading_packet": args.update(out_dir=str(p4.directory("arg")), seed=7)
        if tool == "record_claim_grades": args["grades_dir"] = str(p4.directory("arg"))
    error(p4.call(tool, run_id="../../secret", **args), "INVALID_ARGUMENT")
    error(p4.call(tool, **(args | dict(theme_code="T-GIAOHANG"))), "INVALID_ARGUMENT")
    if "seed" in args: error(p4.call(tool, **(args | dict(seed=True))), "INVALID_ARGUMENT")


def test_im_q161_theme_sentence_and_plan_ignore_claim_state(p4):
    """NC: applying the claim ranking gate to a theme-only sentence breaks preserved R-IM10 behavior."""
    p4.seed([review(i) for i in range(1, 7)])
    row = p4.theme("T-VI")
    before = p4.call("theme_counts"), p4.call("report_plan")
    p4.catalogue()
    p4.code_claims()
    p4.counts()
    assert (p4.call("theme_counts"), p4.call("report_plan")) == before
    result = p4.section("6 đánh giá khen vị nhiều nhất [^c1].", row=row,
                        claims=[claim(row, conclusion=False)])
    assert "CLAIM_RANK_UNSCOPED" not in codes(result)


def test_im_q161_claim_sections_preserve_the_part8_retold_gate(coded_claims):
    """NC: exempting claim rows from IM-Q110 incorrectly accepts the unmarked part-8 sentence."""
    p4 = coded_claims
    row = p4.row()
    text = "Khách nhận xét sau dùng [^c1]."
    assert "RETOLD_NOT_MARKED" in codes(p4.section(text, row=row, part=8))
    accepted(p4.section("Khách kể lại nhận xét sau dùng [^c1].", row=row, part=8))
    accepted(p4.section(text, row=row, part=13))


def test_im_q140_im_q148_im_q163_no_current_target_is_not_coded(p4):
    """NC: treating an unprocessed theme as an intentionally excluded-only sample loses NOT_CODED."""
    p4.box.seed([review(1)])
    p4.source_fields(p4.box.reviews)
    p4.call("build_warehouse")
    p4.catalogue()
    for tool in ("code_claims", "claim_counts", "claim_catalogue_packet", "claim_grading_packet"):
        args = dict(theme_code=THEME)
        if tool == "claim_catalogue_packet": args.update(seed=7, out_dir=str(p4.directory("target")))
        else:
            args["catalogue_version"] = 1
            if tool == "claim_grading_packet": args.update(seed=7, out_dir=str(p4.directory("target")))
        error(p4.call(tool, **args), "NOT_CODED")

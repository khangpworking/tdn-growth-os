"""R-IM12 static artifacts, current/stale citations and semantic archives."""

import json
import re
import sqlite3

import pytest

from insight_test_support import RUN, canonical, no_leak, review, sha
from p2_support import TITLES, keyword_row
from p3_support import accepted, all_themes, claim, codes, hidden_scan, mutate_label, statement


def body(node):
    """Exclude only the section heading; placeholder content is prescribed exactly."""
    headings = node.all("h1") + node.all("h2") + node.all("h3")
    assert headings
    text = node.text.strip()
    heading = headings[0].text.strip()
    assert text.startswith(heading)
    return text[len(heading):].strip()


def test_im_q102_eighteen_ordered_parts_missing_body_and_escaping(coded_p3):
    """NC: missing-part omission/autofill, unescaped scripts and stale-version rendering."""
    p3 = coded_p3
    accepted(p3.section("Nhóm mẫu cũ [^c1].", part=4))
    accepted(p3.section("Nhóm mẫu mới <script>x</script> [^c1].", part=4))
    accepted(p3.section())
    result = p3.render()
    page = p3.page()
    parts = [n.attrs["id"] for n in page.root.all("section") if n.attrs.get("id", "").startswith("part-")]
    assert parts == [f"part-{n}" for n in range(1, 19)]
    for number, title in enumerate(TITLES, 1):
        assert f"Phần {number}. {title}" in page.section(number).text
    assert body(page.section(15)) == "Chưa viết"
    assert "Nhóm mẫu mới <script>x</script>" in page.section(4).text
    assert "Nhóm mẫu cũ" not in page.section(4).text
    raw = p3.artifacts()["report.html"].decode()
    assert "&lt;script&gt;x&lt;/script&gt;" in raw and not page.root.all("script")
    for node in page.root.all():
        for key in ("src", "href", "action"):
            if key in node.attrs:
                assert not node.attrs[key] or node.attrs[key].startswith(("#", "data:")), "static page must have no external resource"
    ids = [n.attrs.get("id") for n in page.root.all("section")]
    assert ids.index("part-17") < ids.index("statements") < ids.index("unanswered") < ids.index("part-18")
    assert result["parts"] == dict(written=2, missing=15, stale=0)
    frame = json.loads((p3.box.insight / "data/report-frame.json").read_text())
    book = json.loads((p3.box.insight / "data/insight-theme-codebook.json").read_text())
    for token in (RUN, frame["version"], frame["status"], book["version"], book["status"]):
        assert token in raw
    plan = p3.call("report_plan")
    unanswered = page.root.all("section", id="unanswered")[0].text
    for row in plan["unanswered"]:
        for key in ("unknown", "step", "why", "needs"):
            assert row[key] in unanswered


def test_im_q103_appendix_footnotes_scope_and_stale_history(numeric_p3):
    """NC: dropping stale text or substituting fresh counts changes the retained claim."""
    p3 = numeric_p3
    row = p3.theme("T-VI")
    accepted(p3.section("6 đánh giá kể lại cân nhắc giá [^c1].", row=row))
    p3.render()
    page = p3.page()
    links = page.section(8).all("a")
    assert [(n.attrs.get("href"), n.text) for n in links] == [("#fn-1", "1")]
    appendix = page.section(18)
    footnote = appendix.all(id="fn-1")
    assert len(footnote) == 1
    text = footnote[0].text
    for token in (row["count_id"], "Đánh giá Shopee", "Shopee", "Sau mua", "Yếu", "6"):
        assert token in text
    assert "Đánh giá Shopee" in appendix.text
    assert "40" in appendix.text  # source scope differs from the only cited row's six reviews
    mutate_label(p3, "T-VI")
    assert p3.theme("T-VI")["reviews"] == 5
    result = p3.render()
    stale_page = p3.page()
    assert "Cần gửi lại: số liệu đã đổi" in stale_page.section(8).text
    assert "6 đánh giá kể lại cân nhắc giá" in stale_page.section(8).text
    old = stale_page.section(18).all(id="fn-1")[0].text
    assert row["count_id"] in old and "6" in old
    assert p3.theme("T-VI")["count_id"] not in old
    assert result["parts"]["stale"] == 1
    assert next(r for r in p3.total("parts") if r["part"] == 8)["status"] == "Cần gửi lại"


def test_im_q103_stale_statement_keeps_original_evidence(coded_p3):
    """NC: section-only stale handling or replacing statement counts with current ones."""
    p3 = coded_p3
    old = p3.theme()
    accepted(p3.submit(statement(old)))
    p3.render()
    mutate_label(p3)
    assert p3.theme()["reviews"] == 5
    p3.render()
    block = p3.page().root.all("section", id="statements")[0]
    assert "Cần gửi lại: số liệu đã đổi" in block.text
    assert statement(old)["insight"] in block.text
    assert old["count_id"] in p3.page().section(18).text
    archived = json.loads(p3.report_rows("render_archive")[-1]["statements_json"])
    assert archived[0]["evidence"] == [dict(platform="shopee", count=6)] * 3


def test_im_q102_statement_latest_version_keeps_first_submission_order(coded_p3):
    """NC: sorting by replacement time moves the first statement after the second."""
    p3 = coded_p3
    first = statement(p3.theme())
    first["insight"] = "Khách ưu tiên mẫu ban đầu"
    first_id = accepted(p3.submit(first))["statement_id"]
    second = statement(p3.theme())
    second["insight"] = "Khách cân nhắc mẫu tiếp theo"
    second_id = accepted(p3.submit(second))["statement_id"]
    first["insight"] = "Khách ưu tiên mẫu đã chỉnh"
    accepted(p3.submit(first, replaces=first_id))
    p3.render()
    text = p3.page().root.all("section", id="statements")[0].text
    assert "Khách ưu tiên mẫu ban đầu" not in text
    assert text.index(first["insight"]) < text.index(second["insight"])
    saved = json.loads(p3.report_rows("render_archive")[0]["statements_json"])
    assert [r["statementId"] for r in saved] == [first_id, second_id]


def test_im_q104_totals_exact_envelopes_current_rows_and_missing_hash(coded_p3):
    """NC: extra total key, wrong raw rows or submission counters break dashboard JSON."""
    p3 = coded_p3
    row = p3.theme()
    text, claims = "Khách kể lại cân nhắc giá [^c1].", [claim(row)]
    accepted(p3.section(text, claims=claims))
    expected_themes = p3.call("theme_counts")["rows"]
    expected_portraits = p3.call("portrait_counts")["rows"]
    p3.render()
    assert p3.total("themes") == expected_themes
    assert p3.total("portraits") == expected_portraits
    parts = p3.total("parts")
    assert [r["part"] for r in parts] == list(range(1, 19))
    keys = {"part", "title", "status", "content_sha256", "claims", "lowest_confidence"}
    assert all(set(r) == keys for r in parts)
    missing = parts[14]
    assert missing["status"] == "Chưa viết" and missing["content_sha256"] is None
    assert missing["claims"] == 0 and missing["lowest_confidence"] is None
    assert parts[-1]["status"] == "Tự dựng"
    written = parts[7]
    assert written["claims"] == 1 and written["lowest_confidence"] == "Yếu"
    assert written["content_sha256"] == sha(canonical(dict(text=text, claims=claims)))


def test_im_q104_uncoded_run_renders_empty_theme_rows(p3):
    """NC: assuming coded rows exist refuses a valid empty-theme report."""
    p3.seed([review(1)], keywords=())
    p3.render()
    assert p3.total("themes") == []
    assert body(p3.page().section(15)) == "Chưa viết"


def test_im_q105_archive_dedupe_ignores_deterministically_distinct_clock(coded_p3, monkeypatch):
    """NC: wall-clock injection in artifacts creates a second semantic archive."""
    p3 = coded_p3
    accepted(p3.section())
    monkeypatch.setattr(p3.box.module, "_now", lambda: "2026-10-30T01:00:00Z")
    first = p3.render()
    bytes_before = p3.artifacts()
    monkeypatch.setattr(p3.box.module, "_now", lambda: "2026-10-31T02:00:00Z")
    second = p3.render()
    assert first["stored"] is True and second["stored"] is False
    assert re.fullmatch(r"[0-9a-f]{64}", first["archive_id"])
    assert first["archive_id"] == second["archive_id"] and p3.artifacts() == bytes_before
    archives = p3.report_rows("render_archive")
    assert len(archives) == 1
    archived = archives[0]
    assert archived["run_id"] == RUN and archived["rendered_at"] == "2026-10-30T01:00:00Z"
    assert archived["html"].encode() == bytes_before["report.html"]
    totals = json.loads(archived["totals_json"])
    assert set(totals) == {"themes", "keywords", "portraits", "parts"}
    for name, value in totals.items():
        assert value == json.loads(bytes_before[name + ".json"])
    assert json.loads(archived["statements_json"]) == []
    assert archived["codebook_version"] and archived["frame_version"]
    accepted(p3.section("Khách kể lại chú ý giá và quy cách [^c1]."))
    third = p3.render()
    assert third["stored"] is True and third["archive_id"] != first["archive_id"]
    assert len(p3.report_rows("render_archive")) == 2
    with sqlite3.connect(p3.report_store) as db:
        for sql in ("UPDATE render_archive SET html='changed'", "DELETE FROM render_archive"):
            with pytest.raises(sqlite3.DatabaseError):
                db.execute(sql)
            db.rollback()


def test_im_q106_every_export_byte_has_neutral_names(coded_p3):
    """NC: SLAYER in a comment or Jev in an attribute fails the same whole-file scan."""
    p3 = coded_p3
    p3.render()
    assert p3.total("keywords")
    for value in p3.artifacts().values():
        hidden_scan(value.decode())
    raw = p3.artifacts()["report.html"].decode()
    for addition in ("<!-- SLAYER -->", '<img alt="Jev">', '<p title="Jev">x</p>'):
        with pytest.raises(AssertionError):
            hidden_scan(raw + addition)
    assert not p3.page().section(4).all("table"), "unsent portrait part must show only its placeholder"


def test_im_q114_short_chain_renders_only_supported_layers(coded_p3):
    """NC: fabricated third layer, lost explanation or appendix-only chain fails."""
    p3 = coded_p3
    value = statement(p3.theme())
    chain = p3.chain(2)
    value["evidence"] += chain
    accepted(p3.submit(value))
    p3.render()
    block = p3.page().root.all("section", id="statements")[0]
    assert "Tầng 1" in block.text and "Tầng 2" in block.text and "Tầng 3" not in block.text
    assert "chưa đủ bằng chứng" in block.text
    for row in chain:
        assert row["note"] in block.text
    appendix = p3.page().section(18)
    for row in chain:
        assert row["count_id"] in appendix.text and row["note"] in appendix.text
    assert len(block.all("a")) >= 2
    for anchor in block.all("a"):
        target = anchor.attrs.get("href", "").removeprefix("#")
        assert len(appendix.all(id=target)) == 1


def test_im_q96_q110_statement_qualifiers_in_side_notes_survive_render(coded_p3):
    """NC: displaying only why notes loses accepted short-chain and retold qualifiers."""
    p3 = coded_p3
    value = statement(p3.theme())
    value["hidden_truth"] = "Khách cân nhắc tính phù hợp"
    value["motivation"] = "Khách cân nhắc giá"
    note = "kể lại; chưa đủ bằng chứng; <ghi chú>"
    value["evidence"][1]["note"] = note
    accepted(p3.submit(value))
    p3.render()
    block = p3.page().root.all("section", id="statements")[0]
    assert note in block.text
    assert "&lt;ghi chú&gt;" in p3.artifacts()["report.html"].decode()
    assert not block.all("ghi")
    assert all(p3.page().section(18).all(id=a.attrs["href"].removeprefix("#"))
               for a in block.all("a"))


def test_im_q116_labels_are_inline_for_data_synthesis_and_statement(coded_p3):
    """NC: labels only in appendix and a label-everything renderer fail independently."""
    p3 = coded_p3
    kw = keyword_row(p3.box)
    for number in (6, 1):
        c = claim(kw, hypothesis=True, part=6 if number == 1 else None)
        accepted(p3.section("Chủ đề hỏi cách chọn [^c1].", part=number, claims=[c]))
    accepted(p3.section("Khách khen quy cách [^c1].", part=13))
    value = statement(p3.theme(), hypothesis=True)
    accepted(p3.submit(value))
    p3.render()
    page = p3.page()
    for number in (6, 1):
        spans = page.section(number).all("span", **{"class": "claim"})
        assert len(spans) == 1
        assert spans[0].text.startswith("(Giả thuyết · Yếu · Quan tâm)")
        assert len(spans[0].all("sup")) == 1
        assert spans[0].all("a")[0].attrs["href"].startswith("#fn-")
        paragraphs = page.section(number).all("p")
        assert any("Chủ đề hỏi cách chọn" in p.text and "Giả thuyết" in p.text for p in paragraphs)
    regular = page.section(13).all("span", **{"class": "claim"})[0].text
    assert regular.startswith("(Yếu · Sau mua)") and "Giả thuyết" not in regular
    block = page.root.all("section", id="statements")[0].text
    assert "Giả thuyết" in block[:block.index(value["customer"])]
    assert "Sau mua" in block[:block.index(value["customer"])]
    assert "Yếu" in block[:block.index(value["customer"])]


def test_im_q118_identical_resubmit_advances_history_reuses_archive(coded_p3, monkeypatch):
    """NC: a submission version in page, parts or archived statements defeats dedupe."""
    p3 = coded_p3
    monkeypatch.setattr(p3.box.module, "_now", lambda: "2026-10-30T03:00:00Z")
    assert accepted(p3.section())["version"] == 1
    value = statement(p3.theme())
    first_statement = accepted(p3.submit(value))
    first = p3.render()
    saved = p3.artifacts()
    monkeypatch.setattr(p3.box.module, "_now", lambda: "2026-10-31T04:00:00Z")
    assert accepted(p3.section())["version"] == 2
    accepted(p3.submit(value, replaces=first_statement["statement_id"]))
    second = p3.render()
    assert first["stored"] is True and second["stored"] is False
    assert second["archive_id"] == first["archive_id"] and p3.artifacts() == saved
    assert second["versions"]["8"] == 2
    assert second["statement_versions"][first_statement["statement_id"]] == 2
    assert len(p3.report_rows("render_archive")) == 1
    assert [r["version"] for r in p3.report_rows("section_version")] == [1, 2]
    assert [r["version"] for r in p3.report_rows("statement_version")] == [1, 2]
    archive = p3.report_rows("render_archive")[0]
    for token in (archive["frame_version"], archive["codebook_version"]):
        assert token in saved["report.html"].decode()
    for raw in saved.values():
        text = raw.decode()
        assert "2026-10-30T03:00:00Z" not in text and "2026-10-31T04:00:00Z" not in text
    assert all("version" not in r for r in p3.total("parts"))


def test_im_q119_neutral_keyword_projection_preserves_raw_tool(coded_p3):
    """NC: copying raw rows leaks google; comparing derived source to raw is invalid."""
    p3 = coded_p3
    raw = p3.call("keyword_counts")["rows"]
    assert raw and all(r["platform"] == "google" for r in raw)
    p3.render()
    exported = p3.total("keywords")
    common = {"group_key", "group_name", "step", "keywords", "threshold_met", "threshold_note", "count_id"}
    by_id = {r["count_id"]: r for r in raw}
    assert len(exported) == len(raw)
    for row in exported:
        assert set(row) == common | {"source"}
        assert row["source"] == "Gợi ý tìm kiếm"
        assert {k: row[k] for k in common} == {k: by_id[row["count_id"]][k] for k in common}
    hidden_scan((p3.report_dir / "keywords.json").read_text())
    assert p3.call("keyword_counts")["rows"] == raw
    with pytest.raises(AssertionError):
        hidden_scan(json.dumps(dict(rows=raw)))


def test_im_q125_fixed_wording_collisions_render_but_agent_text_rejects(collision_p3):
    """NC: render refusal/redacted coded labels and masking agent prose all fail."""
    p3 = collision_p3
    p3.seed([review(1, text="Chưa viết"), review(2, text="Chất lượng")] + [review(i) for i in range(3, 7)], keywords=())
    assert "error" not in p3.code(all_themes)[0]
    expected = p3.call("theme_counts")["rows"]
    assert any(r["theme_name"] == "Chất lượng, độ bền" for r in expected)
    p3.render()
    assert body(p3.page().section(15)) == "Chưa viết"
    assert p3.total("parts")[14]["status"] == "Chưa viết"
    assert p3.total("themes") == expected
    # Only independently generated occurrences are masked in this flow, which
    # has no accepted agent text. The paired submission below never gets masking.
    texts = [v.decode() for v in p3.artifacts().values()]
    with pytest.raises(AssertionError):
        no_leak(texts, ["Chưa viết", "Chất lượng"])
    p3.privacy(texts, fixed=("Chưa viết", "Chất lượng, độ bền"))
    before = p3.digest(p3.report_store)
    result = p3.section("Khách khen chất lượng [^c1].", part=13, row=p3.theme("T-CHATLUONG"))
    assert codes(result) == ["VERBATIM_QUOTE"]
    assert p3.digest(p3.report_store) == before
    assert p3.report_rows("section_version") == []

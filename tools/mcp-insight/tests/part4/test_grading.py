"""Two-round settlement and pre-write validation of every untrusted grader byte."""

import copy
import json
import re
import unicodedata

import pytest

from claim_support import THEME, no_leak
from insight_test_support import canonical, error, review, sha


def four_diffs(p4):
    files = p4.grades()
    a, o = files["r1-astra.out"], files["r1-opus.out"]
    a["catalogue"] = list(reversed(a["catalogue"]))
    o["catalogue"] = list(reversed(o["catalogue"]))
    a["catalogue"][0]["verdict"] = "QUA_RONG"
    for value in (a, o):
        value["items"] = [value["items"][i] for i in (2, 0, 1)]
    o["items"][1]["missed"] = [p4.codes[0]]
    a["items"][2]["wrong"] = [p4.codes[0]]
    o["items"][0]["specific_ok"] = False
    for grader, switches in (("astra", {1, 3}), ("opus", {1, 2})):
        files[f"r2-{grader}.out"]["decisions"] = [dict(n=n, agree_other=n in switches, why="checked")
                                                     for n in (4, 2, 1, 3)]
    return files


def test_im_q135_sorted_diff_numbering_each_switch_direction_and_disputes(p4):
    """NC: both-switch, both-keep, switcher's-own-value and list-order mutants each change pinned totals."""
    p4.seed([review(i) for i in range(1, 4)])
    p4.catalogue()
    p4.code_claims()
    p4.packet()
    files = four_diffs(p4)
    expected_objects = {name: canonical(value) for name, value in files.items()}
    result = p4.record(files)
    assert "error" not in result
    for key, expected in dict(round1_keys=11, diffs=4, settled_in_round2=2, disputes=2,
                              items=3, items_settled=2, items_fully_right=2, flagged_by_both=[]).items():
        assert result[key] == expected
    assert result["fully_right_share"] == 1
    stored = p4.box.rows("claim_grade")
    assert len(stored) == 1 and json.loads(stored[0]["raw_json"]) == expected_objects
    for forbidden in ("note", "why", "method_gaps"):
        assert forbidden not in result


@pytest.mark.parametrize("verdict", ["CHONG_NGHIA:Y-CONGDUNG-02", "QUA_RONG", "QUA_HEP", "TEN_SAI", "NGOAI_CHU_DE"])
def test_im_q136_all_five_effective_verdicts_block_perfect_sample(p4, verdict):
    """NC OQ38: even 10/10 items cannot pass the two previously omitted catalogue verdicts."""
    p4.seed([review(i) for i in range(1, 11)])
    p4.catalogue()
    p4.code_claims()
    p4.packet()
    files = p4.grades()
    for grader in ("astra", "opus"):
        files[f"r1-{grader}.out"]["catalogue"][0]["verdict"] = verdict
    result = p4.record(files)
    assert result["items_fully_right"] == result["items_settled"] == 10
    assert result["status"] == "DRAFT" and result["flagged_by_both"] == [p4.codes[0]]


@pytest.mark.parametrize("right,expected", [(8, "PASSED"), (7, "DRAFT")])
def test_im_q136_eighty_percent_is_inclusive(p4, right, expected):
    """NC: strict >0.80 rejects the independently fixed 8-of-10 boundary."""
    p4.seed([review(i) for i in range(1, 11)])
    p4.catalogue()
    p4.code_claims()
    p4.packet()
    files = p4.grades()
    for grader in ("astra", "opus"):
        for item in files[f"r1-{grader}.out"]["items"][right:]: item["missed"] = [p4.codes[0]]
    result = p4.record(files)
    assert result["items_settled"] == 10 and result["items_fully_right"] == right
    assert result["status"] == expected


def test_im_q136_zero_settled_items_cannot_pass(coded_claims):
    """NC: vacuous 0/0 acceptance or scoring only settled correct keys must not produce PASSED."""
    p4 = coded_claims
    p4.packet()
    files = p4.grades()
    for item in files["r1-opus.out"]["items"]: item["specific_ok"] = False
    for grader in ("astra", "opus"):
        files[f"r2-{grader}.out"]["decisions"] = [dict(n=i, agree_other=False, why="checked")
                                                   for i in range(1, 7)]
    result = p4.record(files)
    assert result["items_settled"] == result["items_fully_right"] == 0 and result["status"] == "DRAFT"


def test_im_q135_unknown_packet_cannot_write_grade(coded_claims):
    """NC: trusting a file manifest without the stored run/theme/version sample map admits a forged packet."""
    p4 = coded_claims
    p4.packet()
    files = p4.grades()
    manifest_path = p4.packet_dir / "packet.json"
    manifest = json.loads(manifest_path.read_text())
    manifest["packet_id"] = "CPK-000000000000"
    manifest_path.write_text(canonical(manifest))
    before = sha(p4.box.warehouse.read_bytes())
    error(p4.record(files), "PACKET_UNKNOWN")
    assert sha(p4.box.warehouse.read_bytes()) == before and p4.box.rows("claim_grade") == []


@pytest.mark.parametrize("astra,opus,switch,flagged", [
    ("QUA_RONG", "TEN_SAI", None, True), ("QUA_RONG", "OK", "opus", True),
    ("QUA_RONG", "OK", "astra", False)])
def test_im_q136_effective_flags_can_differ_and_follow_switches(coded_claims, astra, opus, switch, flagged):
    """NC: requiring identical errors or ignoring the switching grader gives the wrong status."""
    p4 = coded_claims
    p4.packet()
    files = p4.grades()
    for grader, verdict in (("astra", astra), ("opus", opus)):
        files[f"r1-{grader}.out"]["catalogue"][0]["verdict"] = verdict
        files[f"r2-{grader}.out"]["decisions"] = [dict(n=1, agree_other=grader == switch, why="checked")]
    result = p4.record(files)
    assert result["flagged_by_both"] == ([p4.codes[0]] if flagged else [])
    assert result["status"] == ("DRAFT" if flagged else "PASSED")


INVALID = ["missing_file", "not_json", "verdict", "unknown_overlap", "missing_decision", "repeat_decision",
    "unknown_decision", "bool_decision", "unknown_item", "omit_one", "omit_29", "repeat_item", "repeat_claim",
    "omit_claim", "omit_group", "repeat_group", "unknown_group", "missing_key", "bool_string", "bool_integer",
    "grader", "unknown_code", "repeat_code", "extra_key", "short_note", "long_why", "hidden",
    "review_id", "writer_key", "product_key", "nested_duplicate", "top_duplicate", "escaped_duplicate"]


@pytest.mark.parametrize("case", INVALID)
def test_im_q137_malformed_outputs_preserve_passed_state_and_all_source_bytes(grading, case, capsys, caplog):
    """NC: last-value-wins parsing, incomplete coverage and pre-validation persistence must all fail."""
    p4 = grading
    files = p4.grades()
    a, o, r2 = files["r1-astra.out"], files["r1-opus.out"], files["r2-astra.out"]
    # Decision controls need three genuine diffs; other malformed surfaces use
    # agreeing files so a second decision/settlement error cannot mask a guard.
    if case in {"missing_decision", "repeat_decision", "unknown_decision", "bool_decision", "long_why", "escaped_duplicate"}:
        for i in range(3): o["items"][i]["specific_ok"] = False
        for grader in ("astra", "opus"):
            files[f"r2-{grader}.out"]["decisions"] = [dict(n=i, agree_other=False, why="checked") for i in (1, 2, 3)]
    source = p4.box.rows("review_text")[0]["text"]
    private = p4.box.rows("review")[0]
    if case == "writer_key": private = next(r for r in p4.box.rows("review") if r["writer_known"])
    if case == "missing_file": files.pop("r1-opus.out"); (p4.packet_dir / "r1-opus.out").unlink()
    elif case == "not_json": files["r1-opus.out"] = "not json"
    elif case == "verdict":
        for value in (a, o): value["catalogue"][0]["verdict"] = "MAYBE"
    elif case == "unknown_overlap":
        for value in (a, o): value["catalogue"][0]["verdict"] = "CHONG_NGHIA:Y-CONGDUNG-99"
    elif case == "missing_decision": files["r2-opus.out"]["decisions"].pop()
    elif case == "repeat_decision": r2["decisions"].append(copy.deepcopy(r2["decisions"][-1]))
    elif case == "unknown_decision": r2["decisions"][-1]["n"] = 99
    elif case == "bool_decision": r2["decisions"][0]["n"] = True
    elif case == "unknown_item":
        for value in (a, o): value["items"][0]["id"] = "S99"
    elif case == "omit_one": a["items"] = [s for s in a["items"] if s["id"] != "S07"]
    elif case == "omit_29": a["items"] = a["items"][:1]; o["items"] = o["items"][:1]
    elif case == "repeat_item":
        for value in (a, o): value["items"].append(copy.deepcopy(value["items"][3]))
    elif case == "repeat_claim":
        for value in (a, o): value["catalogue"].append(copy.deepcopy(value["catalogue"][-1]))
    elif case == "omit_claim":
        for value in (a, o): value["catalogue"].pop()
    elif case == "omit_group":
        for value in (a, o): value["dup_groups"].pop()
    elif case == "repeat_group":
        for value in (a, o): value["dup_groups"].append(copy.deepcopy(value["dup_groups"][0]))
    elif case == "unknown_group":
        for value in (a, o): value["dup_groups"][0]["group"] = "G99"
    elif case == "missing_key":
        for value in (a, o): value["items"][0].pop("specific_ok")
    elif case == "bool_string":
        for value in (a, o): value["items"][0]["specific_ok"] = "true"
    elif case == "bool_integer":
        for value in (a, o): value["dup_groups"][0]["same_idea_copy"] = 1
    elif case == "grader": o["grader"] = "astra"
    elif case == "unknown_code":
        for value in (a, o): value["items"][0]["wrong"] = ["Y-CONGDUNG-99"]
    elif case == "repeat_code":
        for value in (a, o): value["items"][0]["wrong"] = [p4.codes[0], p4.codes[0]]
    elif case == "extra_key": a["items"][0][source] = True
    elif case == "short_note": a["items"][0]["note"] = source.upper().replace(" ", ", ")
    elif case == "long_why": r2["decisions"][0]["why"] = "zqv62 alpha bravo charlie delta echo foxtrot golf"
    elif case == "hidden": a["method_gaps"] = "Jev"
    elif case in {"review_id", "writer_key", "product_key"}: a["items"][0]["note"] = private[case]
    elif case == "nested_duplicate":
        item = canonical(a["items"][0])
        duplicate = item.replace('"note":"checked"', '"note":' + json.dumps(source) + ',"note":"checked"', 1)
        files["r1-astra.out"] = canonical(a).replace(item, duplicate, 1)
    elif case == "top_duplicate":
        files["r1-opus.out"] = '{"items":[{"note":' + json.dumps(source) + '}],' + canonical(o)[1:]
    elif case == "escaped_duplicate":
        files["r2-astra.out"] = canonical(r2).replace('"why":"checked"',
            '"why":' + json.dumps(source) + ',"wh\\u0079":"checked"', 1)
    before, rows = sha(p4.box.warehouse.read_bytes()), p4.box.rows("claim_grade")
    result = p4.record(files)
    error(result, "GRADES_INVALID")
    assert sha(p4.box.warehouse.read_bytes()) == before and p4.box.rows("claim_grade") == rows
    assert p4.counts()["catalogue_status"] == "PASSED"
    if "duplicate" in case: assert "duplicate_key" in result["message"]
    assert ".out" in result["message"]
    assert re.search(r"\$|\b(?:path|root|catalogue|items|dup_groups|decisions|missing|grader|method_gaps)\b",
                     result["message"], re.I)
    captured = capsys.readouterr()
    for value in (result, captured.out, captured.err, caplog.text): no_leak(value, p4.private())
    p4.storage_privacy()


def test_im_q137_wrapper_text_is_discarded_unique_key_object_bytes_are_exact(grading):
    """NC R2-5: retaining whole files leaks wrapper text despite clean parsed fields."""
    p4 = grading
    files = p4.grades()
    objects = {name: json.dumps(value, ensure_ascii=False, indent=2) for name, value in files.items()}
    source = p4.box.rows("review_text")[0]["text"]
    wrapped = copy.deepcopy(objects)
    wrapped["r1-astra.out"] = source + "\n" + objects["r1-astra.out"]
    wrapped["r2-opus.out"] = objects["r2-opus.out"] + "\n" + source
    assert p4.record(wrapped)["status"] == "PASSED"
    assert json.loads(p4.box.rows("claim_grade")[-1]["raw_json"]) == objects
    no_leak(p4.box.rows("claim_grade"), p4.box.sentinels())


@pytest.mark.parametrize("name,note", [
    ("writer_r2_17", "writer_r2_17"), ("writer.r3.17", "Writer.R3.17"),
    ("Trần  Zqvbảy", "trần  zqvbảy"), ("Zqa Zqb Zqc Zqd Zqe Zqf Zqg", "zqa zqb zqc zqd zqe zqf zqg"),
    ("Trần Zqvbảy", unicodedata.normalize("NFD", "trần zqvbảy")),
])
def test_im_q137_writer_source_spelling_has_no_six_word_or_word_token_cap(p4, name, note, capsys, caplog):
    """NC R3-1: reconstructed words lose punctuation/spaces; bounded matching misses long valid names."""
    p4.seed([review(1, platform="tiktok_shop", name=name, text="zqvwriter fixture")])
    p4.catalogue()
    p4.code_claims()
    p4.pass_catalogue()
    files = p4.grades()
    if name == "Trần Zqvbảy":
        files["r1-astra.out"]["missing"] = [dict(name="note " + note + " checked", why="checked")]
    else:
        files["r1-astra.out"]["items"][0]["note"] = "note " + note + " checked"
    before = sha(p4.box.warehouse.read_bytes())
    result = p4.record(files)
    error(result, "GRADES_INVALID")
    assert "writer_name" in result["message"] and sha(p4.box.warehouse.read_bytes()) == before
    assert p4.counts()["catalogue_status"] == "PASSED"
    captured = capsys.readouterr()
    for value in (result, captured.out, captured.err, caplog.text): no_leak(value, [name, note])
    p4.storage_privacy()


@pytest.mark.parametrize("note", ["writer_r2_18", "writer r2 17", "awriter_r2_17b"])
def test_im_q137_unrelated_changed_spelling_and_letter_glued_names_are_not_writer_hits(p4, note):
    """NC: punctuation-normalizing or arbitrary-substring name matching over-blocks these distinct names."""
    p4.seed([review(1, platform="tiktok_shop", name="writer_r2_17")])
    p4.catalogue()
    p4.code_claims()
    p4.packet()
    files = p4.grades()
    files["r1-astra.out"]["items"][0]["note"] = note
    assert p4.record(files)["status"] == "PASSED"
    assert len(p4.box.rows("claim_grade")) == 1

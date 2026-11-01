"""R-IM13 catalogue validation and checked external-drafting handoff."""

import copy
import json
import random
import sqlite3

import pytest

from claim_support import THEME, catalogue, packet_digest
from insight_test_support import RUN, canonical, error, no_leak, review, sha


@pytest.mark.parametrize("case", ["empty", "thirteen", "two_generic", "no_generic", "long_name", "blank",
    "theme", "code", "duplicate", "extra", "hidden", "quote8", "short_name", "one_word",
    "short_include", "short_exclude", "short_specific_rule", "short_notes", "too_long", "generic_type"])
def test_im_q131_rejects_each_catalogue_rule_before_write(p4, case):
    """NC: quotes in every persisted field, including one-word reviews, must fail atomically."""
    long = "zqv62 alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra"
    p4.seed([review(1, text="zqv51 xương chắc"), review(2, text="zqv52"), review(3, text=long)])
    cat = catalogue()
    if case == "empty": cat["claims"] = []
    elif case == "thirteen": cat = catalogue(size=13)
    elif case == "two_generic": cat["claims"][0]["generic"] = True
    elif case == "no_generic": cat["claims"][-1]["generic"] = False
    elif case == "long_name": cat["claims"][0]["name"] = "một hai ba bốn năm sáu bảy tám"
    elif case == "blank": cat["claims"][0]["exclude"] = " "
    elif case == "theme": cat["theme"] = "T-VI"
    elif case == "code": cat["claims"][0]["code"] = "Y-VI-1"
    elif case == "duplicate": cat["claims"][1]["code"] = cat["claims"][0]["code"]
    elif case == "extra": cat["claims"][0]["owner"] = "synthetic"
    elif case == "hidden": cat["claims"][0]["name"] = "Jev"
    elif case == "quote8": cat["claims"][0]["include"] = "ZQV62, ALPHA bravo charlie delta echo foxtrot golf!"
    elif case == "short_name": cat["claims"][0]["name"] = "Zqv51, xương chắc!"
    elif case == "one_word": cat["claims"][0]["name"] = "hết đau zqv52"
    elif case in {"short_include", "short_exclude"}: cat["claims"][0][case[6:]] = "zqv51 xương chắc"
    elif case.startswith("short_"): cat[case[6:]] = "zqv51 xương chắc"
    elif case == "too_long": cat["notes"] = "x" * 2001
    elif case == "generic_type": cat["claims"][-1]["generic"] = 1
    before = sha(p4.box.warehouse.read_bytes())
    result = p4.call("submit_claim_catalogue", theme_code=THEME, catalogue=cat)
    error(result, "CATALOGUE_INVALID")
    assert sha(p4.box.warehouse.read_bytes()) == before
    assert p4.box.rows("claim_catalogue") == []
    # Do not allow value-bearing validation messages, even for structural failures.
    no_leak(result["message"], p4.box.sentinels())
    assert result["message"]


@pytest.mark.parametrize("size", [1, 12])
def test_im_q131_twelve_claims_and_seven_word_fragment_are_accepted(p4, size):
    """NC: confusing a 7-word fragment with an entire short review over-blocks this catalogue."""
    p4.seed([review(1, text="zqv63 alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra")])
    cat = catalogue(size=size)
    cat["claims"][0].update(name="xương chắc hơn", include="alpha bravo charlie delta echo foxtrot golf")
    result = p4.catalogue(cat)
    assert result["claims"] == size and result["status"] == "DRAFT"


def test_im_q132_versions_are_per_theme_append_only_and_keep_exact_input(p4):
    """NC: global versioning, idempotent submit, or overwrite breaks distinct assertions."""
    p4.seed()
    first = p4.catalogue()
    stored = p4.box.rows("claim_catalogue")
    assert p4.catalogue()["catalogue_version"] == 2
    assert p4.box.rows("claim_catalogue", "WHERE catalogue_version=1") == stored
    assert p4.catalogue(theme="T-VI")["catalogue_version"] == 1
    row = stored[0]
    assert first == dict(run_id=RUN, theme_code=THEME, catalogue_version=1, status="DRAFT", claims=2)
    assert json.loads(row["catalogue_json"]) == catalogue()
    assert row["label"] == catalogue()["version"] and row["codebook_version"] == "2026-10-30.4"
    with sqlite3.connect(p4.box.warehouse) as db:
        for sql in ("UPDATE claim_catalogue SET label='changed'", "DELETE FROM claim_catalogue"):
            with pytest.raises(sqlite3.DatabaseError):
                db.execute(sql)
            db.rollback()
    for tool in ("claim_counts", "code_claims", "claim_grading_packet", "record_claim_grades"):
        args = dict(theme_code=THEME, catalogue_version=3)
        if tool == "claim_grading_packet": args.update(out_dir=str(p4.directory("missing")), seed=7)
        if tool == "record_claim_grades": args.update(grades_dir=str(p4.directory("missing")))
        error(p4.call(tool, **args), "CATALOGUE_NOT_FOUND")


@pytest.mark.parametrize("tool", ["claim_catalogue_packet", "claim_grading_packet"])
@pytest.mark.parametrize("kind", ["relative", "repo", "app", "artifacts", "captures", "nonempty", "symlink"])
def test_im_q133_im_q163_output_path_rejections_write_nothing(coded_claims, tool, kind):
    """NC: checking lexical paths alone admits a symlink into the app home."""
    p4 = coded_claims
    target = p4.directory("invalid")
    if kind == "relative": target = "relative-output"
    elif kind == "repo": target = p4.box.insight / "forbidden-output"
    elif kind == "app": target = p4.box.app
    elif kind == "artifacts": target = p4.box.artifacts / "new-output"
    elif kind == "captures": target = p4.box.captures / "new-output"
    elif kind == "nonempty":
        target.mkdir(parents=True)
        (target / "keep").write_text("synthetic")
    elif kind == "symlink":
        target.parent.mkdir(parents=True, exist_ok=True)
        target.symlink_to(p4.box.app, target_is_directory=True)
    args = dict(theme_code=THEME, out_dir=str(target), seed=7)
    if tool == "claim_grading_packet": args["catalogue_version"] = 1
    from insight_test_support import tree_snapshot
    before = tree_snapshot(p4.box.root)
    error(p4.call(tool, **args), "OUT_DIR_INVALID")
    assert tree_snapshot(p4.box.root) == before


def test_im_q133_sampling_aliases_determinism_and_exact_payload_digest(grading):
    """NC: replacement draw, omitted prompt or stripped final newline changes the independent digest."""
    p4 = grading
    first = p4.packet(7)
    directory = p4.packet_dir
    samples = [json.loads(line) for line in (directory / "sample.jsonl").read_text().splitlines()]
    assert len(samples) == 30 and len({s["id"] for s in samples}) == 30
    assert len({s["text"] for s in samples if not s["dup_group"]}) == 24
    assert [s["id"] for s in samples] == [f"S{i:02d}" for i in range(1, 31)]
    assert first["sample"] == dict(with_claim=18, no_claim=6, near_dup=6)
    payloads = ("catalogue.json", "dup-groups.json", "prompt-r1.md", "sample.jsonl")
    assert first["packet_id"] == packet_digest(directory, payloads, "CPK-")
    original = {f.name: f.read_bytes() for f in directory.iterdir() if not f.name.endswith(".out")}
    second = p4.packet(7)
    assert second["packet_id"] == first["packet_id"]
    assert {f.name: f.read_bytes() for f in p4.packet_dir.iterdir()} == original
    p4.packet(8)
    assert (p4.packet_dir / "sample.jsonl").read_bytes() != original["sample.jsonl"]
    for text in original.values():
        no_leak(text.decode(), [r[k] for r in p4.box.rows("review") for k in ("review_id", "writer_key", "product_key")])
    manifest = json.loads(original["packet.json"])
    assert manifest["packet_id"] == first["packet_id"]
    (directory / "prompt-r1.md").write_bytes(original["prompt-r1.md"] + b"x\n")
    assert packet_digest(directory, payloads, "CPK-") != first["packet_id"]


def test_im_q163_customer_segments_duplicate_collapse_and_small_pool_seed_metadata(p4):
    """NC R5-1/R5-2: keep colon comments and stable small-pool order, but record each requested seed."""
    rows = [review(1, text="zqv71 uống dễ", attributes=["Công dụng: bổ sung canxi"]),
            review(2, text="", attributes=["Công dụng: bổ sung canxi"]),
            review(3, text="Công dụng: zqv72 uống thấy khỏe"), review(4, text="zqv73 unclear")]
    rows += [review(i, text="q00 q01 q02 q03 q04 q05 q06 q07") for i in (5, 6)]
    p4.seed(rows)
    p4.box.sql("UPDATE label SET status='unclear' WHERE review_id='shopee:4' AND theme_code=?", (THEME,))
    before = sha(p4.box.warehouse.read_bytes())
    r7, d7 = p4.draft_packet(7)
    r8, d8 = p4.draft_packet(8)
    repeat, drepeat = p4.draft_packet(7)
    lines = [json.loads(line) for line in (d7 / "reviews.jsonl").read_text().splitlines()]
    assert [r["text"] for r in lines] == ["zqv71 uống dễ", "Công dụng: zqv72 uống thấy khỏe",
                                          "q00 q01 q02 q03 q04 q05 q06 q07"]
    assert [r["copies"] for r in lines] == [1, 1, 2]
    assert [r["id"] for r in lines] == ["R001", "R002", "R003"]
    assert r7["merged"] == r7["attribute_only"] == 1 and r7["sampled"] is False
    assert r7["reviews"] == 3 and r7["packet_id"] == r8["packet_id"] == repeat["packet_id"]
    names = ("reviews.jsonl", "prompt-draft.md")
    for name in names:
        assert (d7 / name).read_bytes() == (d8 / name).read_bytes() == (drepeat / name).read_bytes()
    m7, m8 = [json.loads((d / "packet.json").read_text()) for d in (d7, d8)]
    assert m7.pop("seed") == 7 and m8.pop("seed") == 8 and m7 == m8
    assert (d7 / "packet.json").read_bytes() == (drepeat / "packet.json").read_bytes()
    assert r7["packet_id"] == packet_digest(d7, names, "CDP-")
    assert sha(p4.box.warehouse.read_bytes()) == before
    identifiers = [r[k] for r in p4.box.rows("review") for k in ("review_id", "writer_key", "product_key")]
    for file in d7.iterdir(): no_leak(file.read_text(), identifiers)


def test_im_q163_large_pool_uses_seeded_sample_then_pool_order(p4):
    """NC: unseeded sampling, shuffling after selection or ignoring the cap fails the exact selected set."""
    p4.seed([review(i, text=f"zqvdraft{i} fixture") for i in range(1, 406)])
    pool = sorted(p4.box.rows("review"), key=lambda r: r["review_id"])
    result, directory = p4.draft_packet(7)
    chosen = set(random.Random(7).sample(range(405), 400))
    expected_ids = [r["review_id"] for n, r in enumerate(pool) if n in chosen]
    text = {r["review_id"]: r["text"] for r in p4.box.rows("review_text")}
    lines = [json.loads(line) for line in (directory / "reviews.jsonl").read_text().splitlines()]
    assert result["reviews"] == 400 and result["sampled"] is True
    assert [r["text"] for r in lines] == [text[rid] for rid in expected_ids]
    _, again = p4.draft_packet(7)
    assert {p.name: p.read_bytes() for p in directory.iterdir()} == {p.name: p.read_bytes() for p in again.iterdir()}
    _, other = p4.draft_packet(8)
    assert (directory / "reviews.jsonl").read_bytes() != (other / "reviews.jsonl").read_bytes()


def test_im_q165_fake_draft_requires_checked_submission_and_starts_draft(p4):
    """NC: packet creation/file presence cannot submit or approve, and copied short guidance is rejected."""
    p4.seed([review(1, text="zqv51 xương chắc"), review(2, text="zqvhandoff fixture")])
    _, directory = p4.draft_packet()
    cat = catalogue()
    raw = "runner wrapper\n" + canonical(cat) + "\ntrailer"
    (directory / "draft.out").write_text(raw)
    assert p4.box.rows("claim_catalogue") == []
    parsed = json.loads(raw[raw.index("{"):raw.rindex("}") + 1])
    result = p4.catalogue(parsed)
    assert result["catalogue_version"] == 1 and result["status"] == "DRAFT"
    cat["claims"][0]["include"] = "zqv51 xương chắc"
    before = sha(p4.box.warehouse.read_bytes())
    error(p4.call("submit_claim_catalogue", theme_code=THEME, catalogue=cat), "CATALOGUE_INVALID")
    assert sha(p4.box.warehouse.read_bytes()) == before and len(p4.box.rows("claim_catalogue")) == 1

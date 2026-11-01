"""Prompt/runner contracts inspected as artifacts; no grader or drafting CLI is run."""

import ast
import json
import re
import runpy
import shlex
import sys

import pytest

from insight_test_support import canonical, review
from test_grading import four_diffs


def command_tokens(text):
    return shlex.split(text.replace("\\\n", " "), comments=True)


def adjacent(tokens, *sequence):
    return any(tokens[i:i + len(sequence)] == list(sequence) for i in range(len(tokens)))


def claude_flags(text, model, effort=None):
    tokens = command_tokens(text)
    assert adjacent(tokens, "claude", "-p")
    for flag, value in (("--model", model), ("--allowedTools", "Read Glob Grep")):
        assert adjacent(tokens, flag, value)
    if effort: assert adjacent(tokens, "--effort", effort)
    assert "--strict-mcp-config" in tokens and "--no-session-persistence" in tokens
    assert not any(adjacent(tokens, "--allowedTools", value) for value in ("Read Glob Grep Bash", "Write", "Edit", "Bash"))


def grading_runner(text):
    tokens = command_tokens(text)
    assert adjacent(tokens, "codex", "exec")
    for sequence in (("-s", "read-only"), ("-m", "gpt-6-astra"), ("-c", "model_reasoning_effort=xhigh")):
        assert adjacent(tokens, *sequence)
    assert "--skip-git-repo-check" in tokens
    claude_flags(text, "claude-opus-5-5", "high")
    diff = re.search(r"crosscheck\.py[\"']?\s+diff", text)
    assert diff, "runner must prepare numbered diffs after round one"
    before = text[:diff.start()]
    assert "wait" in command_tokens(before)
    # A static shape check of the required input-only directories. No shell
    # execution, executable substitution or fake paid CLI can hide a real call.
    for grader in ("astra", "opus"):
        assert f"r1-{grader}.d" in before
    assert re.search(r"\b(?:cd|pushd)\b", before)
    for name in ("catalogue.json", "sample.jsonl", "dup-groups.json", "prompt-r1.md"):
        assert name in before


def json_example(prompt):
    match = re.search(r"```json\s*(.*?)```", prompt, re.S)
    assert match
    data = json.loads(match[1])
    assert set(data) == {"version", "theme", "specific_rule", "claims", "notes"}
    assert data["claims"]
    for c in data["claims"]: assert set(c) == {"code", "name", "include", "exclude", "generic"}
    return data


def no_copy_prompt(text):
    folded = text.casefold()
    # Templates can be English or Vietnamese; require both quote limits and
    # the explicit JSON-only output instruction, not arbitrary wording.
    assert re.search(r"(?:do not|never|không|shall not).{0,100}(?:copy|quote|chép|trích)", folded)
    assert re.search(r"(?:json.{0,30}(?:only|duy nhất)|(?:only|chỉ).{0,30}json)", folded)


def numbered_diffs(text):
    """Narrow adapter: embedded JSON diff records; see the claim-layer gaps."""
    decoder = json.JSONDecoder()
    found = {}
    for match in re.finditer(r"\{", text):
        try: value, _ = decoder.raw_decode(text[match.start():])
        except ValueError: continue
        if isinstance(value, dict) and {"n", "key", "own", "other"} <= value.keys():
            assert value["n"] not in found
            found[value["n"]] = value
    return found


def test_im_q134_runner_models_independent_inputs_and_no_ci_invocation(p4):
    """NC: omitted read-only/strict/wait flags and a prompt admitting peer files fail artifact checks."""
    root = p4.box.insight / "claims"
    runner = (root / "cross_grade.sh").read_text()
    grading_runner(runner)
    for altered in (runner.replace("-s read-only", ""), runner.replace("--strict-mcp-config", ""),
                    re.sub(r"\bwait\b", "true", runner), runner.replace("r1-astra.d", "packet")):
        with pytest.raises(AssertionError): grading_runner(altered)
    prompt = (root / "prompt-r1.md").read_text()
    def independent(text):
        for name in ("catalogue.json", "sample.jsonl", "dup-groups.json", "r1-*", "r2-*", "prompt-r2-*"):
            assert name in text
        assert re.search(r"(?:only|duy nhất|chỉ)", text, re.I)
    independent(prompt)
    with pytest.raises(AssertionError): independent(prompt.replace("r1-*", ""))
    no_copy_prompt(prompt)
    no_copy_prompt((root / "prompt-r2.md").read_text())
    tree = ast.parse((root / "crosscheck.py").read_text())
    assert any(isinstance(n, ast.ImportFrom) and n.module == "insight_tools" and
               any(a.name == "claim_grade_keys" for a in n.names) for n in ast.walk(tree))
    assert not any(isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name == "claim_grade_keys"
                   for n in ast.walk(tree))
    workflows = p4.box.insight.parents[1] / ".github" / "workflows"
    for path in workflows.glob("*"):
        if path.is_file(): assert "cross_grade.sh" not in path.read_text()


def test_im_q134_crosscheck_fake_files_use_sorted_diffs_in_process(p4, monkeypatch):
    """NC: independent key numbering or exposing agreeing peer values corrupts the offline round-2 handoff."""
    p4.seed([review(i) for i in range(1, 4)])
    p4.catalogue()
    p4.code_claims()
    p4.packet()
    files = four_diffs(p4)
    files["r1-opus.out"]["method_gaps"] = "PEER_AGREED_COMMENT_MUST_NOT_APPEAR"
    p4.write_grades({n: v for n, v in files.items() if n.startswith("r1-")})
    script = p4.box.insight / "claims" / "crosscheck.py"
    monkeypatch.setitem(sys.modules, "insight_tools", p4.box.module)
    monkeypatch.setattr(sys, "argv", [str(script), "diff", str(p4.packet_dir)])
    with p4.boundary():
        try: runpy.run_path(str(script), run_name="__main__")
        except SystemExit as exc: assert exc.code in (None, 0)
    for grader in ("astra", "opus"):
        text = (p4.packet_dir / f"prompt-r2-{grader}.md").read_text()
        assert all(token in text for token in ("S01", "S02", "S03", p4.codes[-1]))
        assert "PEER_AGREED_COMMENT_MUST_NOT_APPEAR" not in text
        diffs = numbered_diffs(text)
        expected = {
            1: (["catalogue", p4.codes[-1], "verdict"], "QUA_RONG", "OK"),
            2: (["item", "S01", "missed"], [], [p4.codes[0]]),
            3: (["item", "S02", "wrong"], [p4.codes[0]], []),
            4: (["item", "S03", "specific_ok"], True, False),
        }
        assert set(diffs) == set(expected)
        for n, (key, astra, opus) in expected.items():
            assert diffs[n]["key"] == key
            assert diffs[n]["own"] == (astra if grader == "astra" else opus)
            assert diffs[n]["other"] == (opus if grader == "astra" else astra)
    # One shared public key projection, checked against an independent literal.
    projected = p4.box.module.claim_grade_keys(files["r1-astra.out"])
    assert projected[("catalogue", p4.codes[-1], "verdict")] == "QUA_RONG"
    assert projected[("item", "S01", "missed")] == []


def test_im_q164_drafting_runner_json_example_and_no_copy_prompt(p4):
    """NC: unsafe tool flags, extra/missing example keys and removed no-copy instruction fail independently."""
    root = p4.box.insight / "claims"
    runner = (root / "draft_catalogue.sh").read_text()
    claude_flags(runner, "claude-sonnet-5-5")
    for changed in (runner.replace("--strict-mcp-config", ""), runner.replace("Read Glob Grep", "Read Glob Grep Bash")):
        with pytest.raises(AssertionError): claude_flags(changed, "claude-sonnet-5-5")
    for token in ("draft.d", "draft.out", "reviews.jsonl", "prompt-draft.md"):
        assert token in runner
    assert re.search(r"\b(?:cd|pushd)\b", runner)
    assert "submit_claim_catalogue" not in runner and "--mcp-config" not in runner
    prompt = (root / "prompt-draft.md").read_text()
    example = json_example(prompt)
    for changed in (dict(example, claims=[dict(example["claims"][0], owner="wrong")]),
                    {k: v for k, v in example.items() if k != "specific_rule"}):
        with pytest.raises(AssertionError): json_example("```json\n" + canonical(changed) + "\n```")
    no_copy_prompt(prompt)
    with pytest.raises(AssertionError): no_copy_prompt("Read reviews.jsonl only. JSON only.")
    assert "reviews.jsonl" in prompt and re.search(r"(?:only|duy nhất|chỉ)", prompt, re.I)
    for token in ("12", "7", "generic", "include", "exclude", "specific_rule", "copies"):
        assert token in prompt
    workflows = p4.box.insight.parents[1] / ".github" / "workflows"
    for path in workflows.glob("*"):
        if path.is_file(): assert "draft_catalogue.sh" not in path.read_text()

"""Round 2 prompts of the claim cross-check (IM-Q134).

Usage: crosscheck.py diff <packet dir>

Reads r1-astra.out and r1-opus.out (the JSON object from the first `{` to the last `}`), numbers the keys whose two
values differ with the shared `claim_grade_keys` and `claim_grade_diffs` of insight_tools (one source for the
numbering that record_claim_grades uses), and writes prompt-r2-astra.md and prompt-r2-opus.md. Each holds the grader's
own round 1 object and, of the other grader, only the values of the numbered diffs. Settling and the status are
record_claim_grades' job, not this script's. Never run by the MCP, the tests' graders or CI.
"""
import json
import sys
from pathlib import Path

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from insight_tools import claim_grade_diffs, claim_grade_keys  # noqa: E402

GRADERS = ("astra", "opus")


def _object(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    start, end = text.find("{"), text.rfind("}")
    if start < 0 or end < start:
        raise SystemExit(f"{path.name}: no JSON object")
    return json.loads(text[start:end + 1])


def diff(packet: Path) -> int:
    rounds = {g: _object(packet / f"r1-{g}.out") for g in GRADERS}
    keys = {g: claim_grade_keys(rounds[g]) for g in GRADERS}
    diffs = claim_grade_diffs(keys["astra"], keys["opus"])
    template = (Path(__file__).resolve().parent / "prompt-r2.md").read_text(encoding="utf-8")
    for me, other in (("astra", "opus"), ("opus", "astra")):
        lines = [json.dumps({"n": n, "kind": key[0], "key": key[1], "field": key[2], "mine": keys[me].get(key),
                             "other": keys[other].get(key)}, ensure_ascii=False) for n, key in enumerate(diffs, 1)]
        prompt = template
        for token, value in (("{grader}", me), ("{diff_count}", str(len(diffs))),
                             ("{own}", json.dumps(rounds[me], ensure_ascii=False)), ("{diffs}", "\n".join(lines))):
            prompt = prompt.replace(token, value)
        (packet / f"prompt-r2-{me}.md").write_text(prompt, encoding="utf-8")
    print(f"keys {len(keys['astra'])} diffs {len(diffs)}")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] != "diff":
        raise SystemExit("usage: crosscheck.py diff <packet dir>")
    raise SystemExit(diff(Path(sys.argv[2])))

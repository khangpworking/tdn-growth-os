"""Claim-layer fixtures; collection never imports the in-progress subject."""

import logging
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "part3"))
from claim_support import ClaimLayer, no_leak  # noqa: E402
from insight_test_support import review  # noqa: E402

CLI_ATTEMPTS = []


def no_paid_cli(event, args):
    """Always active, including imports/static checks outside tool-call guards."""
    if event in {"subprocess.Popen", "os.system", "os.exec", "os.posix_spawn"}:
        command = str(args)
        if any(word in command for word in ("codex", "claude", "cross_grade.sh", "draft_catalogue.sh")):
            CLI_ATTEMPTS.append("PAID_CLI_FORBIDDEN")
            raise AssertionError("PAID_CLI_FORBIDDEN")


sys.addaudithook(no_paid_cli)


@pytest.fixture(scope="session", autouse=True)
def no_paid_cli_attempted():
    yield
    assert not CLI_ATTEMPTS, "a paid runner was attempted, even if its exception was caught"


@pytest.fixture
def p4(subject, sandbox, codebook, capsys, caplog):
    layer = ClaimLayer(sandbox, codebook)
    caplog.set_level(logging.DEBUG)
    yield layer
    captured = capsys.readouterr()
    for value in (captured.out, captured.err, caplog.text): no_leak(value, layer.private())


@pytest.fixture
def coded_claims(p4):
    p4.seed([review(i) for i in range(1, 7)])
    p4.catalogue()
    result, fake = p4.code_claims()
    assert result.get("coded_now") == 6 and len(fake.calls) == 6
    return p4


@pytest.fixture
def grading(p4):
    # 20 unique kept + 10 no-claim + 8 duplicate candidates: 30 samples.
    rows = [review(i, text=f"zqvg{i} fixture alone") for i in range(1, 31)]
    rows[0].update(platform="tiktok_shop", name="writer_packet_case")
    rows[-1]["text"] = "zqv62 alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra"
    rows += [review(i, text="q00 q01 q02 q03 q04 q05 q06 q07 q08 q09 q10")
             for i in range(31, 39)]
    p4.seed(rows)
    p4.catalogue()
    def policy(body, n):
        text = body["text"]
        kept = text.startswith("q00 ") or (not text.startswith("zqv62 ") and
                                         int(text.split()[0].removeprefix("zqvg")) <= 20)
        return {p4.codes[0]: .9 if kept else .1}
    p4.code_claims(policy)
    packet = p4.packet()
    assert packet["sample"] == {"with_claim": 18, "no_claim": 6, "near_dup": 6}
    files = p4.grades()
    result = p4.record(files)
    assert result["status"] == "PASSED"
    return p4

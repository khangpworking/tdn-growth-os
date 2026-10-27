"""Run unchanged contract tests against guarded mutations in temporary copies."""

import ast
import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from offline_support import FIXTURES, SOURCE
import test_contracts as contracts


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remove_check(source, function_name, category=False):
    tree = ast.parse(source)
    function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == function_name)
    candidates = []
    for node in function.body:
        if not isinstance(node, ast.If):
            continue
        if category:
            match = isinstance(node.test, ast.Name) and node.test.id == "unknown"
        else:
            test = node.test
            match = (isinstance(test, ast.UnaryOp) and isinstance(test.op, ast.Not)
                     and isinstance(test.operand, ast.Call) and isinstance(test.operand.func, ast.Name)
                     and test.operand.func.id == "_writes_allowed")
        if match:
            candidates.append(node)
    if len(candidates) != 1:
        raise AssertionError("negative control must remove exactly one intended check")
    node = candidates[0]
    lines = source.splitlines(keepends=True)
    return "".join(lines[:node.lineno - 1] + lines[node.end_lineno:])


def run_contract(test_name, source_path):
    stream = io.StringIO()
    with patch.object(contracts.MarketContracts, "source_path", source_path):
        result = unittest.TextTestRunner(stream=stream, verbosity=2).run(
            unittest.TestSuite([contracts.MarketContracts(test_name)])
        )
    return result, stream.getvalue()


class NegativeControls(unittest.TestCase):
    def test_guard_and_category_mutations_are_detected_and_copies_removed(self):
        protected = [SOURCE, FIXTURES / "sample-report.pdf", *sorted(FIXTURES.glob("*.json"))]
        before = {path: digest(path) for path in protected}
        source = SOURCE.read_text(encoding="utf-8")
        cases = [
            (name, "test_writes_require_flag", "WRITE_GUARD_HTTP", False)
            for name in ("start_market", "confirm_preset", "cancel_run")
        ] + [("resolve_category_ids", "test_unknown_category_is_rejected_before_any_http", "CATEGORY_REJECTION", True)]
        for test_name in dict.fromkeys(case[1] for case in cases):
            result, output = run_contract(test_name, SOURCE)
            self.assertTrue(result.wasSuccessful(), "negative-control baseline must pass:\n" + output)
        try:
            for function, test_name, marker, category in cases:
                with self.subTest(function=function):
                    with tempfile.TemporaryDirectory(prefix="mcp-market-mutant-") as directory:
                        temporary = Path(directory)
                        mutant = temporary / "market_tools.py"
                        mutant.write_text(remove_check(source, function, category), encoding="utf-8")
                        result, output = run_contract(test_name, mutant)
                        self.assertFalse(result.wasSuccessful(), "mutation survived: " + function)
                        self.assertFalse(result.errors, "mutation failed for an unrelated exception:\n" + output)
                        self.assertIn(marker, output, "mutation failed for the wrong reason:\n" + output)
                    self.assertFalse(temporary.exists(), "temporary mutant was not removed")
            for test_name in dict.fromkeys(case[1] for case in cases):
                result, output = run_contract(test_name, SOURCE)
                self.assertTrue(result.wasSuccessful(), "restored source must pass:\n" + output)
        finally:
            self.assertEqual({path: digest(path) for path in protected}, before,
                             "real source and fixtures must remain unchanged")


if __name__ == "__main__":
    unittest.main()

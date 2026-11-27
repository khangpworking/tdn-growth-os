"""Contract test for the review service watchdog: restart only after 3 deep health checks in a row get no answer.

No service, network or systemctl is used: `urlopen` and `subprocess.run` are patched on the watchdog module.
"""
import importlib
import io
import json
import os
import pathlib
import sys
import tempfile
import unittest
import urllib.error
from unittest import mock

ROOT = pathlib.Path(__file__).resolve().parents[1]


def load_watchdog():
    sys.path.insert(0, str(ROOT))
    try:
        return importlib.import_module('watchdog')
    finally:
        sys.path.remove(str(ROOT))


class WatchdogTests(unittest.TestCase):
    def test_only_three_unanswered_checks_in_a_row_restart_the_service(self):
        watchdog = load_watchdog()

        def answered(deep):
            return lambda *_args, **_kwargs: io.BytesIO(json.dumps({'status': 'ok', 'deep': deep}).encode())

        def refused(code):
            def urlopen(request, **_kwargs):
                raise urllib.error.HTTPError(request.full_url, code, 'refused', {}, None)
            return urlopen

        def no_answer(*_args, **_kwargs):
            raise TimeoutError('synthetic: no answer within 20 s')

        def restarts(steps, token='synthetic-token-' + 'x' * 32):
            """Runs main() once per step on a fresh counter; returns the step numbers that restarted the service."""
            with tempfile.TemporaryDirectory() as state:
                done = []
                for number, urlopen in enumerate(steps, 1):
                    with mock.patch.object(watchdog, 'STATE', pathlib.Path(state, 'watchdog.json')), \
                            mock.patch.dict(os.environ, {'SHOPEE_API_TOKEN': token}), \
                            mock.patch.object(watchdog.urllib.request, 'urlopen', urlopen), \
                            mock.patch.object(watchdog.subprocess, 'run') as run, \
                            mock.patch('sys.stdout', io.StringIO()):
                        watchdog.main()
                    if run.called:
                        self.assertEqual(run.call_args.args[0], ['systemctl', '--user', 'restart', 'shopee-private-api'])
                        done.append(number)
                return done

        self.assertEqual(restarts([no_answer] * 6), [3, 6], 'the 3rd no-answer in a row restarts and resets the count')
        for deep in ('failed', 'busy', 'ok'):
            with self.subTest(answer=deep):
                self.assertEqual(restarts([no_answer, no_answer, answered(deep), no_answer, no_answer]), [],
                                 f'an answered {deep} never restarts and breaks the run of no-answers')
                self.assertEqual(restarts([answered(deep)] * 4), [])
        for code in (401, 403):
            with self.subTest(refused=code):
                self.assertEqual(restarts([refused(code)] * 4), [], 'a refused token never restarts')
                self.assertEqual(restarts([no_answer, no_answer, refused(code)]), [], 'a refused token never counts')
        self.assertEqual(restarts([no_answer] * 4, token=''), [], 'a missing token never counts and never restarts')


if __name__ == '__main__':
    unittest.main()

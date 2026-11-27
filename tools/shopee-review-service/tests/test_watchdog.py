"""Contract test for the review service watchdog counter (restart after 3 failed deep checks in a row).

No service, network or systemctl is used: only the pure counter step is called.
"""
import importlib
import pathlib
import sys
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


class WatchdogTests(unittest.TestCase):
    def test_ok_resets_busy_keeps_and_the_third_failure_in_a_row_restarts(self):
        sys.path.insert(0, str(ROOT))
        try:
            watchdog = importlib.import_module('watchdog')
        finally:
            sys.path.remove(str(ROOT))
        step = watchdog.next_failures
        self.assertEqual(step(2, 'ok'), (0, False), 'a healthy browser resets the count')
        self.assertEqual(step(2, 'busy'), (2, False), 'an active job neither counts nor resets')
        count, restarts = 0, []
        for _ in range(3):
            count, restart = step(count, 'failed')
            restarts.append(restart)
        self.assertEqual((restarts, count), ([False, False, True], 0), 'the 3rd failure in a row restarts and resets')


if __name__ == '__main__':
    unittest.main()

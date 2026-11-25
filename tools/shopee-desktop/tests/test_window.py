"""The app window (owner 25/11): text can be selected and copied."""
import sys
import types
import unittest
from unittest import mock

sys.path.insert(0, str(__import__('pathlib').Path(__file__).resolve().parents[1]))
import tdn_shopee_app  # noqa: E402


class WindowTest(unittest.TestCase):
    def test_the_window_lets_the_user_select_and_copy_text(self):
        calls = []
        fake = types.SimpleNamespace(create_window=lambda *a, **k: calls.append(('window', a, k)),
                                     start=lambda *a, **k: calls.append(('start', a, k)))
        with mock.patch.dict(sys.modules, {'webview': fake}), mock.patch.object(sys, 'argv', ['TDN-Shopee-Flow']):
            self.assertEqual(tdn_shopee_app.main(), 0)
        self.assertEqual([c[0] for c in calls], ['window', 'start'])
        self.assertIs(calls[0][2].get('text_select'), True)
        self.assertEqual(calls[0][1][0], 'TDN Shopee Flow')


if __name__ == '__main__':
    unittest.main()

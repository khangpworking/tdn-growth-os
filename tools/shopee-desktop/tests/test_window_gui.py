"""Text selection in a REAL pywebview window (owner 25/11, app 1.3.0).

Needs a Windows desktop with WebView2, so it runs only with TDN_GUI_TESTS=1:
    set TDN_GUI_TESTS=1 && python -B -m unittest tests.test_window_gui
| window              | text, heading, input | button, tab, step chip | a selection of the lead text |
|---------------------|----------------------|------------------------|------------------------------|
| text_select=True    | selectable           | not selectable         | has the text                 |
| text_select=False   | not selectable       | not selectable         | empty (the app before 1.3.0) |
"""
import json
import os
import pathlib
import subprocess
import sys
import unittest

HERE = pathlib.Path(__file__).resolve().parent
PROBE = HERE / 'gui' / 'webview_select_check.py'
PAGE = HERE.parent / 'index.html'


@unittest.skipUnless(os.environ.get('TDN_GUI_TESTS') == '1', 'real window test: set TDN_GUI_TESTS=1 on a Windows desktop')
class RealWindowSelectionTest(unittest.TestCase):
    def probe(self, flag):
        out = subprocess.run([sys.executable, '-B', str(PROBE), str(PAGE), flag], capture_output=True, text=True,
                             encoding='utf-8', timeout=90).stdout
        return json.loads([line for line in out.splitlines() if line.startswith('{')][-1])

    def test_text_is_selectable_and_controls_are_not(self):
        on, off = self.probe('true'), self.probe('false')
        for name in ('body', 'lead', 'h1', 'input'):
            self.assertNotEqual(on['userSelect'][name], 'none', name)
            self.assertEqual(off['userSelect'][name], 'none', name)
        for name in ('button', 'tab', 'seqch'):
            self.assertEqual(on['userSelect'][name], 'none', name)
        self.assertGreater(on['leadSelectedChars'], 0)
        self.assertEqual(off['leadSelectedChars'], 0)


if __name__ == '__main__':
    unittest.main()

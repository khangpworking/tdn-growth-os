"""Real pywebview window (same WebView2 runtime as the app): text selection with text_select on/off.

Usage: python webview_select_check.py <index.html> <true|false>
Prints one JSON line. No js_api: the page's bridge calls fail and nothing reaches the server or Chrome.
"""
import json
import sys
import threading
import time

import webview

PAGE, FLAG = sys.argv[1], sys.argv[2] == 'true'
PROBE = r"""
(() => {
  const us = e => e ? getComputedStyle(e).userSelect : 'MISSING';
  const seq = document.createElement('div'); seq.className = 'seqch'; seq.innerHTML = '<b>Bước 2</b><span>Đạt</span>';
  document.body.appendChild(seq);
  const bar = document.getElementById('updateBar'); bar.hidden = false;
  document.getElementById('updateText').textContent = 'Có bản mới 1.3.0. Liên hệ IT để cập nhật.';
  const pick = s => document.querySelector(s);
  const selectText = el => {           // a real selection of the element's text, as a drag would make
    const sel = getSelection(); sel.removeAllRanges(); const r = document.createRange(); r.selectNodeContents(el); sel.addRange(r);
    return sel.toString();
  };
  const lead = pick('p.lead');
  return JSON.stringify({
    userSelect: { body: us(document.body), lead: us(lead), h1: us(pick('h1')), input: us(pick('input')),
                  button: us(pick('button')), tab: us(pick('[role=tab]')), seqch: us(seq), banner: us(bar) },
    leadSelectedChars: selectText(lead).length,
    bannerColors: (s => [s.backgroundColor, s.color])(getComputedStyle(bar)),
    darkScheme: matchMedia('(prefers-color-scheme: dark)').matches,
  });
})()
"""


def probe(window):
    time.sleep(2)
    try:
        print(json.dumps({'text_select': FLAG, **json.loads(window.evaluate_js(PROBE))}, ensure_ascii=False))
    finally:
        window.destroy()


w = webview.create_window('select-check', url=PAGE, width=1100, height=700, text_select=FLAG)
webview.start(probe, w)

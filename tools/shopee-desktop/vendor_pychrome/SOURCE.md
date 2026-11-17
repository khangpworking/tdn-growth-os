# vendor_pychrome

Copied from [pychrome](https://github.com/fate0/pychrome) **0.2.4** (PyPI sdist `pychrome-0.2.4.tar.gz`), BSD licence, copyright (c) 2017 fate0. The licence text is in `LICENSE` and must stay with these files.

Original SHA-256 of the copied files:

| File | SHA-256 of the 0.2.4 original |
|---|---|
| `pychrome/__init__.py` | `c967e50ae79c9b707b8564731d1c940afac5095df7b92f832c2b28a9bff25220` |
| `pychrome/browser.py` | `e2b89d76357d3f79e4923db066513d7d9a647f4b9d937f8c5e8ae3e4855c3898` |
| `pychrome/tab.py` | `cc8b9e96568f1340fbf5d7fb9985ec16af3eabcce7aa474449f525651d4d9809` |
| `pychrome/exceptions.py` | `ab7d18cb556c19760622d50843feea38f51ded3d6c06561501f86980e70ec6db` |
| `LICENSE` | `1e264c3918a6b81c2377812f6360db7777371f6de0d7b0f538e34030009da78b` |

Changes made here:

- `browser.py`: `requests` replaced by `urllib.request`. `new_tab`, `activate_tab` and `close_tab` removed, so the app cannot open, focus or close a tab through `/json/new`, `/json/activate` or `/json/close`.
- `tab.py`: `DEBUG` environment printing switched off (`self.debug = False`), so CDP traffic (which holds page request bodies) is never printed. `_recv_loop` also catches `ValueError`: after `stop()` closes the socket, the last `recv()` can return an empty frame, which 0.2.4 turned into an uncaught `JSONDecodeError` in the receive thread. New `drain_events(timeout)`: queues a marker behind every event received so far and waits until the event thread reaches it (the listener uses it to handle the app's own request event before ending its suppression). Nothing else changed.
- `cli.py` not copied (it needed `click`).
- `exceptions.py`, `LICENSE`: unchanged.

The only third-party dependency is `websocket-client`.

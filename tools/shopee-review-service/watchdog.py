"""Restart the review service after 3 failed deep health checks in a row.

Run by the systemd user timer shopee-review-watchdog.timer (every 2 minutes). It reads
SHOPEE_API_TOKEN from its environment and keeps its failure counter in a small state file.
A check during an active job ('busy') neither counts nor resets the counter.
"""
import json
import os
import subprocess
import urllib.request
from pathlib import Path

URL = os.environ.get('SHOPEE_SERVICE_URL', 'http://127.0.0.1:8877').rstrip('/') + '/health?deep=1'
STATE = Path(os.environ.get('WATCHDOG_STATE', Path.home() / '.local/state/tdn-shopee-review-service/watchdog.json'))
FAILURES_TO_RESTART = 3


def probe(token):
    """'ok', 'busy' or 'failed'; no answer within 20 s is a failure."""
    request = urllib.request.Request(URL, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            value = json.load(response)
    except Exception:
        return 'failed'
    return value.get('deep') if value.get('deep') in {'ok', 'busy'} else 'failed'


def next_failures(previous, result):
    """New failure count and whether to restart now."""
    if result == 'ok':
        return 0, False
    if result == 'busy':
        return previous, False
    count = previous + 1
    return (0, True) if count >= FAILURES_TO_RESTART else (count, False)


def main():
    try:
        previous = int(json.loads(STATE.read_text(encoding='utf-8'))['failures'])
    except (OSError, ValueError, KeyError, TypeError):
        previous = 0
    result = probe(os.environ.get('SHOPEE_API_TOKEN', ''))
    failures, restart = next_failures(previous, result)
    print(f'[watchdog] deep={result} failures={failures} restart={restart}', flush=True)
    if restart:
        subprocess.run(['systemctl', '--user', 'restart', 'shopee-private-api'], check=False)
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'failures': failures}), encoding='utf-8')
    temporary.replace(STATE)


if __name__ == '__main__':
    main()

"""Restart the review service after 3 deep health checks in a row get no answer (the service process is hung).

Run by the systemd user timer shopee-review-watchdog.timer (every 2 minutes). It reads
SHOPEE_API_TOKEN from its environment and keeps its counter in a small state file.
A browser that fails while idle is recovered by the service's own worker, not here: any answer
resets the counter. A missing or refused token is a configuration error: it never counts and
never restarts.
"""
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path

URL = os.environ.get('SHOPEE_SERVICE_URL', 'http://127.0.0.1:8877').rstrip('/') + '/health?deep=1'
STATE = Path(os.environ.get('WATCHDOG_STATE', Path.home() / '.local/state/tdn-shopee-review-service/watchdog.json'))
NO_ANSWERS_TO_RESTART = 3


def probe(token):
    """'answered', 'no_answer' (timeout or connection error) or 'config' (missing or refused token)."""
    if not token:
        return 'config'
    request = urllib.request.Request(URL, headers={'Authorization': f'Bearer {token}'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            response.read()
    except urllib.error.HTTPError as error:
        return 'config' if error.code in {401, 403} else 'answered'
    except Exception:
        return 'no_answer'
    return 'answered'


def next_failures(previous, result):
    """New no-answer count and whether to restart now."""
    if result == 'config':
        return previous, False
    if result != 'no_answer':
        return 0, False
    count = previous + 1
    return (0, True) if count >= NO_ANSWERS_TO_RESTART else (count, False)


def main():
    try:
        previous = int(json.loads(STATE.read_text(encoding='utf-8'))['failures'])
    except (OSError, ValueError, KeyError, TypeError):
        previous = 0
    result = probe(os.environ.get('SHOPEE_API_TOKEN', ''))
    if result == 'config':
        print('[watchdog] configuration error: SHOPEE_API_TOKEN is missing or refused', flush=True)
    failures, restart = next_failures(previous, result)
    print(f'[watchdog] result={result} failures={failures} restart={restart}', flush=True)
    if restart:
        subprocess.run(['systemctl', '--user', 'restart', 'shopee-private-api'], check=False)
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = STATE.with_suffix('.tmp')
    temporary.write_text(json.dumps({'failures': failures}), encoding='utf-8')
    temporary.replace(STATE)


if __name__ == '__main__':
    main()

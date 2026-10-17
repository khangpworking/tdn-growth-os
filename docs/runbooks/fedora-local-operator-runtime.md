# Fedora local operator runtime

This runbook starts the integrated TDN operator UI, read API, and optional OWNER API on one **loopback-only** origin. It is for one trusted local operator. It has no public authentication and must never be bound, proxied, forwarded, or exposed to a LAN or the internet.

## 1. Install the exact toolchain

Use the official Node binary that matches the Fedora machine. Replace angle-bracket placeholders; do not paste secrets into shell history shared with others.

```bash
export NODE_VERSION='24.15.0'
export NODE_ARCH='<x64-or-arm64>'
export NODE_HOME="$HOME/.local/opt/node-v${NODE_VERSION}-linux-${NODE_ARCH}"
mkdir -p "$HOME/.local/opt" "$HOME/.local/bin" '<temporary-download-directory>'
cd '<temporary-download-directory>'

curl --fail --location --remote-name \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
curl --fail --location --remote-name \
  "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt"
grep " node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz$" SHASUMS256.txt | sha256sum --check --strict -

tar -xJf "node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" -C "$HOME/.local/opt"
"$NODE_HOME/bin/npm" install --global 'npm@11.12.1'
export PATH="$NODE_HOME/bin:$PATH"
node --version   # must print v24.15.0
npm --version    # must print 11.12.1
```

Do not continue if either version differs. A Fedora package stream or unpinned installer is not a substitute for these repository pins. Persist only the non-secret `NODE_HOME`/`PATH` setup in the operator's shell profile if desired.

## 2. Install, migrate, and build

From the repository root:

```bash
cd '<absolute-path-to-tdn-growth-os-checkout>'
npm ci

mkdir -p '<absolute-private-runtime-directory>' '<absolute-private-artifact-directory>'
chmod 700 '<absolute-private-runtime-directory>' '<absolute-private-artifact-directory>'

# The migration CLI takes the database path as its positional argument.
npm run db:migrate -- '<absolute-private-runtime-directory>/tdn-growth-os.sqlite'

npm run frontend:build
```

`TDN_WORKSPACE_DB` configures the operator runtime; the migration CLI does **not** read it. Pass the intended database explicitly as shown, then export that same absolute path for startup. Keep the SQLite database, WAL/SHM files, and artifact root private and outside Git.

**Run the migration step before starting any new build.** Startup refuses a database whose schema is older than the build (`Database schema is at v<n>; apply migrations up to v<head> before starting`). A build containing Task 049 needs migration 0025 (`flow_content_ai_attempts`); it is additive, and rolling the build back leaves an unused table.

## 3. Configure without `.env`

Export variables in the current private shell only. Never create or commit `.env`, tokens, databases, artifacts, or real business data.

Read-only/disabled OWNER mode:

```bash
export TDN_WORKSPACE_DB='<absolute-private-runtime-directory>/tdn-growth-os.sqlite'
export TDN_ARTIFACT_ROOT='<absolute-private-artifact-directory>'
export TDN_OPERATOR_APP_HOST='127.0.0.1'
export TDN_OPERATOR_APP_PORT='8787'
export TDN_OWNER_API_ENABLED='false'
unset TDN_OWNER_API_TOKEN TDN_OWNER_API_ACTOR_ID
```

Enabled local OWNER mode:

```bash
export TDN_WORKSPACE_DB='<absolute-private-runtime-directory>/tdn-growth-os.sqlite'
export TDN_ARTIFACT_ROOT='<absolute-private-artifact-directory>'
export TDN_OPERATOR_APP_HOST='127.0.0.1'
export TDN_OPERATOR_APP_PORT='8787'
export TDN_OWNER_API_ENABLED='true'
export TDN_OWNER_API_TOKEN='<strong-random-32-to-512-character-token-with-letters-and-digits>'
export TDN_OWNER_API_ACTOR_ID='<valid-local-owner-actor-id>'
```

The token is a local development authorization gate, not production authentication. The actor ID must match `[a-z][a-z0-9:_-]{2,119}`. Never use `0.0.0.0`, a LAN address, a public hostname, or port forwarding.

### Local testing without token entry (explicit opt-in)

Only for direct browser access on the same Fedora machine:

```bash
export TDN_OWNER_API_ENABLED='true'
export TDN_OWNER_API_LOCAL_TEST='true'
export TDN_OWNER_API_ACTOR_ID='<existing-valid-local-owner-actor-id>'
```

Keep the existing database/artifact/loopback configuration. This mode generates
a process-scoped credential; no token paste is required on the web and no
persistent token is exposed to it. The browser reacquires authority on reload.
The banner says `Test local · OWNER tự động · Thay đổi được lưu thật`.
Changes persist in the configured database; this is not synthetic demo mode.
Business prerequisites, explicit confirmations and the executor lock remain.
Opening the page does not run AI or spend money. If AI is configured, a later
explicit generation action can still call it under its separate authorization.

Do not expose this mode through LAN, proxy, tunnel, forwarding, Cloudflare or
domain access. Host, Origin and forwarded-header rejection do not prove that
an intentionally configured tunnel cannot strip or replace those headers.
Keep the existing private token file for return to normal mode, but do not
read, print, commit or copy it into browser storage.

To restore manual unlock, set `TDN_OWNER_API_LOCAL_TEST='false'` (or unset it),
restore the existing private `TDN_OWNER_API_TOKEN` configuration, and restart
the operator through the approved activation procedure. An already running
process does not change mode merely because another shell exports the flag.
See [scope and acceptance](../tasks/local-owner-testing.md).

### Content Studio AI (optional, Task 049)

AI is off unless both CLIProxy variables are exported in the same private shell, like the OWNER token:

```bash
export TDN_CLIPROXY_BASE_URL='http://127.0.0.1:8317'
export TDN_CLIPROXY_API_KEY='<cliproxy-client-api-key>'
```

- Both unset: the operator starts with AI disabled; `GET /api/content/ai/status` reports `"configured": false`.
- Exactly one set: startup fails. Set both or unset both.
- The base URL must be exactly `http://127.0.0.1:<port>` or `http://[::1]:<port>` (optional trailing `/`). `localhost`, other hosts, `https`, paths, queries and user info are rejected. The key must be 1–512 printable ASCII characters with no whitespace; it is never logged, returned or stored.
- Where the key is kept persistently on Fedora (for example a systemd `EnvironmentFile=` outside the repository, mode 600) is decided in Task 053. Until then, never write it into `.env` or any repository file.
- Task 049 makes no real provider call. The first real call needs its own owner authorization (Task 053).

### Market video watch (optional, flag `TDN_RESEARCH_VIDEO_WATCH_ENABLED`)

Off unless `TDN_RESEARCH_VIDEO_WATCH_ENABLED=1` exactly. Off means no download, no model call, no new capture or step field, and byte-identical reports. When on, the collection step reads up to 10 exact public TikTok video links already stored for the run (selection videos first, then the stored TikTok search rows; spread round-robin across accounts before the cap) and stores one automated reading per video. Market section 9 shows at most 5 videos, 3 segments of at most 30 words each, labelled "ghi lại tự động từ video, chưa xác minh". Replay and revision re-read the stored readings and never download or call the model again.

```bash
export TDN_RESEARCH_VIDEO_WATCH_ENABLED=1
export TDN_RESEARCH_VIDEO_MEDIA_DIR='/srv/tdn/video-media'      # absolute path; media kept 45 days, then swept
export TDN_RESEARCH_VIDEO_WATCH_MODEL='gemini-<model-id>'      # plain gemini-* id, no "/"
export TDN_RESEARCH_YTDLP_BIN='/usr/local/bin/yt-dlp'
export TDN_RESEARCH_FFPROBE_BIN='/usr/bin/ffprobe'              # optional, default ffprobe
```

- The model call uses the existing CLIProxy settings (`TDN_CLIPROXY_BASE_URL`, `TDN_CLIPROXY_API_KEY`, above); there is no separate model key. Without CLIProxy each video is recorded `VIDEO_MODEL_NOT_CONFIGURED` and the run continues.
- A missing or invalid media dir, model id or yt-dlp path fails at startup with the setting name only.
- Media: mp4 or webm with a video stream (photo posts are skipped as `NOT_A_VIDEO`), short side at most 720 (then 480), at most 14 MB and 180 seconds; one inline request per video, 180 s timeout, at most one retry on timeout/429/5xx and one more call when the answer fails the strict check. Captures keep only digests of the video, never its bytes or the key.
- Retention: a run folder created by the app holds a `.video-watch-run` marker; media in it is deleted 45 days after download even when the download ledger is missing or broken. Folders without the marker keep the ledger-only rule.

### Market UN Comtrade (optional, flag `TDN_RESEARCH_COMTRADE_ENABLED`)

Off unless `TDN_RESEARCH_COMTRADE_ENABLED=1` exactly. Off means no request, no model call, no new capture or step field, and byte-identical reports. When on, the collection step estimates one HS6 code for the product with the Insight coding CLIProxy model already configured for the operator (no separate key), confirms it against the official description, then makes at most 4 public data calls (at least 6 s apart; one 65 s wait and one repeat after a rate limit). Market section 6 shows the whole-country figures as background only, never combined with sample numbers. No key is needed; an unconfirmed code prints a plain sentence and no numbers. Without CLIProxy the step is recorded `MODEL_NOT_CONFIGURED` and the run continues.

### Market public search-ads library (optional, flag `TDN_RESEARCH_GOOGLE_ADS_ENABLED`)

Off unless `TDN_RESEARCH_GOOGLE_ADS_ENABLED=1` exactly. Off means no request, no new capture, step field or usage row, and byte-identical reports. When on (and `TDN_SERPAPI_API_KEY` is configured), the collection step takes the top 3 distinct brands of the auto-run pick, picks each brand's own website host from the run's plain web rows, and makes at most 3 paid calls (at least 2 s apart, no retries) that count public search ads for that host. Market section 7 shows table 7.3 with counts, formats and dates only; advertiser names, ids, images, links and ad ids stay in raw captures and never enter the step document or reports. Runs without an auto-run pick, or brands without one unambiguous website host, print a plain sentence and make no call for them. Usage is recorded at ordinal 10 under the existing SerpApi provider.
### Market Cục Thống kê (optional, flag `TDN_RESEARCH_OFFICIAL_STATS_ENABLED`)

Off unless `TDN_RESEARCH_OFFICIAL_STATS_ENABLED=1` exactly. Off means no request, no model call, no new capture, usage row or step field, and byte-identical reports. When on, the collection step asks the configured Insight CLIProxy model to pick one retail category group for the product and confirms the pick (each answer retried once), then makes at most 3 public GET requests to nso.gov.vn, at least 2 s apart: the monthly statistics listing, the newest Vietnamese monthly workbook, and the national CPI workbook only when the monthly CPI table could not be read. No key is needed. The workbook is read by `scripts/read-official-stats-sheet.py`, so **python3 must be installed on the server**; without it the step is recorded `READER_UNAVAILABLE` and the run continues. Only pinned header layouts are read; an unknown layout is `LAYOUT_UNKNOWN` for that table only. Market section 5 table 5.4 shows the whole-country figures as background only, never combined with sample numbers. Statuses: `OK`, `PARTIAL`, `NO_DATA`, `LAYOUT_UNKNOWN`, `LIST_FAILED`, `NO_MONTHLY_WORKBOOK`, `DOWNLOAD_FAILED`, `READER_UNAVAILABLE`, `CATEGORY_NOT_MAPPED`, `MODEL_NOT_CONFIGURED`, `CANCELLED`, `FAILED`.

### One executor per database

An operator started with `TDN_OWNER_API_ENABLED='true'` is the **executor**. Only one executor may use a database at a time. At startup it creates `<canonical database path>.executor.lock` next to the database (the path after resolving symbolic links) and removes it on an orderly stop (Ctrl-C / `SIGTERM`). Before serving, the executor marks any AI attempt left `running` by an earlier process as `interrupted` (`interrupted_by_restart`). Nothing is retried automatically.

Read-only operators (`TDN_OWNER_API_ENABLED='false'`) take no lock and never change attempt rows, so they can run alongside an executor.

Any existing lock file stops executor startup with `Another operator executor may own this database (...)`, including a lock left by a killed process. The operator never deletes or overwrites a lock by itself. Hard-linked database files are rejected.

**Manual stale-lock recovery** (only when you are sure no executor is running):

1. Stop every operator executor, starter and supervisor that uses this database, on every host that can see the file.
2. Confirm nothing is running: `pgrep -af 'serve-operator-app'` shows no executor for this database.
3. Resolve the exact pair: `realpath "$TDN_WORKSPACE_DB"`; the lock is that path plus `.executor.lock`. Read it (`cat`): the `pid`, `hostname` and `startedAt` must belong to a process that is confirmed stopped.
4. If the lock names another host, or ownership is uncertain, stop here and resolve ownership first.
5. Remove only that confirmed lock: `rm -- "$(realpath "$TDN_WORKSPACE_DB").executor.lock"`.
6. Start exactly one executor. Its startup sweep marks the abandoned attempts `interrupted`.

## 4. Start and verify

```bash
npm run operator-app:start
```

The default canonical origin is <http://127.0.0.1:8787>. In another local shell:

```bash
curl --fail --silent --show-error 'http://127.0.0.1:8787/healthz'
```

Expected shape:

```json
{"status":"ok","version":"<application-version>","ownerWritesEnabled":false}
```

The boolean is `true` only for the enabled example. Also open <http://127.0.0.1:8787> in the same Fedora host's browser.

- The normal URL uses persisted data and does not fall back to synthetic data.
- `http://127.0.0.1:8787/?mode=demo` is explicitly labelled synthetic demo state; its changes stay in browser memory and do not prove persisted behavior.

Stop in the server terminal with **Ctrl-C**. `SIGINT` and `SIGTERM` trigger orderly closure of the HTTP server and database applications; wait for process exit before moving or backing up files.

## Troubleshooting

- Startup requires both the migrated database and artifact root, plus a completed `frontend/dist` build.
- `Database schema is at v<n>; apply migrations up to v<head>`: run the migration step in §2 against the same database, then start again.
- `Another operator executor may own this database`: another executor is running, or an earlier one was killed. Follow the manual stale-lock recovery above; never delete the lock while an executor may be running.
- `OWNER writes are disabled`/HTTP 403 is expected in disabled mode.
- Port conflict: stop the other local process or choose a placeholder loopback port and use that exact origin consistently.
- Configuration rejects non-loopback hosts, malformed ports, weak enabled-mode tokens, and missing actor IDs.
- Health confirms process/configuration state, not correctness of business data or every B3–B10 operation.

## Deliberately future work

Systemd units, reverse proxies, TLS, remote access, multi-user/production authentication, LAN/internet exposure, backup/restore procedures, and deployment operations are not part of this local runbook or Task 045.

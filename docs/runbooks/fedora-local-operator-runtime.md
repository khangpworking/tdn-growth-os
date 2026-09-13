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
- `OWNER writes are disabled`/HTTP 403 is expected in disabled mode.
- Port conflict: stop the other local process or choose a placeholder loopback port and use that exact origin consistently.
- Configuration rejects non-loopback hosts, malformed ports, weak enabled-mode tokens, and missing actor IDs.
- Health confirms process/configuration state, not correctness of business data or every B3–B10 operation.

## Deliberately future work

Systemd units, reverse proxies, TLS, remote access, multi-user/production authentication, LAN/internet exposure, backup/restore procedures, and deployment operations are not part of this local runbook or Task 045.

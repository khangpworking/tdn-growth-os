#!/usr/bin/env bash
# Kalodata replay test instance (Fedora). Starts a SEPARATE operator app whose sales-data
# requests are answered from the stored captures of one earlier run: zero Kalodata points.
#
# Usage:
#   scripts/replay-test-instance.sh --checkout <dir> --source-run <run-uuid> [options]
#
# Options:
#   --checkout DIR        checkout to run (must contain this replay code, node_modules and frontend/dist)
#   --source-run UUID     DRAFT_READY run whose sales-data captures are replayed
#   --prod-db PATH        production SQLite file to copy (read-only online backup)
#                         default: $HOME/.local/state/tdn-growth-os/operator-dev-8787-ab099f3/tdn-growth-os-dev.sqlite
#   --prod-artifacts DIR  production artifact root to copy; default: TDN_ARTIFACT_ROOT of the running 8787
#                         process (read from /proc/<pid>/environ), else required
#   --env-file FILE       read non-secret settings from this file (KEY=VALUE lines) instead of the 8787 process
#   --test-setting K=V    repeatable numeric override: TDN_RESEARCH_AUTORUN_TEST_REVIEWS (0/1),
#                         TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT (1..50),
#                         TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD (positive, at most 10000)
#   --port N              test port, default 8797 (8787 is refused)
#   --node-bin DIR        node 24 bin dir; default $HOME/.nanobot/workspace/.toolchains/node-v24.15.0-linux-x64/bin
#   --copy-artifacts      accepted for compatibility; artifacts are always independent copies
#
# Assumptions (decided, see docs/runbooks/fedora-local-operator-runtime.md "Kalodata replay test instance"):
#   * The production state dir is only READ: online SQLite backup + independent artifact copies.
#     No destination file or symlink shares a writable production target.
#   * Settings for other providers (SerpApi, CLIProxy, flags) are inherited from the running 8787
#     process so they behave as in production. Never inherited: the Kalodata key, the OWNER token,
#     DB/artifact/port/host settings, R2 mirroring. Paths that point into the production state dir
#     (video media, Metric captures) are redirected into the test dir.
#   * Only TDN_* settings are inherited, so a lane whose key has another name is left off here:
#     TDN_RESEARCH_JEV_ENABLED (needs TYPESAFE_API_KEY; the app refuses to start without it).
#     PDF cloud reading has no PAGEINDEX_API_KEY either, so it reads nothing and the production
#     balance ledger is never touched.
#   * OWNER access uses the local-test mode (TDN_OWNER_API_LOCAL_TEST=true) on 127.0.0.1 only.
#   * Paid non-sales-data providers (SerpApi, Apify, model calls) still spend as normal.
set -euo pipefail
umask 077

die() { printf 'replay-test-instance: %s\n' "$*" >&2; exit 1; }

PROD_STATE_SEGMENT='operator-dev-8787-ab099f3'
CHECKOUT='' SOURCE_RUN='' ENV_FILE='' PORT=8797
PROD_DB="$HOME/.local/state/tdn-growth-os/$PROD_STATE_SEGMENT/tdn-growth-os-dev.sqlite"
PROD_ARTIFACTS=''
NODE_BIN="$HOME/.nanobot/workspace/.toolchains/node-v24.15.0-linux-x64/bin"
TEST_SETTINGS=()

# Validate before reading any settings or touching production. Numeric forms only:
# no credentials, paths, substitutions, whitespace or long secret-like strings.
add_test_setting() {
  local entry="$1" key="${1%%=*}" value="${1#*=}" whole
  [[ "$entry" == *=* ]] || die '--test-setting requires KEY=VALUE'
  case "$key" in
    TDN_RESEARCH_AUTORUN_TEST_REVIEWS)
      [[ "$value" =~ ^[01]$ ]] || die 'invalid test flag' ;;
    TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT)
      [[ "$value" =~ ^[1-9][0-9]?$ ]] && [ "$value" -le 50 ] || die 'test review cap must be 1..50' ;;
    TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD)
      [[ "$value" =~ ^(0|[1-9][0-9]{0,4})(\.[0-9]{1,6})?$ ]] && [[ "$value" =~ [1-9] ]] || die 'invalid test charge cap'
      whole="${value%%.*}"
      [ "$whole" -lt 10000 ] || { [ "$whole" -eq 10000 ] && [[ "$value" =~ ^10000(\.0+)?$ ]]; } || die 'test charge cap exceeds 10000' ;;
    *) die 'test setting key is not allow-listed' ;;
  esac
  TEST_SETTINGS+=("$key=$value")
}

while [ $# -gt 0 ]; do
  case "$1" in
    --checkout) CHECKOUT="$2"; shift 2 ;;
    --source-run) SOURCE_RUN="$2"; shift 2 ;;
    --prod-db) PROD_DB="$2"; shift 2 ;;
    --prod-artifacts) PROD_ARTIFACTS="$2"; shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --test-setting) [ $# -ge 2 ] || die '--test-setting requires KEY=VALUE'; add_test_setting "$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --node-bin) NODE_BIN="$2"; shift 2 ;;
    --copy-artifacts) shift ;;
    -h|--help) sed -n '2,33p' "$0"; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

[ -n "$CHECKOUT" ] || die '--checkout is required'
[ -n "$SOURCE_RUN" ] || die '--source-run is required'
[[ "$SOURCE_RUN" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$ ]] || die '--source-run must be a run UUID'
[[ "$PORT" =~ ^[1-9][0-9]{0,4}$ ]] || die '--port must be an integer'
[ "$PORT" != 8787 ] || die 'port 8787 is production; refused'
[ "$PORT" -le 65535 ] || die '--port must be at most 65535'
CHECKOUT="$(cd "$CHECKOUT" && pwd)"
[ -f "$CHECKOUT/src/modules/analysis/research-automation/kalodata-replay.ts" ] || die 'checkout has no replay mode (kalodata-replay.ts missing)'
[ -d "$CHECKOUT/node_modules" ] || die 'checkout has no node_modules (run npm ci there first)'
[ -f "$CHECKOUT/frontend/dist/index.html" ] || die 'checkout has no frontend/dist (run npm run frontend:build there first)'
[ -f "$PROD_DB" ] || die "production database not found: $PROD_DB"
export PATH="$NODE_BIN:$PATH"
node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 24 ? 0 : 1)' || die 'node 24 is required (--node-bin)'
if ss -ltn "sport = :$PORT" 2>/dev/null | grep -q LISTEN; then die "port $PORT is already in use"; fi

# Settings source: --env-file, else the running production process (read only).
PROD_ENV="$(mktemp)"; trap 'rm -f "$PROD_ENV"' EXIT
if [ -n "$ENV_FILE" ]; then
  grep -E '^[A-Z0-9_]+=' "$ENV_FILE" > "$PROD_ENV" || true
else
  PROD_PID="$(ss -ltnpH 'sport = :8787' 2>/dev/null | sed -n 's/.*pid=\([0-9]*\).*/\1/p' | head -n1)"
  if [ -n "$PROD_PID" ] && [ -r "/proc/$PROD_PID/environ" ]; then
    tr '\0' '\n' < "/proc/$PROD_PID/environ" | grep -E '^TDN_[A-Z0-9_]+=' > "$PROD_ENV" || true
  else
    printf 'replay-test-instance: no readable 8787 process; only the replay flag and defaults are set\n' >&2
  fi
fi
prod_value() { sed -n "s/^$1=//p" "$PROD_ENV" | head -n1; }
[ -n "$PROD_ARTIFACTS" ] || PROD_ARTIFACTS="$(prod_value TDN_ARTIFACT_ROOT)"
[ -n "$PROD_ARTIFACTS" ] || die '--prod-artifacts is required (could not read TDN_ARTIFACT_ROOT from the 8787 process)'
[ -d "$PROD_ARTIFACTS" ] || die "artifact root not found: $PROD_ARTIFACTS"
ACTOR_ID="$(prod_value TDN_OWNER_API_ACTOR_ID)"
[ -n "$ACTOR_ID" ] || ACTOR_ID='owner:replay-test'

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
# Never reuse a timestamp directory or follow a pre-existing link into production.
if [ ! -e /tmp/tdn-replay ] && [ ! -L /tmp/tdn-replay ]; then mkdir -m 700 /tmp/tdn-replay; fi
[ ! -L /tmp/tdn-replay ] && [ -d /tmp/tdn-replay ] || die 'unsafe replay parent'
[ "$(realpath /tmp/tdn-replay)" = /tmp/tdn-replay ] || die 'replay parent must be canonical'
[ "$(stat -c %u /tmp/tdn-replay)" = "$(id -u)" ] && [ "$(stat -c %a /tmp/tdn-replay)" = 700 ] || die 'replay parent must be owner-only'
DIR="$(mktemp -d "/tmp/tdn-replay/$STAMP.XXXXXX")"
DB="$DIR/tdn-growth-os-replay.sqlite"
ART="$DIR/artifacts"

echo "== online backup of the production database (read only) -> $DB"
(cd "$CHECKOUT" && node -e '
  const Database = require("better-sqlite3");
  const [source, target] = process.argv.slice(1);
  const db = new Database(source, { readonly: true, fileMustExist: true });
  db.backup(target).then(() => { db.close(); }, (error) => { db.close(); console.error("backup failed:", error.message); process.exit(1); });
' "$PROD_DB" "$DB")
chmod 600 "$DB"

echo "== artifacts -> $ART"
# Dereference source links into independent files. Reflinks are copy-on-write;
# unlike hard links, even an in-place destination write cannot modify production.
mkdir "$ART"
cp -aL --reflink=auto "$PROD_ARTIFACTS/." "$ART/"

echo "== migrate the copy (no-op unless the checkout adds migrations)"
(cd "$CHECKOUT" && npm run --silent db:migrate -- "$DB")

echo "== check the copy: source run + no queued work the test worker would pick up"
(cd "$CHECKOUT" && node -e '
  const Database = require("better-sqlite3");
  const [file, runId] = process.argv.slice(1);
  const db = new Database(file, { readonly: true, fileMustExist: true });
  const run = db.prepare("SELECT status FROM analysis_research_automation_runs WHERE run_id=?").get(runId);
  if (!run) { console.error("source run not found in the copy"); process.exit(1); }
  const n = db.prepare("SELECT COUNT(*) n FROM analysis_research_automation_captures WHERE run_id=? AND provider=?").get(runId, "kalodata").n;
  if (n < 1) { console.error("source run has no stored sales-data captures"); process.exit(1); }
  console.log("   source run status=" + run.status + " sales-data captures=" + n);
  // The copied worker would resume these with live non-sales-data providers (paid calls).
  const runs = db.prepare("SELECT COUNT(*) n FROM analysis_research_automation_runs WHERE status IN (?,?,?,?,?,?)")
    .get("QUICK_SEARCH_QUEUED", "QUICK_SEARCH_RUNNING", "COLLECTION_QUEUED", "COLLECTING", "RENDERING", "CANCELLING").n;
  const attempts = db.prepare("SELECT COUNT(*) n FROM analysis_research_automation_attempts WHERE state IN (?,?)").get("QUEUED", "RUNNING").n;
  const autoruns = db.prepare("SELECT COUNT(*) n FROM research_automation_autorun WHERE phase NOT IN (?,?) AND phase_state IN (?,?)")
    .get("DONE", "STOPPED", "QUEUED", "RUNNING").n;
  db.close();
  if (runs > 0 || attempts > 0 || autoruns > 0) { console.error("copy has queued/running work (runs=" + runs + ", attempts=" + attempts + ", autoruns=" + autoruns + "); refused. Re-run after the source queues are idle."); process.exit(1); }
' "$DB" "$SOURCE_RUN")

# Child environment: start from an empty TDN_* set, add safe inherited settings, then the test-only ones.
CHILD_ENV=()
while IFS= read -r line; do
  key="${line%%=*}"; value="${line#*=}"
  [[ "$key" =~ ^TDN_[A-Z0-9_]+$ ]] || continue
  case "$key" in
    TDN_KALODATA_SECRET_KEY|TDN_OWNER_API_TOKEN|TDN_WORKSPACE_DB|TDN_ARTIFACT_ROOT|TDN_OPERATOR_APP_PORT|TDN_OPERATOR_APP_HOST|\
    TDN_OWNER_API_ENABLED|TDN_OWNER_API_LOCAL_TEST|TDN_OWNER_API_ACTOR_ID|TDN_R2_*|TDN_RESEARCH_KALODATA_REPLAY_SOURCE_RUN_ID) continue ;;
    TDN_RESEARCH_VIDEO_MEDIA_DIR) mkdir -p "$DIR/video-media"; CHILD_ENV+=("$key=$DIR/video-media"); continue ;;
    TDN_METRIC_CAPTURE_DIR) mkdir -p "$DIR/metric-captures"; CHILD_ENV+=("$key=$DIR/metric-captures"); continue ;;
    # Its key (TYPESAFE_API_KEY) is not a TDN_* setting and is never inherited; on without it the app does not start.
    TDN_RESEARCH_JEV_ENABLED) printf 'replay-test-instance: left %s off (its key is not passed to the test instance)\n' "$key" >&2; continue ;;
  esac
  case "$value" in *"$PROD_STATE_SEGMENT"*) printf 'replay-test-instance: dropped %s (points into the production state dir)\n' "$key" >&2; continue ;; esac
  CHILD_ENV+=("$key=$value")
done < "$PROD_ENV"
CHILD_ENV+=("${TEST_SETTINGS[@]}")
CHILD_ENV+=(
  "TDN_WORKSPACE_DB=$DB" "TDN_ARTIFACT_ROOT=$ART" "TDN_OPERATOR_APP_HOST=127.0.0.1" "TDN_OPERATOR_APP_PORT=$PORT"
  "TDN_OWNER_API_ENABLED=true" "TDN_OWNER_API_LOCAL_TEST=true" "TDN_OWNER_API_ACTOR_ID=$ACTOR_ID" "TDN_R2_ENABLED=false"
  "TDN_RESEARCH_KALODATA_REPLAY_SOURCE_RUN_ID=$SOURCE_RUN"
)

echo "== start the replay instance on 127.0.0.1:$PORT"
# env -i: nothing from this shell (or the production process) leaks in except the list above.
# exec chain (subshell -> env -> nohup -> node): $! is the server process itself, so the printed stop command stops it.
(cd "$CHECKOUT" && exec env -i HOME="$HOME" USER="${USER:-}" LANG="${LANG:-C.UTF-8}" PATH="$PATH" "${CHILD_ENV[@]}" \
  nohup node --import tsx scripts/serve-operator-app.ts > "$DIR/server.log" 2>&1) &
SERVER_PID=$!
echo "$SERVER_PID" > "$DIR/server.pid"
stop_server() { kill "$SERVER_PID" 2>/dev/null || true; wait "$SERVER_PID" 2>/dev/null || true; }
listening=0
for _ in $(seq 1 60); do
  grep -q 'Operator app listening' "$DIR/server.log" 2>/dev/null && { listening=1; break; }
  kill -0 "$SERVER_PID" 2>/dev/null || { cat "$DIR/server.log" >&2; die 'server exited during startup'; }
  sleep 1
done
[ "$listening" = 1 ] || { stop_server; cat "$DIR/server.log" >&2; die 'server did not start within 60s; stopped it'; }
grep -q "KALODATA REPLAY MODE source=$SOURCE_RUN" "$DIR/server.log" || { stop_server; cat "$DIR/server.log" >&2; die 'replay mode line not logged; stopped the server'; }

# Helper that starts a Market run with the source run's exact keyword and period (the only scope replay accepts).
# .mts: the test dir has no package.json, so tsx would compile a .ts file as CommonJS and reject top-level await.
cat > "$DIR/start-market.mts" <<EOF_HELPER
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
// Resolve the driver from the checkout (this helper lives in the test dir).
const BetterSqlite3 = createRequire('$CHECKOUT/package.json')('better-sqlite3') as typeof import('better-sqlite3');
const origin = 'http://127.0.0.1:$PORT';
const db = new BetterSqlite3('$DB', { readonly: true, fileMustExist: true });
const run = db.prepare('SELECT workspace_id ws, mode, keyword, period_start s, period_end e FROM analysis_research_automation_runs WHERE run_id=?').get('$SOURCE_RUN') as
  { ws: string; mode: string; keyword: string; s: string; e: string };
db.close();
const session = await fetch(origin + '/owner-api/local-test-session', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
if (!session.ok) throw new Error('local test session failed: ' + session.status);
const { token } = await session.json() as { token: string };
const response = await fetch(origin + '/owner-api/workspaces/' + run.ws + '/research-automation/runs', { method: 'POST',
  headers: { Origin: origin, 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: run.mode, keyword: run.keyword,
    requestedPeriod: { startDate: run.s, endDate: run.e }, reports: ['MARKET'] }) });
console.log(response.status, await response.text());
EOF_HELPER

cat <<EOF_DONE

Replay test instance is running (pid $(cat "$DIR/server.pid")), state in $DIR
  log:    $DIR/server.log   (expects "KALODATA REPLAY MODE source=$SOURCE_RUN")
  open:   ssh -L $PORT:127.0.0.1:$PORT <fedora>   then http://127.0.0.1:$PORT/

Start a Market run (same keyword + period as the source run; anything else is refused with
kalodata_replay_scope_mismatch):
  cd '$CHECKOUT' && PATH='$NODE_BIN':\$PATH node --import tsx '$DIR/start-market.mts'
With the Market auto-runner inherited (TDN_METRIC_OPENCLI_ENABLED), the run reads Metric live and then
confirms itself; that needs the browser extension connected to the opencli daemon, otherwise it stops
with BRIDGE_DISCONNECTED (reconnect, then "Thử lại"). Without the auto-runner, confirm the scope in the
UI and pick the SAME products as the source run. A product without stored data shows
"Bản chạy thử: không có dữ liệu bán hàng đã lưu ..." (KALODATA_REPLAY_MISS).

Stop:   kill \$(cat '$DIR/server.pid')
Clean:  rm -rf '$DIR'
EOF_DONE

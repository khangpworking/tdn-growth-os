#!/usr/bin/env bash
# Pin the live Shopee lane as stable, or roll the live lane back to the stable pin (RELEASES.md).
set -euo pipefail

LIVE="$HOME/lanes/shopee-live"
STABLE="$HOME/lanes/shopee-stable"
STATE="$HOME/.local/state/tdn-shopee-modules"
LATEST="$STATE/app-latest.json"
STABLE_JSON="$STATE/app-stable.json"
RUNS="$STATE/runs"

usage() {
  cat <<'EOF'
Usage: shopee-stable.sh status | pin <tag> | rollback | --help

status    Show the live target, the stable target, app-latest.json and app-stable.json.
pin TAG   Pin the live installation as stable. TAG is app-vX.Y.Z.
          The live VERSION must equal X.Y.Z. This command does not change live.
rollback  Point live at the stable installation. Set app-latest.json to the stable version.
          The command stops if no pin exists or if a run is active. Runs stay in place.
EOF
}

die() { echo "shopee-stable: $*" >&2; exit 1; }

target_of() { if [ -L "$1" ]; then readlink -f "$1"; else echo "(none)"; fi; }

now_utc() { date -u +%Y-%m-%dT%H:%M:%SZ; }

# Write stdin to $1 through a temp file in the same folder, then rename it.
write_atomic() {
  local tmp
  tmp="$(mktemp "$1.tmp.XXXXXX")"
  cat > "$tmp"
  mv -f "$tmp" "$1"
}

# Point symlink $1 at $2 atomically.
link_atomic() {
  local tmp="$1.tmp.$$"
  ln -sfn "$2" "$tmp"
  mv -T "$tmp" "$1"
}

json_field() { # file field
  python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))[sys.argv[2]])' "$1" "$2"
}

run_active() {
  if pgrep -af "candidate/installation" | grep -qE "shopee_flow.py|capture-metric-preset|shopee-cli.py"; then
    return 0
  fi
  if [ -d "$RUNS" ] && grep -lsE '"status"[[:space:]]*:[[:space:]]*"RUNNING"' "$RUNS"/*/state.json > /dev/null; then
    return 0
  fi
  return 1
}

cmd_status() {
  echo "live:   $(target_of "$LIVE")"
  echo "stable: $(target_of "$STABLE")"
  if [ -f "$LATEST" ]; then echo "app-latest.json: $(cat "$LATEST")"; else echo "app-latest.json: (none)"; fi
  if [ -f "$STABLE_JSON" ]; then echo "app-stable.json: $(cat "$STABLE_JSON")"; else echo "app-stable.json: (none)"; fi
}

cmd_pin() {
  local tag="${1:-}"
  [[ "$tag" =~ ^app-v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || die "tag must be app-vX.Y.Z, got '$tag'"
  local version="${tag#app-v}"
  [ -L "$LIVE" ] || die "$LIVE is not a symlink"
  local lane
  lane="$(readlink -f "$LIVE")"
  local vfile="$lane/source/tools/shopee-desktop/VERSION"
  [ -f "$vfile" ] || die "no VERSION file at $vfile"
  local live_version
  live_version="$(tr -d '\r\n' < "$vfile")"
  [ "$live_version" = "$version" ] || die "live VERSION is $live_version, not $version; pin refused"
  mkdir -p "$STATE"
  link_atomic "$STABLE" "$lane"
  printf '{"version":"%s","tag":"%s","lane":"%s","pinnedAt":"%s"}\n' \
    "$version" "$tag" "$lane" "$(now_utc)" | write_atomic "$STABLE_JSON"
  echo "pinned $tag: $STABLE -> $lane"
  echo "app-stable.json: $(cat "$STABLE_JSON")"
}

cmd_rollback() {
  [ -f "$STABLE_JSON" ] || die "no stable pin ($STABLE_JSON missing); rollback refused"
  [ -L "$STABLE" ] || die "no stable link ($STABLE missing); rollback refused"
  if run_active; then die "a run is active; rollback refused"; fi
  local version stable_lane old_live
  version="$(json_field "$STABLE_JSON" version)"
  stable_lane="$(readlink -f "$STABLE")"
  [ -d "$stable_lane" ] || die "stable target $stable_lane does not exist; rollback refused"
  old_live="$(target_of "$LIVE")"
  printf '%s\n%s\n' "$old_live" "$(now_utc)" | write_atomic "$LIVE.before-rollback"
  link_atomic "$LIVE" "$stable_lane"
  if [ -f "$LATEST" ]; then cp -p "$LATEST" "$LATEST.before-rollback"; fi
  printf '{"version":"%s"}\n' "$version" | write_atomic "$LATEST"
  echo "live: $old_live -> $stable_lane"
  echo "saved old live target in $LIVE.before-rollback"
  echo "app-latest.json: $(cat "$LATEST")"
}

case "${1:-}" in
  status) cmd_status ;;
  pin) shift; cmd_pin "${1:-}" ;;
  rollback) cmd_rollback ;;
  -h|--help|help) usage ;;
  *) usage >&2; exit 2 ;;
esac

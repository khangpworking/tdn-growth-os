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

# Return 0 if a run is active, 1 if no run is active, 2 if the check cannot complete.
run_active() {
  local procs rc=0
  procs="$(pgrep -af "candidate/installation")" || rc=$?
  [ "$rc" -le 1 ] || return 2
  if printf '%s\n' "$procs" | grep -qE "shopee_flow.py|capture-metric-preset|shopee-cli.py"; then
    return 0
  fi
  local files=() list broken
  if [ -e "$RUNS" ] || [ -L "$RUNS" ]; then   # a broken link to the runs folder is checked (and refused) too
    # An unreadable runs tree must not look like "no run".
    [ -d "$RUNS" ] && [ -r "$RUNS" ] && [ -x "$RUNS" ] || return 2
    # -L follows a linked runs root and linked run folders; a broken link makes find fail (refuse).
    list="$(find -L "$RUNS" -mindepth 2 -maxdepth 2 -name state.json)" || return 2
    # With -L, -type l matches only a broken link: a run folder we cannot reach is not "no run".
    broken="$(find -L "$RUNS" -mindepth 1 -maxdepth 1 -type l)" || return 2
    [ -z "$broken" ] || return 2
    [ -z "$list" ] || mapfile -t files <<< "$list"
  fi
  if [ "${#files[@]}" -gt 0 ]; then
    rc=0
    grep -qE '"status"[[:space:]]*:[[:space:]]*"RUNNING"' "${files[@]}" || rc=$?
    [ "$rc" -ne 0 ] || return 0
    [ "$rc" -eq 1 ] || return 2
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
  # Keep the previous pin, so a pin that stops halfway can be undone by hand (RELEASES.md).
  if [ -f "$STABLE_JSON" ]; then cp -p "$STABLE_JSON" "$STABLE_JSON.prev"; fi
  if [ -L "$STABLE" ]; then readlink -f "$STABLE" | write_atomic "$STATE/app-stable.prev-lane"; fi
  # The record goes first. Rollback refuses if the link does not match the record.
  printf '{"version":"%s","tag":"%s","lane":"%s","pinnedAt":"%s"}\n' \
    "$version" "$tag" "$lane" "$(now_utc)" | write_atomic "$STABLE_JSON"
  link_atomic "$STABLE" "$lane"
  echo "pinned $tag: $STABLE -> $lane"
  echo "app-stable.json: $(cat "$STABLE_JSON")"
}

cmd_rollback() {
  [ -f "$STABLE_JSON" ] || die "no stable pin ($STABLE_JSON missing); rollback refused"
  [ -L "$STABLE" ] || die "no stable link ($STABLE missing); rollback refused"
  local active=0
  run_active || active=$?
  [ "$active" -ne 0 ] || die "a run is active; rollback refused"
  [ "$active" -eq 1 ] || die "cannot check for active runs; rollback refused"
  local version json_lane stable_lane old_live lane_version
  version="$(json_field "$STABLE_JSON" version)"
  json_lane="$(json_field "$STABLE_JSON" lane)"
  stable_lane="$(readlink -f "$STABLE")"
  [ -d "$stable_lane" ] || die "stable target $stable_lane does not exist; rollback refused"
  [ "$stable_lane" = "$json_lane" ] || die "stable link $stable_lane does not match app-stable.json lane $json_lane; rollback refused"
  lane_version="$(tr -d '\r\n' < "$stable_lane/source/tools/shopee-desktop/VERSION")" \
    || die "cannot read VERSION in $stable_lane; rollback refused"
  [ "$lane_version" = "$version" ] || die "stable lane VERSION is $lane_version, not $version; rollback refused"
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

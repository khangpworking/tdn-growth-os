#!/usr/bin/env bash
# Classify the changed paths of a CI run as docs-only or full.
#
# Input: NUL-delimited repository paths on stdin, for example from
#   git diff --name-only --no-renames -z BASE...HEAD
# Output: one word on stdout, "docs" or "full".
#
# Every path must match the docs allowlist for the result to be "docs".
# An empty input gives "full". Exclusions take precedence over the allowlist,
# because code and tests read those documents.
set -u

count=0
mode=docs

classify() {
  case "$1" in
    # Exclusions: these documents are executable or tested inputs.
    docs/research/*) return 1 ;;
    docs/tasks/research-literal-review-coding-v1.md) return 1 ;;
    docs/runbooks/metric-opencli.md) return 1 ;;
    # Allowlist. In a case pattern, * also matches "/", so docs/*.md
    # covers direct children of docs/ and all nested Markdown files.
    README.md|INTENT.md) return 0 ;;
    docs/*.md) return 0 ;;
    *) return 1 ;;
  esac
}

while IFS= read -r -d '' path || [[ -n "$path" ]]; do
  count=$((count + 1))
  if ! classify "$path"; then
    mode=full
  fi
done

if [[ "$count" -eq 0 ]]; then
  mode=full
fi

printf '%s\n' "$mode"

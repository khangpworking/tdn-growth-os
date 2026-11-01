#!/usr/bin/env bash
# Draft a claim catalogue from a catalogue packet written by `claim_catalogue_packet` (IM-Q164, open question 37).
# Usage: draft_catalogue.sh <packet dir>
# Runs one Claude Sonnet 5.5 session with read-only tools in <packet dir>/draft.d, which holds only copies of
# reviews.jsonl and prompt-draft.md, and writes the reply to <packet dir>/draft.out. It submits nothing: an agent reads
# the JSON object in draft.out and sends it to the MCP's catalogue submit tool, which checks it.
# This is a paid run started by a person. The MCP, the tests and CI never run it.
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then
  echo "usage: draft_catalogue.sh <packet dir>" >&2
  exit 2
fi
PACKET="$(cd "$1" && pwd)"
for file in reviews.jsonl prompt-draft.md; do
  [ -f "$PACKET/$file" ] || { echo "missing $file in the packet dir" >&2; exit 2; }
done

mkdir "$PACKET/draft.d"
cp "$PACKET/reviews.jsonl" "$PACKET/prompt-draft.md" "$PACKET/draft.d/"
( cd "$PACKET/draft.d" && claude -p --model claude-sonnet-5-5 --strict-mcp-config --allowedTools "Read Glob Grep" --no-session-persistence < prompt-draft.md > "$PACKET/draft.out" )
echo "draft written to $PACKET/draft.out"

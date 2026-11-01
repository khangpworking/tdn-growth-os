#!/usr/bin/env bash
# Two-grader cross-check of a claim packet written by `claim_grading_packet` (R-IM13, IM-Q134).
# Usage: cross_grade.sh <packet dir>
# Round 1: Astra and Opus 5.5 grade in parallel, each in its own new working directory that holds only copies of
# catalogue.json, sample.jsonl, dup-groups.json and prompt-r1.md. Then `crosscheck.py diff` numbers the differences
# and writes one round 2 prompt per grader. Round 2: each grader decides, per difference, to keep its value or take the
# other's. Outputs: r1-astra.out, r1-opus.out, r2-astra.out, r2-opus.out in the packet dir; then call the MCP tool
# record_claim_grades with that directory. This is a paid run started by a person. The MCP, the tests and CI never
# run it.
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -d "$1" ]; then
  echo "usage: cross_grade.sh <packet dir>" >&2
  exit 2
fi
PACKET="$(cd "$1" && pwd)"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INPUTS=(catalogue.json sample.jsonl dup-groups.json)
for file in "${INPUTS[@]}" prompt-r1.md; do
  [ -f "$PACKET/$file" ] || { echo "missing $file in the packet dir" >&2; exit 2; }
done

# Round 1: independent. Each grader sees only the packet inputs and its prompt, never the other grader's output.
for grader in astra opus; do
  mkdir "$PACKET/r1-$grader.d"
  cp "${INPUTS[@]/#/$PACKET/}" "$PACKET/prompt-r1.md" "$PACKET/r1-$grader.d/"
done
( cd "$PACKET/r1-astra.d" && codex exec --skip-git-repo-check -s read-only -m gpt-6-astra -c model_reasoning_effort=xhigh -o "$PACKET/r1-astra.out" - < prompt-r1.md > "$PACKET/r1-astra.log" 2>&1 ) &
astra_r1=$!
( cd "$PACKET/r1-opus.d" && claude -p --model claude-opus-5-5 --effort high --strict-mcp-config --allowedTools "Read Glob Grep" --no-session-persistence < prompt-r1.md > "$PACKET/r1-opus.out" 2> "$PACKET/r1-opus.log" ) &
opus_r1=$!
status=0
wait "$astra_r1" || status=1
wait "$opus_r1" || status=1
if [ "$status" -ne 0 ]; then
  echo "a round 1 grader failed; round 2 is not started" >&2
  exit 1
fi

# Number the differences with the shared key rules and write the round 2 prompts.
python3 "$HERE/crosscheck.py" diff "$PACKET"

# Round 2: each grader decides on the numbered differences only.
for grader in astra opus; do
  mkdir "$PACKET/r2-$grader.d"
  cp "${INPUTS[@]/#/$PACKET/}" "$PACKET/prompt-r2-$grader.md" "$PACKET/r2-$grader.d/"
done
( cd "$PACKET/r2-astra.d" && codex exec --skip-git-repo-check -s read-only -m gpt-6-astra -c model_reasoning_effort=xhigh -o "$PACKET/r2-astra.out" - < prompt-r2-astra.md > "$PACKET/r2-astra.log" 2>&1 ) &
astra_r2=$!
( cd "$PACKET/r2-opus.d" && claude -p --model claude-opus-5-5 --effort high --strict-mcp-config --allowedTools "Read Glob Grep" --no-session-persistence < prompt-r2-opus.md > "$PACKET/r2-opus.out" 2> "$PACKET/r2-opus.log" ) &
opus_r2=$!
status=0
wait "$astra_r2" || status=1
wait "$opus_r2" || status=1
if [ "$status" -ne 0 ]; then
  echo "a round 2 grader failed" >&2
  exit 1
fi
echo "grader outputs written to $PACKET; next: record_claim_grades with grades_dir $PACKET"

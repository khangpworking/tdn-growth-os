# Sanitized offline evidence — Task 012

Date: 2026-09-07. Scope: deterministic local verification only.

## Boundary exercised

- Child: experiment-owned fake RPC executable only; no Pi executable and no provider.
- Launch: `shell: false`, bounded stdio, allowlisted environment, fixed RPC and deny flags.
- Input: synthetic verified Task 010 audit fixture.
- Authoritative gate: existing Task 011 `AnalysisBackedProposalService` submission, persistence, and replay in a disposable migrated SQLite/artifact root.
- Cleanup: database closed and disposable root recursively removed on success and failure.

## Focused scenarios

- Fixed deny flags and environment.
- Valid LF output through Task 011 submit/replay.
- Valid CRLF output through Task 011 submit/replay.
- U+2028/U+2029 preservation for LF and CRLF across single-byte input chunks.
- Exactly one repair; second invalid output rejected.
- Timeout, abort, child cleanup, malformed JSON, invalid/incomplete framing, duplicate events, premature exit, and input/model-output/stdout/stderr byte bounds.

## Sanitization and exclusions

This record contains no model output from a live provider, credentials, environment values, private Pi configuration, session data, database, WAL/SHM, or runtime artifact. No Pi installation, Pi invocation, provider call, credential inspection, or private configuration inspection occurred.

The final focused/full test counts, final commit, CI URL, protected-path result, and residue result are recorded in `docs/handoffs/012-governed-pi-proposal-spike.md` and the PR handoff comment after verification.

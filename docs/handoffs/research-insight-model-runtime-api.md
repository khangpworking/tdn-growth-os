# Insight model proposals: operator and HTTP integration

04/10/2026, uncommitted integration on baseline
`0116091fd5dc0902594f92d969dfb3ee0732c9c8`. Not a Fedora live release.
P4.4 continuation for I02/I04/I05/I06/I07/I08/I09/I10/I13.

## Delivered

The existing operator now has a separate explicit model configuration:

- `TDN_RESEARCH_INSIGHT_CODING_AI_ENABLED=true`
- `TDN_RESEARCH_INSIGHT_CODING_AI_MODEL=<explicit-model-id>`

Defaults off. OWNER writes and existing loopback CLIProxy configuration are
required. I14, Content Studio, and decision-section opt-ins do not enable coding.
No credentials or model responses are added to health output. No environment
file or live configuration has been changed.

`POST /owner-api/workspaces/:workspaceId/research-automation/runs/:runId/insight-coding-model-proposals`
delegates to the existing source-bound proposal service. The closed request
contains contract version, stable request key, exact adoption, exact predecessor,
and explicit record indexes (1–100). It never accepts a caller's actor, model
configuration, approval, or generated annotations. Normal OWNER token, exact
Origin/Host and request-size checks apply before source access or dispatch.

The closed response distinguishes PROPOSED, NOT_DISPATCHED, PREPARED, INVALID,
and DISPATCH_UNKNOWN. A new proposal is 201; verified retries and other recorded
outcomes are 200. Source/predecessor/in-flight conflicts are generic 409; corrupt
stored evidence remains generic 500. PROPOSED means unaccepted annotations, not
successful analysis, a human decision, or a new report.

Model HTTP mechanics reuse the bounded transport: frozen explicit model, one
request, no redirect, no automatic retry, abort propagation, response bounds and
credential-echo rejection. Retained results replay even when model configuration
is subsequently absent. A browser disconnect aborts its request; application
shutdown aborts and drains active coding executions before closing SQLite.
Ambiguous dispatch remains unknown, never automatically retried with a new key.

## Verification and ownership

Claude Opus 5.5 high implemented the transport, operator configuration and the
owning transport/config test extensions. GPT inspected those changes, wrote the
closed API, shutdown handling and persisted HTTP integration test, and ran Linux
checks. Claude's successful implementation is not an independent approval of
GPT's API code.

The new HTTP test owns transport-to-persistence integration, default-off,
authorization, safe responses, exact retry, unchanged reports/zero acceptance,
and shutdown settlement. Arithmetic, semantic relation correctness and corpus
membership remain owned by the existing source-to-report tests; the new test
does not duplicate those assertions. All data and the loopback model server are
synthetic. No real provider/model request was made.

Linux contract generation, backend typecheck and frontend typecheck passed.
Final affected group, including legacy coding HTTP, read-only API, new model
HTTP and shared transport/config checks: 9/9 passed. This supersedes the initial
overlapping 7/7 group. `git diff --check` passed. No Windows tests were run.
Migration 0047 remains byte-identical to the prior backend checkpoint (SHA-256
`47f7e91712542711a54d4eca15e61255b7f84c3a16a827e5812114aca28fd214`).
No source schema, migration or domain policy changed in this HTTP slice.

ZCode's separate single-file read-only audit ended at its 120000 ms timeout.
There was no returned finding or review approval, and no retry of that handle.

## Remaining

Connect the existing review UI to this endpoint, preserving request identity
across ambiguous failures and binding completions to the exact visible session.
Add full-corpus batch progression without losing pending records or silently
truncating oversized inputs. Then evaluate real source-bound model proposals
with the approved rubric and explicit acceptance before report revisions.
This endpoint alone does not make the nine sections automated on the live web,
nor increase the count of fully accepted sections.

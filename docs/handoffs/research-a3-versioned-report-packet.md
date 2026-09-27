# Research A3a handoff

Draft PR: https://github.com/khangpworking/tdn-growth-os/pull/55

## Completed implementation

- Offline CLI `research:report:packet`, Box 2 composer, canonical schemas/generated types and sanitized planning catalog.
- Exact supplied result and catalog byte hashes required; full A1 deterministic replay rejects changed numbers, missing/mismatched metadata and noncanonical result bytes.
- Canonical input is embedded in the retained canonical result. It is not a separate original normalized-input file and not the raw workbook.
- Four output files outside Git: exact result/catalog bytes, canonical packet, deterministic Vietnamese Markdown.
- Packet and section identities bind dependencies; section identity includes actual claim payloads. Same inputs are verified/reused without overwrite; changed source/result/catalog needs a different output bundle.
- M02/M03/M04/M13 are partial handlers, not the whole report method. Zero eligible metric observations yields BLOCKED. Other sections do not execute or generate claims.
- FACT observations retain scope, period, membership, coverage, precision and denominator pointers. No INFERENCE/HYPOTHESIS/manual text import, no official approval. All outputs DRAFT/UNREVIEWED/NORMALIZED_INPUT_ONLY.

## Verification and review scope

Four focused tests protect packet semantics/pointers, missing/zero/precision/labels, tampered/unsupported input and actual CLI exact retry/no-overwrite/private permissions. Expected example totals come from the independent synthetic A1 business fixture, not a second calculator implementation.

No tests, typechecks or builds ran on Windows. Only schema-to-TypeScript generation and Git/static inspection ran locally. Execution proof is Linux final-head CI; its SHA, run URL and actual counts are recorded in the PR handoff comment after completion. Do not infer PASS from the presence of this file.

The business task **Review marketing framework files** supplied sanitized catalog metadata and reviewed the method/renderer boundaries. Two clarifications were incorporated: embedded canonical input is not a separate source file, and zero-observation sections are BLOCKED. This is business review, not independent technical code review. Technical review/owner merge remain required.

## Scope and dependency checks

- A3 starts from A2 `de697351febb15c60a51ec4da1b78b67962cedd8` and integrates main `ff20bbb1cc344fdf68eb7713327077826f899b81` (Content Studio 049 already merged).
- The only merge conflict was STATUS; both research and Content Studio status sections were preserved.
- PR includes unmerged A1 #52 and A2 #54. A3-only review starts at integration commit `cc704cb`; do not merge #55 before the dependencies are accepted.
- No dependency/lockfile/workflow/migration changes, domain/API/UI changes, live records, private source files or historical findings in this slice.
- Catalog metadata can be extended/versioned but cannot authorize execution of arbitrary methods, claim truth, or human approval.

## Remaining work

This is not raw-to-full-report automation. Real A2 source acceptance still needs the explicit real manifest, acquisition basis, UNKNOWN policy and source-bound label sidecar. Manual Insight evidence requires separate rights/lineage/method acceptance. Database/workspace binding, official approval, UI, jobs and AI synthesis are future slices. No provider call, deployment or merge was performed.

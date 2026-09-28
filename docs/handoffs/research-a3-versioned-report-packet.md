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
- PR includes unmerged A1 #52 and A2 #54. Latest integration includes A1 `ccfe847ea371b46783cbb62a2d80b6a39124a323` and corrected A2 `426985d807b8240a20ecec1650dcdb7ae6cdf8bf` (ambiguous rich strings rejected). Review the A3-only delta against that A2 head; do not merge #55 before dependencies are accepted. The follow-up merge conflict was STATUS only; all feature status sections were retained.
- No dependency/lockfile/workflow/migration changes, domain/API/UI changes, live records, private source files or historical findings in this slice.
- Catalog metadata can be extended/versioned but cannot authorize execution of arbitrary methods, claim truth, or human approval.

## Remaining work

This is not raw-to-full-report automation. Real A2 source acceptance still needs the selected workbook, explicit real manifest, acquisition basis and UNKNOWN policy. The source-bound label sidecar is optional for an all-scope draft but required for WIDE/CORE. Manual Insight evidence requires separate rights/lineage/method acceptance. Database/workspace binding, official approval, UI, jobs and AI synthesis are future slices. No provider call, deployment or merge was performed.

The consolidated Linux acceptance runbook and remaining input gates are in `docs/research/offline-acceptance.md`. Technical hashes/locators/profile metadata belong to code, not owner questions. UNKNOWN policy affects WIDE membership, not CORE membership.

## Owner-approved unconfirmed acquisition extension

Owner approved diagnostic drafts with an explicit null acquisition timestamp. The still-unmerged v1 contract admits `acquiredAt: null` in addition to a valid date-time; the property remains required. Existing valid timestamp inputs retain identical calculation/result/packet/Markdown behavior. No arithmetic, rounding or known-input renderer policy changed. Null was previously rejected, so there is no historical null result to reinterpret. The null is retained in source-normalized input and packet scope, changes content identity, and renders as unconfirmed rather than a fabricated date. A3 supported-section blockers and all derived claim limitations include `ACQUISITION_TIME_UNCONFIRMED`. DRAFT/UNREVIEWED/NORMALIZED_INPUT_ONLY remain unchanged.

One synthetic source-to-packet integration case owns the new contract: actual XLSX fixture through A2, A1 calculation/rendering and A3 replay/rendering. It verifies unchanged period/numbers, missing-label blocks, explicit warning/limitations, deterministic replay and changed identity versus a known time, plus rejection of omitted/empty/malformed timestamps. Existing tests cover publication/no-overwrite; this adds no duplicate CLI/browser suite or production test seam. This is new owner-authorized behavior, not a regression claim against previously accepted null inputs. Validation is Linux CI only; final-head proof goes in the PR comment. Local schema generation is not a typecheck/test/build.

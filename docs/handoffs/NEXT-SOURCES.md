# Handoff — NEXT-SOURCES recovery (U12/G13 and U27)

Updated: 2026-10-08
Worktree/branch: `khangpworking/ultimate-next-sources`, PR172. Recovery preserved original head `7f1fec2b9c32c8becfd52f7e8e05b2702db60ec5`; implementation checkpoint `a246004`; normal merge checkpoint `3a13c51` includes main `1c58d2532f254ec476ef71879cf589400d106927` (PR174/175). No reset, rebase, historical replay, merge to main, deployment or live application call.

Completed:

- Replaced unapproved duplicate request/record/appendix interfaces and manual validators with canonical JSON Schemas, generated types and AJV trust-boundary checks.
- Actual owning service drafts lists during new-version collection from selected/peer Kalodata rank/detail product names verified against exact retained response bytes. Product cards and caller-supplied names never establish source authenticity. Every name binds a retained raw digest, exact JSON pointer and admitted capture digest; replay checks connector operation, selected product identity, exact source bytes and frozen run/scope/source-set membership.
- Generic content-addressed storage retains record v2: original scope seed strings, names, workspace/run, scope/source-set digests, category/dataVersion, full prompt and hash, prompt version, model identity, nonsecret dispatch configuration and complete validated output. Record and capture reads use existing bounded stores, with no new table or migration.
- Collection calls L9 with capture-digest plus result-position identity. It retains included/excluded/unclear rows and reasons, without deleting raw search evidence. The actual report service, renderer and reader preparation admit only included web records; missing prerequisites withhold main web counts/quotes. Owner-service reads authenticate exact dependencies and recompute the complete retained admission packet. No human adoption gate, scope-revision policy, recollection or automatic retry was added.
- Real API composition freezes `automation-source-evidence-v1` for new runs. Keyword drafting is independently disabled by default, requiring explicit `TDN_RESEARCH_KEYWORD_DRAFT_AI_ENABLED=true`, `TDN_RESEARCH_KEYWORD_DRAFT_AI_MODEL`, CLIProxy and the OWNER writer. Other AI flags do not enable it. No environment configuration changed. The adapter reuses existing single-call bounded HTTP mechanics, with cancellation, timeout, no redirects/retry and full retained generation identity.
- Source appendix v2 uses operative registry v1.9 S01–S27 mappings, report names, group and attribution. D is excluded by schema; S19 remains ungraded by original page and S25 retains mixed B/C. Empty use lists and repeated registry IDs for distinct bindings work. L9 accounting cannot be duplicated across registry IDs for the same binding. S07 supports separate review-video/seller-video source type, and E12/E13 text is fixed by registry membership.
- New auto report v18 displays the appendix in M13/I17 and inherits the shared U13 lint. Verified owning-method bindings add Market S01 and Insight S05/S27 separately. Historical marker-free starts, collection/report artifacts and renderer branches remain unchanged, including v17. Two fixed technical count explanations and one exact bridge-generated variant declaration use neutral display wording only under v18; retained input and quote bytes are unchanged.
- Missing model, unsupported/unverifiable sales evidence, failed drafting and skipped/unavailable collection have explicit unavailable states. Cancellation during the awaited model call cannot commit successful collection or reopen a terminal run.

Changed paths:

- `contracts/analysis/{keyword-list-draft,keyword-list-draft-record,source-appendix-projection,automation-source-evidence}.{schema.json,generated.ts}` and exact registrations in `scripts/generate-foundation-contract.mjs`.
- `src/modules/analysis/{keyword-list-drafting,keyword-list-draft-record,source-appendix-projection,source-registry}.ts`.
- `src/modules/analysis/research-automation/{keyword-cliproxy-transport,sales-name-evidence,serpapi-l9-filter,source-evidence,source-evidence-report}.ts`.
- Allocated integration hooks in `src/modules/analysis/research-automation/{service,model,reports,descriptive-report}.ts` and `src/api/{research-automation-api,operator-app}.ts`.
- Focused unit tests for drafting, record authenticity, appendix, transport, configuration, report bindings and versioned renderer copy; two new synthetic service/API integration suites. Existing drafting/record/appendix tests were revised to test the canonical contract and stronger authenticity. The old seed-name length assertion changed from 201 to 501 to match the established 500-character connector product name bound; no approved assertion was weakened. Existing renderer tests only gained a new compatibility case.
- This handoff only; shared status/plan documentation remains coordinator-owned.

Evidence (commands, results, relevant revision):

- Node24.15.0/npm11.12 runtime; all focused tests use `--test-concurrency=2`.
- `npm run contracts:generate` exit0; subsequent `git diff --exit-code contracts/` clean at merged checkpoint. No sibling schema changes beyond inherited main.
- `npm run typecheck` passed after integration/main merge; final report-hook typecheck also passed.
- Final focused source validation: 40/40 passed; direct source/API/report-binding validation: 8/8 passed, covering actual application composition with and without fake keyword model, full prompt/config retention, exact replay/corruption failure, excluded/unclear admission, marker-free historical path, no-selection unavailable appendix, active model cancellation and per-report package bindings.
- Renderer plus historical version checks: 19 passed, 0 failed, one pre-existing optional local Chromium skip. New v18 test preserves retained input and marker-free bytes while exercising full shared lint. Earlier merged Insight draft revisions and reader regression suites passed (3 and 9 respectively).
- Keyword/filter/appendix/transport/config tests cover full output validation, extra fields, mismatched versions, forged names/pointers, unselected sales product, missing/tampered dependency, repeated source bindings, duplicate accounting, registry/tier/attribution forgery, pre/active cancellation, failed dispatch without retry, response bounds and default/negative model configuration isolation.
- `git diff --check` clean. Full local suite was not run. Full hosted `npm run check` is mandatory on the final reviewed head; no historical failure is waived.

Unresolved:

- U12 is implemented for the actual retained Kalodata sales-name lane and existing SerpApi web consumer. Metric-only drafting requires its owning verified name/locator projection; it currently returns explicit unavailable rather than treating a filename or display label as authentic sales evidence. No new keyword-selection API/UI route was authorized or added; the owning service exposes additive exact-digest drafting/read operations.
- U27 is integrated for mapped sources actually consumed by these paths (Kalodata names/comparables, L9 web evidence, verified Metric and exact/native review methods). Unknown supplemental source families have no authoritative registry binding here; they are not assigned guessed IDs or tiers. S07/L10 and official statistics mappings are available in the tested projection contract, but no not-built collector is claimed functional.
- P9/P10/U23 collectors/intake/browser adapters and their consumers remain package work outside this recovery slice. They need their own canonical/API/collector allocation and concrete transport/privacy/cap/locator inputs; no unused shim or board readiness flip was introduced. Existing application caller wiring is complete for the bounded lane above, not a claim that all Ultimate source packages are complete.
- Humanizer-vi was not invoked: this slice authors deterministic method disclosure and labels, no Vietnamese AI interpretation. The keyword prompt is a new versioned English instruction. No historical report prose or source quote was rewritten, and no claim is made that a local or application humanizer ran.

Next action:

Coordinator independently reviews PR172 at exact pushed SHA, checks full hosted `npm run check`, and owns any merge. Final settlement supplies the exact SHA and CI status. Canonical/generator and service/API/model leases were explicitly released at `3a13c51`; report/descriptive hooks are released after the final validated commit. Future changes to those files require a fresh allocation. Subsequent source packages must be dispatched separately with their remaining requirements and blockers.

Business decisions pending:

U11, U26 and U32 remain ESCALATED material decisions; no statistical release, scope policy or aggregate reconciliation was invented. U40 paid/live acceptance remains unauthorized. No cost caps, application credentials, launcher model configuration or runtime data were changed.

## Checklist evidence

| ID | Status | Evidence / remainder |
|---|---|---|
| U12 | PARTIAL / DEPENDENT: existing sales/web lane DONE; other lanes pending | Authenticated retained drafts and actual collection/report/reader L9 calls. Metric-only name projection and absent P9/U23 callers remain explicit prerequisites. |
| U27 | PARTIAL / DEPENDENT: mapped consumed sources DONE; supplemental bindings pending | Canonical registry1.9 projection and actual v18 M13/I17 appendix, per-source accounting, mixed tiers, empty lists, repeated IDs and E12/E13. No guessed bindings. |
| G01 | DONE | This per-item evidence and explicit remainder. |
| G02 | DONE focused/static; PENDING CI hosted release gate | Typecheck/focused synthetic checks; coordinator must verify full hosted exact-head check before merge. |
| G03 | N/A | No frontend changes. |
| G04 | DONE | Canonical generation deterministic and committed. |
| G05 | DONE | Allocated paths, narrow granted descriptive hook, clean diff checks. |
| G06 | DONE | Synthetic fixtures/fake credentials only; no runtime data or real commercial records copied. Loopback test endpoints are synthetic transport fixtures. |
| G07 | DONE | No live provider, model, collector or paid calls. |
| G08 | DONE for deterministic disclosure | Plain fixed report names/labels, provider-free method disclosure; original data remains retained. Humanizer limitation above. |
| G09 | DONE | Explicit unavailable states, no missing-to-zero or invented evidence. |
| G10 | DONE | Exact stored-byte replay, marker-free branches and versioned lexical hook verified. |
| G11 | DONE | Stronger authenticity tests; canonical fixture revisions documented above; no deleted/skipped assertions or new test waiver. |
| G12 | DONE | Handoff fields, checklist, bounds and next steps recorded. |
| G13 | PARTIAL / DEPENDENT: existing web consumer DONE; absent callers pending | Included-only main evidence, exact capture/position identity, retained excluded/unclear reasons and per-source accounting. |

## Engineering bounds (not business defaults)

- Seed names ≤500 characters follow the existing connector/card name bound. Terms ≤200 and lists ≤500 follow the canonical L9 contract. Oversized genuine inputs fail closed; no term truncation changes frozen seed bytes.
- Draft prompt ≤64KiB is a bounded single-request engineering ceiling, checked as UTF-8 bytes as well as schema character count; it is not a sampling rule. Draft JSON uses the existing 8MiB automation JSON artifact budget. Evidence replay uses the existing 16MiB raw capture and base64-envelope budget, rather than incorrectly applying the smaller draft JSON budget.
- Appendix ≤1024 source bindings is a report memory/read safety ceiling aligned with two automation steps of ≤512 captures; it is not a source-count business threshold or aggregate sample rule. Extra unsupported bindings fail validation rather than silently dropping sources. Earlier arbitrary 50-source/4-ID caps were removed.
- Model defaults reuse established research HTTP budgets (16384 output tokens, 300-second timeout, 256KiB declared response allowance), not a new provider/cost policy. The existing HTTP port separately bounds encoded request/response envelopes, refuses redirects and never retries. No runtime enabled flag or paid cap was changed.

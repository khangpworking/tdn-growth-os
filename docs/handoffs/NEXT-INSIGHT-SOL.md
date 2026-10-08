# Handoff — NEXT-INSIGHT-SOL: versioned family drafts and I11 count bridge

Updated: 2026-10-08
Worktree/branch: `ultimate-next-insight-sol` / `khangpworking/ultimate-next-insight-sol`; base `998549072ae62b9d619ffbf645ba59b22a920d4e`.

Implementation SHA: `a650d9cd257b0765142a033ea5fe334b035e87c8`; the final candidate additionally contains this handoff commit.

Completed: bounded U-03 I04–I09 draft consumption, including I05 polarity, I06 explicit same-record sequences and I09 complete/partial candidates, through the actual retained proposal and owning-service report revision path. New selection `insight-draft-select-v2`, snapshot v3 and `draft-counts-v2` preserve accepted outputs, pending/disagreement states and historical v1 selection/snapshot v2 rendering. I11 consumes exact retained I10/I13 coding memberships as labelled, platform-authenticated counts; it withholds rates, differences and release claims.

Changed paths:

- Four canonical analysis schemas: `located-insight-methods`, `automation-insight-report-revision`, `automation-insight-coding-snapshot`, `automation-insight-model`, their generated contracts and the generated Insight coding API cascade.
- `src/modules/analysis/{located-insight-methods,insight-corpus-counts,report-located-insight-pages}.ts`.
- `src/modules/analysis/research-automation/{insight-coding,selected-insight-projection,insight-model-execution,reports}.ts`; frozen `insight-model-prompt-v3-schemas.json`.
- `service.ts`: **only** the `readInsightSourceContext` return hunk providing ephemeral `verifiedPlatform` from the two replay-verified exact/native Shopee adapters. No source text, attribution or absent platform is read as platform proof; stored binding/input bytes remain unchanged.
- Shared U-13 lint and focused tests imported from coordinator-approved isolated Market commits `718ede5d12000bed358fb5693856469ca84c9f1c`, `b4d84c36359836f33e388e343fdbe09bab3032e9` and `319a28edc9836a7f5505940a29380f1f5f556213` (local `686a36b`, `10a4b2e`, `bf311404a061fa6033fac1a1831f2499d5882375`).
- New synthetic fixture and `next-insight-draft-counts.test.ts`; related draft revision, prompt retention, version, exact-source and native-source tests.

Evidence (commands, results, relevant revision):

- Pinned Node 24.15.0/npm 11.12.1; authorized `npm ci` completed without manifest edits.
- `npm run contracts:generate` and `npm run typecheck`: exit 0. Canonical generation changed only the four schema derivatives and the Insight coding API cascade.
- Focused version tests: **18/18 PASS**, including historical method/HTML hashes, v3 prompt bytes, draft I05/I06/I09 semantics, stable identity dedupe, incomplete/unknown disposition exclusion, missing platform and scope, forged output rejection and rate withholding at 30 text records.
- Affected method/renderer/citation/projection suites: **50 PASS, 1 existing optional Chromium/PDF SKIP**, no failures.
- Retained exact/native/method integration run: **55/57 PASS initially**; both failures were additive source-context shape expectations. The two corrected tests **2/2 PASS**, retaining the full binding/input equality, source replay, original report and no-write assertions.
- Final `node --import tsx --test --test-concurrency=2 tests/unit/report-visible-text-lint.test.ts tests/unit/next-insight-draft-counts.test.ts tests/integration/research-automation-draft-revision.test.ts tests/integration/research-insight-prompt-retention.test.ts`: **13/13 PASS**, no skips or failures. Final `npm run typecheck`: exit 0. The actual v17 report invokes the shared lint; caller tests inspect generated numeric nodes, reject removed draft labels and reject generated superlatives. Pagination and verbatim quote exceptions are covered. All checks use pinned Node and synthetic fixtures. The v2 test retains one fake model response, generates snapshot v3/v17 with zero receipts, authenticates separate I10/I13 corpus members and code counts, rejects altered count/version snapshots, and replays old/new report bytes without additional model/collector calls or database writes.
- Historical synthetic hashes, captured before implementation: accepted method `eb9264d0d977f4b219a5edc17b28e067785ba0f80542d9afd793700b067b35b0`; draft-v1 method `2f61c7042d6fd626dcc41a97645cea98b797b6d710317ed60f716219171678ce`; accepted HTML `035c8108fd27be3161bde9e58ab1f5de677c37eced162c0c5e054fffd904c486`; draft-v1 HTML `f88aff874511740b8a3d1f168fa028d06c221a3f3ef3ea26f1c7202bf56a6852`; prompt-v3 text `004a9907dc96e686778de38fe785f2efde38df6e73edcad1893ab22610f4561f`.
- `humanizer-vi` SKILL.md, preservation rules and registers read at reviewed upstream revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12`; neutral Vietnamese draft copy reviewed without altering source quotes, scope, quantities or uncertainty. Application model prose quality is not established by synthetic tests.

Unresolved:

- U-03 remains PARTIAL overall: the existing proposal→adoption prerequisite is intentionally preserved, no receipt-free frontend action is added, and no release eligibility is fabricated.
- U-04 remains PARTIAL overall: current authenticated adapters provide Shopee only. Typed source-backed retail/wholesale membership is absent, so buyer type stays null with a named blocker. Each corpus/outcome keeps its own member set, codebook revision and scope; no corpus/platform totals are added. Draft rates and differences remain null even at ≥30 text records. An empty eligible coding set with pending coding is unavailable, not a verified zero.
- U-11 multi-code family κ, U-26 collection/admission policy and U-32 positive aggregation remain ESCALATED. No release cross-check or owner approval is invented. U-20/U-21, U-27 and U-28 are not delivered here; U-14/U-15/U-17 require a later serial assignment.
- Shared lint follow-ups and final v17 lint/caller checks are complete. Full exact-head hosted `npm run check` and coordinator independent review are required before merge; no baseline failures are waived.
- No live providers/models/collectors, paid U-40 staging, deployment, credentials/cap/global configuration changes, database copies, migrations or dependency manifest edits.

Next action: coordinator independently reviews the named-branch draft PR and runs full hosted `npm run check` on its exact final head; completion message supplies PR URL and final SHA. Worker does not merge.

Business decisions pending: U-11/U-26/U-32 as above; no new decision encoded by this bounded change.

Lease records:

- Service context-only commit `6e654f0064b4426a0b11bde6a09bfccdf0946e05`; service lease durably released.
- Canonical/schema generation commit `a6423b3cabaa7ec960cf2406dda9e569fd9b2bcb`; global canonical lease durably released. No later service/canonical edits are authorized or planned.
- Insight-only `reports.ts` lease explicitly released after implementation commit `a650d9cd257b0765142a033ea5fe334b035e87c8` in coordinator message `msg_e71e8f192d20`; no further reports edits.

Checklist evidence:

| ID | Status | Evidence |
|---|---|---|
| U-03 | PARTIAL; assigned family-draft slice implemented | New versioned selection/snapshot/method branches through owning service; I04–I09 draft counts and I05/I06/I09 derived outputs; historical flags/output/prompt/report bytes preserved. Adoption lineage remains required. |
| U-04 | PARTIAL; assigned coding/count bridge implemented | Source-authenticated platform membership, exact codebook/scope/disposition/code pointers and stable record identity; rates/differences null, buyer evidence missing, no cross-platform sums. |
| U-11 | ESCALATED | No unresolved statistic or release eligibility invented. |
| U-13 | PARTIAL; new v17 caller integration | Isolated shared lint dependency; each generated pending measurement is marked and labelled in its own sentence. Final 13/13 focused check passed; v17 invokes lint and caller markup coverage is verified. |
| G-01 | DONE | Explicit bounded outcomes and remainder above. |
| G-02 | PENDING hosted gate | Typecheck and affected synthetic checks pass as recorded; full exact-head hosted check still required. |
| G-03 | N/A | No frontend source edits. |
| G-04 | DONE | Canonical generation under sole lease; strict old/new snapshot selection closure. |
| G-05 | DONE locally | Scoped ownership and coordinator-granted shared hunks; `git diff --check` clean. |
| G-06 | DONE | Synthetic fixtures and fake transports; no private/runtime evidence committed. |
| G-07 | DONE | No live application calls; retained model/service test uses a fake transport and proves no-extra-call replay. |
| G-08 | DONE | Neutral Vietnamese copy; required preservation rules read, no provider names in new owner-facing copy. |
| G-09 | DONE | Missing membership/coding/platform/scope stays explicit; absent eligible coding is unavailable, no fabricated verified zeros. |
| G-10 | DONE | Old flag/selection/snapshot/renderer branches plus frozen prompt v3; synthetic historical digest equality and real-service old/new retained-byte replay. |
| G-11 | DONE | Existing assertions updated only for intended new prompt-v4 dispatch, frozen-v3/live-v4 fragment pins and additive `verifiedPlatform` context proof; full original binding/input checks retained. |
| G-12 | DONE | This handoff follows `templates/handoff.md` and includes evidence/checklist/remainder. |
| G-13 | N/A | No keyword collection or filter consumer introduced. |

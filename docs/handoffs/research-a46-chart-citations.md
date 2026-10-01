# Research A46: chart audit and citation preview

Status: owner-authorized additive integration implemented; final-head CI and activation pending. Base `e0195c5156e2470bf760f4498afa45ae8fd2d23e`; branch `feature/research-a46-chart-citations`. The earlier preview evidence below is historical; the integration delta is recorded at the end. No live records, source import, migrations or runtime dependencies changed.

## Three workstreams

1. The exact Claude session **Competitor mockup report design**, ID `1c7ed76b-dd70-4e77-be43-2705f0da7523`, reviewed the Fedora-generated synthetic preview using Claude Opus 5.5 high. Initial findings were fixed in a single design batch; a narrow equal-bar-width correction was also verified. Final verdict: **APPROVE_PREVIEW**, no remaining P1/P2 findings. Owner final acceptance remains outstanding. This is not approval of methods, market truth, completeness or deployment.
2. Offline pinned Flint 0.5.1 audit consumes existing ChartData/ChartSpec and supplied assembly metadata. Supported declarative backends are checked for category/value survival, overflow and implicit aggregation. Callback/non-JSON backend output is explicitly unsupported, not executed. The actual compiler receipt passed for the eligible synthetic M03 view; M04 ALL stayed blocked because its original ChartSpec had no eligible marks. This is not a claim that all M04 scopes or all 30 sections were compiled.
3. Deterministic citation projection and script-free HTML preview link existing claims to retained calculation/source locations. Unrelated retrieval candidates are separate; external quote-verifier attestations are not independent byte extraction. Current HTML accepts no arbitrary generated prose or PageIndex candidates.

The preceding 30-section code/method review classified two existing chart families (M03/M04), one conditional family (M05), 14 intentionally non-chart sections and 13 blocked before chart creation. It found no confirmed missing chart under the current input/readiness contracts. This is a conditional coverage review, not 30 successful compiler runs: missing inputs must not be replaced with a chart or an observed zero. Re-audit when a blocked section receives its required inputs.

## Validation

- Fedora Node 24.15.0, existing matching dependency installation used read-only in a disposable snapshot.
- New focused suite: 6/6 passed.
- Independent code review found four Flint blockers: unrelated lineage accepted, unsafe numeric conversion, invented M05 labels and expected git metadata reported as observed. Corrections rebuild both packet and ChartData from pinned upstream bytes, bind normalized input and assembly/package identities, block unsafe or unlabeled values, and report missing installed `gitHead` as `NOT_PRESENT` with `npmGitHead: null`. The pre-fix Fedora regression failed at the intended missing lineage rejection; the final offline compiler CLI passed on the retained synthetic bundle. It exposed an additional real packet-shape mismatch (`methodVersion` is in the catalog, not the projected method artifact), which was corrected without weakening replay.
- Backend TypeScript: passed.
- Actual installed Flint receipt records version `0.5.1`, package JSON SHA-256 `6637f382aff4ef8d5a042b0dc7983194c28439cce9337fb01ac4c65221ee47d3`, and absent git metadata. Do not describe the expected upstream commit as an independently observed installed commit.
- The exponent-value regression exposed an additional M05 locator-root bug: `/input/m05/N` was resolved against the input subobject instead of the complete methods payload. The new explicit-label positive control failed before the one-line repair and passed afterward with values `12` and `8`; the missing-label and unsafe-decimal cases now reach their intended guards. Independent focused re-review returned no remaining blockers after this correction.
- Actual offline export CLI: 24 synthetic citations, no DB mutation or AI/provider calls; database bytes unchanged.
- Browser: 1440×1000 and 390×844, native keyboard citation navigation, target/source links present, no page errors or horizontal document overflow.
- New rendition embeds 21 Montserrat faces from the approved kit. All used faces loaded; unused 700 italic stayed unloaded. Historical v1 assets unchanged.
- Equal synthetic chart values: all three bars measured 196px after the fixed badge-width correction.
- Impeccable detector: 0 anti-pattern failures, 9 advisory notes against the older app-shell DESIGN.md; report-kit palette remains the actual approved authority.
- Full repository check initially passed contract generation, both typechecks, frontend build and frontend 186/186. Backend 708/711 passed; three existing CLI tests failed because the isolated source snapshot lacked `.git`, so their refusal-to-export-inside-Git assertions could not fire. Corrected the disposable snapshot metadata, then reran all three affected files plus the new HTML test: 11/11 passed. The final complete backend suite, including the badge-width correction, subsequently passed **711/711**. Do not describe the initial run as one clean full-suite PASS; normal final-head Linux CI remains a release gate.
- After all Flint review and M05 corrections, reran the focused suite **6/6**, backend TypeScript and the complete backend suite **711/711** on Fedora. `backend-reviewed.log` is the final backend receipt; unchanged frontend checks above are reused. Transferred production/test bytes were checked against local SHA-256 values. Independent focused code review reported no remaining blockers.
- A subagent mistakenly ran Windows tests/typechecks before correction. Those results were explicitly rejected as acceptance evidence; the authoritative checks above ran on Fedora.

Private synthetic artifacts and receipts are outside Git under the task-owned `report-a46-20261001` experiment directory. Local copies are under `artifacts/report-a46/` in the orchestrator workspace. No live operator process, token, database or artifact tree was touched.

## Changed paths

- `src/modules/analysis/report-citations.ts`, `report-citation-html.ts`, `report-citation-fonts.ts`, `report-flint-audit.ts`
- `scripts/export-report-citation-preview.ts`, `audit-report-flint.ts`
- `assets/report-citations-v1/montserrat/` with SIL OFL license
- Three focused unit test files and Linux-only synthetic acceptance helpers
- `INTENT.md`, `docs/STATUS.md`, two task briefs, report surface brief and retrieval/citation architecture

## Next step

Owner reviews the approved synthetic preview. After acceptance, publish the scoped draft PR and require final-head Linux CI before any merge/live integration. The preview renderer is intentionally not registered in the live immutable report-version reader. A later explicit versioned presentation integration must preserve old replay and go through Claude/owner acceptance.

Implementation remains local and uncommitted on the named branch. No external PR, push or merge was performed by this slice.

WeKnora/OpenViking remain optional future experiments, with no installed live stack or fabricated native connector. The citation implementation itself makes no model calls. The separately authorized comparison consumed the final four PageIndex pilot calls: total 8/8.

## Integrated release delta (2026-10-01)

- Added the explicitly selected `report-kit-citations-v1` presentation and `report-kit-citations-html-vi-v1` renderer, canonical retained `citations.json`, verified downloads and replay. Source-backed and prepared paths both dispatch the new renderer; old v1 renderer/assets remain untouched.
- Generation defaults to standard, passes the presentation through and binds it to exact retry identity. Claude Opus 5.5 high implemented the additive form option. Tokens and existing API ownership boundaries are unchanged.
- Full Fedora integration check passed contracts, both typechecks, production build, **187/187 frontend tests** and **712/712 backend tests**. This was followed by a narrow independent-review correction: a supplied semantic ID now requires canonical retained content, its identity hash and recomputed source/calculation binding. The affected suite passed **14/14** plus backend TypeScript; the direct source-backed citation regression separately passed **1/1**. Independent re-review closed the binding finding. Final GitHub CI must cover the final head.
- The actual production-runtime synthetic journey exercised all three optional method families plus the citation profile: **36/40 artifacts**, one creation before/after reload, no browser errors, no mobile document overflow, keyboard source navigation and byte-identical retained citation download. It touched only a disposable database/artifact root and made no model/provider calls.
- The exact Claude design judge session `1c7ed76b-dd70-4e77-be43-2705f0da7523` returned **APPROVE_INTEGRATED_DESIGN**, with no P1/P2 blocker. Owner final approval of real content/visual output is still required. Existing toast overlap, technical status labels and badge widths above 99 remain nonblocking follow-ups; this synthetic report had 24 citations.
- GPT 6.1 and Luna both failed the same selective limitation-page coverage check, despite correct numeric answers. GPT 6.1 was faster and byte-stable in this small run, but **no production model replacement** is justified. There is no native/live PageIndex chat integration. See the comparison document for receipts and limitations.
- Owner confirmed browser edits were saved and authorized a graceful localhost restart after gates. Activation must use a clean pinned release, preserve the original database/artifacts/configuration, make a quiescent private recovery copy and perform read-only verification. No migration, public/domain access, real research write or provider call is authorized by activation.

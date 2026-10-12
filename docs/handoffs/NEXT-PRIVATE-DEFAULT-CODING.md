# Handoff — authentic private source default coding

Updated: 2026-10-09
Worktree/branch: `ultimate-impl-sync1-codex` / `khangpworking/ultimate-private-default-coding-sol`.
Task/Dispatch: `task_0254b7e8d058` / `ctx_7e7c397355e0`, sole run `run_adc3551f8ed8`, coordinator `term_f78f7d8d-0a0e-4b5d-8a29-1f7a4912317d` generation2.
Tested implementation SHA: `5b6557b82b827a56e565483a754dc8a163bb760d`. Later handoff-only commits do not change tested code; final pushed SHA is reported in the fresh lifecycle and PR.
Reviewed baseline: `e4b78f01b573d8284235fe06e693d587ffaabca7`, normally composed with exact reviewed main187 `5f38281680a51bae1c49539060d655e093789f2f` in merge `d0ebbd7f4bfe6211235f47e79bb8d05b0acc71ea`. No unmerged Metric/P9/U16/reader source was imported. Frozen reader branch `532cc25c823dcef50c96d07162f1bb29b2e2a926` remains separate.

Completed: real retained Foundation3 private review corpus/source22 now feeds an explicit authenticated OWNER default coding action without human rule adoption. The owning execution/evidence/report services retain a pending proposal, snapshot5 and authoritative report25; verified HTML/history and exact retries replay storage without model/collector calls or database writes. Existing default UI/client supplies the versioned request and a separate explicit proposal/digest report confirmation. No extra private intake/parser, parallel ledger, migration or new UI action was needed.

## Behavior and boundaries

- `private-insight-source-projection-v1` reconstructs the closed verified view from the retained corpus, authenticates collection/page/row/text locators and copies exact safe corpus identity, original text/time, rating field presence/state/value, text states, source admission and included/excluded/unreadable dispositions. Context authority comes from authenticated frozen start/scope/run/pair/report and independently verified corpus/pages, never a caller semantic object or text-derived platform. The existing trusted private Shopee adapter supplies platform evidence.
- Exact nonnull `(shopId,itemId,reviewId)` repeats retain all occurrences but exclude later duplicate records from coding membership. Conflicting source-visible versions fail closed. Author identity is never used for deduplication or counting; equal text with distinct native identities stays separate, and null native IDs do not collapse equal text. No per-person join or customer/person count.
- Public/model/artifact/report projection excludes private author IDs/hashes, original reviewer metadata, native reviewer IDs, privacy keys/profile and the private corpus itself. Native IDs are used only server-side to authenticate duplicate source units. Located method `profileSha256`/`adoptionSha256` are unchanged historical method constants, not a private identity profile or owner adoption. Safe artifact/digest/collection references remain exact. Free text stays verbatim and may contain personal information: metadata stripping is **not free-text PII redaction**.
- Private source binding/default request/source/root/proposal/evidence are additive v2, model input is v2, private prompt is v6 and coding snapshot is v5. Full safe source membership, ratings and dispositions accompany the selected eligible model records; original private reviewer metadata does not. New proposals retain the existing pending provenance, codebook/source span validation and continuation rules. Receipt creation, adoption or release is never inferred from model success.
- Existing immutable coding/execution ledgers are reused. Legacy storage parent slots keep their existing names, while public private roots are explicitly `DEFAULT_RULE`, status `PROPOSED`, with private policy `source-private-default-coding-v1`. There is **no new DDL**, old migration edit, backfill or runtime database execution. Historical request identities, source/default/adoption/crosscheck factories and prompt1–5 bytes are preserved.
- `readInsightSourceContext` remains exactly v1 and rejects private sources. New `readInsightSourceContextV2` authenticates private source2 and feeds owning view3/default2 callbacks. Historical sources dispatch directly through the original v1 method, avoiding duplicate recursive verification. Legacy manual/adopted/default-v1/crosscheck requests cannot consume binding2; private crosscheck is explicitly unavailable in the parent UI and rejected before confirmation in the historical child.
- Explicit default report selection remains the existing generic exact proposal ID/digest contract. Snapshot5 binds the private projection, root, codebook, execution and zero receipts. Renderer25 precedes source-only22 fallback and uses the shared CitationRegistry, publisher and visible-text lint. An optional renderer's HTML must equal the owning authoritative private25 HTML. HTML reads return retained immutable bytes; source/coding replay verifies every binding and CAS dependency before returning them. KEEP preserves the exact selected snapshot without another collection/model dispatch.
- Counts are retained draft method outputs, not accepted counts or release statistics. Tests produce exactly two proposed I10 records at distinct native identities while accepted count stays zero and rates remain null. Stars, textless/unreadable/excluded rows, duplicate occurrences, seller voice and source-native distinctions stay separate. No platform/person sums, personas or model-inferred platform.

## Changed paths

Own projection: `src/modules/analysis/research-automation/private-insight-source.ts`.
Narrow existing source/owning branches: `insight-coding.ts`, `insight-default-coding.ts`, `insight-model-execution.ts`, `service.ts`, `reports.ts` in that directory.
Exact Ajv dependency registration only: `semantic-coding-response.ts`, `i14-cliproxy-transport.ts`, `insight-crosscheck-contracts.ts`.
Canonical: new `contracts/analysis/private-insight-source-projection.schema.json`; additive coding/model/snapshot and coding/model API schemas with generator-produced derivatives; existing foundation/browser generator registrations and generated browser declaration output.
API: `src/api/research-automation-api.ts` dependency/validator union only; existing routes and authorization unchanged.
Frontend: `InsightCodingPanel.tsx`, `InsightDefaultProposalPanel.tsx`, `insight-coding-api.ts`, `insight-default-ui.ts`; exact private binding guard in `InsightCrosscheckPanel.tsx`.
Tests: new projection unit, private owning service/OWNER HTTP and mounted private client/UI files; existing private-consumer test changes only the forged legacy default request's rejection reason, keeping v1 private rejection and every no-call/no-write/source22/literal assertion. Named reviewed-main composition includes only its already-reviewed crosscheck contracts/source/tests/docs.

## Evidence

Pinned Node24.15.0/npm11.12.1 at `/tmp/tdn-sync1-tools/node-v24.15.0-linux-x64/bin`. Focused tests use `--test-concurrency=2`; no local full suite ran. Synthetic SQLite/CAS, fake Foundation/model/collector transports and loopback OWNER HTTP only. No live application provider/model, paid U40, runtime/private data copy, credentials/config/caps change or deployment.

| Check | Result | Log |
|---|---|---|
| Full backend `npm run typecheck` | PASS on final source | `/tmp/tdn-private-coding-final-typecheck.log` |
| Direct frontend `tsc -p frontend/tsconfig.json --noEmit` | PASS, no generation after transfer | `/tmp/tdn-private-coding-parent-typecheck.log` |
| Private projection/default unit behavior | 6 PASS | `/tmp/tdn-private-coding-canonical-focused.log` |
| Actual private owning + existing private-consumer | 13 PASS on final source | `/tmp/tdn-private-coding-final-owning.log` |
| Historical owning default/native/located/prompt | 8 PASS | `/tmp/tdn-private-coding-compose-historical.log` |
| Historical crosscheck23/adopted/literal/exact/native | 18 PASS | `/tmp/tdn-private-coding-legacy-crosscheck-literal.log` |
| Historical default21/fallback after final routing change | 1 PASS | `/tmp/tdn-private-coding-final-legacy-routing.log` |
| Actual private/default/public-crosscheck/client UI | 13 PASS | `/tmp/tdn-private-coding-final-ui.log` |
| Contracts + browser generation in leased phases | PASS, repeated generation zero drift | `/tmp/tdn-private-coding-compose-regeneration.log`, `/tmp/tdn-private-coding-compose-browser.log` |
| Historical 45 schema definitions and prompt1–5/factories | Exact equality | `/tmp/tdn-private-coding-historical-defs.log` |
| Released canonical/generated/registry fingerprints | Unchanged after transfer | `/tmp/tdn-private-coding-compose-hashes.json` |

Owning tests cover authentic corpus22 → request2 → fake model → pending proposal2/snapshot5/report25 → saved HTML/explicit read/retry/KEEP; exact source/disposition/native duplicate membership; workspace/run/pair/scope/report/corpus/collection/digest substitutions; wrong origin/OWNER/route/version; excluded/unreadable/textless/duplicate batch rejection; private historical crosscheck no dispatch; corrupt corpus and source pages failing before dispatch/mutation; privacy scans of captured model input/prompt, admission/configuration/candidate/evidence artifacts, report/API output; zero model/collector calls and SQLite fingerprint/`total_changes()` equality on settled reads/retries. Source22 historical HTML is byte-equal on reread.

Initial failures are not hidden: unregistered additive Ajv dependencies blocked old owning initialization until exact registration grants; the final old owning checks above pass. A synthetic scan originally rejected the explanatory word “privacy”; it now targets private metadata keys and exact synthetic IDs/hashes/key/profile/native identifiers, preserving verbatim free text and source assertions. Its fake gateway now returns an assertion failure promptly instead of leaving a request pending. The task-owned failed test process was stopped; only corrected passing final runs count as evidence.

## Ownership, checkpoints and releases

- New independent projection placement: `msg_12410b4508bf`, ACK `msg_8a29c016966e`; additive private source branch grant `msg_851e8545f8e2`.
- Six canonical/API/client grant `msg_ae4fc62b7262`, ACK `msg_7ad5b0105f9c`; bounded checkpoint `d07ffc724a51883a72e4ccd992e5a8dbe98ad29c`, explicit GLOBAL/APIUI release `msg_370df4bc3bc3`.
- Sole central owning + named reviewed-main187 composition grant `msg_471bddefc067`, ACK `msg_3791e2de31b2`. No Metric correction/P9/unreviewed sibling import.
- Short GLOBAL dependency/rematerialization grant `msg_a2b945c13736`, third exact registry grant `msg_f6aba3a38072`; stable checkpoint `7da4bf9c8c99b9e75f874499784e0c0c1867603a`, explicit release `msg_fd4bfc116423`, accepted `msg_4c5e44cd228e`. P9 became sole GLOBAL writer; no generation/schema changes afterward.
- Parent-only private crosscheck suppression `msg_eb0324e7ed94`; exact child private guard/type narrowing `msg_40d8495b0d5d`. No other child/API/route/config change.
- Final code checkpoint `5b6557b82b827a56e565483a754dc8a163bb760d`; central and narrow frontend/source leases are explicitly released through fresh lifecycle with stable hashes. Worker never merges the PR.

## Gates and limits

| Gate | State for this bounded deliverable |
|---|---|
| G01 | Exact owned paths, canonical/central/APIUI phases and reviewed-main composition recorded. |
| G02 | Affected local static/behavior checks pass; independent frozen-head review and full hosted exact-head Check remain required. |
| G03 | Actual OWNER/client/private default and historical mounted UI pass. |
| G04 | Additive canonical versions, one GLOBAL writer, generated/Ajv dependencies and zero generation drift verified. |
| G05 | Synthetic actual owning integration delivered; not helper-only. |
| G06 | Authenticated source/pair/scope/digest/CAS boundaries fail closed. |
| G07 | Preserved valid source/missing/duplicate/no-call/no-write assertions; exact fixture corrections documented. |
| G08 | Pinned humanizer-vi `576c80fb445a8b2e9ec1993a6490ab6529b89d12` SKILL/preservation rules read; neutral display labels only, no source quote or historical Vietnamese interpretation rewrite. Fake models do not certify prose quality. |
| G09 | Private author/key/profile/native reviewer metadata stays out of new model/report/API artifacts; free-text redaction is not claimed. |
| G10 | Historical default/adopted/literal/crosscheck/source22 replay and old byte equality preserved. |
| G11 | Scope, uncertainty, evidence status and pending counts remain explicit; no implicit approval or release. |
| G12 | Git-visible tested SHA/checks/hashes/leases/remaining coordinator work recorded; clean draft PR handoff. |
| G13 | Existing frozen keywords/exclusions remain unchanged; no new keyword collection/filter methodology claim. |

U03/U18 private default owning consumer slice is delivered locally. U11 statistics/crosscheck release, U26 policy, U32 platform/person aggregates and U40 paid/live staging remain blocked. Private binding2 crosscheck and owner reader25 support are **not delivered**; source-only22 and frozen reader support17/18/19/21/22 remain unchanged.

Unresolved: coordinator independent final-head review, full hosted exact-head Check and normal merge. No deployment or production acceptance is claimed.
Next action: review the exact pushed draft head and run mandatory hosted full checks; obtain a fresh scoped grant for any correction or later reader25/private-crosscheck work.

Delivery:

- Draft PR190: https://github.com/khangpworking/tdn-growth-os/pull/190 (base `main`). First clean pushed release head `b949c1583f10cad7387ad2d13656d75dca88aae5`; tested code checkpoint remains `5b6557b82b827a56e565483a754dc8a163bb760d`.
- Exact central/source and parent/child frontend releases sent in `msg_5dc26ee33353` with final stable source hashes. GLOBAL was previously released and fingerprints remain unchanged. No shared code edit after those releases.
- Final PR head includes only this delivery-note addition after the passing source/UI checks. Independent review and hosted full Check must target that final pushed head, reported in the fresh Task/Dispatch completion; worker does not merge PR190.

## Hosted API validator correction — current rates dispatch temporary lease

Task/Dispatch: `task_b9ce2846edee` / `ctx_b81427a0c853`, same sole run/coordinator. The original private task is settled; no old lifecycle is reused. Rates work is preserved separately at clean `a3fa23960e6ca474d66d968dcbe96b8485df5ec0`, with no rates source imported into this branch.

Coordinator reported hosted run `37845904378` at frozen `a9237fb567f85bc2c609d9d30cdd89bf653c2e7e` had a deterministic test-local `MissingRefError` in `tests/integration/research-automation-api.test.ts::apiValidators`, although the earlier focused private owning checks passed. The unchanged API suite reproduced the missing `private-insight-source-projection.schema.json#/$defs/binding` reference locally before the correction. Adding only that schema exposed the transitive `private-review-report-view.schema.json#/properties/corpus` dependency. The existing owning API uses `registerPrivateReviewSchemas`; review of that helper confirms it owns the complete canonical dependency chain.

The three-line test-local correction imports the existing private registry and projection schema, then registers them before compiling the existing API validators. Only that dependency-registration hunk and this handoff are leased. No assertion, canonical schema, generated output, generator, production source/service/API/UI, migration or dependency has changed. No generation or local full suite ran.

- Unchanged API + actual private owning suite: `node --import tsx --test --test-concurrency=2 tests/integration/research-automation-api.test.ts tests/integration/research-private-default-coding.test.ts` — **17/17 PASS**, 267.5 seconds. Log: `/tmp/tdn-private-api-validator-correction-final-tests.log`.
- Smallest strict affected-test TypeScript check, including imported production dependencies: `node_modules/.bin/tsc --noEmit --strict --noUncheckedIndexedAccess --exactOptionalPropertyTypes --target ES2023 --module NodeNext --moduleResolution NodeNext --resolveJsonModule --types node tests/integration/research-automation-api.test.ts` — **PASS**. Log: `/tmp/tdn-private-api-validator-correction-final-static.log`.
- Initial projection-only registration failed on the transitive report-view dependency; that failed bounded run also passed the three actual private owning tests. Log: `/tmp/tdn-private-api-validator-correction-tests.log`. Only the final 17/17 run is correction acceptance evidence.
- Pinned Node24.15.0/npm11.12.1, synthetic SQLite/CAS/fake transports/loopback HTTP only; no providers or model calls outside fake application transports. Existing private no-call/no-write retries, immutable HTML, privacy scans and source substitutions passed.
- Diff against `a9237fb567f85bc2c609d9d30cdd89bf653c2e7e` contains only this handoff and the three added test-registration lines. Canonical/generated/generator and production source blobs remain identical, with no generation drift claim needed because none ran.

Normal fast-forward push stays on existing draft PR190, with its exact corrected frozen head and path SHA-256 fingerprints reported through the current rates dispatch's explicit GLOBAL/AJV release. No old private worker_done is emitted and U04 is not settled by this temporary correction. Independent final-head review, full hosted exact-head checks and normal merge remain coordinator-owned; no CI/merge claim is made.

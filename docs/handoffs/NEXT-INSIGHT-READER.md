# Handoff — NEXT-INSIGHT-READER U28/U27/E6

Updated: 2026-10-09 (Asia/Ho_Chi_Minh)

Worktree/branch: `/home/pkhang/Applications/Orca.home/orca/workspaces/tdn-growth-os/ultimate-impl-sync1-codex`, `khangpworking/ultimate-insight-reader`.
Run/task/dispatch: `run_adc3551f8ed8` / `task_c24db5535f5a` / `ctx_29c19b97f3c5`.
Worker terminal: `term_7728757b-d524-4e29-8e11-5b9fb1242853`; coordinator: `term_f78f7d8d-0a0e-4b5d-8a29-1f7a4912317d`.
Preserved dispatched Sol/high launcher; no model/account/configuration changes or delegation.

Implementation head: `6bf702f2d287ee5b7d89efddf993dca85ca05c5b`.
Earlier reviewed reader implementation: `3ab0ac7f7d172a50950636e226be725bac12b717`; retained integrity/rebuild corrections: `6537156a42ef3229bdbb728b4a248c5504a04e52`.
Boundary-test head: `25bf5d16cb0ab1a5901e95ba643f764d477b685c` (same implementation, additional synthetic tests).
Reviewed main dependency: `b6b6911fd9cec16cc41cf24e7d8ae4abd8f6233b` (PR185), normally merged in `03f0b86`; no private worker WIP imported or squash-merged branch replay.

Completed:

- Actual owner-facing I01–I17 reader from independently verified retained Insight methods. Existing family17/source18/literal19 use input-v1/builder `reader-report-insight-v1`; reviewed default21/snapshot-v4 uses a separate input-v2/builder `reader-report-insight-v2`. Reviewed source-only private22 uses additive input-v3/builder `reader-report-insight-v3`, without coding, personas or inferred findings. Source renderer, snapshot and builder pairing fails closed. No Metric package, profile, intake or model task is required for an Insight-only reader build.
- The authenticated owner explicitly selects `draftPairId`, `semanticSha256` and `requestKey`. The owning service verifies the selected source and exact native/located/corpus/coding/literal/bounded/source/claims/I14/decision dependencies before composition. Keyword, requested period and definition come from authenticated frozen start/scope; generic renderer `semantic.sections` and `semantic.scope` are ignored.
- Kết luận chính contains unordered cited descriptive findings with evidence, status and scope. Numbers copy exact retained family fields; missing draft fields never become accepted-only zeros. Fewer than four findings produces an honest shortage. U11 release eligibility, inferred people, platform sums and causal conclusions are not introduced.
- I15 admits at most three retained AI proposals through the existing decision view, keeping owner options, hypotheses, sources, proposed owners/deadlines and approval boundaries. Missing methods and missing registry information stay visible. Stars, missing stars, textless records, identical text at separate locators and seller voice use the retained source-method views; source quotes/locators remain separate from interpretation.
- Shared `CitationRegistry`, citation ordering/register, publisher and visible-text gates are reused. The template clones the registry before ordering, so repeated builds preserve exact citation numbers and HTML. Hardcoded narrative numbers, missing citations, unsupported rankings, misplaced draft labels and more than three actions fail publication before artifact writes.
- One existing immutable reader ledger supports both kinds. Kind-specific sequence/latest/history and explicit immutable decisions prevent an Insight build from superseding a distinct Market page or transferring its approval. Historical Market v1 routes, request identities, report bytes and decisions remain intact.
- API: additive GET `.../reader-reports/v2`, OWNER POST `.../reader-reports/insight`, OWNER POST `.../reader-reports/decisions/v2`; existing saved HTML route and Market list/build/decision routes preserved. Exact Origin/Bearer authorization remains enforced. Saved reader GET returns verified retained HTML bytes only, with no-store/CSP and no source replay, calculation, collector/provider/model call or re-render.
- Frontend uses explicit kind selection, authoritative kind-specific history/version and exact source-pair selection. It requires no Market inputs for Insight, captures the exact revision/digest for decisions and clears selections/dialogs/in-flight responses when the run changes. Both reader builder versions are exercised.

Changed paths (relative to reviewed main):

- `contracts/analysis/insight-reader-input.{schema.json,generated.ts}`, `contracts/api/research-automation-reader-report-api.{schema.json,generated.ts}`, existing generator registrations and frontend validator declarations.
- `migrations/0050_analysis_reader_report_kinds.sql` only; no old migration edits, parallel ledger or runtime migration.
- `src/modules/analysis/reader-report/insight-{input-v1,build-v1,projection,template}.ts`; narrow opt-in additions to existing `build.ts`, `index.ts`, `layout.ts`, `lint.ts`.
- `src/modules/analysis/research-automation/reader-report-revisions.ts`; narrow verified-composition service and authenticated API dispatch in `service.ts` and `src/api/research-automation-api.ts`. No new report/model/source-evidence implementation.
- `frontend/src/research-automation/{ReaderReportPanel.tsx,reader-report-api.ts}`, focused frontend fixtures/mocks, synthetic reader helper and unit/integration tests.
- This handoff only; shared project status/decisions/docs remain coordinator-owned.

Evidence (Node24.15.0/npm11.12.1; focused test concurrency2):

| Check | Result / relevant head |
| --- | --- |
| `npm run typecheck` | PASS at implementation head and after boundary fixture changes |
| `node_modules/.bin/tsc -p frontend/tsconfig.json --noEmit` | PASS at `3ab0ac7` |
| `npm run contracts:generate`; `npm run frontend:validators`; repeated generation + `git status --short` | PASS, zero tracked drift at `3ab0ac7` before GLOBAL release |
| `node --import tsx --test --test-concurrency=2 tests/integration/insight-reader.test.ts tests/integration/insight-reader-api.test.ts tests/unit/insight-reader.test.ts tests/unit/insight-reader-input.test.ts` | **14 PASS**, zero skips/failures at boundary head `25bf5d1`; actual OWNER HTTP19/21, real service17/18, frozen-scope injection, source corruption/fresh-build rejection versus immutable GET/list/decision, exact identities/retries/citations/publication |
| `node --import tsx --test --test-concurrency=2 tests/integration/research-reader-report.test.ts tests/integration/insight-reader-migration.test.ts` | **11 PASS**, zero skips/failures at implementation head; real historical Market owning/API paths and populated pre0050 ledger rollback/FKs/constraints/triggers/both-kind isolation |
| `node --import tsx --test --test-concurrency=2 tests/unit/next-market-reader.test.ts tests/unit/reader-report-template.test.ts tests/unit/reader-report-build.test.ts` | **15 PASS**, zero skips/failures with unchanged implementation; fixed independent historical1.2/1.3 HTML/metric hashes, new Market renderer/build gates |
| `node --import tsx --test --test-concurrency=2 frontend/tests/insight-reader.test.ts frontend/tests/reader-unit-spec-intake.test.ts` | **7 PASS**, zero skips/failures at implementation head; both Insight builder versions, explicit source/owner action, exact receipts/history and run-change isolation plus old intake |
| Optional `reader-report-golden.test.ts` | One existing skip: `READER_REPORT_GOLDEN_DIR` not set; no private golden content read/copied and no acceptance inferred from this skip |
| `git diff --check` | PASS |

No local full suite, browser E2E, live application provider/model/collector, deployment, paid U40, private corpus/runtime DB/credential/config/cap access or change was performed. Fake transports and task-created synthetic SQLite/artifact data only. Test temporary files/processes are cleaned by the fixtures.

Migration evidence and recovery:

- Immutable0050 SHA-256: `f054576516a11471ef8a448a05ed9ee429a4686ab9e2839df9aaf9837ac0c3fe`, unchanged throughout this phase.
- The independently accepted concrete DDL extends the existing ledger with a kind and truthful optional Market fields, preserving populated historical rows/decisions/manifests byte-for-byte. Synthetic failed migration rolls back atomically; successful migration checks FKs, immutable triggers, gap-free per-kind sequences and independent latest decisions. Coordinator's `/tmp/ultimate-reader-0050-independent.mjs` evidence applies only to these exact DDL bytes.
- Recovery before promotion: revert this additive feature and migration together. No runtime data was migrated; production rollout/downgrade is not authorized or claimed here.

Leases:

- Independent reader/template/build/ledger/frontend/tests ownership was explicitly regranted for this dispatch.
- Original canonical/DDL checkpoint was committed at `ab1eecdffe17042207ffc360fbd21391a295be2f`, then released. Subsequent validator declaration phase was separately released.
- `msg_deb6866f3c7b` granted exact reviewed-main reconciliation; `msg_34e234dcd8f4` granted narrow central source/API integration; `msg_1dcbd9604c2f` granted additive retained default21 input-v2/revision union only.
- Central service/model/reports/API and GLOBAL schemas/generated/generators/AJV/browser/migration leases **explicitly RELEASED** in `msg_cb4aff37599a` at clean pushed `3ab0ac7f7d172a50950636e226be725bac12b717`, accepted by coordinator in `msg_458c8e347dcc`. Subsequent work is independent tests/handoff only. Fresh explicit grant is required for further central/GLOBAL changes.

Vietnamese prose:

Pinned `humanizer-vi` revision `576c80fb445a8b2e9ec1993a6490ab6529b89d12` from `https://github.com/longhang2004/vietnamese-humanizer`, skill `skills/humanizer-vi`, was read with preservation/register rules from the task-local clone. Reader interpretation/caveats use neutral analytical wording; suitable retained views remain unchanged. Quotes, numbers, units, identifiers, source attribution, uncertainty, counterevidence and missing-data limits are preserved. This is not application prompt integration or historical report rewriting.

Unresolved:

- Independent final review and full hosted `npm run check` / report-preview evidence on the exact final PR head are coordinator-owned release gates. Local focused results do not establish hosted release approval.
- Private source-only renderer22 is now integrated from reviewed merged main184 under the precise serial grant below. Private default coding and personas remain unsupported; no unreviewed worker commit was imported.
- Existing source/method gaps remain honest; this is supported retained-method reader integration, **not blanket U28/U27/P8 completion**, private default coding or persona completion.
- U11 statistic/release, U26 policy and U32 sums remain blocked; paid/live U40 remains separately unauthorized.

Next action:

Coordinator independently reviews the exact draft PR head and the owning service/API/source reconstruction, confirms exact hosted full checks, and performs any eligible normal merge. Worker never merges. Apply review corrections only on explicitly owned paths or after a fresh serial grant; preserve0050 and all historical Market bytes/decisions.

Business decisions pending: unchanged U11/U26/U32 owner-decision blockers; no new methodology or authorization inferred.

## Hosted CI correction — 2026-10-09

Frozen source-review candidate `d2bc0b9691b6fd7f97a8de59fb5b0acbebfac7a4`, draft [PR186](https://github.com/khangpworking/tdn-growth-os/pull/186), failed hosted [Check37826718467](https://github.com/khangpworking/tdn-growth-os/actions/runs/37826718467). Frontend: 273 PASS. Backend: 1393 tests, 1380 PASS, 10 FAIL, 3 declared skips. Each failure was an exact final migration expectation of49 versus intended additive0050/version50; this failure is not waived or presented as a full-suite pass.

Coordinator `msg_80bacfc00dc4` explicitly granted test/handoff-only correction of the ten affected files. Commit `f5995c840bf04d4c2c4ba8a85527ec0dfe1edcd4` updates only final currentVersion/user_version expectations and appends50 to exact applied/history lists in:
`content-ai-migration.test.ts`, `content-brand.test.ts`, `content-campaign-migration.test.ts`, `content-catalog.test.ts`, `content-insight-migration.test.ts`, `content-package-migration.test.ts`, `content-prompt.test.ts`, `shopee-file-research.test.ts`, `source-package-intake.test.ts`, `sqlite-foundation.test.ts` under `tests/integration/`.

All prior migration hashes, structural/table/trigger/FK/legal-state/idempotency/rollback assertions are unchanged. No production, central, schema, generation or DDL edits. Migration0050 SHA remains `f054576516a11471ef8a448a05ed9ee429a4686ab9e2839df9aaf9837ac0c3fe`.

Pinned `node --import tsx --test --test-concurrency=2` on those exact ten files: **87 PASS, zero failures/skips**, 16.36s; task-local log `/tmp/insight-reader-ci-migration-correction.log`. `git diff --check` PASS. Independent reviewer must verify this precise test-only delta and the final head in addition to frozen source review; a fresh full hosted exact-head Check remains required. Central/GLOBAL leases remain released.

## Independent review corrections — retained envelope and rebuild keys

Coordinator grants `msg_10f44bd04c0a` and `msg_a43dc3b141f7` addressed independently reproduced findings, rather than waiving them. Correction implementation: `6537156a42ef3229bdbb728b4a248c5504a04e52`.

- P1: saved Insight GET authenticated HTML only; exact retry authenticated only ledger/request metadata. Both now authenticate the retained build record and HTML through query-only reads: active manifests, CAS digest, byte size, media type, relative path/status, canonical build-record bytes, existing canonical Insight input validation, and exact revision/workspace/run/pair/semantic/source/builder/request/actor/time/HTML binding. Retry also compares frozen input to the owning service's verified exact input after the request-conflict guard. No source replay or re-render on saved GET, no manifests/writes/model/calculator/provider calls. Market read/retry behavior is unchanged.
- P2: mounted Insight builds kept a settled source's requestKey forever, so a deliberate rebuild after rejection replayed the old revision. The panel now retires only a successfully validated build receipt's key. Lost response, unconfirmed/error and invalid-receipt attempts preserve the exact body/key; a subsequent explicit action after verified success gets a new key. Market file flow and decision-key semantics are unchanged.

Evidence:

- Original independent `reader-adversarial.test.ts` SHA-256 `614588ed201625bef6094d51b9e0f34174ce9268d57b5a190583d771f7ea079d` remained unchanged: **5/5 PASS**, no skips/failures. A task-local Node resolution hook maps only its absolute fixture import to this candidate checkout; assertions and reviewer worktree remain untouched. Command: pinned `node --import /tmp/insight-reader-review-hook.mjs --import tsx --test --test-concurrency=2 /tmp/ultimate-insight-reader-final-review-sol/reader-adversarial.test.ts`; log `/tmp/insight-reader-adversarial-fixed.log`.
- Original independent mounted frontend script, copied with checkout paths retargeted only (no assertion changes): **3/3 PASS**, including StrictMode cancel, rejected rebuild and unmount. Pinned `node --import tsx --test --test-concurrency=2 /tmp/insight-reader-frontend-adversarial-retargeted.test.ts`.
- Actual OWNER HTTP19/21 plus source reconstruction/immutable-read tests and real historical Market service/API: **18/18 PASS**, no skips/failures. HTTP now corrupts retained input and HTML independently, rejects GET/retry, confirms no ledger/manifest/decision writes or transport/model calls, checks request conflict ordering and restores exact bytes before byte-equal GET/retry. Command: `node --import tsx --test --test-concurrency=2 tests/integration/insight-reader-api.test.ts tests/integration/insight-reader.test.ts tests/integration/research-reader-report.test.ts`; log `/tmp/insight-reader-retained-integrity-focused.log`.
- Frontend owned Insight/intake tests: **8/8 PASS**, including lost-response retry, wrong receipt retaining the key, validated retry retiring it and explicit rejected-reader revision2. Backend strict typecheck and direct frontend tsc PASS; `git diff --check` PASS.
-0050 remains byte-identical at `f054576516a11471ef8a448a05ed9ee429a4686ab9e2839df9aaf9837ac0c3fe`. Only ledger/frontend/tests/own handoff changed in this correction; no service/API/GLOBAL/canonical/generation/DDL edits.

These are worker follow-up results. Independent reviewer still must reproduce against the final corrected head and inspect this delta; fresh full hosted CI is required. No merge or worker completion is inferred from the original failed frozen review.


## Reviewed-main private22 source-only integration — 2026-10-09

Coordinator `msg_273a8477f094` granted sole GLOBAL and the exact service reader hook after all prior shared owners explicitly released. Normal merge of reviewed main184 `e4b78f01b573d8284235fe06e693d587ffaabca7`: `7c3235f28baf4fafb45c8432a3dd049132300a31`. Both the reader corrections at `edd040fd39edca64bad7ac157002c8de48a8abd9` and reviewed default/private/Market implementations are preserved; no WIP import or replay of squash-merged worker heads.

- Additive canonical `insight-reader-input-v3` / `reader-report-insight-v3` binds renderer22 and exactly one `PRIVATE_CORPUS` reference, the canonical digest of the independently reconstructed author/key-free view. The view's existing corpus digest binds the retained source; the reader input copies no corpus or private identities. Only verified literal and source-evidence references are otherwise admitted. Old input-v1/v2 and every old API definition remain equal to `edd040f`; the existing revisionV2 union has one additive v3 branch. Existing request/receipt/decision/build-record contracts and endpoints remain unchanged.
- The granted service change adds22 to `#readVerifiedReport`'s reader allowlist and passes only `verifiedPrivateView`, rebuilt from exact retained source/corpus/run/scope and compared by canonical equality. Existing private corpus, literal and sourceAppendix replay remain intact. The existing S05/capture binding reaches I17 through shared `sourceEvidenceHtml` and `CitationRegistry`; no source registry implementation is duplicated.
- The owned composer selects only the verified private view, literal evidence and source registry for22, rejecting legacy corpus/native/located/coding substitution. I03/I17 reuse `privateReviewCorpusSection`; literal stars/missing/textless/duplicate/seller views retain their original semantics. Generic retained opportunity/decision packets stay outside this source-only reader: no inferred findings, I14 interpretation, I15 proposals, author joins, people counts, personas or private default coding. Remaining sections and Kết luận chính show truthful missing/shortage states.
- Existing ledger projection admits v3; savedHTML continues query-only verification of frozen retained record+HTML, without opening upstream sources or rendering. No ledger/DDL/cap/endpoint/model/collector changes. Migration0050 remains SHA256 `f054576516a11471ef8a448a05ed9ee429a4686ab9e2839df9aaf9837ac0c3fe`.
- Owned synthetic helper `tests/helpers/insight-reader-private-fixture.ts` follows the reviewed fake private collector path, producing source-only22 and explicit literal22 without Metric/profile/intake/model requirements. `tests/integration/insight-reader-private-api.test.ts` exercises actual authenticated OWNER POST, immutable HTML GET, v2 history, exact retry and decisions; wrong auth/origin/workspace/run/pair/digest/Market input, retained record/HTML corruption, source-only substitutions, absence of private identity metadata and source-damage-versus-frozen reads. Fresh builds/retries reject damaged upstream, whereas savedGET/list/decision authenticate frozen reader artifacts. No extra provider calls or mutation on reads/exact retries.

Failures inspected and corrected without weakening valid assertions:

1. New source-only guard initially rejected auto reports' generic retained sourceClaims/I14/decision packets. Explicit projection now omits those packets; their existence does not invent reader interpretation. The first400 was misidentified as another service allowlist; request `msg_539fe3a0d9d7` was withdrawn in `msg_348ae5fec169` after inspecting the existing catch. No additional central hunk was edited or granted.
2. New v3's narrower retainedMethods union exposed TypeScript array-intersection inference. Composer uses a union element derived from canonical generated types; the v1 fixture is narrowed to its existing canonical discriminant. No duplicate type system or schema weakening.
3. New scope test incorrectly expected frozen start's `dayCount` in the canonical reader period, which intentionally stores exact start/end dates only. Its assertion now compares the canonical period's exact fields; source dates and periods remain unchanged.

Focused evidence (Node24.15.0/npm11.12.1, concurrency2):

- Actual private22 OWNER/API and canonical input negatives: **5 PASS**, zero failures/skips; `/tmp/insight-reader-private-v3-focused.log`.
- Bounded backend regression: **54 PASS**, zero failures/skips; `/tmp/insight-reader-private-v3-regression.log`. Includes actual OWNER19/21/22, family17/18, retained integrity/source damage, shared citations/lint/publication negatives, historical real Market service/API/approval, fixed historical Market hashes, populated0050 migration/rollback/FKs/triggers, merged private consumer/retry and old private corpus/marker-free report hashes.
- Backend strict typecheck and direct frontend tsc PASS. Canonical/browser generation completed and repeated; no tracked generated drift beyond the two intended additive canonical outputs, no emitted frontend declaration change.
- Old canonical definitions deep equality against `edd040f` PASS, with only the authorized revisionV2 union addition; incoming reports/model/private source/literal/sourceAppendix implementations are byte-equal to reviewed main184. `git diff --check` PASS.

Frontend final evidence, exact implementation checkpoint and lease-release receipts follow below. Full hosted CI and independent review for the composed head remain mandatory; `edd040f`'s successful full37829260746 attempt2 and independent150-PASS review do not cover this new composed delta. Worker never merges. No runtime data, private corpus, live application providers/models/collectors, credentials/config/caps, deployment or paidU40 were accessed or changed. U11/U26/U32 remain blocked.

Frontend Insight/intake: **9 PASS**, zero failures/skips, including explicit mounted builder-v3/source selection/owner decision flow and preserved uncertain-retry versus deliberate rebuild semantics; `/tmp/insight-reader-private-v3-frontend.log`. Repeated canonical/browser generation compared every generated output byte-for-byte with zero drift.


Stable composed implementation: `6bf702f2d287ee5b7d89efddf993dca85ca05c5b`, clean and pushed to draft PR186. GLOBAL explicitly RELEASED in `msg_95c4e473eeb0`; central service explicitly RELEASED in `msg_303d1ea61712`, both at that exact checkpoint. Only own handoff/PR metadata updated after release. No shared/canonical/generated/generator/AJV/browser/migration/API/service/model/dispatcher writes without a fresh precise grant.

Scoped SHA256 at release:

- `contracts/analysis/insight-reader-input.schema.json`: `4124eaa05a188465db2e53b31801746a073a2f4472bf54a306f0a15e1697521c`.
- `contracts/api/research-automation-reader-report-api.schema.json`: `f78d30926573f07c1707531434f88d52e869e314890084df6045506a0f61acd5`.
- `src/modules/analysis/research-automation/service.ts`: `c35a96d6d5ccc0704eacfe507d75e66072f1d061bd06bff8a78b16b884c3f18e`.

Next: independent review and full hosted exact-head CI for this composed final candidate, then coordinator-owned eligible normal merge. No helper-only settlement or blanket Ultimate completion is claimed. The worker remains available under this dispatch until the coordinator concludes the original integration phase.


## Reviewed main187 crosscheck prerequisite composition — 2026-10-09

Fresh private follow-up task `task_0254b7e8d058` / `ctx_7e7c397355e0` temporarily owns this reader prerequisite under explicit sole GLOBAL/central grant `msg_513dac454443`. Private work is committed and preserved on `khangpworking/ultimate-private-default-coding-sol` at `34d6c3a416b5c140a665742e235c8a06c6bc389e`; **none of that WIP enters this reader candidate**. Original reader59 remains the merge parent, not an obsolete branch replay or squash-merged implementation.

Normal merge of exact reviewed main187 `5f38281680a51bae1c49539060d655e093789f2f` had one conflict: `src/api/research-automation-api.ts` route allowlist. Resolution is the precise union of reader OWNER insight build/decision-v2/list-v2 and incoming crosscheck OWNER preparation/read/availability routes. Service and all canonical/generated/generator modules auto-merged. No method, source policy, cap, ledger or migration changes. Incoming private22 and default21/23 literal verification branches remain intact; crosscheck23 source/report/read/retry retains the incoming reviewed implementation.

Reader still supports exact17/18/19/21/22 only. This composition **does not add reader23 crosscheck interpretation** or private default coding/renderer25. Unsupported versions fail the existing reader gate rather than being reinterpreted under historical builders. Coordinator informed in `msg_dda581d4d6c2`.

Byte equality verified:

- Against original59: reader input/API schemas, insight input/projection/template, reader ledger, ReaderReportPanel and migration0050 unchanged. Input/API hashes remain `4124eaa05a188465db2e53b31801746a073a2f4472bf54a306f0a15e1697521c` / `f78d30926573f07c1707531434f88d52e869e314890084df6045506a0f61acd5`. Migration0050 remains `f054576516a11471ef8a448a05ed9ee429a4686ab9e2839df9aaf9837ac0c3fe`.
- Against incoming reviewed187: reports.ts, model.ts, private-review-corpus.ts, insight-coding.ts and insight-model-execution.ts exactly equal. The only service diff relative to main187 is preserved original reader integration; API conflict adds no semantics outside the union.
- Existing canonical/browser generators PASS; zero unstaged generated drift across contracts/frontend declarations. Strict backend typecheck and direct frontend TypeScript check PASS.

Focused owning backend and frontend acceptance is running at pinned Node24.15.0/npm11.12.1, concurrency2; final results, frozen composed SHA and explicit lease release follow. No full local suite, runtime/provider/model data, live calls, deployment or configuration changes. Original59 review/CI is not approval of this composed head; fresh independent review and full hosted exact-head Check remain required.

Final affected checks for this composed reader checkpoint:

- Backend **53 PASS, 0 FAIL/SKIP**, 127.9s: exact reader input/template gates, actual OWNER19/21/22 build/read/list/decision/retry, source/digest corruption negatives, populated0050 migration/rollback/FKs/triggers, private22 source-only/literal/KEEP replay, historical raw/private report SHA256, historical Market owning service/API, crosscheck23 execution/source lineage/read/retry and default/native/adopted compatibility. Log `/tmp/tdn-reader187-focused.log`.
- Frontend **10 PASS, 0 FAIL/SKIP**, 76.0s: mounted explicit reader builders-v1/v2/v3 OWNER flows/retry/rebuild, unit-spec intake and incoming crosscheck action/read/confirmation flow. Log `/tmp/tdn-reader187-frontend-focused.log`.
- Backend strict typecheck and direct frontend tsc **exit0**, logs `/tmp/tdn-reader187-typecheck.log`, `/tmp/tdn-reader187-frontend-tsc.log`. Canonical/browser generators exit0; zero generated drift, logs `/tmp/tdn-reader187-generation.log`, `/tmp/tdn-reader187-validators.log`. Working/staged whitespace PASS. No test assertion, fixture or original fingerprint was changed for this composition.

All checks used fake transports/synthetic SQLite/CAS and pinned Node24.15.0/npm11.12.1, focused concurrency2. No full local suite. Incoming crosscheck/provider configuration remains opt-in and no live provider was activated. Private default source WIP stayed outside this branch. Freeze/push and explicit GLOBAL/central release receipts are sent through the fresh dispatch, followed by return to the preserved private branch. Coordinator owns fresh independent composed-head review, full hosted exact-head CI and normal merge; no eligibility inferred from original59 CI/review.

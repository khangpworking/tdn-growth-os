# Handoff — NEXT-INSIGHT-READER U28/U27/E6

Updated: 2026-10-09 (Asia/Ho_Chi_Minh)

Worktree/branch: `/home/pkhang/Applications/Orca.home/orca/workspaces/tdn-growth-os/ultimate-impl-sync1-codex`, `khangpworking/ultimate-insight-reader`.
Run/task/dispatch: `run_adc3551f8ed8` / `task_c24db5535f5a` / `ctx_29c19b97f3c5`.
Worker terminal: `term_7728757b-d524-4e29-8e11-5b9fb1242853`; coordinator: `term_f78f7d8d-0a0e-4b5d-8a29-1f7a4912317d`.
Preserved dispatched Sol/high launcher; no model/account/configuration changes or delegation.

Implementation head: `3ab0ac7f7d172a50950636e226be725bac12b717`.
Boundary-test head: `25bf5d16cb0ab1a5901e95ba643f764d477b685c` (same implementation, additional synthetic tests).
Reviewed main dependency: `b6b6911fd9cec16cc41cf24e7d8ae4abd8f6233b` (PR185), normally merged in `03f0b86`; no private worker WIP imported or squash-merged branch replay.

Completed:

- Actual owner-facing I01–I17 reader from independently verified retained Insight methods. Existing family17/source18/literal19 use input-v1/builder `reader-report-insight-v1`; reviewed default21/snapshot-v4 uses a separate input-v2/builder `reader-report-insight-v2`. Source renderer, snapshot and builder pairing fails closed. No Metric package, profile, intake or model task is required for an Insight-only reader build.
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
- Private renderer22 remains unsupported until its bridge and retry correction are independently reviewed/merged and a precise serial extension is granted. No unreviewed private worker commit was imported.
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

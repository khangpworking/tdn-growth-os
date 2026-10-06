# P1.1 source isolation handoff: first slice

Latest checkpoint: explicit source/version UI below extends the historical
first-slice evidence. This remains uncommitted, unreleased work, not a finished
P1/R1 handoff.

Checklist: P1.1 in `docs/tasks/research-automation-execution-plan-v2.vi.md`.
This is partial work; do not tick P1.1. Base is `0116091` on
`fix/research-real-world-audit`. The changes are uncommitted.

Claude authored the changes without running Windows tests, typechecks or builds.
GPT independently audited the owner paths and ran the following on an isolated
Fedora copy, using Node 24.15.0 and dependencies with the identical pinned lockfile.
No active operator, private database, provider or model was invoked by these checks.

## Verified Linux evidence (GPT, 2026-10-03)

- Backend typecheck: PASS.
- Owning intake/Metric/native integration tests: 20/20 PASS, no skips.
- Metric-report, exact-review, manual-generation and preparation siblings:
  19/19 PASS, no skips.
- Independent regression control: both new tests were run with the same test
  bytes but baseline production `0116091`. Both failed for the intended reason:
  Metric global enumeration raised `METRIC_SOURCE_RESOLUTION_FAILED`; native
  global enumeration reported `SOURCE_PACKAGE_RESOLUTION_FAILED` for the unrelated
  damaged package. The repaired production passed both in the owning suite.
- `git diff --check`: PASS at this checkpoint.

This evidence applies to the first P1.1 slice only. It does not verify subsequent
P1.2 edits, a full release, exact native admission, manual attachment exclusion,
live three-case content or deployment. P1.1 remains unchecked.

## Changed paths

- `src/modules/foundation/source-package-service.ts`
  - Adds `FinalizedSourcePackageEntry`.
  - Adds `findFinalizedSourcePackagesByKey`, which returns every finalized
    version of one exact key.
  - Adds `findFinalizedSourcePackagesByMembership`, which matches one version
    plus an exact file set.
  - Both lookups read only immutable package and file rows, with no artifact
    reads. Each rejects with a validation error past 100 rows, the same local
    enumeration limit as the listing.
- `src/modules/foundation/source-package-reader.ts`: the declared
  `FinalizedSourcePackageLookup` interface, implemented by
  `FoundationSourcePackageReader`.
- `src/modules/foundation/index.ts`: type exports.
- `src/modules/analysis/research-automation/metric-method-bridge.ts`: `#resolve`.
- `src/modules/analysis/research-automation/native-source-review-bridge.ts`:
  `resolve`.
- Tests:
  - `tests/integration/research-automation-metric-methods.test.ts`
  - `tests/integration/research-automation-native-reviews.test.ts`
  - `tests/integration/source-package-intake.test.ts`

Untouched:
- migrations;
- contracts;
- the UI;
- orchestration and the service;
- `report-generation-service.ts`;
- STATUS, the plan, the inventory and the matrix.

## The three callers of the global listing

| Caller | Before | Now |
| --- | --- | --- |
| Metric `#resolve` | Fully verified every non-method package (cap 100), then matched the key | Exact key lookup; only the match is verified |
| Native `resolve` | Fully verified every non-method package (cap 100), then filtered for v3 | Metadata candidates: v3 with exactly the 15 `NATIVE_PATHS`; only candidates are verified |
| Manual inventory (`ReportGenerationService.inputs`) | Full verification, cap 100, excludes `automation-method:*` | Unchanged |

## Behavior handled

### Metric

Lookup is by the run key `automation-metric-source:<runId>`.

- **No row:** `undefined`, which means not attached. No writes.
- **Two or more versions of the key:** fails as `ambiguous`. One version is
  never chosen silently.
- **One row whose version is not 1:** fails as `unsupported`. The package is
  rejected before it is read.
- **One v1 row:** read with `readVerified` under the existing budget. The
  manifest digest, key and version are compared with the lookup. Any failure
  becomes `METRIC_SOURCE_RESOLUTION_FAILED`; failure is never treated as
  absence.
- **Other packages:** attachments of other runs, manual packages, method
  bundles and damaged packages are neither read nor counted.
- `verify()` and historical replay are unchanged: they read only the frozen
  IDs.

### Native

This is still discovery, not admission. The code comment says so explicitly.
Native packages have no run-bound key and no stored admission reference.

- **Candidates:** only finalized rows with version 3 and exact `NATIVE_PATHS`
  membership. The existing key rule (excluding `automation-method:` and
  `private-method:`) is applied before reading.
- **Each candidate** is fully verified. These existing checks are unchanged:
  - `originalNativeFormat`;
  - listing and mapping;
  - prior v2;
  - located extension.
- **A damaged candidate** gives the `SOURCE_PACKAGE_RESOLUTION_FAILED` blocker
  with no paid fallback, as before.
- **More than 100 candidates:** the lookup rejects, with the same blocker. The
  cap value is unchanged; it now counts only candidates.
- **Packages of any other shape** are not read or counted. This covers Metric
  attachments, manual packages, method bundles, derived overlays and damaged
  packages.
- **Supersedes an old note:** `research-native-review-automation.md` says a
  corrupt unrelated package can block. That now applies only to
  native-shaped candidates.
- **Behavior difference:** a damaged package of exactly native shape whose key
  starts with `automation-method:` or `private-method:` no longer blocks. Such
  a package was always skipped after a successful read anyway.
- `readReference`, `execute`, `verify` and `readSnapshot` are unchanged: exact
  by the frozen packageId and identity.

### Manual inventory

Unchanged:
- the 100 cap;
- full verification of every package counted;
- the existing exclusion of `automation-method:*`;
- the label.

Historical packages with unknown provenance stay visible. This includes keys
that only look like run attachments.

## Gaps for the later slice (P1.3/P1.5a): concrete needs, not edited

### 1. Native admission reference

This needs a durable record written by a server-side admission/attach service
after the existing listing, version, manifest and prior checks. Candidate
fields:
- runId or a scope binding;
- packageId;
- manifestArtifactSha256;
- packageContentSha256;
- the selected listing.

COLLECTION would then read that exact reference instead of discovering it. The
record needs either a contract change or a new Analysis table in a migration.
GPT owns that.

### 2. Attachment record so the manual inventory can exclude attachments before counting

Today `automation-metric-source:<runId>` v1 attachments:
- still count toward the manual cap of 100;
- can appear as manual choices when their Metric manifest is valid.

Exclusion needs a record written only after the descriptor contract and the
real run binding are verified. The manual inventory would then pass the
verified packageIds to a Foundation listing that excludes them before counting.

Without that record any exclusion would be name matching, which is not allowed.
The SQL tables in 0038 have no package column, so there is nowhere to record
it.

The `automation-method:*` GLOB is pre-existing behavior. It was not replaced in
this slice.

### 3. Other open items

- **P1.3:** server-built attachment and descriptor; who writes the attachment.
- **P1.2:** the failure classes are not separated yet. The service still
  collapses every Metric error into `METRIC_METHOD_FAILED`.

## Authored tests (subsequently run by GPT on Linux)

| Test | Behavior owned | Fails on pre-fix code? |
| --- | --- | --- |
| metric-methods: `run-attached Metric resolution reads only its exact key...` | More than 100 attachments of other runs plus one damaged unrelated package; snapshot freezes the correct original identity | Yes: the listing exceeds 100 or hits the integrity error, giving `METRIC_SOURCE_RESOLUTION_FAILED` |
| metric-methods: `explicit attachment only...` (extended) | Damaged exact attachment gives `METRIC_SOURCE_RESOLUTION_FAILED` with no writes; v1 beside v2 is ambiguous | No: guards the new resolver against treating failure as absence or picking only v1 |
| native-reviews: `a damaged package of another shape cannot block...` | A damaged unrelated package does not block; the frozen `nativeSource.sourcePackage` matches the seeded original; 0 provider calls | Yes: pre-fix gives `SOURCE_PACKAGE_RESOLUTION_FAILED` |
| native-reviews: `damaged-original` mode in the table | A damaged candidate blocks with no paid fallback | No: guards the narrowed lookup against falling back |
| source-package-intake: manual inventory (extended) | Historical package with a look-alike attachment key, no marker, stays visible and keeps its label | No: guards against name-based exclusion |

Suggested bounded negative checks, each in a separate Linux copy:
- In Metric `#resolve`, turn a read error into `return undefined`. The damaged
  case should fail.
- In Metric, look up only version 1. The ambiguous case should fail.
- In native, `continue` when a candidate read fails. `damaged-original` should
  fail.
- Add `NOT GLOB 'automation-metric-source:*'` to the listing. The intake test
  should fail.
- Restore native to the global listing. The damaged-unrelated test should fail.

## Linux commands

```sh
npm run typecheck
node --import tsx --test tests/integration/source-package-intake.test.ts \
  tests/integration/research-automation-metric-methods.test.ts \
  tests/integration/research-automation-native-reviews.test.ts
# siblings on the same owners
node --import tsx --test tests/integration/research-automation-metric-report.test.ts \
  tests/integration/research-automation-exact-reviews.test.ts \
  tests/integration/report-generation-service.test.ts \
  tests/integration/metric-input-preparation.test.ts
```

The Metric tests need `python3` for `tests/fixtures/metric-workbook.py`, as
before.

# P1.2 Metric failure reasons: separate slice

Checklist: P1.2 in `docs/tasks/research-automation-execution-plan-v2.vi.md`.
This is partial, uncommitted work on top of the P1.1 slice above (base
`0116091`); do not tick P1.2. Claude authored it without running any test,
typecheck or build, on Windows or elsewhere. **Nothing in this section has been
verified by the author yet.** The earlier GPT evidence above covers only the
P1.1 slice. The coordinator's later validation is recorded at the end below.

This subsection supersedes the P1.1 open item "P1.2: the failure classes are not
separated yet". The P1.1 text is left as GPT verified it.

## Changed paths (P1.2 only)

- `src/modules/analysis/research-automation/metric-method-bridge.ts`
  - Adds `METRIC_METHOD_FAILURE_CODES`, `MetricMethodFailureCode`,
    `MetricMethodFailure` (a `ResearchAutomationIntegrityError` subclass with a
    closed `code`) and `metricMethodFailureCode(error)`.
  - Throws the subclass only at the sites listed in the table below.
- `src/modules/analysis/research-automation/service.ts`: four lines. The import;
  the `metricMethodsFailure` type in `ResearchAutomationReportInput` and the
  local variable; the catch now stores `metricMethodFailureCode(error)` after
  the unchanged `controller.signal.throwIfAborted()`.
- `src/modules/analysis/research-automation/reports.ts`: widened input type; a
  fixed per-code copy table used for the M03/M04 explanation and the appendix
  warning.
- `tests/integration/research-automation-metric-methods.test.ts`
- `tests/integration/research-automation-metric-report.test.ts`
- This handoff.

Untouched in P1.2:
- the P1.1 Foundation files and the native bridge;
- `model.ts`;
- contracts and JSON schemas;
- migrations, dependency manifests, CSS, fonts and report-kit layout;
- STATUS, the plan, the inventories and the matrix.

## Closed codes and where each is established

Classification uses `instanceof` and the typed `MetricSourceRejection.code`
field only, never exception messages. Only the code crosses into the semantic
document and HTML. Exception text, paths, SQL, owner messages and the Python
reader's own diagnostic code are never stored or shown.

| Code | Established at | Evidence |
| --- | --- | --- |
| `METRIC_SOURCE_AMBIGUOUS` | `#resolve` | More than one finalized version of the exact run key |
| `METRIC_SOURCE_UNSUPPORTED` | `#resolve`, `selectSource`, `execute` | Attachment version not 1; descriptor invalid or non-canonical; package membership or roles not admitted; Metric manifest fails the current schema, including an unknown `profileId` |
| `METRIC_SOURCE_INTEGRITY_FAILED` | `#resolve` | Foundation read raised `ArtifactIntegrityError` or `FoundationIdentityConflictError`; or the verified identity differs from the metadata lookup |
| `METRIC_SOURCE_RUN_MISMATCH` | `selectSource` | Descriptor runId, workspace, run binding digest or keyword differs from the confirmed run |
| `METRIC_SOURCE_PERIOD_CONFLICT` | `declaredPeriodCoverage` | Declared (and later normalized) source dates are not inside the requested period. Nothing is cut, extended or prorated |
| `METRIC_SOURCE_INPUT_REJECTED` | `execute`, around `prepare` | Profile owner raised `MetricSourceRejection` with any code except `OFFLINE_READER_UNAVAILABLE_OR_LIMIT` |
| `METRIC_CALCULATION_FAILED` | `execute`, `assertBoundedState` | Prepared input, replayed artifacts or the published method package differ; or the result is not in its bounded ALL-calculated, WIDE/CORE-blocked state |
| `METRIC_METHOD_FAILED` | `metricMethodFailureCode` | Generic fallback for everything else |

These failures keep the generic `METRIC_METHOD_FAILED` on purpose:
- metadata lookup failure;
- `SourcePackageReadLimitError`;
- a missing artifact file (raw `ENOENT`);
- `FoundationValidationError`;
- workspace, preparation validation and preparation integrity errors;
- path collision and the byte bound;
- missing confirmed scope;
- method package intake errors;
- an unavailable, timed-out or over-limit local Python reader.

The owners do not type a reliable reason for any of these. No
unavailable-authentication or unavailable-source category exists or is inferred.

## Implementation choices

- `MetricMethodFailure` extends `ResearchAutomationIntegrityError`, so existing
  integrity handling and the fail-closed rule are unchanged. Absence still
  returns `undefined` with no code.
- `metricMethodFailureCode` is the production mapping used by the service. It is
  not a test seam.
- **Cancellation:** unchanged. The catch calls `throwIfAborted()` before
  classifying.
- **Independent Insight:** unchanged. Metric still has its own try block.
- **Historical replay:** `verify()` accept/reject outcomes are unchanged. It
  shares `selectSource`, `periodCoverage` and `assertBoundedState`, so it can
  now throw the subclass. One message changed: a missing descriptor in replay
  now reads "descriptor invalid" instead of "retained file is missing". Both are
  integrity errors.
- **Stored reports:** `readReport` still serves stored bytes and verifies only a
  non-null `metricMethods`. Stored `METRIC_METHOD_FAILED` reports are not
  re-rendered or reclassified.
- **Generic copy:** the explanation and appendix warning for
  `METRIC_METHOD_FAILED` are byte-identical to the previous output.
- **Renderer version:** `rendererVersion` currently stays `automation-report-kit-v7`
  and the semantic `contractVersion` is unchanged. Generic failure copy and stored
  report bytes are preserved, but new renders of previously generic failures can
  now have a specific explanation. This is not a claim that every previously
  reachable input renders identically. The coordinator must resolve the new-writer
  renderer identity before the release; historical stored versions remain unchanged.
- **Copy and styling:** copy sits in the existing `<p>` and
  `<p class="warning">` elements and is HTML-escaped. There are no layout, font
  or CSS changes.
- **Copy guidance:** the author did not load UI/copy skills for this slice.
  That does not establish that none applies: coordinator-level Antislop and
  Impeccable guidance is available for report/UI work. The Vietnamese wording is
  a draft; the existing visual direction and report-judge acceptance still apply.

## Gaps

- `METRIC_CALCULATION_FAILED` has no test. No credible trigger exists without a
  test-only production seam, and the calculator is deterministic.
- `METRIC_SOURCE_INTEGRITY_FAILED` is tested only through
  `ArtifactIntegrityError` (damaged bytes). These branches are untested:
  - `FoundationIdentityConflictError`;
  - the identity-after-lookup comparison.
- A Python reader crash or signal kill with unparsable stderr is reported by the
  profile owner as `INVALID_XLSX`. It is therefore counted as
  `METRIC_SOURCE_INPUT_REJECTED`. The bridge cannot tell it apart from a corrupt
  workbook.
- The profile's own `SCOPE_PERIOD_MISMATCH` (platform, or manifest start after
  end) maps to `INPUT_REJECTED`, not `PERIOD_CONFLICT`. `PERIOD_CONFLICT` means
  only the conflict between the declared or normalized period and the request.
- A missing artifact file (`ENOENT`) is arguably damage, but stays generic
  because Foundation does not type it.
- `research-generation-api.ts` maps `MetricSourceRejection` independently and is
  untouched.

## Authored tests (not run)

| Test | Behavior owned | Expected on pre-P1.2 code |
| --- | --- | --- |
| metric-methods: `attached Metric failure keeps its closed reason without writes: <case>`, 8 table cases | Bridge classification: damaged bytes → INTEGRITY; v2 + v1 → AMBIGUOUS; v2 → UNSUPPORTED; profile v9 → UNSUPPORTED; wrong binding → RUN_MISMATCH; narrower request → PERIOD_CONFLICT; `lastRow` 4 → INPUT_REJECTED; no local reader → generic. No DB writes in any case | Does not compile: no code export. The reader case also guards against mislabelling an environment failure as input |
| metric-methods: `explicit attachment only: absent is undefined without writes; a shorter declared period...` | Absence and the shorter-period success. The P1.1 damaged and ambiguous cases moved into the table above; the P1.1 negative checks still apply to them | Passes |
| metric-report: `a wrong Metric run binding keeps its closed reason, never the exception text...` | Service stores `METRIC_SOURCE_RUN_MISMATCH`; HTML shows `Mã đối chiếu: METRIC_SOURCE_RUN_MISMATCH.`; neither the HTML nor the semantic document contains the bridge message or the generic code; no table or svg; Insight unaffected; historical read under `query_only`, without a clock or Python, returns identical bytes with no writes | Fails: stored code is `METRIC_METHOD_FAILED` |
| metric-report: `each closed Metric failure renders its own fixed explanation and next step...` | For every code: semantic code, no table or svg in M03/M04, warning ends with the code, distinct explanation and next step per code, generic copy exactly as before | Does not compile: no code list |

Suggested bounded negative checks, each in a separate Linux copy:
- Revert the service catch to the constant `'METRIC_METHOD_FAILED'`. The
  wrong-binding report test should fail.
- Drop the `OFFLINE_READER_UNAVAILABLE_OR_LIMIT` exclusion in the bridge. The
  `local reader unavailable` case should fail.
- Swap `METRIC_SOURCE_UNSUPPORTED` for `METRIC_SOURCE_AMBIGUOUS` at the
  `version !== 1` site. The `unsupported attachment version` case should fail.
- Give every code the generic `next` text in `reports.ts`. The render table
  test should fail on distinct next steps.
- Add the caught `error.message` to the stored semantic document in the service.
  The wrong-binding test should fail on the leak assertion.

## Linux commands for P1.2

```sh
npm run typecheck
# owners
node --import tsx --test tests/integration/research-automation-metric-methods.test.ts \
  tests/integration/research-automation-metric-report.test.ts
# siblings on the service, renderer and Foundation lookup
node --import tsx --test tests/unit/research-automation-reports.test.ts \
  tests/unit/research-automation.test.ts \
  tests/integration/research-automation-methods.test.ts \
  tests/integration/research-automation-exact-reviews.test.ts \
  tests/integration/research-automation-native-reviews.test.ts \
  tests/integration/source-package-intake.test.ts \
  tests/integration/report-generation-service.test.ts \
  tests/integration/metric-input-preparation.test.ts
git diff --check
```

The Metric owner tests still need `python3`. The `local reader unavailable`
case sets `PATH` to a missing directory only around `execute` and restores it in
`finally`, as the existing historical test does.

## Coordinator checkpoint: storage origins and Linux checks, 2026-10-03

These checks include P1.2 and the new Foundation storage-origin slice, unlike
the first 39-test checkpoint. All edits remain uncommitted on `0116091`.

Foundation now owns `0039_foundation_source_attachment_origins.sql` and
`intakeAutomationAttachment`. Its immutable origin marker is inserted in the
same transaction as original package intake and finalization. Exact retries
verify the source and origin and mutate nothing. Existing finalized manual
packages cannot be marked retroactively. Manual listing excludes authored
attachments before LIMIT, while unmarked historical/look-alike packages stay
visible. The marker is storage provenance, not Analysis admission or verified
provider provenance. The future admission service has not been wired yet.

The regression extends the existing manual-inventory owner with 101 marked
attachments, internal bundles, damaged excluded manifests and unmarked manual
sources. Separate intake tests protect marker/retry immutability and atomic
registration rollback. The foundation migration owner proves v38→v39, unchanged
prior ledger and source lineage, and an idempotent rerun. Current-version
expectations in affected siblings were updated; the historical v38 proof now
uses an explicitly bounded v38 migration directory.

GPT verified on the isolated Fedora scratch copy with pinned Node 24.15.0:

- Backend typecheck: PASS.
- Intake/Metric-method/Metric-report/native-review owner group: 33/33 PASS.
- Migration/content/manual-generation compatibility group: initially 85/86
  PASS. The sole failure was the Shopee v10-upgrade expectation missing the new
  migration 39. GPT appended that migration to the expected sequence and reran
  that exact case: 1/1 PASS. No production change was made to address it.
- Service/rendering/retained-method/exact-review/preparation/readiness siblings:
  45 PASS, 1 optional Chromium skip, zero failures.
- `git diff --check`: PASS.

The groups overlap older proof; do not sum them into a new whole-suite total.
The latest isolated tree has not passed a full release check or browser intake
acceptance. No real source, business decision, provider call, live migration,
operator change, commit, push, merge or deployment was performed.

Open P1.2 audit: `INVALID_XLSX` also covers reader crashes/unstructured stderr,
so the bridge currently cannot justify blaming the supplied workbook in that
case. Keep this fallback generic or establish an owner-typed distinction before
claiming the taxonomy complete. Resolve the new-writer renderer identity without
changing historical report reads. No test-only calculator seam is requested.

The owner has approved bind-at-confirm and explicit late-source versions.
Analysis receipts, frozen exact native/Metric selection, supplemental attempts,
safe API and UI intake still remain implementation work. P1.1/P1.2/P1.5a are
not marked complete by this checkpoint.

## Coordinator checkpoint: three-industry contract, 2026-10-03

Root added one service-boundary owner for coexisting J/T/F runs and retained
original review sources. The pinned synthetic fixture and literal expected
M05/I04 values are listed in the three-case matrix. Linux on Node 24.15.0 passed
4/4 tests (one parent and three case subtests), zero failures or skips. The final
fixture hash was verified identically on Windows and the isolated Linux copy.
Backend typecheck also passed on the final isolated slice. Removing unused
expected-price fields added no assertion or production change.

Authoring gate: this protects exact source/listing routing across three industries
in one database, zero-versus-value semantics, non-additive annual query windows
and saved report replay. A hardcoded jelly source or reused prior-case reference
would fail the independent case values. Existing isolated one-case tests do not
exercise this coexisting-source scenario. No test-only production seam was added.
This is a new cross-industry contract, not a claimed baseline RED bug regression.
The initial fixture-authoring errors were corrected in test data/transport only,
not treated as evidence of a production fix.

The test uses synthetic transport responses; it makes no network/provider/model
calls, accepts no real labels, and exports no PDF. M01/I14 synthesis, the real
90-cell matrix, source admission/version APIs and R1 remain unverified. Claude's
backend implementation continues separately; this scratch proof does not cover
his in-progress files or replace final integrated Linux CI.

## Root takeover and confirmed source-set checkpoint, 2026-10-03

Claude task `task-muryap50-ho2uqf` ended at quota with no touched files. Root took
over per the owner, not by assuming a still-running writer had finished.

Internal confirmation v2 now owns exact source admission. Three canonical
schemas/generated types and additive Analysis migration 0040 cover frozen input
and request identity. A Metric prepared descriptor binds run/start/scope without
inventing the later confirmation time. Admission checks exact Foundation
identity, server-authored storage origin, bounded offline workbook profile and
declared period before collection. This normalization writes no preparation or
calculation row. Native auto-reuse resolves once at confirmation; ambiguous or
damaged chosen originals fail before Analysis mutation or paid fallback.

The immediate Analysis transaction checks revision/status, records the CONFIRM
request, manifests and source-set row, and queues collection. An immutable parent
digest detects missing membership. Workers/readers check this exact set. Metric
absence/skip never falls back to discovery; native SKIP never collects; frozen
native NONE preserves the previously approved exact collection path instead of
adopting a late arrival. Report semantics retain the source-set digest independent
of presentation. Exact retries reverify without discovery; historical v1 stays.

Authoring gate: the new owner scenarios protect late-source isolation and service
wiring, skip/absence, before-confirm rejection, retained-source damage and
query-only replay. Bridge tests cannot exercise the confirmation/worker/report
lifecycle. Fixtures use real Foundation intake, source-origin creation and the
confirmation transaction, not mocked admission receipts. No test-only seam was
added. Fixture package-key errors were corrected without weakening assertions.

Linux generation/typecheck and the final seven-file owner group passed 71/71,
zero failures/skips. The nine-file affected content/Shopee/API group passed 72/72,
zero failures/skips. V38-to-v39 proof stays bounded at 39; v39-to-v40 verifies the
unchanged prior ledger/evidence and zero rerun migrations. These are individual
focused invocations, not accumulated full release proof.

Separate regressions: two simultaneous REPORTS workers both claimed on baseline
(RED), and exactly one claimed after the immediate transaction repair (GREEN).
Removing generic classification of `INVALID_XLSX` failed its diagnostic owner for
the intended reason; the restored classification passed. Renderer v8 affects new
writes only. Luna audited identity/FK/fallback paths read-only; the initial-binding
finding was repaired in 0040 before the final Linux group.

Remaining: supplemental attempt/version, cancellation/publication recovery, safe
upload API, UI attach/resume, M01/I14 synthesis and real three-case acceptance.
No new source API is exposed and no P1/R1 box is ticked. No commit, push, merge,
activation, provider/model call, real record or Windows test occurred.

## Supplemental owner and HTTP checkpoint, 2026-10-03

Root added Analysis 0041 plus canonical revision request/API contracts and Linux
generated types. DRAFT_READY-only admission freezes exact predecessor/source
choices and preserves requested kinds, scope and original run/usage. Failed or
cancelled attempts do not advance successful versions. KEEP reuses verified
prior method results; changed input invalidates only its dependent methods.
Atomic output membership/pair commit leaves old semantic/HTML/PDF identities
readable. Recovery keeps the same frozen attempt; local shutdown cannot requeue
another worker's active attempt.

The API now accepts source confirmation v2 and serves exact version lists, pair
web/PDF and attempt status. OWNER revision/cancel routes retain token/Origin and
16 KiB JSON limits, delegate to the owning service, and use safe errors. Existing
v1/default URLs still return the original report. PDF absence is explicit.

Authoring gate: one real-service HTTP journey owns transport authorization, exact
routes, stale predecessor/closed body rejection, old URL preservation, cancel
retry and byte-preserving read-only access. It uses actual persisted source and
attempt lifecycle, not a mock implementing the asserted behavior. The shutdown
ownership regression was RED with global interruption and GREEN when scoped.

Final isolated Linux generation/typecheck plus the eight-file integrated group:
78/78 PASS, zero failures/skips. Earlier compatibility 72/72 remains separate;
no overlapping totals are summed. Luna's static HTTP audit found no behavioral
blocker; the cited schema-ID mismatch was repaired before the final test run.
This does not cover raw upload, missing-publication recovery, frontend controls,
PDF rendering, full release CI or actual 30-section content. All plan boxes stay
open. No live operator/data, provider/model, Windows checks, commit/push/merge or
deployment action occurred.

## Raw Metric intake owner/API checkpoint, 2026-10-03

Root implemented a closed metadata/receipt contract, generated types, observed
workbook-profile inspection, inert Analysis preparation and an OWNER multipart
endpoint. Luna implemented Foundation exact missing-publication recovery;
root audited its membership/origin/artifact guards and added active-staging
ownership plus later-package first-storage timestamp coverage. Ordinary intake
and v1 method/source replay remain separate.

The upload retains original bytes in the owning Foundation service with an
authored attachment marker. Logical paths and run/start/scope binding are server
derived. Nullable evidence acquisition and declared measurement/filter/precision
metadata are not replaced with upload time or provider-authentication claims.
Preparation changes no run/step/usage/report and invokes no provider/worker.
Post-confirm scope must match exactly and a later prepared source remains inert.

Recovery only stages missing exact bytes after validating the committed package,
request, manifest, members, origin and artifact metadata. Publication selects
only that verified membership. Existing canonical corruption is not overwritten;
cleanup owns only its staging directory. Retrying creates zero database mutations.

Linux generation/typecheck passed. Two focused owners: 14/14 PASS; final integrated
eight-file owner/HTTP group: 80/80 PASS, zero failures/skips. The new feature's
proof is a raw multipart-to-frozen-report journey, not a baseline bug claim.
No totals from overlapping invocations are accumulated. No full release or UI
acceptance is claimed. Pending: source/version UI, upload abort UX, native raw
intake, P5 synthesis and real 30-by-3 acceptance. No checkbox is ticked and no
live operator/data, provider/model, Windows test, commit/push/merge/deploy changed.

## Scope and explicit-version UI checkpoint, 2026-10-03

The default ScopeConfirm loads verified prepared-source inventory and freezes
explicit choices with confirmation v2. The DRAFT_READY dossier now has an exact
pair selector and supplemental confirmation, retaining the original default.
Both Market/Insight web and PDF links address that selected immutable pair.
GET attempt history restores active work after reload without another POST.
Create/cancel retries preserve their exact request bodies and keys; upload
stop-wait does not pretend to undo server storage or select a saved package.

Linux evidence: revision transport 5/5, mounted workflows 3/3, owner HTTP 6/6;
frontend typecheck/build and full frontend 207/207 before final StepNav repair.
After that repair, typecheck/build and affected frontend 20/20 passed. Do not
sum overlapping groups or treat these as full repository/final-head CI.
The separate-read commit race failed RED when its fresh-create hold was removed,
then passed GREEN after restoration. The mobile current-step visibility check
failed before its repair and passed afterward. Independent code audit found no
concrete blocker.

Linux Chrome synthetic actual-RunView acceptance at 1440/390 px covered explicit
pair selection, create/cancel confirmation, Escape/focus return, no page errors
or overflow. Impeccable returned ship for default scope preview; for the new
version surface its sole mobile orientation finding was scored fully resolved,
then disposition ship at preview scope. The documenter confirmed incumbent-world
consistency; root's full delivery gate is still open. Actual-source intake/PDF acceptance,
native raw intake, P5 and real three-case/30-section content remain open. No
checkbox, release, live operator, provider/model, Windows check, commit/push or
merge/deployment action is claimed.

# Handoff — ULTIMATE-FULL-CI-ENGINEERING

Updated: 2026-10-09. Bounded implementation and local verification complete; independent final review and hosted gates remain pending.
Worktree/branch: assigned `ultimate-default-final-review-sol`, normal new `khangpworking/ultimate-full-ci-engineering-sol` from exact reviewed main `5f38281680a51bae1c49539060d655e093789f2f`, granted by `msg_995d48ea63e2`; previous frozen review branches/artifacts preserved.

Completed:

- Read all eight full-job attempt logs and job metadata for private/U16/Metric/reader, plus known main full/ready logs. Full pipeline/package/lock/typecheck identities are unchanged across the five frozen heads. Known baseline CI head `84725a21c6f74c577aca7d1b518a9b51d20e3c9a` has an identical tree to reviewed main5f. Cancelled jobs were progressing, not accepted as PASS. Metric attempt2 completed near the original ten-minute bound.
- Actual unchanged three-industry authenticated OWNER test profiling identified repeated retained-schema compilation in Metric `frozenValidators` and native `verifyFrozenProjection`: The dominant Metric caller recompiles each of9 schemas389 times; aggregate across caller stacks is392 times per schema (3528 root compilations). Native aggregation is139 calls:133 recursive report-validation calls (18.1648s) plus6 direct report-read calls (0.7035s), totaling18.8683s at the same verifyFrozenProjection hook. Direct caller compilation time was about30.8s Metric plus18.9s native in one profiled owning workload. No common hang or failed assertion was recorded in the cancelled jobs.
- Under precise `msg_fc2e8d08eda0`/`msg_b160f142a6c3` leases, added one successful compilation entry per owning hook, fixed strict/allErrors policy, separate Metric formats/native no-formats, and exact ordered path/ID/byte-digest keys. Every original Foundation/source/member/CAS/parse/ID/output/config/binding check remains on each read. No verified artifact/output/result is cached; changed bytes compile anew. Only frozen boolean wrappers escape the helper; AJV schemas/options/errors remain private. Failed compilation does not replace the prior successful entry.

Changed paths:

- `src/modules/analysis/research-automation/metric-method-bridge.ts`: only frozen validator compiler hook/import/cache declaration.
- `src/modules/analysis/research-automation/native-source-review-bridge.ts`: only retained projection schema compiler hook/import/cache declaration.
- New `src/modules/analysis/research-automation/retained-schema-cache.ts`.
- New `tests/unit/retained-schema-cache.test.ts`.
- `tests/integration/research-automation-metric-methods.test.ts`: additive warm owning integrity/no-write assertions only; originals preserved.
- This new handoff.

Evidence (commands, results, relevant revision):

- Node24.15.0/npm11.12.1; focused concurrency2, no full local suite or uncontrolled test tree.
- Full raw diagnosis and bounded reproductions: `/tmp/ultimate-full-ci-engineering-sol/`. `hosted-timing.json`, full/ready and eight attempt metadata/log fingerprints, frozen path identities and scope-before enumeration retain provenance. No private/runtime store was copied.
- Unchanged main owning baseline:194.57s test body,202.49s process, exit0 (`main-owning-before.log`). Profiled diagnostic run:217.02s body/226.28s process; profiling overhead is not treated as uninstrumented baseline.
- Final affected source/report/cache suite:68PASS,0FAIL/skip at concurrency2. Actual warm Metric source/schema/normalized/output/manifest corruption control passes. Exact restoration succeeds; immutable verification runs query-only with no Python/workspace/clock/CAS writes. Harness-only manifest perturbation is restored and distinguished from application writes.
- First source-only strict check passed. After adding the integration test, static verification found an unknown SQLite row type in the new snapshot helper; the narrow test annotation was corrected without changing assertions. Initial failing log remains preserved. Corrected final strict backend check passes. Unchanged owning after:145.041869866s body/154.115700988s process versus194.569455715/202.486768983 before:25.45% body/23.89% process reduction, user CPU189.00→136.51s. PeakRSS654132→739444KB; no memory improvement is claimed.

- Same-assertion performance command before/after: `node --import tsx --test --test-concurrency=2 --test-name-pattern="three industries classify a new report" tests/integration/research-automation-api.test.ts`. After body145.041869866s/process154.115700988s; no scope, isolation, worker concurrency or timeout change.
- Final affected command: `node --import tsx --import /tmp/ultimate-full-ci-engineering-sol/profile-ajv.mjs --test --test-concurrency=2 tests/unit/retained-schema-cache.test.ts tests/integration/research-automation-metric-methods.test.ts tests/integration/research-automation-metric-report.test.ts tests/integration/research-automation-native-reviews.test.ts tests/integration/research-automation-exact-reviews.test.ts`;68/68PASS. Real native file root compilation count1, Metric report8, changed-profile Metric methods51; policy/ref/ID/byte/path/order/invalid-data/failed-compile/caller-mutation controls pass. Intentionally uncaught invalid-schema fixture returns exit1 through the unchanged runner.
- Fresh exactmain5f source archive creates actual old1.2 allVALID and mixedVALID/INVALID/UNKNOWN stores; optimized services retain both original HTML digests and legitimately build kept revisions with identical old packet versions/execution rows. Separate-process cold reads and exact retries run without AI configuration, with throwing clock/CAS.put and SQLite query_only before initial read: calls/clocks/puts0,total_changes0,allTablesEqual,casEqual.15+13 retained input/prompt/config/admission/candidate corruptions reject; exact restoration passes another fresh cold process. Initial build/revision writes are explicitly distinguished from immutable retry/read.
- Actual public factory bytes:30/30 equal against immutable main5f (9packets,9inputs,12prompts). Driver hashes actual packet.bytes; no nonexistent packet.sha256/printed-count shortcut.818 protected paths checked:817 exact and only the additive Metric test differs; removing its new block reproduces the original file byte-for-byte. All220original backend files/all34frontend files remain, plus one new unit file. Full `check` pipeline/workflow/package/lock/PDF verification and canonical/generated/generator/frontend/migration bytes unchanged; no generation used.

Unresolved:

- Affected behavior/static, measured timing and fresh retained historical/cold evidence pass. Independent final review and full exact-head hosted Check/readiness/normal merge remain coordinator gates; no full local suite or hosted rerun was performed.
- No workflow/package/generator/schema/generated/AJV output/migration/dependency manifest, timeout, test scope/order/isolation/concurrency, P9 service/API/source-status, application cap/default/credential or tool config changes. Optional pinned PDF verification remains in the unchanged full pipeline. No live application model/provider/collector, deployment or purchase call.
- U11 statistics/release, U26 policy, U32 aggregates and U40 live/paid work remain unresolved. No whole-Ultimate closure or CI PASS from unfinished jobs.

Next action: freeze/release this scoped engineering checkpoint and publish under coordinator authorization; independent reviewer and coordinator own final review, hosted gates and normal merge.
Business decisions pending: none introduced by this compilation-only optimization.

## Frozen checkpoint and remaining gates

Stable code/test checkpoint: **`6c69ac06df494b9e6ec557817d4df8fb8ef9c71b`**, normally pushed after scoped checks. Explicit source/test RELEASE: **`msg_471fd0b390f5`**; only this handoff metadata follows. The final full SHA is reported in the fresh lifecycle and outside-Git report; no later source/test edit is authorized by this handoff.

| Gate | Evidence / limit |
|---|---|
| G01 | Exact five-head/job-log diagnosis, granted scope, before/after and honest limits retained. |
| G02 |69 final named after checks (68 affected+1 unchanged owning benchmark) and strict backend static pass; full exact-head hosted Check/readiness remain coordinator gates. |
| G03 | No frontend change/materialization; protected frontend bytes/selection unchanged. No browser acceptance claim. |
| G04 | Canonical/generated/generator/lock/workflow bytes unchanged;30 actual historical factory byte digests equal. No GLOBAL or generation used. |
| G05 | Only two leased hooks, new helper/unit, additive Metric test and own new handoff; no P9 shared path changes. |
| G06 | Fresh reviewer-owned synthetic SQLite/CAS/loopback fixtures only; no private/runtime data copies. |
| G07 | Synthetic transports only; no live model/provider/collector/deploy or purchase call. |
| G08 | Technical English only; no Vietnamese interpretation/source text rewritten or humanizer invocation claimed. |
| G09 | No authority, source, calculation, statistic, product release or unfinished-CI success invented. |
| G10 | Actual source/authenticated OWNER flow, unchanged historical factories/HTML and fresh configless cold read/retry/corruption/restoration proof retained. |
| G11 | Every original test file/assertion preserved; new tests additive; intentional runner failure and initial static type failure logged honestly. |
| G12 | Frozen scope, complete evidence/limits and source lease release supplied; independent review and hosted gates remain. |
| G13 | Source/keyword/collection/filter admission unchanged; no capability activation. |

Measured timing is one bounded local pair, not a guarantee of hosted completion. Runner CPU variation and remaining source authentication/I/O work still affect full wall time. Cache retention is one successful compilation per hook and contains schema validators only; peak-RSS measurements increased in this pair and do not establish a memory improvement. No timeout, concurrency, process isolation, ordering, env, source/CAS ownership, test enumeration or PDF requirement is changed.

Temporary matching dependency links are removed before the clean checkpoint. Fresh fixture ledger/source/hash evidence is retained outside Git before disposable-store cleanup; previous review artifacts/branches remain untouched. Coordinator requested independent immutable final-head review and controls all hosted runs/readiness/normal merge. Opening the draft PR requires explicit confirmation for its automatic initial Check under the task's no-worker-CI restriction; no manual run/retry is authorized here.


## Continuation — bounded asynchronous artifact reads

Task `task_911be91b67e0`, dispatch `ctx_04d4051859c8`, author terminal8ff; exact
clean placement from reviewed source `952d57b061db5051784d95e59f5d58529b43f792`
on new `khangpworking/ultimate-full-ci-continuation-sol`. Preserved P9 budget
branch928, originald97 and all preceding frozen branches/artifacts.

The initial full952 job succeeded (1409 backend PASS,3 existing SKIP and269
frontend PASS/generated clean), but both same-head readiness attempts were
cancelled at the unchanged ten-minute budget without a backend final count.
The owning case took103.18s in the full success versus155.58/153.54s at readiness;
frontend52.09s versus68.23/68.13s. Other cases improved, so no uniform runner
slowdown, hang, process leak or concurrency cause is asserted. No third retry.

Measured cause: after the two reviewed retained compiler hooks, actual unchanged
OWNER workload profiling showed repeated bounded CAS descriptor IO, including
FileHandle promise/async-resource overhead. Sampled bounded-read CPU was19.18s;
a diagnostic recorded243562 bounded reads. Same-byte3000-read arms under
node:test took976/735ms on the original versus385/393ms on asynchronous callback
IO. SQL preparation and canonical serialization also appeared in profiling;
neither was changed. The diagnostic prototype did not preserve close-error
precedence and was never adopted as production evidence.

Under the exact current-dispatch lease, changed only callback-FS import and
`#readBounded` in `src/platform/artifacts/artifact-store.ts`; added
`tests/unit/artifact-store-bounded.test.ts`. One Promise wraps asynchronous
open/fstat/positional-read/fstat/close operations. Every read still checks the
opened regular file, size before allocation, complete partial reads, post-read
size and exact digest. Errors inside callbacks reject and close once; close
errors override earlier errors exactly as the original finally. No byte/result
cache, synchronous IO, trust check bypass or execution-policy change was added.
Unbounded read, put, path selection, read limit and all error messages are exact.

Fresh final-source owning command, identical before/after assertions:
`node --import tsx --test --test-concurrency=2 --test-name-pattern="three industries classify a new report" tests/integration/research-automation-api.test.ts`.
No profile or diagnostic substitution in either measured arm. Body147.659s to
121.419s (17.77% saved), runner155.616s to129.334s (16.89% saved); userCPU136.50s
to111.77s, systemCPU25.58s to21.32s, peakRSS714576KB to481252KB. Voluntary context
switches2256279 to2378129: no switch reduction is claimed. This single local
pair cannot guarantee full hosted completion within ten minutes.

Verification: strict backend static passes;100 focused checks pass with
11 new bounded-read cases, unchanged Foundation/source/method cases and two
actual owning probes. Real unpatched4MiB read yields to unrelated event-loop work;
separate controls verify actual partial reads, bounds before allocation/read,
empty/invalid inputs, truncation/growth/same-size corruption/restoration,
open/stat/read/close errors, synchronous callback/allocation/hash/IO exceptions,
combined-failure precedence and exactly-once closure. Intentional uncaught
bounded-read rejection returns runner exit1, not a swallowed success.
Metric24/native34 warm authentic-dependency corruptions reject; restored exact
bytes succeed query-only with zero runtime calls/CAS writes. Fresh-process
readonly reads retain exact HTML with total_changes0, all tables/CAS equal and
throwing clock/workspace/collector/put hooks. Fresh immutable main5f archives independently create old1.2 all-VALID and
mixed VALID/INVALID/UNKNOWN fixtures; current reads/kept revisions preserve old
packet/HTML/execution bytes. Cold query-only retries reject15+13 input/prompt/
configuration/admission/candidate corruptions without model/clock/put calls;
exact restoration succeeds in separate readonly processes with configuration
and Python unavailable, throwing workspace/collector/clock/put hooks,
all tables/CAS exact and total_changes0. Original report/draft13 rows are exact;
all30 actual old packet/input/prompt factory byte digests equal main5f.
The raw focused/static/owning commands exited0, not merely printed PASS counts.
An initial all-cwd process scan included a preexisting CodeGraph MCP server and
failed its broad assertion; corrected proof excludes that untouched tool service
and verifies no task-owned test/static/esbuild remains. Exact checkpoint/released
hashes are recorded in the outside-Git report.

Evidence root: `/tmp/ultimate-full-ci-continuation-sol`, including full three-log
fingerprints/stages, raw CPU profile, diagnostic boundaries, unchanged before/
after logs, focused/static/failure logs, root-only retarget provenance and
protected-path/enumeration proof. Node24.15/npm11.12.1; matching locked dependency
packages only; concurrency2; no full local suite or overlapping owned heavy tree.
All221 original backend files/all34 frontend files remain plus one additive unit
file. Full pipeline/package/lock/workflow/PDF verifier/canonical/generated/
generator/frontend/migration bytes remain exact; no generation or GLOBAL used.

G01–G13: exact evidence/lease (G01), bounded affected/static with hosted gates still
pending (G02), frontend unchanged (G03), canonical/generated/old factories exact
(G04), only released hook/new unit/own handoff (G05), synthetic fixtures only
(G06), no live application calls (G07), technical English/source prose unchanged
and no humanizer invocation claimed (G08), no invented authority/CI success
(G09), actual owning warm/cold/retry/historical proof (G10), original assertions/
isolation/enumeration/failure propagation preserved (G11), frozen source release
and distinct final review still required (G12), collection/admission/source policy
unchanged (G13). U11/U26/U32/U40 remain unresolved.

Independent exact-head review and full hosted Check/readiness/normal merge are
coordinator gates. No PR/PR192 update, push, CI run/retry, readiness action or merge
is authorized by this handoff; no unfinished hosted PASS or Ultimate closure.

## Further continuation — located proposal and projection compilers

Task `task_9f3c51aeb68a`, dispatch `ctx_4173b6cbc713`, author terminal8ff.
Normal new `khangpworking/ultimate-full-ci-further-sol` from exact reviewed
`8b1032935b3a8936c1d6976956e1b88fd4cbc17e`; prior clean U22 correction b1c,
4e/8b/compiler/P9/private/reader/Metric/U16 branches and evidence preserved.
Placement and matching locked dependency-only reuse granted in `msg_3fc6ad7a38e9`;
precise two-hook source/new-test/append lease granted by the current dispatch's
coordinator reply. Central service/API/source-status, Foundation and GLOBAL are
outside this lease.

Latest full hosted 37863064533 is CANCELLED at the unchanged ten-minute limit:
269 frontend tests passed, backend is unfinished and final generated verification
was not reached. Old952 full success and its two readiness cancellations remain
supporting evidence only. No blind retry or hosted PASS is claimed.

Measured remaining work: the unchanged original Insight coding owning workload
compiled the retained located schema 204 times in `#verifyProposal` and 204 times
in `#verifyProjection`. Instrumented compile calls took 20.714s and 19.671s.
CPU sampling corroborated these hooks; inclusive CPU samples are not summed as
an additional wall-time saving. This identifies repeated compilation, not a
uniform hosted slowdown, leak, hang or concurrency diagnosis.

Only `located-review-bridge.ts` compiler setup and the two compile call sites
changed. Each hook owns a separate one-entry successful compilation closure from
the existing byte-unchanged `createRetainedSchemaCache`, with formats=false and
fixed strict/allErrors policy. Exact authenticated profile path/$id/raw-byte
hashes select validators; current output is validated on every read. Existing
parse/$id, Foundation/member/source/corpus/config/coding/authority/output/hash/
projection checks, ordering and integrity messages remain. No source bytes,
result or approval is cached, and failed compilation still propagates.

Uninstrumented before/after, same original assertions and concurrency2:
`node --import tsx --test --test-concurrency=2 --test-name-pattern='Insight coding persists selected' tests/integration/research-automation-exact-reviews.test.ts`.
Both arms pass4. Body63.700s to25.437s (60.07% reduction); runner70.874s to32.870s
(53.62%). UserCPU73.91s to34.60s; peakRSS546172KB to576484KB, so no memory
improvement is claimed. One serial local pair cannot guarantee hosted completion.
The original three-industry OWNER baseline separately passed at99.424s body and
106.571s runner; it is not an affected before/after pair.

New `research-automation-located-schema-cache.test.ts` constructs a real settled
exact collection, retained proposal and adopted projection. Warm query_only reads
reject 25 same-size corruptions across 33 logical proposal/projection members
and the original collection/request/page, then exact restoration reproduces the
saved HTML. All tables, total_changes and CAS membership/hashes remain exact;
clock/workspace/put/provider counters remain0 and the initial fake collection is
not repeated. Separate outside-Git fresh-process readonly/configless first reads
match exact HTML with all tables/CAS equal, total_changes0 and clock/workspace/
CAS-put/provider/network/child-process/Python0. Synthetic setup writes are
explicitly separate from immutable replay.

The first affected runner had37 original checks pass and one NEW test matcher
failure: CAS correctly threw its digest error rather than the expected domain
error name. A second NEW anchored regex incorrectly matched Error.toString;
both failing logs are preserved. The final NEW assertion checks the exact error
message and digest. No existing assertion changed or failed run was called PASS.
The initial negative name pattern also admitted the original nested child tests;
that instrumented repeat is diagnostic only, not the timed after arm.

Relevant final strict/focused/OWNER HTTP/historical/factory/failure exits and exact
frozen hashes are in `/tmp/ultimate-full-ci-further-sol` and the final current-
dispatch report. Instrumented original exact-suite telemetry compiled only once
per owning closure. Original HTTP3 checks pass, original historical5 checks pass
and13 events are byte-equal (SHA256
`86293945c600b7707d4f0dd6535116ea4cd3ca9485b73d5e38f0bd92ceed8809`).
All222 original backend files/assertions and34 frontend files remain exact;
one additive integration file is included by the unchanged full enumeration.
Compiler helper, callback artifact guard, schemas/generated/generators/package/
lock/workflow/PDF verifier/old factories and other source remain unchanged.
No generation, full local suite, live/paid call, deployment, cap/default/credential
or global tool/model configuration change occurred. Pinned Node24.15.0/npm11.12.1,
ABI137; one owned heavy tree at a time, concurrency2. Temporary dependency-only
link is removed at the clean checkpoint.

G01–G13: exact logs/grant/provenance (G01); bounded static/focused checks with
hosted gates pending (G02); frontend/PDF gate bytes unchanged (G03); canonical/
generated/old factories protected (G04); only leased hooks/new test/append (G05);
synthetic owned fixtures (G06); no live application calls (G07); technical English
and unchanged source quotes, no humanizer invocation claim (G08); no invented
CI/authority/statistic (G09); real owning warm/cold/HTTP/history proof (G10);
original assertions/isolation/enumeration and error propagation preserved with
new matcher failures disclosed (G11); frozen release and distinct final review/
exact hosted gates still required (G12); collection/admission/policy unchanged
(G13). U11/U26/U32/U40 remain unresolved.

Stable source lease RELEASE and final checkpoint SHA/direct hashes are supplied
through the fresh dispatch after verification. Publication requires a named
coordinator grant; independent distinct final-head review and fresh full hosted
Check/readiness/normal matching-head merge remain coordinator gates. This is a
bounded source optimization, not whole-plan completion or a hosted CI PASS.

Final scoped gates: strict backend exit0; uninstrumented four-file focused runner
38/38 PASS,0fail/skip/cancel (exit0); HTTP3/3 and historical5/5 PASS (exit0).
All30 defined actual factory byte digests equal prior8b exactly. Deliberately
uncaught invalid schema exits1 with the AJV strict unknown-keyword error; it is
an expected failure-propagation control, not a test PASS. Earlier failing logs
remain unchanged. No further source/test edits follow this verified checkpoint.

# Handoff — TikTok report/reader BACKEND (OpenCode owning integrator)

Base: `4f1d85`. Branch: `khangpworking/ultimate-tiktok-report-reader-opencode`.
Backend commits: `4a6f801` (source + tests), `8c36017` (canonical delta), plus this trust repair.
Canonical freezes: `9c8b2ab`, `9fafed0`, `8c36017` — all deltas announced before freezing, none silent.

## Delivered owner journey (backend)

Explicitly selected retained S07 corpus → `POST tiktok-coding/proposals` (OWNER, bounded model draft,
one dispatch per requestKey under a durable atomic claim) → retained draft + cited report
(`GET tiktok-coding[/:packageId]`, history, context) → `POST reader-reports/tiktok` (OWNER build,
consumption row written atomically) → existing V2 list/open/decide + consumption ledger GET.
Counts are proposed/awaiting owner review; no prior human adoption required for the default draft.

## Trust boundaries (all enforced before model/write)

Run/workspace/scope/source-set binding, S07 package identity + origin binding, full P9 comments replay
(intent/selection/privacy/cap/raw members/diagnostics/keyword/corpus), exact keyword bytes, eligible-only
INCLUDED CUSTOMER rows, complete model configuration, run currency + revision, and coding-package server
origin (exact binding SHA + manifest) on lookup/read/exact retry — ordinary intake without
AUTOMATION_ATTACHMENT origin is refused even for valid-shape same-prefix packages. Voice/source/config/
trust mismatches refuse before any model dispatch (zero dispatches); model-proposed wrong quotes are
rejected AFTER exactly one model response, before retention, settling COMPLETED/INVALID. Unknown periods
stay unknown; missing/null/zero distinct; seller/creator/replies/tag/emoji/conflict/excluded/unclear
outside primary counts with reasons; HMAC/key/salt/raw identity never cross into model/report/citation fields.

## Execution integrity (owned claim table, kernel untouched)

`migrations/0052`: UNIQUE requestKey claim, forward-only PREPARED→DISPATCHING→COMPLETED|DISPATCH_UNKNOWN
with trigger gates; mutex never held across the model call; second instance observes the claim;
unknown/invalid terminal for their key; only a new owner key dispatches again. Claim artifact shas
reference content-addressed bytes verified on replay; package members alone carry manifests, so the
claim table declares plain digest checks and no manifest foreign keys (rationale recorded for final
review). Shared synthesis kernel unions/tables and frozen NATIVE/EXACT_SHOPEE enums untouched by design
(draft path needs no adoption).

## Consumption ledger (owned table, build-time only)

`migrations/0051`: one row per successful TikTok Reader build, atomically with the revision insert
(corpus + draft + report + reader identities, genuine build timestamp, actor). Reads/reopens/retries
record nothing; decisions stay in the existing decision table. Query-only GET exposes the ledger.

## Proof (full logs outside Git, true exits)

- `tests/integration/research-tiktok-coding.test.ts` 7/7: v3 journey, refusal battery (0 dispatches;
  wrong quotes settle INVALID after exactly one response), two real instances one-key one-dispatch,
  INVALID/unknown terminality incl. no-CAS/clock/mutation control, mid-dispatch abort →
  INTERRUPTED_AFTER_CLAIM, fabricated origin-less package refused on retry and direct read,
  settlement clock failure after genuine publication (state-conditioned seam, COMPLETED/INVALID vs
  DISPATCH_UNKNOWN distinguished, unknown-output build refusal with zero consumption, configless
  terminal retry with zero side effects, new-key recovery with build + consumption), configless cold
  reopen (throwing clock, serialize-equal).
- `tests/integration/research-tiktok-reader.test.ts` 4/4: build→ledger→open/reopen/decide, old-route
  refusal, identity mismatch refusals, ledger immutability + illegal-transition refusals.
- Settled-execution guard: retained reads/retry/build require a matching COMPLETED/VALID
  claim (exact requestKey/workspace/run/scope) with ledger admission/input/prompt/configuration SHAs
  bound to verified package members; history exposes only settled-valid proposals (validation refusals
  filtered, infra failures propagate).
- `tests/unit/tiktok-coding-context.test.ts` 3/3, `tiktok-coding-operator-config.test.ts` 1/1
  (fail-closed env opt-in).
- Affected replay green: insight-reader suites, i14 transport, operator-app, source-status/board, P9,
  Macro, migration replay (0050 bytes preserved, version extended to 52).
- `npm run typecheck` PASS. `contracts:generate` byte-check clean at `8c36017`; this repair adds no
  canonical/schema/migration changes.

## Mounted proof (integration-owned browser harness, repaired candidate attempt3 PASS exit 0)

`/tmp/ultimate-tiktok-report-reader-2026-10-10/mounted-harness/tiktok-mounted-attempt2.mts` (task-local,
exit 0, MOUNTED-PASS): seeded keyword-v3/P9 database handed cleanly to the real operator app with a
synthetic loopback CLIProxy as the only model transport; playwright-core + system Chrome drove select →
propose (exactly 1 dispatch) → report open (retained span + expanded full context) → build (no second
call) → same-button build retry (no rebuild) → cited Reader tab → APPROVE → coding retry (no redispatch)
→ reload → same-revision reopen (no model); durable execution/consumption/revision counts 1/1/1 and
unchanged source identities asserted from the database. Screenshots + result JSON in the packet.
Attempt 1 (popup timing/visibility) preserved as failure evidence; fixed by waiting for content and
expanding collapsed context, no assertion weakened.

## Publication

Branch pushed normally (no force): `khangpworking/ultimate-tiktok-report-reader-opencode`.
Draft PR #202 to main with accurate body. No release implied; review/CI/merge coordinator-owned.

## Known limits / non-goals

P9-06 personas/second classification excluded; S14 inert separately attributed; no cross-platform sums,
populations, demographics, or sales inference. Mounted UI/browser proof is Claude's lane on the frozen
interface; heavy/GLOBAL generation lease movement is coordinator-owned.

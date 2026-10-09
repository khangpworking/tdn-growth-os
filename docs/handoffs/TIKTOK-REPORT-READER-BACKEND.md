# Handoff — TikTok report/reader BACKEND (OpenCode owning integrator)

Base: `4f1d85`. Branch: `khangpworking/ultimate-tiktok-report-reader-opencode`.
Backend commit: `4a6f801` (source + tests). Canonical freezes: `9c8b2ab`, `9fafed0`.
Pending canonical delta (announced, NOT silently moved): proposal `consumptionView` def, configuration
`modelId` pattern parity, 0052 manifest-FK removal — held for post-slot generation + freeze.

## Delivered owner journey (backend)

Explicitly selected retained S07 corpus → `POST tiktok-coding/proposals` (OWNER, bounded model draft,
one dispatch per requestKey under a durable atomic claim) → retained draft + cited report
(`GET tiktok-coding[/:packageId]`, history, context) → `POST reader-reports/tiktok` (OWNER build,
consumption row written atomically) → existing V2 list/open/decide + consumption ledger GET.
Counts are proposed/awaiting owner review; no prior human adoption required for the default draft.

## Trust boundaries (all enforced before model/write)

Run/workspace/scope/source-set binding, S07 package identity + origin binding, full P9 comments replay
(intent/selection/privacy/cap/raw members/diagnostics/keyword/corpus), exact keyword bytes, eligible-only
INCLUDED CUSTOMER rows, exact quote spans, complete model configuration, run currency + revision.
Voice/quote/config/trust mismatches refuse with zero dispatches. Unknown periods stay unknown;
missing/null/zero distinct; seller/creator/replies/tag/emoji/conflict/excluded/unclear outside primary
counts with reasons; HMAC/key/salt/raw identity never cross into model/report/citation fields.

## Execution integrity (owned claim table, kernel untouched)

`migrations/0052`: UNIQUE requestKey claim, forward-only PREPARED→DISPATCHING→COMPLETED|DISPATCH_UNKNOWN
with trigger gates; mutex never held across the model call; second instance observes the claim;
unknown/invalid terminal for their key; only a new owner key dispatches again. Shared synthesis kernel
unions/tables and frozen NATIVE/EXACT_SHOPEE enums untouched by design (draft path needs no adoption).

## Consumption ledger (owned table, build-time only)

`migrations/0051`: one row per successful TikTok Reader build, atomically with the revision insert
(corpus + draft + report + reader identities, genuine build timestamp, actor). Reads/reopens/retries
record nothing; decisions stay in the existing decision table. Query-only GET exposes the ledger.

## Proof (full logs outside Git, true exits)

- `tests/integration/research-tiktok-coding.test.ts` 5/5: v3 journey, refusal battery (0 dispatches),
  two real instances one-key one-dispatch, INVALID/unknown terminality incl. no-CAS/clock/mutation control,
  mid-dispatch abort → INTERRUPTED_AFTER_CLAIM, configless cold reopen (throwing clock, serialize-equal).
- `tests/integration/research-tiktok-reader.test.ts` 3/3: build→ledger→open/reopen/decide, identity
  mismatch refusals, ledger immutability + illegal-transition refusals.
- `tests/unit/tiktok-coding-context.test.ts` 3/3, `tiktok-coding-operator-config.test.ts` 1/1
  (fail-closed env opt-in).
- Affected replay green: insight-reader suites, i14 transport, operator-app, source-status/board, P9,
  Macro, migration replay (0050 bytes preserved, version extended to 52).
- `npm run typecheck` PASS. `contracts:generate` byte-check + canonical delta freeze pending slot return.

## Known limits / non-goals

P9-06 personas/second classification excluded; S14 inert separately attributed; no cross-platform sums,
populations, demographics, or sales inference. Mounted UI/browser proof is Claude's lane on the frozen
interface; heavy/GLOBAL generation lease movement is coordinator-owned.

# Handoff — WP-127-B web snapshot contract, normaliser and scope gate

Updated: 2026-10-07
Worktree/branch: `wp/127-b-metric-web-snapshot`, based on `origin/main` 35cad2d (no fetch).
Completed:
- New contract `automation-metric-web-snapshot-v1`:
  - `contracts/analysis/automation-metric-web-snapshot-v1.schema.json`, using the 2020-12 `$schema`, an `$id` under `https://tdn.local/contracts/analysis/`, and `additionalProperties: false` on every object.
  - Every one of the 14 groups is required. W2 and W3 have no Absent option. W4–W16 are `oneOf` [group shape, Absent].
  - The schema has no field for a computed value.
  - The generated TS file comes from `npm run contracts:generate`. The registry has one new line in `scripts/generate-foundation-contract.mjs`.
- `metric-web-snapshot.ts`:
  - `validateMetricWebSnapshot(value)` throws `MetricWebSnapshotError(code, issues)`.
    - An Absent marker on scope (W1), W2 or W3 → `METRIC_UI_CHANGED`. This check runs before the schema.
    - Schema errors → `METRIC_WEB_SNAPSHOT_INVALID`, each as `<pointer> <message>`, deduplicated and sorted.
    - Unknown column keys and undeclared row cells in W5/W6/W9/W11/W12/W13/W14/W16 → `METRIC_WEB_SNAPSHOT_INVALID`.
    - W4: a duplicate platform+month, or a month outside `scope.period` → `METRIC_WEB_SNAPSHOT_INVALID`.
  - `METRIC_WEB_TABLE_COLUMNS` holds the allowed column keys per table group.
  - `checkSnapshotScope(snapshot, spec, xlsxManifest)` checks against both references. It compares `specDigest`, keywords (NFC, trimmed, case-insensitive, as a set), platforms (as a set), the exact period, the category (exact or both null) and `captureId` (xlsx only). It returns every differing field, sorted, and never throws.
- `metric-web-facts.ts`:
  - `parseVietnameseDisplayNumber` handles `12,3 tỷ`, `4,5 triệu`, `850 nghìn`, `37,8%`, `1.234.567` and `-5,2%`. It multiplies the integer digits first and divides by the decimal scale last, gives no negative zero, and returns `null` for anything else.
  - `normaliseMetricWebSnapshot` passes a raw value through with `precision: 'exact'`. When `value` is null, it parses `displayed` and sets `display_rounded`, but only if the parsed unit fits the declared unit. If not, the value stays `null`.
  - Monthly facts are keyed `monthly[platform][yyyy-mm]` and carry a `partial` flag.
  - An absent group becomes `{ absent: true, reason }`. There is no arithmetic across platforms, and no I/O, clock or randomness.
- Synthetic fixtures with invented names (`tests/fixtures/metric-web-snapshot/`):
  - valid: `full`, `display-only`, `absent-optional`;
  - invalid: `absent-w2`, `extra-field`, `unknown-column`.
- Tests:
  - `tests/unit/research-automation-metric-web-snapshot.test.ts`, 9 tests: the validator and the scope gate.
  - `tests/unit/research-automation-metric-web-facts.test.ts`, 7 tests: the parser table, exact pass-through, display-only parsing and unit mismatch, partial months including a leap February, absent markers, a deep scan for cross-platform sums, and purity/determinism.

Changed paths:
- `contracts/analysis/automation-metric-web-snapshot-v1.schema.json` (new)
- `contracts/analysis/automation-metric-web-snapshot-v1.generated.ts` (new, generated)
- `scripts/generate-foundation-contract.mjs` (+1 registry line)
- `src/modules/analysis/research-automation/metric-web-snapshot.ts` (new)
- `src/modules/analysis/research-automation/metric-web-facts.ts` (new)
- `tests/fixtures/metric-web-snapshot/*.json` (6 new)
- `tests/unit/research-automation-metric-web-snapshot.test.ts` (new)
- `tests/unit/research-automation-metric-web-facts.test.ts` (new)
- `docs/handoffs/wp-127-b-metric-web-snapshot.md` (this file)

Evidence (commands, results, relevant revision):
- These runs are a **Claude Windows pre-check**, not the authoritative run. The reviewer or GPT re-runs on Linux in a clean directory.
- Node v24.15.0. `npm ci` needed `--ignore-scripts` on this Windows host because the node-gyp path was missing. No package files changed.
- `npm run contracts:generate`: `git status` showed only the new `.generated.ts`. A second run, followed by `git diff --exit-code contracts/`, gave exit 0, so the output is stable.
- `node --import tsx --test tests/unit/research-automation-metric-web-snapshot.test.ts tests/unit/research-automation-metric-web-facts.test.ts` → 16/16 pass.
- `npm run typecheck`: the npm script does not run on Windows. The same `tsc --noEmit` was run through a local wrapper → exit 0.
- `npm test` before (35cad2d): tests 1041, pass 906, fail 132, cancelled 0, skipped 3. The failures are all Windows environment issues: no Python (exit 9009), EPERM on fsync, and path and permission differences.
- `npm test` after (6390e66): tests 1057, pass 921, fail 132, cancelled 1, skipped 3.
  - The 16 new tests all pass.
  - The full-run failure list differs from the baseline by 4 names. Three are in `tests/integration/shopee-file-research.test.ts`, failing on EPERM fsync. One is in `tests/integration/research-automation-case-contract.test.ts`, which hit the 30 s timeout under load and is the 1 cancelled.
  - Re-running those two files alone on this branch gives tests 38, pass 21, fail 17. This is the same count and the same failing names as on untouched 35cad2d. They are Windows flakes, not caused by this change.
- `git diff --check origin/main...HEAD` → clean.
- `git diff --numstat origin/main...HEAD` (code commit; this handoff adds one more file):
  ```
  513   0  contracts/analysis/automation-metric-web-snapshot-v1.generated.ts
  197   0  contracts/analysis/automation-metric-web-snapshot-v1.schema.json
  1     0  scripts/generate-foundation-contract.mjs
  175   0  src/modules/analysis/research-automation/metric-web-facts.ts
  134   0  src/modules/analysis/research-automation/metric-web-snapshot.ts
  879   0  tests/fixtures/metric-web-snapshot/absent-optional.json
  1390  0  tests/fixtures/metric-web-snapshot/absent-w2.json
  1500  0  tests/fixtures/metric-web-snapshot/display-only.json
  1513  0  tests/fixtures/metric-web-snapshot/extra-field.json
  1500  0  tests/fixtures/metric-web-snapshot/full.json
  1506  0  tests/fixtures/metric-web-snapshot/unknown-column.json
  194   0  tests/unit/research-automation-metric-web-facts.test.ts
  150   0  tests/unit/research-automation-metric-web-snapshot.test.ts
  ```
- `git log --oneline origin/main..HEAD`: `6390e66 WP-127-B: add web snapshot contract, validator, scope gate and normaliser`, plus the handoff commit.

Unresolved:
- **Escalation (sanctioned fallback):** `metric-method-bridge.ts` keeps its Ajv instance private, so the new schema cannot be added there without editing the bridge. As the brief allows, `metric-web-snapshot.ts` builds a local `Ajv2020({ strict: true, allErrors: true })` with `ajv-formats`. That is the same library and options; the bridge is not edited.
- **Column keys are my reading of the #127 W-table.** Please confirm:
  - W5 `category, level, platform, revenue` and W6 `priceLevel, platform, revenue`: one row per platform, with `platform` as a Text cell.
  - W9 `brand, revenueNormal, revenueMall`.
  - W11 `location, share`.
  - W12 `name, shop, price, createdDate, minPrice, maxPrice, revenue, revenueChg, units, unitsChg, lifetimeRevenue, lifetimeUnits, category`.
  - W16 `entityKind, entity, month, revenue, units`, where `entityKind` is a Text cell `shop` or `product`.
  - W13 and W14 follow the brief exactly.
- **Parser unit rule:** `tỷ`/`triệu`/`nghìn` are returned as `VND`. The normaliser also accepts them for a `COUNT` value, because the page shows sold units as "4,1 nghìn". A `%` value is used only for `PERCENT`, and an amount is never used for `PERCENT`. If units should never take a scaled word, this rule can be tightened.
- The W4 duplicate and outside-period checks are extra validator rules, not in the brief. They stop one month appearing twice, or a month outside the scope, from reaching the facts.
- The `TDN-GROWTH-OS.md` note named in the brief does not exist on this host. The `test-audit` skill was read. `humanizer-vi` is not installed here; this WP has no owner-facing Vietnamese prose.

Next action: The coordinator reviews and re-runs the tests on Linux. PR C (storage, service wiring, `webFacts` in the reader input) uses this contract.
Business decisions pending: none.

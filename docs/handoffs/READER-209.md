# Handoff — READER-209

Updated: 2026-10-12
Lane: Market report reader-facing plain Vietnamese rendering
Status: implementation complete; coordinator commit required

Changed paths:
- `src/modules/analysis/research-automation/reader-plain-text.ts` (new render-only mapping and exact string formatter)
- `src/modules/analysis/research-automation/market-inventory-report.ts`
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts`
- `src/modules/analysis/research-automation/descriptive-report.ts`
- `src/modules/analysis/research-automation/reports.ts`
- `tests/unit/reader-209-plain-text.test.ts` (new synthetic unit and visible-body regression tests)
- `tests/unit/research-automation-reports.test.ts` (four expected reader-text updates only)
- `docs/handoffs/READER-209.md` (this handoff)

Owner decisions applied:
- “R1: an unknown value is never written as 0.” Unknown and missing values stay `Chưa rõ`/`Thiếu giá trị` and are never formatted as zero.
- “L4: no superlatives as findings ...” No ranking or superlative language was introduced; method order remains dependency order.
- “L5/R3: never add Shopee and TikTok Shop together; show each platform separately.” This lane does not combine platforms or change platform grouping.
- “No progress percentages in any UI text.” No progress percentage text was added.

Implementation notes:
- All changes are render-time projections. Stored source wording, quote IDs, price states, semantic inputs, hashes, and producer paths remain untouched.
- `reader-plain-text.ts` formats decimal strings without converting through JavaScript numbers, including large values and JSON numeric lexemes.
- Raw technical values remain available in the existing collapsed appendix; the visible M09 date basis keeps a technical copy inside `<details>` while the reader copy removes `launch_date`.
- The source/verify paths were checked with `rg` in `service.ts`, the research-automation module, and the API: stored report reads verify stored artifact hashes and semantic input/version bindings; no read path re-renders a stored version and compares HTML bytes. No change was made to `service.ts` or the API.

Evidence:
- `node ../tools/typecheck-win.mjs`: exit 0; `files 924 status 0`.
- `node --import tsx --test tests/unit/reader-209-plain-text.test.ts tests/unit/research-automation-reports.test.ts tests/unit/research-automation-report-citations.test.ts`: exit 0; 27 passed, 2 skipped PDF tests, 0 failed.
- The focused report run includes all tests in `research-automation-reports.test.ts`, all citation tests, and the three new READER-209 tests.
- `node --import tsx --test tests/unit/market-presentation-method.test.ts tests/unit/market-presentation-contract.test.ts tests/integration/market-presentation-report.test.ts tests/integration/rev-209-market-presentation.test.ts`: 34 passed, 2 skipped, 4 failed on Windows. The three `market-presentation-report.test.ts` failures stop in the fixture at `TypeError: Cannot read properties of undefined (reading 'toString')` at its fixture setup; `market-presentation-contract.test.ts` fails its pinned `automation-report-revision.schema.json` SHA assertion (`actual 53b00ad85f04d4fc8a6bd4cda1c6edd732c8f24256efcc64d973ee1748a00b92`, `expected ec52e33110e752e95093cd6630a56644d7883de42a85b2295cf6358e9a0d809a`). The schema file is unchanged in this lane.
- `node --import tsx --test tests/integration/research-automation-methods.test.ts tests/integration/research-automation-market-methods.test.ts tests/integration/research-automation-quote-methods.test.ts tests/integration/research-automation-synthesis-migration.test.ts`: 34 passed, 7 failed on Windows. Exact failures: `collection executes source-bound methods and saves zero-safe partial results that replay without writes or collection` (`REPORTS must execute and persist the existing descriptive method`, actual `undefined`); `marker-free historical starts retain descriptive v2 packages and original M07 dispatch on immutable reads` (`Cannot read properties of undefined (reading 'methodVersion')`); `retained launch dates reach M09 as attributed statements without duplicate-window events or causal claims` (`assert.ok(methods)`); `raw capture` and `normalized source` under `saved report reads reject damaged raw and package-derived evidence without writing or recollecting` (`Corruption must reach a report with real retained method output`, actual `undefined`); and `M08 exact structured source produces traceable arithmetic in Market only, with frozen revision lifecycle` (`TypeError: QUOTE_METHOD_PARSER_PROFILE_NOT_PINNED`, expected `QUOTE_METHOD_BINDING_VALUE_MISMATCH`). These failures occur in existing integration setup/profile state on Windows; no assertions were weakened.
- `git diff --check`: exit 0. Git emitted only the repository’s LF-to-CRLF working-copy warnings; no whitespace errors.
- No contract schema changed; `npm run contracts:generate` was not needed.

Blocked / needs other lane:
- None for the owned rendering scope. The Windows integration failures above remain reported, not altered. No protected producer, service, API, migration, generated frontend file, or other lane path was edited.

## Checklist evidence

| U-item | Status | Evidence |
|---|---|---|
| 1 Numbers | DONE | String formatter in `reader-plain-text.ts:54-73`; M03/M05/M08/M01/report tables use it. Tests cover VND rounding, counts, decimals, large values, negative, zero, and missing. |
| 2 Measure names | DONE | `readerMeasureName` at `reader-plain-text.ts:76`; descriptive, synthesis, inventory, and Market observation rows use the map. |
| 3 JSON literals | DONE | `readerJsonLiteral`/`readerStoredOrJson` at `reader-plain-text.ts:81-95`; synthetic HTML test strips details/scripts/styles and checks no raw JSON or snake_case. |
| 4 M08 prices | DONE | `readerPriceState`/`readerQuoteLabel` at `reader-plain-text.ts:98-107`; M08 rows use formatted values and Vietnamese quote/state labels. |
| 5 Scope sentence | DONE | `readerScopeText` at `reader-plain-text.ts:113-119`; exact sentence translation and non-Vietnamese withholding are unit- and render-tested. |
| 6 Method labels | DONE | `readerMethodName` at `reader-plain-text.ts:109`; M01 evidence data rows render the Vietnamese section name while headings retain numbering. |
| 7 Date basis | DONE | `readerDateBasis` at `reader-plain-text.ts:129-132`; descriptive and synthesis visible date basis removes raw `launch_date`, with the technical appendix retained. |
| 8 Locators | DONE | `readerLocator` and `readerPointer` at `reader-plain-text.ts:121-126` and `descriptive-report.ts:74-78`; known data paths map to Vietnamese labels and unknown data paths are neutralized. |
| 9 Product labels | DONE | `productLabels`/`readerProductLabel` at `reports.ts:449-455`, `reports.ts:497`, and `market-inventory-report.ts:5,15`; available synthetic product titles replace IDs, otherwise the existing fallback remains. |
| 10 UNKNOWN | DONE | `BLOCKER_TEXT`, `valueCell` at `descriptive-report.ts:103,143-151`; visible text is `Có giá trị chưa rõ.` / `Chưa rõ`, never raw `UNKNOWN`. |
| 11 Technical appendix | DONE | Raw technical date basis remains under the collapsed `<details>` at `descriptive-report.ts:260`; the visible-body regression confirms technical details are excluded from reader checks. |

Changed existing expectations:
- `tests/unit/research-automation-reports.test.ts:70`: exact large-money output now expects grouped VND text.
- `tests/unit/research-automation-reports.test.ts:178`: `Lượt bán` now expects `Sản lượng bán`.
- `tests/unit/research-automation-reports.test.ts:250`: count output now expects `1.520 lượt bán`.
- `tests/unit/research-automation-reports.test.ts:312`: raw `UNKNOWN` now expects `Chưa rõ`.

Next action: coordinator reviews the owned diff and commits it with the READER-209 lane prefix. No commit was created in this lane.

## Round 2

Status: blocking review findings fixed; coordinator commit required.

Changed paths:
- `src/modules/analysis/research-automation/reader-plain-text.ts`: exact exponent normalization, half-up carry rounding, quote helpers, and neutral product/shop labels.
- `src/modules/analysis/research-automation/quote-method-report.ts`: quote amounts, ranges, exact fractions, labels, and states now use the reader helpers.
- `src/modules/analysis/research-automation/metric-method-report.ts`: visible unknown wording is `chưa rõ`, and listing/shop IDs use neutral labels.
- `src/modules/analysis/research-automation/market-presentation-report.ts`: listing titles are preferred; untitled listings use stable neutral labels.
- `src/modules/analysis/research-automation/reports.ts`: selected review listing/shop IDs use neutral labels in the visible body.
- `tests/unit/reader-209-plain-text.test.ts`: named rounding cases and quote/metric visible-body regressions.
- `tests/unit/research-automation-reports.test.ts`: updated the changed neutral observation label.
- `tests/integration/market-presentation-report.test.ts`: visible M03 assertions now require `chưa rõ`, preserve distinction from zero, and exclude IDs.
- `docs/handoffs/READER-209.md`: this Round 2 evidence.

Plan lines applied:
- “Raw numeric product/listing/shop IDs must never appear in the main body.”
- “quote-method-report.ts:42,46,51 ... use the helper for amounts, ranges, exact numbers, quote labels and states.”
- “metric-method-report.ts:68,84: no `UNKNOWN` or raw listing/shop IDs in visible prose.”

Owner decisions applied:
- “R1: an unknown value is never written as 0.” Unknown and missing text remain distinct from zero; the metric reader explicitly says `chưa rõ, không phải 0`.
- “L4: no superlatives as findings ...” No ranking or superlative wording was introduced; neutral labels use source order only.
- “L5/R3: never add Shopee and TikTok Shop together; show each platform separately.” Platform rows remain separate.
- “No progress percentages in any UI text.” No progress percentage text was added.

Evidence:
- `node ../tools/typecheck-win.mjs`: exit 0; `files 924 status 0`.
- `node --import tsx --test tests/unit/reader-209-plain-text.test.ts`: 4 passed, 0 failed.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts`: 18 passed, 2 skipped PDF tests, 0 failed.
- `node --import tsx --test tests/unit/generic-quote-unit.test.ts`: 10 passed, 0 failed.
- `node --import tsx --test tests/unit/leak-209-metric-trace.test.ts`: 5 passed, 0 failed.
- `node --import tsx --test tests/unit/market-presentation-method.test.ts`: 4 passed, 0 failed.
- `node --import tsx --test tests/integration/rev-209-market-presentation.test.ts`: 2 passed, 0 failed.
- `node --import tsx --test tests/unit/market-presentation-contract.test.ts`: 1 passed, 1 failed on the pre-existing test `Market presentation revision cannot change source membership or require reader approval`, which asserts the pinned `automation-report-revision.schema.json` SHA; schema unchanged in this lane. Actual `53b00ad85f04d4fc8a6bd4cda1c6edd732c8f24256efcc64d973ee1748a00b92`, expected `ec52e33110e752e95093cd6630a56644d7883de42a85b2295cf6358e9a0d809a`.
- `node --import tsx --test tests/integration/market-presentation-report.test.ts`: these 3 tests failed before assertions on Windows at `fixture` line 82 with `TypeError: Cannot read properties of undefined (reading 'toString')`: `actual auto service builds source-bound findings/unit tables and immutable reports while stripping adapter injection`; `auto presentation without a receipt preserves zero/missing, keeps references unavailable and rejects unrelated digests before queuing`; `actual auto revision composes retained literal19/Source18 with Market20 and never discovers an unselected prepared package`. No renderer assertion ran.
- `node --import tsx --test tests/integration/research-automation-metric-report.test.ts`: these 5 tests failed before assertions on Windows at `fixture` line 60 with `TypeError: Cannot read properties of undefined (reading 'toString')`: `REPORTS retains a provider-bearing declared period basis without disclosing it in HTML`; `accepted classified group labels remain exact in the calculation while the complete report uses neutral reader text`; `REPORTS computes attached raw Metric rows, retains the full method independently of the renderer and serves frozen reports without Python`; `a wrong Metric run binding keeps its closed reason, never the exception text, stays blocked beside Insight and is served frozen`; `each closed Metric failure renders its own fixed explanation and next step, never totals, and the generic fallback keeps its copy`.
- `node --import tsx --test tests/integration/research-automation-quote-methods.test.ts`: test `M08 exact structured source produces traceable arithmetic in Market only, with frozen revision lifecycle` failed on Windows because the fixture stopped at `TypeError: QUOTE_METHOD_PARSER_PROFILE_NOT_PINNED` while the test expected `QUOTE_METHOD_BINDING_VALUE_MISMATCH`.
- `git diff --check`: exit 0; only Git LF-to-CRLF working-copy warnings were emitted.

Stored-version check:
- Rechecked the research-automation read/verify flow and the API references with `rg`; no read path re-renders a stored version and compares HTML bytes. No service, API, contract, migration, generated file, or stored producer was changed.

Blocked / needs other lane:
- No owned-path blocker. The Windows integration failures and the unrelated pinned schema SHA mismatch remain reported and were not altered.

## Round 2 checklist evidence

| U-item | Status | Evidence |
|---|---|---|
| 1 Numbers | DONE | `reader-plain-text.ts:42-76` now normalizes exponents and rounds half-up with fractional carry; tests cover `1.235`, `9.999`, `0.995`, `-0.004`, exponent inputs, and whole-unit money/count carry. |
| 2 Product/listing/shop IDs | DONE | `readerProductLabel`/`readerShopLabel` at `reader-plain-text.ts:185-199`, title lookup in `market-presentation-report.ts:96-120`, metric trace masking at `metric-method-report.ts:84-89`, and other owned review renderers in `reports.ts:258,942`. |
| 3 Quote method | DONE | `quote-method-report.ts:42-63` routes amounts, ranges, exact numbers, labels and states through the helper; visible-body regression is in `reader-209-plain-text.test.ts`. |
| 4 Metric method | DONE | `metric-method-report.ts:68-89` removes `UNKNOWN` and raw IDs from reader prose; integration expectations require `chưa rõ`, `không phải 0`, and no visible synthetic IDs. |

What remains and why:
- No code remains for the four blocking findings. Coordinator should review and commit the working tree; this lane did not commit as instructed.

## Round 2b

Status: the opt-in legacy gate and case-contract expectation are implemented; two frozen-hash checks remain blocked by pre-existing baseline/environment evidence. No commit was created.

Changed paths:
- `src/modules/analysis/research-automation/reports.ts`
- `src/modules/analysis/research-automation/descriptive-report.ts`
- `src/modules/analysis/research-automation/market-inventory-report.ts`
- `src/modules/analysis/research-automation/synthesis-evidence-report.ts`
- `tests/integration/research-automation-case-contract.test.ts`
- `tests/unit/reader-209-plain-text.test.ts`
- `docs/handoffs/READER-209.md`

Owner decisions applied:
- “Make the whole plain-Vietnamese rendering opt-in, gated on ... `Boolean(input.start.sourceEvidenceVersion || marketPresentation)`.” `reports.ts:583-584` computes one explicit `readerPlainText` flag and passes it through the changed renderers.
- “Product labels must never show a provider-prefixed ref ... or a bare numeric ID in the main body when the flag is on.” The flag-on paths use neutral reader labels; flag-off paths retain the old stored strings.
- “R1: an unknown value is never written as 0.” The legacy branch preserves raw legacy values and the reader branch keeps missing/unknown distinct from zero.

Implementation:
- `descriptive-report.ts:283-289` gates descriptive body helpers and `:294-309` gates the retained appendix; false paths preserve the old table spacing, values, locators and wording.
- `market-inventory-report.ts:5-27` and `synthesis-evidence-report.ts:118-198` select the old byte path when `readerPlainText` is false.
- `reports.ts:583-584,723,872-919` threads the flag through product labels, observations, default peers, descriptive appendix and review context.
- `tests/integration/research-automation-case-contract.test.ts:240` formats the M01 revenue expectation with the same reader formatter.
- The existing `tests/unit/reader-209-plain-text.test.ts:29-113` covers flag-on visible output and neutral `kalodata:`-style IDs; frozen-hash tests are the flag-off byte-identity evidence.

Evidence:
- `node ../tools/typecheck-win.mjs`: exit 0; `files 924 status 0`.
- `node --import tsx --test tests/unit/reader-209-plain-text.test.ts`: 4 passed, 0 failed.
- `node --import tsx --test tests/integration/research-automation-case-contract.test.ts`: blocked on Windows before case subtests; `TypeError: INVALID_LOCATED_INSIGHT_INPUT:data/profileSha256 must be equal to constant, data/adoptionSha256 must be equal to constant` at `tests/helpers/native-dami-package-fixture.ts:56`, called from test line 50.
- `node --import tsx --test tests/unit/default-peer-reports.test.ts`: 2 passed, 1 failed. The marker-free frozen Market HTML hash is `716425c52f6940d0b86a5f51f30cb2fcdb2ee6fb81cfe6ddfeaa0f2a3975ccb9`, expected `ad13eeefb55c6a7b74666f9a905cb8c4976a62ffc49574b13fb7c5a4fb6aeb5b`; the same failure reproduces in an isolated archive of `HEAD~1`, before this round’s changes.
- `node --import tsx --test tests/unit/sync1-market-corrections.test.ts`: direct legacy HTML replay passes; the frozen method bytes remain `f86f23abab377fdb496aa1e52b2c1965bc4ae0e9c9ecd757bf1bcb11676b167` versus expected `f9a69c9ea4260c9f62bf951b6940f9f555755a2d84f575412a9508372dc89eed`, and the workbook test fails because Windows has no `python3` and then reads undefined stderr.
- The requested combined renderer tests were run. The reader test passed. Existing unowned report tests fail where marker-free fixtures still expect the opt-in plain text, and the market-presentation fixtures stop at Windows `TypeError: Cannot read properties of undefined (reading 'toString')` at fixture line 82; those paths were not edited in this round.
- `git diff --check`: exit 0.

Blocked / needs other lane:
- The marker-free default-peer hash already fails in the isolated pre-round baseline, so correcting it requires the owner of the frozen fixture/renderer baseline; this lane did not alter `rendererVersion`, producers, stored contracts, or frozen tests.
- The sync1 producer-byte hash is outside the owned renderer paths and its producer is protected by the lane rules; it needs the producer/fixture owner.
- The Windows case-contract and market-presentation setup failures are environment/fixture failures before the relevant assertions.

## Round 2b checklist evidence

| U-item | Status | Evidence |
|---|---|---|
| Legacy bytes | BLOCKED | Flag-off paths are explicit; direct legacy M05 HTML replay passes. Full frozen hashes still fail on the pre-existing baseline hash and protected producer bytes described above. |
| Reader opt-in | DONE | `reports.ts:583-584` uses the required condition and changed renderers receive the flag. |
| Neutral product labels | DONE | Flag-on report paths use `readerProductLabel`/`readerShopLabel`; the reader unit test checks that `kalodata:` does not reach visible text. |
| M01 revenue expectation | DONE | `tests/integration/research-automation-case-contract.test.ts:240` uses `formatReaderValue(... revenue, VND)`. |
| Verification | PARTIAL | Typecheck, reader unit tests and diff check pass; Windows integration setup and frozen baseline failures remain recorded above. |

## Round 3

Status: all four round-2 blocking renderer findings are addressed; coordinator commit required. No commit was created.

Changed paths:
- `src/modules/analysis/research-automation/quote-method-report.ts`: explicit `readerPlainText` flag; marker-free branch retains the origin/main quote renderer, including raw amounts, ranges, IDs, states and citation locators.
- `src/modules/analysis/research-automation/metric-method-report.ts`: explicit `readerPlainText` flag; marker-free branch retains the origin/main Metric renderer, while the reader branch groups every displayed count and ordinal.
- `src/modules/analysis/research-automation/market-presentation-report.ts`: explicit reader flag, safe literal/status rendering, and flag-off preservation of listing IDs and missing states.
- `src/modules/analysis/research-automation/reader-plain-text.ts`: unsafe non-JSON token withholding and string-safe count/ordinal formatting, including `10000` as `10.000`.
- `src/modules/analysis/research-automation/reports.ts`: passes the single reader flag into quote and Market presentation renderers.
- `tests/unit/reader-209-plain-text.test.ts`: embedded origin/main byte replay for quote, Metric and Market presentation, plus large-value and unsafe-token reader-on regression coverage.
- `docs/handoffs/READER-209.md`: this Round 3 evidence.

Plan lines and owner decisions applied:
- “Owner-facing text: plain Vietnamese, no provider names (G-08).” The reader-on path withholds snake_case, UPPER_SNAKE, `UNKNOWN`, provider-prefixed numeric refs and raw capture refs; known price states are mapped to Vietnamese.
- “Stored report versions must read back byte-identical; bump the renderer version when rendered output changes.” Marker-free renderers use explicit origin/main branches; no renderer version, producer, stored data or verification path was changed.
- “R1: an unknown value is never written as 0.” Missing and unknown values remain withheld/distinct from zero.
- “L5/R3: never add Shopee and TikTok Shop together; show each platform separately.” Market presentation keeps the existing per-platform rows.
- “No progress percentages in any UI text.” No progress percentage was added.

Finding evidence:
- Finding 1 (`quote-method-report.ts:63-64`, called from `reports.ts:647`): the false branch calls `legacyQuoteMethodSection`; the true branch retains the reader formatting. The test replays both an empty and a populated synthetic quote against embedded origin/main bytes.
- Finding 2 (`metric-method-report.ts:137-138`, called from `reports.ts:872`): `readerPlainText` replaces `neutralCopy`; the false branch calls `legacyMetricMethodSection`. The populated synthetic Metric replay covers IDs, `UNKNOWN`, wording and citation locators.
- Finding 3 (`reader-plain-text.ts:35,126-129`, `market-presentation-report.ts:7,109`): unsafe reader literals are withheld, known price statuses are mapped, and `row.missing` never emits an unknown raw status on the reader path.
- Finding 4 (`reader-plain-text.ts:82-87,156-160,195-201`, `metric-method-report.ts:10,56-60,144-178`): counts and generated labels use string-safe grouping; reader tests assert `10.000`, `Bản ghi giá #10.000` and `Sản phẩm #10.000`.

Evidence:
- `node ../tools/typecheck-win.mjs`: PASS, exit 0, `files 924 status 0`.
- `node --import tsx --test tests/unit/reader-209-plain-text.test.ts`: PASS, 6 passed, 0 failed.
- The reader-209 test covers the required unit mappings, the visible-body scan, flag-off quote/Metric/Market byte replay, a populated quote replay, and a reader-on Market row containing `10000`, `snake_case`, `UNKNOWN`, `kalodata:123`, `NON_EXACT` and large ordinal inputs.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts`: 14 passed, 4 failed, 2 skipped PDF tests. The four existing marker-free tests still expect opt-in reader text; their failures are the large money grouping, neutral product label, grouped count and unknown wording assertions. No assertion was weakened.
- `node --import tsx --test tests/unit/default-peer-reports.test.ts`: 2 passed, 1 failed on the known clean-origin frozen hash; actual `716425c52f6940d0b86a5f51f30cb2fcdb2ee6fb81cfe6ddfeaa0f2a3975ccb9`, expected `ad13eeefb55c6a7b74666f9a905cb8c4976a62ffc49574b13fb7c5a4fb6aeb5b`.
- `node --import tsx --test tests/unit/sync1-market-corrections.test.ts`: 5 passed, 2 failed. The frozen method hash is the known clean-origin actual `f86f23abab377fdbf496aa1e52b2c1965bc4ae0e9c9ecd757bf1bcb11676b167` versus expected `f9a69c9ea4260c9f62bf951b6940f9f555755a2d84f575412a9508372dc89eed`; the workbook test stops on Windows because `python3` is unavailable and then reads undefined process output.
- `node --import tsx --test tests/integration/market-presentation-report.test.ts`: 3 failures stop in fixture setup at `TypeError: Cannot read properties of undefined (reading 'toString')` (fixture line 82), before renderer assertions.
- `node --import tsx --test tests/integration/research-automation-case-contract.test.ts`: 1 failure stops in the synthetic fixture with `INVALID_LOCATED_INSIGHT_INPUT:data/profileSha256 must be equal to constant, data/adoptionSha256 must be equal to constant`.
- `git diff --check`: PASS; only the repository LF-to-CRLF working-copy warnings were emitted.

Stored-version check:
- Rechecked the report read/verify flow and API references with `rg`; no read path re-renders a stored version and compares HTML bytes. No protected producer, service, API, migration, contract, generated frontend file or other lane path was edited.

Blocked / needs other lane:
- The four existing marker-free reader expectation failures, two frozen baseline hashes and Windows fixture failures remain reported because they are outside this final renderer finding set or reproduce the known baseline/environment conditions. No test assertion was weakened.

## Round 3 checklist evidence

| U-item | Status | Evidence |
|---|---|---|
| R3-1 quote flag/replay | DONE | Explicit false branch at `quote-method-report.ts:63-64`; populated and empty embedded-byte replay tests pass. |
| R3-2 Metric flag/replay | DONE | Explicit false branch at `metric-method-report.ts:137-138`; populated Metric byte replay passes with origin/main wording and locators. |
| R3-3 unsafe reader literals/statuses | DONE | Shared reader token gate and Market status mapping are covered by the reader-on visible-body test; raw unsafe tokens do not appear. |
| R3-4 counts/ordinals | DONE | String formatter and generated labels group `10000` as `10.000`; reader-209 test passes. |
| G-02 checks | PARTIAL | Typecheck, focused reader tests and diff check pass; remaining suite failures are listed above with exact Windows/baseline evidence. |

## Round 3b

Status: the legacy/reader flag boundary is repaired and the required unit suites pass. No commit was created.

Changed paths:
- `src/modules/analysis/research-automation/descriptive-report.ts`: avoid double-escaping retained legacy source wording while preserving reader-on escaping.
- `tests/unit/research-automation-reports.test.ts`: restored four lane-authored expectations to the `origin/main` legacy bytes; no assertion was weakened.
- `tests/integration/research-automation-case-contract.test.ts`: restored the lane-authored revenue expectation and removed the reader-only test import because this fixture is marker-free.
- Round-3 changes retained and used: `src/modules/analysis/research-automation/reports.ts`, `src/modules/analysis/research-automation/quote-method-report.ts`, `src/modules/analysis/research-automation/metric-method-report.ts`, and `src/modules/analysis/research-automation/synthesis-evidence-report.ts`.

Owner decisions applied:
- “Hard constraint: change rendering only, never stored data.” No producer, stored artifact, schema, renderer version, service, API, migration, or generated file was changed.
- “Stored report versions must read back byte-identical; bump the renderer version when rendered output changes.” Marker-free paths keep the original renderer branches; the reader-on path remains opt-in.
- “R1: an unknown value is never written as 0.” Missing and unknown values remain unavailable and are not converted to zero.

Failure-by-failure evidence:

1. API classification assertion (`tests/integration/research-automation-api.test.ts:480`): the previous Linux output expected `UNKNOWN` in a new report. New reports set `readerPlainText` at `reports.ts:583-584`; the reader Metric path at `metric-method-report.ts:137-139` intentionally renders the Vietnamese “chưa rõ” wording and withholds `UNKNOWN`. This is a legitimate reader-on output change, so the existing assertion was not changed. Windows cannot reach it: the test stops in `seedNativeDamiPackage` with `INVALID_LOCATED_INSIGHT_INPUT:data/profileSha256 must be equal to constant, data/adoptionSha256 must be equal to constant`.
2. Case-contract assertion (`tests/integration/research-automation-case-contract.test.ts:240`): the prior head rendered the M01 inventory with its default reader mode because the flag was not threaded into `m01InventorySection`. Current `reports.ts:583-584,869` passes the explicit flag and `synthesis-evidence-report.ts:192` selects the legacy projection when it is false. The test expectation was restored to the legacy `origin/main` value. Windows stops before the assertion with the same pinned located-insight fixture error at `tests/helpers/native-dami-package-fixture.ts:56`.
3. Metric period-basis assertion (`tests/integration/research-automation-metric-report.test.ts:99`): the same missing flag propagation made the prior head take the reader projection while replaying a marker-free fixture. The current false branch reaches the legacy Metric/M01 renderers (`reports.ts:583-584,872` and `synthesis-evidence-report.ts:192-200`), so the output bytes match `origin/main`; no stored period basis is rewritten. Windows cannot reach the assertion: the fixture stops at line 60 with `Cannot read properties of undefined (reading 'toString')` after the unavailable workbook helper.
4. Quote arithmetic assertion (`tests/integration/research-automation-quote-methods.test.ts:144`): the previous head called `quoteMethodSection` without the flag, so its default reader mode changed `30000.00` to Vietnamese reader formatting. Current `reports.ts:647` passes the flag and `quote-method-report.ts:63-64` routes marker-free reports through the legacy renderer. The reader unit replay proves the legacy quote bytes. Windows cannot reach the assertion: the fixture rejects first with `QUOTE_METHOD_PARSER_PROFILE_NOT_PINNED` at `quote-methods.ts:129` / test line 120.
5. Peer-value assertion (`tests/unit/research-automation-reports.test.ts:70`): the lane had changed this marker-free fixture to expect reader grouping even though `readerPlainText` is false. The expectation is restored to `9007199254740993.25`; the unit suite passes and the false branch is the original `observationTable` at `reports.ts:453-455`.
6. Selected-listing assertion (`tests/unit/research-automation-reports.test.ts:177`): the lane had changed this marker-free fixture to expect `Sản phẩm #1` and `Sản lượng bán`. The expectation is restored to the original `1` and `Lượt bán`; the same legacy `observationTable` branch preserves those bytes. The full unit suite passes.

Evidence:
- `node --import tsx --test tests/unit/reader-209-plain-text.test.ts`: PASS, 6 passed, 0 failed.
- `node --import tsx --test tests/unit/research-automation-reports.test.ts`: PASS, 18 passed, 0 failed, 2 PDF tests skipped because Chromium is unavailable.
- `node ../tools/typecheck-win.mjs`: PASS, exit 0, `files 924 status 0`.
- `git diff --check`: PASS, exit 0; only Windows LF-to-CRLF warnings were emitted.
- The stored-version read/verify flow was rechecked with `rg`; no path re-renders a stored version and compares HTML bytes. No protected producer, service, API, contract, migration, generated file, or other-lane path was edited.

Blocked / needs other lane:
- The API `UNKNOWN` regex is a stale expectation for the legitimate reader-on path; it needs coordinator/test-owner disposition, not a renderer regression fix. It was not edited.
- The API, case-contract, Metric integration, and quote integration assertions remain unverified on Windows because their synthetic fixtures stop before the target assertion for the exact errors recorded above. Linux CI remains the source of truth.
- No commit was created, per the round-3b instruction.

## Round 3b checklist evidence

| U-item | Status | Evidence |
|---|---|---|
| U1 API classification output | EXPLAINED | Reader-on output intentionally withholds `UNKNOWN`; the old regex remains unchanged and is recorded for coordinator disposition. |
| U2 case-contract M01 rows | DONE | Explicit false flag is threaded; marker-free expectation restored; Windows fixture stops before the assertion. |
| U3 Metric declared period | DONE | Marker-free Metric/M01 paths retain origin/main rendering; Windows fixture stops before the assertion. |
| U4 M08 quote arithmetic | DONE | Explicit quote flag and legacy branch are active; reader unit replay passes; Windows parser fixture stops first. |
| U5 peer large value | DONE | Marker-free expectation restored; `research-automation-reports.test.ts` passes fully. |
| U6 selected listing labels | DONE | Marker-free expectation restored; `research-automation-reports.test.ts` passes fully. |
| Required checks | DONE | Reader unit, report unit, Windows typecheck, and `git diff --check` all pass. |

Coordinator disposition (round 3b): `tests/integration/research-automation-api.test.ts:480` is updated to the intended reader-on wording (`chưa rõ;` without the raw `(UNKNOWN)` code), and a negative assertion is added so the raw code cannot return. No other assertion changed.

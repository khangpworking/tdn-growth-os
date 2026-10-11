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

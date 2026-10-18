# Handoff — TREND-209 Metric table cells with a trend marker

Updated: 2026-10-18
Worktree/branch: this worktree, branch `wp/metric-trend-209` (based on `origin/main` 6a2dd5a0)
Completed: adapter parse fix, synthetic tests, manifest repin to
`p6-209-metric-adapter-v11`, runbook SHA and note.

## Finding

The results-page product and shop tables show the period change after the value:
`2,6 billion ▼ 34%`, `12,5 million ▲ 8%`, `9,9 million — 0%`, `15 —`, and ranks as
`3 ↗ 2`. `numberFromDisplay` in `tools/opencli-metric/clis/metric/capture.js` did not
accept the trailing marker and returned `null`, so the snapshot kept the displayed text
with `value: null`. The app reads only `value` (`captureNumber` in
`metric-method-bridge.ts`), so nearly every product row reached the report as
"không có số liệu". Because some rows lacked revenue, the partial-total rule (#260)
withheld the demand finding and Kết luận chính had three findings. The defect predates
the 15/10 canary; that run shows the same empty product revenue column.

The "Price in product variant" column is a range `a₫ - b₫` mapped to `minPrice`; it was
also `null`.

## Change

- `TREND_SUFFIX` strips one trailing marker (`▲ ▼ ↗ ↘ —`, the code points seen on the
  page) with an optional signed number or percent before parsing. The leading number is
  the cell value. A bare marker parses as `null`.
- `priceRangeEnd` gives `minPrice` the low end and `maxPrice` the high end of an
  `a - b` range; other columns never read a range. Reversed ranges, percentage
  bounds and bounds containing trend markers stay `null`.
- `displayed` keeps the full page text; the parsed value has precision
  `display_rounded`. Response-body values are unchanged.
- Trend-cell unit scaling shifts the decimal exponent, so values such as
  `4,1 million` become integer `4100000` rather than a floating-point fraction
  rejected by the app's integer-string contract. Existing numeric scalar cells
  retain their prior parsing.
- The change percent is not captured into `revenueChg`/`unitsChg` (kept minimal).

## Evidence

- Unit: `tests/unit/p6-209-adapter.test.ts` new test with synthetic cells (markers,
  bare marker, range ends, reversed range, W13 rank). The author's pre-review
  adapter and manifest tests passed on Windows (108/108). Review added invalid
  price-bound, integer-scaling and raw-value precedence checks; the final adapter
  and manifest tests pass on Node 24/Linux (109/109), as does `npm run typecheck`.
- Offline, no provider call: the retained DOM observations of a 2026-10-18 replay run
  were extracted DOM-only with the old and the new `capture.js`. The old extraction
  equals the retained snapshot's product rows. The new one fills revenue and units for
  every product row on both platforms and `minPrice` for every non-empty range cell;
  no previously numeric value changed and no other cell field differs.
- Review rechecked the final parser: all 200 product rows have integer revenue and
  units, all 631 previously numeric cells are unchanged, and five newly filled
  revenues no longer contain multiplication artifacts. A synthetic calculation
  confirms the original fraction fails the app contract and the fixed value passes.
- Browser-free report checks preserve platform separation, partial-total rules,
  frozen reader hashes and the rounding note without raw unit words or arrows.
  Full `sync1-market-corrections` and capture integration runs hit the 300-second
  bound in Python subprocess calls under sandbox restrictions; the six non-workbook
  sync1 checks and the isolated capture-provenance integration check pass.

## Deploy note

Captures made before v11 keep those cells empty; the app does not re-parse retained
snapshots (capture provenance is recomputed from the stored bytes). Using v11 needs the
adapter reinstalled from the repository bytes (runbook "Install or reinstall") and the
production `TDN_METRIC_OPENCLI_ADAPTER_SHA256` set to the new manifest digest, at the
same time. Both are owner-approved deploy steps.

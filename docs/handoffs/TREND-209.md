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
  `a - b` range; other columns never read a range. A reversed range stays `null`.
- `displayed` keeps the full page text; the parsed value has precision
  `display_rounded`. Response-body values are unchanged.
- The change percent is not captured into `revenueChg`/`unitsChg` (kept minimal).

## Evidence

- Unit: `tests/unit/p6-209-adapter.test.ts` new test with synthetic cells (markers,
  bare marker, range ends, reversed range, W13 rank). Adapter and manifest test files
  pass on Windows (108/108).
- Offline, no provider call: the retained DOM observations of a 2026-10-18 replay run
  were extracted DOM-only with the old and the new `capture.js`. The old extraction
  equals the retained snapshot's product rows. The new one fills revenue and units for
  every product row on both platforms and `minPrice` for every non-empty range cell;
  no previously numeric value changed and no other cell field differs.

## Deploy note

Captures made before v11 keep those cells empty; the app does not re-parse retained
snapshots (capture provenance is recomputed from the stored bytes). Using v11 needs the
adapter reinstalled from the repository bytes (runbook "Install or reinstall") and the
production `TDN_METRIC_OPENCLI_ADAPTER_SHA256` set to the new manifest digest, at the
same time. Both are owner-approved deploy steps.

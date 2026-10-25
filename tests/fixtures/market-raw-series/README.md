# market-raw-series fixtures

Inputs for `readMarketRawSeries` (`src/modules/analysis/research-automation/market-raw-series.ts`).
Each file has the shape of a capture's `raw-responses.json`.

| File | Origin |
|---|---|
| `canxi-30d-dev.raw-responses.json` | Real capture `a2419abf-5309-4ada-9695-19fb357c1a74` (keyword `canxi`, 2026-09-21 to 2026-10-20, platforms 1 and 8), from a **dev** operator instance, not prod. Trimmed: it keeps only the search-basic and insight responses, the eight headline aggregations, and the period, platform and query fields of the request. Responses keep their capture order, including the stale one-platform search and the trailing empty insight response. It has no account, session or token fields. |
| `zinc-30d-4platform.synthetic.raw-responses.json` | **Synthetic.** Same shape as the real capture, with four platforms (1, 2, 3, 8). Revenue is set to the zinc v3 target: TikTok Shop (8) 27,0 tỷ + Shopee (1) 7,9 tỷ = 34,9 tỷ, and 35,0 tỷ across all four platforms. Ids 2 and 3 stand in for the two other platforms. |
| `zinc-12m-4platform.synthetic.raw-responses.json` | **Synthetic.** No 12-month capture exists. Same shape, with a 12-month period, `interval_days: 30` and 12 calendar-month intervals per platform. Revenue across all four platforms is 380,3 tỷ, the zinc v3 target. The real 12-month interval boundaries are not confirmed. |

No real zinc capture exists, so the zinc numbers are canary values only.

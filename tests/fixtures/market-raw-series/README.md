# market-raw-series fixtures

Inputs for `readMarketRawSeries` (`src/modules/analysis/research-automation/market-raw-series.ts`).
Each file has the shape of a capture's `raw-responses.json`.

All three real fixtures come from **dev** operator captures, not prod. Each was trimmed the same way:
- **Kept:** only the search-basic and insight responses, in capture order. That includes the stale one-platform search that comes first and the empty insight response at the end.
- **Search bodies:** only the eight headline aggregations.
- **Interval rows:** only dates, revenue and units.
- **`requestBody`:** stays the stored JSON string, byte for byte. The one exception is the stale first search: its unknown page-state keys `f`, `fh` and `is_init` are removed, and the rest is re-encoded as a JSON string.

None of the fixtures has account, session, cookie or token fields.

| File | Origin |
|---|---|
| `canxi-30d-dev.raw-responses.json` | Real capture `a2419abf-5309-4ada-9695-19fb357c1a74` (`operator-dev-8787`, keyword `canxi`, 2026-09-21 to 2026-10-20, platforms [1, 8], Smart query off). |
| `zinc-30d-dev.raw-responses.json` | Real capture `adhoc-metric/vien-uong-kem-20261022/run2` (`viên uống kẽm`, 2026-09-20 to 2026-10-19, platforms [1, 8], Smart query off, `interval_days: 7`). Six weekly windows per platform; the first and last are partial. |
| `zinc-12m-dev.raw-responses.json` | Real capture `adhoc-metric/vien-uong-kem-20261022/run12` (`viên uống kẽm`, 2025-10-20 to 2026-10-19, platforms [1, 8], Smart query off, `interval_days: 30`). 13 calendar-month windows per platform; the first and last months are partial. |
| `zinc-30d-4platform.synthetic.raw-responses.json` | **Synthetic**, for the four-platform case only. Same shape, with platforms 1, 2, 3 and 8. Revenue is set to the zinc v3 target: TikTok Shop (8) 27,0 tỷ + Shopee (1) 7,9 tỷ = 34,9 tỷ, and 35,0 tỷ across all four. Ids 2 and 3 stand in for the two other platforms. |
| `zinc-12m-4platform.synthetic.raw-responses.json` | **Synthetic**, for the four-platform case only. A 12-month period with `interval_days: 30` and 12 calendar-month windows. Revenue across all four platforms is 380,3 tỷ, the zinc v3 target. Its calendar-aligned year differs from the real rolling-year capture above. |

The real zinc captures ran with Smart query off and two platforms, so they do not reach the v3 targets. Their 30-day scope revenue is about 278 triệu; the v3 target is 34,9 tỷ. The four-platform zinc totals therefore remain synthetic canaries.

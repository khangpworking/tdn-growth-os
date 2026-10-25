# market-raw-series fixtures

Inputs for `readMarketRawSeries` (`src/modules/analysis/research-automation/market-raw-series.ts`).
Each file has the shape of a capture's `raw-responses.json`.

| File | Origin |
|---|---|
| `canxi-30d-dev.raw-responses.json` | Real capture `a2419abf-5309-4ada-9695-19fb357c1a74` (keyword `canxi`, 2026-09-21 to 2026-10-20, platforms 1 and 8), from a **dev** operator instance, not prod. Trimmed: it keeps only the search-basic and insight responses, the eight headline aggregations, and the period, platform and query fields of the request. Responses keep their capture order, including the stale one-platform search and the trailing empty insight response. It has no account, session or token fields. |
| `zinc-30d-4platform.synthetic.raw-responses.json` | **Synthetic.** Same shape as the real capture, with four platforms (1, 2, 3, 8). Revenue is set to the zinc v3 target: TikTok Shop (8) 27,0 tỷ + Shopee (1) 7,9 tỷ = 34,9 tỷ, and 35,0 tỷ across all four platforms. Ids 2 and 3 stand in for the two other platforms. |
| `zinc-12m-4platform.synthetic.raw-responses.json` | **Synthetic.** Uses a 12-month period, `interval_days: 30` and 12 calendar-month intervals per platform. Revenue across all four platforms is 380,3 tỷ, the zinc v3 target. These calendar-aligned boundaries do not cover the rolling-year capture described below. |

The canxi fixture decodes the original capture's JSON-string `requestBody` fields to objects and removes unrelated aggregations. Pointer assertions against it do not establish that request pointers resolve into the original capture.

Real zinc captures exist under `~/.local/state/tdn-growth-os/adhoc-metric/vien-uong-kem-20261022/`: `run2/raw-responses.json` (2026-09-20 to 2026-10-19) and `run12/raw-responses.json` (2025-10-20 to 2026-10-19). Both request platforms [1, 8] with Smart query off; neither establishes the four-platform v3 targets. The year capture returns 13 calendar-month windows per platform, including partial first and last months. These real zinc captures are not included in the fixtures here; zinc target numbers remain synthetic canaries.

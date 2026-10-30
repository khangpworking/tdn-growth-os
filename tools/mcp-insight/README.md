# tdn-insight — Insight MCP over stored run data (parts 1 and 2)

Stdio FastMCP server (`insight_tools.py`) for the Insight report: stored run data → run warehouse → Jev theme
coding → SLAYER semantic layer → counts (part 1), then the 18-part report plan, the confidence ceiling and reason
links (part 2). Spec: OpenSpec change `insight-mcp-v1`, rules R-IM01 to R-IM09. Behavior rows: `CONTRACT.md`
(IM-Q1 to IM-Q78).

**Owner rule: no paid call without the owner's OK.** `code_reviews` is a dry run by default. A real Jev call needs
`INSIGHT_MCP_ALLOW_PAID=1` and an explicit `max_calls`; the flag is a safety net, not an authorization.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `INSIGHT_MCP_APP_DB` | yes, for `build_warehouse` | The app SQLite file. No default. Opened read-only (`?mode=ro`). When set, the other tools also resolve `run_id` against it (`RUN_NOT_FOUND`, `RUN_AMBIGUOUS`). |
| `INSIGHT_MCP_APP_ARTIFACTS` | no | Artifact root (`sha256/<2 chars>/<sha>`). Default: `artifacts/` next to the app DB. Read-only. |
| `INSIGHT_MCP_APP_CAPTURES` | no | Metric capture root holding `<run_id>/scope.json`. Default: `metric-captures/` next to the app DB. Read-only. |
| `INSIGHT_MCP_DATA_DIR` | no | Where run warehouses live (`runs/<run_id>.sqlite`). Default: `tools/mcp-insight/out/` (gitignored). |
| `INSIGHT_MCP_ALLOW_PAID` | no | Exactly `1` allows a real Jev call. Any other value refuses before the key file is read. |
| `INSIGHT_MCP_JEV_KEY_FILE` | no | File with a `TYPESAFE_API_KEY=` line. Default: the project secret file under `~/.config/tdn-growth-os/secrets/`. Read in-process; never logged or returned. |

The module sets `DO_NOT_TRACK=1` and `SLAYER_USAGE_REPORTING=off` for its own process at import.

## Tools

- `build_warehouse(run_id)` — full run UUID or an 8-hex prefix. Reads Shopee reviews (collection `pages[]`),
  TikTok Shop reviews (`kalodata.product.comment.insight`), search suggestions, Trends by province, product names
  and the run scope record, then writes the run warehouse. Returns counts per platform and source; a source with no
  stored capture is `"Chưa có dữ liệu"`. Customer text is stored only in `review_text`. A rebuild keeps coding state
  and labels whose coding inputs did not change, and keeps `count_registry`.
- `code_reviews(run_id, dry_run=True, max_calls=None, block_override=None)` — Jev theme coding with the codebook in
  `data/insight-theme-codebook.json`. A dry run returns eligible review counts, planned calls and the block selection
  (owner override, applied category, keyword, core only). A real run stops at `max_calls` and at the first failed
  call (`JEV_THEME_UNAVAILABLE` or `JEV_THEME_INVALID`), with no retry.
- `theme_counts(run_id, question=None)` — rows per platform, theme and polarity with reviews, writers, products,
  the R-I33 threshold, check 2 and check 3 flags and a count ID. `question` filters one theme code.
- `keyword_counts(run_id)` — distinct search suggestions per keyword group from `data/keyword-groups.json`
  (`UNREVIEWED`, not owner-approved), with the 5-keyword threshold and `step_totals`.
- `portrait_counts(run_id)` — `rows`: «Ai dùng» and «Mua cho ai» group rows, and gender and age-band rows guessed
  from account names (label `Giả thuyết`, at most `Yếu`); `demographics[platform]`: known writers per dimension, or
  `"Chưa có dữ liệu"`. Totals only; never a per-person result.
- `report_plan(run_id)` — the 18 parts of R-I30 from `data/report-frame.json` (`UNREVIEWED`, not owner-approved):
  per part the question, kind, label (`Khung`, `Chưa có dữ liệu`), steps and ceiling; per data part one cell per
  source with a role for its question (R-I34), with status, count IDs and steps from the count rows. TikTok Shop
  reviews are `Chưa dùng được` until a recorded revenue share is 50% or more. `unanswered` lists every cell
  without data («Những gì báo cáo chưa trả lời được», R-I37). Synthesis parts 1, 16 and 17 have no ceiling, only
  `potential_ceiling`.
- `confidence_ceiling(run_id, part, evidence, hypothesis=False)` — grades each cited count ID by the 4 checks of
  R-I32 (right source, sample size and brand diversity, owner sample review of the rules, method stable on 3 or
  more products) and returns the lowest item level: `Chắc`, `Khá`, `Yếu` or `Không`. Partial answers and
  hypotheses are capped at `Yếu`. Writes nothing.
- `find_reason_links(run_id, theme_a, theme_b)` — per platform, the reviews with current labels for both themes,
  a reason word (`vì`, `nên`, `do`, `để`) and a person's reading of the current text saying the customer joins the
  two themes with a reason. Reviews with no reading are `candidates` (no count, no ID).
- `read_reviews(run_id, ids)` — the stored text of 1 to 20 reviews, for reading on the host only. Never put it
  in a report (R-I11).

## Shared store

`<data dir>/insight-shared.sqlite` holds evidence from people that a run warehouse cannot hold: owner sample
reviews, the method ledger, brand-diversity checks, revenue shares and reason readings. Tools open it read-only and
never create it; a missing store reads as empty. Only these module functions write it, for the owner or the
coordinator; they are not MCP tools:

- `record_sample_review(rules_kind, rules_version, reviewed_by, reviewed_at, sample_size, passed)`
- `record_method_approval(method_key, subject_key, run_id, approved_by, approved_at)`
- `record_diversity_check(count_id, brands, checked_by, checked_at)`
- `record_revenue_share(run_id, platform, share_percent, recorded_by, recorded_at)`
- `record_reason_check(run_id, review_id, theme_a, theme_b, linked, checked_by, checked_at)` (stores the sha256 of
  the review's current text, never the text)

Invalid arguments raise `ValueError` and write nothing. No record is seeded, so with the current data no claim is
above `Yếu`.

Every count is computed twice, by SLAYER (models in `semantic/`) and by a fixed reference SQL; any difference
returns `SLAYER_SQL_MISMATCH` and no numbers. Errors are `{"error": "<CODE>", "message": "<text>"}` and never carry
exception text. The owner rule F310 is fixed in code: a codebook with Giao hàng, Đóng gói or Dịch vụ shop is
rejected (`CODEBOOK_EXCLUDED_THEME`).

## Test seams

- `_jev_transport(request, api_key) -> (http_status, raw_bytes)` is the only network path. `request` holds only
  the IM-Q20 fields (`text`, `platform`, `product_name`, `block_label`, `codebook_version`, `questions` with `code`,
  `name`, `include`, `exclude`, `options`); the transport turns it into the Jev wire body. Tests replace it with an
  offline fake.
- `_slayer_query(...)` runs one SLAYER query; tests can patch it to force a mismatch or an exception.
- `_load_semantic_models(directory)` loads the YAML models and raises `ValueError` on a measure named like a column.
- `CODEBOOK_PATH`, `KEYWORD_GROUPS_PATH`, `REPORT_FRAME_PATH` and `SEMANTIC_DIR` name the data files.

SLAYER runs in-process. Its asyncio event loop opens a local `AF_UNIX` socket pair for its own wake-up pipe; no
tool connects, binds or resolves a host.

## Install

```sh
python3 -m pip install -r tools/mcp-insight/requirements.txt       # server
python3 -m pip install -r tools/mcp-insight/requirements-test.txt  # server + pytest
```

## Run the tests

```sh
PYTHONDONTWRITEBYTECODE=1 python3 -m pytest tools/mcp-insight/tests -p no:cacheprovider
```

The suite is offline with synthetic fixtures. No app call, no Jev call, no write to the app home. `tests/README.md`
lists the internal names the harness relies on ("Contract gaps").

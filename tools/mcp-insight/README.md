# tdn-insight — Insight MCP over stored run data (parts 1 to 3)

Stdio FastMCP server (`insight_tools.py`) for the Insight report: stored run data → run warehouse → Jev theme
coding → SLAYER semantic layer → counts (part 1), then the 18-part report plan, the confidence ceiling and reason
links (part 2), then the checked report parts and insight statements the agent writes, and the rendered report
(part 3). Spec: OpenSpec change `insight-mcp-v1`, rules R-IM01 to R-IM12. Behavior rows: `CONTRACT.md` (IM-Q1 to
IM-Q125). The call order for an agent is in `skills/tdn-insight-report/SKILL.md`.

**Owner rule: no paid call without the owner's OK.** `code_reviews` is a dry run by default. A real Jev call needs
`INSIGHT_MCP_ALLOW_PAID=1` and an explicit `max_calls`; the flag is a safety net, not an authorization.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `INSIGHT_MCP_APP_DB` | yes, for `build_warehouse` | The app SQLite file. No default. Opened read-only (`?mode=ro`). When set, the other tools also resolve `run_id` against it (`RUN_NOT_FOUND`, `RUN_AMBIGUOUS`). |
| `INSIGHT_MCP_APP_ARTIFACTS` | no | Artifact root (`sha256/<2 chars>/<sha>`). Default: `artifacts/` next to the app DB. Read-only. |
| `INSIGHT_MCP_APP_CAPTURES` | no | Metric capture root holding `<run_id>/scope.json`. Default: `metric-captures/` next to the app DB. Read-only. |
| `INSIGHT_MCP_DATA_DIR` | no | Where run warehouses (`runs/<run_id>.sqlite`), the shared store, the report store and the rendered reports (`reports/<run_id>/`) live. Default: `tools/mcp-insight/out/` (gitignored). |
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
- `submit_section(run_id, part, text, claims)` — one report part (1 to 17) written by the agent. Each claim is
  `{ref, evidence, confidence, step, hypothesis, conclusion}` and is tied to its sentence by the marker `[^ref]`.
  The MCP checks numbers against the cited counts, the confidence ceiling, thresholds, copied review words,
  conversion rates, Market numbers, hidden names, «người mua», steps, «kể lại», sentences without a claim and banned
  ideas (R-IM10, R-I31, R-I22). It returns every failed reason code, or stores the part as a new version.
- `submit_statement(run_id, statement, replaces=None)` — one insight statement in the 9 fields of R-C01 (R-IM11),
  with evidence lines on count rows or reason links («Tại sao» layers). Accepted statements are stored as versions,
  with a payload in the app's import shape (`contracts/analysis/insight-report-statement.schema.json`, without
  `revisionId`). No app table is written.
- `render_report(run_id)` — writes `reports/<run_id>/report.html` (static, no script) and `themes.json`,
  `keywords.json`, `portraits.json`, `parts.json` from the latest accepted versions (R-IM12). Parts never accepted
  show «Chưa viết»; parts whose counts changed show «Cần gửi lại: số liệu đã đổi». The same content is archived
  once.

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
above `Yếu`. A reason-link method approval uses the key
`find_reason_links:<review source>:<codebook version>+reason-2026-10-30.1` (IM-Q124).

## Report store

`<data dir>/insight-report.sqlite` is the MCP's own archive, never the app DB. Only the three part 3 tools write it,
and only on success: `section_version` (accepted parts), `statement_version` (accepted statements) and
`render_archive` (one row per distinct rendered report). Triggers abort every `UPDATE` and `DELETE`: a re-submit is
a new version, never an overwrite. A rejection writes nothing and does not create the store. No table holds review
text.

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
- `_now()` is the only clock of the part 3 tools (UTC); it is written only into `submitted_at` and `rendered_at`.

SLAYER runs in-process. Its asyncio event loop opens a local `AF_UNIX` socket pair for its own wake-up pipe; no
tool connects, binds or resolves a host.

## Register the MCP

Each client runs `insight_tools.py` over stdio as a server named `tdn-insight`. Replace the app DB placeholder
with the path of the app SQLite file. The paths below are relative to the repository root; use absolute paths
when the client starts elsewhere. Never add `INSIGHT_MCP_ALLOW_PAID` or a key to a client config: a paid coding
run is a separate, owner-approved step.

### Claude Code

Project config `.mcp.json` at the repository root (same as `.mcp.json.example`):

```json
{
  "mcpServers": {
    "tdn-insight": {
      "command": "python3",
      "args": ["tools/mcp-insight/insight_tools.py"],
      "env": {
        "INSIGHT_MCP_APP_DB": "<path to the app SQLite file>"
      }
    }
  }
}
```

Or register it with a command:

```sh
claude mcp add tdn-insight --scope project -e INSIGHT_MCP_APP_DB="<path to the app SQLite file>" -- python3 tools/mcp-insight/insight_tools.py
```

### Codex

`~/.codex/config.toml`:

```toml
[mcp_servers.tdn-insight]
command = "python3"
args = ["tools/mcp-insight/insight_tools.py"]
env = { INSIGHT_MCP_APP_DB = "<path to the app SQLite file>" }
```

### OpenCode

`opencode.json` at the repository root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "tdn-insight": {
      "type": "local",
      "command": ["python3", "tools/mcp-insight/insight_tools.py"],
      "enabled": true,
      "environment": {
        "INSIGHT_MCP_APP_DB": "<path to the app SQLite file>"
      }
    }
  }
}
```

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

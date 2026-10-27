# tdn-market — thin Market MCP over the app owner API

Stdio FastMCP server (`market_tools.py`) for the Market research flow. The app host and port are pinned to
`127.0.0.1:8787`; the `Origin` header is pinned to the same place. Reads are always allowed. `start_market`,
`confirm_preset` and `cancel_run` refuse unless `MCP_PROTO_ALLOW_WRITES=1` is set.

**Owner rule: no live start without the owner's OK.** The write guard is a safety net, not an authorization to
run a real capture.

## Environment

| Variable | Required | Purpose |
|---|---|---|
| `TDN_WORKSPACE_ID` | yes, for every tool | Workspace UUID. There is no built-in default; an unset value is an error. |
| `TDN_APP_TOKEN` | no | Runtime bearer token. When unset, the local test-session endpoint is used. Never logged or returned. |
| `MCP_PROTO_ALLOW_WRITES` | no | Set to `1` to allow the three write tools. Any other value keeps them refused. |

## Tools

- `start_market(product, keyword1, period_days=365)` — start-v2, `PRODUCT`, `MARKET` only, period ends
  yesterday in Vietnam time, rejects periods shorter than 365 days.
- `run_status(run_id)` — status, steps, auto-run phase, keyword-2 suggestion, Reader revisions, owner-facing message.
- `confirm_preset(run_id, keyword2, category_ids=None)` — answer the keyword-2 wait with the capture preset; only at
  `KEYWORD2_AWAITING`.
- `get_report(run_id, format)` — latest Market Reader revision as `html`, `pdf` or `numbers`.
- `list_number_refs(report_id)` — list number refs for an exact Market Reader `revisionId`.
- `explain_number(report_id, number_ref)` — section, capture date/settings, evidence status and section/full-page
  private image links plus `urls.sourcePdf` when the original-page screenshot PDF was archived (24 h).
  `sourcePdf` metadata records its hash, size and page count. This is a screenshot of the original source,
  separate from the generated Market report returned by `get_report(..., "pdf")`. Capture once per window;
  later evidence reads use R2 and never revisit Metric. Existing reports without a source PDF keep their original links.
  Both evidence tools require `TDN_APP_TOKEN` and `TDN_WORKSPACE_ID`; they make only
  an authenticated GET, regardless of the write flag. Requires app flag `TDN_METRIC_EVIDENCE_ENABLED=1`.
  Template labels are identified as template text; unavailable images have an explicit code.
- `cancel_run(run_id, expected_revision=None)` — cancel with a revision guard.

The preset is the retained `metric-v3-capture-spec-v1`: exactly two keywords and all four verified Sức Khoẻ
children. Omit `category_ids` or supply all four; partial subsets are rejected before any HTTP call. The shared
form default in `src/shared/metric-v3-preset.ts` is now the v2 contract (one or two keywords); moving this MCP to
v2 is a separate change, so it keeps emitting v1.

## Install

```sh
python3 -m pip install -r tools/mcp-market/requirements.txt
```

## Run the tests

```sh
python3 -m unittest discover -s tools/mcp-market/tests
```

The suite is offline. Fixtures in `tests/fixtures` are synthetic, contract schemas are read from this repository
(`contracts/api/research-automation-api.schema.json`, `contracts/analysis/metric-v3-capture-spec*.schema.json`,
`src/shared/metric-v3-preset.ts`), and an audit hook rejects every socket or DNS attempt. No app call, no write,
no agent CLI.

Negative controls re-run the write-guard and category-rejection tests against temporary copies of the module with
one check removed, then confirm the real source and fixtures are unchanged.

## Register for Claude

From the repository root, with `TDN_WORKSPACE_ID` exported:

```sh
claude --mcp-config tools/mcp-market/.mcp.json.example --strict-mcp-config
```

The example registers `tdn-market` with `python3` and the repository-relative
`tools/mcp-market/market_tools.py`, so it works from a fresh clone. It does not touch global configuration.

## Register for Codex

Per-call `-c` overrides; `~/.codex/config.toml` stays untouched. `--approve-for-me` lets Codex start the stdio
server under its default approval policy; the three write tools still refuse because this command unsets
`MCP_PROTO_ALLOW_WRITES`.

```sh
env -u MCP_PROTO_ALLOW_WRITES codex exec --skip-git-repo-check --approve-for-me \
  -c 'mcp_servers.tdn-market.command="python3"' \
  -c 'mcp_servers.tdn-market.args=["tools/mcp-market/market_tools.py"]' \
  '<task>'
```

See the [Codex MCP documentation](https://developers.openai.com/codex/mcp/) for configuration and the
[CLI reference](https://developers.openai.com/codex/cli/reference/) for invocation options.

## Read-only probe

`tools/probe_market.py` reads one stored run and proves that the three write tools send nothing:

Replace the quoted placeholders with the workspace and stored-run UUIDs:

```sh
TDN_WORKSPACE_ID='<workspace-uuid>' python3 tools/mcp-market/tools/probe_market.py --run-id '<run-uuid>'
```

`TDN_RUN_ID` may replace `--run-id`. Reports are saved under `tools/mcp-market/out/` (gitignored). The probe
never starts, confirms or cancels a run.

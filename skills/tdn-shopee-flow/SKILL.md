---
name: tdn-shopee-flow
description: Run, watch and check the TDN Shopee review flow of the tdn-growth-os operator app (keyword → Metric → pick 5 Shopee links → collect reviews → load DB → Jev filter → Jev labels). Use when someone asks to run the Shopee flow, start an autorun, do a small test run, check whether a run passed, find where a flow step lives in the code, or hand the flow over to a new person. Works on the app host itself or over SSH from any machine. Not for writing Insight reports.
---

# TDN Shopee flow

The app runs the whole flow in code. One start request runs every step. Your job: check the state, start a run only when the owner approved it, watch it, verify the gates, and report the numbers.

**Owner** in this skill = the person who is responsible for the app and its costs. Usually that is the person who gave you the task. If you are not sure who can approve a run, ask before you start one.

## Step 0: reach the app host and find the script

The app runs on a Linux host (`/proc`, `ss`, Python 3) and listens on `127.0.0.1:8787` only. All commands run on that host, as the OS user that owns the app process. The script checks this and stops with a clear message if you are on the wrong host or user.

The script is `scripts/shopee_flow.py`, next to this `SKILL.md`. Pick the first way that works:

| You are | Command form (`<sub>` = subcommand) |
|---|---|
| **A. On the app host** and the skill folder is here | `python3 <skill dir>/scripts/shopee_flow.py <sub>` |
| **B. On the app host**, path unknown | find it: `find ~ -path '*tdn-shopee-flow/scripts/shopee_flow.py' 2>/dev/null \| head -1`, then form A |
| **C. On another machine** with SSH access | `ssh <user>@<host> python3 - <sub> < scripts/shopee_flow.py` (the script is sent on stdin; nothing to install on the host) |

Use the full script path in every command. Shell variables do not survive between agent tool calls.

Form C notes:
- Keep host-key checking on (`-o StrictHostKeyChecking=yes`). Do not accept a new host key without asking the owner.
- Arguments with spaces need one more quote layer, for example `ssh <target> "python3 - start --keyword 'viên uống kẽm' --dry-run" < scripts/shopee_flow.py`.
- PowerShell has no `<` redirect: use `Get-Content -Raw scripts/shopee_flow.py | ssh <target> python3 - <sub>`.
- The host address, user and key are not in this skill. Ask the owner, or read `references/` if the owner put a setup note there.

Optional overrides (env vars on the host): `SHOPEE_FLOW_PORT` (default `8787`), `SHOPEE_FLOW_STATE` (default `~/.local/state/tdn-growth-os`), `SHOPEE_FLOW_RUNS` (default `~/.local/state/tdn-shopee-modules/runs`), `SHOPEE_FLOW_PRESETS` (default `~/.local/state/tdn-shopee-modules/presets`).

First command, always: `status`.

## Module flow

The whole flow above is one autorun inside the app. The module flow is the second way to run the same work, split into three modules with a gate after each step. Each module has its own skill; read the skill of the module you are about to run.

| Module skill | Command | Input | Output | Gate |
|---|---|---|---|---|
| `tdn-shopee-m1-metric` | `python3 shopee_flow.py m1 --run <runId>` | `request.json` (`request-v1`) | `m1/spec.json` + `m1/<generated UUID>/run1/` (`manifest.json`, `30d/`, `12m/`) | `entry` → M1 → `m1` |
| `tdn-shopee-m2-chon` | `python3 shopee_flow.py m2 --run <runId>` | `m1/` | `m2/selection.json` (`selection-v1`) | `m2` |
| `tdn-shopee-m3-binh-luan` | `python3 shopee_flow.py m3 --run <runId>` | `m2/selection.json` | `m3/reviews.json` (`shopee-public-rows`) + `m3/outcome.json` (`m3-outcome-v1`) | `m3` |

Add `--detach` to a module command to start it in the background. It prints `{ "format": "detached-v1", "runId", "pid" }` and exits 0 at once. The blocking rules run before the detach, so a blocked start still returns 22, 23 or 24.

M3 đạt khi mỗi link có ít nhất 1 bình luận. Kết luận thu `PARTIAL_LISTINGS` vẫn giữ các dòng đã thu và cổng M3 vẫn `PASS`; link có ít bình luận hơn trần chỉ là cảnh báo (`links_below_cap`), không làm cổng trượt.

The four gates are `entry`, `m1`, `m2`, `m3`. A gate reads the run folder, runs its checks, writes the slip to `gates/<gate>.json` and prints the same slip as one JSON object. It never calls the network and never writes outside the run folder. Gate command:

```
python3 shopee_flow.py gate <entry|m1|m2|m3> --run <runId>
```

Commands of contract section 5:

| Command | Prints |
|---|---|
| `presets` | `{ "format": "presets-v1", "presets": [] }` |
| `new-run --stdin` | reads `{ "presetId", "endDate", "reviewCapPerLink" }`; writes `request.json` and `state.json` (`IDLE`); prints `{ "format": "new-run-v1", "runId" }`. Run ID = 8 hex characters. Runs no gate. |
| `runs` | `{ "format": "runs-v1", "runs": [] }`, newest first |
| `run-info --run <runId>` | `run-info-v1`: `readonly`, `request` (without `captureSpec`), `state`, `modules` with `canRun` and `blockedBy`, `gates`, `selection`. It changes no file. |
| `library` | `{ "format": "library-v1", "modules", "skills": [] }` |
| `run --run <runId>` | entry gate, then M1, M2, M3; calls the next module only after `PASS`; prints `run-result-v1` and exits with the code of the stopping gate |

Exit codes: `0` PASS, `20` FAIL, `21` WAIT_OWNER, `22` GATE_NOT_PASSED, `23` GATE_INPUT_CHANGED, `24` RUN_BUSY, `2` usage error, run not found, or a preset/input the command cannot read.

Blocking rules, shared by the gates, `run-info` and the module commands:

1. The slip of the step before must exist and its `verdict` must be `PASS`. Otherwise the step stops with `GATE_NOT_PASSED` before any other check or any network call.
2. The input now must hash to the `outputSha256` on that slip. Otherwise the step stops with `GATE_INPUT_CHANGED`; the file must pass its gate again.
3. The read-only guard stops `m1` and `m3` with `READONLY_ON` (exit 20). The guard is the env `TDN_SHOPEE_FLOW_READONLY=1` or the file `<state>/shopee-flow/READONLY`. `m2` runs offline and is not guarded.
4. A run that is `RUNNING` with a live pid refuses a second start with `RUN_BUSY` (exit 24). A dead pid means the run was interrupted: the next command marks it `STOPPED` with `RUN_INTERRUPTED` and goes on.

Hashes: a file hashes its own bytes; `m1/` and `m3/` hash recursively as sorted `<relative posix path>\t<sha256>\n` lines (D9, D8).

`captureSpec` in `request.json` is optional (R2). When it is absent, the entry gate records the warn check `capture_spec_present` (`ok: false`, `got: "absent"`) and the run still passes. When it is present and invalid, the entry gate fails. M1 always needs it: without `captureSpec`, M1 stops with `CAPTURE_SPEC_MISSING` before any Metric call. `new-run` always writes a complete `captureSpec`.

Commands and versions: the map from flow to module, skill, version, command, standard, gate and parameters is `skills/tdn-shopee-flow/modules.json`; read it before you run a module. The two formats are described for people in `skills/tdn-shopee-flow/chuan/handoff-v1.md` and `chuan/selection-v1.md`.

This section holds no business rule. Each module skill states its rules and names the app code file and function that holds them. The module command runs that code. When a gate is not `PASS`, open the module skill and follow its error table: module retries are 0, a lost login or a verification step stops the run and goes to the owner (exit 21, `WAIT_OWNER`). M2 reads the `30d` window for a preset run, or `run2`/`run1` for a legacy run (R1); M2 counts masked Shopee rows and fails when a masked row has revenue above the lowest picked link (R3, owner decision Q6).

## Rules

1. **Owner approval decides what you may do.** An approval must name: the keyword, TEST (cap N) or a full run, and whether you may restart the app for test mode. Do only what the approval names. "Check", "verify" or "does it work" is **not** approval to start a run.
2. **`--confirm` is a typo guard, not an approval.** The script cannot know if the owner approved. You must know it from the conversation before you add `--confirm`.
3. **The app may be production.** `test-mode on|off` restarts it. Restart only inside the approval and only when `status` shows nothing in flight.
4. **A run costs money.** One MARKET run ≈ 66 Kalodata calls, 8 SerpApi calls and some Gemini calls, plus Jev calls (cost not recorded). A full run collects up to 300 reviews per link.
5. **Do not repair a run by hand.** When a step fails: keep the evidence, diagnose, report the step and the stop code, and stop. Do not load files by hand, answer keyword 2, confirm scope by hand, or start again unless the approval covers a new start.
6. **Change no code and no original config.** The script writes test copies only.
7. **Do not print secrets or review text.** The script prints only allowed fields. Do not add `cat` of env files, tokens or review rows to your report.
8. **Metric:** never click "follow shop" (it creates a tracking group). Only the owner can switch the Metric page language.
9. **"Does the flow work?" needs `verify`.** A `DONE` row in `status` is not proof: a run can end `DONE` with 0 reviews. Run `verify` on the latest DONE run and answer from its gates. If its reviews were all already in the DB (`new 0`), say so: the filter and labels then reused old rows and Jev was not called.
10. **Read-only switch.** If `guard-check` says `WRITES BLOCKED`, every write is refused. Report it and stop. Do not remove the switch yourself.

## Run the flow

| # | Do | Subcommand | Good result |
|---|---|---|---|
| 1 | Read state | `status` | tested release, `in flight` all 0, ports 8877 and 19825 listening, env differs in `nothing` |
| 2 | TEST only: small cap (approval must allow a restart) | `test-mode on --cap 10` (plan), then add `--confirm` | `TEST mode on`, cap 10, env matches |
| 3 | Dry run | `start --keyword "<keyword>" --dry-run` | `PREFLIGHT OK`, nothing sent |
| 4 | Start | TEST: `start --keyword "<keyword>" --confirm` · full run: add `--full-run` | `HTTP 202` and a `runId` |
| 5 | Watch (run it in the background) | `watch <runId>` | exit 0 = DONE and DB load finished (3 = STOPPED, 4 = timeout, 5 = DONE without DB load) |
| 6 | Verify | `verify <runId>` and `usage <runId>` | `RESULT PASS`, exit 0 |
| 7 | TEST only: restore — **always**, also after a FAIL, once nothing is in flight | `test-mode off --confirm` | `NORMAL mode restored`, env matches the original file |
| 8 | Report | see "Report" | — |

Other read-only subcommands: `guard-check` (are writes blocked in this shell?), `run-status <runId>` (one snapshot).

Timing: TEST cap 10 ≈ 10 minutes. A full run ≈ 30–40 minutes.

`start` options: `--description "<one line about the product>"`, `--reports MARKET` (default) or `MARKET,INSIGHT`, `--workspace <id>` (needed only when the DB has more than one workspace). The script always sends contract `research-automation-start-v2` with `waitForKeyword2: false`, mode `CATEGORY` and the last 365 days. Contract v1 makes the run wait for keyword 2 and it stops with `KEYWORD2_AWAITING`.

`start` refuses (PREFLIGHT FAILED) when: work is in flight; an earlier request has an unknown outcome; the running env differs from the expected config; a required flag or port is off; reports is not exactly `MARKET` or `MARKET,INSIGHT`; the release is not tested (`--allow-untested-release` after you read the code map); a run for the same keyword started in the last 30 minutes (`--allow-recent`); NORMAL mode without `--full-run`; TEST mode with reports other than `MARKET` or a cap outside 1..20.

Each start request is saved in `<state>/shopee-flow/requests/<uuid>.json` with a state (`PREPARED`, `NOT_SENT`, `SENDING`, `UNKNOWN`, `REFUSED`, `STARTED`). If `start` gets no clear answer, the state is `UNKNOWN`: the run **may** exist. Do not resend. Report the request file to the owner. Every later `start` refuses until the owner checks the app and sets that file's state to `RESOLVED`.

If the app is not ready after a restart, the script stops and lists live app processes. Then:
- an app process is alive (port open or not): read `operator.log`, report, ask the owner. Do not start another app.
- no app process is alive: `recover` (plan), then `recover --confirm`. It starts the original launcher from `<state>/shopee-flow/recovery.json` and checks the release and the full env. If an executor lock is left with no app, it stops: ask the owner.

TEST mode facts: cap 1..20 reviews per link, MARKET-only runs. The app always picks 5 Shopee links (`AUTORUN_MAX_SHOPEE_LINKS = 5`, no knob), so cap 10 gives at most 50 reviews. The same keyword often returns the same reviews: use a new keyword when you need new data.

## Gates (`verify`)

| Gate | PASS when | Why |
|---|---|---|
| G1 | autorun `phase = DONE` | the state machine finished |
| G2 | `exactShopeeOutcome = OK` and reviews per link sum > 0 | a run can end DONE with 0 reviews (`PROVIDER_BLOCKED`) |
| G3 | DB load finished, `s05 = LOADED`, and collected = `runReviewsInserted` = S05 `run_review` rows | counts match from collection to DB |
| G4 | `filtering = FILTERED`, policy and counts present, nothing failed or unassessed, **0** S05 reviews of the run without a filter row for the run's policy | the filter covered the run |
| G5 | `labelling = LABELLED`, codebook and counts present, labelled = planned, **0** S05 reviews with content (filter outcome not `NO_CONTENT`) without a label of the run's codebook | labels cover the run. Old labels of the same codebook count; only unlabelled reviews get new ones |

Missing result metadata (no policy, no codebook, no counts) is a FAIL: there is not enough evidence. Coverage is measured at the time you run `verify`.

PASS means the steps ran and the counts match. It does **not** mean the filter controls the labels. `verify` also prints known gaps; report them as they are:
- The filter runs in shadow. The labeller does not read it, so reviews the filter did not keep can still carry theme labels (the count is printed).
- The COLLECTION step can be `PARTIAL` and the run still ends `DONE`.
- Masked Shopee ids (phone-number form) are dropped by the pick step with no count or warning.

## When a run stops or a gate fails

Read `run-status <runId>`. Report the stop code and the possible cause. Do not fix it yourself.

| Sign | Possible cause | Report and suggest |
|---|---|---|
| `KEYWORD2_AWAITING` | started with contract v1 | a new start with this script (needs approval) |
| `METRIC_UI_CHANGED` | often: the Metric page is in another language (the adapter reads English labels) | owner switches Metric to English in the menu |
| Metric `TIMEOUT` or capture fails at once | OpenCLI Chrome extension silent, or Metric logged out | owner checks Chrome on the app host: Metric login, extension |
| G2 FAIL, `PROVIDER_BLOCKED` | Shopee review service got no reviews | owner checks the service on port 8877 and its Shopee session; no retry loop |
| G3 FAIL, `RAW_DB_PRODUCT_NAME_MISSING` | often: scope confirmed by hand, so no Metric product list | let the autorun pick; never confirm scope by hand |
| G3/G4/G5 FAIL with an error | loader, filter or labeller error | quote the error line from `verify` |
| watch exit 5 | run DONE but no DB load row | check `TDN_RAW_DB_AUTOLOAD_ENABLED` in `status`, read `operator.log` |

## Known limits of this script

- The in-flight check is not atomic. Someone can start a run in the app form between the check and a restart. The app has no maintenance lock.
- `--confirm` does not prove approval. Technical enforcement needs a control outside the agent (owner-held permission). Not built.
- Tested on release `4681ca05`, schema migration 73. On another release, read the code map first and expect `--allow-untested-release`.

## Where things are

Code checkout: `~/.local/share/tdn-growth-os/operator-checkout-<sha8>/` (`status` prints the live path). Line numbers change per release; search by name.

| Step | File (under `src/modules/`) | Search for | Output |
|---|---|---|---|
| Start request | `analysis/research-automation/service.ts` | `validateStart`, `research-automation-start-v2` | `analysis_research_automation_runs` |
| State machine | same file | `type AutorunPhase` (WAITING_SCOPE → CAPTURE → PREPARE → PICK → CONFIRM → WAIT_DRAFT → PRESENT → DONE / STOPPED) | `research_automation_autorun` |
| Metric capture | adapter `~/.opencli/clis/metric/` (repo copy `tools/opencli-metric/clis/metric/`) | `metric.js`, `capture.js` | `<app dir>/metric-captures/<runId>/` |
| Keyword 2, category | `analysis/research-automation/autorun-scope.ts` | `planScope`, `chooseKeyword2` | `scope.json` in the capture folder |
| Pick 5 links | `analysis/research-automation/autorun-derive.ts` | `AUTORUN_MAX_SHOPEE_LINKS`, `pickShopeeLinks` | pick artifact (`pick_artifact_id`) |
| Shopee reviews | review service on port 8877 (find its folder: `ss -ltnp \| grep 8877`, then `/proc/<pid>/cwd`); outcome `analysis/research-automation/exact-shopee-outcome.ts` | `TARGET_REVIEWS = 300`, `PROVIDER_BLOCKED` | `foundation_shopee_collections`, COLLECTION step result |
| Review cap flags | `analysis/research-automation/providers.ts` | `TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT`, `TDN_RESEARCH_AUTORUN_TEST_REVIEWS` | — |
| Load DB (7 sources) | `raw-db/autoload.ts` | `autoloadRunToDbV1` | `raw_db_autoload`, `raw_capture`, `review`, `run_review`, `product` |
| Shopee loader | `raw-db/shopee-reviews-loader.ts` | — | S05 rows |
| Jev filter | `raw-db/review-filter.ts` | `REVIEW_FILTER_POLICY_VERSION`, `filterReviewsInDbV1` | `review_filter_assessment` |
| Jev labels | `raw-db/review-labeller.ts` | codebook `tools/mcp-insight/data/insight-theme-codebook.json` | `review_code` |
| Rerun the DB load by hand | `scripts/raw-db-load.ts` | `--source AUTOLOAD --run <runId>` (writes DB, calls Jev: owner approval) | — |

Runtime files (`status` prints the live paths):
- App process: `ss -ltnp | grep 8787`. Its env: `/proc/<pid>/environ` (`TDN_WORKSPACE_DB`, `TDN_ARTIFACT_ROOT`).
- App dir: the parent of `TDN_WORKSPACE_DB`. It holds `operator.pid`, `operator.log`, `metric-captures/`, `artifacts/sha256/<2>/<sha>`, launchers `start-<sha8>.sh`.
- Deploy record: `<state>/<deploy folder>/deployment.json` (`release`, `launcher`, `rollbackLauncher`, `backup`). The launcher reads that folder's `environment.json`.
- Owner API token: `POST /owner-api/local-test-session` with header `Origin: http://127.0.0.1:8787`. No fixed token. `GET /` = 200 when the app is ready (`/health` is 404).
- No timer starts runs. A run starts only from the app form or this script.

## Report

One table: gate, PASS/FAIL, the numbers from `verify` (reviews per link, rows loaded, new vs already in DB, filter rows by outcome, labels). Then the known gaps with their counts, the `usage` lines (unknown cost stays "unknown"), the run id, the mode (TEST cap N or NORMAL), and confirm the app is back in NORMAL mode.

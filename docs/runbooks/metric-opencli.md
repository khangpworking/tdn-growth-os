# Metric through OpenCLI

This runbook records the P6-01 setup and the results-page capture boundary. The
pinned package is `@jackwener/opencli@1.8.8` with npm integrity
`sha512-T0rp89sVWMKdnQHoYwkRDuACy7k/lCvVScOZmpqnBhd1AnXG6XLYSYO6U0D/Zdj8qq9kQqgop3qmElNcbMr+sw==`.

The OpenCLI Chrome extension is version 1.0.24. Its reviewed permissions are
`debugger`, `tabs`, `cookies`, `activeTab`, `alarms`, `storage`, `tabGroups`,
and `downloads`; its host permission is `<all_urls>`. The Metric adapter itself
uses only the Metric domain and never reads cookies or tokens.

`opencli doctor` completed successfully: daemon 1.8.8 was running, extension
1.0.24 was connected, and connectivity was OK. The daemon listener was verified
as loopback-only. Restart it with:

```text
opencli daemon restart
opencli doctor
```

The adapter source is under `tools/opencli-metric/clis/metric/`, with the user
adapter installed from the same repository bytes. The executor verifies
`tools/opencli-metric/adapter-manifest.json` before each run. `whoami` reads
only login, captcha, page-state and any displayed analysis lookup balance.
The current manifest SHA-256 is
`a15069bcda3f2dd54c73306d87843ae5654ee0a7ad9beaed57877a2dd0f452d5`.

Install or reinstall the adapter from the checked-out repository bytes with:

```text
mkdir -p ~/.opencli/clis/metric
cp tools/opencli-metric/clis/metric/metric.js tools/opencli-metric/clis/metric/parser.js tools/opencli-metric/clis/metric/capture.js ~/.opencli/clis/metric/
cp tools/opencli-metric/adapter-manifest.json ~/.opencli/clis/metric/adapter-manifest.json
```

## Capture workflow

`opencli metric capture` opens one ephemeral Metric tab, applies the declared
scope, waits for the result page, and checks the page's applied filters. A
missing platform, keyword, period or category mismatch fails closed. A second
search is never attempted by the capture command.

For a form-only verification, pass `--dry-run`:

```text
opencli metric capture \
  --spec /outside/spec.json \
  --dry-run \
  -f json
```

Dry-run opens and closes its own ephemeral tab, applies the same native-click,
trusted-key and checkbox paths as capture, then runs the same pre-submit
read-back gate. It returns one JSON result with `outcome`, `startState`,
`appliedReadBack` and `mismatches`. `startState` records platforms, keywords,
period and category before any change. A successful result is
`DRY_RUN_OK`; failure results use the adapter error code. The dry-run branch
returns before the submit/Search-click function and does not start network
capture or require an output directory.

The live form loop is capped at 25 dry-runs. Record each result outside Git,
including its start state and mismatches. Stop immediately if `whoami` is not
`READY`, or if a captcha, warning or access restriction appears. A dry-run
never spends a lookup.

The command accepts an absolute output directory outside the repository:

```text
opencli metric capture \
  --spec /outside/spec.json \
  --out /outside/metric-captures/run-id \
  --product-cap 200
```

After the successful read-back it collects the combined result view. It never
opens search-history tabs or treats them as platform views; per-platform values
come from the platform split table and the platform icons on product/shop rows.
Product tables are paged until all shown rows are read or 200 rows / 10 page
turns is reached. The archive manifest records the cap, total shown, pages read,
rows read and truncation. The page gate is rerun before each DOM/network read,
after the Revenue/Sold-products toggle is restored to Revenue, and after every
pagination click. A redirect, login/logout screen, captcha or warning stops
capture immediately; the tab is closed and no archive is published.

The archive is written immediately outside Git and contains:

- `raw-responses.json`: response bodies with only URL paths and status; headers,
  cookies, identity fields and token-like values are stripped while business
  fields such as products, shops, brands, revenue, units and prices remain;
- `snapshot.json`: the normalized `automation-metric-web-snapshot-v1` W2–W14
  and W16 groups, with W1 in `scope`; every field has a `response:` or `dom:`
  source pointer;
- `results.html`: sanitized result-region HTML with scripts, inline state, meta
  tags and account/header content removed;
- `platform-*-region-*.png`: one clipped screenshot for every result region in
  the combined result view; the account/header/avatar and overlapping
  sticky/fixed elements are hidden before capture. Unlocatable or unbounded
  regions are skipped with a reason in `manifest.json` (and never fall back to
  a viewport screenshot);
- `manifest.json`: applied scope, view list, W1–W16 source map, pagination and
  exact file digests.

Network JSON already received by the page is the preferred source when the
response body or its request parameters explicitly names a platform. DOM
extraction remains the fallback for the visible platform table and row icons.
An otherwise unlabelled response remains `all`; a visible row without a
platform icon is retained as `unknown`. No history page is opened by the
adapter, and no account, settings or authentication action is performed.

## Safety and failure rules

- Only the tab created by the current command is selected and closed.
- The URL must be HTTPS on `metric.vn` or `www.metric.vn`.
- Login prompts, captcha/human verification, missing application state, missing
  result regions, warnings and failed archive steps stop the command.
- The executor runs only when `TDN_METRIC_OPENCLI_ENABLED=1`, with fixed argv,
  no shell and a manifest hash check.
- Search results are evidence from the page at capture time. Later intake and
  archive work must use the saved files rather than reopening Metric.

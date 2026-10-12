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
`c3d3e05b45d45c1b722c6753b5cb99f7f475ba42555cfe3c1396fed5285ce50f`.

## Capture workflow

`opencli metric capture` opens one ephemeral Metric tab, applies the declared
scope, waits for the result page, and checks the page's applied filters. A
missing platform, keyword, period or category mismatch fails closed. A second
search is never attempted by the capture command.

The command accepts an absolute output directory outside the repository:

```text
opencli metric capture \
  --spec /outside/spec.json \
  --out /outside/metric-captures/run-id \
  --product-cap 200
```

After the successful read-back it collects the combined result view and any
Shopee/TikTok Shop views the page exposes. Product tables are paged until all
shown rows are read or 200 rows per view / 10 page turns is reached. The archive
manifest records the cap, total shown, pages read, rows read and truncation.

The archive is written immediately outside Git and contains:

- `raw-responses.json`: response bodies with only URL paths and status; headers,
  cookies, tokens and credential-shaped fields are stripped;
- `snapshot.json`: the normalized `automation-metric-web-snapshot-v1` W2–W14
  and W16 groups, with W1 in `scope`; every field has a `response:` or `dom:`
  source pointer;
- `results.html`: the saved result-page HTML;
- `region-*.png`: one screenshot for every result region discovered on the page;
- `manifest.json`: applied scope, view list, W1–W16 source map, pagination and
  exact file digests.

Network JSON already received by the page is the preferred source. DOM extraction
is used only when a region has no usable response payload. No history page is
opened by the adapter, and no account, settings or authentication action is
performed.

## Safety and failure rules

- Only the tab created by the current command is selected and closed.
- The URL must be HTTPS on `metric.vn` or `www.metric.vn`.
- Login prompts, captcha/human verification, missing application state, missing
  result regions and failed archive steps stop the command.
- The executor runs only when `TDN_METRIC_OPENCLI_ENABLED=1`, with fixed argv,
  no shell and a manifest hash check.
- Search results are evidence from the page at capture time. Later intake and
  archive work must use the saved files rather than reopening Metric.

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
`914397baac4fdd2beb5a75b0ec78610f3bd1cc5b081f9825aeb3e2cafeb07c46`.

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

The submit control is resolved only inside the search form/container that owns
the keyword input and platform chips. The adapter records its tag, classes,
text and form-relative DOM path, and refuses to click unless exactly one
visible candidate exists. Page-wide text matches are not a submit selector.

After the click, capture records the click time and monotonically ordered
network responses. Before any result read, pagination or toggle, the hard
search-applied gate requires a new `/v2/market/analytics/search-basic/`
response, a platform-id set equal to the requested platforms, and subsequent
`/v2/market/analytics/products/` and `/shops/` responses. Metric platform IDs
are mapped from `/market/search_basic` and the live platform labels; they are
not guessed. A missing response or wrong set returns
`METRIC_SEARCH_NOT_APPLIED` with the observed platform sets and response
orders. Replay applies the same gate using the saved click baseline and
response order.

Each capture read empties the browser's capture buffer. An entry read while
its request is still in flight never receives its status or body afterwards,
so a fast read can lose a result response. After the form is prepared, the
adapter installs an in-page counter of in-flight Metric API requests
(`/market/` and `/v2/market/` XHR and fetch). It observes only and changes
no request or response. Every capture read waits until no tracked request is
in flight and 1 s has passed since the last one settled, up to 20 s. Without
the counter (for example after a reload) the read goes ahead at once. The
search gate and the pagination wait count only completed responses: a parsed
body, with a 2xx status when one is recorded. A drained entry or failed
response is listed in `incompleteResponses`, so a lost response fails as
`METRIC_SEARCH_NOT_APPLIED` and never becomes a thin archive.
`searchGate.networkIdle` records reads, untracked reads, timeouts and the
longest wait.

These waits make a full capture run longer than OpenCLI's default 60 s
command limit. `search` and `capture` therefore declare `--timeout` (default
1500 s). Pass a larger value only when a capture is known to need it.

For a form-only verification, pass `--dry-run`:

```text
opencli metric capture \
  --spec /outside/spec.json \
  --dry-run \
  -f json
```

Dry-run opens and closes its own ephemeral tab, applies the same click,
comma-commit and checkbox paths as capture (native, or the hidden-tab path in
R3), then runs the same pre-submit
read-back gate. It also reports the form-scoped submit descriptor and the
count of visible page-wide `Analytics` elements as ambiguity evidence. It
returns one JSON result with `outcome`, `startState`, `appliedReadBack`,
`submitDescriptor`, `pageWideAnalyticsCount` and `mismatches`.
`startState` records platforms, keywords, period and category before any
change. A successful result is
`DRY_RUN_OK`; failure results use the adapter error code. The dry-run branch
returns before the submit/Search-click function and does not start network
capture or require an output directory.

The r3 live form loop is capped at 8 dry-runs. Record each result outside Git,
including its start state and mismatches. Stop immediately if `whoami` is not
`READY`, or if a captcha, warning or access restriction appears. A dry-run
never spends a lookup.

The r3 restriction diagnostic records a matched phrase, element kind and role
in the gate details, with the phrase limited to 80 characters and identity
values removed. Restriction text is scanned only inside semantic alert,
dialog, live-message, toast or banner roots; those roots still count inside
header/account areas, while non-semantic class-only matches do not. Ordinary
menus, feature copy, footers and tooltips do not trip the gate.

Lookups currently support only the page's default period. Before any form
change, the requested period is compared with the observed start-state period.
A difference returns the typed `METRIC_PERIOD_UNSUPPORTED` result with both
periods in `details`, in both dry-run and capture; the date-picker code remains
in the adapter but is unreachable for non-default periods. Multiple-platform
mode is verified after the re-render with one bounded retry.

Before the first form change, the adapter repairs the Metric tab. OpenCLI's
browser stealth replaces the page's `Function` global after Metric's bundle has
captured the original one as a Vue prop type. Function-typed popup defaults are
then resolved as factories, and no select or date popup opens. The repair puts
the original `Function` back and resets mounted props that were resolved wrongly
and that the page did not supply. Dry-run returns it as `pageRepair`
(`restored`, `repairedProps`, `vue`) and capture records it in the debug
search gate; it is a no-op on a clean page. If the global cannot be restored, the run stops with
`METRIC_UI_CHANGED` before any form action.

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

## Debug and replay

Capture creates a `debug/` directory under the requested output directory before
results validation or extraction. Each snapshot stores the full document
`outerHTML`, sanitized per-region HTML, the sanitized network input and one
masked full-page screenshot when available. Only header/account/avatar/profile
nodes and inline account-identity values are removed from HTML; the app root,
search form and result regions remain. Response bodies for `/users/`,
`/profile/` and `/paid/` are never stored; only their path and the fact that
the body was dropped are retained. Every saved string passes identity/token
redaction. The debug directory is diagnostic evidence only and is never
included in the published archive. If a later gate, selector or archive step
fails, the error includes the debug directory so the page can be investigated
without spending another lookup.

Replay uses the same extraction and archive builder against those saved files;
it does not open a tab or use the network:

```text
opencli metric capture \
  --replay /outside/metric-captures/run-id/debug \
  --spec /outside/spec.json \
  --out /outside/metric-captures/run-id/replay \
  -f json
```

Replay is the required first step for selector fixes. Iterate against the
saved snapshots, then run the smallest synthetic fixture tests; do not repeat
the live lookup merely to diagnose extraction.

## Safety and failure rules

- Only the tab created by the current command is selected and closed.
- The URL must be HTTPS on `metric.vn` or `www.metric.vn`.
- Login prompts, captcha/human verification, missing application state, missing
  result regions, warnings and failed archive steps stop the command.
- The executor runs only when `TDN_METRIC_OPENCLI_ENABLED=1`, with fixed argv,
  no shell and a manifest hash check.
- Search results are evidence from the page at capture time. Later intake and
  archive work must use the saved files rather than reopening Metric.


## R3 — provable native submit and network-first result data

Before Search, the adapter sends Escape, blurs the keyword control, moves the
pointer away from hover state, waits for popup exit animation, checks visible
select/picker/dialog/popover/tooltip roots, verifies the button is enabled and
not loading, scrolls it into view, and records `elementFromPoint` at its centre.
Dry-run reports these preconditions without spending a lookup. The real submit
accepts only `{click_method: "cdp", hit: "target"}` from OpenCLI, or
`{click_method: "dom-background", hit: "target"}` from the hidden-tab path
below, and stores the full click result in `searchGate`. OpenCLI's JS fallback
and any off-target hit are `METRIC_UI_CHANGED` failures. The search-applied
network gate stays authoritative for both paths.

### Hidden adapter tab

The adapter tab opens in OpenCLI's automation window. When the desktop keeps
that window behind other windows, Chrome reports `document.visibilityState` as
`hidden`, and CDP mouse and key input has no effect there. Before every click,
the adapter checks visibility in the page. A visible (or prerendered) document
keeps the native OpenCLI click. A hidden document instead gets an in-page
pointer/mouse sequence at the element centre, with the same `nth` and
ambiguity rules as OpenCLI. That click is reported as `dom-background` with
`hit` taken from `elementFromPoint`. The keyword comma follows the same rule:
CDP key events when visible; when hidden, an in-page keydown, keypress,
beforeinput, comma insertion with an input event on the focused keyword input.
The keyup follows in a separate call after 0.3 s, as a real key release does.
A keyup in the same task lets Metric read the stale `keyword,` text before the
tokenizer re-renders, and Analytics then stays disabled.
`waitForKeywordCommit` must still read the committed chip back.
A hidden document also ignores CDP Escape, so an opened select stays open
there. Each popup close and the submit preflight therefore send an in-page
Escape to every open select input in the search builder, press outside on the
body and blur the focused builder input.
A closed dropdown can stay in its leave transition in a hidden document, with
its options still visible. The platform labels used to map Metric platform
ids are therefore read only from the dropdown the platform input owns (its
`aria-controls` list), never from every visible option on the page.
Dry-run `preflight.documentHidden` records which path ran.

Metric auto-loads a landing report when the page opens. While it loads,
Analytics is disabled and holds an inline loading icon, without the
`ant-btn-loading` class. `waitForMetricSubmitIdle` polls the button once a
second, up to 120 polls while the icon shows. It runs before the form is
edited and again in the submit preflight. A disabled button without the icon
is a form problem, so the wait stops after 5 polls and the preflight fails as
before. Dry-run `preflight.submitIdle` records the polls.

Debug capture is complete on submit failure and gate failure: sanitized full DOM
and a masked screenshot are saved before submit and at 3 s and 15 s after it.
The input log keeps every captured request after submit with path, method,
status, timestamp and sanitized request/response bodies. Identity endpoint bodies
remain dropped.

The archive filters result extraction at the applied-search response baseline,
so stale pre-search widgets cannot supply headline or table values. The
versioned `metric-results-data-v2` manifest field contains per-platform headline,
price-range, province, shop-type, category, previous-period, top-brand and
top-shop series. Platforms are mapped from the live `search_basic` list; values
are never summed. A trend series is retained only when a post-submit source
response offers one; otherwise the manifest records `not offered by the source`.

Adapter manifest SHA-256: `914397baac4fdd2beb5a75b0ec78610f3bd1cc5b081f9825aeb3e2cafeb07c46`.

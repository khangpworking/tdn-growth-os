# Research A46: offline Flint report-chart audit

## Scope

This increment adds a small, offline authoring/audit boundary for the existing
TDN report charts. It consumes the verified A27 `ResearchChartSpec`, its exact
ChartData bytes and the A31/A38 section-readiness/materialization pins. It does
not replace the historical renderer, report bytes, report version, database,
API or UI.

Flint is deliberately injected by the audit script. Production manifests stay
unchanged; the script loads the separately reviewed `flint-chart@0.5.1`
installation and records its package version, package JSON digest and actually
present npm git head in a new receipt. Missing git metadata stays `NOT_PRESENT`
with a null observed git head; the expected upstream commit is not fabricated.
No provider or model call is made.

## Allowed variants

- `M03_SCOPE_TOTALS_REVENUE`: the existing M03 revenue-by-scope horizontal bar
  view (ALL/WIDE/CORE), preserving the existing non-additive overlap meaning.
- `M04_TOP_SHOP_SHARE_ALL`: the existing M04 ALL-scope cumulative Top 1/3/10
  view. It remains separate bars/tracks; Flint is not allowed to introduce
  stack, color aggregation or a time axis.
- `M05_PARTITION_<n>`: conditional only. A descriptive M05 partition must have
  readiness, one unit and one period, at least two exact observed values, and
  every source pointer/category must resolve. The bars are individual source
  observations, never a subtotal or market-demand estimate. The default M05
  table remains the authoritative presentation when these conditions fail.

M10, I11 and I16 remain blocked before compiler invocation when their required
  inputs are absent. Other sections remain cards/tables/text according to their
  method contracts. Flint compilation success is not business-method
  correctness.

## Receipt and fail-closed rules

The receipt pins normalized input, source package, metric result, catalog,
packet, ChartData, ChartSpec, assembly/readiness and optional M05 method-output
identities. Compiler outputs and warning summaries are stored under a separate
audit path.

The normalized input must match the metric result, and both packet and ChartData
must replay from the exact metric-result/catalog bytes. Supplied assembly source
and catalog pins must match the retained bundle. Optional M05 method output must
bind the same source package. These checks reject unrelated but individually
hash-valid files before compilation.

The snapshot's ordinary partial-materialization blockers remain disclosed but
do not suppress an already materialized deterministic M03/M04 view. Only a
readiness blocker or an actually `BLOCKED` delivery state gates Flint.

The audit rejects a backend result when Flint warns about overflow/omitted
categories, categories disappear or duplicate, emitted values do not match the
exact authored values, or a truthy `aggregate`/`stack` operation appears. TDN
decimal text must round-trip through a safe JavaScript number; otherwise that
variant is blocked instead of losing precision. Missing/blocked section inputs
never become an empty or zero chart.

Run the offline command with an explicit output path:

```text
tsx scripts/audit-report-flint.ts <report-dir> <isolated-flint-package-dir> <receipt-path> [assembly-snapshot.json] [descriptive-market-methods.json]
```

The output is additive. It must not overwrite `report.html`, `report.md` or
any historical report artifact.

## Focused test authoring gate

The focused unit test owns the independent boundary that is not covered by the
existing ChartSpec suite: adapting two existing chart views plus the
conditional M05 partition into Flint inputs, then rejecting compiler-side
category loss/aggregation and preserving exact source pins. A credible
regression is a package upgrade or adapter change that silently truncates 101
categories, adds a stack/aggregate transform, compiles a blocked section, or
rounds a large decimal. Existing tests verify ChartData/ChartSpec semantics but
do not inspect an injected compiler's output or receipt.

The test uses a small injected compiler double at the module boundary; it does
not export a production seam used only by tests, call Flint, invoke a provider,
or mutate report data. It covers observable receipt and rejection behavior, not
private helper call shapes or package internals.

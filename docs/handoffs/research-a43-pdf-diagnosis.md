# Research A43 PDF diagnosis

Date: 2026-10-01 (Asia/Bangkok). Scope: Linux preview helper only; no Windows
execution, browser run, test run, build, typecheck, commit, or push was made.

## Finding

The failure is isolated to the located report's `Page.printToPDF` boundary,
after desktop/mobile screenshots and interactions have completed. The latest
Linux preview run is CI run `36803283154` for head
`f0f7243798e33d73ac10b878b0e22106e5bea098` (the companion check run
`36803283100` passed). Its uploaded artifact is
`C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/ci36803283154-diagnosis/artifact/research-report-synthetic-preview/located/report.html`.
Its pre-print diagnostic reports 153 `details`/`summary` pairs (33 nested),
all 153 open, 70,032 CSS px of expanded print layout, and 110,375 characters
of body text before the 60-second call. The call failed with
`Error: CDP timeout: Page.printToPDF`; no located PDF was written. Desktop and
mobile screenshots plus interaction evidence were already present in that
same artifact.

The size comparison is useful but not a proven browser limit: source-backed,
assembly, and kit reports in the same job completed at 30,065, 45,544, and
53,875 CSS px respectively. Located adds 37,910 HTML characters, 31 details,
23 table rows, and 10 tables across I01, I02, I04-I10, and I13; the shared I17
appendix is identical to kit at 102,634 HTML characters, 99 details, 86 rows,
and 7 tables. Earlier 433bacd/9501143 artifacts show the same 153 disclosures
and also timed out, but predate the print-rule change below.

The print path opens every disclosure, enables print media, and expands
`details>*` to block layout. This is a materially larger tree than the
collapsed state used by screenshots. The located renderer adds nested
evidence disclosures inside table cells and source-context blocks. This makes
the native expanded disclosure tree and table fragmentation credible
contributors, but the artifacts do not prove either is the sole root cause.
Most importantly, the failed CI artifact at `f0f7243` already contains the
rules (`.ip-grid{display:block}`, `.ip` and `.ip tr` `break-inside:auto`,
`details{display:contents}`, `details::details-content{display:contents;
content-visibility:visible}`, and `details>summary{display:block}`). Those
rules are therefore not sufficient as a repair. Raising the 60-second CDP
bound or omitting evidence would conceal this failure, not repair it.

## Bounded helper repair

`tests/helpers/capture-research-preview.mjs` now records interaction evidence
before print and emits a small `pdf-diagnostic.json` with the report path,
print viewport/media, open/nested disclosure counts, expanded native print
layout size, text length, timeout, and final PDF status. It passes the actual
saved HTML DOM unchanged to the single bounded `Page.printToPDF` call. A
timeout now leaves the interaction evidence and diagnostic artifact available
for CI review, then still fails the job.

The helper also has an explicit Linux-only
`TDN_RESEARCH_PRINT_DIAGNOSTIC=table-flow` mode for a failure-only workflow
step. It reuses the existing Chrome/CDP harness, skips screenshots and
interaction work, opens the native disclosures, injects only the transient
table-flow rule, and writes `diagnostic-table-flow.json` plus
`diagnostic-table-flow.pdf`. It never writes or replaces the normal synthetic
PDF, visual evidence, or interaction evidence files; the 20-second diagnostic
print remains failure-propagating.

## Coordinator proposal

The earlier `details`/`details::details-content` flattening proposal and the
broader `.sheet,.ip,.card,.fig,tr{break-inside:auto}` proposal have both now
been exercised by Linux CI and were insufficient. Do not apply another
unbounded production CSS tweak before the bounded table-flow experiment below.

The helper also captures the methods preview's approved section targets:
`M01`, `M10`, `M11`, `M12`, `I11`, `I12`, `I14`, `I15`, and `I16`.

## Follow-up CI evidence

PR 102 head `6583b6dd1fbed70bc5d41d1fb81dc287ba62a4e2` changed the optional
print rule to `break-inside:auto` for `.sheet`, `.ip`, `.card`, `.fig`, and
`tr`. Preview run `36804289859` still failed only in the located capture;
root, assembly, kit, and evidence-retention steps passed. Its located artifact
contains that `tr` override, yet the native print diagnostic is unchanged:
153 open details, 33 nested, 70,032 CSS px, 110,375 body-text characters, and
the same 60-second `Page.printToPDF` timeout. This rules out the global row
break constraint as a sufficient repair; do not make a third production CSS
guess from this evidence.

## Next bounded diagnostic

Keep the acceptance helper and its original native HTML print attempt
unchanged. In a failed-preview-only diagnostic, launch a fresh Chrome against
the saved `located/report.html`, open the same 153 disclosures, enable print
media, await fonts, and record `Page.getLayoutMetrics()` plus
`document.fonts.status`. Then run one bounded (20-second) table-flow probe
with only this transient print rule injected into that fresh page:

```css
@media print {
  .ip table, .ip tbody, .ip tr, .ip th, .ip td { display: block !important; }
}
```

The probe must retain the original DOM, all text, links, IDs, and evidence;
write a separate `pdf-diagnostic-table-flow.json` with the rule, counts,
metrics, CDP status/error, and PDF byte count; and never replace or count as
the acceptance PDF. A successful probe isolates table fragmentation as the
blocking path. If it also times out, repeat only in a fresh page with the
same native HTML and a stream-mode `Page.printToPDF` response to distinguish
renderer/layout work from base64 transfer; a print-call timeout still points
to rendering rather than transport. This gives a bounded decision tree before
any further production change.

## Validation boundary

Static review only. Linux CI must establish whether the unchanged HTML plus a
renderer-owned print rule allows the full located and methods reports to
produce valid PDFs while retaining complete text/evidence. No local Windows
test, typecheck, build, or browser execution is evidence for this diagnosis.

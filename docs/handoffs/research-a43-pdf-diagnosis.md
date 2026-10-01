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

## Coordinator proposal

Do not re-apply the `details`/`details::details-content` flattening proposal:
it was present in the failed Linux artifact and did not prevent the timeout.
The next smallest production experiment should target print fragmentation
without changing the delivered DOM: remove the global `tr{break-inside:avoid}`
constraint from the print rule (or scope `tr{break-inside:auto}` to every
print table, including the appendix), while retaining all rows and evidence.
The located insight rows already have a narrower override, but the global
constraint still applies to appendix and other non-`.ip` tables. This is a
bounded hypothesis to verify in Linux CI, not a claim that the 70,032px size
is a hard Chromium ceiling. Keep the 60-second timeout and require the full
located PDF plus the existing screenshot/interaction evidence.

The coordinator's next native print change broadens `break-inside:auto` to
`.sheet,.ip,.card,.fig,tr` on the optional located/method surface. This removes
the remaining whole-card and row avoidance constraints without dropping nodes,
source text or table semantics. Its effectiveness remains pending Linux CI.

The helper also captures the methods preview's approved section targets:
`M01`, `M10`, `M11`, `M12`, `I11`, `I12`, `I14`, `I15`, and `I16`.

## Validation boundary

Static review only. Linux CI must establish whether the unchanged HTML plus a
renderer-owned print rule allows the full located and methods reports to
produce valid PDFs while retaining complete text/evidence. No local Windows
test, typecheck, build, or browser execution is evidence for this diagnosis.

## Native stream follow-up, 2026-10-01

A44's failure-only native-stream probe on run 36806030239 printed the exact
located HTML with no CSS injection or DOM removal: 153 open disclosures,
33 nested, 70,032 CSS px and 110,375 body-text characters. Print took 2,271 ms;
50 bounded chunks yielded 3,246,674 bytes in 138 ms with `%PDF-1.4` header.
This supports a transport-path repair, not a proven Chrome or Node root cause.

The normal acceptance helper now uses `ReturnAsStream`, retaining the original
60-second print-call bound. It bounds individual and aggregate stream reads,
closes the stream in `finally`, validates the concatenated PDF header and writes
the same normal outputs. It does not replace HTML, discard evidence, change
renderer CSS or retry a failed print. A43's own Linux acceptance remains pending;
the successful A44 diagnostic is not substituted for that gate.

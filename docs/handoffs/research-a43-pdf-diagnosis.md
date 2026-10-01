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

It also supports `TDN_RESEARCH_PRINT_DIAGNOSTIC=native-stream` for the next
bounded probe. That mode injects no CSS and removes no DOM nodes, uses
`Page.printToPDF` with `transferMode: ReturnAsStream`, bounds each `IO.read`
chunk and the stream read, closes the returned stream, and writes only
`diagnostic-native-stream.json` plus `diagnostic-native-stream.pdf` on success.
The diagnostic records pre-print metrics, print-call versus stream-read
timings, streamed bytes/chunks, and the PDF header; a print-call timeout is
recorded and propagated without retry.

The located native-stream probe then completed on the unchanged HTML with
153 open disclosures, 33 nested, 70,032 CSS px, and loaded fonts: the print
call took 2,271 ms, stream reading 138 ms, 50 chunks yielded 3,246,674 bytes,
and the concatenated header was `%PDF-1.4`. The normal base64 return path had
timed out on the same print state. Normal acceptance therefore now uses
`ReturnAsStream` with the original 60-second `Page.printToPDF` bound, bounded
chunk reads, final `IO.close`, and `%PDF-` validation while retaining the
existing PDF/evidence outputs. This is a bounded transport-path repair; it
does not prove whether the old timeout was in Chrome rendering, CDP return
serialization, or Node-side base64 handling.

## Coordinator proposal

The earlier `details`/`details::details-content` flattening proposal and the
broader `.sheet,.ip,.card,.fig,tr{break-inside:auto}` proposal have both now
been exercised by Linux CI and were insufficient. The bounded table-flow
experiment also timed out, while native stream transport succeeded; no
production CSS/content change is warranted by these results.

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

## Completed bounded diagnostics

The failed-preview-only table-flow probe launched fresh Chrome against the
saved `located/report.html`, opened all 153 disclosures, enabled print media,
awaited fonts, and injected only this transient rule:

```css
@media print {
  .ip table, .ip tbody, .ip tr, .ip th, .ip td { display: block !important; }
}
```

It retained the original DOM, text, links, IDs, and evidence, but timed out
at 20 seconds after layout expanded to 73,187 CSS px. The subsequent native
stream probe succeeded on the unmodified print DOM, so no further CSS/content
experiment is justified by this evidence.

## Validation boundary

Static review only. Linux CI must establish whether the transport-path repair
allows the normal located and methods previews to produce valid PDFs while
retaining complete text/evidence and all existing screen controls. No local
Windows test, typecheck, build, or browser execution is evidence for this
diagnosis; no renderer-owned print CSS change is part of this repair.

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

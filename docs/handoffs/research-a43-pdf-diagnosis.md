# Research A43 PDF diagnosis

Date: 2026-10-01 (Asia/Bangkok). Scope: Linux preview helper only; no Windows
execution, browser run, test run, build, typecheck, commit, or push was made.

## Finding

The failure is isolated to the located report's `Page.printToPDF` boundary,
after desktop/mobile screenshots and interactions have completed. The exact
artifact report is
`C:/Users/Admin/Documents/Codex/2026-08-27/cou/artifacts/research-a43-preview-433bacd/located/report.html`.
It is 394,830 bytes, contains 153 `details`/`summary` pairs (33 are nested),
and its successful screen capture measured 38,860 CSS px on desktop. The later
`research-a43-preview-9501143/located/report.html` is 393,599 bytes, has the
same 153 disclosure pairs, and measured 38,711 CSS px. Neither located folder
has a `synthetic-report.pdf`; the smaller root, assembly, and kit reports do
have PDFs in the same artifact runs.

The print path opens every disclosure, enables print media, and expands
`details>*` to block layout. This is a materially larger tree than the
collapsed state used by screenshots. The located renderer adds nested
evidence disclosures inside table cells and source-context blocks. This makes
the native expanded disclosure tree a credible print-fragmentation hypothesis,
but the artifacts do not prove it is the sole root cause. The `de9293c`
renderer CSS change (`.ip-grid{display:block}`, `.ip` and `.ip tr`
`break-inside:auto`) changes card fragmentation but does not test a
renderer-owned change to native disclosure layout. Raising the 60-second CDP
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

If CI confirms the disclosure hypothesis, apply the smallest optional
renderer-owned print rule in `src/modules/analysis/report-kit-html.ts`, scoped
to the print surface rather than mutating the helper DOM:

```css
@media print {
  details { display: contents; }
  details::details-content { display: contents; content-visibility: visible; }
  details > summary { display: block; }
}
```

This keeps the native `details`/`summary` markup, IDs, links, and evidence
nodes in the delivered HTML while asking Chromium to avoid the disclosure
content fragmentation boundary during print. The coordinator should verify
the exact selector behavior on Linux CI and retain the 60-second timeout.

The helper also captures the methods preview's approved section targets:
`M01`, `M10`, `M11`, `M12`, `I11`, `I12`, `I14`, `I15`, and `I16`.

## Validation boundary

Static review only. Linux CI must establish whether the unchanged HTML plus a
renderer-owned print rule allows the full located and methods reports to
produce valid PDFs while retaining complete text/evidence. No local Windows
test, typecheck, build, or browser execution is evidence for this diagnosis.

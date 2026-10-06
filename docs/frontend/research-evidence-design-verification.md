# Research evidence report — design verification

## Review boundary

This is an ordinary `Read`-mode extension of the approved TDN overview → detail visual language, not a redesign. The inspected implementation is [research-report-html.ts](../../src/modules/analysis/research-report-html.ts), with the generated Linux preview package in `<private path, withheld>`. The preview is a static, source-backed synthetic report: it is unreviewed, carries no AI interpretation or human decision, and is not an approved report or deployed route.

Review disposition: **ship after the bounded corrections represented by the inspected artifact**. The finish criteria are evidence disclosure, mobile first-viewport usability, teal focus treatment, and 44px numeric-link targets. No Windows build, test, typecheck, app run, or code change was performed for this verification.

## Incumbent tokens compared

The extension was compared against the existing [DESIGN.md](../../DESIGN.md), [PRODUCT.md](../../PRODUCT.md), and the report surface brief. No new visual tokens are introduced.

| Incumbent token / rule | Extension usage observed in source | Preservation result |
| --- | --- | --- |
| `ink` `#172e43` | Body, headings, table text, and the report footer. | Preserved. |
| `muted` `#536a7c` | Metadata, captions, small source locators, and section state labels. | Preserved. |
| `line` `#dfe7ed` | Header/figure/detail separators and table row rules. | Preserved. |
| `canvas` `#dfe8ed` + white surface | Page surround and the white `main` reading surface. | Preserved; the report surface uses the existing light TDN material. |
| `blue` `#2457c5` | Navigation links, numeric evidence links, and opened-state text. | Preserved as evidence navigation. |
| `teal` `#087e8b` | Comparable-data bars and `:focus-visible` outline after the bounded focus correction. | Preserved as the active evidence mark/focus accent. |
| Hold/unknown neutrals (`#fff4d5`, `#79520e`, `#edf2f5`) | Missing/blocked callouts, draft status, track backgrounds, table headers, and member links. | Preserved; missing is not represented as zero. |
| Inter → system fallback, 15px body / 32px headline | Body stack is `Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`; headline is 32px desktop and 26px mobile. | Preserved; no network font or display face added. |
| Existing restrained radius/spacing language | 14px surface radius desktop, 32px desktop surface padding, 20px mobile padding, thin rules, grouped 20–36px section rhythm. | Preserved as extension-level composition; no new brand geometry. |

Inline `#e1ebff` target highlighting and `#edf2f5` track/table/member surfaces correspond to existing `nav-active-bg` and `none-bg` roles. The source does not promote one-off report colors into the global system.

## Extension-specific layout, copy, and evidence patterns

The report keeps the incumbent reading surface but specializes its information architecture for inspection:

- The first viewport leads with the report title, explicit `Bản nháp nội bộ · Chưa duyệt` status, period/filter/acquisition metadata, a four-layer evidence legend, then paired revenue and unit charts. It intentionally has no giant KPI hero.
- Desktop charts use a two-column grid (`repeat(2, minmax(0, 1fr))`) inside an 1180px white surface; the mobile media rule at 700px stacks charts, removes the desktop outer margin/radius, and keeps the title, metadata, legend, and first value visible within the 390×844 capture.
- The report uses native `details`/`summary` disclosure for time checks, section readiness, claim calculations, memberships, and exact packet identity. Anchor navigation connects chart → claim → member indices → normalized source row, and download links expose retained bytes.
- Numeric observations remain links, use tabular numerals, and have `min-width: 44px` and `min-height: 44px`. Summaries, navigation links, downloads, and member-index links also meet the 44px interaction floor.
- Teal fills the 12px comparison tracks; blue remains the evidence-link/navigation color. Focus is a 3px, 4px-offset teal outline. There is no animation or JavaScript dependency.
- Copy states the limits beside the number: ALL/WIDE/CORE overlap, top 1/3/10 shares are cumulative, and blocked sections expose their prerequisites. Missing values use an amber callout while an observed zero remains a numeric zero in the source table.
- The renderer keeps values as strings, escapes source strings, and emits a restrictive `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'` policy. Print rules hide decorative navigation, preserve charts/limits/tables/details, and remove the canvas surround for paper review.

These are surface patterns, not additions to the global TDN design system.

## Observed evidence

Exact evidence reviewed:

1. Source: `src/modules/analysis/research-report-html.ts` (the renderer and its inline stylesheet, including the final bounded corrections).
2. Artifact directory: `artifacts/research-a4-preview-edf5bff/desktop-first.png`, `desktop.png`, `mobile-first.png`, `mobile.png`, `synthetic-report.pdf`, `interaction-evidence.json`, `visual-evidence.json`, and the `source-backed-report-fixture/` bundle (`report.html`, `report.md`, `charts.json`, `metric-result.json`, `packet.json`, `section-catalog.json`, `normalized-input.json`, `receipt.json`, `evidence-envelope.json`, `export-manifest.json`, `raw-manifest.json`, `raw-workbook.xlsx`, `source-package-manifest.json`, and `workspace.json`).
3. Visual evidence reports desktop 1440px wide, 7,191px tall, with a 1,425px document scroll width; mobile is 390px wide, 10,245px tall, with a 375px document scroll width. Neither document exceeds its viewport width. Both identify the same escaped synthetic title and seven numeric evidence links. The desktop and mobile first-viewport rasters show the evidence legend and chart entry point before the long readiness/claims/source sections.
4. `interaction-evidence.json` records 120 actions per viewport: 29 anchor navigations, 72 disclosure opens, 17 exact-file opens, and two exact-byte downloads. Both viewports report zero page errors and the same keyboard statement: `Enter opens; Tab advances with visible outline`.
5. Recorded contrast checks are identical on desktop and mobile: blue on white 6.47:1; ink on white 13.92:1; hold text on hold background 6.33:1; muted on white 5.64:1; ink on neutral surface 12.35:1.
6. The shipped fixture HTML has 72 `details`/`summary` pairs, seven `.value` numeric evidence links, 29 hash-anchor links, and 22 download affordances. It contains no external URL, script, image, iframe, or event-handler marker; the restrictive CSP is inline in the document.
7. `synthetic-report.pdf` was checked as a 19-page A4 preview (595.92×841.92pt), titled `Synthetic <Report> & "Evidence" · Báo cáo bằng chứng`, 336,176 bytes. It is browser capture evidence, not a manifest-bound production PDF export. `export-manifest.json` marks the underlying HTML/data bundle `UNREVIEWED`; `evidence-envelope.json` names the source package synthetic and explicitly retains `OWNER_REVIEW_REQUIRED; NO_AI_INTERPRETATION_OR_HUMAN_DECISION_IS_CREATED`.

## Pre-existing drift and preservation conclusion

The existing [DESIGN.md](../../DESIGN.md) describes the approved prototype world and explicitly says it is not yet frontend production. The existing `.impeccable/design.json` is dated `2026-09-11` and documents the overview/detail primitives, not this later report extension's chart, disclosure, or source-table patterns. That sidecar/document freshness gap is pre-existing drift; it was not repaired or canonized here. The report's `max-width: 1180px` and `@media (max-width: 700px)` are surface-specific composition choices from the report brief, not a replacement for the incumbent global layout guidance.

Only this verification document is written. `DESIGN.md`, `PRODUCT.md`, `.impeccable/design.json`, and `src/modules/analysis/research-report-html.ts` are preserved byte-for-byte; no tests/build/typecheck, application run, approval, publication, or commit was performed.

## Five-line system summary

- Palette: navy ink, blue evidence links, teal comparison/focus, white reading surface, and amber/neutral limit states.
- Type ramp: Inter/system fallback, 15px body with 32px desktop / 26px mobile headline and tabular numeric values.
- Layout: 1180px desktop reading surface, paired charts, 700px mobile stack, and print-safe single-column flow.
- Named rules: evidence is inspectable; missing is not zero; source scope and draft status stay adjacent to the number.
- Drift not canonized: the stale overview-focused Impeccable sidecar and prototype-era DESIGN wording remain pre-existing and untouched.

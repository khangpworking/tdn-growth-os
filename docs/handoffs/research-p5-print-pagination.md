# P5: research report print pagination

Date: 2026-10-03. Worktree: `fix/research-real-world-audit`, baseline
`0116091`. This is an uncommitted print-only CSS slice in the existing dirty
tree. Claude did not render, test, typecheck or build anything on Windows or
Linux. Root owns Linux rendering and verification, so there is no visual PASS
claim here.

## Baseline evidence

The input is the synthetic J-MARKET report: Linux HTML from
`p5-report-preview/`, and the PDF and pdftotext output from
`output/pdf/p5-synthetic/`. The production `createChromiumPdfRenderer`
(headless Chrome via CDP) prints it to **132 A4 pages**.

| Pages | Content |
| --- | --- |
| 1 | Cover, ending with the "Nội dung" heading (pdftotext bbox y=362pt) |
| 2 | The 13 TOC links only, at a 31.5pt (42 CSS px) pitch |
| 3 | The headline warning only |
| 4 | The M01 header and table caption only |
| 5–82 | M01: 26 records, 3 pages each (for example 48/47/10 text lines) |
| 83–132 | M02 1, M03 4, M04 1, M05 17, M06 5, M07 10, M08 2, M09–M12 1 each, M13 6 |

The A4 page box with `margin:14mm` is about 688 × 1017 CSS px.

## Exact causes

1. **Cover split over two pages.**
   - Media queries without a media type also apply in print. The 688px print
     width therefore matches the kit's `@media(max-width:900px)`
     (`report-kit-theme.ts`), and the cover stacks into one column.
   - The TOC links keep their screen touch-target spacing on paper:
     `.toc a{min-height:32px}` and `.toc{gap:10px}`.
   - The stacked cover is about 1028px, more than the 1017px page. Chrome moved
     the whole list to page 2.
   - `.cover{min-height:240mm}` (907px) is not the cause, because the content
     is already taller than that.
2. **Lone warning page.**
   - The kit's print `.cover{break-after:page}` starts the warning
     `#sections>.warning` on a new page.
   - Then `.sheet{break-before:page}` in `reports.ts`, which applies to all
     media, forces M01 onto the next page.
3. **78 pages for 26 M01 records.**
   - `.evidence-table` is a fixed-layout table with 4 equal columns of about
     165px each.
   - `pdf.ts` opens every `<details>` before printing, as intended. The fourth
     cell therefore holds the full provenance:
     - the attribution and statement;
     - the 4-row metadata list (path, locators, method pointer, 64-character
       sha256);
     - 15 limitation codes of up to 65 characters.
   - `overflow-wrap:anywhere` splits each code into narrow fragments, so each
     row is about 2.2 pages tall.
   - `tr{break-inside:avoid}` (in both the kit and `reports.ts` print rules)
     cannot keep such a row on one page, but it still starts every row on a new
     page. That gives 3 pages per row and leaves page 4 with only the header and
     caption.
   - The vertical record reflow already exists for mobile, but it is
     `@media screen and (max-width:600px)`, so print received the desktop
     table.

## Changes

These are print-only CSS changes. Markup, copy, escaping, anchors, data,
calculations, admission, screen CSS and mobile CSS are unchanged. `pdf.ts` is
not touched.

### `synthesis-evidence-report.ts`

A new `@media print` block in `SYNTHESIS_EVIDENCE_CSS`:

- **Records instead of a table.** Each evidence row prints as a full-width
  record:
  - The three short cells stay side by side, each with its existing visible
    label (as on mobile). Each short cell is `break-inside:avoid`.
  - The provenance cell takes the full width below them.
  - The column header stays in the accessibility tree but is visually hidden,
    the same technique as mobile.
- **Breaks inside records.** Records may break between their parts
  (`break-inside:auto`) and no longer jump to a fresh page. Individual
  limitation items, metadata rows and the quoted statement still avoid
  splitting.
- **Keeping parts together.**
  - The caption is kept with the first record.
  - The provenance is asked to stay with its record's short cells
    (`break-before:avoid`).
  - Each disclosure summary is kept with its content.
- **Spacing.**
  - The metadata list returns to the report's own two-column `dl` at full width
    (`180px | 1fr`).
  - The screen-only touch-target summary height is removed.
  - Vertical spacing within a record is tightened, while records stay separated
    by padding and a rule.
- **Nothing hidden.** Every limitation code, locator, hash, quote and summary
  still prints. `overflow-wrap:anywhere` is kept as an overflow guard; it no
  longer fires on these lengths at full width.

### `reports.ts`

Additions to the existing inline `@media print` block:

- `.toc{gap:4px}.toc a{min-height:0}` compacts the TOC on paper. The cover is
  about 830px for MARKET (13 entries), which the existing 240mm minimum raises
  to 907px. INSIGHT (17 entries) is about 940px. Both fit on one page.
- `#sections>.warning+.sheet{break-before:auto}` puts M01 directly after the
  headline warning. The warning and the M01 start then share page 2. All other
  sections keep `break-before:page`.
- `.sh-head{break-after:avoid}` stops a section header from being stranded.

The same evidence table and `sourceDetails` are used by the I14 unassigned-claims
table in INSIGHT, so that table gets the same print records.

### Renderer version

`rendererVersion` stays `automation-report-kit-v9`, the value the uncommitted P5
diff already set (HEAD was v7). This follows the P1 precedent: the coordinator
resolves the new-writer renderer identity before release.

- The semantic content is unchanged.
- The HTML and PDF bytes differ, and are identified by `htmlSha` and `pdfSha`.
- Stored reports are served from stored bytes. No automation replay re-renders
  or byte-compares them.

Root may bump it to v10 if any v9 output was retained outside scratch.

## Root Linux verification, 03/10/2026

The production renderer has now exported all six synthetic files after this
change. This is print verification, not acceptance of real market conclusions.

| Case | MARKET pages | INSIGHT pages |
| --- | --- | --- |
| J | 78 (baseline 132) | 28 |
| T | 79 | 28 |
| F | 78 | 28 |

- The source-to-preview integration fixture passed 4/4. Typecheck passed;
  report/Metric/native/exact-review focused tests passed 53, with one optional
  Chromium unit test skipped. The six actual production exports above ran
  separately, so the skip is not presented as PDF proof.
- Each MARKET PDF retains all 26 evidence quotations and all 26 source-digest
  occurrences checked from its HTML. Each INSIGHT PDF retains its one expanded
  quote and digest. No replacement glyph was found in extracted Vietnamese text.
- `pdffonts` reports embedded Unicode Montserrat and Noto Sans Mono.
- Root inspected J MARKET cover, pages 2 and 3, and F INSIGHT cover. Both covers
  fit their full TOC on one page. The warning and M01 start share page 2; source
  metadata occupies the full record width, with intact hashes and readable
  limitation codes. No clipped content was seen in these inspected pages.
- Evidence is outside Git under
  `artifacts/research-execution-20261003/p5-report-preview/` in the coordinator
  workspace: `print-evidence.json`, PNGs and extracted text. Linux PDFs remain
  in the isolated scratch `output/pdf/p5-synthetic/`, not the live operator.

This closes the diagnosed narrow pagination defects, not P6.4/P6.5 as a whole.
M01 still presents a long inventory rather than a useful summary, and repeated
technical provenance belongs in the trace appendix. The next M01 slice must
address this under P6.4 without deleting evidence. Full report-design judge
and OWNER acceptance remain open. No deployment or real provider call occurred.

## Expected result (estimate, not measured)

| Part | Expected pages |
| --- | --- |
| Cover and full TOC | Page 1 |
| Warning and the start of M01 | Page 2 |
| M01 | About 19–21 pages (about 750px per record) |
| Rest of the report | Unchanged |
| J-MARKET total | About 70–75 pages |

## Remaining risks

- **Short sections on their own pages.** Every section still starts on a new
  page. Short or blocked sections take a mostly empty page: M02, M04 and
  M09–M12 in MARKET, and the blocked I-sections in INSIGHT.
  - This is the approved section rhythm, so it is unchanged.
  - If root wants it compacted, markup should state it, for example a
    state class on short sections whose `break-before` becomes `auto` in print.
    CSS cannot select the state text.
- **Content volume.** This now drives the page count.
  - Each M01 record repeats about 15 shared limitation codes. M05 (17 pages)
    repeats the scope text in the non-owned descriptive renderer.
  - Reducing that repetition is a product and evidence-presentation decision,
    not pagination. It was not done.
- **Chrome fragmentation.** The records rely on flex fragmentation in
  Chromium LayoutNG. If `break-before:avoid` is not honoured between flex lines,
  a record's short cells can end one page while its provenance starts the next.
  The labels keep that readable.
- **Cover headroom.** INSIGHT's cover has about 80px to spare. Long future
  section titles that wrap could push the TOC over again.
- **Tagged PDF.** Like the mobile reflow, the print reflow changes the display
  of table elements. Chrome may expose rows as groups rather than table cells.
- **Paper wording.** The summary text "Xem nguồn và giới hạn" still prints as
  the provenance label. Its wording was not changed.
- **Stacked cover.** It has no diagonal shapes on paper. This is the existing
  ≤900px responsive layout, which was already used in print before this slice.

## Root verification (Linux)

1. **Re-render.** Use the production renderer for J/F/T MARKET and INSIGHT
   (synthetic). Record each page count against the 132-page J-MARKET baseline.
2. **Cover and warning.**
   - Page 1 has the complete cover and all TOC entries, including INSIGHT's 17.
   - Page 2 starts with the warning and continues into M01, with no near-empty
     page.
3. **M01 records.**
   - The short cells are side by side, with their labels.
   - The provenance is full width, and limitation codes are on whole lines with
     no letter fragments.
   - The metadata is in two columns, and the sha256 is complete.
   - No record starts with an orphaned summary at a page bottom.
4. **Evidence parity.** Compare the pdftotext output before and after:
   - the same set of limitation codes, locators, hashes and quotes;
   - 26 records;
   - all `claim-*` anchors still present in the HTML.
5. **Screen unchanged.** Desktop and mobile screenshots of the HTML report are
   unchanged.
6. **Tests and typecheck.**
   - `npm run typecheck`.
   - The research automation report suites:
     - `tests/integration/research-automation-api.test.ts`;
     - `-metric-report`;
     - `-native-reviews`;
     - `-exact-reviews`;
     - `-metric-methods`.

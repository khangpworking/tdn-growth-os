# Original Metric page PDF in Market MCP

Owner decision, 2026-10-27: retain a screenshot PDF of the original Metric results page in private R2, alongside its PNG and section images. Subsequent number explanations use the archived evidence, without a new provider capture. This PDF is separate from the generated Market Reader PDF; source logos stay in source evidence, and account controls are masked.

## Implementation

With `TDN_METRIC_EVIDENCE_ENABLED=1`, each successful UI window capture reads the visible page in overlapping viewport screenshots. The overlap removes repeated top bars while preserving sticky table columns. It restores scroll position and account visibility afterwards. A stitched PNG supports the existing section crops; a lossless image-only A4 PDF is created from the same captured pixels, without another browser/provider/model call. Capture bounds, stalled scrolling and layout/viewport changes produce explicit evidence failure codes. Native bridge full-page stitching is no longer used.

The window evidence manifest adds optional `sourcePdf` metadata (`source-page.pdf`, SHA-256, size, page count, `kind=screenshot-pdf`) and `captureTechnique=scroll-screenshots`. Local retention checks the PDF digest before any upload. The existing private R2 package includes `source-page.pdf` with `application/pdf`. `explain_number` returns `urls.sourcePdf` with the existing 24-hour expiry and PDF metadata. When a section crop is unavailable, an archived whole-page PDF can still be returned with the partial-evidence code. Template numbers do not gain source links.

Calendar selection now clicks the actual picker inputs and visible navigation controls through the browser click bridge. A disabled requested date stops with CAPTURE_PERIOD_NOT_SELECTABLE and the calendar’s last enabled date, rather than cycling through months. Capture never changes frozen dates. New production autoruns first resolve availability as described below. The existing full applied-state and response-scope checks remain authoritative before publication.

## Compatibility and limits

Old image-only evidence manifests remain valid. Stored report HTML, traces, generated PDFs and builder versions are unchanged. Flag-off runs do not create evidence packages. Request-only fallback still reports NO_IMAGES and never invents a PDF of unseen results. There is no historical backfill or provider call during an MCP lookup.

The PDF preserves displayed page content. It does not expand internal table scrolling, pagination, collapsed regions or offscreen horizontal columns; section evidence must not be described as the entire underlying dataset. A live canary for the exact keyword/date windows and real R2 retrieval is a deployment acceptance check, separate from local synthetic upload/lookup validation.

## Verification

Focused capture/report/retention tests cover lower-page pixels, readable PDF output, stalled scrolling, PDF hash rejection, legacy manifests, exact date inputs, R2 PDF content type/presigned links and provider-free generated reports. Market MCP offline tests cover lossless forwarding through authenticated GET only. Live diagnostic artifacts remain outside Git.

## Source date synchronization (owner decision, 2026-10-27)

New production autoruns inspect the end-date calendar in their own tab before freezing the run or issuing an Analytics search. They use the latest enabled date at or before the requested end and yesterday in Vietnam; no fixed availability lag is assumed. The requested duration and explicit preset window lengths are preserved by shifting all dates together. For a latest enabled date of 20 October 2026, the standard windows are 21 September–20 October (30 days) and 21 October 2025–20 October 2026 (365 days).

The run receipt, subsequent MCP preset confirmation, capture spec, report and evidence use the effective dates. The start artifact retains the original request and the versioned alignment policy. Exact retries reuse the frozen scope without probing again. Historical starts, stored reports, replay-only runs and autorun-disabled paths retain their prior behavior. A failed or ambiguous calendar probe creates no run and submits no Analytics search. Browser work runs outside the database mutation mutex and shares the capture lock; the preflight has a 90-second total budget, including lock wait. The MCP start request allows 120 seconds for this preflight.

Verification includes synthetic dynamic cutoff changes, historical requested caps, crossing a wholly disabled month, no date selection/search during discovery, frozen run/preset/capture dates, exact retries, restart reads and rejection before any run when availability fails. A calendar-only live check on 27 October returned 20 October for a 26 October cap, with the owned tab closed afterward. No paid Analytics submission or deployment was performed for this change.

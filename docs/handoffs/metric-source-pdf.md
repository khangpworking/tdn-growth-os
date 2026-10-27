# Original Metric page PDF in Market MCP

Owner decision, 2026-10-27: retain a screenshot PDF of the original Metric results page in private R2, alongside its PNG and section images. Subsequent number explanations use the archived evidence, without a new provider capture. This PDF is separate from the generated Market Reader PDF; source logos stay in source evidence, and account controls are masked.

## Implementation

With `TDN_METRIC_EVIDENCE_ENABLED=1`, each successful UI window capture reads the visible page in overlapping viewport screenshots. The overlap removes repeated top bars while preserving sticky table columns. It restores scroll position and account visibility afterwards. A stitched PNG supports the existing section crops; a lossless image-only A4 PDF is created from the same captured pixels, without another browser/provider/model call. Capture bounds, stalled scrolling and layout/viewport changes produce explicit evidence failure codes. Native bridge full-page stitching is no longer used.

The window evidence manifest adds optional `sourcePdf` metadata (`source-page.pdf`, SHA-256, size, page count, `kind=screenshot-pdf`) and `captureTechnique=scroll-screenshots`. Local retention checks the PDF digest before any upload. The existing private R2 package includes `source-page.pdf` with `application/pdf`. `explain_number` returns `urls.sourcePdf` with the existing 24-hour expiry and PDF metadata. When a section crop is unavailable, an archived whole-page PDF can still be returned with the partial-evidence code. Template numbers do not gain source links.

Calendar selection now clicks the actual picker inputs and visible navigation controls through the browser click bridge. A disabled requested date stops with CAPTURE_PERIOD_NOT_SELECTABLE and the calendar’s last enabled date, rather than cycling through months. Dates are never silently shifted. The existing full applied-state and response-scope checks remain authoritative before publication.

## Compatibility and limits

Old image-only evidence manifests remain valid. Stored report HTML, traces, generated PDFs and builder versions are unchanged. Flag-off runs do not create evidence packages. Request-only fallback still reports NO_IMAGES and never invents a PDF of unseen results. There is no historical backfill or provider call during an MCP lookup.

The PDF preserves displayed page content. It does not expand internal table scrolling, pagination, collapsed regions or offscreen horizontal columns; section evidence must not be described as the entire underlying dataset. A live canary for the exact keyword/date windows and real R2 retrieval is a deployment acceptance check, separate from local synthetic upload/lookup validation.

## Verification

Focused capture/report/retention tests cover lower-page pixels, readable PDF output, stalled scrolling, PDF hash rejection, legacy manifests, exact date inputs, R2 PDF content type/presigned links and provider-free generated reports. Market MCP offline tests cover lossless forwarding through authenticated GET only. Live diagnostic artifacts remain outside Git.

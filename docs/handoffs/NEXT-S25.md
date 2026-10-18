# Handoff — NEXT-S25 (automatic report PDFs)

Updated: 2026-10-19
Branch: `wp/pdf-auto-209` (base main `e009d9ee`). Owner approval: 17/10.

## What it does

During the COLLECTION step of a run that includes a Market report, after L9 admission, the Market flow looks for industry-report PDFs (S25):

1. `.pdf` links among this run's admitted web rows (marketplace, social, video, document-sharing/essay and branded marketplace-analytics hosts skipped).
2. Only when step 1 gives fewer than 2 candidates and the keyword draft exists: one extra search, `báo cáo thị trường <keyword> filetype:pdf -site:studocu.vn -site:scribd.com`, same search provider and key as the web lane, never retried. The keyword is normalized and checked by the existing plain-word validation; all other words and exclusions are fixed, with no model involved. Parameters remain `gl=vn`, `hl=vi`, `num=10`; budget and spacing are unchanged. Its rows pass the same L9 keyword filter.
3. At most 2 sequential downloads, in search order, through an SSRF guard: https on port 443 only, DNS name only (no IP literal), every DNS answer must be public, at most 3 redirects with each hop re-checked and its socket pinned to the checked DNS answers (fresh HTTPS connection, original-host TLS verification), no cookies or auth headers, size cap min(16 MiB, 20 MB), 60 s whole-file timeout covering DNS, headers and the body, body must start with `%PDF-`. Duplicates by URL or by bytes are dropped, including bytes already attached by the owner (which keep their package lineage).
4. Each kept file is stored as an ordinary COLLECTION capture (`pdf-discovery` / `pdfdiscovery.download`). The existing capture path retains every `%PDF-` capture as a run PDF (`analysis_pageindex_run_pdfs`, file name `source-N.pdf`), so the existing document reader and the M09 excerpt block pick it up. No new reader and no new timer.

The step document gets an optional `pdfDiscovery` field (search status, files, reason codes). Optional search/PDF captures must fit the bridge's existing 64 MiB capture inventory (within its 128 MiB total budget and unchanged JSON reserve); otherwise they are skipped with `BRIDGE_BUDGET_LIMIT`, before run-PDF/reader retention. Owner uploads remain in their existing packages.

The single `BLOCKED_HOSTS` constant rejects whole DNS labels for `studocu`, `scribd`, `123doc`, `123docz`, `tailieu`, `luanvan`, and the domain suffixes `academia.edu`, `doc.edu.vn`; it also rejects branded vendor labels `metric`, `kalodata`, `tradeint`, `dami`, `ecdata`, `youneteci`. This applies to run-row candidates, extra-search candidates and every download redirect. `.pdf` paths, HTTPS/DNS/SSRF checks, `%PDF-`, page cap and two-file ceiling are unchanged.

Failures retain technical reason codes and never fail the run or draw an empty excerpt block. When a stored `pdfDiscovery` field exists but no verified excerpt reaches the Market report, both renderers show one plain source-status row: `Tài liệu ngành dạng PDF` / `Chưa tìm thấy tài liệu phù hợp trong lượt này.` It does not claim a source was used or add a citation. No percentages, zero counts, provider names, search-engine names or refused-page URLs appear in that row. Existing excerpt output is byte-identical; without the stored field (lane off), report HTML remains byte-identical. Insight output is unchanged. S25 rows for auto PDFs cite the download capture (`binding.kind = 'capture'`); PDFs the owner attached keep their package lineage.

## Flag

`TDN_RESEARCH_PDF_DISCOVERY_ENABLED=1` (exactly `1`; anything else is off). It also needs the search key that the web lane already uses and, since S25b, the document reader enabled (otherwise `SKIPPED_READER_OFF`). Off: no call, no field, no capture, no usage row; Market and Insight HTML are byte-identical to base `e009d9ee`.

## Per-run maximum

- Searches: 1 paid search (usage ordinal 14, provider `serpapi`), only when run rows give fewer than 2 PDFs.
- Downloads: 2 public-file GETs (usage ordinal 15, provider `pdf-discovery`, no credit).
- Document reading: at most 2 extra PDFs per run go to the existing reader, inside its existing per-run question cap.

## Giới hạn trang và câu hỏi (S25b)

- `TDN_RESEARCH_PDF_DISCOVERY_MAX_PAGES`: giới hạn riêng cho tệp tự thu, mặc định `60`; nhận số nguyên an toàn, giới hạn trong khoảng 1–1000; giá trị không hợp lệ dùng mặc định. Máy đếm trang tại chỗ bằng python3 và `pypdf`, không gọi dịch vụ trả phí. Tệp S25 vượt giới hạn được ghi `FAILED` / `PAGE_LIMIT`, không lưu bản thu, không giữ trong lượt và không gửi đi lập chỉ mục. Tệp đó vẫn chiếm một trong tối đa 2 lần tải, không thử tệp thay thế. Không đếm được trang thì ghi `FAILED` / `DOCUMENT_INVALID`.
- Khi bật cờ S25, PDF từ luồng thu chung cũng phải qua giới hạn trang và còn chỗ trong kế hoạch hỏi; bản thu gốc vẫn được giữ, tệp không đạt thì không giữ làm PDF của lượt. Khi tắt cờ, luồng thu chung giữ hành vi cũ. Tệp chủ gửi trực tiếp hoặc qua gói nguồn không chịu giới hạn mới, vẫn theo quy tắc 1–1000 trang của bộ đọc.
- Hỏi tài liệu chủ gửi trước, rồi tài liệu tự thu; trong mỗi nhóm xếp theo `source_sha256`. Cột `analysis_pageindex_run_pdfs.origin` lưu `UPLOAD` hoặc `CAPTURE` qua migration `0057`; hàng cũ mặc định `UPLOAD`. Chủ gửi lại tệp đã thu thì hàng đó trở thành `UPLOAD`.
- Trước khi tìm hoặc tải, trừ số PDF đã có trong lượt (cả `UPLOAD` và `CAPTURE`) khỏi số tệp có thể nhận ít nhất một câu hỏi trong kế hoạch. Chỉ tải tối đa số chỗ còn lại, không quá 2 tệp. Nếu kết quả đã có đủ liên kết cho số chỗ đó thì bỏ lần tìm thêm. Hết chỗ thì ghi `SKIPPED_NO_QUESTION_BUDGET`, không tìm, không tải, không thêm hàng sử dụng 14/15.
- Khi chưa bật bộ đọc (`TDN_PAGEINDEX_CLOUD_ENABLED` khác `true`, không có cấu hình ghi đè), S25 ghi `SKIPPED_READER_OFF` rồi bỏ tìm và tải, không thêm hàng sử dụng 14/15. Khối trích dẫn M09 chỉ dùng câu trích đã lưu từ bộ đọc. Tệp chủ gửi vẫn giữ luồng cũ.
- Mã lý do mới: `PAGE_LIMIT`, `SKIPPED_NO_QUESTION_BUDGET`, `SKIPPED_READER_OFF`.

## First canary check

1. Set the flag on the canary host only; keep everything else unchanged.
2. Run one Market keyword that is likely to have public reports.
3. Check in the COLLECTION step: `pdfDiscovery.search.status` (`CALLED` or `SKIPPED`), each file's status/reason, usage rows 14 (≤1 request) and 15 (≤2 requests).
4. Check `analysis_pageindex_run_pdfs` has one row per downloaded file and the M09 excerpt block shows quotes with no file name, no host and no provider name.
5. Run the Market gate and the 14-rule audit on the report; both must pass as before.
6. If any file has reason `PRIVATE_ADDRESS`, `URL_REFUSED` or `TOO_MANY_REDIRECTS`, note the URL host for review; do not relax the guard.

## Review fixes

- Closed DNS rebinding with checked-address socket lookup on every redirect; no new dependency.
- Enforced the bridge capture budget before optional retention, including the extra search envelope.
- Preserved owner-upload lineage when a discovered file has identical bytes.
- Hid discovery-only provenance; caught optional-lane exceptions; excluded Insight-only runs.
- Added `pdfDiscovery` to API source-card wiring alongside the other lanes.

## Follow-up

- A search that throws before sending (for example a keyword with non-plain characters) still records an unsettled search usage row, same as the expanded-search lane.

## Repair handoff — 2026-10-19

Worktree/branch: assigned `/tmp/claude-1810/s25/wt`; base `30f35dfec0b1928e0b85a5094c89a0b637724ee6`.
Task brief: improve the deterministic one-search query, refuse document-sharing/vendor hosts, and disclose a stored attempt with no report excerpts in both Market renderers. Standard lane, one writer; no schema, budget, provider, browser, deployment or Git history operation.
Completed: query, host policy, shared missing-source wording, reader-context wiring, and offline regression coverage.
Changed paths: eight source files (query planner, PDF lane, shared excerpt status, renderer templates/options and service/reader-context projection), five test files, this handoff and [verification details](NEXT-S25-verification.md).
Evidence: Node 24 typecheck PASS; touched tests 78 pass / 2 pre-existing sandbox HTTP failures; business gate 40/40, 14 rules 15/15, query planner 7/7. Full `timeout -k 5 2400 npm test` ran once: 2,335 pass / 210 fail / 7 skip / 1 todo; all 210 failure names reproduced on HEAD. Six base/current HTML comparisons passed; no frozen digest changed. Exact commands, all failing names, base comparisons and HTML diffs are in [verification details](NEXT-S25-verification.md).
Unresolved: full suite is not green under this sandbox; every failing name also fails on HEAD. No open implementation question.
Next action: review the local diff; run the full suite in an environment with the existing HTTP/frontend/PDF prerequisites. No commit or deployment is included.
Business decisions pending: none.

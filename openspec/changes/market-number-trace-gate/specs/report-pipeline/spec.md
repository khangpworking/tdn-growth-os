## MODIFIED Requirements

### Requirement: R-P07 Cổng máy chặn báo cáo Market trượt
Hệ thống SHALL chạy cổng Market trên HTML nháp loại `MARKET` và trên bản đọc Market trước khi công bố, và SHALL làm lần dựng lỗi khi có quy tắc trượt: bản nháp với mã `MARKET_BUSINESS_GATE_FAILED:<các mã cổng>`; bản đọc với lỗi `ResearchAutomationValidationError` ghi lý do bằng tiếng Việt, không ghi mã (mã nằm trong `cause` của lỗi). Bản nháp Market có bản đồ số (báo cáo có số chuỗi thô) SHALL chạy thêm bước dò số sau cùng: mọi con số trên trang đọc của phần đã phủ SHALL có một dòng trong bản đồ số cùng phần, và mọi dòng SHALL tính lại được bằng công thức đã đăng ký ra đúng số in; nếu không, lần dựng lỗi với mã `MARKET_NUMBER_TRACE_FAILED:<N01_UNTRACED_NUMBER,N02_TRACE_REPLAY>`, bước REPORTS ghi mã `MARKET_NUMBER_TRACE_BLOCKED` và kết quả cổng được lưu.

- Mã: một chỗ kiểm RA `market-report-check.ts` (`checkMarketReport`, `assertMarketReport`) chọn kiểm nào chạy và theo thứ tự nào. Bản nháp trình bày (RA `reports.ts`, ngữ cảnh `DRAFT_PRESENTATION`): kiểm chữ nhìn thấy, cổng Market, 14 quy tắc, tên F1/W6 khi có review công khai, rồi dò số khi có bản đồ số. Bản nháp khác (`DRAFT_PLAIN`): tên F1/W6 khi có review công khai, rồi dò số khi có bản đồ số. Lần lưu (RA `service.ts` `#executeReports`, `STORED`, chỉ khi `kind === 'MARKET'`): cổng Market. Bản đọc (RA `reader-report-revisions.ts`, `READER` với `contractVersion`), theo bảng phiên bản:
  - `reader-report-build-v1`, `reader-report-build-v1.1`: cổng Market (không trình bày, có U13); không 14 quy tắc; lint Reader cũ (RR `build.ts` `publishReaderReport`, không U13).
  - `reader-report-build-v1.2`: cổng Market (không trình bày, có U13), rồi 14 quy tắc; U13 kiểm hai cách đọc thẻ nội dòng cũ trong một lần gọi. Cổng dùng kết quả nối từ; lint Reader dùng lại kết quả đọc HTML thô (`visibleTextResults`), giữ nguyên kết luận và nơi báo lỗi. U13 không chạy lại trong lint Reader.
  Lý do bằng lời: RA `market-check-reasons.ts` (`marketCheckReasons`, `readerLintReasons`), mỗi mã một câu. Cổng: RA `market-business-gate.ts` (`auditMarketReportHtml`, `assertMarketBusinessGate`). Lint chữ nhìn thấy: `src/modules/analysis/report-visible-text-lint.ts` (`lintVisibleReportText`), đọc chữ ẩn và trích dẫn qua `src/modules/analysis/report-visible-text.ts`. Danh sách tên cấm: `report-language` (R-L01).
- Mã kiểm: `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`, `assertMarketReport`)
- Dò số: RA `market-number-trace.ts` (`checkMarketNumberTrace`): cắt số trên trang đọc (bỏ CSS, thuộc tính, chữ ẩn, `<head>`, M13 và danh sách nguồn; số trong trích dẫn nguyên văn `<q>`, `blockquote`, `data-quote` và trong `<details>` vẫn được đọc như mọi số khác); so với bản đồ số RA `market-trace-map.ts` (`market-number-trace-v2`) theo phần, mỗi lần in một dòng; tính lại mỗi dòng bằng bảng công thức `MARKET_TRACE_FORMULAS`, cùng cách làm tròn và định dạng của mẫu; số mẫu cố định trong `MARKET_TRACE_ALLOWED`, mỗi mục có lý do; loại thẻ không tự cho phép số: chữ của thẻ phải đúng một chuỗi mẫu cố định (ví dụ `[3]`, «Bảng 3.1», «Dòng 2»). Phần chưa phủ `MARKET_TRACE_NOT_COVERED` (M05, M06, M08, M09, M10, M11): được đếm và liệt kê, chưa chặn. Kết quả cổng nằm trong semantic của báo cáo (`marketNumberTraceGate`); khi bị chặn, RA `service.ts` lưu kết quả thành tệp JSON, ghi mã dừng, và kết quả bước REPORTS của lần chạy (`numberTraceGate`: sha256, đường dẫn tệp, số chưa truy được, số dòng tính lại sai) chỉ tới tệp đó.
- Mã cổng và quy tắc: xem R-M15 đến R-M26.
- Kiểm thử: `tests/unit/gate-209-market-business.test.ts`, `tests/integration/gate-209-market-business.test.ts`, `tests/integration/gate-209-reader-revision.test.ts`, `tests/unit/c2-market-check-characterization.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: một chỗ kiểm cho bản nháp và bản đọc; bản cũ giữ bộ kiểm cũ; chủ thấy lý do bằng lời (Q2). Bước dò số: kế hoạch chủ F201, 25/10/2026 («thêm cổng máy dò số»), thay cho việc soát số bằng tay mỗi lần chạy.

#### Scenario: Báo cáo có tổng hai sàn
- **WHEN** HTML Market có cụm "tổng hai sàn"
- **THEN** lần dựng lỗi với mã chứa `U32_NO_CROSS_PLATFORM_TOTAL`

#### Scenario: Báo cáo Insight
- **WHEN** HTML nháp thuộc loại `INSIGHT`
- **THEN** chỗ kiểm Market không chạy; lint chữ nhìn thấy chỉ chạy khi có `insightPersona`, hoặc `draftInsight` với snapshot mã hóa v3, v4 hay v5 (RA `reports.ts`)

#### Scenario: Bản đọc trượt cổng
- **WHEN** bản đọc Market có tên nhà cung cấp
- **THEN** lỗi ghi "Trang có tên nhà cung cấp số liệu hoặc công cụ.", không ghi `G08_PROVIDER_NAME`; không có phiên bản mới nào được lưu

#### Scenario: Số viết tay ở phần đã phủ
- **WHEN** bản nháp Market có bản đồ số và phần M03 in «36,2 tỷ» không có dòng nào trong bản đồ số
- **THEN** lần dựng lỗi với mã `MARKET_NUMBER_TRACE_FAILED:N01_UNTRACED_NUMBER`, kết quả cổng liệt kê số, phần và ngữ cảnh

#### Scenario: Số trong trích dẫn hoặc phần mở rộng
- **WHEN** phần M03 in một số trong `<q data-quote>` hoặc trong `<details>` mà không có dòng nào trong bản đồ số
- **THEN** số đó bị tính là chưa truy được và lần dựng lỗi với mã `MARKET_NUMBER_TRACE_FAILED:N01_UNTRACED_NUMBER`

#### Scenario: Lần chạy bị chặn giữ kết quả cổng
- **WHEN** bước dò số chặn một lần chạy Market
- **THEN** bước REPORTS ghi mã `MARKET_NUMBER_TRACE_BLOCKED` và kết quả bước có `numberTraceGate` với sha256 và đường dẫn tệp kết quả cổng

#### Scenario: Tính lại không ra số in
- **WHEN** một dòng phần trăm thay đổi của bản đồ số có số kỳ trước sai, nên tính lại không ra số in
- **THEN** lần dựng lỗi với mã chứa `N02_TRACE_REPLAY`

#### Scenario: Số ở phần chưa phủ hoặc phụ lục
- **WHEN** số không truy được nằm ở phần chưa phủ (ví dụ M06) hoặc trong phụ lục truy nguồn M13
- **THEN** số ở phần chưa phủ được đếm trong kết quả cổng, không chặn; số trong phụ lục không được đọc

#### Scenario: Báo cáo không có bản đồ số
- **WHEN** bản nháp Market không có số chuỗi thô
- **THEN** bước dò số không chạy; mã lỗi, thứ tự và byte như trước

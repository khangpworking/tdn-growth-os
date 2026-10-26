## MODIFIED Requirements

### Requirement: R-P03 Tự chạy Market chỉ khi bật cờ
Hệ thống SHALL chạy luồng tự động (thu, chuẩn bị, chọn link, xác nhận, chờ nháp, trình bày) chỉ khi `TDN_METRIC_OPENCLI_ENABLED=1`, cho lần chạy có `reports` chứa MARKET hoặc INSIGHT. Lần chạy chỉ Insight (có INSIGHT, không có MARKET) SHALL chạy các pha thu, chuẩn bị, chọn link, xác nhận, chờ nháp, rồi SHALL kết thúc ở `DONE` khi bản nháp sẵn sàng, không qua pha trình bày.

- Mã: RA `service.ts` `#processAutorun`; các pha `WAITING_SCOPE, CAPTURE, PREPARE, PICK, CONFIRM, WAIT_DRAFT, PRESENT, DONE, STOPPED`. Chỗ chèn dòng auto-run khi tạo lần chạy; `#autorunWaitDraft` chọn `PRESENT` (có MARKET) hay `DONE` (chỉ Insight). Hàm phụ ở RA `autorun-derive.ts` (`pickShopeeLinks`, `buildCaptureSpec`, `buildRevisionValue`, `planCapturePeriod`, `AUTORUN_PICK_RULE_VERSION='autorun-pick-v3'`). Thu bằng RA `metric-capture-runner.ts` (`runMetricCapture`) qua `metric-opencli-executor.ts`.
- Chọn link Shopee: RA `autorun-derive.ts` (`pickShopeeLinks`, `categoryLeaf`, `relevanceTitle`). Mỗi dòng thô lấy lá danh mục từ `final_categories`, thiếu thì `categories`; chuỗi tách theo `>`, `›`, `»`, `|`, lấy đoạn cuối sau khi chuẩn hóa NFC và gộp khoảng trắng. Dòng không có danh mục là lá «không rõ» và chỉ thành lá phổ biến khi mọi dòng đều không có danh mục. Lượt một chỉ lấy dòng của lá phổ biến nhất (mỗi lượt một thương hiệu, một gian hàng); lượt hai lấp trong lá đó; lượt ba mới lấy lá khác, chỉ khi còn thiếu chỗ. Dòng lá khác bị hạ bậc, không bị loại khỏi mẫu. Bản ghi pick `autorun-pick-record-v3` thêm hai trường tùy chọn khi có: `demotedRows` (id, lá, lý do `OTHER_LEAF`) và `aiExcludedRows` (id, lý do `AI_NOT_MAIN`); bản ghi cũ không có hai trường vẫn đọc được.
- Relevance khi chọn link: `pickShopeeLinks` nhận bản ghi `capture-relevance-record-v1` đã lưu. Khi profile v3 và có bản ghi, dòng bị mọi từ khóa chấm `NOT_MAIN` bị loại khỏi mẫu và ghi vào `aiExcludedRows`; khớp theo sha256 của tiêu đề đã cắt khoảng trắng hai đầu và gộp khoảng trắng giữa, vì bản ghi không có id sản phẩm. `#autorunPick` hiện chưa truyền bản ghi này, nên đường tự chạy chỉ áp dụng lá danh mục; xem «Ngoài phạm vi» của change.
- Bảng: `research_automation_autorun`, `research_automation_autorun_retries` (0055, 0056).
- Vì sao: chủ không bao giờ phải thu mẫu bằng tay (17/10/2026); 14/14 phải đến từ luồng tự động (15/10/2026). Chủ quyết định 25/10/2026: "nguồn nào mà vừa dùng cho cả insight, metric hoặc dùng riêng cho insight thì chạy trong lượt làm báo cáo insight (còn nguồn nào dùng riêng cho mỗi market thì không cần chạy)". Bước chọn link cho Insight link Shopee chính xác; tên Metric vào bản nháp từ khóa L9. Pha trình bày chỉ sửa báo cáo Market. Phiếu CD 26/10/2026: PICK chọn sản phẩm ngoài nhóm của sản phẩm chính trên hai lần chạy thật, nên ưu tiên lá danh mục phổ biến và ghi lại dòng bị hạ bậc.

#### Scenario: Cờ tắt
- **WHEN** `TDN_METRIC_OPENCLI_ENABLED` không bằng `1`
- **THEN** lần chạy không vào các pha tự chạy và chờ thao tác của chủ

#### Scenario: Pha trình bày
- **WHEN** lần chạy tự động có MARKET tới pha `PRESENT`
- **THEN** hệ thống gọi `requestReportRevision(buildRevisionValue(...))` để tạo bản trình bày của báo cáo Market

#### Scenario: Lần chạy chỉ Insight
- **WHEN** cờ bật, `reports` chỉ có INSIGHT, và bản nháp của lần chạy sẵn sàng (`DRAFT_READY`) sau khi luồng tự động đã xác nhận phạm vi
- **THEN** dòng auto-run chuyển từ `WAIT_DRAFT` sang `DONE`, không tạo bản sửa trình bày nào

#### Scenario: Câu hoàn tất trên giao diện
- **WHEN** thẻ auto-run hiện pha `DONE` của lần chạy chỉ Insight
- **THEN** thẻ chỉ nói bản nháp đã xong, không nói bìa hay biểu đồ; câu hoàn tất của lần chạy có MARKET giữ nguyên

#### Scenario: Lỗi thu trên lần chạy chỉ Insight
- **WHEN** lượt thu Metric của lần chạy chỉ Insight lỗi
- **THEN** dòng auto-run dừng `STOPPED` với mã dừng như lần chạy Market, chủ thử lại được theo cùng quy tắc, và lần chạy vẫn chờ chủ xác nhận phạm vi

#### Scenario: Lá danh mục phổ biến
- **WHEN** 12 dòng đủ điều kiện, 11 dòng cùng lá «Thiết bị làm mát» và 1 dòng lá «Sạc dự phòng & Pin», cần 5 link
- **THEN** 5 link lấy trong lá «Thiết bị làm mát»; dòng lá kia vào `demotedRows` với lý do `OTHER_LEAF`, không vào danh sách link

#### Scenario: Thiếu dòng trong lá phổ biến
- **WHEN** lá phổ biến chỉ có 2 dòng đủ điều kiện và cần 5 link
- **THEN** hệ thống lấy 2 dòng lá đó rồi lấy thêm dòng lá khác cho đủ 5, vẫn một gian hàng mỗi link

#### Scenario: Mọi dòng không có danh mục
- **WHEN** mọi dòng đủ điều kiện đều không có `final_categories` và `categories`
- **THEN** cách chọn và bản ghi giữ như trước; không có `demotedRows`

#### Scenario: Chưa truyền bản ghi relevance
- **WHEN** `#autorunPick` gọi `pickShopeeLinks` chỉ với profile
- **THEN** không dòng nào bị loại vì AI; chỉ áp dụng lá danh mục

### Requirement: R-P07 Cổng máy chặn báo cáo Market trượt
Hệ thống SHALL chạy cổng Market trên HTML nháp loại `MARKET` và trên bản đọc Market trước khi công bố, và SHALL làm lần dựng lỗi khi có quy tắc trượt: bản nháp với mã `MARKET_BUSINESS_GATE_FAILED:<các mã cổng>`; bản đọc với lỗi `ResearchAutomationValidationError` ghi lý do bằng tiếng Việt, không ghi mã (mã nằm trong `cause` của lỗi). Bản nháp Market có bản đồ số (báo cáo có số chuỗi thô) SHALL chạy thêm bước dò số sau cùng: mọi con số trên trang đọc của phần đã phủ SHALL có một dòng trong bản đồ số cùng phần, và mọi dòng SHALL tính lại được bằng công thức đã đăng ký ra đúng số in; nếu không, lần dựng lỗi với mã `MARKET_NUMBER_TRACE_FAILED:<N01_UNTRACED_NUMBER,N02_TRACE_REPLAY>`, bước REPORTS ghi mã `MARKET_NUMBER_TRACE_BLOCKED` và kết quả cổng được lưu. Bảng S17 (thư viện quảng cáo tìm kiếm, Phần 7) SHALL in nhãn bằng công thức `exhibit-number` từ vị trí thật của bảng trong Phần 7 ở cả hai nhánh trình bày và không trình bày, SHALL truy mọi số in trong bảng về bản ghi COLLECTION, và SHALL ghi mọi nhãn lấy từ dữ liệu là văn bản đã lưu; không mục nào của bảng S17 được nằm trong danh sách miễn trừ.

- Mã: một chỗ kiểm RA `market-report-check.ts` (`checkMarketReport`, `assertMarketReport`) chọn kiểm nào chạy và theo thứ tự nào. Bản nháp trình bày (RA `reports.ts`, ngữ cảnh `DRAFT_PRESENTATION`): kiểm chữ nhìn thấy, cổng Market, 14 quy tắc, tên F1/W6 khi có review công khai, rồi dò số khi có bản đồ số. Bản nháp khác (`DRAFT_PLAIN`): tên F1/W6 khi có review công khai, rồi dò số khi có bản đồ số. Lần lưu (RA `service.ts` `#executeReports`, `STORED`, chỉ khi `kind === 'MARKET'`): cổng Market. Bản đọc (RA `reader-report-revisions.ts`, `READER` với `contractVersion`), theo bảng phiên bản:
  - `reader-report-build-v1`, `reader-report-build-v1.1`: cổng Market (không trình bày, có U13); không 14 quy tắc; lint Reader cũ (RR `build.ts` `publishReaderReport`, không U13).
  - `reader-report-build-v1.2`: cổng Market (không trình bày, có U13), rồi 14 quy tắc; U13 kiểm hai cách đọc thẻ nội dòng cũ trong một lần gọi. Cổng dùng kết quả nối từ; lint Reader dùng lại kết quả đọc HTML thô (`visibleTextResults`), giữ nguyên kết luận và nơi báo lỗi. U13 không chạy lại trong lint Reader.
  Lý do bằng lời: RA `market-check-reasons.ts` (`marketCheckReasons`, `readerLintReasons`), mỗi mã một câu. Cổng: RA `market-business-gate.ts` (`auditMarketReportHtml`, `assertMarketBusinessGate`). Lint chữ nhìn thấy: `src/modules/analysis/report-visible-text-lint.ts` (`lintVisibleReportText`), đọc chữ ẩn và trích dẫn qua `src/modules/analysis/report-visible-text.ts`. Danh sách tên cấm: `report-language` (R-L01).
- Mã kiểm: `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`, `assertMarketReport`)
- Dò số: RA `market-number-trace.ts` (`checkMarketNumberTrace`): cắt số trong mọi chữ của trang đọc; chỉ bỏ nội dung `script`, `style`, `template`, thuộc tính và phần M13 (phụ lục truy nguồn); không bỏ qua theo thuộc tính, lớp, loại thẻ, trạng thái ẩn hay tiền tố (chữ `hidden`, `display:none`, `aria-hidden`, `<head>`, trích dẫn `<q>`, `data-quote`, `<details>` và danh sách nguồn đều được đọc); so với bản đồ số RA `market-trace-map.ts` (`market-number-trace-v2`) theo phần, mỗi lần in một dòng; tính lại mỗi dòng bằng bảng công thức `MARKET_TRACE_FORMULAS`, cùng cách làm tròn và định dạng của mẫu. Chữ mẫu cố định nằm trong danh sách chuỗi đúng nguyên văn `MARKET_TRACE_ALLOWED_TEXT` (mã phần «M03», «Phần 3», cỡ nhóm «3 gian hàng doanh thu cao»…), mỗi mã có lý do trong `MARKET_TRACE_ALLOWED`; chuỗi phải chứa trọn con số («M036,2 tỷ» không được cho phép). Mọi số khác có dòng thật trong bản đồ số, ghi tại chỗ in: số trích dẫn và mục nguồn (số của mục trong danh sách nguồn đã lưu), số hình và bảng (công thức `exhibit-number`: số phần và thứ tự), mã dòng «Dòng N» (công thức `row-number`), quý ở trang bìa và tiêu đề, kỳ yêu cầu, số đếm mục, phạm vi nguồn và nhật ký truy vấn, mã phương pháp của bản nháp thường. Vạch chia trục giá trị của biểu đồ có dòng riêng trong bản đồ số (công thức `axis-tick`: từ 0 đến 2 lần cột lớn nhất, hoặc 0–100 với tỷ trọng). Phần chưa phủ `MARKET_TRACE_NOT_COVERED` (M05, M06, M08, M09, M10, M11): được đếm và liệt kê, chưa chặn. Kết quả cổng nằm trong semantic của báo cáo (`marketNumberTraceGate`); khi bị chặn, RA `service.ts` lưu kết quả thành tệp JSON, ghi mã dừng, và kết quả bước REPORTS của lần chạy (`numberTraceGate`: sha256, đường dẫn tệp, số chưa truy được, số dòng tính lại sai) chỉ tới tệp đó.
- Bảng S17: RA `reports.ts` (`searchAdsTable`) truy từng số in ra bằng `traceMarketNumber`: số mẫu quảng cáo, số Chữ/Hình/Video và số ngày hiện của mẫu dài ngày theo `as-stored`; ngày hiện lần đầu và lần cuối theo `vi-date`; cả hai trỏ `storedInput('stored-source', <sha bản ghi COLLECTION>, '/searchAds/brands/<i>/<trường>', <giá trị>)` của đúng dòng. Tên thương hiệu và miền là văn bản đã lưu: mọi số viết trong chúng được ghi theo `as-stored` trỏ về trường `label` hoặc `domain` của dòng, như P5b ghi tên sản phẩm (`productTitleSources`). Bảng S17 không nằm trong `MARKET_TRACE_NOT_COVERED`, không thêm mục vào `MARKET_TRACE_ALLOWED`, và không nới cổng. Nhãn bảng: nhánh trình bày dùng `numberMarketExhibits` (RA `market-reader-delivery.ts`) qua chỗ trống `data-exhibit-fill="search-ads"`; nhánh không trình bày dùng `numberSearchAdsExhibit`, cùng cách đếm `numberedExhibits` theo loại trong Phần 7 và cùng công thức `exhibit-number`, chỉ thay nhãn; các byte khác của nhánh cũ giữ nguyên. Bảng không có dòng thương hiệu trạng thái `OK` in câu «không có» và danh sách ghi chú, không có nhãn bảng và không có số mới.
- Mã cổng và quy tắc: xem R-M15 đến R-M26.
- Kiểm thử: `tests/unit/gate-209-market-business.test.ts`, `tests/integration/gate-209-market-business.test.ts`, `tests/integration/gate-209-reader-revision.test.ts`, `tests/unit/c2-market-check-characterization.test.ts`, `tests/unit/market-number-trace-contract.test.ts`, `tests/unit/p5b-trace-live-contract.test.ts`, `tests/unit/market-raw-report-contract.test.ts`, `tests/unit/package-g-evidence.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: một chỗ kiểm cho bản nháp và bản đọc; bản cũ giữ bộ kiểm cũ; chủ thấy lý do bằng lời (Q2). Bước dò số: kế hoạch chủ F201, 25/10/2026 («thêm cổng máy dò số»), thay cho việc soát số bằng tay mỗi lần chạy. Bảng S17: phiếu CD 26/10/2026, hai lần chạy thật dừng `MARKET_NUMBER_TRACE_BLOCKED` vì nhãn viết cứng và các số, tên thương hiệu chưa có nguồn truy.

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
- **WHEN** phần M03 in một số trong `<q data-quote>`, trong `<details class="evidence-trace">`, trong chữ `aria-hidden`, trong thẻ có `hidden` hoặc `display="none"`, hoặc sau một nhãn mẫu («Sản phẩm #36,2 tỷ») mà không có dòng nào trong bản đồ số
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

#### Scenario: S17 ở bản trình bày
- **WHEN** báo cáo Market trình bày có bảng S17 là bảng thứ ba của Phần 7
- **THEN** nhãn in «Bảng 7.3» theo `exhibit-number`, và mỗi số mẫu, Chữ/Hình/Video, ngày, số ngày cùng mọi số trong tên thương hiệu và miền có dòng bản đồ số trỏ về `/searchAds/brands/<i>/…` của bản ghi COLLECTION

#### Scenario: S17 ở nhánh không trình bày
- **WHEN** báo cáo Market không có `marketPresentation` và có bảng S17
- **THEN** nhãn bảng được đếm từ vị trí thật trong Phần 7 bằng cùng công thức `exhibit-number`, không còn số viết cứng; các byte khác của nhánh cũ giữ nguyên

#### Scenario: Bảng S17 không có dòng đã kiểm tra
- **WHEN** bản ghi COLLECTION không có thương hiệu nào ở trạng thái `OK`
- **THEN** báo cáo in câu «không có» và danh sách ghi chú, không in nhãn bảng, không thêm số nào

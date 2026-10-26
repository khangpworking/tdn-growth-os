## MODIFIED Requirements

### Requirement: R-P03 Tự chạy Market chỉ khi bật cờ
Hệ thống SHALL chạy luồng tự động (thu, chuẩn bị, chọn link, xác nhận, chờ nháp, trình bày) chỉ khi `TDN_METRIC_OPENCLI_ENABLED=1`, cho lần chạy có `reports` chứa MARKET hoặc INSIGHT. Lần chạy chỉ Insight (có INSIGHT, không có MARKET) SHALL chạy các pha thu, chuẩn bị, chọn link, xác nhận, chờ nháp, rồi SHALL kết thúc ở `DONE` khi bản nháp sẵn sàng, không qua pha trình bày. Khi bước `QUICK_SEARCH` đã `FAILED`, luồng tự động SHALL dừng ở pha `CAPTURE` với đúng mã của bước đó, trước khi gọi nguồn trả phí và trước pha `PICK`; nó SHALL NOT báo `NO_PRINCIPAL_PRODUCTS` cho một lỗi nguồn.

- Mã: RA `service.ts` `#processAutorun`; các pha `WAITING_SCOPE, CAPTURE, PREPARE, PICK, CONFIRM, WAIT_DRAFT, PRESENT, DONE, STOPPED`. Chỗ chèn dòng auto-run khi tạo lần chạy; `#autorunWaitDraft` chọn `PRESENT` (có MARKET) hay `DONE` (chỉ Insight). Mã bước tìm sản phẩm được đọc trong `#autorunQuickSearchStopCode`, dùng ở pha thu, chuẩn bị và chọn link. Hàm phụ ở RA `autorun-derive.ts` (`pickShopeeLinks`, `buildCaptureSpec`, `buildRevisionValue`, `planCapturePeriod`, `AUTORUN_PICK_RULE_VERSION='autorun-pick-v3'`). Thu bằng RA `metric-capture-runner.ts` (`runMetricCapture`) qua `metric-opencli-executor.ts`.
- Bảng: `research_automation_autorun`, `research_automation_autorun_retries` (0055, 0056).
- Vì sao: chủ không bao giờ phải thu mẫu bằng tay (17/10/2026); 14/14 phải đến từ luồng tự động (15/10/2026). Chủ quyết định 25/10/2026: "nguồn nào mà vừa dùng cho cả insight, metric hoặc dùng riêng cho insight thì chạy trong lượt làm báo cáo insight (còn nguồn nào dùng riêng cho mỗi market thì không cần chạy)". Bước chọn link cho Insight link Shopee chính xác; tên Metric vào bản nháp từ khóa L9. Pha trình bày chỉ sửa báo cáo Market. Chủ báo lỗi 26/10/2026: lần chạy `b4c0540b` nhận HTTP 554 mà luồng tự động vẫn báo `NO_PRINCIPAL_PRODUCTS`.

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

#### Scenario: Bước tìm sản phẩm lỗi máy chủ nguồn
- **WHEN** bước `QUICK_SEARCH` dừng `FAILED` với mã `PROVIDER_UNAVAILABLE`
- **THEN** dòng auto-run dừng ở pha `CAPTURE` với mã `PROVIDER_UNAVAILABLE`, không gọi nguồn trả phí, không sang pha `PICK`, và không báo `NO_PRINCIPAL_PRODUCTS`

## ADDED Requirements

### Requirement: R-P16 Lỗi máy chủ nguồn có mã riêng và giữ đầu mối HTTP
Lần gọi nguồn trả HTTP từ 500 trở lên SHALL ghi mã bước `PROVIDER_UNAVAILABLE` và câu báo có mã HTTP thật, trừ khi lỗi đã được nhận là lỗi xác thực, hạn mức hay hết điểm. Câu báo SHALL nói bước đã dừng, khả năng chỉ xảy ra một lần, và cách tạo lượt mới; câu này SHALL NOT nêu tên nhà cung cấp. Hệ thống SHALL NOT tự gọi lại lần trả phí nào.

Bản ghi nguồn SHALL giữ một danh sách header phản hồi cho phép để phân biệt nguồn với CDN hay máy chắn giữa: `server`, `date`, `via`, `cf-ray`, `x-request-id`, `x-amzn-requestid`, `x-cache`, `content-type`, `content-length`, `retry-after`. Mỗi giá trị SHALL được cắt ngắn, bỏ ký tự điều khiển, và bị bỏ nếu chứa khóa bí mật. Trường này SHALL là tùy chọn để bản ghi cũ vẫn đọc được; không lưu header ngoài danh sách, cookie hay thông tin cá nhân.

- Mã: RA `provider-common.ts` (`safeResponseHeaders`, `boundedRequest`, `CaptureLog.record`); RA `provider-kalodata.ts` (`call`, `captureHeaders`); RA `providers.ts` (`ProviderRawCapture.responseHeaders`); RA `source-binding.ts` (`providerUnavailableLimitation`); RA `model.ts` (`PROVIDER_UNAVAILABLE`, `providerUnavailableMessage`); RA `service.ts` (mã bước, `stepMessage`, `#autorunQuickSearchStopCode`); giao diện `frontend/src/research-automation/run-status.ts`, `autorun-text.ts`.
- Mã kiểm: chưa có mã kiểm (phiên kiểm thử riêng).
- Vì sao: chủ báo lỗi 26/10/2026; lần chạy `b4c0540b` nhận HTTP 554 thân rỗng mà không có đầu mối nào ngoài mã lỗi chung, và vẫn bị trừ 0,1 điểm.

#### Scenario: HTTP 554 thân rỗng
- **WHEN** lần gọi nguồn trả HTTP 554 và thân rỗng
- **THEN** bước ghi mã `PROVIDER_UNAVAILABLE`, câu bước có «HTTP 554», và bản ghi nguồn giữ các header cho phép của phản hồi

#### Scenario: Lỗi xác thực hoặc hết điểm
- **WHEN** lần gọi nguồn trả HTTP 401, 403, 429, hoặc nguồn báo hết điểm
- **THEN** mã bước giữ nguyên cách xử lý cũ, không đổi thành `PROVIDER_UNAVAILABLE`

#### Scenario: Header chứa khóa
- **WHEN** một header cho phép có giá trị chứa khóa bí mật
- **THEN** giá trị đó không được lưu trong bản ghi nguồn

#### Scenario: Bản ghi cũ
- **WHEN** đọc bản ghi nguồn không có `responseHeaders`
- **THEN** bản ghi vẫn đọc được và không lỗi

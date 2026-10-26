## ADDED Requirements

### Requirement: R-P17 Mất đăng nhập Shopee là lỗi nguồn có tên
Trước lần nộp job review công khai Shopee đầu tiên của một lượt thu, hệ thống SHALL kiểm phiên bộ thu bằng `GET /session`, chỉ tin khi `state` là `ready`, `authenticated` là true và `checked_at` không quá 10 phút; nếu không tin được thì SHALL gọi `POST /session/check` đúng một lần. Hệ thống SHALL NOT kết luận «đã đăng nhập» từ `GET /health`. Mỗi lượt thu SHALL kiểm phiên tối đa một lần và SHALL NOT lặp kiểm.

Phiên chưa sẵn sàng SHALL dừng phần review với một mã đích danh: `SHOPEE_LOGIN_REQUIRED` khi `needs_login` hoặc `awaiting_user_login`, `SHOPEE_VERIFICATION_REQUIRED` khi `needs_verification`, `SHOPEE_COLLECTOR_DOWN` khi mạng lỗi hoặc HTTP 5xx. HTTP 409 SHALL là `COLLECTOR_BUSY` và không tự thử lại. Ba mã lỗi nguồn SHALL có câu tiếng Việt nói rõ nguồn đánh giá Shopee mất đăng nhập, xác minh hoặc không phản hồi, và SHALL NOT dùng câu chung `PROVIDER_BLOCKED` hay `UNAVAILABLE`. Lần chạy SHALL tiếp tục như các lỗi nguồn khác: sản phẩm sau điểm dừng giữ `NOT_SUBMITTED`, báo cáo vẫn được dựng, và phần review thiếu được ghi là thiếu vì nguồn mất đăng nhập.

`HEALTH_NOT_READY` với `browser` là `needs_login` hoặc `awaiting_user_login` SHALL thành `HUMAN_LOGIN_REQUIRED`; với `needs_verification` SHALL thành `HUMAN_VERIFICATION_REQUIRED`. Các mã mới SHALL có trong mọi danh sách đóng của hợp đồng, kiểu dữ liệu sinh, nhãn giao diện và API đọc, để không mã lạ nào hiện thô; API đọc chỉ trả mã và câu, không có thao tác sửa. Câu báo SHALL NOT nêu tên sản phẩm bộ thu.

- Loại kiểm: Máy
- Mã kiểm: `ShopeePublicReviewSessionClient` và `checkPublicReviewSession` trong `src/platform/collectors/shopee-public-reviews.ts`; `classifyPublicExactShopee`, `publicExactShopeeOutcomeMessage`, `publicExactShopeeOutcomeLimitation` trong `exact-shopee-outcome.ts`; `AutomationPublicShopeeBridge.collect` trong `public-shopee-bridge.ts`; `#executePublicTail`, `#publicReportSource` trong `service.ts`; `contracts/foundation/shopee-public-collection.schema.json`, `contracts/api/research-automation-api.schema.json`; `frontend/src/research-automation/run-status.ts`.
- Vì sao: Ngày 26/10/2026, hai lần chạy `ef9271ec` và `3d37a21c` ghi 0 đánh giá sau khi máy khởi động lại; `/health` báo sẵn sàng dù phiên đã mất. Chủ yêu cầu lỗi này hiện là lỗi nguồn có tên, không phải câu chung.

#### Scenario: Bộ thu vừa khởi động, phiên đã mất
- **WHEN** `GET /health` trả `browser: ready`, `GET /session` trả `authenticated: null`, và `POST /session/check` trả `needs_login`
- **THEN** phần review dừng với `SHOPEE_LOGIN_REQUIRED`, nhật ký nguồn có câu «mất đăng nhập Shopee», chưa nộp job nào, và lần chạy vẫn dựng báo cáo với phần review thiếu nêu đúng lý do

#### Scenario: Phiên sẵn sàng
- **WHEN** `GET /session` trả `ready`, `authenticated: true`, `checked_at` cách hiện tại 2 phút
- **THEN** lượt thu nộp job như hiện nay và không gọi `POST /session/check`

#### Scenario: Phiên cũ hoặc chưa xác thực
- **WHEN** `GET /session` trả `ready` nhưng `checked_at` cách hiện tại 11 phút, hoặc `authenticated` không phải true
- **THEN** hệ thống gọi `POST /session/check` đúng một lần và dùng kết quả đó

#### Scenario: Mất phiên giữa lúc thu
- **WHEN** sản phẩm 1 `succeeded`, job của sản phẩm 2 trả `needs_login`
- **THEN** sản phẩm 2 dừng với `SHOPEE_LOGIN_REQUIRED`, sản phẩm 3 giữ `NOT_SUBMITTED`, và không có job nào được nộp lại

#### Scenario: Shopee hỏi xác minh
- **WHEN** `POST /session/check` trả `needs_verification`
- **THEN** phần review dừng với `SHOPEE_VERIFICATION_REQUIRED`, khác `SHOPEE_LOGIN_REQUIRED`

#### Scenario: Bộ thu không phản hồi
- **WHEN** `GET /session` và `POST /session/check` đều lỗi kết nối hoặc trả HTTP 503
- **THEN** phần review dừng với `SHOPEE_COLLECTOR_DOWN`, không tự thử lại

#### Scenario: Đối chứng âm — lỗi dữ liệu khác
- **WHEN** job trả HTTP 422 hoặc phản hồi sai cấu trúc
- **THEN** mã vẫn là `PROVIDER_BLOCKED` như trước, không bị đổi thành một trong ba mã đăng nhập

#### Scenario: Bản ghi cũ
- **WHEN** đọc một lần chạy cũ chỉ có `HEALTH_NOT_READY`
- **THEN** mã cũ được giữ nguyên và không lỗi khi đọc

### Requirement: R-P18 Chỉ chủ sửa phiên đăng nhập trên web
Việc mở hoặc xác nhận phiên đăng nhập của bộ thu review Shopee SHALL chỉ xảy ra qua `owner-api`, với xác thực chủ, exact Origin và `requestKey` idempotent như `auto-run/retry`. `POST …/runs/{id}/shopee-session/login` SHALL gọi `POST /session/login` và trả `AWAITING_USER_LOGIN`. `POST …/runs/{id}/shopee-session/confirm` SHALL gọi `POST /session/check`; nếu kết quả `ready` thì SHALL gọi `POST /session/background`, rồi trả `READY` hoặc mã đã ánh xạ. Hai lệnh SHALL chỉ nhận khi lần chạy đang có một trong ba lỗi nguồn ở R-P17; một `requestKey` đã nhận SHALL trả lại đúng biên nhận cũ mà không gọi bộ thu lần nữa.

Trang lần chạy SHALL hiện câu lỗi nguồn và ba nút theo thứ tự «Đăng nhập Shopee», «Tôi đã đăng nhập xong», «Thu lại đánh giá», chỉ cho chủ đã đăng nhập. Ứng dụng SHALL NOT tự đăng nhập, nhập mật khẩu, giải xác minh, hay gọi `/session/login` khi chủ chưa bấm. Token bộ thu SHALL NOT xuất hiện trong phản hồi, trang hay log. Thay đổi này SHALL NOT thêm công cụ MCP hoặc đường MCP nào.

- Loại kiểm: Máy: lệnh, mã kết quả, sổ yêu cầu; người đọc soát câu chữ
- Mã kiểm: `openShopeeReviewLogin`, `confirmShopeeReviewSession`, `#shopeeSessionAction` trong `service.ts`; bảng `research_automation_shopee_sessions` (`0061_analysis_research_automation_shopee_sessions.sql`); `shopee-session/login` và `shopee-session/confirm` trong `src/api/research-automation-api.ts`; `loginShopeeSession`, `confirmShopeeSession` trong `frontend/src/research-automation/api.ts`; `ShopeeSessionRepair` trong `RunView.tsx`.
- Vì sao: Luật của chủ 26/10/2026: «fix nguồn thì phải do web tôi chứ không phải mcp. User mcp sao fix nguồn được». Chủ đăng nhập nhầm ở Chrome thường, nên cửa sổ đăng nhập phải do bộ thu mở.

#### Scenario: Chủ mở cửa sổ đăng nhập
- **WHEN** chủ bấm «Đăng nhập Shopee» trên một lần chạy đang có `SHOPEE_LOGIN_REQUIRED`
- **THEN** ứng dụng gọi `POST /session/login` đúng một lần và trả `AWAITING_USER_LOGIN`; trang nhắc đăng nhập trong cửa sổ do bộ thu mở

#### Scenario: Chủ xác nhận đã đăng nhập
- **WHEN** chủ bấm «Tôi đã đăng nhập xong» và `POST /session/check` trả `ready`
- **THEN** ứng dụng gọi `POST /session/background` và trả `READY`

#### Scenario: Chủ đăng nhập nhầm ở Chrome thường
- **WHEN** `POST /session/check` vẫn trả `needs_login`
- **THEN** biên nhận là `LOGIN_REQUIRED` và trang nhắc đăng nhập trong cửa sổ do bộ thu mở; không có lần thử mới nào

#### Scenario: Lặp cùng mã yêu cầu
- **WHEN** trình duyệt gửi lại đúng `requestKey` của một lệnh đã nhận
- **THEN** máy chủ trả lại đúng biên nhận cũ, không gọi `/session/login`, `/session/check` hay `/session/background` lần nữa

#### Scenario: Lần chạy không có lỗi đăng nhập
- **WHEN** một lần chạy có kết quả review `OK` hoặc `PROVIDER_BLOCKED` nhận lệnh mở phiên
- **THEN** máy chủ từ chối với lỗi trạng thái và không gọi bộ thu

#### Scenario: Người không phải chủ
- **WHEN** một yêu cầu không có token chủ hợp lệ hoặc sai Origin gọi một trong hai lệnh
- **THEN** máy chủ trả 401 hoặc 403 và không gọi bộ thu

#### Scenario: Token bộ thu
- **WHEN** bộ thu trả về một trường có chứa token trong phản hồi
- **THEN** máy chủ không chuyển tiếp trường đó và biên nhận không chứa token

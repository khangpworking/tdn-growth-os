# Báo đúng lỗi máy chủ nguồn thay vì «không có sản phẩm chính»

> Trạng thái: **đề xuất từ phiên sửa lỗi ngày 26/10/2026**. Mã đã có trong nhánh sửa lỗi; chủ duyệt bản văn R-P03 và R-P16 mới khi gộp.

## Why

Ngày 26/10/2026, lần chạy thật `b4c0540b` (từ khóa «canxi») gọi nguồn dữ liệu bán hàng và nhận HTTP 554 với thân rỗng. Nguồn vẫn trừ 0,1 điểm. Bước tìm sản phẩm ghi `PROVIDER_FAILED`; lần chạy dừng ở `AWAITING_SCOPE`. Luồng tự động đi tiếp tới pha chọn link rồi báo `NO_PRINCIPAL_PRODUCTS`, nên chủ thấy «không có sản phẩm chính» thay vì lỗi máy chủ nguồn.

Hai lỗi cần sửa:

1. Lỗi máy chủ nguồn (HTTP 5xx, kể cả mã lạ như 554) chưa có mã dừng riêng và chưa giữ mã HTTP trong câu báo.
2. Khi bước tìm sản phẩm đã lỗi, luồng tự động vẫn chạy tiếp và báo sai nguyên nhân.

Bản ghi nguồn cũng chỉ giữ thân phản hồi. Khi thân rỗng, không có đầu mối nào cho biết lỗi đến từ nguồn hay từ CDN/máy chắn giữa.

## What Changes

- **MODIFIED** R-P03: luồng tự động SHALL dừng với mã của bước tìm sản phẩm khi bước đó đã FAILED, trước khi sang pha chọn link; không báo `NO_PRINCIPAL_PRODUCTS` cho lỗi nguồn.
- **ADDED** R-P16: bước thất bại vì lượt gọi dữ liệu trả HTTP từ 500 trở lên (không phải lỗi xác thực, hạn mức hay hết điểm) SHALL ghi mã bước `PROVIDER_UNAVAILABLE` và câu báo có mã HTTP thật. Lỗi truy vấn số dư dùng đo chi phí không thay kết quả hoặc mã lỗi của lượt gọi dữ liệu. Bản ghi nguồn SHALL giữ một danh sách header phản hồi cho phép (máy chủ, ngày, CDN, mã yêu cầu, loại và độ dài nội dung, retry-after), bỏ giá trị đầy đủ chứa khóa trước khi cắt ngắn; trường này không bắt buộc để bản ghi cũ vẫn đọc được.
- Không tự gọi lại lần trả phí nào. Không đổi cách xử lý 401, 403, 429 và hết điểm.

## Impact

- Mã: `src/modules/analysis/research-automation/provider-common.ts` (danh sách header cho phép, `safeCaptureHeaders`, `boundedRequest`), tất cả adapter HTTP dùng `CaptureLog` (Kalodata, SerpApi, Trends, Google Ads, CLIProxy, Comtrade, thống kê chính thức, PDF, World Bank), `providers.ts` (`ProviderRawCapture.responseHeaders`), `source-binding.ts` (`providerUnavailableLimitation`), `model.ts` (`PROVIDER_UNAVAILABLE`, `providerUnavailableMessage`), `service.ts` (mã bước, câu bước theo mã HTTP, `#autorunQuickSearchStopCode`), giao diện `frontend/src/research-automation/run-status.ts`, `autorun-text.ts` và `RunView.tsx`.
- Không đổi lược đồ API: `code` và `stopCode` vốn là chuỗi mã chung.
- Không đổi nguồn, không đổi cờ môi trường, không đổi dữ liệu đã lưu.

## Ngoài phạm vi

- Tự động thử lại lần gọi trả phí sau lỗi tạm thời.
- Đọc thân phản hồi HTML của trang lỗi để lấy thông điệp của nguồn.
- Đổi cách xử lý lỗi xác thực, hạn mức, hết điểm hay lỗi mạng.

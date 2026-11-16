## MODIFIED Requirements

### Requirement: R-RF09 Không ảnh hưởng số đếm
Không module nào ngoài lượt lọc, lệnh `FILTER` và bước 4 của luồng module Shopee SHALL đọc `review_filter_assessment`. Gán nhãn của web app, `review_star_sentiment`, loader, báo cáo và MCP SHALL cho cùng kết quả dù đánh giá có kết quả `EXCLUDE`.

- Loại kiểm: Máy
- Mã kiểm: `tests/integration/raw-db-v1-review-filter.test.ts`
- Vì sao: Chủ duyệt chế độ chạy song song cho web app (04/11/2026); bước 4 của app Shopee dùng kết quả lọc (F577 đến F586, 16/11/2026).

#### Scenario: Dòng bị đánh dấu loại vẫn được gán nhãn trong web app
- **WHEN** đánh giá có kết quả `EXCLUDE` và lượt gán nhãn của web app chạy
- **THEN** đánh giá vẫn được gán nhãn và vẫn có trong `review_star_sentiment`

## ADDED Requirements

### Requirement: R-RF11 Bước 4 chỉ gắn chủ đề cho dòng được giữ
Bước 4 của luồng module Shopee SHALL chỉ gắn chủ đề cho đánh giá của bộ dữ liệu `module-m3:<lượt>:<nguồn>` có kết quả lọc `KEEP` ở phiên bản lọc cố định. Khi `labelUnresolved` trong `skills/tdn-shopee-flow/modules.json` là `true`, bước 4 SHALL gắn thêm cho dòng `UNRESOLVED`. Bước 4 SHALL NOT ghi nhãn mới cho dòng khác. Biên nhận SHALL ghi số dòng `UNRESOLVED` không được gắn và số nhãn cũ trên dòng không được giữ.

- Loại kiểm: Máy
- Mã kiểm: `tests/integration/shopee-module-review-process.test.ts`
- Vì sao: Chủ quyết F577 đến F586 (16/11/2026). F583 (UNRESOLVED) chưa quyết, nên mặc định `false`.

#### Scenario: Dòng EXCLUDE không có nhãn mới
- **WHEN** bước 4 chạy trên nguồn có 1 dòng EXCLUDE và 3 dòng KEEP
- **THEN** chỉ 3 dòng KEEP được gọi Jev gắn chủ đề, và cổng ra có `no_new_label_on_excluded` đạt

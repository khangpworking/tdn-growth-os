## RENAMED Requirements

- FROM: `### Requirement: R-L04 Không cộng Shopee với TikTok Shop`
- TO: `### Requirement: R-L04 Cộng hai sàn chỉ ở Market, có nhãn`

## MODIFIED Requirements

### Requirement: R-L04 Cộng hai sàn chỉ ở Market, có nhãn
Báo cáo Market MAY cộng Shopee với TikTok Shop theo R-M16 (có nhãn «Cộng 2 sàn», số từng sàn đứng cạnh). Báo cáo Insight SHALL NOT cộng Shopee với TikTok Shop (R-I06). Trong mọi báo cáo, số của hai sàn SHALL đứng cạnh nhau.

- Loại kiểm: Máy
- Mã kiểm: cổng `U32_NO_CROSS_PLATFORM_TOTAL` và lint Reader W3 của bản đọc Market, cùng gọi `crossPlatformTotalMatches` (`src/modules/analysis/report-language/cross-platform-total.ts`) (nghĩa mới cho Market, xem R-M16). W3 của Insight trong `lint` (`src/modules/analysis/reader-report/lint.ts`) giữ mẫu cũ: mọi cụm tổng hai sàn đều trượt.
- Vì sao: U-32 ngày 11/10/2026 cấm cộng. Chủ cho phép cộng ở Market ngày 22/10/2026 (F100). Ngày 24/10/2026 chủ giữ luật không cộng cho Insight (R-I06).

W3 của Insight và mảng lint trong claims của bản đọc Market v1/v1.1 SHALL giữ nội dung và thứ tự cũ.

#### Scenario: Hai sàn cạnh nhau
- **WHEN** báo cáo đặt cột Shopee cạnh cột TikTok Shop
- **THEN** quy tắc R-L04 đạt

#### Scenario: Market có ô Cộng 2 sàn
- **WHEN** báo cáo Market có ô «Cộng 2 sàn» và số từng sàn đứng cạnh
- **THEN** quy tắc R-L04 đạt

#### Scenario: Có tổng hai sàn
- **WHEN** báo cáo Insight cộng số bản ghi của Shopee với TikTok Shop
- **THEN** quy tắc R-L04 trượt

#### Scenario: Cụm trước đây chỉ một bên chặn
- **WHEN** báo cáo viết "tổng cả hai sàn" hoặc "Shopee + TikTok" mà không có nhãn «Cộng 2 sàn» và không có số từng sàn đứng cạnh
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` và lint Reader W3 cùng trượt

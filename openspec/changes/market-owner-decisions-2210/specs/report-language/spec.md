## MODIFIED Requirements

### Requirement: R-L04 Không cộng Shopee với TikTok Shop
Báo cáo Market MAY cộng Shopee với TikTok Shop theo R-M16 (có nhãn «Cộng 2 sàn», số từng sàn đứng cạnh). Báo cáo Insight SHALL NOT cộng Shopee với TikTok Shop (R-I06). Trong mọi báo cáo, số của hai sàn SHALL đứng cạnh nhau.

- Loại kiểm: Máy
- Mã kiểm: cổng `U32_NO_CROSS_PLATFORM_TOTAL` (đổi nghĩa cho Market, xem R-M16)
- Vì sao: U-32 ngày 11/10/2026 cấm cộng. Chủ cho phép cộng ở Market ngày 22/10/2026 (F100). Insight chưa có quyết định mới.
- Ghi chú: khi archive, đổi tên thành "R-L04 Cộng hai sàn chỉ ở Market, có nhãn".

#### Scenario: Hai sàn cạnh nhau
- **WHEN** báo cáo đặt cột Shopee cạnh cột TikTok Shop
- **THEN** quy tắc R-L04 đạt

#### Scenario: Market có ô Cộng 2 sàn
- **WHEN** báo cáo Market có ô «Cộng 2 sàn» và số từng sàn đứng cạnh
- **THEN** quy tắc R-L04 đạt

#### Scenario: Có tổng hai sàn
- **WHEN** báo cáo Insight cộng số bản ghi của Shopee với TikTok Shop
- **THEN** quy tắc R-L04 trượt

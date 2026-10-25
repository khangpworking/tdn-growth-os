## MODIFIED Requirements

### Requirement: R-I06 Đếm bản ghi theo từng sàn
Báo cáo Insight SHALL đếm bản ghi theo từng sàn, mỗi sàn một cột, SHALL NOT cộng Shopee với TikTok Shop, và SHALL ghi n/N khi mẫu số đầy đủ. Khi một chủ đề có ở cả hai sàn, báo cáo SHALL ghi «có ở cả 2 sàn» và SHALL NOT ghi một con số gộp. Báo cáo Insight SHALL NOT nêu tổng tiền hay tổng lượt bán; hai tổng này chỉ có ở báo cáo Market (R-M16).

- Loại kiểm: Máy (một phần)
- Mã kiểm: Một phần: lint Reader W3 của Insight trong `lint` (`src/modules/analysis/reader-report/lint.ts`) trượt khi có cụm tổng hai sàn. Chưa có mã kiểm cho nhãn «có ở cả 2 sàn» và cho tổng tiền, tổng lượt bán.
- Vì sao: Chủ quyết định ngày 11/10/2026: không có tổng giữa các sàn (U-32). Ngày 24/10/2026 chủ giữ luật này cho Insight sau khi cho Market cộng hai sàn: «Insight không cộng 2 sàn. Mỗi sàn một cột. Chủ đề có ở cả 2 sàn thì ghi «có ở cả 2 sàn». Tổng tiền và tổng lượt bán chỉ có ở Market.»

#### Scenario: Đếm riêng từng sàn
- **WHEN** báo cáo nêu số bản ghi của Shopee và của TikTok Shop, mỗi sàn một cột
- **THEN** quy tắc R-I06 đạt

#### Scenario: Cộng hai sàn
- **WHEN** báo cáo nêu một số bản ghi bằng Shopee cộng TikTok Shop
- **THEN** quy tắc R-I06 bị vi phạm

#### Scenario: Chủ đề có ở cả hai sàn
- **WHEN** chủ đề "giao hàng chậm" có bản ghi ở cả Shopee và TikTok Shop
- **THEN** báo cáo ghi số của từng sàn ở cột riêng và ghi «có ở cả 2 sàn», không ghi số gộp

#### Scenario: Tổng tiền trong Insight
- **WHEN** báo cáo Insight nêu tổng doanh thu hoặc tổng lượt bán
- **THEN** quy tắc R-I06 bị vi phạm

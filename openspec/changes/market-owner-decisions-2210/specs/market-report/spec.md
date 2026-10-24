## MODIFIED Requirements

### Requirement: R-M07 Con số là số trong mẫu, có ghi n
Báo cáo Market SHALL trình bày con số là số trong mẫu và ghi n; SHALL NOT nêu quy mô thị trường. Tổng hai sàn theo R-M16.

- Loại kiểm: Máy
- Mã kiểm: `src/modules/analysis/research-automation/market-14-rules.ts`: `sampleSizeIssues`, `zeroSampleSizeIssues`, `hasSampleStatement`, kiểm chữ "thị phần" và "quy mô thị trường". Bỏ phụ thuộc vào cổng `U32_NO_CROSS_PLATFORM_TOTAL` cũ.
- Vì sao: một trong 14 quy tắc sửa tay (05/10/2026). Vế "không cộng hai sàn" bị chủ bỏ ngày 22/10/2026 (F100).

#### Scenario: Số trong mẫu có n
- **WHEN** báo cáo nêu một con số lấy từ mẫu và ghi n
- **THEN** quy tắc R-M07 đạt

#### Scenario: Nêu quy mô thị trường
- **WHEN** báo cáo dùng chữ "quy mô thị trường" hoặc "thị phần" cho một con số
- **THEN** quy tắc R-M07 trượt

#### Scenario: Có ô Cộng 2 sàn đúng luật
- **WHEN** báo cáo có ô «Cộng 2 sàn» đạt R-M16 và mọi số có n
- **THEN** quy tắc R-M07 đạt

### Requirement: R-M16 Không có tổng giữa Shopee và TikTok Shop
Báo cáo Market MAY nêu tổng giữa Shopee và TikTok Shop, nhưng mỗi tổng SHALL có nhãn «Cộng 2 sàn», SHALL có số của từng sàn đứng cạnh, và SHALL đạt R-M18 (không tổng thiếu thành viên).

- Loại kiểm: Máy
- Mã kiểm: cổng `U32_NO_CROSS_PLATFORM_TOTAL` trong `src/modules/analysis/research-automation/market-business-gate.ts` đổi nghĩa: trượt khi tổng hai sàn thiếu nhãn hoặc thiếu số từng sàn. Chưa có mã kiểm cho luật mới.
- Vì sao: chủ 22/10/2026, «giờ tôi cho phép cộng như metric» (F100), thay U-32 ngày 11/10/2026. Chủ muốn con số tổng quen thuộc của trang gốc, cộng thêm phần tách từng sàn của ta.
- Ghi chú: tiêu đề requirement giữ chữ cũ để khớp spec gốc; khi archive, đổi tên thành "R-M16 Tổng hai sàn có nhãn và số từng sàn".

#### Scenario: Hai sàn đứng cạnh nhau
- **WHEN** báo cáo nêu số của Shopee và số của TikTok Shop riêng từng sàn, không có tổng
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` đạt

#### Scenario: Ô Cộng 2 sàn có số từng sàn
- **WHEN** Phần 1 có ô «Cộng 2 sàn» và cạnh đó là ô Shopee và ô TikTok Shop
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` đạt

#### Scenario: Có tổng hai sàn
- **WHEN** báo cáo có cụm "tổng hai sàn" mà không có nhãn «Cộng 2 sàn» và không có số từng sàn đứng cạnh
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` trượt (nghĩa mới: trượt vì thiếu nhãn và thiếu số từng sàn, không phải vì có tổng)

#### Scenario: Một sàn thiếu số
- **WHEN** TikTok Shop thiếu số doanh thu của kỳ
- **THEN** báo cáo không nêu ô «Cộng 2 sàn» cho doanh thu, và cổng `PARTIAL_TOTAL_FORBIDDEN` (R-M18) trượt nếu ô đó có mặt

## ADDED Requirements

### Requirement: R-M33 Không hiện mã chỉ số trong báo cáo gửi đọc
Báo cáo Market SHALL NOT hiện mã chỉ số (ví dụ DT-1, LB-1, GIA-2, SS-1) trong phần chữ nhìn thấy. Báo cáo chỉ ghi tên chỉ số và cách tính.

- Loại kiểm: Máy (đề xuất: thêm vào `lintVisibleReportText` ở `src/modules/analysis/report-visible-text-lint.ts`)
- Mã kiểm: chưa có mã kiểm
- Vì sao: chủ 22/10/2026, «không cần mã chỉ số đâu». Mã chỉ số là nhiễu với người đọc không chuyên.

#### Scenario: Mã chỉ số trong bảng
- **WHEN** một bảng của báo cáo có tiêu đề cột "DT-1"
- **THEN** kiểm chữ nhìn thấy trượt

#### Scenario: Mã chỉ số trong file dấu vết
- **WHEN** mã "DT-1" chỉ nằm trong file dấu vết kỹ thuật
- **THEN** kiểm chữ nhìn thấy đạt

### Requirement: R-M34 Chỉ số giá tên là giá bán trung bình
Báo cáo Market SHALL gọi chỉ số doanh số chia lượt bán trong kỳ là «giá bán trung bình», và SHALL kèm chú thích: tính theo lượt bán từng ngày, không phải giá người mua trả sau voucher. Báo cáo SHALL NOT dùng chữ «giá thật».

- Loại kiểm: Máy (đề xuất)
- Mã kiểm: chưa có mã kiểm
- Vì sao: chủ 22/10/2026 hỏi «giá thật» lấy từ đâu (F106), rồi duyệt đổi tên (F107). Quy chuẩn dữ liệu đầu vào 1.43, L5a.

#### Scenario: Dùng chữ giá thật
- **WHEN** báo cáo có chữ «giá thật»
- **THEN** kiểm chữ nhìn thấy trượt

#### Scenario: Có tên mới và chú thích
- **WHEN** ô giá ghi «giá bán trung bình» và dòng «Chú thích:» nêu cách tính
- **THEN** quy tắc R-M34 đạt

### Requirement: R-M35 Mỗi phép so có chú thích chỉ số và kỳ
Mỗi phép so, tỷ lệ, tăng hoặc giảm trong báo cáo Market SHALL có chú thích nói (1) chỉ số hoặc đơn vị được so và (2) so với kỳ nào, kèm ngày dạng dd/mm–dd/mm/yyyy.

- Loại kiểm: Bằng chứng (người đọc soát); đề xuất kiểm máy cho dấu "▲", "▼" và "%" không có chú thích đi kèm
- Mã kiểm: chưa có mã kiểm
- Vì sao: chủ 22/10/2026: "▼ −13%", "gấp 3,5 lần" không có chú thích làm người đọc không chuyên hiểu sai.

#### Scenario: Phần trăm trần
- **WHEN** ô số ghi "▼ −13%" và không có chú thích kỳ so
- **THEN** quy tắc R-M35 trượt

#### Scenario: Phần trăm có chú thích
- **WHEN** ô số ghi "▼ −13% (doanh số kỳ 20/09–19/10/2026 so với kỳ 21/08–19/09/2026)"
- **THEN** quy tắc R-M35 đạt

### Requirement: R-M36 Biểu đồ đường không có đường tổng
Biểu đồ đường của báo cáo Market (theo tuần, theo 12 tháng) SHALL chỉ có đường Shopee và đường TikTok Shop. Biểu đồ đường SHALL NOT có đường «Cộng 2 sàn». Tổng chỉ nằm ở ô số, bảng thương hiệu và chữ.

- Loại kiểm: Máy (đề xuất, kiểm trên spec biểu đồ Flint)
- Mã kiểm: chưa có mã kiểm
- Vì sao: chủ 22/10/2026, «chart thì không cần làm line của cộng 2 sàn đâu» (F116).

#### Scenario: Biểu đồ tuần có đường tổng
- **WHEN** biểu đồ doanh số theo tuần có ba đường, trong đó có đường tổng
- **THEN** quy tắc R-M36 trượt

### Requirement: R-M37 Bảng thương hiệu một dòng mỗi thương hiệu
Bảng thương hiệu đứng đầu của báo cáo Market SHALL có một dòng cho mỗi thương hiệu, với cột «Cộng 2 sàn» và cột Shopee, cột TikTok Shop đứng cạnh. Hai dòng SHALL chỉ gộp khi tên thương hiệu trùng hẳn.

- Loại kiểm: Máy (đề xuất)
- Mã kiểm: chưa có mã kiểm
- Vì sao: chủ 22/10/2026 thấy một thương hiệu xuất hiện hai lần và yêu cầu cộng dồn; chủ giữ "Now" và "Now Food" là hai thương hiệu.

#### Scenario: Cùng thương hiệu trên hai sàn
- **WHEN** thương hiệu A có doanh thu ở cả Shopee và TikTok Shop
- **THEN** bảng có một dòng A, cột «Cộng 2 sàn» bằng tổng hai cột sàn

#### Scenario: Tên gần giống
- **WHEN** hai thương hiệu tên "Now" và "Now Food"
- **THEN** bảng giữ hai dòng riêng

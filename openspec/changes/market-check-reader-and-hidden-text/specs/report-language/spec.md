## MODIFIED Requirements

### Requirement: R-L04 Không cộng Shopee với TikTok Shop
Báo cáo SHALL NOT cộng Shopee với TikTok Shop, và hai sàn SHALL đứng cạnh nhau. (Chủ 11/10, U-32) Bản nháp và bản đọc SHALL chặn cùng một danh sách cụm tổng hai sàn.

- Loại kiểm: Máy
- Mã kiểm: Cổng `U32_NO_CROSS_PLATFORM_TOTAL` và lint Reader W3, cùng gọi `crossPlatformTotalMatches` (`src/modules/analysis/report-language/cross-platform-total.ts`)
- Vì sao: Chủ quyết định ngày 11/10/2026: không có tổng giữa các sàn (U-32). Bàn giao 24/10/2026: một danh sách là hợp của danh sách U32 và mẫu W3 cũ; tổng vẫn bị cấm.

#### Scenario: Hai sàn cạnh nhau
- **WHEN** báo cáo đặt cột Shopee cạnh cột TikTok Shop và không có dòng tổng
- **THEN** quy tắc R-L04 đạt

#### Scenario: Có tổng hai sàn
- **WHEN** báo cáo có dòng "Tổng hai sàn"
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` trượt

#### Scenario: Cụm trước đây chỉ một bên chặn
- **WHEN** báo cáo viết "tổng cả hai sàn" hoặc "Shopee + TikTok"
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` và lint Reader W3 cùng trượt

### Requirement: R-L14 Đề xuất hành động có người phụ trách, hạn và nhãn
Đề xuất hành động SHALL được phép, nhưng SHALL có người phụ trách, hạn dd/mm/yyyy và nhãn "đề xuất, chờ chủ duyệt". Nhãn SHALL là nhãn đầy đủ ở mọi nơi kiểm, kể cả cổng nháp; chữ "đề xuất" đứng một mình không đủ. Con số làm căn cứ SHALL chỉ là doanh thu quan sát trong mẫu. Báo cáo SHALL NOT bịa ngân sách hay mức tăng. (Chủ 05/10)

- Loại kiểm: Máy
- Mã kiểm: `hasM12ProposalRows` (xem R-M09); cổng `M12_PROPOSAL_LABEL` (xem R-M26)
- Vì sao: Chủ quyết định ngày 05/10/2026: báo cáo được phép đề xuất; M12 có ba phương án, người phụ trách, hạn, nhãn "đề xuất, chờ chủ duyệt"; chủ bỏ ý "AI không chọn hành động". Ngày 24/10/2026 (Q4): nhãn đầy đủ ở mọi nơi.

#### Scenario: Đề xuất đủ thông tin
- **WHEN** một đề xuất có người phụ trách, hạn 31/10/2026, nhãn "đề xuất, chờ chủ duyệt" và căn cứ là doanh thu quan sát trong mẫu
- **THEN** quy tắc R-L14 đạt

#### Scenario: Bịa mức tăng
- **WHEN** đề xuất nêu mức tăng doanh thu không có trong dữ liệu
- **THEN** quy tắc R-L14 bị vi phạm

#### Scenario: Nhãn ngắn
- **WHEN** phương án trong M12 chỉ ghi "đề xuất"
- **THEN** quy tắc R-L14 bị vi phạm

## ADDED Requirements

### Requirement: R-L21 Chữ ẩn không tính cho luật câu chữ
Chữ ẩn trên trang SHALL NOT làm trượt luật câu chữ: U13 (R-M24), E2 (R-M17), U32 (R-M16, R-L04), M12 (R-M26), tổng thiếu thành phần và luật câu của các khối nguồn (R-M20 đến R-M23). Chữ ẩn là chữ trong phần tử có thuộc tính `hidden`, `aria-hidden` bằng true, 1 hoặc hidden, kiểu `display:none` hoặc `visibility:hidden`, hoặc nằm trong script, style, noscript, template. Tên nhà cung cấp (R-L01) SHALL vẫn bị tính cả trong chữ ẩn. Áp dụng cho cả Market và Insight.

- Loại kiểm: Máy
- Mã kiểm: `src/modules/analysis/report-visible-text.ts` (`hiddenElement`, `withoutHiddenText`, `balancedOpenings`); dùng ở `market-business-gate.ts` và `report-visible-text-lint.ts`
- Vì sao: Chủ quyết định ngày 24/10/2026 (Q3): người đọc không thấy chữ ẩn, nên chữ ẩn không làm trượt luật câu chữ. Lint Reader cũ F2–F8, W1–W5 giữ nguyên như trước (RR `lint.ts`: "historical gates remain byte-identical").

#### Scenario: So sánh nhất trong chữ ẩn
- **WHEN** trang có `<span hidden>Sản phẩm tốt nhất.</span>`
- **THEN** U13 đạt ở cổng, ở lint chữ nhìn thấy và ở bản đọc

#### Scenario: Cùng câu, không ẩn
- **WHEN** trang có `<p>Sản phẩm tốt nhất.</p>`
- **THEN** U13 trượt

#### Scenario: Tên nhà cung cấp trong chữ ẩn
- **WHEN** trang có `<p hidden>Metric</p>`
- **THEN** cổng `G08_PROVIDER_NAME` trượt

## MODIFIED Requirements

### Requirement: R-M16 Không có tổng giữa Shopee và TikTok Shop
Báo cáo Market SHALL NOT có tổng giữa Shopee và TikTok Shop. Bản nháp (U32) và bản đọc v1.2 (W3) SHALL chặn cùng một danh sách cụm. Bản đọc v1/v1.1 SHALL giữ mảng lint W3 cũ trong claims và vẫn chạy cổng U32.

- Loại kiểm: Máy
- Mã kiểm: Cổng `U32_NO_CROSS_PLATFORM_TOTAL` và lint Reader W3: `crossPlatformTotalMatches` (trong `src/modules/analysis/report-language/cross-platform-total.ts`)
- Vì sao: Chủ quyết định ngày 11/10/2026: không có tổng giữa các sàn (U-32). Bàn giao 24/10/2026: một danh sách, là hợp của hai danh sách cũ; tổng vẫn bị cấm.

#### Scenario: Hai sàn đứng cạnh nhau
- **WHEN** báo cáo nêu số của Shopee và số của TikTok Shop riêng từng sàn
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` đạt

#### Scenario: Có tổng hai sàn
- **WHEN** báo cáo nêu một tổng cộng Shopee và TikTok Shop
- **THEN** cổng `U32_NO_CROSS_PLATFORM_TOTAL` trượt

#### Scenario: Cùng cụm, cùng kết quả ở hai luồng
- **WHEN** bản nháp hoặc bản đọc viết "tổng cả hai sàn"
- **THEN** U32 ở bản nháp và W3 ở bản đọc cùng trượt

### Requirement: R-M26 Chế độ trình bày có chữ đề xuất trong M12
Ở chế độ trình bày (presentation), chữ đề xuất trong M12 SHALL có nhãn "đề xuất, chờ chủ duyệt".

- Loại kiểm: Máy
- Mã kiểm: Cổng `M12_PROPOSAL_LABEL`: `src/modules/analysis/research-automation/market-business-gate.ts` (chỉ chế độ presentation)
- Vì sao: Ngày 12/10/2026 chủ yêu cầu thử mọi báo cáo Market tự động với đủ quy tắc, kể cả quy tắc cổng. Chủ cho phép đề xuất ngày 05/10/2026 với nhãn "đề xuất, chờ chủ duyệt" (xem R-M09). Ngày 24/10/2026 (Q4): nhãn đầy đủ ở mọi nơi (R-L14).

#### Scenario: Có nhãn đầy đủ
- **WHEN** báo cáo ở chế độ trình bày và mục đề xuất trong M12 có "đề xuất, chờ chủ duyệt"
- **THEN** cổng `M12_PROPOSAL_LABEL` đạt

#### Scenario: Chỉ có chữ đề xuất
- **WHEN** báo cáo ở chế độ trình bày và một mục đề xuất trong M12 chỉ có chữ "đề xuất"
- **THEN** cổng `M12_PROPOSAL_LABEL` trượt

## ADDED Requirements

### Requirement: R-I29 Insight tuân đầy đủ quy tắc không nêu tên R-L01
Báo cáo Insight SHALL tuân R-L01 với cùng danh sách tên đầy đủ như Market. Bản đọc Insight cuối cùng SHALL qua lint F1 và W6. Chữ chép từ nguồn có tên bị cấm thì chỉ ẩn mục đó; chữ do hệ thống viết có tên bị cấm thì báo cáo dừng.

- Loại kiểm: Máy
- Mã kiểm: lint F1 và W6 trong `src/modules/analysis/reader-report/lint.ts`, gọi khi dựng bản đọc Insight trong `src/modules/analysis/research-automation/reports.ts` (lỗi `INSIGHT_READER_NAME_REFUSED`); danh sách ở `src/modules/analysis/report-language/hidden-names.ts`
- Vì sao: Chủ quyết định ngày 24/10/2026 (c4 Q1): Insight cấm đủ tên như Market. Trước đó Insight chỉ kiểm 4 tên dữ liệu.

#### Scenario: Câu do hệ thống viết nêu tên AI
- **WHEN** chữ do hệ thống viết trong bản đọc Insight nêu "Gemini"
- **THEN** quy tắc R-I29 bị vi phạm và báo cáo dừng

#### Scenario: Trích review có tên bị cấm
- **WHEN** một câu trích review nêu "Google"
- **THEN** câu trích đó bị ẩn, báo cáo Insight vẫn được dựng

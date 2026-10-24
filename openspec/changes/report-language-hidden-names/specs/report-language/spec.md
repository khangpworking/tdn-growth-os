## MODIFIED Requirements

### Requirement: R-L01 Không nêu tên nhà cung cấp, công cụ, mô hình AI hay Google
Báo cáo SHALL NOT nêu tên nhà cung cấp dữ liệu, công cụ, mô hình AI hay "Google". Tên sàn như Shopee và TikTok Shop thì được. Báo cáo SHALL dùng lời trung tính, ví dụ "dữ liệu bán hàng ước tính", "review công khai trên Shopee". File dấu vết kỹ thuật (.md riêng) được nêu tên công cụ.

Quy tắc áp dụng cho cả Market và Insight, với cùng một danh sách tên đầy đủ. Tên công cụ thu review công khai bị cấm ở mọi báo cáo. Chữ thường "metric" được phép; "Metric" và "METRIC" bị cấm. Tên trong chữ ẩn cũng tính là lộ tên: thuộc tính hidden, display:none, aria-hidden, alt/title/aria-label, `<title>`, chữ trong SVG. Địa chỉ liên kết (href) không tính. Chữ chép từ nguồn (trích review, tiêu đề web, đoạn PDF, chữ quảng cáo) có tên bị cấm thì chỉ ẩn mục đó. Chữ do hệ thống tự viết có tên bị cấm thì báo cáo dừng.

- Loại kiểm: Máy
- Mã kiểm: Danh sách và cách so khớp: `HIDDEN_NAMES`, `findHiddenNames` trong `src/modules/analysis/report-language/hidden-names.ts`. Market: cổng `G08_PROVIDER_NAME` (xem R-M15). Cả hai báo cáo: lint F1 và W6 trong `src/modules/analysis/reader-report/lint.ts`
- Vì sao: Chủ quyết định ngày 05/10/2026: báo cáo không nêu tên nhà cung cấp dữ liệu, tên sàn như Shopee thì được, chú thích đặt ở dòng riêng. Ngày 20/10/2026 chủ dùng "toàn dân" làm mốc so, không nêu tên nguồn dữ liệu mô phỏng (F22 đến F25). Ngày 24/10/2026 chủ chốt c4 Q1 đến Q5: Insight cấm đủ tên như Market; chữ thường "metric" được phép; chữ chép từ nguồn chỉ bị ẩn; tên công cụ review công khai luôn bị cấm; chữ ẩn cũng tính.

#### Scenario: Lời trung tính
- **WHEN** báo cáo nêu nguồn là "review công khai trên Shopee"
- **THEN** quy tắc R-L01 đạt

#### Scenario: Nêu tên công cụ trong thân báo cáo
- **WHEN** thân báo cáo nêu tên một công cụ thu dữ liệu
- **THEN** quy tắc R-L01 bị vi phạm, còn file dấu vết kỹ thuật .md riêng được nêu tên công cụ

#### Scenario: Chữ thường "metric"
- **WHEN** báo cáo viết "metric tons"
- **THEN** tên "Metric" không bị tính; chỉ "Metric" và "METRIC" bị cấm

#### Scenario: Tên trong chữ ẩn
- **WHEN** báo cáo có `<div hidden>OpenAI</div>` hoặc `alt="Kalodata"`
- **THEN** quy tắc R-L01 bị vi phạm

#### Scenario: Tên trong địa chỉ liên kết
- **WHEN** tên chỉ nằm trong `href` của một liên kết
- **THEN** quy tắc R-L01 đạt

#### Scenario: Chữ chép từ nguồn có tên bị cấm
- **WHEN** tiêu đề một kết quả tìm kiếm có chữ "Google"
- **THEN** tiêu đề đó bị ẩn, báo cáo vẫn được dựng

#### Scenario: Insight nêu tên AI
- **WHEN** chữ do hệ thống viết trong báo cáo Insight nêu "OpenAI"
- **THEN** quy tắc R-L01 bị vi phạm và báo cáo dừng

## MODIFIED Requirements

### Requirement: R-L01 Không nêu tên nhà cung cấp, công cụ, mô hình AI hay Google
Báo cáo SHALL NOT nêu tên nhà cung cấp dữ liệu, công cụ, mô hình AI hay "Google". Tên sàn như Shopee và TikTok Shop thì được. Báo cáo SHALL dùng lời trung tính, ví dụ "dữ liệu bán hàng ước tính", "review công khai trên Shopee". File dấu vết kỹ thuật riêng (dạng HTML hoặc `.md`) được nêu tên công cụ.

- Loại kiểm: Máy
- Mã kiểm: Cổng `G08_PROVIDER_NAME` (xem R-M15)
- Vì sao: Chủ quyết định ngày 05/10/2026: báo cáo không nêu tên nhà cung cấp dữ liệu, tên sàn như Shopee thì được, chú thích đặt ở dòng riêng. Ngày 20/10/2026 chủ dùng "toàn dân" làm mốc so, không nêu tên nguồn dữ liệu mô phỏng (F22 đến F25). Ngày 24/10/2026 chủ chấp nhận file dấu vết dạng HTML.

#### Scenario: Lời trung tính
- **WHEN** báo cáo nêu nguồn là "review công khai trên Shopee"
- **THEN** quy tắc R-L01 đạt

#### Scenario: Nêu tên công cụ trong thân báo cáo
- **WHEN** thân báo cáo nêu tên một công cụ thu dữ liệu
- **THEN** quy tắc R-L01 bị vi phạm, còn file dấu vết kỹ thuật riêng được nêu tên công cụ

## MODIFIED Requirements

### Requirement: R-M03 Thân báo cáo không có chữ kỹ thuật
Thân báo cáo Market SHALL NOT chứa chữ kỹ thuật. Khi báo cáo có dấu vết kỹ thuật, dấu vết SHALL nằm ở file riêng, dạng HTML hoặc `.md`, không nằm trong thân báo cáo.

- Loại kiểm: Máy
- Mã kiểm: `src/modules/analysis/research-automation/market-14-rules.ts`: `technicalLeaks`
- Vì sao: Một trong 14 quy tắc sửa tay của chủ trên báo cáo thạch dừa (05/10/2026); từ 12/10/2026 mọi báo cáo Market tự động phải được thử với đủ 14 quy tắc (xem R-M01). Ngày 24/10/2026 chủ chấp nhận file dấu vết dạng HTML, như mã đang giữ (`traceHtml`, xem R-P06).

#### Scenario: Dấu vết kỹ thuật ở file riêng
- **WHEN** báo cáo cần ghi dấu vết kỹ thuật
- **THEN** dấu vết nằm ở file riêng, dạng HTML hoặc `.md`, không nằm trong thân báo cáo

#### Scenario: Chữ kỹ thuật trong thân
- **WHEN** thân báo cáo chứa chữ kỹ thuật
- **THEN** quy tắc R-M03 trượt

### Requirement: R-M10 Trang bìa có ảnh JPEG do AI tạo
Trang bìa báo cáo Market SHOULD có ảnh JPEG do AI tạo. Khi có ảnh bìa, ảnh SHALL nhúng dạng base64; ảnh trỏ ra ngoài hoặc sai dạng làm lần dựng lỗi. Ảnh tự nhận do AI tạo SHALL là JPEG có giới hạn dung lượng và có chữ thay thế (alt); nếu không, lần dựng lỗi. Khi không có lỗi ảnh ngoài hay sai dạng, thiếu ảnh bìa hoặc bìa nhúng không tự nhận do AI tạo SHALL NOT chặn báo cáo; kết quả kiểm chỉ để lại ghi chú cho người đọc soát. Báo cáo SHALL NOT đòi bằng chứng giấy phép ảnh (chủ bỏ 13/10).

- Loại kiểm: Máy (ảnh trỏ ra ngoài, sai dạng, ảnh tự nhận do AI tạo thiếu alt); Người đọc soát (thiếu ảnh bìa, bìa không tự nhận do AI tạo)
- Mã kiểm: `src/modules/analysis/research-automation/market-14-rules.ts`: `isAiCoverJpeg`, `coverBlock`
- Vì sao: Chủ yêu cầu ảnh bìa ngày 06/10/2026, sau khi lần chạy bình giữ nhiệt bỏ qua trang bìa. Ngày 13/10/2026 chủ quyết định không cần bằng chứng giấy phép ảnh bìa. Cũng là một trong 14 quy tắc sửa tay (05/10/2026). Ngày 24/10/2026 chủ nới quy tắc: thiếu ảnh bìa không chặn báo cáo, như mã đang làm.

#### Scenario: Bìa đủ điều kiện
- **WHEN** trang bìa có ảnh JPEG do AI tạo, nhúng base64 trong giới hạn dung lượng, có chữ alt
- **THEN** quy tắc R-M10 đạt, dù không có bằng chứng giấy phép ảnh

#### Scenario: Bìa thiếu chữ alt
- **WHEN** ảnh bìa tự nhận do AI tạo không có chữ thay thế (alt)
- **THEN** quy tắc R-M10 trượt và lần dựng lỗi

#### Scenario: Ảnh bìa trỏ ra ngoài
- **WHEN** ảnh bìa là link tới ảnh bên ngoài, không nhúng trong file
- **THEN** quy tắc R-M10 trượt và lần dựng lỗi

#### Scenario: Thiếu ảnh bìa
- **WHEN** báo cáo Market không có ảnh bìa
- **THEN** báo cáo vẫn được dựng, và kết quả kiểm R-M10 ghi chú cho người đọc soát

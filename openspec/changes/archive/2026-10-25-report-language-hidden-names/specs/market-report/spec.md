## MODIFIED Requirements

### Requirement: R-M15 Cổng không nêu tên nhà cung cấp, công cụ, mô hình AI hay Google
Cổng Market SHALL kiểm rằng báo cáo không nêu tên nhà cung cấp, công cụ, mô hình AI hay "Google". Tên sàn như Shopee thì được. Cổng SHALL đọc cả chữ ẩn (hidden, display:none, aria-hidden, alt/title/aria-label của phần tử ẩn), theo R-L01.

- Loại kiểm: Máy
- Mã kiểm: Cổng `G08_PROVIDER_NAME`: `providerMatches` trong `src/modules/analysis/research-automation/market-business-gate.ts`. Danh sách tên nằm ở `HIDDEN_NAMES` trong `src/modules/analysis/report-language/hidden-names.ts` (R-L01)
- Vì sao: Chủ quyết định ngày 05/10/2026: báo cáo không nêu tên nhà cung cấp dữ liệu; tên sàn như Shopee thì được. Ngày 12/10/2026 chủ yêu cầu thử với đủ 14 quy tắc sửa tay, không chỉ 9 quy tắc của cổng. Ngày 24/10/2026 chủ chốt chữ ẩn cũng tính (c4 Q5).

#### Scenario: Chỉ nêu tên sàn
- **WHEN** chữ nhìn thấy trong báo cáo chỉ nêu "Shopee"
- **THEN** cổng `G08_PROVIDER_NAME` đạt

#### Scenario: Nêu tên công cụ
- **WHEN** chữ nhìn thấy trong báo cáo nêu tên một công cụ trong danh sách cấm
- **THEN** cổng `G08_PROVIDER_NAME` trượt

#### Scenario: Tên trong chữ ẩn
- **WHEN** báo cáo có `<div hidden>OpenAI</div>`
- **THEN** cổng `G08_PROVIDER_NAME` trượt

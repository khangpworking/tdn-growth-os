## MODIFIED Requirements

### Requirement: R-M01 Bảng thuật ngữ tiếng Việt đơn giản
Báo cáo Market SHALL giải thích mọi thuật ngữ khó bằng tiếng Việt đơn giản, trong một bảng thuật ngữ. Danh sách thuật ngữ và cách nhận ra một thuật ngữ SHALL nằm ở một chỗ, dùng chung cho bộ kiểm quy tắc 1 và bảng thuật ngữ của bản đọc: thuật ngữ được nhận ra theo cả từ, không phân biệt hoa thường, khoảng trắng bên trong có thể thiếu.

- Loại kiểm: Máy
- Mã kiểm: `src/modules/analysis/report-language/glossary.ts`: `MARKET_GLOSSARY`, `glossaryTermPattern`; `src/modules/analysis/research-automation/market-14-rules.ts`: `GLOSSARY`, `glossaryHtml`; `src/modules/analysis/research-automation/market-reader-glossary.ts`: `filterReaderGlossary`
- Vì sao: Một trong 14 quy tắc sửa tay của chủ trên báo cáo thạch dừa (05/10/2026). Ngày 12/10/2026 chủ yêu cầu mọi báo cáo Market tự động được thử với đủ 14 quy tắc sửa tay, không chỉ 9 quy tắc của cổng. Ngày 15/10/2026 chủ yêu cầu 14/14 đến từ luồng tự động và đều qua các lần sinh lại. Ngày 19/10/2026 chủ yêu cầu sửa lỗi tự động áp dụng cho cả hệ thống, không chỉnh riêng cho một lần chạy. Ngày 24/10/2026 chủ duyệt dùng một danh sách và một cách nhận thuật ngữ (rà kiến trúc c4, lỗi D7), để bộ kiểm và bảng thuật ngữ không quyết định khác nhau.

#### Scenario: Thuật ngữ khó có giải thích
- **WHEN** báo cáo dùng một thuật ngữ khó
- **THEN** bảng thuật ngữ giải thích thuật ngữ đó bằng tiếng Việt đơn giản

#### Scenario: Thuật ngữ khó không có giải thích
- **WHEN** báo cáo dùng một thuật ngữ khó mà bảng thuật ngữ không giải thích
- **THEN** quy tắc R-M01 trượt

#### Scenario: Viết liền vẫn là thuật ngữ
- **WHEN** báo cáo viết "peerset"
- **THEN** bộ kiểm quy tắc 1 đòi giải thích "peer set", và bảng thuật ngữ của bản đọc giữ dòng "peer set"

#### Scenario: Thuật ngữ dính số không tính
- **WHEN** báo cáo viết "P250" và không viết "P25"
- **THEN** bộ kiểm quy tắc 1 không đòi giải thích "P25", và bảng thuật ngữ của bản đọc bỏ dòng "P25"

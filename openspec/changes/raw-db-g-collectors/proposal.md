> Trạng thái: **đề xuất, chờ chủ duyệt**. Mã đã viết trên nhánh `wp/raw-db-g-collectors`. Kiểm thử do lane Sol viết song song. Khai báo S19b và S29 là bản chủ duyệt ngày 03/11/2026 (F332).

## Why

db-v1 (`data/raw-sources/KHUON-CSDL.md` §4.4, §4.5) có bảng `search_suggestion` và `ai_overview_*`, nhưng app chưa thu hai nguồn này. Gợi ý tìm kiếm (S19b) cho biết người mua gõ gì quanh từ khóa. Tóm tắt AI của trang kết quả tìm kiếm (S29) đôi khi chỉ trả một mã trang hết hạn sau vài phút, nên phải gọi tiếp ngay trong lượt chạy, không gọi lại sau được.

Change này chỉ thu và lưu byte gốc. Bảng và bộ nạp nằm ở change khác (nhánh `wp/raw-db-g-tables`). Báo cáo chưa đọc hai nguồn này.

## What Changes

- **ADDED** capability `search-collectors`, yêu cầu R-G01 đến R-G06.
- Làn S19b `src/modules/analysis/research-automation/search-suggest-lane.ts`, cờ `TDN_RESEARCH_SEARCH_SUGGEST_ENABLED` (đúng `1`). Chỉ chạy khi lượt chạy có Insight. Miễn phí, không cần khoá; tối đa 24 lần gọi mỗi từ khóa, 48 mỗi lượt.
- Làn S29 `src/modules/analysis/research-automation/ai-overview-lane.ts`, cờ `TDN_RESEARCH_AI_OVERVIEW_ENABLED` (đúng `1`). Chạy ngay sau các lượt tìm S19, dùng khoá, ngân sách và sổ dùng của SerpApi sẵn có; tối đa 2 lần gọi trả phí mỗi lượt.
- Hai làn lưu byte trả về nguyên vẹn (`application/json`) vào `analysis_research_automation_captures`; `service.ts` đọc được loại lần thu này bên cạnh phong bì lần thu cũ.
- Ghi hai cờ vào chú thích `src/api/operator-app.ts` và tài liệu cờ.

## Impact

- Không có migration, không đổi bảng, không đổi báo cáo. Hai cờ mặc định tắt: tắt thì app chạy y như trước.
- Bật S29 tốn tối đa 2 lượt tìm SerpApi mỗi lượt chạy. S19b không tốn tiền nhưng thêm khoảng 1 phút vào lượt Insight.

## Ngoài phạm vi

- Bảng `search_suggestion`, `ai_overview_block`, `ai_overview_reference` và bộ nạp (change bảng của RAWDB-G).
- Đọc hai nguồn này trong báo cáo Market hay Insight.

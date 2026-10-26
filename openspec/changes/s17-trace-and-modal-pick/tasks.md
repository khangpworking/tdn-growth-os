## 0. Trước khi làm

- [x] 0.1 Phiếu CD ngày 26/10/2026 (nhánh `wp/cd-trace-pick-2610`): sửa S17 và PICK; hai ghi chú chẩn đoán `DIAG-C.md`, `DIAG-D.md` đọc trước khi viết mã
- [ ] 0.2 Chủ duyệt đề xuất này trước khi gộp
- [ ] 0.3 Archive change `market-number-trace-gate` trước để R-P07 nhận phần dò số; change này archive sau

## 1. Mã (một người viết mã)

- [x] 1.1 S17: truy số mẫu, số Chữ/Hình/Video, số ngày (công thức `as-stored`) và ngày (công thức `vi-date`) về `/searchAds/brands/<i>/…` của bản ghi COLLECTION
- [x] 1.2 S17: truy mọi số trong tên thương hiệu và miền như văn bản đã lưu; không thêm mục vào danh sách miễn trừ
- [x] 1.3 S17: bỏ nhãn «Bảng 7.3» viết cứng; nhánh trình bày đếm qua `numberMarketExhibits`, nhánh cũ qua `numberSearchAdsExhibit`, cùng công thức `exhibit-number`
- [x] 1.4 PICK: đọc lá danh mục `final_categories` (thiếu thì `categories`), ưu tiên lá phổ biến nhất, lấp lá khác khi thiếu chỗ, hạ bậc chứ không loại
- [x] 1.5 PICK: bản ghi `autorun-pick-record-v3` thêm `demotedRows`, `aiExcludedRows` (tùy chọn; bản ghi cũ vẫn đọc)
- [x] 1.6 Hàm `pickShopeeLinks` nhận và áp dụng bản ghi relevance đã lưu, khớp tiêu đề đã cắt và gộp khoảng trắng
- [ ] 1.7 D2: truyền bản ghi relevance vào `#autorunPick` (phân loại một lần ở PREPARE, giữ bản ghi, dùng lại ở phương pháp Market) — hoãn, cần đổi máy trạng thái, xem FIX-RESULT

## 2. Kiểm thử (phiên khác người viết mã)

- [ ] 2.1 Ca S17 trình bày: 0 số không truy được, nhãn bảng theo vị trí thật
- [ ] 2.2 Ca S17 nhánh cũ: nhãn theo vị trí thật, byte khác giữ nguyên
- [ ] 2.3 Ca S17 đối chứng âm: đổi một số trong bảng mà không đổi bản ghi COLLECTION thì cổng chặn (`N01_UNTRACED_NUMBER` hoặc `N02_TRACE_REPLAY`)
- [ ] 2.4 Ca lá danh mục: 11 dòng một lá + 1 dòng lá khác, 5 link lấy trong lá phổ biến; dòng lá khác có trong `demotedRows`
- [ ] 2.5 Ca thiếu dòng trong lá phổ biến: lấp bằng lá khác, vẫn một gian hàng mỗi link
- [ ] 2.6 Ca mọi dòng không có danh mục: kết quả như trước, không có `demotedRows`
- [ ] 2.7 Ca bản ghi pick cũ không có hai trường mới vẫn đọc được
- [ ] 2.8 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-P03 và R-P07 mới vào `openspec/specs/report-pipeline/spec.md`

## 0. Trước khi làm

- [x] 0.1 Phiếu CD ngày 26/10/2026 (nhánh `wp/cd-trace-pick-2610`): sửa S17 và PICK; hai ghi chú chẩn đoán `DIAG-C.md`, `DIAG-D.md` đọc trước khi viết mã
- [x] 0.2 Chủ duyệt đề xuất này trước khi gộp (PR #417 merge ngày 27/10/2026 → `f589cc6f`)
- [ ] 0.3 Archive change `market-number-trace-gate` trước để R-P07 nhận phần dò số; change này archive sau

## 1. Mã (một người viết mã)

- [x] 1.1 S17: truy số mẫu, số Chữ/Hình/Video, số ngày (công thức `as-stored`), ngày riêng (`vi-date`) và khoảng ngày (`vi-date-range`) về `/searchAds/brands/<i>/…` của bản ghi COLLECTION
- [x] 1.2 S17: truy mọi số trong tên thương hiệu và miền như văn bản đã lưu; không thêm mục vào danh sách miễn trừ
- [x] 1.3 S17: bỏ nhãn «Bảng 7.3» viết cứng; nhánh trình bày đếm qua `numberMarketExhibits`, nhánh cũ qua `numberSearchAdsExhibit`, cùng công thức `exhibit-number`
- [x] 1.4 PICK: đọc lá danh mục `final_categories` (thiếu thì `categories`), ưu tiên lá phổ biến nhất, lấp lá khác khi thiếu chỗ, hạ bậc chứ không loại
- [x] 1.5 PICK: bản ghi `autorun-pick-record-v3` thêm `demotedRows`, `aiExcludedRows` (tùy chọn; bản ghi cũ vẫn đọc)
- [x] 1.6 Hàm `pickShopeeLinks` nhận và áp dụng bản ghi relevance đã lưu, khớp tiêu đề đã cắt và gộp khoảng trắng
- [ ] 1.7 D2: truyền bản ghi relevance vào `#autorunPick` (phân loại một lần ở PREPARE, giữ bản ghi, dùng lại ở phương pháp Market) — hoãn, cần đổi máy trạng thái, xem FIX-RESULT
- [x] 1.8 S17: câu diễn giải truy số đếm bằng `count` trên đúng nhóm dòng; giá trị và nhãn lặp lại truy đúng ô COLLECTION, không ghép nguồn chỉ vì trùng số; giữ token `0` còn in trong nhãn nguồn, vẫn kiểm N02

## 2. Kiểm thử (phiên khác người viết mã)

- [x] 2.1 Ca S17 trình bày: 0 số không truy được, nhãn bảng theo vị trí thật (`tests/unit/p5b-trace-live-contract.test.ts` «S17 traces counts, dates and digit-bearing labels with marketPresentation», «S17 table label follows its real position with marketPresentation»)
- [x] 2.2 Ca S17 nhánh cũ: nhãn theo vị trí thật, byte khác giữ nguyên (cùng hai ca «… without marketPresentation»; `tests/integration/research-automation-google-ads-lane.test.ts` «current reader template labels the S17 table by its real position and shows the M13 source with clean empty values»)
- [x] 2.3 Ca S17 đối chứng âm: đổi một số trong bảng mà không đổi bản ghi COLLECTION thì cổng chặn (`N01_UNTRACED_NUMBER` hoặc `N02_TRACE_REPLAY`) (`tests/unit/p5b-trace-live-contract.test.ts` «S17 undated counts and digit-bearing labels replay COLLECTION; a changed stored creative count blocks with N02»)
- [x] 2.4 Ca lá danh mục: 11 dòng một lá + 1 dòng lá khác, 5 link lấy trong lá phổ biến; dòng lá khác có trong `demotedRows` (`tests/unit/autorun-derive.test.ts` «modal leaf keeps a high-revenue other-leaf row out while five modal rows fit, including a same-product combo»; ca dùng 5 dòng một lá + 1 dòng lá khác)
- [x] 2.5 Ca thiếu dòng trong lá phổ biến: lấp bằng lá khác, vẫn một gian hàng mỗi link (`tests/unit/autorun-derive.test.ts` «modal leaf fills first, then other leaves fill the missing places»)
- [x] 2.6 Ca mọi dòng không có danh mục: kết quả như trước, không có `demotedRows` (`tests/unit/autorun-derive.test.ts` «rows with no category retain the legacy brand-spread and revenue order exactly»)
- [x] 2.7 Ca bản ghi pick cũ không có hai trường mới vẫn đọc được (`tests/unit/autorun-service.test.ts` «a retained v3 pick without demotedRows or aiExcludedRows still loads at CONFIRM after restart»)
- [x] 2.8 CI Linux xanh tại SHA cuối (PR #417)

## 3. Sau khi gộp

- [ ] 3.1 Archive change này để R-P03 và R-P07 mới vào `openspec/specs/report-pipeline/spec.md`

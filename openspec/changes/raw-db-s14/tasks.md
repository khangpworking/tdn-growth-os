## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §2.1, §4.1, §4.1a, §5), tệp kẽm 04 (S14: 3 gói đọc video, 3 lần gọi `videowatch.generate`), `video-watch-lane.ts`, `video-watch-gemini.ts`, bộ nạp S02b và S07
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 `videoWatchCandidates`: bỏ video tìm kiếm, trần video bán chạy 5 → 10, tổng 10, không lấy video tìm kiếm thay
- [x] 1.2 Migration `0067_raw_db_v1_video_reading.sql`: bảng `video_reading`, `video_segment` STRICT, trigger cấm sửa và xoá
- [x] 1.3 `src/modules/raw-db/video-reading-loader.ts`: đầu vào lượt chạy hoặc tệp, ghép lần đọc với lần gọi theo `responseSha256`, một giao dịch, nạp lại không nhân đôi
- [x] 1.4 Lệnh `scripts/raw-db-load.ts --source S14 [--file] [--privacy-file] [--dry-run]`
- [x] 1.5 Cập nhật db-v1 §4.1, §4.1a, §5 và thứ tự nạp S02b trước S14
- [x] 1.6 Cập nhật các kiểm thử ghim số migration (66 → 67), số bảng (118 → 120), thứ tự ứng viên có video tìm kiếm và trần 5

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-VR01 đến R-VR07 trên dữ liệu tổng hợp (mã video, handle, chữ, khoá tổng hợp); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-VR01 đến R-VR07
- [ ] 3.2 `/opsx:archive` change `raw-db-s14`

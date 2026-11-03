## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §2.1, §4.1a, §5), tệp kẽm 02 (bản ghi `kalodata.video.rank` bị 501), `provider-kalodata.ts`, `top-selling-videos.ts`, bộ nạp S07 và Google
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Sửa thân yêu cầu `kalodata.video.rank` (đủ `region`, `language`, `currency`, `date_range`; `sort_field`) và ghi `queryWindow`; kỳ lấy từ lần xếp hạng sản phẩm của lần chạy
- [x] 1.2 Migration `0066_raw_db_v1_video_snapshot.sql`: bảng `video_snapshot` STRICT, trigger cấm sửa và xoá
- [x] 1.3 `src/modules/raw-db/kalodata-video-loader.ts`: đầu vào lượt chạy hoặc tệp, một giao dịch, nạp lại không nhân đôi
- [x] 1.4 Lệnh `scripts/raw-db-load.ts --source S02b [--file] [--privacy-file] [--dry-run]`
- [x] 1.5 Cập nhật db-v1 §1, §4.1a, §4.1b, §5
- [x] 1.6 Cập nhật các kiểm thử ghim số migration (65 → 66), số bảng (117 → 118) và thân yêu cầu video.rank cũ

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-KV01 đến R-KV07 trên dữ liệu tổng hợp (mã video, handle, mã sản phẩm, khoá tổng hợp); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-KV01 đến R-KV07
- [ ] 3.2 `/opsx:archive` change `raw-db-s02b`

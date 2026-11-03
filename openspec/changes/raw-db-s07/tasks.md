## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §3, §4.1a, §5), tệp kẽm 17, bộ thu `apify-tiktok-comments.ts` và đường đọc P9 bình luận
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0065_raw_db_v1_video.sql`: bảng `video` STRICT, trigger cấm sửa và xoá
- [x] 1.2 Tách `tikTokPrivacyKey` và `tikTokCommentExclusionReason` khỏi bộ thu; bộ thu giữ nguyên đầu ra
- [x] 1.3 `src/modules/raw-db/tiktok-comments-loader.ts`: đầu vào lượt chạy hoặc tệp, một giao dịch, nạp lại không nhân đôi
- [x] 1.4 Lệnh `scripts/raw-db-load.ts --source S07 [--file] [--privacy-file] [--dry-run]`
- [x] 1.5 Cập nhật db-v1 §3, §4.1a
- [x] 1.6 Cập nhật các kiểm thử ghim số migration (64 → 65) và số bảng (116 → 117)

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-TC01 đến R-TC06 trên dữ liệu tổng hợp (uid, handle, khoá tổng hợp); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-TC01 đến R-TC06
- [ ] 3.2 `/opsx:archive` change `raw-db-s07`

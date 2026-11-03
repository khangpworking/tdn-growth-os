## 0. Trước khi làm

- [x] 0.1 Đọc bộ nạp S05, S07, S02b, S14, S19b, S29, bộ gán, khoá, bản chụp, `scripts/raw-db-load.ts` và chỗ bước thu của lần chạy xong
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0070_raw_db_autoload.sql`: bảng `raw_db_autoload`, STRICT, chỉ thêm
- [x] 1.2 `tiktok-shop-reviews-loader.ts` và `--source S06`
- [x] 1.3 `review-labeller.ts`: đánh giá TikTok Shop đủ điều kiện
- [x] 1.4 `autoload.ts`, `--source AUTOLOAD`, móc `onCollectionFinal` của service, nối trong `operator-app.ts`, bản chụp mỗi 10 phút
- [x] 1.5 Cập nhật db-v1 §3, §3.3, §5.0, §5, TL;DR
- [x] 1.6 Cập nhật kiểm thử ghim số migration (69 → 70) và số bảng (122 → 123)

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-RA01 đến R-RA10 với fetch giả (không gọi mạng), dữ liệu tổng hợp (lời tiếng Việt, emoji); mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-RA01 đến R-RA10
- [ ] 3.2 `/opsx:archive` change `raw-db-autoload`

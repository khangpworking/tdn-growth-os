## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §2.1, §2.2, §3, §3.2, §5) và ánh xạ S05 chủ duyệt ngày 03/11/2026
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0063_raw_db_v1_reviews.sql`: 4 bảng STRICT, view `writer_count`, trigger cấm sửa và xoá
- [x] 1.2 `src/modules/raw-db/shopee-reviews-loader.ts`: đọc qua `readPublicExact`, một giao dịch, lỗi `RAW_DB_RUN_NOT_FOUND`, `RAW_DB_PRODUCT_NAME_MISSING`
- [x] 1.3 Tên sản phẩm: dòng đã chọn của lượt thu; không có thì dòng Metric của lượt chạy (gói nguồn đã kiểm → `capture/context.json` → tệp raw-responses); vẫn không có thì báo lỗi
- [x] 1.4 Lệnh `scripts/raw-db-load.ts` với `--dry-run`
- [x] 1.5 Cập nhật các kiểm thử ghim số migration mới nhất (62 → 63)

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-DB01 đến R-DB06 trên dữ liệu tổng hợp; mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-DB01 đến R-DB06
- [ ] 3.2 `/opsx:archive` change `raw-db-v1-shopee-reviews`

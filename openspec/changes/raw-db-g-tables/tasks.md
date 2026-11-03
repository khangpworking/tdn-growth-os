## 0. Trước khi làm

- [x] 0.1 Đọc db-v1 (`data/raw-sources/KHUON-CSDL.md` §2.1, §4.4, §4.5, §5), tệp kẽm 07, 12, 13 và khai báo S19b, S29 chủ duyệt ngày 03/11/2026
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0064_raw_db_v1_google.sql`: 3 bảng STRICT, CHECK `block_type`, cột `snippet`, trigger cấm sửa và xoá
- [x] 1.2 Cập nhật db-v1 §4.4, §4.5, §5
- [x] 1.3 `src/modules/raw-db/google-search-loader.ts`: đầu vào lượt chạy hoặc tệp, một giao dịch, nạp lại không nhân đôi
- [x] 1.4 Lệnh `scripts/raw-db-load.ts --source S19b|S29 [--file]` với `--dry-run`
- [x] 1.5 Cập nhật các kiểm thử ghim số migration (63 → 64) và số bảng (113 → 116)

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-GL01 đến R-GL06 trên dữ liệu tổng hợp; mỗi ca có ca đối chứng âm
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-GL01 đến R-GL06
- [ ] 3.2 `/opsx:archive` change `raw-db-g-tables`

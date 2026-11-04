## 0. Trước khi làm

- [x] 0.1 Thử lượt Jev riêng trên 445 dòng sẵn có (F430)
- [x] 0.2 Chủ duyệt làm bản chạy song song

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0072_raw_db_v1_review_filter.sql`
- [x] 1.2 `src/modules/raw-db/review-filter.ts`
- [x] 1.3 `autoload.ts`, `operator-app.ts`: chạy lượt lọc theo cờ
- [x] 1.4 `scripts/raw-db-load.ts`: `--source FILTER`
- [x] 1.5 Cập nhật db-v1 trong `data/raw-sources/KHUON-CSDL.md` và trang nguồn vào cơ sở dữ liệu
- [x] 1.6 Cập nhật kiểm thử ghim số migration và số bảng

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [x] 2.1 Kiểm thử theo R-RF01 đến R-RF10 với Jev giả; có ca đối chứng âm
- [x] 2.2 CI Linux xanh tại SHA cuối; Sol 6.1 xhigh rà soát độc lập
- [x] 2.3 Merge khi Sol PASS và CI xanh

## 3. Sau khi merge (cần chủ duyệt riêng)

- [ ] 3.1 Chủ nói «deploy <SHA>»
- [ ] 3.2 Chủ duyệt bật cờ và lượt lọc dữ liệu đã có
- [ ] 3.3 Đo ngưỡng 0,70 trên dòng mới, báo chủ
- [ ] 3.4 Ghi mã kiểm thật vào «Mã kiểm»

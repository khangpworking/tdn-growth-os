## 0. Trước khi làm

- [x] 0.1 Đọc bản soát Astra (phần ánh xạ trường), các bộ nạp S05, S07, S19b, S29, S02b, S14, migration 0063–0069, `validate_raw.py`
- [x] 0.2 Áp dụng quyết định ràng buộc của điều phối viên cho PR #447 (APP_CAPTURE, S06, dòng S02b tệp kẽm)

## 1. Mã (một người viết mã)

- [x] 1.1 Migration `0071_raw_db_v1_field_fixes.sql`: trigger `review_state_check`, bảng `product_name_source`, cột `response_sha256_basis` và điền dòng cũ, trigger `raw_capture_basis_required`
- [x] 1.2 Bộ nạp S05: `state` luôn `VALID`, `ratingInvalid`, `product_name_source` `METRIC_LIST`
- [x] 1.3 Bộ nạp S02b: `product_name_source` `RAW_CAPTURE` / `APP_CAPTURE`, S06 `APP_CAPTURE`; `RAW_DB_PRODUCT_NAME_MISMATCH`
- [x] 1.4 Mọi bộ nạp ghi `response_sha256_basis`
- [x] 1.5 `src/modules/raw-db/attributes-shape.ts` và lời gọi ở bộ nạp S05, S06, S07
- [x] 1.6 `validate_raw.py` nhận S02b
- [x] 1.7 Cập nhật KHUON-CSDL TL;DR, §2.1, §2.2a, §3, §5; kiểm thử ghim số migration (→ 71) và ghim kết quả nạp

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [x] 2.1 Kiểm thử theo R-RF01 đến R-RF08: 5 ca contract xanh; kiểm migration với bộ kẽm qua bộ nạp cũ, bản 0071 trước sửa dừng đúng lỗi và bản đã sửa chạy được
- [ ] 2.2 Hợp nhất sau PR 3 (0070); CI Linux xanh tại SHA cuối; rà soát độc lập

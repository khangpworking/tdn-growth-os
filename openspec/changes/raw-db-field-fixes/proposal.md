> Trạng thái: **đang rà soát triển khai theo quyết định ràng buộc của điều phối viên cho PR #447**. Mã viết trên nhánh `wp/raw-db-field-fixes`. Kiểm thử do lane Sol viết trên nhánh `wp/raw-db-field-fixes-tests`. Chủ quyết ngày 03/11/2026 (F381, F382, F385) sau bản soát Astra: sửa mục 1, 3, 4, 5 của phần ánh xạ trường, và cho bộ kiểm tệp gốc nhận S02b.

## Why

Bản soát Astra chỉ ra bốn chỗ trường của db-v1 nói sai hoặc nói thiếu: S05 ghi lỗi sao vào `review.state`; tên sản phẩm không trỏ về bản ghi đã cho tên; `response_sha256` băm những thứ khác nhau tuỳ bộ nạp mà không ghi là thứ gì; `attributes_json` có dạng khác nhau giữa các nguồn mà không có chỗ kiểm. Bộ kiểm tệp gốc `validate_raw.py` chưa nhận mã nguồn S02b.

## What Changes

- **ADDED** vào capability `raw-db`: R-RF01 đến R-RF08.
- Migration `0071_raw_db_v1_field_fixes.sql`: trigger `review_state_check` (chỉ `VALID`, `HIDDEN`, `DELETED`); bảng mới `product_name_source` (STRICT, cấm sửa, cấm xoá); cột `raw_capture.response_sha256_basis` có CHECK, điền dòng cũ theo bộ nạp, trigger `raw_capture_basis_required`. Migration dừng (CHECK `raw_db_0071_*`) khi dòng cũ không đáp ứng được.
- Bộ nạp S05: sao thiếu hoặc sai → `rating_star` `NULL`, `state` `VALID`, đếm ở `ratingInvalid`; ghi `product_name_source` `METRIC_LIST`; kết quả có thêm `productNameSources`, `ratingInvalid`.
- Bộ nạp S02b: ghi `RAW_CAPTURE` khi tên từ bản ghi tệp, `APP_CAPTURE` khi từ lượt thu app. S06 ghi `APP_CAPTURE`. Cả hai hỗ trợ nạp lại để điền nguồn tên; kết quả có `productNameSources`. Không tạo `raw_capture` cho lần thu tên.
- Mọi bộ nạp ghi `response_sha256_basis` theo bảng của KHUON §2.1.
- Module mới `src/modules/raw-db/attributes-shape.ts`: dạng `attributes_json` của S05, S06, S07; S05, S06 và S07 kiểm trước khi ghi (`RAW_DB_ATTRIBUTES_SHAPE`).
- `data/raw-sources/tools/validate_raw.py`: `SOURCE_CODE` nhận `S02b`.
- Cập nhật KHUON-CSDL: TL;DR, §2.1, §2.2a mới, §3, §5.

## Impact

- Cơ sở dữ liệu: thêm 1 bảng, 1 cột, 4 trigger. Kiểm thử ghim số migration đổi sang 71 (PR 3 `wp/raw-db-autoload` giữ 0070; PR này hợp nhất sau PR 3).
- Dữ liệu cũ của `product_name_source` được điền bằng cách nạp lại cùng lần chạy sau khi triển khai (việc của người điều phối), không bằng migration.
- Bộ nạp mới (ví dụ S06 của lane A) phải ghi `response_sha256_basis` khi có dấu, nếu không thì bị trigger chặn.

## Quyết định điều phối viên cho PR #447

- `APP_CAPTURE` có `artifact_sha256` và `json_path` bắt buộc, `capture_id` `NULL`, dành cho tên từ tệp thu app không phải dòng `raw_capture` (S02b từ lượt chạy và S06).
- Dòng S02b từ tệp kẽm đã nạp trước 0071 nhận `SUPPLIED_FILE`: tệp không khai báo canonical-json và bộ nạp giữ dấu từ tệp. Không dừng migration trên các dòng này.
- S06 ghi `ORIGINAL_BYTES` và kiểm `assertAttributesShape('S06', null, …)`.

## Ngoài phạm vi

- Mục 2 của phần ánh xạ trường trong bản soát Astra; phiên bản hoá thuộc tính sản phẩm.
- Đổi lời báo cáo, cờ, nhãn nguồn; triển khai; nạp lại dữ liệu thật.

# Bộ dữ liệu gốc theo nguồn

Thư mục này giữ các bộ dữ liệu gốc dùng để thử báo cáo, mỗi bộ một thư mục con. Quy tắc nghiệp vụ nằm ở quy chuẩn dữ liệu đầu vào, bản 1.48, Phần 6.1 và 6.2.

## TL;DR

- Khuôn tệp gốc `raw-v1`: một nguồn một tệp JSON, gồm `declare` (khai báo) và `records` (bản ghi gốc, giữ nguyên của nhà cung cấp).
- Khuôn cơ sở dữ liệu `db-v1`: mỗi bản ghi gốc vào bảng nào, cột nào. Xem [`KHUON-CSDL.md`](KHUON-CSDL.md).
- Kiểm một bộ dữ liệu, từ gốc repo: `python3 data/raw-sources/tools/validate_raw.py data/raw-sources/<bộ>`. Kết quả mong đợi: `failed 0`.
- Thử khuôn cơ sở dữ liệu trên bộ kẽm: `python3 data/raw-sources/tools/test_schema.py data/raw-sources/KHUON-CSDL.md data/raw-sources/kem-2910`.
- Thử chính bộ kiểm: `python3 data/raw-sources/tools/test_validate_raw.py`.

## Các bộ dữ liệu

| Thư mục | Khuôn | Nội dung |
|---|---|---|
| [`kem-2910/`](kem-2910/README.md) | `kem-raw-v1` (bản đầu của `raw-v1`) | Viên uống kẽm, 18 nguồn, dựng ngày 29/10/2026, đã ẩn danh |

## Khuôn tệp gốc `raw-v1`

| Trường trong `declare` | Giá trị cho phép |
|---|---|
| `formatVersion` | `raw-v1` |
| `sourceCode` | Một mã nguồn: `S01`…`S29`, `S19b`, `S20b` |
| `alsoCovers` | Các mã nguồn khác trong cùng tệp (khi có) |
| `reportName` | Tên in trong báo cáo; không chứa tên nhà cung cấp hay tên công cụ |
| `grade` | `A`, `B`, `C`, `D`, `NONE`; lời giải thích ở `gradeNote` |
| `usedBy` | Chỉ `MARKET`, `INSIGHT`; dùng vào việc gì ở `usedFor` |
| `evidenceFamily` | `sales_estimate`, `customer_review`, `social_comment`, `seller_statement`, `advertising`, `web_search`, `search_intent`, `search_interest`, `ai_summary_hypothesis`, `macro_statistic`, `trade_statistic`, `published_document`, `synthetic_population_baseline` |
| `origin.method` | `EXPORTED_FROM_APP_RUN`, `FRESH_PULL_FOR_TEST_SET`, `LOCAL_DATASET_QUERY`, `NOT_COLLECTED` |
| `period` | `startDate`, `endDate`, `timezone`, `basis`; khi `startDate` là `null` thì thêm `observedPeriod` |
| `limits` | Danh sách `{code, text}` |
| `resultNote` | Bắt buộc khi tệp rỗng hoặc không thu |
| `usage`, `cost` | Con số là số, không phải chữ |
| `recordCount`, `recordsSha256` | Phải khớp `records` |

Các trường còn lại (`sourceName`, `provider`, `keyword`, `productTopic`, `country`, `timezone`, `recordShape`, `numberFields`, `anonymisation`) giữ như bộ kẽm.

**Bản đầu `kem-raw-v1`.** Bộ kẽm giữ khuôn cũ để các link đã chia sẻ không đổi. Bộ kiểm báo các chỗ khác `raw-v1` là cảnh báo (`WARN`), không phải lỗi. Bộ dữ liệu mới dùng `raw-v1`.

## Quy tắc chung

- Báo cáo không in nguyên văn lời khách. Báo cáo không nêu tên nhà cung cấp dữ liệu.
- Tệp ra khỏi cơ sở dữ liệu riêng phải ẩn danh người viết (xem `kem-2910/README.md`, mục 4) và ghi `anonymisation`.
- Tệp nhị phân của bên thứ ba (PDF, .xlsx) không vào kho mã. Bản ghi chỉ giữ link và `sha256`.

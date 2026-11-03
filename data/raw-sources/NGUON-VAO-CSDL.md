# Nguồn vào cơ sở dữ liệu app (db-v1)

Cập nhật 04/11/2026 · theo mã trên bản chính `463ce150`. Khuôn bảng nằm ở [`KHUON-CSDL.md`](KHUON-CSDL.md). Trạng thái nguồn nằm ở [trang trạng thái nguồn](../../docs/business-spec/data-sources/source-status.md), mục 2f.

## TL;DR

- Bảy nguồn đã có bộ nạp: S05, S06, S07, S02b, S14, S19b, S29.
- App tự nạp sau mỗi lượt chạy khi cờ `TDN_RAW_DB_AUTOLOAD_ENABLED=true`. Không đặt cờ thì tắt.
- Lệnh tay: `npm run raw-db:load -- --source <mã> --run <runId>`. Lệnh `--source AUTOLOAD --run <runId>` chạy cả chuỗi tự nạp.
- Bộ nạp chỉ đọc dữ liệu đã lưu của lượt chạy. Bộ nạp không gọi nguồn lần nữa. Tiền chỉ tốn ở bước thu và ở bước gán chủ đề bằng Jev.

## Bảng nguồn

Cột «Cờ bật» là cờ của bước thu. Bước tự nạp cần thêm cờ `TDN_RAW_DB_AUTOLOAD_ENABLED=true`. Cột «Tốn tiền?» nói về bước thu, theo ghi chú trong mã.

| Mã nguồn | Tên báo cáo | Bảng db-v1 | Vào bằng cách nào | Cờ bật | Tốn tiền? | Migration | Lần thử gần nhất |
|---|---|---|---|---|---|---|---|
| S05 | dữ liệu đánh giá | `raw_capture`, `product`, `product_name_source`, `review`, `run_review`; nhãn: `codebook`, `review_code` | Tự động sau lượt chạy; lệnh CLI `--source S05 --run <id>`. Không nhận tệp raw-v1 | `TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED=1` | Không (bộ thu review công khai) | 0063, 0068, 0069, 0071 | xem Phần Kết quả chạy thử |
| S06 | dữ liệu đánh giá | `raw_capture`, `product`, `product_name_source`, `review`, `run_review`; nhãn: `codebook`, `review_code` | Tự động sau lượt chạy; lệnh CLI `--source S06 --run <id>`. Không nhận tệp raw-v1 | `TDN_RESEARCH_TIKTOK_SHOP_REVIEWS_ENABLED=1` | Có; tối đa 3 sản phẩm mỗi lượt | 0063, 0068, 0069, 0071 | xem Phần Kết quả chạy thử |
| S07 | dữ liệu bình luận | `raw_capture`, `review`, `run_review`, `video` | Tự động sau lượt chạy; lệnh CLI `--source S07 --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư | `TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED=1` | Không (bộ thu tạm ở gói miễn phí) | 0063, 0065, 0071 | xem Phần Kết quả chạy thử |
| S02b | số bán theo video TikTok | `raw_capture`, `product`, `product_name_source`, `video`, `video_snapshot` | Tự động sau lượt chạy; lệnh CLI `--source S02b --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư | `TDN_RESEARCH_TOP_SELLING_VIDEOS_ENABLED=1` | Có; một lần gọi mỗi sản phẩm, tối đa 3 sản phẩm | 0063, 0065, 0066, 0071 | xem Phần Kết quả chạy thử |
| S14 | video bán hàng | `raw_capture`, `video`, `video_reading`, `video_segment` | Tự động sau lượt chạy; lệnh CLI `--source S14 --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư. Nạp sau S02b | `TDN_RESEARCH_VIDEO_WATCH_ENABLED=1` | chưa rõ | 0063, 0065, 0067, 0071 | xem Phần Kết quả chạy thử |
| S19b | kết quả tìm kiếm | `raw_capture`, `search_suggestion` | Tự động sau lượt chạy; lệnh CLI `--source S19b --run <id>`; tệp raw-v1 (`--file`) | `TDN_RESEARCH_SEARCH_SUGGEST_ENABLED=1` | Không; tối đa 48 lần gọi mỗi lượt Insight | 0063, 0064, 0071 | xem Phần Kết quả chạy thử |
| S29 | Google AI Overview | `raw_capture`, `ai_overview_block`, `ai_overview_reference` | Tự động sau lượt chạy; lệnh CLI `--source S29 --run <id>`; tệp raw-v1 (`--file`) | `TDN_RESEARCH_AI_OVERVIEW_ENABLED=1` | Có; tối đa 2 lần gọi mỗi lượt | 0063, 0064, 0071 | xem Phần Kết quả chạy thử |

Ghi chú:

- **Thứ tự tự nạp:** S05, S06, S07, S02b, S14, S19b, S29, rồi gán chủ đề cho đánh giá sản phẩm (S05, S06). Nguồn nào lượt chạy không có thì bỏ qua (`SKIPPED_NO_CAPTURES`). Một nguồn lỗi không dừng nguồn sau.
- **Khoá riêng tư:** S07, S02b, S14 đọc khoá từ `--privacy-file` hoặc `TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`. Thiếu khoá thì nguồn đó `SKIPPED_NO_PRIVACY_KEY`; nguồn khác vẫn chạy.
- **Gán chủ đề:** cần `TDN_RESEARCH_JEV_ENABLED=true` và khoá Jev. Thiếu thì việc nạp vẫn thành công (`SKIPPED_JEV_DISABLED`). Gán bằng Jev có tốn tiền không: chưa rõ (mã không nói).
- **Nhãn đã có của MCP Insight:** lệnh `--source CODES` nhập nhãn từ kho của một lượt chạy MCP. Lệnh này không gọi AI.
- **Bản chụp cho MCP Insight:** sau khi nạp S05, gán hoặc nhập nhãn, app chép `app-db.snapshot.sqlite`. Lệnh tay: `--source SNAPSHOT`.
- **Sổ tự nạp:** mỗi lần tự nạp (app hoặc `AUTOLOAD`) ghi một dòng `raw_db_autoload` (migration 0070).

## Kết quả chạy thử 04/11/2026

<!-- Người điều phối điền phần này. -->

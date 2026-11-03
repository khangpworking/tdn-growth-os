# Nguồn vào cơ sở dữ liệu app (db-v1)

Cập nhật 04/11/2026 · theo mã trên bản chính `463ce150`. Khuôn bảng nằm ở [`KHUON-CSDL.md`](KHUON-CSDL.md). Trạng thái nguồn nằm ở [trang trạng thái nguồn](../../docs/business-spec/data-sources/source-status.md), mục 2f.

## TL;DR

- Bảy nguồn đã có bộ nạp: S05, S06, S07, S02b, S14, S19b, S29.
- App tự nạp khi bước thu (`COLLECTION`) xong với `SUCCEEDED` hoặc `PARTIAL` và lượt chạy sang `RENDERING`. Cần tiến trình có quyền ghi OWNER và cờ `TDN_RAW_DB_AUTOLOAD_ENABLED=true`. Không đặt cờ thì tắt.
- Lệnh tay: `npm run raw-db:load -- --source <mã> --run <runId>`. Lệnh `--source AUTOLOAD --run <runId>` chạy cả chuỗi tự nạp.
- Bộ nạp đọc dữ liệu đã lưu của lượt chạy hoặc tệp raw-v1 được chỉ định. Bộ nạp không gọi nguồn lần nữa. Bước thu có thể tốn tiền; phí gán chủ đề bằng Jev chưa rõ trong mã.

## Bảng nguồn

Cột «Cờ bật» là cờ của bước thu; vẫn cần cấu hình truy cập nguồn tương ứng. Bước tự nạp cần thêm cờ `TDN_RAW_DB_AUTOLOAD_ENABLED=true`. Lệnh CLI nạp dữ liệu đã lưu không cần các cờ thu hoặc cờ tự nạp. Cột «Tốn tiền?» nói về bước thu, theo ghi chú trong mã.

Lệnh CLI cần cơ sở dữ liệu app đã chạy migration. Chọn bằng `--db` hoặc `TDN_WORKSPACE_DB`. Khi đọc dữ liệu đã lưu của lượt chạy, cần thêm `--artifacts` hoặc `TDN_ARTIFACT_ROOT`.

| Mã nguồn | Tên báo cáo | Bảng db-v1 | Vào bằng cách nào | Cờ bật | Tốn tiền? | Migration | Lần thử gần nhất |
|---|---|---|---|---|---|---|---|
| S05 | dữ liệu đánh giá | `raw_capture`, `product`, `product_name_source`, `review`, `run_review`; nhãn: `codebook`, `review_code` | Tự động sau lượt chạy; lệnh CLI `--source S05 --run <id>`. Không nhận tệp raw-v1 | `TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED=1` | Không (bộ thu review công khai) | 0063, 0068, 0069, 0071 | 04/11/2026 lỗi |
| S06 | dữ liệu đánh giá | `raw_capture`, `product`, `product_name_source`, `review`, `run_review`; nhãn: `codebook`, `review_code` | Tự động sau lượt chạy; lệnh CLI `--source S06 --run <id>`. Không nhận tệp raw-v1 | `TDN_RESEARCH_TIKTOK_SHOP_REVIEWS_ENABLED=1` | Có; tối đa 3 sản phẩm mỗi lượt có Insight | 0063, 0068, 0069, 0071 | 04/11/2026 có dữ liệu |
| S07 | dữ liệu bình luận | `raw_capture`, `review`, `run_review`, `video` | Tự động sau lượt chạy; lệnh CLI `--source S07 --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư | `TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED=1` | Phí thực tế chưa rõ; bộ thu gói miễn phí đặt trần 0,05 USD mỗi lần chạy bộ thu (một video) | 0063, 0065, 0071 | 04/11/2026 không có dữ liệu |
| S02b | số bán theo video TikTok | `raw_capture`, `product`, `product_name_source`, `video`, `video_snapshot` | Tự động sau lượt chạy; lệnh CLI `--source S02b --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư | `TDN_RESEARCH_TOP_SELLING_VIDEOS_ENABLED=1` và `TDN_RESEARCH_VIDEO_WATCH_ENABLED=1` | Có; một lần gọi mỗi sản phẩm, tối đa 3 sản phẩm | 0063, 0065, 0066, 0071 | 04/11/2026 có dữ liệu |
| S14 | video bán hàng | `raw_capture`, `video`, `video_reading`, `video_segment` | Tự động sau lượt chạy; lệnh CLI `--source S14 --run <id>`; tệp raw-v1 (`--file`). Cần khoá riêng tư. Nạp sau S02b | `TDN_RESEARCH_VIDEO_WATCH_ENABLED=1` | chưa rõ | 0063, 0065, 0067, 0071 | 04/11/2026 không có dữ liệu |
| S19b | kết quả tìm kiếm | `raw_capture`, `search_suggestion` | Tự động sau lượt chạy; lệnh CLI `--source S19b --run <id>`; tệp raw-v1 (`--file`) | `TDN_RESEARCH_SEARCH_SUGGEST_ENABLED=1` | Không; tối đa 48 lần gọi mỗi lượt Insight | 0063, 0064, 0071 | 04/11/2026 có dữ liệu |
| S29 | Google AI Overview | `raw_capture`, `ai_overview_block`, `ai_overview_reference` | Tự động sau lượt chạy; lệnh CLI `--source S29 --run <id>`; tệp raw-v1 (`--file`) | `TDN_RESEARCH_AI_OVERVIEW_ENABLED=1` (gọi bổ sung); có thể dùng câu trả lời đã có ở S19 | Có; tối đa 2 lần gọi bổ sung mỗi lượt | 0063, 0064, 0071 | 04/11/2026 có dữ liệu |

Ghi chú:

- **Thứ tự tự nạp:** S05, S06, S07, S02b, S14, S19b, S29, rồi gán chủ đề cho đánh giá sản phẩm (S05, S06). Nguồn nào lượt chạy không có thì bỏ qua (`SKIPPED_NO_CAPTURES`). Một nguồn lỗi không dừng nguồn sau.
- **Khoá riêng tư:** S07, S02b, S14 cần tệp JSON riêng có quyền `0600`. App đọc từ `TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`; CLI còn nhận `--privacy-file`. Khi tự nạp hoặc dùng `AUTOLOAD`, thiếu tệp thì nguồn đó `SKIPPED_NO_PRIVACY_KEY`; nguồn khác vẫn chạy. Lệnh CLI nạp riêng một nguồn sẽ dừng với `RAW_DB_PRIVACY_KEY_MISSING`.
- **Gán chủ đề:** cần `TDN_RESEARCH_JEV_ENABLED=true` và khoá Jev. Tự nạp và `AUTOLOAD` gán sau cả chuỗi. CLI `S05` cũng gán sau khi nạp, trừ khi dùng `--no-label`; CLI `S06` chỉ nạp dữ liệu, muốn gán thì chạy `--source LABELS --run <id>`. Thiếu cấu hình Jev thì tự nạp và CLI `S05` vẫn nạp dữ liệu (`SKIPPED_JEV_DISABLED`); lệnh `LABELS` sẽ báo `RAW_DB_LABELS_JEV_DISABLED`. Phí Jev: chưa rõ trong mã.
- **Nhãn đã có của MCP Insight:** lệnh `--source CODES` nhập nhãn từ kho của một lượt chạy MCP. Lệnh này không gọi AI.
- **Bản chụp cho MCP Insight:** app chép `app-db.snapshot.sqlite` sau mỗi lần tự nạp. CLI chép sau `S05`, `LABELS`, `CODES` hoặc `AUTOLOAD`; lỗi chép được báo riêng, không làm việc nạp thất bại. Lệnh tay: `--source SNAPSHOT`.
- **Sổ tự nạp:** mỗi lần tự nạp (app hoặc `AUTOLOAD`) ghi một dòng `raw_db_autoload` (migration 0070). `--dry-run` không ghi dòng, không gọi Jev, không chép bản chụp.

## Kết quả chạy thử 04/11/2026

Lượt chạy `3d66fbda`: từ khoá «vitamin c», Market và Insight. Người điều phối đọc cơ sở dữ liệu trên máy chủ, chỉ đọc. App tự nạp một lần, ngay khi bước thu xong (`raw_db_autoload`, `origin` = `APP`).

| Nguồn | Kết quả |
|---|---|
| S05 | Lỗi `RAW_DB_PRODUCT_NAME_MISSING`. Lượt chạy không có danh sách Metric, nên không có tên sản phẩm. 411 lần gọi đánh giá Shopee đã thu, nhưng chưa vào cơ sở dữ liệu |
| S06 | 3 lần gọi, 3 sản phẩm (tên lấy từ lần thu của app, `APP_CAPTURE`), 873 đánh giá, `ratingInvalid` 0 |
| S07 | Không có dữ liệu: bước chọn video (P9) chưa chạy |
| S02b | 3 lần gọi, 30 video, 30 dòng `video_snapshot` |
| S14 | Không có dữ liệu: bước P9 chưa có bản đọc video. Có 2 lần gọi đọc video, nhưng chưa thành bản đọc |
| S19b | 24 lần gọi, 240 gợi ý |
| S29 | 1 lần gọi, 15 khối, 10 nguồn dẫn |
| Gán chủ đề bằng Jev | 247 đánh giá có chữ, 247 lần gọi, 323 dòng `review_code`, 75 `NO_THEME`. Sao của S06: 821 khen (4–5 sao), 52 chê (1–3 sao) |

- Phạm vi: người xác nhận qua owner API (`confirm-v3`). Phạm vi có 3 sản phẩm TikTok Shop từ tìm nhanh và 3 link Shopee có doanh thu cao nhất, mỗi link của một shop khác nhau. Lý do: bước thu Metric cũ dừng với `METRIC_UI_CHANGED` (giao diện Metric đổi). Bản Metric v3 chỉ chạy cho báo cáo Market (`V3_REPORT_MARKET_ONLY`).
- Kết quả lượt chạy: bước thu `PARTIAL`; bước dựng báo cáo `FAILED` (`REPORT_RENDER_FAILED`). Việc nạp vẫn chạy, vì bước thu xong với `PARTIAL`.
- Dấu: mọi `raw_capture` của lượt này có `response_sha256_basis` = `ORIGINAL_BYTES`. App chép lại bản sao sạch sau lượt nạp.
- Chi phí: Kalodata 58 lần gọi (tín dụng của gói), SerpApi 7 lần (gói miễn phí), đánh giá Shopee công khai 411 lần (0 USD), Apify 0 USD.
- S05, S07, S14 đã có dữ liệu thật trong cơ sở dữ liệu từ bộ kẽm (nạp 03/11/2026): S05 1.152 đánh giá, S07 262 bình luận, S14 3 lần đọc.

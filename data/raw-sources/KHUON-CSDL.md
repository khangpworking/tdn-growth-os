# Khuôn cơ sở dữ liệu cho từng nguồn gốc (db-v1)

Bản 2 · 31/10/2026 · dùng cho mọi bộ dữ liệu theo khuôn tệp gốc `raw-v1` (và bản đầu `kem-raw-v1`). Quy tắc nghiệp vụ: quy chuẩn dữ liệu đầu vào, Phần 6.2. Bản 1 (`kem-db-v1`, 29/10/2026) nằm ở lịch sử của `kem-2910/KHUON-CSDL.md`.

## TL;DR

- File này nói: khi thu một nguồn, mỗi bản ghi gốc được lưu vào bảng nào, cột nào, kiểu gì, đơn vị gì.
- Mỗi bảng có cột «Lấy từ bản gốc»: đường dẫn tới trường trong tệp `raw-v1`. Ví dụ lấy từ bộ kẽm (`kem-2910/`).
- Lời khách của 3 nguồn (đánh giá Shopee, đánh giá TikTok Shop, bình luận TikTok) dùng **một bảng chung `review`**.
- Mỗi người viết có hai cột: `reviewer_key` (HMAC của mã tác giả do nguồn trả về; `NULL` nếu nguồn không trả mã tác giả) và `reviewer_name` (tên thật khi có, chỉ trong cơ sở dữ liệu riêng).
- Bản 2 thêm 4 bảng: `run_review` (lần chạy ↔ đánh giá), `codebook` và `review_code` (chủ đề đã gán và ai duyệt), `video` (video ↔ sản phẩm).
- Kho của MCP Insight dùng tên khác. Bảng đối chiếu ở Phần 3.4.
- 03/11/2026 (chủ duyệt): §4.4 `search_suggestion` (S19b) và §4.5 `ai_overview_block`, `ai_overview_reference` (S29) có cột đầy đủ; mỗi gạch đầu dòng của AI Overview là một dòng `list_item`; bảng nguồn có thêm cột `snippet`.
- 03/11/2026 (chủ duyệt F335, F336): S07 bình luận TikTok vào `review` và `video` (migration 0065). Không lưu tên người viết; `reviewer_key` là HMAC của `uid` số; `text` là bản đã che liên hệ (§3, §4.1a).
- 03/11/2026 (chủ duyệt F347, F349): số theo từng video của Kalodata có mã nguồn riêng **S02b «Kalodata video»**; S02 đổi tên thành «Kalodata sản phẩm». S02b vào `video` và bảng mới `video_snapshot` (migration 0066). Tên video giữ đúng như nguồn trả; người làm video chỉ lưu `author_key` (§4.1a, §4.1b).
- 03/11/2026 (chủ duyệt F354, F356): S14 lời nói trong video vào `video_reading` và `video_segment` (migration 0067), thay bản phác §4.1 cũ. Không lưu nhận định của AI (giọng, loại video, có nói về sản phẩm không). Chữ giữ đúng như đọc được. Nạp S02b trước S14 cho cùng lần chạy. Từ nay app chỉ xem video chủ chọn và video bán chạy, không xem video từ tìm kiếm `site:tiktok.com` (§4.1).
- 03/11/2026 (chủ duyệt F361–F363): nhãn chủ đề vào `codebook` và `review_code` (migration 0068), thay bản phác §3.3 cũ. Nhãn kẽm của Jev được nhập từ kho MCP, không gọi AI, chỉ khi dấu của đoạn lời khớp với lời trong `review`. Cảm xúc theo sao là view `review_star_sentiment` (1–3 sao tiêu cực, 4–5 sao tích cực).
- 03/11/2026 (chủ quyết F366, F367): app tự gán chủ đề bằng Jev ngay sau khi nạp đánh giá Shopee (S05) vào db-v1 và ghi vào `review_code` với `origin` = `APP_JEV` (migration 0069). Cách gán giống hệt MCP Insight. Một đánh giá đã có nhãn của bản bộ chủ đề thì không gọi Jev lần nữa (§3.3).
- 03/11/2026 (chủ quyết F376): nhập `CODES` theo cả đánh giá hoặc không gì; lượt gán và lượt nhập chạy mỗi lúc một lượt (khoá tệp SQLite, `LABELS_BUSY`); app chép bản chụp `app-db.snapshot.sqlite` cho MCP Insight sau mỗi lần nạp S05, gán hoặc nhập (§3.3).
- 04/11/2026 (chủ quyết F381, F385; sau bản soát Astra, migration 0071): `review.state` chỉ là trạng thái của chính đánh giá (`VALID`, `HIDDEN`, `DELETED`); sao thiếu hoặc sai → `rating_star` `NULL`, `state` `VALID`. Bảng mới `product_name_source` ghi tên sản phẩm lấy từ bản ghi nào (§2.2a). Cột mới `raw_capture.response_sha256_basis` nói dấu `response_sha256` băm cái gì (§2.1). `attributes_json` có một dạng khai báo cho mỗi nguồn (§3).

- 04/11/2026 (chủ quyết F368, F389): S06 đánh giá TikTok Shop vào `review` (không lưu tên, không tính khoá từ tên hiển thị) và được gán chủ đề như S05. Khi bật `TDN_RAW_DB_AUTOLOAD_ENABLED=true`, app tự nạp cả 7 nguồn db-v1 của một lần chạy (S05, S06, S07, S02b, S14, S19b, S29) rồi gán chủ đề, ngay khi bước thu (`COLLECTION`) của lần chạy xong với `SUCCEEDED` hoặc `PARTIAL`; mỗi lần ghi một dòng `raw_db_autoload` (migration 0070). `raw-db-load --source AUTOLOAD --run <id>` chạy cùng chuỗi bằng tay (§3, §5.0).
- Mỗi dòng dữ liệu trỏ về đúng một lần gọi nguồn trong bảng `raw_capture`. Nhờ vậy mọi con số đều có nguồn gốc.
- Câu lệnh SQL (SQLite) ở Phần 5. Câu lệnh chạy được trên SQLite 3.35 trở lên.

## 1. Quy ước chung

| Quy ước | Cách làm |
|---|---|
| Tên bảng, tên cột | Tiếng Anh, chữ thường, nối bằng `_` |
| Ngày giờ | Chuỗi ISO 8601 có múi giờ, ví dụ `2026-10-26T09:01:34+07:00` |
| Ngày (không giờ) | `YYYY-MM-DD` |
| Tiền | Đồng Việt Nam, cột kết thúc bằng `_vnd`. Số ước tính của nguồn giữ nguyên số lẻ (REAL) |
| Số thiếu | `NULL`. `NULL` không có nghĩa là 0. Số 0 thật thì ghi 0 |
| Độ chính xác | Cột `precision`: `exact`, `display_rounded` (làm tròn như trang hiển thị), `provider_estimate` (ước tính của nguồn) |
| Nền tảng | `shopee`, `tiktok_shop`, `tiktok`, `google`, `meta`, `official` |
| Mã nguồn | `source_code` theo quy chuẩn: S01, S02 (Kalodata sản phẩm), S02b (Kalodata video), S05, S06, S07, S14, S15, S16, S17, S19, S19b, S20, S20b, S21, S22, S23, S24, S25, S28, S29 |
| Mã sản phẩm | `product_key` = `<platform>:<item_id>`, ví dụ `shopee:2308735412`, `tiktok_shop:1729958693491935262` |
| Nguồn gốc dòng | Mọi bảng dữ liệu có `capture_id` (lần gọi nào) và `source_position` (vị trí trong bản gốc, ví dụ `page=1,row=0`) |

## 2. Bảng nền

### 2.1 `raw_capture` — một lần gọi nguồn

Mỗi lần gọi nhà cung cấp (một trang, một API, một lần mở trang) là một dòng.

| Cột | Kiểu | Bắt buộc | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|---|
| capture_id | TEXT | Có | Mã lần gọi | `records[].captureId` hoặc mã tự sinh |
| run_id | TEXT | Không | Mã lượt chạy của app | `declare.origin.runId` |
| source_code | TEXT | Có | S01…S29 | `declare.sourceCode` |
| provider | TEXT | Có | Nhà cung cấp | `declare.provider` |
| operation | TEXT | Có | Loại lệnh, ví dụ `kalodata.product.detail` | `records[].operation` |
| endpoint | TEXT | Không | Địa chỉ gọi | `records[].endpoint` |
| request_params_json | TEXT | Không | Tham số gọi (JSON) | `records[].requestParameters` |
| keyword | TEXT | Không | Từ khoá | `declare.keyword` |
| period_start, period_end | TEXT | Không | Kỳ dữ liệu | `records[].queryWindow` hoặc `declare.period` |
| requested_at, completed_at | TEXT | Có / Không | Lúc gọi, lúc xong | `records[].requestedAt`, `completedAt` |
| http_status | INTEGER | Không | Mã HTTP | `records[].httpStatus` |
| outcome | TEXT | Có | `OK`, `EMPTY`, `PROVIDER_REJECTED`, `BLOCKED`, `LOGIN_REQUIRED`, `FAILED`, `NOT_COLLECTED` | `records[].outcome` |
| billing | TEXT | Không | `FREE_ACCOUNT_QUERY`, `PAID_CREDITS`, `PAID_SEARCH_UNLESS_CACHED` | `records[].billing` |
| cost_unit, cost_amount | TEXT, REAL | Không | Đơn vị và lượng chi | `declare.cost`, `declare.usage` |
| response_sha256 | TEXT | Không | Dấu SHA-256; cái được băm ghi ở cột sau | `records[].responseSha256` |
| raw_path | TEXT | Không | Tệp gốc + vị trí | tên tệp `raw-v1` + chỉ số bản ghi |
| response_sha256_basis | TEXT | Có khi có `response_sha256` | Dấu băm cái gì: `ORIGINAL_BYTES`, `RETAINED_ENVELOPE`, `CANONICAL_JSON`, `SUPPLIED_FILE` (bảng dưới). `NULL` khi không có dấu | — |

**Dấu `response_sha256` băm cái gì (migration 0071).** Mỗi bộ nạp ghi đúng một giá trị. Migration 0071 điền các dòng cũ theo cùng bảng này (lượt chạy app có `raw_path` `artifact:…`, tệp kẽm có `file:…`). Một dòng mới có dấu mà không có `response_sha256_basis` bị từ chối.

| Giá trị | Nghĩa |
|---|---|
| `ORIGINAL_BYTES` | Đúng các byte phản hồi nhà cung cấp trả về (đã giữ trong bao thu và đã kiểm; hoặc dấu bao thu ghi khi lần gọi không giữ byte) |
| `RETAINED_ENVELOPE` | Bản app hoặc tệp đã giữ lại, bọc phản hồi (không phải byte của nhà cung cấp) |
| `CANONICAL_JSON` | JSON do bộ nạp viết lại từ giá trị đã đọc, không khoảng trắng |
| `SUPPLIED_FILE` | Dấu do tệp tự ghi; bộ nạp không kiểm được với byte nào |

| Nguồn | Bộ nạp | `response_sha256` là | Giá trị |
|---|---|---|---|
| S05 | lượt chạy app | `resultSha256` của danh sách: dấu của bao kết quả app đã giữ | `RETAINED_ENVELOPE` |
| S06 | lượt chạy app (PR 3, `wp/raw-db-autoload`) | dấu byte phản hồi Kalodata | `ORIGINAL_BYTES` |
| S07 | lượt chạy app | dấu của `capture.json` trong gói P9 | `RETAINED_ENVELOPE` |
| S07 | tệp kẽm | `records[].responseSha256` của tệp | `SUPPLIED_FILE` |
| S19b | lượt chạy app | dấu byte phản hồi Google Suggest | `ORIGINAL_BYTES` |
| S19b | tệp kẽm | SHA-256 của `JSON.stringify(records[].raw)` (giữ thứ tự khoá của tệp) | `CANONICAL_JSON` |
| S29 | lượt chạy app | dấu byte phản hồi SerpApi (lần gọi mang câu trả lời) | `ORIGINAL_BYTES` |
| S29 | tệp kẽm | SHA-256 của `JSON.stringify(records[i])`: cả bản ghi, gồm yêu cầu và phản hồi | `RETAINED_ENVELOPE` |
| S02b | lượt chạy app | dấu byte phản hồi Kalodata | `ORIGINAL_BYTES` |
| S02b | tệp kẽm, `declare.responseSha256Basis` = `canonical-json` | SHA-256 của JSON chuẩn (khoá xếp thứ tự) của `response`, đã kiểm | `CANONICAL_JSON` |
| S02b | tệp kẽm, không khai báo | `records[].responseSha256` của tệp | `SUPPLIED_FILE` |
| S14 | lượt chạy app | dấu byte phản hồi Gemini | `ORIGINAL_BYTES` |
| S14 | tệp kẽm | `records[].responseSha256` của tệp | `SUPPLIED_FILE` |

Các dòng S02b đã nạp từ tệp kẽm trước migration 0071 nhận `SUPPLIED_FILE`: tệp kẽm không khai báo `canonical-json`, bộ nạp giữ dấu do tệp cung cấp. Lần nạp mới ghi cơ sở theo khai báo trong tệp.

### 2.2 `product` — sản phẩm trên sàn

Một sản phẩm một dòng. Số bán theo kỳ nằm ở bảng `product_snapshot`.

| Cột | Kiểu | Bắt buộc | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|---|
| product_key | TEXT | Có | `<platform>:<item_id>` | S01 `product_base_id` (`1__<item>__<shop>` = Shopee, `8__…` = TikTok Shop); S02 `product_id`; S05 `itemId` |
| platform | TEXT | Có | `shopee` hoặc `tiktok_shop` | — |
| item_id | TEXT | Có | Mã sản phẩm của sàn | như trên |
| shop_id | TEXT | Không | Mã shop | S01 `shop_base_id`; S02 `product_shop_id`; S05 `shopId` |
| shop_name | TEXT | Không | Tên shop (doanh nghiệp) | S01 `shop_name` |
| product_name | TEXT | Có | Tên sản phẩm | S01/S02 `product_name` |
| brand | TEXT | Không | Thương hiệu | S01 `final_brand` |
| category_path | TEXT | Không | Ngành hàng, nối bằng ` > ` | S01 `final_categories[].name`; S02 `pri/sec/ter_cate_id` |
| product_url | TEXT | Không | Link sản phẩm | S01 `url_product`; S05 `selected[].productUrl` |
| launch_date | TEXT | Không | Ngày lên sàn | S02 `launch_date`; S01 `platform_created_at` |
| first_capture_id | TEXT | Có | Lần thu đầu tiên thấy sản phẩm | — |

### 2.2a `product_name_source` — tên sản phẩm lấy từ đâu

Chủ quyết F385 (04/11/2026, migration 0071). Một sản phẩm một dòng, ghi cùng giao dịch với dòng `product`. Chỉ thêm, không sửa, không xoá.

| Cột | Kiểu | Bắt buộc | Nghĩa |
|---|---|---|---|
| product_key | TEXT | Có | Sản phẩm, khoá chính, trỏ về `product` |
| source_kind | TEXT | Có | `METRIC_LIST` (tên đọc từ tệp phản hồi Metric), `APP_CAPTURE` (tên đọc từ tệp thu của app, không phải dòng `raw_capture`), hoặc `RAW_CAPTURE` (tên đọc từ một lần thu trong `raw_capture`) |
| artifact_sha256 | TEXT | Với `METRIC_LIST`, `APP_CAPTURE` | Dấu của tệp phản hồi Metric (raw-responses) hoặc tệp thu app đã kiểm. `NULL` với `RAW_CAPTURE` |
| capture_id | TEXT | Với `RAW_CAPTURE` | Lần thu đã cho tên. `NULL` với `METRIC_LIST` và `APP_CAPTURE` |
| json_path | TEXT | Có | Đường dẫn tới bản ghi chứa tên: trong tệp Metric (ví dụ `$[206].body.data.products[2]`), trong phản hồi đã giải mã của tệp thu app (`$.data` hoặc `$.data[i]`), hoặc trong bản ghi gốc mà `raw_path` của lần thu chỉ tới (`$` = chính bản ghi đó) |
| recorded_at | TEXT | Có | Lúc ghi dòng (+07:00) |

- S05: tên lấy theo luật cũ (lần thu Metric cuối thắng, lần trước chỉ bù tên còn thiếu); dòng `METRIC_LIST` trỏ đúng tệp và bản ghi đã dùng. Không có tên → không có dòng `product` (như cũ, `RAW_DB_PRODUCT_NAME_MISSING`).
- S02b: tên từ `productName` của bản ghi tệp → `RAW_CAPTURE`, `capture_id` của bản ghi đó, `json_path` `$`.
- S02b nạp từ lượt chạy app và S06: tên từ `kalodata.product.rank` / `kalodata.product.detail` của cùng lần chạy → `APP_CAPTURE`, dấu của đúng tệp thu đã cho tên, `capture_id` `NULL`. Không thêm dòng `raw_capture` cho lần thu tên. S02b ưu tiên rank rồi detail; S06 ưu tiên detail rồi rank, như trước.
- Sản phẩm đã có trước migration 0071: nạp lại cùng lần chạy (lần thu đầu của sản phẩm thuộc lần chạy đó) chỉ thêm dòng `product_name_source` còn thiếu. Tên tìm được phải đúng bằng `product_name` đã lưu, nếu không thì cả lần nạp hỏng (`RAW_DB_PRODUCT_NAME_MISMATCH`, không ghi gì). Migration không điền bảng này (không đọc được tệp); dữ liệu cũ được điền bằng cách nạp lại sau khi triển khai.

### 2.3 `product_snapshot` — số của sản phẩm trong một kỳ

| Cột | Kiểu | Đơn vị | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|---|
| product_key | TEXT | — | Sản phẩm | — |
| source_code | TEXT | — | S01 hoặc S02 | — |
| window_start, window_end | TEXT | ngày | Kỳ của số | S01 `declare.period`; S02 `queryWindow` |
| revenue_vnd | REAL | đồng | Doanh thu trong kỳ | S01 `revenue_custom`; S02 `revenue` |
| units | INTEGER | cái | Số bán trong kỳ | S01 `order_custom`; S02 `sales_volumn` |
| prev_revenue_vnd, prev_units | REAL, INTEGER | đồng, cái | Kỳ trước | S01 `previous_revenue_custom`, `previous_order_custom` |
| price_vnd, price_min_vnd, price_max_vnd | REAL | đồng | Giá | S01 `price`, `price_min`, `price_max`; S02 `unit_price`, `min_price`, `max_price` |
| lifetime_revenue_vnd, lifetime_units | REAL, INTEGER | đồng, cái | Cộng dồn từ khi bán | S01 `revenue`, `order_count` |
| rating_avg | REAL | sao | Điểm sao trung bình trên sàn | S01 `rating_avg` |
| rating_count | INTEGER | lượt | Số đánh giá trên sàn | S01 `rating_count`; S02 `product_review_count` |
| live_revenue_vnd, video_revenue_vnd, showcase_revenue_vnd | REAL | đồng | Doanh thu theo kênh (TikTok) | S02 `live_revenue`, `video_revenue`, `showcase_revenue` |
| creator_count, video_count, live_count | INTEGER | — | Số người bán hộ, video, phiên live | S02 `creator_number`, `video_number`, `live_number` |
| commission_rate_pct | REAL | % | Hoa hồng | S02 `commission_rate` |
| precision | TEXT | — | `provider_estimate` cho S01, S02 | — |
| capture_id, source_position | TEXT | — | Nguồn gốc dòng | — |

**Lưu ý S01:** bản gốc của trang kết quả có thể chứa cả sản phẩm ngoài từ khoá (ví dụ điện thoại). Chỉ nạp dòng nằm trong phạm vi lượt chạy.

### 2.4 `market_kpi` — số tổng của thị trường (S01)

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| metric | TEXT | `revenue`, `units`, `share`, `sold_listings`, `shops`… | `groups.W2_kpi.*`, `W3_platformSplit[].*` |
| platform | TEXT | `shopee`, `tiktok_shop`, `all` | `.platform` |
| value | REAL | Con số (`NULL` = thiếu) | `.value` |
| displayed | TEXT | Chữ trên trang | `.displayed` |
| unit | TEXT | `VND`, `COUNT`, `PERCENT` | `.unit` |
| precision | TEXT | `exact`, `display_rounded` | `.precision` |
| period_start, period_end | TEXT | Kỳ | `.period` |
| source_pointer | TEXT | Vị trí trong phản hồi gốc | `.sourcePointer` |
| capture_id | TEXT | Nguồn gốc | — |

Nhóm theo thương hiệu, shop, vùng (`W14_topBrands`, `W13_topShops`, `W11_location`…) nạp vào bảng `market_group_row`: `group_name`, `row_rank`, `label`, `metric`, `value`, `unit`, `precision`, `platform`, `period_start`, `period_end`, `capture_id`.

## 3. Lời khách: bảng chung `review`

Ba nguồn dùng chung bảng này: S05 (đánh giá Shopee), S06 (đánh giá TikTok Shop), S07 (bình luận dưới video TikTok).

Ví dụ của chủ: **tên người viết → `reviewer_name`**, **số sao → `rating_star`**, **lời viết → `text`**.

| Cột | Kiểu | Bắt buộc | Nghĩa | S05 Shopee | S06 TikTok Shop | S07 TikTok bình luận |
|---|---|---|---|---|---|---|
| review_key | TEXT | Có | `<source_code>:<external_id>` | — | — | — |
| source_code | TEXT | Có | S05, S06, S07 | — | — | — |
| platform | TEXT | Có | Nơi viết | `shopee` | `tiktok_shop` | `tiktok` |
| kind | TEXT | Có | `product_review` hoặc `video_comment` | product_review | product_review | video_comment |
| external_id | TEXT | Có | Mã gốc của nguồn | `reviewId` | `review.review_id` | `cid` (bộ kẽm công khai: `anon-…`) |
| product_key | TEXT | Không | Sản phẩm được đánh giá | `shopee:` + `itemId` | `tiktok_shop:` + `product_id` | `NULL`; sản phẩm của video nằm ở bảng `video` |
| video_url | TEXT | Không | Video có bình luận | — | — | `videoWebUrl` (đúng dạng `https://www.tiktok.com/@<handle>/video/<id>`) |
| reviewer_key | TEXT | Không | HMAC-SHA256 của **mã tác giả do nguồn trả về** (khoá bí mật của hệ thống). Không tính từ tên hiển thị khi nguồn có mã tác giả | **`NULL`**: bộ thu gói S chưa giữ mã tác giả (change `shopee-public-review-writer-key`) | **`NULL`** (chủ quyết F368, luật L2): nguồn không có mã tác giả; tên hiển thị `review_user` không phải một người nên không dùng để tính khoá | HMAC-SHA256(khoá, `"tdn:tiktok.com:author:v1\0"` + `uid`), cùng khoá và cùng cách băm với bộ thu app; `NULL` khi `uid` thiếu hoặc không phải số (bộ kẽm đã đổi `uid` thành `anon-…`) |
| reviewer_name | TEXT | Không | **Tên thật. Chỉ lưu trong cơ sở dữ liệu riêng.** Không xuất ra kho công khai, không in vào báo cáo | **Chưa có**: bộ thu hiện bỏ trường này | **Không lưu**: `review_user` không bao giờ được đọc vào db-v1 | **Không lưu** (chủ chọn F335 (a)): không lưu `uniqueId` hay tên ở đâu cả |
| reviewer_name_state | TEXT | Có | `real`, `masked_by_source`, `not_provided` | `not_provided` | `masked_by_source` khi `is_anonymous` đúng, còn lại `not_provided` | `not_provided` |
| rating_star | INTEGER | Không | Số sao 1–5. `NULL` với bình luận | `ratingStar` | `review.rating` chỉ khi là số nguyên 1–5 (số hoặc chuỗi số); khác thì `NULL` và đếm `ratingInvalid` trong kết quả nạp | `NULL` |
| text | TEXT | Không | Lời viết, giữ nguyên | `comment` | `review.display_text` giữ nguyên (đúng lời MCP Insight đọc) | `text` đã che: bỏ @tên, link hồ sơ, số điện thoại, email (`sanitizeTikTokCommentText` của bộ thu); `attributes_json.textForm` = `SANITIZED` |
| variation | TEXT | Không | Phân loại hàng đã mua | `variation` | `sku_specification` | — |
| attributes_json | TEXT | Không | Nhãn của sàn, ví dụ «Công dụng», «Đối tượng sử dụng». Dạng theo từng nguồn (bảng dưới) | `attributes` | `NULL` | JSON chỉ có khoá có giá trị: `textForm`, `byVideoAuthor`, `likedByAuthor`, `pinnedByAuthor`, `exclusionReason` (`REPLY`, `EMPTY`, `TAG_ONLY`, `EMOJI_ONLY`, cùng luật bộ thu) |
| posted_at | TEXT | Không | Lúc viết (ISO, +07:00) | `createdAt` | `review.review_timestamp` (mili giây → ISO +07:00) | `createTimeISO` (→ +07:00) |
| like_count | INTEGER | Không | Lượt thích | — | `digg_count` | `diggCount` |
| reply_count | INTEGER | Không | Số trả lời | — | — | `replyCommentTotal` |
| replies_to_external_id | TEXT | Không | Trả lời cho bình luận nào | — | — | `repliesToId` khi khác `NULL` và khác `"0"` |
| media_count | INTEGER | Không | Số ảnh, video kèm | — | — | `images` (đếm khi là danh sách, nếu không thì `NULL`) |
| state | TEXT | Có | Trạng thái của chính đánh giá: `VALID`, `HIDDEN`, `DELETED`. Không bao giờ là lỗi sao (migration 0071 từ chối giá trị khác) | `VALID`; sao thiếu hoặc sai (`ratingState` khác `VALID`) → `rating_star` `NULL`, đếm một lần ở `ratingInvalid` của kết quả nạp | `VALID` | `VALID` |
| collected_at | TEXT | Có | Lúc thu | `raw_capture.completed_at` | như bên trái | như bên trái |
| capture_id | TEXT | Có | Lần thu | — | — | — |
| source_position | TEXT | Có | Vị trí trong bản gốc | `page=<sourcePage>,row=<sourceRow>` | `product=<id>,index=<n>` | `video=<id>,index=<n>` |

**Quy tắc cho bảng `review`:**

1. Một người viết nhiều lần thì cùng `reviewer_key`. Nhờ vậy ta đếm được «≥ 5 người viết» mà không cần tên. Khi `reviewer_key` là `NULL`, mỗi đánh giá được đếm là một người viết và báo cáo ghi «đếm theo đánh giá» (luật L2, view `writer_count`).
2. Khoá HMAC nằm ngoài cơ sở dữ liệu. Ai có bản sao cơ sở dữ liệu cũng không dò ngược được tên từ `reviewer_key`.
3. Khi xuất ra kho công khai hoặc gửi người khác: bỏ `reviewer_name`, che số điện thoại, email, @nhắc tên trong `text`.
4. Báo cáo không in nguyên văn `text`. Báo cáo chỉ dùng chủ đề đã mã hoá.
5. Shopee: bộ thu gói S chưa giữ mã tác giả. Change `shopee-public-review-writer-key` đề xuất giữ HMAC của mã tác giả (không giữ tên). Change này chờ chủ duyệt.
6. Một đánh giá chỉ có một dòng, dù nhiều lần chạy thu lại. Lần chạy nào có đánh giá nào thì ghi ở bảng `run_review`.
7. `attributes_json` giữ dạng riêng của từng nguồn. Mọi đường nạp kiểm dạng trước khi ghi (`src/modules/raw-db/attributes-shape.ts`); sai dạng thì cả lần nạp hỏng (`RAW_DB_ATTRIBUTES_SHAPE`). Nguồn chưa khai báo dạng cũng hỏng.

| Nguồn | Dạng `attributes_json` |
|---|---|
| S05 | `NULL` khi sàn không có nhãn; nếu không thì mảng JSON không rỗng, mỗi phần tử là chuỗi không rỗng, giữ thứ tự của nguồn |
| S06 | Chỉ `NULL` (chưa lưu nhãn) |
| S07 | Đối tượng JSON, luôn có `textForm` = `"SANITIZED"`; khoá khác chỉ có thể là `byVideoAuthor` (`true`), `likedByAuthor`, `pinnedByAuthor` (true/false), `exclusionReason` (`REPLY`, `EMPTY`, `TAG_ONLY`, `EMOJI_ONLY`) |

8. **S06 (chủ quyết F368):** nạp từ các lần gọi `kalodata.product.comment.insight` đã lưu của lần chạy (`raw-db-load --source S06 --run <id>`, không có `--file`), qua bộ đọc có kiểm dấu như các nguồn khác. Một `raw_capture` mỗi lần gọi (`S06:<runId>:<ordinal>`, nhà cung cấp, thao tác, kết quả và `billing` như đã lưu, dấu phản hồi). `review_key` = `S06:` + `review.review_id` (mã số); dòng thiếu mã số thì không nạp và đếm `reviewIdMissing`. `variation` = `sku_specification`, `like_count` = `digg_count`, `state` = `VALID`, `product_key` = `tiktok_shop:` + `product_id`. Sản phẩm chưa có trong `product` thì chỉ thêm khi chính lần chạy đã lưu tên (`kalodata.product.detail` hoặc `kalodata.product.rank`), không đoán; không có tên thì cả lần nạp dừng (`RAW_DB_PRODUCT_NAME_MISSING`). Người viết S06 đếm theo đánh giá (view `writer_count`). Nạp lại cùng lần chạy ra toàn số 0; cả lần nạp là một giao dịch.

### 3.1 `review_point` — ý khen, chê do AI của nguồn gom (S06)

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| point_id | TEXT | Mã ý | `pain_points[].id` |
| product_key | TEXT | Sản phẩm | `tiktok_shop:` + `product_id` |
| kind | TEXT | `pain`, `positive`, `usage_scenario`, `summary` | tên mảng |
| text_vi | TEXT | Ý bằng tiếng Việt | `view_point`; `comment_summary.summary` |
| text_zh | TEXT | Ý bằng tiếng Trung của nguồn | `point_zh` |
| review_count | INTEGER | Số đánh giá nhắc ý này (số bản ghi, không phải số người) | `id_list` (đếm) |
| key_review_key | TEXT | Đánh giá tiêu biểu | `S06:` + `key_review_id` |
| capture_id | TEXT | Nguồn gốc | — |

Ý của AI nguồn chỉ để đối chiếu. Ý này không phải bằng chứng. Khi in thì ghi «AI của nguồn nêu».

### 3.2 `run_review` — lần chạy nào có đánh giá nào

Một đánh giá có thể được thu lại ở nhiều lần chạy. Bảng `review` giữ một dòng cho mỗi đánh giá (`UNIQUE (source_code, external_id)`). Bảng này ghi lần chạy nào thấy đánh giá nào. Nhờ vậy, báo cáo của một lần chạy đếm đúng tập đánh giá của lần chạy đó.

| Cột | Kiểu | Nghĩa |
|---|---|---|
| run_id | TEXT | Mã lần chạy của app, hoặc mã bộ dữ liệu thử (ví dụ `kem-2910`) |
| review_key | TEXT | Đánh giá |
| capture_id | TEXT | Lần thu của lần chạy này |
| source_position | TEXT | Vị trí trong bản gốc của lần thu này |

### 3.3 `codebook`, `review_code` và view `review_star_sentiment` — chủ đề đã gán, cảm xúc theo sao

Chủ duyệt 03/11/2026 (F361–F363). Nhãn chủ đề nằm trong cơ sở dữ liệu app (migration 0068). Tệp JSON `tools/mcp-insight/data/insight-theme-codebook.json` vẫn là nơi sửa danh sách chủ đề. MCP Insight chỉ đọc, không ghi vào cơ sở dữ liệu app. Nhãn kẽm Jev đã gán ngày 30/10 được **nhập** từ kho của lần chạy MCP (`raw-db-load --source CODES`), không gọi AI. Giá trị giữ đúng như người gán đã ghi, không dịch (F349).

`codebook`: một bản bộ chủ đề một dòng.

| Cột | Kiểu | Bắt buộc | Nghĩa | Lấy từ tệp JSON |
|---|---|---|---|---|
| codebook_version | TEXT | Có | Bản bộ chủ đề, ví dụ `2026-10-30.4` (khoá chính) | `version` |
| contract_version | TEXT | Có | Khuôn của tệp | `contractVersion` |
| status | TEXT | Có | `DRAFT` hoặc `APPROVED` | `status` |
| approved_by, approved_at | TEXT | Không | Ai duyệt, lúc nào. Cả hai `NULL` khi `DRAFT`, cả hai có khi `APPROVED` | `approvedBy`, `approvedAt` |
| definition_json | TEXT | Có | Nguyên văn tệp lúc nạp | cả tệp |
| definition_sha256 | TEXT | Có | SHA-256 của các byte trong tệp | — |
| loaded_at | TEXT | Có | Lúc nạp (ISO) | — |

Không xoá được dòng. Chỉ một thay đổi được phép: duyệt, tức `DRAFT` → `APPROVED` có người duyệt và lúc duyệt, các cột khác giữ nguyên. Bản này chưa có lệnh duyệt.

`review_code`: một đánh giá × một chủ đề × một bản bộ chủ đề một dòng. Không lưu lại lời khách.

| Cột | Kiểu | Bắt buộc | Nghĩa | Lấy từ kho MCP |
|---|---|---|---|---|
| review_key | TEXT | Có | Đánh giá | `review.platform` + `source_review_id` → dòng `review` cùng `platform`, `external_id`, `kind = 'product_review'` |
| codebook_version | TEXT | Có | Bộ chủ đề đã dùng | `label.codebook_version` |
| theme_code | TEXT | Có | Mã chủ đề của bộ (lõi, chủ đề của khối, hoặc `otherCode` `T-KHAC`); `NO_THEME` = đã gán, không có chủ đề nào | `label.theme_code` |
| block_key | TEXT | Không | Khối đã dùng, ví dụ `thuc_pham`; `NULL` khi không có khối | `label.block_key` |
| polarity | TEXT | Có, trừ `NO_THEME` | `khen`, `che`, `ke`, `khong_ro_huong` | `label.polarity` |
| journey_step | TEXT | Có, trừ `NO_THEME` | Bước mua, giữ như đã ghi, ví dụ `Sau mua` | `label.step` |
| status | TEXT | Có | `kept` (được đếm) hoặc `unclear` (không đếm). `NO_THEME` là `kept` | `label.status` |
| confidence | REAL | Không | Xác suất 0–1; `NULL` với `NO_THEME` | `label.p_yes` |
| coder | TEXT | Có | Người hoặc mô hình đã gán, ví dụ `jev`; với `APP_JEV` là mã mô hình Jev, ví dụ `jev-1.13.0` | tham số `--coder` |
| text_sha256 | TEXT | Có | Dấu của đoạn lời được gán. Với `NO_THEME`: dấu đầu vào của lần gán | `label.text_sha256`; `coding_state.input_sha256` |
| coded_at | TEXT | Có | Lúc bắt đầu gán (sớm nhất nếu có nhiều) | `coding_target.started_at` cùng bản và `block_norm` |
| origin | TEXT | Có | Cách dòng vào: `MCP_IMPORT` (nhập từ kho MCP) hoặc `APP_JEV` (app hỏi Jev, migration 0069) | — |
| import_sha256 | TEXT | Có | SHA-256 của bằng chứng: tệp kho MCP đã nhập (`MCP_IMPORT`), hoặc nguyên văn phản hồi của Jev (`APP_JEV`), lưu trong kho tệp theo dấu của app | — |

**Quy tắc khi nhập (`raw-db-load --source CODES`):**

1. Mỗi dòng `label` của MCP thành một dòng `review_code`. Mỗi đánh giá có `coding_state` `done` mà không có `label` thành một dòng `NO_THEME`.
2. **Bằng chứng lời:** dựng lại lời từ `review`: `text` rồi mỗi mục của `attributes_json` thêm hai dấu cách đứng trước. Cắt đoạn `[text_start, text_end)` tính theo **điểm mã Unicode** (chỉ số chuỗi Python của MCP; emoji tính là một). Dấu SHA-256 (UTF-8) của đoạn phải bằng `label.text_sha256`. Không khớp thì đếm nhãn đó vào `textMismatch` và bỏ **cả đánh giá** (mục 6).
3. Đánh giá không có trong `review` thì bỏ các nhãn của nó và đếm `reviewsMissing`. Khớp hơn một dòng thì dừng (`RAW_DB_CODES_AMBIGUOUS_REVIEW`).
4. Bản của tệp phải bằng bản của mọi nhãn (`RAW_DB_CODES_CODEBOOK_MISMATCH`). Bản đã có mà dấu tệp khác thì dừng (`RAW_DB_CODES_CODEBOOK_CHANGED`). Mã chủ đề lạ thì dừng (`RAW_DB_CODES_INVALID_ROW`).
5. Nạp lại cùng tệp thì không thêm dòng nào. Cả lần nạp là một giao dịch, trừ các đánh giá bị bỏ ở mục 2, 3 và 6.
6. **Cả đánh giá hoặc không gì (chủ quyết F376):** một nhãn của đánh giá bị bỏ (mục 2, 3) thì bỏ mọi nhãn và dòng `NO_THEME` của đánh giá đó; đánh giá được đếm một lần trong `reviewsSkipped` kèm lý do. Nhãn sai bằng chứng không bao giờ biến đánh giá thành `NO_THEME`. Đánh giá đã có bất kỳ dòng `review_code` nào của bản bộ chủ đề (bất kể `origin`) thì bỏ cả đánh giá và đếm `alreadyCoded`; nạp lại đúng tệp cũ vẫn ra toàn số 0. Không bao giờ thêm chủ đề vào nhóm nhãn đã có; muốn gán lại thì dùng bản bộ chủ đề mới.

**App tự gán bằng Jev (`origin` = `APP_JEV`, chủ quyết F366, F367):**

1. **Khi nào chạy:** ngay sau khi lệnh `raw-db-load --source S05` nạp thật (không `--dry-run`) và giao dịch nạp đã ghi xong, app gán các đánh giá đủ điều kiện của lần chạy đó. Jev tắt hoặc thiếu khoá thì việc nạp vẫn thành công, kết quả ghi `labelling: SKIPPED_JEV_DISABLED`. `--no-label` bỏ qua việc gán. `raw-db-load --source LABELS [--run <id>] [--max-calls N] [--dry-run]` gán phần còn lại hoặc các đánh giá nạp trước đó; `--dry-run` chỉ lập kế hoạch, không gọi mạng, không đổi cơ sở dữ liệu.
2. **Đủ điều kiện:** đánh giá sản phẩm Shopee hoặc TikTok Shop (`platform` là `shopee` hoặc `tiktok_shop`, `kind = 'product_review'`; chủ quyết F368), lời (`text` rồi mỗi mục `attributes_json` thêm hai dấu cách đứng trước) không trống, và chưa có dòng `review_code` nào của bản bộ chủ đề hiện tại (bất kể `origin`). Không bao giờ gọi Jev cho đánh giá không đủ điều kiện, nên một nhãn không bị trả tiền hai lần.
3. **Giống MCP:** lời gửi Jev, tên sản phẩm (`product.product_name`), khối (chọn theo từ khoá hoặc danh mục đã áp dụng của lần chạy, đọc từ `scope.json` của lần chạy hoặc từ khoá của lần chạy), câu hỏi, ngưỡng và mã lỗi (`JEV_THEME_UNAVAILABLE`, `JEV_THEME_INVALID`) giống `tools/mcp-insight`. Cùng lời và cùng câu trả lời thì ra cùng nhãn (chủ đề, khối, `p_yes`, `polarity`, `kept`/`unclear`, `Sau mua`).
4. **Ghi dòng:** một đánh giá một lần gọi Jev; các dòng của một đánh giá ghi trong một giao dịch sau khi câu trả lời đã được kiểm. `confidence` = `p_yes`, `text_sha256` = SHA-256 của cả lời đã gửi, `coded_at` = lúc gọi, `block_key` = khối đã chọn. Jev trả lời mà không có chủ đề nào thì ghi một dòng `NO_THEME`. Bộ chủ đề chưa có trong `codebook` thì được thêm (quy tắc như `CODES`).
5. **Giới hạn và lỗi:** mỗi lượt gán gọi nhiều nhất `limits.maxCallsPerRun` lần (hoặc `--max-calls` nếu nhỏ hơn). Một lần gọi lỗi thì không ghi gì cho đánh giá đó và dừng lượt; các đánh giá đã ghi được giữ. Kết quả: `{ eligible, called, labelled, noTheme, rowsInserted, failed, skipped }`.
6. **Mỗi lúc một lượt (chủ quyết F376):** lượt `LABELS`, lượt gán sau khi nạp S05 và lượt nhập `CODES` giữ khoá `<thư mục cơ sở dữ liệu>/raw-db-labels.lock.sqlite`: một tệp SQLite riêng được mở và giữ `BEGIN EXCLUSIVE` suốt lượt. Khoá là khoá của hệ điều hành nên tiến trình chết thì khoá tự nhả; tệp khoá không bao giờ bị xoá. Khoá được lấy trước khi chọn đánh giá đủ điều kiện; không giữ giao dịch ghi trên cơ sở dữ liệu app khi chờ Jev. Lượt thứ hai chờ tối đa 10 giây rồi dừng với `LABELS_BUSY`; khi nạp S05 thì việc nạp vẫn thành công và kết quả ghi `labelling: SKIPPED_BUSY`. `--dry-run` không lấy khoá, không gọi mạng.
7. **Bản chụp cho MCP Insight (chủ quyết F376):** sau một lần nạp S05 thật (sau khi gán), một lượt `LABELS` hoặc một lần nhập `CODES`, app chép cơ sở dữ liệu bằng sao lưu trực tuyến của SQLite vào `<thư mục cơ sở dữ liệu>/app-db-snapshot/.tmp-….sqlite`, đặt `journal_mode=DELETE`, fsync, rồi đổi tên nguyên tử thành `app-db.snapshot.sqlite` và fsync thư mục (thư mục quyền 0700, tệp 0600). Kết quả có `snapshot: { path, bytes, publishedAt }`; chép lỗi thì `snapshot: { error }` và việc nạp vẫn thành công. `raw-db-load --source SNAPSHOT [--db <path>]` chép bằng tay.

View `review_star_sentiment` (F363): cảm xúc theo số sao, tính từ `review.rating_star`, không chép ra bảng. 1–3 sao → `tieu_cuc`, 4–5 sao → `tich_cuc`, không có sao → `NULL`. Cột: `review_key`, `source_code`, `platform`, `product_key`, `rating_star`, `star_sentiment`.

Chỉ dòng `kept` của bộ chủ đề `APPROVED` được đếm trong bản phát hành (quy chuẩn, Phần 7 mục 8 và L3). Bản nháp được đếm nhưng ghi «đề xuất, chờ chủ duyệt».

### 3.4 Đối chiếu với kho của MCP Insight

| `db-v1` | Kho MCP Insight (`tools/mcp-insight`) |
|---|---|
| `review.review_key` | `review.review_id` |
| `review.external_id` | `review.source_review_id` |
| `review.reviewer_key` (`NULL` khi thiếu) | MCP luôn có `review.writer_key`: khi thiếu danh tính thì dùng `platform:source_review_id` và `writer_known = 0`. TikTok Shop có tên dùng `w:` + 16 ký tự đầu SHA-256 của tên đã chuẩn hoá và `writer_known = 1`; đây chưa phải HMAC của mã tác giả như `db-v1` |
| `review.rating_star` | `review.rating` |
| `review.text` | `review_text.text` |
| `review_code` | `label`: `theme_code`, `block_key`, `polarity`, `status`, `text_sha256` giữ tên; `journey_step` ← `step`, `confidence` ← `p_yes`. `coded_at` ← `coding_target.started_at`; `coder` từ tham số `--coder`. `NO_THEME` ← `coding_state` `done` không có `label` (`text_sha256` ← `input_sha256`). `text_start`/`text_end` của MCP tính theo điểm mã Unicode. `block_norm` không lưu (chỉ dùng tìm `coding_target`) |
| `codebook.codebook_version`, `contract_version`, `status`, `approved_by`, `approved_at`, `definition_json` | Tệp `tools/mcp-insight/data/insight-theme-codebook.json`: `version`, `contractVersion`, `status`, `approvedBy`, `approvedAt`, cả tệp. Phiên bản còn nằm trong `label` và `coding_state`. `sample_review` ở kho chung ghi người rà mẫu (`reviewed_by`, `reviewed_at`, `sample_size`, `passed`), tách với việc duyệt bộ chủ đề |
| `run_review` | Mỗi lần chạy có một kho MCP riêng, nên kho MCP không cần bảng này |

## 4. Các nguồn khác

### 4.1 `video_reading` và `video_segment` — lời nói trong video (S14)

`video_reading`: một lần đọc một dòng. Khoá chính `capture_id` = lần gọi Gemini `videowatch.generate` sinh ra lần đọc đó. Cùng một video đọc lại ở lần chạy khác là một dòng mới (lần gọi khác).

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| capture_id | TEXT | Lần gọi Gemini của lần đọc (→ `raw_capture`) | lần gọi có `responseSha256` bằng `model.responseSha256` của lần đọc |
| video_url | TEXT | Video (→ `video`) | `video.videoUrl`; nếu `video_id` đã có dưới link khác thì dùng link đó |
| origin | TEXT | Video được chọn từ đâu: `SELECTION`, `TOP_SELLING`, `EXPANDED_SEARCH` (chỉ còn ở lần chạy cũ) | `video.origin` |
| duration_s | REAL | Độ dài, giây | `video.durationSeconds` |
| caption_source | TEXT | `NATIVE_SUBTITLE` (phụ đề có sẵn của video) hoặc `MODEL_TRANSCRIBED` (mô hình nghe và ghi) | `captionSource` |
| model_id | TEXT | Mô hình đọc | `model.modelId` |
| media_sha256 | TEXT | Dấu tệp đã đọc (video hoặc tệp phụ đề; tệp video tự xoá sau 45 ngày) | `media.sha256` |
| media_bytes | INTEGER | Cỡ tệp đó, byte | `media.byteSize` |
| read_at | TEXT | Lúc tải tệp, ISO như đã lưu | `media.downloadedAt` |

`video_segment`: một câu nói hoặc một dòng chữ trên màn hình một dòng. Khoá chính (`capture_id`, `segment_type`, `seq`).

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| capture_id | TEXT | Lần đọc (→ `video_reading`) | — |
| segment_type | TEXT | `speech` hoặc `on_screen` | `segments[]` → `speech`; `onScreenText[]` → `on_screen` |
| seq | INTEGER | Thứ tự trong danh sách của nó, từ 0 | vị trí trong `segments[]` hoặc `onScreenText[]` |
| start_s, end_s | REAL | Giây | `startSeconds`, `endSeconds` |
| text | TEXT | Chữ đúng như đã lưu (không che, không sửa) | `text` |

Không lưu nhận định của AI (chủ duyệt F354, F356): không có cột giọng (`voice`), nguồn gốc (`provenance`), loại video (`videoKind`) hay «có nói về sản phẩm» (`aboutProduct`). Mọi lần đọc đều được nạp, dù app đánh giá thế nào; bộ nạp không lọc.

`raw_capture` của S14: một dòng cho mỗi lần gọi Gemini; `provider` `gemini`, `operation` `videowatch.generate`, `request_params_json` = `requestParameters` của lần gọi (mô hình, loại tệp, cỡ và mã băm; không có tệp video, không có khoá), `billing` như đã lưu, `cost_unit`/`cost_amount` `NULL`. Tệp kẽm: `capture_id` = `S14:<12 ký tự đầu sha256 của tệp>:<số thứ tự bản ghi lần gọi>`. Lượt chạy của app: `S14:<runId>:<ordinal>`. Lần đọc không ghép được với lần gọi nào → cả lần nạp hỏng (`RAW_DB_S14_INVALID_ROW`). Trong cùng một lần chạy, một câu trả lời Gemini cho cùng video đã lưu thành lần đọc (ví dụ nạp một lần từ tệp kẽm, một lần từ app, cùng nhãn `runId`) không lưu thêm lần đọc thứ hai; bộ nạp đếm nó ở `readingsAlreadyPresent`. Câu trả lời giống hệt ở lần chạy khác vẫn tạo lần đọc mới.

S14 điền `video`: dùng lại dòng có cùng `video_id`; nếu chưa có thì thêm một dòng `link_basis` `UNKNOWN`, `product_key` `NULL`, `author_key` như §4.1a. Không đoán sản phẩm. **Thứ tự nạp: S02b trước S14** cho cùng lần chạy. Khi nạp từ lượt chạy của app, một video `TOP_SELLING` chưa có dòng `video` làm cả lần nạp hỏng (`RAW_DB_S14_LOAD_S02B_FIRST`, không ghi gì), để không mất nối sản phẩm của S02b (dòng `video` không sửa được).

Chọn video (chủ duyệt F356, phương án A): app chỉ xem video chủ chọn (`SELECTION`) rồi video bán chạy (`TOP_SELLING`, từ bảng xếp hạng video Kalodata), tối đa 10 video bán chạy và 10 video tất cả. Video từ tìm kiếm Google `site:tiktok.com` không còn được xem; tìm kiếm vẫn chạy và vẫn vào bảng kết quả web của Market. Không có video bán chạy thì không lấy video tìm kiếm thay.

### 4.1a `video` — video và sản phẩm

Một video một dòng, dùng chung cho S07 (bình luận), S14 (lời người bán) và S02b (video bán chạy của Kalodata).

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| video_url | TEXT | Link video, khoá chính | S07 `videoWebUrl`; S14 `video.videoUrl` của lần đọc; S02b `https://www.tiktok.com/@<belonged_creator_handle>/video/<video_id>` |
| video_id | TEXT | Mã video của nền tảng | S14 `video.videoId`; S07 phần số cuối của `videoWebUrl`; S02b `video_id` |
| platform | TEXT | `tiktok` | — |
| product_key | TEXT | Sản phẩm mà video bán. `NULL` khi chưa biết | S02b: `tiktok_shop:` + `product_id` của yêu cầu, khi lần gọi hỏi theo một sản phẩm |
| brand | TEXT | Thương hiệu của sản phẩm | từ `product.brand` |
| author_key | TEXT | HMAC của mã tác giả video | S07, S02b, S14: HMAC-SHA256(khoá, `"tdn:tiktok.com:video-author-handle:v1\0"` + `<handle>` trong link video), cùng khoá với `review.reviewer_key`. S02b không lưu `belonged_creator_id`, handle hay `creator_debut` vào cột nào |
| link_basis | TEXT | Vì sao nối với sản phẩm: `PROVIDER_LINK` (nguồn ghi sẵn), `SELECTED_FROM_PRODUCT` (chọn từ trang sản phẩm), `UNKNOWN` | — |
| capture_id | TEXT | Nguồn gốc | — |

Bình luận S07 nối với sản phẩm qua `review.video_url` → `video.product_key`. Khi `link_basis` là `UNKNOWN`, không đếm bình luận đó theo sản phẩm hay thương hiệu.

Quy tắc bảng `video`: một video chỉ có một dòng. Dòng đã lưu giữ nguyên (bản đầu tiên thắng), dù lần nạp sau có thêm thông tin. `product_key` chỉ có khi nguồn ghi rõ sản phẩm của video và sản phẩm đó đã có trong bảng `product`; không đoán. Lựa chọn video của app hiện chưa ghi sản phẩm, nên mọi video S07 hiện là `UNKNOWN`.

S02b điền `video` như sau: lần gọi `kalodata.video.rank` hỏi theo một sản phẩm (`product_id` trong yêu cầu) → `product_key` = `tiktok_shop:<product_id>`, `link_basis` = `PROVIDER_LINK`. Nếu bảng `product` chưa có sản phẩm đó, bộ nạp thêm một dòng tối thiểu (tên lấy từ `productName` của bản ghi tệp, hoặc từ `kalodata.product.rank` / `kalodata.product.detail` thành công của cùng lần chạy); không có tên thì không tạo sản phẩm và video là `UNKNOWN`. Lần gọi theo từ khoá (không có `product_id`) → `UNKNOWN`. Nếu `video_id` đã có dưới một link khác (ví dụ từ S07), dùng lại link đó, không thêm dòng.

### 4.1b `video_snapshot` — số của một video trong một kỳ (S02b)

Một dòng cho mỗi video trong kết quả xếp hạng của một lần gọi `kalodata.video.rank`. Khoá chính (`capture_id`, `video_url`). Số là ước tính của nguồn cho kỳ `date_range` của yêu cầu.

| Cột | Kiểu | Đơn vị | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|---|
| capture_id | TEXT | — | Lần gọi | — |
| video_url | TEXT | — | Video (→ `video`) | như §4.1a |
| source_code | TEXT | — | `S02b` | — |
| window_start, window_end | TEXT | ngày | Kỳ của số | `date_range` của yêu cầu (`<đầu>~<cuối>`) |
| rank | INTEGER | — | Thứ tự trong kết quả, từ 1 | vị trí dòng trong `data[]` |
| title | TEXT | — | Tên video, giữ đúng như nguồn (không che, không sửa). `NULL` khi thiếu | `video_title` |
| published_at | TEXT | giờ VN | Lúc đăng | `publish_date` `YYYY/MM/DD HH:MM:SS` → ISO `+07:00`; sai dạng → `NULL` |
| revenue_vnd | REAL | đồng | Doanh thu của video trong kỳ | `revenue` |
| revenue_growth_rate | REAL | chưa rõ | Tăng trưởng doanh thu, giữ nguyên số nguồn trả; **đơn vị chưa kiểm** (tỉ lệ hay %) | `revenue_growth_rate` |
| views, likes, shares, comments | INTEGER | lượt | Lượt xem, thích, chia sẻ, bình luận | `views`, `digg_count`, `share_count`, `comment_count` |
| is_ad | INTEGER | 0/1 | Video có chạy quảng cáo | `ad` |
| ad_revenue_share_pct, ad_view_share_pct | REAL | % | Phần doanh thu, phần lượt xem đến từ quảng cáo | `ad_revenue_ratio`, `ad_view_ratio` |
| ads_roas | REAL | lần | Doanh thu trên chi phí quảng cáo | `ads_roas` |
| is_ai_video | INTEGER | 0/1 | Nguồn đánh dấu video do AI tạo | `ai_video` |
| precision | TEXT | — | `provider_estimate` | — |

Số phải hữu hạn và ≥ 0, nếu không thì `NULL` (riêng `revenue_growth_rate` có thể âm). Giá trị không phải số → `NULL`, không bao giờ thành 0.

Lưu ý khi đọc: nhiều dòng có `ad_revenue_share_pct` đúng bằng 80.0. Có lẽ đây là trần của nguồn, không phải số đo; đừng coi 80 là phần doanh thu quảng cáo thật. Đơn vị của `revenue_growth_rate` chưa kiểm.

Một dòng S02b cần `video_id` dạng số và `belonged_creator_handle` thường (chữ, số, `.`, `_`), như bộ đọc của app; thiếu thì cả lần nạp hỏng (`RAW_DB_S02B_INVALID_ROW`), không ghi gì. Lần gọi bị nguồn từ chối (ví dụ mã 501 của lần chạy f0f4799a) chỉ có dòng `raw_capture` với `outcome` = `FAILED`. `raw_capture` của S02b: `provider` `kalodata`, `cost_unit` `kalodata_points`, `cost_amount` `NULL`, `period_start`/`period_end` = kỳ `date_range`.

Tệp có `declare.responseSha256Basis` = `canonical-json` thì bộ nạp kiểm `responseSha256` theo JSON chuẩn hoá của `response`; không khai báo thì giữ mã băm được cung cấp. Khai báo cách băm khác bị từ chối. Capture của lần chạy bị cắt ngắn cũng bị từ chối, không nạp một phần.

### 4.2 `ad_read` và `ad` — quảng cáo (S15, S16, S17)

`ad_read`: một lần đọc một thương hiệu hoặc một từ khoá.

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| source_code | TEXT | S15, S16, S17 | — |
| query | TEXT | Thương hiệu hoặc từ khoá | S15 `brands[].label`; S16 `keyword` |
| status | TEXT | `READ`, `STOPPED`, `NOT_READ`, `NOT_COLLECTED` | `brands[].status`, `status` |
| stop_reason | TEXT | `BLOCKED`, `LOGIN_REQUIRED`, `NO_BRANDS`… | `stop`, `reads[].stop` |
| result_count | INTEGER | Số quảng cáo trang báo (`NULL` = không đọc được) | `brands[].resultCount` |
| final_url | TEXT | Trang đã mở | `reads[].finalUrl` |
| read_at | TEXT | Lúc đọc | `reads[].readAt` |
| reason_vi | TEXT | Lý do dừng, tiếng Việt | `reasonVi` |
| capture_id | TEXT | Nguồn gốc | — |

`ad`: `ad_id`, `source_code`, `advertiser`, `caption`, `started_on`, `ended_on`, `active`, `media_type`, `landing_url`, `capture_id`. Bộ kẽm hiện có 0 dòng `ad`.

### 4.3 `web_result` — kết quả tìm kiếm (S19, S13, S26, S25)

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| query | TEXT | Câu tìm | `requestParameters.q` |
| result_type | TEXT | `organic`, `related_question`, `related_search`, `pdf_candidate` | tên khối |
| position | INTEGER | Thứ hạng | `organic_results[].position` |
| title | TEXT | Tiêu đề | `.title`, `related_questions[].question` |
| link | TEXT | Link | `.link` |
| site | TEXT | Tên trang | `.source` |
| snippet | TEXT | Đoạn trích | `.snippet` |
| capture_id | TEXT | Nguồn gốc | — |

### 4.4 `search_suggestion` — gợi ý tìm kiếm (S19b)

Mỗi lần gọi một tiền tố là một dòng `raw_capture` (`provider` = `google-suggest`, `operation` = `google.suggest`, `cost_amount` = 0 USD).

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| prefix | TEXT | Tiền tố đã gõ | phản hồi `[0]`, hoặc `records[].prefix` |
| rank | INTEGER | Thứ tự gợi ý, từ 1 | vị trí trong phản hồi `[1]` + 1 |
| suggestion | TEXT | Câu gợi ý | phản hồi `[1][i]`, hoặc `records[].suggestions[i]` |
| collected_at | TEXT | Lúc thu | `retrieved_at` của lần thu, hoặc `records[].requestedAt` |
| capture_id | TEXT | Nguồn gốc | — |

- Danh sách gợi ý rỗng: `raw_capture.outcome` = `EMPTY`, không có dòng. Bản ghi tệp có `httpStatus` khác 200: `FAILED`, không có dòng.
- `raw_capture.keyword` = từ gốc của tiền tố (từ khoá 1 hoặc 2 của lượt chạy).
- Chỉ là ý định tìm. Không có lượng tìm. Chỉ đọc chủ đề, không đếm.

### 4.5 `ai_overview_block` và `ai_overview_reference` — Google AI Overview (S29)

Mỗi phản hồi S19 có khoá `ai_overview` là một dòng `raw_capture` (`provider` = `serpapi`, `billing` = `PAID_SEARCH_UNLESS_CACHED`, `cost_amount` = `NULL` vì lượt gọi đã tính ở S19 hoặc ở mức dùng của app).

- Câu trả lời: `ai_overview` trong phản hồi S19 khi có `text_blocks`. Nếu chỉ có `page_token`: phản hồi `google_ai_overview` của cùng lượt chạy có `search_parameters.page_token` trùng. Không có cả hai: `outcome` = `NOT_COLLECTED`, không có dòng.
- `raw_capture.operation` = lệnh của lần thu mang câu trả lời. `request_params_json` = `{query, aiOverviewState, pageTokenPresent, sharedWithS19}`.

`ai_overview_block`:

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| query | TEXT | Câu tìm | `search_parameters.q`, hoặc `records[].query` |
| block_seq | INTEGER | Thứ tự trong câu trả lời sau khi tách, từ 0 | — |
| block_type | TEXT | `heading`, `paragraph`, `list_item` | `text_blocks[].type`; mỗi phần tử của `list[]` là một dòng `list_item` |
| text | TEXT | Nội dung | `.snippet` |
| reference_indexes | TEXT | Chỉ số nguồn (mảng JSON), `NULL` nếu không có | `.reference_indexes` |
| capture_id | TEXT | Nguồn gốc | — |

Loại khối khác `heading`, `paragraph`, `list` làm hỏng cả lần nạp (không bỏ qua im lặng).

`ai_overview_reference`:

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| query | TEXT | Câu tìm | như trên |
| ref_index | INTEGER | Chỉ số nguồn | `references[].index` |
| title | TEXT | Tiêu đề | `.title` |
| link | TEXT | Link | `.link` |
| site | TEXT | Tên trang | `.source` |
| snippet | TEXT | Đoạn trích | `.snippet` |
| capture_id | TEXT | Nguồn gốc | — |

Mọi dòng mang nhãn giả thuyết, mức Yếu. Không dùng làm bằng chứng.

### 4.6 `search_interest` — mức quan tâm tìm kiếm (S20, S20b)

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| keyword | TEXT | Từ khoá | `values[].query` |
| geo | TEXT | `VN` hoặc mã tỉnh `VN-09` | `geo` |
| geo_name | TEXT | Tên tỉnh | `location` |
| period_start, period_end | TEXT | Kỳ của điểm số | `timestamp` (tuần) hoặc kỳ 12 tháng (theo tỉnh) |
| granularity | TEXT | `week` hoặc `region_12m` | — |
| index_value | INTEGER | Chỉ số 0–100. Không phải số người | `extracted_value` |
| capture_id | TEXT | Nguồn gốc | — |

### 4.7 `official_stat` — số liệu chính thức (S21, S22, S23)

| Cột | Kiểu | Nghĩa | Lấy từ bản gốc |
|---|---|---|---|
| source_code | TEXT | S21, S22, S23 | — |
| indicator_id | TEXT | Mã chỉ số | S23 `indicator.id`; S21/S22 tên bảng + nhãn dòng |
| indicator_name | TEXT | Tên chỉ số | S23 `indicator.value` |
| area | TEXT | `VN` hoặc tỉnh | S23 `countryiso3code`; S22 tên tỉnh |
| period | TEXT | Năm hoặc tháng | S23 `date`; S21 tháng trong tên tệp |
| value | REAL | Con số | S23 `value` |
| unit | TEXT | Đơn vị | S23 `unit` (trống thì xem `indicator_name`) |
| document_url | TEXT | Tệp gốc (S21, S22) | `records[].url` |
| capture_id | TEXT | Nguồn gốc | — |

### 4.8 `trade_flow` — thương mại quốc tế (S24)

`reporter_iso`, `reporter_name`, `partner_iso`, `flow` (`X` xuất, `M` nhập), `hs_code`, `hs_desc`, `year`, `value_usd` (`primaryValue`), `net_weight_kg` (`netWgt`), `qty`, `qty_unit` (`qtyUnitAbbr`), `is_estimated` (`isQtyEstimated`), `capture_id`.

### 4.9 `document` — tài liệu PDF (S25)

`document_id`, `url`, `title`, `site`, `found_by_query`, `position`, `sha256`, `byte_size`, `stored` (1 = có tệp trong kho riêng), `relevance` (`relevant`, `weak`, `unrelated`, chấm sau), `capture_id`.

### 4.10 `persona_baseline` và `persona_sample` — hồ sơ người Việt tổng hợp (S28)

`persona_baseline`: `sex`, `age_band` (10 = 10–19 tuổi), `zone` (thành thị / nông thôn), `region`, `n`.
`persona_sample`: `uuid`, `sex`, `age`, `marital_status`, `education_level`, `occupation`, `zone`, `region`, `persona` (mô tả), `hobbies_and_interests`, `cultural_background`.
Dữ liệu tổng hợp. Không phải người thật. Không nêu tên nguồn trong báo cáo.

## 5. Câu lệnh SQL (SQLite)

### 5.0 Thứ tự nạp và tự nạp sau mỗi lần chạy (chủ quyết F368, F389)

- **Thứ tự nạp của một lần chạy:** S05, S06, S07, S02b, S14, S19b, S29 (S02b trước S14, §4.1), rồi gán chủ đề cho đánh giá sản phẩm của lần chạy (S05, S06; §3.3). Nguồn nào lần chạy không có thì bỏ qua (`SKIPPED_NO_CAPTURES`).
- **Khi nào app tự nạp:** khi `TDN_RAW_DB_AUTOLOAD_ENABLED=true` (không đặt thì tắt), ngay khi bước `COLLECTION` của lần chạy xong với `SUCCEEDED` hoặc `PARTIAL` và lần chạy chuyển sang dựng báo cáo; việc nạp chạy sau khi giao dịch đó đã ghi, trên kết nối riêng. Bước `REPORTS` hỏng sau đó (ví dụ `MARKET_NUMBER_TRACE_BLOCKED`) không chặn và không xoá phần đã nạp; việc nạp không đổi trạng thái, kết quả, báo cáo hay giờ chạy của lần chạy và của bước `REPORTS`. Bước thu `FAILED`, `UNAVAILABLE`, `CANCELLED` hoặc bị bỏ thì không tự nạp.
- **Mỗi nguồn riêng:** dùng bộ nạp `--run` sẵn có (không `--file`). Một nguồn lỗi không dừng nguồn sau; kết quả từng nguồn ghi riêng. S07, S02b, S14 đọc khoá riêng tư như lệnh CLI (`TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE`); thiếu khoá thì nguồn đó `SKIPPED_NO_PRIVACY_KEY`, nguồn khác vẫn chạy.
- **Gán chủ đề:** Jev tắt thì vẫn nạp, `labelling` = `SKIPPED_JEV_DISABLED`. Số lần gọi tối đa = `limits.maxCallsPerRun` của bộ chủ đề. Lượt gán giữ khoá `raw-db-labels.lock.sqlite`; đang bận thì ghi `LABELS_BUSY`, lần chạy sau hoặc lệnh `AUTOLOAD` gán tiếp.
- **Ghi lại:** mỗi lần thử một dòng `raw_db_autoload` (chỉ thêm, không sửa, không xoá): `run_id`, `origin` (`APP` hoặc `CLI`), `started_at`, `finished_at`, một JSON kết quả cho mỗi nguồn (`s05` … `s29`: `LOADED` kèm số dòng, `SKIPPED_NO_CAPTURES`, `SKIPPED_NO_PRIVACY_KEY` hoặc `FAILED` kèm mã lỗi) và `labelling`. Sau mỗi lần thử, app chép bản chụp `app-db.snapshot.sqlite` (§3.3 mục 7). App đang chạy (máy chủ có quyền ghi, khi bật cờ) còn chép bản chụp mỗi 10 phút; đang chép thì bỏ lượt đó.
- **Bằng tay:** `raw-db-load --source AUTOLOAD --run <id> [--privacy-file <path>] [--dry-run]` chạy cùng chuỗi cho lần chạy cũ hoặc để thử lại; `--dry-run` không ghi gì. Lần chạy đã dựng báo cáo trước khi bật cờ, hoặc app tắt giữa chừng, thì dùng lệnh này.

```sql
PRAGMA foreign_keys = ON;

CREATE TABLE raw_capture (
  capture_id          TEXT PRIMARY KEY,
  run_id              TEXT,
  source_code         TEXT NOT NULL,
  provider            TEXT NOT NULL,
  operation           TEXT NOT NULL,
  endpoint            TEXT,
  request_params_json TEXT,
  keyword             TEXT,
  period_start        TEXT,
  period_end          TEXT,
  requested_at        TEXT NOT NULL,
  completed_at        TEXT,
  http_status         INTEGER,
  outcome             TEXT NOT NULL CHECK (outcome IN ('OK','EMPTY','PROVIDER_REJECTED','BLOCKED','LOGIN_REQUIRED','FAILED','NOT_COLLECTED')),
  billing             TEXT,
  cost_unit           TEXT,
  cost_amount         REAL,
  response_sha256     TEXT,
  raw_path            TEXT,
  response_sha256_basis TEXT CHECK (response_sha256_basis IN ('ORIGINAL_BYTES','RETAINED_ENVELOPE','CANONICAL_JSON','SUPPLIED_FILE'))
);
-- Migration 0071: a response_sha256 always says what it covers.
CREATE TRIGGER raw_capture_basis_required BEFORE INSERT ON raw_capture
WHEN NEW.response_sha256 IS NOT NULL AND NEW.response_sha256_basis IS NULL
BEGIN SELECT RAISE(ABORT,'raw_db_v1_raw_capture_basis_missing'); END;

CREATE TABLE product (
  product_key      TEXT PRIMARY KEY,
  platform         TEXT NOT NULL CHECK (platform IN ('shopee','tiktok_shop')),
  item_id          TEXT NOT NULL,
  shop_id          TEXT,
  shop_name        TEXT,
  product_name     TEXT NOT NULL,
  brand            TEXT,
  category_path    TEXT,
  product_url      TEXT,
  launch_date      TEXT,
  first_capture_id TEXT NOT NULL REFERENCES raw_capture(capture_id),
  UNIQUE (platform, item_id)
);

CREATE TABLE product_snapshot (
  product_key          TEXT NOT NULL REFERENCES product(product_key),
  source_code          TEXT NOT NULL CHECK (source_code IN ('S01','S02')),
  window_start         TEXT NOT NULL,
  window_end           TEXT NOT NULL,
  revenue_vnd          REAL,
  units                INTEGER,
  prev_revenue_vnd     REAL,
  prev_units           INTEGER,
  price_vnd            REAL,
  price_min_vnd        REAL,
  price_max_vnd        REAL,
  lifetime_revenue_vnd REAL,
  lifetime_units       INTEGER,
  rating_avg           REAL,
  rating_count         INTEGER,
  live_revenue_vnd     REAL,
  video_revenue_vnd    REAL,
  showcase_revenue_vnd REAL,
  creator_count        INTEGER,
  video_count          INTEGER,
  live_count           INTEGER,
  commission_rate_pct  REAL,
  precision            TEXT NOT NULL DEFAULT 'provider_estimate',
  capture_id           TEXT NOT NULL REFERENCES raw_capture(capture_id),
  source_position      TEXT,
  PRIMARY KEY (product_key, source_code, window_start, window_end, capture_id)
);

CREATE TABLE market_kpi (
  metric         TEXT NOT NULL,
  platform       TEXT NOT NULL CHECK (platform IN ('shopee','tiktok_shop','all')),
  value          REAL,
  displayed      TEXT,
  unit           TEXT NOT NULL,
  precision      TEXT NOT NULL,
  period_start   TEXT NOT NULL,
  period_end     TEXT NOT NULL,
  source_pointer TEXT,
  capture_id     TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE market_group_row (
  group_name   TEXT NOT NULL,
  row_rank     INTEGER,
  label        TEXT,
  metric       TEXT NOT NULL,
  value        REAL,
  unit         TEXT,
  precision    TEXT,
  platform     TEXT,
  period_start TEXT,
  period_end   TEXT,
  capture_id   TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE review (
  review_key             TEXT PRIMARY KEY,
  source_code            TEXT NOT NULL CHECK (source_code IN ('S05','S06','S07')),
  platform               TEXT NOT NULL CHECK (platform IN ('shopee','tiktok_shop','tiktok')),
  kind                   TEXT NOT NULL CHECK (kind IN ('product_review','video_comment')),
  external_id            TEXT NOT NULL,
  product_key            TEXT REFERENCES product(product_key),
  video_url              TEXT,
  reviewer_key           TEXT,
  reviewer_name          TEXT,  -- private DB only; never exported or printed
  reviewer_name_state    TEXT NOT NULL CHECK (reviewer_name_state IN ('real','masked_by_source','not_provided')),
  rating_star            INTEGER CHECK (rating_star BETWEEN 1 AND 5),
  text                   TEXT,
  variation              TEXT,
  attributes_json        TEXT,
  posted_at              TEXT,
  like_count             INTEGER,
  reply_count            INTEGER,
  replies_to_external_id TEXT,
  media_count            INTEGER,
  state                  TEXT NOT NULL DEFAULT 'VALID',  -- VALID, HIDDEN, DELETED (trigger review_state_check, migration 0071)
  collected_at           TEXT NOT NULL,
  capture_id             TEXT NOT NULL REFERENCES raw_capture(capture_id),
  source_position        TEXT NOT NULL,
  UNIQUE (source_code, external_id),
  CHECK (kind = 'video_comment' OR product_key IS NOT NULL),
  CHECK (kind = 'product_review' OR video_url IS NOT NULL)
);
CREATE INDEX review_by_product  ON review(product_key);
CREATE INDEX review_by_reviewer ON review(reviewer_key);

CREATE TRIGGER review_state_check BEFORE INSERT ON review
WHEN NEW.state NOT IN ('VALID','HIDDEN','DELETED')
BEGIN SELECT RAISE(ABORT,'raw_db_v1_review_state'); END;

CREATE TABLE product_name_source (
  product_key     TEXT PRIMARY KEY REFERENCES product(product_key),
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('METRIC_LIST','APP_CAPTURE','RAW_CAPTURE')),
  artifact_sha256 TEXT,
  capture_id      TEXT REFERENCES raw_capture(capture_id),
  json_path       TEXT NOT NULL,
  recorded_at     TEXT NOT NULL,
  CHECK (source_kind NOT IN ('METRIC_LIST','APP_CAPTURE') OR (artifact_sha256 IS NOT NULL AND capture_id IS NULL)),
  CHECK (source_kind <> 'RAW_CAPTURE' OR (capture_id IS NOT NULL AND artifact_sha256 IS NULL))
);

CREATE TABLE run_review (
  run_id          TEXT NOT NULL,
  review_key      TEXT NOT NULL REFERENCES review(review_key),
  capture_id      TEXT NOT NULL REFERENCES raw_capture(capture_id),
  source_position TEXT,
  PRIMARY KEY (run_id, review_key)
);

CREATE TABLE codebook (
  codebook_version  TEXT PRIMARY KEY,
  contract_version  TEXT NOT NULL,
  status            TEXT NOT NULL CHECK (status IN ('DRAFT','APPROVED')),
  approved_by       TEXT,
  approved_at       TEXT,
  definition_json   TEXT NOT NULL,
  definition_sha256 TEXT NOT NULL,
  loaded_at         TEXT NOT NULL,
  CHECK ((status = 'DRAFT' AND approved_by IS NULL AND approved_at IS NULL)
      OR (status = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE review_code (
  review_key       TEXT NOT NULL REFERENCES review(review_key),
  codebook_version TEXT NOT NULL REFERENCES codebook(codebook_version),
  theme_code       TEXT NOT NULL,
  block_key        TEXT,
  polarity         TEXT CHECK (polarity IN ('khen','che','ke','khong_ro_huong')),
  journey_step     TEXT,
  status           TEXT NOT NULL CHECK (status IN ('kept','unclear')),
  confidence       REAL CHECK (confidence BETWEEN 0 AND 1),
  coder            TEXT NOT NULL,
  text_sha256      TEXT NOT NULL,
  coded_at         TEXT NOT NULL,
  origin           TEXT NOT NULL CHECK (origin IN ('MCP_IMPORT','APP_JEV')),
  import_sha256    TEXT NOT NULL,
  PRIMARY KEY (review_key, codebook_version, theme_code),
  CHECK (CASE WHEN theme_code = 'NO_THEME'
              THEN polarity IS NULL AND journey_step IS NULL AND confidence IS NULL AND status = 'kept'
              ELSE polarity IS NOT NULL AND journey_step IS NOT NULL END)
);
CREATE INDEX review_code_by_theme ON review_code(codebook_version, theme_code);
-- Không phải bảng: lượt gán và lượt nhập CODES giữ khoá ở tệp riêng <thư mục>/raw-db-labels.lock.sqlite (BEGIN EXCLUSIVE),
-- và bản chụp cho MCP Insight nằm ở <thư mục>/app-db-snapshot/app-db.snapshot.sqlite (§3.3 mục 6, 7).

CREATE TABLE video (
  video_url   TEXT PRIMARY KEY,
  video_id    TEXT,
  platform    TEXT NOT NULL DEFAULT 'tiktok',
  product_key TEXT REFERENCES product(product_key),
  brand       TEXT,
  author_key  TEXT,
  link_basis  TEXT NOT NULL CHECK (link_basis IN ('PROVIDER_LINK','SELECTED_FROM_PRODUCT','UNKNOWN')),
  capture_id  TEXT NOT NULL REFERENCES raw_capture(capture_id),
  CHECK (link_basis = 'UNKNOWN' OR product_key IS NOT NULL)
);

CREATE TABLE video_snapshot (
  capture_id           TEXT NOT NULL REFERENCES raw_capture(capture_id),
  video_url            TEXT NOT NULL REFERENCES video(video_url),
  source_code          TEXT NOT NULL CHECK (source_code = 'S02b'),
  window_start         TEXT NOT NULL,
  window_end           TEXT NOT NULL,
  rank                 INTEGER NOT NULL CHECK (rank >= 1),
  title                TEXT,
  published_at         TEXT,
  revenue_vnd          REAL CHECK (revenue_vnd BETWEEN 0 AND 1.7976931348623157e308),
  revenue_growth_rate  REAL CHECK (revenue_growth_rate BETWEEN -1.7976931348623157e308 AND 1.7976931348623157e308),
  views                INTEGER CHECK (views >= 0),
  likes                INTEGER CHECK (likes >= 0),
  shares               INTEGER CHECK (shares >= 0),
  comments             INTEGER CHECK (comments >= 0),
  is_ad                INTEGER CHECK (is_ad IN (0,1)),
  ad_revenue_share_pct REAL CHECK (ad_revenue_share_pct BETWEEN 0 AND 1.7976931348623157e308),
  ad_view_share_pct    REAL CHECK (ad_view_share_pct BETWEEN 0 AND 1.7976931348623157e308),
  ads_roas             REAL CHECK (ads_roas BETWEEN 0 AND 1.7976931348623157e308),
  is_ai_video          INTEGER CHECK (is_ai_video IN (0,1)),
  precision            TEXT NOT NULL CHECK (precision = 'provider_estimate'),
  PRIMARY KEY (capture_id, video_url)
) STRICT;

CREATE TABLE review_point (
  point_id       TEXT PRIMARY KEY,
  product_key    TEXT NOT NULL REFERENCES product(product_key),
  kind           TEXT NOT NULL CHECK (kind IN ('pain','positive','usage_scenario','summary')),
  text_vi        TEXT NOT NULL,
  text_zh        TEXT,
  review_count   INTEGER,
  key_review_key TEXT,
  capture_id     TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE video_reading (
  capture_id     TEXT PRIMARY KEY REFERENCES raw_capture(capture_id),
  video_url      TEXT NOT NULL REFERENCES video(video_url),
  origin         TEXT NOT NULL CHECK (origin IN ('SELECTION','TOP_SELLING','EXPANDED_SEARCH')),
  duration_s     REAL CHECK (duration_s BETWEEN 0 AND 1.7976931348623157e308),
  caption_source TEXT NOT NULL CHECK (caption_source IN ('NATIVE_SUBTITLE','MODEL_TRANSCRIBED')),
  model_id       TEXT NOT NULL,
  media_sha256   TEXT,
  media_bytes    INTEGER CHECK (media_bytes >= 0),
  read_at        TEXT NOT NULL
) STRICT;

CREATE TABLE video_segment (
  capture_id   TEXT NOT NULL REFERENCES video_reading(capture_id),
  segment_type TEXT NOT NULL CHECK (segment_type IN ('speech','on_screen')),
  seq          INTEGER NOT NULL CHECK (seq >= 0),
  start_s      REAL CHECK (start_s BETWEEN 0 AND 1.7976931348623157e308),
  end_s        REAL CHECK (end_s BETWEEN 0 AND 1.7976931348623157e308),
  text         TEXT NOT NULL,
  PRIMARY KEY (capture_id, segment_type, seq)
) STRICT;

CREATE TABLE ad_read (
  source_code  TEXT NOT NULL CHECK (source_code IN ('S15','S16','S17')),
  query        TEXT NOT NULL,
  status       TEXT NOT NULL,
  stop_reason  TEXT,
  result_count INTEGER,
  final_url    TEXT,
  read_at      TEXT,
  reason_vi    TEXT,
  capture_id   TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE ad (
  ad_id       TEXT NOT NULL,
  source_code TEXT NOT NULL CHECK (source_code IN ('S15','S16','S17')),
  advertiser  TEXT,
  caption     TEXT,
  started_on  TEXT,
  ended_on    TEXT,
  active      INTEGER,
  media_type  TEXT,
  landing_url TEXT,
  capture_id  TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (source_code, ad_id)
);

CREATE TABLE web_result (
  query       TEXT NOT NULL,
  result_type TEXT NOT NULL CHECK (result_type IN ('organic','related_question','related_search','pdf_candidate')),
  position    INTEGER,
  title       TEXT,
  link        TEXT,
  site        TEXT,
  snippet     TEXT,
  capture_id  TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE search_suggestion (
  prefix       TEXT NOT NULL,
  rank         INTEGER NOT NULL,
  suggestion   TEXT NOT NULL,
  collected_at TEXT NOT NULL,
  capture_id   TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, prefix, rank)
);

CREATE TABLE ai_overview_block (
  query             TEXT NOT NULL,
  block_seq         INTEGER NOT NULL,
  block_type        TEXT CHECK (block_type IN ('heading','paragraph','list_item')),
  text              TEXT,
  reference_indexes TEXT,
  capture_id        TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, block_seq)
);

CREATE TABLE ai_overview_reference (
  query      TEXT NOT NULL,
  ref_index  INTEGER NOT NULL,
  title      TEXT,
  link       TEXT,
  site       TEXT,
  snippet    TEXT,
  capture_id TEXT NOT NULL REFERENCES raw_capture(capture_id),
  PRIMARY KEY (capture_id, ref_index)
);

CREATE TABLE search_interest (
  keyword      TEXT NOT NULL,
  geo          TEXT NOT NULL,
  geo_name     TEXT,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  granularity  TEXT NOT NULL CHECK (granularity IN ('week','region_12m')),
  index_value  INTEGER CHECK (index_value BETWEEN 0 AND 100),
  capture_id   TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE official_stat (
  source_code    TEXT NOT NULL CHECK (source_code IN ('S21','S22','S23')),
  indicator_id   TEXT NOT NULL,
  indicator_name TEXT,
  area           TEXT NOT NULL,
  period         TEXT NOT NULL,
  value          REAL,
  unit           TEXT,
  document_url   TEXT,
  capture_id     TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE trade_flow (
  reporter_iso  TEXT NOT NULL,
  reporter_name TEXT,
  partner_iso   TEXT NOT NULL,
  flow          TEXT NOT NULL CHECK (flow IN ('X','M')),
  hs_code       TEXT NOT NULL,
  hs_desc       TEXT,
  year          INTEGER NOT NULL,
  value_usd     REAL,
  net_weight_kg REAL,
  qty           REAL,
  qty_unit      TEXT,
  is_estimated  INTEGER,
  capture_id    TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE document (
  document_id    TEXT PRIMARY KEY,
  url            TEXT NOT NULL,
  title          TEXT,
  site           TEXT,
  found_by_query TEXT,
  position       INTEGER,
  sha256         TEXT,
  byte_size      INTEGER,
  stored         INTEGER NOT NULL DEFAULT 0,
  relevance      TEXT CHECK (relevance IN ('relevant','weak','unrelated')),
  capture_id     TEXT NOT NULL REFERENCES raw_capture(capture_id)
);

CREATE TABLE persona_baseline (
  sex      TEXT NOT NULL,
  age_band INTEGER NOT NULL,
  zone     TEXT NOT NULL,
  region   TEXT,
  n        INTEGER NOT NULL
);

CREATE TABLE persona_sample (
  uuid                  TEXT PRIMARY KEY,
  sex                   TEXT,
  age                   INTEGER,
  marital_status        TEXT,
  education_level       TEXT,
  occupation            TEXT,
  zone                  TEXT,
  region                TEXT,
  persona               TEXT,
  hobbies_and_interests TEXT,
  cultural_background   TEXT
);

-- Per product: link, reviews on the platform, reviews collected.
CREATE VIEW review_coverage AS
SELECT p.product_key,
       p.product_name,
       p.product_url,
       (SELECT s.rating_count FROM product_snapshot s
          WHERE s.product_key = p.product_key AND s.rating_count IS NOT NULL
          ORDER BY s.window_end DESC LIMIT 1)                    AS reviews_on_platform,
       (SELECT count(*) FROM review r WHERE r.product_key = p.product_key) AS reviews_collected,
       (SELECT count(DISTINCT r.reviewer_key) FROM review r
          WHERE r.product_key = p.product_key)                   AS distinct_reviewers,
       (SELECT count(*) FROM review r
          WHERE r.product_key = p.product_key AND r.reviewer_key IS NULL) AS reviews_without_writer
FROM product p;

-- Writers per product under rule L2: a review without a writer key counts as one writer.
CREATE VIEW writer_count AS
SELECT r.platform,
       r.product_key,
       count(DISTINCT r.reviewer_key) + sum(r.reviewer_key IS NULL) AS writers,
       sum(r.reviewer_key IS NULL) > 0                               AS counted_by_review
FROM review r
WHERE r.product_key IS NOT NULL
GROUP BY r.platform, r.product_key;

-- Star sentiment (F363): 1–3 stars → tieu_cuc, 4–5 → tich_cuc, no star → NULL. Derived, never copied.
CREATE VIEW review_star_sentiment AS
SELECT r.review_key, r.source_code, r.platform, r.product_key, r.rating_star,
       CASE WHEN r.rating_star BETWEEN 1 AND 3 THEN 'tieu_cuc'
            WHEN r.rating_star BETWEEN 4 AND 5 THEN 'tich_cuc' END AS star_sentiment
FROM review r;

CREATE TABLE raw_db_autoload (
  attempt_id  INTEGER PRIMARY KEY,
  run_id      TEXT NOT NULL REFERENCES analysis_research_automation_runs(run_id),
  origin      TEXT NOT NULL CHECK (origin IN ('APP','CLI')),
  started_at  TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  s05         TEXT NOT NULL CHECK (json_valid(s05)),
  s06         TEXT NOT NULL CHECK (json_valid(s06)),
  s07         TEXT NOT NULL CHECK (json_valid(s07)),
  s02b        TEXT NOT NULL CHECK (json_valid(s02b)),
  s14         TEXT NOT NULL CHECK (json_valid(s14)),
  s19b        TEXT NOT NULL CHECK (json_valid(s19b)),
  s29         TEXT NOT NULL CHECK (json_valid(s29)),
  labelling   TEXT NOT NULL CHECK (json_valid(labelling)),
  CHECK (finished_at >= started_at)
);
CREATE INDEX raw_db_autoload_by_run ON raw_db_autoload(run_id, attempt_id);

-- Example: kept theme labels per theme for one product and codebook version (NO_THEME = coded, no theme).
SELECT c.theme_code, c.polarity, count(*) AS reviews
FROM review_code c JOIN review r ON r.review_key = c.review_key
WHERE r.product_key = 'shopee:2308735412' AND c.codebook_version = '2026-10-30.4' AND c.status = 'kept'
GROUP BY c.theme_code, c.polarity
ORDER BY reviews DESC;

-- Example: star sentiment counts per product.
SELECT product_key, star_sentiment, count(*) AS reviews
FROM review_star_sentiment
WHERE product_key IS NOT NULL
GROUP BY product_key, star_sentiment;
```

## 6. Điều còn để ngỏ

- **Mã người viết Shopee:** bộ thu gói S chưa giữ mã tác giả. Change `shopee-public-review-writer-key` chờ chủ duyệt. Cách băm dùng lại cách của bộ thu riêng cũ (`shopee-author-id-hmac-v1`).
- **Nối video với sản phẩm (S07):** bộ kẽm chưa có dữ liệu nối. Mọi video của bộ kẽm có `link_basis` = `UNKNOWN`.
- **`review_code` của bộ kẽm:** nhập từ kho của lần chạy MCP 30/10 bằng `--source CODES` (§3.3). Đánh giá chưa có nhãn được app gán bằng `--source LABELS` (§3.3, `APP_JEV`). Bộ công khai `kem-2910` đã đổi mã đánh giá thành `anon-…`, nên nhãn chỉ khớp với `review` của cơ sở dữ liệu app (mã thật).
- **Duyệt bộ chủ đề:** bảng `codebook` cho phép `DRAFT` → `APPROVED`, nhưng chưa có lệnh duyệt.
- **Bảng tính Cục Thống kê (S21, S22):** mỗi tệp có nhiều bảng con. Bản này chỉ định khuôn chung `official_stat`. Cách đọc từng bảng con theo bộ đọc của app.
- **Bảng `ad`:** bộ kẽm chưa có quảng cáo nào đọc được, nên các cột của bảng `ad` là đề xuất. Cần kiểm lại khi có lượt đọc thật.

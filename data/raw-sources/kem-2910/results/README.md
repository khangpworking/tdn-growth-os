# Từng kết quả gốc — viên kẽm (kem-raw-result-v1)

Mỗi tệp dưới đây là **một kết quả gốc**: một lần tìm Google, một bản AI Overview, một lần gọi API, đánh giá của một sản phẩm, bình luận của một video.
Mỗi tệp có `declare` (nguồn, tệp mẹ, vị trí trong tệp mẹ, kỳ, giới hạn, `resultSha256`) và `result` (nội dung gốc, giữ nguyên).
Đã ẩn danh như tệp mẹ (xem README của thư mục cha, mục 4). Tạo lại bằng `python3 tools/split_results.py .`; kiểm bằng `--check`.


## 01 · S01 · Số bán ước tính trên sàn (Shopee + TikTok Shop)

| Tệp | Nội dung |
|---|---|
| [001-capture-snapshot-json.json](01-S01-metric-so-ban-shopee-tiktok/001-capture-snapshot-json.json) | Metric: capture/snapshot.json |
| [002-capture-manifest-json.json](01-S01-metric-so-ban-shopee-tiktok/002-capture-manifest-json.json) | Metric: capture/manifest.json |
| [003-capture-context-json.json](01-S01-metric-so-ban-shopee-tiktok/003-capture-context-json.json) | Metric: capture/context.json |
| [004-normalized-automation-metric-source-capture-json.json](01-S01-metric-so-ban-shopee-tiktok/004-normalized-automation-metric-source-capture-json.json) | Metric: normalized/automation-metric-source-capture.json |
| [005-api-market-add-on-40.json](01-S01-metric-so-ban-shopee-tiktok/005-api-market-add-on-40.json) | Metric API GET /market/add_on (thứ tự 40) |
| [006-api-market-search-basic-46.json](01-S01-metric-so-ban-shopee-tiktok/006-api-market-search-basic-46.json) | Metric API GET /market/search_basic (thứ tự 46) |
| [007-api-market-search-body-history-91.json](01-S01-metric-so-ban-shopee-tiktok/007-api-market-search-body-history-91.json) | Metric API GET /market/search_body/history (thứ tự 91) |
| [008-api-v2-market-analytics-search-basic-94.json](01-S01-metric-so-ban-shopee-tiktok/008-api-v2-market-analytics-search-basic-94.json) | Metric API POST /v2/market/analytics/search-basic/ (thứ tự 94) |
| [009-api-v2-market-analytics-products-123.json](01-S01-metric-so-ban-shopee-tiktok/009-api-v2-market-analytics-products-123.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 123) |
| [010-api-v2-market-analytics-shops-124.json](01-S01-metric-so-ban-shopee-tiktok/010-api-v2-market-analytics-shops-124.json) | Metric API POST /v2/market/analytics/shops/ (thứ tự 124) |
| [011-api-v2-market-analytics-groups-125.json](01-S01-metric-so-ban-shopee-tiktok/011-api-v2-market-analytics-groups-125.json) | Metric API POST /v2/market/analytics/groups/ (thứ tự 125) |
| [012-api-market-keywords-search-175.json](01-S01-metric-so-ban-shopee-tiktok/012-api-market-keywords-search-175.json) | Metric API GET /market/keywords/search (thứ tự 175) |
| [013-api-v2-market-analytics-search-basic-196.json](01-S01-metric-so-ban-shopee-tiktok/013-api-v2-market-analytics-search-basic-196.json) | Metric API POST /v2/market/analytics/search-basic/ (thứ tự 196) |
| [014-api-v2-market-analytics-insight-204.json](01-S01-metric-so-ban-shopee-tiktok/014-api-v2-market-analytics-insight-204.json) | Metric API POST /v2/market/analytics/insight/ (thứ tự 204) |
| [015-api-v2-market-analytics-products-206.json](01-S01-metric-so-ban-shopee-tiktok/015-api-v2-market-analytics-products-206.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 206) |
| [016-api-v2-market-analytics-shops-207.json](01-S01-metric-so-ban-shopee-tiktok/016-api-v2-market-analytics-shops-207.json) | Metric API POST /v2/market/analytics/shops/ (thứ tự 207) |
| [017-api-v2-market-analytics-groups-208.json](01-S01-metric-so-ban-shopee-tiktok/017-api-v2-market-analytics-groups-208.json) | Metric API POST /v2/market/analytics/groups/ (thứ tự 208) |
| [018-api-v2-market-analytics-products-282.json](01-S01-metric-so-ban-shopee-tiktok/018-api-v2-market-analytics-products-282.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 282) |
| [019-api-v2-market-analytics-products-313.json](01-S01-metric-so-ban-shopee-tiktok/019-api-v2-market-analytics-products-313.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 313) |
| [020-api-v2-market-analytics-products-338.json](01-S01-metric-so-ban-shopee-tiktok/020-api-v2-market-analytics-products-338.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 338) |
| [021-api-v2-market-analytics-products-363.json](01-S01-metric-so-ban-shopee-tiktok/021-api-v2-market-analytics-products-363.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 363) |
| [022-api-v2-market-analytics-products-388.json](01-S01-metric-so-ban-shopee-tiktok/022-api-v2-market-analytics-products-388.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 388) |
| [023-api-v2-market-analytics-products-414.json](01-S01-metric-so-ban-shopee-tiktok/023-api-v2-market-analytics-products-414.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 414) |
| [024-api-v2-market-analytics-products-439.json](01-S01-metric-so-ban-shopee-tiktok/024-api-v2-market-analytics-products-439.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 439) |
| [025-api-v2-market-analytics-products-463.json](01-S01-metric-so-ban-shopee-tiktok/025-api-v2-market-analytics-products-463.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 463) |
| [026-api-v2-market-analytics-products-488.json](01-S01-metric-so-ban-shopee-tiktok/026-api-v2-market-analytics-products-488.json) | Metric API POST /v2/market/analytics/products/ (thứ tự 488) |

## 02 · S02 · Sản phẩm và số bán TikTok Shop

| Tệp | Nội dung |
|---|---|
| [001-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/001-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [002-kalodata-product-rank-vien-uong-kem.json](02-S02-kalodata-san-pham-tiktok-shop/002-kalodata-product-rank-vien-uong-kem.json) | kalodata.product.rank viên uống kẽm |
| [003-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/003-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [004-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/004-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [005-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/005-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [006-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/006-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [007-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/007-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [008-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/008-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [009-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/009-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [010-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/010-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [011-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/011-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [012-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/012-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [013-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/013-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [014-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/014-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [015-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/015-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [016-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/016-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [017-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/017-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [018-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/018-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [019-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/019-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [020-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/020-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [021-kalodata-product-detail-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/021-kalodata-product-detail-1729958693491935262.json) | kalodata.product.detail 1729958693491935262 |
| [022-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/022-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [023-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/023-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [024-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/024-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [025-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/025-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [026-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/026-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [027-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/027-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [028-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/028-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [029-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/029-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [030-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/030-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [031-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/031-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [032-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/032-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [033-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/033-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [034-kalodata-product-detail-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/034-kalodata-product-detail-1733221839026947706.json) | kalodata.product.detail 1733221839026947706 |
| [035-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/035-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [036-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/036-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [037-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/037-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [038-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/038-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [039-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/039-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [040-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/040-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [041-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/041-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [042-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/042-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [043-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/043-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [044-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/044-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [045-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/045-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [046-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/046-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [047-kalodata-product-detail-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/047-kalodata-product-detail-1734830267614529209.json) | kalodata.product.detail 1734830267614529209 |
| [048-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/048-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [049-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/049-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [050-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/050-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [051-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/051-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [052-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/052-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [053-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/053-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [054-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/054-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [055-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/055-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [056-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/056-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [057-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/057-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [058-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/058-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [059-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/059-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [060-kalodata-product-detail-1730172085314816729.json](02-S02-kalodata-san-pham-tiktok-shop/060-kalodata-product-detail-1730172085314816729.json) | kalodata.product.detail 1730172085314816729 |
| [061-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/061-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [062-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/062-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [063-kalodata-video-rank-1729958693491935262.json](02-S02-kalodata-san-pham-tiktok-shop/063-kalodata-video-rank-1729958693491935262.json) | kalodata.video.rank 1729958693491935262 |
| [064-kalodata-video-rank-1733221839026947706.json](02-S02-kalodata-san-pham-tiktok-shop/064-kalodata-video-rank-1733221839026947706.json) | kalodata.video.rank 1733221839026947706 |
| [065-kalodata-video-rank-1734830267614529209.json](02-S02-kalodata-san-pham-tiktok-shop/065-kalodata-video-rank-1734830267614529209.json) | kalodata.video.rank 1734830267614529209 |
| [066-kalodata-credit-balance.json](02-S02-kalodata-san-pham-tiktok-shop/066-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |

## 03 · S05 · Đánh giá Shopee

| Tệp | Nội dung |
|---|---|
| [001-collection.json](03-S05-shopee-danh-gia/001-collection.json) | Danh sách 5 sản phẩm Shopee đã thu + trạng thái từng sản phẩm |
| [002-shopee-2308735412.json](03-S05-shopee-danh-gia/002-shopee-2308735412.json) | Đánh giá Shopee của sản phẩm 2308735412 (300 đánh giá) — https://shopee.vn/product/44806875/2308735412 |
| [003-shopee-16542213807.json](03-S05-shopee-danh-gia/003-shopee-16542213807.json) | Đánh giá Shopee của sản phẩm 16542213807 (300 đánh giá) — https://shopee.vn/product/729761153/16542213807 |
| [004-shopee-28106261717.json](03-S05-shopee-danh-gia/004-shopee-28106261717.json) | Đánh giá Shopee của sản phẩm 28106261717 (300 đánh giá) — https://shopee.vn/product/1111889194/28106261717 |
| [005-shopee-16433976455.json](03-S05-shopee-danh-gia/005-shopee-16433976455.json) | Đánh giá Shopee của sản phẩm 16433976455 (168 đánh giá) — https://shopee.vn/product/319371830/16433976455 |
| [006-shopee-988067990.json](03-S05-shopee-danh-gia/006-shopee-988067990.json) | Đánh giá Shopee của sản phẩm 988067990 (84 đánh giá) — https://shopee.vn/product/52449373/988067990 |

## 04 · S14 · Lời nói trong video bán hàng TikTok

| Tệp | Nội dung |
|---|---|
| [001-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json](04-S14-video-ban-hang-loi-noi/001-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json) | Lời nói trong video bán hàng và video đánh giá sản phẩm (ghi lại tự động) automation-video-watch |
| [002-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json](04-S14-video-ban-hang-loi-noi/002-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json) | Lời nói trong video bán hàng và video đánh giá sản phẩm (lấy từ phụ đề có sẵn) automation-video-watch |
| [003-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json](04-S14-video-ban-hang-loi-noi/003-loi-noi-trong-video-ban-hang-va-video-danh-gia-san.json) | Lời nói trong video bán hàng và video đánh giá sản phẩm (lấy từ phụ đề có sẵn) automation-video-watch |
| [004-videowatch-generate-modelcall.json](04-S14-video-ban-hang-loi-noi/004-videowatch-generate-modelcall.json) | videowatch.generate modelCall |
| [005-videowatch-generate-modelcall.json](04-S14-video-ban-hang-loi-noi/005-videowatch-generate-modelcall.json) | videowatch.generate modelCall |
| [006-videowatch-generate-modelcall.json](04-S14-video-ban-hang-loi-noi/006-videowatch-generate-modelcall.json) | videowatch.generate modelCall |

## 05 · S15 · Thư viện quảng cáo Meta (máy tự đọc, không đăng nhập)

| Tệp | Nội dung |
|---|---|
| [001-thu-vien-quang-cao-meta-may-tu-doc-khi-khong-dang.json](05-S15-meta-thu-vien-quang-cao/001-thu-vien-quang-cao-meta-may-tu-doc-khi-khong-dang.json) | Thư viện quảng cáo Meta, máy tự đọc khi không đăng nhập automation-meta-auto |

## 06 · S16 · Quảng cáo nổi bật TikTok (Creative Center)

| Tệp | Nội dung |
|---|---|
| [001-quang-cao-noi-bat-tren-tiktok-may-tu-doc-khi-khong.json](06-S16-tiktok-quang-cao-noi-bat/001-quang-cao-noi-bat-tren-tiktok-may-tu-doc-khi-khong.json) | Quảng cáo nổi bật trên TikTok, máy tự đọc khi không đăng nhập automation-tiktok-top-ads |

## 07 · S19 (gồm S13, S26) · Tìm kiếm Google thường + mở rộng (site:shopee.vn, site:tiktok.com)

| Tệp | Nội dung |
|---|---|
| [001-serpapi-google-search-vien-uong-kem.json](07-S19-google-tim-kiem/001-serpapi-google-search-vien-uong-kem.json) | Kết quả Google cho câu «viên uống kẽm» |
| [002-serpapi-google-search-vien-uong-kem.json](07-S19-google-tim-kiem/002-serpapi-google-search-vien-uong-kem.json) | Kết quả Google cho câu «viên uống kẽm» |
| [003-serpapi-google-search-vien-uong-kem-site-shopee-vn.json](07-S19-google-tim-kiem/003-serpapi-google-search-vien-uong-kem-site-shopee-vn.json) | Kết quả Google cho câu «viên uống kẽm site:shopee.vn» |
| [004-serpapi-google-search-vien-uong-kem-site-tiktok-co.json](07-S19-google-tim-kiem/004-serpapi-google-search-vien-uong-kem-site-tiktok-co.json) | Kết quả Google cho câu «viên uống kẽm site:tiktok.com» |
| [005-serpapi-google-search-dhc-trang-chu-chinh-hang.json](07-S19-google-tim-kiem/005-serpapi-google-search-dhc-trang-chu-chinh-hang.json) | Kết quả Google cho câu «Dhc trang chủ chính hãng» |
| [006-serpapi-google-search-acnacare-trang-chu-chinh-han.json](07-S19-google-tim-kiem/006-serpapi-google-search-acnacare-trang-chu-chinh-han.json) | Kết quả Google cho câu «Acnacare trang chủ chính hãng» |
| [007-serpapi-google-search-dsdpharma-trang-chu-chinh-ha.json](07-S19-google-tim-kiem/007-serpapi-google-search-dsdpharma-trang-chu-chinh-ha.json) | Kết quả Google cho câu «Dsdpharma trang chủ chính hãng» |
| [008-serpapi-google-search-bao-cao-thi-truong-vien-uong.json](07-S19-google-tim-kiem/008-serpapi-google-search-bao-cao-thi-truong-vien-uong.json) | Kết quả Google cho câu «báo cáo thị trường viên uống kẽm filetype:pdf -site:studocu.vn -site:scribd.com» |

## 08 · S20 + S20b · Mức quan tâm tìm kiếm Google Trends (theo thời gian + theo tỉnh)

| Tệp | Nội dung |
|---|---|
| [001-serpapi-google-trends-vien-uong-kem.json](08-S20-google-trends/001-serpapi-google-trends-vien-uong-kem.json) | Google Trends TIMESERIES cho «viên uống kẽm» |
| [002-serpapi-google-trends-vien-uong-kem.json](08-S20-google-trends/002-serpapi-google-trends-vien-uong-kem.json) | Google Trends GEO_MAP_0 cho «viên uống kẽm» |

## 09 · S23 · Ngân hàng Thế giới

| Tệp | Nội dung |
|---|---|
| [001-worldbank-observations.json](09-S23-world-bank/001-worldbank-observations.json) | worldbank.observations worldbank.observations |
| [002-worldbank-metadata.json](09-S23-world-bank/002-worldbank-metadata.json) | worldbank.metadata worldbank.metadata |
| [003-worldbank-observations.json](09-S23-world-bank/003-worldbank-observations.json) | worldbank.observations worldbank.observations |
| [004-worldbank-metadata.json](09-S23-world-bank/004-worldbank-metadata.json) | worldbank.metadata worldbank.metadata |

## 10 · S24 · Thương mại quốc tế (HS 210690)

| Tệp | Nội dung |
|---|---|
| [001-comtrade-data.json](10-S24-un-comtrade/001-comtrade-data.json) | comtrade.data comtrade.data |
| [002-comtrade-data.json](10-S24-un-comtrade/002-comtrade-data.json) | comtrade.data comtrade.data |
| [003-comtrade-data.json](10-S24-un-comtrade/003-comtrade-data.json) | comtrade.data comtrade.data |
| [004-comtrade-data.json](10-S24-un-comtrade/004-comtrade-data.json) | comtrade.data comtrade.data |

## 11 · S06 · Đánh giá TikTok Shop (bản gom bình luận của Kalodata)

| Tệp | Nội dung |
|---|---|
| [001-kalodata-credit-balance.json](11-S06-tiktok-shop-danh-gia/001-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |
| [002-kalodata-product-comment-insight-17299586934919352.json](11-S06-tiktok-shop-danh-gia/002-kalodata-product-comment-insight-17299586934919352.json) | kalodata.product.comment.insight 1729958693491935262 |
| [003-kalodata-product-comment-insight-17332218390269477.json](11-S06-tiktok-shop-danh-gia/003-kalodata-product-comment-insight-17332218390269477.json) | kalodata.product.comment.insight 1733221839026947706 |
| [004-kalodata-product-comment-insight-17348302676145292.json](11-S06-tiktok-shop-danh-gia/004-kalodata-product-comment-insight-17348302676145292.json) | kalodata.product.comment.insight 1734830267614529209 |
| [005-kalodata-credit-balance.json](11-S06-tiktok-shop-danh-gia/005-kalodata-credit-balance.json) | kalodata.credit.balance kalodata.credit.balance |

## 12 · S29 · Bản tổng hợp AI của Google (AI Overview)

| Tệp | Nội dung |
|---|---|
| [001-vien-uong-kem.json](12-S29-google-ai-overview/001-vien-uong-kem.json) | Google AI Overview cho câu «viên uống kẽm» (inline) |
| [002-dhc-trang-chu-chinh-hang.json](12-S29-google-ai-overview/002-dhc-trang-chu-chinh-hang.json) | Google AI Overview cho câu «Dhc trang chủ chính hãng» (page_token_expired) |
| [003-acnacare-trang-chu-chinh-hang.json](12-S29-google-ai-overview/003-acnacare-trang-chu-chinh-hang.json) | Google AI Overview cho câu «Acnacare trang chủ chính hãng» (page_token_expired) |
| [004-dsdpharma-trang-chu-chinh-hang.json](12-S29-google-ai-overview/004-dsdpharma-trang-chu-chinh-hang.json) | Google AI Overview cho câu «Dsdpharma trang chủ chính hãng» (page_token_expired) |
| [005-uong-vien-kem-co-tac-dung-gi.json](12-S29-google-ai-overview/005-uong-vien-kem-co-tac-dung-gi.json) | Google AI Overview cho câu «uống viên kẽm có tác dụng gì» (inline) |
| [006-ai-nen-uong-vien-kem.json](12-S29-google-ai-overview/006-ai-nen-uong-vien-kem.json) | Google AI Overview cho câu «ai nên uống viên kẽm» (inline) |

## 13 · S19b · Gợi ý tìm kiếm Google (autocomplete theo tiền tố)

| Tệp | Nội dung |
|---|---|
| [001-vien-uong-kem.json](13-S19b-goi-y-tim-kiem-google/001-vien-uong-kem.json) | Gợi ý Google cho tiền tố «viên uống kẽm» (10 gợi ý) |
| [002-vien-kem.json](13-S19b-goi-y-tim-kiem-google/002-vien-kem.json) | Gợi ý Google cho tiền tố «viên kẽm» (10 gợi ý) |
| [003-uong-kem.json](13-S19b-goi-y-tim-kiem-google/003-uong-kem.json) | Gợi ý Google cho tiền tố «uống kẽm» (10 gợi ý) |
| [004-vien-uong-kem-a.json](13-S19b-goi-y-tim-kiem-google/004-vien-uong-kem-a.json) | Gợi ý Google cho tiền tố «viên uống kẽm a» (10 gợi ý) |
| [005-vien-uong-kem-b.json](13-S19b-goi-y-tim-kiem-google/005-vien-uong-kem-b.json) | Gợi ý Google cho tiền tố «viên uống kẽm b» (10 gợi ý) |
| [006-vien-uong-kem-c.json](13-S19b-goi-y-tim-kiem-google/006-vien-uong-kem-c.json) | Gợi ý Google cho tiền tố «viên uống kẽm c» (10 gợi ý) |
| [007-vien-uong-kem-d.json](13-S19b-goi-y-tim-kiem-google/007-vien-uong-kem-d.json) | Gợi ý Google cho tiền tố «viên uống kẽm d» (10 gợi ý) |
| [008-vien-uong-kem-d.json](13-S19b-goi-y-tim-kiem-google/008-vien-uong-kem-d.json) | Gợi ý Google cho tiền tố «viên uống kẽm đ» (10 gợi ý) |
| [009-vien-uong-kem-e.json](13-S19b-goi-y-tim-kiem-google/009-vien-uong-kem-e.json) | Gợi ý Google cho tiền tố «viên uống kẽm e» (2 gợi ý) |
| [010-vien-uong-kem-g.json](13-S19b-goi-y-tim-kiem-google/010-vien-uong-kem-g.json) | Gợi ý Google cho tiền tố «viên uống kẽm g» (10 gợi ý) |
| [011-vien-uong-kem-h.json](13-S19b-goi-y-tim-kiem-google/011-vien-uong-kem-h.json) | Gợi ý Google cho tiền tố «viên uống kẽm h» (10 gợi ý) |
| [012-vien-uong-kem-i.json](13-S19b-goi-y-tim-kiem-google/012-vien-uong-kem-i.json) | Gợi ý Google cho tiền tố «viên uống kẽm i» (0 gợi ý) |
| [013-vien-uong-kem-k.json](13-S19b-goi-y-tim-kiem-google/013-vien-uong-kem-k.json) | Gợi ý Google cho tiền tố «viên uống kẽm k» (10 gợi ý) |
| [014-vien-uong-kem-l.json](13-S19b-goi-y-tim-kiem-google/014-vien-uong-kem-l.json) | Gợi ý Google cho tiền tố «viên uống kẽm l» (10 gợi ý) |
| [015-vien-uong-kem-m.json](13-S19b-goi-y-tim-kiem-google/015-vien-uong-kem-m.json) | Gợi ý Google cho tiền tố «viên uống kẽm m» (10 gợi ý) |
| [016-vien-uong-kem-n.json](13-S19b-goi-y-tim-kiem-google/016-vien-uong-kem-n.json) | Gợi ý Google cho tiền tố «viên uống kẽm n» (10 gợi ý) |
| [017-vien-uong-kem-o.json](13-S19b-goi-y-tim-kiem-google/017-vien-uong-kem-o.json) | Gợi ý Google cho tiền tố «viên uống kẽm o» (6 gợi ý) |
| [018-vien-uong-kem-p.json](13-S19b-goi-y-tim-kiem-google/018-vien-uong-kem-p.json) | Gợi ý Google cho tiền tố «viên uống kẽm p» (10 gợi ý) |
| [019-vien-uong-kem-q.json](13-S19b-goi-y-tim-kiem-google/019-vien-uong-kem-q.json) | Gợi ý Google cho tiền tố «viên uống kẽm q» (3 gợi ý) |
| [020-vien-uong-kem-r.json](13-S19b-goi-y-tim-kiem-google/020-vien-uong-kem-r.json) | Gợi ý Google cho tiền tố «viên uống kẽm r» (4 gợi ý) |
| [021-vien-uong-kem-s.json](13-S19b-goi-y-tim-kiem-google/021-vien-uong-kem-s.json) | Gợi ý Google cho tiền tố «viên uống kẽm s» (10 gợi ý) |
| [022-vien-uong-kem-t.json](13-S19b-goi-y-tim-kiem-google/022-vien-uong-kem-t.json) | Gợi ý Google cho tiền tố «viên uống kẽm t» (10 gợi ý) |
| [023-vien-uong-kem-u.json](13-S19b-goi-y-tim-kiem-google/023-vien-uong-kem-u.json) | Gợi ý Google cho tiền tố «viên uống kẽm u» (4 gợi ý) |
| [024-vien-uong-kem-v.json](13-S19b-goi-y-tim-kiem-google/024-vien-uong-kem-v.json) | Gợi ý Google cho tiền tố «viên uống kẽm v» (10 gợi ý) |
| [025-vien-uong-kem-x.json](13-S19b-goi-y-tim-kiem-google/025-vien-uong-kem-x.json) | Gợi ý Google cho tiền tố «viên uống kẽm x» (1 gợi ý) |
| [026-vien-uong-kem-y.json](13-S19b-goi-y-tim-kiem-google/026-vien-uong-kem-y.json) | Gợi ý Google cho tiền tố «viên uống kẽm y» (0 gợi ý) |
| [027-vien-kem-a.json](13-S19b-goi-y-tim-kiem-google/027-vien-kem-a.json) | Gợi ý Google cho tiền tố «viên kẽm a» (10 gợi ý) |
| [028-vien-kem-b.json](13-S19b-goi-y-tim-kiem-google/028-vien-kem-b.json) | Gợi ý Google cho tiền tố «viên kẽm b» (10 gợi ý) |
| [029-vien-kem-c.json](13-S19b-goi-y-tim-kiem-google/029-vien-kem-c.json) | Gợi ý Google cho tiền tố «viên kẽm c» (10 gợi ý) |
| [030-vien-kem-d.json](13-S19b-goi-y-tim-kiem-google/030-vien-kem-d.json) | Gợi ý Google cho tiền tố «viên kẽm d» (10 gợi ý) |
| [031-vien-kem-d.json](13-S19b-goi-y-tim-kiem-google/031-vien-kem-d.json) | Gợi ý Google cho tiền tố «viên kẽm đ» (10 gợi ý) |
| [032-vien-kem-e.json](13-S19b-goi-y-tim-kiem-google/032-vien-kem-e.json) | Gợi ý Google cho tiền tố «viên kẽm e» (10 gợi ý) |
| [033-vien-kem-g.json](13-S19b-goi-y-tim-kiem-google/033-vien-kem-g.json) | Gợi ý Google cho tiền tố «viên kẽm g» (10 gợi ý) |
| [034-vien-kem-h.json](13-S19b-goi-y-tim-kiem-google/034-vien-kem-h.json) | Gợi ý Google cho tiền tố «viên kẽm h» (10 gợi ý) |
| [035-vien-kem-i.json](13-S19b-goi-y-tim-kiem-google/035-vien-kem-i.json) | Gợi ý Google cho tiền tố «viên kẽm i» (3 gợi ý) |
| [036-vien-kem-k.json](13-S19b-goi-y-tim-kiem-google/036-vien-kem-k.json) | Gợi ý Google cho tiền tố «viên kẽm k» (10 gợi ý) |
| [037-vien-kem-l.json](13-S19b-goi-y-tim-kiem-google/037-vien-kem-l.json) | Gợi ý Google cho tiền tố «viên kẽm l» (10 gợi ý) |
| [038-vien-kem-m.json](13-S19b-goi-y-tim-kiem-google/038-vien-kem-m.json) | Gợi ý Google cho tiền tố «viên kẽm m» (10 gợi ý) |
| [039-vien-kem-n.json](13-S19b-goi-y-tim-kiem-google/039-vien-kem-n.json) | Gợi ý Google cho tiền tố «viên kẽm n» (10 gợi ý) |
| [040-vien-kem-o.json](13-S19b-goi-y-tim-kiem-google/040-vien-kem-o.json) | Gợi ý Google cho tiền tố «viên kẽm o» (10 gợi ý) |
| [041-vien-kem-p.json](13-S19b-goi-y-tim-kiem-google/041-vien-kem-p.json) | Gợi ý Google cho tiền tố «viên kẽm p» (10 gợi ý) |
| [042-vien-kem-q.json](13-S19b-goi-y-tim-kiem-google/042-vien-kem-q.json) | Gợi ý Google cho tiền tố «viên kẽm q» (2 gợi ý) |
| [043-vien-kem-r.json](13-S19b-goi-y-tim-kiem-google/043-vien-kem-r.json) | Gợi ý Google cho tiền tố «viên kẽm r» (8 gợi ý) |
| [044-vien-kem-s.json](13-S19b-goi-y-tim-kiem-google/044-vien-kem-s.json) | Gợi ý Google cho tiền tố «viên kẽm s» (10 gợi ý) |
| [045-vien-kem-t.json](13-S19b-goi-y-tim-kiem-google/045-vien-kem-t.json) | Gợi ý Google cho tiền tố «viên kẽm t» (10 gợi ý) |
| [046-vien-kem-u.json](13-S19b-goi-y-tim-kiem-google/046-vien-kem-u.json) | Gợi ý Google cho tiền tố «viên kẽm u» (10 gợi ý) |
| [047-vien-kem-v.json](13-S19b-goi-y-tim-kiem-google/047-vien-kem-v.json) | Gợi ý Google cho tiền tố «viên kẽm v» (10 gợi ý) |
| [048-vien-kem-x.json](13-S19b-goi-y-tim-kiem-google/048-vien-kem-x.json) | Gợi ý Google cho tiền tố «viên kẽm x» (4 gợi ý) |
| [049-vien-kem-y.json](13-S19b-goi-y-tim-kiem-google/049-vien-kem-y.json) | Gợi ý Google cho tiền tố «viên kẽm y» (0 gợi ý) |
| [050-uong-kem-a.json](13-S19b-goi-y-tim-kiem-google/050-uong-kem-a.json) | Gợi ý Google cho tiền tố «uống kẽm a» (10 gợi ý) |
| [051-uong-kem-b.json](13-S19b-goi-y-tim-kiem-google/051-uong-kem-b.json) | Gợi ý Google cho tiền tố «uống kẽm b» (10 gợi ý) |
| [052-uong-kem-c.json](13-S19b-goi-y-tim-kiem-google/052-uong-kem-c.json) | Gợi ý Google cho tiền tố «uống kẽm c» (10 gợi ý) |
| [053-uong-kem-d.json](13-S19b-goi-y-tim-kiem-google/053-uong-kem-d.json) | Gợi ý Google cho tiền tố «uống kẽm d» (10 gợi ý) |
| [054-uong-kem-d.json](13-S19b-goi-y-tim-kiem-google/054-uong-kem-d.json) | Gợi ý Google cho tiền tố «uống kẽm đ» (10 gợi ý) |
| [055-uong-kem-e.json](13-S19b-goi-y-tim-kiem-google/055-uong-kem-e.json) | Gợi ý Google cho tiền tố «uống kẽm e» (7 gợi ý) |
| [056-uong-kem-g.json](13-S19b-goi-y-tim-kiem-google/056-uong-kem-g.json) | Gợi ý Google cho tiền tố «uống kẽm g» (10 gợi ý) |
| [057-uong-kem-h.json](13-S19b-goi-y-tim-kiem-google/057-uong-kem-h.json) | Gợi ý Google cho tiền tố «uống kẽm h» (10 gợi ý) |
| [058-uong-kem-i.json](13-S19b-goi-y-tim-kiem-google/058-uong-kem-i.json) | Gợi ý Google cho tiền tố «uống kẽm i» (1 gợi ý) |
| [059-uong-kem-k.json](13-S19b-goi-y-tim-kiem-google/059-uong-kem-k.json) | Gợi ý Google cho tiền tố «uống kẽm k» (10 gợi ý) |
| [060-uong-kem-l.json](13-S19b-goi-y-tim-kiem-google/060-uong-kem-l.json) | Gợi ý Google cho tiền tố «uống kẽm l» (10 gợi ý) |
| [061-uong-kem-m.json](13-S19b-goi-y-tim-kiem-google/061-uong-kem-m.json) | Gợi ý Google cho tiền tố «uống kẽm m» (10 gợi ý) |
| [062-uong-kem-n.json](13-S19b-goi-y-tim-kiem-google/062-uong-kem-n.json) | Gợi ý Google cho tiền tố «uống kẽm n» (10 gợi ý) |
| [063-uong-kem-o.json](13-S19b-goi-y-tim-kiem-google/063-uong-kem-o.json) | Gợi ý Google cho tiền tố «uống kẽm o» (10 gợi ý) |
| [064-uong-kem-p.json](13-S19b-goi-y-tim-kiem-google/064-uong-kem-p.json) | Gợi ý Google cho tiền tố «uống kẽm p» (0 gợi ý) |
| [065-uong-kem-q.json](13-S19b-goi-y-tim-kiem-google/065-uong-kem-q.json) | Gợi ý Google cho tiền tố «uống kẽm q» (10 gợi ý) |
| [066-uong-kem-r.json](13-S19b-goi-y-tim-kiem-google/066-uong-kem-r.json) | Gợi ý Google cho tiền tố «uống kẽm r» (10 gợi ý) |
| [067-uong-kem-s.json](13-S19b-goi-y-tim-kiem-google/067-uong-kem-s.json) | Gợi ý Google cho tiền tố «uống kẽm s» (10 gợi ý) |
| [068-uong-kem-t.json](13-S19b-goi-y-tim-kiem-google/068-uong-kem-t.json) | Gợi ý Google cho tiền tố «uống kẽm t» (10 gợi ý) |
| [069-uong-kem-u.json](13-S19b-goi-y-tim-kiem-google/069-uong-kem-u.json) | Gợi ý Google cho tiền tố «uống kẽm u» (10 gợi ý) |
| [070-uong-kem-v.json](13-S19b-goi-y-tim-kiem-google/070-uong-kem-v.json) | Gợi ý Google cho tiền tố «uống kẽm v» (10 gợi ý) |
| [071-uong-kem-x.json](13-S19b-goi-y-tim-kiem-google/071-uong-kem-x.json) | Gợi ý Google cho tiền tố «uống kẽm x» (10 gợi ý) |
| [072-uong-kem-y.json](13-S19b-goi-y-tim-kiem-google/072-uong-kem-y.json) | Gợi ý Google cho tiền tố «uống kẽm y» (5 gợi ý) |
| [073-kem-co-tac-dung.json](13-S19b-goi-y-tim-kiem-google/073-kem-co-tac-dung.json) | Gợi ý Google cho tiền tố «kẽm có tác dụng» (10 gợi ý) |
| [074-co-nen-uong-kem.json](13-S19b-goi-y-tim-kiem-google/074-co-nen-uong-kem.json) | Gợi ý Google cho tiền tố «có nên uống kẽm» (10 gợi ý) |
| [075-uong-kem-khi-nao.json](13-S19b-goi-y-tim-kiem-google/075-uong-kem-khi-nao.json) | Gợi ý Google cho tiền tố «uống kẽm khi nào» (7 gợi ý) |
| [076-kem-cho-be.json](13-S19b-goi-y-tim-kiem-google/076-kem-cho-be.json) | Gợi ý Google cho tiền tố «kẽm cho bé» (10 gợi ý) |
| [077-kem-cho-nam.json](13-S19b-goi-y-tim-kiem-google/077-kem-cho-nam.json) | Gợi ý Google cho tiền tố «kẽm cho nam» (8 gợi ý) |
| [078-kem-cho-nu.json](13-S19b-goi-y-tim-kiem-google/078-kem-cho-nu.json) | Gợi ý Google cho tiền tố «kẽm cho nữ» (10 gợi ý) |
| [079-kem-tri-mun.json](13-S19b-goi-y-tim-kiem-google/079-kem-tri-mun.json) | Gợi ý Google cho tiền tố «kẽm trị mụn» (10 gợi ý) |

## 14 · S21 + S22 · Số liệu Cục Thống kê (bảng tháng + chỉ số giá CPI theo tỉnh)

| Tệp | Nội dung |
|---|---|
| [001-nso-listing.json](14-S21-S22-tong-cuc-thong-ke/001-nso-listing.json) | nso.listing nso.listing |
| [002-nso-workbook.json](14-S21-S22-tong-cuc-thong-ke/002-nso-workbook.json) | nso.workbook nso.workbook |
| [003-nso-workbook.json](14-S21-S22-tong-cuc-thong-ke/003-nso-workbook.json) | nso.workbook nso.workbook |

## 15 · S25 · Báo cáo ngành, tài liệu PDF

| Tệp | Nội dung |
|---|---|
| [001-pdf-discovery-bao-cao-thi-truong-vien-uong-kem-fil.json](15-S25-bao-cao-nganh-pdf/001-pdf-discovery-bao-cao-thi-truong-vien-uong-kem-fil.json) | pdf.discovery báo cáo thị trường viên uống kẽm filetype:pdf -site:studocu.vn -site:scribd.com |
| [002-pdf-download.json](15-S25-bao-cao-nganh-pdf/002-pdf-download.json) | pdf.download pdf.download |
| [003-pdf-download.json](15-S25-bao-cao-nganh-pdf/003-pdf-download.json) | pdf.download pdf.download |
| [004-pdf-download.json](15-S25-bao-cao-nganh-pdf/004-pdf-download.json) | pdf.download pdf.download |

## 16 · S28 · Hồ sơ người Việt do AI viết (dữ liệu tổng hợp, 1 triệu hồ sơ)

| Tệp | Nội dung |
|---|---|
| [001-baseline-sex-age-zone.json](16-S28-nemotron-ho-so-nguoi-viet/001-baseline-sex-age-zone.json) | baseline_sex_age_zone baseline_sex_age_zone |
| [002-baseline-region.json](16-S28-nemotron-ho-so-nguoi-viet/002-baseline-region.json) | baseline_region baseline_region |
| [003-schema.json](16-S28-nemotron-ho-so-nguoi-viet/003-schema.json) | schema schema |
| [004-sample-300.json](16-S28-nemotron-ho-so-nguoi-viet/004-sample-300.json) | sample_300 sample_300 |

## 17 · S07 · Bình luận dưới video TikTok

| Tệp | Nội dung |
|---|---|
| [001-video-selection.json](17-S07-tiktok-binh-luan/001-video-selection.json) | 5 video TikTok được chọn để thu bình luận |
| [002-video-7500214221850955015.json](17-S07-tiktok-binh-luan/002-video-7500214221850955015.json) | Bình luận TikTok của video https://www.tiktok.com/@imochi.vn/video/7500214221850955015 (44 bình luận) |
| [003-video-7472367489947602194.json](17-S07-tiktok-binh-luan/003-video-7472367489947602194.json) | Bình luận TikTok của video https://www.tiktok.com/@anon-22c39536f0ba/video/7472367489947602194 (100 bình luận) |
| [004-video-7690943902592912660.json](17-S07-tiktok-binh-luan/004-video-7690943902592912660.json) | Bình luận TikTok của video https://www.tiktok.com/@imochi.vn/video/7690943902592912660 (15 bình luận) |
| [005-video-7636394988934302996.json](17-S07-tiktok-binh-luan/005-video-7636394988934302996.json) | Bình luận TikTok của video https://www.tiktok.com/@imochi.vn/video/7636394988934302996 (3 bình luận) |
| [006-video-7644545695881366791.json](17-S07-tiktok-binh-luan/006-video-7644545695881366791.json) | Bình luận TikTok của video https://www.tiktok.com/@anon-22c39536f0ba/video/7644545695881366791 (100 bình luận) |

## 18 · S17 · Thư viện quảng cáo trên công cụ tìm kiếm (Google Ads Transparency)

| Tệp | Nội dung |
|---|---|
| [001-not-collected.json](18-S17-google-quang-cao/001-not-collected.json) | Không thu: Gói SerpApi miễn phí chỉ còn ít lượt trong tháng; lượt chạy 26/10 có 0 lần gọi (NO_BRANDS); nguồn này cho 0 quảng cáo trên 5/5 lần thử trước (tìm theo tên miền, không theo sản phẩm). Thu khi SerpApi có lượt mới (đầu tháng 11). |

# Bộ dữ liệu gốc viên kẽm (kem-raw-v1)

Từ khoá: «viên uống kẽm». Chủ đề: thực phẩm chức năng viên kẽm. Dựng ngày 29/10/2026.

## TL;DR

- 18 tệp nguồn. Mỗi tệp có cùng hai phần: `declare` (khai báo) và `records` (bản ghi gốc); `00-index.json` là mục lục riêng.
- 10 tệp lấy từ một lượt chạy thật ngày 26/10/2026. 8 tệp bổ sung ngày 29/10/2026, gồm thu mới, truy vấn cục bộ và ca không thu.
- Đã ẩn danh: mọi người viết đánh giá và người bình luận được thay bằng mã `anon-…`. Xem mục 4.
- Kiểm định dạng từ gốc repo: `python3 data/raw-sources/kem-2910/tools/validate.py data/raw-sources/kem-2910`. Kết quả mong đợi: `failed 0`.
- Khuôn cơ sở dữ liệu cho từng nguồn (bảng, cột, SQL SQLite): [`KHUON-CSDL.md`](KHUON-CSDL.md). Thử: `python3 tools/test_schema.py KHUON-CSDL.md .`
- Từng kết quả gốc trong tệp riêng (một lần tìm, một bản AI Overview, một lần gọi API, đánh giá của một sản phẩm…): [`results/`](results/README.md).

## 1. Cấu trúc một tệp

```json
{
  "declare": { "...": "khai báo" },
  "records": [ "bản ghi gốc của nhà cung cấp" ]
}
```

Bản ghi giữ nguyên JSON của nhà cung cấp. Chỉ có hai thay đổi: giải mã base64 và ẩn danh (mục 4).

## 2. Các trường khai báo (`declare`)

Các trường theo khuôn «Mỗi tệp gốc phải mang» của quy chuẩn dữ liệu đầu vào.

| Trường | Nghĩa |
|---|---|
| `formatVersion` | Luôn là `kem-raw-v1` |
| `sourceCode` | Mã nguồn (S01…S29) |
| `sourceName`, `provider` | Tên nguồn và nhà cung cấp, cách gọi |
| `reportName` | Tên nguồn được hiện trong báo cáo |
| `grade` | Hạng tin cậy |
| `usedBy` | Báo cáo dùng nguồn này: MARKET, INSIGHT |
| `evidenceFamily` | Nhóm bằng chứng: số bán, đánh giá, quảng cáo… |
| `keyword`, `productTopic`, `country`, `timezone` | Phạm vi của bộ dữ liệu |
| `origin` | Lấy từ đâu, bằng cách nào. `method`: `EXPORTED_FROM_APP_RUN`, `FRESH_PULL_FOR_TEST_SET`, `LOCAL_DATASET_QUERY` hoặc `NOT_COLLECTED` |
| `period` | Kỳ dữ liệu: `startDate`, `endDate`, `timezone`, `basis`. `null` = nguồn không có kỳ cố định |
| `recordShape` | Hình dạng một bản ghi |
| `numberFields` | Đơn vị, độ chính xác của số chính (khi có số) |
| `limits` | Giới hạn phải nói khi dùng |
| `resultNote` | Ghi chú khi kết quả rỗng hoặc bị chặn |
| `usage` / `cost` | Lượt gọi và chi phí |
| `anonymisation` | Những gì đã ẩn danh trong tệp |
| `recordCount` | Số bản ghi |
| `recordsSha256` | SHA-256 của `records` (JSON, `sort_keys`, UTF-8, không thụt lề) |

**Con số thiếu.** `null` nghĩa là thiếu. `null` không có nghĩa là 0.

**Tệp gốc không đưa vào kho.** Tệp PDF của bên thứ ba và tệp .xlsx của Cục Thống kê không có trong kho. Tệp .xlsx gốc chứa đường dẫn máy và thông tin tài khoản của nơi phát hành. Bản ghi chỉ giữ link + `sha256` (`excludedFile`); tải lại theo link và kiểm `sha256`.

## 3. Danh sách tệp

| Tệp | Nguồn | Cách có | Ghi chú |
|---|---|---|---|
| 01-S01 | Số bán Shopee + TikTok Shop | Lượt 26/10 | Kỳ 21/09–20/10/2026. TikTok Shop 68% doanh thu |
| 02-S02 | Sản phẩm TikTok Shop | Lượt 26/10 | Xếp hạng + chi tiết 12 tháng. `video.rank` bị từ chối (mã 501) |
| 03-S05 | Đánh giá Shopee | Lượt 26/10 | 1.152 đánh giá, 5 sản phẩm |
| 04-S14 | Lời nói trong video TikTok | Lượt 26/10 | 3 video. Lời người bán, không phải lời khách |
| 05-S15 | Thư viện quảng cáo Meta | Lượt 26/10 | **Bị chặn**: 0 quảng cáo thu được; thương hiệu thứ 2 chưa đọc |
| 06-S16 | Quảng cáo nổi bật TikTok | Lượt 26/10 | **Bị chặn**: trang đòi đăng nhập |
| 07-S19 | Tìm kiếm Google | Lượt 26/10 | 8 câu tìm |
| 08-S20 | Google Trends | Lượt 26/10 | Theo thời gian 12 tháng + theo tỉnh |
| 09-S23 | Ngân hàng Thế giới | Lượt 26/10 | 2 chỉ số |
| 10-S24 | UN Comtrade | Lượt 26/10 | Mã HS 210690, năm 2025 |
| 11-S06 | Đánh giá TikTok Shop | Thu mới 29/10 | 2/3 sản phẩm có dữ liệu; sản phẩm thứ 3 lỗi máy chủ nguồn (HTTP 554) |
| 12-S29 | Google AI Overview | Thu mới + 26/10 | 3 bản có nội dung; 3 bản cũ chỉ có mã trang đã hết hạn |
| 13-S19b | Gợi ý tìm kiếm Google | Thu mới 29/10 | 592 cụm gợi ý không trùng |
| 14-S21-S22 | Cục Thống kê | Thu mới 29/10 | Biểu tháng 9/2026 + CPI tháng 9 (chỉ link + `sha256`) |
| 15-S25 | Báo cáo PDF | Thu mới 29/10 | 2 PDF, chỉ liên quan xa. Tệp PDF không đưa vào kho |
| 16-S28 | Hồ sơ người Việt tổng hợp | Truy vấn cục bộ | Mốc toàn dân 1 triệu hồ sơ + 300 mẫu. NVIDIA Nemotron-Personas-Vietnam, CC BY 4.0 |
| 17-S07 | Bình luận TikTok | Thu mới 29/10 | 262 bình luận, 5 video |
| 18-S17 | Quảng cáo Google | **Không thu** | Giới hạn lượt SerpApi trong tháng |

Nguồn không có tệp (dừng, chưa có công cụ, cần tài khoản): S03, S08, S09, S10, S11, S12, S18, S27. Lý do: `00-index.json`, mục `notCollected`.

## 4. Ẩn danh

- Tệp 03 (Shopee), 11 (TikTok Shop), 17 (TikTok bình luận) có lời khách thật.
- Mã người dùng, tên người dùng, `review_user`, ảnh đại diện, ảnh người dùng gửi và link đánh giá: thay bằng `anon-<12 ký tự>` hoặc ghi `<removed>`.
- Mã bản ghi đánh giá/bình luận (`reviewId`, `review_id`, `cid`) và tham chiếu `key_review_id`: thay bằng `anon-<12 ký tự>`, giữ liên kết giữa bản ghi và tham chiếu trong bộ này.
- Tệp 11: các mã đánh giá gốc trong `id_list` được thay bằng `<removed>`, giữ độ dài danh sách. `key_review_id` vẫn nối tới `review_id` đã ẩn danh.
- Mã `anon-` dùng HMAC-SHA256 với khoá ngẫu nhiên đã huỷ. Cùng một mã định danh gốc trong cùng nhóm có cùng mã thay thế; không ghép danh tính giữa nền tảng.
- Số điện thoại, email, @nhắc tên trong lời viết: thay bằng `[số điện thoại]`, `[email]`, `@[ẩn]`.
- Tệp 01: bỏ 36 phần thân yêu cầu theo dõi trình duyệt, thay bằng `[REDACTED_BROWSER_TELEMETRY]`; các phần này chứa cookie, mã người dùng ẩn danh, mã phiên và mã khách truy cập trong chuỗi JSON.
- Giữ nguyên: nội dung lời khách, số sao, ngày, mã sản phẩm, tên shop, thương hiệu, người bán, tác giả video công khai.
- Mỗi tệp ghi rõ phần đã ẩn danh trong `declare.anonymisation`.

## 5. Dùng cho lượt test kẽm

- **Ca có dữ liệu:** 01–04, 07–14, 16, 17.
- **Ca rỗng hoặc bị chặn:** 05, 06, 18. App phải ghi «chưa có dữ liệu». App không được bịa số.
- **Ca lỗi một phần:** 11 (1/3 sản phẩm lỗi), 02 (`video.rank` bị từ chối). App dùng phần đạt và ghi rõ phần thiếu.
- **Ca tài liệu yếu:** 15. App loại hoặc ghi mức Yếu.

## 6. Giới hạn

- Lượt 26/10 chỉ chạy báo cáo Market. Phần thu đạt một phần. Phần dựng báo cáo bị lỗi. Bản thu gốc của từng nguồn vẫn đủ, trừ các ghi chú ở mục 3.
- Kỳ dữ liệu khác nhau theo nguồn. Không cộng số giữa các nguồn.
- Báo cáo không in nguyên văn lời khách. Báo cáo không nêu tên nhà cung cấp dữ liệu.
- Số bán là ước tính của nguồn.

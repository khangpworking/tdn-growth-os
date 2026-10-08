# Input data sources: test and validation log

Nhật ký thử và kiểm định nguồn dữ liệu đầu vào · đi kèm [Input data sources for 30 sections](input-data-sources-30-sections.md)

File này ghi **mọi lần thử thu dữ liệu và mọi lần kiểm định một nguồn**: làm gì, tốn bao nhiêu, ra kết quả gì, và đã đổi trạng thái nguồn nào. Danh mục nguồn chỉ giữ trạng thái mới nhất; lịch sử nằm ở đây.

## Cách ghi

- Mỗi lần thử hoặc kiểm định là **một dòng**. Mã có dạng `ST-YYYYMMDD-nn`.
- **Loại:**
  - **Thử thu:** chạy công cụ để lấy dữ liệu thật;
  - **Kiểm định:** kiểm tra một nguồn mà không thu dữ liệu để dùng, ví dụ truy cập được không, điều khoản, độ ổn định, giá, link còn sống không.
- **Kết quả:** Đạt / Một phần / Không đạt / Chưa chạy / Thông tin, theo thang chấm của bài test tương ứng.
- **Ghi rõ:** chi phí thực, người hoặc agent chạy, và nguồn (mã S) bị đổi trạng thái.
- **Không ghi:** khoá, đường dẫn máy cá nhân, dữ liệu thô hay tên người viết. Dữ liệu thô giữ ngoài Git.
- Thêm dòng mới **ở trên cùng**, cùng commit với thay đổi trạng thái trong danh mục nguồn. Không sửa dòng cũ; muốn đính chính thì thêm dòng mới.

## Nhật ký

| Mã | Ngày | Loại | Nguồn | Công cụ | Cách làm | Chi phí | Kết quả | Quyết định / đổi trạng thái | Người chạy |
|---|---|---|---|---|---|---|---|---|---|
| ST-20261008-20 | 08/10/2026 | Kiểm định | S23 | API mở World Bank (`api.worldbank.org/v2`) | 2 lệnh gọi cho Việt Nam: chi tiêu hộ bình quân đầu người (giá 2015, mã `NE.CON.PRVT.PC.KD`) và dân số (`SP.POP.TOTL`) | 0 | Thông tin: truy cập được, không cần khoá; trả JSON có mã chỉ số, năm, giá trị, ngày cập nhật (13/07/2026); đã có số năm 2025 | S23 chuyển sang "đã duyệt (E13)". Chưa thu cho báo cáo | Claude (cloud) |
| ST-20261008-19 | 08/10/2026 | Thử thu | S07 | Apify `datadoping/tiktok-comment-reply-scraper` (R4) | Cùng 5 video, 200 bình luận gốc mỗi video, không lấy trả lời | $0,296 | Đạt trên mẫu chấm: 987 dòng nhưng chỉ 890 bình luận duy nhất (97 dòng trùng, 9,8%); 40/50 liên quan; 16/50 lời khách ứng viên; 10/50 câu hỏi mua; 14/50 lời chê, lo ngại; 5/50 hoàn cảnh dùng; không có link trực tiếp tới bình luận | Chọn cho pilot vì rẻ (~$0,33 / 1.000 bình luận duy nhất). Bắt buộc lọc trùng theo mã video + mã bình luận | Agent local |
| ST-20261008-18 | 08/10/2026 | Thử thu | S07 | Apify `clockworks/tiktok-comments-scraper` (R3) | 5 video đã kiểm (ST-20261008-17), 200 bình luận gốc mỗi video, không lấy trả lời | $1,000 | Một phần: 1.000 bình luận, 0 trùng, đủ chữ, ngày, lượt thích, mã người viết; 41/50 liên quan; chỉ 5/50 lời khách ứng viên; không có link trực tiếp tới bình luận | Dự phòng khi cần tập dữ liệu sạch trùng. Hai actor chỉ trùng 767 bình luận; không actor nào lấy hết bình luận của video | Agent local |
| ST-20261008-17 | 08/10/2026 | Kiểm định | S07 | oEmbed công khai và trang video TikTok | Tìm 10 video review thạch dừa và bình giữ nhiệt; kiểm từng link còn sống, người đăng, ngày đăng, số bình luận | 0 | Thông tin: 9/10 link sống. Chọn 5 link cho R3, R4 (thạch dừa: 1.046, 792, 388 bình luận; bình giữ nhiệt: 2.591, 561 bình luận); 3 link dự phòng | Gỡ chặn R3, R4. Đây là video của **người review**, không phải video bán hàng; bình luận là lời người xem, chưa chắc là người mua | Claude (cloud) |
| ST-20261008-16 | 08/10/2026 | Thử thu | S10 | Apify `apidojo/tweet-scraper` (R7) | "thạch dừa", "bình giữ nhiệt", tiếng Việt, mới nhất, tổng 200 bài | $0,080 | Một phần: 47/50 liên quan; 12/50 lời khách ứng viên; nhiều câu lặp mẫu | S10: nguồn phụ, phải lọc | Agent local |
| ST-20261008-15 | 08/10/2026 | Thử thu | S17 | Apify `lexis-solutions/google-ads-scraper` (R6) | 1 thương hiệu (tên miền đã xác minh), Việt Nam, 12 tháng, tối đa 100 quảng cáo | $0,140 | Một phần: 100/100 có ngày; 65/100 lệch giữa hai bộ ngày; 0/100 có lượt hiển thị cho Việt Nam; 11/100 có chữ; 1 dòng lạc nhà quảng cáo khác | S17: chưa dùng cho phép kiểm 3 của E5 | Agent local |
| ST-20261008-14 | 08/10/2026 | Thử thu | S16 | Apify `khadinakbar/tiktok-ads-scraper` (R5) | Việt Nam, thực phẩm và đồ uống, 30 ngày, tối đa 150 | $0,077 | Không đạt: actor không lấy được quảng cáo nào | S16: tìm cách khác | Agent local |
| ST-20261008-13 | 08/10/2026 | Thử thu | S07 | Apify clockworks, datadoping (R3, R4) | — | 0 | Chưa chạy: thiếu 5 link video đúng sản phẩm đã xác minh | Xem ST-20261008-17 | Agent local |
| ST-20261008-12 | 08/10/2026 | Thử thu | S08 | Apify `scraper_one/facebook-posts-search` (R2) | "bình giữ nhiệt", 100 bài mới nhất, 6 tháng | $0,225 | Một phần: 75 bài; 37/50 liên quan; 4/50 lời khách ứng viên | Bài công khai chủ yếu là bài bán hàng và quà tặng | Agent local |
| ST-20261008-11 | 08/10/2026 | Thử thu | S08 | Apify `scraper_one/facebook-posts-search` (R1) | "thạch dừa", 100 bài mới nhất, 6 tháng | $0,258 | Không đạt: 86 bài; 6/50 liên quan; 0/50 lời khách | Tìm bài công khai theo từ khoá không phải đường ra lời khách | Agent local |
| ST-20261008-10 | 08/10/2026 | Kiểm định | S07, S08, S10, S16, S17, S18; Similarweb; Instagram URLs; UN Comtrade | API công khai của Apify (thông tin actor) | Kiểm 9 actor chủ gửi cùng 1 actor thay thế: số người dùng, tỷ lệ chạy thành công 30 ngày, giá, ngày cập nhật | 0 | Thông tin. Bình luận TikTok của datadoping chỉ thành công 40%, nên chọn thêm clockworks (99,7%). Instagram URLs chỉ trả link. Actor UN Comtrade chỉ có 2 người dùng | Đưa 7 lượt vào bài test Apify; loại Instagram URLs, actor UN Comtrade (dùng API chính thức S24), Similarweb | Claude (cloud) |
| ST-20261008-09 | 08/10/2026 | Kiểm định | S21, S23; các nguồn trong bài Tomorrow Marketers | Truy cập trực tiếp; API World Bank | Thử truy cập từng nguồn trong bài (12/2023); gọi thử API World Bank | 0 | Thông tin: API World Bank trả số liệu Việt Nam, cập nhật 13/07/2026. Trang thống kê TP.HCM và Hà Nội cũ không truy cập được; số liệu tỉnh nay nằm trên nso.gov.vn. Index Mundi, Internet Live Stats, Statista không đạt yêu cầu truy nguồn | S23 đề xuất, chờ chủ duyệt; nhiều nguồn vào danh sách không dùng | Claude (cloud) |
| ST-20261008-08 | 08/10/2026 | Kiểm định | S21, S22 | Truy cập trực tiếp nso.gov.vn; API WordPress | Mở trang, tải file Excel tháng 9/2026, file CPI, Niên giám 2025, sách Khảo sát mức sống 2024, đọc điều khoản trích dẫn | 0 | Đạt: 803 file Excel qua API; dữ liệu có trạng thái ước tính / sơ bộ / chính thức; bắt buộc ghi nguồn; niên giám quốc gia không có số liệu dừa theo tỉnh | Ra E12, mục 6.4 và gói P10 | Claude (cloud) |
| ST-20261008-07 | 08/10/2026 | Thử thu | S15 | Agent-Reach (trình duyệt OpenCLI) | Thư viện quảng cáo Meta, Việt Nam, từ khoá "thạch dừa" | 0 | Một phần: có ngày bắt đầu, nhãn đang chạy; một số thẻ có ngưỡng chi (ví dụ ">1 triệu đồng"); kết quả lẫn quảng cáo không liên quan | S15: dùng được cho phép kiểm 3 của E5, phải lọc quảng cáo không liên quan | Agent local |
| ST-20261008-06 | 08/10/2026 | Thử thu | S08 | Agent-Reach (OpenCLI, sau khi sửa bộ đọc) | T1–T5, thêm lệnh đọc một nhóm đã tham gia | 0 | Một phần: tìm từ khoá ra 10 bài (4 bài có ngày); đọc nhóm ra 8 bài đủ ngày, link, người viết, nhưng nhóm không liên quan; không có nội dung bình luận | S08: dùng được cho bài viết; cần tham gia nhóm liên quan bằng tài khoản riêng. Bản sửa nằm ở máy cục bộ | Agent local |
| ST-20261008-05 | 08/10/2026 | Thử thu | S09 | Agent-Reach | Thử Instagram | 0 | Không đạt | S09: không dùng được hiện tại | Chủ dự án |
| ST-20261008-04 | 08/10/2026 | Thử thu | S08 | Agent-Reach (OpenCLI, bản gốc) | T1–T5, 5 lệnh cách nhau ≥30 giây | 0 | Một phần: chỉ ra tên trang và tên nhóm; 0 bài; lệnh đọc bảng tin lỗi | Cần sửa bộ đọc (xem ST-20261008-06) | Agent local |
| ST-20261008-03 | 08/10/2026 | Kiểm định | S14 | Đọc mã nguồn công cụ `/watch` | Đọc mô tả, giấy phép, cách chuyển giọng nói thành chữ | 0 | Thông tin: giấy phép MIT; đọc được video thành ảnh và lời thoại; có cách chạy trên máy không tốn phí | S14 đề xuất (gói P9); tạm gác cài đặt theo ý chủ | Claude (cloud) |
| ST-20261007-02 | 07/10/2026 | Kiểm định | S08, S09 | Đọc tài liệu Agent-Reach | Đọc phần Facebook, Instagram trong tài liệu | 0 | Thông tin: chỉ chạy trên máy có Chrome; tài liệu chỉ chắc chắn đọc được danh sách nhóm, không chắc đọc được bài và bình luận | Soạn kịch bản test Facebook | Claude (cloud) |
| ST-20261007-01 | 05–07/10/2026 | Kiểm định | S27 | Đọc dữ liệu review của báo cáo thạch dừa | Đọc cấu trúc bản ghi | 0 | Thông tin: không có số sao, không có mã người viết | Lần thu sau dùng S05 (có số sao); quy tắc L1, L2, L6 | Claude (local) |

## Link đã kiểm cho lượt R3, R4 (bình luận TikTok)

Kiểm ngày 08/10/2026 qua oEmbed và trang video công khai (ST-20261008-17). Số bình luận và lượt thích đếm tại thời điểm kiểm.

| Vai trò | Sản phẩm | Link | Ngày đăng | Bình luận | Ghi chú |
|---|---|---|---|---|---|
| Chính | Thạch dừa | https://www.tiktok.com/@meberyne/video/7454106743191244039 | 30/12/2024 | 1.046 | Review thạch dừa thô tự nấu |
| Chính | Thạch dừa | https://www.tiktok.com/@meberyne/video/7473394370805320968 | 20/02/2025 | 792 | Tiêu đề trên kết quả tìm kiếm là "Review Thạch Dừa Minh Châu"; tiêu đề trên TikTok khác. Agent kiểm nội dung trước khi chấm |
| Chính | Thạch dừa | https://www.tiktok.com/@reviewcuisine/video/7397652389823663378 | 31/07/2024 | 388 | Review gói thạch dừa lớn |
| Chính | Bình giữ nhiệt | https://www.tiktok.com/@chuot_bach_review1/video/7521719603622464776 | 30/06/2025 | 2.591 | Kiểm bình có đúng inox 304 |
| Chính | Bình giữ nhiệt | https://www.tiktok.com/@chuot_bach_review1/video/7636376863501241620 | 05/05/2026 | 561 | Review bình "quảng cáo một đằng, sản phẩm một kiểu" |
| Dự phòng | Thạch dừa | https://www.tiktok.com/@reviewcuisine/video/7513054811219070215 | 07/06/2025 | 75 | Review thạch dừa xô |
| Dự phòng | Bình giữ nhiệt | https://www.tiktok.com/@chuot_bach_review1/video/7616331125190888724 | 12/03/2026 | 117 | — |
| Dự phòng | Bình giữ nhiệt | https://www.tiktok.com/@minhtrireviewcosaonoivay/video/7482777961331035400 | 17/03/2025 | 81 | Dùng sau 6 tháng |

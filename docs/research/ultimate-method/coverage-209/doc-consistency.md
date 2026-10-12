# Rà độ khớp giữa các tài liệu (UC-1, #209)

Ngày rà: 12/10/2026 · Chỉ báo cáo, không sửa tài liệu nào.

Các file đã rà, và chữ viết tắt dùng trong bảng:
- **[U]** `docs/research/ultimate-method/ultimate-method-30-sections.md` (v1.13, 11/10/2026)
- **[R]** `docs/research/ultimate-method/input-data-sources-30-sections.md` (danh mục nguồn v1.9, 08/10/2026)
- **[P]** `docs/tasks/research-batch-2-packages.md` (gói việc, cập nhật 08/10/2026)
- **[K]** `docs/tasks/ultimate-v1.11-tdn-sync-plan.md` (kế hoạch đồng bộ TDN)
- **[C]** `docs/research/ultimate-method/CHANGELOG.md`

Số dòng ghi theo bản trên nhánh hiện tại. Mỗi phát hiện có hai trích dẫn ngắn của hai chỗ đang nói khác nhau.

---

## 1. Tóm tắt cho chủ

- Bộ tài liệu nhìn chung khớp nhau. Phiên bản, ngày tháng và nhật ký thay đổi đi cùng nhau. Không có nguồn kém tin cậy (hạng D) nào lọt vào báo cáo.
- Chỗ lệch nặng nhất nằm ở **bảng "section dùng nguồn nào"** trong danh mục nguồn. Bảng này vẫn ghi ba nguồn làm nguồn chính, dù chính danh mục đã ghi chúng không dùng được:
  - dữ liệu thương mại (S03): chưa có phiên truy cập;
  - quảng cáo nổi bật TikTok (S16): test không đạt;
  - bài viết Facebook (S08): chủ đã cho tạm ngừng thu từ 08/10.
- Nếu ai làm theo bảng này, họ sẽ tưởng các phần như M06, I02, I04–I10, I12, I13 có những nguồn đó.
- Loại lệch thứ hai: **một số chỗ trong file Ultimate chưa sửa theo quy tắc "báo cáo không chờ chủ" (E11)**. Các chỗ đó vẫn ghi chủ phải tự chọn đối thủ (I13, mục 6.2) và tự chọn đơn vị tính giá (M08). Phần M01 vừa nói "không chặn", vừa nói "chặn khi thiếu câu hỏi của chủ".
- Loại lệch thứ ba: **file gói việc chưa cập nhật theo các quyết định ngày 08/10 và 11/10**:
  - vẫn đòi kiểm chéo bằng model thứ hai (κ), dù chủ đã hoãn phần này;
  - vẫn nhắc công cụ Agent-Reach cho thư viện quảng cáo Meta, dù test đã đạt bằng công cụ khác;
  - vẫn ghi "không tự xác nhận" và "chỉ người vận hành chạy", dù E14 cho tự thu, tự xác nhận.
- Còn lại là các lệch nhỏ:
  - nhãn trạng thái ở bảng tổng (mục 3) khác tiêu đề section;
  - đoạn mở đầu ghi "không đổi so với v1.0" dù nội dung đã đổi;
  - số phiên bản đi kèm ghi chưa đúng.
- Tổng cộng **40 phát hiện: 3 mức cao, 19 mức vừa, 18 mức thấp**. Đề xuất sửa nằm ở cột cuối của bảng. Chưa sửa chỗ nào.

---

## 2. Bảng phát hiện

| # | Loại lệch | Ở đâu | Nói gì | Mâu thuẫn với | Mức độ | Đề xuất sửa |
|---|---|---|---|---|---|---|
| 1 | Nguồn không dùng được nằm trong bảng section | [R] §3, dòng M06 (130) | Nguồn chính của M06: "S01, S03" | [R] §2.1 S03 (66): "Chưa dùng được (chưa có phiên truy cập hợp lệ)"; [U] M06 (378): "TradeInt bị chặn" | cao | Chuyển S03 sang "chờ phiên truy cập" hoặc bỏ khỏi nguồn chính của M06 |
| 2 | Nguồn test không đạt nằm trong bảng section | [R] §3, dòng I12 (150), I13 (151), M07 (131), ghi chú E5 ở I02 (140) | I12 nguồn chính: "S14, S15, S16, S17, S07"; I02: "E5 dùng S02, S14, S15, S16, S17" | [R] §2.3 S16 (89): "Đã test (R5): không đạt, actor lỗi và không trả quảng cáo nào" | cao | Bỏ S16 khỏi I12, I13, M07 và ghi chú E5 cho tới khi có cách thu đạt |
| 3 | Nguồn đã tạm ngừng vẫn là nguồn chính | [R] §3, dòng I02, I04–I10, I13 (140–151) | I04: "S05, S06, S07, S08"; I06: "S05, S08" | [R] §2.2 S08 (76): "**Tạm ngừng thu** (chủ quyết 08/10/2026)" | cao | Đánh dấu S08 "tạm ngừng" trong bảng §3 hoặc dời khỏi nguồn chính |
| 4 | Nguồn chưa dùng cho phép kiểm vẫn được giao cho phép kiểm đó | [R] §3, ghi chú I02 (140) | "E5 dùng S02, S14, S15, S16, S17 cho lớp người bán nhắm tới" | [R] §2.3 S17 (90): "E5 phép kiểm 3: **chưa dùng** cho tới khi rõ nghĩa hai bộ ngày" | vừa | Ghi "S17 chưa dùng cho phép kiểm 3" ngay trong ghi chú E5 |
| 5 | Nguồn chỉ "đề xuất", chưa có bộ thu, là nguồn chính | [R] §3: S06 ở I02, I04, I05, I07–I11, I13; S11 ở I02; S18 ở I13; S26 ở M09 | I05 nguồn chính: "S05, S06, S07, S08" | [R] §2.2 S06 (74): "Chưa có bộ thu … Đề xuất"; [U] E14 (262) chỉ tự thu nguồn "đang dùng hoặc đã duyệt" | vừa | Thêm cột hoặc ký hiệu "chờ bộ thu" trong §3 cho S06, S11, S18, S26 |
| 6 | Section dùng số Cục Thống kê nằm ngoài danh sách E12 | [R] §3, dòng I11 (149) | Nguồn phụ: "S21 (thành thị, nông thôn: chỉ bối cảnh)" | [U] E12 (229): "bối cảnh cho M02, M05, M06, M08, M09, M10, M13, I02, I03, I12" (không có I11) | vừa | Thêm I11 vào E12 (và dòng 336), hoặc bỏ S21 khỏi I11 |
| 7 | Nhãn trạng thái nguồn ngoài quy ước; E14 dựa vào nhãn không định nghĩa | [R] §2 quy ước (53–58) và bảng §2 | Quy ước chỉ có: "Đang dùng … Đã test … Chờ test … Đề xuất … Không dùng" | [R] S08 "Tạm ngừng thu", S23 "Đã duyệt", S12 "Chưa có"; [U] E14 (262): "mọi nguồn đang dùng hoặc đã duyệt" | vừa | Thêm nhãn "Đã duyệt", "Tạm ngừng", "Chưa dùng được" vào quy ước và nói rõ nhãn nào E14 được tự thu |
| 8 | §3 khác tiêu đề section (mất ngoại lệ E1) | [U] §3 dòng M08 (310) | "BOUNDED + BENCHMARK_ADDED + E1 + E9" | [U] tiêu đề M08 (391): "BOUNDED + BENCHMARK_ADDED + E9" | vừa | Thêm "+ E1" vào tiêu đề M08 |
| 9 | Tự mâu thuẫn trong một section | [U] M01 (351) | "Khi chưa có câu hỏi kinh doanh của chủ, Phần 1 vẫn hiện tóm tắt mô tả, không chặn" | [U] M01 (352): "Chặn khi: thiếu câu hỏi chủ (`M01_OWNER_QUESTION_MISSING`)" | vừa | Bỏ điều kiện chặn "thiếu câu hỏi chủ" ở dòng 352 (theo E3, E7, E11) |
| 10 | Section chưa sửa theo E11 (chủ chọn đơn vị) | [U] M08 (394, 398) | "chủ chọn đơn vị chuẩn cho ngành hàng **trước khi** tính"; "Chủ chọn cơ sở nào cho ngành hàng" | [U] E11 bảng (222): "Hàng bán theo khối lượng dùng khối lượng tịnh" | vừa | Thêm dòng "Cập nhật (E11)" ở M08 như M07 đã có |
| 11 | Section chưa sửa theo E11 (chủ khai báo đối thủ) | [U] I13 (524, 528) | "so sánh đối thủ cần peer-set chủ khai báo"; "theo L7 và peer-set của chủ" | [U] E11 bảng (216): "Tập đối thủ để so (M07, I13): Lấy từ dữ liệu bán hàng" | vừa | Thêm dòng "Cập nhật (E11)" ở I13, thay "peer-set của chủ" bằng tập mặc định |
| 12 | Bảng mục 6.2 chưa sửa theo E11 | [U] §6.2 (582) | "Thông điệp riêng của từng thương hiệu … Peer-set do chủ khai báo" | [U] E11 bảng (216): tập đối thủ "Lấy từ dữ liệu bán hàng … cùng kỳ" | vừa | Đổi ô thành "Tập đối thủ mặc định theo E11" |
| 13 | Gói việc còn dùng κ, dù đã hoãn | [P] P7-04 (352); cũng P8-04 (373), P8-08 (377), P9 (387), P9-06 (424), P9-08 (433) | "κ check per Ultimate E11 … κ < 0.6 shows 'độ tin cậy thấp'" | [U] E11 bảng (221): "Chưa dùng model thứ hai và κ"; [U] E15 (292): "**Hoãn:** kiểm chéo bằng model thứ hai và hệ số κ" | vừa | Ghi chú "κ hoãn theo #209" ở P7-04, P8-04, P8-08, P9, P9-06, P9-08 |
| 14 | Gói việc còn dựa vào Agent-Reach cho S15 | [P] P7/P8 ghi chú (360) và việc còn mở (547) | "Agent-Reach is kept only for the Meta Ad Library (S15), and only if…"; "Run the Meta Ad Library test through Agent-Reach" | [R] S15 (88): "OpenCLI (lệnh browser), đọc theo trang"; [C] BR-20261008-17: "không cần lớp Agent-Reach" | vừa | Ghi S15 đã đạt bằng OpenCLI; bỏ việc test Agent-Reach ở dòng 547 |
| 15 | Gói việc trái E14 (tự xác nhận, tự thu) | [P] P10-01 (465), P10-08 (486); cũng P4-01 (260) | "inert preparation, no automatic confirm"; "it is run by the operator only" | [U] E14 (262): "Nguồn đã chuẩn bị xong được tự xác nhận vào lần chạy" | vừa | Ghi chú P4-01, P10-01, P10-08 "đã thay bằng E14 (08/10)" |
| 16 | Gói việc đặt khối Trends vào section không dùng Trends | [P] P8-01 (367) | "Trends blocks (M05, M09, M10, I10)" | [R] §3 M10 (134): nguồn "S01" và phụ "S21, S23", không có S20 | vừa | Bỏ M10 khỏi P8-01 hoặc thêm S20 vào M10 trong §3 |
| 17 | Gói việc đặt khối tìm kiếm mở rộng vào section không dùng nguồn đó | [P] P8-02 (368) | "Expanded search blocks (I05, I07, I08, I12, I13)" | [R] §3: S19 chỉ ở M09, I07; I05 phụ "S10, S11", I08 phụ "S12" | vừa | Khớp danh sách P8-02 với §3 (thêm S19, S26 vào §3 hoặc bớt section) |
| 18 | Gói việc đặt khối video vào section không dùng video | [P] P8-03 (369) | "Video blocks (I12, I13, M07, M09, M12)" | [R] §3 M09 (133): "S21, S25, S26" và phụ "S01, S19, S20"; M12 (136): "Tổng hợp" | vừa | Bỏ M09, M12 khỏi P8-03 hoặc thêm S02/S14 vào §3 |
| 19 | Tiêu đề ngoại lệ trái thân ngoại lệ | [U] E8 tiêu đề (179) | "Thu review mở rộng không đặt trần chi phí" | [U] E8 thân (182): "hiện trên màn hình nguồn, trong trần chi đã cấu hình" | vừa | Đổi tiêu đề E8 thành "… trong trần chi đã cấu hình (E14)" |
| 20 | Ngoại lệ đổi quy tắc, quy tắc không nhắc ngoại lệ | [U] quy tắc 5 (66) | "xếp hạng … tất cả bị chặn trừ khi một phương pháp đã review" | [U] E15 (283): "Đây là ngoại lệ của quy tắc 5 và L4, chỉ cho bảng này" | vừa | Thêm "Ngoại lệ: E15" vào quy tắc 5 như L4 đã có |
| 21 | Ngoại lệ đổi quy tắc, quy tắc không nhắc ngoại lệ | [U] quy tắc 4 (65) | "mẫu số tương thích do chủ dự án khai báo" | [U] E11 bảng (217): "Mẫu số của tỷ lệ (quy tắc 4): Toàn bộ bản ghi của tập mẫu đã chốt" | vừa | Thêm "mặc định theo E11" vào quy tắc 4 |
| 22 | Phần làm rõ nói "không nới" nhưng thực tế nới quy tắc 8 | [U] quy tắc 8 (69) và mục 2.1 (74) | "mã AI đề xuất chưa người duyệt thì không được vào count/n-N"; "không nới quy tắc 1–9" | [U] L3 (78): "Bản nháp nội bộ được hiện số đếm theo cách xếp nhóm do AI đề xuất"; E15 (282) một AI gắn mã | vừa | Thêm vào quy tắc 8 "trừ L3 (bản nháp) và E15 (giai đoạn 1)" |
| 23 | §3 khác tiêu đề section | [U] §3 M01 (303) | "PROPOSED + BUSINESS_REVIEWED + E3" | [U] tiêu đề M01 (346): "PROPOSED + BUSINESS_REVIEWED" | thấp | Thêm "+ E3" vào tiêu đề |
| 24 | §3 khác tiêu đề section | [U] §3 M05 (307) | "PROPOSED + BUSINESS_REVIEWED + E10" | [U] tiêu đề M05 (366): "PROPOSED + BUSINESS_REVIEWED" | thấp | Thêm "+ E10" vào tiêu đề |
| 25 | §3 khác tiêu đề section | [U] §3 M07 (309) | "PROPOSED + BUSINESS_REVIEWED + E11" | [U] tiêu đề M07 (383): "PROPOSED + BUSINESS_REVIEWED (cập nhật 05/10)" | thấp | Thêm "+ E11" vào tiêu đề |
| 26 | §3 khác tiêu đề section | [U] §3 M12 (314) | "PROPOSED + BUSINESS_REVIEWED + E2" | [U] tiêu đề M12 (434): "PROPOSED + BUSINESS_REVIEWED" | thấp | Thêm "+ E2" vào tiêu đề |
| 27 | §3 khác tiêu đề section | [U] §3 I10 (326) | "PROPOSED + BUSINESS_REVIEWED + E11 (hoãn)" | [U] tiêu đề I10 (504): "PROPOSED + BUSINESS_REVIEWED" | thấp | Thêm "+ E11 (hoãn)" hoặc "+ E15" vào tiêu đề |
| 28 | §3 khác tiêu đề section | [U] §3 I11 (327) | "PROPOSED + BUSINESS_REVIEWED + E11" | [U] tiêu đề I11 (511): "PROPOSED + BUSINESS_REVIEWED" | thấp | Thêm "+ E11" vào tiêu đề |
| 29 | Nhãn trạng thái không có trong quy ước | [U] §3 M06 (308), M08 (310) | "PROPOSED + VALIDATED_IN_SAMPLE"; "BOUNDED + BENCHMARK_ADDED" | [U] quy ước trạng thái (29–35): chỉ có EXISTING_BOUNDED, PROPOSED + BUSINESS_REVIEWED, OWNER_DECISION_PENDING, BLOCKED | thấp | Định nghĩa VALIDATED_IN_SAMPLE, BENCHMARK_ADDED, BOUNDED trong quy ước |
| 30 | Đoạn mở đầu nói "không đổi" nhưng nội dung đã đổi | [U] §4 mở đầu (344) | "Không đổi so với v1.0, trừ việc bỏ đường dẫn máy cá nhân." | [U] M08 (394): "(mới ở v1.2)"; M07 (389): "Cập nhật 07/10 (E11)" | thấp | Đổi thành "Các phần cập nhật ghi rõ ngày và phiên bản ngay trong section" |
| 31 | Đoạn mở đầu nói "giữ nguyên" nhưng có cập nhật mới hơn v1.1 | [U] §5 mở đầu (448) | "Mỗi section giữ nguyên nội dung v1.0; phần Cập nhật 07/10 là mới ở v1.1." | [U] I10 (509): "Cập nhật 11/10 (E15)" | thấp | Sửa câu mở đầu cho khớp các cập nhật sau v1.1 |
| 32 | Đầu file và lịch sử phiên bản liệt kê khác nhau | [U] đầu file (12) | "Cập nhật … 05/10/2026 cho M06, M08, M09, M10, M11" | [U] §9 v1.0 (683): "cập nhật 05/10 cho M06, M07, M08, M09, M10, M11" | thấp | Thêm M07 vào dòng 12 |
| 33 | Phiên bản đi kèm cũ | [R] dòng 3 | "đi kèm Ultimate Method v1.12" | [U] dòng 3: "Phiên bản 1.13 · ngày 11/10/2026" | thấp | Ghi "đi kèm v1.13" (hoặc "v1.12 trở lên") ở lần sửa danh mục kế tiếp |
| 34 | Cách thu S02 ghi khác nhau | [R] S02 cột Công cụ (65) | "Kalodata (file xuất, gói P4)" | [U] M08 (408): "API đã xác nhận trả được ROAS và CPA"; [K] B1 (322): "Kalodata API, S02" | thấp | Thêm "API (ROAS/CPA)" vào cột Công cụ của S02 |
| 35 | Section nhắc nền tảng không dùng được | [U] I11 (514) | "so giữa nền tảng (Shopee, TikTok Shop, Facebook, Instagram)" | [R] S09 (77): "Không dùng được hiện tại"; S08 (76): "Tạm ngừng thu" | thấp | Ghi "Facebook, Instagram khi có nguồn dùng được" hoặc bỏ |
| 36 | Ngưỡng test và kết luận test của S07 lệch | [U] G8 (851) | "≥50% bản ghi liên quan, ≥30% lời khách ứng viên" | [R] S07 (75): "10–32% lời khách ứng viên trên mẫu chấm" mà ghi "dùng được" | thấp | Ghi lý do S07 vẫn đạt (trong nhật ký test) hoặc sửa kết luận |
| 37 | Số thẻ nguồn trên màn hình nói khác nhau | [K] Tóm tắt Phần B (72–73) | "Hiện có 5 thẻ"; "Thêm 7 thẻ" (5 + 7 = 12) | [K] dòng 14: "B1 contains **11 cards**; Trends is an operation in the SerpApi card" | thấp | Đổi thành "Thêm 6 thẻ và 1 dòng Trends trong thẻ SerpApi" |
| 38 | Gói việc thêm loại tiếng nói không có trong Ultimate | [P] P9-07 (432) | "a `REVIEW_VIDEO` reading is read as creator voice" | [U] mục 1 (56): ba loại tiếng nói là lời khách, lời người bán, phản ứng thị trường | thấp | Ghi rõ "creator voice" thuộc loại nào trong ba loại (hoặc thêm vào Ultimate) |
| 39 | Ngưỡng không thể đạt vì thiếu nguồn | [U] §6.3 (599) | "Hai sàn: Có review cả Shopee và TikTok Shop" | [R] S06 (74): "Chưa có bộ thu", trạng thái "Đề xuất" | thấp | Thêm "khi có bộ thu TikTok Shop" như [K] U-22 đã ghi |
| 40 | Chỗ "chủ duyệt" chưa có quy tắc mặc định trong E11 | [U] §6.2 (580) | "Định dạng … Xếp nhóm, I12, Danh sách định dạng do chủ duyệt" | [U] E11 (209): chỗ ghi "chủ duyệt" thì "dùng quy tắc mặc định trong bảng dưới" (bảng không có dòng này) | thấp | Thêm dòng "danh sách định dạng" vào bảng E11, hoặc ghi là AI đề xuất |

---

## 3. Các phép kiểm không thấy lệch

- **Nguồn hạng D ở chỗ báo cáo dùng:** không có. Bảng §2 của [R] không có nguồn hạng D. Hai nguồn hạng D (bộ đếm và trang tổng hợp lại số liệu) chỉ nằm trong §4 "không dùng". [R] quy tắc 2 ("Hạng D không vào báo cáo") khớp với [K] B1.
- **Section không có nguồn chính:** không có lỗi.
  - I01 để "—", nhưng có ghi chú E7 (câu hỏi làm việc), đúng thiết kế.
  - M01, M11, M12, I14, I15 ghi "Tổng hợp". M13, I03, I17 ghi "Mọi nguồn đã dùng". Cả hai đều đúng định nghĩa ở [R] §3.
- **Gói việc và kế hoạch dùng mã không tồn tại:** không có.
  - [P] và [K] chỉ dùng mã nguồn S05, S07, S08, S13–S15, S19–S23, S25, S26. Tất cả đều có trong [R].
  - Mã quy tắc E1–E15, L1–L10, G2, G6, G7, G8 đều có trong [U].
  - Mã G-01…G-13 có trong [P]. Các mã U-xx có trong [K].
- **Nguồn đang dùng hoặc đã duyệt mà thiếu thẻ B1:** không có.
  - Các nguồn S01, S02, S04, S05, S07, S14, S15, S19 (kèm S13, S26), S20, S21, S22, S23, S25 đều có thẻ hoặc dòng.
  - Các nguồn bị loại khỏi màn hình đều có lý do ghi ở [K] B1 (dòng 317), khớp với trạng thái trong [R].
- **Ngoại lệ sửa quy tắc và quy tắc đã nhắc lại ngoại lệ:** các cặp sau đều khớp. Ngoại lệ trừ ba chỗ ở phát hiện 20–22.
  - E14 sửa E8, E11 và mục 6.3: cả ba đều ghi "E14".
  - E15 sửa L4: L4 ghi "Ngoại lệ … theo E15".
  - E14 mục 6 và E15 mục 5 nhắc nhau.
  - Quyết định 11/10: quy tắc 3 và L5 đều ghi #209.
  - E12, E13 cho nêu tên nguồn: [R] quy tắc 7 có ghi.
- **Phiên bản và ngày giữa §9 và đầu file:** dòng 3 của [U] (v1.13, 11/10/2026) khớp mục cuối §9. Các dòng của [C] (BR-20261005-01 … BR-20261011-03) khớp số phiên bản và ngày trong §9.
- **Quyết định của chủ ngày 11/10 (#209) giữa các file:**
  - Bốn quyết định U-26, U-11 giai đoạn 1, U-32, U-40 trong [K] khớp với [U] E14, E15, quy tắc 3, L5.
  - Thứ tự làm việc trong [K] (dòng 14, 408) khớp nhau.
- **Quy tắc không nêu tên nhà cung cấp:** [P] G-08 khớp [R] quy tắc 7. Màn hình nguồn nội bộ được nêu tên, như [K] B-05 ghi.
- **Tên file kế hoạch "v1.11":** [K] dòng 12 đã nói rõ tên file và các tham chiếu cũ được giữ để truy vết, nên không tính là lệch. Điều này áp cho dòng 39 và 146.

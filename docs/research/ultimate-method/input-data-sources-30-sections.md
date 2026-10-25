# Input data sources for 30 sections

> Bản cập nhật 22/10/2026. Bản trước: [bản 21/10/2026 lần 2](../../outdated/2026-10-22-2/docs/research/ultimate-method/input-data-sources-30-sections.md).

Nguồn dữ liệu đầu vào cho 30 section · Phiên bản 1.9 · ngày 08/10/2026 (ngày 12/10/2026: rà khớp chữ, ghi quyết định của chủ về trạng thái S07, S15, S21, S22 và bảng mục 3; không thêm, bớt nguồn; ngày 19/10/2026: cập nhật dòng S05 trong bảng mục 2, phiên bản giữ 1.9 theo cách ghi của CHANGELOG; ngày 21/10/2026: cập nhật cột trạng thái mục 2, bảng mục 3 và mục 4 theo kiểm tra nguồn trên 3 lượt Market chạy thật ngày 20/10/2026 và quyết định bỏ S11 của chủ ngày 17/10/2026, phiên bản giữ 1.9, DS-20261021-01; ngày 21/10/2026 lần 2: ghi kết quả thử bộ thu bên ngoài cho S07, S15, S16 ở cột trạng thái, công cụ, chi phí, phiên bản giữ 1.9, DS-20261021-04; ngày 22/10/2026: ghi gói sửa nguồn đã triển khai cho S05, S14, S17, S20, S25 và gói SRC2 tạm gác cho S21–S24 ở cột trạng thái, phiên bản giữ 1.9, DS-20261022-01) · đi kèm [Ultimate Method](ultimate-method-30-sections.md) v1.13

Đây là **nguồn chuẩn về danh mục nguồn dữ liệu**. File này trả lời ba câu hỏi:
- có những nguồn nào;
- mỗi nguồn đáng tin tới đâu;
- section nào dùng nguồn nào.

Quy tắc dùng nguồn (được làm gì, cấm gì) vẫn nằm ở file Ultimate. File này chỉ trỏ tới quy tắc bằng mã: E (ngoại lệ), L (làm rõ), G (giải thích ở phụ lục Ultimate).

Mỗi nguồn có một mã **S + số** (ví dụ S05). Mã này dùng chung trong file này, trong file Ultimate, trong gói việc và trong trích dẫn nội bộ. Tiền tố S để không lẫn với E (ngoại lệ).

---

## 1. Thang đánh giá nguồn

Mỗi nguồn được chấm theo **hai trục riêng**, không gộp thành một điểm. Lý do: một nguồn có thể rất đáng tin ở câu hỏi này nhưng yếu ở câu hỏi khác. Ví dụ review là bằng chứng tốt nhất cho "khách đã nói gì", nhưng gần như vô dụng cho "bao nhiêu phần trăm khách nghĩ vậy".

### 1.1 Hạng tin cậy: con số hoặc nội dung có đúng như nguồn nói không

| Hạng | Nghĩa | Ví dụ | Cách dùng trong báo cáo |
|---|---|---|---|
| **A** | Số liệu chính thức có công bố phương pháp, hoặc dữ liệu gốc của chủ | Cục Thống kê; dữ liệu đơn hàng của shop chủ | Dùng trực tiếp, ghi nguồn |
| **B** | Bản ghi gốc của nền tảng: nội dung đúng như nền tảng hiển thị | Review, bình luận, bài viết, trang bán, quảng cáo và ngày chạy | Đúng về chuyện "ai đó đã viết hay đăng gì, lúc nào", **không** chứng minh điều được viết là đúng. Số nền tảng tự báo (CTR, lượt thích) ghi là "nền tảng tự báo" |
| **C** | Ước tính hoặc tổng hợp của bên thứ ba | Doanh thu ước tính từ công cụ theo dõi sàn; lượt truy cập ước tính; báo chí; khảo sát của doanh nghiệp | Luôn có nhãn "ước tính" hoặc câu miễn trừ (E1); đối chiếu với nguồn khác khi có |
| **D** | Không truy được nguồn gốc, mô hình không công bố, hoặc quá cũ | Trang tổng hợp lại số liệu của nơi khác; bộ đếm ước lượng | **Không** đưa vào báo cáo. Chỉ dùng để gợi ý đi tìm nguồn gốc |

### 1.2 Độ đại diện: mẫu có phản ánh đúng tổng thể cần nói tới không

| Mức | Nghĩa | Ví dụ |
|---|---|---|
| **Cao** | Khung chọn mẫu đầy đủ, có phương pháp chọn mẫu | Thống kê toàn quốc |
| **Vừa** | Mẫu chọn theo quy tắc rõ, nhưng không phủ hết | Top sản phẩm theo doanh thu trên sàn |
| **Thấp** | Người viết tự chọn có viết hay không | Review, bình luận, bài mạng xã hội |

### 1.3 Quy tắc dùng hạng

1. **Hạng không dùng để loại nguồn trái chiều.** Khi hai nguồn mâu thuẫn, ghi cả hai cạnh nhau kèm hạng, theo M01 (không bỏ phiếu đa số, không chọn nguồn mới nhất). Ví dụ: "số chính thức (hạng A) cho thấy…; số ước tính (hạng C) cho thấy…".
2. **Hạng D không vào báo cáo.**
3. **Hạng C luôn có nhãn "ước tính".**
4. **Nguồn có độ đại diện thấp** luôn đi kèm "trong mẫu" và không được quy ra phần trăm khách hàng (quy tắc 2, 4).
5. **Hạng dùng để chọn nguồn khi đi thu dữ liệu:** cùng một câu hỏi, ưu tiên nguồn hạng cao hơn nếu cách thu khả thi.
6. **Hạng có thể đổi sau khi test.** Mỗi lần đổi ghi vào mục 5 và nhật ký thay đổi.
7. **Trong báo cáo** không nêu tên nhà cung cấp, trừ khi quy tắc yêu cầu (E12, E13). Báo cáo dùng cột "Tên trong báo cáo". Phụ lục M13/I17 liệt kê nguồn đã dùng kèm hạng.

---

## 2. Danh mục nguồn

Cột "Công cụ" chỉ dùng trong tài liệu kỹ thuật. Trạng thái tính tới 08/10/2026; S07, S15, S21, S22 cập nhật ngày 12/10/2026. Ô nào có chữ "Kiểm tra 21/10/2026" thì ghi kết quả trên 3 lượt Market chạy thật ngày 20/10/2026; bảng tóm tắt ở [Trạng thái nguồn dữ liệu](source-status.md) mục 2b. Ô nào có chữ "Gói sửa 22/10/2026" thì ghi bản sửa đã triển khai ngày 22/10/2026; chưa có lượt chạy thật sau đó (mục 2d của trang trạng thái).

Ngày 12/10/2026 chủ duyệt S07, S15, S21, S22, ghi "Đã duyệt (chủ 12/10/2026)" ở cột trạng thái. Theo E14 của file Ultimate, hệ thống được tự thu các nguồn này trong trần chi đã cấu hình.

Nhãn hiện tại của từng nguồn (5 nhãn, chủ chốt 12/10/2026) và nhật ký đổi nhãn nằm ở [Trạng thái nguồn dữ liệu](source-status.md). Trang đó chỉ để đọc, không có code nào đọc nhãn. Cột "Trạng thái" ở đây giữ ghi chú chi tiết.

**Quy ước trạng thái:**
- **Đang dùng:** đã có trong luồng hoặc đã dùng cho báo cáo.
- **Đã test:** có kết quả thử (xem mục 5).
- **Chờ test:** đã có kịch bản thử.
- **Đề xuất:** chưa có kịch bản.
- **Không dùng:** xem mục 4.

### 2.1 Bán hàng và thị trường

| ID | Nguồn | Tiếng nói | Công cụ | Tên trong báo cáo | Hạng | Đại diện | Trạng thái | Chi phí | Ràng buộc |
|---|---|---|---|---|---|---|---|---|---|
| S01 | Dữ liệu bán hàng trên sàn: doanh thu, đơn vị bán, giá, gian hàng, thương hiệu theo tiêu đề | Thị trường | Metric (file xuất; tự động hoá ở gói P6) | "dữ liệu bán hàng ước tính trên sàn" | C | Vừa | Đang dùng | Theo gói thuê bao của chủ | E10, E11, M03–M05; ghi "ước tính" |
| S02 | Video bán hàng, creator, sản phẩm TikTok: doanh thu, lượt xem, chi quảng cáo, ROAS/CPA | Thị trường | Kalodata (file xuất, gói P4) | "dữ liệu video bán hàng (ước tính)" | C | Vừa | Đang dùng (một phần); gói P4 nhập file video và creator đã merge ngày 08/10/2026 | Theo gói thuê bao | E1 (ROAS/CPA chỉ tham khảo); E5 phép kiểm 2, 3 |
| S03 | Nhà cung cấp, xuất nhập khẩu theo doanh nghiệp | Thị trường | TradeInt | "dữ liệu thương mại ước tính" | C | Vừa | Chưa dùng được (chưa có phiên truy cập hợp lệ) | Theo gói thuê bao | M06 |
| S04 | Trang bán sản phẩm: tiêu đề, mô tả, ảnh, quy cách, giá niêm yết | Người bán | Chụp trang (Metric web snapshot, PR #137); bộ thu sàn | "trang bán của người bán" | B | Vừa | Đang dùng | Không | L7; M08 (đơn vị chuẩn, E9) |

### 2.2 Lời khách

| ID | Nguồn | Tiếng nói | Công cụ | Tên trong báo cáo | Hạng | Đại diện | Trạng thái | Chi phí | Ràng buộc |
|---|---|---|---|---|---|---|---|---|---|
| S05 | Review Shopee, có số sao | Khách | Từ 19/10/2026: dịch vụ Shopee API mới (gói S, tối đa 300 review mỗi sản phẩm, chạy từ lần triển khai tới). Bộ thu cũ (Apify, actor zen-studio) chỉ còn bản miễn phí 20 review mỗi sản phẩm cho báo cáo chạy thử. Báo cáo Market chỉ đếm review, không trích nguyên văn | "review công khai trên Shopee" | B | Thấp | Đang dùng. Kiểm tra 21/10/2026: dịch vụ mới đã triển khai, nhưng 3/3 lượt bị chặn, 0 review; lỗi ở phía ứng dụng. Gói sửa 22/10/2026 (#365): một dòng lạ trong danh sách việc thu chung không còn chặn việc thu review, gọi lại tối đa 1 lần; đã triển khai 22/10 (bản `2fc699d1`), chờ lượt chạy thật | Theo lượt; trong trần chi đã cấu hình (E14) | L1, L6; mục 6.3 |
| S06 | Review TikTok Shop | Khách | Chưa có bộ thu | "review công khai trên TikTok Shop" | B | Thấp | Đề xuất | — | Như S05 |
| S07 | Bình luận dưới video TikTok | Khách | Apify (clockworks, datadoping) | "bình luận công khai dưới video" | B | Thấp | Đã duyệt (chủ 12/10/2026); đã test (R3, R4): dùng được. 10–32% lời khách ứng viên trên mẫu chấm, cao hơn hẳn tìm bài Facebook. Pilot dùng datadoping, dự phòng clockworks. Đưa vào hệ thống bằng gói P9. Kiểm tra 21/10/2026: chưa chạy trên máy chủ, vì tài khoản thu đã hết tiền và Insight tạm dừng từ 19/10. Thử bộ thu khác (epctex) ở gói miễn phí 21/10/2026 (ST-20261021-01): 10/10 bình luận đúng chủ đề, gói miễn phí chỉ cho 10 dòng; lượt đủ mẫu chờ chủ quyết | ~$0,33 (datadoping) – $1,00 (clockworks) / 1.000 bình luận duy nhất | Ẩn danh người viết; lọc tài khoản bán hàng; **lọc trùng theo mã video + mã bình luận**; vị trí trích dẫn = link video + mã bình luận (không có link trực tiếp tới bình luận); E5 phép kiểm 4 |
| S08 | Bài viết Facebook công khai | Khách | Agent-Reach (OpenCLI); Apify Facebook Posts Search | "bài viết công khai trên Facebook" | B | Thấp | **Tạm ngừng thu** (chủ quyết 08/10/2026). Đã test: Agent-Reach một phần; Apify tìm bài công khai R1 không đạt, R2 một phần. Bài công khai chủ yếu là bài bán hàng, chỉ 0–8% lời khách. Không thu bài trong nhóm (chủ quyết 08/10/2026) | Agent-Reach: không; Apify: ~$0,23–0,26 cho 75–86 bài | Ẩn danh; dùng tài khoản riêng; L5, L7; bài không có ngày không vào số đếm theo kỳ |
| S09 | Instagram | Khách / người bán | Agent-Reach (không dùng được); Apify chỉ trả link | "bài viết công khai trên Instagram" | B | Thấp | Không dùng được hiện tại | — | — |
| S10 | X (Twitter) | Khách | Apify Tweet Scraper | "bài viết công khai trên X" | B | Rất thấp ở Việt Nam | Đã test (R7): một phần. 94% bài đúng sản phẩm, nhưng chỉ 24% là lời khách ứng viên; nhiều câu mô tả lặp mẫu. Chỉ dùng làm nguồn phụ, có lọc | ~$0,08 cho 200 bài | Chưa xác minh được người thật, người Việt |
| S11 | Bình luận YouTube | Khách | yt-dlp, Agent-Reach | "bình luận công khai trên YouTube" | B | Thấp | **Không dùng** (chủ bỏ ngày 17/10/2026) | Không | Như S07 |
| S12 | Dữ liệu của chính shop chủ: đơn hàng, đổi trả, tin nhắn, đánh giá | Khách | Chủ cung cấp | "dữ liệu của shop" | A | Vừa (khách của shop) | Chưa có | Không | Lọc thông tin cá nhân; tách khỏi dữ liệu công khai |
| S13 | Công thức, bài hướng dẫn dùng sản phẩm | Khách / creator | Tìm kiếm mở rộng (S19) | "bài hướng dẫn công khai" | C | Thấp | Đề xuất | Theo S19 | Chỉ dùng cho hoàn cảnh dùng (I02); không suy tỷ lệ |

### 2.3 Nội dung và quảng cáo của người bán

| ID | Nguồn | Tiếng nói | Công cụ | Tên trong báo cáo | Hạng | Đại diện | Trạng thái | Chi phí | Ràng buộc |
|---|---|---|---|---|---|---|---|---|---|
| S14 | Nội dung video bán hàng: lời thoại, hình, chữ trên màn hình | Người bán | Công cụ đọc video `/watch` | "nội dung video của người bán" | B | Vừa (theo top video của S02) | Gói P9 (đã có checklist). Kiểm tra 21/10/2026: chạy 3/3 lượt, đọc 2–3 trong 9 video mỗi lượt, 0 đoạn lên báo cáo; ứng viên chỉ đến từ kết quả tìm kiếm chung, chưa lấy từ top video của S02. Gói sửa 22/10/2026 (#367): xếp video theo doanh số, bỏ video trùng, rồi mới cắt theo trần; bỏ sản phẩm chưa xác nhận; đã triển khai 22/10 (bản `2fc699d1`), chờ lượt chạy thật | Không, nếu chạy trên máy | L7; mục 6.2; E5 phép kiểm 1 |
| S15 | Thư viện quảng cáo Meta: ngày bắt đầu, trạng thái đang chạy, một số thẻ có ngưỡng chi (ví dụ ">1 triệu đồng") | Người bán + tín hiệu trả tiền | OpenCLI (lệnh browser), đọc theo trang; cùng công cụ với Metric (gói P6) | "thư viện quảng cáo công khai của Meta" | B | Vừa | Đã duyệt (chủ 12/10/2026); đã test (ST-20261008-22): **Đạt** cả 5 tiêu chí khi đọc theo trang (3/3 trang, 39/39 quảng cáo đúng sản phẩm, ngày bắt đầu khớp 10/10). Tìm theo từ khoá chỉ 1/50 và 9/50 quảng cáo đúng sản phẩm: chỉ dùng để tìm trang. Kiểm tra 21/10/2026: máy tự đọc dừng ở 3/3 lượt, vì trình duyệt trên máy chủ đang đăng nhập Facebook; chưa lần nào ra dữ liệu; cách xử lý chờ chủ quyết. Thử bộ thu bên ngoài, không đăng nhập, 21/10/2026 (ST-20261021-04 đến -13): đọc được tối đa 150 quảng cáo mỗi lượt; "quạt điện" 22/136 là quạt thật; không có lượt tiếp cận, tiền chi; cần lọc ngày, loại hàng và chủ trang; chưa đưa vào hệ thống | Không | Đọc theo trang của thương hiệu trong tập đối thủ (E11); lọc nghĩa L9 khi tìm trang; số ngày tính tới ngày thu, không chứng minh chạy trả tiền liên tục; nền tảng đọc từ biểu tượng còn thiếu; E5 phép kiểm 3; G6 |
| S16 | Quảng cáo nổi bật trên TikTok (Creative Center): nội dung, thương hiệu, CTR, lượt thích | Người bán + số nền tảng tự báo | Máy tự đọc trang công khai (từ 17/10/2026); thử bộ thu Apify `codebyte`, `lurkapi` (21/10/2026) | "thư viện quảng cáo nổi bật của TikTok" | B | Vừa | Đã test (R5): không đạt, actor lỗi và không trả quảng cáo nào. Từ 17/10/2026: máy tự đọc trang công khai, không đăng nhập, sau cờ. Kiểm tra 21/10/2026: dừng ở 3/3 lượt, vì trang đòi đăng nhập; chưa lần nào ra dữ liệu; hướng đi chờ chủ quyết. Thử bộ thu bên ngoài, không đăng nhập, 21/10/2026 (ST-20261021-14 đến -31): thư viện quảng cáo TikTok chỉ có châu Âu, Việt Nam 0; danh sách quảng cáo nổi bật Việt Nam đọc được; 2 bộ tốt nhất 10/27 và 7/20 là quạt thật; chưa đưa vào hệ thống | Máy tự đọc: không. Bộ thu bên ngoài: ~$0,001–0,004 cho 20–27 quảng cáo (21/10/2026) | CTR, lượt thích ghi "nền tảng tự báo"; chỉ là mẫu nổi bật, không phải toàn bộ quảng cáo; không có ngày chạy, chỉ khung 7/30/180 ngày; E5 |
| S17 | Thư viện quảng cáo Google: ngày hiện lần đầu, lần cuối, khoảng lượt hiển thị | Người bán + tín hiệu trả tiền | Apify Google Ads Scraper | "thư viện quảng cáo công khai của công cụ tìm kiếm" | B | Vừa | Đã test (R6): một phần. Có ngày hiện đầu/cuối cho 100% quảng cáo. Nhưng 65% quảng cáo có hai bộ ngày lệch nhau, không có lượt hiển thị cho Việt Nam, chỉ 11% có chữ, và cần URL nhà quảng cáo trên trang minh bạch quảng cáo. Từ 17/10/2026 chủ duyệt; từ 19/10/2026 máy tự tìm trang web của thương hiệu. Kiểm tra 21/10/2026: 3/3 lượt có 0 mẫu quảng cáo; 6 trong 9 lần tra không tìm được trang web của thương hiệu, 2 lần ra nhiều trang. Gói sửa 22/10/2026 (#366): chọn 1 tên miền mỗi thương hiệu, ưu tiên .vn, lưu lại lựa chọn; đã triển khai 22/10 (bản `2fc699d1`), chờ lượt chạy thật | ~$0,14 cho 100 quảng cáo | E5 phép kiểm 3: **chưa dùng** cho tới khi rõ nghĩa hai bộ ngày. Ưu tiên S15. Quảng cáo của một thương hiệu gồm nhiều ngành hàng, phải lọc đúng sản phẩm |
| S18 | Trang thương hiệu Facebook: người theo dõi, đánh giá, có đang chạy quảng cáo | Người bán | Apify Facebook Pages Scraper | "trang thương hiệu trên Facebook" | B | Vừa | Đề xuất | ~$12 / 1.000 trang | L7 |

### 2.4 Tìm kiếm và xu hướng

| ID | Nguồn | Tiếng nói | Công cụ | Tên trong báo cáo | Hạng | Đại diện | Trạng thái | Chi phí | Ràng buộc |
|---|---|---|---|---|---|---|---|---|---|
| S19 | Kết quả tìm kiếm Google mở rộng, kể cả lọc theo khoảng thời gian và trong một trang báo | Tuỳ trang tìm thấy | SerpApi (gói P5) | "kết quả tìm kiếm Google" | Theo trang gốc | Thấp | Chạy trong mọi lượt Market. Kiểm tra 21/10/2026: 3/3 lượt có dữ liệu, 9 kết quả mỗi lượt. Lọc theo thời gian và tìm trong một trang báo: chủ duyệt 08/10/2026 | Theo lượt; trong trần chi đã cấu hình (E14) | Mỗi kết quả được chấm hạng theo trang gốc; ghi ngày đăng tách ngày sự kiện (M09); lọc nghĩa theo L9 |
| S20 | Google Trends: mức quan tâm tìm kiếm 0–100, từ khoá liên quan, theo vùng | Thị trường | SerpApi (gói P5) | "mức quan tâm tìm kiếm trên Google" | B | Vừa | Chạy trong lượt Market, cả theo thời gian và theo vùng. Kiểm tra 21/10/2026: chỉ chạy khi kỳ báo cáo kết thúc trong khoảng 7 ngày trước ngày chạy; 2/3 lượt bị bỏ qua vì kỳ cũ. Gói sửa 22/10/2026 (#366): hỏi đúng kỳ báo cáo, bất kỳ ngày nào từ 01/01/2004 đến hôm nay; kỳ sai hoặc ở tương lai bị bỏ qua có lý do, không gọi trả phí; kỳ ngắn ghi "theo ngày"; đã triển khai 22/10 (bản `2fc699d1`), chờ lượt chạy thật | Theo lượt | Là chỉ số tương đối, không phải lượt tìm; tách riêng khỏi doanh số (E10) |

### 2.5 Thống kê và tài liệu

| ID | Nguồn | Tiếng nói | Công cụ | Tên trong báo cáo | Hạng | Đại diện | Trạng thái | Chi phí | Ràng buộc |
|---|---|---|---|---|---|---|---|---|---|
| S21 | Cục Thống kê (nso.gov.vn): giá tiêu dùng, bán lẻ, chi tiêu hộ, sản xuất, xuất nhập khẩu, dân số, internet và mạng xã hội | Thị trường (vĩ mô) | File Excel qua API WordPress (gói P10); PDF qua gói P3 | **"Cục Thống kê (nso.gov.vn)"**, bắt buộc ghi | A | Cao | Đã duyệt (chủ 12/10/2026); đã kiểm 08/10; gói P10. Kiểm tra 21/10/2026: 2/3 lượt có số; lượt thạch dừa 0 số vì bước AI chọn nhóm hàng không ra kết quả. Gói sửa (SRC2) tạm gác 21/10/2026 | Không | E12; mục 6.4 |
| S22 | Số liệu Cục Thống kê theo tỉnh (chuyên mục địa phương trên nso.gov.vn) | Thị trường (vĩ mô) | PDF qua gói P3 | "Cục Thống kê (nso.gov.vn)" | A | Cao (theo tỉnh) | Đã duyệt (chủ 12/10/2026); đã kiểm 08/10. Kiểm tra 21/10/2026: dùng chung file với S21, nên cùng kết quả (2/3 lượt có số). Gói sửa (SRC2) tạm gác 21/10/2026 | Không | E12 |
| S23 | World Bank Data (API mở) | Thị trường (vĩ mô) | API World Bank | "Ngân hàng Thế giới (World Bank Open Data)" | A | Cao | Đã duyệt (E13, 08/10/2026); đã kiểm API; bộ thu đã vào hệ thống (17/10/2026). Kiểm tra 21/10/2026: 3/3 lượt có số; 1 lượt thiếu 1 chỉ số vì quá giờ và không gọi lại. Gói sửa (SRC2) tạm gác 21/10/2026 | Không | E13: ghi nguồn; không coi là xác nhận độc lập với S21 |
| S24 | UN Comtrade (API chính thức) | Thị trường (xuất nhập khẩu) | API UN Comtrade (cần đăng ký miễn phí) | "Cơ sở dữ liệu thương mại của Liên Hợp Quốc" | A | Cao (theo mã hàng) | Đã duyệt (chủ, 17/10/2026); bộ thu đã vào hệ thống. Kiểm tra 21/10/2026: 2/3 lượt có số; 1 lượt 0 dòng vì bước AI xác nhận mã hàng trả lời sai mẫu và không hỏi lại. Gói sửa (SRC2) tạm gác 21/10/2026 | Không | M06, M09 |
| S25 | Báo cáo ngành và báo cáo thường niên doanh nghiệp đã công bố | Bối cảnh | PDF chủ đính kèm qua gói P3; máy tự tìm và tải tối đa 2 tệp PDF mỗi lượt (sau cờ, mặc định tắt) | "báo cáo đã công bố của …" | B (báo cáo thường niên đã kiểm toán) / C (khảo sát ngành) | Vừa | Đang dùng ở M09 (v1.0); tự tìm PDF sau cờ TDN_RESEARCH_PDF_DISCOVERY_ENABLED. Kiểm tra 21/10/2026: chưa lần nào ra trích dẫn trong lượt tự động; 1 lượt tải được 2 tệp, nhưng báo cáo được dựng trước khi đọc xong tệp. Gói sửa 22/10/2026 (#367): kết quả đọc PDF đã lưu được đưa vào mọi lần dựng lại báo cáo (cả Insight); chờ đọc PDF có một hạn chung; đã triển khai 22/10 (bản `2fc699d1`), chờ lượt chạy thật | Không | Khung M09; không gắn nhãn số liệu toàn thị trường |
| S26 | Báo chí, tin an toàn thực phẩm | Bối cảnh | Tìm kiếm mở rộng (S19) | "tin đã đăng trên …" | C | Thấp | Đề xuất | Theo S19 | M09: tách ngày phát hành với ngày sự kiện |
| S28 | Hồ sơ người Việt trưởng thành do AI viết (1 triệu hồ sơ, dữ liệu tổng hợp); chỉ dùng cột đếm | Mốc toàn dân (không phải lời khách) | Tệp đếm dựng sẵn trên máy chủ (gói S28), không gọi mạng; sau cờ TDN_RESEARCH_POPULATION_BASELINE_ENABLED, mặc định tắt | "Dữ liệu dân số mô phỏng" | Không xếp hạng: không phải bằng chứng | Không áp dụng | Đã nối vào app sau cờ (gói S28, 24/10/2026); chỉ chạy cho lượt có Insight | Không | Chủ 17/10, 20/10, 22/10: chỉ làm mốc toàn dân ở I02 (giới × nhóm tuổi, 6 vùng, thành thị/nông thôn); không nêu tên bộ dữ liệu, nơi công bố hay mô hình; không chân dung, không trích chữ; so với số dân chính thức hoặc ghi "chưa so với số dân chính thức"; không chỉnh số |

### 2.6 Nguồn đã dùng trước đây

| ID | Nguồn | Công cụ | Hạng | Ghi chú |
|---|---|---|---|---|
| S27 | Bản quét review gian hàng của bên thứ ba, không có số sao và người viết | Dami | C | Dữ liệu review của báo cáo thạch dừa 05–07/10. Thiếu số sao và người viết. Lần thu sau dùng S05 |

---

## 3. Section dùng nguồn nào

Cột "Nguồn chính" là nguồn cho phép tính hoặc bằng chứng chính của section. Cột "Nguồn phụ" chỉ làm bối cảnh hoặc để đối chiếu. "Tổng hợp" nghĩa là section lấy kết quả của các section khác, không có nguồn riêng.

Mã nguồn có chữ "(đề xuất)" là nguồn **chưa có bộ thu** theo trạng thái ở mục 2, tính tới 21/10/2026. Section không được coi các nguồn này là đã có.

Nguồn **không dùng được** (test không đạt, tạm ngừng thu, chưa có phiên truy cập hợp lệ, chưa có dữ liệu, chủ đã bỏ) không đứng ở cột "Nguồn chính" hay "Nguồn phụ". Tính tới 21/10/2026 đó là S03, S08, S11, S12 và S16. S05 và S15 chưa lần nào ra dữ liệu trong 3 lượt Market chạy thật ngày 20/10/2026, nhưng vẫn đứng ở cột cũ; đổi chỗ là việc của chủ. Nếu cần nhắc, chúng chỉ nằm ở cột "Ghi chú", kèm lý do và điều kiện dùng lại. Khi trạng thái ở mục 2 đổi, sửa bảng này.

| Section | Nguồn chính | Nguồn phụ | Ghi chú |
|---|---|---|---|
| M01 Kết luận chính | Tổng hợp | — | E3 |
| M02 Phạm vi và phương pháp | S01, S02 | S21 | — |
| M03 Quy mô và diễn biến | S01 | — | Chỉ trong mẫu |
| M04 Cơ cấu thị trường | S01 | — | — |
| M05 Nhu cầu | S01 | S02, S20, S21, S23 | E10; mức quan tâm tìm kiếm ghi riêng |
| M06 Nguồn cung | S01 | S04, S21, S22, S24 | Chưa dùng được: S03 (chưa có phiên truy cập hợp lệ; chỉ dùng lại khi có phiên hợp lệ) |
| M07 Đối thủ | S01, S02 | S04, S14, S15, S17, S18 (đề xuất) | Tập đối thủ theo E11. Chưa dùng được: S16 (máy tự đọc dừng vì trang đòi đăng nhập; bộ thu bên ngoài đọc được ngày 21/10/2026 nhưng chưa vào hệ thống; chỉ dùng lại khi chủ duyệt cách thu) |
| M08 Giá và kinh tế đơn vị | S01, S04 | S02, S21 | E1, E9; giá tiêu dùng (S21) chỉ đặt cạnh |
| M09 Động lực và rủi ro | S21, S25, S26 (đề xuất) | S01, S02, S14, S19, S20 | Khung M09; S02, S14 (video) thêm theo quyết định của chủ 12/10/2026 |
| M10 Dự báo và kịch bản | S01 | S20, S21, S23 | Chỉ kịch bản có điều kiện; mức quan tâm tìm kiếm (S20) ghi riêng, không trộn với doanh số (E10); S20 thêm theo quyết định của chủ 12/10/2026 |
| M11 Cơ hội | Tổng hợp (M05, M07, I08, I09) | — | Giao 3 tín hiệu |
| M12 Hành động | Tổng hợp | — | E2 |
| M13 Phụ lục và truy nguồn | Mọi nguồn đã dùng | — | Liệt kê kèm hạng |
| Kết luận Insight | Tổng hợp | — | E6 |
| I01 Câu hỏi kinh doanh | — | — | E7 |
| I02 Khách hàng và hoàn cảnh | S05, S06 (đề xuất), S07 | S13 (đề xuất), S21 | E4 từ lời khách; E5 dùng S02, S14, S15, S17 (chưa dùng cho phép kiểm 3) cho lớp người bán nhắm tới. Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại), S16 (máy tự đọc dừng vì trang đòi đăng nhập; chỉ dùng lại khi có cách thu đạt), S12 (chưa có; dùng khi chủ có dữ liệu shop). Không dùng: S11 (chủ bỏ ngày 17/10/2026) |
| I03 Phương pháp nghiên cứu | Mọi nguồn đã dùng | — | Ghi riêng từng nguồn |
| I04 Hành vi | S05, S06 (đề xuất), S07 | — | Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại), S12 (chưa có; dùng khi chủ có dữ liệu shop) |
| I05 Cảm nhận và thái độ | S05, S06 (đề xuất), S07 | S10, S19 | L6 (số sao); S19 là nguồn phụ: kết quả tìm kiếm chỉ dẫn tới trang gốc, trang gốc mới là bằng chứng (chủ quyết 12/10/2026). Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại). Không dùng: S11 (chủ bỏ ngày 17/10/2026) |
| I06 Hành trình | S05 | — | Chỉ ghép trong cùng một bản ghi. Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại), S12 (chưa có; dùng khi chủ có dữ liệu shop) |
| I07 Lý do lựa chọn | S05, S06 (đề xuất), S07 | S04, S19 | Lời người bán (S04) đặt cạnh, theo L7. Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại) |
| I08 Rào cản | S05, S06 (đề xuất), S07 | S19 | S19 là nguồn phụ: kết quả tìm kiếm chỉ dẫn tới trang gốc, trang gốc mới là bằng chứng (chủ quyết 12/10/2026). Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại), S12 (chưa có; dùng khi chủ có dữ liệu shop) |
| I09 Nhu cầu chưa được đáp ứng | S05, S06 (đề xuất), S07 | — | Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại) |
| I10 Chủ đề và mối quan tâm | S05, S06 (đề xuất), S07 | S10, S20 | L3. Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại). Không dùng: S11 (chủ bỏ ngày 17/10/2026) |
| I11 Khác biệt giữa các nhóm | S05 và S06 (đề xuất), theo sàn; S05, S07 cho mua lẻ và mua sỉ khi chính bản ghi nói rõ (ví dụ "mua về bán", "mở quán") | — | Nhóm mặc định theo E11; L5. I11 chưa có trong danh sách section được dùng số Cục Thống kê (E12), nên chưa dùng S21; thêm vào danh sách cần chủ quyết |
| I12 Điểm tiếp xúc | S14, S15, S17, S07 | S21 (dùng internet, mạng xã hội), S19 | Chỉ ghi điểm tiếp xúc có xuất hiện; S19 là nguồn phụ: kết quả tìm kiếm chỉ dẫn tới trang gốc, trang gốc mới là bằng chứng (chủ quyết 12/10/2026). Chưa dùng được: S16 (máy tự đọc dừng vì trang đòi đăng nhập; bộ thu bên ngoài đọc được ngày 21/10/2026 nhưng chưa vào hệ thống; chỉ dùng lại khi chủ duyệt cách thu) |
| I13 Thương hiệu và đối thủ | S05, S06 (đề xuất), S07, S14, S15, S18 (đề xuất) | S04, S19, S26 (đề xuất) | L7; E5; S19 là nguồn phụ: kết quả tìm kiếm chỉ dẫn tới trang gốc, trang gốc mới là bằng chứng (chủ quyết 12/10/2026). Chưa dùng được: S08 (tạm ngừng thu; chỉ dùng lại khi chủ cho thu lại), S16 (máy tự đọc dừng vì trang đòi đăng nhập; chỉ dùng lại khi có cách thu đạt) |
| I14 Hướng cơ hội | Tổng hợp | — | — |
| I15 Định hướng chiến lược | Tổng hợp | — | E6 |
| I16 Thử nghiệm và đo lường | Chưa có nguồn chính dùng được | — | Không có kết quả có sẵn thì chỉ là thiết kế. Chưa dùng được: S12 (chưa có; dùng khi chủ có dữ liệu shop); khi có, dùng kết quả có sẵn của shop |
| I17 Phụ lục và bằng chứng | Mọi nguồn đã dùng | — | Liệt kê kèm hạng |

---

## 4. Nguồn đã xét và không dùng

| Nguồn | Lý do | Ngày xét |
|---|---|---|
| Khảo sát, phỏng vấn, tuyển người trả lời, người trả lời giả lập | Cấm theo quy tắc 6 | 05/10/2026 |
| Similarweb (trang, actor Apify) | Lượt truy cập ước tính (hạng C); đối thủ ngành tiêu dùng bán chủ yếu trên sàn nên ít giá trị | 08/10/2026 |
| Semrush | Như trên; bản miễn phí quá giới hạn | 08/10/2026 |
| Instagram qua Agent-Reach | Không lấy được nội dung | 08/10/2026 |
| Instagram Keyword Posts URLs (Apify) | Chỉ trả link, không có nội dung | 08/10/2026 |
| UN Comtrade Scraper (Apify) | Dùng API chính thức S24 thay thế | 08/10/2026 |
| Index Mundi | Hạng D: chỉ tổng hợp lại số của nơi khác | 08/10/2026 |
| Internet Live Stats | Hạng D: bộ đếm ước lượng, không truy được nguồn | 08/10/2026 |
| Statista | Chất lượng không đồng đều, nhiều số trả phí; muốn dùng số nào thì lấy từ nguồn gốc của số đó | 08/10/2026 |
| Tổng cục Dân số và Kế hoạch hoá gia đình | Số liệu không cập nhật từ 2015; dùng S21 | 08/10/2026 |
| CIA World Factbook, Gapminder | Chỉ cần cho so sánh giữa các nước; với Việt Nam, S21 chi tiết hơn | 08/10/2026 |
| Bộ Tư pháp (kết hôn, khai sinh) | Ít ngành cần; S21 đã có dân số và số sinh | 08/10/2026 |
| Bình luận YouTube (S11) | Chủ bỏ nguồn này | 17/10/2026 |

---

## 5. Nhật ký thử và kiểm định nguồn

Lịch sử từng lần thử thu và kiểm định nằm ở **[Input data sources: test and validation log](input-data-sources-test-log.md)**. Mục này chỉ giữ các bài học rút ra.

**Bài học từ bài test Apify:**
- **Agent-Reach** (08/10/2026): Instagram không đạt; bài Facebook công khai chỉ một phần; nhóm Facebook đã bỏ. Bài test thư viện quảng cáo Meta (S15) đạt khi đọc theo trang, chạy bằng lệnh browser của OpenCLI (ST-20261008-22). Dự án dùng OpenCLI trực tiếp cho S15 và Metric; không cần thêm lớp Agent-Reach. Gói P7 bỏ phần thu mạng xã hội, chuyển sang dựng chân dung từ review và bình luận.
- Tìm theo từ khoá sản phẩm trên mạng xã hội chủ yếu ra **bài của người bán**. Muốn có lời khách, nguồn tốt hơn là bình luận dưới video (S07) và review (S05). Không thu bài trong nhóm Facebook (chủ quyết 08/10/2026).
- Từ khoá tiếng Việt dễ ra kết quả lệch nghĩa. Từ v1.8, bước lọc nghĩa là quy tắc **L9** của file Ultimate. Ví dụ gặp trong bài test:
  - "thạch dừa" (thạch làm từ nước dừa lên men) lẫn với thạch rau câu nước dừa, thạch dừa xiêm nguyên quả, "thạch dứa", và các chữ "Thạch" trong tên riêng hay "thử thách";
  - "bình giữ nhiệt" lẫn với bình nóng lạnh, thùng ủ sữa chua, hộp cơm giữ nhiệt, "giữ vững nhiệt huyết", và bình làm quà tặng kèm sữa, bảo hiểm, ngân hàng.
- **Bình luận dưới video review là nguồn lời khách tốt nhất trong các lần thử** (S07: 10–32% bình luận là lời khách ứng viên, so với 0–8% khi tìm bài Facebook theo từ khoá). Bình luận còn cho câu hỏi trước khi mua, lời chê và cách bảo quản, chế biến (I07, I08). Từ v1.10, bình luận dưới video review được tính là lời khách; từ v1.11, cả bình luận dưới video bán hàng (L10 của file Ultimate, chủ quyết 08/10/2026); bình luận của người làm video hoặc tài khoản người bán không tính.
- Khi chấm mẫu, chia đều số bình luận cho từng video (ví dụ 10 bình luận mỗi video), không lấy 50 dòng đầu. 50 dòng đầu dễ rơi hết vào một video.
- Hai công cụ thu cùng một video với cùng giới hạn vẫn ra hai tập bình luận khác nhau. Cỡ mẫu ghi là "bình luận thu được", không phải "toàn bộ bình luận".
- Tên thương hiệu lấy theo tiêu đề có thể trùng thương hiệu khác ngành, ví dụ Niumi. Hoặc viết khác nhau giữa các nguồn, ví dụ "Fanhouse F" và "Fan House". Cần đối chiếu danh tính thương hiệu trước khi gộp (I13, E11).

---

## 6. Thêm hoặc sửa một nguồn

1. Thêm một dòng vào mục 2 với mã S kế tiếp, kèm hạng, độ đại diện, trạng thái và ràng buộc.
2. Cập nhật bảng section ở mục 3 nếu nguồn được dùng cho section nào.
3. Nếu nguồn cần quy tắc mới (ví dụ phải ghi tên nguồn, như E12), thêm quy tắc vào file Ultimate.
4. Sau mỗi lần thử hoặc kiểm định nguồn, thêm một dòng vào [nhật ký test và kiểm định](input-data-sources-test-log.md). Nếu hạng hoặc trạng thái đổi, sửa mục 2 trong cùng commit; trạng thái đổi thì sửa cả [trang trạng thái nguồn](source-status.md) và thêm một dòng nhật ký ở đó.
5. Ghi một dòng vào [CHANGELOG.md](CHANGELOG.md), cùng commit.

# Quy chuẩn dữ liệu đầu vào

Phiên bản 1.37 · ngày 20/10/2026

File này là **nguồn đúng duy nhất, mới nhất** về cách hệ thống báo cáo nhận và xử lý dữ liệu đầu vào: lấy từ nguồn nào, tin được tới đâu, giữ dữ liệu theo khuôn nào, xử lý qua những bước nào, theo quy tắc nào, giới hạn và chi phí ra sao. Trước đây các nội dung này nằm rải rác ở nhiều tài liệu trong kho mã; file này gom lại một chỗ. Mỗi khi có thay đổi về nguồn, quy tắc, giới hạn, trạng thái hay quyết định của chủ, file được cập nhật, tăng số phiên bản và ghi một dòng vào "Nhật ký thay đổi" ở cuối (xem Phần 9).

---

## Phần 1 · Đọc file này thế nào + thứ bậc

**File này là bản gom mới nhất.** Khi cần biết "nguồn này đang chạy chưa", "được thu bao nhiêu", "quy tắc nào áp dụng" thì đọc ở đây trước.

**Thứ bậc khi hai chỗ nói khác nhau** (cao nhất ở trên):

1. Quyết định của chủ viết trong chat **mới hơn** ngày của file này. Quyết định đó thắng cho tới khi file được cập nhật.
2. File này.
3. Các tài liệu gốc trong kho mã (danh sách bên dưới). Trong các tài liệu gốc:
   - Về **quy tắc**: theo tài liệu phương pháp chung (Ultimate).
   - Về **danh mục và hạng nguồn**: theo danh mục nguồn.
   - Về **trạng thái nguồn**: theo bảng trạng thái nguồn (cập nhật gần nhất 17/10), thắng cột trạng thái cũ trong danh mục.
4. Khi tài liệu gốc mâu thuẫn mà chưa chốt: ghi ở mục "Điểm mâu thuẫn cần chốt" (Phần 9). Không tự chọn bên nào.

**Cách đánh dấu trong file:**
- "chủ quyết dd/mm": quyết định của chủ, mới hơn tài liệu gốc.
- "chưa rõ": chưa tìm thấy căn cứ. Mỗi chỗ "chưa rõ" đều có trong "Chỗ còn hở".

**Các tài liệu gốc được gom** (để tra lại khi cần):
- Tài liệu phương pháp chung, 30 phần (bản 1.13): thứ bậc, quy tắc 1–9, L1–L10, ngoại lệ E1–E15, nguồn cho phần Insight, ngưỡng G1–G8.
- Danh mục nguồn dữ liệu đầu vào (bản 1.9): thang chấm, danh mục S01–S27, phần nào dùng nguồn nào, nguồn bị loại, cách thêm nguồn.
- Bảng trạng thái nguồn (cập nhật 17/10).
- Tệp giới thiệu, nhật ký thay đổi và nhật ký thử nguồn của bộ phương pháp.
- Quy tắc chung của phương pháp từng phần (khuôn dữ liệu).
- Quyết định kiến trúc số 0005: bốn lớp bằng chứng.
- Mã của bộ 14 quy tắc và cổng kiểm nghiệp vụ của báo cáo Market.
- Mã của từng đường thu dữ liệu (để lấy số giới hạn).
- Quyết định của chủ và tình hình vận hành tới tối 17/10/2026.

Đường dẫn chính xác của từng tài liệu nằm trong file kỹ thuật đi kèm.

---

## Phần 2 · Từ điển chữ dùng

| Chữ | Nghĩa |
|---|---|
| Nguồn | Một nơi lấy dữ liệu, có mã S01…S27. Ví dụ: số bán trên sàn, đánh giá Shopee, số liệu Cục Thống kê. |
| Công cụ | Dịch vụ hoặc phần mềm dùng để lấy dữ liệu từ nguồn. Tên công cụ không bao giờ hiện trong báo cáo. |
| Bản gốc | Tệp đúng như lúc tải về, không sửa. Mọi con số phải lần ngược được về bản gốc. |
| Dấu nhận dạng file | Một chuỗi ký tự tính từ nội dung tệp. Tệp đổi một chữ thì dấu đổi. Dùng để chứng minh "đúng tệp này". |
| Vị trí trong file | Chỗ chính xác của con số hay câu trích trong bản gốc: dòng, ô, trang, đoạn. |
| Kỳ dữ liệu | Khoảng thời gian số liệu nói tới: từ ngày, tới ngày, theo múi giờ nào, tính theo cách nào. |
| Thiếu | Nguồn không có giá trị. Khác với 0. |
| Bằng không thật | Nguồn có ghi rõ là 0. |
| Mẫu | Phần dữ liệu thu được (ví dụ: các sản phẩm trong kết quả tìm kiếm). Không phải cả thị trường. |
| Trong mẫu | Cách nói bắt buộc khi con số chỉ đúng trong phần đã thu. |
| Đại diện | Mức mà mẫu phản ánh được toàn bộ khách hoặc thị trường: Cao, Vừa, Thấp. |
| Ước tính | Số do bên thứ ba tự tính, không phải số gốc của sàn hay của nhà nước. Luôn ghi chữ "ước tính". |
| Hạng nguồn | A, B, C, D: mức tin cậy của nguồn (Phần 3). |
| Lọc nghĩa | Bước bỏ những bản ghi không đúng sản phẩm (ví dụ "thạch dừa" lẫn sang "dừa tươi"). |
| Bộ mã chủ đề | Danh sách chủ đề (khen, chê, lý do mua…) dùng để xếp bình luận. Chỉ mã đã duyệt mới được đếm. |
| Tiếng nói khách | Lời của người mua: đánh giá, bình luận. |
| Tiếng nói người bán | Lời của shop, thương hiệu, quảng cáo, video bán hàng. |
| Cổng kiểm | Bộ kiểm tra tự động chạy trên báo cáo trước khi giao. Sai luật cứng thì dừng. |
| 14 quy tắc | Bộ 14 điểm kiểm báo cáo Market rút ra từ lần sửa tay báo cáo thạch dừa. |
| Lần chạy thử | Một lần chạy thật, nhỏ, để kiểm một đường thu mới trước khi dùng rộng. |
| Cờ bật/tắt | Công tắc trong cấu hình máy chủ. Mặc định tắt; chủ đồng ý thì bật. |
| Đề xuất | Ý kiến do hệ thống đưa ra, luôn kèm chữ "đề xuất, chờ chủ duyệt". Người quyết là chủ. |
| Phần Market / phần Insight | Hai loại báo cáo. Market: thị trường, số bán. Insight: khách hàng, lời khách. |

---

## Phần 3 · Thang chấm nguồn

**Hạng tin cậy:**

| Hạng | Nghĩa | Ví dụ |
|---|---|---|
| A | Số chính thức của nhà nước hoặc tổ chức quốc tế, hoặc dữ liệu của chính chủ | Cục Thống kê, Ngân hàng Thế giới, UN Comtrade, dữ liệu shop của chủ |
| B | Bản ghi gốc của sàn hoặc nền tảng | Trang sản phẩm, đánh giá Shopee, thư viện quảng cáo |
| C | Số do bên thứ ba ước tính | Số bán do công cụ đo ngoài ước tính, bài báo |
| D | Không đủ tin | Không bao giờ đưa vào báo cáo |

**Độ đại diện:** Cao, Vừa, Thấp. Ví dụ: đánh giá Shopee là hạng B nhưng đại diện Thấp, vì chỉ người tự viết mới có mặt.

**Quy tắc dùng hạng:**
1. Không dùng hạng để bỏ một nguồn khi hai nguồn nói khác nhau. Phải nêu cả hai, kèm hạng.
2. Hạng D không bao giờ vào báo cáo.
3. Hạng C luôn ghi "ước tính".
4. Nguồn đại diện Thấp luôn nói "trong mẫu". Không đổi thành "bao nhiêu phần khách hàng".
5. Hạng giúp chọn nguồn nào thu trước.
6. Hạng có thể đổi sau một lần thử.
7. Báo cáo không nêu tên công cụ. Chỉ nêu tên nguồn chính thức theo E12, E13 và danh sách tên được phép (Phần 7).

---

## Phần 4 · Danh mục nguồn

**Sáu nhóm trạng thái** (chủ nhận ngày 17/10):
- **Tự chạy**: đang thu tự động trong mỗi báo cáo.
- **Bật, chưa kiểm thật**: cờ đã bật nhưng chưa có lần chạy thật xác nhận.
- **Có mã, đang tắt**: mã xong nhưng cờ tắt.
- **Dừng vì tiền**: công cụ hết tiền hoặc hết điểm.
- **Chưa có đường thu**: chưa có mã thu.
- **Không thu**: chủ dừng, không có công cụ, hoặc bị bỏ.

Cột "Trạng thái" dưới đây ghi nhóm của chủ ngày 17/10. Nhãn trong bảng trạng thái nguồn để trong ngoặc. Nếu hai bên khác nhau thì xem "Điểm mâu thuẫn cần chốt".

| Mã | Tên dễ hiểu | Tên hiện trong báo cáo | Hạng | Đại diện | Dùng cho phần nào | Trạng thái hiện tại | Giới hạn / chi phí mỗi báo cáo | Công cụ | Việc đang chờ |
|---|---|---|---|---|---|---|---|---|---|
| S01 | Số bán ước tính trên sàn | "dữ liệu số bán" | C | Vừa | Market (số bán, giá, thương hiệu); Insight chọn sản phẩm | Tự chạy (Đã duyệt) | Không giới hạn tiền (08/10) | Metric | Lỗi 18/10: doanh thu và số bán từng sản phẩm bị trống vì ô có mũi tên thay đổi (▲▼). Bản sửa bộ đọc v11 (PR #309) đã lên máy chủ cùng bản 1cf5106e (18/10, khoảng 23:15 giờ Việt Nam). Chạy thử quạt điện đạt: không còn dòng thiếu doanh thu hoặc số bán, có đủ 4 kết luận chính. Giới hạn: bảng kết quả không có cột gian hàng, nên báo cáo không được đếm số gian hàng hoặc vẽ mức tập trung theo gian hàng (bản sửa PR #310, chưa lên máy chủ) |
| S02 | Video bán hàng TikTok có số bán | "dữ liệu số bán" | C | Vừa | Market phần video; Insight | Có điểm lại: 100 điểm (kiểm 19/10), chưa chạy thật lại (Đã duyệt) | 0,1 điểm mỗi lần gọi; dừng khi báo hết số dư; chạy thử cần ít nhất 6 điểm (chủ quyết) | Kalodata | Chủ nạp điểm |
| S03 | Số nhập khẩu theo lô hàng | — | C | chưa rõ | Market thương mại | Chưa có đường thu: cần tài khoản (Không thu) | — | TradeInt | Cần tài khoản hợp lệ |
| S04 | Trang sản phẩm trên sàn | "dữ liệu số bán" / tên sàn | B | Vừa | Market giá, mô tả | Tự chạy (Đã duyệt) | chưa rõ | Thu cùng S01 | — |
| S05 | Đánh giá Shopee | "dữ liệu đánh giá" | B | Thấp | Insight: lời khách, mã hoá chủ đề; Market: chỉ ghi là nguồn được đếm (số đánh giá, nhãn nguồn, mốc 300), không xử lý nội dung (chủ quyết 19/10) | Đang bật trên máy chủ từ 20/10 (bản 6efba50a, gói S); bộ thu trả tiền cũ đã tắt (Đã duyệt) | Tối đa 300 đánh giá mỗi sản phẩm; trần 10 USD và mốc 300 của bộ thu trả tiền cũ đã bỏ (chủ quyết 19/10) | Dịch vụ review công khai trên Shopee (gói S) | Shopee đòi đăng nhập hay xác minh thì chờ người, không tự xử lý |
| S06 | Đánh giá TikTok Shop | "dữ liệu đánh giá" | B | Thấp | Insight | Chưa có đường thu (Đề xuất) | — | chưa có | Tìm công cụ |
| S07 | Bình luận TikTok | "dữ liệu bình luận" | B | Thấp | Insight lời khách | Dừng vì tiền (Đã duyệt) | Khoảng 0,33–1,00 USD mỗi 1.000 bình luận; ví dụ trần 3 USD mỗi lần chạy thử | Apify | Chủ nạp tiền |
| S08 | Bài đăng Facebook | — | B | Thấp | Insight | Không thu: chủ tạm dừng | — | — | — |
| S09 | Instagram | — | B | Thấp | — | Không thu: không có công cụ | — | — | — |
| S10 | Bài đăng trên X | — | B | Thấp | Insight phụ | Chưa có đường thu: rẻ nhưng ít giá trị, làm sau cùng (Đã test) | Khoảng 0,08 USD mỗi 200 bài | Apify | Làm sau cùng |
| S11 | Bình luận YouTube | — | B | Thấp | — | **Không thu: chủ bỏ 17/10, không đề xuất lại** (bảng trạng thái còn ghi Đề xuất) | — | — | Sửa bảng trạng thái |
| S12 | Dữ liệu shop của chủ | — | A | Cao (với shop đó) | Market, Insight | Chưa có đường thu: tệp shop (Không thu) | — | — | Chủ quyết 17/10: không nhờ người gửi tay |
| S13 | Bài hướng dẫn, bài viết | "kết quả tìm kiếm" | C | Thấp | Insight bối cảnh | Lấy qua S19 (Đề xuất) | Theo S19 | Qua S19 | — |
| S14 | Nội dung video bán hàng (xem video) | "video bán hàng" | B | Thấp | Market phần video; Insight tiếng nói người bán | Tự chạy (Chạy thử) | Tối đa 10 video mỗi lần, mỗi video tối đa 180 giây; tải TikTok chỉ trên máy chủ; giữ 45 ngày rồi tự xoá | Gemini, công cụ tải video | — |
| S15 | Thư viện quảng cáo Meta | "quảng cáo trên Meta/Facebook" | B | Thấp | Market quảng cáo; Insight người bán | Bật, chưa kiểm thật (Đã duyệt 17/10) | Không đăng nhập; tối đa 5 lần mở trang, tối đa 2 thương hiệu; cách nhau ít nhất 30 giây; dừng khi gặp mã xác minh hoặc trang đăng nhập | OpenCLI | Một lần chạy thật |
| S16 | Quảng cáo nổi bật TikTok | "quảng cáo trên TikTok" | B | Thấp | Market quảng cáo | Bật, chưa kiểm thật (Chạy thử 17/10) | Như S15: không đăng nhập, tối đa 5 lần mở, cách 30 giây; khoảng 3 USD mỗi 1.000 quảng cáo nếu dùng công cụ trả phí | OpenCLI | Một lần chạy thật |
| S17 | Thư viện quảng cáo trên công cụ tìm kiếm | "quảng cáo trên công cụ tìm kiếm" | B | Thấp | Market quảng cáo | Tự chạy (Đã duyệt 17/10) | Tối đa 3 thương hiệu, 3 lần gọi mỗi báo cáo; cách nhau 2 giây; khoảng 0,14 USD mỗi 100 quảng cáo | SerpApi | — |
| S18 | Trang Facebook của thương hiệu | — | B | Thấp | Insight người bán | Chưa có đường thu (Đề xuất) | Khoảng 12 USD mỗi 1.000 trang | Apify | Chủ quyết có làm |
| S19 | Tìm kiếm mở rộng | "kết quả tìm kiếm" | Theo trang gốc | Thấp | Market bối cảnh; Insight | Tự chạy (Chạy thử) | Tối đa 3 lần gọi mỗi báo cáo; câu tìm chỉ ghép từ tên sản phẩm, thương hiệu đã chốt (dựng tối đa 10 câu) | SerpApi | — |
| S20 | Mức quan tâm tìm kiếm | "mức quan tâm tìm kiếm" | B | Vừa | Market nhu cầu | Tự chạy (Chạy thử) | Tối đa 4 lần gọi, tối đa 5 từ khoá; Việt Nam, 12 tháng gần nhất | SerpApi | — |
| S20b | Mức quan tâm tìm kiếm theo vùng (Bảng 5.2) | "mức quan tâm tìm kiếm" | B | Vừa | Market nhu cầu: chọn vùng ưu tiên | Bật, chưa kiểm thật: bật trên máy chủ 18/10 (bản e0754a3b); lượt chạy thử trước dừng sớm vì Kalodata hết điểm; 19/10 đã có lại 100 điểm (Đã duyệt 17/10) | Thêm 1 lần gọi mỗi báo cáo, không gọi lại; luật cố định: một vùng có từ 5 trong 10 tỉnh đứng đầu thì ghi vùng đó, không thì "toàn quốc, không lọc"; 63 tỉnh, thành trước sáp nhập | SerpApi | Một lần chạy thật sau khi nạp Kalodata |
| S21 | Số liệu Cục Thống kê | "Cục Thống kê (nso.gov.vn)" | A | Cao | Market bối cảnh vĩ mô | Tự chạy (Đã duyệt 17/10) | Tối đa 3 lần gọi, cách nhau 2 giây, không gọi lại khi lỗi | Trang Cục Thống kê | — |
| S22 | Chỉ số giá theo tỉnh, thành | "Cục Thống kê (nso.gov.vn)" | A | Cao | Market bối cảnh giá | Tự chạy, mới bật (Đã duyệt 17/10) | Lấy từ tệp chỉ số giá của S21; chung trần 3 lần gọi | Trang Cục Thống kê | — |
| S23 | Ngân hàng Thế giới | "Ngân hàng Thế giới (World Bank Open Data)" | A | Cao | Market bối cảnh; biểu đồ đường theo năm | Tự chạy (Đã duyệt 17/10) | 2 chỉ số (chi tiêu hộ gia đình bình quân đầu người, dân số); tối đa 4 lần gọi; miễn phí | World Bank API | — |
| S24 | Thương mại quốc tế | "Cơ sở dữ liệu thương mại của Liên Hợp Quốc (UN Comtrade)" | A | Cao | Market bối cảnh; biểu đồ cột theo nước báo cáo | Tự chạy (Đã duyệt 17/10) | Tối đa 4 lần gọi, cách nhau 6 giây; chờ 65 giây khi bị giới hạn | UN Comtrade API | — |
| S25 | Báo cáo ngành, báo cáo thường niên (tệp PDF) | Tên tổ chức phát hành | B/C | Vừa | Market phần tài liệu | Đang bật trên máy chủ từ 18/10 (bản 8fd54e0; từ chiều 18/10 máy chủ chạy bản dddbacb4). Lượt hỏi thật 18/10 đạt: dạng thẻ trích dẫn và cách đếm tổng số tài liệu đều đúng. Thư viện đọc PDF đã cài trên máy chủ (trong môi trường riêng của người dùng, không cần quyền quản trị). Số dư khởi điểm ghi 9 USD; hệ thống tự dừng gửi tệp mới khi số dư ước tính xuống gần 2 USD. Lưu ý: tài liệu thử 3 trang của lượt hỏi thật không có trong sổ ghi của app; nếu bấm "kiểm tra lại số dư" thì app sẽ coi số dư là chưa rõ và tạm dừng đọc PDF cho tới khi sửa sổ ghi (Đã duyệt) | Khi bật: tối đa 2 tệp, mỗi tệp tối đa 60 trang, thêm 1 lượt tìm; khoảng 0,01 USD mỗi trang một lần cho mỗi tệp mới; tối đa khoảng 1,2 USD mỗi báo cáo; mỗi câu hỏi vào tài liệu khoảng 0,05–0,10 USD (ước từ lượt hỏi thật); phí lưu nhỏ hàng tháng sau 1.000 trang miễn phí | PageIndex, SerpApi | Cách ghi tên tài liệu mới "<tên tài liệu>, trang N" đã lên máy chủ 18/10 (PR #301, bản dddbacb4) |
| S26 | Báo chí, tin an toàn thực phẩm | "kết quả tìm kiếm" | C | Thấp | Market bối cảnh | Không thu riêng (Đề xuất) | — | Qua S19 | — |
| S27 | Đánh giá lấy qua dịch vụ thứ ba | — | C | Thấp | — | Không thu (Không thu) | — | Dami | — |
| S28 | Hồ sơ người Việt do AI viết (1 triệu hồ sơ, dữ liệu tổng hợp) | Không bao giờ nêu tên | Không xếp hạng: không phải lời khách thật, không dùng làm bằng chứng | Không dùng làm số | Insight lớp ngầm: chỉ gợi ý cho AI nên tìm tình huống, dịp mua nào trong lời khách thật | Chưa có đường thu: dữ liệu nằm trên máy chủ, chưa nối vào app (Đề xuất 17/10) | Miễn phí, không gọi mạng; giấy phép CC BY 4.0, chỉ dùng nội bộ nên không in vào báo cáo | Bộ hồ sơ tổng hợp (không nêu tên) | Chủ mở lại phần Insight |

Ghi chú về S25b: là phần đọc tệp PDF do chủ gửi. Đang tắt cùng S25. Bộ đọc nhận tệp từ 1 tới 1.000 trang.

---

## Phần 5 · Quy trình xử lý

1. **Thu.** Mỗi đường thu chạy tự động, theo cờ bật/tắt. Không nhờ người thu tay (chủ quyết 17/10). Không đăng nhập. Gặp mã xác minh, trang đăng nhập, bị chặn hoặc lỗi thì dừng đường đó.
2. **Giữ bản gốc.** Lưu tệp đúng như tải về, kèm dấu nhận dạng file, nguồn, kỳ dữ liệu, thời điểm lấy. Không sửa bản gốc. Không ghi đè báo cáo cũ.
3. **Lọc nghĩa (L9).** Bỏ bản ghi không đúng sản phẩm theo danh sách từ khoá và từ loại trừ của từng ngành hàng. So khớp giữ dấu tiếng Việt. Bản ghi bị bỏ được đếm kèm lý do. Bản ghi chưa chắc thì để ngoài số chính.
4. **Chuẩn hoá.**
   - Mỗi giá trị là một trong ba: thiếu, bằng không thật, có giá trị. Thiếu không được đổi thành 0.
   - Ghi đơn vị (đồng, cái, gói…).
   - Ghi kỳ dữ liệu và múi giờ.
   - Chỉ gộp bản ghi khi chắc chắn là cùng một bản ghi (cùng dấu nhận dạng và vị trí, hoặc cùng mã ổn định của nguồn). Hai câu giống nhau ở hai chỗ vẫn là hai bản ghi.
5. **Tính bằng mã.** Mọi con số trong báo cáo do mã tính, lần được về bản gốc. Không cộng Shopee với TikTok Shop. Không cộng Comtrade qua các nước đối tác. Không ghép số vĩ mô, thương mại, chính thức, video, quảng cáo với số trong mẫu.
6. **AI diễn giải.** AI chỉ viết lời giải thích dựa trên những con số đã có. AI đưa số mới, bịa nguồn, hoặc dùng lời như đã duyệt thì bị chặn.
7. **Cổng kiểm.** Hai lớp:
   - Cổng kiểm nghiệp vụ (tài liệu gọi là "cổng 9 luật"; trong mã hiện có các luật dưới đây):
     - Không nêu tên công cụ, không có chữ "Google".
     - Không có tổng hai sàn.
     - Không xếp thứ tự theo doanh thu, không "top 3", không thị phần.
     - Đủ các phần M01–M13 (khi kiểm bản trình bày).
     - Phương án M12 có nhãn "đề xuất, chờ chủ duyệt" (khi kiểm bản trình bày).
     - Không nêu tổng có thành viên bị thiếu.
     - Không lộ chữ kỹ thuật.
     - Mức quan tâm tìm kiếm không được nói thành số lượt.
     - Số Ngân hàng Thế giới không được đem cộng trừ nhân chia.
     - Trích đoạn tệp PDF không được dùng làm số thị trường.
     - Video người bán không được coi là lời khách hay cộng vào tổng.
   - 14 quy tắc báo cáo Market:
     1. Có bảng giải thích chữ bằng lời thường.
     2. Nhãn "Phần 1–12" và "Phụ lục"; không hiện mã M01–M13.
     3. Không lộ đường dẫn, mã, chữ kỹ thuật.
     4. Không nêu tên công cụ, không có chữ "Google".
     5. Chú thích viết thành dòng riêng "Chú thích:".
     6. Người duyệt đọc kiểm: câu về doanh thu, tỉ lệ, giá trung bình có căn cứ.
     7. Không tổng hai sàn; có câu nói cỡ mẫu; không đặt "n = 0" cạnh số khác; không số thị phần hay quy mô thị trường.
     8. Người duyệt đọc kiểm: mỗi phát hiện dẫn một con số, hình hoặc bảng.
     9. Bảng M12 có 3 dòng phương án, có nhãn "làm nhanh", người phụ trách, hạn; mỗi dòng có nhãn "đề xuất, chờ chủ duyệt".
     10. Ảnh bìa tạo bằng AI, nhúng trong tệp, có mô tả ảnh.
     11. Biểu tượng sàn cạnh mỗi lần nhắc Shopee hay TikTok Shop; biểu đồ vẽ đúng kiểu; có 3 biểu đồ mẫu khi có dữ liệu sản phẩm.
     12. Bảng theo sàn ghi rõ Shopee hoặc TikTok Shop.
     13. Có đủ bốn nhãn nguồn trung tính: dữ liệu số bán, dữ liệu đánh giá, kết quả tìm kiếm, dữ liệu bình luận.
     14. Người duyệt đọc kiểm: đánh giá, bình luận, mốc 300.
8. **Người quyết.** Chủ đọc, duyệt hoặc trả lại. Quyết định được ghi nối tiếp, không xoá.

**Cái gì dừng lần chạy, cái gì chỉ để lại ghi chú:**
- **Dừng (không giao báo cáo):** sai bất kỳ luật nào của cổng kiểm nghiệp vụ; sai bất kỳ quy tắc "máy kiểm" nào trong 14 quy tắc; AI đưa số không có căn cứ.
- **Dừng riêng một đường thu (báo cáo vẫn chạy tiếp, phần đó ghi là không thu được):** mã xác minh, trang đăng nhập, bị chặn, hết tiền hay hết điểm, quá trần chi, lỗi mạng (một số đường không gọi lại). Riêng hết điểm số bán: dừng ngay khi có lỗi số dư.
- **Chỉ để lại ghi chú:** quy tắc "người duyệt đọc" (số 6, 8, 14 và trường hợp ảnh bìa có bản quyền); bản ghi bị lọc nghĩa (đếm kèm lý do); bản ghi chưa chắc.
- Danh sách chính xác đường thu nào dừng ra sao: chưa rõ cho từng đường (xem "Chỗ còn hở").

---

## Phần 6 · Khuôn dữ liệu

**Nói thật trước:** các khuôn dưới đây hiện được **viết thành mô tả** trong tài liệu. Chúng **chưa phải một bộ kiểm bắt buộc dùng chung trong mã**. Mỗi đường thu tự kiểm theo cách riêng.

**Mỗi tệp gốc phải mang:**

| Trường | Nghĩa |
|---|---|
| Mã gói, phiên bản gói | Tệp thuộc lần thu nào |
| Đường dẫn trong gói | Tên tệp trong gói |
| Dấu nhận dạng file | Chứng minh đúng tệp |
| Loại tệp | Bảng tính, PDF, trang web… |
| Nhóm bằng chứng | Số bán, đánh giá, quảng cáo… |
| Nguồn gốc | Lấy từ đâu, bằng cách nào |
| Kỳ dữ liệu | Xem bảng dưới |

**Mỗi kỳ dữ liệu phải mang:** ngày bắt đầu, ngày kết thúc, múi giờ, cách tính kỳ.

**Mỗi con số phải mang:**

| Trường | Nghĩa |
|---|---|
| Trạng thái | Thiếu / bằng không thật / có giá trị |
| Giá trị | Con số |
| Đơn vị | Đồng, cái… |
| Độ chính xác | Làm tròn tới đâu |
| Nguồn | Tệp gốc + vị trí trong file |

**Mỗi câu khẳng định trong báo cáo phải mang:** mã câu, tệp và chỗ chứa số, phạm vi, tử số và mẫu số nếu là tỉ lệ, các giới hạn cần nói.

**Mỗi câu trích lời khách phải mang:** dấu nhận dạng gói nguồn, phiên bản tệp, dòng hoặc vị trí câu trích, thời điểm có dữ liệu, mã chủ đề và ai duyệt.

**Ba phạm vi số bán** (cả tập, rộng, lõi) chồng lên nhau, **không bao giờ cộng**. Bản ghi chưa xác định giữ trong "cả tập", loại khỏi "rộng".

---

## Phần 7 · Quy tắc

### Quy tắc 1–9

1. **Thiếu khác 0.** Phần chưa xác định luôn được nêu.
2. **Nhận dạng bản ghi.** Chỉ gộp khi cùng dấu nhận dạng và vị trí, hoặc cùng mã ổn định của nguồn.
3. **Cộng dồn.** Chỉ cộng khi cùng đơn vị, cùng kỳ và múi giờ, cùng tập, và chứng minh được không trùng. Không bao giờ cộng Shopee với TikTok Shop.
4. **Tỉ lệ.** Chỉ tính khi mẫu số phù hợp (mặc định theo E11).
5. **Câu bị cấm mặc định:** mức phổ biến trong khách, nguyên nhân, dự báo, hiệu quả kênh, tỉ lệ chuyển đổi, xếp hạng, quy mô thị trường, khuyến nghị. Ngoại lệ theo E15 (và E2 cho khuyến nghị).
6. **Không làm nghiên cứu khách mới:** không phỏng vấn, khảo sát, tuyển người, không dùng người trả lời giả lập.
7. **Lặp lại được.** Mỗi số và câu trích có dấu nhận dạng và vị trí. Nguồn đổi thì kết quả phụ thuộc bị huỷ hiệu lực. Không ghi đè báo cáo cũ.
8. **Bộ mã chủ đề.** Chỉ mã đã duyệt mới được đếm (ngoại lệ L3, E11, E15).
9. **AI đề xuất, người quyết.**

### L1–L10

- **L1.** Cùng một câu ở hai chỗ vẫn là hai bản ghi.
- **L2.** Đếm số người viết chỉ trong một nền tảng, qua mã người viết đã mã hoá.
- **L3.** Bản nháp được hiện số đếm do AI xếp, ghi "đề xuất, chờ chủ duyệt". Bản phát hành cần bộ mã đã duyệt.
- **L4.** Không xếp hạng ngầm (ngoại lệ E15).
- **L5.** Mỗi nền tảng một cột, không cộng, kể cả phần Market.
- **L6.** Số sao là một phân bố riêng. Nguồn không có sao thì ghi "nguồn không có số sao", không ghi 0.
- **L7.** Lời người bán viết là "người bán nhắm tới…". Lời người làm video review trong video của họ cũng là lời người bán, ghi "lời người làm video review" (12/10).
- **L8.** Không mua hàng.
- **L9.** Lọc nghĩa theo danh sách từ khoá và từ loại trừ có phiên bản, theo ngành hàng; giữ dấu tiếng Việt; bản ghi bị loại được đếm kèm lý do ở M13/I17; bản ghi chưa chắc để ngoài số chính.
- **L10.** Bình luận dưới video review và video bán hàng là lời khách, trừ tài khoản người làm video, thương hiệu, shop, và bình luận chỉ gắn thẻ hay chỉ biểu tượng cảm xúc.

### Ngoại lệ của chủ E1–E15

- **E1.** Chỉ số lợi trên chi quảng cáo và chi phí mỗi đơn chỉ là tham khảo ước tính, kèm câu miễn trừ. Không so kênh, không suy ra lãi.
- **E2.** M12 có tối đa 3 phương án, người phụ trách và hạn, ghi "đề xuất, chờ chủ duyệt". Phần "nghĩa là gì" chỉ nói doanh thu trong mẫu. (Chủ cho phép báo cáo Market có khuyến nghị ghi "đề xuất", 05/10.)
- **E3.** M01 có 4–6 phát hiện mô tả trong mẫu, có bằng chứng.
- **E4.** Chân dung khách cần ít nhất 3 thẻ bằng chứng và 5 người viết khác nhau; phải có nhãn. Mỗi đặc điểm phải dẫn lời khách thật (chủ quyết 07/10). Dữ liệu chân dung giả lập không bao giờ được nêu tên trong báo cáo.
- **E5.** Chân dung khách mà người bán nhắm tới cần 4 phép kiểm và ít nhất 2 nền tảng; ba cách A/B/C; ngưỡng: nhóm 20 phần trăm đứng đầu, ít nhất 4 tuần, quảng cáo ít nhất 30 ngày, ít nhất 1 câu trích.
- **E6.** Kết luận của phần Insight và phần I15 (chi tiết trong tài liệu gốc).
- **E7.** AI đặt câu hỏi làm việc cho I01.
- **E8.** Thu đánh giá thêm cho tới khi đạt ngưỡng chất lượng, trong trần chi.
- **E9.** So giá theo đơn vị chỉ khi cùng đơn vị, cùng loại giá, cùng kỳ.
- **E10.** Dùng số bán làm thước đo nhu cầu.
- **E11.** Các quy tắc mặc định (nhóm so sánh chiếm ít nhất 50 phần trăm doanh thu; danh sách kiểu video: người nói trước máy, kể chuyện, hướng dẫn, chứng thực, theo trào lưu, khác; …).
- **E12.** Số Cục Thống kê dùng làm bối cảnh vĩ mô; bắt buộc ghi nguồn, trạng thái, vị trí, nhóm hàng hẹp nhất.
- **E13.** Số Ngân hàng Thế giới làm bối cảnh; không phải xác nhận độc lập cho số Cục Thống kê; không đổi tiền tệ.
- **E14.** Thu tự động không cần chủ duyệt từng lần; nguồn trả phí trong trần chi; dừng khi lỗi, bị chặn, gặp đăng nhập hoặc mã xác minh; có nút huỷ.
- **E15.** Xếp chủ đề bình luận theo số lần nhắc, theo từng nền tảng; dưới 3 lần nhắc gom vào "Khác"; nếu "Khác" quá 20 phần trăm thì thu thêm tối đa 1 vòng; kiểm chéo độ đồng thuận giữa hai người xếp để sau.

### Ngưỡng cho đánh giá (phần Insight)

- Nhóm sản phẩm chiếm ít nhất 50 phần trăm doanh thu (80 phần trăm nếu dùng cách C); ít nhất 5 thương hiệu; cả hai sàn.
- Khoảng 300 đánh giá mỗi sản phẩm, hệ thống tối đa 500. Link chọn theo doanh thu cao nhưng trải đều nhiều thương hiệu (chủ quyết).
- Cần ít nhất 30 đánh giá có chữ để so hai sản phẩm.
- Bắt buộc có số sao và mã người viết.
- Chân dung: ít nhất 5 người viết từ ít nhất 3 sản phẩm.
- Muốn nói "của ngành hàng" cần ít nhất 3 sản phẩm của các thương hiệu khác nhau.
- Cách dừng khi đủ: lấy từng đợt 25, 2 đợt nền, dừng khi chủ đề mới không quá 5 phần trăm.
- M10: dữ liệu không quá 180 ngày thì chỉ nói kịch bản có điều kiện.
- Thử nguồn mới: chấm 50 bản ghi; cần ít nhất 50 phần trăm đúng chủ đề và ít nhất 30 phần trăm có thể là lời khách.

### Quy tắc chữ cho báo cáo gửi chủ

- Không nêu tên công cụ: Metric, Kalodata, TradeInt, Dami, Apify, SerpApi, PageIndex, Gemini, OpenCLI, zen-studio, Agent-Reach. Không hiện chữ "Google".
- Tên được phép: Shopee, TikTok Shop, Meta/Facebook, TikTok, "Ngân hàng Thế giới (World Bank Open Data)", "Cơ sở dữ liệu thương mại của Liên Hợp Quốc (UN Comtrade)", "Cục Thống kê (nso.gov.vn)".
- Không dùng dấu phần trăm ở chỗ quy tắc cấm tỉ lệ.
- Không dùng số 0 làm chỗ trống, không viết câu kiểu "chưa có dữ liệu" để lấp chỗ.
- Số vĩ mô, thương mại, chính thức, video, quảng cáo không bao giờ ghép với số trong mẫu.
- Không cộng Comtrade qua các nước đối tác. Không cộng Shopee với TikTok Shop.
- Chú thích viết thành dòng riêng "Chú thích:".
- Báo cáo không tự khen bằng chữ "nhất" hay "hàng đầu". Chữ chép nguyên văn từ nguồn, như tên sản phẩm, tiêu đề trang web hay tên trang, được in trong dấu trích dẫn. Khi đó chữ "bán chạy nhất" trong tiêu đề là lời của nguồn, không phải lời báo cáo. Tên công cụ và chữ "Google" vẫn bị giấu kể cả trong trích dẫn. Tên sản phẩm đã sửa từ 13/10. Tiêu đề trang web, tên trang và nhãn ngày đăng được sửa ở PR #306, đã gộp vào mã (bản 6a2dd5a0), chưa lên máy chủ.
- Trang bìa ghi ba dòng: "Báo cáo thị trường sản phẩm <Tên>", "Quý Q năm YYYY", rồi khoảng ngày của dữ liệu (B18).
- Phụ lục 1 là danh sách nguồn; Phụ lục 2 là từ điển chữ (B17).
- Mỗi bảng và mỗi biểu đồ có một dòng "Diễn giải:" bằng tiếng Việt dễ hiểu ngay bên dưới (D30).
- Không dùng chữ tiếng Anh kỹ thuật; chỉ giữ thuật ngữ tiếp thị có trong từ điển ở Phụ lục 2 (E21).
- Chỉ gửi bản đọc. Bản nháp và phần đối chiếu được giấu đi nhưng vẫn lưu lại để AI tra cứu sau (A7).
- Mỗi đoạn trích từ tệp PDF có số trích dẫn [n] ngay sau đoạn trích, dẫn tới dòng "<tên tài liệu>, trang N" trong danh sách nguồn, ví dụ "Báo cáo ngành quạt điện, trang 3". Tên tài liệu lấy từ tiêu đề của kết quả tìm kiếm, hoặc tiêu đề ghi sẵn trong tệp; không bao giờ ghi tên tệp. Tên phải có ít nhất 3 chữ, không chứa đường dẫn, địa chỉ web, mã số hay tên công cụ. Tên có một từ mang dạng đuôi tệp ở bất kỳ chỗ nào (như ".pdf", ".docx", kể cả "TP.HCM") thì bị bỏ cả tên, để không bao giờ lộ tên tệp. Không có tên đạt thì ghi "Tài liệu PDF số k, trang N", đánh số liền nhau. Không ghi mã băm, không ghi tên công cụ (A25; chủ đổi cách ghi 18/10, đã lên máy chủ 18/10, PR #301 bản dddbacb4). Báo cáo đã lưu trước đó giữ nguyên cách ghi cũ.
- Trạng thái: các quy tắc B13, B17, B18, D30, E21, A7 và A25 đã lên máy chủ 18/10 (PR #286, #287, #290; bản 8fd54e0). Cách ghi tên tài liệu mới của A25 đã lên máy chủ 18/10 (PR #301, bản dddbacb4; thêm một cột mới trong cơ sở dữ liệu, số liệu cũ giữ nguyên). Bản này có sẵn mã của chế độ chạy thử bằng dữ liệu bán hàng đã lưu (PR #289). Chủ đồng ý chạy bản chạy thử riêng 18/10: lượt đầu (quạt điện) lấy số bán từ dữ liệu đã lưu, không tốn điểm; bước đọc số bán hai sàn dừng vì trình duyệt Chrome trên máy chủ đang tắt. Sau khi máy chủ khởi động lại, chủ mở Chrome và mở khoá màn hình, bước này đọc xong số bán hai sàn, nhưng lượt chạy vẫn dừng: công cụ điều khiển trình duyệt nay in thêm dòng báo "có bản cập nhật mới", và ứng dụng coi dòng lạ đó là trang đã đổi. Lỗi này chặn mọi báo cáo thị trường tự động, cả trên máy chủ, cho tới khi bản sửa PR #304 lên máy chủ. Không cập nhật công cụ để né lỗi. Màn hình máy chủ phải để mở khoá trong lúc đọc số bán.

### Quyết định khác của chủ

- Chỉ thu tự động; không bao giờ nhờ chủ hay người khác thu dữ liệu (chủ quyết 17/10).
- Phần Insight chờ tới khi báo cáo Market đạt 14/14 (chủ quyết 17/10).
- Mục tiêu: 4 nguồn lõi nuôi cả Market lẫn Insight. Theo công cụ, đó là: số bán (S01), video bán hàng có số bán (S02), tìm kiếm mở rộng (S19, chỉ sau khi đã chốt sản phẩm), đánh giá và bình luận (S05, S07). Tài liệu gốc chưa ghi danh sách này theo mã S (xem "Chỗ còn hở"). Với đánh giá và bình luận, "nuôi Market" chỉ có nghĩa là có mặt như một nguồn được đếm. Bảng "phần nào dùng nguồn nào" của danh mục gốc không cho phần Market nào dùng đánh giá. Market chỉ dùng gián tiếp: phần Cơ hội lấy tín hiệu rào cản và nhu cầu chưa đáp ứng từ Insight, phần Phụ lục liệt kê nguồn. Mã hoá chủ đề khen/chê là việc của Insight (chủ quyết 19/10).
- Bình luận YouTube bị bỏ (chủ quyết 17/10), không đề xuất lại.
- Đánh giá Shopee cho báo cáo chạy thử: dùng gói miễn phí của công cụ thu đánh giá, tối đa 20 đánh giá mỗi sản phẩm; báo cáo phải ghi rõ đây là mẫu nhỏ để chạy thử, không đại diện cho mọi đánh giá. Thu thật ở mốc 300 vẫn tắt cho tới khi chủ nạp tiền và đồng ý (chủ quyết 19/10). Thử 19/10: gói miễn phí chưa ổn định (4 trên 4 lượt lỗi do bị chặn); khi lỗi, phần đánh giá ghi là chưa có, báo cáo vẫn chạy tiếp.
- Hồ sơ do AI viết (S28) không bao giờ xuất hiện hay được nêu tên trong báo cáo; Market dùng số Cục Thống kê, Insight chỉ dùng S28 làm gợi ý ngầm (chủ quyết 17/10). Nhóm khách Market: bỏ cách để AI tự chọn nhóm (thử 17/10 không phân biệt được sản phẩm), thay bằng S20b; giới và tuổi để "không lọc" vì lời khách hiếm khi tự nói ra (chủ chọn hướng B 17/10).

---

## Phần 8 · Giới hạn, chi phí, an toàn

**Theo từng nguồn (mỗi báo cáo):**

| Nguồn | Giới hạn |
|---|---|
| Số bán (S01) | Không có trần tiền |
| Video bán hàng TikTok có số bán (S02) | 0,1 điểm mỗi lần gọi; dừng khi báo hết số dư; chạy thử cần ít nhất 6 điểm |
| Đánh giá Shopee (S05) | Tối đa 300 đánh giá mỗi sản phẩm (gói S); không còn trần tiền vì bộ thu trả tiền cũ đã tắt từ 20/10 |
| Bình luận TikTok (S07) | Giữ trần tiền mỗi lần chạy, khi đã nạp tiền |
| Xem video (S14) | Tối đa 10 video, mỗi video tối đa 180 giây; tải TikTok chỉ trên máy chủ; giữ 45 ngày rồi tự xoá |
| Quảng cáo Meta (S15) | Tối đa 5 lần mở, 2 thương hiệu, cách 30 giây; không đăng nhập |
| Quảng cáo TikTok (S16) | Tối đa 5 lần mở, cách 30 giây; không đăng nhập |
| Quảng cáo trên công cụ tìm kiếm (S17) | Tối đa 3 thương hiệu, 3 lần gọi, cách 2 giây |
| Tìm kiếm mở rộng (S19) | Tối đa 3 lần gọi; chỉ dùng tên sản phẩm, thương hiệu đã chốt |
| Mức quan tâm tìm kiếm (S20) | Tối đa 4 lần gọi, tối đa 5 từ khoá |
| Mức quan tâm theo vùng (S20b) | Thêm 1 lần gọi, không gọi lại |
| Cục Thống kê (S21, S22) | Tối đa 3 lần gọi, cách 2 giây, không gọi lại |
| Ngân hàng Thế giới (S23) | 2 chỉ số, tối đa 4 lần gọi, miễn phí |
| UN Comtrade (S24) | Tối đa 4 lần gọi, cách 6 giây, chờ 65 giây khi bị giới hạn |
| Báo cáo PDF (S25, khi bật) | Tối đa 2 tệp, mỗi tệp 60 trang, thêm 1 lượt tìm, tối đa 3 lần chuyển hướng mỗi tệp, không thử lại; khoảng 0,01 USD mỗi trang; tối đa khoảng 1,2 USD mỗi báo cáo |
| Trang Facebook thương hiệu (S18, chưa làm) | Khoảng 12 USD mỗi 1.000 trang |

**An toàn:**
- Không đăng nhập vào bất kỳ trang nào khi thu.
- Gặp mã xác minh hoặc trang đăng nhập thì dừng đường thu đó.
- Không làm nghiên cứu khách mới (không phỏng vấn, khảo sát, tuyển người).
- Không mua hàng.
- Không thu dữ liệu cá nhân. Mã người viết được mã hoá, chỉ dùng để đếm trong một nền tảng.
- Video tải về giữ 45 ngày rồi tự xoá.
- Chỉ bật một nguồn trả phí mới khi chủ đồng ý.

---

## Phần 9 · Giữ file luôn mới nhất

**Ai cập nhật:** người hoặc trợ lý AI làm thay đổi đó, ngay trong cùng lượt làm việc.

**Khi nào cập nhật:** mỗi khi có thay đổi về:
- một nguồn (thêm, bỏ, đổi công cụ, đổi hạng);
- một quy tắc;
- một giới hạn hay chi phí;
- trạng thái của một nguồn;
- một quyết định của chủ.

**Cách cập nhật:**
1. Sửa đúng phần liên quan.
2. Tăng số phiên bản: sửa nhỏ thì 1.0 → 1.1; đổi lớn thì 1.x → 2.0.
3. Ghi một dòng vào "Nhật ký thay đổi": số phiên bản, ngày, đổi gì.

**Bước tiếp theo đã định:** chuyển file này vào kho mã, để mỗi lần sửa mã cũng sửa file trong cùng thay đổi đó. Việc này **cần chủ đồng ý**.

### Chỗ còn hở

1. Khuôn dữ liệu chỉ là mô tả; chưa có bộ kiểm bắt buộc dùng chung trong mã.
2. Tài liệu gọi là "cổng 9 luật" nhưng mã hiện có khoảng 11 luật, có luật chỉ chạy khi có điều kiện. Danh sách 9 luật chính thức: chưa rõ.
3. Giới hạn của trang sản phẩm (S04): chưa rõ (thu cùng số bán S01).
4. Danh sách chính xác "4 nguồn lõi": chưa rõ trong tài liệu.
5. Nhãn phát hành cho số đếm chủ đề theo E15 còn chờ chủ.
6. Kiểm chéo độ đồng thuận giữa hai người xếp chủ đề còn để sau.
7. Nhật ký thử nguồn không có dòng nào sau 08/10; nhật ký thay đổi không có dòng nào sau 12/10.
8. Báo cáo PDF (S25) chưa có lần chạy thật đầu tiên.
9. Quyết định 12/10 (lời người làm video review là lời người bán) chưa đưa vào mã: mã vẫn xếp lời này theo nhãn người làm video.
10. Đọc quảng cáo Meta và TikTok chưa được xác nhận bằng một lần chạy thật.
11. Danh sách từ khoá lọc nghĩa (L9) mới nối một phần vào mã.
12. Không phải đường thu nào cũng ghi rõ khi lỗi thì dừng cả báo cáo hay chỉ dừng phần đó.
13. Độ đại diện của S03 và hạng/đại diện chi tiết của một số nguồn chưa thu: chưa rõ.

### Điểm mâu thuẫn cần chốt

Mỗi mục: hai bên nói gì, căn cứ ở đâu. File này **ghi theo bảng trạng thái nguồn** cho nhãn, và ghi nhóm của chủ ngày 17/10 bên cạnh. Chưa tự chọn.

1. **S05 đánh giá Shopee, S07 bình luận TikTok.** Bảng trạng thái: Đã duyệt, đang dùng. Vận hành 17/10: dừng vì tiền, công cụ chưa nạp, thu đánh giá trực tiếp đang tắt.
2. **S02 video bán hàng có số bán.** Bảng trạng thái: Đã duyệt, dùng một phần. Vận hành 17/10: hết điểm.
3. **S11 bình luận YouTube.** Bảng trạng thái và danh mục: Đề xuất. Chủ quyết 17/10: bỏ hẳn.
4. **S19 tìm kiếm mở rộng, S20 mức quan tâm tìm kiếm.** Bảng trạng thái: Chạy thử, "chờ chạy thử giai đoạn 0". Vận hành 17/10: tự chạy.
5. **S14 xem video.** Bảng trạng thái: Chạy thử. Vận hành 17/10: tự chạy.
6. **S24 UN Comtrade.** Danh mục: Đề xuất. Bảng trạng thái: Đã duyệt (17/10).
7. **S23 Ngân hàng Thế giới.** Danh mục: "chưa thu cho báo cáo". Bảng trạng thái: đã có đường thu, Đã duyệt.
8. **S16 quảng cáo TikTok.** Danh mục: lần thử thất bại. Bảng trạng thái: Chạy thử (17/10).
9. **S17 quảng cáo trên công cụ tìm kiếm.** Danh mục: "chưa dùng", Đã test. Bảng trạng thái: Đã duyệt (17/10).
10. **S10 bài đăng trên X.** Bảng trạng thái: Đã test. Vận hành 17/10: chưa có đường thu.
11. **S25 báo cáo PDF.** Bảng trạng thái: Đã duyệt, đang dùng ở M09. Thực tế: tự tìm và bộ đọc đang tắt trên máy chủ.
12. **S22 chỉ số giá theo tỉnh.** Danh mục: lấy từ tệp PDF qua gói P3. Bảng trạng thái: đọc từ tệp bảng tính chỉ số giá của S21.
13. **Ngày cập nhật bảng trạng thái.** Đầu trang ghi 12/10, nhưng có dòng ghi 17/10.
14. **Cờ bật/tắt.** Bảng trạng thái ghi "mặc định tắt"; máy chủ đang bật. Có thể cả hai cùng đúng (mặc định khác cài đặt thật), nhưng cần ghi rõ.
15. **Cổng kiểm.** Tài liệu nói "9 luật"; mã có khoảng 11 mã luật.
16. **Công cụ của S05.** Danh mục ghi một công cụ cụ thể; ghi chép vận hành 14/10 nói công cụ đó chỉ cho mẫu miễn phí 20 đánh giá, bản 100 thất bại ở gói miễn phí.
17. **Thứ bậc về trạng thái.** Tài liệu phương pháp chung nói danh mục nguồn quyết về trạng thái. File này tạm theo bảng trạng thái vì bảng này mới hơn. Cần chủ chốt.
18. **Bảng "phần nào dùng nguồn nào"** trong danh mục chưa đánh dấu S11 đã bị bỏ.
19. **S12 dữ liệu shop của chủ.** Vận hành 17/10 ghi "cần tệp shop"; chủ quyết 17/10 không nhờ người thu tay. Hai điều này chưa khớp; cách lấy tự động: chưa rõ.

---

## Nhật ký thay đổi

| Phiên bản | Ngày | Thay đổi |
|---|---|---|
| 1.0 | 17/10/2026 | Tạo file bằng cách gom các tài liệu nêu ở Phần 1 và quyết định của chủ tới tối 17/10/2026. |
| 1.1 | 18/10/2026 | S25: chủ cho chép khoá đọc PDF lên máy chủ; khoá dùng được (kiểm tra miễn phí); phát hiện mã gọi sai đường gửi tệp và đường xem danh sách, phải sửa trước khi bật. Người duyệt mã đổi sang Astra 6 xhigh. |
| 1.2 | 18/10/2026 | Thêm S20b (mức quan tâm theo vùng, bật trên máy chủ 18/10, chưa có lượt chạy thật) và S28 (hồ sơ do AI viết, dữ liệu trên máy chủ, chưa nối vào app, không bao giờ nêu tên); ghi quyết định 17/10 về nhóm khách. |
| 1.3 | 18/10/2026 | Thêm vào quy tắc chữ cho báo cáo gửi chủ: trang bìa (B18), hai phụ lục (B17), dòng "Diễn giải:" dưới mỗi bảng và biểu đồ (D30), không dùng tiếng Anh kỹ thuật (E21), chỉ gửi bản đọc (A7). Các quy tắc này đã vào mã (PR #286, #287) nhưng chưa lên máy chủ. S25: bản sửa đường gửi tệp và đường xem danh sách, cùng số trích dẫn [n] cho đoạn trích PDF, đang được duyệt ở PR #290. |
| 1.4 | 18/10/2026 | PR #290 đã gộp vào mã (bản 8fd54e0): S25 đã sửa đường gửi tệp và đường xem danh sách; đoạn trích PDF có số trích dẫn [n] kèm trang (A25). Bản 8fd54e0 chưa lên máy chủ. Trước khi bật đọc PDF cần một lượt hỏi thật để kiểm dạng thẻ trích dẫn và cách đếm tổng số tài liệu. |
| 1.5 | 18/10/2026 | Chủ đồng ý deploy bản 8fd54e0 và bật đọc PDF: máy chủ chạy bản 8fd54e0, S25 đang bật, các quy tắc B13, B17, B18, D30, E21, A7, A25 đã lên máy chủ. Lượt hỏi thật đạt; thư viện đọc PDF đã cài; số dư khởi điểm 9 USD, tự dừng gần 2 USD. Chủ thấy cách ghi "Tài liệu PDF đã lưu <tên tệp>" máy móc, đổi thành "<tên tài liệu>, trang N" (không bao giờ ghi tên tệp); đang duyệt ở PR #301, cần câu deploy mới. |
| 1.6 | 18/10/2026 | Gộp PR #301 (bản dddbacb4): PDF được ghi "<tên tài liệu>, trang N", không bao giờ ghi tên tệp; tên có từ mang dạng đuôi tệp ở bất kỳ chỗ nào thì dùng "Tài liệu PDF số k". Bản này gồm cả chế độ chạy thử bằng dữ liệu bán hàng đã lưu (PR #289). Phần sửa tiêu đề bảng vùng miền (PR #288) đã lên máy chủ cùng bản 8fd54e0. Chờ câu đồng ý deploy của chủ; bản chạy thử riêng cũng cần chủ đồng ý. |
| 1.7 | 18/10/2026 | Chủ đồng ý deploy bản dddbacb4: máy chủ chạy bản dddbacb4. Cột mới cho tên tài liệu PDF đã thêm vào cơ sở dữ liệu, số dòng và tệp đã lưu không đổi; trang chạy bình thường; đọc PDF vẫn bật. Từ nay PDF trong báo cáo mới được ghi "<tên tài liệu>, trang N" (A25). Mã chạy thử bằng dữ liệu bán hàng đã lưu (PR #289) đã có trên máy chủ, bản chạy thử riêng chưa bật. |
| 1.8 | 18/10/2026 | Chủ đồng ý chạy bản chạy thử riêng (một lần). Gộp PR #302: bản chạy thử để phần tự phân loại tắt nên khởi động được. Lượt đầu với quạt điện: bước tìm nhanh lấy số bán từ dữ liệu đã lưu (7 lượt gọi, 0 điểm). Bước đọc số bán hai sàn dừng vì Chrome trên máy chủ đang tắt; báo cáo thật trên máy chủ cũng cần Chrome mở. PR #303 sửa lệnh bắt đầu lượt chạy thử và lời hướng dẫn in ra. |
| 1.9 | 18/10/2026 | Gộp PR #303 (bản c28a43d7). Máy chủ khởi động lại; chủ đồng ý bật lại máy chủ bản dddbacb4. Lượt chạy thử quạt điện: số bán từ dữ liệu đã lưu vẫn 0 điểm, không thiếu lượt nào. Màn hình máy chủ bị khoá làm bước chọn sàn hỏng; chủ mở khoá thì hết. Sau đó lượt chạy dừng vì dòng báo "có bản cập nhật mới" của công cụ điều khiển trình duyệt; bản sửa PR #304 (chấp nhận đúng dòng báo đó và tắt việc kiểm tra cập nhật khi đọc số bán), đang duyệt. Màn hình máy chủ phải để mở khoá khi chạy. |
| 1.10 | 18/10/2026 | PR #304 đã qua duyệt (Astra 6 xhigh), đang chờ bước kiểm tra tự động lần 3. Hai lần trước bị treo ở phần kiểm thử quảng cáo TikTok/Meta. Lỗi treo này đã có sẵn trên mã chính từ trước #304, xảy ra khoảng 1 trong 3 lần; Astra 6 xhigh đang tìm nguyên nhân, bản sửa sẽ là một PR riêng. Màn hình máy chủ tự tắt nhưng không khoá: không ảnh hưởng lượt chạy, vì máy không ngủ và không đòi mật khẩu. Đề xuất triển khai một lần cho cả #304 và #305 (sửa giao diện báo cáo của session UX); vẫn cần câu đồng ý của chủ, ghi đúng mã bản. |
| 1.11 | 18/10/2026 | Gộp PR #304 (bản c581857d) và #305 (bản c98639fa); cả hai chưa lên máy chủ. Lượt chạy thử quạt điện mới đọc xong số bán hai sàn. Số bán lấy từ dữ liệu đã lưu, 0 điểm, không thiếu lượt nào. Nhưng lượt chạy dừng ở bước viết báo cáo, vì tiêu đề trang web tìm được có chữ "bán chạy nhất" và "mới nhất", in ra như lời của báo cáo. Kết quả tìm kiếm đổi theo ngày nên lỗi lúc có lúc không. Sửa trong mã ở PR #306: tiêu đề và tên trang được in trong dấu trích dẫn, ở cả bảng kết quả web lẫn danh sách nguồn. Không nới luật nào. Thêm dòng quy tắc vào "Quy tắc chữ cho báo cáo gửi chủ". Sau khi #306 gộp sẽ chạy thử lại, rồi xin một câu deploy cho bản cuối. |
| 1.12 | 18/10/2026 | Gộp PR #306 và #307; mã chính ở bản 6a2dd5a0, gồm cả #304, #305 và #308 (giao diện điểm vào báo cáo của session UX); tất cả chưa lên máy chủ. #306 in tiêu đề trang web, tên trang và nhãn ngày đăng trong dấu trích dẫn. Hai bài kiểm tra so khớp từng byte báo cáo được cập nhật, vì chỉ dấu trích dẫn thêm vào, chữ không đổi. #307 sửa lỗi kiểm tra tự động bị treo khoảng 1 trong 3 lần. Nguyên nhân: ba bài kiểm tra đoán lúc bắt đầu đọc số bán bằng thời gian chờ cố định; khi máy chậm, khoá đọc số bán không được trả, bài sau chờ mãi. Lượt chạy thử quạt điện mới đang chạy trên bản 6a2dd5a0. |
| 1.13 | 18/10/2026 | Lượt chạy thử quạt điện trên bản 6a2dd5a0 chạy hết, số bán lấy từ dữ liệu đã lưu, 0 điểm. Báo cáo ra đủ phần nhưng Kết luận chính chỉ có 3 ý, thiếu ý về nhu cầu (quy tắc 8). Nguyên nhân: trong bảng sản phẩm bán chạy, ô doanh thu và số bán có mũi tên thay đổi theo kỳ (ví dụ "2,6 tỷ ▼ 34%"). Bộ đọc số không hiểu ô này nên để trống, và quy tắc không cộng tổng khi thiếu số (#260) giữ lại ý nhu cầu. Lỗi đã có từ trước lượt 15/10. Bộ đọc v11 (PR #309) lấy số đứng trước mũi tên và đọc khoảng giá "a₫ - b₫". Thử lại trên dữ liệu đã lưu, không gọi nguồn: mọi dòng sản phẩm hai sàn đều có doanh thu và số bán, không số cũ nào đổi. Báo cáo cũ không tự sửa. Muốn dùng bản này phải cài lại bộ đọc trên máy chủ, cùng lúc đổi mã kiểm của bộ đọc; việc này cần chủ đồng ý. Câu xin deploy bản 6a2dd5a0 đã gửi chủ. |
| 1.14 | 18/10/2026 | Chủ đồng ý deploy bản 6a2dd5a0: máy chủ chạy bản 6a2dd5a0 từ khoảng 22:47 giờ Việt Nam. Bản này lên máy chủ cùng lúc các PR #304 (dòng báo cập nhật của công cụ trình duyệt), #305 và #308 (giao diện), #306 (tiêu đề web trong dấu trích dẫn) và #307 (kiểm tra tự động không còn treo). Không có thay đổi cơ sở dữ liệu. Số dòng và tệp đã lưu không đổi; trang chạy bình thường; các cờ đang bật giữ nguyên, kể cả đọc PDF. Bộ đọc số bán trên máy chủ vẫn là bản cũ (chưa có v11). |
| 1.15 | 18/10/2026 | Bản sửa bộ đọc số bán v11 (PR #309) qua duyệt hai lần và kiểm tra tự động, đã gộp vào bản chính 1cf5106e lúc khoảng 23:12 giờ Việt Nam. Bản 1cf5106e đã chuẩn bị sẵn trên máy chủ (cài đặt, dựng giao diện, thử nâng cấp dữ liệu trên bản sao: không đổi gì). Chưa deploy, chưa cài lại bộ đọc: chờ chủ đồng ý cả hai việc cùng lúc, sau đó chạy thử riêng quạt điện để xem có đủ 4 kết luận chính. |
| 1.16 | 18/10/2026 | Chủ đồng ý một câu cho ba việc. Máy chủ chạy bản 1cf5106e từ khoảng 23:15 giờ Việt Nam, bộ đọc số bán v11 đã cài lại và mã kiểm bộ đọc đã đổi cùng lúc. Bộ đọc cũ giữ một bản để quay lại. Không có thay đổi cơ sở dữ liệu; số dòng và tệp đã lưu không đổi; trang chạy bình thường; các cờ đang bật giữ nguyên. Đang chạy thử riêng quạt điện (dữ liệu số bán đã lưu, không tốn điểm). |
| 1.17 | 18/10/2026 | Chạy thử riêng quạt điện trên bản 1cf5106e (dữ liệu đã lưu, không tốn điểm) đạt: không còn dòng thiếu doanh thu hoặc số bán (tổng mẫu khoảng 5,6 tỷ đồng, 22.439 đơn vị); có 4 kết luận chính; bước kiểm 14 quy tắc tự động đạt; bước kiểm nghiệp vụ đạt; không có tên nhà cung cấp; có bảng vùng miền. Phát hiện một lỗi: bảng kết quả tìm kiếm không có cột gian hàng, nên báo cáo ghi sai "của 1 gian hàng" và vẽ hình 4.2 một gian hàng chiếm toàn bộ. Quy tắc mới: khi nguồn không ghi gian hàng thì không đếm số gian hàng, không vẽ hình mức tập trung theo gian hàng mà ghi rõ lý do; bước kiểm quy tắc 11 khi đó chỉ đòi 2 hình. Bản sửa là PR #310 (đang duyệt, chưa gộp, chưa lên máy chủ). Việc đọc tên gian hàng từ trang kết quả cần nâng bộ đọc, chờ chủ quyết. |
| 1.18 | 19/10/2026 | Ghi quyết định của chủ (19/10): báo cáo chạy thử lấy đánh giá Shopee bằng gói miễn phí, tối đa 20 đánh giá mỗi sản phẩm. Gói này có giới hạn hằng tháng của nhà cung cấp; nếu hết hạn mức thì phần đánh giá ghi chưa có, không nạp tiền. Tìm thấy các lỗi còn lại trong báo cáo PDF tự động. (1) Số Ngân hàng Thế giới hiện chưa làm tròn và ghi sai đơn vị. (2) Chỉ số dân số bị loại vì nguồn đổi cách trả lời: hỏi không kèm mã bộ dữ liệu thì chỉ còn 1 dòng, không có mã bộ; kèm mã bộ dữ liệu chính (số 2) thì đủ 66 năm. Cách sửa: hỏi kèm mã bộ dữ liệu, các địa chỉ cũ vẫn được chấp nhận. (3) Phần xuất nhập khẩu: mô hình đoán đúng mã hàng nhưng bước kiểm lại quá khắt khe nên loại bỏ. (4) Tài liệu ngành PDF: lượt tìm chỉ ra trang chia sẻ tài liệu, không có tệp PDF, và báo cáo im lặng bỏ qua nguồn này. (5) Quảng cáo tìm kiếm: không tìm được trang chủ của hãng nên bỏ qua mọi hãng. (6) Đánh giá: luồng tự chạy đang bỏ qua. Mỗi lỗi sửa trong một PR riêng; tất cả chưa gộp, chưa lên máy chủ. |
| 1.19 | 19/10/2026 | Tiến độ sửa các lỗi PDF tự động (ghi ở 1.17–1.18). Đã gộp vào bản chính, chưa lên máy chủ: (a) PR #310 (30f35dfe): khi nguồn không ghi gian hàng thì không đếm số gian hàng và không vẽ hình mức tập trung theo gian hàng; (b) PR #312 (792e1e94): số Ngân hàng Thế giới làm tròn theo độ chính xác của nguồn, ghi đúng đơn vị kèm một câu về cách làm tròn; chỉ số dân số hỏi kèm mã bộ dữ liệu chính nên đủ năm. Đang duyệt: PR #314 (xuất nhập khẩu: khi bước kiểm lại chỉ xác nhận được một phần thì ghi rõ giới hạn bên cạnh mã hàng ước tính, thay vì bỏ cả phần); PR #315 (báo cáo chạy thử lấy mẫu đánh giá Shopee nhỏ, tối đa 20 đánh giá mỗi sản phẩm, chỉ khi bật riêng cho bản chạy thử, chỉ cho báo cáo thị trường; báo cáo ghi rõ đây là mẫu thử, chưa mã hoá nội dung, không rút kết luận về thái độ khách); PR #317 (tài liệu ngành PDF: tìm theo cụm "báo cáo thị trường" và loại các trang chia sẻ tài liệu; khi không tìm thấy thì báo cáo ghi "Chưa tìm thấy tài liệu phù hợp trong lượt này." thay vì im lặng bỏ qua). Đang viết: quảng cáo tìm kiếm (tìm trang chủ của hãng) và đưa mẫu đánh giá chạy thử vào bản PDF người đọc. Video (cần điểm Kalodata) và đọc trực tiếp thư viện quảng cáo Meta vẫn chờ chủ. |
| 1.20 | 19/10/2026 | Thêm các bản sửa đã gộp vào bản chính, chưa lên máy chủ: PR #315 (02e62714): báo cáo chạy thử lấy mẫu đánh giá Shopee nhỏ, tối đa 20 đánh giá mỗi sản phẩm, chỉ khi bật riêng cho bản chạy thử. PR #317 (37330eea): báo cáo ghi rõ trạng thái tài liệu ngành dạng PDF khi không tìm thấy tài liệu phù hợp. PR #314 (a00148aa): xuất nhập khẩu xét theo loại sản phẩm thường bán dưới từ khóa và ghi phạm vi áp dụng cạnh mã hàng ước tính. Đang duyệt: PR #319 (bản PDF hiện cùng mẫu đánh giá thử và các dòng nguồn tương ứng) và PR #320 (quảng cáo tìm kiếm: nếu chưa thấy trang web chính hãng của thương hiệu trong kết quả có sẵn thì tìm thêm một lượt "trang chủ chính hãng" cho thương hiệu đó; tối đa 3 lượt tìm thêm và 3 lượt đọc quảng cáo). Chạy thử riêng quạt điện trên bản 37330eea (dữ liệu số bán đã lưu, không tốn điểm): bản PDF đạt cả 14 quy tắc chấm tự động và bước kiểm nghiệp vụ, không có tên nhà cung cấp, không còn câu "1 gian hàng", số dân số đủ. Bộ thu đánh giá Shopee miễn phí báo lỗi ở lượt này, nhiều khả năng do hết hạn mức miễn phí tháng 10 (khoảng 5,37 USD trên 5 USD). Báo cáo ghi đúng là chưa thu được đánh giá. Không nạp tiền. |
| 1.21 | 19/10/2026 | Tiếp tục sửa lỗi bản PDF tự động. Đã gộp vào bản chính, chưa lên máy chủ: PR #319 và #320 (d05f3dff), PR #322 (1c9556be). Sửa lại nguyên nhân ghi ở 1.20: bộ thu đánh giá Shopee miễn phí lỗi do sự cố tạm thời của bộ thu ở lượt chạy đó, không phải hết hạn mức tháng. Đọc soát kiểu chủ cửa hàng trên bản PDF chạy thử mới nhất: 52 lỗi trình bày (8 lỗi nặng), chia thành 7 gói sửa A–G, mỗi gói một PR, sửa trong luồng tự động chứ không sửa tay. Gói A (lọc dòng không phải sản phẩm chính và dòng doanh thu bất thường khỏi tổng, có ghi chú số dòng đã loại) là PR #325; gói B (bảng theo kỳ và bảng giá dễ đọc: ngày dd/mm/yyyy, tên sản phẩm, số không ghi bằng chữ) là PR #324; cả hai đang chờ duyệt. Các gói C–G (lời dẫn, mô tả nguồn cung và sự kiện, trang tổng hợp bằng chứng, số liệu vĩ mô) làm tiếp sau khi A và B gộp. Phiên rà giao diện web đã gộp thêm PR #323 (918db40e) và đang làm tiếp phần còn lại. |
| 1.22 | 19/10/2026 | Đã gộp vào bản chính, chưa lên máy chủ (bản chính mới nhất cd4f0a58): PR #324 và #325 (gói A và B ở 1.21), #328 và #330 (lời văn bản đọc Market dễ hiểu hơn: kỳ, nhóm so sánh, quảng cáo), #331 (Phần 11 đọc riêng từng sàn; mỗi đề xuất ở Phần 12 có ngày), #333 (Phần 1 và Phần 2 ghi riêng từng sàn), #334 và #335 (soát chữ, trích nguồn; chỉ dùng tuần tìm kiếm đã trọn; ghi cơ sở số dòng), #336 (hai tin cùng tên trong một gian hàng vẫn là hai bản ghi), #337 (Phần 8 mỗi sản phẩm một giá tham khảo dễ đọc). Đọc soát bản PDF chạy thử lần 9 (dữ liệu đã lưu): còn 4 lỗi nặng (bảng Phần 5 tràn trang; linh kiện quạt bị tính là quạt; Phần 1 chưa có kết luận thật; khoảng 19 trên 43 trang lặp nội dung đã có), 21 lỗi vừa, 17 lỗi nhẹ. Đang sửa, mỗi gói một PR: gói A là PR #339 (bộ lọc dòng mới bỏ linh kiện như stato, mô tơ, trục, lưới; Phần 2 ghi rõ điều kiện lọc và số dòng đã loại của từng sàn; dữ liệu đã lưu theo bộ lọc cũ vẫn đọc lại y như cũ); gói B (bỏ phần lặp ở Phần 4, 5 và 13) chờ gói A; gói C (kết luận chính thật cho Phần 1) làm sau. Số dư điểm số bán kiểm lại 19/10: vẫn 0 điểm, nên lượt chạy thử dùng dữ liệu đã lưu. Gói đánh giá Shopee miễn phí thử 19/10: 4 trên 4 lượt lỗi do bị nhà cung cấp chặn (lượt lỗi vẫn tính một lượt miễn phí); trước đó chỉ 2 trên 11 lượt đạt (đều ngày 14/10). Gói này chưa ổn định; khi lỗi, báo cáo vẫn chạy tiếp và ghi phần đánh giá là chưa có. Từ 19/10 mỗi gói mã mới có bộ test do Sol 6.1 xhigh viết (không phải người viết mã), luôn có trường hợp đối chứng. |
| 1.23 | 19/10/2026 | Số dư điểm số bán kiểm lại 19/10 (lệnh xem số dư miễn phí): 100 điểm; S02 không còn dừng vì tiền. Một báo cáo đầy đủ trước đây dùng khoảng 57 lần gọi có phí (khoảng 6 điểm). PR #338 (giao diện, bảng nguồn ở Phần 13) đã gộp vào bản chính fe7b4cbd, chưa lên máy chủ. Gói A (PR #339) đã qua duyệt và kiểm tra tự động nhưng tạm giữ, chưa gộp: theo yêu cầu của chủ ngày 19/10, mỗi bản sửa phải là quy tắc chung cho mọi sản phẩm, không chỉnh theo dữ liệu của một lượt chạy. Danh sách từ linh kiện của gói A lấy từ lượt quạt điện, nên sẽ làm lại bằng dấu hiệu dùng chung (vị trí từ khóa trong tên, từ chung như phụ kiện, linh kiện, thay thế, dùng cho; giá mỗi đơn vị thấp bất thường trong cùng sàn) và kiểm trên dữ liệu đã lưu của nhiều sản phẩm. Từ nay mỗi bản sửa phải đạt trên ít nhất 3 sản phẩm khác nhau. Gói B (bỏ phần lặp) đã cập nhật lên bản chính mới, đang được Sol 6.1 xhigh viết bộ test. |
| 1.24 | 19/10/2026 | Quyết định của chủ (19/10 chiều): không dùng Astra nữa; mọi việc viết mã, viết bộ test và duyệt mã chuyển sang Sol 6.1 xhigh. Người viết test và người duyệt là hai phiên Sol riêng, không phải người viết mã. Tự gộp khi Sol duyệt đạt ở đúng bản cuối, kiểm tra tự động xanh và gộp được. Gói B (PR #340, bỏ phần lặp) và gói C (PR #341, kết luận Phần 1 theo mẫu) đã gộp vào bản chính 82459bb9, chưa lên máy chủ. Gói A (PR #339) đã làm lại theo quy tắc chung: chỉ loại dòng khi tên có quan hệ phụ rõ (dùng cho, lắp cho, tặng…) cộng nhóm hàng hiếm theo ngưỡng của từng sàn; nhãn AI "sản phẩm chính" giữ dòng lại; Phần 2 ghi rõ bộ lọc và số dòng đã loại của từng sàn, không cộng hai sàn. Gói D (PR #342, nhãn trạng thái của từng phần khớp với nội dung, Phần 9 ghi rõ kỳ và cột sàn) đã có bộ test của Sol. Cả A và D đang chờ Sol duyệt. |
| 1.25 | 19/10/2026 | Gói D (PR #342: nhãn trạng thái từng phần nói đúng, Phần 9 có ngày) Sol duyệt đạt, đã gộp vào bản chính 71128df9, chưa lên máy chủ. Gói A (PR #339) lần duyệt thứ ba vẫn chưa đạt: quy tắc suy theo nhóm hàng còn loại nhầm sản phẩm thật có tiền tố chỉ người dùng hoặc công dụng (ví dụ "Cho bé: …"), kể cả khi bước AI lỗi; theo quy tắc 3 lần, đang mời một phiên Sol mới xem lại cách làm trước khi sửa. Mở gói R (PR #343): bản đọc Market dừng sai chỗ khi một phần có trích đoạn PDF hoặc video, làm các phần sau mất bước làm sạch và nhãn trạng thái; sửa để dừng ở chân trang thật. Trang không có trích đoạn giữ nguyên từng byte. |
| 1.26 | 19/10/2026 | Gói A (PR #339) đổi cách lọc theo ý kiến tư vấn của Sol: với bộ lọc mới (v3), một sản phẩm chỉ bị loại khỏi mẫu vì "không đúng sản phẩm" khi AI đã ghi nhận nhãn NOT_MAIN cho mọi từ khóa; các dấu hiệu trong tên (phụ kiện, quà tặng, nhóm hàng, "cho…") chỉ để tham khảo, không tự loại. Hai quy tắc tài chính giữ nguyên (có doanh thu nhưng không có số bán; giá bình quân cao hơn 20 lần trung vị cùng sàn). Khi AI không phân loại được, sản phẩm được giữ lại và báo cáo ghi rõ giới hạn này. Bộ lọc cũ (v2) giữ nguyên khi chưa bật cờ. Nhánh A đã gộp bản chính 71128df9; một phiên Sol mới đang viết mã. |
| 1.27 | 19/10/2026 | Gói A (PR #339, bộ lọc dòng v3 ở 1.26) Sol duyệt đạt, kiểm tra tự động xanh, đã gộp vào bản chính d94edaae, chưa lên máy chủ. Bộ lọc v3 chỉ chạy khi bật cờ chọn mô hình AI phân loại; chưa bật thì dữ liệu cũ và mới vẫn theo v2 như trước. Gói R (PR #343, bản đọc dừng đúng ở chân trang) đã gộp trước đó (3f3295dc). Gói E (PR #344: bảng theo kỳ có cột sàn, dòng nói rõ sản phẩm chính và sản phẩm đối chiếu, kỳ chưa đủ 30 ngày được ghi rõ và không đem so; bảng giá ghi đúng cơ sở giá và ngày thu) có bộ test của Sol, đang được Sol duyệt. Nguồn mới: chủ đưa vào một dịch vụ đọc review công khai trên Shopee, chạy trên máy chủ của chủ, miễn phí; đang thiết kế cách nối (gói S), mặc định tắt, không tự chuyển sang bộ thu có phí khi dịch vụ lỗi, báo cáo không nêu tên công cụ. |
| 1.28 | 19/10/2026 | Gói E (PR #344) Sol duyệt đạt, kiểm tra tự động xanh, đã gộp vào bản chính f026acd9, chưa lên máy chủ: bảng theo kỳ có cột sàn (bỏ cột sàn khi không dòng nào thuộc Shopee hay TikTok Shop), kỳ chưa đủ 30 ngày được ghi rõ và không đem so, bảng giá ghi đúng cơ sở giá và ngày thu. Gói S (nguồn review công khai trên Shopee) đã viết xong mã, mặc định tắt, đang viết bộ test. Bốn gói sửa nội dung báo cáo còn lại đã có hợp đồng hành vi, chạy lần lượt: R-business, G-evidence, G-references, F+ (biểu đồ, đánh số bảng và hình, bố cục trang, biểu tượng sàn không chèn vào câu trích). |
| 1.29 | 19/10/2026 | Chủ đồng ý deploy bản f026acd9. Máy chủ chạy bản f026acd9 từ khoảng 19:25 giờ Việt Nam, gồm mọi bản sửa đã gộp vào bản chính sau bản 1cf5106e (ghi ở 1.19–1.28), trong đó có các gói A, B, C, D, E và R. Lần này chỉ thay mã ứng dụng: bộ đọc số bán vẫn là bản v11, không có thay đổi cơ sở dữ liệu, số dòng và tệp đã lưu không đổi, trang chạy bình thường, các cờ đang bật giữ nguyên. Có bản sao dữ liệu trước khi đổi để quay lại. Bộ lọc dòng v3 của gói A chưa chạy vì cờ chọn mô hình AI phân loại vẫn tắt; bật cờ này cần một câu đồng ý riêng của chủ. Gói S (review công khai trên Shopee) chưa gộp nên chưa có trên máy chủ. |
| 1.30 | 19/10/2026 | Quyết định của chủ (19/10 tối, «1,2,3 tôi đều đồng ý»): (1) khi mọi gói đã gộp, chủ nhận mã bản mới và chỉ deploy khi chủ trả lời «deploy <mã>»; mỗi bản cần một câu riêng. (2) Bật bước AI lọc bỏ sản phẩm không liên quan (bộ lọc dòng v3 của gói A) trên máy chủ từ lần deploy tới, dùng cùng mô hình AI đang dùng cho các bước khác của báo cáo; sau đó chạy thử ít nhất 3 sản phẩm. (3) Bật nguồn review công khai trên Shopee trên máy chủ sau khi gói S gộp, tối đa 300 bình luận mỗi sản phẩm; app chỉ được trỏ tới tệp khoá truy cập, không đọc, không in và không chép khoá. Khi bật nguồn này, dòng hạn mức tiền cho bộ thu review có phí trên Shopee (10 USD) sẽ bỏ khỏi cấu hình máy chủ, vì theo thiết kế gói S hai nguồn không được bật cùng lúc và không tự chuyển sang bộ thu có phí; hạn mức bình luận TikTok (5 USD) giữ nguyên. Gói R-business (PR #345) Sol duyệt đạt cùng ba bản tự sửa (bỏ tên nguồn bị cấm khỏi nhãn biên nhận, câu về đỉnh và đáy giữ trong ba câu), đang chờ kiểm tra tự động. Gói S đã sửa xong và có bộ test mới, chờ gộp R rồi mở PR. |
| 1.31 | 19/10/2026 | Gói R-business (PR #345) đã gộp vào bản chính 75b98632, chưa lên máy chủ. Lượt kiểm tra tự động đầu bị đỏ vì một bài test cũ còn chờ câu «Lượt này chưa có …», trong khi bản đọc mới ghi «Báo cáo chưa có …». Người viết test sửa đúng hai dòng đó, Sol duyệt lại đạt, kiểm tra tự động xanh. Gói S (nguồn review công khai trên Shopee, mặc định tắt) đã mở PR #346 trên bản chính mới: mã và test đặt ở hai commit riêng, bản so khớp từng byte khi tắt cờ vẫn lấy từ chính mã của bản chính. Một phiên Sol mới đang duyệt PR này. Gói G-evidence đã sửa hai lỗi do người viết test tìm ra: biểu đồ thương mại bị mất khi hàng chỉ có mã HS mà chưa có tên tiếng Việt, và danh sách nguồn còn tên sản phẩm tiếng Anh của Ngân hàng Thế giới. Bộ test G đạt 243/243. Gói G đang được chuyển sang nền gói S, chưa có xung đột. |
| 1.32 | 19/10/2026 | Chủ đổi người viết code (19/10 khoảng 21:55 giờ Việt Nam, «chuyển người viết code thành opus 5.5 medium đi nhé»): từ nay code do Claude Opus 5.5 mức medium viết; viết test và duyệt code vẫn là GPT Sol 6.1 xhigh, mỗi việc một phiên riêng, người viết test và người duyệt không phải người viết code. Gói G-evidence: code và test đã sẵn sàng trên nền gói S, nhánh riêng đã đẩy lên, đang chờ Sol duyệt; sẽ mở PR sau khi gói S gộp. Gói S: còn một bài test ghi cứng mã phiên bản nên chỉ chạy đúng trên máy người viết test; cần sửa bài test (không đổi code). |
| 1.33 | 19/10/2026 | Gói S (review công khai trên Shopee, PR #346): Sol duyệt đạt và tự sửa ba lỗi nhỏ (chủ hủy vẫn giữ sau khi khởi động lại, đếm đúng số yêu cầu khi bị dừng trước lúc gửi, so khớp bản cũ chặt hơn). Người viết test cập nhật các bài test theo bảng mới thêm (phiên bản cơ sở dữ liệu 59) để kiểm tra tự động hết đỏ. Hai phần đã gộp thành một bản, đang chờ Sol duyệt lại rồi mới gộp. Gói G-evidence: Sol duyệt đạt, bản sửa đã lưu, chờ gộp sau S. Gói G-references, quy tắc bảng thuật ngữ mới: một thuật ngữ chỉ được giải thích khi người đọc thật sự gặp nó trong lời văn của báo cáo (không tính phần trích nguyên văn, mã, đường dẫn); riêng các thuật ngữ mà quy tắc 1 của bộ kiểm tra 14 điểm bắt buộc phải có, thì vẫn giữ giải thích dù chỉ xuất hiện trong phần trích, để báo cáo không bị đánh trượt quy tắc 1. Code gói này do Opus viết, Sol đang viết test. |
| 1.34 | 19/10/2026 | Ghi nhận của chủ (19/10 tối): (1) điểm số bán đã được nạp, nên các lượt chạy thử sau lần deploy tới dùng được dữ liệu thật (vẫn chỉ kiểm số dư bằng lệnh miễn phí); (2) đánh giá Shopee (S05) từ nay lấy từ nguồn review công khai trên Shopee (gói S), không lấy từ bộ thu cũ; (3) báo cáo Insight tạm dừng, chỉ làm báo cáo Market; (4) không bao giờ đưa bình luận thô lên báo cáo. Gói S hiện chỉ ghi số đánh giá thu được và giới hạn, nội dung để "chưa mã hoá". Gói tiếp theo S2 sẽ cho bình luận từ nguồn này đi qua quy trình xử lý đã có trước khi lên báo cáo: AI đề xuất chủ đề và cảm nhận, mỗi mã kèm một câu trích phải khớp nguyên văn bình luận gốc; bộ luật từ khoá theo ngành; bỏ tên người mua và ảnh, video; dòng chỉ có thuộc tính sản phẩm không tính vào tỷ lệ; nguồn chỉ ghi "review công khai trên Shopee". S2 phải là quy tắc chung cho mọi sản phẩm và đạt trên ít nhất 3 sản phẩm. |
| 1.35 | 19/10/2026 | Chủ duyệt phương án A (19/10 tối, «đồng ý đề xuất của bạn»): dừng gói S2. Đã soát tài liệu nghiệp vụ gốc: bảng "phần nào dùng nguồn nào" của danh mục nguồn, mọi phiên bản từ 08/10, không có phần Market nào dùng đánh giá Shopee hay bình luận TikTok. Phần Nhu cầu đo bằng số bán, và ghi chú 05/10 nói thêm đánh giá không làm nhận định Market mạnh hơn. Mốc 300 đánh giá và ít nhất 5 thương hiệu nằm ở mục nguồn cho Insight. Đánh giá vào Market từ quyết định của chủ ngày 06/10 và 12/10 (quy tắc 13 và 14), ở dạng nguồn được đếm. Vì vậy Market giữ gói S như hiện tại: ghi số đánh giá, nhãn "review công khai trên Shopee", mốc 300 và giới hạn; không có bảng chủ đề, không có câu trích lời khách. Mã hoá chủ đề và câu trích làm ở Insight khi Insight mở lại; phần Cơ hội của Market sẽ lấy tín hiệu từ đó, đúng thiết kế gốc. Thiết kế S2 được cất lại cho Insight. Đã sửa cột "Dùng ở" của S05 và ghi chú về 4 nguồn lõi cho khớp. |
| 1.36 | 19/10/2026 | Gói S (review công khai trên Shopee, PR #346) đã gộp vào bản chính 9c41876a sau khi Sol duyệt đạt và kiểm tra tự động xanh. Gói này chưa lên máy chủ và mặc định tắt; bật trên máy chủ ở lần deploy tới theo quyết định 1.30. Gói G-evidence đã mở PR #347 (Sol duyệt đạt), đang chờ kiểm tra tự động. Gói G-references có bộ test mới và đang được Sol duyệt. Máy chủ Fedora từng hết hạn mức ổ tạm của tài khoản nên một số bài test báo lỗi ghi; đã chuyển các thư mục làm việc cũ sang ổ đĩa chính, không xoá dữ liệu. |
| 1.37 | 20/10/2026 | Deploy bản 6efba50a (chủ duyệt trước 20/10: «sau khi có mã SHA, tôi đồng ý deploy nhé»). Bản này có gói G-references, gói F+ và phiên bản cơ sở dữ liệu 59. Bật hai cờ theo quyết định 1.30: AI lọc bỏ sản phẩm không liên quan, và review công khai trên Shopee (gói S, tối đa 300 mỗi sản phẩm). Bỏ trần 10 USD của bộ thu đánh giá Shopee trả tiền cũ, và bỏ luôn mốc 300 đánh giá của bộ thu đó, vì mốc này chỉ hợp lệ khi còn trần tiền. Lần khởi động đầu lỗi vì còn dòng mốc cũ; máy chủ chạy lại bản 6efba50a không có hai cờ trong lúc sửa, rồi chạy bản đủ hai cờ sau khi chủ đồng ý. Trần tiền bình luận TikTok giữ nguyên. Đang chạy thử 3 sản phẩm: quạt điện, giày thể thao, son môi. |

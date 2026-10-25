## ADDED Requirements

### Requirement: R-I30 Năm câu hỏi kinh doanh và 18 phần theo thứ tự câu hỏi
Báo cáo Insight SHALL trả lời 5 câu hỏi kinh doanh về khách hàng, và SHALL xếp 18 phần theo thứ tự câu hỏi, để các phần của cùng một câu hỏi nằm liền nhau:
- Mở đầu: Phần 1 Kết luận chính, Phần 2 Câu hỏi kinh doanh, Phần 3 Phạm vi và cách làm.
- Câu 1 «Ai dùng, ai mua?»: Phần 4 Khách hàng là ai, Phần 5 Khác biệt giữa các nhóm.
- Câu 2 «Băn khoăn gì trước khi mua?»: Phần 6 Chủ đề quan tâm, Phần 7 Nỗi lo trước khi mua.
- Câu 3 «Chọn sản phẩm dựa vào đâu?»: Phần 8 Lý do chọn, Phần 9 Thương hiệu và đối thủ, Phần 10 Hành trình mua, Phần 11 Khách gặp sản phẩm ở đâu, Phần 12 Cách mua và dùng.
- Câu 4 «Dùng xong thấy thế nào?»: Phần 13 Cảm nhận, Phần 14 Điều khách chê.
- Câu 5 «Nhóm khách nào bị bỏ ngỏ?»: Phần 15 Nhu cầu chưa đáp ứng, Phần 16 Hướng cơ hội, Phần 17 Thử nghiệm và đo lường.
- Phụ lục: nguồn của từng con số.

Một câu hỏi MAY có nhiều kết luận. Mỗi kết luận SHALL có mức tin riêng (R-I32) và bước mua riêng (R-I31). Năm câu hỏi SHALL dùng chung cho mọi sản phẩm; với sản phẩm khác, báo cáo chỉ thay dữ liệu.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 22/10/2026 chủ yêu cầu trang cho sếp trả lời 4 tiêu chí (F101), rồi chọn xếp 18 phần theo 5 câu hỏi (F107). Ngày 22/10/2026 chủ duyệt trang bản 9 (F117). Ngày 25/10/2026 chủ yêu cầu đưa phương pháp này vào OpenSpec (F163).

#### Scenario: Phần cùng câu hỏi nằm liền nhau
- **WHEN** báo cáo Insight có Phần 6 và Phần 7 cùng trả lời câu 2
- **THEN** hai phần đứng liền nhau, ngay sau các phần của câu 1

#### Scenario: Sản phẩm khác dùng cùng câu hỏi
- **WHEN** báo cáo Insight chạy cho một sản phẩm không phải viên canxi
- **THEN** báo cáo vẫn dùng 5 câu hỏi và 18 phần như trên, chỉ thay dữ liệu

### Requirement: R-I31 Mỗi kết luận gắn một bước mua
Mỗi kết luận trong báo cáo Insight SHALL gắn một bước mua: Biết đến, Quan tâm, Muốn mua, Mua hoặc Sau mua. Kết luận SHALL ghi «Chưa rõ bước» khi dữ liệu không cho biết bước. Bước của kết luận SHALL là bước của dữ liệu mà kết luận dựa vào:
- Quảng cáo: Biết đến.
- Từ khóa hỏi để chọn (loại nào, cho ai, có nên dùng, tác dụng phụ, so sánh) và kết quả tìm kiếm Google: Quan tâm.
- Từ khóa hỏi cách dùng (ví dụ giờ uống): Chưa rõ bước.
- Tên sản phẩm và video bán hàng: Muốn mua.
- Doanh thu theo dòng và quy cách bán chạy: Mua.
- Đánh giá trên sàn: Sau mua. Đánh giá kể lại lý do mua vẫn là Sau mua, ghi «kể lại».

Bước mua SHALL là khung sắp xếp theo quy ước, SHALL NOT được coi là thời điểm thật hay bằng chứng khách đi đúng thứ tự. Từ khóa hỏi cách dùng chưa rõ bước SHALL NOT được đếm vào bước nào.

Báo cáo SHALL NOT gộp dữ liệu của hai bước thành một con số. Báo cáo SHALL NOT ghép các nhóm dữ liệu của các bước thành một khách hàng, và SHALL NOT tính tỷ lệ chuyển đổi giữa các bước. Phần tổng hợp (Phần 1, 16, 17) và Phần 10 SHALL giữ nguyên bước, nguồn và mức tin gốc của từng ý bên trong.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 22/10/2026 chủ muốn báo cáo cho thấy phương pháp xét từng giai đoạn AIDA (F110). Nhóm thêm bước Sau mua, vì phần lớn lời khách công khai là đánh giá viết sau khi mua. AIDA là khung sắp xếp, không phải bằng chứng khách đi đúng thứ tự.

#### Scenario: Đánh giá kể lý do mua
- **WHEN** một đánh giá Shopee kể vì sao khách chọn sản phẩm
- **THEN** kết luận dựa trên đánh giá đó gắn bước Sau mua và ghi «kể lại»

#### Scenario: Tính tỷ lệ chuyển đổi
- **WHEN** báo cáo chia số đánh giá cho số từ khóa để ra tỷ lệ «từ quan tâm sang mua»
- **THEN** quy tắc R-I31 bị vi phạm

### Requirement: R-I32 Bốn câu hỏi kiểm tra và bốn mức tin
Mỗi kết luận trong báo cáo Insight SHALL có một mức tin, chấm bằng 4 câu hỏi kiểm tra:
1. Đo đúng điều cần biết không? (Ví dụ: muốn biết lý do khách chọn thì phải đọc lời khách, không phải lời người bán.)
2. Mẫu đủ lớn và đa dạng không? (Đạt ngưỡng R-I33, và không chỉ dựa vào một sản phẩm hay một thương hiệu.)
3. Phân loại tự động đã có người rà một mẫu chưa?
4. Cách đo đã cho kết quả ổn trên từ 3 sản phẩm chưa? Điều này cho biết cách đo ổn, chưa cho biết kết luận đúng.

Bốn mức tin:
- Chắc: dữ liệu thật, đạt cả 4 câu.
- Khá: dữ liệu thật, thiếu đúng 1 câu.
- Yếu: thiếu từ 2 câu trở lên, hoặc nguồn chỉ trả lời một phần nhỏ của câu hỏi.
- Không: chưa có nguồn nào trả lời được.

Khi một kết luận khớp hai mức, báo cáo SHALL lấy mức thấp hơn. Câu không áp dụng cho nguồn SHALL NOT tính là thiếu. Mọi giả thuyết SHALL cao nhất là Yếu. Phần tổng hợp SHALL NOT có mức tin cao hơn phần gốc nó dựa vào. Nguồn đã cho dữ liệu thật trên từ 2 sản phẩm được coi là dùng được ổn định, nhưng điều đó SHALL NOT tự nâng kết luận lên Chắc.

Ba nhãn đi kèm: Khung (phần khung của báo cáo, chỉ xét đủ hay thiếu, không chấm mức tin), Chưa có dữ liệu (nguồn chưa thu, ô để trống) và Giả thuyết (điều người viết suy ra). Mỗi giả thuyết SHALL mang nhãn Giả thuyết ngay tại câu đó, ở bất kỳ phần nào.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Tiêu chí 2 của trang cho sếp (F101). Ngày 22/10/2026 chủ đồng ý giữ hai luật riêng cho mức Chắc: luật chọn nguồn (từ 2 sản phẩm) và luật kết luận (4 câu hỏi) (F112). Astra tìm 29 lỗi có chung một gốc: trang nói mạnh hơn bằng chứng (F111).

#### Scenario: Thiếu đúng một câu
- **WHEN** một kết luận dùng 133 từ khóa thật trên nhiều thương hiệu, đạt câu 1, 2 và 4, nhưng phần phân loại tự động chưa có người rà
- **THEN** kết luận có mức Khá

#### Scenario: Giả thuyết được chấm Khá
- **WHEN** một ý suy ra mang nhãn Giả thuyết nhưng được chấm mức Khá
- **THEN** quy tắc R-I32 bị vi phạm

#### Scenario: Tóm tắt mạnh hơn phần gốc
- **WHEN** Phần 1 ghi mức Khá cho một ý mà phần gốc của ý đó ở mức Yếu
- **THEN** quy tắc R-I32 bị vi phạm

### Requirement: R-I33 Ngưỡng để một chủ đề thành kết luận
Một chủ đề trong đánh giá SHALL chỉ thành kết luận khi có từ 5 người viết khác nhau (theo tên hiện trên đánh giá), trên từ 3 sản phẩm. Một chủ đề trong từ khóa tìm kiếm SHALL chỉ thành kết luận khi có từ 5 từ khóa khác nhau. Dưới ngưỡng, báo cáo SHALL ghi «dưới ngưỡng» và SHALL NOT nâng chủ đề thành kết luận. Báo cáo SHALL NOT gọi một chủ đề đạt ngưỡng là đại diện cho mọi khách.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngưỡng là quy ước của nhóm trên trang bản 9 (chủ duyệt 22/10/2026, F117), để một người viết nhiều lần không tạo ra kết luận. Từ khóa chỉ cho biết có người hỏi, không cho biết bao nhiêu người hỏi. Ngưỡng này khác R-I09: R-I09 xếp hạng chủ đề, R-I33 quyết định chủ đề có thành kết luận không.

#### Scenario: Đủ ngưỡng đánh giá
- **WHEN** một chủ đề có 6 người viết khác nhau trên 3 sản phẩm
- **THEN** chủ đề đó được thành kết luận

#### Scenario: Một từ khóa
- **WHEN** chỉ có 1 từ khóa hỏi «uống canxi lúc nào»
- **THEN** báo cáo ghi «dưới ngưỡng», không thành kết luận

### Requirement: R-I34 Vai trò của từng nguồn
Với mỗi câu hỏi, báo cáo Insight SHALL ghi vai trò của từng nguồn: Nguồn chính (gần nhất với điều cần biết), Nguồn phụ, hoặc Chỉ gợi ý. Nguồn chính chưa chắc đo trực tiếp; báo cáo SHALL nói rõ nguồn đo được gì và không đo được gì. Câu trả lời của AI (ví dụ AI Overview trên trang tìm kiếm) SHALL chỉ dùng để gợi ý giả thuyết, SHALL NOT dùng làm bằng chứng, và SHALL NOT cho mức Chắc ở phần nói về khách. Báo chí SHALL chỉ dùng cho bối cảnh ngành ở Phần 2, và chỉ bài có dẫn lời cơ quan chuyên môn. Lời người bán (tên sản phẩm, video bán hàng) SHALL được gọi là lời chào hàng, không phải lý do khách chọn.

Báo cáo SHALL dùng dữ liệu công khai, rồi phân loại và đếm; SHALL NOT khảo sát hay phỏng vấn. Vai trò các nguồn dưới đây SHALL theo bảng (số câu theo R-I30; «—» là không dùng cho câu đó):

| Nguồn | Câu 1 | Câu 2 | Câu 3 | Câu 4 | Câu 5 |
| --- | --- | --- | --- | --- | --- |
| Tên sản phẩm trên sàn | Phụ | — | Phụ | — | Phụ |
| Số bán trên sàn | — | — | Phụ | — | — |
| Phụ đề video bán chạy TikTok Shop | — | — | Phụ | — | Phụ |
| Đánh giá Shopee | Chính | Phụ | Chính | Chính | Chính |
| Đánh giá TikTok Shop | — | Phụ | — | Phụ | Phụ |
| Gợi ý tìm kiếm Google | Phụ | Chính | Phụ | — | Phụ |
| Kết quả tìm kiếm Google | — | — | Phụ | — | — |
| Google Trends theo tỉnh | Phụ | — | — | — | Phụ |
| World Bank | Phụ | — | — | — | — |
| NVIDIA Nemotron-Personas Vietnam | Phụ | — | — | — | — |
| Google AI Overview | — | Gợi ý | Gợi ý | — | — |

Video bán chạy TikTok Shop SHALL giới hạn tối đa 5 video; đánh giá Shopee SHALL giới hạn tối đa 300 mỗi sản phẩm (R-I03). Đánh giá TikTok Shop SHALL chỉ dùng khi TikTok Shop chiếm từ 50% doanh thu. Trên trang bản 9, video bán chạy, đánh giá TikTok Shop và hồ sơ mô phỏng là «Đã duyệt, chưa chạy»; bình luận video TikTok là «Tạm dừng». Bảng này SHALL NOT được coi là bằng chứng các nguồn đó đã chạy. Tên nguồn trong bảng là để đối chiếu phương pháp; chữ trong báo cáo SHALL tuân R-L01 và R-I29.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Tiêu chí 1 và 3 của trang cho sếp (F101): mỗi câu hỏi dùng nguồn nào, nguồn khả thi đến đâu. Khi thử với viên canxi, câu trả lời của AI chỉ đúng hoàn toàn 5 trên 10 ý. Bảng nguồn ở trang bản 9 đánh giá từng nguồn cho mọi sản phẩm (xem R-L01 về tên nguồn trong báo cáo).

#### Scenario: AI Overview làm bằng chứng
- **WHEN** báo cáo dùng câu trả lời AI Overview để chấm một kết luận về khách ở mức Chắc
- **THEN** quy tắc R-I34 bị vi phạm

#### Scenario: Lời người bán gọi là lý do khách chọn
- **WHEN** báo cáo viết «khách chọn vì tăng chiều cao» chỉ dựa trên tên sản phẩm
- **THEN** quy tắc R-I34 bị vi phạm

### Requirement: R-I35 Gọi đúng tên từng loại số
Báo cáo Insight SHALL gọi đúng tên từng loại số: số dân World Bank là «toàn dân»; số từ tài khoản quảng cáo Meta là «người dùng Facebook, ước tính của nền tảng»; mức Google Trends là mức so sánh 0–100, không phải số người. Không con số nào SHALL được gọi là «người mua». Báo cáo SHALL NOT giả lập khách hàng hay dùng người trả lời ảo. Dữ liệu dân số mô phỏng SHALL chỉ làm mốc so sánh toàn dân: trước khi dùng, báo cáo SHALL so cơ cấu tuổi, giới, thành thị với World Bank và ghi rõ nếu lệch; SHALL NOT dùng làm bằng chứng về khách; SHALL NOT đặt tên nhân vật.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 20/10/2026 chủ dùng «toàn dân» làm mốc so (F22 đến F25, xem R-I28). Ngày 22/10/2026 chủ thêm nguồn hồ sơ dân số mô phỏng vào trang cho sếp (F103). Ngày 21/10/2026 tài khoản quảng cáo Meta của chủ chỉ cho số người dùng Facebook, không phải người mua.

#### Scenario: Gọi số Meta là người mua
- **WHEN** báo cáo viết «68,9 triệu người mua» từ số ước tính của tài khoản quảng cáo Meta
- **THEN** quy tắc R-I35 bị vi phạm

#### Scenario: Đặt tên nhân vật cho hồ sơ mô phỏng
- **WHEN** báo cáo đặt tên «chị Lan, 32 tuổi» cho một hồ sơ dân số mô phỏng
- **THEN** quy tắc R-I35 bị vi phạm

### Requirement: R-I36 Không lặp số Market, không xếp hạng thương hiệu bằng số sao
Báo cáo Insight SHALL NOT lặp lại doanh thu, thị phần hay số khác của báo cáo Market cùng lần chạy; báo cáo SHALL chỉ dẫn sang báo cáo Market. Báo cáo Insight SHALL NOT dùng số sao để xếp hạng thương hiệu.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Trang bản 9 (chủ duyệt 22/10/2026, F117): doanh thu, thị phần nằm ở báo cáo Market; đánh giá thường lệch về 5 sao nên số sao không xếp hạng được thương hiệu.

#### Scenario: Chép bảng doanh thu Market
- **WHEN** Phần 9 chép lại bảng doanh thu thương hiệu của báo cáo Market
- **THEN** quy tắc R-I36 bị vi phạm

#### Scenario: Xếp hạng theo số sao
- **WHEN** báo cáo xếp thương hiệu A trên thương hiệu B vì điểm sao trung bình cao hơn
- **THEN** quy tắc R-I36 bị vi phạm

### Requirement: R-I37 Ghi rõ điều báo cáo chưa trả lời được
Báo cáo Insight SHALL có mục «Những gì báo cáo chưa trả lời được». Mỗi dòng SHALL ghi điều chưa biết, bước mua, vì sao chưa biết, và cần gì để trả lời. Khi chưa có dữ liệu, ô SHALL để trống với nhãn «Chưa có dữ liệu»; báo cáo SHALL NOT đoán.

Phần 3 và Phụ lục SHALL ghi bối cảnh mọi nguồn: ai, khi nào, ở đâu, bao nhiêu; có nguồn, ngày thu, cỡ mẫu và giới hạn của từng nguồn (G3). Phát hiện SHALL được rà và ghi lại ngay trong lúc làm, cùng danh sách việc chờ quyết ở từng bản (G8).

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Nguyên tắc G8 «rà và ghi lại phát hiện ngay trong lúc làm» và quy tắc «chưa có dữ liệu thì để trống» trên trang bản 9 (chủ duyệt 22/10/2026, F117).

#### Scenario: Người mua thật là ai
- **WHEN** không có nguồn nào cho tuổi, giới, nơi ở của người mua thật
- **THEN** mục «Những gì báo cáo chưa trả lời được» có dòng này, ghi bước Mua và cần dữ liệu người mua từ sàn hoặc khảo sát

#### Scenario: Đoán khi thiếu dữ liệu
- **WHEN** chưa có dữ liệu mua lại nhưng báo cáo vẫn viết «khách thường mua lại sau 2 tháng»
- **THEN** quy tắc R-I37 bị vi phạm

### Requirement: R-I38 Brief ở Phần 2
Phần 2 của báo cáo Insight SHALL ghi brief: báo cáo viết cho ai, phục vụ quyết định kinh doanh nào, đối tượng khách là ai, 5 câu hỏi, và với từng câu hỏi là đi khám phá hay đi kiểm chứng. Người đặt báo cáo SHALL điền quyết định kinh doanh trước khi chạy.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Nguyên tắc G1 (có brief trước) và G2 (chọn rõ khám phá hay kiểm chứng) trên trang bản 9, từ tài liệu 1 và 2 ở mục 4.1 của trang (chủ duyệt 22/10/2026, F117).

#### Scenario: Có quyết định kinh doanh
- **WHEN** người đặt báo cáo điền «chọn quy cách hộp cho dòng mới»
- **THEN** Phần 2 ghi quyết định đó cùng 5 câu hỏi và nhãn khám phá hay kiểm chứng cho từng câu

#### Scenario: Thiếu nhãn khám phá hay kiểm chứng
- **WHEN** Phần 2 nêu 5 câu hỏi nhưng không ghi câu nào là khám phá, câu nào là kiểm chứng
- **THEN** quy tắc R-I38 bị vi phạm

### Requirement: R-I39 Câu insight có bằng chứng ở mọi tầng
Báo cáo Insight SHALL tách riêng sự thật, quan sát và insight (G4). Một câu insight SHALL theo các luật sau:
- Hỏi «Tại sao?» ít nhất 3 tầng (G5). Mỗi tầng SHALL có một đánh giá mà chính khách tự nối hai ý bằng lý do («vì…», «nên…»). Hai chủ đề chỉ cùng xuất hiện thì chưa đủ. Thiếu bằng chứng thì báo cáo SHALL dừng ở tầng cuối có bằng chứng và ghi «chưa đủ bằng chứng», dù chưa đủ 3 tầng.
- Câu insight SHALL có mâu thuẫn (vế «nhưng»), và cả hai vế SHALL có bằng chứng (G6). Câu ghép ba vế: Sự thật ngầm, Động lực, Xung đột.
- Câu insight SHALL nằm ở chỗ ba sự thật gặp nhau: ngành, thương hiệu, khách hàng (3C, G7). Sự thật thương hiệu là điểm mạnh, điểm yếu của các thương hiệu đang bán, không phải của thương hiệu chủ.
- Câu SHALL viết ở ngôi thứ ba, kèm số đếm ở dòng bằng chứng, và SHALL NOT nói thay khách.
- Mỗi bước mua SHALL có câu insight riêng, SHALL NOT viết một insight chung cho mọi bước (G9).
- Mỗi tầng SHALL có số chú thích trỏ về nguồn gốc ở Phụ lục, kèm một câu diễn giải để người duyệt mở trang gốc kiểm tra. Báo cáo SHALL NOT trích nguyên văn bình luận của khách (R-I11).

Vế nào thiếu bằng chứng thì câu đó SHALL mang nhãn Giả thuyết. Mâu thuẫn SHALL được ghi riêng từng sàn (R-I06). Câu insight SHALL chỉ giữ động cơ và rào cản có trong lời khách: công dụng, giá, quy cách, chất lượng, giao hàng; SHALL NOT làm insight cảm xúc, văn hóa cho chiến dịch quảng cáo (R-I22).

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 22/10/2026 Astra duyệt trang cho sếp với điều kiện làm xong G5–G7 trước báo cáo thật (F111). Yêu cầu «tầng nào cũng có bằng chứng» và «cả hai vế đều có bằng chứng» là nhóm tự thêm, chặt hơn tài liệu gốc, vì báo cáo không hỏi trực tiếp được khách. Insight không làm insight cảm xúc hay sáng tạo quảng cáo (R-I22). Không trích nguyên văn lời khách (R-I11).

3C tạm dùng như một giả định vì tài liệu gốc mới đọc được 1/3 (mục 4.1, 4.2 của trang bản 9). Chưa có bằng chứng quy ước của nhóm về bằng chứng ở mọi tầng và cả hai vế cho insight tốt hơn.

#### Scenario: Tầng tại sao thiếu bằng chứng
- **WHEN** tầng thứ hai của chuỗi «Tại sao?» không có đánh giá nào khách tự nối hai ý bằng «vì» hay «nên»
- **THEN** báo cáo dừng ở tầng một và ghi «chưa đủ bằng chứng»

#### Scenario: Câu insight ngôi thứ nhất
- **WHEN** báo cáo viết câu insight «Tôi muốn uống canxi mà không bị táo bón»
- **THEN** quy tắc R-I39 bị vi phạm

#### Scenario: Vế nhưng không có bằng chứng
- **WHEN** câu insight có vế «nhưng sợ táo bón» mà không có từ khóa hay đánh giá nào làm bằng chứng
- **THEN** câu đó mang nhãn Giả thuyết

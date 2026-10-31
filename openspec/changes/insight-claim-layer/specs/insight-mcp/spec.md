## ADDED Requirements

### Requirement: R-IM13 Danh mục ý con do AI gom, hai máy chấm chéo
Mỗi chủ đề có đủ đánh giá SHALL có một danh mục «ý con». Một ý con là một điều cụ thể khách nói về chủ đề, ví dụ «xương chắc hơn» trong chủ đề Công dụng. Danh mục SHALL do AI gom từ lời khách của lần chạy. Danh mục SHALL có tối đa 12 ý con, đúng một ý con chung chung, và một câu `specific_rule` nói thế nào là lời cụ thể cho chủ đề đó. Tên ý con SHALL NOT chép nguyên văn lời khách. Danh mục SHALL là dữ liệu có số bản, không phải mã.

Danh mục SHALL được hai máy chấm độc lập: Astra (gpt-6-astra, xhigh, chỉ đọc) và Opus 5.5. Vòng 1: mỗi máy chấm riêng danh mục, mẫu gán và nhóm gần trùng. Vòng 2: mỗi máy xem từng chỗ khác với máy kia và quyết định giữ hay theo máy kia. Chỗ cả hai cùng giữ ý mình là «tranh chấp». Chủ không chấm mẫu (F322, chọn 2B).

Danh mục SHALL đạt khi: không còn ý con nào bị cả hai máy chấm là chồng nghĩa, quá rộng hoặc sai tên; và ít nhất 80% đánh giá trong mẫu đã thống nhất được gán đúng và đủ. Danh mục chưa đạt SHALL mang nhãn «danh mục nháp». Mọi câu dùng danh mục nháp SHALL có mức tin trần Yếu.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 31/10/2026 chủ hỏi cách đo các lời lặp lại trong một nhãn (F319), rồi chọn 2B: AI tự gom, Astra và Opus 5.5 chấm chéo bản chấm của nhau (F322).

#### Scenario: Hai máy cùng thấy chồng nghĩa
- **WHEN** Astra và Opus 5.5 cùng chấm một ý con là chồng nghĩa với ý con khác
- **THEN** danh mục mang nhãn «danh mục nháp» và câu dùng danh mục có mức tin trần Yếu

#### Scenario: Chủ được hỏi chấm mẫu
- **WHEN** quy trình yêu cầu chủ chấm mẫu ý con
- **THEN** quy tắc R-IM13 bị vi phạm

### Requirement: R-IM14 Gán ý con chỉ trên lời khách
Gán ý con SHALL dùng Jev: một lần gọi cho một đánh giá trong một chủ đề, một câu hỏi có hoặc không cho mỗi ý con cụ thể, một câu hỏi lời cụ thể theo `specific_rule`, và một câu hỏi văn rác. Ý con SHALL được giữ khi xác suất «có» từ 0,70. Ý con chung chung SHALL được quyết định sau khi gán, không do Jev tự loại trừ: đánh giá có khen hoặc chê chủ đề và không giữ ý con cụ thể nào thì mang ý con chung chung; đánh giá đã giữ một ý con cụ thể thì không mang ý con chung chung. Dòng thuộc tính do sàn gợi ý (dạng «Tên: giá trị») SHALL bị bỏ trước khi gán. Đánh giá chỉ có dòng thuộc tính SHALL NOT được gửi đi gán và SHALL được đếm riêng là «chỉ có dòng thuộc tính». Đánh giá bị gán văn rác từ 0,70 SHALL NOT được tính làm bằng chứng. Gán ý con là gọi trả phí, nên SHALL theo luật cờ trả phí và trần lượt gọi của R-IM01 và R-IM03.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Lần chạy thử ngày 31/10/2026 trên canxi: hai máy chấm cùng chỉ ra dòng thuộc tính của sàn bị tính như lời khách, và văn quảng cáo lạc đề được tính làm bằng chứng.

#### Scenario: Đánh giá chỉ có dòng thuộc tính
- **WHEN** một đánh giá chỉ có các dòng «Tên: giá trị» do sàn gợi ý
- **THEN** đánh giá không được gán ý con và được đếm vào «chỉ có dòng thuộc tính»

#### Scenario: Ý chung chung khi đã có ý cụ thể
- **WHEN** một đánh giá giữ ý con «xương chắc hơn» và cũng khen hiệu quả chung
- **THEN** đánh giá không mang ý con chung chung

#### Scenario: Văn rác
- **WHEN** Jev trả xác suất văn rác 0,85 cho một đánh giá
- **THEN** đánh giá không được tính vào số đánh giá của bất kỳ ý con nào

### Requirement: R-IM15 Lời gần trùng tính một bằng chứng
Khi đếm bằng chứng cho một ý con, các lời gần trùng chữ SHALL được tính là một. Lời gần trùng là hai lời khách từ 8 chữ trở lên, giống nhau từ 80% theo cụm 4 ký tự. Nhóm gần trùng SHALL được dựng một lần trên mọi đánh giá của lần chạy, không theo từng chủ đề, nên một lời được gộp giống nhau ở mọi chủ đề. Lời dưới 8 chữ SHALL NOT bị gộp. Bản ghi SHALL được giữ đủ. Mỗi ý con SHALL hiện cả hai số: số đánh giá và số bằng chứng sau khi gộp. Đây là ngoại lệ của luật L1 chỉ cho phép đếm bằng chứng ý con.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 31/10/2026 chủ chọn 1A (F322): lời gần trùng chữ tính 1 nhưng vẫn giữ bản ghi.

#### Scenario: Ba lời gần trùng cùng một ý
- **WHEN** ba đánh giá 20 chữ giống nhau 90% cùng được gán ý «xương chắc hơn»
- **THEN** ý đó có số đánh giá 3 và số bằng chứng 1, và cả ba bản ghi vẫn còn

#### Scenario: Lời ngắn giống nhau
- **WHEN** năm đánh giá chỉ viết «ngon» cùng được gán ý khen vị chung
- **THEN** năm đánh giá không bị gộp và số bằng chứng là 5

### Requirement: R-IM16 Năm số đo cho mỗi ý con
Công cụ đếm ý con SHALL trả cho mỗi ý con, theo từng sàn (R-I06):
1. Số người viết khác nhau. Nguồn không có tên người viết thì đếm theo đánh giá và ghi «đếm theo đánh giá».
2. Độ rải: số sản phẩm, số gian hàng, và phần đến từ sản phẩm lớn nhất. Phần này từ 80% thì ý con mang cờ «chủ yếu từ một sản phẩm».
3. Phần lời cụ thể theo `specific_rule`.
4. Số lời gần trùng đã gộp (R-IM15).
5. Dồn thời gian: số lần nhắc lớn nhất trong 7 ngày liền. Từ 40% số lần nhắc và từ 5 lần nhắc thì ý con mang cờ «dồn thời gian».
Mỗi ý con SHALL có cờ đạt ngưỡng R-I33 (từ 5 người viết trên từ 3 sản phẩm). Công cụ SHALL NOT trả lời khách.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 31/10/2026 chủ duyệt đề xuất 5 số đo (F319, F322). Lần chạy thử trên canxi cho thấy nhiều ý con đến gần hết từ một sản phẩm.

#### Scenario: Ý con từ một sản phẩm
- **WHEN** 31 trong 36 lần nhắc một ý con đến từ một sản phẩm
- **THEN** ý con mang cờ «chủ yếu từ một sản phẩm»

#### Scenario: Dồn thời gian
- **WHEN** 6 trong 15 lần nhắc một ý con nằm trong 7 ngày liền
- **THEN** ý con mang cờ «dồn thời gian»

### Requirement: R-IM17 Đường bão hoà và phần «Khác»
Công cụ đếm ý con SHALL trả đường bão hoà: xếp đánh giá theo thứ tự ngẫu nhiên có hạt cố định, đếm số ý con đạt 3 lần nhắc sau mỗi 25 đánh giá, và vị trí ý con cuối cùng đạt 3 lần nhắc. Công cụ SHALL trả phần đánh giá có chủ đề mà không có ý con nào («Khác»). Khi phần «Khác» trên 20%, luật E15 SHALL áp dụng: thu thêm tối đa 1 vòng hoặc ghi rõ phần «Khác».

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Đường bão hoà cho câu kiểm 2 («mẫu đủ lớn?») một cách đo thật (F319).

#### Scenario: Phần «Khác» lớn
- **WHEN** 22% đánh giá có chủ đề Vị trên Shopee không có ý con nào
- **THEN** kết quả ghi phần «Khác» 22% và áp luật E15

### Requirement: R-IM18 Xếp ý con nói rõ thước đo
Báo cáo SHALL được xếp ý con trong một chủ đề theo số bằng chứng sau khi gộp (R-IM15), theo từng sàn. Câu xếp hạng SHALL nói rõ thước đo, mẫu và kỳ, theo L5b và E15. Ý con chung chung SHALL được tách khỏi bảng xếp hạng ý cụ thể. Ý con mang cờ «chủ yếu từ một sản phẩm» hoặc «dồn thời gian» SHALL hiện cờ ngay cạnh số.

- Loại kiểm: Mã
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Luật L4 cấm xếp hạng ngầm; E15 và L5b cho phép xếp khi nói rõ thước đo, mẫu và kỳ.

#### Scenario: Xếp hạng thiếu kỳ
- **WHEN** agent nộp câu «ý được nhắc nhiều nhất là xương chắc hơn» mà không có mẫu và kỳ
- **THEN** MCP từ chối câu đó

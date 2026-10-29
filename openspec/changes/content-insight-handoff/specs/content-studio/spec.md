## ADDED Requirements

### Requirement: R-C01 Câu insight có cấu trúc 9 trường
Mỗi câu insight mà Content Studio nhận SHALL có 9 trường:
1. Bước mua: Biết đến, Quan tâm, Muốn mua, Mua hoặc Sau mua.
2. Khách hàng: câu nói về ai.
3. Sự thật ngầm.
4. Động lực.
5. Xung đột: vế «nhưng».
6. Câu insight: câu đầy đủ, ngôi thứ ba.
7. 3C, tùy chọn: một dòng cho Khách, một dòng cho Thương hiệu, một dòng cho Ngành.
8. Bằng chứng: các dòng có số đếm, ghi riêng từng sàn.
9. Mức tin (Chắc, Khá, Yếu hoặc Không) và cờ Giả thuyết.

Mỗi câu SHALL thuộc đúng một bản báo cáo Insight. Dòng bằng chứng SHALL NOT chứa nguyên văn bình luận của khách (R-I11). Ở bản 1, câu insight SHALL chỉ đến từ dữ liệu giả trong kiểm thử. Bộ viết câu insight sau này SHALL ghi vào cùng chỗ lưu và theo cùng 9 trường.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn câu có cấu trúc (Q1), viết theo Sự thật ngầm – Động lực – Xung đột và kiểm bằng 3C (Q6), duyệt danh sách 9 trường (Q21), và chọn câu giả cho bản 1 (Q19) (F292).

#### Scenario: Thiếu vế Xung đột
- **WHEN** một câu insight không có trường Xung đột
- **THEN** app từ chối lưu câu đó

#### Scenario: Bằng chứng chứa nguyên văn bình luận
- **WHEN** một dòng bằng chứng chép nguyên văn bình luận của khách
- **THEN** app từ chối lưu câu đó

#### Scenario: Không có 3C
- **WHEN** một câu insight có đủ 8 trường bắt buộc nhưng để trống 3C
- **THEN** app vẫn lưu câu đó

### Requirement: R-C02 Chỉ báo cáo Insight đã duyệt
Chỉ bản báo cáo Insight có quyết định duyệt (APPROVED) SHALL hiện trong dropdown của Content Studio. Chỉ bản đó SHALL gửi được bằng «Gửi sang Content». Bản chưa duyệt hoặc bị từ chối SHALL NOT hiện và SHALL NOT gửi được. Khi một bản đã duyệt sau đó bị từ chối, bản đó SHALL biến khỏi dropdown và nút gửi.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn chỉ báo cáo đã duyệt (Q8) và viết: «if the report is not approve by human, then we not show it up or able to pass to content production stage» (Q25, F292).

#### Scenario: Bản chưa duyệt
- **WHEN** một bản báo cáo Insight chưa có quyết định duyệt
- **THEN** dropdown không hiện bản đó và trang báo cáo không có nút «Gửi sang Content» cho bản đó

#### Scenario: Bản bị từ chối sau khi duyệt
- **WHEN** chủ từ chối một bản đã duyệt trước đó
- **THEN** bản đó biến khỏi dropdown và nút gửi

### Requirement: R-C03 Kéo câu insight ở bước Insight
Ở bước Insight của chiến dịch, Content Studio SHALL có một dropdown các bản báo cáo theo R-C02, mới nhất ở trên. Nhãn mỗi bản SHALL là «<từ khóa> · <ngày đầu>–<ngày cuối của dữ liệu> · bản <số bản>», ví dụ «canxi · 21/10–22/10/26 · bản 2». Mã lần chạy SHALL chỉ hiện khi rê chuột. Khi người dùng chọn một bản, app SHALL hiện thẻ câu insight với bước mua, câu insight và mức tin. Người dùng SHALL chọn đúng một câu cho một chiến dịch. Thẻ mức Không SHALL bị ẩn. Câu mức Yếu hoặc mang cờ Giả thuyết SHALL giữ nhãn đó trong Content Studio.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ đề xuất dropdown tên báo cáo rồi tự điền (Q2), chọn một câu cho mỗi chiến dịch (Q12), ẩn mức Không và giữ nhãn Yếu, Giả thuyết (Q13), và chọn nhãn theo từ khóa, ngày, số bản (Q18) (F292).

#### Scenario: Câu mức Không bị ẩn
- **WHEN** bản báo cáo đã chọn có một câu mức Không
- **THEN** thẻ của câu đó không hiện

#### Scenario: Câu Giả thuyết giữ nhãn
- **WHEN** người dùng chọn một câu mang cờ Giả thuyết
- **THEN** bước Insight của chiến dịch hiện nhãn Giả thuyết bên cạnh câu đó

### Requirement: R-C04 Đẩy câu insight từ trang báo cáo
Trang danh sách báo cáo của lần chạy SHALL có nút «Gửi sang Content» cho bản báo cáo Insight theo R-C02. Người dùng SHALL chọn một câu, rồi chọn một chiến dịch có sẵn hoặc «Tạo chiến dịch mới». «Tạo chiến dịch mới» SHALL hỏi thương hiệu và tên chiến dịch. Đẩy và kéo SHALL cho cùng kết quả: một Insight nháp mà người dùng chốt trong Content Studio.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn có cả đẩy và kéo (Q3), nút ở trang báo cáo (Q9), và đẩy có ngay trong bản 1 (Q20) (F292).

#### Scenario: Đẩy sang chiến dịch mới
- **WHEN** người dùng bấm «Gửi sang Content», chọn một câu và chọn «Tạo chiến dịch mới»
- **THEN** app hỏi thương hiệu và tên, tạo chiến dịch, và chiến dịch có Insight nháp từ câu đó

### Requirement: R-C05 Cách điền ba ô và khung «Từ báo cáo»
Khi Content Studio nhận một câu insight, app SHALL điền ba ô:
- Khách hàng nhận trường Khách hàng.
- Nỗi đau nhận trường Xung đột.
- Insight nhận trường Câu insight.

Sự thật ngầm, Động lực, 3C, Bước mua, Bằng chứng và Mức tin SHALL hiện ở khung chỉ đọc «Từ báo cáo». AI viết Big Idea và Angle SHALL nhận cả các trường này làm đầu vào. Nguồn của Insight SHALL ghi là từ báo cáo Insight, kèm bản báo cáo và câu đã dùng, bên cạnh hai nguồn cũ là tự gõ và STP. Chiến dịch có Insight tự gõ SHALL NOT bị đổi.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn cách điền vào ba ô có sẵn, khung chỉ đọc, và đưa các trường thêm vào AI (Q11) (F292).

#### Scenario: Điền từ một câu
- **WHEN** người dùng chọn câu có Xung đột «Muốn uống đều, nhưng sợ táo bón»
- **THEN** ô Nỗi đau chứa câu đó và khung «Từ báo cáo» hiện Sự thật ngầm, Động lực và Bằng chứng của câu

### Requirement: R-C06 Insight đã có và luật chốt
Khi chiến dịch đã có Insight nháp, nhận câu mới SHALL thay nháp đó sau khi người dùng xác nhận. Khi Insight của chiến dịch đã chốt, app SHALL từ chối và hiện «Insight đã chốt, hãy tạo chiến dịch mới». Câu từ báo cáo SHALL chốt theo cùng luật với câu tự gõ. Luật D26 SHALL giữ nguyên: chiến dịch có liên kết sản phẩm cần B10 APPROVE mới chốt được Insight; chiến dịch không có liên kết thì không có cổng này.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn thay nháp sau khi xác nhận và từ chối khi đã chốt (Q24), và giữ D26 (Q14) (F292).

#### Scenario: Insight đã chốt
- **WHEN** người dùng gửi một câu sang chiến dịch có Insight đã chốt
- **THEN** app không đổi Insight và hiện «Insight đã chốt, hãy tạo chiến dịch mới»

#### Scenario: Insight nháp
- **WHEN** người dùng chọn một câu cho chiến dịch có Insight nháp
- **THEN** app hỏi xác nhận trước khi thay nháp

### Requirement: R-C07 Bản sao đóng băng, sửa được
Câu insight mà chiến dịch nhận SHALL là bản sao đóng băng. Bản sao SHALL NOT tự đổi khi báo cáo đổi. Người dùng SHALL sửa được ba ô. Ô đã sửa SHALL hiện «Đã sửa so với báo cáo», và app SHALL giữ bản gốc.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn bản sao đóng băng (Q4) và cho sửa có dấu vết (Q5) (F292). Caption đã có không bao giờ tự đổi (chủ, 25/09/2026).

#### Scenario: Sửa ô Insight
- **WHEN** người dùng sửa ô Insight sau khi nhận câu
- **THEN** ô hiện «Đã sửa so với báo cáo» và bản gốc vẫn xem được

### Requirement: R-C08 «Có bản Insight mới»
Chiến dịch SHALL hiện «Có bản Insight mới» khi cùng báo cáo có một bản đã duyệt mới hơn bản chiến dịch đã dùng. Cùng báo cáo nghĩa là cùng lần chạy và cùng loại Insight, với số bản lớn hơn. Cập nhật SHALL chỉ xảy ra khi người dùng bấm. Báo cáo khác có cùng từ khóa SHALL NOT tính là bản mới.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn chỉ báo bản mới của cùng báo cáo (Q22) và cập nhật bằng tay (Q4) (F292).

#### Scenario: Bản mới của cùng báo cáo
- **WHEN** chiến dịch dùng câu từ bản 2 và chủ duyệt bản 3 của cùng báo cáo
- **THEN** chiến dịch hiện «Có bản Insight mới» và ba ô không đổi

#### Scenario: Báo cáo khác cùng từ khóa
- **WHEN** một lần chạy khác với cùng từ khóa có bản được duyệt
- **THEN** chiến dịch không hiện «Có bản Insight mới»

### Requirement: R-C09 Trạng thái trống trên bản thật
Khi chưa có bản báo cáo nào theo R-C02 có câu insight, dropdown và nút «Gửi sang Content» SHALL vẫn hiện, kèm dòng «Chưa có báo cáo nào có câu insight».

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 29/10/2026 chủ chọn hiện trạng thái trống thay vì ẩn tính năng (Q23) (F292).

#### Scenario: Chưa có câu insight
- **WHEN** người dùng mở dropdown khi chưa có câu insight nào
- **THEN** dropdown hiện «Chưa có báo cáo nào có câu insight»

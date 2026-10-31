# content-studio Specification

## Purpose
Spec này giữ quy tắc của Content Studio khi nhận câu insight từ báo cáo Insight đã duyệt (R-C01 đến R-C07 và R-C09): câu insight 9 trường, chỉ bản đã duyệt, kéo ở bước Insight, đẩy từ trang báo cáo, cách điền ba ô, luật chốt, bản sao đóng băng và trạng thái trống. Nội dung lấy từ change content-insight-handoff (PR #427), đóng ngày 31/10/2026.

## Requirements

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
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q1 required business groups, stages, confidence and UUIDs reject without retention»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q2 optional 3C accepts absent/null/full and refuses partial/free text»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q4 numeric separate-platform evidence preserves missing N and rejects copied/free text»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q5 statement FK/kind, identity, exact retry and immutable storage»
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
Chỉ bản báo cáo Insight có quyết định duyệt (APPROVED) SHALL hiện trong dropdown của Content Studio. Chỉ bản đó SHALL gửi được bằng «Gửi sang Content». Bản chưa duyệt hoặc bị từ chối SHALL NOT hiện và SHALL NOT gửi được. Luật này SHALL đúng cả khi gọi thẳng API. Quyết định duyệt của một bản giữ nguyên như hôm nay: mỗi bản có một quyết định, không đổi được. Change này SHALL NOT thêm cách bỏ duyệt.

- Loại kiểm: Người đọc
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q13 R-C02 approved-only exact revision eligibility excludes pending/rejected/Market/empty»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q14 direct IDs cannot bypass undecided/rejected approval or spoof it in request»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q19 report rows expose send only for eligible exact INSIGHT revisions; opening/cancel writes nothing»
- Vì sao: Ngày 29/10/2026 chủ chọn chỉ báo cáo đã duyệt (Q8) và viết: «if the report is not approve by human, then we not show it up or able to pass to content production stage» (Q25, F292). Cùng ngày chủ chọn «Drop it for now»: không thêm cách bỏ duyệt một bản đã duyệt (F293).

#### Scenario: Bản chưa duyệt
- **WHEN** một bản báo cáo Insight chưa có quyết định duyệt
- **THEN** dropdown không hiện bản đó và trang báo cáo không có nút «Gửi sang Content» cho bản đó

#### Scenario: Bản bị từ chối
- **WHEN** một bản báo cáo Insight có quyết định từ chối
- **THEN** dropdown không hiện bản đó, và lời gọi API gửi câu của bản đó bị từ chối

### Requirement: R-C03 Kéo câu insight ở bước Insight
Ở bước Insight của chiến dịch, Content Studio SHALL có một dropdown các bản báo cáo theo R-C02, mới nhất ở trên. Nhãn mỗi bản SHALL là «<từ khóa> · <ngày đầu>–<ngày cuối của dữ liệu> · bản <số bản>», ví dụ «canxi · 21/10–22/10/26 · bản 2». Mã lần chạy SHALL chỉ hiện khi rê chuột. Khi người dùng chọn một bản, app SHALL hiện thẻ câu insight với bước mua, câu insight và mức tin. Người dùng SHALL chọn đúng một câu cho một chiến dịch. Thẻ mức Không SHALL bị ẩn. Câu mức Yếu hoặc mang cờ Giả thuyết SHALL giữ nhãn đó trong Content Studio.

- Loại kiểm: Người đọc
- Mã kiểm: `frontend/tests/content-insight-handoff.test.ts` «CIH-Q16 dropdown shows frozen dates/missing period and keeps run IDs only in hover titles»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q17 picker hides NONE, renders stages/confidence and applies exactly one selected card»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q18 read-only reference retains weak/hypothesis labels while unflagged twin does not»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q17 NONE is refused by handoff and general revision while WEAK remains selectable»
- Vì sao: Ngày 29/10/2026 chủ đề xuất dropdown tên báo cáo rồi tự điền (Q2), chọn một câu cho mỗi chiến dịch (Q12), ẩn mức Không và giữ nhãn Yếu, Giả thuyết (Q13), và chọn nhãn theo từ khóa, ngày, số bản (Q18) (F292).

#### Scenario: Câu mức Không bị ẩn
- **WHEN** bản báo cáo đã chọn có một câu mức Không
- **THEN** thẻ của câu đó không hiện

#### Scenario: Câu Giả thuyết giữ nhãn
- **WHEN** người dùng chọn một câu mang cờ Giả thuyết
- **THEN** bước Insight của chiến dịch hiện nhãn Giả thuyết bên cạnh câu đó

### Requirement: R-C04 Đẩy câu insight từ trang báo cáo
Trang danh sách báo cáo của lần chạy SHALL có nút «Gửi sang Content» cho bản báo cáo Insight theo R-C02. Người dùng SHALL chọn một câu, rồi chọn một chiến dịch có sẵn hoặc «Tạo chiến dịch mới». «Tạo chiến dịch mới» SHALL mở biểu mẫu tạo chiến dịch thường (thương hiệu, tên, mục tiêu, sản phẩm), với câu insight đã gắn sẵn. Luật tạo chiến dịch SHALL NOT đổi. Đẩy và kéo SHALL cho cùng kết quả: một Insight nháp mà người dùng chốt trong Content Studio.

- Loại kiểm: Người đọc
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q11 full campaign form is mandatory and create/handoff returns both receipts atomically»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q21 full-form new-campaign handoff rolls back a failure after campaign insert»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q21 new-campaign report attachment keeps the full form and cancel performs no write»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q20 push sends the same exact handoff and navigates to the campaign Insight»
- Vì sao: Ngày 29/10/2026 chủ chọn có cả đẩy và kéo (Q3), nút ở trang báo cáo (Q9), và đẩy có ngay trong bản 1 (Q20) (F292). Cùng ngày chủ chọn «Full form»: chiến dịch mới dùng biểu mẫu đầy đủ như hôm nay (F293).

#### Scenario: Đẩy sang chiến dịch mới
- **WHEN** người dùng bấm «Gửi sang Content», chọn một câu và chọn «Tạo chiến dịch mới»
- **THEN** app mở biểu mẫu tạo chiến dịch đầy đủ; sau khi lưu, chiến dịch có Insight nháp từ câu đó

#### Scenario: Bỏ dở biểu mẫu
- **WHEN** người dùng đóng biểu mẫu mà không lưu
- **THEN** app không tạo chiến dịch và không lưu Insight nào

### Requirement: R-C05 Cách điền ba ô và khung «Từ báo cáo»
Khi Content Studio nhận một câu insight, app SHALL điền ba ô:
- Khách hàng nhận trường Khách hàng.
- Nỗi đau nhận trường Xung đột.
- Insight nhận trường Câu insight.

Sự thật ngầm, Động lực, 3C, Bước mua, Bằng chứng và Mức tin SHALL hiện ở khung chỉ đọc «Từ báo cáo». AI viết Big Idea và Angle SHALL nhận cả các trường này làm đầu vào. Nguồn của Insight SHALL ghi là từ báo cáo Insight, kèm bản báo cáo và câu đã dùng, bên cạnh hai nguồn cũ là tự gõ và STP. Chiến dịch có Insight tự gõ SHALL NOT bị đổi.

- Loại kiểm: Người đọc
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q22 R-C05 maps customer/conflict/full insight distinctly and freezes all nine groups»; `tests/integration/content-insight-handoff-generation.test.ts` «CIH-Q23 / R-C07 locked report snapshot reaches actual fake-gateway Big Idea/Angle inputs with unchanged prompt bytes»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q22 reference displays all extra groups, exact source IDs and separate evidence without fabricated N»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q28 TYPED edits/replay remain unchanged while discovery cannot convert the source»
- Vì sao: Ngày 29/10/2026 chủ chọn cách điền vào ba ô có sẵn, khung chỉ đọc, và đưa các trường thêm vào AI (Q11) (F292).

#### Scenario: Điền từ một câu
- **WHEN** người dùng chọn câu có Xung đột «Muốn uống đều, nhưng sợ táo bón»
- **THEN** ô Nỗi đau chứa câu đó và khung «Từ báo cáo» hiện Sự thật ngầm, Động lực và Bằng chứng của câu

### Requirement: R-C06 Insight đã có và luật chốt
Khi chiến dịch đã có Insight nháp, nhận câu mới SHALL thay nháp đó sau khi người dùng xác nhận. Khi Insight của chiến dịch đã chốt, app SHALL từ chối và hiện «Insight đã chốt, hãy tạo chiến dịch mới». Câu từ báo cáo SHALL chốt theo cùng luật với câu tự gõ. Luật D26 SHALL giữ nguyên: chiến dịch có liên kết sản phẩm cần B10 APPROVE mới chốt được Insight; chiến dịch không có liên kết thì không có cổng này.

- Loại kiểm: Người đọc
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q24 saved drafts require confirmation and append rather than overwrite»; `tests/integration/content-insight-handoff.test.ts` «CIH-Q25 R-C06 locked handoffs and general-route bypass return exact 409 without mutation»; `tests/integration/content-insight-handoff-generation.test.ts` «CIH-Q26 report approval cannot substitute for real B10 product clearance»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q25 locked Insight disables the picker and stale submit shows the exact server refusal»
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
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q29 each editable field appends with the original snapshot and rejects source edits»; `tests/integration/content-insight-handoff-generation.test.ts` «CIH-Q23 / R-C07 locked report snapshot reaches actual fake-gateway Big Idea/Angle inputs with unchanged prompt bytes»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q29 edited labels track each field and disappear only when that field reverts»
- Vì sao: Ngày 29/10/2026 chủ chọn bản sao đóng băng (Q4) và cho sửa có dấu vết (Q5) (F292). Caption đã có không bao giờ tự đổi (chủ, 25/09/2026).

#### Scenario: Sửa ô Insight
- **WHEN** người dùng sửa ô Insight sau khi nhận câu
- **THEN** ô hiện «Đã sửa so với báo cáo» và bản gốc vẫn xem được

### Requirement: R-C09 Trạng thái trống trên bản thật
Khi chưa có bản báo cáo nào theo R-C02 có câu insight, dropdown và nút «Gửi sang Content» SHALL vẫn hiện, kèm dòng «Chưa có báo cáo nào có câu insight».

- Loại kiểm: Người đọc
- Mã kiểm: `tests/integration/content-insight-handoff.test.ts` «CIH-Q33 empty, approved-zero and rejected-only APIs return true empty lists; eligible twin appears»; `frontend/tests/content-insight-handoff.test.ts` «CIH-Q33 empty feature stays visible/disabled and connection errors never claim an empty list»
- Vì sao: Ngày 29/10/2026 chủ chọn hiện trạng thái trống thay vì ẩn tính năng (Q23) (F292).

#### Scenario: Chưa có câu insight
- **WHEN** người dùng mở dropdown khi chưa có câu insight nào
- **THEN** dropdown hiện «Chưa có báo cáo nào có câu insight»

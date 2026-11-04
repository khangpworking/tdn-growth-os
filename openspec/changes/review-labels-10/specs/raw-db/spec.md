## ADDED Requirements

### Requirement: R-RV01 Bộ 10 nhãn chung
Tệp bộ nhãn SHALL là bản `2026-11-04.1` với đúng 10 nhãn `core`, `blocks` rỗng và trạng thái `DRAFT`. Lượt gán nhãn SHALL hỏi đúng 10 câu cho mọi đánh giá. App SHALL NOT dùng từ khoá hay danh mục để chọn thêm câu hỏi.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F439, F441, F442: ít nhãn, dùng cho mọi sản phẩm.

#### Scenario: Câu hỏi cho mọi sản phẩm
- **WHEN** một lần chạy có từ khoá hoặc danh mục bất kỳ
- **THEN** yêu cầu gửi Jev có đúng 10 câu theo thứ tự trong tệp và `block_key` của dòng ghi ra là null

#### Scenario: Nhãn hậu cần vẫn bị từ chối
- **WHEN** tệp bộ nhãn có `T-GIAOHANG`, `T-DONGGOI` hoặc `T-DICHVU`
- **THEN** app và MCP đều từ chối tệp đó

### Requirement: R-RV02 Nội dung Jev đọc khi gán nhãn
Mỗi câu SHALL có `state` đúng khuôn `Sản phẩm đang được đánh giá: <tên hoặc «không rõ»>`, xuống dòng, `Lời viết: <lời đã cắt khoảng trắng hai đầu hoặc «(trống)»>`, xuống dòng, `Các mục khách điền, gồm tên mục và câu trả lời: <các mục nối bằng «; » hoặc «(trống)»>`. `instructions` SHALL là `guide` của tệp, hai lần xuống dòng, `<mã> <tên>. Tính khi: <tính khi>. Không tính khi: <không tính khi>.`, xuống dòng, `Nội dung có nhắc đến chủ đề này không, và thuộc lựa chọn nào?`. `state` SHALL NOT có sàn, số sao, nhóm hàng hoặc bản bộ nhãn. `text_sha256` SHALL vẫn tính trên lời gán nhãn cũ (`text` rồi mỗi mục với hai dấu cách đứng trước), để MCP kiểm được lời.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Đây là nội dung đã thử bằng Jev (F440, F441). Dòng nhóm hàng cũ ghi sai cho serum.

#### Scenario: Có lời và mục khách điền
- **WHEN** đánh giá có `text` là ` Tốt ` và `attributes_json` là `["Công dụng: ok","Mùi: nhẹ"]`
- **THEN** `state` có `Lời viết: Tốt` và `Công dụng: ok; Mùi: nhẹ`, còn `text_sha256` vẫn tính trên ` Tốt   Công dụng: ok  Mùi: nhẹ`

### Requirement: R-RV03 Lựa chọn theo từng nhãn
Nhãn có `options` SHALL dùng các lựa chọn đó; nhãn không có SHALL dùng `options` chung của tệp. Mỗi bộ lựa chọn SHALL có `KHONG_NHAC`. Mỗi lựa chọn khác `KHONG_NHAC` và `CHUA_DANHGIA` SHALL có `polarity` thuộc `khen`, `che`, `ke`, `khong_ro_huong`. Câu trả lời SHALL có đúng các lựa chọn của câu đó; sai thì lần gọi lỗi `JEV_THEME_INVALID`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: `T-PHANUNG`, `T-NHUCAU`, `T-CHONMUA` cần giữ chi tiết mà không thêm câu hỏi (F439).

#### Scenario: Lựa chọn riêng
- **WHEN** Jev trả lời câu `T-PHANUNG` với 6 lựa chọn của bộ chung
- **THEN** lần gọi lỗi `JEV_THEME_INVALID` và không ghi dòng nào cho đánh giá đó

### Requirement: R-RV04 Cách tính nhãn
`p_yes` SHALL là tổng xác suất mọi lựa chọn trừ `KHONG_NHAC` và `CHUA_DANHGIA`, làm tròn 9 chữ số. Dưới ngưỡng `unclear` thì không có nhãn; từ ngưỡng `keep` là `kept`; còn lại là `unclear`. Lựa chọn lớn nhất trong các lựa chọn được tính, bằng nhau thì lấy lựa chọn đứng trước, SHALL quyết định `polarity` và `choice` khi đạt ngưỡng `direction`. Dưới ngưỡng đó `polarity` là `khong_ro_huong` và `choice` là null.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Lần thử cho thấy tính `CHUA_DANHGIA` là «có nhắc» làm «Chx dùng nên chx bt» có nhãn ở nhiều chủ đề.

#### Scenario: Chưa dùng, chưa biết
- **WHEN** câu `T-GIA` có `CHUA_DANHGIA` 0,92, `KHONG_NHAC` 0,05, các lựa chọn còn lại tổng 0,03
- **THEN** không có dòng `T-GIA`

#### Scenario: Có cả khen và chê
- **WHEN** câu `T-CONGDUNG` có `HAI` 0,80
- **THEN** dòng có `status` `kept`, `polarity` `khong_ro_huong`, `choice` `HAI`

#### Scenario: Lựa chọn riêng thành dòng
- **WHEN** câu `T-NHUCAU` có `QUA_TANG` 0,75
- **THEN** dòng có `status` `kept`, `polarity` `ke`, `choice` `QUA_TANG`

### Requirement: R-RV05 Ghi nhận «chưa đánh giá được»
Với nhãn `waitTheme` của tệp (`T-CONGDUNG`), khi `p_yes` dưới ngưỡng `unclear` và `CHUA_DANHGIA` đạt ngưỡng `direction`, app SHALL ghi một dòng `status` `unclear`, `polarity` `khong_ro_huong`, `choice` `CHUA_DANHGIA`, `confidence` là xác suất `CHUA_DANHGIA`. Dòng này SHALL NOT được đếm. Nhãn khác SHALL NOT có dòng như vậy. Đánh giá chỉ có dòng này SHALL NOT có thêm dòng `NO_THEME`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Khoảng 22% đánh giá nói chưa dùng hoặc chưa biết kết quả. Đây là thông tin nên giữ, nhưng không phải kết quả.

#### Scenario: Chờ đánh giá
- **WHEN** câu `T-CONGDUNG` có `CHUA_DANHGIA` 0,90 và mọi câu khác không đạt ngưỡng
- **THEN** có đúng một dòng `T-CONGDUNG`, `unclear`, `choice` `CHUA_DANHGIA`, và không có dòng `NO_THEME`

### Requirement: R-RV06 Câu hỏi lọc mới
Policy lọc SHALL là `2026-11-04.2`, với nguyên văn câu hỏi và `state` trong hợp đồng. `p_complaint` SHALL là `CO` + `RIENG` của câu `CHE`. Luật quyết định và ngưỡng SHALL không đổi. Lời viết chỉ gồm khoảng trắng, ký tự điều khiển và dấu câu SHALL coi là trống; ký hiệu và emoji SHALL coi là có nội dung. Dòng của policy cũ SHALL giữ nguyên.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Lần thử: 13 dòng treo «Chưa rõ» được giữ, không loại nhầm dòng nào trong các dòng đã chạy bằng câu cuối, vẫn loại 18 dòng rác đã biết.

#### Scenario: Chỉ có dấu câu
- **WHEN** lời viết là `.` và không có mục khách điền
- **THEN** kết quả là `NO_CONTENT` và không gọi Jev

#### Scenario: Emoji
- **WHEN** lời viết là `👍`
- **THEN** app gọi Jev

#### Scenario: Chốt an toàn
- **WHEN** `LOAI` là 0,80, 5 sao, `CO` 0,30 và `RIENG` 0,25
- **THEN** kết quả là `UNRESOLVED` với lý do `GUARD_COMPLAINT`

### Requirement: R-RV07 Nhãn cũ giữ nguyên và MCP không lỗi
Migration 0073 SHALL thêm cột `review_code.choice` có thể null, giữ mọi dòng và trigger cấm sửa, cấm xoá. MCP SHALL nhận tệp bộ nhãn cũ và mới. Khi app chưa có dòng `codebook` của bản hiện tại và không có dòng nhãn nào của bản đó, MCP SHALL coi lần chạy là chưa gán nhãn và SHALL NOT báo `APP_CODEBOOK_MISMATCH`. Khi dòng `codebook` có dấu khác, hoặc có nhãn mà thiếu dòng `codebook`, MCP SHALL vẫn báo `APP_CODEBOOK_MISMATCH`.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F442 không gán lại nhãn cũ. Nếu không sửa, mọi lần dựng kho của MCP sẽ lỗi ngay sau khi deploy.

#### Scenario: Nâng cấp cơ sở dữ liệu
- **WHEN** cơ sở dữ liệu ở bản 72 có dòng `review_code` và chạy migration 0073
- **THEN** mọi dòng giữ nguyên, `choice` là null, phiên bản migration là 73, và UPDATE, DELETE vẫn bị chặn

#### Scenario: Sau deploy, chưa có nhãn mới
- **WHEN** ảnh chụp app chỉ có dòng `codebook` và nhãn của bản `2026-10-30.4`
- **THEN** `build_warehouse` chạy được, không có nhãn nào được đếm, và kết quả ghi chú «chưa gán nhãn»

#### Scenario: Bộ nhãn lệch
- **WHEN** dòng `codebook` của bản hiện tại có `definition_sha256` khác tệp trong repo
- **THEN** MCP báo `APP_CODEBOOK_MISMATCH`

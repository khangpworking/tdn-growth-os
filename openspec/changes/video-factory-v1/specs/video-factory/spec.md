## ADDED Requirements

### Requirement: R-V01 Máy làm video tự động, 9:16, tiếng Việt trước
Video Factory SHALL là máy làm video tự động (automation creator), SHALL NOT là trình dựng tay: không có khung thời gian, không kéo-thả, không cắt ghép tay. Video Factory SHALL làm video dọc 9:16 và lời đọc tiếng Việt trước. Video SHALL bắt đầu từ một chủ đề tự do hoặc từ một Angle của chiến dịch. Việc gắn thương hiệu SHALL là tùy chọn; không có thương hiệu thì không có logo, trừ khi chủ tải logo riêng cho video đó.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt toàn bộ §1 brief 054 ngày 01/10/2026 (mục đích, định dạng, ngôn ngữ, điểm vào). Ngày 25/10/2026 chủ đổi tên thành Video Factory (F172).

#### Scenario: Không có khung dựng tay
- **WHEN** chủ mở màn hình một video đang chạy
- **THEN** chủ chỉ chỉnh sửa theo cài đặt và chọn của mình, không thao tác trên dòng thời gian

#### Scenario: Video của Angle chiến dịch
- **WHEN** chủ tạo video từ một Angle đã duyệt
- **THEN** script dùng Big Idea, Angle, mục đích và sự thật sản phẩm của chiến dịch đó

### Requirement: R-V02 Ba điểm duyệt và công tắc «Bỏ qua duyệt»
Mỗi video SHALL đi qua ba điểm duyệt: sau script, sau khi chọn cảnh, và ở video cuối. Ba điểm duyệt SHALL bật mặc định. Mỗi video SHALL có một công tắc «Bỏ qua duyệt» chỉ áp dụng cho video đó. Khi «Bỏ qua duyệt» bật, các bước xử lý tiếp theo chạy không chờ chủ. Mỗi yêu cầu viết lại mà chủ gửi SHALL luôn dừng ở điểm duyệt 1, dù công tắc «Bỏ qua duyệt» đang bật hay tắt (quyết định 9 của script vs setup).

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt ba điểm duyệt, công tắc và hàng loạt (batch) ngày 01/10/2026 (§1). Ngày 01/10/2026 chủ duyệt cách chạy «script vs setup»: viết lại luôn dừng ở duyệt 1. Ngày 25/10/2026 chủ duyệt hàng loạt + «Bỏ qua duyệt» thành lát 3 (F179).

#### Scenario: Bỏ duyệt cho một video
- **WHEN** chủ bật «Bỏ qua duyệt» cho video trước khi xử lý chạy tiếp
- **THEN** các bước sau điểm duyệt hiện tại chạy tiếp mà không chờ chủ

#### Scenario: Viết lại vẫn dừng ở duyệt 1
- **WHEN** chủ yêu cầu «Viết lại bằng AI» trong khi công tắc «Bỏ qua duyệt» đang bật
- **THEN** bản viết lại mới vẫn dừng ở điểm duyệt 1 để chủ đọc

### Requirement: R-V03 Kiểm an toàn lời đọc không bao giờ bị bỏ qua
Mỗi video SHALL chạy một kiểm an toàn lời đọc (trên câu tiếng Việt của script) trước khi dựng. Kiểm tra SHALL xét: tuyên bố về sức khỏe, tuyên bố pháp lý, và sự thật thương hiệu. Kiểm tra này là kiểm an toàn, không phải điểm duyệt, nên công tắc «Bỏ qua duyệt» SHALL NOT được phép bỏ qua nó. Video vi phạm SHALL dừng lại để chủ xem.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt kế hoạch đơn giản nhất ngày 25/10/2026 (F178), với luật «Bỏ qua duyệt» không ra mắt thiếu kiểm an toàn lời đọc (lát 3).

#### Scenario: Lô bỏ duyệt vẫn kiểm lời đọc
- **WHEN** một video trong lô «Bỏ qua duyệt» có câu tuyên bố tác dụng phụ ngoài giấy phép
- **THEN** video đó dừng lại vì kiểm an toàn, dù công tắc «Bỏ qua duyệt» đang bật

#### Scenario: Lời đọc sạch
- **WHEN** lời đọc không có tuyên bố sức khỏe, pháp lý hay sự thật thương hiệu nào sai
- **THEN** kiểm an toàn cho qua và video chạy tiếp

### Requirement: R-V04 Thứ tự nguồn clip: thư viện → stock → AI
Khi tìm clip cho một cảnh, app SHALL thử nguồn theo thứ tự: clip thư viện của mình trước, rồi stock (Pexels, Pixabay), rồi tạo bằng AI. Ở v1, chức năng tạo clip bằng AI SHALL chỉ là nút mờ «Tạo bằng AI — sắp có», không chạy.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt thứ tự nguồn và điểm cắm của tạo clip AI ngày 01/10/2026 (§1).

#### Scenario: Thư viện đủ trước
- **WHEN** một cảnh tìm thấy clip phù hợp trong thư viện
- **THEN** cảnh dùng clip thư viện đó trước khi thử stock hay AI

#### Scenario: Nút tạo AI nằm mờ
- **WHEN** chủ xem màn hình chọn cảnh trong v1
- **THEN** nút «Tạo bằng AI — sắp có» hiện mờ và không bấm được

### Requirement: R-V05 Clip stock kèm nguồn và giấy phép
Một clip stock được dùng SHALL được thêm vào thư viện kèm nguồn và giấy phép. Một kết quả stock không có giấy phép SHALL bị từ chối, SHALL NOT nhập vào thư viện và SHALL NOT dùng cho cảnh.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt nhập clip stock kèm nguồn và giấy phép ngày 01/10/2026 (§1).

#### Scenario: Clip stock đủ giấy phép
- **WHEN** chủ chọn một clip stock từ Pexels mà có nguồn và giấy phép ghi sẵn
- **THEN** clip đó vào thư viện kèm nguồn và giấy phép

#### Scenario: Không có giấy phép
- **WHEN** một kết quả stock không trả về giấy phép
- **THEN** clip đó bị từ chối và không nhập vào thư viện

### Requirement: R-V06 Clip AI ở riêng từng project
Clip do AI tạo SHALL ở trong project tạo ra nó. Clip AI SHALL NOT vào thư viện chung.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt «clip AI tạo trong project riêng, không vào thư viện» ngày 01/10/2026 (§1).

#### Scenario: Cảnh dùng clip AI
- **WHEN** một cảnh dùng clip do AI tạo
- **THEN** clip đó ở trong project hiện tại và không vào thư viện chung

#### Scenario: Tìm clip AI trong thư viện
- **WHEN** chủ tìm trong thư viện clip
- **THEN** không có clip AI nào hiện ra; clip AI chỉ hiện trong video đã dùng nó

### Requirement: R-V07 Mỗi clip là Tổng hợp hoặc của một thương hiệu
Mỗi clip SHALL là chung (Tổng hợp) hoặc thuộc đúng một thương hiệu. Clip của một thương hiệu SHALL chỉ xuất hiện trong video của thương hiệu đó.

- Loại kiểm: Người đọc; Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt bộ sưu tập theo thương hiệu ngày 01/10/2026 (§1).

#### Scenario: Clip thương hiệu nằm trong đúng video của mình
- **WHEN** một clip thuộc thương hiệu A
- **THEN** clip đó chỉ được chọn cho video của thương hiệu A

#### Scenario: Ca đối chứng âm
- **WHEN** app gợi ý 3 clip cho một cảnh của video thương hiệu B
- **THEN** không có clip nào của riêng thương hiệu A trong gợi ý đó

### Requirement: R-V08 File gốc nguyên trạng; thư mục nhúng chỉ sao chép
App SHALL NOT đổi tập tin clip gốc bất kỳ lúc nào. Quét thư mục nhúng SHALL sao chép tập tin vào app, SHALL NOT dời hay xóa tập tin gốc. Một tập tin đã nhập trước đó (cùng vân tay) SHALL bị bỏ qua khi quét lại.

- Loại kiểm: Người đọc; Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt «file gốc không đổi» ngày 01/10/2026 (§1). Ngày 25/10/2026 chủ duyệt phần cắt 10 của kế hoạch: sao chép, không đụng nguồn, bỏ qua file trùng (F178).

#### Scenario: Quét thư mục nhúng
- **WHEN** app quét thư mục nhúng và tập tin mới
- **THEN** tập tin được sao chép vào thư viện; tập tin trên thư mục vẫn ở chỗ cũ, nguyên trạng

#### Scenario: Quét lại lần hai
- **WHEN** app quét tiếp một tập tin có cùng vân tay với tập tin đã nhập trước đó
- **THEN** app bỏ qua tập tin đó và không tạo bản sao nữa

#### Scenario: Ca đối chứng âm
- **WHEN** kiểm thử nhập clip từ thư mục nhúng rồi so vân tay tập tin gốc trước và sau
- **THEN** vân tay gốc không đổi và tập tin gốc vẫn tồn tại

### Requirement: R-V09 Nhạc cần giấy phép đã ghi
Mỗi bài nhạc trong thư viện SHALL có giấy phép đã ghi vào app. Bài không có giấy phép SHALL NOT dùng cho video.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt «chỉ dùng nhạc có giấy phép» ngày 01/10/2026 (§1).

#### Scenario: Bài nhạc thiếu giấy phép
- **WHEN** một bài nhạc không nhập giấy phép nhưng được chọn làm nhạc nền
- **THEN** app không cho chọn và hiện lý do cần giấy phép

### Requirement: R-V10 Hiện con số trước mọi lời gọi trả phí
Trước khi chạy một lời gọi trả phí, app SHALL hiện số lời gọi sẽ chạy. Gemini SHALL chỉ đọc clip khi chủ bấm «Phân tích n clip (n lượt Gemini)»; clip chưa phân tích SHALL hiện «Chưa phân tích». Một lô hàng SHALL hiện một con số gộp của mọi lời gọi trả phí trước khi lô bắt đầu. App SHALL NOT tự chạy lại lời gọi lỗi; chủ SHALL bấm «Thử lại».

- Loại kiểm: Người đọc; Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ quyết định O2 «agree, wait for a click» (F176). Chủ duyệt «mỗi thao tác hiện số lượt trước khi chạy, không tự chạy lại» ngày 01/10/2026 (§1); luật «một lô hiện một con số gộp» theo kế hoạch lát 3 (F178).

#### Scenario: Bấm phân tích
- **WHEN** chủ bấm «Phân tích 4 clip (4 lượt Gemini)»
- **THEN** app đọc đúng 4 clip và ghi lại 4 lời gọi

#### Scenario: Clip chưa bấm thì chưa phân tích
- **WHEN** một clip vừa nhập từ thư mục nhúng
- **THEN** clip hiện «Chưa phân tích» và chưa có lời gọi Gemini nào chạy cho nó

#### Scenario: Ca đối chứng âm, không tự chạy lại
- **WHEN** một lời gọi Gemini hỏng vì quá thời gian
- **THEN** app không gửi lại lời gọi; lời gọi lỗi đợi chủ bấm «Thử lại»

### Requirement: R-V11 Không tự chuyển nhà cung cấp hay tài khoản
App SHALL NOT tự chuyển sang nhà cung cấp hay tài khoản khác khi một đường hỏng. Chủ MAY chọn nhà cung cấp khác bằng tay.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt «một dịch vụ hỏng không bao giờ lặng lẽ đổ sang dịch vụ khác» ngày 01/10/2026 (§1); câu chữ được chỉnh theo rà soát EGM: chủ chọn tay, hệ thống không tự chuyển.

#### Scenario: Giọng đọc lỗi
- **WHEN** lời gọi giọng đọc thất bại
- **THEN** app không tự gọi nhà cung cấp giọng khác; chủ có thể tự chọn đổi nhà cung cấp

### Requirement: R-V12 Cảnh không có clip phù hợp
Một cảnh không tìm được clip phù hợp SHALL hiện «Chưa có cảnh phù hợp». Khi duyệt bật, video SHALL chặn việc đi qua điểm duyệt 2 cho đến khi cảnh đó có clip hoặc chủ bỏ cảnh. Khi «Bỏ qua duyệt» bật, video SHALL thất bại với một thông báo rõ nói tên cảnh thiếu clip. App SHALL NOT dựng video có khung đen thay cho cảnh thiếu.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt cảnh «Chưa có cảnh phù hợp» ngày 01/10/2026 (§1); luật «thất bại kèm thông báo rõ, không bao giờ khung đen» theo rà soát EGM và kế hoạch lát 2–3 (F178).

#### Scenario: Duyệt bật, cảnh rỗng
- **WHEN** một cảnh không có clip và công tắc «Bỏ qua duyệt» đang tắt
- **THEN** video dừng ở duyệt 2 và cảnh hiện «Chưa có cảnh phù hợp»

#### Scenario: Duyệt bỏ, cảnh rỗng
- **WHEN** một cảnh không có clip và công tắc «Bỏ qua duyệt» đang bật
- **THEN** video thất bại kèm thông báo rõ về cảnh thiếu, không ra tập tin có khung đen

### Requirement: R-V13 Mỗi lần dựng giữ bản chụp cài đặt
Mỗi video khi dựng xong SHALL nhớ nguyên bản sao cài đặt (preset và các mục đè) dùng cho lần dựng đó. Đổi preset SHALL NOT đổi một video đã có. Sau khi cài đặt tương ứng đổi, app SHALL đánh dấu video đó «Cần dựng lại».

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ duyệt phần cắt 5 của kế hoạch: mỗi lần dựng chụp nguyên bản cài đặt, thay cho bảng phiên preset (F178).

#### Scenario: Đổi preset
- **WHEN** chủ đổi một preset mà có một video đã dựng
- **THEN** video đã dựng giữ nguyên cài đặt cũ và không đổi; app chỉ đánh dấu nó «Cần dựng lại»

### Requirement: R-V14 Cô lập lỗi và khởi động lại
Một lỗi của ffmpeg hay một dịch vụ ngoài (sụp, chậm quá giới hạn thời gian) SHALL chỉ làm job liên quan đó thất bại. App SHALL tiếp tục chạy. Sau khi app khởi động lại, job đang chạy SHALL hiện là gián đoạn và SHALL NOT tự chạy lại.

- Loại kiểm: Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ chọn phương án A kèm bốn lớp bảo vệ và chấp nhận rủi ro lỗi của chính mã Video Factory khởi động lại app (F176, F177, O1).

#### Scenario: ffmpeg sập giữa lần dựng
- **WHEN** tiến trình ffmpeg con sập giữa lần dựng trong khi app vẫn chạy
- **THEN** chỉ video đó thất bại kèm lỗi rõ và app vẫn chạy

#### Scenario: Dịch vụ ngoài chậm
- **WHEN** một nhà cung cấp vượt quá giới hạn thời gian gọi của nó
- **THEN** chỉ job chờ nó thất bại; các job khác và app vẫn sống

#### Scenario: Khởi động lại khi đang chạy
- **WHEN** app khởi động lại khi một job video đang chạy
- **THEN** job đó hiện là gián đoạn và app không tự chạy lại

### Requirement: R-V15 Sửa script làm chọn lại clip
Khi chủ sửa script (lát 1–2), app SHALL chọn lại clip cho các cảnh bị thay đổi và SHALL dựng lại giọng đọc, rồi dựng lại video. Chức năng giữ lựa chọn clip cũ chỉ có từ lát 3 (đơn giản hóa 2, F179).

- Loại kiểm: Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt «viết lại là chọn lại clip cho tới lát 3» ngày 01/10/2026 (script vs setup, quyết định 8) và ngày 25/10/2026 (F179).

#### Scenario: Chỉnh câu của một cảnh
- **WHEN** chủ đổi câu tiếng Việt của một cảnh rồi duyệt script
- **THEN** app chọn lại clip cho cảnh đó và dựng lại toàn bộ giọng đọc và video

#### Scenario: Đổi cài đặt đổi chữ
- **WHEN** chủ đổi một thứ thuộc nhóm «đổi chữ» (chủ đề, Angle, thương hiệu, giọng văn, hook, độ dài)
- **THEN** app cho phép «Viết lại theo cài đặt mới» và bản viết lại dừng ở duyệt 1

### Requirement: R-V16 Xóa là Ẩn, có Khôi phục
Xóa một clip, bài nhạc hay video SHALL là «Ẩn» (hide). Bị ẩn SHALL có «Khôi phục» (restore). V1 SHALL NOT tự xóa tập tin.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ duyệt đơn giản hóa 3: xóa là ẩn, không tự dọn (F179).

#### Scenario: Ẩn rồi khôi phục
- **WHEN** chủ bấm xóa một clip rồi vào danh sách đã xóa
- **THEN** clip hiện ẩn và chủ bấm «Khôi phục» là về lại đúng tình trạng cũ

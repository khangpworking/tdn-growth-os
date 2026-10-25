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
- **WHEN** chủ tạo video từ một Angle của chiến dịch
- **THEN** script dùng Big Idea, Angle, mục đích và sự thật sản phẩm của chiến dịch đó

### Requirement: R-V02 Ba điểm duyệt và công tắc «Bỏ qua duyệt»
Mỗi video SHALL đi qua ba điểm duyệt: duyệt 1 (sau script), duyệt 2 (sau khi chọn cảnh), duyệt 3 (video cuối). Ba điểm duyệt SHALL bật mặc định. Từ lát 3, mỗi video SHALL có một công tắc «Bỏ qua duyệt» chỉ áp dụng cho video đó. Đổi công tắc SHALL áp dụng khi xử lý bắt đầu lần tiếp theo, SHALL NOT tự tiếp tục video đang dừng. Khi chủ bắt đầu xử lý với công tắc bật, các điểm duyệt tiếp theo SHALL không chờ chủ. Mỗi yêu cầu viết lại mà chủ gửi SHALL luôn dừng ở duyệt 1, dù công tắc đang bật hay tắt.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt ba điểm duyệt, công tắc và hàng loạt (batch) ngày 01/10/2026 (§1), cùng cách chạy «script vs setup» (quyết định 9 trong script-vs-setup-decision.md, chủ duyệt dựng 01/10/2026). Kế hoạch ngày 25/10/2026 đặt batch và bỏ duyệt ở lát 3 (F178); F179 chỉ duyệt bốn đơn giản hóa.

#### Scenario: Bỏ duyệt cho một video
- **WHEN** chủ bật «Bỏ qua duyệt» rồi chủ động bắt đầu xử lý tiếp
- **THEN** các bước tiếp theo chạy không chờ chủ, trừ yêu cầu viết lại và kiểm an toàn lời đọc

#### Scenario: Đổi công tắc khi đang dừng
- **WHEN** chủ chỉ bật «Bỏ qua duyệt» khi video đang đợi duyệt
- **THEN** video vẫn dừng cho tới khi chủ bắt đầu xử lý tiếp

#### Scenario: Viết lại vẫn dừng ở duyệt 1
- **WHEN** chủ yêu cầu «Viết lại bằng AI» trong khi công tắc «Bỏ qua duyệt» đang bật
- **THEN** bản viết lại mới vẫn dừng ở điểm duyệt 1 để chủ đọc

### Requirement: R-V03 Kiểm an toàn lời đọc không bao giờ bị bỏ qua
Từ lát 3, mỗi video SHALL chạy một kiểm an toàn lời đọc (trên câu tiếng Việt của script) trước khi dựng. Kiểm tra SHALL xét: tuyên bố về sức khỏe, tuyên bố pháp lý, và sự thật thương hiệu. Kiểm tra này là kiểm an toàn, không phải điểm duyệt, nên công tắc «Bỏ qua duyệt» SHALL NOT được phép bỏ qua nó. Video vi phạm SHALL dừng lại để chủ xem. Cho tới lát 3, kiểm tra tự động chưa tồn tại (F183): phép kiểm duy nhất là duyệt của chủ ở duyệt 1 và duyệt 3, «Bỏ qua duyệt» chưa tồn tại, và video làm ra ở lát 1–2 SHALL mang nhãn «Chưa kiểm lời đọc».

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt kế hoạch đơn giản nhất ngày 25/10/2026 (F178), với luật «Bỏ qua duyệt» không ra mắt thiếu kiểm an toàn lời đọc (lát 3). Ngày 25/10/2026 (F183) chủ xác nhận video lát 1–2 mang nhãn «Chưa kiểm lời đọc». Phần sự thật thương hiệu đặt trên `brandFactCheck`; cách ghi nhận sức khỏe và pháp lý do nhiệm 057 quyết.

#### Scenario: Lô bỏ duyệt vẫn kiểm lời đọc
- **WHEN** một video trong lô «Bỏ qua duyệt» có tuyên bố sức khỏe không có căn cứ
- **THEN** video đó dừng lại vì kiểm an toàn, dù công tắc «Bỏ qua duyệt» đang bật

#### Scenario: Lời đọc sạch
- **WHEN** lời đọc không có tuyên bố sức khỏe, pháp lý hay sự thật thương hiệu nào sai
- **THEN** kiểm an toàn cho qua và video chạy tiếp

#### Scenario: Video trước lát 3 mang nhãn
- **WHEN** chủ tải về một video làm ra trước lát 3 (lát 1–2)
- **THEN** video đó mang nhãn «Chưa kiểm lời đọc»; duyệt của chủ ở duyệt 1 và duyệt 3 là phép kiểm duy nhất

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

### Requirement: R-V08 File gốc nguyên trạng; thư mục thả clip chỉ sao chép
App SHALL NOT đổi tập tin clip gốc bất kỳ lúc nào. Quét thư mục thả clip SHALL sao chép tập tin vào app, SHALL NOT dời hay xóa tập tin gốc. Một tập tin đã nhập trước đó (cùng vân tay) SHALL bị bỏ qua khi quét lại.

- Loại kiểm: Người đọc; Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ duyệt cắt 10 của kế hoạch đơn giản nhất (F178): «Copy files in and never touch the source» — sao chép vào, không dời hay xóa nguồn, bỏ qua tập tin trùng vân tay.

#### Scenario: Quét thư mục thả clip
- **WHEN** app quét thư mục thả clip và phát hiện tập tin mới
- **THEN** tập tin được sao chép vào thư viện; tập tin trên thư mục vẫn ở chỗ cũ, nguyên trạng

#### Scenario: Quét lại lần hai
- **WHEN** app quét tiếp một tập tin có cùng vân tay với tập tin đã nhập trước đó
- **THEN** app bỏ qua tập tin đó và không tạo bản sao nữa

#### Scenario: Ca đối chứng âm
- **WHEN** kiểm thử nhập clip từ thư mục thả clip rồi so vân tay tập tin gốc trước và sau
- **THEN** vân tay gốc không đổi và tập tin gốc vẫn tồn tại

### Requirement: R-V09 Nhạc cần giấy phép đã ghi
Mỗi bài nhạc trong thư viện SHALL có giấy phép đã ghi vào app. Bài không có giấy phép SHALL NOT dùng cho video.

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt toàn bộ §1 bản nháp 054 ngày 01/10/2026 (hàng «Nhạc»: thư viện nhạc royalty-free của chủ); luật «chỉ dùng nhạc có giấy phép đã ghi» lấy nguyên văn từ bản nháp 054 phần 9 (kho tái sử dụng): «Music: only tracks with a recorded licence».

#### Scenario: Bài nhạc thiếu giấy phép
- **WHEN** một bài nhạc không nhập giấy phép nhưng được chọn làm nhạc nền
- **THEN** app không cho chọn và hiện lý do cần giấy phép

### Requirement: R-V10 Hiện con số trước mọi lời gọi trả phí
Trước khi chạy một lời gọi trả phí, app SHALL hiện số lời gọi sẽ chạy. Lời gọi script và viết lại SHALL hiện «n lượt AI», và model script SHALL cố định trong mã (F183). Giọng đọc SHALL hiện cả số ký tự. Gemini SHALL chỉ đọc clip khi chủ bấm «Phân tích n clip (n lượt Gemini)»; clip chưa bấm SHALL hiện «Chưa phân tích»; phân tích phát sinh theo clip stock SHALL được đếm bên trong lần bấm đó, và SHALL NOT có phân tích nào chạy nếu thiếu lần bấm. Một lô video SHALL hiện số lượt gọi gộp trước khi vào hàng đợi (lát 3). App SHALL NOT tự chạy lại lời gọi lỗi; chủ SHALL bấm «Thử lại».

- Loại kiểm: Người đọc; Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ quyết định O2 «agree, wait for a click» (F176). Chủ duyệt «mỗi thao tác hiện số lượt trước khi chạy, không tự chạy lại» ngày 01/10/2026 (§1); ngày 25/10/2026 (F183) chủ xác nhận lời gọi script và viết lại hiện «n lượt AI» và model script cố định trong mã; stock được đếm bên trong lần bấm phân tích (M5). Luật «một lô hiện một con số gộp» theo kế hoạch lát 3 (F178).

#### Scenario: Bấm phân tích
- **WHEN** chủ bấm «Phân tích 4 clip (4 lượt Gemini)»
- **THEN** app đọc đúng 4 clip và ghi lại 4 lời gọi

#### Scenario: Clip chưa bấm thì chưa phân tích
- **WHEN** một clip vừa nhập từ thư mục thả clip
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
- Vì sao: Chủ duyệt toàn bộ §1 bản nháp 054 ngày 01/10/2026; hành vi «Chưa có cảnh phù hợp» và «no silent black frames» nằm nguyên văn ở bản nháp 054, phần 4, bước Match; phần lát 2–3 theo kế hoạch đơn giản nhất (F178).

#### Scenario: Duyệt bật, cảnh rỗng
- **WHEN** một cảnh không có clip và công tắc «Bỏ qua duyệt» đang tắt
- **THEN** video dừng ở duyệt 2 và cảnh hiện «Chưa có cảnh phù hợp»

#### Scenario: Duyệt bỏ, cảnh rỗng
- **WHEN** một cảnh không có clip và công tắc «Bỏ qua duyệt» đang bật
- **THEN** video thất bại kèm thông báo rõ về cảnh thiếu, không ra tập tin có khung đen

### Requirement: R-V13 Mỗi lần dựng giữ bản chụp cài đặt
Mỗi lần dựng SHALL đóng băng bản sao cài đặt (preset và các mục ghi đè) khi bắt đầu. Đổi preset SHALL NOT đổi video đã có hoặc cài đặt của lần đang chạy. Khi chủ đổi cài đặt áp dụng cho video, thay đổi SHALL dành cho lần chạy tiếp theo và video SHALL được đánh dấu «Cần dựng lại».

- Loại kiểm: Người đọc
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ duyệt phần cắt 5 của kế hoạch: mỗi lần dựng chụp nguyên bản cài đặt, thay cho bảng phiên preset (F178).

#### Scenario: Đổi preset
- **WHEN** chủ đổi một preset mà có một video đã dựng
- **THEN** video đã dựng giữ nguyên cài đặt cũ và không đổi

#### Scenario: Đổi cài đặt ở điểm duyệt
- **WHEN** chủ đổi giọng đọc tại một điểm duyệt của video đã dựng
- **THEN** video đã dựng giữ cài đặt cũ; thay đổi dành cho lần dựng tiếp theo và video hiện «Cần dựng lại»

### Requirement: R-V14 Cô lập lỗi và khởi động lại
Một lỗi của ffmpeg hay một dịch vụ ngoài (sụp, chậm quá giới hạn thời gian) SHALL chỉ làm job liên quan đó thất bại. App SHALL tiếp tục chạy. Từ lát 1 (055), app SHALL tự khởi động lại an toàn sau khi sập cứng bằng một unit systemd của người dùng (F185: với `Restart=on-failure` và giới hạn số lần khởi động, theo mẫu unit user sẵn có như CLIProxy; khóa cấp qua environment file của nhiệm 053 phương án (b); cài lên Fedora chỉ khi chủ viết «deploy <SHA>»). Trước khi nhận khóa executor, app SHALL chỉ nhận khóa cũ khi hostname khớp, metadata hợp lệ và tiến trình giữ khóa được chứng minh đã tắt (kể cả trường hợp PID tái sử dụng); việc nhận khóa SHALL nguyên tử với đúng một bên thắng; SHALL NOT có con ffmpeg nào của tiến trình cũ còn sống. App SHALL NOT cho phép hai executor cùng quyền ghi. Khóa từ host khác, khóa không đọc được và khóa không chứng minh được SHALL giữ quy trình thủ công. Sau khi app khởi động lại, job đang chạy SHALL hiện là gián đoạn và SHALL NOT tự chạy lại.

- Loại kiểm: Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Ngày 25/10/2026 chủ chọn phương án A kèm bốn lớp bảo vệ (F176–F177, O1). Tại af53534a, app sập cứng làm khóa executor còn lại, app dừng cho tới khi quy trình gỡ khóa cũ được chạy. Ngày 25/10/2026 (F183) chủ xác nhận lại phương án A và yêu cầu lát 1 (055) thêm tự khởi động lại an toàn; ngày 25/10/2026 (F185) chủ chọn cách tái khởi động bằng unit systemd của người dùng, chỉ cài trên Fedora khi chủ viết «deploy <SHA>».

#### Scenario: ffmpeg sập giữa lần dựng
- **WHEN** tiến trình ffmpeg con sập giữa lần dựng trong khi app vẫn chạy
- **THEN** chỉ video đó thất bại kèm lỗi rõ và app vẫn chạy

#### Scenario: Dịch vụ ngoài chậm
- **WHEN** một nhà cung cấp vượt quá giới hạn thời gian gọi của nó
- **THEN** chỉ job chờ nó thất bại; các job khác và app vẫn sống

#### Scenario: Tự khởi động lại an toàn sau khi sập cứng
- **WHEN** app sập cứng khi một job video đang chạy, để lại khóa executor, và tiến trình giữ khóa được chứng minh đã tắt
- **THEN** từ lát 1 (055), app tự khởi động lại không cần gỡ khóa thủ công; job đó hiện là gián đoạn và không tự chạy lại

#### Scenario: Kill -9 giữa lần dựng
- **WHEN** app bị kết thúc cứng bằng kill -9 trong khi một lần dựng đang chạy
- **THEN** app giao tiếp lại không cần bước thủ công của chủ; lần dựng hiện là gián đoạn; không còn tiến trình ffmpeg cũ nào chạy

#### Scenario: Tiến trình giữ khóa còn sống
- **WHEN** một tiến trình khởi động thấy khóa của executor còn sống
- **THEN** tiến trình đó không nhận khóa và không có executor ghi thứ hai

### Requirement: R-V15 Sửa script làm mất lựa chọn clip của cảnh bị đổi
Khi chủ sửa script (lát 1–2), một cảnh bị thay đổi SHALL mất lựa chọn clip hiện có và SHALL bị đánh dấu; các cảnh bị thay đổi SHALL chỉ được dựng lại giọng và dựng lại video khi chủ khởi động, sau khi số ký tự đã hiện (R-V10). Chức năng giữ lựa chọn clip cũ chỉ có từ lát 3 (đơn giản hóa 2, F179).

- Loại kiểm: Kiểm thử
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ duyệt điều kiện giữ clip sau viết lại ngày 01/10/2026 (quyết định 8 trong script-vs-setup-decision.md). Ngày 25/10/2026 chủ duyệt đơn giản hóa 2: viết lại chọn lại clip ở lát 1–2, giữ clip cũ từ lát 3 (F179, mục 4.2 của kế hoạch đơn giản nhất).

#### Scenario: Chỉnh câu của một cảnh
- **WHEN** chủ đổi câu tiếng Việt của một cảnh rồi duyệt script
- **THEN** cảnh đó mất lựa chọn clip cũ và bị đánh dấu; chủ chọn clip mới cho cảnh khi duyệt 2; giọng đọc và dựng lại video chỉ chạy khi chủ khởi động, sau khi app hiện số ký tự

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

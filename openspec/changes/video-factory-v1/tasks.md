## 1. Tài liệu (lát 0)

- [x] 1.1 Viết change này: proposal với sơ đồ, spec R-V01 đến R-V16, tasks.md (chủ duyệt OpenSpec cho video ngày 25/10/2026, F175)
- [x] 1.2 Viết lại brief 054: tên Video Factory, Box 4 Flow, bảng `flow_video_*`, 10 phần cắt, cột «phải trả lời» theo từng lát (docs/tasks/054-video-factory-design.md)
- [x] 1.3 Viết ADR 0007: video chạy trong app (O1 phương án A kèm 4 lớp bảo vệ, F176–F177); ADR 0007 sửa ADR 0003 quyết định 8 («không video»); chụp bản cũ ADR 0003 vào docs/outdated
- [x] 1.4 Sửa mở rộng nhỏ: openspec/config.yaml, AGENTS.md, INTENT.md (2 dòng có ngày sau 03/10/2026, không đánh số D)
- [x] 1.5 `openspec validate --all` qua
- [x] 1.6 Rà lại theo EGM
- [ ] 1.7 Chủ duyệt PR này và change này

Cách chia việc dưới đây chỉ áp dụng khi xây Video Factory (F173, F175 ngày 25/10/2026). Mỗi lát mở đầu bằng bảng dòng hợp đồng đánh số (055-Q1…, chia «trước khi viết mã» và «trước khi hợp nhất»): GLM soạn bảng, một phiên Sol mới rà soát, điều phối viên kiểm lại, câu hỏi còn mở hỏi chủ; GLM chỉ viết mã sau khi bảng đã chốt và được rà (M7). Mỗi dòng ghi quy tắc R-V, hành vi và ca đối chứng âm. Mỗi lát cập nhật hướng dẫn vận hành, STATUS và bàn giao. Sửa lỗi áp dụng cho cả hệ thống, không chỉnh riêng một lần chạy. Chi tiết câu hỏi phải trả lời và đường dẫn sở hữu ở §7 brief 054.

## 2. Lát 1 — video thật đầu tiên, chủ tự chọn clip (nhiệm vụ 055)

- [ ] 2.1 Menu Video, danh sách video, «Tạo video» từ chủ đề (R-V01, R-V02)
- [ ] 2.2 Script qua cổng AI sẵn có, điểm duyệt 1 (R-V02)
- [ ] 2.3 Thư viện clip: tải lên đọc theo phần nhỏ, không giữ cả tập tin trong bộ nhớ; kiểm kích thước; xem trước và hình thu nhỏ; nhãn tự gõ; Tổng hợp hoặc bộ sưu tập thương hiệu (R-V07, R-V08)
- [ ] 2.4 Thư viện nhạc: tải lên, tâm trạng, giấy phép (R-V09)
- [ ] 2.5 Điểm duyệt 2: chủ chọn clip cho từng cảnh, tìm theo nhãn; clip ngắn hơn cảnh không chọn được (R-V04, R-V12)
- [ ] 2.6 Giọng đọc: dựng với giọng giả trong CI; chỉ nối nhà cung cấp thật khi F2 đã xong (điểm chốt cuối của lát 1); nếu nhà cung cấp thắng F2 cần webhook thì hỏi chủ trước khi dựng; một lời gọi mỗi cảnh (R-V10, R-V11, F183)
- [ ] 2.7 Dựng: ffmpeg chạy con ưu tiên thấp có giới hạn bộ nhớ và thời gian; cắt cứng hoặc mờ; logo; nhạc hạ dưới lời đọc; −14 LUFS. Duyệt 3 rồi tải về; tập tin tải về mang nhãn «Chưa kiểm lời đọc» (R-V02, R-V03, R-V13, R-V14, F183)
- [ ] 2.8 Bài kiểm thử: giết ffmpeg giữa lần dựng, app vẫn chạy; độ dài video bằng độ dài lời đọc; lỗi một nhà cung cấp chỉ làm hỏng job của nó (R-V14)
- [ ] 2.9 Script và viết lại hiện «n lượt AI»; model script cố định trong mã (F183). Lời gọi trả phí mới của lát này chỉ là giọng đọc: giọng giả kiểm trong CI; sau triển khai chủ dựng một video thật với ngân sách giọng nhỏ do chủ đặt lúc triển khai (R-V10, R-V11)
- [ ] 2.10 GLM 5.3 Flash viết mã
- [ ] 2.11 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 2.12 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 2.13 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 2.14 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»
- [ ] 2.15 Ẩn và khôi phục clip, nhạc và video; không dọn file tự động (R-V16)
- [ ] 2.16 Giữ hành vi kịch bản/cài đặt đã duyệt ngày 01/10: bản nháp tạo mới riêng, tự lưu script vào video, phiên bản viết lại, từ chối kết quả cũ, quay về duyệt 1, nhắc video đang chờ; xem §6 brief 054 (R-V02, R-V13, R-V15)

## 3. Lát 2 — ghép clip tự động (nhiệm vụ 056)

- [ ] 3.1 Gemini đọc một clip khi chủ bấm «Phân tích n clip (n lượt Gemini)» (O2, F176): mô tả, khoảnh khắc tốt nhất, cắt 9:16; không tự chạy lại (R-V10)
- [ ] 3.2 App gợi ý 3 clip cho mỗi cảnh; chủ vẫn có thể đổi (R-V04, R-V07)
- [ ] 3.3 Tìm stock Pexels; clip stock được chọn vào thư viện kèm nguồn và giấy phép; số lượt phân tích hiện trước khi chạy (R-V05, R-V10)
- [ ] 3.4 Angle trở thành nguồn script (R-V01)
- [ ] 3.5 Nhập thư mục thả clip: quét mỗi vài phút và nút «Quét thư mục»; sao chép rồi kiểm vân tay, không đụng nguồn, bỏ qua tập tin trùng (R-V08)
- [ ] 3.6 Cảnh không có clip: chặn duyệt 2, hiện «Chưa có cảnh phù hợp» (R-V12); bỏ duyệt chưa có ở lát này
- [ ] 3.7 GLM 5.3 Flash viết mã
- [ ] 3.8 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 3.9 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 3.10 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 3.11 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 4. Lát 3 — chế độ không cần duyệt (nhiệm vụ 057)

- [ ] 4.1 Kiểm an toàn lời đọc cho tuyên bố sức khỏe, pháp lý và sự thật thương hiệu; «Bỏ qua duyệt» không bao giờ bỏ qua nó (R-V03)
- [ ] 4.2 Chỉ bật «Bỏ qua duyệt» và hàng loạt sau khi chủ trả lời O3 và O4 về video của thương hiệu thực phẩm bổ sung. Hiện số lượt gọi gộp trước khi xếp hàng; thiếu clip thì video thất bại rõ, không khung đen (R-V02, R-V10, R-V12)
- [ ] 4.3 Lớp preset thương hiệu, nhà cung cấp giọng thứ hai, Pixabay, chuyển cảnh slide (R-V11)
- [ ] 4.4 «Dùng lại bản này» tạo phiên bản mới và trở về duyệt 1. Giữ lựa chọn clip khi đủ năm điều kiện ở §6 brief 054; nếu không thì chọn lại, hiện «Lựa chọn trước» cùng lý do có thể hoặc không thể dùng lại. Dựng lại giọng và video khi script đổi (R-V15; F179)
- [ ] 4.5 GLM 5.3 Flash viết mã
- [ ] 4.6 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 4.7 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 4.8 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 4.9 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 5. Chạy thử thật trên Fedora (nhiệm vụ 058)

- [ ] 5.1 Chạy thật cả luồng: chủ tạo video, duyệt ba điểm, tải về; mỗi nhà cung cấp được gọi thật theo ngân sách riêng chủ đặt trước (R-V10, R-V14, R-V12)
- [ ] 5.2 Ghi biên bản từng nhà cung cấp: số lời gọi, chi phí, kết quả; không tự chạy lại; sau khi khởi động lại, job đang chạy hiện là gián đoạn (R-V10, R-V11, R-V14)
- [ ] 5.3 Triển khai chỉ khi chủ viết «deploy <SHA>»
- [ ] 5.4 Merge chỉ khi chủ đồng ý

## 6. Kết thúc

- [ ] 6.1 Viết mã kiểm thật (file, hàm) vào dòng «Mã kiểm» của từng requirement R-V01 đến R-V16
- [ ] 6.2 Khi có mã kiểm video thật, thêm file liên quan vào spec-drift và xác nhận kiểm thử liên kết OpenSpec tìm đúng file/hàm; không thêm cổng này ở lát 0
- [ ] 6.3 `/opsx:archive` change video-factory-v1

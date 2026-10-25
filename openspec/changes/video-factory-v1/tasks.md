## 1. Tài liệu (lát 0)

- [x] 1.1 Viết change này: proposal với sơ đồ, spec R-V01 đến R-V16, tasks.md (chủ duyệt OpenSpec cho video ngày 25/10/2026, F175)
- [x] 1.2 Viết lại brief 054: tên Video Factory, Box 4 Flow, bảng `flow_video_*`, 10 phần cắt, cột «phải trả lời» theo từng lát (docs/tasks/054-video-factory-design.md)
- [x] 1.3 Viết ADR 0007: video chạy trong app (O1 phương án A kèm 4 lớp bảo vệ, F176–F177); ADR 0007 sửa ADR 0003 quyết định 8 («không video»); chụp bản cũ ADR 0003 vào docs/outdated
- [x] 1.4 Sửa mở rộng nhỏ: openspec/config.yaml, AGENTS.md, INTENT.md (2 dòng có ngày sau 03/10/2026, không đánh số D)
- [x] 1.5 `openspec validate --all` qua
- [x] 1.6 Rà lại theo EGM, chủ duyệt PR này và change này

## 2. Lát 1 — video thật đầu tiên, chủ tự chọn clip (nhiệm vụ 055)

- [ ] 2.1 Menu Video, danh sách video, «Tạo video» từ chủ đề (R-V01, R-V02)
- [ ] 2.2 Script qua cổng AI sẵn có, điểm duyệt 1 (R-V02)
- [ ] 2.3 Thư viện clip: tải lên đọc theo phần nhỏ, không giữ cả tập tin trong bộ nhớ; kiểm kích thước; xem trước và hình thu nhỏ; nhãn tự gõ; Tổng hợp hoặc bộ sưu tập thương hiệu (R-V07, R-V08)
- [ ] 2.4 Thư viện nhạc: tải lên, tâm trạng, giấy phép (R-V09)
- [ ] 2.5 Điểm duyệt 2: chủ chọn clip cho từng cảnh, tìm theo nhãn; clip ngắn hơn cảnh không chọn được (R-V04, R-V12)
- [ ] 2.6 Giọng đọc: bên thắng bài nghe thử F2, một lời gọi mỗi cảnh (R-V10, R-V11)
- [ ] 2.7 Dựng: ffmpeg chạy con ưu tiên thấp có giới hạn bộ nhớ và thời gian; cắt cứng hoặc mờ; logo; nhạc hạ dưới lời đọc; −14 LUFS. Duyệt 3 rồi tải về (R-V02, R-V13, R-V14)
- [ ] 2.8 Bài kiểm thử: giết ffmpeg giữa lần dựng, app vẫn chạy; độ dài video bằng độ dài lời đọc; lỗi một nhà cung cấp chỉ làm hỏng job của nó (R-V14)
- [ ] 2.9 Lời gọi trả phí mới của lát này: chỉ giọng đọc (R-V10, R-V11)
- [ ] 2.10 GLM 5.3 Flash viết mã
- [ ] 2.11 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 2.12 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 2.13 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 2.14 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 3. Lát 2 — ghép clip tự động (nhiệm vụ 056)

- [ ] 3.1 Gemini đọc một clip khi chủ bấm «Phân tích n clip (n lượt Gemini)» (O2, F176): mô tả, khoảnh khắc tốt nhất, cắt 9:16; không tự chạy lại (R-V10)
- [ ] 3.2 App gợi ý 3 clip cho mỗi cảnh; chủ vẫn có thể đổi (R-V04, R-V07)
- [ ] 3.3 Tìm stock Pexels; clip stock được chọn vào thư viện kèm nguồn và giấy phép; số lượt phân tích hiện trước khi chạy (R-V05, R-V10)
- [ ] 3.4 Angle trở thành nguồn script (R-V01)
- [ ] 3.5 Nhập thư mục nhúng: sao chép vào, không đụng nguồn, bỏ qua tập tin trùng cùng vân tay; nút «Quét thư mục» (R-V08)
- [ ] 3.6 Cảnh không có clip: khi duyệt bật, chặn duyệt; khi «Bỏ qua duyệt» bật, video thất bại kèm thông báo rõ, không khung đen (R-V12)
- [ ] 3.7 GLM 5.3 Flash viết mã
- [ ] 3.8 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 3.9 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 3.10 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 3.11 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 4. Lát 3 — chế độ không cần duyệt (nhiệm vụ 057)

- [ ] 4.1 Kiểm an toàn lời đọc cho tuyên bố sức khỏe và pháp lý; «Bỏ qua duyệt» không bao giờ bỏ qua nó (R-V03)
- [ ] 4.2 «Bỏ qua duyệt» và chế độ hàng loạt, hiện một con số lượt gọi gộp trước khi lô bắt đầu; câu trả lời O3 và O4 áp dụng tại đây (R-V02, R-V10)
- [ ] 4.3 Lớp preset thương hiệu, nhà cung cấp giọng thứ hai, Pixabay, chuyển cảnh slide (R-V11)
- [ ] 4.4 Dùng lại phiên bản script và giữ lựa chọn clip cũ (đơn giản hóa 2, F179): sửa script chỉ chọn lại các cảnh đã đổi, rồi dựng lại giọng và dựng lại video (R-V15)
- [ ] 4.5 GLM 5.3 Flash viết mã
- [ ] 4.6 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 4.7 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 4.8 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 4.9 Merge chỉ khi chủ đồng ý; triển khai chỉ khi chủ viết «deploy <SHA>»

## 5. Chạy thử thật trên Fedora (nhiệm vụ 058)

- [ ] 5.1 Chạy thật cả luồng: chủ tạo video, duyệt ba điểm, tải về; mỗi nhà cung cấp được gọi thật theo ngân sách riêng chủ đặt trước (R-V10, R-V14, R-V12)
- [ ] 5.2 Ghi biên bản từng nhà cung cấp: số lời gọi, chi phí, kết quả; không tự chạy lại; sau khi khởi động lại, job đang chạy hiện là gián đoạn (R-V10, R-V11, R-V14)
- [ ] 5.3 Triển khai chỉ khi chủ viết «deploy <SHA>»
- [ ] 5.4 GLM 5.3 Flash viết mã
- [ ] 5.5 Sol 6.1 xhigh viết kiểm thử ở phiên riêng; mỗi ca có một ca đối chứng âm
- [ ] 5.6 Một phiên Sol 6.1 xhigh mới khác rà soát
- [ ] 5.7 Kiểm thử theo dòng hợp đồng; CI Linux xanh tại SHA cuối là cổng cuối, không chạy cả bộ trên máy
- [ ] 5.8 Merge chỉ khi chủ đồng ý

## 6. Kết thúc

- [ ] 6.1 Viết mã kiểm thật (file, hàm) vào dòng «Mã kiểm» của từng requirement R-V01 đến R-V16
- [ ] 6.2 `/opsx:archive` change video-factory-v1

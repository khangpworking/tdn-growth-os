# TDN Growth OS — Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

- Frontend được chủ dự án chốt: React + Vite + TypeScript.
- Giữ backend TypeScript, Node.js, SQLite và kiến trúc modular monolith hiện có; không đổi sang Bun, FastAPI, Streamlit hay Supabase.
- Fedora là môi trường vận hành chính. Windows chỉ phục vụ công việc phát triển/thiết kế khi cần.
- Quyết định frontend mới thay thế baseline vanilla TypeScript/Bootstrap cũ; xem `docs/adr/0002-react-vite-typescript-frontend.md`.
- Frontend, HTTP API và xác thực người dùng chưa được triển khai trong baseline Task 032. Không coi service backend là endpoint có sẵn.

## Users

Người dùng chính hiện tại là chủ dự án (OWNER): điều phối nghiên cứu, xem bằng chứng và đưa ra quyết định. Nhân sự chuyên môn có thể trao đổi ngoài hệ thống; vai trò reviewer trong ứng dụng để sau. Một người phát triển cùng AI coding.

## Product Purpose

Biến dữ liệu thị trường và nghiên cứu thành bằng chứng có thể kiểm tra; hỗ trợ khám phá cơ hội, hình thành ứng viên sản phẩm, quyết định của con người và triển khai nội dung về sau. Không đồng nhất gợi ý AI với sự thật hoặc quyền phê duyệt.

## Operating Context

- Có thể nghiên cứu nhiều thị trường. UI đi từ danh sách thị trường vào workspace khám phá của từng thị trường, rồi đến hồ sơ sản phẩm. Phạm vi số liệu và quyết định giữ riêng; thị trường chưa có sản phẩm vẫn có rổ cơ hội.

- Khám phá bắt đầu rộng, ví dụ “thị trường canxi”. Ứng viên hình thành trong B0–B7.
- B7 là điểm chọn ứng viên. Mỗi ứng viên được PASS có thể được tạo thành một workspace sản phẩm độc lập; workspace khám phá vẫn mở.
- B8 có bốn lane: pháp lý, khoa học, chất lượng và tài chính.
- B9 v1 có một bản STP đang soạn, sau đó khóa thành đúng một bản chính thức; chưa hỗ trợ mở khóa hoặc nhiều phiên bản STP chính thức.
- B10 có một quyết định chung cho duyệt danh mục và cho phép cấp vốn. Đây không phải thực thi chuyển tiền hay phân bổ ngân sách.
- Nghiên cứu ban đầu chỉ chạy khi người dùng yêu cầu, không tự đặt lịch thu thập.
- Chủ dự án có Research Pipeline và Content Studio. Theo thông tin chủ dự án, Content Studio dùng HTML/CSS thuần; luồng là thông tin sản phẩm, đối tượng, pain point, insight → Big Idea → Angles → Drafts → Caption + Poster. Chưa thẩm định code để cam kết mức tái sử dụng.

## Capabilities and Constraints

- Backend qua Task 032 có các service, contract, verified reader và artifact bất biến; trạng thái cụ thể xem `docs/STATUS.md`.
- B7 chỉ OWNER quyết định PASS/HOLD/REJECT, không có trường lý do; quyết định cố định theo basket/candidate/version. Xem lại HOLD qua basket version tương lai, không sửa bản cũ.
- B8 và B10 cho phép sửa quyết định bằng bản ghi nối tiếp có kiểm tra phiên bản/predecessor; không ghi đè lịch sử. Quyết định vẫn button-only, không thêm lý do bắt buộc.
- B8 clearance và STP đã khóa là snapshot lịch sử. Không biến snapshot thành tuyên bố rằng trạng thái B8 hiện tại luôn PASS.
- Chưa có UI, API, dashboard hoặc luồng B11 hoạt động. Mockup không phải bằng chứng tính năng đã vận hành.
- B0, B14, logic insight/60 câu hỏi, chat AI về báo cáo và tích hợp Content Studio còn để sau. Methodology/format báo cáo B2 Task 024 do chủ dự án chuẩn bị, đang tạm hoãn; không tự tạo phương pháp thay thế.

## Evidence on Hand

- Dữ liệu Metric HTML/PDF thuộc cùng một evidence family; XLSX/JSON là biểu diễn có cấu trúc, không phải nguồn độc lập.
- Không so sánh Kalodata trực tiếp với tổng Metric 24 tháng khi chưa xác minh kỳ đo tương thích. Provenance Kalodata vẫn có giới hạn.
- Tập 3.354 review thủ công thiếu listing/provider ID đã xác minh; giữ riêng, không tự nối sản phẩm theo tên. Bộ lọc đã sửa giữ 560 và loại 2.794 ở lần tái lập được báo cáo, không phải thước đo accuracy.
- Chưa chốt hiệu chuẩn E0–E5; không tự biến evidence grade backend thành điểm tin cậy số.
- Dữ liệu synthetic phải được nhận diện rõ; không dùng nó làm kết quả kinh doanh thật. Không xuất raw/private data vào Git hoặc ảnh mockup.

## Product Principles

1. Giao nhanh, chọn giải pháp đơn giản nhất đáp ứng mục tiêu; tận dụng code đã có sau khi kiểm tra.
2. Giải thích bằng dữ liệu và visual có căn cứ; tránh wall of text, không sáng tác chart hoặc kết luận thiếu nguồn.
3. Con người quyết định; AI không tự thông qua gate hoặc thực hiện hành động kinh doanh.
4. Phân biệt chưa có dữ liệu, dữ liệu bằng không, dữ liệu thiếu và bằng chứng chưa xác minh.
5. Chỉ thêm workflow, thư viện hoặc vai trò khi nhu cầu hiện tại đòi hỏi.

## Open Decisions

Baseline thị giác là prototype ba option gốc: navy, nền xanh xám, nội dung trắng và cặp Overview + Detail; bốn reference thương hiệu đã bị loại theo INTENT D29. Layout tinh chỉnh đang để chủ dự án xem. Thư viện chart/component, API transport và cơ chế đăng nhập chưa được chốt. Các đề xuất UX nằm ở surface brief, không tự trở thành chính sách nghiệp vụ.

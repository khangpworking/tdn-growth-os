# Ý định sản phẩm và quyết định thiết kế — TDN Growth OS

Cập nhật: 08/09/2026. Trạng thái: đang phỏng vấn thiết kế cho Task 015.

## Mục đích và cách đọc

Lưu bối cảnh, quyết định đã thống nhất, lý do, phần để sau và câu hỏi còn mở để người và agent tiếp tục đúng hướng giữa các phiên làm việc.

- **Đã thống nhất:** chủ dự án đã xác nhận trong cuộc trao đổi.
- **Để sau:** đã chủ động hoãn; không tự đưa vào scope hiện tại.
- **Chưa chốt:** còn là câu hỏi hoặc đề xuất; không được coi là yêu cầu đã duyệt.
- **Tài liệu tham chiếu:** mô tả nội dung nguồn, không đồng nghĩa đã xác minh dữ liệu hoặc đã triển khai.

Tài liệu này ghi ý định nghiệp vụ. `ARCHITECTURE.md` giữ baseline kỹ thuật; `docs/STATUS.md`, code, tests và handoff phản ánh implementation. Nếu khác nhau, ghi nhận khoảng cách trước khi đề xuất thay đổi. Quyết định thiết kế ở đây không tự chứng minh tính năng đã hoàn thành hoặc cho phép thực thi hành động bên ngoài.

## Mục tiêu xuyên suốt

- Một người phát triển với AI coding: ưu tiên tốc độ và giải pháp đơn giản nhất đáp ứng mục tiêu.
- Tái sử dụng Research Pipeline và Content Studio sau khi kiểm tra phần code liên quan.
- Kiểm thử theo rủi ro; kiểm tra hành vi ứng dụng sở hữu, tránh gates và NFR không cần thiết.
- AI hỗ trợ phân tích và đề xuất; con người quyết định tại các gate nghiệp vụ đã thống nhất.
- Orca quản lý agent/worktree phát triển. Workspace nghiệp vụ dưới đây là khái niệm sản phẩm, không phải Git worktree.

## Những gì chủ dự án đã có

| Thành phần | Năng lực được cung cấp trong cuộc trao đổi | Giới hạn xác nhận |
|---|---|---|
| Research Pipeline | KaloData + Metric → báo cáo phân tích thị trường | Đã đọc báo cáo đầu ra; chưa chứng minh mọi năng lực đã tích hợp vào repo mới |
| Content Studio | Product info (giá, mô tả) + audience + pain point + insight → Big Idea → Angles → Drafts → Caption + Poster | Luồng do chủ dự án mô tả; chưa kiểm tra toàn bộ implementation trong đợt phỏng vấn này |
| Framework 10×6 | 60 câu hỏi chi tiết trong 10 nhóm; nguồn, lập luận, công thức và bằng chứng | Framework ngoài hệ thống; không được tính là đã tích hợp chỉ vì có DOCX/Excel |

## Flow B0–B14 — tên theo hình chủ dự án cung cấp

| Bước | Tên nghiệp vụ |
|---|---|
| B0 | Khóa định hướng chiến lược |
| B1 | PESTLE |
| B2 | Thị trường online Việt Nam |
| B3 | Rổ cơ hội sản phẩm |
| B4 | STP sơ bộ |
| B5 | Khái niệm sản phẩm mục tiêu |
| B6 | Tìm nhà cung cấp |
| B7 | Sàng lọc phù hợp chiến lược |
| B8 | Thẩm định pháp lý – khoa học – chất lượng – tài chính |
| B9 | Khóa STP |
| B10 | Phê duyệt danh mục và cấp vốn |
| B11 | Insight & tiếp cận số |
| B12 | Kiến trúc thông điệp |
| B13 | Poster & video |
| B14 | Phản hồi thị trường và học lại |

Đã xác nhận cấu trúc này rộng hơn luồng tạo nội dung: gồm khám phá cơ hội, phát triển sản phẩm, thẩm định, phê duyệt và triển khai. Input/output, vai trò, điều kiện chuyển bước và rework của từng bước chưa được chốt đầy đủ.

## Quyết định đã thống nhất

### D01 — Khám phá chung B0–B7; tách workspace tại B7

Workspace ban đầu bắt đầu bằng một cơ hội rộng, ví dụ “thị trường canxi”. Sản phẩm cụ thể hình thành trong B0–B7; giai đoạn này có thể chứa nhiều lựa chọn như canxi người lớn và canxi trẻ em.

Tại B7, mỗi candidate được chọn tiếp tục trong một workspace sản phẩm độc lập cho B8–B14. Workspace mới mang theo bản sao cố định của nghiên cứu liên quan và concept đã chọn.

Lý do: dùng chung công sức khám phá ban đầu, nhưng các sản phẩm sau lựa chọn không phụ thuộc tiến độ, quyết định, cấp vốn hay nội dung của nhau. Không tự đồng bộ thay đổi giữa các workspace. Cách hiện thực sao chép/tham chiếu dữ liệu, quyền truy cập và cách nhập cập nhật sau này chưa chốt.

### D02 — AI đề xuất; con người quyết định B7

AI chuẩn bị candidate, so sánh và bằng chứng. Con người là gate cuối cùng chọn kết quả:

- **PASS:** tạo workspace sản phẩm độc lập để đi B8–B14.
- **HOLD:** giữ candidate cùng lý do thiếu bằng chứng hoặc yêu cầu cần bổ sung; có thể xem xét lại.
- **REJECT:** giữ lịch sử/lý do và bỏ khỏi công việc đang hoạt động.

Người/vai trò cụ thể có quyền chọn, tiêu chí chấm và điều kiện xem xét lại chưa được xác định. Không tự coi policy kỹ thuật của Task 013 là policy B7 đầy đủ.

### D03 — Workspace khám phá vẫn mở

Không đóng workspace B0–B7 khi có candidate PASS. Người dùng có thể khám phá thêm hoặc tiếp tục nghiên cứu khi chưa candidate nào PASS. Các workspace sản phẩm đã tách tiếp tục độc lập.

### D04 — 60 câu hỏi là nền phân tích; phạm vi ban đầu xét đủ 60

Chủ dự án chọn xét toàn bộ 60 câu hỏi, thay vì tự động chỉ chọn một phần. Điều đó không có nghĩa tất cả câu hỏi phải có câu trả lời chắc chắn ngay từ B0.

Thời điểm chạy, cách làm mới câu trả lời và gắn từng câu hỏi vào các bước B0–B14 chưa chốt. Các câu về năng lực công ty, economics và experiment có thể cần dữ liệu xuất hiện ở bước sau.

### D05 — Insight: giữ mục tiêu giải thích, hoãn business logic

Chủ dự án muốn AI đề xuất insight kèm dữ liệu Box 1, phép tính nếu có, giải thích vì sao kết luận có cơ sở và vì sao có thể hữu ích. Con người chọn insight cuối cùng.

Sau đó chủ dự án yêu cầu hoãn thiết kế chi tiết vì đội ngũ chưa hoàn tất logic insight. Mẫu insight, scoring, quy tắc chọn, cách kiểm chứng hiệu quả và contract chưa được duyệt. Bộ 60 câu hỏi là nền tham chiếu cho phần này.

### D06 — Đầu ra giao trước mắt

Chủ dự án chọn caption và poster được duyệt, sẵn sàng xuất bản thủ công. B13 trong roadmap vẫn gồm video; phạm vi video ở bản giao đầu tiên chưa xác nhận. Không suy ra đã có xuất bản tự động.

### D07 — B14 phục vụ cải tiến B11–B13 trong workspace sản phẩm

Nguồn dự kiến: dữ liệu bán hàng, hiệu quả social media và bình luận trên trang của công ty. Mục đích là cải tiến insight/tiếp cận số, thông điệp và poster/video.

Chủ dự án đã sửa đề xuất đưa feedback về khám phá: B14 tập trung vào giai đoạn triển khai của sản phẩm đã chọn. Không thiết kế vòng tự động quay về B0–B7.

### D08 — B14 để sau; định hướng là dashboard có gợi ý

Định hướng ban đầu: dashboard thể hiện dữ liệu và gợi ý AI để đội ngũ họp, thảo luận và cân nhắc thay đổi. Không ép quá trình đó thành một đoạn đề xuất và nút approve/hold.

Chủ dự án yêu cầu dừng đào sâu B14 vì còn sớm. Dashboard, metrics, attribution, group theo creative/campaign, chat/meeting, approval flow và tự động tái tạo nội dung đều để tương lai. Chưa chốt các chi tiết này.

### D09 — Quản lý cập nhật framework để sau

Chủ dự án muốn có khả năng sửa framework trong tương lai, nhưng hoãn thiết kế tính năng cập nhật/versioning. Đề xuất immutable framework versions hoặc tự rerun report cũ chưa được chấp thuận. Không tạo editor/versioning platform trong scope hiện tại.

## Framework mới — nội dung tham chiếu đã đọc

Nguồn: `Framework_10x6_Canxi_Cong_Thuc_Chi_Tiet_Cap_Nhat.docx`, do chủ dự án cung cấp ngày 08/09/2026.

- Mỗi câu có trạng thái `FACT / ESTIMATE / HYPOTHESIS / UNKNOWN`, giới hạn, nguồn/field, ví dụ, lập luận, công thức và tính toán.
- Tổng hợp: 60 câu chi tiết → 10 nhóm → 7 quyết định quản trị.
- 7 đầu ra: khách hàng ưu tiên; vấn đề cần giải quyết; giá trị cung cấp; thông điệp; kênh/cách bán; lợi thế cạnh tranh; thử nghiệm tiếp theo.
- FACT được giới hạn trong nguồn/mẫu quan sát; không mặc nhiên đại diện thị trường hoặc chứng minh quan hệ nhân quả.
- Metric Excel và HTML là hai biểu diễn cùng nguồn. Google Trends là nguồn dự kiến trong tài liệu, chưa có output canxi thực tế được dùng ở bản đó.
- Tài liệu báo cáo 16 FACT, 21 ESTIMATE, 14 HYPOTHESIS, 9 UNKNOWN. Đây là đánh giá của bộ dữ liệu minh họa, không phải trạng thái cố định của các câu hỏi, và chưa được kiểm toán độc lập trong phiên này.
- Q9 nêu khoảng trống dữ liệu công ty; Q10.5 chưa có threshold PASS/HOLD/NO-GO được chốt.

Trạng thái bằng chứng của câu trả lời khác trạng thái workflow. Việc tài liệu có UNKNOWN không tự định nghĩa gate HOLD của toàn dự án. Câu hỏi xử lý thiếu dữ liệu/criticality vẫn còn mở.

## Các cách hiểu đã được sửa trong cuộc phỏng vấn

| Cách hiểu trước | Cách hiểu hiện tại |
|---|---|
| Workflow đầu tiên chỉ là research → insight → content | B0–B14 bao gồm phát triển sản phẩm và thẩm định trước content |
| B0–B14 chưa có ý nghĩa nghiệp vụ | Đã có tên và thứ tự; còn thiếu quy tắc vận hành chi tiết |
| Tất cả candidate sống trong cùng project dài hạn | Chia sẻ khám phá tới B7, sau PASS tách workspace độc lập |
| Phải biết SKU cụ thể khi tạo workspace | Bắt đầu từ cơ hội rộng; concept hình thành B0–B7 |
| B14 gửi learning về khám phá theo mặc định | B14 phục vụ B11–B13; thiết kế chi tiết để sau |
| Cần tiếp tục chốt insight/versioning/B14 ngay | Các phần này đã được chủ dự án hoãn |

## Khoảng cách với implementation hiện tại

Baseline code lúc ghi nhận: `f845c5abab6b37f3c71f4225c6831a5c04a3c24e`, sau merge Task 014.

- Task 011: immutable proposal; Task 013: decision foundation; Task 014: authorized-plan shell không thực thi.
- Chưa triển khai workspace khám phá/sản phẩm, split B7, B0–B14 nghiệp vụ đầy đủ hay tích hợp framework 60 câu.
- Task 013 hiện có APPROVE/REJECT/HOLD với terminal rules hẹp. Không tự đồng nhất với toàn bộ PASS/HOLD/REJECT, reconsideration và quyền B7.
- Workspace độc lập là yêu cầu nghiệp vụ, chưa phải quyết định tạo database/repository riêng. Baseline vẫn một modular monolith, một SQLite.
- Task 012 verdict REVISE; chưa có production Pi adoption.

## Điểm tiếp tục phỏng vấn

**Câu đang chờ:** Tại B0 “Khóa định hướng chiến lược”, đội ngũ phải thống nhất những gì trước khi bắt đầu nghiên cứu?

Gợi ý đã đưa ra, chưa được người dùng xác nhận: cơ hội cần khám phá, mục tiêu kinh doanh, thị trường mục tiêu và ràng buộc như ngân sách hoặc nhóm sản phẩm loại trừ.

Các câu hỏi tiếp theo chỉ mở khi có đủ ngữ cảnh:

- Ai sở hữu và duyệt B0; khi nào được sửa định hướng?
- Input/output và điều kiện hoàn thành từng bước B1–B7?
- Ai quyết định B7 và theo tiêu chí nào; HOLD được mở lại ra sao?
- Chính xác những gì được mang sang workspace mới tại B7?
- “Phê duyệt danh mục và cấp vốn” tại B10 nghĩa gì trong từng workspace sản phẩm độc lập?
- Thiếu dữ liệu trong 60 câu được thể hiện và ảnh hưởng gate như thế nào?
- Vai trò thẩm định tại B8, khóa STP B9 và phê duyệt B10?

Không quay lại đào sâu insight, framework versioning hoặc B14 khi chủ dự án chưa chủ động mở lại.

## Cách duy trì

- Sau câu trả lời có quyết định mới, cập nhật đúng mục và ngày; giữ mã Dxx ổn định.
- Đề xuất chưa xác nhận nằm ở “Chưa chốt”, không ghi thành quyết định.
- Khi người dùng đổi ý, ghi quyết định mới và lý do thay thế; Git giữ lịch sử.
- Không cập nhật phần trăm hoàn thành từ cuộc phỏng vấn; chỉ từ bằng chứng implementation/nghiệm thu.
- Chỉ chuyển thành spec/code task khi scope cần xây đã đủ rõ.

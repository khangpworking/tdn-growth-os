# Ý định sản phẩm và quyết định thiết kế — TDN Growth OS

Cập nhật: 11/09/2026. Trạng thái: ghi nhận quyết định frontend sau baseline Task 032; visual direction đang đề xuất.

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
| B0 | Khóa định hướng chiến lược — để sau, giữ tên tạm |
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
| B14 | Phản hồi thị trường và học lại — để sau |

Đã xác nhận cấu trúc này rộng hơn luồng tạo nội dung: gồm khám phá cơ hội, phát triển sản phẩm, thẩm định, phê duyệt và triển khai. Input/output, vai trò, điều kiện chuyển bước và rework của từng bước chưa được chốt đầy đủ.

B0 và B14 chỉ giữ vị trí trong roadmap, không phải yêu cầu triển khai hiện tại. Các cách gọi B0–B7 và B8–B14 dưới đây giữ nhãn giai đoạn gốc, không đưa hai bước đã hoãn trở lại scope.

## Quyết định đã thống nhất

### D27 — Frontend dùng React + Vite + TypeScript

Chủ dự án đã chốt stack này sau khi thảo luận các phương án. Giữ Node.js/TypeScript/SQLite và Fedora; không chuyển sang Bun, FastAPI, Streamlit hoặc Supabase. Lựa chọn mới thay thế frontend vanilla TypeScript/Bootstrap trong baseline cũ, xem `docs/adr/0002-react-vite-typescript-frontend.md`.

Content Studio hiện là HTML/CSS thuần theo xác nhận của chủ dự án; chưa kiểm tra code để cam kết reuse. Chủ dự án muốn giao diện sinh động, dữ liệu diễn giải bằng chart/visual, tránh wall of text. Không sáng tác dữ liệu, insight hoặc methodology để phục vụ bố cục.

`PRODUCT.md` ghi product context; `docs/frontend/product-workspace-brief.vi.md` là brief chức năng đề xuất, chưa phải giao diện đã duyệt hoặc frontend đã triển khai. B0/B14, B2 methodology và insight business logic vẫn giữ trạng thái để sau.

### D28 — Overview và detail là hai tầng của cùng frontend

Option 3 là **Portfolio Overview** để xem toàn bộ workspace và chọn việc tiếp theo. Option 2 là **Product Workspace Detail** để xem evidence, lane và quyết định của một workspace. Hai option có thể triển khai cùng lúc thành flow `Overview → Detail`; Option 1 chỉ giữ như mật độ thao tác B8 nhanh bên trong detail nếu có nhu cầu thực tế. Đây là quyết định về cấu trúc surface, không tạo thêm nghiệp vụ, API hay quyền mới.

### D29 — Giữ phong cách prototype gốc; loại bốn reference thương hiệu

Ngày 11/09/2026, chủ dự án đánh giá mockup bốn design-md kém phù hợp hơn prototype `docs/frontend/direction-options.html` và yêu cầu không tiếp tục theo Coinbase/Meta/Apple/HP. Prototype gốc là nguồn thị giác cho lượt tiếp theo; giữ cặp Overview + Detail theo D28. Chủ dự án đã yêu cầu tiếp tục, không cần hỏi chọn lại giữa hai màn hình này.

Bản nối hai màn hình nằm ở `docs/frontend/workspace-prototype.html`. Tương tác B8 chỉ dùng dữ liệu synthetic trong bộ nhớ; bố cục tinh chỉnh cần chủ dự án xem, không tự coi là đã nghiệm thu production. B9/B10 trong bản này chỉ giải thích điều kiện; form thao tác sẽ làm sau. `DESIGN.md` ghi lại hệ thống thị giác đang sử dụng để agent tiếp tục nhất quán.

### D30 — Nhiều thị trường, điều hướng ba cấp

Chủ dự án xác nhận nhu cầu nghiên cứu nhiều thị trường và yêu cầu cập nhật UI. Điều hướng: **Tất cả thị trường → Workspace khám phá của một thị trường → Hồ sơ sản phẩm**. Trang đầu hiển thị các thị trường; trang thị trường chứa nghiên cứu chung, rổ ứng viên và hồ sơ đã tách sau B7. Thị trường chưa có sản phẩm vẫn có thể tiếp tục khám phá.

Sản phẩm giữ nguồn gốc thị trường để điều hướng, nhưng hồ sơ và quyết định sau B7 độc lập. Không tự đồng bộ quyết định giữa sản phẩm/thị trường. Không suy ra cùng thực thể từ tên. Bản demo dùng liên kết ID riêng; API tạo/list thị trường và read model production vẫn chưa xây. Nút Tạo nghiên cứu mới chỉ tạo workspace demo trống, không tự chạy thu thập hoặc phát sinh phí.

### D31 — Duyệt prototype nhiều thị trường; triển khai frontend demo trên Fedora

Chủ dự án xác nhận hài lòng với `docs/frontend/workspace-prototype.html` sau cập nhật nhiều thị trường và yêu cầu tiến hành bước tiếp theo. Bản này là visual source of truth cho Task 033 React + Vite + TypeScript; không hỏi chọn lại layout hoặc reference. Task đầu tiên chuyển UI sang React bằng synthetic state, sau đó mới xây API/read và hành động OWNER thật. Chủ dự án yêu cầu bỏ qua LSP; không tạo task cài/cấu hình LSP.

### D32 — UX B7–B10 phải nói rõ trạng thái, điều kiện và quyền thao tác

Mỗi route B8, B9 và B10 chỉ hiển thị bảng hành động của chính bước đó; context bước trước có thể ở dạng chỉ xem. Điều hướng đến bước tương lai không đồng nghĩa được phép hành động. Giao diện phải giải thích bền vững gần nút bị vô hiệu hóa: runtime ghi không khả dụng, OWNER đang khóa, input chưa hợp lệ, thay đổi chưa lưu, điều kiện nghiệp vụ chưa đủ, request đang xử lý hoặc xung đột vừa tải lại.

B9 phân biệt rõ “Chưa có bản nháp”, “Bản nháp đã lưu · Chưa khóa”, “Có thay đổi chưa lưu” và “STP chính thức đã khóa”; lưu không phải khóa. B10 chỉ cho quyết định khi có locked STP đã xác minh và APPROVE phải nói rõ chỉ đủ điều kiện B11, trong khi B11 chưa triển khai. B7 HOLD có thể mở form tạo phiên bản kế tiếp của đúng basket family với lựa chọn editable; việc mở form không ghi dữ liệu và quyết định HOLD cũ vẫn bất biến. Đây là làm rõ UX của policy hiện có, không thêm gate hoặc quyền mới.

### D33 — Content Studio là phần Nội dung (B11–B13); D26 chỉ áp dụng khi chiến dịch liên kết sản phẩm nghiên cứu

Chủ dự án duyệt ngày 25/09/2026: Content Studio được viết lại trong Growth OS thành mục “Nội dung” (B11 Insight, B12 Big Idea và Góc khai thác, B13 Caption và Poster; không có bước Draft, không có video), cùng “Thương hiệu” (nhiều thương hiệu, danh mục sản phẩm/dịch vụ có gói) và “Thư viện prompt”. Chiến dịch có thể tự nhập Insight mà không cần nghiên cứu; liên kết sản phẩm nghiên cứu là tùy chọn. Quy tắc D26 (đóng băng đúng B10 `APPROVE` đang hiệu lực khi B11 bắt đầu) chỉ áp dụng cho chiến dịch có liên kết đó. AI chỉ đề xuất; mọi áp dụng, lựa chọn và xóa do người dùng quyết định. Chi tiết: ADR 0003 và Task 047.

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

### D25 — B8 v1 gồm bốn lane độc lập, owner vận hành bằng nút

B8 v1 có đúng bốn lane độc lập: **LEGAL**, **SCIENTIFIC**, **QUALITY** và **FINANCE**. `OWNER` là system actor duy nhất được phép quyết định trong v1. Owner tự điều phối mọi thẩm định bên ngoài hoặc offline rồi trực tiếp bấm nút; tài khoản chuyên gia và enforcement vai trò chuyên gia để sau.

Mỗi quyết định chỉ là **PASS**, **HOLD** hoặc **REJECT**. B8 là button-only như B7: không yêu cầu hoặc lưu reason, rationale, notes, explanation, evidence reference, attachment, reviewer name hay văn bản do AI tạo. AI không được submit quyết định B8.

B9 chỉ ở trạng thái sẵn sàng khi effective decision mới nhất của cả bốn lane đều là PASS. Task 029 chỉ ghi lịch sử quyết định append-only và đọc trạng thái sẵn sàng; không bắt đầu B9, không tạo B9 clearance, không đổi `entryStep` hay mutate product workspace, và không tạo task hoặc hành động bên ngoài. Một task tương lai sẽ đóng băng đúng bốn PASS decision ID trước khi vào B9.

### D26 — B10 v1 là một quyết định kết hợp; B11 tương lai phải đóng băng đúng APPROVE hiệu lực

B10 v1 có một quyết định nghiệp vụ kết hợp cho cả phê duyệt danh mục/portfolio và quyền nhận funding; không tách thành hai gate. Chỉ `OWNER` bấm một trong `APPROVE`, `HOLD`, `REJECT`, không lưu budget, amount, currency, kỳ/trần/lịch cấp vốn, reason, rationale, notes, explanation hay khuyến nghị AI. `APPROVE` đồng thời phê duyệt sản phẩm cho danh mục/portfolio và cho phép sản phẩm nhận funding; không tự phân bổ hoặc giải ngân tiền.

Nhấn nhầm được sửa bằng lịch sử quyết định bất biến, append-only. Mỗi correction phải trỏ đúng quyết định hiện đang hiệu lực và đổi sang một trạng thái khác; lịch sử cũ vẫn replay độc lập. Chỉ quyết định hợp lệ mới nhất có hiệu lực. Task 032 không xây B11 hoặc policy reopening sau B11.

Quy tắc chuyển tiếp bắt buộc cho implementation B11 tương lai: khi B11 bắt đầu, nó phải đóng băng đúng quyết định B10 `APPROVE` đang hiệu lực tại thời điểm đó. Chính sách có cho sửa/mở lại B10 sau khi B11 đã bắt đầu hay không vẫn là future work và không được tự suy diễn từ Task 032.

### D03 — Workspace khám phá vẫn mở

Không đóng workspace B0–B7 khi có candidate PASS. Người dùng có thể khám phá thêm hoặc tiếp tục nghiên cứu khi chưa candidate nào PASS. Các workspace sản phẩm đã tách tiếp tục độc lập.

### D04 — 60 câu hỏi là nền phân tích; phạm vi ban đầu xét đủ 60

Chủ dự án chọn xét toàn bộ 60 câu hỏi, thay vì tự động chỉ chọn một phần. Điều đó không có nghĩa tất cả câu hỏi phải có câu trả lời chắc chắn ngay khi bắt đầu nghiên cứu.

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

### D10 — B0 để sau; chưa xác nhận giá trị nghiệp vụ

Ngày 08/09/2026, chủ dự án cho biết chưa rõ B0 có nghĩa gì hoặc có cần thiết hay không, và yêu cầu để tương lai như B14. Giữ tên “Khóa định hướng chiến lược” làm nhãn tạm, không xóa hoặc đánh lại số flow.

Chưa định nghĩa form, input/output, người duyệt, tiêu chí hoàn thành hay gate B0. Không yêu cầu hoàn thành B0 trước khi nghiên cứu các bước còn lại. Các gợi ý trước đây về mục tiêu, thị trường và ràng buộc chỉ là đề xuất chưa được duyệt, không phải yêu cầu bắt buộc.

Quyết định này thay thế điểm tiếp tục phỏng vấn B0 trước đó; chưa kết luận B0 vô ích hoặc bị loại bỏ vĩnh viễn.

### D11 — Báo cáo tổng quan; chat AI và layout để sau

Chủ dự án muốn đầu ra nghiên cứu dạng báo cáo/dashboard tổng quan, trực quan, bắt mắt, có dữ liệu, tóm tắt và kết luận. Chưa chốt bố cục chi tiết. Các mục tóm tắt nhanh, thị trường, cạnh tranh, cơ hội, bất định và kết luận do assistant đề xuất vẫn là gợi ý, không phải yêu cầu đã duyệt.

Khả năng hỏi AI về báo cáo là mong muốn tương lai; chưa triển khai trong scope ban đầu. Thiết kế layout và giao diện dashboard chi tiết cũng để sau. Không suy ra phải xây dashboard tương tác ngay để giao phần nghiên cứu.

### D12 — Nghiên cứu chạy theo yêu cầu ban đầu

Chủ dự án xác nhận chỉ chạy nghiên cứu khi người dùng yêu cầu. Không tự chạy theo lịch hoặc tự làm mới nghiên cứu trong phạm vi ban đầu. Cách nhập yêu cầu, chọn dữ liệu và xử lý một lần yêu cầu cập nhật chưa chốt; quyết định này không tự định nghĩa lịch thu thập dữ liệu Box 1 hoặc cho phép gọi nhà cung cấp.

### D13 — Hệ thống thu thập dữ liệu mới khi được yêu cầu

Chủ dự án xác nhận hệ thống sẽ thu thập dữ liệu mới cho lần nghiên cứu được yêu cầu, không chỉ dựa vào file nhập thủ công. Chủ dự án dự định kết nối các nguồn sau:

- KaloData và Metric.vn: dữ liệu thương mại điện tử Việt Nam.
- Apify: thu thập bình luận/đánh giá trên Shopee.
- Google Trends API: dữ liệu xu hướng tìm kiếm.
- Google News API: dữ liệu tin tức.

Đây là danh sách nguồn dự kiến do chủ dự án cung cấp, không phải xác nhận connector đã hoàn thành hoặc API chính thức đã khả dụng. Nhà cung cấp/endpoint cụ thể (đặc biệt Trends và News), quyền truy cập, giới hạn, chi phí và phạm vi dữ liệu cần được kiểm tra khi tích hợp. Không lưu credentials trong tài liệu hoặc Git.

Không tự thêm nguồn khác; khi có khoảng trống bằng chứng cụ thể thì đề xuất cho chủ dự án. Thu thập dữ liệu mới không đồng nghĩa mọi nguồn cập nhật tức thời; báo cáo cần phân biệt thời điểm lấy dữ liệu với kỳ dữ liệu nguồn. Cách xử lý nguồn lỗi, dữ liệu thiếu/cũ và ngân sách mỗi lần chạy chưa chốt. Chưa có provider call hoặc thay đổi implementation từ quyết định này.

### D14 — Tiếp tục báo cáo thiếu nguồn; tái sử dụng E0–E5

Chủ dự án đồng ý tiếp tục tạo báo cáo một phần khi nguồn không khả dụng, ghi rõ dữ liệu/nguồn thiếu và không đưa ra kết luận phụ thuộc vào bằng chứng chưa có. Chủ dự án yêu cầu dùng lại phân loại E0–E5 đã có.

Đã tìm thấy định nghĩa gốc trong `references/data-warehouse-master-handoff.html`, mục “Evidence Level System (E0–E5)”:

| Mức | Định nghĩa trong tài liệu gốc |
|---|---|
| E0 | Nguồn chính thức đã xác minh; tài liệu gốc mô tả API chính thức, đã kiểm chứng, thời gian thực |
| E1 | Nguồn chính thức, chưa đối chiếu kiểm chứng |
| E2 | Bên thứ ba đã hiệu chuẩn/đối chuẩn |
| E3 | Bên thứ ba chưa hiệu chuẩn/kiểm chứng |
| E4 | Dữ liệu suy ra/tính toán từ dữ liệu khác |
| E5 | Ước tính/giả định cần xác minh |

Lưu ý thiết kế: bảng này trộn nguồn gốc, mức kiểm chứng và cách tạo dữ liệu; không tự chuyển thành phần trăm tin cậy. E4 không mặc nhiên kém chính xác hơn E3. Thiếu dữ liệu là trạng thái riêng, không tự gán E5 hoặc biến thành số 0. Ví dụ KaloData/Metric được ghi E2 trong tài liệu cũ không tự chứng minh mọi dữ liệu mới của hai nguồn đã được hiệu chuẩn.

Khoảng cách kỹ thuật đã kiểm tra: code hiện lưu `grade` và `basis` với nhãn `synthetic`, `unverified`, `provider_reported`, `corroborated`, `verified`; chưa dùng trực tiếp enum E0–E5. Mapping, tiêu chí kiểm chứng và cách áp dụng cho bằng chứng/kết luận cần chốt khi triển khai, không tự thay schema trong phiên phỏng vấn này. Giữ lý do phân loại và nguồn truy xuất, không gán cấp chỉ theo tên provider.

### D15 — Đường kết nối thực tế và tài sản tái sử dụng

Chủ dự án làm rõ:

- KaloData/Metric: truy cập qua đăng nhập Google OAuth trên website theo mô tả của chủ dự án, agent tự đăng nhập với CloakBrowser. Đã làm trên Windows với OpenClaw; chưa thiết lập trên Fedora. Không coi đây là API dữ liệu OAuth đã được xác nhận; cần kiểm tra luồng đăng nhập và xuất dữ liệu thực tế.
- Apify: chủ dự án có API và số dư; hiện chủ yếu dùng Actor lấy Shopee comments. Actor ID/link, input schema, output mẫu và giới hạn chi phí mỗi lần chạy chưa được cung cấp. Có thể đề xuất scrape khác nếu cần, không coi số dư là ngân sách không giới hạn.
- SerpApi là nhà cung cấp cụ thể cho Google Trends, News và có thể Shopping. Không gọi các kết nối này là API chính thức do Google cấp. Shopping/engine khác là năng lực khả dụng để cân nhắc, chưa tự thêm vào scope đầu tiên.

Tài liệu đã kiểm tra: [CloakBrowser](https://github.com/CloakHQ/cloakbrowser), [Apify API](https://docs.apify.com/api/v2), [SerpApi engines](https://serpapi.com/search-engine-apis). CloakBrowser có wrapper Python/JavaScript kiểu Playwright; điều này không chứng minh đăng nhập Google/KaloData/Metric trên Fedora đã chạy được. Apify có luồng chạy Actor và lấy dataset; SerpApi liệt kê Trends, News và Shopping.

Đã đọc toàn bộ file `C:/Users/Admin/Desktop/shopee_review_filter.py`, chưa chạy hoặc sửa. Script nhận bảng Markdown rồi xuất JSON kept/removed; không phải Apify connector. Tái sử dụng được chuẩn hóa tiếng Việt, tách guided fields/metadata, phân loại noise/signal, lý do loại và xếp hạng review. Đây là heuristic chuyên canxi, không phải fact-check hoặc thang E0–E5.

Các điểm cần xử lý khi tích hợp, chưa phải thay đổi đã làm:

- Adapter từ output Actor thực tế; kiểm tra input rỗng, star không hợp lệ, UTF-8 output và dùng hàm không tự chạy I/O khi import.
- Dedup hiện theo nội dung chuẩn hóa trên toàn bộ input, không theo sản phẩm; có thể làm mất phân bổ review giữa sản phẩm. Cần giữ lineage và số lượng nguồn gốc.
- Score ưu tiên tín hiệu tiêu cực/sao thấp; không dùng phân bố tập đã lọc để kết luận tỷ lệ hài lòng toàn thị trường.
- Bộ lọc loại/giảm tín hiệu giá, vận chuyển, dịch vụ và tin cậy cửa hàng. Đề xuất giữ raw bất biến, tạo view lọc riêng cho product experience để không mất dữ liệu có ích cho nghiên cứu khác. Chưa tự áp dụng bộ lọc này làm quy tắc loại toàn kho.

Chủ dự án ưu tiên tốc độ, không muốn security quá nặng. Giữ tối thiểu credentials/session ngoài Git và log, không đưa vào prompt; khi cần xác thực bổ sung thì yêu cầu người dùng. Chưa login, truy cập tài khoản, gọi API trả phí hay thiết lập Fedora trong phiên này.

Đề xuất thứ tự triển khai, chưa chốt: Apify Shopee + filter có phạm vi rõ trước; SerpApi Trends/News sau; kiểm tra khả năng tái sử dụng browser flow KaloData/Metric trên Fedora riêng. Không cần thêm nguồn chỉ để mở rộng danh sách.

### D16 — Actor Shopee đã được xác định

Chủ dự án cung cấp [zen-studio/shopee-product-reviews-scraper](https://apify.com/zen-studio/shopee-product-reviews-scraper/api/python). Đã đọc API example, Input và README công khai; chưa chạy Actor.

Tài liệu yêu cầu `startUrls`; có `starFilter`, `contentFilter`, `maxReviewsPerProduct` (0 là không giới hạn theo cấu hình). Output mẫu có `reviewId`, `itemId`, `shopId`, `ratingStar`, `comment`, thời gian và `templateTags`. README mô tả summary riêng theo sản phẩm. Đây là mô tả provider, chưa phải output thực tế đã xác minh.

Đề xuất dùng JSON trực tiếp vào logic filter, không vòng qua Markdown. Cần giữ product identity, đối chiếu templateTags thực tế và không tự coi sample documentation là schema đã kiểm thử. Có thể bắt đầu thiết kế offline; kiểm tra live vẫn cần URL sản phẩm và giới hạn lần chạy được duyệt. Actor này nhận URL sản phẩm, không tự giải quyết bước từ chủ đề rộng đến danh sách sản phẩm.

### D17 — Nguồn danh sách sản phẩm: Metric “Sản phẩm bán chạy”

Chủ dự án xác nhận thường lấy URL Shopee từ mục “Sản phẩm bán chạy” của Metric. Đây là đường tìm sản phẩm đầu vào cho Actor reviews, không cần mặc định thêm Actor tìm kiếm sản phẩm riêng.

Đã kiểm tra phần này trong `C:/Users/Admin/Downloads/TDN Research Pipeline - canxi calcium - 2026-08-14/metric html version.html`: có tên sản phẩm, gian hàng, giá, rating, số đánh giá, doanh số/sản lượng theo kỳ và tổng; giao diện lưu đang chọn “Tổng doanh số”, “Giảm dần”, 20 sản phẩm/trang. Danh sách có dữ liệu đa nền tảng; cần chọn đúng sản phẩm Shopee trước khi gửi Actor.

Chủ dự án làm rõ: đây là HTML tải xuống, không phải trang live; trên phiên web Metric có thể click vào sản phẩm. Việc không tìm thấy href/URL Shopee trong bản lưu không chứng minh trang live thiếu đường truy cập sản phẩm.

Giới hạn xác minh: đã kiểm tra HTML tĩnh, chưa thao tác phiên Metric live. Tiếp tục theo đường click sản phẩm trên web để lấy URL Shopee; đích click trực tiếp hay qua trang chi tiết và cách thu URL chính xác cần xác minh khi tích hợp. Không đoán link từ tên sản phẩm hoặc thêm search scraper chỉ vì bản HTML lưu không có link.

Luồng dự kiến: Metric danh sách sản phẩm → chọn listing Shopee và lấy URL hợp lệ → Apify reviews → lưu raw → view lọc → bằng chứng cho báo cáo. Số sản phẩm, tiêu chí xếp hạng/lấy mẫu và giới hạn reviews chưa chốt. “Sản phẩm bán chạy” là nguồn lấy mẫu, không tự đại diện mọi phân khúc thị trường.

### D18 — Bestseller là listing, không mặc nhiên là sản phẩm duy nhất

Chủ dự án nêu hai trường hợp phải xử lý trong danh sách Metric:

- Cùng một sản phẩm xuất hiện ở nhiều shop/người bán/nhà phân phối.
- Cùng một sản phẩm xuất hiện trên nhiều nền tảng, thường Shopee và TikTok Shop.

Vì vậy, thứ hạng khác nhau không tự đồng nghĩa sản phẩm khác nhau. Cần phân biệt sản phẩm nghiệp vụ với listing theo nền tảng và người bán. Giữ riêng nguồn, rank, kỳ dữ liệu, doanh số và review của từng listing; không xóa listing chỉ vì cùng sản phẩm hoặc chuyển review giữa seller/platform.

Nguyên tắc đề xuất khi triển khai, chưa phải schema hoặc matching policy đã duyệt:

- Shopee dùng platform + shopId + itemId để nhận diện listing. TikTok dùng định danh listing riêng; không gửi URL TikTok vào Actor review Shopee.
- Nhóm listing về cùng sản phẩm khi có đủ thuộc tính đối chiếu; tên gần giống không đủ. Khác hàm lượng, quy cách, số viên hoặc combo có thể cần tách variant/offer; quy tắc chưa chốt.
- Khi không chắc, giữ listing riêng và đánh dấu chưa xác định liên kết; không ép gộp.
- Báo cáo phân biệt số listing và số sản phẩm đã xác định duy nhất. Chưa tự cộng doanh số hoặc suy ra số người mua duy nhất giữa shop/platform; cần kiểm tra kỳ, đơn vị, phạm vi và trùng bản ghi trước tổng hợp.
- Phạm vi lấy review đã được chốt tiếp ở D19: một listing Shopee đại diện cho mỗi sản phẩm, chọn theo doanh số trong kỳ nghiên cứu cao nhất. Đây là quyết định sampling và ngân sách, không phải dedup kỹ thuật đơn thuần.

Không thay schema, chạy matching hoặc thu thập dữ liệu trong lần ghi nhận này.

### D19 — Một listing Shopee đại diện cho mỗi sản phẩm

Chủ dự án chọn lấy review từ một listing Shopee đại diện khi cùng sản phẩm xuất hiện ở nhiều shop. Không chạy Actor reviews trên mọi listing trùng sản phẩm trong phạm vi ban đầu.

Quyết định này giới hạn lấy mẫu review, không xóa các listing khác khỏi dữ liệu thị trường. Review và kết luận dựa trên mẫu phải giữ liên kết về listing/shop được chọn, không mặc nhiên đại diện mọi người bán hoặc nền tảng.

Chủ dự án đã đồng ý tiêu chí chọn: listing Shopee có doanh số trong kỳ nghiên cứu cao nhất trong nhóm cùng sản phẩm đã xác định. So sánh cùng kỳ, theo doanh số tiền bán hàng, không theo số lượng bán hoặc doanh số tích lũy toàn thời gian. Không dùng thứ hạng đa nền tảng để gửi listing TikTok vào Actor Shopee.

Chưa chốt cách xử lý bằng doanh số hoặc thiếu doanh số cùng kỳ; không tự thay bằng tổng doanh số toàn thời gian. Việc chọn listing không làm review của listing đó đại diện cho toàn bộ sản phẩm trên mọi shop.

### D20 — Giới hạn ban đầu: top 5 sản phẩm, tối đa 500 comments mỗi sản phẩm

Chủ dự án chọn 5 sản phẩm đứng đầu sau khi xử lý listing trùng sản phẩm, mỗi sản phẩm lấy tối đa 500 comments từ một listing Shopee đại diện theo D19. Giới hạn mục tiêu là tối đa 2.500 comments cho một lần nghiên cứu; không cam kết nguồn luôn có đủ số lượng. Không áp dụng đề xuất trước đó của assistant là 10 sản phẩm × 200 reviews.

500 là giới hạn thu thập trước bộ lọc nội dung, không phải số comment phải giữ lại sau lọc; không tự scrape bù vượt giới hạn để đạt 500 comments đã lọc. Ghi rõ số thực lấy và số giữ/loại. Thiếu dữ liệu vẫn theo D14.

Chủ dự án muốn người dùng có thể chỉnh số sản phẩm và số comments thủ công trong tương lai, nhưng chưa xây chức năng đó ở scope hiện tại. Giữ các giá trị trong cấu hình nội bộ rõ ràng để dễ thay đổi khi cần; không tạo UI/editor cấu hình lúc này.

Cách chọn top 5 ban đầu được chốt ở D21: lọc Shopee trước rồi đi theo doanh số trong kỳ. Xếp hạng đa nền tảng để tương lai; không tự cộng doanh số các listing để tạo thứ hạng mới. Mức tiền cho live run và chính sách retry vẫn cần giới hạn riêng; 2.500 comments không đồng nghĩa cho phép chi tiêu không giới hạn.

### D21 — Shopee trước; Shopee + TikTok Shop trong tương lai

Chủ dự án đồng ý cách chọn cho phiên bản đầu tiên:

1. Lọc danh sách Metric chỉ còn listing Shopee.
2. Sắp xếp doanh số trong kỳ nghiên cứu giảm dần.
3. Đi xuống danh sách, nhóm các listing đã xác định là cùng sản phẩm; lấy đến 5 sản phẩm khác nhau. Listing đầu tiên của mỗi nhóm là đại diện theo D19.
4. Thu thập tối đa 500 comments cho mỗi listing đại diện theo D20. Nếu thiếu sản phẩm/dữ liệu, ghi rõ phạm vi thực tế thay vì tạo đủ giả định.

Đây không phải xếp hạng theo tổng doanh số cộng gộp của mọi shop. Quy tắc xác định cùng sản phẩm/variant và xử lý bằng doanh số vẫn cần nêu rõ trong spec; chưa tự coi tên giống nhau là trùng sản phẩm.

Chủ dự án yêu cầu tương lai hỗ trợ cả Shopee và TikTok Shop. Không xây connector reviews TikTok, cơ chế chọn đại diện đa nền tảng hoặc xếp hạng gộp trong scope hiện tại. Giữ nhận diện platform rõ ràng để mở rộng sau; chưa quyết định quota chia theo nền tảng, ranking hay chính sách sampling đa nền tảng.

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
| Cần chốt B0 trước khi tiếp tục phỏng vấn | B0 giữ tên tạm trong roadmap; hoãn cùng B14, không là gate hiện tại |

## Khoảng cách với implementation hiện tại

Baseline code lúc ghi nhận: `f845c5abab6b37f3c71f4225c6831a5c04a3c24e`, sau merge Task 014.

- Task 011: immutable proposal; Task 013: decision foundation; Task 014: authorized-plan shell không thực thi.
- Chưa triển khai workspace khám phá/sản phẩm, split B7, B0–B14 nghiệp vụ đầy đủ hay tích hợp framework 60 câu.
- Task 013 hiện có APPROVE/REJECT/HOLD với terminal rules hẹp. Không tự đồng nhất với toàn bộ PASS/HOLD/REJECT, reconsideration và quyền B7.
- Workspace độc lập là yêu cầu nghiệp vụ, chưa phải quyết định tạo database/repository riêng. Baseline vẫn một modular monolith, một SQLite.
- Task 012 verdict REVISE; chưa có production Pi adoption.

## Điểm tiếp tục phỏng vấn

Chủ dự án đã duyệt triển khai Task 015 không cần login Metric: dùng file listing (synthetic khi test, operator cung cấp khi live) cho toàn bộ downstream. Metric browser collector tiếp tục pending. Implementation bắt đầu trên nhánh local `feature/015-file-shopee-research`; chưa có live call.

Đã chuẩn bị brief `docs/tasks/015-on-demand-shopee-research.md` cho lát cắt đầu tiên và lưu baseline script ở `references/reuse/shopee_review_filter.v3.py`. Các xử lý kỹ thuật còn mở trong brief là đề xuất implementation, không phải quyết định nghiệp vụ mới. Chưa dispatch/implementation/live run.

**Điểm dừng mới:** Đã xác nhận hướng báo cáo tổng quan (D11), nghiên cứu chỉ chạy khi được yêu cầu (D12), và hệ thống thu thập dữ liệu mới qua các nguồn dự kiến (D13). Chat AI về báo cáo và layout chi tiết để sau. Không còn câu hỏi B0 đang chờ trả lời.

**Đã trả lời:** Tiếp tục báo cáo khi thiếu nguồn, flag dữ liệu thiếu và dùng lại E0–E5 theo D14. D15 xác định cách truy cập từng nguồn và script có thể tái sử dụng.

**Thông tin kết nối:** Actor đã xác định theo D16; nơi lấy danh sách sản phẩm là Metric “Sản phẩm bán chạy” theo D17. D18 ghi nhận trùng sản phẩm giữa seller/platform. Cách trích URL live/export, output Actor thực tế và giới hạn chi phí/số lượng chưa xác minh/chốt; không cần gửi token qua chat. Mapping E0–E5 còn mở.

**Đã trả lời:** Lấy review từ một listing Shopee đại diện cho mỗi sản phẩm (D19).

**Đã trả lời:** Chọn listing Shopee cùng sản phẩm có doanh số trong kỳ nghiên cứu cao nhất (D19); top 5 sản phẩm × tối đa 500 comments mỗi sản phẩm (D20); lọc Shopee trước, sắp xếp doanh số trong kỳ rồi lấy 5 sản phẩm khác nhau (D21). Chỉnh giới hạn thủ công và hỗ trợ cả Shopee + TikTok Shop để tương lai. Đủ quyết định chọn mẫu để chuẩn bị spec Task 015; chưa có implementation/live run được thực hiện từ cuộc phỏng vấn.

Các câu hỏi tiếp theo chỉ mở khi có đủ ngữ cảnh:

- Input/output và điều kiện hoàn thành từng bước B1–B7?
- Ai quyết định B7 và theo tiêu chí nào; HOLD được mở lại ra sao?
- Chính xác những gì được mang sang workspace mới tại B7?
- “Phê duyệt danh mục và cấp vốn” tại B10 nghĩa gì trong từng workspace sản phẩm độc lập?
- Thiếu dữ liệu trong 60 câu được thể hiện và ảnh hưởng gate như thế nào?
- Vai trò thẩm định tại B8, khóa STP B9 và phê duyệt B10?

Không quay lại đào sâu B0, insight, framework versioning, B14, chat AI về báo cáo hoặc layout dashboard khi chủ dự án chưa chủ động mở lại.

## Cách duy trì

- Sau câu trả lời có quyết định mới, cập nhật đúng mục và ngày; giữ mã Dxx ổn định.
- Đề xuất chưa xác nhận nằm ở “Chưa chốt”, không ghi thành quyết định.
- Khi người dùng đổi ý, ghi quyết định mới và lý do thay thế; Git giữ lịch sử.
- Không cập nhật phần trăm hoàn thành từ cuộc phỏng vấn; chỉ từ bằng chứng implementation/nghiệm thu.
- Chỉ chuyển thành spec/code task khi scope cần xây đã đủ rõ.


### D23 — Shopee calcium filter retains product-use experiences only

On 09/09/2026 the owner narrowed the Shopee calcium review view to concrete reported product-use experiences. This supersedes the earlier proposed broader scope that could include buying information.

Qualifying experiences cover taste, smell, swallowing, opening/preparation, tolerability, and perceived effects or lack of effects. Price, shipping/service, authenticity reassurance, purchase motivation, hearsay without a concrete product-use attribute or effect, and repurchase alone do not qualify. Hearsay attribution does not disqualify an otherwise qualifying attribute or effect. Generic praise, repeated use, or merely starting use without a concrete experience are insufficient. Mixed comments remain eligible when they contain a qualifying experience, and guided-field labels alone cannot establish one. Negation must be preserved: for example, “not difficult to drink” is not a complaint.

This is a deterministic filtering policy for a research view, not validation of a health claim or causal relationship. Retention does not imply firsthand experience or truth, and hearsay attribution remains in the original text. Raw review text remains immutable outside the filtered view. Numeric scoring weights, product-scoped deduplication, collection limits, and raw-text preservation remain unchanged.

### D24 — Chính sách quyết định B7 owner-only v1

Chủ dự án xác nhận B7 v1 là gate **chỉ OWNER**: trusted actor phải có `roleSnapshot` chính xác `OWNER` và capability `governance:candidate-b7-review`. AI có thể hỗ trợ chuẩn bị và phân tích ở nơi khác nhưng không được submit quyết định B7. Kết quả duy nhất là **PASS / HOLD / REJECT**; request, artifact và storage không yêu cầu hoặc lưu rationale/reason/notes/explanation.

**PASS** chỉ cho phép một bước tương lai, độc lập, tạo product workspace; Task 027 không tạo workspace ngay. PASS không phê duyệt cấp vốn, pháp lý, tuyên bố khoa học, nhà cung cấp, xuất bản, launch, hay bất kỳ gate B8–B10 nào. **HOLD** chỉ được xem xét lại bằng một basket version tương lai; không sửa hoặc ghi đè quyết định cho basket/member/version hiện tại.

D24 thay thế ngôn ngữ D02 yêu cầu/giữ lý do và phần chưa chắc chắn về ai quyết định hoặc cách reconsideration. D02 vẫn là bối cảnh lịch sử cho ba kết quả, nhưng policy owner-only và semantics không-rationale/reconsideration tại đây là authoritative cho B7 v1.

### D32 — Ranh giới B3 candidate basket v1

B3 v1 đóng băng một tập các **exact candidate revision** trong một discovery workspace đang ACTIVE. Một basket family được nhận diện bằng `workspaceId + basketKey`; version phải nối tiếp từ v1, lịch sử append-only và exact retry không tạo bản mới. Read model chỉ phát các trường an toàn cần cho UI và replay toàn bộ basket bằng verified reader; mọi drift artifact/row/workspace/candidate trả lỗi integrity chung.

Việc tạo basket không chấm điểm, xếp hạng, so sánh, chọn PASS/HOLD/REJECT, tạo B7 decision hay product workspace, sửa candidate, chạy research/provider/AI, hoặc xóa/sweep artifact. Workspace ID chỉ đến từ URL OWNER API; request-scoped staging chỉ phục hồi đúng canonical basket artifact bị thiếu của exact committed retry.

### D33 — OWNER B7 API/UI boundary v1

B7 thao tác trên đúng một member revision của một candidate basket đã đóng băng, với route được scope bởi `workspaceId + basketId`; body chỉ chứa `candidateId`, `candidateVersion` và một quyết định **PASS / HOLD / REJECT**. Backend lấy actor OWNER và capability `governance:candidate-b7-review` từ cấu hình tin cậy, không nhận actor, rationale, reason, notes, evidence hay text AI từ caller.

Một exact basket/member/version chỉ có một quyết định bất biến: request giống hệt là exact retry không mutation; request đổi quyết định là conflict. Basket thuộc workspace khác, candidate revision không phải exact member, hoặc stored row/artifact/manifest drift đều fail closed. Read model trả effective state theo từng frozen member nhưng không tự tạo product workspace; PASS vẫn chỉ mở đường cho bước tạo product workspace độc lập trong tương lai.


### D34 — Tạo product workspace từ exact B7 PASS là hành động OWNER riêng

Sau một quyết định B7 `PASS`, OWNER phải chủ động tạo đúng một product workspace độc lập qua hành động riêng được scope bởi `workspaceId + basketId + decisionId`; không tự động tạo workspace khi bấm PASS. Body chỉ nhận `productWorkspaceKey`, còn ID, thời gian, tiêu đề, trạng thái `ACTIVE`, entry step `B8` và toàn bộ source snapshot lấy từ exact verified PASS. `HOLD`/`REJECT`, sai lineage hoặc decision không thuộc URL scope đều fail closed.

Mỗi exact B7 PASS chỉ tạo tối đa một product workspace và mỗi key chỉ nhận diện một workspace. Exact retry không mutation; key hoặc PASS đã gắn identity khác là conflict. Read model B7 chỉ gắn product-workspace summary sau khi replay và đối chiếu toàn bộ frozen workspace/basket/candidate/decision lineage; nó không suy ra product từ tên và không tự chuyển bước B8. Hành động này không cấp quyền pháp lý, khoa học, chất lượng, tài chính, B9/B10, funding, supplier, publication, launch, provider hoặc AI execution.

### D35 — Integrated operator runtime chỉ dành cho một operator local

Frontend production đã build, verified read API, optional OWNER API và health endpoint cùng chạy trên một process/origin loopback; mặc định canonical là `http://127.0.0.1:8787`. Normal mode dùng persisted data; synthetic state chỉ qua `?mode=demo` có nhãn rõ. OWNER writes mặc định tắt; khi bật, token mạnh và actor ID chỉ là local development authorization giữ trong memory/shell, không phải public hoặc production authentication.

Runtime này dành cho một trusted operator trên chính Fedora host: không bind wildcard/LAN, không port-forward hoặc expose internet. Systemd, reverse proxy, TLS, remote/multi-user access, production auth, backup/restore và deployment là future work. Quyết định vận hành này không thay đổi semantics, authority hoặc gate B3–B10.

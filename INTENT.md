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
- Phạm vi lấy review đã được chốt tiếp ở D19: một listing Shopee đại diện cho mỗi sản phẩm. Tiêu chí chọn listing còn mở; đây là quyết định sampling và ngân sách, không phải dedup kỹ thuật đơn thuần.

Không thay schema, chạy matching hoặc thu thập dữ liệu trong lần ghi nhận này.

### D19 — Một listing Shopee đại diện cho mỗi sản phẩm

Chủ dự án chọn lấy review từ một listing Shopee đại diện khi cùng sản phẩm xuất hiện ở nhiều shop. Không chạy Actor reviews trên mọi listing trùng sản phẩm trong phạm vi ban đầu.

Quyết định này giới hạn lấy mẫu review, không xóa các listing khác khỏi dữ liệu thị trường. Review và kết luận dựa trên mẫu phải giữ liên kết về listing/shop được chọn, không mặc nhiên đại diện mọi người bán hoặc nền tảng.

Tiêu chí chọn listing đại diện chưa chốt. Gợi ý để thảo luận: ưu tiên listing Shopee có doanh số trong kỳ nghiên cứu cao nhất trong nhóm cùng sản phẩm đã xác định; chưa coi gợi ý này là quy tắc đã duyệt. Không dùng thứ hạng đa nền tảng để gửi listing TikTok vào Actor Shopee.

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

**Điểm dừng mới:** Đã xác nhận hướng báo cáo tổng quan (D11), nghiên cứu chỉ chạy khi được yêu cầu (D12), và hệ thống thu thập dữ liệu mới qua các nguồn dự kiến (D13). Chat AI về báo cáo và layout chi tiết để sau. Không còn câu hỏi B0 đang chờ trả lời.

**Đã trả lời:** Tiếp tục báo cáo khi thiếu nguồn, flag dữ liệu thiếu và dùng lại E0–E5 theo D14. D15 xác định cách truy cập từng nguồn và script có thể tái sử dụng.

**Thông tin kết nối:** Actor đã xác định theo D16; nơi lấy danh sách sản phẩm là Metric “Sản phẩm bán chạy” theo D17. D18 ghi nhận trùng sản phẩm giữa seller/platform. Cách trích URL live/export, output Actor thực tế và giới hạn chi phí/số lượng chưa xác minh/chốt; không cần gửi token qua chat. Mapping E0–E5 còn mở.

**Đã trả lời:** Lấy review từ một listing Shopee đại diện cho mỗi sản phẩm (D19).

**Câu tiếp theo, chưa trả lời:** Tiêu chí chọn listing đại diện là gì? Đề xuất ưu tiên doanh số trong kỳ nghiên cứu cao nhất trong các listing Shopee cùng sản phẩm chưa được duyệt.

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

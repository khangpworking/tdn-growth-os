# Kế hoạch sửa luồng tự động cho đủ 30 section

Ngày: 2026-10-02. Trạng thái: chủ dự án đã duyệt điều chỉnh thứ tự triển khai. Đợt 1 đã có bằng chứng Linux (804 backend, 195 frontend); Market và Insight triển khai song song, điều phối sở hữu nối nguồn/API/UI và nghiệm thu xuyên suốt. Đây chưa phải nghiệm thu đủ 30 section hoặc quyền thay runtime. GPT 6.1 Sol high phụ trách hai nhánh code độc lập; Claude Opus 5.5 high phụ trách review thiết kế khi có bản trình bày để kiểm tra.

### Điều chỉnh đã duyệt sau checkpoint đợt 1

- M03 temporal v1 và M08 generic quote v1 đã có code offline, kiểm thử và business review có giới hạn. Việc còn lại là nhận đúng dữ liệu nguồn, nối vào automation và lưu/replay kết quả; không quay lại thiết kế từ đầu. Query window không tự chứng minh additivity; giá listing không tự là giá đúng variant/pack.
- Đợt 2 và 3 dưới đây chạy song song. Mốc tích hợp kế tiếp là **một cặp Market + Insight từ cùng run, qua UI → nguồn → phương pháp → web/PDF**, có quan sát/quote thực và phần thiếu đọc được. Không chờ viết xong mọi adapter mới thử xuyên suốt.
- Gắn mỗi blocker với một loại: `SOURCE_MISSING` (cần nguồn/quyền), `INTEGRATION_MISSING` (có nguồn/method nhưng chưa nối), `METHOD_UNSUPPORTED` (ngoài phép tính được duyệt), hoặc lỗi xử lý cụ thể. Không gom chúng thành một nhãn “thiếu dữ liệu”. Đây là phân loại theo dõi, không tự đổi enum API hiện hành.
- Chứng minh code bằng fixture synthetic và nghiệm thu nội dung trên dữ liệu thật là hai việc riêng. Mốc sớm không thay nghiệm thu ba case ở đợt 5, và không hạ mẫu số 30 section.

Theo dõi thực thi: [inventory 30 phương pháp](../research/automation-method-execution-inventory.md) và [bằng chứng đợt 1](../handoffs/research-remediation-wave1.md).

### Kết quả tham vấn nghiệp vụ ngày 2026-10-02

Session **Review marketing framework files** xác nhận cầu nối raw Kalodata → gói nguồn thật → M05/M06 và M07 inventory không xếp hạng nằm trong A41. Mỗi observation phải giữ capture digest, field pointer, query window, mapping revision và trạng thái giá trị. Gói JSON chuẩn hóa không tự chứng minh timezone, additivity, category hay peer membership. M03 nhiều kỳ/tăng trưởng, M08 giá theo đơn vị ngoài dạng viên và đầu vào synthesis ngoài FACT packet cần contract phiên bản mới; không chuyển coding/hypothesis thành FACT để vượt kiểm tra. Thạch dừa cần đúng listing Shopee đã yêu cầu, không thay bằng sản phẩm TikTok gần giống. Các điều kiện này bổ sung chi tiết triển khai, không thay các giới hạn bên dưới.

### Phụ lục 2026-10-02: chốt nghiệm thu nội dung trước khi code tiếp (checkpoint `53538fc`)

Bổ sung, không thay các mục lịch sử bên dưới. Đây là đề xuất của Claude chờ GPT audit, chưa phải nghiệm thu.

- Ma trận 30 section, điều kiện tối thiểu cho từng case và hành động tiếp theo nằm ở [research-content-acceptance-v1.md](research-content-acceptance-v1.md). Mẫu số vẫn là 30.
- Phân loại theo dõi thêm `EVIDENCE_MISSING/SEMANTICS_UNVERIFIED` (có nguồn nhưng thiếu nghĩa/trường/quan hệ được chứng minh) và `OWNER_DECISION` (chỉ cho quyền, scope/peer/brief chưa xác định hoặc kích hoạt mới). `INTEGRATION_MISSING` ở trên được đọc là `MAPPING_OR_INTEGRATION_MISSING`. Không đổi enum API.
- Bằng chứng đã kiểm tra chỉ đọc: cả ba case chỉ có capture Kalodata, chụp ở baseline `9355f57` trước khi có exact URL intake. Thạch dừa không chọn sản phẩm nào, không có collection. Bình giữ nhiệt và Quạt có M05/M06/M07 giới hạn từ ba sản phẩm do auditor chọn. Không case nào có corpus review thật trong các artifact đã xem. Nguồn ở nơi khác: NOT_VERIFIED.
- Việc code tiếp đề xuất là ngày review và trạng thái trong kỳ/ngoài kỳ/chưa rõ ngày cho corpus (C1). Việc này chờ kiểm tra chỉ đọc RC-1 để xác định đúng trường ngày; không đoán tên trường. I04 chưa được chọn vì chưa có corpus thật và bảng rule chưa pin.

GPT audit sau kiểm kê nguồn: C1 chưa được giao triển khai. Chưa tìm thấy page
Task 016 trong các kho đã kiểm tra; collection cũ đã đọc không có dòng review.
Ngày chưa rõ chỉ chặn kết luận theo kỳ và WIDE, không chặn toàn bộ phân tích
định tính có gắn nhãn bối cảnh. Việc tìm listing cho case từ khóa vẫn do hệ
thống hỗ trợ; M07 inventory chưa hoàn thành câu hỏi so sánh peer. Xem
[kết quả kiểm kê độc lập](../handoffs/research-source-inventory-20261002.md).

Phạm vi: Market M01-M13 và Insight I01-I17 trong tính năng Nghiên cứu tự động. Giữ thiết kế báo cáo đã duyệt, hai web view và hai PDF riêng của cùng một phiên bản dữ liệu bất biến. Không thay Content Studio hoặc chính sách B7-B10.

## 1. Vấn đề và kết quả phải đạt

Ba bài thử Thạch dừa, Bình giữ nhiệt và Quạt cầm tay đã chứng minh: xuất được HTML/PDF và qua kiểm thử kỹ thuật chưa đủ để nghiệm thu báo cáo. Luồng tự động hiện chưa đưa dữ liệu qua các phương pháp phân tích đã có.

Mục tiêu sửa là làm cho từng section có đường thực thi thật: đầu vào xác minh được, phương pháp đúng phạm vi, kết quả lưu được, biểu đồ/bảng/nội dung có bằng chứng và hướng xử lý nếu chưa chạy được. Không dùng việc hiển thị đủ 30 tiêu đề làm tiêu chí hoàn thành.

Cần theo dõi riêng:

1. Năng lực: phương pháp đã duyệt, có implementation, đã nối vào automation, đã nghiệm thu nội dung hay chưa.
2. Từng lượt nghiên cứu: nguồn nào thực sự có, phần nào tính được, phần nào chỉ là quan sát hoặc đề xuất, phần nào cần dữ liệu hay quyết định.
3. Phát hành: đã review/CI, đã triển khai commit nào, người dùng đã nghiệm thu gì.

Hỗ trợ 30/30 section không có nghĩa mọi sản phẩm luôn có đủ bằng chứng cho 30 kết luận. Một gate dự báo làm việc đúng vẫn không phải dự báo hoàn thành. Tuy vậy, ghi BLOCKED cho mọi mục cũng không được coi là sửa xong hệ thống.

## 2. Hiện trạng đã đối chiếu

Baseline kiểm tra: `9355f57187437fdc22089fecdcffba612fe7673f`, nhánh `fix/research-real-world-audit` có thay đổi chưa commit. Không dùng các trạng thái triển khai trong tài liệu lịch sử thay cho kiểm tra code hiện tại.

| Vấn đề | Bằng chứng hiện có | Hướng sửa |
|---|---|---|
| Mất dữ liệu Kalodata | `vn` bị parser từ chối; observations bị bỏ khi chuyển thành step result; bảng chỉ lấy nhóm đầu | Giữ bản sửa đang có, review và tích hợp trước |
| Báo đã thu dù không chọn sản phẩm | Collection rỗng trước đây vẫn mang trạng thái collected | Phân biệt không thực hiện, thực hiện nhưng rỗng và lỗi |
| Luồng mới không chạy phương pháp | `research-automation/reports.ts` hiện chỉ nhận scope, collection và captures; có 5 mục ngữ cảnh và bảng M07 hẹp, chưa nhận method artifacts | Nối run vào các dịch vụ/phương pháp đã xác minh; renderer chỉ trình bày đầu ra |
| Nguồn chưa được nối đầy đủ | Registry có Kalo/Serp; Metric chờ export; Apify Shopee chưa có connector xác minh trong đường automation | Lập kế hoạch thu đa nguồn theo nhu cầu từng method, không coi có API key là đã tích hợp |
| Scope mới là ý định lưu lại | Renderer ghi rõ chưa áp đầy đủ bộ lọc nguồn và CORE/WIDE | Chuẩn hóa scope thành rule có phiên bản, lưu kết quả áp rule và UNKNOWN |
| Phương pháp có code nhưng đầu vào chưa tự hình thành | A42/A43/A44 có descriptive methods, located coding và gates/packets; đường generation cũ chọn source-package/descriptors | Tạo đầu vào hợp lệ từ nguồn thật, không yêu cầu người dùng viết JSON phương pháp |
| Phạm vi phương pháp hẹp hơn tên section | M03 single-period; M08/P4 cho quote dạng viên; M10 chỉ gate; qualitative cần corpus/coding | Tái sử dụng đúng giới hạn; bổ sung có phiên bản khi cần mở rộng |
| Bộ nghiệm thu chưa bắt được báo cáo rỗng | Test xuất file không chứng minh giá trị phân tích | Thêm nghiệm thu nội dung tại ranh giới run → methods → saved report |

Bản sửa trước kế hoạch này đã replay offline 103 phản hồi lưu lại. Bình giữ nhiệt và Quạt cầm tay mỗi case giữ được 39 cửa sổ detail và 78 giá trị metric; Thạch dừa khôi phục 4 detail phục vụ discovery nhưng chưa có collection đúng listing Shopee. Đây là bằng chứng sửa thất thoát dữ liệu, không phải bằng chứng đủ thị trường hoặc đủ 30 section. Chi tiết ở [biên bản sửa](research-real-world-data-repair.md).

> Cập nhật điều hành 03/10/2026: xem [kế hoạch thực thi v2.2](research-automation-execution-plan-v2.vi.md) đã được GPT và Claude thảo luận, trình OWNER. Bản mới thay thứ tự/checklist triển khai; các ranh giới nghiệp vụ và authority phương pháp bên dưới vẫn giữ. Đồng thuận kế hoạch không phải bằng chứng đã code, merge hoặc deploy.

## 3. Kiến trúc sửa và những gì không xây thêm

Luồng đề xuất:

```text
Sản phẩm/từ khóa + phạm vi người dùng xác nhận
  → kế hoạch nguồn và kiểm tra khả năng đáp ứng từng đầu vào
  → thu hoặc gắn đúng nguồn đã lưu, giữ nguyên bytes và kỳ thực tế
  → chuẩn hóa + scope membership + kiểm tra độ phủ
  → chạy các phương pháp đủ điều kiện, độc lập theo dependency
  → lưu kết quả tính và coding, rồi tạo diễn giải AI có giới hạn nếu được phép
  → chốt snapshot báo cáo
  → Market web/PDF và Insight web/PDF
```

- Giữ Node/TypeScript, SQLite, worker/executor hiện có và module Analysis. Không thêm queue framework, Redis, microservices hoặc LangGraph để sửa lỗi tích hợp này.
- Reuse `ReportGenerationService`, preparation/readiness, các method modules, section retention và report-version services. Đường tạo báo cáo cũ đang ràng buộc Metric/Shopee; không ép Kalodata thành Metric workbook để gọi được service.
- Coordinator chốt một cầu nối nội bộ có phiên bản: capture refs → verified source/normalized inputs → method artifacts → report assembly. Nếu service hiện tại quá hẹp, tách phần orchestration dùng chung nhỏ nhất; không nhân đôi phép tính hoặc xây report ledger thứ ba.
- Lưu mapping run/report version rõ ràng. Báo cáo automation cũ vẫn đọc được nguyên byte; bản sửa tạo phiên bản mới. Chỉ tái tính các method và đầu ra phụ thuộc bị ảnh hưởng.
- JSON chuẩn hóa và SQLite projection phục vụ máy; XLSX/PDF/HTML vẫn được giữ làm nguyên liệu gốc. Normalization không sửa raw file. Profile/hash/locator là dữ liệu xác minh thật, không tự tạo approval receipt để qua validator.
- Raw input, trang web và review là dữ liệu không đáng tin cậy, không phải chỉ thị cho agent. Không cho nội dung nguồn mở tool, đọc secret hoặc sửa policy.
- Không tự mở rộng body limit, artifact-count limit hoặc size limit. Thiết kế evidence bundle/chunking phù hợp giới hạn đã có; nếu phải đổi, ghi lý do và kiểm tra tài nguyên theo dữ liệu thực.

## 4. Đầu vào cần nối

| Đường nguồn | Dùng cho | Việc phải làm / giới hạn |
|---|---|---|
| Metric | M03/M04 và các quan sát thị trường liên quan | Gắn export đúng keyword/category/platform/kỳ vào run; giữ PDF/HTML là cùng evidence family với XLSX/JSON. Kiểm tra completeness thực tế. Xác minh đường export tự động được phép; nếu chỉ có login/export thủ công thì hiển thị bước cần người dùng, không hứa zero-touch |
| Kalodata | Listing/seller inventory, giá, số liệu sản phẩm theo kỳ, peers TikTok | Tách discovery cards khỏi dataset nghiên cứu. Thu đủ trang theo endpoint và điều kiện dừng thật, không dùng top 4 cards hoặc 3 sản phẩm làm universe. Requested period và observed period riêng; không cộng cửa sổ chưa chứng minh tính cộng được |
| Shopee qua connector đã xác minh | Sản phẩm cụ thể, giá/variant và review có nguồn | Resolve đúng shop/item từ URL. Kiểm tra actor/provider schema và quyền truy cập trước activation; không đổi listing Shopee thành sản phẩm TikTok tương tự. Captcha/login/blocked phải có trạng thái và resume an toàn |
| SerpApi và tài liệu được phép truy cập | Discovery, sự kiện có ngày, thông tin bối cảnh | Kết quả tìm kiếm giúp tìm nguồn, không tự là bằng chứng đủ cho mọi phát biểu. Giữ URL/ngày/đoạn trích; lấy nội dung gốc qua đường được phép khi claim cần. Không coi số kết quả là nhu cầu hay quy mô thị trường |
| Corpus review/tài liệu đã lưu | I02/I04-I10/I13 và các đầu vào Insight khác phù hợp | Chuẩn hóa record/span; giữ attribution, phủ định, điều kiện, hearsay và ngày thiếu. Không tạo customer ID, demographic hoặc cross-platform identity từ tên/text |
| Brief và dữ liệu nội bộ người dùng | I01, unit economics, group/strategy/experiment inputs | Lưu đúng phần người dùng cung cấp, có thể UNSET. Không suy ra margin, cost, mục tiêu hoặc quyết định từ keyword |

Không có một nguồn duy nhất thay được tất cả các hàng trên. Có tiền/quota không bảo đảm dữ liệu tồn tại hoặc tài khoản được phép truy xuất.

Scope Việt Nam và kỳ người dùng đã chọn được giữ nguyên. Discovery gần đây không thay thế kỳ báo cáo năm. Khả năng endpoint, lịch sử truy cập, giới hạn mỗi query, pagination/export cap và quota tài khoản là các trường riêng, cần kiểm tra tại thời điểm chạy; không lấy khuyến nghị cũ làm giới hạn API hiện hành.

Khi một nguồn lỗi, các method không phụ thuộc nó tiếp tục. Lỗi shape lặp lại phải dừng lane đó để sửa adapter; không tiếp tục trả phí cho cả dải thời gian với cùng parser hỏng. Retry transient có giới hạn/backoff; request tính phí có kết quả không rõ phải đối soát, không retry mù. Ghi chi phí/points/calls theo nguồn và phần chưa xác định, không quy đổi points thành USD khi thiếu cơ sở.

## 5. Ma trận sửa đủ 30 section

Các cột dưới mô tả đầu ra phải nghiệm thu, không tuyên bố chúng đã chạy. A41 adoption và code A42-A44 là baseline. Mở rộng phương pháp ngoài baseline cần phiên bản mới và business review, không sửa tài liệu đã duyệt tại chỗ.

### Market: 13 section

| ID | Section | Công việc và đầu ra cần có | Điều kiện / trường hợp không được kết luận |
|---|---|---|---|
| M01 | Kết luận chính | Tổng hợp các claim thực sự đã có; số liệu render từ calculation; bản tóm tắt AI tách riêng, có nguồn và giới hạn | Chạy sau các dependencies liên quan; thiếu bằng chứng không sinh kết luận mặc định; draft không là human approval |
| M02 | Phạm vi và phương pháp | Requested/observed scope, kỳ từng nguồn, CORE/WIDE/UNKNOWN, phương pháp thực sự đã chạy | Không sao chép một đoạn scope cho tất cả mục; intent không là bằng chứng filter đã được áp |
| M03 | Quy mô và diễn biến | Nối preparation và phép tính exact; subtotal/total đúng loại; phần diễn biến chỉ từ chuỗi tương thích | Không dùng Kalo sample để gọi quy mô toàn thị trường. Multi-period trend là mở rộng cần review, không giả định single-period code đã làm được |
| M04 | Cơ cấu thị trường | Dùng full MetricScopeOutput với nhóm/mẫu số; bảng nhóm và chart share khi được phép | Thiếu/mâu thuẫn mẫu số thì chỉ bảng quan sát; không dựng share từ verified summary thiếu arrays |
| M05 | Nhu cầu | Nối literal-source measures và các partition tương thích; trình bày sales/search theo đúng tên nguồn | Không đổi search/sales thành nhu cầu tổng; cộng chỉ khi chứng minh không chồng lặp |
| M06 | Nguồn cung | Inventory listing/shop/offer theo trạng thái nguồn; counts theo khóa thật, coverage rõ | Listing không bằng sản phẩm độc lập; không suy ra stock/capacity/toàn bộ cung |
| M07 | Đối thủ | Nối owner-declared anchor/peers và toàn bộ comparable groups; ảnh/mô tả có nguồn; bảng/chart cùng metric và kỳ | Selection gần giống không tự thành peer approval; near-duplicates không tự được gọi là thương hiệu/đối thủ khác nhau |
| M08 | Giá và kinh tế đơn vị | Giá/variant/pack quan sát; mở rộng adapter chuẩn hóa đơn vị theo loại hàng sau business review | Không áp tablet P4 cho thạch dừa, bình hay quạt. Không có cost thì không tính margin/profit; chưa có unit basis thì giữ giá listing |
| M09 | Động lực và rủi ro | Sự kiện có nguồn/ngày/entity và bằng chứng trái chiều; driver hypothesis tách khỏi fact | Không tự gán nhân quả, xác suất hay impact score |
| M10 | Dự báo và kịch bản | Gate nêu rõ chuỗi, split/gap/policy còn thiếu; trình bày phạm vi chưa hỗ trợ | Forecast production và baseline diagnostic chưa được kích hoạt; gate chạy xong không tính là dự báo hoàn thành |
| M11 | Cơ hội | Bundle claim liên quan và counterevidence; hypothesis có nguồn, không xếp hạng | Không biến giả thuyết thành nhu cầu đã xác thực hay ROI |
| M12 | Hành động | Gói lựa chọn, constraints và câu hỏi quyết định; option AI khác option/hành động của owner | Không tự chọn, giao việc, cấp tiền hoặc thay B7/B10 |
| M13 | Phụ lục và truy nguồn | Manifest, locator, mapping, coverage, exclusions, receipts; mở đúng evidence từ claim | Hash chỉ chứng minh integrity; không chứng minh provider hoặc nội dung luôn đúng |

### Insight: 17 section

| ID | Section | Công việc và đầu ra cần có | Điều kiện / trường hợp không được kết luận |
|---|---|---|---|
| I01 | Câu hỏi kinh doanh | Brief đúng câu hỏi/mục tiêu/scope người dùng cung cấp; đề xuất AI nếu có phải đánh dấu đề xuất | Keyword không tự chứa audience, objective hoặc quyết định; trường thiếu là UNSET |
| I02 | Khách hàng và hoàn cảnh | Context có quote/span và attribution từ corpus | Không dựng persona, tuổi/giới tính hoặc identity từ suy đoán |
| I03 | Phương pháp nghiên cứu | Corpus manifest, inclusion rules, đơn vị phân tích, codebook, coverage/pending và giới hạn lấy mẫu | Số review không phải số người; giữ đúng ngày thực tế và ngày chưa biết |
| I04 | Hành vi | Coding hành động/không hành động, thử/làm xong theo phát biểu gốc | Không suy động cơ hoặc conversion từ hành động |
| I05 | Cảm nhận và thái độ | Polarity có đối tượng, phủ định, mixed/unclear và quote | Không lấy sao đánh giá hoặc im lặng thay sentiment trong nội dung |
| I06 | Hành trình | Thứ tự sự kiện được nguồn nói rõ trong cùng record; diagram chỉ hiện bước có bằng chứng | Không dựng funnel/journey 5 bước mặc định hoặc nối người giữa records khi không có khóa thật |
| I07 | Lý do lựa chọn | Choice-reason cùng record, facets theo codebook đã pin | Hearsay giữ attribution; tính năng listing không tự là lý do mua |
| I08 | Rào cản | Attempted task và obstacle có quan hệ trong cùng record | Chê sản phẩm chưa đủ chứng minh rào cản |
| I09 | Nhu cầu chưa được đáp ứng | Desired state, current/failed state và quan hệ gap có quote chính xác | Mong muốn đơn lẻ hoặc phàn nàn đơn lẻ chưa đủ; không suy rộng toàn thị trường |
| I10 | Chủ đề và mối quan tâm | Counts/tỷ lệ trong corpus đã đóng băng, đơn vị N rõ, bảng pending/multi-code | Coding chưa hoàn tất thì không có tỷ lệ cuối; pending không thành zero và không biến mất khỏi denominator |
| I11 | Khác biệt giữa các nhóm | Nối descriptive group inventories bằng group policy và source assignment thật | Không đoán demographic; rates/differences vượt implementation hiện có phải review riêng; không infer population/significance |
| I12 | Điểm tiếp xúc | Presence, exposure và outcome tách rõ bằng chứng | Không biến mention count thành attribution/conversion hoặc hiệu quả kênh |
| I13 | Thương hiệu và đối thủ | Brand/content mention có locator; literal counts theo corpus; peer comparison chỉ khi được xác nhận | Không gộp alias/entity tùy ý hoặc gọi mention share là market share/awareness |
| I14 | Hướng cơ hội | Direction bundles và option AI riêng, với supporting/counter claims | Không tự chọn hoặc chấm điểm hướng ưu tiên |
| I15 | Định hướng chiến lược | Alternatives/constraints và evidence liên quan; so sánh nội dung, giữ decision mở | Không bịa budget/capability hoặc tự phê duyệt chiến lược |
| I16 | Thử nghiệm và đo lường | DESIGN_ONLY hoặc kiểm tra protocol/results có sẵn, đúng phạm vi code | Không tạo kết quả experiment giả; không chạy survey/recruitment hay ước lượng effect ngoài method được duyệt |
| I17 | Phụ lục và bằng chứng | Corpus/coding/claim trace tới exact span; disposition và lỗi thiếu nguồn đọc được | Citation resolve không thay semantic review; không xuất author identifiers không cần thiết |

M08 generic unit normalization và M03 temporal đã có contract/implementation offline trong checkpoint hiện tại; phần mở rộng ngoài những operation đã duyệt vẫn cần business review. Nối được inventory không đồng nghĩa có phép tính giá chuẩn hóa hay tăng trưởng hợp lệ. Các mục advanced còn lại giữ giới hạn đã duyệt.

## 6. Năm đợt triển khai

### Đợt 1: khép lỗi hiện có và chốt đầu ra đúng

- Review bản sửa parser/no-selection/projection/multi-window đã có, giữ offline regression với response đã lưu. Không thu lại dữ liệu để chứng minh một lỗi parser.
- Lập executable inventory cho 30 ID: module/function, authority revision, required inputs, supported operation, output artifact và render mapping. Catalog chỉ cấp tên/order, không cấp method authority.
- Chốt trạng thái theo các chiều input readiness, execution, output kind và review. UI dịch thành: đang chờ nguồn, lỗi xử lý, có quan sát, có kết quả tính, nhận định chờ duyệt, hoặc ngoài phạm vi đã kích hoạt. Tái sử dụng contract hiện có, chỉ thêm enum khi đã rà integration.
- Chốt cầu nối capture/source-package, report-version và một vertical slice bằng retained data: input → method thật → retained output → section web/PDF. Không nhận một slice chỉ có provenance.

Điều kiện qua đợt: dữ liệu không còn bị bỏ giữa các lớp; ít nhất một method đủ input tạo kết quả thực trong luồng automation và replay không gọi provider. Các section chưa nối được báo đúng nguyên nhân. Đây chưa là release đầy đủ.

### Đợt 2: thu đủ đầu vào và chạy Market (song song đợt 3)

- Multi-source execution plan theo từng method; nối Serp, exact Shopee và run-bound Metric import; Kalo pagination/detail theo coverage cần thiết.
- Persist source scope/membership, requested/observed period, completeness, conflicts và UNKNOWN. Không lấy bộ card gợi ý làm mẫu nghiên cứu mặc định.
- Nối M02-M09/M13 trong phạm vi được duyệt, không dựng lại phép tính đã có. Dùng M03/M08 đã review; chỉ gửi semantic delta mới về business session.
- Xuất một Market report có tính toán hoặc so sánh thực, đồng thời nêu phần quy mô/diễn biến bị chặn nếu Metric hoặc coverage chưa đủ.

Điều kiện qua đợt: với fixture đủ nguồn, M03/M04 chạy đúng kết quả tính tay; M05/M06/M07/M09 tiêu thụ được normalized inputs thật. Với dữ liệu ba case, mỗi nguồn thiếu phải có lý do/action cụ thể. Không gọi report toàn thị trường nếu chỉ có selected listings.

### Đợt 3: corpus và Insight (song song đợt 2)

- Nối generic review/document normalization; giữ raw text và location. Không áp filter canxi hiện tại cho cả thực phẩm, đồ gia dụng và quạt.
- Xây descriptor từ corpus thực, chạy located methods A43. Literal mappings đã duyệt tự chạy; AI code suggestions có attempt riêng; mơ hồ cần disposition, không tự nhận HUMAN_REVIEWED.
- Nối I01-I10/I13/I17, gồm coverage/counts và render quote, theme, context, journey đúng dữ liệu. Giới hạn bundle/corpus lớn phải xử lý rõ, không truncate âm thầm.
- Bổ sung thao tác chỉ cho các input/disposition thực sự cần người dùng; tránh bắt nhập tay JSON hoặc duyệt từng mapping literal đã được chấp nhận.

Điều kiện qua đợt: corpus hợp lệ tạo được nội dung Insight có quote và coding thực. Một corpus thiếu relation không phải lỗi pipeline; phải có ca dương đủ relation và ca âm chứng minh method phân biệt được. N/N được kiểm bằng membership thực, không chỉ bằng số trên report.

### Đợt 4: tổng hợp có bằng chứng và phần nâng cao có giới hạn

- Nối M01/M11/M12/I14/I15 từ các claims thực. Mở rộng đường A44 hiện giới hạn packet FACT khi cần nhận descriptive/located results bằng contract có version và verified refs, không đổi nhãn để lách validation.
- Nối M10/I11/I12/I16 ở chế độ gate/inventory/design đã duyệt; nêu rõ thao tác nào chưa hỗ trợ.
- Nối AI interpretation qua lớp provider/attempt đã có, không viết provider client khác. Pin model/prompt/config/input/output; render numeric facts từ claim bindings. Regenerate tạo attempt mới, replay dùng output cũ.
- Kiểm tra citation tồn tại, hỗ trợ đúng câu, scope/period/unit, unsupported numbers và counterevidence. Human review còn cần cho diễn giải; validator không bảo đảm loại hết hallucination.

Điều kiện qua đợt: tổng hợp không lặp lại boilerplate; claim nào sử dụng đều truy được và không vượt nguồn. Không có auto business approval, forecast giả hoặc tự chọn chiến lược. Thiếu phần không liên quan không chặn toàn bộ summary.

### Đợt 5: nghiệm thu ba case và phát hành Fedora

- Replay dữ liệu đã lưu trước, chỉ thu bổ sung theo thiếu hụt đã xác định. Không chạy lại toàn flow tính phí mỗi lần sửa CSS hoặc renderer.
- Chạy lại ba case trên môi trường isolated; giữ snapshots mới cạnh bản cũ, không ghi đè báo cáo lịch sử.
- Kiểm tra nội dung, chart và citation trước visual polish. Hai report dùng cùng frozen version; có 6 PDF, screenshot các màn có ý nghĩa và bảng benchmark/cost cho ba case.
- Review nghiệp vụ bởi `Review marketing framework files` cho phần mới hoặc claim khó; review thiết kế Market/Insight bởi Claude session `Competitor mockup report design`; người dùng nghiệm thu cuối.
- Linux CI trên head release, scratch production-runtime smoke, rồi mới merge/activation theo quyền áp dụng cho release. Giữ localhost, paths/token/data và phục hồi có kiểm chứng.

Điều kiện qua đợt: không còn input đủ điều kiện bị bỏ hoặc method đã hỗ trợ bị bỏ qua; các nhu cầu nội dung đã chốt cho ba case đạt nghiệm thu. Nếu exact Shopee/Metric hoặc dữ liệu cần thiết vẫn không lấy được, ghi đây là blocker sản phẩm còn mở, không dùng một negative test để tuyên bố full automation hoàn thành.

## 7. Phân công để làm nhanh mà không đụng nhau

Coordinator sở hữu shared contracts, schema registration, migration nếu thật sự cần, service/worker orchestration, source/report identity, API registration, test strategy và release. Không chạy 30 agent cho 30 mục.

Sau checkpoint đợt 1, tối đa ba lane độc lập cùng một điều phối:

| Lane | Phần sở hữu | Dependency và handoff |
|---|---|---|
| A: Market | Cầu nối nguồn đã xác minh vào M03/M08; output và replay | Dùng Foundation package hiện có; UNKNOWN không thành phép tính; không cùng sửa orchestration với coordinator |
| B: Insight | Generic review corpus, raw quote/locator, sau đó located coding | Chạy song song Market; không dùng filter canxi hoặc giả codebook hoàn tất; không tự đổi authority |
| C: report và UX | Section render mapping, chart/table, blocker action, web/PDF/citation | Dùng semantic fixtures đủ/thiếu; không viết phép tính trong UI; giữ template đã duyệt |

Đợt hiện tại giao code/logic cho GPT 6.1 Sol high theo quyền owner đã cấp. Thiết kế giao Claude Opus 5.5 high; audit cuối dùng đúng session thiết kế. Không thay model âm thầm nếu runtime không hỗ trợ. Business session chỉ xử lý delta method/claim; không yêu cầu duyệt lại toàn bộ A41.

Mỗi lane giao implementation, fixture có expected result độc lập, focused proof và giới hạn. PR chia theo vertical slice/source-method family, không theo 30 tiêu đề. Merge theo dependency thật; shared integration có một writer.

## 8. Nghiệm thu nội dung, kiểm thử và benchmark

### Bộ bằng chứng cho từng section

Mỗi hàng trong inventory cần: input digest/locator, method+config revision, expected result, observed result, output kind, coverage, render/citation proof và trạng thái review. Mẫu số tiến độ luôn hiện đủ 30; số mục đủ điều kiện của run hiện riêng để không tăng tỷ lệ bằng cách bỏ mục bị chặn.

Không có quota số tests. Một hành vi có một nơi kiểm thử chính:

- Adapter/normalization: response shape thực đã khử thông tin riêng tư hoặc fixture synthetic tương đương, missing/zero, period, pagination, duplicate identity và wrong product/platform.
- Method: expected arithmetic/coding tính tay, scope/mẫu số, overlap, negation, hearsay, same-record relation và pending. Không dùng chính function đang test để tạo expected result.
- Integration: production services nhận normalized inputs và tạo method artifacts; query/report đọc lại đúng chúng. Đây là regression bắt lỗi 30 tiêu đề nhưng không thực thi.
- UI/report: nội dung và chart binding, blockers đúng action, saved version/retry; browser kiểm tra các luồng thay đổi thật, không chạy hàng trăm click cho mọi patch.
- Release: full `npm run check`, contracts/typecheck/build trên Linux; browser production build, hai loại PDF và restart/replay. Không chạy test/typecheck/build trên Windows.

Positive coverage phải có cho mọi operation đã hỗ trợ, kể cả operation không có input trong ba case. Có thể dùng fixture synthetic để chứng minh code; không trộn fixture vào báo cáo thật. Advanced operation chưa kích hoạt chỉ nghiệm thu gate của nó, không gán trạng thái analytic-complete.

### Ba case thực

| Case | Failure modes bắt buộc kiểm | Kết quả không được dùng để giả PASS |
|---|---|---|
| Thạch dừa Minh Châu, Shopee shop 78085196/item 17678138164 | URL identity, food/pack unit, review nguồn, exact product với category context riêng | Sản phẩm TikTok tương tự hoặc 7 request discovery thay cho nghiên cứu sản phẩm |
| Bình giữ nhiệt | Category membership, dung tích/variant, source coverage theo năm, peers được xác nhận | Top vài listing coi là toàn thị trường; listing count thành unique product |
| Quạt cầm tay | Near-duplicate S1 Pro, variant/shop identity, seasonality chỉ khi chuỗi hợp lệ | Bốn card gần giống thành bốn đối thủ độc lập; suy mùa vụ từ snapshot |

Trước mỗi real run, ghi rõ các đầu ra tối thiểu mong đợi dựa trên input đã xác minh và mục tiêu case. Không hạ mục tiêu sau khi thấy fail. Nếu thiếu evidence làm mục tiêu không đạt, xin bổ sung đúng nguồn hoặc giữ limitation/blocker ở handoff.

Benchmark ghi wall time và thời gian từng phase, số request thành công/lỗi/ambiguous, returned/retained/rejected records, windows/pages/gaps, số section có observation/calculation/AI draft/review, model tokens nếu có, cost/points và phần chưa đối soát. Không dùng call count làm thước đo đủ dữ liệu. Không đặt P99/load target chưa có nhu cầu thực.

### Biểu đồ

Mọi chart có measure/unit/period/scope, coverage, calculation ref và cách mở evidence. Share cần mẫu số; trend cần các kỳ tương thích; giá khác variant không gộp như cùng hàng; review chart chỉ nói corpus; journey chỉ có bước được ghi nhận. Thiếu dữ liệu thì bảng/quote hoặc blocker, không chart trang trí. Flint có thể hỗ trợ audit specification/render, không quyết định dữ liệu hoặc methodology.

## 9. Triển khai và phục hồi

Đọc runtime/checkout/schema thực tế khi chuẩn bị release, không dùng PID hoặc migration count lịch sử. Release checkout riêng, dependencies theo lockfile, build và scratch smoke trước khi chạm live.

Nếu có migration, thử trên bản sao, so sánh dữ liệu và đánh giá rollback compatibility trước. Xin thời điểm restart khi owner không còn unsaved edits. Dừng đúng executor, backup SQLite nhất quán cùng artifact manifest/tree và metadata cần thiết. Không reset/seed/backfill lịch sử âm thầm.

Khởi động một executor bằng paths/credentials hiện có; kiểm tra health, read APIs, report/evidence/PDF và replay. Runtime/readiness failure phải rollback theo compatibility đã kiểm; không restore backup đè lên write phát sinh sau deployment. R2 dùng cơ chế hiện có, không mở public bucket hoặc chuyển dữ liệu riêng tư chỉ để tiện download.

## 10. Điểm cần duyệt và điểm không cần hỏi lại

Không cần hỏi lại: Việt Nam, giữ kỳ owner chọn, ưu tiên đủ dữ liệu, tách Market/Insight, giữ thiết kế, UNKNOWN không vào WIDE, phép tính tái hiện được, AI/owner tách riêng, Linux-only tests và Fedora localhost.

Cần business review theo quyền owner đã giao: generic M08 unit/pack và M03 temporal method nếu bổ sung; codebook delta cần cho ngành mới; acceptance nội dung trước real run. Không tự suy approval từ việc code tồn tại.

Chỉ đưa owner blocker thực sự cần quyết định: nguồn yêu cầu quyền truy cập chưa có, semantic membership/peer/brief không thể xác định từ rule đã duyệt, hoặc đề nghị bật forecast/experiment/chọn strategy ngoài phạm vi. Phần thiếu không liên quan không dừng các lane độc lập.

Kế hoạch này không tự kích hoạt provider/deployment mới. Khi triển khai, ghi phạm vi quyền hiện có và release/run cụ thể; không hỏi lại ngân sách đã chốt nếu vẫn trong task, nhưng không suy một authorization cho mọi nghiên cứu tương lai.

## 11. Thứ tự bắt đầu và định nghĩa hoàn thành

Checkpoint sửa thất thoát và descriptive bridge đã qua Linux. Tiếp tục hai lane Market/Insight song song; coordinator nối exact listing, API/UI, lưu/replay và một cặp report xuyên suốt. Sau đó mới mở rộng semantic coverage theo dependency, không dành thêm một vòng chỉ viết lại 30 phương pháp đã có.

Một hàng được đánh dấu đã nối chỉ khi production automation thật sự gọi method và lưu output. Một hàng được đánh dấu đạt nội dung chỉ khi có bằng chứng riêng cho operation đó. Một report được nghiệm thu khi đáp ứng mục tiêu run, các limitation hiển thị rõ và người có thẩm quyền chấp nhận; việc tải PDF thành công không thay điều kiện này.

Không ước lượng ngày giao trước khi khép rủi ro source/bridge. Sau vertical slice đầu, dùng thời gian và blocker thực để cập nhật lịch. Báo tiến độ theo năm đợt và bảng 30 hàng, không dùng phần trăm method-spec làm phần trăm sản phẩm.

## 12. Căn cứ và audit của bản kế hoạch

- [A41 adoption](../research/method-configurations-v1-adoption.md) và [admission matrix](../research/method-configurations-v1/section-admission-matrix.md). Nhãn proposal trong packet lịch sử phải đọc cùng adoption.
- [A42 delivery plan](research-a42-live-report-delivery-plan.vi.md), [A43 located methods](research-a43-located-insight-methods.md), [A44 gates/packets](research-a44-gates-synthesis.md).
- [ADR execution](../adr/0006-research-automation-execution.md), [real-world repair](research-real-world-data-repair.md).
- Code đã đối chiếu: `research-automation/reports.ts`, `providers.ts`, `service.ts`, `source-binding.ts`, `report-generation-service.ts` và các method families tương ứng trong `src/modules/analysis/`.
- Đã đọc lại khuyến nghị scope/coverage của session `Review marketing framework files` (thread `01a0a8fd-02d2-7e71-ba4c-244930d054bd`). Không coi các giới hạn provider trong khuyến nghị lịch sử là xác nhận API hiện tại. Bản kế hoạch mới này chưa được session đó audit riêng.
- Audit tài liệu: đủ 13 Market + 17 Insight, không coi gate/context là analytical completion, không tự mở rộng A41, không hứa all-keyword data availability. Antislop áp dụng cho copy; không tạo hay nghiệm thu giao diện trong lượt lập plan.

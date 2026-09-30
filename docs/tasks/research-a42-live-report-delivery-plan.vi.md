# A42: Kế hoạch code hóa báo cáo và đưa lên web

Ngày lập: 2026-10-01. Trạng thái: kế hoạch triển khai; session nghiệp vụ đã
review phạm vi, chưa triển khai code hoặc activation trong lượt lập plan.

Mục tiêu của chủ dự án: code hóa hiệu quả các phương pháp đã chấp nhận cho
30 section, ưu tiên một bản web dùng được sớm. Chủ dự án đã có hai file HTML
giao diện Market Report và Insight Report; đang chờ đường dẫn để khảo sát.
Kế hoạch này chưa thực hiện merge, migration trên dữ liệu thật hay deployment.

## 1. Kết quả cần giao

Đưa lên web theo từng bản phát hành có thể sử dụng độc lập. Bản đầu mở được
báo cáo đã lưu, biểu đồ, bằng chứng và lịch sử. Bản kế tiếp cho phép chọn nguồn
đã nhập rồi tạo báo cáo bằng thao tác trên web. Các bản tiếp theo bổ sung nhóm
phương pháp và nhận định AI đã lưu. Không cần chờ mọi section có đủ dữ liệu để
phát hành phần đã hoạt động.

Chủ dự án đã chốt ngày 2026-10-01: Fedora localhost trước, domain sau.
Cloudflare không nằm trên đường tới bản phát hành đầu. Chưa xác minh runtime
Fedora đang chạy ở commit/schema nào hôm nay.

## 2. Hiện trạng đã kiểm tra

| Phần | Có thể tái sử dụng | Khoảng trống cần xử lý |
|---|---|---|
| Runtime | Node 24.15.0, npm 11.12.1, React/Vite/TypeScript, better-sqlite3; operator có read API và OWNER API | Chốt release commit, kiểm tra runtime/schema thực tế trên Fedora |
| Nguồn | Source-package intake giữ byte/hash/locator; normalization và SQLite projection; preparation/readiness | Profile Metric hiện chỉ hỗ trợ một dạng workbook cụ thể; không mặc định đọc được mọi file Metric/Kalodata |
| Tính toán | Bảy đường xử lý giới hạn: M02, M03, M04, M08/P4, M13, I03, I17 | Đây là phần năng lực trong section, chưa phải bảy section hoàn chỉnh |
| Lưu báo cáo | A10 ledger, exact retry, historical reader; A38/A39 prepared report, assembly và HTML | Đường tạo prepared report hiện qua CLI; cần nối thao tác web |
| Web | ResearchReportsPanel, chọn series/version, mở report.html, evidence, interpretation và readiness | Cần kiểm tra toàn luồng prepared profile qua API; chưa có form tạo prepared report |
| Phương pháp | A40 đủ 30 bản mô tả; A41 đã được session nghiệp vụ review và chủ dự án chấp nhận bốn gói | 23 recipe mới chưa trở thành code chạy chỉ nhờ được duyệt |
| Thiết kế | Có renderer/HTML preview cũ; chủ dự án có hai HTML mong muốn | Chưa đọc hai file mới, chưa biết asset, script, component và mapping dữ liệu |

GitHub được kiểm tra chỉ đọc ngày 2026-10-01: main ở
`31f1559d24aac2c886f4a7ecde5485511aaa736a`. Các PR research
#88, #89, #91 đến #100 vẫn open/draft; #98 tới #100 còn xếp chồng nhánh.
#100 ở `ea38e7f8295c8cbd61ec7776c4363958867c1f10`.
Không dùng trạng thái ghi trong tài liệu cũ làm bằng chứng chúng đã merge.

Handoff A38/A39 ghi Linux CI trên code head `8ede53d` đã qua 621 backend và
176 frontend tests, kèm browser acceptance của report đã lưu. Đây là bằng chứng
cho head đã kiểm tra, không thay thế CI của release sau tích hợp với main mới.

## 3. Cách rút ngắn đường tới bản live

1. Ưu tiên tích hợp backlog có sẵn trước khi mở thêm nhiều PR nền tảng.
2. Mỗi gói mới giao trọn một hành vi người dùng hoặc một nhóm phương pháp:
   contract, tính toán, lưu/replay, hiển thị và kiểm thử liên quan.
3. Dùng một hợp đồng đầu ra section nhỏ, có phiên bản, dựa trên assembly/A10
   hiện tại. Không tạo workflow engine, report ledger hoặc framework plugin mới.
4. Chỉ chạy các nhóm công việc có đường dẫn sở hữu độc lập song song. Điều phối
   chịu trách nhiệm shared files, contract registration, migration và tích hợp.
5. Method/codebook/renderer có phiên bản cụ thể. Chốt một lần cho mỗi batch;
   chỉ đưa lại session nghiệp vụ khi xuất hiện diễn giải mới hoặc mâu thuẫn thật.
6. Windows dùng đọc/sửa code và Git; kiểm thử, typecheck, build, browser acceptance
   chạy Linux. Giữ quy tắc test-audit: một nơi kiểm thử chính cho mỗi hành vi.

## 4. Các mốc phát hành

### L0: Đọc báo cáo trên web

Đây là mốc live sớm nhất, dùng báo cáo được operator chuẩn bị từ CLI hiện có.

- Tích hợp đúng các dependency research vào release chứa main mới nhất; review
  thay đổi thật, không squash hoặc đóng PR lịch sử tùy tiện.
- Xác minh index, history, readiness, mở HTML và evidence download cho prepared
  profile. Profile chưa hỗ trợ interpretation phải hiện trạng thái rõ ràng,
  không làm hỏng trang báo cáo.
- Chọn một package thực phù hợp profile, kiểm tra file và kỳ dữ liệu trước khi
  tạo bản báo cáo nội bộ. Khi nguồn chưa phù hợp, phát hành UI với trạng thái
  trống hoặc bản synthetic được ghi rõ; không tuyên bố đã nghiệm thu nguồn thật.
- Xác minh báo cáo đã lưu qua đúng API của operator. Reload/restart vẫn mở
  cùng version và byte; việc đọc không tính lại hoặc gọi model.
- Chuẩn bị release checkout, backup và smoke checks Fedora ở mục 10.

Nghiệm thu: người dùng mở workspace, chọn version, xem biểu đồ hợp lệ, đọc
bằng chứng và tải artifact. Các section thiếu đầu vào nêu rõ còn thiếu gì.
L0 chưa có thao tác tự tạo báo cáo trên web. Nếu hai HTML tới kịp và đã ghép
xong, L0 dùng chúng; nếu chưa, renderer hiện tại vẫn cho phép phát hành L0.

### L1: Tự tạo báo cáo từ nguồn đã nhập

Luồng: chọn workspace và source package -> kiểm tra phạm vi/kỳ/đầu vào -> xem
phần có thể chạy -> bấm Tạo báo cáo -> mở đúng version vừa lưu.

- Form hiển thị tên file, nguồn, kỳ và trường còn thiếu; digest, key và đường
  dẫn kỹ thuật do server quản lý. Người dùng xác nhận đúng nguồn/version.
- Nối OWNER API tới preparation, calculation/retention và ReportVersionService
  hiện có. Không gọi chuỗi CLI từ HTTP hoặc viết SQL xuyên module.
- Dùng khóa retry ổn định cho thao tác, predecessor rõ ràng, trạng thái pending,
  lỗi có hướng dẫn và khôi phục bằng đọc kết quả đã lưu sau mất kết nối.
- Lần đầu chỉ chọn package đã nhập. Có thể operator nhập file bằng công cụ
  hiện tại; chức năng upload trên web là phần mở rộng L1 khi thực sự cần.
- Một lỗi thiếu dữ liệu cục bộ cho ra partial report; lỗi hỏng byte/lineage
  không được biến thành section trống hoặc báo thành công.
- Đo thời gian bằng fixture đại diện trên Linux. Dùng request có giới hạn cho
  tính toán ngắn; nếu thực tế vượt khả năng phục vụ HTTP, dùng job/attempt
  durable nhỏ theo nền execution đã có. Không thêm Redis/queue chỉ vì dự đoán.

Nghiệm thu: từ dữ liệu đã nhập tới báo cáo bằng web; bấm lại/retry không tạo
bản trùng; chọn sai scope bị chặn có giải thích; version cũ không thay đổi.

### L2: Mở rộng nội dung Market và Insight theo nhóm

Giao từng nhóm dưới đây khi qua nghiệm thu, không đợi một đợt đủ 30 section.

| Nhóm | Section | Phạm vi code v1 | Điều kiện nghiệm thu chính |
|---|---|---|---|
| Kế thừa | M02, M03, M04, M08, M13, I03, I17 | Tái sử dụng bảy phương pháp giới hạn, nối đúng adapter/view | Số liệu và replay cũ giữ nguyên; M08 không có quote thì báo thiếu |
| Market mô tả | M05, M06, M07, M09 | Literal measure, inventory, peer comparison, dated events | Cùng kỳ/đơn vị/phạm vi; chứng minh disjoint khi cộng; không suy ra demand/rank/causality |
| Brief và coding | I01, I02, I04, I05, I06, I07, I08, I09 | Brief do owner nhập; context/action/attitude/order/reason/barrier/gap từ locator | Giữ phủ định/hearsay; cùng record khi phương pháp yêu cầu; không bịa người/ID/journey |
| Tổng hợp corpus | I10, I13 | Theme/mention inventory, accepted counts, n/N trong corpus | Corpus/codebook cố định; coding chưa hoàn tất phải hiện partial; mẫu số không làm mất pending |
| Gate và thiết kế | M10, I11, I12, I16 | Eligibility, group inventory, presence/exposure/outcome, design-only/existing-result gate | Không tạo forecast, significance, effectiveness hoặc kết quả thử nghiệm chưa diễn ra |
| Tổng hợp quyết định | M01, M11, M12, I14, I15 | Evidence bundles; owner options; nhận định AI tùy chọn được giữ riêng | Claim refs chính xác; AI không tự chốt kết luận, ưu tiên hay hành động |

Bảng phủ đủ 13 section Market và 17 section Insight. Có handler hoặc có gate
không có nghĩa section đã có kết quả. Dashboard tiến độ tách rõ: method đã
duyệt, code đã qua kiểm thử, input sẵn có, output đã chạy và đã được xem xét.

## 5. Ghép hai HTML vào TDN

Hai HTML là nguồn tham chiếu cho bố cục, biểu đồ, màu sắc và cách đọc báo cáo.
Các số liệu, lời kết luận hay script có sẵn trong HTML cần được kiểm kê trước
khi dùng; chúng không tự trở thành evidence của một report mới.

Gói UI thực hiện theo thứ tự:

1. Lưu bản tham chiếu và checksum; lập bảng từng vùng HTML -> section ID ->
   dữ liệu/claim/chart cần có -> hành vi khi thiếu dữ liệu. Không ép đổi nghĩa
   section để vừa tiêu đề hoặc con số mẫu trong thiết kế.
2. Lấy token CSS, font/asset và component từ HTML. Dùng React cho form, routing,
   trạng thái và lựa chọn version của operator; giữ renderer HTML deterministic
   cho báo cáo lưu trữ, in và tải về. Chia sẻ styling và view model nhỏ khi hữu ích.
3. Cung cấp hai cách đọc Market Report và Insight Report từ cùng version đã
   chọn, lọc theo M01-M13 và I01-I17. Giữ quan hệ nguồn/dependency khi đọc hoặc
   export riêng; không tạo hai lịch sử version trùng nhau chỉ vì có hai giao diện.
4. Mỗi chart lấy dữ liệu từ calculation artifact, hiện đơn vị/kỳ/phạm vi và
   đường tới bằng chứng. Thiếu denominator thì không dựng pie/share; thiếu
   chuỗi thời gian thì không vẽ trend giả. Các phần cần diễn giải AI có trạng
   thái chưa tạo hoặc chưa duyệt riêng.
5. Bản report chính ưu tiên nội dung và visual; thông tin hash/trace đặt trong
   phần mở rộng. Có điều hướng section, chỉ dẫn thiếu dữ liệu, loading/error,
   responsive, keyboard và chế độ in phù hợp mẫu thực tế.
6. Chạy browser acceptance qua production operator với CSP thật. Kiểm tra
   script/font/CDN trong HTML, thay phần không tương thích bằng asset của build;
   không nới CSP hoặc chèn HTML/script chưa kiểm soát vào trang OWNER.

Thay template không được tính lại số liệu hoặc viết đè HTML đã lưu. Lưu renderer
revision và hash của output. Kiểm tra khả năng rendition của ledger hiện tại;
nếu cần thêm metadata, bổ sung tối thiểu để render mới tham chiếu cùng semantic
content, trong khi artifact cũ vẫn tải lại đúng byte. Đổi method/input/AI attempt
theo quy tắc version tương ứng. Không tạo ledger báo cáo thứ hai.

Chỉ chốt chi tiết layout sau khi đọc hai file. Impeccable/Antislop dùng lúc ghép
và review thiết kế, giữ hướng của chủ dự án thay vì thiết kế lại từ đầu.

## 6. Hợp đồng chung và tính tái hiện

Coordinator chốt phần nối tối thiểu trước khi các lane bắt đầu viết:

- Input mỗi method xác định workspace, source/preparation, scope, kỳ/đơn vị,
  locator, method/config/codebook revision và dependencies thực sự cần.
- Output mở rộng assembly hiện có với section ID, trạng thái đã chạy/thiếu/gate,
  fact hoặc coding records, claim refs, limitations và chart/table projection.
  Schema riêng chỉ cho nội dung phương pháp mới; tái sử dụng references chung.
- Định danh calculation phụ thuộc exact input + method/config; cùng input tái
  dùng kết quả đã xác minh. AI output phụ thuộc attempt đã lưu; regenerate là
  attempt mới. Temperature thấp không phải bảo đảm tái hiện.
- Lớp nguồn, phép tính, nhận định AI và quyết định người dùng giữ riêng. Lưu
  giải thích có bằng chứng, assumptions và counterevidence; không lưu hidden
  chain-of-thought hay coi lý giải AI là chứng cứ nguồn.
- Codebook revision được pin; literal mapping chạy tự động trong phạm vi được
  duyệt. Chỗ mơ hồ được đưa vào hàng đợi xem xét. Approved UNCLEAR/UNCODED là
  disposition hoàn tất; pending không bị coi là zero hoặc bỏ khỏi mẫu số.
- Validation kiểm tra schema, numeric binding, identity và locator. Human
  semantic review xử lý tính đúng của diễn giải; không tuyên bố validator có
  thể phát hiện hết hallucination.

Không cần chuyển mọi tài liệu sang một database context mới. SQLite giữ record
và chỉ mục cần truy vấn; artifact store giữ file và byte nguồn. Excel chỉ là một
định dạng nhập. Mapping mới cho Kalodata/Metric khác profile phải dựa trên trường
thật và kỳ thật, không dùng fixture hoặc report đã hoàn thành làm dữ liệu nguồn.

## 7. Gói việc và phân công song song

Các mã W dưới đây là gói trong A42, không tạo thêm 30 task nền tảng riêng lẻ.

| Gói | Chủ trì | Việc giao | Phụ thuộc / điểm dừng |
|---|---|---|---|
| W0 Release integration | Codex điều phối | Lập dependency graph PR #88/#89/#91-100 bằng Git; review delta; tích hợp với main; final Linux CI; preflight Fedora | Là đường tới L0; không giả định các PR base main là độc lập; không merge tự động chỉ do plan |
| W1 Report presentation | Một agent UI | Khảo sát hai HTML, mapping và renderer/view adapters; Market/Insight views | Chờ file cho phần layout; có thể kiểm tra reader/API và tạo mapping rỗng trước |
| W2 Web generation | Một agent backend | Form input contract, package selection, OWNER route tới preparation/assembly, retries và errors | W0 cùng contract chung; shared route registration do coordinator tích hợp |
| W3 Market methods | Một agent code | M05/M06/M07/M09 từ accepted profiles, synthetic fixture và view model | Sau contract chung; không cần chờ coding corpus hoặc AI |
| W4 Insight methods | Một agent code | I01 và located coding I02/I04-I09, rồi I10/I13 counts | Sau codebook pin/shared references; cần corpus có locator; AI suggestion không bắt buộc để làm literal coding |
| W5 Gates and synthesis | Agent rảnh sau W3/W4 | M10/I11/I12/I16 gates; M01/M11/M12/I14/I15 bundles; optional AI adapter | Chỉ cần dependencies đúng section; live AI có bước riêng theo quyền hiện có |
| W6 Release verification | Codex và Fedora agent | Review tích hợp, Linux checks, browser journey, recovery/deployment checklist | Mỗi mốc L0/L1/nhóm L2 có thể phát hành độc lập |

Trong giới hạn bốn slot, chạy coordinator cùng tối đa ba lane. Wave đầu:
W0 + W1 + W2 + W3. Khi lane trống, đưa W4 vào; W5 theo sau các dependency thật.
Nếu chưa có HTML, ưu tiên W4 thay cho lane UI chờ. Không để agent làm placeholder
cho đủ người. Root tự review hoặc dùng slot đã rảnh cho independent review.

Các worker sở hữu file method/component mới trong phạm vi riêng. Coordinator
giữ độc quyền các file dễ va chạm: `src/modules/analysis/index.ts`, generator,
schema registry, `src/api/owner-api.ts`, `src/api/operator-app.ts`, App/data-source,
package manifests, migrations, workflow CI và tài liệu trạng thái tổng.
Worker cung cấp patch tích hợp nếu cần chạm chúng. Một migration writer cấp số
sau khi kiểm tra main mới nhất. Không sửa migration đã áp dụng.

Mỗi lane giao implementation + focused proof + giới hạn còn lại, không chỉ stub
hoặc một tài liệu phương pháp khác. Luna xhigh có thể xử lý các gói code hữu hạn
với input/output đã chốt; Codex chịu trách nhiệm integration, tests và review.
Review marketing framework files chỉ kiểm tra sai lệch nghiệp vụ mới hoặc
mapping HTML/section chưa rõ; không duyệt lại bốn gói đã được owner chấp nhận.

## 8. CI và kiểm thử vừa đủ

Các bước chạy trên Linux. Workflow hiện chỉ giảm scope cho một số draft PR
research xếp chồng; thêm method mới chưa nằm trong routing có thể rơi về full
suite. Sửa routing theo dependency thật nếu cần, giữ fallback full cho shared
registration, migration, API hoặc file chưa phân loại.

- Method: fixture nhỏ có kết quả tính tay, một ca đúng và các ranh giới riêng
  của nhóm như period mismatch, overlap, negation, incomplete denominator.
  Dùng table-driven khi cùng contract; không lặp phép tính ở mọi lớp.
- Persistence: integration qua service thật chứng minh create, exact retry,
  historical replay và corruption handling; không dựng mock tự thực hiện hành vi.
- API: kiểm tra transport/OWNER, request bounds và conflict riêng của endpoint.
- UI: mounted tests cho lựa chọn input, pending, lỗi và thao tác retry. Một
  browser journey cho mỗi thay đổi luồng quan trọng trên production operator.
- Release: full `npm run check` và generated-contract drift trên release head;
  browser desktop/mobile, evidence download và reopen sau restart. Chạy lại
  khi code/dependency hoặc vấn đề mới làm bằng chứng cũ không còn áp dụng.

Không đặt quota số test, không viết test cho từng câu Markdown, không test
UUID collision/load/stress khi không có failure mode liên quan. Cache dependency,
hủy CI cũ của cùng nhánh khi có commit mới nếu workflow cho phép. Mỗi lỗi phải
được đọc và sửa nguyên nhân trước khi rerun. Dọn đúng process/fixture của task.

## 9. Lịch triển khai và cách theo dõi

Thứ tự ưu tiên: W0/L0 -> W2/L1; W1 và W3/W4 chạy song song để bản tiếp theo
vừa đúng giao diện vừa có thêm nội dung. Đừng để một section thiếu input hoặc
một tính năng advanced chưa duyệt giữ lại toàn bộ bản phát hành.

Ước lượng lập kế hoạch, chưa phải cam kết ngày giao: W0 và L0 có thể cần 1-2
ngày làm việc tập trung nếu stack và Fedora không có blocker; W1/W2 thường cần
thêm 2-4 ngày tùy độ phức tạp HTML và profile dữ liệu. Mỗi nhóm L2 cần 1-3 ngày
code/review ban đầu. Có overlap giữa lane; không cộng các số này thành một ngày
hoàn thành giả. Sau W0 và khi đọc HTML, thay ước lượng bằng phạm vi đo được.

Theo dõi mỗi gói bằng: owner, input/output đã chốt, code head, focused check,
release head, trạng thái triển khai và blocker có người xử lý. Chỉ báo tiến độ
30 section theo kết quả thực; method-approved không được cộng vào executed.

## 10. Đưa bản phát hành lên Fedora

Trước lần chuyển release, xác minh checkout/runtime PID, database/artifact paths,
schema hiện tại và executor lock. Không lấy số migration 20 hay commit cũ trong
chat làm trạng thái hiện tại. Dùng SQLite qua driver đã cài khi CLI sqlite3 không
có; sự thiếu CLI không đồng nghĩa database chưa tồn tại.

1. Chuẩn bị release riêng từ commit đã qua review/CI, cài lockfile và build
   trên Linux. Smoke trên database/artifacts disposable trước.
2. Đánh giá migration delta thực. Nếu có migration, thử trên bản sao và xác
   minh old/new readers theo phạm vi hỗ trợ. Xác định cách quay lại trước khi áp
   dụng; không mặc định binary cũ đọc được schema mới.
3. Khi có quyền activation cho release, dừng đúng executor, tạo recovery copy
   nhất quán của SQLite cùng artifacts và manifest; không reset/seed dữ liệu
   live. Giữ token và paths ở ngoài Git.
4. Áp migration rõ ràng nếu cần, khởi động đúng một executor với release mới,
   giữ bind localhost. Kiểm tra /healthz, asset, reports API, mở report/evidence
   và lịch sử. Smoke trên dữ liệu live là read-only; journey có writes dùng
   scratch hoặc workspace được owner chỉ định rõ.
5. Ghi commit/schema/artifact verification và hướng rollback. Khi schema thay
   đổi, rollback có thể cần restore đồng bộ DB/artifacts; phải tính các write
   sau thời điểm backup, không ghi đè dữ liệu mới một cách im lặng.

Giai đoạn domain sau: làm riêng Cloudflare Tunnel/Access, đúng hostname/origin
và chính sách người truy cập, sau khi localhost qua acceptance. Kiểm tra exact
Host/Origin trong runtime, download evidence và OWNER authentication. Không
chỉ forward một dịch vụ local không có read authentication ra Internet. Domain
không bắt buộc đổi runtime, database hoặc frontend stack.

## 11. Những đầu vào đang chờ

- Đã nhận `C:/Users/Admin/Documents/Codex/2026-09-16/t-i/report-kit/AGENT_HANDOFF.md`
  cùng hai template Market/Insight và tài sản tham chiếu. Owner đã chấp nhận
  giao diện; không mở lại vòng chọn thiết kế. Source kit giữ nguyên, chỉ lấy
  ngôn ngữ trình bày, không lấy số liệu mẫu làm evidence.
- Deployment target đã chốt: Fedora localhost trước, domain sau; không còn
  câu hỏi cần owner quyết định cho lựa chọn này.
- Trước real-input acceptance: đúng package/corpus có quyền dùng, version và
  profile phù hợp. File review 3.354 dòng vẫn là manual/unverified evidence khi
  thiếu provider/listing IDs. Giữ kết quả filter đã sửa 560/2.794 nếu dùng đúng
  pinned input/filter; không dùng lại count 554 cũ hoặc coi retention là accuracy.

Jev, LangGraph, WeKnora/OpenViking, Redis và microservices tiếp tục ở future
plan. Chúng không là dependency của các bản phát hành này. AI generation cho
prepared profile cần implementation/review riêng và cấu hình model/prompt được
phép; design adoption không tự cấp quyền phát sinh provider calls.

## 12. Tài liệu và tiêu chí hoàn thành kế hoạch

Tham chiếu: [A41 adoption](../research/method-configurations-v1-adoption.md),
[30-section mapping](../research/method-configurations-v1/section-admission-matrix.md),
[A38/A39 handoff](../handoffs/research-a38-integration-checkpoint.md),
[runbook Fedora](../runbooks/fedora-local-operator-runtime.md).

Kế hoạch dựa trên code/read APIs/CLI và trạng thái PR đã đọc. Chưa khảo sát hai
HTML, chưa xác minh Fedora trực tiếp, chưa chạy code hoặc CI ở lượt lập plan.
Hai việc đó phải được ghi thành evidence thật trong gói tương ứng, không đánh
dấu PASS từ mô tả. Các gói đã có đủ input được chuẩn bị độc lập trong khi chờ.

Review marketing framework files đã đọc plan ngày 2026-10-01 và xác nhận không
có sai lệch trọng yếu về phân nhóm 30 section, coding/corpus ratio, giới hạn
advanced methods, mapping HTML và tính tái hiện. Review này chỉ xác nhận phạm
vi nghiệp vụ; không thay thế code review, CI hoặc nghiệm thu dữ liệu/runtime.
Kiểm tra tài liệu xác nhận mỗi ID M01-M13/I01-I17 xuất hiện đúng một lần trong
bảng phân nhóm, các link nội bộ tồn tại và tám file A41 giữ nguyên hash đã duyệt.

## 13. Wave 1 đã triển khai và kiểm tra Linux — 2026-10-01

Một nhánh tích hợp `feature/research-a42-live-report-wave1`, ba lane sở hữu
file độc lập, không có ba agent cùng sửa một file:

| Lane | Phần việc | Phụ thuộc khi tích hợp |
|---|---|---|
| HTML / Claude Sonnet 5.5 high | Renderer mới theo kit, 30 section, biểu đồ tĩnh, trạng thái thiếu dữ liệu | Các bundle đã xác minh; coordinator nối profile |
| Tạo báo cáo / GPT | Inventory nguồn đã lưu, OWNER API, chuẩn bị và lưu báo cáo, form React | Reader nguồn, schema và operator wiring do coordinator |
| Phương pháp / GPT | M05/M06/M07/M09 mô tả, số thập phân chính xác, bằng chứng định vị và cấu hình đã duyệt | Coordinator giữ output trong phiên bản báo cáo |

Coordinator chịu trách nhiệm nội dung/chart, schema dùng chung, tích hợp,
Linux CI, review và gói triển khai Fedora. Session nghiệp vụ đã rà kit và xác
nhận các rào chắn sau: WIDE/CORE không phải shop hoặc quốc gia; cardinality
theo dữ liệu; C/P không thay cho độ tin cậy evidence; không dựng đủ năm bước
journey; không lấy prose/figures trong ví dụ làm fact; giá trị 0 không vẽ 0.05.

Profile trình bày là lựa chọn được ghi trong request. Khi không có lựa chọn
mới, giữ nguyên renderer cũ và byte replay cũ. Thay CSS của renderer cũ sẽ
làm hỏng cả read/replay của bản còn nguyên artifact, không chỉ recovery;
vì vậy không dùng cách đổi renderer mặc định toàn cục.

Wave này tạo báo cáo xác định từ nguồn đã lưu, chưa tự thu thập nguồn mới,
chưa gọi AI hoặc phê duyệt nội dung. Mỗi lần tạo là series mới với khóa retry
ổn định; giao diện tạo version tiếp theo thuộc wave sau. Các phương pháp mới
chỉ chạy khi có descriptor và cấu hình nguồn hợp lệ; có code không có nghĩa
30 section đã có đầy đủ nội dung hoặc dữ liệu thật đã qua nghiệm thu.

Không chạy test, typecheck, build hoặc browser trên Windows. Contract generation
và kiểm tra diff tĩnh được thực hiện ở đây; bằng chứng thực thi lấy từ Linux CI.
Chưa được merge/deploy chỉ vì agent báo hoàn thành. Fedora localhost phải qua
release review và quyền activation cho đúng commit, giữ DB/artifacts hiện hữu.

Kết quả wave 1: draft PR #101, phụ thuộc #100. Check Linux 36765488051
qua 657 backend tests, 182 frontend tests, typecheck/build/contract checks;
preview 36765488049 qua desktop/mobile và thao tác mở bằng chứng. Independent
finish review chấp nhận bốn sửa lỗi đã nêu, không đổi thiết kế owner đã duyệt.
Chi tiết giới hạn và evidence ở `docs/handoffs/research-a42-wave1-integration.md`.
Wave tiếp theo vẫn phải code hóa qualitative/corpus methods và nối đầu vào thật;
30 mục có mặt trong HTML không đồng nghĩa 30 mục đã được thực thi.

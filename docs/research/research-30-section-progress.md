# Bảng điều hành automation 30 section

Ngày 04/10/2026. Tree chưa phát hành trên baseline `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, PR #110. Đây không phải trạng thái Fedora đang chạy.

Mục tiêu và thứ tự: [plan v2.4](../tasks/research-automation-execution-plan-v2.vi.md). Bằng chứng: [inventory code](automation-method-execution-inventory.md), [matrix ba case](research-execution-three-case-matrix.md). Không có tỷ lệ hoàn thành đáng tin cậy ở checkpoint này.

## Quy ước

- **Nối**: production flow gọi method/read retained output, chưa mặc nhiên đúng hoặc đủ nội dung.
- **Hẹp**: chỉ một phần ngữ nghĩa đã duyệt. Source context/inventory/gate không phải phân tích hoàn chỉnh.
- **Chưa xác minh thật**: bộ ba thạch dừa/bình giữ nhiệt/quạt cầm tay chưa có acceptance đầy đủ ở cùng tree hiện tại. Kết quả synthetic và replay lịch sử không thay bằng chứng này.
- Không tick hoàn thành nếu chỉ có module offline hoặc test negative. Không hạ yêu cầu nghiệp vụ để đổi màu trạng thái.

## 30 dòng hiện trạng

### Điểm tạm ngưng theo yêu cầu chủ dự án — 04/10/2026

- Goal tạm ngưng, chưa hoàn thành. Các thay đổi đang có được giữ nguyên để tiếp tục.
- Full API suite 13/13 PASS trên Linux, gồm upload nguồn → tạo cặp báo cáo mới → đọc lại, retry và từ chối nguồn thuộc run khác. Báo cáo cũ được giữ nguyên.
- Claude đã bàn giao context/inventory nguồn bổ sung. GPT đã nối GET inventory và client đọc lại; các thay đổi cuối này chưa được đồng bộ và kiểm tra tích hợp trên Linux.
- ZCode audit HTTP kết thúc bằng timeout 240 giây, không có kết luận độc lập. Không còn tác vụ Claude/ZCode coding đang chạy trong các lượt đã giao.
- Audit nghiệp vụ follow-up đang chốt tệp kết quả. Snapshot hiện tại chỉ ghi nhận I06 pass hẹp về thứ tự sự kiện và I10 khớp 42 cặp record–code; chưa coi đó là nghiệm thu cả section hoặc cả corpus.
- Lượt GPT-6.1 mới nhất: 4/4 output hợp lệ cấu trúc, 476,776 giây; exact retry không gọi lại model hoặc ghi thêm dữ liệu. Chất lượng nội dung toàn bộ vẫn chờ audit.
- Chưa có section nào được nghiệm thu hoàn chỉnh trên cả ba case ở cùng bản hiện tại; chưa có sáu PDF nghiệm thu mới hoặc cập nhật Fedora từ tree này.

Audit nghiệp vụ đã lưu kết quả và dừng sau checkpoint trên: I06/I10 PASS hẹp; I02/I04/I05/I07/I08/I09/I13 NOT_READY. Audit chỉ ra bỏ sót clause I05 và trạng thái I09, cùng các diễn giải attribution/disagreement cần disposition. Đây chưa là application acceptance. Plan bàn giao thủ công nằm ở `../handoffs/manual-20261004/PLAN.vi.md`; chưa dispatch agent hoặc tiếp tục goal.

Khi tiếp tục: đọc verdict nghiệp vụ đã lưu; rà context/inventory và kiểm tra tích hợp cuối trên Linux; hoàn thiện UI chọn nguồn bổ sung; sau đó kiểm chứng nội dung và xuất hai PDF cho mỗi case theo plan v2.4.

Checkpoint 04/10 mới nhất: intake/POST cho gói quote và bounded đã qua Linux
generation/typecheck, một kiểm tra owner và hai kiểm tra HTTP. Client giữ exact
snapshot/hash từng tệp, nhóm liên quan 20/20 PASS. Đây mới gỡ đường lưu nguồn
cho M08/M10/I11/I12/I16; inventory reload và UI còn làm, không phải năm section
đã có phân tích. Claude tiếp tục inventory, GPT nối API/client và kiểm tra,
ZCode được giao audit HTTP hẹp. Không dùng JEV cho kiểm tra deterministic này.

Insight construct follow-up đã thực sự chạy prompt mới: 4/4 VALID cấu trúc,
476,776 giây, 4 exact retry không gọi model/không mutation. Business audit đang
chạy; counts không phải quality pass, chưa có acceptance ba case hoặc PDF mới.

| ID | Method / tích hợp hiện tại | Nguồn hoặc authority còn thiếu | Bước kế tiếp | Nghiệm thu thật |
|---|---|---|---|---|
| M01 | Inventory claim M05 đã nối; chưa summary Market | Claim đủ nghĩa + draft review | Hoãn mở rộng tới khi tăng breadth; giữ lỗi nghiêm trọng trong scope | Chưa xác minh thật |
| M02 | Market v10 tách kỳ yêu cầu/kỳ Metric khai báo/cửa sổ truy vấn và trạng thái phân loại từng nguồn | Chưa chứng minh độ phủ đo thực tế hoặc nguồn cho đủ ba case | Nghiệm thu phạm vi đa nguồn, không polish tiếp | Thermos/fan đã kiểm tra scope từ nguồn thật đã lưu; chưa nghiệm thu đủ |
| M03 | Đã nối receipt vào revision mới và ALL/WIDE/CORE; temporal inventory hẹp | Rule/nhãn thật chưa duyệt; temporal compatibility | Nghiệm thu dữ liệu thật và release acceptance với rule/assignment đã duyệt | Chưa xác minh thật |
| M04 | Đã nối classified totals/groups/concentration/sensitivity và UI chọn nhãn | Nhóm/mẫu số và duyệt thật còn thiếu | Nghiệm thu dữ liệu thật/release acceptance từ receipt đã lưu | Chưa xác minh thật |
| M05 | D mô tả đã nối; replay thật thermos/fan mỗi case 78 quan sát | Nghĩa sales/search, kỳ và coverage từng nguồn | Hoàn thiện đầu vào jelly và nghiệm thu ba case | Đã replay thật T/F trong phạm vi mô tả; chưa nghiệm thu đủ |
| M06 | D inventory nguồn cung đã nối; replay thật T/F mỗi case 39 bản ghi | ID/coverage/truncation đủ; không phải 39 sản phẩm duy nhất | Acceptance ba case; không suy toàn thị trường | Đã replay thật T/F inventory; chưa nghiệm thu đủ |
| M07 | D peers tường minh đã nối, không xếp hạng | Peer set được xác nhận, đơn vị/kỳ tương thích | Kiểm chứng so sánh có điều kiện | Chưa xác minh thật |
| M08 | Exact structured package đã nối revision/API/replay, phép tính giá/gói/đơn vị/100g và M13; Linux 49 PASS, 1 optional PDF skip | Variant/pack/unit/mass/điều kiện giá từ nguồn thật; producer và UI intake còn thiếu | Nối nguồn-native thực tế, kiểm tra web/PDF và acceptance; không coi khai báo là chứng nhận provider | Chưa xác minh thật |
| M09 | D v2 đã nối launch_date, gộp lặp và giữ xung đột; replay thật T/F mỗi case 3 phát biểu ngày | Chỉ ngày do nguồn khai báo, chưa là driver/nhân quả; nguồn sự kiện độc lập còn thiếu | Nối nguồn sự kiện hợp lệ, không coi inventory là phân tích hoàn chỉnh | Đã replay thật T/F ngày ra mắt; chưa nghiệm thu đủ |
| M10 | G exact package đã nối revision/API/replay và gate trên report; Linux 23/23 nhóm ảnh hưởng | Chuỗi thật đủ điều kiện; forecast nâng cao chưa adoption | Nguồn thật và UI chọn nguồn; không tính gate là forecast | Chưa xác minh thật |
| M11 | Caller/replay và packet v1.1 nhận literal M05/I04 kèm I02; giữ bản nháp chờ review, Linux proof | Chất lượng nguồn/quan hệ thật; adapter claim tính toán ngoài M05 còn thiếu | Kiểm chứng usefulness và giới hạn trên dữ liệu thật; không coi admission là cơ hội đã xác minh | Chưa xác minh thật |
| M12 | Caller/replay và support v1.1 đã nối; giữ chosen/authorization rỗng | Alternatives/constraints có nguồn và input OWNER | Kiểm chứng phương án từ nguồn thật; không tự chọn hoặc thực thi | Chưa xác minh thật |
| M13 | Nối gói Metric, raw digest, preparation và receipt phân loại; giữ trace D hiện có | Trace đa nguồn + inclusion/exclusion đầy đủ | Nối các method refs còn thiếu | Browser T/F từ dữ liệu thật đã lưu PASS; chưa nghiệm thu đủ |
| I01 | Brief/scope context đã nối | Trường chưa khai phải UNSET | Giữ keyword khác mục tiêu kinh doanh | Chưa xác minh thật |
| I02 | Model/transport/API → đề xuất/duyệt/revision semantic v2 và UI theo lô toàn corpus đã nối | Coding thật chưa duyệt; chất lượng model chưa benchmark | Nghiệm thu thật, không dựng persona | Chưa xác minh thật |
| I03 | B1 đã nối coverage chung native/exact: dòng, bản ghi duy nhất, disposition, khai báo/pending/blocked tách riêng | Acceptance coding và mẫu số chủ đề còn thiếu | Shared accepted corpus; không mở rộng metadata | Chưa xác minh thật |
| I04 | Model theo lô/transport/API + lưu/duyệt/revision/UI khởi tạo và kết quả đã nối | Quote/coding thật chưa duyệt | Benchmark và acceptance thật | Chưa xác minh thật |
| I05 | Model theo lô qua UI/API + receipt/report; unselected không tính polarity | Target/negation/mixed thật chưa benchmark | Benchmark theo rubric | Chưa xác minh thật |
| I06 | UI model theo lô, exact-span proposal/revision/replay và UI duyệt đã nối | Same-record sequence và coding thật chưa duyệt | Nghiệm thu quote và quan hệ thật | Chưa xác minh thật |
| I07 | UI model theo lô/transport/API + receipt/report, quan hệ cùng record | Quan hệ reason/action thật chưa duyệt | Benchmark và acceptance thật | Chưa xác minh thật |
| I08 | UI model theo lô/transport/API + receipt/report, giữ trạng thái chưa rõ | Obstacle/attempted task thật chưa duyệt | Benchmark và acceptance thật | Chưa xác minh thật |
| I09 | UI model theo lô + method/revision/relation/counterevidence đã nối | Acceptance quan hệ thật | Kiểm chứng quan hệ thật, không suy nhu cầu từ lời phàn nàn | Chưa xác minh thật |
| I10 | Counts/revision/HTTP/UI corpus, đối sánh nguyên văn và model theo lô toàn corpus đã nối | Codebook/dispositions và corpus thật chưa duyệt | Acceptance thật; đủ corpus mới có n/N | Chưa xác minh thật |
| I11 | G exact package đã nối revision/API/replay và inventory/gate trên report | Group assignment/mẫu số thật tương thích | Nguồn thật và UI chọn nguồn; chưa là phân tích nhóm hoàn chỉnh | Chưa xác minh thật |
| I12 | G exact package đã nối revision/API/replay và inventory/gate trên report | Presence/exposure/outcome, không bịa conversion | Nguồn thật và UI chọn nguồn; không gọi gate là conversion | Chưa xác minh thật |
| I13 | Literal mention/counts/revision/UI và model theo lô toàn corpus đã nối, không suy alias | Alias authority và corpus thật | Acceptance thật; không suy market share | Chưa xác minh thật |
| I14 | Retained AI optional đã nối, synthetic candidate | Real input quality + review; model off mặc định | Hoãn polish; quay lại sau breadth | Chưa xác minh thật |
| I15 | Caller/replay, support v1.1 cho bản nháp chiến lược đã nối; giữ preferredOption rỗng | Alternatives/constraints có nguồn và chất lượng quan hệ thật | Nghiệm thu thật; không tự tạo owner option hoặc coi scalar là business constraint | Chưa xác minh thật |
| I16 | G exact package đã nối revision/API/replay và design/gate trên report | Protocol/result nguồn thật; không bịa experiment | Nguồn thật và UI chọn nguồn; không coi thiết kế là thử nghiệm đã chạy | Chưa xác minh thật |
| I17 | B1 đã nối trace chung hash/locator/quote/trạng thái; giữ collection tách riêng | Receipt acceptance và các method family còn thiếu | Nối trace của các method mới khi tích hợp | Chưa xác minh thật |

## Checkpoint B1

Checkpoint tích hợp 04/10: M11/M12/I15 có prompt tiếng Việt 1.2.0, giữ nguyên
input/method và prompt lịch sử; Linux generation/typecheck, 10/10 và rehearsal
ba execution cũ PASS. Đây là tích hợp lời diễn giải, không mở rộng phương pháp.
Audit nghiệp vụ Insight follow-up đã xong; I04/I09 được làm rõ theo quy tắc chung,
nhưng chưa chạy model trên bản sửa này. Bốn output thật cũ vẫn replay không
mutation. Đã xác nhận prompt digest thực tế của lượt follow-up; không gán kết quả
cũ cho prompt mới. ZCode review thất bại, không ghi nhận PASS độc lập.
Nghiệm thu ba case, chất lượng tiếng Việt, nguồn quote/chuỗi/nhóm còn mở;
không tick thêm section hoàn thành.

M08 source check 04/10: retained Kalodata detail không có trường variant/pack;
39 response mỗi case T/F không phải 39 sản phẩm duy nhất. Không tạo phép tính
giá/đơn vị từ title hoặc mặc định pack=1. Đã loại hai connector không chứng minh
hỗ trợ variant tại Việt Nam; còn một ứng viên exact-URL phải probe và kiểm tra
mock/cache/identity trước khi nối producer. [Chi tiết](../handoffs/research-m08-quote-source.md).

M08 probe thật 04/10 đã kết thúc: đúng shop/item ID, nhưng nguồn embedded HTML
không trả giá hoặc định danh biến thể; quy cách trong title còn khác URL ban đầu.
Run thành công không có nghĩa dữ liệu đủ. Chi phí provider ghi nhận khoảng
0,02005 USD; không tạo phép tính hoặc tăng completion. Claude đang làm intake
JSON bổ sung cho R1, không thay thế nguồn tự động R2.

Checkpoint follow-up 04/10: cùng nguồn/reference, prompt phương pháp mới đã chạy
bốn lô GPT-6.1, đều VALID cấu trúc; tổng 452,337 giây. Context, clause đánh giá
và partial state đã xuất hiện; quan hệ thời gian không có căn cứ đã bị bỏ.
I09 còn cần audit nghĩa giữa ý định và mong muốn, số object không phải accuracy.
Audit nghiệp vụ baseline đã xong; sửa mâu thuẫn disagreement trong prompt,
Linux 15/15 và replay bốn output follow-up không gọi model/không mutation PASS.
Audit delta đang chạy. Không acceptance, PDF, deploy hoặc tăng completion.
[Chi tiết](../handoffs/research-insight-real-pilot-results.md).

Checkpoint model thật 04/10: [kết quả pre-pilot](../handoffs/research-insight-real-pilot-results.md).
GPT-6.1 chạy 20 review thật qua bốn lô, 4/4 VALID cấu trúc, tổng 273,555 giây.
42 cặp record/topic khớp reference nhưng I02/I09 bị bỏ trống và có mất phân
đoạn/quan hệ cần audit; không gọi đây là accuracy hoặc nghiệm thu. Đã bổ sung
prompt phương pháp dùng chung, Linux 15/15 và exact retry bốn output cũ không
gọi lại model/không mutation PASS. Business audit và benchmark prompt mới còn
mở. Không acceptance, PDF, deploy hoặc tăng completion; phí thực tế UNKNOWN.

Checkpoint replay thật 04/10: gói review jelly đã qua luồng worker production
trên bản sao SQLite/artifacts riêng, tạo hai web draft và binding Insight đúng
62 dòng/20 review đủ điều kiện. Nguồn gốc byte-identical; không provider/model
call, không adoption/acceptance hoặc live write. Gỡ thiếu run/binding cho pilot,
chưa benchmark AI, chưa PDF hoặc tăng completion. [Bằng chứng](../handoffs/research-insight-real-pilot-preparation.md#production-path-retained-source-run-0410).

Checkpoint pilot thật 04/10: [chuẩn bị](../handoffs/research-insight-real-pilot-preparation.md).
Đã replay gói jelly v3 qua Foundation readonly và đóng tập 20 review đọc được,
giữ ledger 62 dòng. Nghiệp vụ xác nhận rubric hiện có đủ; đang lập reference
coding độc lập với output model mới. Chỉ là retrospective pre-pilot, chưa model
benchmark, chưa acceptance và không thay corpus thật còn thiếu của T/F.

Checkpoint client bổ sung 04/10: [handoff](../handoffs/research-supplemental-method-client.md).
Client đã nhận hai request quote/bounded bằng schema chuẩn thay vì từ chối trước
HTTP. Linux 10/10 và frontend typecheck/build PASS, regression RED/GREEN.
Gỡ một lỗi tích hợp cho M08/M10/I11/I12/I16; source picker, intake và dữ liệu
thật vẫn mở. Không tăng completion hoặc gọi đây là phân tích hoàn chỉnh.

Checkpoint UI model 04/10: [handoff](../handoffs/research-insight-model-ui.md).
Chín family dùng chung đường UI xác nhận toàn corpus, chia lô, dừng và retry
đúng identity. Linux 17/17, typecheck/build và Chromium synthetic desktop/mobile
PASS; GPT sửa hai lỗi read-back/focus với bằng chứng RED/GREEN. Finish review
độc lập SHIP trong phạm vi panel; benchmark thật và acceptance vẫn mở. Không provider call hoặc deployment;
không tăng completion count. Các ghi chú UI chưa nối phía dưới là lịch sử.

Checkpoint decision support 04/10: [handoff](../handoffs/research-decision-support-v2.md).
Session nghiệp vụ xác nhận literal M05 và I04 kèm context có thể làm đầu vào
cho relation draft. Packet/input/prompt v1.1 đã nối caller, lưu và replay giữ
phiên bản cũ; không đổi I14. Linux typecheck/generation PASS, trọng tâm 9/9 và
API/nguồn/transport 38/38 PASS. Chưa dữ liệu thật/visual/PDF/release, không tăng
completion count. Các checkpoint cũ dưới đây là lịch sử, không phải hạn chế mới nhất.

Checkpoint browser client 04/10: [handoff](../handoffs/research-insight-model-client.md).
Client có validator chuẩn, receipt/status kiểm chứng và không tự retry khi chưa
rõ kết quả. Linux typecheck/build PASS; client và UI hiện có 9/9 PASS. UI khởi tạo
và chia lô toàn corpus đang triển khai, chưa được tính là đã nối hoặc nghiệm thu.
Không thay trạng thái hoàn tất của chín section dùng chung đường model này.

Checkpoint operator/API coding 04/10: [handoff](../handoffs/research-insight-model-runtime-api.md).
Claude nối cấu hình và transport; GPT audit, nối endpoint OWNER, contract đóng
và chờ kết thúc các lượt coding khi shutdown. Không bật theo I14; response phân
biệt đề xuất/chưa gọi/invalid/unknown, không tự duyệt hoặc tạo report. Linux
nhóm cuối 9/9, generation và hai typecheck PASS. UI khởi tạo, batch toàn corpus, benchmark thật và acceptance
vẫn mở. Chưa deploy, không tăng completion count. Checkpoint backend ngay dưới
là lịch sử trước khi nối transport/API.

Checkpoint model proposal 04/10: [handoff](../handoffs/research-insight-model-proposals.md).
Backend P4.4 đã nối một lượt model cho lô nguồn tường minh, lưu và kiểm tra kết
quả rồi tạo proposal pending cho I02/I04/I05/I06/I07/I08/I09/I10/I13. Full corpus
giữ nguyên; exact retry, stale completion và lỗi transport có Linux proof.
Journey ba ngành synthetic PASS, nhóm trọng tâm 16/16 PASS. Chưa operator
transport/API/UI khởi tạo, chia lô tự động toàn corpus, benchmark model thật hoặc
acceptance; không tăng completion count. Các dòng bên trên cần hiểu model path
ở mức backend này, không phải đã dùng được trên Fedora.

Checkpoint semantic selection 04/10: [handoff](../handoffs/research-insight-semantic-selection.md).
Đã mở rộng đường đề xuất/duyệt/report/UI cho I02/I04/I05/I07/I08; v2 không cho
mục chưa chọn đi vào kết quả và giữ v1 lịch sử. Luồng persist/report ba ngành
synthetic, HTTP cũ, typechecks và browser desktop/mobile PASS. Đây là gỡ thiếu
đường tiếp nhận kết quả, chưa phải model tự coding hoặc acceptance thật. Tiếp
tục model execution dùng chung; không tăng completion count.

Checkpoint literal proposal 04/10: [handoff](../handoffs/research-insight-literal-proposals.md).
I10/I13 giảm nhập tay bằng đối sánh nguyên văn, giữ đề xuất chờ duyệt và phần
không khớp chưa xử lý. Linux typechecks, matching/selection 5/5, HTTP 1/1 PASS.
Chưa UI khởi tạo, model coding P4.4, dữ liệu thật hoặc deploy; không tăng
completion. Bước này không thay thế semantic coding hoặc quan hệ I06/I09.

Checkpoint nguồn thật + scope 04/10: [handoff](../handoffs/research-m02-source-scope.md).
Replay strict nguồn gốc T/F đã qua: mỗi case 41 trao đổi đã lưu, 78 quan sát M05,
39 bản ghi M06, 3 ngày ra mắt M09. Giá vẫn chỉ inventory, không đủ quy đổi đơn vị.
Jelly scope gốc không có COLLECTION; nguồn review về sau phải gắn đúng phiên bản.
M02/M13 v10 đã qua Linux, API và browser desktop/mobile; Insight v9 giữ nguyên.
Không provider/model call, live write hoặc tăng số section hoàn tất. Tiếp theo
phải tăng nguồn/đầu ra phân tích, không thêm bảng trạng thái hoặc polish.

Checkpoint activity 04/10: API/read owner và RunView hiện M11/M12/I14/I15 riêng;
vắng dữ liệu không thành 0 lượt, VALID không thành phân tích hoàn tất hoặc phí
đã xác nhận. Linux generation/typechecks, affected 37/37 và API journey 1/1
PASS; production build và hai viewport browser PASS, GET-only. Không cộng test
trùng hoặc tăng completion. [Handoff](../handoffs/research-decision-activity.md).
Activity đã khép lại ở mức kỹ thuật; chuyển về nguồn/phương pháp, không polish
thêm. Các checkpoint bên dưới giữ như lịch sử.

Checkpoint runtime 04/10: M11/M12/I15 có cờ bật và model riêng qua operator →
API → service; không kế thừa opt-in I14. Linux transport/config 5/5 PASS và
journey API ba ngành PASS: chỉ nguồn đủ điều kiện gọi bốn section, bản nháp vào
hai báo cáo, revision/replay không gọi lại. Chưa đổi runtime live; activity UI,
nguồn thật và nghiệm thu vẫn mở. [Handoff](../handoffs/research-decision-runtime.md).
Nhóm ảnh hưởng cuối 28/28 và root typecheck PASS (có test trùng nhóm trước,
không cộng). Không tăng completion count.

Checkpoint report synthesis 04/10: GPT nối service/semantic dependency/replay,
Claude viết renderer M11/M12/I15, GPT audit và kiểm tra Linux. Typecheck PASS;
nhóm cuối 38 PASS, 1 optional PDF skip. Sáu HTML synthetic qua 12 lượt browser
desktop/mobile: exact citation targets, keyboard disclosures, không tràn ngang
hoặc page error. Xem [handoff](../handoffs/research-decision-report-integration.md).
Deterministic revision không gọi lại model; read query-only kiểm tra cả candidate
và paired Insight. INVALID/UNKNOWN/empty không làm mất hai báo cáo. Chưa runtime
opt-in/activity cho ba section, chưa model/provider thật, PDF visual hoặc release.
Không tăng số section hoàn tất. Các checkpoint dưới đây là lịch sử.

Checkpoint retained execution 04/10: Claude tách lifecycle I14 dùng chung; GPT
audit, thêm adapter M11/M12/I15, cấu hình riêng và migration 0046. Linux nhóm
execution/migration 29/29, nguồn/method 31/31, migration-affected 76/76 PASS.
Nâng cấp có dữ liệu giữ nguyên I14 và không gọi lại model khi replay. Ba adapter
chưa nối report caller/renderer hoặc bật model; chưa tăng completion count.
[Bằng chứng và bước kế tiếp](../handoffs/research-shared-synthesis-execution.md).
Gói tiếp theo phải nối đầu ra báo cáo, không mở rộng hạ tầng lưu mới.

Checkpoint input/execution 04/10: đầu vào và prompt M11/M12/I15 đã được Claude
viết, GPT audit/đăng ký contract và chạy Linux generation/typecheck cùng nhóm
24/24 PASS. Giữ context/counterevidence, attribution và owner UNSET; chưa có
executor cho ba section, chưa gọi model hoặc tăng completion count. GPT cũng
sửa so sánh byte nguồn vốn gây timeout: journey API ba ngành giữ nguyên assertion
và giới hạn 120 giây, đã PASS riêng trong 94,94 giây. Nhóm API/quote/report cuối
20 PASS, 1 optional PDF skip; packet/input 5/5 sau thêm kiểm tra observed zero.
Không cộng các nhóm có test trùng. ZCode high đã phản hồi thành công ở audit snippet hẹp, không phải
review cả tree. [Bằng chứng](../handoffs/research-decision-packets-integration.md).

Checkpoint M11/M12/I15 04/10: [handoff tích hợp](../handoffs/research-decision-packets-integration.md).
Ba packet đã vào luồng lưu/hiển thị/replay; Market ghim đúng phiên bản Insight,
không dùng nhận định I14 làm nguồn. Linux 31 PASS, 1 optional PDF skip. Kiểm tra
phiên bản nguồn đã sửa fixture để phân biệt raw chưa coding với claim được nhận;
không đổi luật production. Counterevidence relation có negative control thất bại
đúng guard. Đây là inventory, chưa AI synthesis, dữ liệu thật hoặc release.
Input/prompt đã có proof ban đầu; GPT tiếp tục phần lưu/chạy và audit.

Checkpoint M08 04/10: [handoff](../handoffs/research-m08-quote-source.md).
Gói quote có cấu trúc đã vào Market, giữ Insight và phiên bản lịch sử. KEEP/SKIP
không sửa bản cũ; source replay phát hiện raw bị thay đổi. Linux generation và
typecheck PASS; nhóm ảnh hưởng 49 PASS, 1 optional Chromium PDF skip. Negative
control bỏ verifier thất bại đúng assertion nguồn hỏng, chạy lại bình thường
1/1 PASS. Không cộng các lượt test trùng. Đây chưa là intake provider tự động,
không có dữ liệu thật hoặc duyệt visual, không tăng completion count.

Checkpoint G 04/10: [handoff nguồn và tích hợp](../handoffs/research-g-source-snapshot.md).
Claude viết contract/module, ZCode sửa liên kết bằng chứng, GPT audit và nối
service/API/report. Linux affected 23/23 PASS; lượt cuối 14 PASS, một optional
PDF skip (có test trùng, không cộng). Corrupt-source replay có negative control
thất bại đúng chỗ rồi khôi phục PASS. KEEP/SKIP chỉ tạo version mới; bốn section
giữ EVIDENCE_INVENTORY, không tăng analytical completion. UI chọn nguồn, nguồn
thật, browser/PDF visual acceptance và phát hành vẫn mở.

Checkpoint UI B2 04/10: [handoff](../handoffs/research-b2-insight-ui.md).
Claude terminal, GPT tích hợp/sửa lỗi và chạy Linux frontend typecheck/build,
18/18 affected tests. Ba nhóm regression có RED/GREEN; synthetic Chrome desktop
và mobile qua adopt/propose/accept/report, không ghi thật. Finish review, các
journey corpus còn lại và real-data acceptance chưa hoàn tất. Đây là supporting
OWNER path; không tự suy coding/approval hay tăng completion count.

Checkpoint breadth 04/10: [handoff B3](../handoffs/research-b3-source-method-breadth.md).
G source-only boundary qua 7/7 Linux; chưa có caller automation. M09 nhận ngày
khai báo từ raw capture, giữ conflict/lineage và dùng renderer hiện có; nhóm
ảnh hưởng 31/31 PASS. Regression có RED/GREEN, v1 report replay bằng v2 giữ đúng
digest. Không tăng số section hoàn tất; chưa nghiệm thu thật hoặc release.
ZCode probe một file thành công nhưng review nhiều file timeout 240 giây; GPT
tiếp quản audit, không ghi nhận independent approval. Claude UI B2 vẫn đang chạy.

Checkpoint B2 04/10: [owner coding Insight](../handoffs/research-b2-insight-coding.md)
đã nối source reader lịch sử, lưu adoption/proposal/receipt và gọi method bốn
nhóm I06/I09/I10/I13. Linux generation/typecheck và nhóm ảnh hưởng 118/118 PASS.
Audit owner không phát hiện lỗi trọng yếu ở checkpoint đó.

Checkpoint report B2 04/10: exact selected receipts đã nối worker/replay và bốn
section trên Insight; Market và bản cũ giữ nguyên. Linux affected group 46 PASS,
1 optional PDF skip; zero 0/3 có RED/GREEN. Preview riêng đã xuất sáu PDF synthetic,
desktop/mobile không overflow toàn trang hay page error. Đã kiểm tra disclosure,
liên kết I06 tới I17 và cuộn bảng bằng bàn phím trên mobile. PDF vẫn có header
bảng đứng riêng cuối trang và khoảng trắng lớn, chưa duyệt chất lượng xuất bản.
HTTP/UI và nghiệm thu thật vẫn mở. Không tăng số
section phân tích hoàn chỉnh, không claim release hoặc triển khai.

Checkpoint HTTP B2 04/10: Claude nối GET lịch sử exact pair và ba POST OWNER;
GPT audit, ghép validator/client và mở request revision Insight cho trình duyệt.
Linux nhóm HTTP/nguồn/report: 48 PASS, 1 optional PDF skip; client/revision: 7/7
PASS, frontend typecheck/build PASS. Sai request-kind trên client có RED/GREEN.
ZCode đọc code PASS nhưng lượt viết client timeout 420 giây; GPT tiếp quản file
chưa bàn giao, không tính worker đã hoàn thành. Chưa có UI thao tác, nhãn thật
hoặc full release; không tăng số section phân tích hoàn chỉnh.

- [x] Ghi mục tiêu theo kết quả và đủ 30 ID; giữ các giới hạn hiện tại.
- [x] B1-A prerequisite: GPT tiếp quản, backend/API rule adoption gắn scope đã có Linux proof. Chưa UI hoặc duyệt quy tắc thật.
- [x] B1-A backend proposal/membership receipt Metric: exact pair/source/rule, selected acceptance, historical replay và Linux proof.
- [x] B1-A classified report revision có caller và output M03/M04; Linux xác minh giữ Insight, không gọi lại AI.
- [x] B1-A còn lại: hai thao tác UI adoption/selected acceptance và tạo pair mới (tích hợp kỹ thuật đã qua; acceptance thật vẫn mở).
- [x] B1-B: GPT tiếp quản sau ZCode timeout; projection corpus/trace có caller và Linux proof. Không ghi nhận ZCode hoàn thành.
- [x] GPT B1-C: nối hai đường report thật trong code, cập nhật I03/I17 bằng bằng chứng synthetic và replay, không chỉ module rời.
- [ ] Ghim expectation/nguồn thật còn thiếu của cả ba case trước acceptance.

Mỗi lần cập nhật dòng cần ghi bằng chứng code/test/artifact, không chỉ nhận báo cáo worker. Hai checkpoint chỉ tăng metadata/test mà không gỡ blocker hoặc thêm output dùng được thì đổi gói ưu tiên trước lần dispatch tiếp theo.

Bằng chứng B1: [handoff corpus/trace](../handoffs/research-b1-corpus-trace.md).
Linux typecheck PASS; hai suite tích hợp 27 PASS; nhóm projection/report/preview
13 PASS + một optional skip. Desktop/mobile kiểm tra liên kết, bàn phím, overflow
và quote PASS. Đây là tiến bộ context/trace, không tăng số section phân tích hoàn
chỉnh hoặc chứng minh nghiệm thu ba ngành thật. Claude hết quota, ZCode timeout;
không chờ hoặc thử lại worker vô hạn.

Checkpoint 04/10: [handoff Metric rule adoption](../handoffs/research-b1-metric-rule-adoption.md).
Linux generation/typecheck PASS; nhóm ảnh hưởng 94/94 PASS. Duyệt quy tắc không
duyệt nhãn, không đổi source/method/report và không tự chạy lại. CORE/WIDE vẫn
đóng tới khi có toàn bộ disposition hợp lệ; không tăng số section hoàn thành.

Checkpoint tiếp theo 04/10: [handoff membership](../handoffs/research-b1-metric-membership.md).
Linux typecheck và nhóm ảnh hưởng cuối 95/95 PASS. Ba ngành chỉ dùng synthetic;
proposal không tự acceptance, UNKNOWN cần duyệt, report pair mới không kế thừa
approval ngầm. Hai regression lịch sử/pair có RED/GREEN. Chưa có classified output
trên báo cáo mới, không tăng số section hoàn thành. ZCode đọc schema PASS, nhưng
review hai file timeout 240 giây; không ghi nhận review độc lập thành công.

Checkpoint classified 04/10: [handoff](../handoffs/research-b1-classified-metric-revision.md).
Phép tính generic đã vào pair mới, không thay snapshot nguồn hoặc report cũ.
Synthetic đủ/0/thiếu, selected UNKNOWN, replay read-only và 12 view desktop/mobile
đã qua. Đã phát hiện và sửa renderer sai owner; regression chống gọi lại AI khi
chỉ đổi phân loại Metric đã PASS. Linux typecheck và nhóm ảnh hưởng 78 PASS,
một optional PDF skip. UI và nghiệm thu thật vẫn mở.

Checkpoint client 04/10: API review trả exact receipt IDs đã kiểm chứng để reload
không mất lựa chọn; primary three-industry journey tạo classified pair từ danh
sách đọc lại đã PASS. ZCode viết adapter frontend trong file riêng; GPT audit
phát hiện thiếu kiểm tra identity và xử lý sai universe rỗng, có RED/GREEN Linux.
Đây mới là client API cho bước UI, chưa có màn hình duyệt hoặc approval dữ liệu thật.

Checkpoint UI 04/10: UI duyệt rule/assignment Metric đã vào code; gate write
source-ready và KEEP/KEEP có regression RED trước sửa, GREEN sau sửa. Linux
frontend full 219/219, focused 19/19, typecheck/build PASS; independent finish
review Ship, design documenter độc lập giữ DESIGN.md không đổi. I06/I09/I10/I13
có `selected-insight-projection.ts` và schema `automation-insight-selection`
đóng; Linux root typecheck và 17 focused tests PASS; audit không còn lỗi vật
chất. Helper giữ corpus đầy đủ và pending, gọi calculator có sẵn, nhưng chưa có
Insight receipt/persistence/revision/UI đã xác thực. Bốn section chưa
automation-complete; nghiệm thu thật ba case vẫn mở, không claim release.

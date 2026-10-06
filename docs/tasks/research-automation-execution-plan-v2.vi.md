# Kế hoạch thực thi automation Market + Insight, v2

Ngày: 03/10/2026. Baseline code: `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, draft PR #110.

Trạng thái: v2.4, điều chỉnh điều phối theo OWNER ngày 03/10/2026 sau tự rà soát lệch trọng tâm M01/I14. Giữ quyết định nghiệp vụ v2.3; thay phân công bằng ba luồng đồng thời: Claude Opus 5.5 high, ZCode GLM-5.3-Flash high và GPT điều phối/audit/tích hợp/code phụ. Đồng thuận kế hoạch không thay bằng chứng nghiệm thu code hoặc quyền activation Fedora. Việc chưa có bằng chứng vẫn để checkbox mở.

## 0. Mục tiêu điều hành và hiện trạng duy nhất

Hoàn thiện luồng tự động hóa 13 section Market và 17 section Insight theo phương pháp đã duyệt, dùng chung cho nhiều sản phẩm. Mỗi section phải có nguồn đầu vào, phương pháp thực thi, đầu ra truy nguồn được và bằng chứng kiểm chứng. Nghiệm thu trên ba case đã chọn, hỗ trợ hai web report và hai PDF riêng. Section thiếu dữ liệu phải nêu rõ phần thiếu, không được tính là phân tích hoàn thành. R1 chỉ là checkpoint, không thay mục tiêu toàn bộ 30 section hoặc R2.

[Bảng điều hành 30 section](../research/research-30-section-progress.md) là đầu mối hiện trạng. Inventory kỹ thuật, matrix ba case và handoff là bằng chứng liên kết, không là các bảng tiến độ cạnh tranh. Mỗi dòng tách: phương pháp, nguồn/authority, tích hợp, kiểm tra synthetic, nghiệm thu thật và blocker. Không cộng số test, heading, PDF hoặc gate thành tỷ lệ hoàn thành.

Mọi gói code phải ghi section hưởng lợi, file sở hữu, dependency thực, đầu ra có thể quan sát và điều kiện dừng. Gói hạ tầng chỉ được ưu tiên nếu chỉ ra blocker cụ thể đang cản các section đó. Sau hai checkpoint không thêm đầu ra dùng được hoặc gỡ blocker production, phải đổi phân bổ công việc trước khi giao tiếp; không chỉ ghi một đoạn giải thích trong nhật ký.

M01/I14 giữ nguyên code đã làm nhưng tạm dừng mở rộng và polish trong đợt này, trừ lỗi sai số, sai nguồn, mất dữ liệu hoặc lỗi cản tích hợp. Chúng không chặn việc nối các method family độc lập. JEV chỉ là tác vụ có giả thuyết/rubric rõ, được audit; không làm nhãn chính thức, tự duyệt hoặc thay tính toán deterministic.

### Đợt ba luồng B1

Yêu cầu diễn giải tiếng Việt của OWNER 04/10: dùng skill `humanizer-vi`
(`longhang2004/vietnamese-humanizer`, revision
`576c80fb445a8b2e9ec1993a6490ab6529b89d12`) để biên tập phần diễn giải AI.
Giữ giọng phân tích, số liệu, nguồn, phủ định, mức chắc chắn và giới hạn;
không sửa quote nguyên văn, công thức, span coding hoặc báo cáo lịch sử.
Quy tắc dùng chung được ghi trong AGENTS.md. Skill đã cài tại Codex local;
chưa mặc nhiên tích hợp vào prompt/runtime Fedora. Khi tích hợp, ghim phiên
bản hướng dẫn vào prompt và kiểm chứng bảo toàn nội dung; không thêm một lượt
model riêng chỉ để đổi giọng văn nếu có thể áp dụng ngay khi tạo diễn giải.

Điều chỉnh phân công theo OWNER 04/10: ưu tiên GPT 5.6 medium cho vai trò
điều phối; Claude Opus 5.5 high là coder chính cho gói độc lập, ZCode
GLM-5.3-Flash high nhận gói code hoặc audit hẹp. GPT giữ audit, tích hợp và
kiểm tra Linux, không tự gom toàn bộ việc khi worker đã hoạt động lại.
Đây là cấu hình phân công mong muốn, không phải bằng chứng model của phiên
Codex hiện tại đã được chuyển. Không đổi model runtime/report trong TDN.
Mỗi checkpoint phải ghi worker thực sự đã chạy, kết quả hoặc lỗi; không coi
phân công dự kiến là đã dispatch. JEV chỉ tham gia với giả thuyết và rubric
cụ thể, dùng ở chế độ đề xuất có audit, không thay công thức hoặc quyền duyệt.

| Luồng | Gói và section hưởng lợi | Sở hữu / điều kiện kết thúc |
|---|---|---|
| Claude Opus 5.5 high | B1-A / P3.2a: backend chấp nhận membership Metric theo lô, mở đường M03/M04 và trace M02/M13 | Service/contract/API acceptance mới và test riêng; không sửa renderer, không tự adoption rulebook. Receipt đơn lẻ chưa tính là hoàn thành classified automation; phải bàn giao dependency vào report revision. |
| ZCode GLM-5.3-Flash high | B1-B / P3.1a/P4: projection corpus + trace cho I03/I17 | Module pure mới và test riêng. Đếm bản ghi duy nhất, pending/blocked/khai báo hợp lệ tách riêng; không suy diễn số khách hàng, không tự coding/approve. GPT nối production caller. |
| GPT | B1-C / P0/P3.1a: bảng 30 dòng, tích hợp I03/I17, audit code và kiểm tra Linux | Plan/status/inventory, report renderer và test tích hợp. Không ghi file đang giao coder. Kiểm chứng historical replay và giữ semantic counter cũ. |

Không thêm writer thứ tư. Worker không chạy project test/typecheck/build trên Windows, không commit/push/merge/deploy, không đọc secrets/live DB hoặc gọi nhà cung cấp dữ liệu. GPT chạy kiểm tra ảnh hưởng trên Linux scratch và kiểm tra tích hợp trước khi nghiệm thu. Đợt này không hứa đóng toàn bộ 30 section và không chấp nhận dữ liệu thật thay OWNER.

Sau B1 ưu tiên: (1) nối receipt vào version mới và CORE/WIDE, (2) dùng lại corpus accepted cho I06/I09/I10/I13, (3) nguồn price/unit M08 và các gate đã duyệt M10/I11/I12/I16, (4) tổng hợp M01/M11/M12/I14/I15 từ kết quả đủ điều kiện. Các nhóm độc lập được chạy song song; thứ tự này không buộc chờ tất cả dữ liệu ngành trước khi làm nhóm khác.

Checkpoint G 04/10: exact package/revision/API/replay/report đã nối cho bốn gate;
Linux 23/23 nhóm ảnh hưởng PASS, lượt cuối 14 PASS và một optional PDF skip.
[Handoff](../handoffs/research-g-source-snapshot.md) giữ rõ giới hạn nguồn thật,
UI và visual acceptance. Không tăng completion count. Tiếp tục M08 nguồn-native
và các family chưa nối; không quay lại polish M01/I14 hoặc thêm engine lưu mới.

Checkpoint 04/10: mục (1) đã nối backend/renderer, Linux 78 PASS + một optional
PDF skip; không gọi lại AI khi chỉ đổi phân loại Metric. B1 UI đã qua finish
review và kiểm tra Linux frontend 219/219; đọc lại receipt sau reload. Giữ mục (2)
là gói method-family kế tiếp; không mở thêm engine receipt hay polish I14.
Claude đã nối bộ đọc nguồn Insight sau khi quota hồi; ZCode đã cập nhật hai
file tiến độ, GPT audit riêng. GPT nối owner lưu quy tắc/đề xuất/lựa chọn cho
I06/I09/I10/I13; report revision/replay và hiển thị bốn section đã có Linux proof
(46 PASS, một optional PDF skip). HTTP của Claude đã có kiểm tra Linux nhóm
ảnh hưởng 48 PASS, một optional PDF skip; client/revision 7/7, frontend
typecheck/build PASS. GPT tiếp quản client sau ZCode timeout 420 giây và sửa
guard có RED/GREEN. UI chọn span/quan hệ còn mở, là việc tiếp theo cùng source
admission M08 và bounded gates độc lập. Không tái gọi provider hoặc
AI để xuất lại nguồn đã lưu. Xem bảng 30 dòng,
không diễn giải checkpoint này thành hoàn thành M03/M04 hoặc toàn bộ B1.

## 1. Mục tiêu và quyền ưu tiên

Checkpoint UI B2 tiếp theo 04/10: Claude bàn giao, GPT sửa ba nhóm mất bản nháp/
chọn occurrence và focus, chạy Linux 18/18 affected tests, typecheck/build PASS.
Browser desktop/mobile synthetic có bốn thao tác OWNER tách riêng và giữ exact
quote. [Handoff](../handoffs/research-b2-insight-ui.md) ghi rõ finish/corpus/real
acceptance còn mở. Không đồng nhất UI duyệt tay với tự động coding hoặc R2.
G exact source admission/revision là nhánh breadth kế tiếp, không quay lại polish
M01/I14 và không đợi dữ liệu thật của một ngành để làm cả nhóm.

Checkpoint breadth 04/10: G source-only verification đã tách khỏi prerequisite
Metric giả, 7/7 Linux PASS, nhưng source admission/revision automation còn mở.
M09 v2 đã đưa ngày nguồn khai báo vào report, không suy nhân quả; 31/31 nhóm
ảnh hưởng PASS, RED/GREEN và v1 compatibility có bằng chứng. Không tick hoàn tất
M09 hoặc G. Claude tiếp tục UI B2; GPT audit/tích hợp, không mở rộng M01/I14.
Xem [handoff B3](../handoffs/research-b3-source-method-breadth.md).

Một bản ứng dụng chạy được ba trường hợp: thạch dừa (sản phẩm Shopee đã biết), bình giữ nhiệt và quạt cầm tay (khám phá từ từ khóa). Người dùng nhập sản phẩm, xác nhận phạm vi, theo dõi nguồn/phương pháp và nhận hai báo cáo có nội dung hữu ích. Market và Insight có web view riêng và PDF riêng từ cùng bộ kết quả đã lưu.

Không cần sửa code theo từng sản phẩm. Cấu hình ngành có phiên bản và bằng chứng là đầu vào; tên ba sản phẩm không trở thành nhánh điều kiện trong production. Ba case là bộ nghiệm thu hồi quy, không phải giới hạn ngành của tính năng.

Kế hoạch này thay thứ tự triển khai và checklist điều hành của [kế hoạch khắc phục trước](research-30-section-remediation-plan.vi.md). Các giới hạn nghiệp vụ, authority phương pháp và ADR đã duyệt vẫn giữ nguyên. Không coi kế hoạch mới là quyền thay đổi ADR, quyết định OWNER hoặc triển khai live.

Phân biệt hai mốc:

- **R1, chạy được trên web có hỗ trợ nguồn:** người dùng có thể gắn export hợp lệ ngay trong UI nếu connector chưa tự lấy được. Báo cáo ghi nguồn được người dùng cung cấp. Đây chưa phải mục tiêu nhập từ khóa rồi tự chạy hoàn toàn.
- **R2, khép kín trong phạm vi nguồn đã hỗ trợ:** sau xác nhận phạm vi, hệ thống tự thu nguồn, thực hiện phương pháp và lưu hai báo cáo. Nếu Metric hoặc nguồn bắt buộc vẫn cần thao tác thủ công, R2 còn mở. Nguồn thiếu thực sự không được bịa để đạt mốc.

R1 là checkpoint giao hàng, không thay thế mục tiêu R2 và không đồng nghĩa hoàn thành 30 section. Các section cần dữ liệu nội bộ, nghiên cứu sơ cấp hoặc phương pháp chưa được duyệt có thể tiếp tục bị chặn; phải công khai phần còn thiếu.

Điều kiện ra R1: mỗi case phải có ít nhất một kết quả định lượng Market hợp lệ trong M03-M08, một kết quả Insight có quote/coding hợp lệ trong I04-I10, và bản tổng hợp M01/I14 dẫn đúng các kết quả đó. P0.3 ghi trước section cụ thể và output kỳ vọng của từng case theo authority hiện có. Đây là mức nội dung tối thiểu của checkpoint, không phải định nghĩa lại phương pháp hoặc giảm đích 30 section. Nếu nguồn không đáp ứng, báo thiếu và giữ R1 chưa đạt; không thay tiêu chí bằng một PDF toàn blocker. R1 còn phải đạt các đường UI/intake/replay và hai export ở P1/P6/T7.

Coding hợp lệ nghĩa là coding đã accepted qua đường hiện có hoặc delta P3.2a/P4.3a đã được business session duyệt; proposal/JEV/AI chưa accepted không tính cho R1. Nếu cần đường acceptance mới mà delta chưa duyệt, ghi R1 Insight BLOCKED theo dependency này; không chặn nhánh Market hoặc phần code độc lập.

## 2. Baseline đã kiểm tra và phần chưa có

- Đã có worker, thu nguồn, method modules, corpus/coding có vị trí nguồn, kết quả bất biến và hai report renderer. Giữ và nối lại; không viết lại từ đầu.
- Metric bridge v1 thực hiện preparation/readiness/tính ALL từ export gắn chính xác với run. WIDE/CORE cố ý bị chặn khi chưa có nhãn hợp lệ.
- Resolver Metric và native review đang duyệt toàn kho nguồn có giới hạn 100 gói. Báo cáo thủ công cũng dùng inventory này. Nguồn automation tăng dần hoặc nguồn hỏng không liên quan có thể làm đường khác thất bại. Đây là lỗi cần sửa, không phải yêu cầu scale giả định.
- Chưa có đường production UI/API để gắn đủ package Metric cho run đã xác nhận. Kết quả từ acceptance script chưa chứng minh người dùng tự vận hành được.
- Synthesis/AI interpretation chưa được nối đầy đủ vào automation. Tài liệu inventory có các đoạn lịch sử chưa phản ánh head hiện tại.
- `completedAnalyticalSections` hiện cố định bằng 0. Không đổi thành số section có HTML; cần định nghĩa và tính từ bằng chứng phương pháp/nội dung thật, tách review của người dùng.
- JEV đang ở hướng thử nghiệm. Chưa có benchmark TDN chứng minh lợi ích, chưa được dùng làm nhãn chính thức.

## 3. Quy tắc chống lệch kế hoạch

1. Mỗi thay đổi gắn với một ID checklist dưới đây, chỉ rõ section hưởng lợi và bằng chứng nghiệm thu. Việc không có ID phải ghi đề xuất thay đổi trước khi code.
2. Mỗi phần việc kết thúc bằng đầu ra người dùng quan sát được hoặc sửa một lỗi cản đầu ra đó. Không tiếp tục thêm tầng lưu/kiểm chứng nếu không nêu được lỗi hay nhu cầu cụ thể.
3. Không chờ thạch dừa được duyệt scope mới làm nguồn/phương pháp của ngành khác. Chặn đúng section/run phụ thuộc quyết định chưa có.
4. Mỗi slice dùng chung được kiểm tra với dữ liệu đủ, thiếu và một ngành khác. Cả ba case được chạy trên cùng build tại checkpoint tích hợp; không đợi cuối dự án mới thử đa ngành.
5. Nguồn, tính toán, nhận định AI và quyết định người dùng là bốn lớp khác nhau. Không dùng điểm tin cậy của model để nâng nhận định thành fact.
6. Không thêm Redis, LangGraph, microservice, database mới, DSL hay một agent cho mỗi section. Chỉ mở rộng interface/service hiện có khi ghi được khoảng trống cụ thể.
7. Không chạy lại thu thập tính phí khi chỉ sửa parser/renderer và đã có response phù hợp để replay. Không chạy test, typecheck hoặc build trên Windows.
8. Mỗi checkpoint cập nhật bằng chứng và việc kế tiếp; số test, số commit, số trang PDF không phải tỷ lệ hoàn thành nghiệp vụ.
9. Các ký hiệu trạng thái bên dưới là yêu cầu hành vi, không mặc định phải tạo enum, bảng hoặc ledger mới. Coordinator chọn cách biểu diễn nhỏ nhất tương thích code đang có.

## 4. Phân công và dependency

Một điều phối GPT và ba luồng code có file sở hữu độc lập theo §0: Claude Opus 5.5 high làm phần code lớn; ZCode GLM-5.3-Flash high làm gói nhỏ có boundary rõ; GPT audit toàn bộ thay đổi, tích hợp và code phần còn lại. Phân công A/B/C dưới đây là các miền công việc dài hạn, không phải ba agent bổ sung. Không tự đổi model/gói tài khoản khi lỗi quota; ghi blocker và chuyển phần độc lập. Không tạo agent chỉ để lấp vai trò.

| Người/nhánh | Phần sở hữu | Giới hạn |
|---|---|---|
| GPT điều phối | P0/P1, shared contracts, orchestration/API registration, identity/retry, Linux validation, tích hợp/release | Một writer cho các file chung và migration; không đồng thời giao file đó cho nhánh khác |
| A, nguồn + Market | P2, P3; adapter và method family, cấu hình ngành | Không viết lại service chung hoặc sửa raw evidence |
| B, Insight + AI | P4, P5, J1; corpus, coding, claim adapter, bounded interpretation | JEV là phần phụ, không làm chậm đường Insight baseline |
| C, UI + hai báo cáo | P6; intake UI, trạng thái, chart/citation/web/PDF | Không tính số liệu trong UI hoặc thay template đã được duyệt |
| Review marketing framework files | Delta scope/codebook, authority phương pháp, điều kiện đầu ra nghiệp vụ | Không yêu cầu duyệt lại toàn bộ 30 section hoặc từng fixture kỹ thuật |
| Competitor mockup report design | Duyệt cuối hình thức Market/Insight web/PDF | Không phải gate cho API hoặc app UI; OWNER duyệt report sau Claude |

Thứ tự: P0 ngắn → P1 sửa isolation và chốt giao diện tích hợp → A/B/C chạy song song → checkpoint R1 → hoàn thiện ma trận 30 section và nguồn tự động → checkpoint R2. P5 bắt đầu ngay khi có claim hợp lệ đầu tiên, không chờ P2/P3/P4 hoàn tất toàn bộ. J1 chạy sau khi B có bộ đánh giá; nếu thiếu key/quota thì hoãn J1, không chặn A/B/C.

R1 Insight có dependency acceptance cụ thể: coding đã accepted qua đường hiện có, hoặc P3.2a/P4.3a sau business review. Đưa delta này cho business session ngay từ P0, không đợi tới cuối đợt mới hỏi. OWNER không phải duyệt fixture kỹ thuật; quyền chấp nhận sử dụng coding/nhận định vẫn được giữ.

Mỗi nhánh nhận danh sách file sở hữu trước khi code. Handoff gồm base/head, checklist ID, đường vào production, output mẫu, kiểm thử thực chạy, giới hạn và dependency. Coordinator tích hợp shared files sau handoff, không để các nhánh tự merge chồng nhau.

## 5. Checklist thực thi

### P0. Chốt bảng điều hành tại head hiện tại

- [ ] P0.1 Đối chiếu catalog 30 section với authority A41 và module đang chạy; ghi method ID/version, input contract, entry point, output kind, review requirement. Catalog có ID/order nhưng không tự chứng minh authority hoặc implementation.
- [ ] P0.2 Tạo một bảng 30 × 3 case; mỗi ô dẫn tới input đã ghim, điều kiện đủ dữ liệu, output kỳ vọng, output quan sát, blocker và việc kế tiếp. Dùng fixture synthetic cho Git; dữ liệu thật ở ngoài Git với digest/locator tham chiếu riêng.
- [ ] P0.3 Chốt tập case trước khi đánh giá; không thay nguồn hoặc giảm điều kiện nghiệm thu sau khi thấy fail. GPT chọn fixture kỹ thuật; business session xử lý phần tiêu chí nghĩa chưa rõ, không bắt OWNER duyệt từng fixture.
- [ ] P0.4 Tách bốn chiều: có nguồn hợp lệ / phương pháp đã chạy / đầu ra dùng được trong phạm vi nào / đã review hay chưa. Giữ mẫu số 30 và công khai số section chưa đủ nguồn, chưa hỗ trợ và đang lỗi. Bản projection mới tính số section đáp ứng trọn điều kiện phân tích đã duyệt, không từ số heading hay mọi METHOD_OUTPUT; source table, partial output và readiness gate đếm riêng. Giữ nguyên semantic/counter của report v1 đã lưu.

Cách làm: mở rộng inventory/handoff hiện có, không tạo dashboard quản trị mới. Chỉ đánh dấu xong khi bảng có đủ 30 ID và mọi claim hiện trạng đều có đường code hoặc artifact đối chiếu. Không hứa thời gian hoàn tất bằng ước lượng chưa đo.

### P1. Sửa đường nguồn gắn run và khả năng vận hành trên web

- [ ] P1.1 Thêm exact lookup vào interface Foundation: Metric dùng key/version gắn run. Native review hiện chưa có key gắn run, nên lưu reference packageId/manifest digest được xác minh khi admission/attachment, giữ kiểm tra đúng listing và phiên bản; không bịa prefix cho các package lịch sử. Các đường execute mới chỉ xác minh nguồn được chọn. Analysis không SQL chéo module. Tách attachment/internal automation khỏi inventory chọn nguồn thủ công trước khi đếm giới hạn; giữ cap hợp lệ của nguồn thủ công, không nới limit toàn cục. Liệt kê cả ba caller Metric/native/manual và giữ replay lịch sử.

Phân loại chỉ dựa trên provenance bền vững đã lưu (attachment record/admission reference); package lịch sử không xác định được giữ trong inventory thủ công, không đoán theo tên/path. T2 có ca package lịch sử không marker. Descriptor gắn run chỉ được dùng làm provenance khi đã qua kiểm tra contract/binding thực tế, không từ một chuỗi tên trông giống attachment.
- [ ] P1.2 Phân biệt không có attachment, chủ động bỏ qua, attachment bị từ chối và method thất bại. Lưu mã lỗi có thể hành động; UI không lộ path/SQL/secret. Gói không liên quan không làm hỏng run.
- [ ] P1.3 Thiết kế attach cho run đã xác nhận qua service/API hiện có. Server dựng identity/descriptor từ run, người dùng không nhập hash hay metadata kỹ thuật. Kiểm tra keyword/scope/kỳ/loại file trước khi chạy preparation; chưa xác minh được metadata thì chờ bổ sung, không suy đoán.
- [ ] P1.3a Upload đi qua đường file có giới hạn riêng, auth/Origin, định dạng/size validation và staging theo request; không nới body limit chung của OWNER API để nhận XLSX. Ghi rõ metadata nào đọc được từ nguồn, metadata nào do người dùng khai; tự dựng descriptor không biến khai báo thành provider-verified evidence.
- [ ] P1.4 UI cho gắn nguồn, xem lỗi, tiếp tục hoặc bỏ qua nguồn rõ ràng. Lựa chọn bỏ qua được lưu; method độc lập tiếp tục. Refresh/restart giữ trạng thái. Dữ liệu bổ sung sau khi report đã chốt tạo phiên bản mới, không sửa report cũ.
- [ ] P1.5 Chốt resume tại đúng bước thiếu nguồn hoặc render lỗi: cùng input không tạo calculation trùng, không gọi lại provider/AI khi đã có kết quả hợp lệ; thay input tạo identity/version mới. Trường hợp request tính phí không rõ kết quả cần đối soát.
- [ ] P1.5a Trước code, GPT chốt bảng chuyển trạng thái cho attach/wait/skip/cancel/restart và terminal run. Chỉ thêm state/contract/migration tối thiểu khi schema hiện có không biểu diễn được; không dùng polling để giữ worker bận khi chờ người. Report đã chốt không mở lại tại chỗ; phép bổ sung nguồn tạo phiên bản/attempt rõ ràng qua service sở hữu.
- [ ] P1.6 Giữ verifier v1 và lịch sử ALL nguyên nghĩa. Phiên bản classified sau này có method identity riêng; không đổi hằng số v1 để ép bản cũ thành classified.

Đầu ra nghiệm thu: từ UI trên scratch Linux tạo run, xác nhận scope, gắn export hợp lệ, nhận hai bản báo cáo; không cần script gắn package. Kho có hơn 100 attachment automation và một nguồn không liên quan bị hỏng không làm hỏng exact Metric/native lookup. Inventory thủ công vẫn hoạt động với tập nguồn thủ công hợp lệ nằm trong cap, không đếm attachment automation; trường hợp hơn 100 nguồn thủ công thật vẫn báo giới hạn trung thực. Đây là sửa hành vi thực, không phải stress test.

### P2. Thu dữ liệu đủ dùng cho nhiều ngành

- [ ] P2.1 Tách product discovery cards khỏi research dataset. Ghi khả năng từng connector: nền tảng, kỳ truy cập, pagination/export cap, trạng thái tài khoản, độ phủ, chi phí và hạn chế thực tế.
- [ ] P2.2 Kalodata: dùng endpoint đã xác minh, thu pagination có điều kiện dừng và checkpoint; dedupe theo ID thật; lưu requested/observed period. Không cộng cửa sổ overlap hoặc tổng không có tính cộng; không suy toàn thị trường từ top sản phẩm.
- [ ] P2.3 Shopee: từ keyword đề xuất đúng listing/URL có nguồn; case URL đã biết phải giữ đúng shop/item. Qua lựa chọn/xác nhận đã có của UI, lấy review thật bằng connector được phép. Không gán sản phẩm TikTok thay exact Shopee khi thất bại.
- [ ] P2.4 Metric: làm rõ intake export R1; song song xác minh khả năng thu/export tự động hợp lệ. Login/CAPTCHA/quyền gói phải thành blocker có hướng xử lý, không bypass. Nếu không có đường unattended được phép, giữ R2 mở và báo OWNER một lần với bằng chứng.
- [ ] P2.5 SerpApi: dùng để discovery và bối cảnh; khi claim cần nội dung gốc, lấy nguồn qua đường được phép và giữ locator/thời điểm. Không biến snippet thành bằng chứng nhân quả hay quy mô thị trường.
- [ ] P2.6 Replay nguồn đã lưu trước; chỉ thu mới theo danh sách thiếu. Dừng lane khi parser lỗi lặp lại; retry transient có giới hạn, hỗ trợ cancel và ghi cost/call/point, không bịa tỷ giá quy đổi.

Nghiệm thu: bình và quạt được hệ thống đề xuất listing và lấy corpus nếu nguồn cho phép, không yêu cầu OWNER tự đi tìm URL. Chứng minh cả đường thành công và không truy cập được. Negative test không thay thế bằng chứng thành công của connector khi tuyên bố R2.

### P3. Phương pháp Market và cấu hình phân loại

- [ ] P3.1 Reuse scope/label/codebook contract đã có; ghi rõ thiếu gì trước khi đề xuất schema mới. Một cơ chế classified dùng chung, quy tắc ngành là dữ liệu có phiên bản.
- [ ] P3.1a GPT sở hữu bản mapping source-neutral rõ ràng cho M02/M13/I03/I17 theo ADR 0007: field nguồn, scope, denominator, trace và reader tương ứng. Thêm cạnh đường cũ, không đổi ý nghĩa contract Metric lịch sử. Business session chỉ review delta semantics.
- [ ] P3.2 Phân biệt scope approval, rule/codebook adoption và chấp nhận membership cụ thể. Rule deterministic chỉ tạo accepted membership khi authority của rule cho phép; phải lưu rule/input revision và trace. Proposal AI còn PENDING tới khi acceptance. UNKNOWN là giá trị nhãn, không phải trạng thái quyết định: accepted UNKNOWN vẫn ngoài WIDE; missing/stale/unreviewed không được đổi tên thành UNKNOWN.
- [ ] P3.2a Business session đã AMEND hẹp có điều kiện; implementation phải giữ đầy đủ ngữ nghĩa ở [bản review acceptance](../research/research-batch-acceptance-semantics.md). OWNER xem lô đề xuất có nguồn và xác nhận tập proposal bất biến với exact ID/content, input/source/corpus revision, scope và rulebook revision. Filter không tự chọn các record; confirmation nêu cả lựa chọn đang khuất. Sửa label/code tạo proposal revision mới. Lưu authenticated actor/thời điểm/accepted subset, reject toàn batch khi stale/conflict, exact retry trả receipt cũ và không áp vào revision mới; batch cộng dồn không đếm lặp assignment. Không chọn vẫn pending, không phải rejected. Không có AI auto-accept, role mới hay reuse B7/B10 làm quyền coding. MetricSourceLabels giữ đóng, receipt đứng cạnh; đủ disposition của toàn universe mới mở classified, không thu universe xuống accepted subset. GPT sở hữu contract/service; C sở hữu UI. Review này không adoption codebook ngành hoặc chấp nhận dữ liệu thật.
- [ ] P3.3 Nối ALL/CORE/WIDE vào M03/M04, dùng đầy đủ nhóm và mẫu số. Trend chỉ chạy khi chuỗi có cùng ngữ nghĩa/độ phủ; không gọi mẫu quan sát là toàn thị trường.
- [ ] P3.4 Nối M05/M06/M07/M09 từ method mô tả đã có; M07 giữ peer set được xác nhận riêng. Ghi count theo listing/shop/source, không gộp entity tùy ý.
- [ ] P3.5 Nối generic unit normalization M08 theo đơn vị nguồn được hỗ trợ; giữ giá listing nếu thiếu pack basis. Không tự áp đơn vị viên canxi, không tính margin khi thiếu cost.

Nghiệm thu: cùng binary và cùng contract xử lý ba bộ case config; các số kỳ vọng được tính độc lập từ nguồn nhỏ đã ghim. Scope riêng chưa duyệt chỉ chặn phép tính liên quan, không chặn dữ liệu ALL hoặc các section độc lập.

### P4. Corpus và phương pháp Insight

- [ ] P4.1 Một corpus adapter dùng chung: record ID, exact source locator, quote/span, product/source identity, ngày thật hoặc UNKNOWN. Dedupe có policy; không tạo customer identity.
- [ ] P4.2 Nối các method located coding vào corpus qua codebook có phiên bản. Giữ phủ định, hearsay, mixed sentiment, điều kiện sử dụng và same-record relation.
- [ ] P4.3 Tách proposal coding, accepted coding và pending; không dùng sao đánh giá thay nội dung, không ép mọi review có nhãn. Số đếm từ code; mẫu số thể hiện rõ phần pending và đơn vị record, không gọi là số khách hàng.
- [ ] P4.3a Reuse đường chấp nhận theo lô P3.2a cho coding với đúng contract/ngữ nghĩa riêng. UI giữ exact quote/span, attribution, group và relation cần thiết; multi-code chỉ theo codebook cho phép, không accepted đồng thời các assignment loại trừ nhau. Có thể giao accepted subset dạng partial, nhưng pending vẫn hiện trong coverage và final corpus ratios giữ gate completeness hiện có. Reviewer không phải duyệt từng fixture bằng chat. Rule/codebook approval không mặc nhiên chấp nhận output AI; OWNER acceptance không biến DECLARED thành FACT hoặc association thành causality.
- [ ] P4.4 Tạo pipeline đề xuất coding bằng model trong phạm vi đã cho phép và đánh giá theo rubric trước khi dùng làm đầu vào chính thức. Không tự nâng JEV/LLM proposal thành accepted để lấp trống section.
- [ ] P4.5 Mỗi nhóm section dùng cùng coded corpus phù hợp, không đọc và tính lại toàn corpus riêng cho từng section. Invalidation chỉ lan tới method/output phụ thuộc input đã đổi.

Checkpoint P4.4 ngày 04/10: model backend, operator opt-in riêng, endpoint OWNER
và UI khởi tạo/chia lô toàn corpus đã nối cho chín family. Giữ exact source/batch,
pending và outcome unknown; không tự retry/accept. Claude làm UI/transport,
GPT audit/sửa read-back và focus, kiểm tra Linux 17/17, typecheck/build cùng
Chromium desktop/mobile synthetic PASS. Finish review độc lập SHIP cho panel;
đánh giá rubric trên nguồn thật còn mở, nên P4.4 chưa tick. Không bật model thật hoặc đổi runtime live.
[Handoff UI](../handoffs/research-insight-model-ui.md).

Checkpoint 04/10: API đề xuất nguyên văn I10/I13 đã nối codebook/source đã duyệt
với proposal owner hiện có, Linux HTTP + matching đã qua. Chưa có nút khởi tạo
trên UI hoặc acceptance thật. Đây là phần deterministic hỗ trợ P4, không phải
hoàn tất P4.4: semantic model proposal và rubric còn phải làm. Không dùng no-hit
để suy không có chủ đề. [Handoff](../handoffs/research-insight-literal-proposals.md).

Nghiệm thu: với đủ bằng chứng, quote và quan hệ được đưa tới đúng section; khi không đủ, giải thích cụ thể. Bản nhận định không được suy nhân khẩu, động cơ, funnel hay causal relation từ dữ liệu không nói vậy.

### P5. Nội dung tổng hợp và diễn giải, làm sớm

- [ ] P5.1 GPT sở hữu interface claim dùng chung, thêm đường source-neutral cạnh đường Metric; B chỉ làm adapter và gọi interface đã chốt. Giữ service/ledger và replay của report thủ công nguyên hành vi; có regression ở boundary này. Không giả Metric packet hoặc tạo ledger thứ ba để gọi interpretation.
- [ ] P5.2 M01/I14 có bản nháp tổng hợp sớm từ claim đủ điều kiện; sau đó M11/M12/I15. Mỗi câu nhận định gắn claim/source IDs, supporting/counter evidence và giới hạn.
- [ ] P5.3 Số liệu lấy từ verified bindings; kiểm tra ID, đơn vị, kỳ và phạm vi trước render. Model viết nội dung, không tính số, tạo nguồn hoặc tự chọn hành động kinh doanh.
- [ ] P5.4 Lưu input/model/prompt/method revision và response thực. Xem lại/xuất PDF không gọi AI; regenerate rõ ràng tạo attempt/version mới. Không hứa model luôn sinh đúng cùng một câu.
- [ ] P5.5 Citation resolve và schema validation là kiểm tra máy. Business reviewer kiểm tra rubric và lỗi ngữ nghĩa trong acceptance samples; OWNER xem nhận định/bằng chứng trên UI để chấp nhận sử dụng, không cần chặn render AI draft. Không tự lưu approval nếu chưa có hành động rõ ràng. Nếu model không có evidence đủ, lưu trạng thái thiếu, không tạo kết luận tích cực mặc định.

Nghiệm thu: người đọc thấy một nhận định có ích và có giới hạn từ evidence thật, click tới đúng nguồn; dữ liệu thiếu không biến thành suy đoán được trình bày như fact. Owner-review chưa xong không chặn việc tạo AI draft, nhưng draft không được gọi là báo cáo đã duyệt.

### P6. UI, chart và hai report

- [ ] P6.1 UI giữ thiết kế đã duyệt; trạng thái từng nguồn và bước tiếp theo dễ hiểu. Thiếu điều kiện phải chỉ ra cần làm gì, không chỉ nút disabled hoặc lỗi chung.
- [ ] P6.1a UI acceptance theo lô ở P3.2a/P4.3a dùng pattern xác nhận hiện có: đúng run, scope/rule revision, quote, lựa chọn tường minh; không trộn proposal, accepted và UNKNOWN. Có tải lại sau conflict, không optimistic approval.
- [ ] P6.2 Hai web view và hai PDF đọc cùng frozen semantic version, không tạo nội dung qua export. Tách số liệu/quan sát, nhận định AI và quyết định OWNER.
- [ ] P6.3 Chart dùng đúng phép tính, mẫu số, đơn vị và kỳ. Thiếu điều kiện thì dùng bảng phù hợp; không ép đủ chart cho đủ section. Flint chỉ trợ giúp audit chart, không là nguồn số hay dependency mới bắt buộc.
- [ ] P6.4 Giữ phụ lục trace đầy đủ nhưng không đẩy hàng chục trang diagnostics vào phần kết luận. Web có disclosure; PDF chia nội dung và phụ lục rõ. Không giấu blocker làm thay đổi cách đọc kết quả.
- [ ] P6.5 Xem desktop/mobile, font tiếng Việt, pagination, bảng/chart không bị cắt, citation và hai nút export. Gửi Claude judge đúng Market/Insight, sau đó OWNER duyệt.
- [ ] P6.5a Reviewer trả một danh sách lỗi có ID/priority và evidence. Tối đa hai vòng sửa/recheck cho cùng report version; chỉ kiểm tra delta và phần bị ảnh hưởng. Còn lỗi sau đó thì GPT gom đề xuất để OWNER quyết định, không tiếp tục polish vô hạn. Lỗi sai số, thiếu nguồn, mất dữ liệu hay bảo mật vẫn chặn release; hết hai vòng không tự cho phép bỏ qua.

### J1. JEV thử nghiệm có kiểm soát, không chặn luồng chính

OWNER nói “tạm dùng JEV”; kế hoạch hiểu là thử theo phạm vi vừa thảo luận: shadow classification, chưa dùng nhãn JEV cho kết quả chính thức. Lượt lập kế hoạch này không gọi JEV hoặc gửi dữ liệu.

- [ ] J1.1 Thử một việc: gợi ý coding review theo nhãn/rubric đã định. Không mở thêm routing agent, điều khiển browser, scope approval hoặc viết báo cáo trong đợt này.
- [ ] J1.2 Adapter tùy chọn và tắt mặc định; giữ baseline hoạt động khi JEV thiếu key, timeout, lỗi hoặc quota. Pin model ID, câu hỏi, rubric, ngưỡng và input; credentials chỉ phía server.
- [ ] J1.3 Chọn pilot dự kiến 50 record mỗi case (150 tổng), bao gồm phủ định/hearsay/mixed/irrelevant và ca thiếu thông tin. Đây là mức thiết kế pilot, không là chứng minh đại diện thống kê. Giữ tập holdout độc lập với ví dụ dùng chỉnh prompt; business reviewer giải quyết nhãn nghĩa chưa rõ.
- [ ] J1.4 Trước live pilot, ghi bộ dữ liệu được phép gửi, chính sách provider, model khả dụng, ngân sách/call plan hữu hạn và tiêu chí so sánh. Không suy quyền gửi private corpus sang provider mới từ quyền chạy thu thập trước đây; thiếu quyền dữ liệu thì dùng tài liệu mẫu/synthetic và ghi giới hạn.
- [ ] J1.5 Đo false negative của thông tin hữu ích, false positive theo lớp, abstention, biến động khi gọi lại một tập con, latency/cost và công kiểm tra lại. So với baseline trên cùng holdout; không dùng model đang chấm làm ground truth của chính nó.
- [ ] J1.6 Lưu kết quả đánh giá riêng. Chỉ đề xuất promotion khi chất lượng không kém baseline theo tiêu chí đã chốt trước và có lợi ích đo được. Promotion cần quyết định riêng; điểm confidence cao không tự là nhãn được chấp nhận. Không tạo nền tảng benchmark mới.

## 6. Checklist nội dung đủ 30 section

Các dòng là mục tiêu nghiệm thu, chưa phải việc đã hoàn thành. Điều kiện chi tiết lấy từ authority phương pháp đã duyệt, không suy từ tiêu đề catalog. Với từng dòng, P0 giữ kết quả riêng cho ba case.

Checkbox bên dưới nghĩa là work item triển khai/kiểm tra đã giao xong cho ba case theo ma trận chốt trước: input binding đúng, method đúng authority, output và trạng thái kỳ vọng khớp, số liệu/citation kiểm chứng được, giới hạn hiển thị đúng và không còn lỗi tích hợp thuộc item. Checkbox không đồng nghĩa section đủ phân tích hoặc OWNER đã duyệt. Một case thiếu nguồn có thể đạt kiểm thử xử lý thiếu nhưng vẫn ghi BLOCKED ở ma trận; không được dùng nó để qua mức nội dung tối thiểu R1. Với input đã đủ, BLOCKED hoặc chỉ SOURCE_TABLE thay output được yêu cầu là fail.

Chỉ tính section hoàn chỉnh khi đáp ứng toàn bộ điều kiện nội dung theo authority của section đó. METHOD_OUTPUT giới hạn, context, source table và advanced gate không tự được tính. Ghi bốn số riêng: work item đã giao / đầu ra giới hạn dùng được / section đáp ứng đủ điều kiện phân tích / OWNER đã duyệt. Không dùng tổng checklist để công bố 30/30 phân tích.

| Xong | ID | Đầu ra cần đối chiếu | Work package |
|---|---|---|---|
| [ ] | M01 | Tóm tắt claim có nguồn, số từ binding, AI draft và giới hạn rõ | P5 |
| [ ] | M02 | Phạm vi yêu cầu/thực tế, rule/membership, kỳ, phương pháp thực chạy | P1/P3 |
| [ ] | M03 | Tổng/phân kỳ hợp lệ; sample và thị trường phân biệt; trend chỉ khi đủ chuỗi | P3 |
| [ ] | M04 | Cơ cấu có nhóm/mẫu số đúng; thiếu coverage thì bảng quan sát | P3 |
| [ ] | M05 | Measures nhu cầu theo đúng nghĩa sales/search và kỳ nguồn | P2/P3 |
| [ ] | M06 | Inventory nguồn cung theo khóa thật, coverage/truncation công khai | P2/P3 |
| [ ] | M07 | Peers được xác nhận, bảng so sánh cùng đơn vị/kỳ và ảnh có nguồn | P2/P3 |
| [ ] | M08 | Giá/variant/unit basis; unit economics chỉ khi có dữ liệu cost | P3 |
| [ ] | M09 | Sự kiện/rủi ro có ngày/nguồn, giả thuyết khác quan hệ nhân quả | P2/P3/P5 |
| [ ] | M10 | Gate dự báo đúng method; forecast execution ngoài phạm vi duyệt vẫn chưa hoàn thành | P3 |
| [ ] | M11 | Cơ hội dưới dạng hypothesis cùng support/counterevidence | P5 |
| [ ] | M12 | Các lựa chọn hành động có constraints, không tự quyết định/thực thi | P5 |
| [ ] | M13 | Trace đúng nguồn/phép tính/coverage/exclusion, nguồn độc lập đếm đúng | P1/P6 |
| [ ] | I01 | Câu hỏi/brief của người dùng; đề xuất AI và trường UNSET phân biệt | P4/P5 |
| [ ] | I02 | Hoàn cảnh được nói rõ trong nguồn, không dựng persona | P4 |
| [ ] | I03 | Corpus, inclusion/codebook/pending/denominator và giới hạn lấy mẫu | P4/P6 |
| [ ] | I04 | Hành vi có quote, phân biệt định làm/đã làm/không làm | P4 |
| [ ] | I05 | Thái độ đúng đối tượng, phủ định/mixed/unclear; không lấy sao thay text | P4 |
| [ ] | I06 | Chuỗi sự kiện nguồn có nói; không nối identity hoặc dựng funnel | P4 |
| [ ] | I07 | Lý do lựa chọn có quan hệ với hành vi trong cùng record | P4 |
| [ ] | I08 | Obstacle gắn attempted task, không mọi lời chê đều là rào cản | P4 |
| [ ] | I09 | Desired/current state và quan hệ gap có bằng chứng | P4 |
| [ ] | I10 | Chủ đề/coding counts từ code, N và pending/multicode đúng | P4 |
| [ ] | I11 | So nhóm chỉ khi assignment và mẫu số tương thích; không đoán demographic | P4 |
| [ ] | I12 | Touchpoint presence/exposure/outcome tách riêng, không bịa conversion | P4 |
| [ ] | I13 | Mention/brand/peer có locator và alias policy; không gọi mention là share thị trường | P4 |
| [ ] | I14 | Hướng cơ hội có claim/counterclaim, AI draft không là lựa chọn đã duyệt | P5 |
| [ ] | I15 | Alternatives/constraints có nguồn, không bịa khả năng hay ngân sách | P5 |
| [ ] | I16 | Design/protocol/result phân biệt; không bịa thử nghiệm hoặc effect | P4/P5 |
| [ ] | I17 | Mọi quote/coding/claim resolve về nguồn và trạng thái acceptance | P4/P6 |

M10/I11/I12/I16 có thể chỉ đạt gate/descriptive/design trong phiên bản được duyệt. Ghi riêng năng lực triển khai đã xong và giới hạn phân tích chưa làm; không dùng gate PASS để tick phân tích hoàn chỉnh. Nếu OWNER muốn mở rộng phạm vi đó, lập delta phương pháp với business session trước.

## 7. Kiểm thử, benchmark và release

- [ ] T1 Với mỗi test mới, ghi behavior, regression thực, lý do coverage hiện có chưa đủ và production boundary sở hữu. Không source-grep để chứng minh UI đã hoạt động; expected không lấy từ chính function đang test.
- [ ] T2 Kiểm tra có trọng tâm trên Linux: exact source isolation; attachment sai run/kỳ/shape; retry/render failure; old-version replay; UNKNOWN exclusion; citation/numeric binding; lỗi một nguồn không chặn method độc lập.
- [ ] T3 Test UI tại boundary tương tác: gắn nguồn/chờ/bỏ qua/resume, trạng thái sau reload, nút disabled có hướng dẫn, hai export. Browser walkthrough tại checkpoint tích hợp, không E2E toàn flow mỗi lần sửa nhỏ.
- [ ] T4 Giữ CI bắt buộc đang có. Trong quá trình làm chạy tập ảnh hưởng; full suite tại head tích hợp/release. Không giảm gate CI chỉ để tiết kiệm quota và không sửa assertion hợp lệ để xanh.
- [ ] T5 Cùng một head, chạy ba case bằng dữ liệu đã ghim; đánh giá đủ/thiếu và trường hợp bất lợi. Chỉ chạy live bổ sung cho gap có danh sách cụ thể và quyền phù hợp. Nguồn được gắn trước phải được ghi rõ, không tuyên bố là tự thu.
- [ ] T6 Báo thời gian từng bước, calls/cost theo provider, reuse/cache, chờ người dùng, số record dùng/loại/pending và số section thực có output. Không chỉ báo tổng thời gian chạy.
- [ ] T7 Bàn giao sáu PDF, sáu web report tương ứng, ảnh các màn quan trọng và bảng 30 × 3. Reviewer nội dung và Claude judge kiểm tra phần thuộc trách nhiệm; OWNER nghiệm thu sau cùng.
- [ ] T8 Trước Fedora: exact release head + Linux CI + scratch production acceptance, kiểm tra migration/tree/dependencies, private backup có kiểm chứng và rollback checkout. Có quyền activation cụ thể, xác nhận đã lưu chỉnh sửa trước restart. Không đổi domain/Cloudflare/Content Studio trong release này.
- [ ] T9 Sau activation: health/assets/read API, đúng commit, permissions, dữ liệu/artifact không mất; thao tác ghi chỉ trên synthetic acceptance được cho phép. Nếu migration không backward-compatible, không rollback binary lên database mới một cách mù quáng; dùng runbook phục hồi được duyệt.

## 8. Khi nào báo blocker, khi nào tiếp tục

Tiếp tục nhánh độc lập khi: một ngành chưa duyệt scope; một source bị login/quota; JEV unavailable; advanced forecast chưa được duyệt; hoặc đang chờ review thiết kế của report khác.

Dừng đúng phần bị ảnh hưởng và ghi: bằng chứng lỗi, section/run ảnh hưởng, điều đã thử an toàn, lựa chọn xử lý và ai quyết định. Chỉ hỏi OWNER khi cần quyền dữ liệu/provider mới, đăng nhập/chấp nhận phí mới ngoài phạm vi, xác nhận nghiệp vụ không có authority, mở rộng phương pháp hoặc activation live. Không hỏi lại quyết định Việt Nam, hai report, ưu tiên đủ dữ liệu, giữ UNKNOWN ngoài WIDE hay Linux-only.

Nếu hai checkpoint liên tiếp chỉ tăng metadata/test nhưng không thêm output dùng được hoặc sửa blocker production, coordinator phải rà lại dependency trước khi giao tiếp. Không tự mở thêm framework để giải quyết chậm tiến độ.

## 9. Nhật ký quyết định và bằng chứng chốt plan

- Checkpoint I14 ngày 03/10/2026: Claude hoàn thành admission từ I02 có bối
  cảnh sử dụng cụ thể và validator candidate đóng; GPT nối artifact/reference
  vào owner Insight, tái hiện từ đúng nguồn/method đã lưu. Không dùng I04
  “đã mua/đã dùng” đơn thuần làm cơ hội. Linux generation/typecheck + nhóm
  đầu 9/9, sibling 41/41 PASS. Negative control bỏ I14 replay FAIL tại
  assertion nguồn thiếu; phục hồi code, bổ sung exact KEEP và kiểm tra cuối
  typecheck + 35/35 PASS. Các lượt chồng lắp, không phải full release. Luna
  audit độc lập không thấy blocker tích hợp; không tick P5/I14/R1 hoặc giả đã có nhận định AI.
  Coordinator rà lại dependency sau hai slice storage: rendering M01/I14 vẫn
  cần đưa bằng chứng thành output đọc được; retention là blocker cụ thể để
  không gọi AI lại sau restart, không phải framework mới. Claude tiếp tục
  subrecord execution của Analysis trong job `task-musaixix-rya3ov`; GPT
  audit/integrate song song. Chưa activate model, gọi provider hoặc đổi web.

- Checkpoint P5 ngày 03/10/2026: source-neutral claims và M01 inventory đã có
  artifact riêng, reference đóng và replay từ method/source đã xác minh. M01
  hiện chỉ liệt kê M05 của Market; chưa tổng hợp claim của Insight, chưa có
  kết luận AI hoặc xếp hạng. Linux generator/typecheck, nhóm M01/ba case 9/9
  và nhóm ảnh hưởng 26/26 PASS; negative control bỏ M01 replay làm assertion
  thiếu artifact FAIL đúng lý do, phục hồi rồi 9/9 PASS. Luna không thấy blocker
  tích hợp. Đây là kiểm tra synthetic chồng lắp, không phải release/real R1.
  Claude đang làm admission/validation I14; GPT kiểm tra retention trước khi
  nối model. Report rendering hiện được requeue sau restart nên không đặt gọi
  AI trực tiếp vào đó; input/prompt/config/response phải có trạng thái lưu riêng
  trong owner thực thi hiện có, không tạo report ledger thứ ba. Chưa gọi model,
  merge hoặc activation; P5/R1 và các checkbox rộng vẫn mở.

- Checkpoint UI scope/version 03/10/2026: nguồn vẫn chốt ở confirmation v2;
  supplemental UI chỉ chọn nguồn đã lưu cho exact predecessor và phạm vi cũ.
  Reload đọc lịch sử attempt, không gửi lại; link Market/Insight web/PDF gắn đúng
  pair được chọn, mặc định bản gốc. Linux client 5/5, mounted 3/3, HTTP 6/6;
  frontend 207/207 trước sửa StepNav, rồi typecheck/build và nhóm ảnh hưởng
  20/20 PASS. Hai regression commit-read race/mobile current-step có RED/GREEN.
  Impeccable đã chấm lỗi mobile duy nhất resolved và ship ở phạm vi preview
  synthetic. Đây không phải real source/PDF acceptance, full release CI hay
  30-section completion; P1/R1/checklist còn mở. Không merge/activation/provider.

- 03/10/2026: GPT soạn v2 từ code head nêu trên và hai vòng debate trước. Chưa đánh dấu checklist thực thi nào hoàn thành.
- Claude Opus 5.5 high, vòng 1: AMEND, yêu cầu mở rộng isolation sang native/manual callers; chỉ rõ acceptance; định nghĩa tick và R1; giới hạn vòng review; phân công interface chung/source-neutral. GPT đã đối chiếu code và nhận các vấn đề này.
- GPT điều chỉnh hai khuyến nghị: native source chưa có key gắn run nên cần explicit reference thay vì giả prefix; METHOD_OUTPUT/gate không được tự tính analytical completion. Không nới cap nguồn thủ công thật. Acceptance theo lô là delta cần business review, không giả đã được ADR 0007 phê duyệt.
- Claude vòng 2: năm vấn đề trước đã được xử lý đủ; chỉ còn wording acceptance hợp lệ của R1 và giữ nguồn lịch sử không rõ provenance. Claude chấp nhận phản biện về exact reference native, cap thủ công và cách đếm tiến độ. Kết luận có điều kiện: kế hoạch sẵn sàng trình OWNER và bắt đầu P0/P1 sau go-ahead nếu thêm hai nội dung đó; không cần vòng review nữa.
- GPT đã thêm hai nội dung vào §1/§4/P1.1, tạo v2.2. Không còn bất đồng kỹ thuật mở trong lượt review kế hoạch này. Việc business review delta acceptance, kiểm tra code, Linux CI, report design và quyền activation vẫn là các dependency/checklist thực thi, không giả định đã hoàn thành.
- Kiểm tra tài liệu: đủ 13 Market + 17 Insight, liên kết nội bộ tồn tại, checklist thực thi vẫn chưa tick. Không chạy test/typecheck/build hay gọi provider nghiên cứu trong lượt này.
- Bắt đầu thực thi: giao P1.1 cho Claude Opus 5.5 xhigh; GPT mở P0, gửi delta acceptance tới session nghiệp vụ và chuẩn bị Linux validation. Lượt Claude đầu bị dừng khi quay về lập kế hoạch, được xác minh terminal trước khi giao lại; không giả là lỗi quota. Không thay baseline/tiêu chí nghiệm thu theo kết quả quan sát.
- Business session AMEND hẹp có điều kiện cho P3.2a/P4.3a. GPT đưa các làm rõ vào v2.3 và lưu [review ngữ nghĩa](../research/research-batch-acceptance-semantics.md): exact immutable proposal, UNKNOWN khác PENDING, đủ coverage của toàn universe, receipt/retry không chuyển acceptance sang revision mới. Không adoption scope/codebook chưa duyệt và không chấp nhận nhãn thật thay OWNER.
- P1.1 slice đầu: Claude viết exact-key lookup Metric và candidate lookup native; GPT audit, Linux typecheck + 20/20 owner tests + 19/19 sibling tests PASS. Hai regression chạy trên production baseline cùng test bytes đều FAIL đúng lý do, rồi PASS trên bản sửa. Chưa có durable native admission/manual exclusion; P1.1 vẫn mở. Giao tiếp P1.2 cho Claude, không dùng bằng chứng slice đầu thay kiểm tra slice kế tiếp.
- P1.5a: GPT soạn [bảng attach/resume](research-source-attachment-and-resume-design.md) để review trước code. Giữ ADR 0009: không tự thêm checkpoint bắt buộc hoặc worker chờ người sau scope. Run/report đã chốt không cập nhật tại chỗ; cần đường revision bổ sung tối thiểu. Bảng thiết kế chưa đồng nghĩa contract/migration đã chốt hoặc P1.5a đã xong.
- OWNER duyệt policy ngày 03/10/2026: chốt nguồn cùng xác nhận scope; thêm nguồn sau đó tạo report version mới, không đổi bản cũ; tái dùng nguồn đã lưu khớp chính xác, đổi scope phải tạo run mới. GPT đã ghi vào INTENT và bảng attach/resume sau khi xử lý review Claude; đây không phải quyền activation hoặc chấp nhận nguồn thật.
- P1.1 storage slice: GPT thêm Foundation 0039 và immutable origin cho nguồn do automation tạo, cùng transaction intake; loại khỏi manual inventory trước cap, không mark lại nguồn lịch sử. P1.2 Claude đã thêm closed failure codes và hướng dẫn report. Linux typecheck + 33/33 owner tests PASS; compatibility ban đầu 85/86, sửa duy nhất kỳ vọng migration rồi retest ca đó PASS; siblings 45 PASS/1 optional browser skip/0 lỗi. Không cộng các lượt chồng lắp thành tổng test mới, không dùng kết quả này làm full release proof. Analysis admission, attempt/version, UI và ba case nội dung thật vẫn chưa nghiệm thu.
- P0.3 slice kỹ thuật: GPT ghim fixture ba ngành và expected M05/I04 độc lập trong [matrix](../research/research-execution-three-case-matrix.md). Linux service-boundary kiểm tra ba nguồn cùng database, 13 query windows cho 365 ngày, observed_zero, quote đúng ngành và query-only replay sáu web report. Đây là synthetic contract, không phải acceptance nguồn thật hoặc toàn R1; M01/I14, PDF và các expectation còn lại vẫn mở. Không tick P0.3 chỉ vì slice này PASS. Claude đang làm Analysis source admission và report version theo policy OWNER đã duyệt.
- Checkpoint tiếp theo 03/10/2026: job Claude kết thúc vì quota, không sửa file; GPT tiếp quản theo chỉ định OWNER. Backend xác nhận v2 và 0040 đã chốt exact source set cùng scope CAS, phân biệt absent/skip, tái dùng native đã chốt, ngăn nguồn đến muộn thay input, giữ v1 replay. Metric v2 có prepared origin và binding ổn định trước xác nhận, snapshot có execution ID/thời điểm xác nhận thật. Linux generation/typecheck + owner group 71/71 PASS; nhóm tương thích 72/72 PASS, không phải full release CI. Audit Luna phát hiện initial-binding SQL guard còn thiếu, GPT sửa trước lượt cuối. Worker claim và diagnostic generic có bằng chứng RED/GREEN riêng. Attempt/version bổ sung, upload API/UI và nội dung thật vẫn mở; v2 chưa đưa ra API và không tick P1/R1.

- Checkpoint supplemental/API 03/10/2026: GPT thêm Analysis 0041 và contract chuẩn cho attempt/version. Chỉ nhận bổ sung trên DRAFT_READY, đóng băng exact predecessor/nguồn/phạm vi, KEEP tái dùng method cũ và nguồn đổi chỉ chạy method phụ thuộc; không thu trả phí. Failed/cancelled attempt không tăng số phiên bản thành công, Market/Insight commit cùng nhau. API nhận confirmation v2 và có đọc exact version/pair/status, tạo/hủy OWNER; URL cũ vẫn đọc bản gốc. Linux generation/typecheck + nhóm owner/HTTP cuối 78/78 PASS; shutdown ownership có RED/GREEN. Audit Luna không thấy blocker hành vi, schema ID đã sửa trước kiểm tra cuối. Chưa upload/publication recovery/UI/PDF nghiệm thu hoặc full release CI; không tick P1/R1, không activation/merge.

- Checkpoint raw Metric intake 03/10/2026: GPT viết API multipart giới hạn riêng, contract metadata/receipt và chuẩn bị nguồn nguyên byte. Luna viết recovery exact publication của Foundation; GPT audit, thêm guard request ownership và kiểm tra artifact thô dùng lại giữ acquired_at cũ. Chuẩn bị nguồn không xác nhận scope, không wake worker/thu provider, không cập nhật report; kỳ/precision/filter vẫn là operator declaration và acquisition có thể null. Linux generation/typecheck PASS, owner upload/Foundation 14/14 và nhóm tích hợp cuối 80/80 PASS, không cộng tổng chồng lắp. UI/native raw intake/PDF thực/full release CI còn mở; không tick P1/R1 và không thay web thật.

- Checkpoint P5/J1 ngày 03/10/2026: GPT + Luna nối retained I14 execution (0042), replay không phụ thuộc cấu hình model hiện tại, recovery UNKNOWN trước requeue và renderer đề xuất chưa duyệt. Transport mặc định null; không bật model cho nguồn thật. Linux typecheck PASS, nhóm tập trung 34/34 và nhóm automation/native/exact 41/41 PASS (có chồng lắp); đối chứng lỗi replay parent-terminal FAIL đúng lỗi và bản khôi phục PASS. Impeccable dẫn tới sửa bảng mobile/truy nguồn M01/I14; 8 capture desktop/mobile không overflow hoặc page error. JEV shadow chỉ có sáu ví dụ synthetic và một lượt lặp: nhãn khớp kỳ vọng nhưng xác suất thay đổi, không là benchmark/promotion. Chi tiết và phần chưa kiểm tra tại [handoff](../handoffs/research-p5-retention-and-jev-shadow.md). Không tick P5/J1/R1/R2 hoặc nghiệm thu 30 section.
- Follow-up P5 ngày 03/10/2026: business AGREE exception versioned cho I02 matcher span trùng qualifiers trong exact adopted projection. GPT sửa admission 1.1.0 và replay giữ v1; raw-source regression RED trước sửa và GREEN sau sửa, không dùng nhãn tự tạo làm đầu vào admission. Nhóm Linux đầu 42/42 và nhóm cuối 30/30 PASS (chồng lắp); audit Luna xác minh owning paths, không còn finding chặn. Xem [handoff](../handoffs/research-p5-literal-context-admission.md). Không đổi rulebook, tự accept JEV, bật AI thật hoặc tick toàn section.

Nguồn nội bộ: [INTENT](../../INTENT.md), [ADR scope 0007](../research-automation/adr/0007-source-neutral-scope-method.md), [catalog](../research/report-section-catalog-v1.json), [inventory](../research/automation-method-execution-inventory.md), [kế hoạch cũ](research-30-section-remediation-plan.vi.md), [acceptance cũ](research-content-acceptance-v1.md), [Metric handoff](../handoffs/research-automation-metric-method-bridge.md). Các đoạn lịch sử trong tài liệu cũ không thay hiện trạng tại head đã ghim.

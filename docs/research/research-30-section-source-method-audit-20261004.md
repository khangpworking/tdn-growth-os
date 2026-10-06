# Audit nguồn, phương pháp và đầu ra của 30 section

Ngày: 04/10/2026, Asia/Bangkok.

## Kết luận

Đã rà 13 mục Market và 17 mục Insight. Tree hiện tại có đường chạy cho các nhóm phương pháp, nhưng độ sâu khác nhau: context, inventory, phép tính có điều kiện, coding bám nguồn, hoặc đề xuất AI chờ xem xét. Không có bằng chứng nghiệm thu hoàn chỉnh cả 30 mục trên cùng bản code cho ba case thật.

Công việc còn lại không chỉ là benchmark prompt và xuất PDF. Còn dữ liệu đầu vào đủ điều kiện, duyệt coding/nhãn, mở rộng một số phương pháp nếu yêu cầu nghiệp vụ cần sâu hơn, và nghiệm thu đầu ra. Một phương pháp chỉ kiểm tra điều kiện không trở thành dự báo hoặc phân tích nhân quả khi tải thêm dữ liệu.

Đây là audit tĩnh trên working tree chưa phát hành, không phải audit runtime Fedora. HEAD nền là `0116091fd5dc0902594f92d969dfb3ee0732c9c8`, nhánh `fix/research-real-world-audit`. Các thay đổi tracked/untracked được giữ nguyên. Goal lớn vẫn tạm ngưng; tài liệu này chỉ hoàn thành bước 1 đã được giao.

Không chạy test/typecheck/build trên Windows, provider/model, migration, ghi dữ liệu nghiệp vụ, merge hoặc deployment trong lượt audit này. Không thay đổi phương pháp hay tiêu chuẩn nghiệm thu đã duyệt.

## Cách đọc

- **Nối**: service thực sự gọi builder hoặc đọc output đã lưu rồi truyền cho renderer. Không chỉ có tên trong catalog.
- **Tính hẹp**: có phép tính tái hiện, giới hạn ở đơn vị, membership và điều kiện nguồn đã khai.
- **Gate**: kiểm tra điều kiện hoặc liệt kê bằng chứng; chưa thực hiện phép phân tích được đặt tên trong section.
- **Draft AI**: bản đề xuất có provenance và replay, chưa phải nhận định đúng hoặc quyết định người dùng.
- **Bằng chứng hẹp**: chỉ chứng minh hành vi hoặc phạm vi đã ghi; không nâng thành nghiệm thu cả section.

J = thạch dừa; T = bình giữ nhiệt; F = quạt cầm tay. P1 là ưu tiên tăng nội dung dùng được; P2 là phần mở rộng cần chốt phương pháp hoặc đầu vào nghiệp vụ. Đây là thứ tự đề nghị, không phải lệnh tự thu thêm dữ liệu.

## Đường chạy được đối chiếu

Các mã dưới đây là nhóm code để truy theo từng dòng. Mọi đường đều qua service và renderer chung, không coi module offline là bằng chứng tích hợp.

| Mã | Nguồn → phương pháp → báo cáo |
|---|---|
| FLOW | [service.ts](../../src/modules/analysis/research-automation/service.ts): `#executeReports`, replay semantic và package; [reports.ts](../../src/modules/analysis/research-automation/reports.ts): `buildResearchAutomationReport`, nhánh theo section và loại output. |
| C | [metric-method-bridge.ts](../../src/modules/analysis/research-automation/metric-method-bridge.ts) → preparation/readiness → [metric-scope-calculator.ts](../../src/modules/analysis/metric-scope-calculator.ts); [classified-metric.ts](../../src/modules/analysis/research-automation/classified-metric.ts) gắn receipt nhãn; [metric-method-report.ts](../../src/modules/analysis/research-automation/metric-method-report.ts) render M03/M04. |
| D | [descriptive-method-bridge.ts](../../src/modules/analysis/research-automation/descriptive-method-bridge.ts) → [descriptive-market-methods.ts](../../src/modules/analysis/descriptive-market-methods.ts) → [descriptive-report.ts](../../src/modules/analysis/research-automation/descriptive-report.ts), cho M05/M06/M07/M09. |
| Q | [quote-methods.ts](../../src/modules/analysis/research-automation/quote-methods.ts) → [generic-quote-unit.ts](../../src/modules/analysis/generic-quote-unit.ts) → [quote-method-report.ts](../../src/modules/analysis/research-automation/quote-method-report.ts). Đây là lane generic đã nối, không chỉ tablet normalizer cũ. |
| G | [bounded-methods.ts](../../src/modules/analysis/research-automation/bounded-methods.ts) → [bounded-analysis-gates.ts](../../src/modules/analysis/bounded-analysis-gates.ts) → [report-method-packets-pages.ts](../../src/modules/analysis/report-method-packets-pages.ts), cho M10/I11/I12/I16. |
| L | [insight-coding.ts](../../src/modules/analysis/research-automation/insight-coding.ts), [insight-model-execution.ts](../../src/modules/analysis/research-automation/insight-model-execution.ts) → exact source spans, proposal/selection/receipt → [located-insight-methods.ts](../../src/modules/analysis/located-insight-methods.ts), [insight-corpus-counts.ts](../../src/modules/analysis/insight-corpus-counts.ts) → [selected-insight-projection.ts](../../src/modules/analysis/research-automation/selected-insight-projection.ts) và FLOW. |
| P | [source-claims.ts](../../src/modules/analysis/research-automation/source-claims.ts), [decision-packets.ts](../../src/modules/analysis/research-automation/decision-packets.ts), [decision-synthesis-input.ts](../../src/modules/analysis/research-automation/decision-synthesis-input.ts), [decision-synthesis-execution.ts](../../src/modules/analysis/research-automation/decision-synthesis-execution.ts) → FLOW, cho M11/M12/I15. |
| S | [m01-evidence-inventory.ts](../../src/modules/analysis/research-automation/m01-evidence-inventory.ts), [i14-evidence-admission.ts](../../src/modules/analysis/research-automation/i14-evidence-admission.ts), [i14-synthesis-execution.ts](../../src/modules/analysis/research-automation/i14-synthesis-execution.ts) → FLOW. |
| TRACE | [market-scope-report.ts](../../src/modules/analysis/research-automation/market-scope-report.ts), [corpus-trace-projection.ts](../../src/modules/analysis/research-automation/corpus-trace-projection.ts), provenance trong FLOW. |
| INTAKE | [supplemental-source-intake.ts](../../src/modules/analysis/research-automation/supplemental-source-intake.ts), [supplemental-source-inventory.ts](../../src/modules/analysis/research-automation/supplemental-source-inventory.ts), [SupplementalSourcePanel.tsx](../../frontend/src/research-automation/SupplementalSourcePanel.tsx). Lưu nguồn khác với chọn nguồn vào revision. |

## Market report: 13 mục

| ID / mục | Nguồn cần và tình trạng case thật | Method/code thực thi và đầu ra | Bằng chứng hiện có; việc còn thiếu |
|---|---|---|---|
| M01 Kết luận chính | Claim upstream đủ điều kiện. Lane Market hiện truyền descriptive claims M05; kiểu inventory có I02/I04 nhưng không chứng minh Market đã nhận chúng. | S + FLOW: inventory không xếp hạng, `conclusion=null`. Chưa có Market executive summary. | Đã nối inventory/replay. P1: mở claim adapter cho kết quả tính đã xác minh; P2: chốt và nghiệm thu cách tạo kết luận, không gọi inventory là kết luận. |
| M02 Phạm vi và phương pháp | Scope đã xác nhận, kỳ Metric khai báo, từng capture/window/coverage. T/F đã có kiểm tra nguồn thật trong phạm vi hẹp. | TRACE + FLOW: tách kỳ yêu cầu, kỳ đo khai báo, cửa sổ truy vấn và membership từng nguồn. Không có công thức nội suy độ phủ. | T/F scope đã được kiểm tra, chưa đủ ba case. P1: nghiệm thu kỳ/độ phủ và các mâu thuẫn đa nguồn; không coi 13 query windows là đủ 365 ngày đo. |
| M03 Quy mô và diễn biến | Dòng Metric gốc, receipt chuẩn hóa, codebook/nhãn đúng nội dung. J có chuẩn bị 223 dòng nhưng chưa duyệt nhãn; T/F Kalodata không thay thế tổng thị trường. | C + FLOW: tổng quan sát bằng BigInt, ALL/WIDE/CORE theo membership đã chốt; UNKNOWN giữ lại nhưng không vào WIDE theo policy. Temporal lane mới inventory. | Có đường revision và phép tính. P1: nguồn/nhãn thật đủ điều kiện cho từng case. P2: diễn biến/tăng trưởng cần chuỗi kỳ tương thích và method tương ứng, không suy từ tổng một kỳ. |
| M04 Cơ cấu thị trường | Full C result, nhóm đã duyệt, mẫu số cùng scope; không chỉ summary M03. | C: cộng theo nhóm/shop, tỷ trọng tử số/mẫu số, Top-k concentration, độ nhạy bỏ shop đầu; làm tròn half-even 2 số. Mẫu số 0 hoặc thiếu không tạo share. Render bảng và chart concentration. | Đã nối classified result/UI. P1: nghiệm thu nhóm, denominator, UNKNOWN và thiếu dữ liệu trên nguồn thật; tỷ trọng trong mẫu không phải thị phần toàn thị trường. |
| M05 Nhu cầu | Thước đo literal, định nghĩa, đơn vị, kỳ, scope và provenance. T/F mỗi case có 78 quan sát đã replay. | D: partition theo nghĩa/đơn vị/kỳ/scope; chỉ subtotal exact decimal khi có bằng chứng cộng được, không trùng membership. Render giá trị, coverage và blocker. | T/F PASS mô tả hẹp. P1: nghiệm thu ý nghĩa và compatibility cho ba case. Sales/search giữ đúng tên, không tự thành tổng nhu cầu hoặc số người. |
| M06 Nguồn cung | Record đối tượng/status/locator từ nguồn. T/F mỗi case 39 record đã replay. | D: inventory và loại trùng cùng source reference; `uniqueEntityCount=null`. | T/F PASS inventory hẹp. P1: source ID, truncation, coverage; nếu cần số sản phẩm/shop duy nhất phải có identity policy, không gọi 39 record là 39 sản phẩm. |
| M07 Đối thủ | Anchor/peer được chọn rõ; thước đo, đơn vị, kỳ, scope tương thích. Các case chưa có peer set nghiệm thu. | D + fallback source table: đối chiếu không xếp hạng, COMPARABLE/NOT_COMPARABLE và blocker. | Đã nối nhưng thiếu input thật phù hợp. P1: chọn peer set và kiểm tra compatibility. Không name-join, suy brand tương đương hoặc rank từ bảng quan sát. |
| M08 Giá và kinh tế đơn vị | Quote có price, variant/linkage, purchased pack, physical count, net/drained mass và thời điểm giá khi áp dụng. Nguồn thật đủ operands chưa nghiệm thu. | Q + INTAKE: exact rational; giá/đơn vị = giá gói/count; giá/100g = giá gói × 100/gram. Giữ exact fraction và display half-even; thiếu thì block, OWNER declaration vẫn là scenario. | API/revision/replay và UI upload/chọn nguồn đã kiểm tra synthetic. P1: producer/mapping từ nguồn thật, rồi nghiệm thu operand → phép tính → web/PDF. Chưa có cost/margin/profit method đầy đủ. |
| M09 Động lực và rủi ro | Statement/event có locator, attribution, nghĩa ngày và scope. T/F mỗi case có 3 phát biểu launch_date. | D v2: gộp trùng, giữ conflict và sắp ngày; không ước lượng tác động. | PASS ngày ra mắt hẹp. P1: nguồn sự kiện/counterevidence hợp lệ. P2: driver/risk interpretation cần method/quan hệ bằng chứng, ngày ra mắt không chứng minh nguyên nhân. |
| M10 Dự báo và kịch bản | Chuỗi thật, lịch/zero/missing, chia train/validation/holdout và gap policy. Chưa có bộ thật đủ điều kiện. | G + INTAKE: gate theo series; `forecasts`, `errorMetrics`, `baselineEvaluation` vẫn null; status BLOCKED. | Đã nối package/gate/UI, không forecast. P1: nguồn series. P2: nếu phải có dự báo số, cần method adoption và implementation riêng; thêm nguồn không tự bật dự báo. |
| M11 Cơ hội | Literal M05/I04 với I02 context, support/counterevidence và giả thuyết phù hợp. Chưa có acceptance usefulness thật. | P: packet v1.1, retained optional AI relation drafts; không priority/ranking hoặc cơ hội đã xác minh. | Caller/replay có proof kỹ thuật. P1: mở nguồn claim tính toán chưa được adapter hỗ trợ và audit relation/source quality; draft AI phải giữ điều kiện và giới hạn. |
| M12 Hành động | Question, options/constraints do OWNER khai hoặc UNSET; evidence không thay cho quyền quyết định. | P: inventory hỗ trợ và optional draft; chosen/execution authorization rỗng. | Đã nối caller/replay. P1: nhận input alternatives/constraints thật. P2: nghiệm thu hành động đề xuất, không tự chọn, chi tiền hoặc đổi B7/B10. |
| M13 Phụ lục và truy nguồn | Capture/raw → package → normalization → method → receipt/revision; từng nguồn có inclusion/exclusion. | TRACE + FLOW: Metric preparation/receipt, descriptive provenance, quote/bounded appendix và source scope. | Có browser proof T/F hẹp và supplemental replay. P1: nghiệm thu đầy đủ method references, membership/loại trừ, link resolution và PDF của từng case. Hash không chứng minh provider authenticity. |

## Insight report: 17 mục

| ID / mục | Nguồn cần và tình trạng case thật | Method/code thực thi và đầu ra | Bằng chứng hiện có; việc còn thiếu |
|---|---|---|---|
| I01 Câu hỏi kinh doanh | Brief/question/audience/decision/constraint khai rõ; không tự suy từ keyword. | TRACE + FLOW: context từ scope; trường thiếu giữ UNSET. | Có tích hợp context. P1: xác minh brief thực sự đáp ứng câu hỏi nghiệp vụ; dữ liệu scope không tự cung cấp objective. |
| I02 Khách hàng và hoàn cảnh | Exact review/text, spans context/role/situation/task/setting/time. J có 20 record readable retained; T/F chưa có corpus review phù hợp. | L: proposal theo batch → selection/receipt → revision; chỉ field bám lời nguồn, không persona/demographic suy diễn. | Kỹ thuật đã nối; semantic chưa đạt nghiệm thu. P1: corpus T/F và audit prompt/coding J, rồi disposition. |
| I03 Phương pháp nghiên cứu | Frozen corpus/frame/period/membership và disposition; collection giữ riêng. | TRACE + L: số dòng, record unique, included/excluded/unreadable, pending/blocked và provenance. | B1 đã nối; denominator/coding thật chưa nghiệm thu. P1: nghiệm thu shared corpus và cách công bố giới hạn, không dùng Metric receipt làm qualitative method giả. |
| I04 Hành vi | Action/event/attempt/completion/no-action có exact spans và attribution. | L: model proposal pending, explicit selection, retained/replayed output và record counts. | Audit J còn vấn đề actor/attribution. P1: trial đang được giao cho Claude chỉ là dev verification; sau đó cần disposition và acceptance, không coi VALID schema là đúng nghĩa. |
| I05 Cảm nhận và thái độ | Clause có target/polarity/negation/context/speaker. | L: polarity bám clause; unselected không được tính; MIXED chỉ khi có bằng chứng. | Audit J có bỏ sót clause/qualifier; chưa benchmark fresh prompt xong. P1: kiểm tra omission và overcoding, không dùng stars/silence suy sentiment. |
| I06 Hành trình | Sự kiện và quan hệ thứ tự trong cùng record, exact spans. | L: SOURCE_EXPLICIT_SAME_RECORD/RECORD_LOCAL/SOURCE_STATED_ORDER; không nối người giữa record. | Có PASS hẹp một sequence, chưa cả corpus/section. P1: duyệt relation/identity disagreement; không dựng mặc định hành trình 5 bước. |
| I07 Lý do lựa chọn | Choice và reason cùng record, relation/facet/attribution đủ. | L: giữ accepted/pending evidence, không suy động cơ từ việc mua hoặc thuộc tính listing. | Một số diễn giải J chưa được chốt; chưa có positive eligible đủ để nghiệm thu capability. P1: audit/disposition; empty output có thể là abstention, không ép sinh ví dụ. |
| I08 Rào cản | Attempted task và obstacle cùng record với quan hệ rõ. | L: giữ unresolved riêng, chỉ claim đủ bằng chứng đi vào method output. | Các cách đọc J còn chưa chốt. P1: nguồn/task-relation và disposition; complaint đơn lẻ không mặc nhiên là barrier có nguyên nhân. |
| I09 Nhu cầu chưa được đáp ứng | Current/desired state và explicit same-record gap relation. | L: EXPLICIT_GAP, DESIRE_ONLY, CURRENT_STATE_ONLY, RELATION_UNCLEAR và UNLOCATED tách riêng. | Audit J chỉ ra bỏ sót current-state. P1: benchmark generic và duyệt relation; partial candidate không trở thành unmet need đã xác minh. |
| I10 Chủ đề và mối quan tâm | Frozen codebook, corpus membership/frame/period và disposition mọi record. | L: unique record-code counts; n/N chỉ khi ratioStatus COMPLETE, không pending, N > 0 và đủ khai báo. Không dùng số spans thay n. | PASS hẹp 42 memberships/44 spans ở audit trước, không accuracy. P1: full-corpus disposition và meaning-critical context trên web/PDF; không tính population prevalence. |
| I11 Khác biệt giữa các nhóm | Group policy, assignment evidence, numerator/denominator cùng unit/scope/period. | G + INTAKE: INTERNAL_INVENTORY/partition và blocker; chưa tính rates/differences/inference. | Package/gate/UI có proof synthetic, thiếu input thật. P1: group data. P2: nếu yêu cầu phân tích khác biệt số, cần method mở rộng, không chỉ tải file. |
| I12 Điểm tiếp xúc | PRESENCE/EXPOSURE/OUTCOME là các lane nguồn riêng, có channel/window/measurement scope. | G + INTAKE: SEPARATE_INVENTORIES; joins/rates/effectiveness null. | Đã nối gate, chưa attribution/conversion. P1: evidence ba lane nếu có. P2: quan hệ/hiệu quả cần method được duyệt; mention không phải exposure hoặc outcome. |
| I13 Thương hiệu và đối thủ | Literal mentions, codebook/channel/corpus; alias/peer authority nếu cần entity resolution. | L: phrase/span equality, unranked mentions và eligible n/N; không suy alias hay market share. | J chưa có positive brand đủ điều kiện; T/F thiếu corpus. P1: nguồn/coding thật; khả năng positive chưa được chứng minh, không force mention. |
| I14 Hướng cơ hội | Source claims được admission, source quality và người xem xét. | S: optional retained AI candidate, off mặc định; inventory/admission không tự tạo hướng đã duyệt. | Có synthetic candidate/lifecycle proof, chưa real usefulness acceptance. P1: kiểm chứng hỗ trợ/counterevidence sau khi upstream đủ. Không tiếp tục polish mục này trước breadth. |
| I15 Định hướng chiến lược | OWNER alternatives/capabilities/constraints thật, source-bound support/counterclaim. | P: packet v1.1 và optional strategy draft; preferredOption null. | Caller/replay nối, chưa quality acceptance. P1: input thật và quan hệ bằng chứng. Scalar không tự thành business constraint; không tự duyệt chiến lược. |
| I16 Thử nghiệm và đo lường | DESIGN_ONLY hoặc EXISTING_RESULT có protocol, treatment/comparator/outcome/denominator tương thích. | G + INTAKE: METHOD_ONLY/ELIGIBILITY_ONLY, NOT_EXECUTED; estimate/uncertainty null. | Đã nối gate/UI, thiếu evidence thật. P1: design/protocol/result có nguồn. P2: estimator/execution là phạm vi riêng; không bịa kết quả khảo sát/thử nghiệm. |
| I17 Phụ lục và bằng chứng | Raw text/hash/locator/spans → coding/disposition/receipt → method/report revision; giữ collection lineage. | TRACE + L + FLOW: corpus trace chung và appendix bounded; không bịa source IDs. | Đã nối B1 trace; P1: đầy đủ accepted method references, enclosing context, links và export; locator đúng chưa chứng minh interpretation đúng. |

## Bằng chứng và giới hạn nghiệm thu

Nguồn đối chiếu: [matrix ba case](research-execution-three-case-matrix.md), [bảng tiến độ](research-30-section-progress.md), [inventory phương pháp](automation-method-execution-inventory.md), và handoff [A](../handoffs/manual-20261004/manual-A-result.md), [B](../handoffs/manual-20261004/manual-B-result.md), [C](../handoffs/manual-20261004/manual-C-result.md). Đây là các checkpoint có phạm vi và thời điểm khác nhau, không cộng chúng thành một release pass.

- A/B đã hoàn thành đường lưu/inventory/chọn nguồn QUOTE và BOUNDED. Handoff A ghi 16/16 affected checks; B ghi frontend 246/246, build/typecheck và browser synthetic. Checkpoint tích hợp A+B+C sau đó ghi 19/19 affected backend checks và backend typecheck trên disposable Linux. Lượt audit này không chạy lại chúng và không coi đó là semantic acceptance.
- C đã sửa prompt generic và kiểm tra retention/provenance với synthetic transport. Chất lượng fresh model đang thuộc lượt Claude trial riêng; chưa ghi verdict mới vào audit này.
- T/F thật mỗi case có 78 M05 observations, 39 M06 records, 3 M09 launch-date statements. Những đơn vị này khác products/people/demand/causal drivers.
- J corpus 62 ledger rows/20 readable được gắn ở một run riêng. Không name-join vào run gốc vốn chưa có collection phù hợp. Metric J 223 dòng chuẩn bị không phải nhãn đã duyệt.
- Chưa có full acceptance cùng tree cho J/T/F và sáu PDF tương ứng. Điều này không có nghĩa cả 30 mục chưa được code.
- Trong FLOW, `completedAnalyticalSections` hiện cố định bằng 0. Đây là chính sách trạng thái draft, không phải phép đo đủ/thiếu code. Muốn thay phải có điều kiện completion được chốt, không đổi số chỉ để giao diện đẹp hơn.

## Sai lệch tài liệu cần xử lý ở lượt tích hợp sau

1. Bảng cũ trong inventory ghi ABSENT cho nhiều lane nay đã nối. Những dòng đó mô tả checkpoint cũ, không còn đại diện working tree.
2. Bảng tiến độ cũ còn ghi inventory/UI supplemental chưa làm. A+B đã gỡ đường này; phần thiếu nay là nguồn thật có operands và nghiệm thu nội dung.
3. Catalog còn các tên planning/tablet hoặc Metric-specific, còn runtime dùng generic quote, corpus coding, bounded gates và packet mới. Khi tích hợp cần kiểm tra catalog/contract/version mô tả đúng method thực sự chạy; audit này không tự sửa canonical catalog.
4. Claim admission cho synthesis chưa nhận mọi kết quả tính/coding đã được chọn. Service dựng source claims từ descriptive và literal snapshots; selected Metric/Insight revision không tự mở thêm synthesis hoặc gọi AI lại. Cần adapter có version và source-method refs, không đưa kết quả nhập tay vào thay nguồn/công thức.

## Thứ tự đề nghị sau khi được tiếp tục

| Ưu tiên | Gói việc | Cách làm có giới hạn | Điều kiện xong |
|---|---|---|---|
| P1-A | Nguồn/coding cho 9 Insight families | Inventory dữ liệu có sẵn theo exact run/listing/scope; gỡ thiếu corpus T/F. Hoàn tất trial J một vòng, audit độc lập, xử lý disposition. Không lặp tune J vô hạn. | Mỗi family có output đủ bằng chứng hoặc lý do không đánh giá được theo source; full membership/coding/denominator giữ nguyên và có acceptance. |
| P1-B | Metric M03/M04 và liên quan M02/M13 | Dùng nguồn gốc → preparation/receipt → rule/nhãn đúng row fingerprint → phép tính → revision. Không cộng kỳ/nguồn trùng hoặc đổi missing thành zero. | Recompute/replay bằng dữ liệu thật; group/denominator, UNKNOWN, period và coverage được kiểm tra cho từng case. |
| P1-C | Nguồn QUOTE/BOUNDED | Tận dụng intake/UI A+B; chuẩn bị structured descriptor từ file nguồn thật, lưu locators/operand refs, chọn vào revision mới. Không thêm endpoint/hạ tầng mới trước khi thấy nhu cầu. | M08 có arithmetic thật đủ operand; M10/I11/I12/I16 công bố đúng gate và giới hạn, không bị tính nhầm là forecast/inference. |
| P2-A | Khoảng cách giữa tên section và method hẹp | Nhờ business session chốt cho từng mục: phạm vi bounded đã đủ deliverable hay cần method phiên bản mới. Giữ verdict partial nếu chưa đủ, không hạ tiêu chuẩn đã duyệt. | Phần cần mở rộng có input contract, công thức, điều kiện áp dụng và nghiệm thu được duyệt trước code. |
| P1-D | Claim adapter và synthesis downstream | Nhận method/source refs thật cho M01/M11/M12/I14/I15; giữ raw evidence, computation, AI draft và OWNER decision riêng. Không tự gọi AI khi thêm nguồn vào revision nếu policy chưa cho phép. | Claim truy được về nguồn và method/version; không có claim quá phạm vi, AI draft không thành approval. |
| P1-E | Nghiệm thu web và hai PDF/case | Sau upstream, dùng cùng code/prompt/method manifest cho J/T/F; audit từng section, charts có operands/denominator đúng; hai file report riêng. | Sáu PDF và web tương ứng có trace, semantic verdict, design review Claude rồi owner; lỗi thiếu nguồn/partial vẫn hiện đúng. |

Các gói có thể phân công song song sau khi được tiếp tục, nhưng không giao nhiều người sửa service/renderer chung cùng lúc. M01/I14 không trở thành đường găng trước nguồn và method breadth. Không cài LangGraph, Redis, JEV hoặc thêm vòng model judge để thay cho các khoảng trống deterministic này.

Không đề nghị chạy full suite nhiều lần. Lượt triển khai sau chọn owner checks nhỏ cho thay đổi; full Linux release gate sau snapshot tích hợp. Audit này không thiết kế thêm test hay sửa assertion.

## Dấu vết working tree được đọc

SHA-256 của các điểm code chính tại thời điểm audit, không phải full release manifest:

| File | SHA-256 |
|---|---|
| `src/modules/analysis/research-automation/service.ts` | `9a55af6531bf31a0fe65fc6bf0315c27e41e533d7fba94b817752d2024e3745f` |
| `src/modules/analysis/research-automation/reports.ts` | `5d0ce45909c86310abf32669c0cd665dbd1b126b0e1cd4ddd65131fb670345fb` |
| `src/modules/analysis/research-automation/source-claims.ts` | `235a46d384791c78ed46642ade8c1fcb6a277811d62be0a02cd7c176d8c4f78c` |
| `src/modules/analysis/research-automation/insight-model-execution.ts` | `e73a69b8e14c289f466b22f21a43fafa93cfb9ec54721b5b85f42ba20f05f7e3` |
| `src/modules/analysis/generic-quote-unit.ts` | `f2023b7873026a7cadf5f38b6ed576aef92087ad4bf027db702f499d6ca2c63e` |
| `src/modules/analysis/bounded-analysis-gates.ts` | `23ee72553c8d1f19253ecadbd6274fbc3e64f951bd37d61b20d5f9f332d06f81` |

Kiểm tra bàn giao tài liệu: đủ 30 section ID duy nhất và khớp catalog; đường dẫn nội bộ tồn tại; không có em dash hoặc whitespace cuối dòng. Antislop áp dụng cho cách viết trạng thái/bằng chứng; không thiết kế hoặc nghiệm thu UI trong lượt này. Không có phần trăm hoàn thành suy đoán.

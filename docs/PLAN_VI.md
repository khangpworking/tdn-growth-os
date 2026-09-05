# Kế hoạch triển khai TDN Growth OS

Ngày lập: 05/09/2026. Một người, thứ Hai–thứ Sáu, 8 giờ/ngày, tối đa 40 giờ/tuần.
Ưu tiên tốc độ và giải pháp tối giản đáp ứng đúng yêu cầu.

## Phạm vi và thay đổi so với kế hoạch trước

- Repo mới, dữ liệu mới; chọn lọc code Content Studio/Research Pipeline có thể tái sử dụng sau inventory.
- Một SQLite authoritative store dùng chung cho năm Box; mỗi module sở hữu bảng và application service của mình.
- Không dùng database riêng từng Box, DuckDB hoặc PostgreSQL ở baseline.
- Strict TypeScript, Node 24 mục tiêu sau compatibility check, Express, JSON Schema/AJV.
- Vite + vanilla TypeScript + Bootstrap + Lucide khi bắt đầu giao diện.
- Worker riêng process; n8n chỉ ở biên connector.
- Official OpenAI SDK sau AiGateway; Pi là spike tùy chọn, chưa nằm trên đường bắt buộc.
- Orca quản lý agent phát triển; không phải bộ điều phối nghiệp vụ Box 3.
- Kiểm thử theo rủi ro. Chuỗi CI đầy đủ trong brief áp dụng khi các thành phần tương ứng đã có và ở release; không chạy toàn bộ sau mọi chỉnh sửa.

## Cách hiểu timeline

Brief mới có mục tiêu walking skeleton khoảng tuần 6; đây là một luồng hẹp qua năm Box, không phải hoàn thành năm Box.
Giữ hai giai đoạn sản phẩm: Phase 1 giao bản dùng được; Phase 2 sửa lỗi, tối ưu và hiệu chỉnh nghiệp vụ.
Phase 0 inventory nằm trước/trong giai đoạn khởi đầu. Các bước reliability và expansion trong brief được ánh xạ vào hai phase này.

Bảng dưới là kế hoạch tương đối đề xuất, W1 là tuần bắt đầu implementation được chủ dự án chọn.
Chưa gán lại ngày giao hàng hoặc xác nhận ngày nghỉ Việt Nam; lịch nghỉ cá nhân và Tết cần đối chiếu khi chốt ngày bắt đầu.
Kế hoạch cũ 26–28 tuần, số giờ và lịch đã qua chỉ được giữ làm tham chiếu, không phải cam kết mới.
Không suy ra tốc độ giao hàng từ token/giây.

## Trước mắt: database

| Bước | Kết quả | Effort dự kiến |
|---|---|---:|
| D1 | Inventory SQLite driver, migration và phần source có thể dùng lại | 2–4 giờ |
| D2 | Data dictionary, grain, identity và input contract tối thiểu | 3–5 giờ |
| D3 | Connection, WAL/FK, migration đầu tiên, artifact manifest | 4–6 giờ |
| D4 | Manual-input evidence và một product observation có lineage | 4–6 giờ |
| D5 | Test trực tiếp, truy vấn minh họa, handoff | 3–5 giờ |
| Tổng | Foundation local dùng được; chưa phải đầy đủ Box 1 | 16–26 giờ |

Các giờ là effort chủ động, không phải cửa sổ lịch. Phụ thuộc và review có thể kéo dài elapsed time. Chốt lại sau D1 nếu source không thể dùng lại.

## Weekly view đề xuất

| Tuần | Xây gì | Bằng chứng giao |
|---|---|---|
| W1 | Cấu trúc dài hạn, inventory, SQLite foundation | DB mới + fixture + lineage + test |
| W2 | Raw artifacts, manual ingestion, nguồn và kỳ quan sát | Một export hợp lệ được nhập và truy xuất |
| W3 | Data Pack phiên bản và phép tính đầu tiên | Frozen inputs, kết quả xác định |
| W4 | AiGateway, AJV output, proposal | Fake-provider trước; live run khi có quyền |
| W5 | Quyết định con người, flow tối thiểu, worker ownership | APPROVE/HOLD/REJECT và duplicate handling |
| W6 | Nối luồng canxi hẹp, lưu outcome và replay | Walking skeleton; có phân biệt local smoke và production |
| W7–W10 | Mở rộng nguồn/câu hỏi đã chọn, UI cần thiết | Tính năng theo scenario; tích hợp code cũ đã kiểm tra |
| W11–W14 | B0–B14 theo use case, role và approval nghiệp vụ | Các gate quan trọng với staff review |
| W15–W19 | Nghiệm thu Phase 1, recovery, release và tài liệu | Bản vận hành được; ngày thực tế cần re-estimate |
| W20–W28 | Phase 2: lỗi thực tế, fine-tune, nguồn bổ sung, restore và UAT | Nghiệm thu toàn phạm vi v1 đã thống nhất |

W7–W28 là cửa sổ planning provisional từ báo cáo cũ; inventory và kết quả W6 sẽ quyết định giữ/rút ngắn/kéo dài.
Không hứa giảm lịch chỉ vì đã thêm framework/agent.

## Build flow và trách nhiệm từng Box

| Box | Phase 1: build flow | Phase 2 |
|---|---|---|
| 1 | Nguồn → raw evidence/artifact → normalization → freshness/QC → Data Pack | Connector bổ sung, matching thực tế, retention và query tuning |
| 2 | Registry câu hỏi → input contract → công thức → AI interpretation → Result/citation | Finance/Marketing/Legal hiệu chỉnh và regression |
| 3 | Objective → bounded tools → proposal → policy request | Recovery/context/budget; Pi spike chỉ khi có lợi ích đo được |
| 4 | Task/transition → worker dispatch → human-approved action → outcome | B0–B14 mở rộng, rework và portfolio cần thiết |
| 5 | Identity/capabilities → decision log → evidence gates → restore/release | UAT, incident handling, retention và audit |

## Thiếu gì để đạt 100% phạm vi v1

- Tích hợp thực tế của năm Box trên cùng store và hợp đồng.
- Source rights, dữ liệu thật được phép dùng, bằng chứng phù hợp và freshness.
- Công thức, ngưỡng và trường hợp canxi được người có chuyên môn xác nhận.
- Quyền phê duyệt thực tế, health claim gate và khả năng giữ HOLD khi thiếu căn cứ.
- Runtime web/worker, recovery, backup DB + artifacts và restore đã thử.
- Nghiệm thu use case, lỗi chặn đã xử lý, hướng dẫn vận hành.

## Người cần review

| Người | Quyết định |
|---|---|
| Owner | Scope, lịch bắt đầu, reuse source, ngân sách provider, host, RPO/RTO |
| Data Owner | Quyền nguồn, field meanings, kỳ quan sát, retention và độ tin cậy |
| Finance | COGS, margin, CAC, ROI, denominator và ngưỡng tài chính |
| Marketing | Segment, positioning, content và tiêu chí experiment |
| Legal/R&D/QA | Bằng chứng khoa học, claim, label, COA và công thức sản phẩm |
| CEO/GM | Risk appetite, quyền phê duyệt và quyết định GO/NO-GO |

Có thể dùng fixture tổng hợp để phát triển khi các quyết định này chưa xong; không tự coi fixture là business validation.


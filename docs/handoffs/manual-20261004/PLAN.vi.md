# Plan bàn giao thủ công khi goal đang tạm ngưng

Ngày 04/10/2026. Đây là tài liệu giao việc, chưa dispatch agent và chưa tiếp tục goal chính.

## Kết quả cần đạt

Gỡ hai nút thắt đang cản nội dung báo cáo: người dùng chưa chọn được nguồn bổ sung trên UI; đề xuất coding Insight còn bỏ sót và có diễn giải cần xử lý. Mục tiêu cuối vẫn là 13 section Market và 17 section Insight dùng chung cho nhiều sản phẩm, với hai web report và hai PDF riêng cho mỗi case.

Agent mới đọc `COMMON.md`, rồi đúng một prompt được chủ dự án giao. Các prompt viết bằng tiếng Anh để dùng cho Codex, Claude hoặc ZCode trên cùng máy. Mỗi gói có quyền sửa file riêng; tài liệu chung không tự cấp quyền làm cả ba gói.

| Gói | Việc bàn giao | Đầu ra quan sát được | Dependency |
|---|---|---|---|
| A | Rà và kiểm tra tích hợp cuối nguồn bổ sung | Upload được lưu, reload đọc đúng nguồn của run, chọn nguồn tạo bản mới; Linux có bằng chứng trên code cuối | Có thể bắt đầu ngay |
| B | UI upload/chọn nguồn và tạo phiên bản báo cáo | Người dùng thao tác được qua màn hình, có hướng dẫn khi thiếu điều kiện | Sau A chốt contract/client và bàn giao READY_FOR_UI |
| C | Sửa các lỗi coding Insight theo audit nghiệp vụ đã lưu | Prompt/xử lý dùng chung cải thiện các lỗi đã chỉ ra, giữ quote và trạng thái pending; có kế hoạch đo lại | Có thể bắt đầu ngay, độc lập A |

Khuyến nghị giao A cho agent mạnh về TypeScript/backend, B cho Claude Opus high có thể kiểm tra UX, C cho agent mạnh về logic/ngữ nghĩa. Tên model là lựa chọn điều phối, không phải điều kiện làm việc. Hai agent A và C có thể chạy song song; sau đó B nối tiếp A. Agent điều phối chỉ review/tổng hợp khi hai writer đang sửa. Tổng tối đa ba luồng.

## Điểm xuất phát

- Repo local: `C:/Users/Admin/Documents/Codex/2026-08-27/cou/work/research-automation-v1`.
- Remote: `https://github.com/khangpworking/tdn-growth-os.git`.
- Branch: `fix/research-real-world-audit`; HEAD `0116091fd5dc0902594f92d969dfb3ee0732c9c8`; draft PR #110 là reference.
- Tree có nhiều thay đổi chưa commit, gồm cả file untracked cần thiết. HEAD không chứa toàn bộ phần đang bàn giao. Không checkout branch khác, reset, clean, stash toàn tree hoặc tạo worktree chỉ từ HEAD rồi tưởng đã có code mới.
- `checkpoint-files.json` ghi hash 16 file liên quan tại lúc soạn plan. Đây là checkpoint cục bộ, không phải snapshot toàn repo hoặc commit phát hành. Generated supplemental types hiện có thể chưa khớp schema mới; A phải generate trên Linux.
- Gói chuẩn bị nguồn được đánh dấu `PREPARED_NOT_ADMITTED`. Upload không đồng nghĩa nguồn đã vào báo cáo. Revision phải replay phương pháp và tạo cặp mới; bản cũ vẫn được đọc bằng đúng ID.

## Bằng chứng có thể kế thừa

- Full API suite trước delta inventory cuối: 13/13 PASS trên Linux, gồm upload → revision → đọc lại, giữ bytes báo cáo cũ, retry và chặn nguồn của run khác.
- Quote/bounded owner checks và client boundary đã có proof trong các handoff. Không cộng các test trùng thành tổng điểm hoàn thành.
- Claude đã bàn giao context/inventory; GET và client đã nối nhưng delta cuối chưa chạy tích hợp trên Linux.
- ZCode audit HTTP timeout 240 giây, không có kết luận review độc lập.
- Audit nghiệp vụ Insight vừa chốt: I06 và I10 PASS trong phạm vi hẹp của 20 record; I02/I04/I05/I07/I08/I09/I13 NOT_READY. Đây là audit hỗ trợ phát triển, chưa là human gold hoặc application acceptance.

## Thứ tự và checklist

1. [ ] Chủ dự án giao đúng một prompt cho mỗi agent, báo rõ writer đang sở hữu file nào.
2. [ ] A kiểm tra checkpoint, đọc code cuối, sửa lỗi thật nếu có và chạy kiểm tra liên quan trên Linux scratch.
3. [ ] C đối chiếu audit với method/adoption và code, sửa generic; tách lỗi code/prompt, thiếu dữ liệu và câu cần disposition.
4. [ ] A lưu handoff `manual-A-result.md`, contract/client cuối và danh sách hash; ghi READY_FOR_UI hoặc blocker cụ thể.
5. [ ] B dùng bản A đã chốt, nối component vào dossier hiện tại, giữ bố cục đã duyệt và các API contract.
6. [ ] B kiểm tra thao tác bằng synthetic data, desktop/mobile và bàn phím; lưu ảnh cùng hành vi đã quan sát. Handoff `manual-B-result.md`.
7. [ ] C lưu `manual-C-result.md`, nêu rõ những gì đã chứng minh offline và những gì vẫn cần lượt model mới/nghiệp vụ duyệt.
8. [ ] Điều phối audit diff, đối chiếu bằng chứng Linux và ghép A/B/C. Chỉ cập nhật bảng tiến độ sau khi kiểm chứng.
9. [ ] Đợt sau mới chạy benchmark/acceptance thật và xuất sáu PDF trên cùng bản; kế hoạch này chưa giao provider call hoặc activation Fedora cho agent nhận việc.

## Phân quyền và cách tránh ghi đè

A sở hữu backend/intake contracts, generated artifacts, hai generator, client API nguồn và test boundary. B sở hữu component UI mới, `ReportVersionsPanel.tsx`, CSS riêng và test UI mới. C sở hữu prompt/execution Insight, helper mới nếu cần và test riêng; không sửa service/API/contract của A.

Mỗi agent ghi phạm vi nhận việc vào handoff riêng trước khi sửa. File ngoài phạm vi: đọc được, nhưng chỉ đề xuất delta. Nếu cần chạm file writer khác đang dùng, gửi hunk/path cho điều phối hoặc chờ bàn giao; không sửa âm thầm. Không sửa `docs/STATUS.md`, bảng 30 section hoặc plan v2.4 đồng thời; để điều phối cập nhật sau.

Các thay đổi đã có trong tree thuộc công việc hiện tại. Agent mới phải phân biệt phần trước khi nhận với phần mình sửa, nhất là file untracked không có Git baseline. Giữ bản sao/hash file sở hữu trước khi sửa để tạo diff gói riêng.

## Nghiệm thu mỗi gói

Handoff phải ghi: file sửa, hash trước/sau, lý do, test thực chạy và môi trường, kết quả, hạn chế, bước kế tiếp. `NOT_RUN` được ghi rõ nếu thiếu SSH; không chạy project checks trên Windows để thay thế. UI/backend chạy được chưa chứng minh đủ nội dung 30 section. Gate/inventory không phải forecast, experiment, unmet need hay quyết định đã duyệt.

Không commit/push/merge/deploy hoặc đụng runtime/live database trong ba prompt này. Đây là giới hạn gói bàn giao; quyền provider/deploy của điều phối trước đó không tự chuyển sang agent mới.

## Cách gửi cho agent mới

Gửi nguyên file prompt A, B hoặc C. Mỗi prompt có đường dẫn tuyệt đối tới repo, COMMON và tài liệu cần đọc. Agent chỉ nhận B nên bắt đầu bằng dependency check; nếu A chưa bàn giao, có thể rà thiết kế/read-only nhưng chưa build trên contract chưa chốt.

Nếu chỉ dùng một agent mới, giao A trước. Sau khi tôi review handoff A, giao B; C có thể giao cho agent khác song song. Goal ở chat điều phối vẫn paused cho tới khi chủ dự án yêu cầu tiếp tục.

## Kiểm tra tài liệu bàn giao

- Context và bằng chứng: đã đối chiếu branch/HEAD, đường dẫn, code/client hiện tại và audit nghiệp vụ đã lưu; không có lời xác nhận nghiệm thu vượt bằng chứng.
- Checkpoint: hash 16 file khớp bytes hiện tại; JSON đọc được. Đây chỉ là manifest file liên quan, không phải bản sao phục hồi toàn repo.
- Phân công: A/B/C có vùng ghi riêng và dependency A → B; các file chung/kiểm tra scratch có owner rõ.
- Đây là deliverable tài liệu. Chưa build UI, chạy project tests, gọi provider hoặc triển khai trong lượt soạn plan; các gate UI thuộc gói B sau này.


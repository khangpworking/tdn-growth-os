# ADR 0004 — Lời gọi AI của Content Studio chạy đồng bộ, attempt là bản ghi kiểm toán

Trạng thái: **Proposed**. Được chấp nhận khi chủ dự án merge nhánh Task 049.
Chi tiết: [Task 049](../tasks/049-content-ai-plumbing.md); bối cảnh: [ADR 0003](0003-content-studio-b11-b13.md) quyết định 5.

## Bối cảnh

`ARCHITECTURE.md` §3 quy tắc 5 dành cơ chế thực thi (bao gồm attempt) cho subsystem durable worker, và yêu cầu ADR khi thay đổi một bất biến. Hiện chưa có subsystem durable worker nào. ADR 0003 quyết định 5 yêu cầu mỗi lời gọi AI có một attempt, khởi động lại chuyển attempt treo thành `interrupted` và không tự chạy lại, nhưng không nói lời gọi chạy ở đâu. Task 049 cần một câu trả lời để 050/051 gọi AI.

## Quyết định

1. **Ngoại lệ đồng bộ, chỉ cho Content Studio.** Cho tới khi có subsystem durable worker, mỗi lời gọi AI sáng tạo của Content Studio chạy đồng bộ bên trong request khởi tạo nó, đúng một lần gọi gateway cho mỗi attempt. `flow_content_ai_attempts` là bản ghi kiểm toán lời gọi, thuộc Box 4, **không** có lease, lập lịch, retry, backoff, khử trùng lặp hay dead-letter. Khi có subsystem durable worker, việc tạo nội dung chuyển sang đó bằng một quyết định mới.
2. **Một executor cho mỗi database.** Chỉ operator bật quyền ghi OWNER là executor. Executor giữ `<database chuẩn hóa>.executor.lock` (tạo độc quyền, quyền 0600, metadata `{pid, hostname, startedAt, ownerNonce}`). Đường dẫn database được chuẩn hóa bằng `realpath`; database có hard link bị từ chối; filesystem chia sẻ/mạng không được hỗ trợ. **Mọi lock đã tồn tại** (còn sống, đã chết, host khác, rỗng, hỏng, không đọc được) đều chặn khởi động và không bao giờ bị sửa hay tự xóa. Lock chỉ được gỡ bằng quy trình thủ công trong runbook: dừng mọi executor và trình khởi động của database đó, xác nhận không còn việc đang chạy, kiểm tra đúng cặp database/lock, gỡ đúng lock cũ đã xác nhận, rồi khởi động một executor. Đây là quy tắc sở hữu file trên một host, không phải lease phân tán.
3. **Chỉ executor quét.** Trước khi nhận request, executor kiểm tra schema ở phiên bản mới nhất, đếm attempt `running` trên kết nối chỉ đọc, và chỉ mở kết nối ghi ngắn để chuyển chúng thành `interrupted` (`interrupted_by_restart`) khi số đếm khác 0. Lỗi khi quét làm dừng khởi động. Operator chỉ đọc không giữ lock và không bao giờ quét.
4. **Lưu và đăng ký đầu ra trước dữ liệu phụ thuộc.** Sau khi kiểm tra đầu ra, service lưu đúng byte vào kho địa-chỉ-nội-dung, kiểm tra digest và đăng ký `artifact_manifests` trong transaction riêng. Sau đó `stage` (artifact dẫn xuất) chạy, rồi `persist` **đồng bộ** của bên gọi chạy trong transaction đóng attempt `succeeded`. Ma trận:

   | Kết quả | Trạng thái | `output_sha256` |
   |---|---|---|
   | Thành công | `succeeded` | có |
   | Lỗi gateway / kiểm tra đầu ra | `failed` + mã lỗi | không |
   | Lưu byte hoặc đăng ký manifest lỗi | `failed / persist_failed` | không |
   | `stage` hoặc `persist` lỗi sau khi đăng ký | `failed / persist_failed` | có (byte và manifest còn lại) |
   | Khởi động lại khi đang chạy | `interrupted / interrupted_by_restart` | không |

   `persist` là ranh giới tin cậy: mã của 050/051, đồng bộ, không được trả về promise. Giới hạn khôi phục có chủ ý: chỉ attempt có tham chiếu đầu ra đã commit và byte/manifest kiểm chứng được mới có thể được tái sử dụng sau này mà không gọi lại provider. Crash hoặc lỗi đóng attempt trước khi ghi liên kết có thể để lại byte không liên kết mà lần quét không dựng lại được. Không có cam kết exactly-once cho lời gọi trả phí, hay độ bền khi mất điện vượt quá bảo đảm hiện có của kho.
5. **Ranh giới tích hợp.** `AiGateway` của phần phân tích không được mở rộng; `CreativeAiGateway` là interface anh em trong `src/platform/ai/`. `flow_content_ai_attempts` chỉ ghi lời gọi AI sáng tạo, không dùng cho research/report run hay checkpoint. Ngoại lệ đồng bộ này chỉ cho Content Studio; worker dùng chung trong tương lai phải là một quyết định phối hợp duy nhất (không có job engine song song) và giữ quy tắc Content Studio không tự retry provider.

## Hệ quả

- Request tạo nội dung giữ kết nối HTTP trong suốt lời gọi (tới 25 phút với GPT Image 2). 050/051 phải thiết kế giao diện chờ tương ứng.
- Executor bị kill để lại lock; lần khởi động sau thất bại cho tới khi chủ dự án làm quy trình khôi phục thủ công. Đây là đánh đổi có chủ ý: thà dừng còn hơn có hai executor cùng quét.
- Viewer vẫn chạy được khi executor dừng, nhưng các attempt treo vẫn ở `running` cho tới khi một executor khởi động.
- ADR 0003 không bị sửa. ADR này được thay thế khi có subsystem durable worker.

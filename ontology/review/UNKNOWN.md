# UNKNOWN — proposed review

Ngày: 2026-10-08. Implementer: Codex worker; independent cold reviewer:
GPT-6-astra. **reviewed by model, not by a domain expert**.

## Cold review

Reviewer chỉ đọc shape đã che rule ID, nguồn, và tên lớp có chứa rule ID;
không được đọc Ultimate hay repository. Đây là bản lưu ý nghĩa từ phản hồi
của reviewer cho input số 5, không phải quyết định của chuyên gia.

> Mỗi UnknownRecord phải có đúng một inWide=false và đúng một inAll=true. Không có nhánh thay thế. Trạng thái proposed là siêu dữ liệu, không ngăn validator áp ràng buộc.

## Comparison with source

Bước ba do implementer đối chiếu sau khi nhận bản đọc mù với
[nguồn chuẩn](../../docs/research/offline-acceptance.md); xem link dòng chính xác trong shape.

Khớp quyết định chủ ngày 28/09/2026 tại offline-acceptance.md dòng 17: fresh UNKNOWN giữ trong ALL và ngoài WIDE. Không lấy classify.ts làm nguồn cho lệnh cấm này vì file đó không ghi chính sách WIDE. Không mở rộng quy tắc sang missing/stale/pending; không đổi hợp đồng generic calculator.

## ESCALATED — limits not checked

Shape không xác định được record nào thật sự là UNKNOWN hoặc xác minh tập thành viên được tính ở ứng dụng. Phép kiểm chỉ áp dụng cho projection đã phân loại. Xác minh projection và việc chính sách đã được áp trong pipeline nằm ngoài thử nghiệm.

Trạng thái vẫn **proposed**. Pass dataset không chứng minh bản dịch đầy đủ;
chứng chỉ suy luận không chứng minh quy tắc nghiệp vụ đúng. Chưa có chủ duyệt.

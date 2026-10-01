# A45 đề xuất: chọn hồ sơ phương pháp khi tạo báo cáo trên web

Ngày: 2026-10-01. Đây là kế hoạch kỹ thuật sau A44, chưa phải chức năng đã chạy
hoặc một thay đổi nghiệp vụ đã được triển khai.

## Khoảng trống đã xác minh

`ReportGenerationService.inputs()` hiện chỉ liệt kê workbook Metric, manifest
và labels. API tạo báo cáo nhận đúng bốn trường; không nhận ba descriptor
`descriptiveMethodsPath`, `locatedInsightMethodsPath`, `methodPacketsPath`.
Các đường version/assembly và CLI đã có consumer giữ byte nguồn, kiểm tra
locator, authority và replay. Vì vậy không cần xây thêm engine hay ledger.

Manifest package hiện chưa khai báo quan hệ descriptor với một bộ Metric.
Không được chọn JSON đầu tiên, suy ra quan hệ từ tên file hoặc mặc định ghép
mọi supplement chỉ vì chúng nằm cùng package.

## Phạm vi đề xuất nhỏ nhất

1. Chỉ nhận supplement từ chính package đã chọn ở bản đầu; package khác là
   phần mở rộng sau. Người dùng vẫn có thể tạo báo cáo không có supplement.
2. Server liệt kê ứng viên theo schema thực, package đã xác minh, logical path
   và digest; trả ID lựa chọn mờ cùng loại hồ sơ và giới hạn kiểm tra. Hợp schema
   chỉ có nghĩa được nhận diện, chưa chứng minh phù hợp với bộ Metric.
3. Người dùng chọn rõ từng loại hồ sơ hoặc chọn không dùng. Không tự gắn một
   ứng viên dù package chỉ có một file hợp schema. Không dựng tích Descartes
   của mọi tổ hợp ứng viên.
4. Request chỉ nhận ID server quảng bá, không nhận path tùy ý. Server giải lại
   ID trong đúng package, nối path đã xác minh vào cả prepared và source-backed
   creation. Consumer hiện có vẫn quyết định byte/locator/claim có hợp lệ không.
5. Trước mọi lần retry, kiểm tra cả ba lựa chọn supplement, không chỉ
   `sourceRequest`. Đổi lựa chọn với cùng request key phải conflict trước khi
   tạo các record trung gian. Kiểm tra cả trường hợp request artifact chưa
   được publish sau commit; không chỉ dựa vào file đó để phát hiện drift.
6. Bằng chứng claim không khớp thì dừng với lỗi hướng dẫn; không tự bỏ hồ sơ
   lỗi để báo thành công. Input thiếu hợp lệ có thể tạo partial report đúng
   consumer, nhưng hỏng lineage không phải thiếu dữ liệu thông thường.

Không thêm upload, AI coding, provider, queue, migration, scoring hay quyền
phê duyệt. Không đổi nội dung hoặc trạng thái của report lịch sử.

## Phân công tối đa ba nhánh

- Điều phối: API schema/types, shared wiring và thứ tự tích hợp.
- Nhánh service: nhận diện/giải ID lựa chọn, exact retry và owning integration.
- Nhánh UI: form chọn hồ sơ, trạng thái thiếu/không tương thích, giữ request
  snapshot và reload authoritative. Giữ thiết kế operator đã duyệt.
- Nhánh review: trust boundary và một lượt nghiệm thu trình duyệt Linux.

Không để nhiều writer cùng sửa schema hoặc shared manifest. Theo cập nhật
của owner ngày 2026-10-01, thiết kế UI/UX giao cho Claude Opus 5.5 high;
code và logic giao cho GPT-5.6 Luna xhigh hoặc Claude Sonnet 5.5 high.
Nhánh UI phải tách quyết định thiết kế khỏi phần triển khai code. Nếu runtime
không hỗ trợ đúng model được yêu cầu, báo rõ trước khi thay model; không
tự chuyển sang Astra hoặc model khác.

## Nghiệm thu và phát hành

Test chủ yếu đặt ở service/API thật: legacy không đổi, lựa chọn có/không hồ sơ,
ambiguous inventory, thay ID/package, changed retry, missing-publication retry,
replay cùng byte và fail-closed claim drift. Frontend sở hữu lựa chọn/pending/
thay source; không lặp toàn bộ consumer tests ở UI. Linux CI chạy typecheck,
affected tests và final release check; không chạy trên Windows.

Một fixture package đủ supplement phải đi từ form tới đúng report version,
mở HTML và tải evidence; reload không tính lại. Nguồn thật chỉ được nghiệm thu
khi có package thực đúng profile và đủ descriptor, không dùng synthetic để
tuyên bố đã tự động hóa toàn bộ 30 section trên dữ liệu canxi.

L0/L1 theo A42 có thể phát hành trước phần chọn supplement nếu owner duyệt
merge/activation. A43/A44 còn gate PDF riêng; không che một gate đỏ để gọi
toàn stack đã sẵn sàng. Trước activation phải xác minh lại main, ancestry,
runtime/schema Fedora, backup và rollback theo runbook đã có.

# Brief UX — Discovery và Product Workspace B7–B10

Ngày: 2026-09-11. Baseline đọc: main `1e8cd2dcfd49fe339c0e05cc3bc88994a77dfc6a`, qua Task 032.
Trạng thái: **chủ dự án đã duyệt prototype nhiều thị trường (D31); Task 033 chuyển giao diện sang React với dữ liệu demo**.
Product truth: `PRODUCT.md` và `INTENT.md`. Stack: ADR 0002.

## 1. Công việc cần giúp người dùng làm

OWNER mở workspace để biết sản phẩm đang chờ việc gì, xem đúng bằng chứng/snapshot và thực hiện quyết định tiếp theo. Chế độ chính: **operate**, có phần đọc dữ liệu hỗ trợ; không phải trang marketing.

Thành công: xác định được trạng thái hiện hành, điều kiện còn thiếu và hành động hợp lệ mà không đọc nhật ký kỹ thuật hoặc nhập UUID/digest bằng tay. Không dùng phần trăm hoàn thành tự ước lượng.

## 2. Phạm vi mockup đầu tiên — đề xuất

Một bộ mockup desktop nối tiếp, dùng cùng ngôn ngữ thiết kế:

1. **Khám phá → B7:** basket đã chọn rõ phiên bản, danh sách ứng viên độc lập và nút quyết định.
2. **Product Workspace → B8:** trang chính với bốn lane, trạng thái hiện hành và lịch sử; đây là màn hình đầu tiên cần thiết kế chi tiết.
3. **B9:** form STP đang soạn và trạng thái sau khóa, thể hiện rõ khóa một lần.
4. **B10:** quyết định kết hợp, khả năng sửa và lịch sử không bị mất.

Chỉ thiết kế rộng thêm khi bốn màn hình này đã rõ. Không dựng cả 5 Box thành năm dashboard trống. Sidebar là cách điều hướng, không giả lập chức năng chưa có.

### Quan hệ triển khai giữa Option 2 và Option 3

**Cập nhật D30:** bổ sung trang danh sách tất cả thị trường ở cấp trên. Flow hiện tại là `Tất cả thị trường → Workspace thị trường (khám phá + danh sách sản phẩm) → Chi tiết sản phẩm`. Overview sản phẩm được giới hạn theo thị trường đang xem. Có tìm kiếm, tạo nghiên cứu demo trống, chuyển thị trường và đường dẫn về thị trường gốc. Mỗi sản phẩm sau B7 vẫn có quyết định riêng; không liên kết theo tên.

Hai hướng này nên được xem là một cặp, không phải lựa chọn loại trừ:

`Portfolio Overview (Option 3) → Product Workspace Detail (Option 2) → B8 quick-operations (Option 1, nếu cần)`

- Option 3 trả lời: “Tôi đang có những workspace nào và workspace nào cần xử lý tiếp?”
- Option 2 trả lời: “Workspace này đang dựa trên bằng chứng nào và tôi cần quyết định gì?”
- Option 1 chỉ là một mật độ thao tác nhanh bên trong detail hoặc một màn hình phụ; không cần triển khai riêng trong lượt đầu.

Vì vậy mockup có thể duyệt Option 3 + Option 2 cùng lúc như một flow hai tầng. Khi code, ưu tiên route overview và detail dùng chung design system; chỉ thêm quick-operations khi việc xử lý nhiều lane chứng minh nhu cầu.

## 3. Bố cục chức năng đề xuất, chưa chốt visual

- Thanh điều hướng: workspace khám phá / workspace sản phẩm; luôn thấy mình đang ở loại nào.
- Đầu trang: tên sản phẩm, tóm tắt ứng viên đóng băng, nguồn B7 và trạng thái có nhãn chữ.
- Stepper B8 → B9 → B10: thể hiện sự kiện/trạng thái đã xác minh, không suy ra tất cả từ `entryStep: B8` bất biến.
- Vùng chính: thao tác của bước đang xem. Một hành động chính nổi bật; lịch sử và lineage mở theo nhu cầu.
- Vùng bằng chứng: nguồn, kỳ dữ liệu, phạm vi và cảnh báo; không tự gắn báo cáo theo tên sản phẩm trùng nhau.
- Di động: xếp lane thành danh sách, giữ trạng thái + hành động trong cùng khối; không ép bảng desktop thu nhỏ.

## 4. Nút và hành vi phải bám backend

| Bước | Nút/điều khiển đề xuất | Điều kiện và kết quả |
|---|---|---|
| B7 | Đạt / Tạm giữ / Loại | OWNER; đúng basket + candidate + version. Gửi PASS/HOLD/REJECT, không thêm trường lý do. |
| B7 | Tạo workspace sản phẩm | Chọn đúng PASS; thao tác tách riêng, không tự tạo ngay khi bấm Đạt. Hiện workspace đã tồn tại thay vì tạo lần hai. |
| B7 | Xem quyết định | Quyết định cũ bất biến; không có nút sửa tại chỗ. Xét lại cần basket version mới theo policy. |
| B8 | Đạt / Tạm giữ / Không đạt ở mỗi lane | Bốn lane độc lập. Quyền OWNER kiểm tra ở server. Sửa trạng thái khác bằng bản ghi mới có version guard. Không gửi lại trạng thái hiệu lực như quyết định mới. |
| B8 | Xác nhận đủ điều kiện B9 | Chỉ khi bốn quyết định hiện hành đều PASS; đóng băng đúng bốn ID. Khi đã có clearance, mở bản đó, không tạo lại. |
| B9 | Thêm/xóa/sắp xếp phân khúc | Trước khóa; key ổn định, label dễ hiểu. Target phải trỏ đến phân khúc thực có; không để target mồ côi khi xóa. |
| B9 | Chọn mục tiêu chính/phụ | Một primary, secondary tùy chọn và không trùng primary. Giữ thứ tự segment rõ ràng. |
| B9 | Lưu bản đang soạn | Cần clearance. Cập nhật đúng một working row bằng expected digest; không tạo hệ thống draft-version mới. |
| B9 | Khóa STP | OWNER; lưu xong, đúng digest hiện tại. Hiện xác nhận hậu quả: không sửa/mở khóa trong v1. Không có nút unlock/rollback. |
| B10 | Duyệt / Tạm giữ / Từ chối | Một quyết định chung cho danh mục + cho phép cấp vốn, gắn đúng locked STP. Không có số tiền hoặc trường lý do. |
| B10 | Sửa quyết định | Chọn trạng thái khác; gửi đúng previousDecisionId. Lưu bản mới, lịch sử cũ còn nguyên. |
| B10 | Xem lịch sử | Hiện decision hiện hành và các bản trước, thời điểm và actor khi dữ liệu được backend cung cấp. |

Nhãn nút và bố cục là đề xuất UX; enum, quyền và quy tắc là ràng buộc backend. Không biến nút OWNER thành cơ chế xác thực; UI không tự cấp role/capability.

### Lưu ý về snapshot và sửa quyết định

- Clearance chứng minh bốn PASS tại lúc đóng băng; trạng thái B8 hiện hành có thể thay đổi sau đó. Hiện riêng “Đã xác nhận lúc …” và “Trạng thái hiện tại …” nếu khác; không tự hủy clearance hoặc phát minh quy tắc mở lại B9.
- B9 không có lịch sử các lần lưu draft; chỉ hiển thị working hiện tại và locked snapshot, không hứa khôi phục draft cũ.
- B10 APPROVE chỉ làm `readyForB11` đúng. Hiện “Đủ điều kiện — B11 chưa triển khai”; không có nút thực thi B11, chuyển tiền hoặc tự tạo nội dung.

## 5. Trạng thái UX cần có

- Chưa có workspace/ứng viên/basket: empty state nêu đúng thứ còn thiếu; không số liệu mẫu lẫn với thật.
- Chưa quyết định: “Chưa đánh giá”, khác HOLD và REJECT.
- Không đủ quyền: đọc nếu được phép, ẩn/khóa thao tác với giải thích; server vẫn kiểm tra quyền.
- Đang gửi: vô hiệu hóa thao tác trùng trong cùng form, giữ dữ liệu đã nhập.
- Gửi thành công nhưng mất kết nối: xác minh trạng thái/retry đúng request identity; không tạo quyết định mới một cách mù quáng.
- Xung đột phiên bản: giữ draft local, báo dữ liệu đã đổi, tải trạng thái hiện hành để đối chiếu; không tự ghi đè.
- Thiếu/corrupt artifact: lỗi xác minh, chặn hành động phụ thuộc; không biến thành “chưa đánh giá”.
- STP đã khóa: chỉ đọc, nhãn khóa rõ. Confirm chỉ cho thao tác có hệ quả, không thêm nhiều lớp gate cho nút thường.
- Dùng bàn phím được, focus rõ, nhãn chữ đi kèm màu, hỗ trợ reduced motion. Đây là tiêu chí thiết kế đề xuất, không tuyên bố đã đạt chứng nhận accessibility.

## 6. Chart/visual nào có thể dùng trung thực

| Visual | Điều kiện |
|---|---|
| Ma trận bốn lane B8 | Trạng thái verified; đếm lane đã đánh giá/PASS nếu có, không gọi là xác suất thành công hay % chất lượng. |
| Timeline B8/B10 | Dữ liệu lịch sử thật qua reader/API; không sáng tác mốc xử lý. |
| Sơ đồ phân khúc → primary/secondary → positioning | Từ đúng STP đang xem; không thêm score hoặc ranking do AI tự đặt. |
| KPI thị trường | Đúng Result và kỳ đo, missing khác zero; không biến integer string lớn thành số mất chính xác. |
| Chart theo thời gian | Chỉ khi có chuỗi thời gian thật, không chia tổng 24 tháng thành các tháng giả. |
| Review giữ/loại | Gắn đúng dataset/filter/version; không đổi thành positive/negative hoặc độ tin cậy. |

Tóm tắt ngắn đi trước, nguồn và chi tiết mở sau. Không bổ sung kết luận thị trường, gợi ý insight hoặc methodology B2 chưa được phê duyệt chỉ để lấp khoảng trống màn hình.

## 7. Dữ liệu mockup

Dùng tên sản phẩm minh họa và trạng thái **synthetic**. Nhãn “Dữ liệu minh họa — không phải quyết định thật” hiển thị ở cấp trang. Không đưa raw reviews, usernames, credentials hoặc private artifacts vào ảnh. Dữ liệu thật canxi chưa có B7/product workspace/B8/B9/B10 trong các acceptance được báo cáo; không trình bày ảnh như đã duyệt thật.

## 8. Khoảng cách phải xây sau khi duyệt mockup

1. Frontend scaffold React/Vite/TS, navigation và layout dùng dữ liệu synthetic rõ nhãn.
2. HTTP API mỏng gọi service hiện có; endpoint cụ thể chỉ chốt sau khi kiểm tra service signatures, không phát minh URL trong mockup.
3. List/read model cho workspace, basket, trạng thái gate và lịch sử; hiện verified readers không đồng nghĩa đã có API danh sách.
4. Trusted OWNER session và error/concurrency mapping tại server. Không nhận actor/role tùy ý từ client.
5. Kết nối từng màn hình và test hẹp theo rủi ro; E2E chỉ cho critical path khi UI/API thực sự có.

Không tạo migration, ledger, state engine hay bộ công thức mới cho việc vẽ giao diện. Giữ nguyên các contract canonical và không sao chép rule nghiệp vụ thành quyền quyết định ở React.

## 9. Phần để sau

B0, B14; B2 methodology Task 024; insight/60 câu hỏi; chat AI; reviewer role; tích hợp Content Studio; dashboard toàn hệ thống; scraping tự động; B11–B13; đa phiên bản STP và mở khóa. Không tự coi chúng là scope frontend v1.

## 10. Prototype đang xem và bước tiếp theo

Prototype gốc `docs/frontend/direction-options.html` là baseline thị giác. Bản tiếp theo `docs/frontend/workspace-prototype.html` nối Option 3 tổng quan với Option 2 chi tiết, có tìm kiếm, quyết định B8, lịch sử và clearance mô phỏng trong bộ nhớ. Xem direction contract tại `overview-detail-direction.md` và token tại `../../DESIGN.md`.

Không dùng board bốn nguồn `design-md-four-way.html` làm cơ sở triển khai. Chủ dự án đã duyệt bản nhiều thị trường và cho triển khai Task 033; không hỏi lại lựa chọn thiết kế. API và các form ngoài scope Task 033 là bước sau.

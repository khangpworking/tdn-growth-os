# Các quyết định chính sách còn cần chủ dự án

Gói A41 đã mô tả các cấu hình có thể triển khai, nhưng chưa cấp quyền chạy phương pháp mới. Khuyến nghị dưới đây là lựa chọn để chủ dự án xem xét, không phải quyết định đã được phê duyệt. Không cần trả lời từng đơn vị, kỳ dữ liệu, locator hay trường nguồn ở đây; đó là dữ liệu đầu vào của từng lần chạy. Không đề nghị thu thập khảo sát, phỏng vấn hay thử nghiệm mới.

## 1. Cho phép triển khai các thao tác mô tả an toàn

**Khuyến nghị:** chấp nhận làm cấu hình v1 cho D01-D04, trong đúng phạm vi sau:

- M05 giữ tên chỉ số theo nguồn; chỉ cộng khi cùng kỳ, đơn vị, phạm vi và có bằng chứng các phần tử không chồng lặp. Không diễn giải doanh số/tìm kiếm thành nhu cầu, không tạo điểm tổng hợp.
- M06 giữ nhãn tình trạng do nguồn nêu; chưa suy ra số lượng cung duy nhất, hàng còn tồn, độ mới hay thị phần khi thiếu ID/quy tắc/denominator thật.
- M07 so sánh cạnh nhau chỉ với tập đối thủ do chủ dự án khai báo. Mặc định không xếp hạng, trọng số hoặc chọn “tốt nhất”.
- M09 lập danh mục sự kiện có nguồn và ngày riêng; không suy ra tác động, xác suất hoặc quan hệ nhân quả.

**Nếu chưa chấp nhận:** giữ bốn phần ở trạng thái proposal; không chạy phép tổng hợp hoặc so sánh mới. Các quan sát có locator vẫn có thể được kiểm kê theo nguyên văn nguồn.

## 2. Chấp nhận codebook định vị và tỷ lệ chỉ trong corpus đã đóng băng

**Khuyến nghị:** duyệt phiên bản cụ thể của `located-evidence-v1-draft` và bảng ánh xạ D06-D07 làm cấu hình v1 cho bước triển khai. Đây là bộ quy tắc gắn nhãn nội dung. Coder áp dụng các ánh xạ rõ ràng; chỉ trường hợp mơ hồ hoặc đề xuất mã mới cần người duyệt xử lý. Cho phép tỷ lệ `n/N` trong chính tập bản ghi đã cố định khi quy tắc đưa vào, đơn vị, kỳ, phiên bản bộ mã và mẫu số đầy đủ đã cố định, việc gắn mã đã hoàn tất. Luôn hiện số bản ghi bị loại, không đọc được, không có mã, đang chờ xử lý và mang nhiều mã. Không diễn giải thành tỷ lệ khách hàng/dân số/thị trường nếu thiếu thiết kế phù hợp.

Điểm cốt lõi của quy tắc mã: cần câu lựa chọn-nêu-lý-do hoặc tác vụ-đã-thử-và-vướng mắc trong cùng locator; tách polarity khỏi người phát ngôn; giữ phủ định, điều kiện và hearsay; không suy từ sao đánh giá, im lặng, thuộc tính listing hay văn bản trùng nhau. Gợi ý mã chưa được người duyệt không vào counts, n/N, nhóm hay tổng hợp.

**Nếu chưa chấp nhận:** chỉ giữ ví dụ có locator và kiểm kê corpus; không tạo count/rate theo mã. Không cần chủ dự án duyệt từng dòng hiển nhiên để triển khai khi đã có một codebook revision được chấp nhận.

## 3. Cho phép thiết kế AI đề xuất, người có thẩm quyền quyết định

**Khuyến nghị:** chấp nhận contract đề xuất D12 cho các loại `SUMMARY_DRAFT`, `HYPOTHESIS`, `OPPORTUNITY_DIRECTION`, `STRATEGY_OPTION`, `ACTION_OPTION`, `DRIVER_HYPOTHESIS` và `CODE_SUGGESTION`, mỗi loại chỉ dùng ở section được ánh xạ. Candidate phải giữ claim/locator chính xác, assumptions, phản chứng, UNKNOWN/gaps/limits và attempt metadata; không tự tạo số liệu, ID, ràng buộc, score, rank, xác suất, ROI hay lựa chọn “tốt nhất”. `ownerOptions[]` và `aiCandidates[]` luôn tách biệt; chỉ quyết định riêng của người có thẩm quyền mới đặt preferred/chosen.

Đây là đề nghị chấp thuận thiết kế, không kích hoạt model hoặc chạy sinh nội dung. Trước khi dùng thật cần kiểm tra model, prompt, cấu trúc đầu ra, cách duyệt nội dung và cách lưu từng lần sinh theo quy trình hiện có. Người duyệt trước mắt là chủ dự án; không cần tạo thêm hệ thống vai trò. Kiểm tra tham chiếu chỉ xác nhận liên kết tới evidence, không chứng minh diễn giải đúng. Review B7/B10 vẫn giữ API button-only; không thêm trường lý do bắt buộc.

**Nếu chưa chấp nhận:** giữ mọi candidate AI ở ngoài workflow; các packet thủ công vẫn có thể giữ claim inventory và owner options. Không ảnh hưởng các thao tác số học mô tả đã được duyệt riêng.

## 4. Giữ các phân tích nâng cao ở trạng thái đóng

**Khuyến nghị:** chưa bật dự báo sản xuất, suy luận quần thể/khác biệt nhóm, hiệu quả kênh, quy kết nhân quả hoặc ngưỡng thành công. Có thể xem xét riêng baseline last-observed/MAE như một chẩn đoán đề xuất, sau khi chủ dự án chấp nhận profile và từng run cung cấp chuỗi/ngày/múi giờ/split/gap policy rõ ràng. I16 hiện chỉ là thiết kế chưa chạy hoặc kết quả đã có với protocol/dữ liệu chính xác; không yêu cầu thử nghiệm mới.

**Nếu hoãn:** M10 chỉ có thể báo eligibility/blocker; I11 vẫn là inventory nhóm và mẫu số; I12 giữ presence/exposure/outcome tách biệt; I16 không tạo kết quả. Phần an toàn không cần chờ toàn bộ 30 section.

## Đầu vào cho một lần chạy, không phải câu hỏi chính sách

Khi chọn một thao tác, người vận hành cung cấp đúng dữ liệu hiện có: file/manifest và digest, locator chính xác, kỳ và ý nghĩa ngày/múi giờ, đơn vị/mẫu số, universe/frame/inclusion, key/denominator thực nếu có, codebook hoặc protocol revision, peer/group set nếu thao tác đó cần, cùng quyền duyệt tương ứng. Thiếu một trường chỉ chặn phép tính/claim cần trường đó; không được thay bằng zero hoặc mở rộng scope. A41 chưa đánh giá input cụ thể, chưa chạy phương pháp và chưa tạo report output.

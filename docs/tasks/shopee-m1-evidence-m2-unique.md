# M1 lưu bằng chứng và M2 chọn năm sản phẩm khác nhau

Yêu cầu của chủ sở hữu ngày 12/11/2026, bổ sung trên PR #461. Đây là thay đổi của luồng desktop Shopee; chưa cho phép deploy hoặc chạy nguồn thật.

## Kết quả cần đạt

- M1 giữ dữ liệu gốc, thu theo doanh số trong đúng kỳ giảm dần bằng sắp xếp native của Metric, lưu thứ tự/hạng và toàn bộ ứng viên đã thu. Không cắt thành năm dòng, không lấy doanh số trọn đời, không tự phân trang.
- M1 lưu ảnh/PDF toàn trang cùng lượt/kỳ và ảnh toàn khung Top Products / Sản phẩm bán chạy, gồm tiêu đề, hai dropdown và danh sách. Tái sử dụng cơ chế chụp/cắt đã có; không dùng Deep data download. Mở lại bằng chứng đã lưu, không tra nguồn lần nữa.
- M1 hiển thị gọn hai kết quả capture và kiểm tra dữ liệu, từ khóa, khoảng ngày, số dòng Shopee và các nút xem bằng chứng/spec/dữ liệu gốc. Khi lỗi phải nói rõ nguyên nhân. M1 đạt không đồng nghĩa đủ năm sản phẩm khác nhau.
- M2 offline duyệt đúng thứ tự nguồn, chỉ Shopee; gặp sản phẩm chưa chọn thì lấy, trùng thì bỏ qua để xét hạng sau. Dừng ở năm nhóm khác nhau; giữ link đầu tiên và doanh số riêng, không cộng doanh số các link trùng.
- Cùng dòng sản phẩm/công thức là trùng dù khác shop/link/số hộp/ngày dùng. Combo khác thành phần là nhóm riêng; cùng thành phần khác số lượng/ngày dùng thì trùng. Không gộp chỉ vì cùng thương hiệu, shop hoặc từ khóa chung; không xóa thông tin hàm lượng/công thức khi chuẩn hóa số lượng bao gói.
- Bỏ các ưu tiên danh mục phổ biến, đa dạng thương hiệu và khác shop ở chính sách mới. Hai sản phẩm khác nhau trong cùng shop được chọn. Thiếu năm nhóm phải báo số đã chọn và lý do; không chèn mục trùng hay tự thu thêm nguồn.
- M2 hiển thị hai kết quả kiểm tra liên kết/thứ tự và năm sản phẩm khác nhau; bảng ngắn gồm thứ tự chọn, hạng nguồn, tên, shop, doanh số trong kỳ, link. Có chi tiết mục bị bỏ và ảnh đúng khung sản phẩm đã lưu từ M1, bao phủ các hạng dùng để chọn.
- Lượt cũ vẫn xem được theo chính sách cũ; không nâng kết quả lịch sử thành đã đạt quy tắc mới. Giữ các sửa trước về một khoảng ngày, capture specs, biểu mẫu, B7 và thu bình luận M3.

## Tiêu chí thành công và cách đo

| Phần | Thành công theo cách người dùng hiểu | Cách đo/kiểm tra |
|---|---|---|
| Thứ tự M1 | Danh sách theo đúng doanh số trong kỳ mà Metric đang xếp. | Đối chiếu request/sort native, kỳ đã xác nhận, sourceMap sản phẩm, thứ tự response và hạng giữ lại; từ chối dữ liệu chỉ có doanh số trọn đời. |
| Bằng chứng M1 | Tôi xem lại đúng trang đã thu mà không tốn thêm lượt tra. | Kiểm identity lượt/kỳ/capture, hash dữ liệu và file; thử mở offline với source transport bị chặn. |
| Unique M2 | Không chọn lại cùng sản phẩm chỉ vì khác shop, combo số lượng hay số ngày dùng. | Ca cùng công thức khác bao gói; combo kẽm, kẽm+C, kẽm+biotin; bảo toàn thành phần/hàm lượng; xác minh căn cứ nhận diện được lưu. |
| Chọn M2 | Bỏ dòng trùng và lấy tiếp hạng sau, không đổi thứ tự vì thương hiệu/shop. | Ca hạng 3 trùng hạng 5, lấy hạng 6; hai sản phẩm khác nhau cùng shop; giữ thứ tự cả khi doanh số bằng nhau. |
| Thiếu ứng viên | Hệ thống nói rõ còn thiếu, không báo đủ năm sai sự thật. | Danh sách ít nhóm hơn năm trả số thực tế và lý do, không PASS tiêu chí năm nhóm, không có nguồn gọi thêm. |
| Ảnh M2 | Ảnh cho thấy đúng vùng sản phẩm và cách Metric đang xếp. | Khung chứa tiêu đề EN/VI, cả hai dropdown và các hàng tương ứng; từ chối thay bằng ảnh cards-only/dashboard hoặc bằng chứng của lượt khác. |
| Lịch sử | Kết quả cũ giữ nguyên ý nghĩa, không bị tính lại theo luật mới. | Phiên bản chính sách riêng với capture schema; ca đọc dữ liệu/phiếu kiểm tra cũ, không sửa bytes lịch sử. |

## Phân công và điều kiện bàn giao

Backend GPT-6.1 Sol xhigh; UI và kiểm thử Qoder DeepSeek-Flash trên Fedora qua Herdr; Astra medium review. Root tích hợp Git, kiểm chứng, build và handoff. Antislop áp dụng trong lúc làm theo giao diện vận hành hiện tại; không redesign.

Chỉ merge khi CI xanh và Astra CODE PASS đúng commit. Kiểm thử dùng dữ liệu tổng hợp/offline, không thay nghiệm thu Metric hoặc Windows native. Các phần chưa kiểm bằng lượt thật phải ghi rõ trong handoff. Các tiêu chí nghiệp vụ khác và việc tách hướng dẫn skill vẫn pending.

Trạng thái tài liệu: triển khai và kiểm thử cục bộ đã chốt. Commit, CI, review và trạng thái merge được ghi trong receipt và handoff đúng phiên bản; chưa cho phép deploy hoặc chạy nguồn thật.


## Chính sách nhận diện tên đã được chủ sở hữu chấp nhận

Chủ sở hữu chọn: “Dùng quy tắc tên rõ ràng; mơ hồ thì chưa xác nhận đủ 5”. Bản này dùng quy tắc tên hữu hạn, không tuyên bố xác minh thành phần hóa học ngoài dữ liệu nguồn. Thành phần và hàm lượng khác nhau được giữ riêng; số hộp/viên/ngày dùng được chuẩn hóa trong các mẫu rõ ràng. Tên không đủ rõ làm kết quả chưa xác định, không được tự đếm thành nhóm khác.

Hợp đồng r2.1 nêu các tên nhận diện hiện có: kẽm/zinc; vitamin C/vit C/vitaminC; biotin; canxi/calcium; magiê/magnesium; vitamin D3/D3; vitamin K2/K2. Cần thương hiệu trong dữ liệu nguồn, hoặc token DHC rõ ràng cho trường hợp dự phòng hữu hạn. Hàm lượng số tương đương và đơn vị khối lượng mg/mcg/ug được chuẩn hóa chính xác; không suy diễn chuyển IU sang đơn vị khối lượng. Các lựa chọn nhiều biến thể hoặc từ công thức chưa được hỗ trợ giữ trạng thái chưa xác định. Giới hạn này phải được ghi trong handoff và câu mô tả ngắn trên UI, không thay bằng khẳng định chắc chắn về công thức.

## Hợp đồng và ý nghĩa của cổng kiểm tra

- Chính sách mới dùng marker riêng `metric-products-unique-v1`; capture-spec-v3 cũ không tự chuyển sang luật mới. Luồng tạo desktop một kỳ mới có marker; lịch sử và wire CLI cũ giữ quy tắc trước.
- Đầu ra chỉ đọc qua `moduleOutputs` phản ánh dữ liệu đã lưu. Mở bằng chứng dùng loại file cho phép cùng hash, không nhận đường dẫn tùy ý hoặc URL Metric. Spec đã lưu dùng API kiểm tra spec hiện có.
- M1 PASS chứng minh dữ liệu/phạm vi/thứ tự nguồn hợp lệ, không chứng minh đủ năm nhóm hoặc ảnh đã sẵn sàng. Thiếu ảnh được báo riêng.
- M2 PASS yêu cầu lựa chọn được kiểm lại từ dữ liệu M1, đủ năm nhóm đã xác định và ảnh đúng toàn khung bao phủ mọi hạng được chọn. Có thể có năm dòng nhưng chưa PASS vì tên mơ hồ hoặc ảnh thiếu; UI giữ số thực tế và nêu lý do.
- Ảnh phải chứa toàn khung đang hiển thị cùng cả hai dropdown. Nếu raw có 20 ứng viên, ảnh native chứa 15 và các hạng được chọn đều nằm trong 15 đó thì không chặn chỉ vì năm ứng viên chưa dùng ngoài ảnh. Chọn hạng không có trong bằng chứng thì báo thiếu; không tự tra thêm trang.


## Triển khai và kiểm chứng đã chốt

- `scripts/module-product-pick.ts` giữ thứ tự nguồn và chọn nhóm; `src/modules/foundation/metric-product-groups.ts` chứa quy tắc tên hữu hạn đã được chấp nhận. Shared Market picker không đổi.
- `scripts/module-metric-output.ts` dựng đầu ra từ dữ liệu đã lưu và kiểm bằng chứng; `shopee_flow.py` dùng cùng logic để kiểm cổng M1/M2, cung cấp CLI `outputs`/`evidence`. Desktop bridge mở bytes đã kiểm hash từ ba loại tệp cho phép.
- Khi native sort cần đổi, lưu toàn bộ traffic đã quan sát trong `observed-responses.json`. `raw-responses.json` giữ các endpoint khác và response sản phẩm cuối cùng, với đầy đủ ứng viên/thứ tự. Không tìm ngược một response tốt để che response cuối sai. Không thêm fetch/phân trang ngoài thao tác dropdown đã yêu cầu.
- Kiểm sort của M1 tách khỏi kiểm vùng ảnh. Dữ liệu đúng có thể đạt M1 dù ảnh toàn khung bị cắt/không có; M2 vẫn bị chặn nếu ảnh không đáp ứng yêu cầu.
- UI giữ hai trạng thái M1, hai trạng thái M2, sáu cột và trạng thái lượt cũ. HTML đã kiểm: `06baa28ffff7e09f1edc230746e2872f62c550dc4a759b489813810ba02c2de6`; bốn ảnh tổng hợp ở 900/1280 chỉ dùng kiểm bố cục.

Kiểm thử cục bộ trên Node24.15.0/Python3.14.3: unit TS51/51; integration21 PASS +1 skip đã có; UI JSDOM61/61; Python flow111 chạy, OK với3 skip đã có; bridge30/30; typecheck PASS. Suite capture17/17 nằm trong51 unit, không cộng lặp. Các kiểm thử dùng producer manifest/evidence thật với nguồn tổng hợp; integration bridge chạy API → CLI → reader, chỉ thay OS viewer. Hai sửa sort có kiểm thử hành vi sau sửa; không tuyên bố có baseline-red trên bản trước sửa vì không có snapshot phù hợp lúc harness hoàn tất.

Chưa xác minh DOM/nhãn/ID và ảnh Metric hiện tại bằng lượt thật, hoặc thao tác native Windows. Không dùng các kết quả tổng hợp này thay nghiệm thu nguồn thật. Những phần đó cần quyền riêng; không mở rộng alias, phân trang, framework hoặc edge case để lấp giới hạn này.

# Independent cold review — GPT-6-astra

2026-10-08. The reviewer received only the numbered inputs retained in
`blind-inputs/`, with no conversation history, repository or Ultimate text.
Retained inputs have trailing whitespace normalized only. Mapping disclosed after review: 1=E12, 2=E13, 3=E4, 4=L10, 5=UNKNOWN.
The redundant minimum count on the fixed AI label was removed after the original
input preparation; the reviewer was told this and correctly described exactly
one label. Sources and rule IDs were masked; descriptive vocabulary remained.
The fifth input was reviewed in a separate follow-up. The following are the
reviewer's returned descriptions and limitations, retained verbatim.
**reviewed by model, not by a domain expert**. Status remains proposed.

## Shape 1

Áp dụng cho các nút thuộc lớp `ex:MaskedFigure`. Mỗi nút phải có:

- Ít nhất một giá trị cho từng trường `attribution`, `file`, `sheet`, `row`. Mọi giá trị của các trường này phải là chuỗi `xsd:string` dài ít nhất một ký tự.
- Đúng một `valueStatus`, với một trong ba giá trị chính xác: `ước tính`, `sơ bộ`, `chính thức`.

Không có nhánh thay thế để bỏ qua bất kỳ trường bắt buộc nào. Bốn trường đầu được phép có nhiều giá trị; chuỗi chỉ chứa khoảng trắng vẫn đạt điều kiện độ dài.

Shape chỉ kiểm tra siêu dữ liệu được khai báo. Nó không xác minh nguồn có tồn tại, file/sheet/dòng có truy cập được hoặc trỏ đúng dữ liệu, nội dung ghi nguồn có chính xác, hay trạng thái số liệu có căn cứ. Nó cũng không yêu cầu hoặc kiểm tra giá trị số, đơn vị, thời kỳ hoặc phạm vi của số liệu.

## Shape 2

Nội dung ràng buộc giống hoàn toàn Shape 1. Vì vậy, quy tắc, lựa chọn hợp lệ và giới hạn xác minh cũng giống Shape 1. Không thấy khác biệt hành vi giữa hai tệp.

## Shape 3

Áp dụng cho các nút thuộc lớp `ex:Persona`. Mỗi nút phải có ít nhất ba giá trị `card`. Mỗi thẻ phải có ít nhất một `quote` và một `locator`; mọi giá trị của hai trường này phải là chuỗi không rỗng.

Nếu có `attribute`, mỗi giá trị của trường đó cũng phải có `quote` và `locator` đáp ứng các điều kiện trên. Shape không bắt buộc chân dung phải có thuộc tính nào.

Mỗi chân dung phải có đúng một chuỗi `platform` không rỗng và đúng một `aiLabel` mang nguyên văn giá trị:

> Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật

Ngoài ra, phải thỏa một trong hai nhánh:

- Có ít nhất năm giá trị `author` khác nhau trong đồ thị, tất cả là chuỗi không rỗng, đồng thời không có giá trị `unverified`.
- Không có `author`; có giá trị `unverified` chính xác là `chưa xác minh là 5 người`; và có ít nhất năm giá trị `distinctContent` khác nhau trong đồ thị, tất cả là chuỗi không rỗng. Nhánh này không giới hạn số giá trị `unverified`, nên vẫn cho phép giá trị bổ sung bên cạnh cờ bắt buộc.

Các nhánh loại trừ nhau do điều kiện có/không có `author`. Nhánh đầu không cấm `distinctContent`.

“Khác nhau” ở đây là khác giá trị RDF được đếm, không phải xác minh người thật hoặc nội dung khác nhau về nghĩa. Shape không chứng minh năm mã tương ứng với năm người; không kiểm tra tác giả thực sự thuộc nền tảng đã khai báo; không buộc tác giả hoặc nội dung liên kết với các thẻ bằng chứng. Ba thẻ khác nút vẫn có thể chép cùng câu trích và locator.

Shape cũng không xác minh câu trích đúng nguyên văn, locator dẫn đến nguồn thật, nguồn là lời khách thật, hoặc thuộc tính chân dung được bằng chứng hỗ trợ. Nhãn AI chỉ được kiểm tra về sự hiện diện và nội dung chính xác.

## Shape 4

Áp dụng cho các nút thuộc lớp `ex:Comment`. Mỗi bình luận phải có đúng một `sourceType`, với một trong hai giá trị chính xác:

- `bình luận dưới video review`
- `bình luận dưới video bán hàng`

Mỗi trường `creator`, `brand`, `tagOnly`, `emojiOnly`, `customerVoice`, `counted` phải có đúng một giá trị kiểu `xsd:boolean`.

Bốn shape phụ áp dụng độc lập: nếu bất kỳ cờ nào trong `creator`, `brand`, `tagOnly`, `emojiOnly` là `true`, cả `customerVoice` và `counted` đều phải là `false`. Với từng cờ, nhánh thay thế là cờ đó mang giá trị `false`, khi đó shape phụ tương ứng không đặt thêm điều kiện lên hai trường kết quả.

Nếu cả bốn cờ đều là `false`, mọi tổ hợp boolean của `customerVoice` và `counted` đều được phép. Do đó, shape cho phép cả trường hợp `counted=true` nhưng `customerVoice=false`; không có quy tắc bắt buộc hai trường này tương đương hoặc bắt buộc bình luận đủ điều kiện phải được đếm.

Shape kiểm tra tính nhất quán giữa các nhãn đã khai báo. Nó không đọc nội dung để xác minh bình luận chỉ chứa tag/emoji, không xác minh người viết là creator/thương hiệu/khách hàng, không kiểm tra video thực sự thuộc loại nguồn đã khai báo và không kiểm tra tổng số bình luận đã đếm.

Cả bốn tệp đều không dùng ràng buộc đóng: các thuộc tính bổ sung được phép tồn tại. Việc một nút không thuộc lớp đích có được kiểm tra hay không nằm ngoài phạm vi ràng buộc thể hiện trong các tệp này.

## Shape 5

Áp dụng cho các nút thuộc lớp `ex:UnknownRecord`. Mỗi nút phải có:

- Đúng một giá trị `inWide`, chính xác là boolean `false`.
- Đúng một giá trị `inAll`, chính xác là boolean `true`.

`sh:hasValue` bắt buộc giá trị phải hiện diện; kết hợp `sh:maxCount 1` tạo yêu cầu đúng một giá trị. Không có nhánh thay thế và không cho phép thiếu hai trường này.

`ex:status "proposed"` là siêu dữ liệu tùy chỉnh trên shape, không phải điều kiện SHACL làm ngừng hoặc trì hoãn kiểm tra. Nếu validator nạp shape, các ràng buộc vẫn áp dụng.

Shape chỉ kiểm tra hai cờ được khai báo. Nó không xác minh bản ghi thực sự đã bị loại khỏi tập WIDE, được giữ trong tập ALL, hoặc được đưa vào quy trình kiểm tra. Nó không xác định bản ghi nào phải được phân loại `UnknownRecord`, cũng không chứng minh chính sách đã được người có thẩm quyền chốt. Cụm “theo chính sách đã chốt” chỉ nằm trong thông báo lỗi.

Các thuộc tính bổ sung vẫn được phép tồn tại.

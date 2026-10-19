# Hướng dẫn sử dụng báo cáo Thị trường (Market) tự động

Mục đích: giúp chủ sở hữu (owner) tạo một báo cáo Thị trường, theo dõi tiến trình, đọc PDF và xử lý các tình huống thường gặp, bằng lời đơn giản.

Cập nhật: 20/10/2026 · Commit chính: `e9e0f444`

## Mục lục

- Phần 1. Báo cáo Thị trường là gì và hệ thống làm gì thay bạn
- Phần 2. Tạo một báo cáo mới
- Phần 3. Theo dõi tiến trình (không có phần trăm)
- Phần 4. Duyệt phạm vi và đọc kết quả
- Phần 5. Cách đọc bản PDF
- Phần 6. 14 quy tắc đảm bảo điều gì
- Phần 7. Tình huống thường gặp và cách xử lý
- Phần 8. Giải thích thuật ngữ

---

## Phần 1. Báo cáo Thị trường là gì và hệ thống làm gì thay bạn

Báo cáo Thị trường trả lời câu hỏi: "Thị trường Việt Nam của sản phẩm hoặc ngành này đang như thế nào, và nên làm gì tiếp?". Báo cáo dựa trên dữ liệu thật được thu thập tự động từ nhiều nguồn (số liệu bán hàng trên Shopee và TikTok Shop, video và quảng cáo, mức độ quan tâm tìm kiếm, số liệu thống kê chính thức, v.v.).

Những điều cần biết trước khi dùng:

- Thị trường cố định là Việt Nam. Kỳ nghiên cứu mặc định là 365 ngày (nguồn: `docs/research-automation/README.md`).
- Báo cáo Thị trường và báo cáo Insight là hai báo cáo riêng, mỗi báo cáo có bản web và bản PDF riêng. Hiện báo cáo Insight đang tạm dừng theo quyết định của chủ sở hữu ngày 19/10, nên hướng dẫn này chỉ nói về báo cáo Thị trường.
- Việc thu thập dữ liệu chạy hoàn toàn tự động. Bạn không phải tự tải file hay chép số liệu.
- Chỉ xem hoặc gõ trong ô nhập thì chưa gọi nguồn dữ liệu nào và chưa tốn tiền. Hệ thống chỉ bắt đầu thu thập sau khi bạn bấm nút bắt đầu và duyệt phạm vi.
- Báo cáo giao cho khách không bao giờ ghi tên nhà cung cấp dữ liệu hay tên công cụ. Các tên đó chỉ xuất hiện trong ứng dụng quản lý nội bộ của bạn (bảng "Nguồn dữ liệu"), nơi bạn cần biết nguồn nào đang gặp sự cố.
- Báo cáo ra là bản nháp, chưa duyệt. Nhãn "Bản nháp, chưa duyệt" hiện trên thẻ báo cáo cho tới khi chủ sở hữu quyết định.

## Phần 2. Tạo một báo cáo mới

Trong ứng dụng quản lý, vào trang nghiên cứu của thị trường (đường dẫn dạng `#/markets/<mã thị trường>/research`). Màn hình có 3 bước ở bên trái; bên phải luôn có khung "Hệ thống đã hiểu" cho bạn kiểm tra lại những gì đã nhập.

**Mở khóa quyền chủ sở hữu.** Muốn bấm bắt đầu, bạn cần mở khóa OWNER ở đầu trang (dùng token chủ sở hữu do quản trị viên cấp). Nếu quản trị viên chưa bật quyền ghi, màn hình ghi rõ lý do và bạn vẫn xem được dữ liệu. Sau khi quản trị viên bật, bấm "Kiểm tra quyền lại" ở thanh trên cùng. Chế độ demo không gửi yêu cầu và không tạo kết quả giả.

**Bước 1. Từ khóa.** Câu hỏi: "Bạn muốn nghiên cứu gì?". Gõ một ngành, một loại sản phẩm hoặc tên sản phẩm. Có hai chế độ:

- "Sản phẩm cụ thể": bạn đã có sản phẩm trong đầu. Mô tả sản phẩm ở ô bên dưới (tên, dạng, dành cho ai, giá; càng rõ càng khớp). Không cần phỏng vấn, hệ thống tìm sản phẩm thật giống mô tả để bạn chọn.
- "Khám phá ngành": bạn muốn tìm hiểu cả ngành. Hệ thống hỏi vài câu ngắn ở bước 2.

Nếu bạn dán vào ô từ khóa một đoạn mô tả dài, hệ thống tự tách: tên sản phẩm thành từ khóa, cả đoạn thành mô tả, và chuyển sang "Sản phẩm cụ thể". Có nút "Hoàn tác" nếu bạn không muốn tách.

**Bước 2. Phỏng vấn (chỉ khi chọn "Khám phá ngành").** Mỗi câu đều có nút "Không biết". Câu trả lời chỉ ghi lại bối cảnh bạn cung cấp. Phần bạn chưa biết sẽ không bị tự điền, và nguồn thực tế vẫn có thể chưa đủ dữ liệu.

**Bước 3. Kỳ và báo cáo.**

- "Chọn nhanh kỳ nghiên cứu": mặc định là 365 ngày; có thể chọn kỳ khác hoặc tự đặt "Từ ngày" và "Đến ngày". Hệ thống hiện số ngày (tính cả ngày đầu và cuối). Kỳ đã chọn được giữ nguyên cho cả phiên; muốn đổi kỳ phải tạo phiên mới.
- "Báo cáo cần soạn": "Cả hai", "Chỉ Thị trường" hoặc "Chỉ Insight". Với báo cáo Thị trường, chọn "Chỉ Thị trường" (hoặc "Cả hai", nhưng phần Insight hiện đang tạm dừng).
- Bấm "Bắt đầu tìm nhanh". Nếu mạng chập chờn, bạn có thể bấm lại: hệ thống dùng lại cùng mã yêu cầu nên không tạo phiên trùng.

Nếu có lỗi khi gửi, màn hình báo bằng lời thường: token hết hạn (mở khóa lại), trùng với một phiên khác (xem lịch sử nghiên cứu), hoặc máy chủ không nhận (kiểm tra từ khóa, kỳ, báo cáo đã chọn).

## Phần 3. Theo dõi tiến trình (không có phần trăm)

Sau khi bấm bắt đầu, trang tự chuyển sang "Phiên nghiên cứu" và tự cập nhật. Bạn có thể rời trang và quay lại sau bằng cùng đường dẫn; phiên chạy nền trên máy chủ.

Hệ thống cố ý không hiện phần trăm hoàn thành, vì thời gian mỗi nguồn rất khác nhau. Thay vào đó bạn thấy:

- Các bước lớn: Từ khóa, Phỏng vấn, Kỳ và báo cáo, Tìm nhanh, Chọn thẻ và phạm vi, Thu thập và báo cáo.
- Danh sách "Tiến độ các bước" của máy chủ: Tìm nhanh, Thu thập, Báo cáo, mỗi bước có trạng thái riêng.
- Bảng "Độ phủ dữ liệu": mỗi nguồn đã lấy được kỳ nào (kỳ quan sát), có bị cắt kết quả không.
- Khung "Chi phí và lượt gọi": số lượt gọi nguồn và chi phí đã biết. Nếu chưa có số liệu thì nghĩa là nguồn chưa báo, không phải bằng 0.
- "Phần chưa thể hoàn thành": những phần thiếu dữ liệu, kèm lý do. Hệ thống không lấp chỗ trống bằng số giả.

Với phiên tự chạy (auto-run) của báo cáo Thị trường, thẻ "tự động" cho biết phiên đang ở giai đoạn nào trong chuỗi: chờ duyệt phạm vi, thu thập, chuẩn bị, chọn sản phẩm, xác nhận, chờ bản nháp, trình bày kết quả, xong hoặc đã dừng. Nếu dừng, thẻ ghi lý do bằng lời thường và (khi lỗi thuộc loại thu thập) có nút "Thử lại".

Khi cần, bạn bấm "Hủy phiên nghiên cứu". Hệ thống dừng các bước còn lại; dữ liệu và chi phí đã phát sinh vẫn được ghi lại. Muốn chạy lại phải tạo phiên mới.

## Phần 4. Duyệt phạm vi và đọc kết quả

**Duyệt phạm vi.** Sau bước tìm nhanh, hệ thống đưa ra các thẻ sản phẩm thật để bạn chọn, kèm phạm vi sẽ thu thập. Bạn kiểm tra lại từ khóa, kỳ và loại báo cáo rồi xác nhận. Chỉ sau khi bạn xác nhận hệ thống mới thu thập đầy đủ (và có thể phát sinh chi phí ở các nguồn trả phí). Với phiên tự chạy, nhiều thao tác trung gian (chọn liên kết sản phẩm, xác nhận nguồn) được hệ thống tự suy ra từ dữ liệu của phiên, không cần bạn gõ tay.

**Khi bản nháp sẵn sàng.** Trạng thái chuyển sang có bản nháp. Mục "Báo cáo" hiện thẻ "Báo cáo Thị trường" với:

- "Mở bản web": mở bản đọc trong tab mới.
- "Tải PDF": tải bản PDF. Nếu chưa có, màn hình ghi lý do (ví dụ chưa có trình in PDF), kèm "Chi tiết kỹ thuật" để gửi cho quản trị viên.
- Bản web và PDF lấy từ đúng một phiên bản đã lưu. Xuất PDF không chạy lại AI.

**Đính kèm PDF của bạn.** Mục "Đính kèm PDF cho phiên này" cho phép gắn thêm tài liệu PDF (tối đa 32 MiB) khi phiên đang chờ duyệt phạm vi hoặc đã có bản nháp. Tệp có thể được gửi đi lập chỉ mục và phát sinh chi phí nếu kết nối đang bật. Chỉ những trích dẫn đã kiểm chứng mới được lưu; báo cáo đã có không tự thay đổi.

**Các phiên bản.** Mỗi lần xây lại báo cáo tạo một phiên bản mới, bất biến; có thể có tối đa một quyết định của chủ sở hữu cho mỗi phiên bản. Phiên bản cũ chưa được quyết định sẽ bị phiên bản mới hơn thay thế.

## Phần 5. Cách đọc bản PDF

Bản PDF là sản phẩm chính, được thiết kế cho người không chuyên đọc:

1. **Trang bìa.** Có ảnh bìa minh họa chung cho từ khóa. Ảnh bìa chỉ mang tính minh họa, được tạo bằng AI và có chú thích mô tả ảnh; báo cáo không tuyên bố ảnh có bản quyền riêng.
2. **12 phần đánh số "Phần 1" đến "Phần 12" và một "Phụ lục".** Mỗi phần có tiêu đề bằng tiếng Việt dễ hiểu, không hiện mã kỹ thuật.
3. **Bảng và biểu đồ** có nhãn "PL.x" cho bảng trong phụ lục. Biểu đồ luôn ghi rõ nền tảng (Shopee hay TikTok Shop) bằng chữ và biểu tượng.
4. **Mẫu số liệu "n = ...".** Mỗi con số tổng hợp ghi số mẫu đã dùng. Hãy đọc số mẫu trước khi tin một tỷ lệ.
5. **Dòng "Chú thích:".** Ghi chú nguồn và giới hạn nằm trên dòng riêng, bắt đầu bằng "Chú thích:", không trộn vào đoạn văn.
6. **Phần "Đề xuất".** Các lựa chọn hành động (ba phương án và bảng việc làm ngay) đều mang nhãn "đề xuất", có người phụ trách và hạn dạng ngày/tháng/năm. Đây là gợi ý chờ bạn duyệt, không phải quyết định đã chốt.
7. **Bảng chú giải thuật ngữ** bằng tiếng Việt đơn giản.
8. **Nguồn đánh giá Shopee.** Nếu có, báo cáo chỉ nêu số lượng và nhãn "review công khai trên Shopee" cùng mốc 300 đánh giá cho mỗi sản phẩm; báo cáo không trích nguyên văn bình luận và không lập bảng chủ đề từ bình luận.

Những điều báo cáo không bao giờ làm: cộng số liệu Shopee với TikTok Shop thành một tổng; cộng các đối tác thương mại với nhau; dùng số "tìm kiếm" như số lượng người mua; dùng số của Ngân hàng Thế giới như phép tính thị phần; gọi video của người bán là khách hàng hay tổng thị trường.

## Phần 6. 14 quy tắc đảm bảo điều gì

Trước khi một bản được coi là đạt, hệ thống tự kiểm 14 quy tắc (nguồn: `src/modules/analysis/research-automation/market-14-rules.ts`). Nói đơn giản:

- Quy tắc 1: có bảng chú giải thuật ngữ bằng tiếng Việt đơn giản.
- Quy tắc 2: các phần có nhãn "Phần n" và "Phụ lục"; bảng phụ lục có nhãn "PL.x"; không lộ mã kỹ thuật.
- Quy tắc 3: không lộ nội dung kỹ thuật (đường dẫn, mã nội bộ).
- Quy tắc 4: không hiện tên nhà cung cấp hay công cụ; riêng chữ "Google" cũng bị cấm xuất hiện trong báo cáo.
- Quy tắc 5: ghi chú nằm riêng một dòng "Chú thích:".
- Quy tắc 6: con số doanh thu, tỷ trọng, giá trung bình có chứng cứ đi kèm (quy tắc này do người rà soát xác nhận).
- Quy tắc 7: không cộng gộp hai nền tảng; luôn có câu nêu số mẫu "n = ..."; không nói "thị phần" hay "quy mô thị trường" bằng một con số cụ thể không có căn cứ.
- Quy tắc 8: nhận định theo nhóm, doanh thu, giá có chứng cứ (người rà soát xác nhận).
- Quy tắc 9: phần đề xuất có đúng ba phương án và một bảng việc làm ngay; mỗi dòng có người phụ trách, hạn dạng dd/mm/yyyy và nhãn chờ duyệt.
- Quy tắc 10: ảnh bìa nhúng sẵn trong báo cáo, không liên kết ra ngoài. Ảnh có bản quyền hoặc do chủ sở hữu cung cấp cần chủ sở hữu xem lại.
- Quy tắc 11: biểu tượng nền tảng đúng chỗ, biểu đồ hợp lệ và báo cáo có ít nhất 3 biểu đồ (cần xác nhận lại ngưỡng trong mã khi cập nhật).
- Quy tắc 12: mọi bảng theo nền tảng đều ghi rõ nền tảng nào.
- Quy tắc 13: đủ bốn loại nguồn trung tính (số liệu bán hàng, dữ liệu đánh giá, kết quả tìm kiếm, bình luận đã thu), không nêu tên nhà cung cấp.
- Quy tắc 14: phần đánh giá và bình luận có chứng cứ về mẫu (người rà soát xác nhận).

Quy tắc 6, 8 và 14 là quy tắc "chứng cứ": máy chỉ kiểm tra có nội dung liên quan, còn việc đọc và xác nhận là của người rà soát. Quy tắc 10 vừa có phần máy kiểm vừa có phần cần người xem.

Ngoài 14 quy tắc, hệ thống còn một "cổng kinh doanh" kiểm các điều như: không lộ tên nhà cung cấp, không cộng nền tảng, không có số mơ hồ do cộng một phần thiếu, không lộ nội dung rò rỉ nội bộ, không dùng số tìm kiếm như số đếm. Với phiên tự chạy, sau khi có bản nháp hệ thống luôn dựng thêm một bản trình bày lại (bản v2) và chạy các kiểm tra này trên bản đó. Nếu bản v2 trượt, phiên dừng và báo lý do (xem Phần 7); hệ thống không tự sửa rồi thử lại.

## Phần 7. Tình huống thường gặp và cách xử lý

| Tình huống | Bạn thấy gì | Bạn nên làm |
| --- | --- | --- |
| Nguồn hết số dư (credit) | Phần chưa hoàn thành ghi nguồn tạm dừng hoặc hết số dư; bảng "Nguồn dữ liệu" báo | Nạp thêm số dư cho nguồn đó (quyết định của bạn), rồi tạo phiên mới hoặc bấm "Thử lại" nếu có |
| Cần đăng nhập hoặc gặp captcha ở trang nguồn | Phiên dừng, thẻ ghi cần đăng nhập hoặc xác minh | Chờ người phụ trách kỹ thuật xử lý rồi bấm "Thử lại". Hệ thống không tự vượt captcha |
| Dữ liệu chỉ có một phần | Mục "Độ phủ dữ liệu" ghi nguồn bị cắt hoặc kỳ quan sát ngắn hơn | Đọc báo cáo kèm giới hạn đã ghi. Phần thiếu được ghi rõ lý do, không điền số giả |
| PDF chưa xuất được | Thẻ báo cáo ghi "PDF chưa xuất được" kèm lý do | Gửi "Chi tiết kỹ thuật" cho quản trị viên; bản web vẫn dùng được |
| Dịch vụ lập chỉ mục PDF tạm dừng | Thông báo "Đã tạm dừng gửi PDF mới" (hết số dư, đang tắt hoặc số dư thấp) | Nạp số dư hoặc đợi quản trị viên bật lại; PDF đã lưu không bị ảnh hưởng |
| Đã bấm bắt đầu nhưng mạng lỗi | Thông báo chưa gửi được | Bấm lại; không tạo phiên trùng. Có thể xem lịch sử nghiên cứu để chắc chắn |
| Phiên báo "Bị gián đoạn" (máy chủ khởi động lại giữa chừng) | Mục "Việc cần làm" liệt kê phần lỗi, dữ liệu còn dùng được, bước tiếp theo | Làm theo mục "Việc cần làm". Hệ thống không tự gọi lại một yêu cầu trả phí chưa rõ kết quả, để tránh tính tiền hai lần |
| Bản trình bày lại (v2) trượt kiểm tra | Phiên dừng, thẻ ghi trình bày kết quả không đạt | Báo quản trị viên. Việc sửa được thực hiện trong mã để áp dụng cho mọi báo cáo, không sửa tay từng báo cáo |

Nguyên tắc chung: hệ thống không bao giờ nhờ bạn tự thu thập dữ liệu bằng tay. Nếu bước nào cần người, đó là việc của người vận hành kỹ thuật (đăng nhập, nạp số dư, bật cấu hình), không phải việc sao chép số liệu.

## Phần 8. Giải thích thuật ngữ

- **Phiên nghiên cứu (run):** một lần chạy trọn vẹn từ lúc bạn bấm bắt đầu đến lúc có báo cáo.
- **Tìm nhanh:** bước đầu, hệ thống tìm vài sản phẩm thật khớp từ khóa để bạn chọn.
- **Phạm vi:** những sản phẩm, nguồn và kỳ sẽ được thu thập.
- **Duyệt phạm vi:** bước bạn xác nhận trước khi hệ thống thu thập đầy đủ.
- **Nguồn dữ liệu:** nơi lấy số liệu (sàn bán hàng, nền tảng video, tìm kiếm, thống kê chính thức, tài liệu PDF).
- **Độ phủ dữ liệu:** nguồn nào đã lấy được kỳ nào, có thiếu hay bị cắt không.
- **Kỳ quan sát:** khoảng thời gian dữ liệu thực tế của một nguồn; có thể ngắn hơn kỳ bạn yêu cầu.
- **Bản nháp, chưa duyệt:** báo cáo máy tạo, chờ chủ sở hữu quyết định.
- **Phiên bản (revision):** một lần xây lại báo cáo; bất biến, không bị sửa đè.
- **Cổng kinh doanh:** bộ kiểm tra tự động các lỗi nghiêm trọng về nội dung (lộ tên nhà cung cấp, cộng nền tảng, v.v.).
- **14 quy tắc:** danh sách kiểm định dạng và nội dung của báo cáo Thị trường (Phần 6).
- **Mẫu (n):** số quan sát dùng để tính một con số. n nhỏ thì kết luận kém chắc chắn.
- **Đề xuất:** gợi ý hành động của hệ thống, chờ bạn duyệt; không phải quyết định.
- **Chú thích:** dòng ghi nguồn và giới hạn đặt riêng một dòng.
- **Số tìm kiếm / mức độ quan tâm:** thước đo mức quan tâm trên công cụ tìm kiếm, không phải số người mua.
- **Review công khai trên Shopee:** đánh giá hiển thị công khai trên sản phẩm; báo cáo chỉ đếm và nêu mốc 300, không trích nguyên văn.
- **Token chủ sở hữu:** chìa khóa để mở quyền ghi; không chia sẻ cho người khác.
- **Lập chỉ mục PDF:** bước dịch vụ bên ngoài đọc và đánh chỉ mục tài liệu PDF để trích dẫn có kiểm chứng; có thể tốn tiền.
- **Bộ persona tổng hợp:** bộ mô tả nhóm người dùng dựng từ dữ liệu tổng hợp; chỉ dùng làm gợi ý bối cảnh và không được nêu tên nguồn trong báo cáo (kế hoạch, chưa bật trong báo cáo Thị trường, cần xác nhận).

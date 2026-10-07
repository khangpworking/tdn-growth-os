# Nhật ký thay đổi business rule (Ultimate Method)

File này ghi **mọi thay đổi business rule** của [Ultimate Method](ultimate-method-30-sections.md): đổi gì, vì sao, ai quyết, và đã vào TDN chưa. Lịch sử từng dòng chữ xem trên GitHub: [lịch sử commit của file Ultimate](https://github.com/khangpworking/tdn-growth-os/commits/main/docs/research/ultimate-method/ultimate-method-30-sections.md).

## Cách ghi

- Mỗi thay đổi business rule là **một dòng** trong bảng, thêm vào **cùng commit** với thay đổi trong file Ultimate.
- Mỗi dòng có:
  - **Mã** dạng `BR-YYYYMMDD-nn`;
  - **phiên bản** Ultimate;
  - **section** bị ảnh hưởng;
  - **nội dung** đổi;
  - **căn cứ**: ai quyết, ở đâu, kèm lời chủ nếu có. Lời chủ trích ngắn, không ghi thông tin cá nhân hay đường dẫn máy;
  - **TDN**: `Chưa đồng bộ` / `Đang làm (gói …)` / `Đã đồng bộ (PR …)`.
- Commit đổi business rule bắt đầu bằng `business-rule:`.
- Chỉ ghi quyết định đã có. Đề xuất chưa được chủ đồng ý thì không ghi vào đây và không sửa file Ultimate.
- Khi một dòng đã vào TDN, chỉ sửa cột **TDN** của dòng đó; không sửa nội dung cũ. Muốn đổi lại quyết định thì thêm dòng mới.

## Nhật ký

Dòng mới nhất ở trên cùng.

| Mã | Ngày | Phiên bản | Section | Thay đổi | Căn cứ | TDN |
|---|---|---|---|---|---|---|
| BR-20261007-16 | 07/10/2026 | 1.3 | Thu review (mục 6.3) | Ngưỡng chất lượng cho lần thu review mở rộng, kèm căn cứ từng con số | Chủ đồng ý ngưỡng ở Bảng 15.2 của báo cáo thạch dừa và yêu cầu ghi căn cứ cho các con số | Không cần code; áp khi lập kế hoạch thu |
| BR-20261007-15 | 07/10/2026 | 1.3 | M11, I14, I15 | Không xếp ưu tiên giữa các hướng, phương án; chỉ liệt kê | Chủ chọn phương án (a) | Đã đúng với TDN hiện tại |
| BR-20261007-14 | 07/10/2026 | 1.3 | I11 | Nhóm mặc định để so: theo sàn; theo khách mua lẻ và mua sỉ | Chủ: "làm theo đề xuất" | Chưa đồng bộ |
| BR-20261007-13 | 07/10/2026 | 1.3 | Toàn bộ; M07, I13, quy tắc 4, quy tắc 8, M08 | **E11**: báo cáo chạy theo quy tắc mặc định, không chờ chủ nhập liệu. Tập đối thủ lấy từ dữ liệu bán hàng (thương hiệu đứng đầu tới ≥50% doanh thu nhóm). Cách thực hiện do Claude đề xuất để chủ xác nhận: mẫu số = toàn bộ tập mẫu đã chốt; bộ mã kiểm chéo bằng model thứ hai (κ ≥ 0,6); hàng bán theo khối lượng dùng khối lượng tịnh | Chủ: "chủ có tham gia làm báo cáo hay có gì để input vào báo cáo đâu mà có phần chủ quyết"; "danh sách đối thủ thì lấy từ metric, kalodata chứ cần gì tôi chọn nữa" | Chưa đồng bộ |
| BR-20261007-12 | 07/10/2026 | 1.3 | M05 (và M01, M11) | **E10**: doanh số là thước đo nhu cầu trong mẫu; mức quan tâm tìm kiếm ghi riêng | Chủ: "cho phép doanh số là nhu cầu" | Chưa đồng bộ |
| BR-20261007-11 | 07/10/2026 | 1.2 | Toàn bộ | Có nhật ký thay đổi business rule này | Chủ: "tôi muốn chúng ta có log cập nhật business rule của file ultimate trên github" | Không cần |
| BR-20261007-10 | 07/10/2026 | 1.2 | M08 | Giá theo **đơn vị chuẩn** của từng ngành hàng: khối lượng (giá/100 g, tách khối lượng tịnh và khối lượng cái), thể tích (giá/100 ml), số lượng (giá/đơn vị), hàng dùng lâu (giá/cái trong cùng nhóm quy cách), combo (giá/combo). Ngoại lệ **E9**: được so cạnh nhau và sắp xếp khi cùng đơn vị chuẩn, cùng loại giá, cùng kỳ; không kết luận "rẻ nhất / tốt nhất" | Chủ hỏi cách tính cho sản phẩm không bán theo gram; Claude đề xuất bảng đơn vị chuẩn; chủ đồng ý: "chỉ được so khi cùng đơn vị chuẩn, cùng loại giá, cùng kỳ, và chỉ 'sắp xếp', không kết luận 'rẻ nhất / tốt nhất'" | Chưa đồng bộ. Code đã có phép tính 100g nhưng chưa theo bảng đơn vị chuẩn và E9 |
| BR-20261007-09 | 07/10/2026 | 1.1 | Toàn bộ; I02 | Business rule của Ultimate là **nguồn chuẩn**; recipe, cấu hình và code TDN phải theo. I02 cho dựng chân dung theo E4 | Chủ: "cho dựng chân dung, ngoài ra business rule của file ultimate là source of truth" | Chưa đồng bộ (recipe I02, quyết định D06) |
| BR-20261007-08 | 07/10/2026 | 1.1 | Insight (mục 6) | Danh mục nguồn cho Insight theo ba loại tiếng nói; bảng 10 câu hỏi khi đọc video bán hàng | Chủ đề xuất dùng công cụ đọc video kết hợp số liệu video, và thêm dữ liệu Facebook/Instagram | Chưa đồng bộ. Gói P4, P5, P7, P8 có một phần; đọc video, bình luận video, thư viện quảng cáo chưa có gói (đề xuất P9) |
| BR-20261007-07 | 07/10/2026 | 1.1 | Thu review | **E8**: thu review mở rộng không đặt trần chi phí, dừng khi đạt ngưỡng chất lượng; mỗi lần chi thật vẫn báo trước | Chủ: "không có giới hạn trần, miễn là chất lượng báo cáo đạt quality" | Không cần code; áp khi lập kế hoạch thu |
| BR-20261007-06 | 07/10/2026 | 1.1 | I01 | **E7**: được dùng "câu hỏi làm việc do AI đề xuất, chờ chủ duyệt" khi chủ chưa viết câu hỏi | Chủ yêu cầu tạo bản Ultimate mới theo nội dung đã thảo luận, trong đó có đề xuất này | Chưa đồng bộ |
| BR-20261007-05 | 07/10/2026 | 1.1 | Kết luận Insight; I15 | **E6**: Insight có Kết luận chính theo E3; Phần 15 có tối đa 3 đề xuất, người phụ trách, hạn chót theo E2 | Chủ duyệt đề xuất sửa báo cáo insight thạch dừa theo chuẩn báo cáo thị trường | Chưa đồng bộ (chưa có mẫu bản đọc Insight trong app) |
| BR-20261007-04 | 07/10/2026 | 1.1 | I02; I13 | **E5**: chân dung người bán nhắm tới, có số liệu thị trường củng cố. Bốn phép kiểm, tín hiệu từ ≥2 nền tảng, đo tỷ lệ khớp n/N. Tham số mặc định chủ chỉnh được | Chủ: người bán đã nghiên cứu khách nên phần lớn nhắm đúng; dùng số liệu video, doanh thu, chi quảng cáo và dữ liệu Facebook/Instagram để củng cố | Chưa đồng bộ |
| BR-20261007-03 | 07/10/2026 | 1.1 | I02 | **E4**: chân dung khách hàng do AI tổng hợp, có thẻ bằng chứng (≥3 thẻ, ≥5 người viết, mỗi đặc điểm có câu trích) | Chủ cho phép chân dung "miễn là có thẻ bằng chứng" ([khangpworking/tdn-growth-os#124](https://github.com/khangpworking/tdn-growth-os/issues/124)); chủ yêu cầu dựng chân dung trong báo cáo insight thạch dừa | Đang làm (gói P7, cho dữ liệu mạng xã hội) |
| BR-20261007-02 | 07/10/2026 | 1.1 | Quy tắc chung; I01–I17 | Ba loại tiếng nói (khách, người bán, thị trường); làm rõ **L1–L7** khi áp quy tắc chung cho Insight; cập nhật từng section Insight | Rút từ lần review báo cáo insight thạch dừa; chủ yêu cầu đưa nội dung thảo luận vào bản Ultimate mới | Chưa đồng bộ |
| BR-20261007-01 | 07/10/2026 | 1.1 | Toàn bộ | Đưa Ultimate vào repo làm nguồn chuẩn, bỏ đường dẫn máy cá nhân; thêm README so sánh nghiệp vụ Ultimate và phần TDN đang áp dụng | Chủ: "tạo file method ultimate mới… đẩy lên github để làm source of truth" | Không cần |
| BR-20261005-01 | 05/10/2026 | 1.0 | M06, M07, M08, M09, M10, M11; M01, M12 | Hợp nhất A40, A41 và điều chỉnh 02/10. Cập nhật 05/10 cho M06–M11. Ngoại lệ **E1** (ROAS/CPA tham khảo), **E2** (khuyến nghị Phần 12), **E3** (kết luận Phần 1) | Chủ duyệt trong phiên nghiệp vụ ngày 05/10/2026 (ngoài repo) | Chưa đồng bộ (xem mục 5 của README) |

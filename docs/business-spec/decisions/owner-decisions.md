# Quyết định của chủ (nghiệp vụ)

> Phiên bản 1.1, ngày 21/10/2026. Thư mục gốc: [business-spec](../README.md).

Mỗi dòng là một quyết định của chủ về nghiệp vụ. Dòng mới nhất nằm trên cùng. Cột "Áp dụng" nêu mã quy tắc. Tài liệu này không ghi quyết định về công cụ, hạ tầng hay cách làm việc của các agent.

| Ngày | Quyết định | Áp dụng |
| --- | --- | --- |
| 21/10/2026 | Chủ cho phép sửa, gom, thêm, xóa section Insight cho khớp phương pháp insight đã nghiên cứu (F74). Kết quả: gộp I06 vào I04, I12 vào I13, thêm I18 "Xung đột và câu insight", "Kết luận chính" thành "Insight chính". Ngưỡng R-I29 là ngưỡng tạm, chờ chủ chốt. | [insight.md mục 8–9](../business-rules/insight.md), R-I29 đến R-I35 |
| 21/10/2026 | Báo cáo Market tự động quy về một đơn vị trước khi so, cho mọi ngành hàng (F66). Làm theo cách đơn giản (F67): doanh thu giữ vì là tiền; không cộng số lượng bán giữa các sản phẩm; chỉ so đơn giá trong một đơn vị chuẩn; đọc quy cách từ tên chỉ khi tên có đúng một quy cách, gắn nhãn "quy cách theo tên sản phẩm"; còn lại ghi "chưa quy đổi được". | R-M27 đến R-M32, R-I14 đến R-I19 |
| 21/10/2026 | Hoãn tài liệu số đo của nguồn (F58). Chưa viết, chưa sửa Ultimate. | [source-methods.md](../semantic-layer/source-methods.md) |
| 20/10/2026 | Cần tài khoản quảng cáo Facebook và TikTok để có số "nhóm quan tâm" thật (F29). Đến lúc đó cột này ghi "Chưa có số". | R-I28 |
| 20/10/2026 | Thẻ nhân khẩu ở I02 có ba loại số: cả dân số, nhóm quan tâm, lời khách (F22 đến F25). Dân số mô phỏng chỉ làm mốc "toàn dân", không nêu tên nguồn trong báo cáo. | R-I28, R-L01 |
| 20/10/2026 | Làm từ điển chỉ số (semantic layer): mỗi con số có một định nghĩa chung và ghi cách đo của từng nguồn. Không so hoặc cộng hai cách đo khác nhau (F14, F16). | R-L10, [metrics.md](../semantic-layer/metrics.md) |
| 20/10/2026 | Quy tắc đơn vị dùng cho mọi ngành hàng, không riêng thạch dừa (F11, F12). | R-I14 đến R-I18 |
| 20/10/2026 | Insight không làm insight cảm xúc hay sáng tạo về quảng cáo, vì hệ thống không làm được (F8). | R-L12, R-I22 |
| 20/10/2026 | Dữ liệu thô tới quyết định: nêu rõ dữ liệu thô mong đợi, cách xử lý, ví dụ báo cáo và chiến lược hành động (F10). | R-I20 đến R-I24 |
| 20/10/2026 | Giữ tài liệu ở dạng .md, chưa đăng ra ngoài. File tham khảo đứng riêng (F4, F6). | [README](../README.md) |
| 20/10/2026 | Mỗi section Insight phải trả lời một câu hỏi cụ thể mà người không chuyên đọc được (F3). | [insight.md](../business-rules/insight.md) |
| 20/10/2026 | Dùng "toàn dân" làm mốc so, không nêu tên nguồn dữ liệu mô phỏng. | R-I28, R-L01 |
| 19/10/2026 | Bình luận gốc phải được mã hóa. Không hiện bình luận gốc trong báo cáo. Chọn phương án A: bỏ nguồn S2, Market chỉ dùng nguồn đếm được. | R-L11, R-I11 |
| 19/10/2026 | Sửa lỗi tự động phải áp dụng cho cả hệ thống, không chỉnh riêng cho một lần chạy. | R-M01 đến R-M14 |
| 17/10/2026 | Không bao giờ nhờ chủ thu mẫu bằng tay. | [market.md](../business-rules/market.md) |
| 17/10/2026 | Bỏ bình luận YouTube. | R-I13 |
| 17/10/2026 | Insight chờ Market đạt 14/14 rồi mới chạy. | [insight.md](../business-rules/insight.md) |
| 15/10/2026 | 14/14 phải đến từ luồng tự động và đều qua các lần sinh lại. Sửa tay chỉ để học, rồi đưa vào mã. | R-M01 đến R-M14 |
| 13/10/2026 | Không cần bằng chứng giấy phép ảnh bìa. | R-M10 |
| 12/10/2026 | Mọi báo cáo Market tự động được thử với đủ 14 quy tắc sửa tay, không chỉ 9 quy tắc của cổng. | R-M01 đến R-M26 |
| 12/10/2026 | Market chạy được trước Insight. | [insight.md](../business-rules/insight.md) |
| 11/10/2026 | Không có tổng giữa các sàn (U-32). | R-L04, R-M16 |
| 11/10/2026 | Hủy chạy chỉ là hủy: xóa dữ liệu dở, giữ một dòng nhật ký chi phí (U-26). | [market.md](../business-rules/market.md) |
| 11/10/2026 | Xếp hạng theo tần suất (chủ đề × khen/chê), một AI mã hóa; bước AI thứ hai kiểm chứng để sau (U-11). | R-I09, R-I10 |
| 11/10/2026 | U-40 làm cuối, chạy thử một trường hợp. | [market.md](../business-rules/market.md) |
| 11/10/2026 | Báo cáo là ranh giới sản phẩm: khối HTML đã lưu, qua Reader, ra PDF; không phải bảng điều khiển. Không hiện % tiến độ. | R-L16, R-L17 |
| 07/10/2026 | Chân dung khách do AI tổng hợp được phép nếu mỗi thuộc tính trích bằng chứng thật. | R-I25 đến R-I27, R-L15 |
| 05/10/2026 | Báo cáo được phép đề xuất. M12 có ba phương án, người phụ trách, hạn, nhãn "đề xuất, chờ chủ duyệt". Chủ bỏ ý "AI không chọn hành động". | R-M09, R-L14 |
| 05/10/2026 | Báo cáo không nêu tên nhà cung cấp dữ liệu. Tên sàn như Shopee thì được. Chú thích đặt ở dòng riêng. | R-L01, R-L02, R-M04, R-M15 |
# Change: review-labels-10

> Trạng thái: **chủ đã duyệt làm PR, chưa deploy, chưa gán lại nhãn cho dữ liệu cũ** (F442, 04/11/2026). Chủ chọn bộ nhãn qua F439, F440, F441.

## Why

Lần thử ngày 04/11 trên dữ liệu có sẵn cho thấy bộ nhãn cũ đếm quá tay. `T-CONGDUNG` được đếm 41,5% số đánh giá có chữ, trong khi hai người chấm theo định nghĩa mới chỉ thấy khoảng 17%. `T-CHATLUONG` được đếm 9,7%, chỉ thấy khoảng 1%. Câu hỏi lọc cũ cũng treo «Chưa rõ» ở lời «chưa dùng, chưa biết».

Bộ 10 nhãn mới và câu lọc mới đã qua thử bằng Jev. Dòng không có nhãn mà Jev vẫn gán là 1/77. Lời «chưa đánh giá được» bị tính thành kết quả là 0/56. Vẫn còn giới hạn: `T-MOTA` và `T-NIEMTIN` bắt được 0,66, dưới mức 0,80, và 5 nhãn chưa đủ ca để kết luận. Chủ đã biết các giới hạn này và vẫn chốt.

## What Changes

- **ADDED** vào capability `raw-db`: R-RV01 đến R-RV07.
- `tools/mcp-insight/data/insight-theme-codebook.json`: bản `2026-11-04.1`, 10 nhãn chung, không có khối.
- `src/modules/raw-db/review-labeller.ts`: nội dung Jev đọc mới, hướng dẫn chung, lựa chọn theo từng nhãn, cách tính mới.
- Migration `0073_raw_db_v1_review_code_choice.sql`: cột mới `review_code.choice`.
- `src/modules/raw-db/review-filter.ts`: câu hỏi lọc mới, policy `2026-11-04.2`, dòng chỉ có dấu câu là trống.
- `tools/mcp-insight/insight_tools.py`: nhận định dạng bộ nhãn mới; thiếu dòng bộ nhãn trong app thì là chưa gán nhãn, không phải lỗi.
- Cập nhật `tools/mcp-insight/CONTRACT.md` và `data/raw-sources/KHUON-CSDL.md`.

## Impact

- Dòng cũ trong `review_code` và `review_filter_assessment` không đổi. App không gọi Jev cho dữ liệu cũ, trừ khi có người chạy lệnh gán nhãn hoặc lọc không giới hạn lượt chạy.
- **Sau khi deploy:** Insight MCP chỉ đọc nhãn của bản bộ nhãn hiện tại. Sản phẩm cũ sẽ hiện «chưa gán nhãn» cho đến khi chủ cho gán lại. Ước tính 8 USD cho 1.399 đánh giá có chữ.
- Mỗi đánh giá mới tốn khoảng 6.300 token vào cho lượt gán nhãn 10 câu.
- Số đếm theo chủ đề của sản phẩm mới không so trực tiếp được với số của bản bộ nhãn cũ.

## Ngoài phạm vi

- Gán lại nhãn hoặc lọc lại dữ liệu cũ.
- Deploy.
- Loại thật khỏi số đếm. Bộ lọc vẫn chỉ ghi nhận.
- Hiện `choice` trên báo cáo hoặc MCP, và đếm `HAI` vào cả khen lẫn chê.
- Đổi trạng thái bộ nhãn sang `APPROVED`. Trạng thái này còn nghĩa là chủ đã xem mẫu.
- Sửa danh mục ý con (R-IM14) cho nhãn đã bỏ.
- Chọn sản phẩm lệch nhóm.

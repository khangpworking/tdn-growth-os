## Why

Chủ duyệt phương pháp mới cho báo cáo Insight trên trang «Output báo cáo Insight và phương pháp luận» (bản 9, ví dụ viên canxi). Ngày 22/10/2026 chủ viết: «Đọc xong rồi, không cần Astra kiểm lại, bản 9 dùng được.» (F117). Trước đó Astra 6 xhigh, đóng vai CEO hoài nghi, đã duyệt trang ở vòng 4, với điều kiện làm xong G5–G7 trước báo cáo thật (F111).

Ngày 25/10/2026 chủ yêu cầu: «đưa method Insight mới thành change OpenSpec» (F163). Spec `insight-report` hiện chỉ có R-I01 đến R-I29 (đếm, mẫu, đơn vị, persona, tên). Spec chưa có phương pháp: câu hỏi nào, phần nào, bước mua nào, mức tin nào.

Change này thay PR #364 (21/10/2026). PR đó xếp 16 section theo 5 phần A–E và nháp R-I29 đến R-I35. Phương pháp ở trang bản 9 mới hơn: 18 phần theo 5 câu hỏi (F107), có bước mua AIDA thêm Sau mua (F110) và 4 mức tin. Mã R-I29 đến R-I35 của PR #364 nay trùng R-I29 đã có, nên change này dùng R-I30 đến R-I39.

## What Changes

- Thêm R-I30: 5 câu hỏi kinh doanh và 18 phần theo thứ tự câu hỏi.
- Thêm R-I31: mỗi kết luận gắn một bước mua; bảng xếp loại dữ liệu vào bước.
- Thêm R-I32: 4 câu hỏi kiểm tra, 4 mức tin (Chắc, Khá, Yếu, Không) và 3 nhãn đi kèm (Khung, Chưa có dữ liệu, Giả thuyết).
- Thêm R-I33: ngưỡng để một chủ đề thành kết luận (đánh giá, từ khóa).
- Thêm R-I34: vai trò nguồn (chính, phụ, chỉ gợi ý); câu trả lời AI không làm bằng chứng.
- Thêm R-I35: gọi đúng tên từng loại số; dữ liệu dân số mô phỏng chỉ làm mốc.
- Thêm R-I36: không lặp số của báo cáo Market; không dùng số sao để xếp hạng thương hiệu.
- Thêm R-I37: mục «Những gì báo cáo chưa trả lời được»; chưa có dữ liệu thì để trống.
- Thêm R-I38: brief ở Phần 2 (G1, G2).
- Thêm R-I39: câu insight (G4 đến G7, G9): hỏi «Tại sao» có bằng chứng, câu có mâu thuẫn, 3C, ngôi thứ ba kèm số đếm, một câu cho mỗi bước mua.

## Capabilities

### New Capabilities
- Không có.

### Modified Capabilities
- `insight-report`: thêm R-I30 đến R-I39. Không sửa R-I01 đến R-I29.

## Impact

- Mã: chưa đổi. `insight-template.ts` vẫn dựng các section I01–I17 cũ. Insight đang chờ Market ổn định (chủ 12/10, 17/10).
- Code làm sau, khi chủ cho phép. Change này chỉ được archive khi code xong.
- Đóng PR #364 vì change này thay nó.
- Trang cho sếp và quy chuẩn dữ liệu đầu vào không đổi. Chủ giữ hai tài liệu này đến khi chủ và sếp cùng đồng ý (F112).

## Ngoài phạm vi

- Sửa code, sửa trang cho sếp, chạy thử, gọi nguồn trả phí, đổi cờ môi trường.
- Bảng đổi mã section cũ (I01–I17) sang Phần 1–17 trong các quy tắc R-I13, R-I21, R-I28. Việc này làm cùng lúc với code (xem tasks.md).
- Thêm nguồn mới. Bảng nguồn ở R-I34 chỉ ghi các nguồn chủ đã duyệt; nguồn «Đã duyệt, chưa chạy» giữ nguyên tình trạng.

Ba câu hỏi phạm vi (config.yaml):
1. Phương pháp có cần không: có. Trang bản 9 cho thấy báo cáo đang dừng ở «sự thật và quan sát», chưa tới câu insight. Thiếu khung câu hỏi, bước mua và mức tin thì báo cáo nói mạnh hơn bằng chứng (gốc chung của 29 lỗi Astra tìm ra, F111).
2. Lợi ích đáng kể hay nhỏ: đáng kể. Mỗi kết luận có mức tin và bước mua, nên người đọc biết điều nào dựa vào được.
3. Đặt ở đâu: spec `insight-report`, ngay sau R-I29. Không thêm spec mới.

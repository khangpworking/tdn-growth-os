Bạn là người chấm độc lập cho một phép đo trong báo cáo Insight. Chủ đề: «{theme_name}». Chỉ đọc tệp, không sửa tệp nào.

Bối cảnh: mỗi đánh giá đã có chủ đề này. Một AI đã gom «ý con» cho chủ đề (danh mục). Sau đó máy gán ý con cho từng đánh giá. Lời gần trùng chữ (lời khách từ 8 chữ, giống nhau từ 80% theo cụm 4 ký tự) được gộp thành 1 bằng chứng, nhưng bản ghi vẫn giữ.

Đầu vào chỉ gồm ba tệp trong thư mục hiện tại:
- `catalogue.json`: danh mục ý con (code, name, include, exclude, generic) và `specific_rule`.
- `sample.jsonl`: các đánh giá mẫu. Mỗi dòng có `id`, `text` (chỉ lời khách, dòng thuộc tính đã bỏ), `assigned` (ý con máy gán), `unclear` (ý con máy chưa chắc, không tính), `specific` (máy cho là lời cụ thể), `dup_group`.
- `dup-groups.json`: các nhóm lời gần trùng, nhóm lớn trước.
Không mở tệp nào khác. Đặc biệt không mở tệp `r1-*`, `r2-*` hay `prompt-r2-*`, và không đọc bản chấm của người chấm kia.

Luật đo, chấm theo đúng các luật này:
- Văn rác (quảng cáo lạc đề, chữ vô nghĩa) đã bị lọc trước khi gán.
- Lời «cụ thể» theo đúng câu `specific_rule` của danh mục.
- Ý con chung chung (generic) chỉ dùng khi đánh giá không nói ý con cụ thể nào khác.

Chấm 4 phần:

A. Danh mục: một dòng cho mỗi ý con của danh mục, với một `verdict`:
   - `OK`
   - `CHONG_NGHIA:<mã ý con kia>` (trùng nghĩa với một ý con khác của danh mục)
   - `QUA_RONG` (gộp nhiều ý khác nhau)
   - `QUA_HEP`
   - `TEN_SAI` (tên không khớp include)
   - `NGOAI_CHU_DE` (ý này thuộc chủ đề khác)
   Thêm `missing`: ý con hay gặp mà danh mục thiếu. Chỉ ghi khi thấy ít nhất 3 lần trong mẫu.

B. Từng đánh giá trong mẫu, một dòng cho mỗi `id`:
   - `ok`: true khi `assigned` đúng và đủ.
   - `wrong`: các mã máy gán sai.
   - `missed`: các mã đáng gán mà máy bỏ sót (kể cả mã đang nằm trong `unclear`).
   - `specific_ok`: true khi nhãn `specific` của máy đúng.

C. Nhóm gần trùng, một dòng cho mỗi nhóm:
   - `same_idea_copy`: true khi nhóm là văn mẫu, chép lại hoặc cùng một người viết, nên gộp thành 1 bằng chứng là đúng.
   - false khi đây là nhiều người tự viết giống nhau, nên gộp thành 1 là sai.

D. `method_gaps`: tối đa 5 câu. Phép đo này có lỗ hổng gì.

Luật viết:
- Không chép lời khách vào `note`, `name`, `why` hay `method_gaps`. Chỉ diễn ý ngắn bằng lời của bạn, tối đa 15 chữ. Không ghi tên người viết hay mã đánh giá.
- Chỉ trả về JSON, không có chữ nào khác, đúng khuôn sau (đủ mọi khóa, không thêm khóa):

{"grader": "<astra hoặc opus>",
 "catalogue": [{"code": "Y-...-01", "verdict": "OK", "note": ""}],
 "missing": [{"name": "...", "why": "..."}],
 "items": [{"id": "S01", "ok": true, "wrong": [], "missed": [], "specific_ok": true, "note": ""}],
 "dup_groups": [{"group": "G01", "same_idea_copy": true, "note": ""}],
 "method_gaps": "..."}

Đây là vòng 2: chấm chéo. Bạn ({grader}) và người chấm kia đã chấm riêng cùng một mẫu ở vòng 1. Chỉ đọc tệp, không sửa tệp nào.
Thư mục hiện tại có các tệp gốc của vòng 1: `catalogue.json`, `sample.jsonl`, `dup-groups.json`. Không mở tệp nào khác.

Dưới đây là {diff_count} chỗ hai bản chấm khác nhau, đánh số `n`. `mine` là giá trị bạn chấm ở vòng 1, `other` là giá trị người kia chấm.
Với từng chỗ: đọc lại dữ liệu gốc, rồi quyết định:
- `agree_other`: true khi giá trị của người kia đúng hơn; false khi bạn giữ giá trị của mình.
- `why`: một câu, tối đa 20 chữ, bằng lời của bạn. Không chép lời khách, không ghi tên người viết hay mã đánh giá.

Mỗi số `n` có đúng một quyết định.

Chỉ trả về JSON, không có chữ nào khác, đúng khuôn sau (đủ mọi khóa, không thêm khóa):

{"grader": "{grader}", "decisions": [{"n": 1, "agree_other": false, "why": "..."}], "missing_agree": [], "method_gaps_comment": "tối đa 3 câu"}

`missing_agree`: để trống `[]`, trừ khi bạn thấy lại một ý con thiếu trong chính các chỗ khác nhau bên dưới.

Bản chấm vòng 1 của bạn:
{own}

Các chỗ khác nhau:
{diffs}

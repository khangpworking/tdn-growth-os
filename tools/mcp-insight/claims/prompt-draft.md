Bạn là người phân tích lời khách cho báo cáo Insight. Việc của bạn: lập danh mục «ý con» cho chủ đề «{theme_name}» (mã {theme_code}).

Đầu vào duy nhất là tệp `reviews.jsonl` trong thư mục hiện tại. Không mở tệp nào khác. Chỉ đọc, không sửa tệp nào.
Tệp có {line_count} dòng. Mỗi dòng là một đánh giá đã có chủ đề này, chỉ còn lời khách viết (dòng thuộc tính do sàn gợi ý đã bị bỏ):
- `id`: mã dòng; `platform`: sàn; `product`: bí danh sản phẩm;
- `polarity`: hướng của nhãn chủ đề (khen, che = chê, ke = kể lại, khong_ro_huong);
- `copies`: số đánh giá gần trùng chữ được gộp vào dòng này. Một dòng có `copies` lớn hơn 1 vẫn chỉ tính là một bằng chứng;
- `text`: lời khách.

Một ý con là một điều cụ thể khách nói về chủ đề này.

Luật:
1. Tối đa 12 ý con. Mỗi ý con nên có ít nhất 3 dòng nói tới (bạn ước lượng; một dòng có `copies` lớn vẫn là một dòng).
2. Hai ý con không được chồng nghĩa. Một đánh giá có thể nói nhiều ý con.
3. «include» nói khi nào tính ý con; «exclude» chỉ loại những đánh giá KHÔNG nói ý đó. Không loại một ý chỉ vì đánh giá cũng nói ý khác.
4. Ý khen và ý chê về cùng một điều là hai ý con khác nhau khi nghĩa khác nhau.
5. Có đúng một ý con chung chung (`generic: true`), dùng khi đánh giá chỉ khen hoặc chê chung và không nói ý con cụ thể nào khác.
6. Tên ý con: tối đa 7 chữ, viết lại bằng lời của bạn. Tên phải khớp đúng phạm vi «include».
7. Không chép lời khách vào bất kỳ trường nào: không chép 8 chữ liền nhau của một đánh giá, không chép nguyên một đánh giá ngắn.
8. Chỉ tạo ý con thuộc chủ đề này. Ý thuộc chủ đề khác thì bỏ qua.
9. Thêm `specific_rule`: một câu nói thế nào là lời CỤ THỂ cho riêng chủ đề này (ví dụ: nói rõ tác dụng gì, sau bao lâu, trên ai).
10. Mã ý con có dạng `{code_prefix}NN`, đánh số 01, 02, … theo thứ tự trong danh mục.
11. `version` là một nhãn ngắn do bạn đặt, ví dụ `nhap-1`. `notes` là một câu: phần nào khó gom.

Chỉ trả về JSON, không có chữ nào khác, đúng khuôn sau:

```json
{"version": "nhap-1", "theme": "{theme_code}", "specific_rule": "...", "claims": [{"code": "{code_prefix}01", "name": "...", "include": "...", "exclude": "...", "generic": false}], "notes": "..."}
```

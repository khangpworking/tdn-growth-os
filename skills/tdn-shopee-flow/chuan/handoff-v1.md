# Phiếu cổng `handoff-v1`

Phiếu cổng là biên bản của một bước trong luồng module Shopee. Mỗi cổng ghi 1 phiếu. Phiếu chỉ có số đếm, mã băm, phiên bản và trạng thái: không có nội dung bình luận, cookie, token hay địa chỉ.

## Trường

| Trường | Ý nghĩa |
|---|---|
| `format` | Luôn là `"handoff-v1"`. |
| `module` | Bước đã chạy: `"ENTRY"`, `"M1"`, `"M2"`, `"M3"`. |
| `runId` | Mã lượt. Trùng tên thư mục lượt. |
| `skillVersion` | Phiên bản skill của bước đó. Với `ENTRY` là phiên bản skill luồng. |
| `verdict` | `"PASS"`, `"FAIL"` hoặc `"WAIT_OWNER"`. |
| `inputSha256` | Mã băm đầu vào bước đó đã đọc. `null` khi không có đầu vào (cổng vào), hoặc khi chọn link kiểu `manual`. |
| `outputSha256` | Mã băm đầu ra bước đó. Bước sau so đầu vào của mình với mã này. |
| `checks[]` | Danh sách phép kiểm: `{ "id", "ok", "got", "level"? }`. `level` = `"warn"` là cảnh báo; cảnh báo không đổi `verdict`. |
| `errorCode` | Mã lỗi app khi đầu ra của module có mã (ví dụ `PROVIDER_BLOCKED`). `GATE_NOT_PASSED` hoặc `GATE_INPUT_CHANGED` khi luật chặn bắt lỗi. Không có thì `null`; các phép kiểm không đạt nói lý do. |
| `next` | Bước kế tiếp: `"M1"`, `"M2"`, `"M3"` khi `PASS`; `null` khi không `PASS`, và `null` sau cổng M3. |

Mã băm: một file thì băm nguyên byte của file. Một thư mục (`m1/`, `m3/`) thì băm đệ quy: mỗi file một dòng `<đường dẫn tương đối dạng posix>\t<sha256 của file>\n`, sắp theo đường dẫn (D9). Mã băm là SHA-256, chữ thường.

`WAIT_OWNER` là kết luận khi mã lỗi của module nằm trong `modules.json` → `params.handToOwnerCodes`: mất đăng nhập, hoặc gặp bước xác minh. Mã lấy từ code app, không tự đặt.

## Ví dụ

```json
{
  "format": "handoff-v1",
  "module": "M2",
  "runId": "20261110-kem-01",
  "skillVersion": "1.0.0",
  "verdict": "PASS",
  "inputSha256": "3f0c…",
  "outputSha256": "9a71…",
  "checks": [
    { "id": "links_1_to_5", "ok": true, "got": 5 },
    { "id": "no_masked_above_lowest_pick", "ok": true, "got": 0 },
    { "id": "pick_rule_version", "ok": true, "got": "autorun-pick-v3" }
  ],
  "errorCode": null,
  "next": "M3"
}
```

## Ai ghi, ai đọc

- Người ghi: lệnh `shopee_flow.py gate <entry|m1|m2|m3> --run <id>` và các lệnh module `shopee_flow.py m1|m2|m3 --run <id>` ghi `gates/<gate>.json` và in cùng nội dung ra stdout. Không ai sửa phiếu bằng tay.
- Người đọc: bước sau (kiểm phiếu và mã băm trước khi chạy), luồng tổng (`run`), app desktop khi hiện từng phép kiểm, và người kiểm lại một lượt.
- Phiếu chỉ là bằng chứng của bước đã chạy. Phiếu không thay cho phê duyệt của owner và không phải quyền chạy một lượt mới.

Lỗi chặn trước khi chạy không ghi đè phiếu đã `PASS`: `GATE_NOT_PASSED` (22), `GATE_INPUT_CHANGED` (23), `RUN_BUSY` (24), `READONLY_ON` (20). Khi lệnh module dừng vì một mã trong `params.handToOwnerCodes` (mất đăng nhập, gặp bước xác minh), phiếu của bước đó có `verdict` = `WAIT_OWNER` và mã lỗi tương ứng.

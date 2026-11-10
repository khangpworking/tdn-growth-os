# Danh sách chọn link `selection-v1`

`selection-v1` là đầu ra của module M2 và là đầu vào của module M3. File nằm ở `m2/selection.json` của lượt. File chỉ có mã sản phẩm, link, số liệu bán và lý do chọn: không có nội dung bình luận, token hay địa chỉ.

## Trường

| Trường | Ý nghĩa |
|---|---|
| `format` | Luôn là `"selection-v1"`. |
| `runId` | Mã lượt. |
| `source` | `"auto"` do máy chọn, hoặc `"manual"` do người soạn. |
| `pickRuleVersion` | Bản luật chọn. `"autorun-pick-v3"` khi máy chọn; `"manual"` khi người soạn. Cổng M2 so giá trị này với `modules.json`. |
| `metricInputSha256` | Mã băm thư mục `m1/` mà máy đã đọc. `null` với file `manual`. |
| `links[]` | 1 đến 5 link, sắp theo thứ hạng. |
| `links[].rank` | Thứ hạng, bắt đầu từ 1. |
| `links[].productBaseId` | Mã sản phẩm của bản thu Metric: `1__<itemId>__<shopId>` — phần đầu là mã sản phẩm, phần sau là mã gian hàng (D1; code quyết định). |
| `links[].shopId` | Mã gian hàng, chỉ gồm chữ số. |
| `links[].itemId` | Mã sản phẩm, chỉ gồm chữ số. |
| `links[].url` | Link sản phẩm: `https://shopee.vn/product/<shopId>/<itemId>`. |
| `links[].brand` | Thương hiệu đọc từ bản thu; có thể `null`. |
| `links[].revenue` | Doanh thu kỳ của sản phẩm; có thể `null`. |
| `links[].reason` | Lý do chọn, do script M2 dựng từ thứ hạng, doanh thu kỳ và thương hiệu. |
| `counts.walked` | Số dòng đã đi qua. |
| `counts.deleted` | Số dòng đã bị xoá trên nguồn. |
| `counts.notIncluded` | Số dòng không đúng nghĩa từ khoá. |
| `counts.tokenGuardRejected` | Số dòng không chứa từ khoá như một từ trọn. |
| `counts.eligible` | Số dòng đủ điều kiện sau khi lọc chất lượng. |
| `counts.picked` | Số link đã chọn. |
| `counts.maskedRows` | Số dòng có mã sản phẩm bị che. Script M2 đếm ở B2 trên bản M1 đã lưu (offline, D6). Dòng bị che là dòng có mã bắt đầu `1__` và chứa `[REDACTED`; mỗi mã chỉ tính lần đầu. |
| `counts.maskedAboveLowestPick` | Số dòng bị che có doanh thu kỳ **cao hơn hẳn** doanh thu thấp nhất trong các link đã chọn (so sánh ngặt: bằng thì không tính). Doanh thu đọc `revenue_custom`, thiếu thì `revenue`, chỉ nhận số hữu hạn ≥ 0. Không link nào có doanh thu thì đếm mọi dòng bị che có doanh thu. Cổng M2 đòi giá trị 0 (R3, owner quyết định Q6). Lượt cũ thiếu hai số đếm này thì cổng M2 đóng (D6). |

Tên link và số đếm theo `PickedShopeeLink` và `PickResult` trong `src/modules/analysis/research-automation/autorun-derive.ts`.

## Cửa sổ để chọn

Lượt tạo bằng `new-run` chọn theo cửa sổ `30d` (`modules.json` → `params.pickWindow.preset`, R1). Lượt cũ chọn `run2` khi `usedScope(scope).captureNumber` = 2, còn lại chọn `run1`. Ứng viên lấy từ mọi cửa sổ Metric đã thu; chỉ phần xếp hạng đọc cửa sổ đã chọn.

## Ví dụ

```json
{
  "format": "selection-v1",
  "runId": "20261110-kem-01",
  "source": "auto",
  "pickRuleVersion": "autorun-pick-v3",
  "metricInputSha256": "3f0c…",
  "links": [
    {
      "rank": 1,
      "productBaseId": "1__12345678901__987654321",
      "shopId": "987654321",
      "itemId": "12345678901",
      "url": "https://shopee.vn/product/987654321/12345678901",
      "brand": "Một thương hiệu",
      "revenue": 120000000,
      "reason": "Hạng 1, doanh thu kỳ 120.000.000, thương hiệu Một thương hiệu"
    }
  ],
  "counts": {
    "walked": 120, "deleted": 2, "notIncluded": 38, "tokenGuardRejected": 3,
    "eligible": 77, "picked": 1, "maskedRows": 0, "maskedAboveLowestPick": 0
  }
}
```

## Ai ghi, ai đọc

- Người ghi: lệnh `shopee_flow.py m2 --run <id>` (có từ B2) ghi file khi máy chọn. Với `manual`, người phụ trách tự soạn file, rồi chạy cổng M2 trước khi chạy M3.
- Người đọc: cổng M2 (kiểm 1–5 link, mã số, không trùng gian hàng, đúng bản luật, có lý do), module M3 (danh sách link cần thu), app desktop ở màn thư viện, và người kiểm lại một lượt.
- File `manual` phải có `metricInputSha256` = `null` và `pickRuleVersion` = `"manual"`. Ba phép kiểm phụ thuộc bản thu không chạy với file `manual`; phiếu ghi cảnh báo.

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

## Quy tắc `metric-products-unique-v2`

Lượt mới tạo bằng `new-run` (một kỳ) ghi `request.selectionPolicy` = `"metric-products-unique-v2"`. Lượt đã tạo với `metric-products-unique-v1` và lượt cũ giữ nguyên cách chọn và cách đọc. Các trường ở trên giữ nguyên nghĩa.

Trình tự: duyệt bảng Top Products đã lưu ở bước 1 theo doanh số kỳ giảm dần, như v1. Dòng sàn khác (`2__`, `3__`, `8__`) bị bỏ qua, không ghi lại. Dòng Shopee hợp lệ đầu tiên được chọn mà không hỏi. Mỗi dòng Shopee sau đó: lệnh M2 hỏi Jev (TypeSafe System One) một câu «tin đăng này là sản phẩm nào đã chọn, hay sản phẩm mới?» với lựa chọn `SP1`…`SPn` (sản phẩm đã chọn, theo thứ tự chọn) và `MOI`. Đủ 5 thì dừng, không hỏi thêm. Câu hỏi đúng từng chữ nằm trong `scripts/module-product-pick-jev.ts`.

| Câu trả lời (`p` = xác suất của lựa chọn Jev chọn) | Kết quả | `outcome` | Lý do bỏ qua |
|---|---|---|---|
| `MOI`, `p` ≥ 0,70 | Chọn | `PICKED` | — |
| `SPk`, `p` ≥ 0,70 | Bỏ qua, `duplicateOfRank` = k | `DUPLICATE` | `SAME_PRODUCT` |
| `p` < 0,70 | Bỏ qua, tính vào `unresolvedCount` | `UNSURE` | `PRODUCT_MATCH_UNSURE` |
| Mã dòng Shopee không đọc được (không hỏi) | Bỏ qua, tính vào `unresolvedCount` | — | `PICK_LISTING_ID_UNRESOLVED` |

Jev không trả lời hợp lệ sau 3 lần (chờ 1 giây rồi 3 giây), Jev chưa bật hoặc thiếu khóa: M2 dừng với `PICK_JEV_UNAVAILABLE` và không ghi `m2/selection.json`.

Trường thêm của lượt v2:

| Trường | Ý nghĩa |
|---|---|
| `links[]` | Có `sourceRank`, `productName`, `shopName`; không có `groupKey`, `groupingBasis`. `reason`: thứ tự 1 là «Hạng nguồn N; sản phẩm đầu tiên bán trên Shopee.», các thứ tự sau là «Hạng nguồn N; khác các sản phẩm đã chọn.» |
| `selectionProof.shortageReason` | `null` khi đủ 5, kể cả có dòng bị bỏ qua. Thiếu 5 và có dòng chưa xác định: `PICK_PRODUCT_UNRESOLVED`. Thiếu 5 và không có dòng chưa xác định: `FEWER_THAN_FIVE_DISTINCT_PRODUCTS`. |
| `selectionProof.matcher` | Bắt buộc. `provider` = `"typesafe-jev"`, `model` = model đã hỏi, `questionVersion` = mã băm SHA-256 của câu hỏi, `threshold` = 0,7. |
| `selectionProof.decisions[]` | Bắt buộc. Mỗi câu đã hỏi Jev có đúng một phần tử, theo thứ tự hỏi: `sourceRank`, `productBaseId`, `choice`, `probabilities` (đủ `SP1`…`SPn` và `MOI`), `outcome`. |

Cổng M2 và tab kết quả không gọi Jev. Chúng chạy lại trình tự trên dữ liệu bước 1 đã lưu bằng các câu trả lời trong `decisions`, tính lại mọi `outcome` từ `choice`, `probabilities` và ngưỡng, rồi so từng chữ với `m2/selection.json`. Quyết định bị sửa, xóa, thêm hoặc đổi thứ tự, link bị đổi, hoặc `matcher` khác giá trị của quy tắc: `PICK_PROOF_MISMATCH`. Cổng đạt khi khớp, đủ 5 sản phẩm và ảnh Top Products phủ các hạng đã chọn.

Cổng bước 2 chạy lại trình tự chọn trên dữ liệu bước 1 đã lưu với các câu trả lời đã lưu trong `decisions`, rồi so với file này. Cách kiểm đó chứng minh kết quả chọn suy ra đúng từ các câu trả lời đã lưu. Nó không chứng minh các câu trả lời đó do Jev trả về, và không kiểm `matcher.model`. Cổng không hỏi lại Jev. Việc chống sửa file của lượt thuộc về khóa chỉ-đọc, như với dữ liệu đã lưu của bước 1 và bước 3.

---
name: tdn-shopee-m2-chon
description: Run the M2 product-pick module of the TDN Shopee module flow (Metric files → selection-v1 → gate M2). Use when someone asks to «chọn sản phẩm», «chọn 5 link Shopee» cho một lượt, read the gate M2 slip, or find where the pick rule lives in the app code. Not for running the Metric lookup or collecting reviews.
---

# M2 Chọn sản phẩm

M2 đọc file Metric đã qua cổng M1, chọn tối đa 5 link Shopee, ghi `selection.json`. Luật chọn nằm trong code app. Skill này chỉ nói đầu vào, một lệnh cần gọi, luật ở đâu, đầu ra và cách xử lý khi cổng chưa đạt.

## 1. Đầu vào

- Thư mục `m1/` của lượt, đã qua cổng M1: phiếu `gates/m1.json` phải có và `verdict` = `PASS`.
- Mã băm thư mục `m1/` lúc chạy phải bằng `outputSha256` trên phiếu M1. Khác → `GATE_INPUT_CHANGED`.
- Từ khoá lấy từ `request.json` → `preset.keywords` (D10). Cửa sổ Metric để chọn link: lượt tạo bằng `new-run` đọc cửa sổ `30d` (`modules.json` → `params.pickWindow.preset`); lượt cũ đọc `run2` khi `usedScope(scope).captureNumber` = 2, còn lại `run1` (R1). Ứng viên vẫn lấy từ mọi cửa sổ đã thu; chỉ phần xếp hạng đọc cửa sổ chọn.
- `request.captureSpec` là tuỳ chọn: lệnh M2 chỉ so với `request.windows` khi `captureSpec` có mặt; thiếu thì không so (R2).
- Đường `manual`: người tự soạn `m2/selection.json`. File phải có `source` = `"manual"`, `metricInputSha256` = `null`, `pickRuleVersion` = `"manual"`. Không cần phiếu M1, không cần file `m1/`.
- Chuẩn đầu ra của module: `selection-v1` (khai trong `modules.json`).

## 2. Việc AI làm

Gọi đúng 1 lệnh, không mở trình duyệt, không tự đặt luật, không sửa file đầu ra:

```
python3 shopee_flow.py m2 --run <runId>
```

- `--detach` chạy lệnh ở nền, in `{ "format": "detached-v1", "runId", "pid" }` rồi thoát 0. Luật chặn chạy trước khi tách.
- `--manual <file>` nạp file `manual` đã soạn vào `m2/selection.json`; sai chuẩn hoặc sai `runId`/`source`/`pickRuleVersion`/`metricInputSha256` → `MANUAL_SELECTION_INVALID`.
- Hàm chọn của app là hàm thuần, không gọi mạng, không đọc file. Chỉ lệnh M2 đọc file, gọi hàm, ghi file. M2 chạy offline và không bị khóa chỉ-đọc chặn.
- AI không tự sửa `selection.json` để cổng qua. File sai thì chạy lại cổng, hoặc báo người phụ trách.
- Không thử lại ở mức module (0 lần).

## 3. Quy tắc nghiệp vụ

Mỗi dòng là một luật, kèm chỗ ở trong code hoặc tham số.

1. Bản luật chọn: `AUTORUN_PICK_RULE_VERSION = 'autorun-pick-v3'`; kết quả ghi vào trường `pickRuleVersion`. (`src/modules/analysis/research-automation/autorun-derive.ts`)
2. Tối đa 5 link mỗi lượt: `AUTORUN_MAX_SHOPEE_LINKS = 5`, không có tham số đổi. (`autorun-derive.ts`)
3. Chỉ nhận dòng có `product_base_id` dạng `1__<itemId>__<shopId>`: hai phần là số, phần đầu khác 0. Dòng không khớp (gồm mã bị che dạng số điện thoại) không được thu. Dòng `is_deleted === true` bị loại. (`autorun-derive.ts` → `SHOPEE_BASE_ID`, `collectShopeeRows`, `pickShopeeLinks`)
4. Lọc nghĩa từ khoá: chỉ giữ dòng mà bộ lọc nghĩa trả `INCLUDED`. (`src/modules/analysis/keyword-meaning-filter.ts` → `filterKeywordMeanings`; gọi trong `pickShopeeLinks`)
5. Lọc chất lượng dòng theo tiêu đề và số bán (`src/modules/analysis/research-automation/capture-row-quality.ts` → `assessCaptureRowsTitleOnly`, `captureRowExclusions`): loại `NOT_MAIN_PRODUCT` (tiêu đề không phải sản phẩm chính), `REVENUE_WITHOUT_UNITS` (doanh thu kỳ > 0 nhưng số bán thiếu hoặc 0), `UNIT_REVENUE_OUTLIER` (doanh thu trên một đơn vị bán lớn hơn 20 lần trung vị của nền tảng). Số bán chỉ dùng để loại dòng kém, không dùng để xếp hạng.
6. Tiêu đề phải chứa từ khoá như một từ trọn, không phân biệt hoa thường, giữ dấu. (`autorun-derive.ts` → `guards` trong `pickShopeeLinks`)
7. Xếp hạng: doanh thu kỳ giảm dần; bằng nhau thì `productBaseId` tăng dần. (`autorun-derive.ts` → `eligible.sort`)
8. Ba vòng chọn, dừng khi đủ 5: vòng 1 lấy dòng cùng "lá" danh mục phổ biến nhất, thương hiệu chưa có và gian hàng chưa có; vòng 2 lấp trong cùng lá, thương hiệu được lặp, gian hàng không; vòng 3 lấy lá khác, chỉ lấp chỗ còn trống. (`autorun-derive.ts` → `pickShopeeLinks`)
9. Mỗi gian hàng chỉ 1 link. Khoá gian hàng là `shop_base_id`, thiếu thì dùng `shopId`. (`autorun-derive.ts` → `collectShopeeRows`, `shopKey`, `take`)
10. "Lá" danh mục phổ biến nhất = lá xuất hiện nhiều nhất trong các dòng đủ điều kiện; hoà thì giữ lá của dòng doanh thu cao hơn; không dòng nào có lá thì coi là lá "không rõ". (`autorun-derive.ts` → `pickShopeeLinks`, `categoryLeaf`)
11. "Lý do chọn" do script M2 dựng từ thứ hạng, doanh thu kỳ và thương hiệu (owner F513, câu 7). Hàm chọn của app không tạo lý do và không đổi. (`autorun-derive.ts` → `pickShopeeLinks`; phần dựng lý do thuộc script B2)
12. Bản luật ghi trong đầu ra phải bằng bản luật khai cho M2 trong `modules.json` → `modules[M2].ruleVersion` (`autorun-pick-v3`). (`autorun-derive.ts`; cổng kiểm `pick_rule_version`)
13. Đường `manual`: giữ nguyên link người soạn, không chấm điểm lại, không thêm lý do tự động. (`modules.json`; hợp đồng mục 10)
14. Số đếm `walked`, `deleted`, `notIncluded`, `tokenGuardRejected`, `eligible`, `picked` lấy từ `PickResult.counts`. Hai số `maskedRows`, `maskedAboveLowestPick` do script M2 đếm offline trên bản M1 đã lưu (D6, R3): dòng bị che là dòng có mã bắt đầu `1__` và chứa `[REDACTED`; mỗi mã chỉ tính lần đầu; so doanh thu của dòng bị che (`revenue_custom`, thiếu thì `revenue`; chỉ nhận số hữu hạn ≥ 0) với doanh thu thấp nhất trong các link đã chọn. Cao hơn hẳn mới tính (so sánh ngặt); bằng thì không tính. Không link nào có doanh thu thì đếm mọi dòng bị che có doanh thu. Lượt cũ thiếu hai số này: cổng M2 đóng (D6).
15. Số lần thử lại ở mức module là 0. (`modules.json` → `params.moduleRetries`; owner F513)

Ghi chú kỹ thuật: `pickShopeeLinks` chọn bản luật theo hồ sơ chất lượng của lệnh gọi. Hồ sơ `automation-metric-capture-v3` cho ra `autorun-pick-v3`; hồ sơ cũ `automation-metric-capture-v2` cho ra `autorun-pick-v2` (`capture-row-quality.ts`, `autorun-derive.ts`). Script M2 truyền hồ sơ v3 để khớp `modules.json` (D5).

## 4. Đầu ra

- `m2/selection.json`, chuẩn `selection-v1`. Trường: `format`, `runId`, `source`, `pickRuleVersion`, `metricInputSha256`, `links[]`, `counts`. Mỗi link: `rank`, `productBaseId`, `shopId`, `itemId`, `url`, `brand`, `revenue`, `reason`.
- `productBaseId` = `1__<itemId>__<shopId>`: phần đầu là item, phần sau là shop. Code quyết định thứ tự này (D1).
- `url` do code dựng: `https://shopee.vn/product/<shopId>/<itemId>`. (`autorun-derive.ts` → `pickShopeeLinks`)
- Mã băm: SHA-256 của file `selection.json`, chữ thường.
- Phiếu `gates/m2.json` (chuẩn `handoff-v1`). Khi `PASS`, `next` là `M3`. Phiếu không chứa nội dung bình luận.

## 5. Kiểm tra

Lệnh cổng:

```
python3 shopee_flow.py gate m2 --run <runId>
```

Exit code: `0` PASS, `20` FAIL, `21` WAIT_OWNER, `22` GATE_NOT_PASSED, `23` GATE_INPUT_CHANGED, `24` RUN_BUSY, `2` sai cách gọi hoặc không thấy thư mục lượt.

Phép kiểm của cổng M2 (hợp đồng mục 8):

- `links_1_to_5`: có 1 đến 5 link.
- `ids_numeric`: mọi `shopId`, `itemId` chỉ gồm chữ số.
- `no_duplicate_shop`: không có hai link cùng `shopId`.
- `no_masked_above_lowest_pick`: `counts.maskedAboveLowestPick` = 0 (owner F513, câu 6; R3). Lượt cũ thiếu số này thì cổng đóng (D6).
- `links_in_m1`: mọi link có trong đầu ra M1.
- `pick_rule_version`: `pickRuleVersion` bằng `modules[M2].ruleVersion`.
- `pick_reason_present`: mọi link có lý do chọn có chữ.

Với `manual`, ba phép kiểm `links_in_m1`, `no_masked_above_lowest_pick`, `pick_rule_version` không chạy: mỗi phép ghi `ok: true`, `got: "manual"`, `level: "warn"`.

Mã chặn của luồng (hợp đồng mục 7, không phải mã app):

- `GATE_NOT_PASSED`: phiếu M1 thiếu hoặc không `PASS`. Dừng.
- `GATE_INPUT_CHANGED`: `m1/` đã đổi sau cổng M1. Dừng, báo qua cổng M1 lại.
- `RUN_BUSY`: lượt đang chạy với pid còn sống. Dừng. Pid đã chết thì lệnh đánh dấu `STOPPED` + `RUN_INTERRUPTED` rồi đi tiếp.
- M2 chạy offline nên không bị khóa chỉ-đọc chặn: khóa `<state>/shopee-flow/READONLY` chỉ chặn M1 và M3.

Bảng mã lỗi app: M2 không có mã lỗi app riêng. Hàm chọn là hàm thuần, không gọi mạng (`autorun-derive.ts` → `pickShopeeLinks`). Khi một phép kiểm không đạt, phiếu ghi `ok: false`, `errorCode` là `null`; AI đọc tên phép kiểm và làm theo bảng sau.

| Phép kiểm không đạt | AI làm gì | Chuyển cho người khi |
|---|---|---|
| `links_1_to_5`, `ids_numeric`, `links_in_m1` | Dừng. Không tự thêm, bớt hay sửa link. | Luôn: báo số đếm `got` và file `m1/`. |
| `no_duplicate_shop` | Dừng. | Luôn: báo hai link trùng gian hàng. |
| `no_masked_above_lowest_pick` | Dừng. | Luôn: owner quyết định chọn link thấp hơn hoặc chấp nhận mẫu hiện tại. |
| `pick_rule_version` | Dừng. Không sửa `selection.json`. | Luôn: báo bản luật trong file và bản luật trong `modules.json`. |
| `pick_reason_present` | Dừng. | Luôn: báo link thiếu lý do. |

Bảng chuyển cho người: M2 không có mã nào trong `modules.json` → `params.handToOwnerCodes`, nên cổng M2 không trả `WAIT_OWNER`. `manual` không bị chặn bởi cổng M1.

## 6. Phiên bản

- Skill `tdn-shopee-m2-chon`, phiên bản `1.0.0`. Giá trị này phải bằng `modules.json` → `modules[M2].skillVersion`, và bằng `skillVersion` trên phiếu.
- Bản luật code: `autorun-pick-v3` (`AUTORUN_PICK_RULE_VERSION` trong `autorun-derive.ts`). Giá trị này phải bằng `modules.json` → `modules[M2].ruleVersion`.
- File code chịu trách nhiệm: `src/modules/analysis/research-automation/autorun-derive.ts` (`pickShopeeLinks`); `src/modules/analysis/research-automation/capture-row-quality.ts` (`captureRowExclusions`); `src/modules/analysis/keyword-meaning-filter.ts` (`filterKeywordMeanings`).
- Đổi luật chọn = PR vào code app và sửa lời tả trong skill. Số lần thử lại và trần bình luận sửa trong `modules.json`.

---
name: tdn-shopee-4-buoc
description: Chạy 4 bước Shopee (Metric → chọn link → lấy bình luận → lưu + Jev lọc + Jev gắn nhãn) không cần app, qua đúng cổng đầu vào và đầu ra của app. Dùng khi được giao chạy một lượt Shopee bằng dòng lệnh.
---

# Chạy 4 bước Shopee không cần app

Skill này gọi đúng các lệnh mà app desktop gọi. Mọi luật nghiệp vụ nằm trong code. Skill chỉ nói thứ tự lệnh, cổng nào có giá trị và khi nào phải dừng.

## Luật chung

1. Chỉ gọi lệnh của `shopee-cli.py` trên lane đang chạy. Không gọi script con. Không sửa file trong thư mục lượt. Không sửa code.
2. Sau mỗi bước: đọc kết luận cổng của bước đó (xem từng bước). Chỉ đi tiếp khi kết luận là `PASS`.
3. Không thử lại. Lỗi thì dừng và báo `errorCode`.
4. Hỏi chủ trước 3 việc: chọn sản phẩm/preset, cách lấy bình luận, phí Jev. Jev tốn phí ở 2 bước: bước 2 (đường 1 kỳ: Jev chọn link) và bước 4 (tự chạy ngay khi bước 3 đạt). Vì vậy hỏi phí Jev một lần, **trước khi chạy bước 2**, cho cả bước 2 và bước 4.
5. Mất đăng nhập Metric hoặc Shopee, gặp xác minh (`WAIT_OWNER`, exit 21): dừng, báo chủ. Không tự đăng nhập.
6. Không in token, khóa, nội dung env, địa chỉ máy.

Exit code chung: `0` PASS · `20` FAIL · `21` chờ chủ · `22` bước trước chưa đạt · `23` đầu vào đã đổi · `24` lượt đang bận · `2` sai lệnh.

## Trước mọi lệnh

Lane live đổi sau mỗi lần deploy. Không ghi cứng đường dẫn lane hay thư mục home. Lấy đường dẫn từ file cấu hình của app desktop:

- File cấu hình: biến `TDN_SHOPEE_APP_CONFIG`, nếu không có thì `%APPDATA%\tdn-shopee-flow\config.json` trên máy chạy app.
- `remoteScript` (bắt buộc): đường dẫn `shopee-cli.py` của lane live. Đây là lệnh duy nhất được gọi.
- `remoteEnvFile`, `runsRoot`, `presetsRoot`: không bắt buộc. Chỉ dùng khóa có trong cấu hình.

**Cách vào máy chạy lane.** App chọn một trong hai cách. Làm đúng cách app đang dùng:

- `network.enabled` = `true` (cách nối trực tiếp): app tự tìm máy chạy lane và chỉ nối khi khóa máy (host key) khớp `network.hostIdentity`. Sau đó app gọi `ssh` với `network.sshExecutable`, `user`, `port`, `identityFile`, `knownHostsFile`. Khi đó `sshCommand` có thể không có. Không đoán địa chỉ máy. Không tắt kiểm khóa máy. Chưa biết máy nào thì dừng, hỏi chủ.
- `network` không có hoặc `enabled` = `false`: app gọi đúng lệnh trong `sshCommand` (một danh sách tham số).
- Đang ở ngay trên máy chạy lane: không cần `ssh`.

**Shell của mỗi lệnh.** App gửi các dòng sau cho máy chạy lane. Bỏ dòng của khóa không có trong cấu hình. Thay `<…>` bằng giá trị trong cấu hình. Không in giá trị ra báo cáo.

```
export PYTHONDONTWRITEBYTECODE=1
export SHOPEE_FLOW_RUNS="<runsRoot>"          # chỉ khi cấu hình có runsRoot
export SHOPEE_FLOW_PRESETS="<presetsRoot>"    # chỉ khi cấu hình có presetsRoot
if [ -f "<remoteEnvFile>" ]; then set -a; . "<remoteEnvFile>"; set +a; fi   # chỉ khi cấu hình có remoteEnvFile
python3 "<remoteScript>" <lệnh> ...
```

Lệnh có gọi Metric báo `METRIC_DATE_CHECK_FAILED`: kiểm xem env đã được nạp chưa (cấu hình có `remoteEnvFile` và file đó có trên máy). Thiếu thì dừng, báo chủ.

Dưới đây `shopee-cli.py` nghĩa là `python3 "<remoteScript>"` chạy trong shell đó.

Chỉ dùng các lệnh có trong skill này. `--help` còn liệt kê lệnh cũ (`start`, `watch`, `status`, `recover`…): không dùng.

## Thời lượng và `--detach`

App luôn chạy `m1`, `m2`, `m3`, `process-review-data` kèm `--detach`. Làm giống app: lệnh trả về ngay, rồi xem tiến độ bằng `run-info` hoặc `review-process`.

| Bước | Lệnh chạy | `--detach` | Thời lượng đã đo |
|---|---|---|---|
| 0 | `new-run`, `gate entry` | không có | vài giây |
| 1 | `m1` | nên dùng | chưa đo (lần chạy thử chạy tiền cảnh, xong) |
| 2 | `m2` | nên dùng | chưa đo |
| 3 | `m3` | bắt buộc | khoảng 4 phút cho 5 link × 50 bình luận |
| 4 | tự chạy sau bước 3; `process-review-data` | bắt buộc | chưa đo |

Xem tiến độ bước 1–3: `run-info --run <runId>` → `execution.modules.<M1|M2|M3>.status`. Giá trị: `RUNNING`, `SUCCEEDED`, `FAILED`, `WAIT_OWNER`, `UNCERTAIN`. Chờ đến khi hết `RUNNING`.

## Bước 0. Tạo lượt (cổng đầu vào)

```
shopee-cli.py metric-date-availability --end-date <hôm nay>
echo '<input JSON>' | shopee-cli.py new-run --stdin
shopee-cli.py gate entry --run <runId>
```

- `metric-date-availability` cho ngày hôm nay thường trả `available:false` và `errorCode: CAPTURE_PERIOD_NOT_SELECTABLE`, exit 0. Đây là bình thường. Dùng `lastSelectableDate` làm `endDate`.
- Lệnh đó lỗi (exit khác 0) sau khi đã nạp env: dừng, báo chủ (thường là Metric mất đăng nhập).
- Input chỉ nhận các khóa: `presetId`, `endDate`, `startDate`, `metricOptions`, và nhiều nhất một trong hai: `reviewCapPerLink` hoặc `collectionPolicy`. Không có cả hai thì mặc định lấy bình luận có chữ, 300/link.
- Có 2 đường. Input chọn đường. Mọi lượt `new-run` đều là `request-v2`.

  | Input | Đường | Bước 1 | Bước 2 |
  |---|---|---|---|
  | Có cả `startDate` và `metricOptions` | 1 kỳ (đường của app) | 1 kỳ `selected` = `startDate`→`endDate`, spec `metric-v3-capture-spec-v3`, thêm gói 100 sản phẩm | Jev chọn, luật `metric-products-unique-v2`, đúng 5 link |
  | Không có cả hai | cũ | 2 kỳ `30d` và `12m` kết thúc ở `endDate` (theo `params.windows`), spec của preset, không có gói 100 sản phẩm | luật cũ `autorun-pick-v3` (không Jev), 1–5 link |

  Chỉ có một trong hai khóa `startDate`, `metricOptions`: lỗi `NEW_RUN_INPUT_INVALID`.
- Đường 1 kỳ: `endDate` phải trước hôm nay (giờ Việt Nam) và `startDate` ≤ `endDate`. App dùng `startDate` = `endDate` − 29 ngày (30 ngày). Skill này dùng đường 1 kỳ, giống app.
- Mẫu input:
  ```
  {"presetId":"vien-uong-canxi","startDate":"2026-10-14","endDate":"2026-11-12",
   "metricOptions":{"categoryIds":[...], "shopTypes":[...], "smartQuery":..., "aiNormalisation":..., "customizeCategory":..., "smartExclusion":..., "usefulFilters":{"fake":...,"gifts":...,"deleted":...}},
   "reviewCapPerLink":50}
  ```
  `metricOptions` cần đủ 7 khóa trên. Cách lấy: chạy `capture-specs --run <lượt cũ cùng preset>`, lấy `captureSpec.preset`, bỏ `keywords, platforms, category, advancedFilter, exclusions`, thêm `categoryIds` = id các mục trong `category.children`.
- Kết quả: `runId` (8 ký tự). Cổng `entry` kiểm tên sản phẩm, ngày, cách lấy bình luận, khóa bảo trì, và bộ lọc Metric (`capture_spec_*`). `new-run` không in cảnh báo về input; kết luận nằm ở `gate entry`.

## Bước 1. Metric

```
shopee-cli.py m1 --run <runId> --detach
shopee-cli.py run-info --run <runId>        # chờ M1 hết RUNNING
shopee-cli.py gate m1 --run <runId>
```

- Đường 1 kỳ: mở Metric một lần: 1 kỳ, 4 sàn, đúng ngành hàng và bộ lọc đã chọn, sắp theo cột doanh thu. Lấy thêm 1 gói 100 sản phẩm cùng phạm vi (không tốn điểm). Gói này hỏng thì bước 1 dừng.
- Đường cũ: lấy 2 kỳ `30d` và `12m` theo spec của preset. Không có gói 100 sản phẩm.
- Đầu ra: `m1/`. `gate m1` in kết luận và ghi `gates/m1.json`. Cổng kiểm: chạy thành công, file đọc được, có dòng Shopee, đúng kỳ. Đường 1 kỳ kiểm thêm file nguồn đã lưu khớp (`saved_capture_source_verified`). `masked_ids` chỉ là cảnh báo.
- Lỗi hay gặp: `CAPTURE_LOGIN_REQUIRED` (chủ đăng nhập Metric), `CAPTURE_UI_CHANGED` (trang Metric không ở tiếng Anh), `CAPTURE_PERIOD_NOT_SELECTABLE` (chọn ngày khác).

## Bước 2. Chọn link Shopee

Phí Jev của bước 2 và bước 4 phải được chủ duyệt trước lệnh này (luật 4).

```
shopee-cli.py m2 --run <runId> --detach
shopee-cli.py run-info --run <runId>        # chờ M2 hết RUNNING
shopee-cli.py gate m2 --run <runId>
```

- Đường 1 kỳ (lượt có `selectionPolicy` = `metric-products-unique-v2`): đi theo thứ tự doanh thu trong 100 dòng, bỏ dòng không phải Shopee. Dòng Shopee đầu tiên được chọn ngay. Với mỗi dòng sau, Jev xét: dòng đó trùng một sản phẩm đã chọn, hay là sản phẩm mới. Jev không chắc thì bỏ dòng đó. Đầu ra: `m2/selection.json`, đúng 5 link khác nhau. Cổng kiểm: `links_match_source_order` (link đúng thứ tự nguồn), `five_distinct_products` (đủ 5 sản phẩm khác nhau).
- Đường cũ (lượt không có `selectionPolicy`): luật `autorun-pick-v3`, không Jev, kỳ `30d`. Đầu ra 1–5 link. Cổng kiểm: `links_1_to_5`, `ids_numeric`, `no_duplicate_shop`, `no_masked_above_lowest_pick`, `links_in_m1`, `pick_rule_version`, `pick_reason_present`.
- Đường 1 kỳ gọi Jev (có phí): 1 câu hỏi cho mỗi dòng Shopee đã xét sau dòng đầu, đến khi đủ 5 link (nhiều nhất số dòng trong gói 100). Mỗi câu gửi tối đa 3 lần. Code không ghi phí của bước này; phí nhỏ. Số câu đã hỏi nằm ở `m2/selection.json` → `selectionProof.decisions`. Đường cũ không gọi Jev.
- Đường 1 kỳ: đã đạt thì không chạy lại (`M2_ALREADY_PASSED`). Muốn chọn lại: tạo lượt mới.
- Đường 1 kỳ không đủ 5 link (`FEWER_THAN_FIVE_DISTINCT_PRODUCTS`, `PICK_PRODUCT_UNRESOLVED`): dừng, báo chủ.

## Bước 3. Lấy bình luận

Bước 4 tự chạy ngay khi bước 3 đạt. Chủ chưa duyệt phí Jev (luật 4) thì không chạy lệnh này.

```
shopee-cli.py m3 --run <runId> --detach
shopee-cli.py run-info --run <runId>        # chờ M3 hết RUNNING
shopee-cli.py review-data --run <runId>     # kết luận bước 3
```

- Lấy qua dịch vụ lấy bình luận trên máy chạy lane, theo cách lấy đã chốt ở bước 0: số bình luận/link hoặc số trang/link, theo số sao hay chỉ bình luận có chữ.
- Lượt khác đang lấy thì lượt này chờ đến lượt.
- Lượt tạo bằng `new-run` (`request-v2`) ghi bình luận vào `m3-custom/attempts/<attemptId>/`, không vào `m3/`.
- **Cấm chạy `gate m3` cho lượt `request-v2`.** Lệnh đó chỉ đọc `m3/`, báo FAIL, và ghi đè `gates/m3.json` thành FAIL dù bước 3 đạt.
- Kết luận bước 3: `review-data` → `sources[]`. Mỗi nguồn có `kind`, `rowCount`, `gateVerdict`, `canSaveDb`, `sourceSha256`. Chỉ đi tiếp khi nguồn đó có `gateVerdict` = `PASS`. `run-info` → `execution.modules.M3.currentGate` là cùng cổng đó.
- Cổng của nguồn kiểm: lấy xong mọi link, mỗi link có ít nhất 1 bình luận, không vượt số bình luận (hoặc số trang) cho phép, không trùng mã bình luận, đúng các link của bước 2 (5 link ở đường 1 kỳ, 1–5 link ở đường cũ). `links_below_cap` chỉ là cảnh báo.
- Lấy thêm theo cách khác: `echo '<plan JSON>' | shopee-cli.py save-review-plan --run <runId> --stdin` → lấy `planSha256` → `shopee-cli.py m3 --run <runId> --plan-sha256 <sha> --detach`. Xem các lần lấy bằng `review-sampling --run <runId>`. Lần lấy thêm hỏng không làm hỏng bước 3 đã đạt.
- Dừng một lần lấy giữa chừng: `stop-review-attempt --run <runId> --kind custom --attempt <attemptId>`.
- Lỗi phải dừng: `HUMAN_LOGIN_REQUIRED`, `HUMAN_VERIFICATION_REQUIRED` (báo chủ), `SUBMISSION_UNCERTAIN` (không gửi lại, báo chủ).

## Bước 4. Lưu, Jev lọc, Jev gắn nhãn

Với lượt tạo bằng `new-run`, bước 4 **tự chạy** ngay khi bước 3 đạt. Không cần lệnh để bắt đầu.

```
shopee-cli.py review-process --run <runId>                                   # tiến độ, phí, cổng
shopee-cli.py process-review-data --run <runId> --source-sha256 <sha> --detach   # chỉ khi cần «Chạy tiếp»
shopee-cli.py review-insights --run <runId>                                  # kết quả
echo '{"sourceSha256":"<sha>","format":"labelled-json"}' | shopee-cli.py export-review-data --run <runId> --stdin
```

Sau `export-review-data`, lưu file theo mẫu ở dưới. Không chạy `read-review-export` trần: lệnh đó in toàn bộ bình luận ra màn hình và vào nhật ký của agent.

- `review-process` → `sources[]`, mỗi nguồn có `state` (`IDLE`, `NOT_APPLICABLE`, `RUNNING`, `PASS`, `FAIL`), `errorCode`, `canResume`, `fee`, `stages.save|filter|label` (tổng và số đã xong), `gates.in` và `gates.out`. Bước 4 chưa có lệnh `gate` riêng: cổng của bước 4 là `gates.in` và `gates.out`.
- Bước 4 đạt khi `state` = `PASS` và `gates.out` có kết luận `PASS`.
- `process-review-data` là nút «Chạy tiếp» của app. Chỉ chạy khi `canResume` = `true` (nguồn `FAIL` hoặc `NOT_APPLICABLE`), với `sourceSha256` lấy từ `review-data` → `sources[].sourceSha256`. Lệnh này tự làm cả lưu, lọc, gắn nhãn. Không cần `save-review-data` trước.
- Lưu: ghi bình luận của đúng nguồn `sourceSha256` vào DB.
- Jev lọc: 2 câu hỏi cho mỗi bình luận: có liên quan sản phẩm/đơn hàng không; có lời chê không.
- Jev gắn nhãn: 10 nhãn chung. Mỗi nhãn chọn khen / chê / cả hai / kể / chưa đánh giá / không nhắc. Bình luận đã có nhãn thì dùng lại, không gọi Jev lần hai.
- Chi phí: khoảng 1–1,5 USD cho 250 bình luận (lần chạy thử: 1,37 USD).
- Đầu ra cho người dùng: file JSON toàn bộ bình luận kèm nhãn (`labelled-json`). `export-review-data` trả `exportSha256`; `read-review-export` đọc nội dung file. Chỉ chạy lệnh đó theo mẫu dưới.
- File này chứa bình luận riêng. Khi lưu ra file:
  - Lưu vào một thư mục của người dùng, ngoài mọi repo và worktree Git.
  - Dùng tên file mới. Không ghi đè file đã có.
  - Chỉ chủ file được đọc (quyền 600).
  - Ghi vào file tạm trong cùng thư mục. Chỉ đổi tên khi lệnh đọc thành công. Lệnh đọc lỗi thì xóa file tạm và dừng.
  ```
  set -o pipefail; umask 077
  dir="<thư mục người dùng>"; out="$dir/<runId>-labelled.json"
  [ -e "$out" ] && { echo "file đã có, dừng"; exit 1; }
  tmp=$(mktemp "$dir/.<runId>-labelled.XXXXXX") || exit 1
  if shopee-cli.py read-review-export --run <runId> --export-sha256 <exportSha256> > "$tmp" && [ -s "$tmp" ]; then
    chmod 600 "$tmp" && mv -n "$tmp" "$out" && [ ! -e "$tmp" ] || { rm -f "$tmp"; echo "lưu lỗi, dừng"; exit 1; }
  else
    rm -f "$tmp"; echo "đọc lỗi, dừng"; exit 1
  fi
  ```
- Chạy lại bước 4 trên cùng nguồn: không gọi Jev lại.

## Báo cáo sau mỗi lượt

Một bảng: bước, PASS/FAIL, số chính (dòng Shopee bước 1, số link bước 2, số câu Jev bước 2, số bình luận/link bước 3, số bình luận đã gắn nhãn và phí bước 4), mã lỗi nếu có, `runId`.

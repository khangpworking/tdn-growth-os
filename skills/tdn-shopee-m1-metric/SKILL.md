---
name: tdn-shopee-m1-metric
description: Run the M1 Metric lookup module of the TDN Shopee module flow (request → Metric capture files → gate M1). Use when someone asks to «tra cứu Metric», run the Metric capture for one Shopee run, read the gate M1 slip, or find where the Metric capture rules live in the app code. Not for picking products or collecting Shopee reviews. Not for answering with numbers that have no capture.
---

# M1 Tra cứu Metric

M1 là module đầu của luồng Shopee: đọc yêu cầu của một lượt, chạy tra cứu Metric, ghi file thô. Luật nghiệp vụ nằm trong code app. Skill này chỉ nói đầu vào, một lệnh cần gọi, luật ở đâu, đầu ra và cách xử lý khi cổng chưa đạt.

## 1. Đầu vào

- Một lượt: thư mục `<runs root>/<runId>/`. Runs root mặc định là `~/.local/state/tdn-shopee-modules/runs`; biến `SHOPEE_FLOW_RUNS` đổi chỗ này.
- `request.json`, chuẩn `request-v1`: `format` = `"request-v1"`, `preset.keywords` (danh sách từ khoá), `windows[]` (mỗi cửa sổ có `id` và `period.startDate` / `period.endDate`), `reviewCapPerLink`. `captureSpec` và `principalTitles` là tuỳ chọn. (D10, R2)
- `captureSpec`: khi có, cổng vào kiểm cấu trúc; khi thiếu, cổng vào ghi cảnh báo `capture_spec_present` (`ok: false`, `got: "absent"`) và lượt vẫn qua. M1 thì luôn cần `captureSpec`: thiếu → `CAPTURE_SPEC_MISSING`, dừng trước khi gọi Metric. (R2)
- Phiếu cổng vào: `gates/entry.json`, chuẩn `handoff-v1`, phải có và phải `verdict` = `PASS`. Thiếu hoặc khác `PASS` → lệnh dừng với `GATE_NOT_PASSED`.
- Mã băm của `request.json` lúc chạy phải bằng `outputSha256` trên phiếu cổng vào. Khác → `GATE_INPUT_CHANGED`; file phải qua cổng lại.
- Chuẩn đầu ra của module: `metric capture files` (khai trong `modules.json`, mục `modules[M1].standard`).

## 2. Việc AI làm

Gọi đúng 1 lệnh, không mở trình duyệt, không tự đặt luật, không sửa file đầu ra:

```
python3 shopee_flow.py m1 --run <runId>
```

- `--detach` chạy lệnh ở nền, in `{ "format": "detached-v1", "runId", "pid" }` rồi thoát 0. Luật chặn chạy trước khi tách, nên lượt bị chặn vẫn trả 22, 23 hoặc 24 ngay.
- Lệnh tự kiểm phiếu bước trước, mã băm đầu vào, khóa chỉ-đọc và trạng thái lượt. AI không tự kiểm lại bằng tay.
- Không gọi thẳng `scripts/capture-metric-preset.ts`: script đó gọi Metric.
- Đọc kết quả theo exit code và `gates/m1.json`. Không đọc nội dung thô để tự kết luận.
- Không thử lại ở mức module (0 lần, xem mục 6). Lỗi thì dừng và báo.

## 3. Quy tắc nghiệp vụ

Mỗi dòng là một luật, kèm chỗ ở trong code hoặc tham số.

1. Lượt tra cứu chờ app rảnh: khi bảng `research_automation_autorun` còn dòng phase `CAPTURE`, phase_state `RUNNING`, script mở DB chỉ-đọc, in thông báo và chờ 5 giây, lặp đến khi bằng 0. Không có giới hạn số lần chờ. (`scripts/capture-metric-preset.ts` → `main`)
2. Không ghi đè thư mục cũ: `mkdir` không đệ quy nên thư mục đầu ra đã có thì lỗi; bộ chạy dời thư mục cũ sang `run1.failed-<n>` trước khi ghi. (`scripts/capture-metric-preset.ts` → `main`; `src/modules/analysis/research-automation/metric-capture-runner.ts` → `moveAside`)
3. Thư mục đầu ra không được nằm trong kho app hoặc 2 thư mục dữ liệu của app (`~/.local/state/tdn-growth-os`, `~/.local/share/tdn-growth-os`); sai chỗ → `CAPTURE_OUTPUT_FORBIDDEN`. (`scripts/capture-metric-preset.ts` → `main`)
4. File spec phải qua JSON Schema và luật cửa sổ của app: `windows[0]` id `30d` bước 7 ngày, `windows[1]` id `12m` bước 30 ngày, cùng ngày kết thúc; 4 danh mục con; từ khoá NFC, trim, không trùng. Công thức cửa sổ ở `modules.json` → `params.windows` (R5): `30d` bắt đầu 29 ngày trước ngày kết thúc, `12m` bắt đầu 364 ngày trước, tính cả hai đầu. Sai → `CAPTURE_PRESET_INVALID`. (`src/modules/analysis/research-automation/metric-v3-capture-spec.ts` → `validateMetricV3CaptureSpec`)
5. Script không tự đặt từ khoá hay kỳ: lệnh M1 chép `request.captureSpec` (do `new-run` dựng từ preset và `params.windows`) ra `capture-spec.json` ở thư mục lượt, rồi chạy. Thiếu `captureSpec` → `CAPTURE_SPEC_MISSING`, dừng trước khi gọi Metric. (R2, R5)
6. Kỳ của spec phải nằm trong kỳ yêu cầu. Ra ngoài → `PERIOD_OUTSIDE_RUN`. (`metric-capture-runner.ts` → `runPresetCapture`)
7. Smart query phải bật và phải được trang đọc lại trong manifest (`appliedFilters.smartQuery === true`). Không đọc lại được → `CAPTURE_SMART_QUERY_OFF`. (`metric-capture-runner.ts` → `smartQueryApplied`, `runPresetCapture`)
8. Khoá env `TDN_METRIC_OPENCLI_ENABLED` phải đúng `1`; thiếu → `EXECUTOR_DISABLED`. (`metric-capture-runner.ts` → `runPresetCapture`, trường `enabledEnv`)
9. Một lần chạy có ngân sách `METRIC_CAPTURE_TIMEOUT_MS` = 1.620.000 ms (1500 giây cho adapter cộng 120 giây dư). (`metric-capture-runner.ts`)
10. Mất đăng nhập Metric: mã `CAPTURE_LOGIN_REQUIRED`; script in dòng `DECISION NEEDED: The owner must log in before capture can continue.` (`scripts/capture-metric-preset.ts` → `main().catch`; mã trong `metric-v3-capture-spec.ts` → `METRIC_V3_STOP_CODES`)
11. Số lần thử lại ở mức module là 0. (`modules.json` → `params.moduleRetries`; owner F513)
12. Trần bình luận mỗi link là 1 đến 300, mặc định 300. (`modules.json` → `params.reviewCapPerLink`; cổng vào kiểm `review_cap_1_300`; D3)
13. Bộ chạy preset không dùng vòng thử lại kỳ của đường tự động cũ; mỗi lần gọi chỉ chạy một lần. (`metric-capture-runner.ts` → `runPresetCapture`)

## 4. Đầu ra

- Thư mục `m1/` đúng những gì `scripts/capture-metric-preset.ts` ghi (D9, T5): `m1/spec.json`; một thư mục mã UUID do bộ chạy sinh, bên trong là `spec.json` và `run1/`; `run1/` có `manifest.json` và một thư mục mỗi cửa sổ (ví dụ `30d/`, `12m/`), mỗi thư mục có `raw-responses.json` và `manifest.json`. Cổng M1 cũng nhận các bản chiếu cũ có manifest gốc ngay trong `m1/`.
- Mã băm thư mục `m1/` là băm đệ quy: sắp các dòng `<đường dẫn tương đối kiểu posix>\t<sha256 của file>\n` theo đường dẫn, rồi băm chuỗi đó. Mã băm một file là SHA-256 nguyên byte của file, chữ thường. (D9)
- Phiếu `gates/m1.json` (chuẩn `handoff-v1`). Khi `PASS`, trường `next` là `M2`. Phiếu chỉ chứa số đếm, mã băm, phiên bản và trạng thái.

## 5. Kiểm tra

Lệnh cổng:

```
python3 shopee_flow.py gate m1 --run <runId>
```

Exit code: `0` PASS, `20` FAIL, `21` WAIT_OWNER, `22` GATE_NOT_PASSED, `23` GATE_INPUT_CHANGED, `24` RUN_BUSY, `2` sai cách gọi hoặc không thấy thư mục lượt.

Phép kiểm của cổng M1 (hợp đồng mục 8):

- `capture_success`: lượt tra cứu báo thành công.
- `files_readable`: mỗi cửa sổ có `raw-responses.json` và `manifest.json` đọc được.
- `has_shopee_rows`: mỗi cửa sổ có ít nhất 1 dòng Shopee.
- `period_matches`: kỳ của từng cửa sổ bằng kỳ của yêu cầu.
- `masked_ids`: cảnh báo. `got` = số mã Shopee khác nhau có tiền tố `1__` và dấu `[REDACTED` trong các cửa sổ. Cảnh báo không đổi kết luận. (R3)

Mã chặn của luồng (hợp đồng mục 7, không phải mã app):

- `GATE_NOT_PASSED`: phiếu bước trước thiếu hoặc không `PASS`. Dừng, không chạy phép kiểm nào khác.
- `GATE_INPUT_CHANGED`: `request.json` đã đổi sau cổng vào. Dừng, báo chạy lại cổng vào.
- `RUN_BUSY`: lượt đang chạy với pid còn sống. Dừng. Lượt chạy với pid đã chết thì lệnh đánh dấu `STOPPED` + `RUN_INTERRUPTED` rồi đi tiếp.
- `READONLY_ON`: khóa chỉ-đọc đang bật (`TDN_SHOPEE_FLOW_READONLY=1` hoặc file `<state>/shopee-flow/READONLY`). Dừng. Không tự gỡ khóa.

Bảng mã lỗi app:

| Mã lỗi (nguồn) | AI làm gì | Chuyển cho người khi |
|---|---|---|
| `CAPTURE_LOGIN_REQUIRED` (`metric-v3-capture-spec.ts`, `metric-capture-runner.ts`) | Dừng. Không thử lại. | Luôn: owner đăng nhập Metric rồi chạy lại M1. |
| `CAPTURE_ACCESS_RESTRICTED` (`metric-v3-capture-spec.ts`) | Dừng. Không thử lại. | Luôn: owner xử lý bước xác minh của Metric. |
| `CAPTURE_UI_CHANGED` (`metric-v3-capture-spec.ts`) | Dừng, giữ mã lỗi. | Luôn: người phụ trách kiểm trang Metric (ngôn ngữ trang, OpenCLI). |
| `CAPTURE_PERIOD_NOT_SELECTABLE`, `PERIOD_OUTSIDE_RUN` (`metric-v3-capture-spec.ts`, `metric-capture-runner.ts`) | Dừng. Không thử kỳ khác. | Luôn: owner chọn kỳ khác cho lượt. |
| `CAPTURE_SMART_QUERY_OFF` (`metric-capture-runner.ts`) | Dừng. | Luôn: người phụ trách bật Smart query trên trang Metric. |
| `EXECUTOR_DISABLED`, `EXECUTOR_NOT_CONFIGURED` (`metric-capture-runner.ts`) | Dừng. | Luôn: owner kiểm cấu hình bộ chạy Metric. |
| `CAPTURE_OUTPUT_FORBIDDEN` (`scripts/capture-metric-preset.ts`) | Dừng. Không tự đổi chỗ ghi. | Luôn: người phụ trách kiểm thư mục lượt. |
| `CAPTURE_GUARD_UNAVAILABLE` (`scripts/capture-metric-preset.ts`) | Dừng. | Luôn: người phụ trách kiểm DB của app. |
| `CAPTURE_PRESET_INVALID`, `CAPTURE_INPUT_INVALID`, `CAPTURE_ARGUMENTS_INVALID` (`metric-v3-capture-spec.ts`, `metric-capture-runner.ts`, `scripts/capture-metric-preset.ts`) | Dừng. Không sửa file tay. | Luôn: owner kiểm `request.json` và spec của lượt. |
| `CAPTURE_SPEC_MISSING` (lệnh M1) | Dừng trước khi gọi Metric. Không tự dựng spec. | Luôn: owner tạo lại lượt bằng `new-run` hoặc bổ sung `captureSpec`. |
| `CAPTURE_FAILED`, `TIMEOUT` (`metric-capture-runner.ts`) | Dừng. 0 lần thử lại. | Luôn: báo mã lỗi và thời điểm chạy. |
| `SHOPEE_REVIEW_*` | Không thuộc M1. | Bỏ qua; đó là mã của M3. |

Bảng chuyển cho người — chỉ mã của M1 trong `modules.json` → `params.handToOwnerCodes` (D4):

| Mã | File app | AI làm gì | Chuyển cho người |
|---|---|---|---|
| `CAPTURE_LOGIN_REQUIRED` | `metric-v3-capture-spec.ts` (bộ mã dừng), `metric-capture-runner.ts` | Dừng. Không thử lại. | Owner đăng nhập Metric rồi chạy lại M1. |
| `CAPTURE_ACCESS_RESTRICTED` | `metric-v3-capture-spec.ts` | Dừng. Không thử lại. | Owner xử lý bước xác minh của Metric. |
| `METRIC_LOGIN_REQUIRED` | `autorun-derive.ts` (`CAPTURE_STOP_CODE_SET`), `metric-opencli-executor.ts` | Dừng. Không thử lại. | Owner đăng nhập Metric rồi chạy lại M1. |
| `METRIC_CAPTCHA` | `autorun-derive.ts` (`CAPTURE_STOP_CODE_SET`), `metric-opencli-executor.ts` | Dừng. Không thử lại. | Owner xử lý xác minh của Metric. |

Cổng trả `WAIT_OWNER` khi mã lỗi nằm trong `params.handToOwnerCodes`. Mã ngoài bảng trên không đổi kết luận sang `WAIT_OWNER`.

## 6. Phiên bản

- Skill `tdn-shopee-m1-metric`, phiên bản `1.0.0`. Giá trị này phải bằng `modules.json` → `modules[M1].skillVersion`, và bằng `skillVersion` trên phiếu.
- Bản luật code: không có (`modules.json` → `modules[M1].ruleVersion` = `null`).
- File code chịu trách nhiệm: `scripts/capture-metric-preset.ts`; `src/modules/analysis/research-automation/metric-capture-runner.ts`; `src/modules/analysis/research-automation/metric-v3-capture-spec.ts`.
- Số lần thử lại module `0`, trần bình luận mỗi link `1..300`: sửa trong `modules.json`, không sửa code.

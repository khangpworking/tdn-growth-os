# Chuyển quy tắc nghiệp vụ sang OpenSpec

> Bắt đầu 24/10/2026. Nhánh `docs/openspec-baseline`, từ `main` tại `14d33f64` (PR #369).

## 1. Đã làm gì

Lần đầu (24/10/2026) chỉ **thêm file mới**. Cùng ngày, chủ duyệt bước chuyển hẳn: các bước 1 đến 4 của mục 4 đã làm và sửa file cũ (có bản chụp ở `docs/outdated/2026-10-24/`). Không file nào bị xóa hay đổi tên.

| File mới | Nội dung | Chép từ |
| --- | --- | --- |
| `openspec/specs/market-report/spec.md` | R-M01 đến R-M32 | `docs/business-spec/business-rules/market.md` bản 1.0 |
| `openspec/specs/insight-report/spec.md` | R-I01 đến R-I28 | `docs/business-spec/business-rules/insight.md` bản 1.0 |
| `openspec/specs/report-language/spec.md` | R-L01 đến R-L19 | `docs/business-spec/business-rules/report-language.md` bản 1.0 |
| `openspec/specs/report-pipeline/spec.md` | Luồng mã của Market và Insight: file, hàm, cổng, cờ | Đọc mã tại `14d33f64` |
| `openspec/specs/report-metrics/spec.md` | 13 chỉ số và 29 cách đo (DT-1 đến TK-2), quy tắc so và cộng | `docs/business-spec/semantic-layer/metrics.md` bản 21/10/2026 |
| `openspec/reference/` | Bản chép nguyên văn của `fields.md`, `source-methods.md` và thư mục `data-sources/`, kèm `README.md` | `docs/business-spec/semantic-layer/`, `docs/business-spec/data-sources/` |
| `openspec/changes/market-owner-decisions-2210/` | Đề xuất: đưa quyết định của chủ ngày 22/10 vào quy tắc và mã | Quyết định của chủ 22/10 (quy chuẩn dữ liệu đầu vào 1.42, 1.43) |
| `openspec/config.yaml` | Ngữ cảnh dự án và luật viết cho agent | Mới |
| `.claude/`, `.agents/`, `.opencode/` | Lệnh `/opsx:*` và skill OpenSpec cho Claude, Codex, OpenCode | `openspec init` bản 1.15.0 |

Mã quy tắc (R-M…, R-I…, R-L…) giữ nguyên, để mọi link cũ vẫn đúng.

## 2. Chưa làm gì (cố ý)

- `semantic-layer/`, `data-sources/`, `decisions/` còn ở `docs/business-spec/` và vẫn là nguồn. Bản chép ở `openspec/reference/` chỉ để tham chiếu. `metrics.md` đã thành spec `report-metrics`; bản gốc vẫn còn.
- Bước 5 và 6 của mục 4 (kiểm thử liên kết spec, job CI chống lệch) chưa làm. Đó là mã, thuộc PR 0 của phiên mã kiến trúc.
- Không đổi mã app, không đổi kiểm thử, không triển khai.
- Hai change đang chờ chủ (`market-owner-decisions-2210`, `report-ranking-words`) còn câu "sửa `docs/business-spec/business-rules/*.md`" trong `tasks.md`. Các file đó nay là stub. Khi change được duyệt, sửa spec trong `openspec/specs/` thay cho file stub.

## 3. Trong giai đoạn chuyển

```mermaid
flowchart LR
  A[Đổi quy tắc] --> B{Đã chốt chuyển hẳn?}
  B -- chưa --> C[Sửa cả business-spec và openspec trong cùng một PR]
  B -- rồi --> D[Chỉ dùng openspec/changes, rồi archive]
```

- Hai nơi nói khác nhau: báo cho chủ, không tự chọn.
- Quyết định mới của chủ: viết thành một change trong `openspec/changes/`, không sửa thẳng `openspec/specs/`.

## 4. Để chuyển hẳn (chủ duyệt 24/10/2026; bước 1 đến 4 xong, bước 5 và 6 chờ phiên mã)

1. (Xong 24/10/2026) `docs/business-spec/README.md`: đổi "business-spec thắng" thành "openspec/specs thắng"; các file `business-rules/*.md` thành stub có link.
2. (Xong 24/10/2026) `docs/REPOSITORY_MAP.md`: bỏ dòng cấm cài spec framework, thêm dòng `openspec/`.
3. (Xong 24/10/2026) `AGENTS.md`: thêm một đoạn "Quy tắc nghiệp vụ ở openspec/specs; việc mới bắt đầu bằng /opsx:propose".
4. (Xong 24/10/2026) Chụp bản cũ vào `docs/outdated/<ngày>/` theo luật hiện có. Bản chụp ở `docs/outdated/2026-10-24/`.
5. (Chưa làm; PR 0 của phiên mã kiến trúc) Thêm một kiểm thử trong `npm test`: mọi file và hàm ghi ở dòng "Mã kiểm" của `openspec/specs` phải có thật trong mã (bắt lỗi kiểu R-M24 trỏ sai đường dẫn). Khoảng 1 giây.
6. (Chưa làm; PR 0 của phiên mã kiến trúc) Thêm một job CI nhỏ: PR đổi một trong 4 file luật bằng mã (`market-business-gate.ts`, `market-14-rules.ts`, `report-visible-text-lint.ts`, `reader-report/lint.ts`) mà không đổi `openspec/` thì trượt. Thoát bằng nhãn `skip-spec-drift` khi chỉ đổi tên hoặc sửa tốc độ. Khoảng 10 giây, chạy song song với `Check`.
7. Không thêm hook chặn commit (chỉ chặn được Claude) và không thêm cảnh báo chiều ngược (spec đổi mà mã không đổi): lợi ích nhỏ.

## 5. Cách quay lại

- Chưa gộp vào `main`: xóa nhánh `docs/openspec-baseline`. Không còn dấu vết.
- Đã gộp: `git revert` commit gộp. Hoặc xóa các thư mục `openspec/`, `.claude/`, `.agents/`, `.opencode/` và lấy lại các file docs đã sửa từ `docs/outdated/2026-10-24/`.

## 6. Điểm lệch đã thấy khi chuyển

| Điểm | business-spec (21/10) | Chủ nói sau đó | Mã app |
| --- | --- | --- | --- |
| Cộng hai sàn | R-M07, R-M16, R-L04: cấm | 22/10: cho phép, "giờ tôi cho phép cộng như metric" | Còn cấm (`U32_NO_CROSS_PLATFORM_TOTAL`) |
| Mã chỉ số (DT-1, LB-1…) trong báo cáo | Không nói | 22/10: bỏ khỏi báo cáo gửi đọc | Chưa kiểm |
| Tên "giá thật" | Không nói | 22/10: đổi thành "giá bán trung bình" | Chưa đổi |

Ba điểm này nằm trong change `market-owner-decisions-2210`, ở trạng thái **đề xuất, chờ chủ duyệt**.

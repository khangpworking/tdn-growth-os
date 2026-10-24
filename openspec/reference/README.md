# Bản chép tham chiếu

Thư mục này giữ bản chép nguyên văn của một số tài liệu trong `docs/business-spec/`. Mục đích: để người dùng OpenSpec đọc cùng chỗ với `openspec/specs/`. Ngày chép: 24/10/2026.

| Bản chép | Chép từ |
| --- | --- |
| [fields.md](fields.md) | `docs/business-spec/semantic-layer/fields.md` |
| [source-methods.md](source-methods.md) | `docs/business-spec/semantic-layer/source-methods.md` |
| [data-sources/](data-sources/) | `docs/business-spec/data-sources/` (input-standard.md, input-standard-technical.md, source-status.md) |

## Quy tắc

- Bản gốc trong `docs/business-spec/` vẫn là nguồn sự thật. Bản chép ở đây không được sửa tay.
- Khi bản gốc đổi, chép lại cả file. Nếu hai bản khác nhau, bản gốc đúng.
- Link tương đối bên trong các file chép có thể không dùng được, vì thư mục đã đổi độ sâu. Mở bản gốc để theo link.
- Từ điển chỉ số (`semantic-layer/metrics.md`) không chép ở đây. Nó đã thành spec [report-metrics](../specs/report-metrics/spec.md).
- Sẽ chuyển hẳn các tài liệu này vào `openspec/` ở một lần sau. Khi đó bản gốc thành stub, theo luật của `docs/outdated/`.

Xem thêm `openspec/MIGRATION.md`.

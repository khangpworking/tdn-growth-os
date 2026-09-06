# Bản đồ repository

| Vị trí | Vai trò |
|---|---|
| src/modules/{foundation,analysis,orchestrator,flow,governance} | Năm Box nghiệp vụ |
| src/platform/{db,jobs,artifacts,ai,auth,configuration,logging} | Cơ chế dùng chung |
| src/web, src/worker, frontend | Web/worker và giao diện |
| contracts/, migrations/, prompts/ | JSON Schema, SQL versioned và prompt runtime |
| agents/, templates/, gates/ | Phân công, handoff và kiểm tra theo rủi ro |
| skills/ | Descriptor khai báo cho capability đã đăng ký; registry tĩnh trong code là allowlist runtime authoritative |
| references/, data/, examples/ | Tài liệu nguồn, dataset/config an toàn và ví dụ |
| tests/ | Kiểm thử behavior code |
| evals/ | Chất lượng đầu ra nghiệp vụ/AI |
| benchmarks/ | So sánh case cố định khi có nhu cầu đo |
| experiments/ | Spike giới hạn; production không import |
| observations/ | Tín hiệu, lỗi và nhu cầu đã làm sạch |
| decisions/ | Index quyết định; ADR canonical ở docs/adr |
| scripts/, tools/ | Lệnh workflow và công cụ maintainer |
| docs/ | Plan, status, task và operating docs |

Không có SKILL.md ở root: đây là ứng dụng, không phải một skill. Descriptor con dưới `skills/` chỉ mô tả capability đã đăng ký và không được load như code hoặc authority. AGENTS.md là entry point coding dùng chung; CLAUDE.md trỏ tới đó.
Không cài thêm Spec Kit/OAC/QMD/agent framework trong scaffold. Các pattern đã chọn được áp dụng bằng tài liệu nhỏ.
Evals/results, benchmark results và experiments được bổ sung theo nhu cầu; folder có placeholder không chứng minh đã chạy kiểm thử.


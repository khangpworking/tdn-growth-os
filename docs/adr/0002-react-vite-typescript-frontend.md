# ADR 0002 — React + Vite + TypeScript cho frontend

Trạng thái: **Accepted — quyết định trực tiếp của chủ dự án**.
Ghi nhận: 2026-09-11.

## Quyết định

Frontend mới dùng React + Vite + TypeScript. Đây là lựa chọn stack, không phải yêu cầu chuyển đổi backend hoặc viết lại Content Studio.

Quyết định này thay thế phần lựa chọn vanilla TypeScript/Bootstrap và phần loại React khỏi v1 trong baseline `ARCHITECTURE.md`/ADR 0001. Các ranh giới module, ownership, runtime Node.js, SQLite, Fedora và contract JSON Schema/AJV vẫn giữ nguyên. Bản brief kiến trúc gốc được giữ để truy vết.

## Bối cảnh và hệ quả

- Chủ dự án cần giao diện sinh động, diễn giải dữ liệu qua chart/visual và thao tác theo workflow.
- Content Studio hiện tại là HTML/CSS thuần theo xác nhận của chủ dự án. Chỉ tái sử dụng phần phù hợp sau khi kiểm tra; không giả định đã có React component hoặc API tương thích.
- React quản lý giao diện và trạng thái tương tác; quyết định, quyền hạn, concurrency và validation vẫn thuộc backend.
- Vite là công cụ phát triển/build frontend, không thay Node.js làm runtime backend.
- Chưa chọn thư viện UI/chart, router, state store hoặc HTTP framework mới. Không tự thêm nhiều framework nhằm phục vụ nhu cầu chưa có.
- Không chọn Bun, FastAPI, Streamlit hoặc Supabase chỉ vì đã thảo luận về chúng.

## Phạm vi lượt công việc

Ghi nhận sản phẩm và brief UX trước. Chưa tạo frontend scaffold, dependency, API, authentication, migration hay deployment. Mockup tiếp theo chỉ minh họa UI và synthetic data, không cấp quyền thực hiện quyết định thật.

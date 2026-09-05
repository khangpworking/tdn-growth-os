# ADR 0001 — Baseline và repository mới

Status: Accepted from owner-provided baseline, 2026-09-05.

## Context

Chủ dự án yêu cầu repo riêng và cung cấp ARCHITECTURE.md. Tài liệu trước đề xuất Research Warehouse riêng và Pi bắt buộc.

## Decision

Áp dụng brief mới: modular monolith TypeScript, năm Box, một authoritative SQLite, process web/worker riêng, JSON Schema/AJV và AiGateway giới hạn.
Repo/database mới tách khỏi deployment cũ; không migration legacy. Tái sử dụng code đã kiểm tra có chọn lọc.
Pi, DuckDB và PostgreSQL theo trigger trong brief.
Orca là công cụ phát triển, không thay thế nghiệp vụ Box 3.

## Alternatives

Tiếp tục thêm vào repo cũ hoặc tạo DB riêng từng Box. Không chọn vì yêu cầu repo mới và baseline một store.

## Consequences

Phần trăm cũ không phải tiến độ repo mới. Driver, dependency version và code reuse cần inventory.
Mốc tuần 6 chỉ là walking skeleton, không là hoàn thành v1.

## Revisit

Đổi authoritative store, topology, trust boundary hoặc có migration trigger được chứng minh.


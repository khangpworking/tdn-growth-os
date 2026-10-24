## MODIFIED Requirements

### Requirement: R-P02 Worker là máy trạng thái của lần chạy
Worker SHALL xử lý lần chạy qua ba bước `QUICK_SEARCH`, `COLLECTION`, `REPORTS`, theo thứ tự đó. Trạng thái cuối là một trong `DRAFT_READY`, `FAILED`, `CANCELLED`, `INTERRUPTED`.

- Mã: RA `worker.ts` (`ResearchAutomationWorker`), RA `service.ts` (`ResearchAutomationService.processNext`, `recoverOnStart`, `#executeSource`, `#executeReports`, `#persistSourceResult`), RA `model.ts` (`TERMINAL_STATUSES`).
- Bảng: `analysis_research_automation_runs`, `_requests`, `_steps`, `_captures`, `_usage`, `_outputs` (migration 0038).

#### Scenario: Khởi động lại giữa chừng
- **WHEN** ứng dụng khởi động lại khi một lần chạy đang ở giữa một bước
- **THEN** `recoverOnStart` xử lý lần chạy đó trước khi nhận việc mới

#### Scenario: Hủy lần chạy
- **WHEN** chủ gửi `cancel`
- **THEN** lần chạy về `CANCELLED`; dữ liệu đã thu và các dòng nhật ký chi phí được giữ lại, kể cả dữ liệu về muộn sau khi hủy (quyết định U-26 ngày 11/10/2026, chủ sửa ngày 24/10/2026: không xóa dữ liệu dở)

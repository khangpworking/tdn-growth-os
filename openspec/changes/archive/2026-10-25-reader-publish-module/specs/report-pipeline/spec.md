## MODIFIED Requirements

### Requirement: R-P10 Reader dựng bản đọc qua cổng
Reader SHALL dựng bản đọc Market chỉ khi bản đó qua kiểm biểu đồ Flint, cổng Market và lint của Reader, theo thứ tự đó. Khi `built.visibleTextRules` bật, Reader SHALL kiểm thêm 14 quy tắc máy sau cổng Market và trước lint của Reader. Biểu đồ số nền được phép dùng SVG dự phòng; `flint: false` là tùy chọn bỏ yêu cầu Flint trong kiểm thử.

- Mã: RA `reader-report-revisions.ts` (`AutomationReaderReports.build`, `buildInsight`, `buildTikTok`, `buildShopee`, `decide`). Insight, TikTok, Shopee: `publishInsightFamilyRevision` ở RA `reader-publish.ts` giữ thử lại theo mã yêu cầu, chặn khi bản mới nhất đã duyệt, giới hạn cỡ, gọi `publishReaderReport` và giao dịch lưu bản sửa. Market: `buildMarketReport` ở RR `market-template.ts`; khi có nguồn review công khai thì gọi `buildMarketReportV2` ở RR `market-template-v2.ts`. Sau đó `assertFlintCharts`; rồi `publishMarketRevision` ở RA `reader-publish.ts` gọi `assertMarketBusinessGate`, `assertMarket14MachineRules` khi `built.visibleTextRules` bật (qua `checkMarketReport`), rồi `publishReaderReport` ở RR `build.ts` (lỗi `ReaderReportGateError`, chạy RR `lint.ts`) và giao dịch lưu bản sửa.
- Phiên bản: `reader-report-market-v3` / `v4` / `v5`; Insight `reader-report-insight-v9`, TikTok `reader-report-insight-tiktok-v1`, Shopee `reader-report-insight-shopee-v1`.
- Bảng: `analysis_reader_report_revisions`, `analysis_reader_report_decisions` (0048, 0050).
- Quy tắc liên quan: R-L16.

#### Scenario: Biểu đồ không phải Flint
- **WHEN** bản đọc Market có biểu đồ mẫu SVG viết tay thay vì Flint và không bật tùy chọn kiểm thử `flint: false`
- **THEN** Reader không xuất bản bản đọc

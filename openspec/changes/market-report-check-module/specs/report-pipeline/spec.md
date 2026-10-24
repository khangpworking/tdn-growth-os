## MODIFIED Requirements

### Requirement: R-P07 Cổng máy chặn báo cáo Market trượt
Hệ thống SHALL chạy cổng Market trên HTML nháp loại `MARKET`, và SHALL làm lần dựng lỗi với mã `MARKET_BUSINESS_GATE_FAILED:<các mã cổng>` khi có quy tắc trượt.

- Mã: một chỗ kiểm RA `market-report-check.ts` (`checkMarketReport`, `assertMarketReport`) chọn kiểm nào chạy và theo thứ tự nào. Bản nháp trình bày (RA `reports.ts`, ngữ cảnh `DRAFT_PRESENTATION`): kiểm chữ nhìn thấy, cổng Market, 14 quy tắc, rồi tên F1/W6 khi có review công khai. Bản nháp khác (`DRAFT_PLAIN`): chỉ tên F1/W6 khi có review công khai. Lần lưu (RA `service.ts` `#executeReports`, `STORED`, chỉ khi `kind === 'MARKET'`): cổng Market. Cổng: RA `market-business-gate.ts` (`auditMarketReportHtml`, `assertMarketBusinessGate`). Lint chữ nhìn thấy: `src/modules/analysis/report-visible-text-lint.ts` (`lintVisibleReportText`). Danh sách tên cấm: RR `lint.ts` (`FORBIDDEN_PROVIDER_NAMES`, `CAPTURED_PROVIDER_NAMES`).
- Mã kiểm: `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`, `assertMarketReport`)
- Mã cổng và quy tắc: xem R-M15 đến R-M26.
- Kiểm thử: `tests/unit/gate-209-market-business.test.ts`, `tests/integration/gate-209-market-business.test.ts`, `tests/unit/c2-market-check-characterization.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: một chỗ kiểm, kết quả kiểm không đổi.

#### Scenario: Báo cáo có tổng hai sàn
- **WHEN** HTML Market có cụm "tổng hai sàn"
- **THEN** lần dựng lỗi với mã chứa `U32_NO_CROSS_PLATFORM_TOTAL`

#### Scenario: Báo cáo Insight
- **WHEN** HTML nháp thuộc loại `INSIGHT`
- **THEN** chỗ kiểm Market không chạy; lint chữ nhìn thấy chỉ chạy khi có `insightPersona`, hoặc `draftInsight` với snapshot mã hóa v3, v4 hay v5 (RA `reports.ts`)

### Requirement: R-P08 Kiểm 14 quy tắc trên báo cáo Market
Hệ thống SHALL chạy `auditMarket14` trên báo cáo Market dạng trình bày (`marketPresentation`) và bản đọc Market có `built.visibleTextRules`, và SHALL làm lần dựng lỗi với mã `MARKET_14_RULES_FAILED:<số quy tắc>` khi một quy tắc loại "Máy" trượt. Quy tắc loại "Bằng chứng" (6, 8, 14) luôn ghi "đạt" kèm chi tiết cho người đọc soát. Quy tắc 10 (ảnh bìa) là loại "Máy" khi bìa là ảnh ngoài, sai dạng, hoặc ảnh JPEG do AI tạo hợp lệ. Khi không có bìa AI hợp lệ và không có lỗi ảnh ngoài hay sai dạng, kể cả khi có bìa nhúng không phải do AI tạo, quy tắc 10 thành loại "Bằng chứng", ghi "chưa đạt" kèm chữ "READ" cho người đọc soát, và không làm lần dựng lỗi.

- Mã: RA `market-14-rules.ts` (`auditMarket14`, `assertMarket14MachineRules`). Số `result('1')` đến `result('14')` ứng với R-M01 đến R-M14. Bản nháp trình bày gọi `auditMarket14` qua RA `market-report-check.ts` (`checkMarketReport`), truyền kết quả cổng Market đã tính để quy tắc 4 và 7 đọc lại; không có kết quả đó thì `auditMarket14` tự chạy cổng như cũ.
- Mã kiểm: `src/modules/analysis/research-automation/market-14-rules.ts` (`auditMarket14`, `assertMarket14MachineRules`); `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`)
- Lệnh tay: `tsx scripts/audit-market-14.ts <report.html> [trace.md]` (không có trong npm scripts).
- Kiểm thử: `tests/unit/rules14-209-market-14.test.ts`, `market14-reader-only.test.ts`, `market14-pdf-citation.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: cổng chạy một lần trong bản nháp trình bày, kết quả kiểm không đổi.

#### Scenario: Ảnh bìa ngoài hoặc sai dạng
- **WHEN** bản đọc Market được kiểm 14 quy tắc có ảnh bìa trỏ ra ngoài, ảnh nhúng sai dạng, hoặc ảnh tự nhận do AI tạo không phải JPEG base64 có giới hạn và có chữ alt
- **THEN** lần dựng lỗi với `MARKET_14_RULES_FAILED:10`

#### Scenario: Thiếu ảnh bìa
- **WHEN** bản đọc Market không có ảnh bìa nhúng nào
- **THEN** quy tắc 10 có `kind: 'evidence'`, `ok: false`, chi tiết bắt đầu bằng "READ", và không làm lần dựng lỗi (RA `market-14-rules.ts`, `result('10', ...)`)

#### Scenario: Quy tắc bằng chứng
- **WHEN** `auditMarket14` chạy quy tắc 6
- **THEN** kết quả có `kind: 'evidence'` và không làm lần dựng lỗi

#### Scenario: Cổng chạy một lần trong bản nháp trình bày
- **WHEN** bản nháp Market trình bày được kiểm qua `checkMarketReport`
- **THEN** cổng Market chạy một lần và 14 quy tắc dùng kết quả đó; mã lỗi và thứ tự giống như trước

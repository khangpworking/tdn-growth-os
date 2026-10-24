## MODIFIED Requirements

### Requirement: R-P07 Cổng máy chặn báo cáo Market trượt
Hệ thống SHALL chạy cổng Market trên HTML nháp loại `MARKET` và trên bản đọc Market trước khi công bố, và SHALL làm lần dựng lỗi khi có quy tắc trượt: bản nháp với mã `MARKET_BUSINESS_GATE_FAILED:<các mã cổng>`; bản đọc với lỗi `ResearchAutomationValidationError` ghi lý do bằng tiếng Việt, không ghi mã (mã nằm trong `cause` của lỗi).

- Mã: một chỗ kiểm RA `market-report-check.ts` (`checkMarketReport`, `assertMarketReport`) chọn kiểm nào chạy và theo thứ tự nào. Bản nháp trình bày (RA `reports.ts`, ngữ cảnh `DRAFT_PRESENTATION`): kiểm chữ nhìn thấy, cổng Market, 14 quy tắc, rồi tên F1/W6 khi có review công khai. Bản nháp khác (`DRAFT_PLAIN`): chỉ tên F1/W6 khi có review công khai. Lần lưu (RA `service.ts` `#executeReports`, `STORED`, chỉ khi `kind === 'MARKET'`): cổng Market. Bản đọc (RA `reader-report-revisions.ts`, `READER` với `contractVersion`), theo bảng phiên bản:
  - `reader-report-build-v1`, `reader-report-build-v1.1`: cổng Market (không trình bày, có U13); không 14 quy tắc; lint Reader cũ (RR `build.ts` `publishReaderReport`, không U13).
  - `reader-report-build-v1.2`: cổng Market (không trình bày, có U13), rồi 14 quy tắc; lint Reader dùng lại kết quả U13 của chỗ kiểm (`visibleTextResults`), nên U13 chạy một lần.
  Lý do bằng lời: RA `market-check-reasons.ts` (`marketCheckReasons`, `readerLintReasons`), mỗi mã một câu. Cổng: RA `market-business-gate.ts` (`auditMarketReportHtml`, `assertMarketBusinessGate`). Lint chữ nhìn thấy: `src/modules/analysis/report-visible-text-lint.ts` (`lintVisibleReportText`), đọc chữ ẩn và trích dẫn qua `src/modules/analysis/report-visible-text.ts`. Danh sách tên cấm: `report-language` (R-L01).
- Mã kiểm: `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`, `assertMarketReport`)
- Mã cổng và quy tắc: xem R-M15 đến R-M26.
- Kiểm thử: `tests/unit/gate-209-market-business.test.ts`, `tests/integration/gate-209-market-business.test.ts`, `tests/integration/gate-209-reader-revision.test.ts`, `tests/unit/c2-market-check-characterization.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: một chỗ kiểm cho bản nháp và bản đọc; bản cũ giữ bộ kiểm cũ; chủ thấy lý do bằng lời (Q2).

#### Scenario: Báo cáo có tổng hai sàn
- **WHEN** HTML Market có cụm "tổng hai sàn"
- **THEN** lần dựng lỗi với mã chứa `U32_NO_CROSS_PLATFORM_TOTAL`

#### Scenario: Báo cáo Insight
- **WHEN** HTML nháp thuộc loại `INSIGHT`
- **THEN** chỗ kiểm Market không chạy; lint chữ nhìn thấy chỉ chạy khi có `insightPersona`, hoặc `draftInsight` với snapshot mã hóa v3, v4 hay v5 (RA `reports.ts`)

#### Scenario: Bản đọc trượt cổng
- **WHEN** bản đọc Market có tên nhà cung cấp
- **THEN** lỗi ghi "Trang có tên nhà cung cấp số liệu hoặc công cụ.", không ghi `G08_PROVIDER_NAME`; không có phiên bản mới nào được lưu

### Requirement: R-P08 Kiểm 14 quy tắc trên báo cáo Market
Hệ thống SHALL chạy `auditMarket14` trên báo cáo Market dạng trình bày (`marketPresentation`) và bản đọc Market phiên bản `reader-report-build-v1.2`, và SHALL làm lần dựng lỗi khi một quy tắc loại "Máy" trượt: bản nháp với mã `MARKET_14_RULES_FAILED:<số quy tắc>`, bản đọc với lý do bằng lời. Quy tắc loại "Bằng chứng" (6, 8, 14) luôn ghi "đạt" kèm chi tiết cho người đọc soát. Quy tắc 10 (ảnh bìa) là loại "Máy" khi bìa là ảnh ngoài, sai dạng, hoặc ảnh JPEG do AI tạo hợp lệ. Khi không có bìa AI hợp lệ và không có lỗi ảnh ngoài hay sai dạng, kể cả khi có bìa nhúng không phải do AI tạo, quy tắc 10 thành loại "Bằng chứng", ghi "chưa đạt" kèm chữ "READ" cho người đọc soát, và không làm lần dựng lỗi.

- Mã: RA `market-14-rules.ts` (`auditMarket14`, `assertMarket14MachineRules`). Số `result('1')` đến `result('14')` ứng với R-M01 đến R-M14. Bản nháp trình bày và bản đọc v1.2 gọi `auditMarket14` qua RA `market-report-check.ts` (`checkMarketReport`), truyền kết quả cổng Market đã tính để quy tắc 4 và 7 đọc lại; không có kết quả đó thì `auditMarket14` tự chạy cổng như cũ.
- Mã kiểm: `src/modules/analysis/research-automation/market-14-rules.ts` (`auditMarket14`, `assertMarket14MachineRules`); `src/modules/analysis/research-automation/market-report-check.ts` (`checkMarketReport`)
- Lệnh tay: `tsx scripts/audit-market-14.ts <report.html> [trace.md]` (không có trong npm scripts).
- Kiểm thử: `tests/unit/rules14-209-market-14.test.ts`, `market14-reader-only.test.ts`, `market14-pdf-citation.test.ts`.
- Vì sao: đánh giá kiến trúc c2, chủ duyệt 24/10/2026: cổng chạy một lần trong mỗi luồng; bản đọc v1 và v1.1 giữ bộ kiểm cũ.

#### Scenario: Ảnh bìa ngoài hoặc sai dạng
- **WHEN** bản đọc Market được kiểm 14 quy tắc có ảnh bìa trỏ ra ngoài, ảnh nhúng sai dạng, hoặc ảnh tự nhận do AI tạo không phải JPEG base64 có giới hạn và có chữ alt
- **THEN** lần dựng lỗi; bản nháp với `MARKET_14_RULES_FAILED:10`, bản đọc với lý do "Ảnh bìa không phải ảnh lưu sẵn hợp lệ."

#### Scenario: Thiếu ảnh bìa
- **WHEN** bản đọc Market không có ảnh bìa nhúng nào
- **THEN** quy tắc 10 có `kind: 'evidence'`, `ok: false`, chi tiết bắt đầu bằng "READ", và không làm lần dựng lỗi (RA `market-14-rules.ts`, `result('10', ...)`)

#### Scenario: Quy tắc bằng chứng
- **WHEN** `auditMarket14` chạy quy tắc 6
- **THEN** kết quả có `kind: 'evidence'` và không làm lần dựng lỗi

#### Scenario: Cổng chạy một lần trong bản nháp trình bày
- **WHEN** bản nháp Market trình bày được kiểm qua `checkMarketReport`
- **THEN** cổng Market chạy một lần và 14 quy tắc dùng kết quả đó; mã lỗi và thứ tự giống như trước

#### Scenario: Bản đọc cũ không chạy 14 quy tắc
- **WHEN** bản đọc phiên bản `reader-report-build-v1` hoặc `reader-report-build-v1.1` có nhãn kỹ thuật M01 trên trang
- **THEN** bản đọc vẫn được công bố; chỉ bản `reader-report-build-v1.2` trượt quy tắc 2

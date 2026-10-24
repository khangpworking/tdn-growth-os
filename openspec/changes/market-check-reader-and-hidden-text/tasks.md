## 0. Trước khi làm

- [x] 0.1 Chủ quyết định Q2 đến Q5 và tổng hai sàn (24/10/2026)
- [x] 0.2 c2 PR2 đã có chỗ kiểm Market cho bản nháp

## 1. Mã (một người viết mã)

- [x] 1.1 Ngữ cảnh `READER` theo phiên bản trong `market-report-check.ts`; `reader-report-revisions.ts` gọi nó; `build.ts` dùng lại U13 cho v1.2
- [x] 1.2 `official-statistics-lane.ts` gọi `marketSnippetWordingPasses`
- [x] 1.3 Bộ đọc chữ nhìn thấy chung `report-visible-text.ts` cho cổng, lint U13 và luật câu của khối nguồn
- [x] 1.4 Một danh sách cụm tổng hai sàn cho U32 và W3
- [x] 1.5 `M12_PROPOSAL_LABEL` đòi nhãn đầy đủ
- [x] 1.6 Lý do bằng lời khi bản đọc trượt kiểm (`market-check-reasons.ts`)
- [x] 1.7 Bản nháp M12 khi chưa có đề xuất AI (`synthesis-evidence-report.ts`) ghi nhãn đầy đủ "đề xuất, chờ chủ duyệt" (Q4, R-L14)
- [x] 1.8 `market-business-gate.ts` giữ `CROSS_PLATFORM_TOTAL_PHRASES` trỏ tới danh sách chung, để dòng "Mã kiểm" của R-M16 trong `openspec/specs` hôm nay vẫn đúng

## 2. Kiểm thử (phiên khác người viết mã)

- [x] 2.1 Đổi các dòng `TODAY:` và hai chỗ ghim thông báo, mỗi chỗ một dòng lý do
- [x] 2.2 Ca theo dòng hợp đồng cho ngữ cảnh `READER`, chữ ẩn, danh sách tổng, nhãn M12, lý do bằng lời; mỗi ca có ca đối chứng âm
- [x] 2.3 Chạy lại trên báo cáo thật đã lưu; danh sách đổi theo quy tắc gửi chủ
- [ ] 2.4 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 `/opsx:archive` change này; spec `report-language`, `market-report`, `report-pipeline` nhận các thay đổi
- [ ] 3.2 Khi spec nhận R-M16 mới, dòng "Mã kiểm" đổi từ `CROSS_PLATFORM_TOTAL_PHRASES` (trong `market-business-gate.ts`) sang `crossPlatformTotalMatches` (trong `report-language/cross-platform-total.ts`); sau đó bỏ hằng trỏ trong `market-business-gate.ts`

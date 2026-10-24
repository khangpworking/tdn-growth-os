## 0. Trước khi làm

- [x] 0.1 Chủ quyết định c3 (24/10/2026)
- [x] 0.2 PR1: kiểm thử mô tả hành vi hiện nay của bốn họ dựng bản đọc

## 1. PR2: tách mô-đun, không đổi hành vi

- [x] 1.1 RA `reader-publish.ts`: thử lại đúng hoặc xung đột, chặn khi bản mới nhất đã duyệt (trước và trong giao dịch), giới hạn cỡ, `publishReaderReport`, bản ghi dựng, giao dịch, ánh xạ trigger `reader_report_requires_draft_ready_sequence`
- [x] 1.2 `buildInsight`, `buildTikTok`, `buildShopee` gọi mô-đun; dòng sổ tiêu thụ qua bước tùy chọn
- [x] 1.3 Kiểm thử mô tả PR1 xanh không đổi
- [ ] 1.4 Kiểm thử hợp đồng của mô-đun (phiên khác người viết mã)
- [ ] 1.5 CI Linux xanh tại SHA cuối

## 2. PR3: Market và các sửa hành vi

- [x] 2.1 Market `#build` gọi `publishMarketRevision` (sau c2 PR3); thử lại Market giữ như nay
- [x] 2.2 Market: kiểm duyệt trong giao dịch (D8), giới hạn cỡ HTML (D9); giữ kiểm duyệt sớm trước kiểm đầu vào
- [x] 2.3 TikTok/Shopee: kiểm phạm vi trang với `input.scope` (D3)
- [ ] 2.4 Hoãn: thử lại kiểm đúng họ báo cáo (D6); thử lại chặt nhất cho Market (b2, cần bộ kiểm bản ghi Market và kiểm thử dòng cũ)
- [x] 2.5a Dòng «row 4 Market» của kiểm thử mô tả: nay từ chối trang quá cỡ
- [ ] 2.5 Kiểm thử cho 2.2–2.3, mỗi ca có ca đối chứng âm (phiên khác người viết mã)
- [ ] 2.6 CI Linux xanh tại SHA cuối

## 3. Sau khi gộp

- [ ] 3.1 `/opsx:archive` change này; spec `report-pipeline` nhận dòng «Mã» mới của R-P10

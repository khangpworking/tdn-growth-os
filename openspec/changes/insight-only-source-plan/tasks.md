## 0. Trước khi làm

- [x] 0.1 Chủ quyết định nguồn cho lần chạy chỉ Insight (25/10/2026)
- [x] 0.2 Dò nguồn trên `main`: nguồn nào Insight đọc, nguồn nào chỉ Market đọc

## 1. P1: Metric tự chạy cho lần chạy chỉ Insight

- [x] 1.1 Chèn dòng auto-run khi `reports` có MARKET hoặc INSIGHT
- [x] 1.2 Giữ `CAPTURE`, `PREPARE`, `PICK`, `CONFIRM`, `WAIT_DRAFT`; lần chạy chỉ Insight đi `WAIT_DRAFT` → `DONE`, không `PRESENT`
- [x] 1.3 Lần chạy có MARKET giữ y các pha và byte
- [ ] 1.4 Kiểm thử (phiên khác người viết mã): lần chạy chỉ Insight tới `DONE`, lỗi thu dừng `STOPPED` và thử lại được, lần chạy Market không đổi

## 2. P2: bỏ làn chỉ Market đọc trên lần chạy chỉ Insight

- [ ] 2.1 Dùng lại `facts.market` cho xu hướng, bản đồ tỉnh, World Bank, UN Comtrade, thống kê chính thức, TikTok top ads, đọc video, quảng cáo Google, Meta tự động
- [ ] 2.2 Làn bị bỏ trả bước không đổi, `usage: []`; báo cáo Insight không in làn bị bỏ là lỗi hay thiếu
- [ ] 2.3 Kiểm thử (phiên khác người viết mã)

## 3. P3: PageIndex chỉ hỏi phần Market

- [ ] 3.1 Ước tính và kế hoạch câu hỏi chỉ dùng phần M, chỉ khi có MARKET; giữ y id, thứ tự, chữ, khóa cache của câu phần M
- [ ] 3.2 Kế hoạch rỗng không gọi PageIndex, không làm bước lỗi
- [ ] 3.3 Kiểm thử (phiên khác người viết mã)

## 4. Sau khi gộp

- [ ] 4.1 CI Linux xanh tại SHA cuối
- [ ] 4.2 `/opsx:archive` change này

## 0. Trước khi làm

- [x] 0.1 Đọc khai báo S19b và S29 chủ duyệt ngày 03/11/2026 và db-v1 §4.4, §4.5
- [ ] 0.2 Chủ duyệt change này

## 1. Mã (một người viết mã)

- [x] 1.1 Làn S19b `search-suggest-lane.ts`: cờ, chỉ Insight, tiền tố, trần 24/48, giãn 1 s, chờ tối đa 10 s, điều kiện dừng
- [x] 1.2 Làn S29 `ai-overview-lane.ts`: cờ, mã trang không có `text_blocks`, trần 2, khoá và sổ dùng SerpApi sẵn có
- [x] 1.3 Lưu byte gốc `application/json` cho hai làn; `#captureRecords` đọc được loại lần thu này
- [x] 1.4 Nối cờ trong `operator-app.ts`, `research-automation-api.ts`; ghi tài liệu cờ

## 2. Kiểm thử (lane Sol, phiên khác người viết mã) và hợp nhất

- [ ] 2.1 Kiểm thử theo R-G01 đến R-G06 với lớp truyền giả; mỗi ca có ca đối chứng âm; không gọi mạng thật
- [ ] 2.2 CI Linux xanh tại SHA cuối; rà soát độc lập
- [ ] 2.3 Merge khi chủ duyệt

## 3. Kết thúc

- [ ] 3.1 Ghi mã kiểm thật vào dòng «Mã kiểm» của R-G01 đến R-G06
- [ ] 3.2 `/opsx:archive` change `raw-db-g-collectors`

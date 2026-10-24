# Một module cho các làn thu thập của bước COLLECTION

> Trạng thái: **đề xuất**, theo đánh giá kiến trúc c1, chủ duyệt ngày 24/10/2026. PR1 đến PR3 không đổi byte đã lưu; chỉ PR4 sửa lỗi.

## Why

Mỗi làn thu thập (12 làn: 11 file làn và cổng tìm kiếm web) bị chép ở ba nơi trong RA `service.ts`: lượt gọi trong `#executeSource`, lượt lưu trong `#persistSourceResult`, và dòng chi phí trong giao dịch lưu cuối. Các bản chép đã lệch nhau (hai lỗi thật). Số thứ tự dòng chi phí (ordinal 2 đến 19) được phối hợp bằng tay qua nhiều file; trùng một số là hỏng cả lần lưu.

Quyết định của chủ (24/10/2026, nhận các khuyến nghị):
- b1 Một module với danh sách làn có thứ tự, ngay trong bước `COLLECTION`; không thêm hàng đợi (ADR 0006).
- b2 Hai nhóm làn quanh bước nhận từ khóa L9.
- b3 Mỗi làn giữ cổng Source riêng; mỗi làn một bộ chuyển nhỏ; không ép một dạng đầu vào chung.
- b4 Giữ mã tài liệu lỗi riêng của từng làn.
- b5 Một bảng ordinal và nhà cung cấp trong module, kiểm trùng lúc khởi động; truy vấn hoạt động của quảng cáo tìm kiếm đọc bảng này.
- b6 Giữ "chạy hết các làn rồi lưu một lần".
- b7 Chỉ sửa lỗi ở PR4.
- b8 Module trả các dòng cần ghi; service giữ một giao dịch lưu cuối.
- Không bỏ làn cho lần chạy chỉ Insight (câu hỏi Q2 ngoài phạm vi). Ghi chi phí khi máy dừng giữa chừng (Q4) là thay đổi sau.

## What Changes

- Thêm RA `collection-lanes.ts`: hợp đồng làn (đầu vào riêng, gọi một lần trong một try/catch, lưu capture theo thứ tự qua closure `putCaptures` của service, tài liệu của làn, kiểm bước và dòng dõi, tài liệu lỗi riêng, dòng chi phí; lượt ném lỗi cho một dòng `UNKNOWN` với ordinal và nhà cung cấp của làn), cổng "nguồn có cấu hình, chưa hủy, chỉ `COLLECTION`" (QUICK_SEARCH không chạy làn nào), bảng ordinal `COLLECTION_LANE_ORDINALS` kiểm trùng khi nạp module.
- PR1 chuyển World Bank, UN Comtrade, Cục Thống kê, quảng cáo tìm kiếm (gồm ordinal khám phá 17 đến 19 và truy vấn hoạt động). Các làn khác ở nguyên `service.ts`.
- Không đổi: thứ tự gọi, thứ tự và chỉ số capture, tài liệu bước, tài liệu lỗi, dòng chi phí, số lần gọi nhà cung cấp, cờ môi trường, giá trị mặc định, nhánh replay Kalodata trong `#persistUsage`, tên file PDF giữ lại (`source-N.pdf`).

## Spec deltas

PR1 không đổi yêu cầu nào. R-P04 nêu `#persistSourceResult` và các file làn; cả hai vẫn đúng (module chạy bên trong `#persistSourceResult`, file làn giữ nguyên). Không dòng "Mã kiểm" nào nêu ký hiệu bị chuyển. PR sau nếu đổi chuỗi gọi hoặc bảng ordinal mà một yêu cầu đã duyệt nêu tên thì thêm delta ở đây.

PR4 không đổi yêu cầu nào: không yêu cầu đã duyệt nào nêu dòng chi phí `UNKNOWN` hay việc ghi capture. Kịch bản "Một làn lỗi" của R-P04 (các làn khác vẫn được lưu) trước đây chưa đúng khi một làn không phải PDF lỗi ghi capture; PR4 làm mã khớp với kịch bản này.

## PR4 (chủ duyệt 24/10/2026)

- Q1: mọi làn ném lỗi ghi đúng một dòng `UNKNOWN` (ordinal và nhà cung cấp của làn); tìm kiếm mở rộng ném cả lượt ghi ordinal 4. Mục 13: nguồn sản phẩm ném lỗi khi bước dừng ngay cũng ghi dòng `UNKNOWN` ordinal 0. Tải PDF ném lỗi không ghi (M3).
- Lỗi 2: chuỗi xu hướng/bản đồ tỉnh lỗi giữ khoảng thời gian đã hỏi; byte bước đổi chỉ ở nhánh lỗi đó (M8).
- Q3: lỗi ghi capture chỉ làm hỏng làn đó; lần chạy tiếp tục. Không đổi hợp đồng, không migration.

## Impact

- Mã: RA `collection-lanes.ts` (mới), `service.ts` (bỏ 4 khối gọi, 4 khối lưu, 4 cặp dòng chi phí, 4 trường nguồn). Không đổi `research-automation-api.ts`, `src/api/operator-app.ts`: service dựng danh sách làn từ các tùy chọn nguồn có sẵn.
- Kiểm thử: `tests/integration/c1-collection-lanes-characterization.test.ts` (PR0) là bằng chứng byte không đổi; các kiểm thử làn hiện có không đổi.
- Không migration, không đổi hợp đồng, không gọi nguồn trả phí mới.

## Ngoài phạm vi

- Bỏ làn trả phí cho lần chạy chỉ Insight (Q2), ghi chi phí khi dừng giữa chừng (Q4).
- Thống nhất mã tài liệu lỗi (cần đổi hợp đồng).

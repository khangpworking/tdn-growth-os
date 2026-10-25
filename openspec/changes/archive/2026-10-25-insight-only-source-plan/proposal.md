# Nguồn cho lần chạy chỉ Insight: chạy nguồn Insight cần, bỏ nguồn chỉ Market dùng

> Trạng thái: **đề xuất**, theo quyết định của chủ ngày 25/10/2026 (Q2). Một PR, ba phần: P1 (Metric tự chạy cho lần chạy chỉ Insight), P2 (bỏ các làn chỉ Market đọc), P3 (PageIndex chỉ hỏi phần Market). Lần chạy có MARKET giữ y hành vi và byte đã lưu, trừ P3.

## Why

Quyết định của chủ (25/10/2026, nguyên văn): "nguồn nào mà vừa dùng cho cả insight, metric hoặc dùng riêng cho insight thì chạy trong lượt làm báo cáo insight (còn nguồn nào dùng riêng cho mỗi market thì không cần chạy)".

Nghĩa là, với lần chạy có `reports` chứa INSIGHT mà không chứa MARKET ("lần chạy chỉ Insight"):
- CHẠY mọi nguồn mà Insight đọc kết quả (riêng hoặc cùng Market);
- KHÔNG CHẠY nguồn chỉ Market đọc (không gọi nhà cung cấp, không gọi mô hình).

Hôm nay ngược lại ở hai chỗ:
- Metric tự chạy chỉ khi `reports` có MARKET (RA `service.ts`, chỗ chèn dòng `research_automation_autorun`). Bước PICK biến trang kết quả Metric thành link Shopee chính xác; CONFIRM đưa link vào phạm vi; S05 thu review Shopee cho Insight. Lần chạy chỉ Insight mất review theo link chính xác và tên Metric cho bản nháp từ khóa L9.
- Các làn thu thập không có cổng theo loại báo cáo (RA `collection-lanes.ts`), nên lần chạy chỉ Insight vẫn tốn tiền cho các làn chỉ Market đọc. PageIndex hỏi cả câu cho phần I, rồi RA `pdf-excerpt.ts` bỏ mọi trích dẫn không thuộc phần M (`NOT_MARKET_SECTION`).

## What Changes

- P1: dòng auto-run được chèn cho cả lần chạy chỉ Insight (khi bật `TDN_METRIC_OPENCLI_ENABLED`). Giữ các pha Insight cần: `CAPTURE` (một lượt thu Metric), `PREPARE` (gói Metric: CONFIRM chọn `USE_PREPARED` với gói này, và tên Metric cho L9 cần nguồn Metric `ADMITTED`), `PICK` (link Shopee chính xác), `CONFIRM` (đưa link vào phạm vi), `WAIT_DRAFT`. Bỏ `PRESENT` (bản sửa trình bày Market: bìa và biểu đồ): lần chạy chỉ Insight đi từ `WAIT_DRAFT` thẳng tới `DONE` khi bản nháp sẵn sàng. Quy tắc dừng và thử lại giữ như Market (`STOPPED` với mã dừng, chủ bấm "Thử lại" cho lỗi thu). Lỗi thu Metric không làm lần chạy Insight lỗi: dòng auto-run dừng, lần chạy vẫn chờ chủ xác nhận phạm vi như hôm nay.
- P2: lần chạy chỉ Insight không gọi các làn chỉ Market đọc: xu hướng tìm kiếm (S20), bản đồ tỉnh (S20), World Bank (S23), UN Comtrade (S24, kể cả lượt gọi mô hình chọn mã HS), thống kê chính thức (S21/S22, kể cả lượt gọi mô hình), quảng cáo TikTok top ads (S16), đọc video (S14), thư viện quảng cáo Google (S17), đọc tự động thư viện quảng cáo Meta (S15). Làn bị bỏ trả bước không đổi, không dòng chi phí, không tài liệu lỗi, giống khám phá PDF hôm nay khi `!facts.market`. Các làn khác (Kalodata, tìm kiếm web, tìm kiếm mở rộng, review Shopee, Metric, L9) chạy như hôm nay.
- P3: PageIndex lập và ước tính câu hỏi chỉ cho phần M, và chỉ khi `reports` có MARKET, trên mọi lần chạy. Lần chạy chỉ Insight có kế hoạch rỗng nên không gọi PageIndex. Câu hỏi phần M giữ y id, thứ tự, chữ, khóa cache, biên nhận. Danh sách `PAGEINDEX_ELIGIBLE_SECTIONS` không đổi để dữ liệu cũ vẫn hợp lệ.
- Giao diện: thẻ auto-run ở pha `DONE` của lần chạy chỉ Insight chỉ nói bản nháp đã xong, không nói bìa hay biểu đồ. Lần chạy có MARKET giữ nguyên câu hoàn tất.

## Spec deltas

- `report-pipeline` R-P03: luồng tự chạy cũng chạy cho lần chạy chỉ Insight, không có pha `PRESENT`.
- `report-pipeline` R-P04: thêm cổng theo loại báo cáo cho các làn chỉ Market đọc.
- `report-pipeline` R-P15 (mới): PageIndex chỉ hỏi phần Market.

## Impact

- Mã: RA `service.ts` (P1: chỗ chèn dòng auto-run, `#autorunWaitDraft`; P3: hai chỗ dựng danh sách phần cho PageIndex), RA `collection-lanes.ts`, `collection-lanes-save-step.ts` (P2).
- Giao diện: `frontend/src/research-automation/autorun-text.ts` và `AutoRunCard.tsx` dùng loại báo cáo của lần chạy để chọn câu hoàn tất.
- Lần chạy chỉ Insight thay đổi: có thêm một lượt thu Metric, link Shopee chính xác trong phạm vi, review theo link đó, tên Metric cho L9; bớt lượt gọi các làn chỉ Market và câu hỏi PageIndex phần I. Báo cáo Insight vẫn được dựng như hôm nay.
- Lần chạy có MARKET: không đổi, trừ PageIndex không hỏi câu phần I nữa (các câu đó đã bị bỏ, không vào báo cáo).
- Không migration, không đổi hợp đồng, không thêm cờ.

## Ngoài phạm vi

- Đổi quyết định review (`SKIP` hay thu) của bước CONFIRM theo loại báo cáo.
- Đọc phụ đề video cho Insight: khi Insight bắt đầu đọc, làn đọc video phải chuyển sang nhóm "chạy".

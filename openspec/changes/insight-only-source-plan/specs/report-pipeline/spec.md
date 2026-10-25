## MODIFIED Requirements

### Requirement: R-P03 Tự chạy Market chỉ khi bật cờ
Hệ thống SHALL chạy luồng tự động (thu, chuẩn bị, chọn link, xác nhận, chờ nháp, trình bày) chỉ khi `TDN_METRIC_OPENCLI_ENABLED=1`, cho lần chạy có `reports` chứa MARKET hoặc INSIGHT. Lần chạy chỉ Insight (có INSIGHT, không có MARKET) SHALL chạy các pha thu, chuẩn bị, chọn link, xác nhận, chờ nháp, rồi SHALL kết thúc ở `DONE` khi bản nháp sẵn sàng, không qua pha trình bày.

- Mã: RA `service.ts` `#processAutorun`; các pha `WAITING_SCOPE, CAPTURE, PREPARE, PICK, CONFIRM, WAIT_DRAFT, PRESENT, DONE, STOPPED`. Chỗ chèn dòng auto-run khi tạo lần chạy; `#autorunWaitDraft` chọn `PRESENT` (có MARKET) hay `DONE` (chỉ Insight). Hàm phụ ở RA `autorun-derive.ts` (`pickShopeeLinks`, `buildCaptureSpec`, `buildRevisionValue`, `planCapturePeriod`, `AUTORUN_PICK_RULE_VERSION='autorun-pick-v3'`). Thu bằng RA `metric-capture-runner.ts` (`runMetricCapture`) qua `metric-opencli-executor.ts`.
- Bảng: `research_automation_autorun`, `research_automation_autorun_retries` (0055, 0056).
- Vì sao: chủ không bao giờ phải thu mẫu bằng tay (17/10/2026); 14/14 phải đến từ luồng tự động (15/10/2026). Chủ quyết định 25/10/2026: "nguồn nào mà vừa dùng cho cả insight, metric hoặc dùng riêng cho insight thì chạy trong lượt làm báo cáo insight (còn nguồn nào dùng riêng cho mỗi market thì không cần chạy)". Bước chọn link cho Insight link Shopee chính xác; tên Metric vào bản nháp từ khóa L9. Pha trình bày chỉ sửa báo cáo Market.

#### Scenario: Cờ tắt
- **WHEN** `TDN_METRIC_OPENCLI_ENABLED` không bằng `1`
- **THEN** lần chạy không vào các pha tự chạy và chờ thao tác của chủ

#### Scenario: Pha trình bày
- **WHEN** lần chạy tự động có MARKET tới pha `PRESENT`
- **THEN** hệ thống gọi `requestReportRevision(buildRevisionValue(...))` để tạo bản trình bày của báo cáo Market

#### Scenario: Lần chạy chỉ Insight
- **WHEN** cờ bật, `reports` chỉ có INSIGHT, và bản nháp của lần chạy sẵn sàng (`DRAFT_READY`) sau khi luồng tự động đã xác nhận phạm vi
- **THEN** dòng auto-run chuyển từ `WAIT_DRAFT` sang `DONE`, không tạo bản sửa trình bày nào

#### Scenario: Lỗi thu trên lần chạy chỉ Insight
- **WHEN** lượt thu Metric của lần chạy chỉ Insight lỗi
- **THEN** dòng auto-run dừng `STOPPED` với mã dừng như lần chạy Market, chủ thử lại được theo cùng quy tắc, và lần chạy vẫn chờ chủ xác nhận phạm vi

### Requirement: R-P04 Cờ bật tắt của các làn nguồn
Với làn nguồn có cờ bật tắt, bước `COLLECTION` SHALL chỉ gọi làn đó khi cờ bật. Cờ làn chỉ bật khi giá trị đúng bằng `1`; cờ `*_AI_ENABLED` và cờ PageIndex chỉ bật khi đúng bằng `true`. Các nguồn cơ sở trong `providers.ts` (dữ liệu bán hàng ước tính, tìm kiếm web, review trả phí) được cấu hình bằng thông tin truy cập và giới hạn tương ứng, không có cờ bật tắt riêng cho từng nguồn. Trên lần chạy chỉ Insight (có INSIGHT, không có MARKET), bước `COLLECTION` SHALL không gọi các làn chỉ Market đọc: xu hướng tìm kiếm, bản đồ tỉnh, World Bank, UN Comtrade (kể cả lượt gọi mô hình chọn mã HS), thống kê chính thức (kể cả lượt gọi mô hình), TikTok top ads, đọc video, thư viện quảng cáo Google, đọc tự động thư viện quảng cáo Meta. Làn bị bỏ không ghi dòng chi phí, không ghi tài liệu lỗi.

- Cờ đọc ở `src/api/operator-app.ts` (`operatorAppConfigurationFromEnvironment`).
- Cổng theo loại báo cáo: một dữ kiện `facts.market` (từ `reports.includes('MARKET')` ở RA `service.ts`), đọc ở RA `collection-lanes.ts` và `collection-lanes-save-step.ts`.
- Làn và mã:
  - Dữ liệu bán hàng ước tính: RA `provider-kalodata.ts`, `kalodata-replay.ts`, `kalodata-video-intake.ts`; RA `metric-source-intake.ts`, `metric-capture-intake.ts`.
  - Tìm kiếm web: RA `provider-serpapi.ts`, `providers.ts`, `source-binding.ts`, `expanded-search*.ts` (`TDN_RESEARCH_EXPANDED_SEARCH_ENABLED`).
  - Mức quan tâm tìm kiếm: RA `search-interest.ts`, `search-geo.ts` (`TDN_RESEARCH_SEARCH_TRENDS_ENABLED`, `_GEO_ENABLED`).
  - Review Shopee: `src/platform/collectors/{apify-shopee,shopee-public-reviews,shopee-private-intake}.ts`, RA `exact-shopee-bridge.ts`, `public-shopee-bridge.ts` (`TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED`, trần 300 bình luận mỗi sản phẩm).
  - Bình luận TikTok: `src/platform/collectors/apify-tiktok-comments.ts`, RA `tiktok-comment-intake.ts`.
  - Vĩ mô, thương mại, thống kê chính thức: RA `world-bank-lane.ts`, `comtrade-lane.ts`, `official-statistics-lane.ts` (`TDN_RESEARCH_WORLD_BANK_ENABLED`, `_COMTRADE_ENABLED`, `_OFFICIAL_STATS_ENABLED`, `_OFFICIAL_STATS_PROVINCE_ENABLED`).
  - Quảng cáo: RA `google-ads-lane.ts`, `meta-auto-lane.ts`, `tiktok-top-ads-lane.ts` (`TDN_RESEARCH_GOOGLE_ADS_ENABLED`, `_META_AUTO_ENABLED`, `_TIKTOK_TOPADS_ENABLED`).
  - PDF: RA `pdf-discovery-lane.ts`, `pdf-excerpt.ts`, `src/modules/analysis/pageindex-*.ts` (`TDN_RESEARCH_PDF_DISCOVERY_ENABLED`, `TDN_PAGEINDEX_CLOUD_ENABLED`).
  - Video người bán: RA `video-watch-lane.ts`, `seller-video.ts` (`TDN_RESEARCH_VIDEO_WATCH_ENABLED`).
- Vì sao: một nguồn hỏng không được làm mất nguồn tốt; nguồn trả phí cần chủ cho phép (quy chuẩn dữ liệu đầu vào). Chủ quyết định 25/10/2026: nguồn chỉ Market dùng thì không chạy trong lượt làm báo cáo Insight.

#### Scenario: Cờ có giá trị lạ
- **WHEN** `TDN_RESEARCH_WORLD_BANK_ENABLED=yes`
- **THEN** làn World Bank không chạy

#### Scenario: Một làn lỗi
- **WHEN** một làn nguồn trả lỗi trong `COLLECTION`
- **THEN** kết quả của các làn khác vẫn được lưu qua `#persistSourceResult`

#### Scenario: Lần chạy chỉ Insight
- **WHEN** `reports` chỉ có INSIGHT và cờ của làn World Bank bật
- **THEN** làn World Bank không gọi nhà cung cấp, bước `COLLECTION` không có dòng chi phí hay tài liệu lỗi của làn đó, và báo cáo Insight không ghi làn đó là lỗi

## ADDED Requirements

### Requirement: R-P15 PageIndex chỉ hỏi phần Market
Hệ thống SHALL lập và ước tính câu hỏi PageIndex chỉ cho phần M, và chỉ khi `reports` có MARKET. Câu hỏi phần M SHALL giữ y id, thứ tự, chữ và khóa cache như trước. Kế hoạch rỗng SHALL không gọi PageIndex và không làm bước lỗi.

- Mã: RA `service.ts` (chỗ ước tính chi phí PDF và chỗ lập kế hoạch câu hỏi, cùng lọc phần M); `src/modules/analysis/pageindex-questions.ts` (`PAGEINDEX_ELIGIBLE_SECTIONS` giữ nguyên để câu hỏi phần I đã lưu vẫn hợp lệ); RA `pdf-excerpt.ts` (`NOT_MARKET_SECTION`).
- Vì sao: RA `pdf-excerpt.ts` bỏ mọi trích dẫn không thuộc phần M, nên câu hỏi phần I tốn tiền mà không đổi báo cáo. Chủ quyết định 25/10/2026: nguồn chỉ Market dùng thì không chạy trong lượt làm báo cáo Insight.

#### Scenario: Lần chạy chỉ Insight có PDF
- **WHEN** lần chạy chỉ Insight có PDF của chủ
- **THEN** kế hoạch câu hỏi rỗng, không có lượt gọi PageIndex, bước không lỗi

#### Scenario: Lần chạy có Market
- **WHEN** lần chạy có MARKET và INSIGHT có PDF
- **THEN** chỉ câu hỏi phần M được hỏi, với id và thứ tự như trước

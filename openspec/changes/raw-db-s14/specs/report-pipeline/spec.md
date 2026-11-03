## ADDED Requirements

### Requirement: R-VR01 Làn xem video chỉ xem video chủ chọn và video bán chạy
`videoWatchCandidates` SHALL lấy video chủ chọn trước, rồi video bán chạy (tải lên trước, tra tự động sau), tối đa 10 video bán chạy và 10 tất cả. Video từ tìm kiếm `site:tiktok.com` SHALL NOT được xem, kể cả khi không có video bán chạy.

- Loại kiểm: Máy
- Mã kiểm: Chưa có mã kiểm
- Vì sao: Chủ quyết F356 (03/11/2026), phương án A.

#### Scenario: Có video chọn, video bán chạy và kết quả tìm kiếm
- **WHEN** lần chạy có 1 video chọn, 3 video bán chạy và 5 video TikTok từ tìm kiếm
- **THEN** danh sách là 1 video `SELECTION` rồi 3 video `TOP_SELLING`, không có video `EXPANDED_SEARCH`, và kết quả tìm kiếm vẫn vào bảng kết quả web của Market

#### Scenario: Phần khác của app giữ nguyên
- **WHEN** so lần chạy trước và sau change này
- **THEN** lời báo cáo, cờ, nhãn nguồn, lời nhắc Gemini và bộ lọc «nói về sản phẩm» của app không đổi

#### Scenario: Nhiều video bán chạy
- **WHEN** bảng tải lên và tra tự động cho tổng cộng 12 video bán chạy khác nhau và không có video chọn
- **THEN** danh sách có 10 video `TOP_SELLING` theo thứ tự bán chạy, 2 video còn lại ghi `OVER_10_VIDEOS`

#### Scenario: Không có video bán chạy
- **WHEN** lần chạy không có video chọn, không có video bán chạy, nhưng có kết quả tìm kiếm TikTok
- **THEN** danh sách rỗng, không có lần gọi Gemini nào, và bước báo như danh sách rỗng hiện nay

## ADDED Requirements

### Requirement: R-L20 Từ xếp hạng chỉ dùng khi câu ghi đủ thước đo, mẫu và kỳ
Báo cáo MAY dùng «dẫn đầu», «số 1» hoặc «nhiều nhất» chỉ khi câu, hoặc tiêu đề bảng hay biểu đồ, chứa từ đó ghi đủ ba điều: (1) đo bằng gì, ví dụ doanh thu, lượt bán, số lần nhắc; (2) trong mẫu nào: số sản phẩm hoặc số bản ghi, và sàn nào; (3) kỳ nào, kèm ngày. Báo cáo SHALL NOT dùng «số 1 thị trường», «tốt nhất» hoặc «dẫn đầu ngành», kể cả khi câu ghi đủ ba điều.

- Loại kiểm: Máy (đề xuất): cụm cấm kiểm bằng máy; câu xếp hạng thiếu một trong ba điều kiểm bằng máy khi được, phần còn lại người đọc soát
- Mã kiểm: chưa có mã kiểm
- Vì sao: Chủ quyết định ngày 24/10/2026. Báo cáo chỉ thấy một mẫu trên một vài sàn trong một kỳ, nên câu xếp hạng phải nói rõ phạm vi để người đọc không hiểu là cả thị trường.

#### Scenario: Câu ghi đủ ba điều
- **WHEN** báo cáo viết "Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu, kỳ 20/09–19/10/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Thiếu kỳ
- **WHEN** báo cáo viết "Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu" và không ghi kỳ
- **THEN** quy tắc R-L20 bị vi phạm

#### Scenario: Insight nêu chủ đề nhắc nhiều nhất
- **WHEN** báo cáo Insight viết "Giao hàng chậm là chủ đề chê được nhắc nhiều nhất trong 300 bình luận TikTok Shop, kỳ 01/09–30/09/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Tiêu đề bảng ghi đủ
- **WHEN** tiêu đề bảng là "Sản phẩm dẫn đầu theo doanh thu, 200 sản phẩm trong mẫu, Shopee và TikTok Shop, kỳ 20/09–19/10/2026"
- **THEN** quy tắc R-L20 đạt

#### Scenario: Cụm luôn cấm
- **WHEN** báo cáo viết "số 1 thị trường", "tốt nhất" hoặc "dẫn đầu ngành", kể cả khi câu có thước đo, mẫu và kỳ
- **THEN** quy tắc R-L20 bị vi phạm

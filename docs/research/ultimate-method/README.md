# Phương pháp 30 section: nghiệp vụ Ultimate và phần TDN đang áp dụng

Cập nhật: 07/10/2026

## Tóm tắt (cho chủ dự án)

Có hai lớp tài liệu về phương pháp, và hai lớp này **không giống nhau**:

1. **Nghiệp vụ Ultimate** ([ultimate-method-30-sections.md](ultimate-method-30-sections.md)) nói báo cáo **được làm gì, không được làm gì**. Chủ dự án xác nhận ngày 07/10/2026: **business rule của Ultimate là nguồn chuẩn**, TDN phải theo. Khi có tranh cãi về nghiệp vụ thì theo file này, trừ khi chủ dự án có quyết định mới hơn.
2. **TDN đang áp dụng** là những gì hệ thống thật sự đã có: recipe kỹ thuật, cấu hình, code và test trong repo.

Mọi thay đổi business rule được ghi trong [CHANGELOG.md](CHANGELOG.md).

Nghiệp vụ luôn đi trước, hệ thống theo sau. Một quy tắc có trong Ultimate nhưng chưa vào code thì **chưa được coi là hệ thống đã làm**. Bảng ở mục 4 cho biết từng section đang lệch ở đâu.

---

## 1. Hai lớp là gì

| Lớp | Nói gì | Ở đâu | Ai quyết |
|---|---|---|---|
| Nghiệp vụ Ultimate | Quy tắc chung, ngoại lệ chủ đã duyệt, phương pháp từng section, nguồn dữ liệu được dùng | `docs/research/ultimate-method/ultimate-method-30-sections.md` | Chủ dự án quyết; AI soạn và ghi lại |
| Nghiệp vụ: Input data sources for 30 sections | Nguồn dữ liệu đầu vào (mã S), hạng tin cậy, độ đại diện, section dùng nguồn nào, nhật ký thử nguồn | `docs/research/ultimate-method/input-data-sources-30-sections.md` | Như trên |
| Nghiệp vụ: nhật ký test và kiểm định nguồn | Mỗi lần thử thu hoặc kiểm định một nguồn: cách làm, chi phí, kết quả, đổi trạng thái | `docs/research/ultimate-method/input-data-sources-test-log.md` | Agent ghi sau mỗi lần test; chủ xem |
| TDN: recipe (A40) | Đặc tả kỹ thuật từng section, quyết định còn mở D01–D12 | `docs/research/section-methods-v1/` | Theo quy trình review kỹ thuật, không tự nới so với Ultimate |
| TDN: cấu hình (A41) | Cấu hình có thể triển khai, khuyến nghị chính sách | `docs/research/method-configurations-v1/` | Như trên |
| TDN: code và test | Phần thật sự chạy | `src/modules/analysis/` (research-automation, reader-report và các method), `tests/` | PR, review, chủ merge |
| TDN: trạng thái | Section nào đã nối, đã nghiệm thu chưa | `docs/research/research-30-section-progress.md` | Cập nhật sau mỗi checkpoint |

Ba loại báo cáo đang dùng các lớp khác nhau:

| Báo cáo | Theo lớp nào | Ghi chú |
|---|---|---|
| Bản nháp tự động (research automation) | Recipe A40 và code | Chặt nhất. Chưa có E1–E8 |
| Bản đọc Market (`src/modules/analysis/reader-report/`) | Ultimate v1.0 (E1–E3) qua phần trình bày và lint | Chỉ có mẫu Market trong repo |
| Bản đọc Insight | Ultimate v1.1 | Hiện **dựng tay ngoài repo** (báo cáo thạch dừa 05–07/10). Chưa có mẫu Insight trong code |

## 2. Khi hai lớp lệch nhau

| Trường hợp | Xử lý |
|---|---|
| Ultimate cho phép, TDN chưa có | Ghi vào danh sách đồng bộ (mục 5). Báo cáo tự động không được tuyên bố đã làm. Có thể làm tay trong bản đọc, ghi rõ là làm tay |
| TDN chặt hơn Ultimate | Ultimate thắng; TDN phải sửa recipe, cấu hình và code theo Ultimate. Trong lúc chưa sửa xong, báo cáo tự động không tuyên bố đã làm được |
| TDN cho phép điều Ultimate cấm | Là lỗi. Sửa TDN, hoặc xin chủ quyết rồi ghi vào Ultimate |
| Chủ vừa quyết điều mới, Ultimate chưa ghi | Quyết định của chủ thắng (Ultimate mục 1). Bổ sung vào Ultimate ở phiên bản kế tiếp |

## 3. Đưa một quyết định mới vào hệ thống

1. Chủ dự án quyết bằng văn bản (tin nhắn, issue, PR).
2. Ghi vào Ultimate: tăng phiên bản, thêm ngoại lệ hoặc làm rõ, cập nhật lịch sử phiên bản (mục 9 của Ultimate), và thêm một dòng vào [CHANGELOG.md](CHANGELOG.md) trong cùng commit.
3. Cập nhật recipe A40 của section liên quan và, nếu cần, cấu hình A41.
4. Tạo gói việc có checklist (theo `docs/tasks/research-batch-2-packages.md` và `docs/runbooks/agent-pipeline.md`), sửa code, thêm test và lint.
5. Chạy trên dữ liệu thật, review output.
6. Cập nhật `research-30-section-progress.md` và cột TDN ở bảng mục 4 dưới đây.

Mỗi bước là một tầng riêng. Xong bước 2 chưa có nghĩa là xong bước 4.

## 4. Đối chiếu 30 section

- Hiện đang làm phần business rule; cột **TDN code** tạm giữ nguyên, chưa cập nhật.
- Cột **TDN code** lấy từ bảng điều hành ngày 04/10/2026 (`research-30-section-progress.md`). "Nối" nghĩa là luồng chạy có gọi phương pháp, **chưa** có nghĩa là đúng hay đã nghiệm thu. Tới 04/10 chưa section nào nghiệm thu đủ trên ba case (thạch dừa, bình giữ nhiệt, quạt cầm tay).
- Các PR sau 04/10 (#118–#137) thêm nguồn và trích dẫn (tìm kiếm web, trạng thái review Shopee, sổ trích dẫn, lưu trữ, Trends) nhưng không đổi phương pháp section.

| ID | Ultimate v1.1 | TDN recipe (A40) | TDN code (04/10) | Cần đồng bộ |
|---|---|---|---|---|
| M01 | PROPOSED + E3 | Chờ chính sách chủ | Inventory claim từ M05; chưa có tóm tắt Market | E3 vào recipe và luồng tự động |
| M02 | EXISTING_BOUNDED | A22 | Đã nối | — |
| M03 | EXISTING_BOUNDED | A32/A37 | Đã nối | — |
| M04 | EXISTING_BOUNDED | A27 | Đã nối | — |
| M05 | PROPOSED | Đề xuất; chưa chốt proxy nhu cầu | Mô tả hẹp; replay thật 2 case | Cập nhật 05/10: thêm review không tự nâng giá trị claim |
| M06 | PROPOSED + VALIDATED_IN_SAMPLE | Đề xuất | Inventory hẹp; replay thật 2 case | Kết quả kiểm chứng 05/10 |
| M07 | PROPOSED | Đề xuất; chưa có tập đối thủ | So sánh peer tường minh, không xếp hạng | Nguồn so sánh chốt 05/10; nội dung video đối thủ (v1.1, mục 6) |
| M08 | BOUNDED + BENCHMARK + E1 + E9 | Chỉ số học một quote (A24) | Phép tính giá/gói/đơn vị/100g | E1 (ROAS/CPA, miễn trừ). **Đã quyết 07/10 (v1.2):** giá theo đơn vị chuẩn của từng ngành hàng và so cạnh nhau theo E9; phép 100g nay có căn cứ cho hàng bán theo khối lượng, nhưng phải theo bảng đơn vị chuẩn và điều kiện E9 |
| M09 | PROPOSED | Đề xuất | Inventory ngày ra mắt; replay thật 2 case | Kênh báo cáo ngành 05/10 |
| M10 | BLOCKED | Gate | Gate đã nối | Nguyên tắc kịch bản có điều kiện 05/10 |
| M11 | PROPOSED | Chờ chính sách chủ | Packet bản nháp chờ review | Định nghĩa cơ hội = giao 3 tín hiệu (05/10) |
| M12 | PROPOSED + E2 | Chờ chính sách chủ | Packet; không tự chọn | E2 vào luồng tự động (bản đọc Market đã áp) |
| M13 | EXISTING_BOUNDED | A23 | Đã nối | — |
| Kết luận Insight | E6 | Không có trong danh mục 30 section | Không có | Thêm khi đưa bản đọc Insight vào app |
| I01 | PROPOSED + E7 | Câu hỏi phải do chủ viết | Brief đã nối; thiếu thì UNSET | E7 (câu hỏi làm việc có nhãn) |
| I02 | PROPOSED + E4 + E5 | Coding bản ghi; không persona, không đếm người (D06) | Đề xuất/duyệt coding đã nối; bảng điều hành ghi "không dựng persona" | **Đã quyết 07/10: theo Ultimate, cho dựng chân dung (E4).** TDN sửa recipe I02 và D06. Gói P7 đã có chân dung E4 cho mạng xã hội. E5 chưa có ở đâu |
| I03 | EXISTING_BOUNDED | A25 | Đã nối | Ghi riêng từng nguồn khi có nhiều nguồn |
| I04 | PROPOSED | Đề xuất | Đã nối, chưa duyệt coding thật | — |
| I05 | PROPOSED | Đề xuất | Đã nối | L6: số sao là phân bố riêng |
| I06 | PROPOSED | Đề xuất | Đã nối | — |
| I07 | PROPOSED | Đề xuất | Đã nối | L7: lời người bán đặt cạnh, không gộp |
| I08 | PROPOSED | Đề xuất | Đã nối | Tách phản bác người bán tự nêu khỏi rào cản của khách |
| I09 | PROPOSED | Đề xuất | Đã nối | — |
| I10 | PROPOSED | Đề xuất; chưa chốt tỷ lệ | Đếm và corpus đã nối | L3: bản nháp và bản phát hành |
| I11 | PROPOSED | Chờ chủ định nghĩa nhóm | Gate đã nối | L5: so nhiều nền tảng cạnh nhau |
| I12 | PROPOSED | Chờ chủ định nghĩa | Gate đã nối | Trường đọc video là PRESENCE (mục 6.2) |
| I13 | PROPOSED + E5 | Đề xuất | Nhắc thương hiệu nguyên văn đã nối | L7, thương hiệu "theo tiêu đề người bán", E5 |
| I14 | PROPOSED | Chờ chính sách chủ | Ứng viên AI, tắt mặc định | Nhãn "hướng AI đề xuất" |
| I15 | PROPOSED + E6 | Chờ chính sách chủ | Packet; không tự chọn | E6 (đề xuất kèm người phụ trách và hạn) |
| I16 | PROPOSED | Thiết kế hoặc kết quả có sẵn | Gate đã nối | Ghi chú "so trước/sau không đo được hiệu quả" |
| I17 | EXISTING_BOUNDED | A26 | Đã nối | Phụ lục liệt kê nguồn mới |

## 5. Danh sách đồng bộ còn thiếu

### Từ Ultimate v1.0 (05/10), chưa bàn giao vào TDN

- M06: kết quả kiểm chứng trong mẫu.
- M08: E1 (ROAS/CPA tham khảo, câu miễn trừ, chưa dùng Ad Spend).
- M09: kênh báo cáo ngành.
- M10: kịch bản có điều kiện và điều kiện mở lại.
- M11: định nghĩa giao 3 tín hiệu.
- E2, E3 cho luồng tự động; điều chỉnh mục "Cấm" của M01, M12.

### Từ Ultimate v1.1 đến v1.8 (07–08/10)

- v1.8: L9 lọc nghĩa khi thu bằng từ khoá (G-13 trong gói việc); E13 dữ liệu Ngân hàng Thế giới (P10-12); M09 tìm kiếm có lọc thời gian và tìm trong một trang báo (P5-07 tới P5-09).

- v1.5: E12 thống kê chính thức của Cục Thống kê cho mọi ngành hàng; gói P10 nhập file Excel của Cục Thống kê; P8-10 hiển thị.

- v1.4: E5 và mục 6.3 tính ngưỡng theo nhiều cách song song (số cố định, độ bão hoà hoặc hiệu chỉnh theo dữ liệu, 80/20) và ghi đạt theo cách nào; L8 không đề xuất mua hàng.

- E10 (M05): doanh số là thước đo nhu cầu.
- E11: thay mọi chỗ chờ chủ khai báo bằng quy tắc mặc định; tập đối thủ tự lấy từ dữ liệu bán hàng; bộ mã kiểm chéo bằng model thứ hai; nhóm so sánh I11 theo sàn và mua lẻ/mua sỉ.
- Mục 6.3: ngưỡng thu review mở rộng.

- M08 (v1.2): bảng đơn vị chuẩn theo ngành hàng, tách khối lượng tịnh và khối lượng cái, so cạnh nhau theo E9.

- Recipe I02 và quyết định D06: cho phép chân dung theo E4 (chủ đã quyết 07/10, TDN phải sửa); thêm lớp E5.
- L1–L7 vào recipe các section Insight và vào lint của bản đọc (gói P2 hoặc P8): cấm so sánh bậc nhất làm nhận định, nhãn tại câu có số khi coding chưa duyệt, không gộp bản ghi trùng chữ, số sao tách riêng.
- E6, E7: mẫu bản đọc Insight trong app (hiện chỉ có Market).
- Nguồn mới ở mục 6 của Ultimate, so với gói việc hiện có:

  | Nguồn | Gói |
  |---|---|
  | Số liệu video và creator | P4 |
  | Trends, tìm kiếm mở rộng | P5 (chờ chạy thử) |
  | Facebook/Instagram, chân dung E4 | P7 (chờ chủ chọn tài khoản thu) |
  | Thống kê chính thức của Cục Thống kê (mọi ngành hàng) | P10 |
  | Hiển thị tất cả nguồn mới | P8 |
  | Đọc nội dung video, bình luận dưới video, thư viện quảng cáo, chân dung E5 | Chưa có gói. Đề xuất gói P9, làm sau P4 |
  | Review TikTok Shop | Chưa có bộ thu; cần chạy thử |
  | Dữ liệu của chính shop chủ | Chưa có; chờ chủ cung cấp |

## 6. Cách dùng khi viết hoặc review báo cáo

- **Viết bản đọc (làm tay hoặc AI):** theo Ultimate v1.1. Đánh dấu rõ phần nào làm tay, phần nào hệ thống tính.
- **Review báo cáo:** so từng nhận định với Ultimate (quy tắc 1–9, L1–L7, ngoại lệ E1–E8). Với báo cáo tự động, so thêm với recipe A40 của section.
- **Viết gói việc cho agent:** lấy quy tắc từ Ultimate, nhưng checklist chỉ đòi những gì đã có trong recipe hoặc đã được ghi vào danh sách đồng bộ ở mục 5.
- **Khi thấy hai lớp mâu thuẫn mà mục 4 chưa ghi:** báo chủ dự án, không tự chọn.

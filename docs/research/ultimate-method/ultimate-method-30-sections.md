# Ultimate Method for 30 sections

Phiên bản 1.11 · ngày 08/10/2026 · ngôn ngữ: tiếng Việt

Đây là **nguồn chuẩn nghiệp vụ** (source of truth) cho phương pháp của 30 section trong bộ Market Report (M01–M13) và Insight Report (I01–I17). File nói **được làm gì và không được làm gì**. Phần TDN đã áp dụng tới đâu (recipe, cấu hình, code) nằm ở [README của thư mục này](README.md).

File hợp nhất:

1. Đặc tả phương pháp gốc 30 section (A40, spec v1.0.0, 30/09/2026), trong repo tại `docs/research/section-methods-v1/`.
2. Gói cấu hình A41 đã review kinh doanh (30/09–01/10/2026), tại `docs/research/method-configurations-v1/`.
3. Điều chỉnh đã chốt ngày 02/10/2026 (research-method contracts: temporal, quote, synthesis, corpus review).
4. Cập nhật thảo luận ngày 05/10/2026 cho M06, M08, M09, M10, M11 và ngoại lệ E1–E3 (bản v1.0).
5. **v1.1 (07/10/2026):** quyết định của chủ dự án cho phần Insight: ngoại lệ E4–E8, làm rõ cách áp quy tắc chung cho Insight, và danh mục nguồn dữ liệu cho Insight (mục 6).
6. **v1.2 (07/10/2026):** M08 tính giá theo đơn vị chuẩn của từng ngành hàng, và ngoại lệ E9 cho phép so cạnh nhau có điều kiện.
7. **v1.3 (07/10/2026):** E10 doanh số là thước đo nhu cầu; E11 báo cáo chạy theo quy tắc mặc định, không chờ chủ nhập liệu; ngưỡng thu review mở rộng (mục 6.3).
8. **v1.4 (07/10/2026):** giữ song song nhiều cách tính ngưỡng (số cố định, độ bão hoà, hiệu chỉnh theo dữ liệu, 80/20); không mua hàng (L8); phụ lục giải thích các nguyên tắc chuyên môn.
9. **v1.5 (08/10/2026):** thống kê chính thức của Cục Thống kê làm nguồn bối cảnh vĩ mô cho mọi ngành hàng (E12, mục 6.4).
10. **v1.6 (08/10/2026):** tách danh mục nguồn sang file riêng [Input data sources for 30 sections](input-data-sources-30-sections.md), có mã nguồn S01…, hạng tin cậy A–D, độ đại diện và bảng section dùng nguồn nào.
11. **v1.7 (08/10/2026):** file danh mục nguồn đổi tên thành [Input data sources for 30 sections](input-data-sources-30-sections.md); ghi kết quả bài test Apify.
12. **v1.8 (08/10/2026):** L9 lọc nghĩa khi thu bằng từ khoá; E13 dữ liệu mở của Ngân hàng Thế giới; M09 tìm kiếm có lọc thời gian và tìm trong một trang báo.
13. **v1.9 (08/10/2026):** G6 thêm các mốc tham khảo tuổi quảng cáo 17 ngày, 3 tuần, 60 ngày; G8 ghi lý do chọn từng ngưỡng số.
14. **v1.10 (08/10/2026):** L10 bình luận dưới video review là lời khách; bảng tổng quan 30 section cập nhật theo v1.5–v1.10.
15. **v1.11 (08/10/2026):** L10 mở rộng: bình luận dưới video bán hàng cũng là lời khách.

Mọi thay đổi business rule được ghi trong [CHANGELOG.md](CHANGELOG.md), cùng commit với thay đổi. Danh mục nguồn dữ liệu, hạng tin cậy và nguồn của từng section nằm ở [Input data sources for 30 sections](input-data-sources-30-sections.md). Nguyên tắc chuyên môn (thống kê, phương pháp nghiên cứu) luôn có giải thích dễ hiểu và nguồn ở [Phụ lục](#phụ-lục-giải-thích-nguyên-tắc-chuyên-môn). Mọi ngưỡng số có lý do chọn ở Phụ lục G8.

Quy ước trạng thái:

- `EXISTING_BOUNDED`: chỉ dùng đúng phương pháp con đã có code và đã duyệt; không mở rộng.
- `PROPOSED + BUSINESS_REVIEWED`: phương pháp đã mô tả đủ và đã qua review kinh doanh, chưa phải phê duyệt vận hành của chủ dự án.
- `OWNER_DECISION_PENDING`: còn chờ chủ dự án chọn tham số chính sách (không chặn inventory mô tả an toàn).
- `BLOCKED`: không được chạy/claim cho đến khi có đúng input và thẩm quyền nêu trong phần Điều kiện mở.
- `+ En` (mới ở v1.1): section có ngoại lệ đã được chủ duyệt; chỉ áp đúng phạm vi ghi trong ngoại lệ đó.

---

## 1. Cách đọc và thứ bậc thẩm quyền

Khi hai tài liệu mâu thuẫn, thứ tự ưu tiên là:

1. Quyết định của chủ dự án đã ghi nhận bằng văn bản (mới nhất thắng).
2. File này (hợp nhất mới nhất).
3. Recipe gốc từng section (A40, `section-methods-v1/sections/Mxx.md` / `Ixx.md`).
4. Gói cấu hình A41 (`method-configurations-v1/`) và hồ sơ tiếp nhận (adoption note, remediation review 02/10).

**Chủ dự án xác nhận ngày 07/10/2026:** business rule trong file này là nguồn chuẩn. Recipe A40, cấu hình A41 và code TDN phải theo file này. Khi TDN lệch với file này, sửa TDN; không sửa file này cho khớp với code. Mục 3 và 4 trong danh sách trên chỉ là tài liệu kỹ thuật, dùng khi chúng không trái với file này.

Quyết định của chủ chỉ có hiệu lực lâu dài khi được ghi vào file này. Quyết định mới chưa kịp ghi vẫn thắng, nhưng phải được bổ sung ở phiên bản kế tiếp.

Phân biệt bắt buộc, không được trộn:

- **Đã mô tả phương pháp** ≠ **đã duyệt vận hành** ≠ **đã có code** ≠ **đã chạy và được review output**. Trạng thái từng section luôn nói rõ nó đang ở tầng nào.
- Bốn tầng bằng chứng tách biệt: bằng chứng nguồn → tính toán tái lập được → diễn giải AI → quyết định con người. Diễn giải AI chưa review không được nhập vào bằng chứng nguồn.
- **Ba loại tiếng nói tách biệt (mới ở v1.1):** lời **khách** (review, bình luận, bài viết của người mua), lời **người bán** (video, bài đăng, quảng cáo, trang bán), và **phản ứng thị trường** (doanh thu, lượt xem, chi quảng cáo). Không trình bày lời người bán như lời khách. Bình luận dưới video review và dưới video bán hàng cũng là lời khách (L10).

---

## 2. Quy tắc dùng chung (áp cho cả 30 section)

1. **Thiếu ≠ 0; UNKNOWN luôn hiển thị.** Giá trị thiếu, quan sát bằng 0 và không rõ trạng thái là ba trạng thái khác nhau; không tự điền, không suy ra.
2. **Danh tính bản ghi.** Chỉ collapse bản ghi trùng khi trùng đúng `EvidenceRecordRef` (digest + locator) hoặc có key nguồn ổn định. Văn bản giống nhau ở hai locator khác nhau vẫn là hai bản ghi. Không có ID người/sản phẩm/cửa hàng ổn định thì không được đếm người, không được join chéo nguồn, không được suy prevalence.
3. **Tổng hợp.** Chỉ cộng khi: cùng đơn vị, cùng kỳ/timezone khai báo, cùng universe/frame, và có bằng chứng các thành phần rời nhau (disjoint). Thiếu bằng chứng rời nhau → chặn phép cộng, giữ nguyên inventory. Tổng + thành phần, hay hai cách biểu diễn cùng một đại lượng, không bao giờ cộng chung.
4. **Tỷ số.** Chỉ tính khi có mẫu số tương thích do chủ dự án khai báo (cùng phạm vi, kỳ, đơn vị, khung chọn mẫu). Không có mẫu số → không có rate/share.
5. **Cấm claim mặc định.** Population/prevalence, nhân quả, dự báo, hiệu quả kênh, conversion, xếp hạng, quy mô thị trường, khuyến nghị hành động — tất cả bị chặn trừ khi một phương pháp đã review và thẩm quyền tương ứng cho phép đúng claim đó.
6. **Không thu thập nghiên cứu khách mới.** Không phỏng vấn, khảo sát, tuyển người tham gia hay respondent giả lập. Chỉ dùng nguồn đã có/công bố.
7. **Tái lập.** Ghi exact source digest + locator cho mọi con số và trích dẫn. Source thay đổi → các output phụ thuộc mất hiệu lực, chỉ mở lại đúng phép bị ảnh hưởng. Không ghi đè bản report cũ.
8. **Codebook/taxonomy.** Mọi phân loại (barrier, reason, theme, brand, event class) chỉ áp mã khi codebook phiên bản đã duyệt; mã AI đề xuất chưa người duyệt thì không được vào count/n-N.
9. **AI đề xuất, người quyết.** AI chỉ được giữ ở lớp candidate riêng (có trích dẫn claim, giả định, phản chứng, giới hạn); không tự thành option của chủ, không score/rank, không tự chọn.

### 2.1 Làm rõ khi áp cho Insight (mới ở v1.1)

Các điểm dưới đây **không nới** quy tắc 1–9; chúng nói rõ cách áp cho những trường hợp đã gặp khi dựng báo cáo insight thạch dừa (05–07/10/2026).

- **L1 · Trùng nguyên văn (quy tắc 2).** Hai review trùng chữ ở hai vị trí khác nhau vẫn là 2 bản ghi. Được ghi chú "trùng nguyên văn, có thể cùng một người", nhưng không được gộp khi đếm. Không được coi "mỗi nội dung khác nhau là một người viết" khi nguồn không có mã người viết.
- **L2 · Đếm người (quy tắc 2).** Khi nguồn có mã người viết (đã ẩn danh bằng hash) thì được đếm số người viết **trong cùng một nền tảng**. Không ghép người giữa các nền tảng.
- **L3 · Bản nháp và bản phát hành (quy tắc 8).** Bản nháp nội bộ được hiện số đếm theo cách xếp nhóm do AI đề xuất, kèm nhãn "đề xuất, chờ chủ duyệt" ngay tại câu có số, kể cả trong Kết luận chính và các ô số đầu báo cáo. **Bản phát hành** chỉ dùng số đếm theo codebook đã duyệt và ghi phiên bản codebook.
- **L4 · Không xếp hạng ngầm (quy tắc 5, 9).** Không dùng so sánh bậc nhất làm nhận định ("lời chê nặng nhất", "được nhắc nhiều nhất", "làm ngay… tiếp theo…"). Trình bày số đếm cạnh nhau. Thứ tự việc làm chỉ được nêu khi ghi rõ là **thứ tự theo phụ thuộc**, không phải ưu tiên.
- **L5 · Nhiều nền tảng (quy tắc 2, 3).** Mỗi nền tảng một cột, đặt cạnh nhau. Không cộng số giữa các nền tảng, không ghép người. Chỉ so ở mức **nhóm hoàn cảnh**.
- **L6 · Số sao (quy tắc 1; I05).** Số sao là một phân bố riêng, không tự chuyển thành khen/chê. Review không có chữ thì cảm nhận là "chưa biết". Nguồn không có trường số sao thì ghi "nguồn không có số sao", không ghi 0.
- **L7 · Lời người bán.** Mọi suy luận từ tiêu đề, mô tả, video, quảng cáo của người bán được viết là "người bán nhắm tới…" hoặc "người bán định vị…", không viết thành sự thật về khách.
- **L8 · Không mua hàng (mới ở v1.4).** Báo cáo không đề xuất đặt hàng thử hay mua hàng dưới bất kỳ hình thức nào. Chất lượng sản phẩm chỉ được đánh giá qua nguồn công khai (review, ảnh khách đính kèm, tin an toàn thực phẩm) và dữ liệu chủ cung cấp. Căn cứ: chủ "không bao giờ có khả năng chi tiền thật" (07/10/2026).
- **L9 · Từ khoá và nghĩa (mới ở v1.8; quy tắc 1, 2).** Mọi bản ghi thu bằng từ khoá (tìm kiếm, bài mạng xã hội, bình luận, quảng cáo) phải qua bước **lọc nghĩa** trước khi đếm hay trích.
  - Mỗi ngành hàng có **danh sách từ khoá** và **danh sách loại trừ** (từ dễ lẫn vì dấu hoặc vì nghĩa), có số phiên bản. AI lập hai danh sách theo E11, từ tên sản phẩm trong dữ liệu bán hàng.
  - Khớp từ khoá **giữ nguyên dấu tiếng Việt**. Không bỏ dấu khi so, vì bỏ dấu thì "thạch dứa" thành "thạch dừa".
  - Bản ghi viết không dấu (ví dụ "thach dua") khớp được cả hai nghĩa, nên phải dựa vào ngữ cảnh của chính bản ghi hoặc của video, bài gốc.
  - Bản ghi trùng chữ nhưng khác nghĩa bị loại khỏi số đếm. Số bản ghi bị loại và lý do ghi ở phụ lục nguồn (M13, I17). Không xoá lặng lẽ.
  - Bản ghi chưa chắc nghĩa ghi "chưa rõ có đúng sản phẩm không" và không tính vào số đếm chính.
  - Ví dụ gặp khi thử nguồn:
    - "thạch dừa" lẫn với "thạch dứa", thạch rau câu nước dừa, chữ "thử thách";
    - "bình giữ nhiệt" lẫn với bình nóng lạnh, hộp cơm giữ nhiệt, bình làm quà tặng kèm dịch vụ;
    - tên thương hiệu trùng với thương hiệu ngành khác.
  - **Căn cứ:** bài test nguồn ngày 08/10/2026 ([danh mục nguồn, mục 5](input-data-sources-30-sections.md#5-nhật-ký-thử-và-kiểm-định-nguồn)); chủ đồng ý ngày 08/10/2026.
- **L10 · Bình luận dưới video là lời khách (mới ở v1.10, mở rộng ở v1.11; ba loại tiếng nói ở mục 1).** Bình luận công khai dưới video review sản phẩm, và dưới video bán hàng của người bán (từ v1.11), được tính là **lời khách**, dùng như review: làm câu trích, thẻ bằng chứng cho chân dung (E4), lời khách tự xác nhận (E5 phép kiểm 4), và số đếm của I02, I04–I10.
  - **Không tính là lời khách:**
    - bình luận của chính người làm video, hoặc của tài khoản thương hiệu, gian hàng: đây là lời người bán (L7);
    - bình luận chỉ gắn thẻ bạn bè hoặc chỉ có biểu tượng cảm xúc: không đủ nghĩa, loại khỏi số đếm và ghi lý do.
  - Ghi loại nguồn "bình luận dưới video review" hoặc "bình luận dưới video bán hàng" cạnh câu trích và số đếm, để người đọc phân biệt hai loại này với nhau và với review sau mua trên sàn.
  - Đếm người viết theo L2 (chỉ trong cùng nền tảng). Cỡ mẫu ghi là "bình luận thu được", không phải "toàn bộ bình luận".
  - **Căn cứ:** chủ quyết ngày 08/10/2026: "Bình luận dưới video review được tính là lời khách hàng"; với video bán hàng: "tính luôn là lời khách đi". Kết quả thử nguồn R3, R4 ở [nhật ký test](input-data-sources-test-log.md) (ST-20261008-18, -19).

### 2.2 Ngoại lệ đã được chủ duyệt

Đây là "thẩm quyền tương ứng" mà quy tắc 5 yêu cầu. Chỉ áp đúng phạm vi ghi dưới đây; ngoài phạm vi thì quy tắc 5 và 9 giữ nguyên.

**Ngoại lệ ngày 05/10/2026 (từ v1.0, không đổi)**

- **E1 · Phần 8 (M08) – số tham khảo quảng cáo.**
  - **Được phép:** ROAS và CPA của sản phẩm hoặc gian hàng đối thủ, làm **số tham khảo ước tính**. Mỗi số ghi kỳ đo, đối tượng đo (sản phẩm, gian hàng hay video) và câu miễn trừ: *"Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế."*
  - **Ad Spend:** chỉ đưa vào sau khi xác nhận nguồn trả được trường này.
  - **Vẫn cấm:**
    - kết luận kênh A hiệu quả hơn kênh B;
    - suy ra giá vốn, lợi nhuận hay "có lãi hay không" từ ROAS/CPA;
    - cộng hoặc ghép số quảng cáo với số bán hàng từ nguồn khác như thể cùng một nguồn.
  - **Trong báo cáo:** ghi "số liệu quảng cáo (ước tính)", không nêu tên nhà cung cấp số liệu.
- **E2 · Phần 12 (M12) – khuyến nghị.**
  - **Được phép:** AI soạn khuyến nghị gồm tối đa 3 phương án, việc làm ngay, người phụ trách và hạn chót đề xuất. Tất cả gắn nhãn **"đề xuất, chờ chủ duyệt"**.
  - **Con số đi kèm ("so-what"):** chỉ là doanh thu quan sát trong mẫu của nhóm sản phẩm nhắm tới.
  - **Vẫn cấm:**
    - AI gán ngân sách, lợi nhuận hay mức tăng doanh số;
    - nói quy mô thị trường;
    - chấm điểm hay xếp hạng phương án.
  - Chủ là người chọn phương án cuối cùng; báo cáo được phát hành sau khi chủ duyệt lời văn.
- **E3 · Phần 1 (M01) – kết luận chính.**
  - **Được phép:** AI tóm tắt 4–6 phát hiện **mô tả trong mẫu**, rút từ các phần sau của báo cáo. Mỗi phát hiện có bằng chứng: trỏ tới hình, bảng hoặc số cụ thể, theo dạng `Nhận định / Bằng chứng / Trạng thái`. Thiếu bằng chứng thì viết nhẹ đi hoặc bỏ.
  - **Bắt buộc:** ghi phạm vi (trong mẫu, kỳ, nhóm sản phẩm); phân loại chưa duyệt thì gắn nhãn "đề xuất, chờ chủ duyệt". Phần 1 nằm trong bản chủ duyệt trước khi phát hành.
  - **Vẫn cấm:**
    - AI tự chọn thứ tự ưu tiên hay xếp hạng các phát hiện;
    - kết luận quy mô thị trường, nhân quả, tỷ lệ khách hàng;
    - lấy 1 trường hợp (1 sản phẩm, 1 gian hàng) để nói về cả ngành hàng;
    - gộp claim khác phạm vi (toàn mẫu với nhóm lõi).
  - Có thể nhắc lại khuyến nghị của Phần 12 (E2), giữ nguyên nhãn "đề xuất, chờ chủ duyệt".

**Ngoại lệ ngày 07/10/2026 (mới ở v1.1, phần Insight)**

- **E4 · I02 – chân dung khách hàng có thẻ bằng chứng.**
  - **Căn cứ:** chủ cho phép AI tổng hợp chân dung "miễn là có thẻ bằng chứng" (07/10/2026, ghi trong [khangpworking/tdn-growth-os#124](https://github.com/khangpworking/tdn-growth-os/issues/124)); chủ yêu cầu dựng chân dung cho báo cáo insight thạch dừa (07/10/2026).
  - **Được phép:** AI tổng hợp chân dung từ **lời khách thật**, mỗi chân dung:
    - dựa trên ≥3 thẻ bằng chứng (câu trích nguyên văn có locator);
    - từ ≥5 người viết khác nhau, đếm theo mã người viết khi nguồn có (L2). Nguồn không có mã người viết: ≥5 bản ghi có nội dung khác nhau (bản trùng nguyên văn không tính thêm), và ghi ngay đầu chân dung "chưa xác minh là 5 người";
    - mỗi đặc điểm (hoàn cảnh, nhu cầu, lo lắng, lý do mua, kênh mua) trích được câu nói thật; đặc điểm không có câu trích thì bỏ;
    - tuổi, giới tính, thu nhập, nơi ở chỉ ghi khi chính bài viết nói.
  - **Bắt buộc:** nhãn "Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật"; cỡ nhóm ghi "x/y bản ghi trong mẫu".
  - **Vẫn cấm:** AI viết câu nói giả như lời khách hoặc đóng vai người trả lời; tỷ lệ khách hàng; suy nhân khẩu học.
- **E5 · I02/I13 – chân dung người bán nhắm tới, có số liệu thị trường củng cố.**
  - **Căn cứ:** chủ nhận định người bán đã nghiên cứu khách trước khi làm nội dung, nên phần lớn mục tiêu của họ là đúng, và yêu cầu dùng số liệu video, doanh thu, chi quảng cáo cùng dữ liệu Facebook/Instagram để củng cố (07/10/2026).
  - **Là gì:** một lớp riêng, tách khỏi chân dung E4, tên hiển thị "Chân dung người bán nhắm tới, có số liệu bán hàng củng cố (trong mẫu)".
  - **Được công nhận khi qua đủ 4 phép kiểm, và tín hiệu đến từ ≥2 nền tảng:**

    | Phép kiểm | Cách đo | Cách A: số cố định | Cách B: hiệu chỉnh theo dữ liệu | Cách C: 80/20 |
    |---|---|---|---|---|
    | 1. Nhiều người bán cùng nhắm | Cùng một nhóm khách xuất hiện ở nhiều thương hiệu hoặc gian hàng độc lập | ≥3 thương hiệu hoặc gian hàng | — | — |
    | 2. Thị trường đáp lại | Nội dung nhắm nhóm đó có doanh thu thuộc nhóm cao **trong mẫu**, và doanh thu kéo dài, không chỉ một lần nổi | Thuộc nhóm 20% video doanh thu cao nhất; duy trì ≥4 tuần | Duy trì lâu bằng nhóm 25% video duy trì lâu nhất của ngành hàng trong mẫu | Thuộc nhóm video cộng dồn tạo ra 80% doanh thu trong mẫu |
    | 3. Người bán tiếp tục trả tiền | Chi quảng cáo hoặc tỷ trọng doanh thu từ quảng cáo duy trì; hoặc quảng cáo trong thư viện quảng cáo công khai chạy liên tục. ROAS/CPA chỉ là số tham khảo theo E1 | Duy trì ≥4 tuần, hoặc quảng cáo chạy ≥30 ngày. Ghi thêm các mốc tham khảo 17 ngày, 3 tuần, 60 ngày (G6); các mốc này không tự làm phép kiểm đạt | Chạy lâu bằng nhóm 25% quảng cáo chạy lâu nhất của ngành hàng trong mẫu | — |
    | 4. Khách tự xác nhận | Review, bình luận, bài viết có người tự nói đúng hoàn cảnh đó | ≥1 câu trích có locator ở nguồn không phải của người bán | — | — |

  - **Nhiều cách tính (chủ quyết 07/10/2026, giữ song song):** báo cáo tính theo mọi cách áp dụng được và ghi rõ đạt theo cách nào, ví dụ "đạt theo cách A và C". Một phép kiểm đạt khi đạt ít nhất một cách; cách không đạt vẫn ghi ra. Giải thích: Phụ lục G3 (80/20), G5 (nhóm 25% cao nhất), G6 (tuổi thọ quảng cáo).

  - **Tỷ lệ khớp:** với N nội dung người bán được đọc trong mẫu, đếm n nội dung có nhóm khách nhắm tới **khớp** với lời khách (phép kiểm 4). Hiển thị "n/N trong mẫu". Nhận định của chủ "khoảng 70% người bán nhắm đúng" là **giả thuyết để so**, không phải kết luận.
  - **Bắt buộc:**
    - ghi phản chứng song song: nội dung nhắm cùng nhóm nhưng doanh thu thấp; lời khách cho thấy người mua khác nhóm;
    - phân loại "nhóm khách", "định dạng video", "kiểu câu mở đầu", "lời kêu gọi" dùng codebook đã duyệt (quy tắc 8, L3);
    - mỗi kết quả lưu link nội dung, mốc thời gian (với video), câu trích và ngày lấy số liệu.
  - **Vẫn cấm:**
    - viết lớp này như chân dung người mua đã xác minh;
    - tỷ lệ khách hàng, quy mô thị trường;
    - suy lợi nhuận hay "có lãi" từ ROAS/CPA hoặc từ việc chạy quảng cáo lâu (E1);
    - ghép người hoặc cộng số giữa các nền tảng (L5);
    - xếp hạng định dạng hay thông điệp "tốt nhất"; chỉ trình bày cạnh nhau theo tiêu chí chủ đặt.
- **E6 · Insight – kết luận chính và Phần 15 (I15).**
  - **Căn cứ:** chủ duyệt đề xuất sửa báo cáo insight theo chuẩn trình bày của báo cáo thị trường, gồm Kết luận chính và 3 đề xuất "đề xuất, chờ chủ duyệt" (07/10/2026).
  - **Kết luận chính của Insight:** áp đúng E3 (4–6 phát hiện mô tả trong mẫu, có bằng chứng, có phạm vi, không xếp hạng), cộng với L3 và L4.
  - **Phần 15 (I15):** áp đúng E2 (tối đa 3 đề xuất, người phụ trách và hạn chót đề xuất, nhãn "đề xuất, chờ chủ duyệt", số đi kèm chỉ là doanh thu trong mẫu). Thứ tự các việc theo L4. Ngưỡng chất lượng do AI đề xuất (ví dụ cỡ mẫu, độ phủ) ghi là "ngưỡng đề xuất, chủ chỉnh được".
  - **Vẫn cấm:** như E2, E3. Khi chủ đã đưa phương án của mình, phương án của chủ và đề xuất của AI nằm ở hai danh sách riêng (`ownerOptions[]` / `aiCandidates[]`), không chọn thay chủ.
- **E7 · I01 – câu hỏi làm việc.**
  - **Được phép:** khi chủ chưa viết câu hỏi kinh doanh, báo cáo dùng một "câu hỏi làm việc do AI đề xuất, chờ chủ duyệt", và liệt kê các trường chủ cần bổ sung (`decisionToInform`, `audience`, `scope`, `knownConstraints`).
  - **Vẫn cấm:** coi câu hỏi làm việc là câu hỏi của chủ; dùng nó để chọn hay lọc bằng chứng theo hướng có lợi cho một kết luận.
- **E8 · Thu review mở rộng không đặt trần chi phí.**
  - **Căn cứ:** chủ quyết "không có giới hạn trần, miễn là chất lượng báo cáo đạt" (07/10/2026).
  - **Được phép:** đề xuất thu review mở rộng với điều kiện dừng là đạt ngưỡng chất lượng, không phải hết ngân sách.
  - **Vẫn bắt buộc:** mỗi lần gọi nhà cung cấp dữ liệu có tính phí phải báo trước danh sách và ước tính chi phí để chủ duyệt. Không mua hàng (L8).

**Ngoại lệ ngày 07/10/2026 (mới ở v1.2, phần Market)**

- **E9 · Phần 8 (M08) – so giá theo đơn vị chuẩn.**
  - **Căn cứ:** chủ đồng ý "chỉ được so khi cùng đơn vị chuẩn, cùng loại giá, cùng kỳ, và chỉ 'sắp xếp', không kết luận 'rẻ nhất / tốt nhất'" (07/10/2026).
  - **Được phép:** đặt cạnh nhau và **sắp xếp** giá theo đơn vị chuẩn (bảng đơn vị chuẩn ở M08) giữa nhiều sản phẩm, khi cả ba điều kiện cùng đúng:
    - cùng đơn vị chuẩn, kể cả cùng cơ sở khối lượng (tịnh hay cái); hàng dùng lâu thì cùng nhóm quy cách;
    - cùng loại giá: giá niêm yết, giá thanh toán, giá khuyến mãi có điều kiện không trộn với nhau;
    - cùng kỳ quan sát.
  - **Bắt buộc:** ghi đơn vị chuẩn, loại giá, kỳ, và số lượng lấy từ đâu (trang bán có locator, hay chủ khai báo). Sản phẩm thiếu số lượng hoặc thiếu giá vẫn được liệt kê với trạng thái "chưa rõ", nhưng không đưa vào phần sắp xếp.
  - **Vẫn cấm:**
    - kết luận "rẻ nhất", "đắt nhất", "tốt nhất", "đáng mua nhất";
    - gọi kết quả là "giá thị trường" hay "giá trung bình ngành";
    - suy chất lượng, giá trị, biên lợi nhuận hay mức giá nên bán từ giá theo đơn vị;
    - so khác đơn vị chuẩn, khác loại giá hoặc khác kỳ;
    - quy đổi hàng dùng lâu theo ml hay gram.

**Ngoại lệ ngày 07/10/2026 (mới ở v1.3)**

- **E10 · Phần 5 (M05) – doanh số là thước đo nhu cầu.**
  - **Căn cứ:** chủ: "cho phép doanh số là nhu cầu" (07/10/2026).
  - **Được phép:** dùng doanh số (doanh thu, số đơn vị bán, kể cả số ước tính) làm thước đo nhu cầu ở M05 và ở các phần lấy số từ M05 (M01, M11). Ghi là "nhu cầu, đo bằng doanh số (ước tính) trong mẫu".
  - **Bắt buộc:** ghi kỳ và nguồn; tách theo sàn (L5); số ước tính kèm câu miễn trừ như E1. Mức quan tâm tìm kiếm (Trends) ghi riêng là "mức quan tâm tìm kiếm", không cộng hay trộn với doanh số.
  - **Vẫn cấm:** quy mô thị trường ngoài mẫu; nhu cầu chưa được đáp ứng (theo I09); dự báo (M10); đếm người mua.
- **E11 · Báo cáo chạy theo quy tắc mặc định, không chờ chủ nhập liệu.**
  - **Căn cứ:** chủ: "chủ có tham gia làm báo cáo hay có gì để input vào báo cáo đâu mà có phần chủ quyết" (07/10/2026).
  - **Nguyên tắc:** chỗ nào phương pháp ghi "chủ khai báo", "chủ duyệt" hay "chủ định nghĩa" cho **nội dung báo cáo**, hệ thống dùng quy tắc mặc định trong bảng dưới, ghi rõ quy tắc đã dùng trong phần phương pháp của báo cáo (M02, I03), và không dừng chờ chủ. Chủ sửa quy tắc bằng một quyết định mới, ghi vào file này.
  - **Không áp cho:** chi tiền thật, merge và deploy, hành động ra bên ngoài (đặt hàng, đăng bài, nhắn tin). Những việc này vẫn cần chủ đồng ý từng lần.
  - **Quy tắc mặc định:**

    | Chỗ trước đây cần chủ | Quy tắc mặc định |
    |---|---|
    | Câu hỏi kinh doanh (I01) | Câu hỏi làm việc theo E7 |
    | Tập đối thủ để so (M07, I13) | Lấy từ dữ liệu bán hàng (sàn thương mại điện tử và video bán hàng), cùng nhóm sản phẩm, cùng kỳ: các thương hiệu đứng đầu theo doanh thu trong mẫu, cộng dồn tới khi đạt ≥50% doanh thu của nhóm (cùng ngưỡng ở mục 6.3). Không rõ thương hiệu thì dùng gian hàng. Quy tắc chốt trước khi đọc số để không chọn lọc theo kết quả. Thương hiệu lấy từ tiêu đề ghi "theo tiêu đề người bán" |
    | Mẫu số của tỷ lệ (quy tắc 4) | Toàn bộ bản ghi của tập mẫu đã chốt, cùng nguồn, cùng kỳ, cùng đơn vị; ghi rõ mẫu số trong báo cáo |
    | Thước đo nhu cầu (M05) | Doanh số, theo E10 |
    | Nhóm để so (I11) | Theo sàn; theo khách mua lẻ và khách mua sỉ, khi nguồn cho phân biệt được (chủ chọn 07/10/2026) |
    | Ưu tiên giữa các hướng, phương án (M11, I14, I15) | Không xếp ưu tiên, chỉ liệt kê (chủ chọn 07/10/2026) |
    | Duyệt cách xếp nhóm (quy tắc 8, L3) | AI lập bộ mã và gắn mã. Một model khác, độc lập, gắn mã lại toàn bộ khi tập có ≤200 bản ghi, hoặc một mẫu ngẫu nhiên 200 bản ghi khi lớn hơn. Độ đồng thuận κ ≥ 0,6: số đếm được dùng ở bản phát hành, nhãn "phân loại do AI, đã kiểm chéo". κ < 0,6: nhãn "độ tin cậy thấp", không đưa số đếm vào Kết luận chính. Bản ghi hai model gắn khác nhau liệt kê ở phụ lục. **Ghi chú:** chủ chưa có chuyên môn để duyệt mốc κ (07/10/2026); mốc 0,6 giữ theo chuẩn thường dùng, xem lại khi có người có chuyên môn. Giải thích: Phụ lục G2, G7 |
    | Đơn vị chuẩn khi tính giá (M08) | Theo bảng đơn vị chuẩn ở M08. Hàng bán theo khối lượng dùng khối lượng tịnh; ghi thêm khối lượng cái khi trang bán có |

**Ngoại lệ ngày 08/10/2026 (mới ở v1.5)**

- **E12 · Thống kê chính thức của Cục Thống kê làm bối cảnh vĩ mô, cho mọi ngành hàng.**
  - **Căn cứ:** chủ đồng ý ngày 08/10/2026. Trang nso.gov.vn yêu cầu *"ghi rõ nguồn trang Thông tin điện tử Cục Thống kê (www.nso.gov.vn) khi trích lại thông tin"*.
  - **Được phép:**
    - dùng số liệu của Cục Thống kê (giá tiêu dùng, bán lẻ, chi tiêu hộ, sản xuất công nghiệp, xuất nhập khẩu, dân số, thu nhập, dùng internet và mạng xã hội) làm **bối cảnh** cho M02, M05, M06, M08, M09, M10, M13, I02, I03, I12;
    - ghi tên **"Cục Thống kê (nso.gov.vn)"** trong báo cáo. Đây là ngoại lệ của quy tắc không nêu tên nhà cung cấp dữ liệu, vì trang yêu cầu ghi nguồn.
  - **Bắt buộc:**
    1. **Khác phạm vi với mẫu.** Ghi rõ "toàn quốc" (hoặc vùng, tỉnh) và tên nhóm thống kê. Đặt cạnh số trong mẫu, không cộng, trừ hay chia với số trong mẫu (quy tắc 3, 4).
    2. **Trạng thái số liệu.** Ghi "ước tính", "sơ bộ" hay "chính thức" đúng như file nguồn, kèm ngày công bố. Số tháng thường được sửa ở kỳ sau; kỳ sau có số mới thì dùng số mới và ghi đã cập nhật.
    3. **Truy nguồn.** Trích tới file, bảng (sheet), dòng; với PDF là số trang và số bảng.
    4. **Nhóm thống kê rộng hơn ngành hàng.** Chọn nhóm hẹp nhất chứa ngành hàng theo mục 6.4 và ghi rõ, ví dụ "sản phẩm này thuộc nhóm thống kê 'Đồ dùng, dụng cụ trang thiết bị gia đình'; nhóm này rộng hơn ngành hàng đang xét". Ngành hàng nằm giữa hai nhóm thì ghi cả hai, không tự chia phần.
  - **Vẫn cấm:**
    - suy quy mô hay thị phần của một ngành hàng từ số của nhóm thống kê (ví dụ "ngành hàng X chiếm y% bán lẻ thực phẩm");
    - suy nhân quả (ví dụ "giá tiêu dùng tăng nên doanh số trong mẫu giảm");
    - dùng làm lời khách, đặc điểm chân dung hay độ tiếp cận kênh;
    - dùng để dự báo ngoài điều kiện của M10.

**Ngoại lệ ngày 08/10/2026 (mới ở v1.8)**

- **E13 · Dữ liệu mở của Ngân hàng Thế giới làm bối cảnh vĩ mô (nguồn S23).**
  - **Căn cứ:** chủ đồng ý ngày 08/10/2026. Dữ liệu dùng giấy phép mở CC BY 4.0, bắt buộc ghi nguồn khi dùng lại.
  - **Được phép:**
    - dùng chỉ số của Ngân hàng Thế giới (dân số, thu nhập, chi tiêu hộ bình quân đầu người, giá tiêu dùng theo năm, tỷ lệ dùng internet, thương mại) làm bối cảnh cho các section được dùng E12, khi:
      - Cục Thống kê không có chỉ số tương đương; hoặc
      - cần chuỗi nhiều năm cùng một cách tính; hoặc
      - cần so với nước khác;
    - ghi tên **"Ngân hàng Thế giới (World Bank Open Data)"**, kèm tên chỉ số, mã chỉ số, năm, và ngày dữ liệu được cập nhật. Đây là ngoại lệ của quy tắc không nêu tên nhà cung cấp, vì giấy phép yêu cầu ghi nguồn.
  - **Bắt buộc:** cả bốn điều bắt buộc và mục "Vẫn cấm" của E12. Thêm:
    1. **Không coi là xác nhận độc lập.** Nhiều chỉ số của Ngân hàng Thế giới lấy lại từ Cục Thống kê. Hai nguồn khớp nhau không được viết là "hai nguồn cùng xác nhận".
    2. **Hai nguồn lệch nhau:** ghi cả hai cạnh nhau, kèm năm, đơn vị và cách tính (theo M01). Không chọn một.
    3. **Đơn vị tiền:** giữ đúng đơn vị của nguồn (ví dụ "USD theo giá năm 2015"). Không tự quy đổi sang đồng để đặt cạnh giá trong mẫu.
    4. Số do Ngân hàng Thế giới tự ước tính (khi dữ liệu có ghi chú) thì ghi "ước tính".

---

## 3. Bảng tổng quan 30 section

Nguồn dữ liệu của từng section: [Input data sources for 30 sections, mục 3](input-data-sources-30-sections.md#3-section-dùng-nguồn-nào).

| # | ID | Tiêu đề | Nhóm | Phương pháp lõi (latest) | Trạng thái |
|---:|---|---|---|---|---|
| 1 | M01 | Kết luận chính | Synthesis | Inventory claim đúng nguồn; không xếp ưu tiên, chỉ liệt kê (E11) | PROPOSED + BUSINESS_REVIEWED + E3 |
| 2 | M02 | Phạm vi và phương pháp | Existing | Tài khoản scope/method A22 | EXISTING_BOUNDED |
| 3 | M03 | Quy mô và diễn biến | Existing | Tổng đơn-chuẩn-bị A32/A37, giữ đủ/thiếu/zero/UNKNOWN | EXISTING_BOUNDED |
| 4 | M04 | Cơ cấu thị trường | Existing | Slice nhóm/tập trung MetricScope/A27; cần đủ denominator để vẽ share | EXISTING_BOUNDED |
| 5 | M05 | Nhu cầu | Additional | Phân vùng thước đo nghĩa đen theo nguồn; doanh số là thước đo nhu cầu (E10) | PROPOSED + BUSINESS_REVIEWED + E10 |
| 6 | M06 | Nguồn cung | Additional | Inventory cung có locator; có kiểm chứng agent ngày 05/10 (phần mẫu hẹp) | PROPOSED + VALIDATED_IN_SAMPLE |
| 7 | M07 | Đối thủ | Additional | So sánh cạnh nhau theo tập đối thủ lấy từ dữ liệu bán hàng (E11); không rank | PROPOSED + BUSINESS_REVIEWED + E11 |
| 8 | M08 | Giá và kinh tế đơn vị | Existing + bổ sung | Số học quote A24/P4 + giá theo đơn vị chuẩn từng ngành hàng (v1.2) + benchmark ROAS/CPA (05/10) | BOUNDED + BENCHMARK_ADDED + E1 + E9 |
| 9 | M09 | Động lực và rủi ro | Additional | Inventory sự kiện có nguồn/ngày + kênh báo cáo ngành (05/10) + tìm kiếm có lọc thời gian và trong một trang báo (v1.8) | PROPOSED + BUSINESS_REVIEWED |
| 10 | M10 | Dự báo và kịch bản | Additional | Gate đủ điều kiện; chỉ kịch bản có điều kiện; forecast sản xuất chặn | BLOCKED (by design) |
| 11 | M11 | Cơ hội | Synthesis | Giao 3 tín hiệu; inventory evidence không rank (05/10) | PROPOSED + BUSINESS_REVIEWED |
| 12 | M12 | Hành động | Synthesis | Packet quyết định; AI đề xuất cấu trúc, người quyết | PROPOSED + BUSINESS_REVIEWED + E2 |
| 13 | M13 | Phụ lục và truy nguồn | Existing | Provenance từng dòng A23 | EXISTING_BOUNDED |
| — | (Insight) | Kết luận chính của Insight | Synthesis | Tóm tắt mô tả trong mẫu theo E3 | E6 (mới 07/10) |
| 14 | I01 | Câu hỏi kinh doanh | Synthesis | Brief do chủ viết, kiểm trường bắt buộc; câu hỏi làm việc có nhãn khi thiếu | PROPOSED + E7 |
| 15 | I02 | Khách hàng và hoàn cảnh | Additional | Coding hoàn cảnh theo bản ghi định vị; chân dung có thẻ bằng chứng; lời khách gồm cả bình luận dưới video review và video bán hàng (L10); lớp người bán nhắm tới | PROPOSED + BUSINESS_REVIEWED + E4 + E5 |
| 16 | I03 | Phương pháp nghiên cứu | Existing | Tài khoản phương pháp A25 | EXISTING_BOUNDED |
| 17 | I04 | Hành vi | Additional | Coding hành động/episode theo nguồn | PROPOSED + BUSINESS_REVIEWED |
| 18 | I05 | Cảm nhận và thái độ | Additional | Coding phát biểu định vị; số sao là phân bố riêng | PROPOSED + BUSINESS_REVIEWED |
| 19 | I06 | Hành trình | Additional | Chuỗi sự kiện chỉ khi nguồn link thật hoặc tường thuật trong 1 bản ghi | PROPOSED + BUSINESS_REVIEWED |
| 20 | I07 | Lý do lựa chọn | Additional | Lý do nêu trực tiếp trong bản ghi; không suy từ hành vi | PROPOSED + BUSINESS_REVIEWED |
| 21 | I08 | Rào cản | Additional | Rào cản task–trở ngại trong cùng locator | PROPOSED + BUSINESS_REVIEWED |
| 22 | I09 | Nhu cầu chưa được đáp ứng | Additional | Cặp mong muốn–thiếu hụt trong cùng bản ghi | PROPOSED + BUSINESS_REVIEWED |
| 23 | I10 | Chủ đề và mối quan tâm | Additional | Coding corpus đóng băng; n/N trong corpus; bản phát hành cần bộ mã đã kiểm chéo (E11) | PROPOSED + BUSINESS_REVIEWED + E11 |
| 24 | I11 | Khác biệt giữa các nhóm | Advanced | Nhóm mặc định theo sàn và mua lẻ/mua sỉ (E11); rate mô tả khi mẫu số tương thích; suy luận chặn | PROPOSED + BUSINESS_REVIEWED + E11 |
| 25 | I12 | Điểm tiếp xúc | Advanced | PRESENCE/EXPOSURE/OUTCOME tách rời; ratio theo unit đã link | PROPOSED + BUSINESS_REVIEWED |
| 26 | I13 | Thương hiệu và đối thủ | Additional | Inventory nhắc thương hiệu/nội dung trong corpus đóng băng; lời người bán theo L7 | PROPOSED + BUSINESS_REVIEWED + E5 |
| 27 | I14 | Hướng cơ hội | Synthesis | Portfolio hướng không rank; AI candidate tách riêng | PROPOSED + BUSINESS_REVIEWED |
| 28 | I15 | Định hướng chiến lược | Synthesis | Packet so sánh phương án; đề xuất AI theo E2 | PROPOSED + BUSINESS_REVIEWED + E6 |
| 29 | I16 | Thử nghiệm và đo lường | Advanced | DESIGN_ONLY hoặc EXISTING_RESULT với protocol đúng | PROPOSED + BUSINESS_REVIEWED |
| 30 | I17 | Phụ lục và bằng chứng | Existing | Trace tham chiếu A26 | EXISTING_BOUNDED |

Quy tắc áp cho nhiều section, không lặp lại ở từng dòng:
- E12, E13 (số liệu Cục Thống kê, Ngân hàng Thế giới làm bối cảnh vĩ mô): M02, M05, M06, M08, M09, M10, M13, I02, I03, I12.
- L1–L10: mọi section Insight. L9 (lọc nghĩa từ khoá): mọi section dùng nguồn thu bằng từ khoá.
- E8 và mục 6.3 (thu review mở rộng): mọi section dùng review.

---

## 4. Chi tiết Market Report

Không đổi so với v1.0, trừ việc bỏ đường dẫn máy cá nhân.

### M01 · Kết luận chính — PROPOSED + BUSINESS_REVIEWED

- **Câu hỏi:** những claim đã review nào liên quan đúng câu hỏi kinh doanh; xung đột/giới hạn còn lại là gì.
- **Phương pháp:** replay từng claim ref (artifact/digest/pointer); giữ xung đột song song, không vote đa số, không pick mới nhất; inventory theo catalog order khi chưa có bộ lọc liên quan; chỉ người có thẩm quyền mới viết kết luận (ghi thành quyết định riêng, tham chiếu inventory).
- **Cấm:** kết luận ưu tiên, ranking, khuyến nghị từ AI; hợp nhất claim ALL/WIDE/CORE khác scope.
- **Ngoại lệ E3 (05/10/2026):** AI được tóm tắt 4–6 phát hiện mô tả trong mẫu, mỗi phát hiện có bằng chứng; được nhắc lại khuyến nghị Phần 12 với nhãn "đề xuất, chờ chủ duyệt"; chủ duyệt trước khi phát hành. Khi chưa có câu hỏi kinh doanh của chủ, Phần 1 vẫn hiện tóm tắt mô tả, không chặn.
- **Chặn khi:** thiếu câu hỏi chủ (`M01_OWNER_QUESTION_MISSING`), replay fail, chưa có synthesis policy.

### M02 · Phạm vi và phương pháp — EXISTING_BOUNDED

- Chỉ dùng tài khoản scope/method của A22: membership nguồn, độ phủ quan sát, trạng thái label, kỳ. Không xác định "có đại diện cho thị trường", không xác thực nguồn.

### M03 · Quy mô và diễn biến — EXISTING_BOUNDED

- Tổng trên một đơn chuẩn bị đã chuẩn hóa duy nhất (A32/A37); giữ nguyên nghĩa đầy đủ/thiếu/zero/UNKNOWN. Không tự tạo multi-period trend từ chuỗi chưa tương thích; không biến subtotal quan sát được thành tổng thị trường.

### M04 · Cơ cấu thị trường — EXISTING_BOUNDED

- Dùng group/concentration arrays đầy đủ của MetricScope và view A27. Share chỉ vẽ khi denominator/completeness đầy đủ; thiếu thì hiển thị phân bố số lượng, không vẽ phần trăm. Không tạo segmentation mới.

### M05 · Nhu cầu — PROPOSED + BUSINESS_REVIEWED

- **Phương pháp:** phân vùng thước đo nghĩa đen theo nguồn (đơn vị, kỳ, timezone, universe, frame); cộng chính xác khi khai báo additive và chứng minh được rời nhau; rate chỉ với mẫu số chủ khai báo. Mapping "thước đo → proxy nhu cầu" (ví dụ bán hàng = nhu cầu) phải có phê duyệt người, phiên bản hóa.
- **Cập nhật 05/10:** khối lượng comment/review lớn hơn không tự nâng giá trị claim — số bản ghi vẫn là bản ghi, không phải người; chỉ tăng độ phủ chủ đề khi có codebook + corpus đóng băng (đi qua I10), không mua thêm nguồn chỉ vì "thêm sample".
- **Cấm:** nhu cầu chưa được đáp ứng, quy mô thị trường, đếm người, điểm tổng hợp nhu cầu.
- **Cập nhật 07/10 (E10):** doanh số được dùng làm thước đo nhu cầu trong mẫu; mức quan tâm tìm kiếm ghi riêng.

### M06 · Nguồn cung — PROPOSED + VALIDATED_IN_SAMPLE (cập nhật 05/10)

- **Phương pháp gốc:** inventory dòng nguồn có locator, theo đúng nhãn trạng thái nguồn nêu; đếm unique chỉ khi có ID ổn định + quy tắc dedup; tỷ lệ/share chỉ khi có denominator chủ khai báo tương thích. Không suy số lượng cung duy nhất, hàng tồn, độ mới hay thị phần khi thiếu.
- **Kết quả kiểm chứng agent 05/10** (báo cáo kiểm chứng M06 và 4 file kèm; file riêng của chủ, ngoài repo):
  - Trong 10 dòng hiển thị: 2 dòng mỹ phẩm, 8 dòng thực phẩm thuộc 4 shop — phép tính chạy lại 2 lần khớp danh sách ID/số dòng/doanh thu.
  - 19 kết luận kiểm tra: 7 PASS (phạm vi hẹp), 3 PARTIAL, 9 BLOCKED. Baseline 223 dòng/127 shop **chưa tái kiểm** vì thiếu workbook gốc; TradeInt bị chặn vì chưa có phiên truy cập hợp lệ.
  - Kết luận đúng mức: **đủ bằng chứng cho bản đồ đầu mối quan sát được trong mẫu; chưa đủ xác nhận toàn bộ nguồn cung.** Không coi đây là phê duyệt toàn M06.
- **Cách bổ sung trong phạm vi online:** mở rộng dùng chính inventory có locator (Metric export, TradeInt khi có phiên hợp lệ, trang nhà sản xuất/nhà phân phối) theo đúng ràng buộc trên; mỗi lần mở rộng phải chạy lại phép kiểm, không kế thừa "đã kiểm" từ mẫu hẹp.
- **Cấm:** N unique sản phẩm/nhà cung cấp khi thiếu ID; available market supply; xếp hạng nhà cung cấp; thị phần.

### M07 · Đối thủ — PROPOSED + BUSINESS_REVIEWED (cập nhật 05/10)

- **Phương pháp:** chủ khai báo peer-set (anchor + peers, căn cứ quan hệ, scope, phiên bản tiêu chí) **trước khi** đọc giá trị; so sánh cạnh nhau chỉ trong phân vùng cùng thước đo/đơn vị/kỳ/timezone; delta `peer − anchor` chỉ khi được bật riêng; thiếu peer set → inventory không rank.
- **Nguồn dữ liệu hợp lệ cho bảng so sánh:** Kalodata và Metric (như đã chốt 05/10). Không dùng AI/search để "phát hiện" đối thủ; cùng sản phẩm phải có căn cứ danh tính từ nguồn.
- **Cấm:** rank/winner/best-worst, tương đương sản phẩm tự suy, chiến lược/tiện lợi giá nếu chưa có phương pháp được duyệt.
- **Liên quan v1.1:** nội dung video và quảng cáo của đối thủ (mục 6) được dùng ở đây như lời người bán (L7).
- **Cập nhật 07/10 (E11):** tập đối thủ lấy tự động từ dữ liệu bán hàng theo quy tắc mặc định ở E11, thay cho danh sách chủ khai báo.

### M08 · Giá và kinh tế đơn vị — BOUNDED + BENCHMARK_ADDED + E9 (cập nhật 05/10, 07/10)

- **Phần chuẩn hóa giá (A24/P4, duy nhất đã có code):** số học chính xác cho **một** quote (giá/kháp, giá/viên theo packCount do chủ khai báo), giữ rational + hiển thị 2 chữ số half-even; không so sánh quote, không giá thị trường, không biên lợi nhuận.
- **Giá theo đơn vị chuẩn của từng ngành hàng (mới ở v1.2):** chủ chọn đơn vị chuẩn cho ngành hàng **trước khi** tính.

  | Loại sản phẩm | Đơn vị chuẩn | Ghi chú |
  |---|---|---|
  | Bán theo khối lượng | Giá / 100 g | Tách **khối lượng tịnh** và **khối lượng cái** (sau khi chắt nước), ví dụ thạch dừa ngâm nước. Chủ chọn cơ sở nào cho ngành hàng; thiếu khối lượng cái thì không suy từ khối lượng tịnh |
  | Bán theo thể tích | Giá / 100 ml | Đồ uống, chất lỏng dùng dần |
  | Bán theo số lượng | Giá / đơn vị (viên, gói, túi lọc, cái…) | Đơn vị đếm phải cùng loại |
  | Hàng dùng lâu | Giá / cái, chỉ trong cùng nhóm quy cách (dung tích, chất liệu, kích cỡ) | Không chia theo ml hay gram; ví dụ bình giữ nhiệt 500 ml và 1 lít là hai nhóm |
  | Combo, bộ nhiều loại | Giá / combo | Không chia nhỏ |

  - Số gram, số ml, số đơn vị lấy từ trang bán (có locator) hoặc do chủ khai báo. Thiếu thì "chưa rõ"; không đoán từ tiêu đề.
  - Giá niêm yết, giá thanh toán, giá khuyến mãi có điều kiện là ba loại giá khác nhau, không thay nhau.
  - So giữa nhiều sản phẩm chỉ theo **E9**.
- **Phần benchmark quảng cáo (05/10):** với các trường ROAS/CPA, dùng dữ liệu Kalodata cho thị trường quảng cáo Việt Nam sau khi xác nhận API hỗ trợ; kèm disclaimer bắt buộc: *"Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế."*
- **Trạng thái xác nhận:** API đã xác nhận trả được **ROAS và CPA**; **chưa xác nhận trường Ad Spend trực tiếp** — không đặt số Ad Spend vào báo cáo cho đến khi xác nhận.
- **Chặn:** Kalodata không chứng minh giá vốn, chi phí thực, lợi nhuận thực; các trường này giữ `UNKNOWN` hoặc loại khỏi report, không nội suy từ ROAS/CPA.

### M09 · Động lực và rủi ro — PROPOSED + BUSINESS_REVIEWED (cập nhật 05/10)

- **Phương pháp:** inventory sự kiện/rủi ro có nguồn: tách ngày phát hành nguồn – ngày sự kiện – kỳ quan sát metric; trích đúng sự kiện/ngày/đối tượng/chiều hướng mà nguồn nêu; giữ mâu thuẫn song song; `documented_event` tách `candidate_driver_hypothesis` (chỉ người duyệt mới chuyển hạng).
- **Kênh nguồn bổ sung (05/10):** báo cáo ngành đã công bố — iPOS × Nestlé Professional (F&B VN 2025 và 6T/2026) cho bối cảnh kênh tiêu thụ; báo cáo thường niên doanh nghiệp ngành (ví dụ GC Food 2024, mục quản trị rủi ro) làm case doanh nghiệp, **không gắn nhãn số liệu toàn thị trường 2025**; Metric cho tín hiệu sát SKU (biến động bán/giá/khuyến mãi/phản hồi).
- **Tìm kiếm theo thời gian và trong một trang báo (08/10, v1.8):** tìm kiếm mở rộng (nguồn S19, gói P5) được lọc theo khoảng thời gian, và được tìm riêng trong một trang báo đã chọn. Mục đích là lập dòng thời gian sự kiện của đối thủ và ngành hàng: ra mắt sản phẩm, khuyến mãi lớn, tin an toàn thực phẩm, thu hồi.
  - Mỗi kết quả ghi ba mốc tách nhau: ngày đăng bài, ngày sự kiện mà bài nêu, và khoảng thời gian đã lọc. Khoảng lọc không chứng minh ngày sự kiện.
  - Hạng tin cậy chấm theo trang gốc. Kết quả qua bước lọc nghĩa L9 trước khi đếm.
  - Căn cứ: chủ đồng ý ngày 08/10/2026.
- **Khung diễn giải:** tín hiệu quan sát được → cơ chế có thể ảnh hưởng đến sản phẩm → bằng chứng đối chiếu → mức chắc chắn. Doanh số tăng chưa tự chứng minh nguyên nhân.
- **Cấm:** nhân quả, xác suất/tác động, xếp hạng rủi ro, forecast từ sự kiện.

### M10 · Dự báo và kịch bản — BLOCKED (by design)

- **Trạng thái chốt:** không chạy forecast sản xuất; chỉ nhận **kịch bản có điều kiện** (chậm/cơ sở/thuận lợi) khi dữ liệu ≤ 180 ngày, ghi rõ giả định lượng bán/giá/chi phí; không tự gán CAGR hay xác suất; tách "đã quan sát đến ngày chốt dữ liệu" khỏi "phần còn lại đang dự báo".
- **Gate kỹ thuật (đã drafted):** chuỗi ngày đóng băng (universe/timezone/metric/unit), train/validation/holdout không chồng lấn, horizon + gap policy chủ duyệt. Baseline last-observed/MAE chỉ là **đoạn chẩn đoán đề xuất**, chưa duyệt.
- **Điều kiện mở lại:** chỉ khi tự có chuỗi daily phù hợp (cùng listing, timezone, định nghĩa đủ dài để kiểm ngoài mẫu theo horizon đã chọn; 90–180 ngày không phải ngưỡng bảo đảm). Dữ liệu sàn không đủ để dự báo toàn thị trường VN.

### M11 · Cơ hội — PROPOSED + BUSINESS_REVIEWED (cập nhật 05/10)

- **Phương pháp:** inventory evidence không rank theo câu hỏi cơ hội của chủ; giữ support/counterevidence/thiếu bằng chứng song song; không dùng "ít đối thủ bán" hay doanh số làm bằng chứng cơ hội tự thân.
- **Định nghĩa cơ hội (đã thống nhất 05/10):** cơ hội = **giao điểm** của (1) nhu cầu có dấu hiệu thật trong dữ liệu, (2) đối thủ phục vụ chưa tốt, (3) khả năng đáp ứng. Ba tín hiệu phải tồn tại thành claim riêng, có locator; thiếu một cạnh → ghi thiếu bằng chứng, không kết luận cơ hội.
- **Ví dụ mẫu:** review phàn nàn gói lớn khó bảo quản → *giả thuyết* gói nhỏ → phải kiểm thêm nhu cầu và chi phí trước khi thành claim. AI không tự bịa ngân sách, lợi nhuận hay mức tăng doanh số.

### M12 · Hành động — PROPOSED + BUSINESS_REVIEWED

- **Phương pháp:** packet quyết định từ M09–M11 với cấu trúc: hành động → bằng chứng → đối tượng/kênh → cách thử → KPI → điều kiện dừng/mở rộng. Chỉ người có thẩm quyền chọn hành động; AI chỉ tổng hợp cấu trúc từ claim hợp lệ.
- **Cấm:** AI gán ngân sách, lợi nhuận hay mức tăng doanh số.
- **Ngoại lệ E2 (05/10/2026):** AI được đề xuất phương án, người phụ trách và hạn chót, gắn nhãn "đề xuất, chờ chủ duyệt"; con số đi kèm chỉ là doanh thu trong mẫu.

### M13 · Phụ lục và truy nguồn — EXISTING_BOUNDED

- Provenance từng bản ghi (A23): bản ghi/thu nhập/đơn vị trỏ đúng file digest + locator trong package đã chọn; label thiếu là null; coverage đếm locator, không phải "độ tin cậy nguồn".

---

## 5. Chi tiết Insight Report

Mỗi section giữ nguyên nội dung v1.0; phần **Cập nhật 07/10** là mới ở v1.1.

### Kết luận chính của Insight — E6 (mới 07/10)

- Báo cáo insight được có khối Kết luận chính ở đầu, theo E3 và L3, L4: 4–6 phát hiện mô tả trong mẫu, mỗi phát hiện trỏ tới phần, hình hoặc bảng; ghi phạm vi (số sản phẩm, sàn, kỳ, ngày thu); số đếm theo cách xếp chưa duyệt có nhãn ngay tại câu.
- Khi mẫu hẹp (ví dụ 1 sản phẩm), giới hạn đó phải là điểm đầu tiên của kết luận.
- Không suy từ 1 sản phẩm, 1 gian hàng ra cả ngành hàng.

### I01 · Câu hỏi kinh doanh — PROPOSED + E7

- Brief do chủ viết: `questionText`, `decisionToInform`, `audience`, `scope`, `knownConstraints` (thiếu thì ghi `UNSET`, không suy). Không có câu hỏi chủ → template rỗng, không tự sinh câu hỏi.
- **Cập nhật 07/10 (E7):** được dùng "câu hỏi làm việc do AI đề xuất, chờ chủ duyệt" khi chủ chưa viết câu hỏi, kèm danh sách trường chủ cần bổ sung.

### I02 · Khách hàng và hoàn cảnh — PROPOSED + BUSINESS_REVIEWED + E4 + E5

- Coding **bản ghi định vị**: trích thuộc tính hoàn cảnh mà nguồn nêu (vai/việc/thời điểm/bối cảnh) với locator; không phân phối dân số. Đếm bản ghi, không đếm người.
- **Cập nhật 07/10:**
  - Chân dung khách hàng được phép theo E4 (từ lời khách) và lớp "người bán nhắm tới" theo E5 (từ lời người bán, có số liệu củng cố). Hai lớp hiển thị riêng, không trộn.
  - Khi nguồn có mã người viết, đếm người viết trong cùng nền tảng (L2).
  - Nên tìm hoàn cảnh dùng sản phẩm ở các nguồn ngoài review sàn (bình luận dưới video, công thức, bài hướng dẫn), vì review sàn thường không nói người mua là ai (mục 6).

### I03 · Phương pháp nghiên cứu — EXISTING_BOUNDED

- Tài khoản phương pháp chính xác (A25). Không xác thực nguồn, không tuyên bố đại diện.
- **Cập nhật 07/10:** khi có nhiều nguồn, ghi riêng từng nguồn: nền tảng, ngày thu, số bản ghi, có hay không có số sao và mã người viết, bản ghi ngoài kỳ (tính theo giờ Việt Nam).

### I04 · Hành vi — PROPOSED + BUSINESS_REVIEWED

- Coding hành động/episode nguồn ghi nhận; hành vi mua không tự suy ra động cơ. Giữ hành động–kết quả tách rời khi nguồn không link.
- **Cập nhật 07/10:** ý định khách nói ra ("sẽ mua thêm") là ý định, không phải lần mua lại đã xảy ra. Dấu hiệu hành vi như săn khuyến mãi được ghi ở đây, không chuyển thành lý do mua (I07).

### I05 · Cảm nhận và thái độ — PROPOSED + BUSINESS_REVIEWED

- Coding phát biểu trực tiếp có locator; tách polarity khỏi người phát ngôn; giữ phủ định/điều kiện/hearsay; sao đánh giá không tự thành cảm nhận.
- **Cập nhật 07/10:** áp L6 cho số sao. Bản ghi chỉ báo trạng thái (ví dụ "chưa nhận hàng nên chưa đánh giá") cần quy tắc riêng trong codebook, không mặc định là lời chê.

### I06 · Hành trình — PROPOSED + BUSINESS_REVIEWED

- Chuỗi sự kiện chỉ khi: nguồn cấp episode key thật, hoặc tường thuật before/after trong **cùng một bản ghi** (label `SOURCE_EXPLICIT_SAME_RECORD`). Không join chéo file theo tên/ngôn từ. Record-local narrative không feed conversion/drop-off.
- **Cập nhật 07/10:** giữ thứ tự ý theo đúng thứ tự khách viết; không tự nối thành chuỗi nguyên nhân (ví dụ "giao chậm → hàng hỏng") khi khách không nói vậy.

### I07 · Lý do lựa chọn — PROPOSED + BUSINESS_REVIEWED

- Chỉ lý do **nêu trực tiếp** cho một lựa chọn được nhận diện, trong cùng bản ghi; `reasonNotStated` tách riêng; mua hàng không tự suy lý do; nhiều lý do không ép về một mã nếu policy không cho phép multi-code.
- **Cập nhật 07/10:** khi không có bản ghi nào nêu lý do, ghi "0 bản ghi nêu trực tiếp lý do mua". Lý do người bán nhấn mạnh (tiêu đề, video) ghi là "người bán nhắm tới" theo L7, đặt cạnh, không gộp vào lý do của khách.

### I08 · Rào cản — PROPOSED + BUSINESS_REVIEWED

- Rào cản hợp lệ khi bản ghi cùng lúc chứa task đã thử + trở ngại cụ thể; đánh giá xấu không kèm task → giữ nguyên là đánh giá, không thành barrier. Prevalence chặn khi thiếu denominator có khung chọn mẫu.
- **Cập nhật 07/10:** phản bác, lo ngại mà người bán **tự nêu** trong video ("ai nhận hàng?", "có an toàn không?") là lời người bán (L7), dùng ở I13/M07. Rào cản của khách lấy từ lời khách (review, bình luận).

### I09 · Nhu cầu chưa được đáp ứng — PROPOSED + BUSINESS_REVIEWED

- Chỉ khi **cùng một bản ghi** có mong muốn + trạng thái hiện tại/thất bại + quan hệ thiếu hụt tường minh. Vắng mặt trong sample, search không kết quả, bán thấp, than phiền đơn lẻ đều không thành unmet demand.
- **Cập nhật 07/10:** bản ghi có nghĩa chưa chắc thì đánh dấu chưa đủ bằng chứng, nêu các cách hiểu có thể.

### I10 · Chủ đề và mối quan tâm — PROPOSED + BUSINESS_REVIEWED

- Corpus đóng băng + codebook phiên bản + frame/đơn vị mã hóa; output là tần suất theo bản ghi/coding unit trong corpus; n/N hiển thị khi denominator đầy đủ. Không đọc thành % khách hàng/dân số; co-occurrence không thành nhân quả.
- **Cập nhật 07/10:** áp L3 (nháp và phát hành) và L4 (không xếp hạng ngầm). Nhãn ô có sẵn trong mẫu đánh giá của sàn ("Hương vị:", "Đường:") không quyết định chủ đề.
- **Cập nhật 07/10 (E11):** "bộ mã đã duyệt" nghĩa là đã qua kiểm chéo bằng model thứ hai theo E11.

### I11 · Khác biệt giữa các nhóm — PROPOSED + BUSINESS_REVIEWED

- Nhóm do chủ định nghĩa trước khi xem số; cùng outcome/đơn vị/kỳ/frame mới so; rate + chênh lệch giữ phân số chính xác; sparse-cell rule và phương pháp uncertainty phải khai báo trước; suy luận thống kê chặn khi thiếu.
- **Cập nhật 07/10:** so giữa nền tảng (Shopee, TikTok Shop, Facebook, Instagram) chỉ là so cạnh nhau theo L5; mẫu số mỗi nền tảng ghi riêng.
- **Cập nhật 07/10 (E11):** nhóm mặc định là theo sàn và theo khách mua lẻ / mua sỉ.

### I12 · Điểm tiếp xúc — PROPOSED + BUSINESS_REVIEWED

- Ba trạng thái tách rời PRESENCE / EXPOSURE / OUTCOME. Ratio chỉ khi đếm theo **unit đã link** (unit có ít nhất một outcome / unit đủ điều kiện đã tiếp xúc) trong cùng window; event chia event không phải conversion. Hiệu quả kênh/ROI/nhân quả yêu cầu thiết kế riêng đã duyệt (I16), không từ temporal order.
- **Cập nhật 07/10:** định dạng video, câu mở đầu, lời kêu gọi (bình luận, nhắn tin, gọi, website, tư vấn) là PRESENCE trong nội dung người bán. Đặt cạnh số liệu bán hàng của chính nội dung đó là mô tả trong mẫu, không phải hiệu quả kênh.

### I13 · Thương hiệu và đối thủ — PROPOSED + BUSINESS_REVIEWED + E5

- Inventory nhắc thương hiệu/nội dung trong corpus đóng băng; danh tính thương hiệu theo nguồn khai báo (alias đã duyệt); so sánh đối thủ cần peer-set chủ khai báo. Không suy thương hiệu từ co-occurrence; không awareness/preference/share.
- **Cập nhật 07/10:**
  - Thương hiệu lấy từ tiêu đề sản phẩm ghi là "theo tiêu đề người bán" cho tới khi có alias đã duyệt.
  - Suy luận về rủi ro (ví dụ "rủi ro thương hiệu hay rủi ro hàng bán lại") gắn nhãn giả thuyết.
  - Thông điệp cốt lõi, định vị, thông điệp riêng của từng thương hiệu lấy từ nội dung người bán (mục 6.2), theo L7 và peer-set của chủ.

### I14 · Hướng cơ hội — PROPOSED + BUSINESS_REVIEWED

- Bundle theo hướng do chủ định nghĩa; mỗi hướng liệt kê claim hỗ trợ/phản chứng/thiếu bằng chứng + blocker; `priority=null` khi chưa có criteria; AI candidate ở mảng riêng, không tự thành hướng chính thức.
- **Cập nhật 07/10:** hướng do AI nêu hiển thị với nhãn "hướng AI đề xuất, chờ chủ duyệt" cho tới khi chủ nhận làm hướng chính thức.

### I15 · Định hướng chiến lược — PROPOSED + BUSINESS_REVIEWED + E6

- Packet so sánh các phương án do chủ cung cấp, cạnh nhau, cùng evidence pack; ranking chỉ khi chủ cấp criteria/weights; không auto-chọn, không score mặc định.
- **Cập nhật 07/10 (E6):** AI được soạn tối đa 3 đề xuất, người phụ trách và hạn chót đề xuất theo E2, nhãn "đề xuất, chờ chủ duyệt", thứ tự theo L4.

### I16 · Thử nghiệm và đo lường — PROPOSED + BUSINESS_REVIEWED

- Hai chế độ loại trừ: `DESIGN_ONLY` (kết quả null, NOT_EXECUTED, liệt kê gap) hoặc `EXISTING_RESULT` (protocol + dữ liệu + estimator đã khai báo trước + review). Không tự thực hiện thử nghiệm, không lift từ observational exposure, không chọn estimator sau khi thấy kết quả.
- **Cập nhật 07/10:** so trước/sau một thay đổi bằng review công khai là so sánh quan sát; ghi rõ "không đo được hiệu quả của thay đổi". Không đề xuất đặt hàng thử (L8).

### I17 · Phụ lục và bằng chứng — EXISTING_BOUNDED

- Trace tham chiếu A26: mỗi claim M03/M04 trỏ đúng Result pointer/scope/denominator; `RESOLVED` = pointer tồn tại, không phải "được chứng minh".
- **Cập nhật 07/10:** phụ lục liệt kê nguyên văn bản ghi đã dùng, đánh dấu ngoài kỳ và trùng nguyên văn; liệt kê nguồn, cỡ mẫu, giới hạn và những gì chưa thu.

---

## 6. Nguồn dữ liệu cho Insight (mới ở v1.1)

### 6.1 Danh mục nguồn

Danh mục đầy đủ nằm ở **[Input data sources for 30 sections](input-data-sources-30-sections.md)** (từ v1.6). File đó gồm:
- mã nguồn S01…;
- ba loại tiếng nói (khách, người bán, thị trường);
- hạng tin cậy A–D và độ đại diện;
- trạng thái thử nghiệm, chi phí, ràng buộc;
- bảng section dùng nguồn nào;
- nguồn đã xét và không dùng;
- bài học từ các lần thử nguồn. Lịch sử từng lần thử và kiểm định nằm ở [nhật ký test và kiểm định nguồn](input-data-sources-test-log.md).

Quy tắc ở file này (E, L, mục 6.2–6.4) áp cho mọi nguồn trong danh mục. Khi file này và file Input data sources for 30 sections khác nhau về **quy tắc**, theo file này; về **danh mục, trạng thái, hạng**, theo file Input data sources for 30 sections.

**Không dùng:** khảo sát, phỏng vấn, tuyển người trả lời, người trả lời giả lập (quy tắc 6).

### 6.2 Đọc nội dung video bán hàng

Mười câu hỏi dưới đây áp cho từng video. Cột "Nghĩa đúng" là cách ghi trong báo cáo.

| Câu hỏi | Nghĩa đúng | Section | Quy tắc |
|---|---|---|---|
| Khách hàng mục tiêu, chân dung | Người bán nhắm tới ai | I13, M07; E5 | L7; không phải chân dung E4 |
| Nỗi đau, lo ngại, phản bác | Điều người bán nói khách đang gặp | I13, M07 | Phản bác thật của khách lấy ở bình luận (I08) |
| Chủ đề nội dung lặp lại | Xếp nhóm trên nhiều video | I10, I13 | Codebook đã duyệt; tập video cố định; một video chỉ là ứng viên |
| Câu mở đầu 3–5 giây | Trích nguyên văn kèm mốc giây | I12, M07 | Bằng chứng truy được nguồn |
| Thông điệp cốt lõi, định vị | "Người bán định vị là…" | I13 | L7 |
| Định dạng (nói thẳng vào máy, kể chuyện, hướng dẫn, khách chia sẻ, theo trend) | Xếp nhóm | I12 | Danh sách định dạng do chủ duyệt |
| Lời kêu gọi (bình luận, nhắn tin, gọi, website, tư vấn miễn phí) | Điểm tiếp xúc có xuất hiện | I12 | PRESENCE; không suy hiệu quả |
| Thông điệp riêng của từng thương hiệu | So giữa thương hiệu | I13, M07 | Peer-set do chủ khai báo |
| Định dạng hiệu quả lặp lại | Nội dung đặt cạnh số liệu bán hàng | M07, M12, E5 | Mô tả trong mẫu; "hiệu quả" theo tiêu chí chủ đặt; không xếp hạng, không nhân quả |
| Phễu nội dung (biết đến → tìm hiểu → mua) | Suy luận | M11, M12 | Gắn nhãn giả thuyết |

- Phân tích một video chỉ cho kết luận ở mức video. "Lặp lại", "hiệu quả" và phễu của thương hiệu cần nhiều video kèm số liệu.
- Bài học rút ra là **bài học cho người bán của chủ dự án**, gắn nhãn "đề xuất, chờ chủ duyệt"; không viết thành lời khuyên cho đối thủ.
- Số liệu của video (lượt xem, tương tác) ghi kèm ngày lấy số.
- Chuyển giọng nói thành chữ: ưu tiên phụ đề có sẵn và công cụ chạy trên máy. Dùng dịch vụ đám mây (gửi video ra ngoài, có thể tốn phí) cần chủ duyệt.

### 6.3 Ngưỡng chất lượng cho lần thu review mở rộng (mới ở v1.3)

Chủ đồng ý ngày 07/10/2026. Thu tới khi đạt đủ các ngưỡng (E8); mỗi lần chi thật vẫn báo trước.

| Tiêu chí | Ngưỡng | Căn cứ |
|---|---|---|
| Độ phủ doanh thu | Các sản phẩm được đọc review chiếm ≥50% doanh thu của nhóm sản phẩm lõi trong mẫu | Là đa số doanh thu. Với thạch dừa, 1 sản phẩm chỉ chiếm khoảng 0,7%, còn khoảng 24 sản phẩm đầu đã chiếm 50%: doanh thu tập trung, nên đọc nhóm đầu là đọc phần lớn hàng khách thật sự mua |
| Đa dạng | Đủ các nhóm sản phẩm lõi và ≥5 thương hiệu | Trong 24 sản phẩm đạt 50% doanh thu thạch dừa có 7 nhóm thương hiệu theo tiêu đề; ≥5 là phần lớn số đó, tránh dồn vào một thương hiệu |
| Hai sàn | Có review cả Shopee và TikTok Shop | Báo cáo thị trường có cả hai sàn |
| Cỡ mẫu mỗi sản phẩm | Khoảng 300 review, hoặc lấy hết nếu ít hơn | Chủ đặt 300 review mỗi sản phẩm cho lần chạy thử ngày 06/10/2026; hệ thống cho tối đa 500 |
| Điều kiện để so giữa sản phẩm | ≥30 review có chữ mỗi sản phẩm | Với 30 bản ghi, sai số của một tỷ lệ quanh 50% là khoảng ±18 điểm phần trăm (khoảng tin cậy 95%); với 20 bản ghi là khoảng ±22. Chênh lệch nhỏ hơn mức này giữa hai sản phẩm không đọc được |
| Số sao và người viết | Có số sao và mã người viết ẩn danh | Theo L2 (đếm người viết) và L6 (số sao là phân bố riêng) |
| Chân dung | ≥5 người viết khác nhau, đến từ ≥3 sản phẩm hoặc thương hiệu | E4, và để chân dung không phải của riêng một gian hàng |
| Gọi là vấn đề "của ngành hàng" | Xuất hiện ở ≥3 sản phẩm khác thương hiệu; dưới mức đó ghi "của sản phẩm" | Tránh khái quát từ một sản phẩm |

**Các cách dừng thu (chủ quyết 07/10/2026, giữ song song):**

| Cách | Áp cho | Quy tắc |
|---|---|---|
| A. Số cố định | Mọi tiêu chí | Theo bảng trên |
| B. Độ bão hoà | Cỡ mẫu mỗi sản phẩm | Đọc theo lô 25 review có chữ. Hai lô đầu làm nền. Dừng khi một lô mới chỉ thêm ≤5% mã chủ đề mới so với số mã đã có. Luôn dừng khi hết review hoặc chạm trần 500 của hệ thống. Giải thích: Phụ lục G1 |
| C. 80/20 | Độ phủ doanh thu | Đọc review các sản phẩm cộng dồn tạo ra ≥80% doanh thu nhóm lõi, thay cho ≥50%, khi cần phủ rộng hơn. Giải thích: Phụ lục G3 |

- Mỗi sản phẩm dừng khi đạt cách A hoặc cách B, tuỳ cách nào đến trước.
- Độ phủ doanh thu mặc định là ≥50% (cách A); ≥80% (cách C) là cách được chấp nhận.
- Báo cáo ghi rõ đã dùng cách nào cho từng tiêu chí.
- Điều kiện "≥30 review có chữ" giải thích ở Phụ lục G4.

### 6.4 Thống kê chính thức: chọn bảng theo ngành hàng (mới ở v1.5)

Dùng chung cho mọi ngành hàng. Với mỗi ngành hàng, chọn **nhóm thống kê hẹp nhất** chứa nó trong từng loại số liệu, theo E12.

**Các loại số liệu và nơi lấy (kiểm tra ngày 08/10/2026):**

| Loại số liệu | Chia nhỏ tới | Tần suất | Nơi lấy |
|---|---|---|---|
| Giá tiêu dùng (CPI) theo 11 nhóm, có nhóm con lương thực, thực phẩm, ăn uống ngoài gia đình | Cả nước, thành thị/nông thôn, 6 vùng, tỉnh | Hằng tháng, khoảng ngày 3–6 tháng sau | File Excel CPI hằng tháng |
| Tổng mức bán lẻ hàng hoá và doanh thu dịch vụ tiêu dùng | Tháng: 4 nhóm lớn (bán lẻ hàng hoá, lưu trú – ăn uống, du lịch, dịch vụ khác). Năm: theo nhóm hàng và theo tỉnh | Tháng; năm | File Excel "Biểu" hằng tháng; Niên giám thống kê |
| Chi tiêu bình quân 1 người/tháng theo khoản chi, có chi tiết lương thực, thực phẩm | Thành thị/nông thôn, 6 vùng, 5 nhóm thu nhập | 2 năm một lần (năm chẵn) | Sách Khảo sát mức sống dân cư (PDF) |
| Thu nhập, dùng internet, dùng mạng xã hội theo tuổi, vùng | Thành thị/nông thôn, giới tính, nhóm tuổi, vùng | Hằng năm | File Excel Khảo sát mức sống |
| Chỉ số sản xuất công nghiệp theo ngành; sản lượng một số sản phẩm công nghiệp | Ngành cấp 2; một số sản phẩm | Hằng tháng | File Excel "Biểu" và IIP |
| Xuất khẩu, nhập khẩu theo nhóm hàng | Nhóm hàng | Hằng tháng | File Excel "Biểu" |
| Dân số, số hộ, nông nghiệp theo tỉnh | Tỉnh | Hằng năm | Niên giám thống kê (PDF) |

- Cục Thống kê **không** có số theo sản phẩm, thương hiệu, gian hàng hay sàn thương mại điện tử, và không có lời khách.
- Số liệu nông nghiệp chi tiết của từng tỉnh (ví dụ một loại cây không có trong bảng quốc gia) nằm ở niên giám của Cục Thống kê tỉnh, không phải niên giám quốc gia.

**Ánh xạ ngành hàng → nhóm thống kê:**

| Nhóm ngành hàng | Ví dụ | Giá tiêu dùng (CPI) | Bán lẻ theo nhóm hàng (năm) | Chi tiêu hộ (Khảo sát mức sống) | Sản xuất, xuất nhập khẩu |
|---|---|---|---|---|---|
| Thực phẩm chế biến, đồ ngọt, ăn vặt | Thạch, bánh kẹo, mứt, đồ ăn vặt | Thực phẩm | Lương thực, thực phẩm | Đường, mật, sữa, bánh, mứt kẹo; Quả chín | Sản xuất, chế biến thực phẩm; xuất khẩu bánh kẹo và sản phẩm từ ngũ cốc |
| Sữa và sản phẩm sữa | Sữa tươi, sữa bột, sữa chua | Thực phẩm | Lương thực, thực phẩm | Đường, mật, sữa, bánh, mứt kẹo | Sản lượng sữa tươi, sữa bột; nhập khẩu sữa và sản phẩm sữa |
| Đồ uống | Nước giải khát, trà, cà phê | Đồ uống và thuốc lá | Lương thực, thực phẩm | Chè, cà phê; Đồ uống khác; Rượu, bia | Sản xuất đồ uống |
| Nguyên liệu cho quán ăn uống (khách mua sỉ) | Topping, nguyên liệu pha chế | Ăn uống ngoài gia đình | Dịch vụ lưu trú, ăn uống (bảng tháng) | Ăn uống ngoài gia đình | — |
| Đồ gia dụng, đồ dùng nhà bếp, thiết bị nhỏ | Bình giữ nhiệt, quạt cầm tay, nồi, hộp đựng | Thiết bị và đồ dùng gia đình | Đồ dùng, dụng cụ trang thiết bị gia đình | Thiết bị và đồ dùng gia đình | Chỉ số sản xuất ngành tương ứng, nếu có |
| Thời trang | Quần áo, giày dép, mũ | May mặc, mũ nón và giày dép | Hàng may mặc, giày dép | May mặc, mũ nón, giày dép | Xuất nhập khẩu dệt may, giày dép |
| Văn phòng phẩm, sách, đồ chơi | Bút, vở, sách, đồ chơi | Giáo dục; Văn hoá, giải trí và du lịch | Vật phẩm, văn hoá, giáo dục | Giáo dục; Văn hoá, thể thao, giải trí | — |
| Mỹ phẩm, chăm sóc cá nhân, đồ dùng khác | Mỹ phẩm, đồ vệ sinh cá nhân | Hàng hoá và dịch vụ khác (nhóm rất rộng) | Hàng hoá khác (nhóm rất rộng) | Chi phí về đồ dùng và dịch vụ khác | — |
| Mọi ngành hàng | — | CPI chung, theo vùng | Bán lẻ theo tỉnh | Thu nhập; dùng internet, mạng xã hội theo tuổi, vùng | — |

- Bảng ánh xạ là mặc định theo E11. Ngành hàng mới không có trong bảng thì chọn theo cùng nguyên tắc "nhóm hẹp nhất chứa ngành hàng" và ghi rõ đã chọn nhóm nào.
- Tên nhóm phải ghi đúng như trong file nguồn của Cục Thống kê.

---

## 7. Đồng bộ với TDN

Trạng thái TDN đã áp dụng tới đâu, phần nào của file này chưa vào recipe, cấu hình và code, và cách đưa một quyết định mới vào hệ thống: xem [README.md](README.md).

Lưu ý giữ từ v1.0: hồ sơ tiếp nhận của TDN mô tả phương pháp đã nhận, không phải bằng chứng đã triển khai đủ hay đã nghiệm thu output.

---

## 8. Nguồn tham chiếu

| Nội dung | Vị trí |
|---|---|
| Recipe 30 section (A40) | `docs/research/section-methods-v1/` (`index.md`, `common-rules.md`, `authority-index.md`, `sections/Mxx.md`, `sections/Ixx.md`) |
| Gói cấu hình A41 | `docs/research/method-configurations-v1/` |
| Hồ sơ tiếp nhận A41 | `docs/research/method-configurations-v1-adoption.md` |
| Điều chỉnh 02/10 | `docs/research/remediation-contract-review-v1.md` |
| Audit TDN 04/10 | `docs/research/research-30-section-source-method-audit-20261004.md` |
| Bảng điều hành automation 30 section (04/10) | `docs/research/research-30-section-progress.md` |
| Kế hoạch nguồn mới (Trends, video, mạng xã hội, chân dung) | [khangpworking/tdn-growth-os#124](https://github.com/khangpworking/tdn-growth-os/issues/124) |
| Gói việc batch 2 | `docs/tasks/research-batch-2-packages.md` |
| Ngoài repo (file riêng của chủ, không đưa vào Git) | Ultimate Method v1.0 (05/10); nghiên cứu gốc 13+17 (lịch sử v25); báo cáo kiểm chứng M06 (05/10); bản review method-map TDN với Ultimate (05/10); báo cáo insight thạch dừa và đề xuất sửa (05–07/10) |

## 9. Lịch sử phiên bản

Chi tiết từng thay đổi, căn cứ và commit: [CHANGELOG.md](CHANGELOG.md).

- **v1.0 — 05/10/2026:** hợp nhất lần đầu từ A40 + A41 + remediation 02/10; bổ sung cập nhật 05/10 cho M06, M07, M08, M09, M10, M11; ngoại lệ E1–E3.
- **v1.1 — 07/10/2026:** đưa file vào repo làm nguồn chuẩn, bỏ đường dẫn máy cá nhân. Thêm cho Insight:
  - ba loại tiếng nói (mục 1);
  - làm rõ L1–L7 (mục 2.1);
  - ngoại lệ E4 chân dung có thẻ bằng chứng, E5 chân dung người bán nhắm tới có số liệu củng cố, E6 kết luận chính và Phần 15 của Insight, E7 câu hỏi làm việc, E8 thu review không đặt trần chi phí;
  - cập nhật từng section I01–I17 và khối Kết luận chính;
  - danh mục nguồn cho Insight và cách đọc nội dung video (mục 6).

  Chủ xác nhận business rule của file này là nguồn chuẩn, TDN phải theo (mục 1); I02 cho dựng chân dung theo E4, TDN sửa theo.

  Quy tắc chung 1–9, ngoại lệ E1–E3 và các section Market không đổi. Tham số mặc định của E5 là đề xuất ban đầu, chủ chỉnh được.
- **v1.2 — 07/10/2026:** M08 thêm bảng đơn vị chuẩn theo ngành hàng (khối lượng, thể tích, số lượng, hàng dùng lâu, combo); ngoại lệ E9 cho phép so cạnh nhau và sắp xếp giá theo đơn vị chuẩn khi cùng đơn vị, cùng loại giá, cùng kỳ, không kết luận "rẻ nhất / tốt nhất".
- **v1.3 — 07/10/2026:** E10 doanh số là thước đo nhu cầu; E11 báo cáo chạy theo quy tắc mặc định, không chờ chủ nhập liệu (tập đối thủ từ dữ liệu bán hàng, nhóm so sánh theo sàn và mua lẻ/mua sỉ, không xếp ưu tiên, bộ mã kiểm chéo bằng model thứ hai); mục 6.3 ngưỡng thu review mở rộng kèm căn cứ.
- **v1.4 — 07/10/2026:** E5 và mục 6.3 giữ song song cách A (số cố định), cách B (độ bão hoà hoặc hiệu chỉnh theo dữ liệu) và cách C (80/20); L8 không mua hàng; ghi chú chủ chưa duyệt chuyên môn mốc κ; thêm phụ lục giải thích nguyên tắc chuyên môn kèm nguồn.
- **v1.5 — 08/10/2026:** E12 thống kê chính thức của Cục Thống kê làm bối cảnh vĩ mô, được ghi tên nguồn; mục 6.4 bảng nguồn số liệu và ánh xạ ngành hàng → nhóm thống kê, dùng chung cho mọi ngành hàng; thêm dòng nguồn vào mục 6.1.
- **v1.6 — 08/10/2026:** danh mục nguồn chuyển sang [Input data sources for 30 sections](input-data-sources-30-sections.md), thêm mã nguồn S, hạng tin cậy A–D, độ đại diện, bảng section dùng nguồn nào, nguồn không dùng và nhật ký thử nguồn; mục 6.1 chỉ còn trỏ tới file đó.
- **v1.7 — 08/10/2026:** đổi tên file danh mục nguồn thành `input-data-sources-30-sections.md` (Input data sources for 30 sections) theo yêu cầu của chủ; cập nhật trạng thái nguồn theo kết quả bài test Apify. Không đổi quy tắc.
- **v1.8 — 08/10/2026:** L9 lọc nghĩa khi thu bằng từ khoá (danh sách từ khoá và danh sách loại trừ có phiên bản, giữ dấu, ghi số bị loại); E13 dữ liệu mở của Ngân hàng Thế giới làm bối cảnh vĩ mô theo điều kiện của E12; M09 tìm kiếm mở rộng có lọc thời gian và tìm trong một trang báo để lập dòng thời gian sự kiện.
- **v1.9 — 08/10/2026:** G6 thêm ba mốc tham khảo tuổi quảng cáo (17 ngày, 3 tuần, 60 ngày), kiểm không xung đột, và không chép câu "chắc chắn hiệu quả" vào báo cáo (E1, E5); E5 phép kiểm 3 ghi các mốc tham khảo đã vượt, ngưỡng đạt không đổi; thêm G8 ghi lý do chọn từng ngưỡng số và mức chắc chắn.
- **v1.10 — 08/10/2026:** L10 bình luận công khai dưới video review là lời khách (trừ bình luận của người làm video và tài khoản người bán); mục 1 ghi thêm vào ba loại tiếng nói; bảng tổng quan 30 section cập nhật dòng M01, M09, I02 và thêm ghi chú các quy tắc áp cho nhiều section.
- **v1.11 — 08/10/2026:** L10 mở rộng: bình luận công khai dưới video bán hàng cũng là lời khách, cùng điều kiện loại trừ; ghi loại nguồn "bình luận dưới video bán hàng" cạnh câu trích và số đếm.

---

## Phụ lục: Giải thích nguyên tắc chuyên môn

Mỗi mục có: nghĩa là gì, ví dụ, dùng ở đâu trong file này, nguồn, và mức chắc chắn.

### G1. Độ bão hoà (đọc tới lúc không còn ý mới)

- **Nghĩa:** khi đọc thêm dữ liệu mà gần như không thấy ý mới, ta đã "bão hoà" và có thể dừng. Đọc tiếp chỉ lặp lại những ý đã có.
- **Ví dụ:** đọc 50 review đầu thấy 20 chủ đề. Đọc thêm 25 review chỉ thấy 1 chủ đề mới (1/20 = 5%), nên dừng.
- **Dùng ở:** mục 6.3, cách B.
- **Nguồn:**
  - Guest, Namey và Chen (2020) đề xuất cách đo bão hoà gồm ba phần: nền ban đầu, độ dài mỗi lượt đọc thêm, và ngưỡng ý mới (thường ≤5%). [PLOS ONE, bản đọc miễn phí](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC7200005/)
  - Hennink và Kaiser (2022) tổng hợp 23 nghiên cứu: thường đủ chủ đề chính sau 9–17 cuộc phỏng vấn; hiểu sâu từng chủ đề cần khoảng 24. [Social Science & Medicine, bản đọc miễn phí](https://pmc.ncbi.nlm.nih.gov/articles/PMC9359070)
- **Mức chắc chắn:** trung bình. Các nghiên cứu làm trên phỏng vấn sâu; review sàn ngắn hơn nhiều nên cần nhiều bản ghi hơn. Chưa có nghiên cứu riêng cho review sàn thương mại điện tử.

### G2. Hệ số κ (kappa): hai người gắn mã giống nhau tới đâu

- **Nghĩa:** khi hai người (hoặc hai model) cùng xếp nhóm một tập bản ghi, κ đo mức họ xếp giống nhau, **sau khi trừ phần giống nhau do may rủi**. κ = 1 là giống hoàn toàn; κ = 0 là giống nhau không hơn đoán bừa.
- **Ví dụ:** hai model xếp 100 review vào "khen/chê/trung tính" và giống nhau ở 85 review. Nếu đoán bừa cũng đã trùng khoảng 40 review, κ ≈ (85 − 40) / (100 − 40) = 0,75.
- **Thang đọc thường dùng (Landis và Koch, 1977):** dưới 0 là không đồng thuận; 0–0,20 rất ít; 0,21–0,40 ít; 0,41–0,60 vừa phải; 0,61–0,80 đáng kể; 0,81–1 gần như hoàn toàn. Mốc 0,6 trong file này nằm ở ranh giới giữa "vừa phải" và "đáng kể".
- **Dùng ở:** E11 (kiểm chéo bộ mã); gói P7 trong kế hoạch #124 cũng dùng mốc 0,6.
- **Nguồn:** [Landis và Koch (1977), Biometrics (PubMed)](https://pubmed.ncbi.nlm.nih.gov/843571/); [giải thích κ (Wikipedia)](https://en.wikipedia.org/wiki/Cohen%27s_kappa).
- **Mức chắc chắn:** trung bình. Thang Landis và Koch được dùng rất rộng nhưng chính tác giả không đưa bằng chứng cho các mốc; đây là quy ước. Chủ chưa có chuyên môn để duyệt mốc này (07/10/2026).

### G3. Nguyên tắc 80/20 (Pareto)

- **Nghĩa:** trong nhiều thị trường, một phần nhỏ (khoảng 20%) sản phẩm, video hay khách hàng tạo ra phần lớn (khoảng 80%) doanh thu. Đây là quy luật kinh nghiệm, không phải định luật; tỷ lệ thật mỗi ngành mỗi khác.
- **Ví dụ:** với thạch dừa, khoảng 24 sản phẩm đầu đã chiếm 50% doanh thu lõi trong mẫu, nghĩa là doanh thu rất tập trung.
- **Dùng ở:** E5 cách A (nhóm 20% doanh thu cao nhất) và cách C (nhóm tạo ra 80% doanh thu); mục 6.3 cách C.
- **Nguồn:** [Nguyên tắc Pareto (Wikipedia)](https://en.wikipedia.org/wiki/Pareto_principle).
- **Mức chắc chắn:** quy ước. Luôn ghi tỷ lệ thật đo được trong mẫu bên cạnh.

### G4. Sai số ±18 điểm với 30 review

- **Nghĩa:** khi đếm tỷ lệ trên một mẫu nhỏ, con số có thể lệch so với tỷ lệ thật. "Khoảng tin cậy 95%" là khoảng mà tỷ lệ thật nằm trong đó với độ tin cậy 95%.
- **Ví dụ:** 30 review có chữ, 15 review chê (50%). Tỷ lệ thật có thể nằm trong khoảng 32%–68%, tức ±18 điểm. Với 20 review là ±22 điểm. Hai sản phẩm có tỷ lệ chê 45% và 55% trên 30 review thì **chưa nói được** sản phẩm nào bị chê nhiều hơn.
- **Cách tính:** ±1,96 × √(p × (1 − p) / n), với p = 0,5 là trường hợp sai số lớn nhất.
- **Dùng ở:** mục 6.3, điều kiện "≥30 review có chữ" trước khi so giữa sản phẩm.
- **Nguồn:** [Biên sai số (Wikipedia)](https://en.wikipedia.org/wiki/Margin_of_error).
- **Mức chắc chắn:** cao về phép tính; mốc 30 là quy ước để sai số không quá lớn.

### G5. Hiệu chỉnh theo dữ liệu: "nhóm 25% cao nhất"

- **Nghĩa:** thay vì đặt cứng một con số (ví dụ 30 ngày), lấy mốc từ chính dữ liệu của ngành hàng: xếp các giá trị từ thấp tới cao, mốc là giá trị mà chỉ 25% số mục vượt qua.
- **Ví dụ:** trong 40 quảng cáo thạch dừa, 10 quảng cáo chạy lâu nhất đều chạy ≥21 ngày. Mốc của cách B là 21 ngày, dù thấp hơn 30 ngày của cách A.
- **Dùng ở:** E5, cách B.
- **Mức chắc chắn:** quy ước; ưu điểm là tự khớp với từng ngành hàng.

### G6. Tuổi thọ quảng cáo: quảng cáo chạy lâu là quảng cáo người bán chọn giữ lại

- **Nghĩa:** người bán thường không trả tiền lâu cho quảng cáo không ra đơn, nên quảng cáo chạy lâu là quảng cáo người bán **chọn giữ lại**. Đây là suy luận về hành vi người bán, không chứng minh quảng cáo có lãi (E1; mục "Vẫn cấm" của E5).
- **Các mốc tham khảo (chủ chọn giữ cả ba mốc 17 ngày, 3 tuần, 60 ngày, ngày 08/10/2026):**

  | Mốc | Nghĩa | Nguồn |
  |---|---|---|
  | 17 ngày | Tuổi thọ trung vị trên khoảng 83.000 quảng cáo: một nửa số quảng cáo dừng trước mốc này | Blog marketing nước ngoài (nguồn ở dưới) |
  | 3 tuần (21 ngày) | Người làm nghề coi quảng cáo chạy quá 3 tuần là quảng cáo được đối thủ giữ lại vì đang hiệu quả | [Tomorrow Marketers, bài nghiên cứu đối thủ trên kênh digital](https://tomorrowmarketers.org/nghien-cuu-doi-thu-digital/) |
  | 30 ngày | Mốc người chạy quảng cáo hay dùng. Là ngưỡng cách A của E5, phép kiểm 3 | Blog marketing nước ngoài |
  | 60 ngày | Khoảng 11% quảng cáo (trên khoảng 47.000 quảng cáo) chạy liên tục quá mốc này: nhóm chạy lâu nhất | Blog marketing nước ngoài |

- **Các mốc có xung đột không:** không xung đột về số. Các mốc tăng dần và khớp nhau: 3 tuần nằm trên trung vị 17 ngày, tức quảng cáo đã sống lâu hơn khoảng một nửa số quảng cáo; 60 ngày là phần đuôi, khoảng 1/10 số quảng cáo. Hai lưu ý:
  - mỗi mốc lấy từ một bộ dữ liệu khác nhau, nên không ghép thành một đường phân bố và không suy "quảng cáo chạy 30 ngày thuộc nhóm x% lâu nhất";
  - câu gốc "chắc chắn là quảng cáo đang có performance tốt" **không** được chép vào báo cáo, vì E1 và E5 cấm suy hiệu quả hay có lãi từ việc chạy lâu. Báo cáo chỉ viết "quảng cáo chạy liên tục x ngày, vượt mốc tham khảo y".
- **Cách dùng trong báo cáo:** E5 phép kiểm 3 vẫn đạt theo cách A khi chạy ≥30 ngày, hoặc theo cách B. Mỗi quảng cáo ghi số ngày chạy và các mốc tham khảo đã vượt (17 ngày, 3 tuần, 30 ngày, 60 ngày). Vượt mốc 17 ngày hay 3 tuần không tự làm phép kiểm đạt.
- **Nguồn số liệu 17 ngày, 30 ngày, 60 ngày:** [hướng dẫn thư viện quảng cáo Meta (virlo.ai)](https://virlo.ai/blog/complete-guide-meta-ad-library); [nghiên cứu đối thủ bằng thư viện quảng cáo Meta (segwise.ai)](https://segwise.ai/blog/meta-ad-library-competitor-research).
- **Mức chắc chắn:** thấp. Cả bốn mốc đến từ blog và kinh nghiệm người làm nghề, dữ liệu quảng cáo nước ngoài, chưa kiểm chứng độc lập, chưa có số cho Việt Nam. Vì vậy có thêm cách B (hiệu chỉnh theo dữ liệu của chính ngành hàng).

### G7. Kiểm chéo bằng model thứ hai

- **Nghĩa:** trong nghiên cứu định tính, cách làm chuẩn là để hai người xếp nhóm độc lập rồi đo mức giống nhau (κ, xem G2). Ở đây chủ không duyệt từng bản ghi (E11), nên thay người thứ hai bằng một model AI khác, chạy độc lập, không thấy kết quả của model đầu.
- **Giới hạn:** hai model có thể cùng sai theo một kiểu, nên κ cao chưa chắc là đúng. Bản ghi hai model xếp khác nhau luôn được liệt kê để người đọc tự kiểm.
- **Dùng ở:** E11, dòng "Duyệt cách xếp nhóm".
- **Mức chắc chắn:** trung bình. Đây là cách thay thế cho người duyệt, chưa được kiểm chứng trên dữ liệu của dự án.

### G8. Ngưỡng số: vì sao chọn con số này (mới ở v1.9)

Mọi ngưỡng số trong file này có một dòng ở đây: ngưỡng, dùng ở đâu, vì sao chọn số đó, ai đặt, mức chắc chắn. Thêm hay đổi một ngưỡng thì sửa bảng này trong cùng commit (xem [CHANGELOG](CHANGELOG.md), mục Cách ghi).

Nhiều ngưỡng được đặt trước ngày 08/10/2026 mà không ghi lý do lúc đặt. Lý do của các ngưỡng đó là **ghi bổ sung ngày 08/10/2026**; chỗ nào chưa có căn cứ bên ngoài thì ghi thẳng là "quy ước".

**Thang mức chắc chắn:**
- **Cao:** phép tính hoặc nghiên cứu đã kiểm chứng.
- **Trung bình:** chuẩn được dùng rộng, có nguồn, nhưng chưa kiểm trên dữ liệu của dự án.
- **Thấp:** blog, kinh nghiệm người làm nghề.
- **Quy ước:** chọn để có một mốc rõ ràng, chưa có căn cứ bên ngoài. Xem lại khi có dữ liệu.

**Kết luận và đề xuất**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| Tối đa 3 phương án, 3 đề xuất | E2, E6 | Hơn 1–2 để chủ có lựa chọn thật; không quá 3 để chủ so được trong một lần đọc và việc làm ngay không bị dàn mỏng | E2: thảo luận 05/10; E6: chủ duyệt "3 đề xuất" ngày 07/10 | Quy ước, chủ đã duyệt |
| 4–6 phát hiện ở Kết luận chính | E3, E6 | Ít nhất 4 để phủ các phần chính của báo cáo; tối đa 6 để đọc hết trong một trang | Ultimate v1.0 (05/10) | Quy ước |

**Chân dung và lời khách**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| ≥3 thẻ bằng chứng mỗi chân dung | E4 | Một câu trích có thể là ngoại lệ, hai câu có thể trùng hợp; từ ba câu độc lập mới gọi được là điều lặp lại | Claude đề xuất, chủ duyệt E4 (07/10) | Quy ước |
| ≥5 người viết khác nhau | E4; mục 6.3 | Để không người nào chiếm quá 1/5 số người góp lời. Ít hơn thì chân dung dễ thành chuyện của 1–2 người viết nhiều | Claude đề xuất, chủ duyệt E4 (07/10) | Quy ước |
| ≥3 sản phẩm hoặc thương hiệu | Mục 6.3 (chân dung, vấn đề "của ngành hàng"); E5 phép kiểm 1 | Hai gian hàng có thể cùng một chủ hoặc cùng nguồn hàng. Ba là mức nhỏ nhất để nói "nhiều người bán" hay "của ngành hàng" | Claude đề xuất (07/10) | Quy ước |

**Chân dung người bán nhắm tới (E5)**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| ≥2 nền tảng | E5 | Một nền tảng có thể đẩy một kiểu nội dung lên vì thuật toán của riêng nó. Thấy trên hai nền tảng thì khó là hiện tượng của riêng một nơi | Claude đề xuất, chủ duyệt E5 (07/10) | Quy ước |
| Nhóm 20% video doanh thu cao nhất | E5 phép kiểm 2, cách A | Nguyên tắc 80/20: nhóm nhỏ này thường tạo phần lớn doanh thu (G3) | Claude đề xuất (07/10) | Quy ước, có nguồn |
| Duy trì ≥4 tuần | E5 phép kiểm 2 và 3, cách A | Một tháng đủ dài để loại đợt nổi một lần (một video lan truyền, một đợt sale lớn) và khớp kỳ báo cáo theo tháng. Chưa có nghiên cứu cho mốc này, nên có thêm cách B | Claude đề xuất (07/10) | Thấp |
| Quảng cáo chạy ≥30 ngày | E5 phép kiểm 3, cách A | Mốc người làm nghề hay dùng. Nằm trên trung vị 17 ngày và mốc 3 tuần, dưới mốc 60 ngày (G6) | Claude đề xuất (07/10) | Thấp |
| 17 ngày, 3 tuần, 60 ngày | E5 phép kiểm 3 (chỉ để tham khảo) | Ba mốc từ ba nguồn khác nhau, không xung đột; xem G6 | Chủ chọn giữ (08/10) | Thấp |
| Nhóm 25% cao nhất | E5 cách B; G5 | Tứ phân vị trên (mốc chia 1/4 trên cùng) là cách chia nhóm chuẩn của thống kê mô tả. Vẫn còn vài mục khi mẫu nhỏ: 40 quảng cáo còn 10 | Claude đề xuất, chủ chọn giữ song song (07/10) | Quy ước, chuẩn thống kê |
| 80% doanh thu | E5 cách C; mục 6.3 cách C | Nguyên tắc 80/20 (G3) | Chủ chọn giữ (07/10) | Quy ước, có nguồn |
| ≥1 câu trích | E5 phép kiểm 4 | Phép kiểm chỉ hỏi "có khách nào tự nói đúng hoàn cảnh đó không". Một câu có locator là đủ chứng minh có; độ phổ biến đã đo ở các phép kiểm khác | Claude đề xuất (07/10) | Quy ước |
| 70% | E5, tỷ lệ khớp | **Không phải ngưỡng.** Là nhận định của chủ, dùng làm giả thuyết để so với n/N đo được | Chủ (07/10) | — |

**Tập mẫu và kiểm chéo**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| ≥50% doanh thu nhóm lõi | E11 (tập đối thủ); mục 6.3 | Là đa số doanh thu. Với thạch dừa cần khoảng 24 sản phẩm: đủ đại diện mà vẫn đọc được | Chủ đồng ý (07/10) | Quy ước, có số liệu mẫu |
| ≥5 thương hiệu | Mục 6.3 | 24 sản phẩm đạt 50% doanh thu thạch dừa có 7 nhóm thương hiệu; 5 là phần lớn số đó | Chủ đồng ý (07/10) | Quy ước, có số liệu mẫu |
| 300 review mỗi sản phẩm, tối đa 500 | Mục 6.3 | 300 do chủ đặt cho lần chạy thử 06/10; 500 là giới hạn của hệ thống | Chủ | Quyết định của chủ |
| ≥30 review có chữ | Mục 6.3 | Với 30 bản ghi, sai số của một tỷ lệ quanh 50% là khoảng ±18 điểm (G4) | Claude đề xuất (07/10) | Cao về phép tính; mốc 30 là quy ước |
| 200 bản ghi để kiểm chéo | E11 | Với 200 bản ghi, κ đo được lệch khoảng ±0,09 (khoảng tin cậy 95%, khi hai model giống nhau ở 80% bản ghi và phần trùng do may rủi là 40%). Đủ để phân biệt κ = 0,5 với κ = 0,7. Tập nhỏ hơn thì gắn lại toàn bộ | Claude đề xuất (07/10); sai số tính theo công thức sai số chuẩn của κ | Trung bình |
| κ ≥ 0,6 | E11 | Ranh giới giữa "vừa phải" và "đáng kể" theo thang Landis và Koch (G2) | Claude đề xuất (07/10); chủ chưa duyệt chuyên môn | Trung bình |
| ≤5% ý mới mỗi lô | Mục 6.3 cách B | Theo Guest, Namey và Chen 2020 (G1) | Claude đề xuất (07/10) | Trung bình |
| Lô 25 review, 2 lô đầu làm nền | Mục 6.3 cách B | Review sàn ngắn, nên lô 25 đủ nhỏ để dừng sớm và đủ lớn để mỗi lô có vài ý. Chưa kiểm trên review sàn | Claude đề xuất (07/10) | Quy ước |

**Dự báo**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| Dữ liệu ≤180 ngày thì chỉ làm kịch bản có điều kiện | M10 | Chuỗi 180 ngày ngắn hơn một vòng mùa vụ năm (Tết, hè, cuối năm), nên không tách được mùa vụ khỏi xu hướng để dự báo. Nguồn: [Hyndman và Athanasopoulos, Forecasting: Principles and Practice, chương mùa vụ](https://otexts.com/fpp3/) | Ultimate v1.0 (05/10); lý do ghi bổ sung | Trung bình |

**Chấm bài thử nguồn dữ liệu**

| Ngưỡng | Dùng ở | Vì sao chọn số này | Ai đặt | Mức chắc chắn |
|---|---|---|---|---|
| ≥50% bản ghi liên quan, ≥30% lời khách ứng viên, chấm trên 50 bản ghi | Bài test nguồn ngày 08/10 ([nhật ký test](input-data-sources-test-log.md)) | Quá nửa bản ghi đúng sản phẩm thì công lọc còn đáng. Khoảng 1/3 là lời khách thì vài trăm bản ghi ra được vài chục câu trích, đủ cho thẻ bằng chứng của E4 | Claude đặt cho bài test | Quy ước |

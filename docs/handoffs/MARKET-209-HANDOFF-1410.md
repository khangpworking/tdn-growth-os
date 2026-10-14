# Bàn giao báo cáo Market (#209), sáng 14/10/2026

> Bản dành cho repo: đã bỏ đường dẫn máy, địa chỉ máy và thông tin truy cập. Log chi tiết của từng vòng nằm trên máy chạy, không nằm trong repo.

---

## Phần 1. Tóm tắt

| Mục | Trạng thái |
|---|---|
| Luồng Market tự động (nhận yêu cầu → khóa phạm vi → dùng dữ liệu đã thu → tính toán → báo cáo → bản trình bày) | Chạy được từ đầu đến cuối khi đã có dữ liệu thu thập |
| Bản đang chạy trên ứng dụng | `279bc62c10c01737e3d2a219a8ad71ec4c4aa2ab` |
| Canxi | **11/14** (vòng 3 chấm 12/14; đã chấm lại quy tắc 11, xem B6) |
| Bình giữ nhiệt | **11/14** (vòng 3 chấm 12/14; đã chấm lại quy tắc 11, xem B6) |
| Thạch dừa | **5/14**: đang kẹt, chưa trình bày lại được |
| Mục tiêu "Market ổn định sáng 14/10" | **Chưa đạt trọn vẹn.** Hai báo cáo đạt 11/14, phần còn thiếu đều có nguyên nhân rõ ràng. Thạch dừa đang bị chặn bởi blocker B1 |

Điểm chấm trên **bản trình bày cuối** (đã qua kiểm duyệt), không phải bản nháp. Những lần chấm 5/14 trước đây cho canxi và bình giữ nhiệt bị sai vì đã chấm trên bản nháp.

**Cập nhật trưa 14/10: biểu đồ Flint chưa được dùng thật.** Vòng 3 chấm quy tắc 11 là Đạt cho canxi và bình giữ nhiệt, nhưng kiểm tra lại HTML cho thấy:
- canxi không có biểu đồ nào;
- bình giữ nhiệt có 1 biểu đồ, nhưng vẽ bằng SVG dự phòng chứ không phải Flint (`data-engine="svg-fallback"`).

Vì vậy quy tắc 11 được chấm lại là Trượt. Chi tiết ở B6.

---

## Phần 2. Bảng chấm 14 quy tắc

| Quy tắc | Canxi | Bình giữ nhiệt | Thạch dừa (bản cũ) |
|---|---|---|---|
| 1. Bảng giải nghĩa từ | Đạt | Đạt | **Trượt** |
| 2. Nhãn "Phần n" / PL.x | Đạt | Đạt | **Trượt** |
| 3. Không lộ mã kỹ thuật hay đường link trong chữ | Đạt | Đạt | **Trượt** (link Shopee hiện ra) |
| 4 | Đạt | Đạt | Đạt |
| 5. Dòng "Chú thích" riêng | Đạt | Đạt | **Trượt** |
| 6 | Đạt | Đạt | Đạt |
| 7. Ghi rõ cỡ mẫu (n = …) | Đạt | Đạt | **Trượt** |
| 8 | Đạt | Đạt | Đạt |
| 9. Đề xuất M12 gồm 3 phương án | Đạt | Đạt | **Trượt** |
| 10. Ảnh bìa trang 1 | **Trượt**: không có ảnh bìa | **Trượt**: không có ảnh bìa | **Trượt** |
| 11. Biểu tượng sàn và biểu đồ Flint | **Trượt**: có biểu tượng, không có biểu đồ | **Trượt**: có biểu tượng; 1 biểu đồ vẽ bằng SVG dự phòng, không phải Flint | **Trượt**: không có biểu đồ |
| 12 | Đạt | Đạt | Đạt |
| 13. Đánh giá khách hàng | **Trượt**: đang bỏ qua (chưa nạp tiền) | **Trượt**: như canxi | **Trượt**: như canxi |
| 14. Chất lượng đánh giá | Không áp dụng | Không áp dụng | Không áp dụng |

Tên đầy đủ của từng quy tắc nằm trong bộ 14 quy tắc thạch dừa của chủ dự án. Bảng chi tiết nằm trong log chấm điểm vòng 3 trên máy chạy.

**Mã các lượt chạy:**

| Báo cáo | Mã lượt chạy | pairId bản trình bày |
|---|---|---|
| Canxi | `9dec9d6e-e4ac-4a54-aa83-9fb00d4c759d` | `85c5ab7c…` |
| Bình giữ nhiệt | `c6fc7e2c-65ca-4a4c-8a33-3c7e7f8e8a56` | `efbad88a…` |
| Thạch dừa | `9e76bb31-4dd0-4999-8ef0-268838340a02` | `f09f48f6…` (bản cũ) |

---

## Phần 3. Đã xong tối qua

Tất cả đã gộp vào bản chính và đang chạy trên ứng dụng.

| PR | Nội dung |
|---|---|
| #235 | Trình bày kết quả theo từng sàn |
| #236 | Giữ tên nguồn an toàn trong phần đọc; ghi rõ lỗi khi dựng báo cáo |
| #237 | Chỉ đếm đánh giá thật, không đếm dòng trạng thái |
| #238 | Bỏ cảnh báo chặn sai; phần thu thập dữ liệu viết bằng tiếng Việt dễ hiểu |
| #239 | Ghi chú: dữ liệu canxi chỉ có 1 trang (tài liệu, không đổi mã) |
| #240 | Báo cáo hiện doanh thu theo từng sàn lấy từ bản thu thập |

**Việc tối qua vẫn phải làm bằng script hoặc bằng tay:**
- triển khai;
- yêu cầu tạo bản trình bày;
- đưa dữ liệu thu thập vào lượt chạy mới;
- chấm 14 quy tắc.

---

## Phần 4. Các vấn đề đang chặn và cách gỡ

### B1. Thạch dừa kẹt ở 5/14: bản sửa PRESFIX (PR #241) không qua được bước duyệt (ưu tiên 1)

**Hiện trạng**
- Nhánh `wp/presfix-209`, đầu nhánh `0e6ac06`, PR #241 đang mở và chưa gộp.
- Bản sửa gồm 3 việc:
  - thay link Shopee trong phần chữ bằng "Sản phẩm #n", để sửa quy tắc 3;
  - làm sạch đường dẫn kỹ thuật trong bản trình bày;
  - đánh số sản phẩm ổn định.
- Kiểm tra tự động trên máy đều đạt: typecheck, 69/69 bài kiểm thử, diff-check.

**Diễn biến**

| Lần | Đầu nhánh | Kết quả |
|---|---|---|
| Vòng 3 | `94b52408` | Đạt |
| Vòng 3, sau khi gộp main | `731782c` | Cần sửa (lần 1) |
| Vòng 4, tự sửa | `731782c` | Cần sửa (lần 2) |
| Vòng 4, duyệt mới | `0e6ac06` | Cần sửa (lần 3) → dừng theo quy tắc 3 lần, viết method audit |
| Vòng 5, cách mới: chỉ đọc, đầu nhánh cố định `0e6ac06` | `0e6ac06` | Vẫn "Cần sửa", nhưng góp ý **không nêu lỗi nào**: chỉ kể lại việc cập nhật mã băm mẫu HTML trong `tests/unit/renderfail-209-source-literal.test.ts` |

**Nguyên nhân (giả thuyết, chưa kiểm chứng)**
- Bản sửa đổi nội dung HTML, nên các mẫu HTML cố định (mã băm) trong bài kiểm thử phải cập nhật theo.
- Người duyệt coi việc cập nhật mẫu là một "thay đổi mới", nên luôn trả về "Cần sửa".
- Ở vòng 5, phần góp ý giống hệt mô tả commit `0e6ac06`. Có thể người duyệt đã đọc nhầm kết quả cũ (`last.md` của vòng trước) thay vì tự chấm.

**Bước tiếp theo (theo thứ tự)**
1. **Kiểm tra kết quả vòng 5 có phải đọc nhầm không.**
   - So thời điểm ghi và nội dung kết quả duyệt của từng vòng PRESFIX với log vòng 5.
   - Xác nhận công cụ chạy người duyệt ghi kết quả mới cho mỗi vòng, không dùng lại file cũ.
   - Nếu là đọc nhầm: chạy lại một lượt duyệt chỉ đọc trên `0e6ac06` với tên vòng mới.
2. **Đổi người duyệt** (được phép: Sol 6.1 hoặc Astra, tùy tôi chọn).
   - Cho Sol 6.1 duyệt chỉ đọc trên đúng `0e6ac06`.
   - Ghi rõ trong yêu cầu duyệt: "cập nhật mẫu kiểm thử khớp với thay đổi hành vi có chủ đích thì không tính là lỗi".
3. **Nếu đạt:**
   - push, chờ CI xanh, kiểm tra PR ở trạng thái MERGEABLE;
   - gộp: `gh pr merge 241 --repo khangpworking/tdn-growth-os --squash --match-head-commit 0e6ac06…`;
   - triển khai: `deploy.sh prep <sha>`, rồi `activate <sha>`.
4. **Trình bày lại thạch dừa:**
   - gửi yêu cầu tạo bản trình bày mới cho `9e76bb31`, dùng pairId **mới nhất** để tránh lỗi 409;
   - lấy HTML qua `/report-versions/<pairId>/reports/market`;
   - chấm bằng `audit-abs.mts`, rồi chấm tay 14 quy tắc.
5. **Xong khi:** thạch dừa đạt ≥ 12/14, chỉ còn trượt quy tắc 10 và 13 giống hai báo cáo kia.

**Phương án khác nếu cách trên vẫn kẹt**
- **A. Tách làm 2 PR**:
  - PR nhỏ 1 chỉ sửa link → "Sản phẩm #n" (quy tắc 3), kèm cập nhật mẫu kiểm thử trong cùng commit;
  - PR 2 làm phần làm sạch đường dẫn.
  - PR nhỏ dễ qua duyệt hơn.
- **B. Làm lại từ main mới nhất** với thay đổi tối thiểu: chỉ sửa `reports.ts:262-263` và các bài kiểm thử liên quan, bỏ phần mở rộng.
- **C. Duyệt riêng phần mẫu kiểm thử**: một lượt duyệt chỉ xem các mẫu/mã băm đã cập nhật, rồi một lượt duyệt hành vi trên đầu nhánh không đổi. Đây là cách mà method-audit vòng 4 đề xuất.
- **D. Chủ dự án quyết định gộp ngoại lệ**, dựa trên bằng chứng: CI xanh, 69/69 kiểm thử đạt, góp ý không nêu lỗi. Cách này trái quy tắc hiện hành ("chỉ gộp khi người duyệt cho Đạt"), nên **chỉ chủ dự án được quyết**.

### B2. Thiếu ảnh bìa trang 1 (quy tắc 10) ở mọi báo cáo tự động

**Hiện trạng**
- Luồng tự động chưa có bước gắn ảnh bìa. Các báo cáo thạch dừa làm tay trước đây có ảnh bìa CC0.
- Chủ dự án đã quyết "không cần giấy phép ảnh bìa", nhưng hiện chưa có ảnh nào để áp dụng quyết định đó.

**Bước tiếp theo**
1. Chủ dự án chọn nguồn ảnh (xem các phương án bên dưới).
2. Giao một lane omp làm PR "cover":
   - thêm ảnh bìa trang 1 theo từ khóa sản phẩm vào bước dựng báo cáo Market;
   - nhúng ảnh dạng data URI, không gọi mạng lúc hiển thị;
   - nếu không có ảnh thì dùng ảnh mặc định, không làm hỏng báo cáo.
3. Duyệt Astra, CI xanh, gộp, triển khai, trình bày lại 3 báo cáo, chấm lại.

**Xong khi:** quy tắc 10 đạt ở cả 3 báo cáo, canxi và bình giữ nhiệt lên 13/14.

**Phương án lựa chọn**
- **A. Chủ dự án tải lên 1 ảnh cho mỗi sản phẩm** (thư viện ảnh nội bộ). Đơn giản và chắc chắn nhất.
- **B. Ảnh minh họa chung theo ngành hàng**: một bộ ảnh nhỏ cố định, chọn theo từ khóa.
- **C. Tự tìm ảnh CC0 theo từ khóa.** Cần gọi dịch vụ bên ngoài, nên phải có quyết định về nguồn và chi phí.
- **D. Tạm bỏ quy tắc 10 trong giai đoạn thử.** Chủ dự án quyết.

### B3. Chưa có đánh giá khách hàng (quy tắc 13 và 14): nguồn đánh giá chưa nạp tiền

**Hiện trạng:** mọi lượt chạy đặt `nativeReview: SKIP` và `exactShopeeUrls: []`. Báo cáo ghi rõ là chưa có đánh giá.

**Bước tiếp theo**
1. Chủ dự án nạp tiền. Hạn mức mỗi lượt thử ≤ 15 USD, nhắm khoảng 10 USD.
2. Chuyển xác nhận về chế độ `AUTO_REUSE`.
3. Chọn link Shopee trải đều nhiều thương hiệu (không lấy toàn bộ từ 1 thương hiệu), 300 bình luận mỗi sản phẩm.
4. Chạy lại 3 báo cáo, kiểm tra quy tắc 13 và 14.

**Xong khi:** quy tắc 13 đạt và quy tắc 14 được chấm (không còn "không áp dụng").

**Phương án khác:** giữ chế độ bỏ qua, kèm dòng ghi chú rõ ràng trong báo cáo. Chủ dự án chấp nhận 12–13/14 trong giai đoạn thử.

### B4. Dữ liệu canxi chỉ có 1 trang sản phẩm

**Hiện trạng**
- Công cụ thu thập chỉ lấy trang đầu và không lật trang.
- Không sửa được trước 14/10 vì không được chạm vào cầu nối OpenCLI.
- Chi tiết ở `docs/handoffs/CAPROWS-209.md`.

**Bước tiếp theo (sau 14/10)**
1. Sửa công cụ thu thập: lật trang cho đến hết hạn mức.
2. Thu thập lại canxi. Việc này cần **1 lượt tra cứu Metric mới**, phải xin phép.
3. Chạy lại báo cáo.

**Phương án khác**
- Giữ nguyên, kèm dòng ghi chú "dữ liệu 1 trang" (đã có).
- Chọn từ khóa canxi hẹp hơn để 1 trang đủ đại diện.

### B5. Các thiếu sót khác đã ghi nhận (chưa chặn, làm sau)
- Danh sách loại trừ trong bản thu thập chưa được áp dụng đầy đủ.
- Ứng dụng chưa tự chọn link Shopee (hiện chọn bằng script).
- Lỗi che thông tin (redaction): cần một lane điều tra riêng.
- Đưa dữ liệu thu thập vào lượt chạy mới vẫn làm bằng script: gói dữ liệu gắn với từng lượt chạy, nên mỗi lượt mới phải tải lại. Công thức ở `docs/handoffs/PRESFIX-209.md`.

### B6. Biểu đồ chưa vẽ bằng Flint (quy tắc 11)

**Hiện trạng** (kiểm tra trên HTML bản trình bày cuối của vòng 3)

| Báo cáo | Biểu đồ |
|---|---|
| Bình giữ nhiệt | 1 biểu đồ (độ tập trung thị trường). Khung là `<div class="chart flint" data-engine="svg-fallback">`: Flint không chạy, hệ thống tự vẽ SVG thay thế |
| Canxi | Không có biểu đồ |
| Thạch dừa (bản cũ) | Không có biểu đồ |

Biểu tượng Shopee và TikTok thì có đủ.

**Nguyên nhân có thể (chưa kiểm chứng trong mã)**
- Khi làm báo cáo bằng tay, Flint chỉ chạy được khi có thiết lập `FLINT_NODE_MODULES`.
- Bản chạy trên ứng dụng có lẽ thiếu thiết lập này, hoặc thiếu thư viện Flint trong `node_modules`, nên tự rơi về SVG dự phòng mà không báo lỗi.
- Canxi không có biểu đồ nào, có thể vì bước dựng báo cáo chỉ vẽ biểu đồ khi đủ dữ liệu, hoặc vì lỗi riêng.

**Bước tiếp theo**
1. **Tìm nguyên nhân.** Đọc chỗ mã chọn `data-engine`: điều kiện nào dẫn tới `svg-fallback`, và vì sao canxi không có biểu đồ. Kiểm tra checkout đang triển khai có thư viện Flint không.
2. **Sửa (một PR, lane omp):**
   - Đưa Flint thành phụ thuộc chính thức của ứng dụng, hoặc cấu hình để bản triển khai luôn tìm thấy Flint. Không phụ thuộc biến môi trường thủ công.
   - Mỗi báo cáo Market có đủ các biểu đồ chính: độ tập trung thị trường, doanh thu theo sàn, xếp hạng sản phẩm.
   - Khi buộc phải dùng SVG dự phòng thì ghi cảnh báo vào log và vào kết quả kiểm duyệt; không được im lặng.
3. **Thêm kiểm tra tự động:** quy tắc 11 chỉ Đạt khi mọi biểu đồ có `data-engine` là Flint và đủ số biểu đồ bắt buộc. Thêm bài kiểm thử cho cả hai trường hợp thiếu biểu đồ và dùng dự phòng.
4. Duyệt Astra, CI xanh, gộp, triển khai, trình bày lại 3 báo cáo, chấm lại.

**Xong khi:** cả 3 báo cáo có đủ biểu đồ vẽ bằng Flint, quy tắc 11 Đạt ở cả 3.

**Phương án khác**
- **A. Gộp chung với PR ảnh bìa (B2):** cùng sửa bước dựng giao diện báo cáo, nên duyệt và triển khai một lần.
- **B. Vẽ biểu đồ trước, lúc tạo bản trình bày:** dựng biểu đồ Flint thành SVG tĩnh rồi nhúng vào HTML, để lúc hiển thị không cần Flint.
- **C. Tạm chấp nhận SVG dự phòng trong giai đoạn thử:** cần chủ dự án đồng ý nới quy tắc 11, và vẫn phải có đủ biểu đồ.

---

## Phần 5. Thứ tự việc nên làm hôm nay

| # | Việc | Ai làm | Cần chủ dự án duyệt? |
|---|---|---|---|
| 1 | B1, bước 1–2: kiểm tra kết quả vòng 5, đổi người duyệt sang Sol 6.1 | Trợ lý điều phối | Có (đã quá quy tắc 3 lần) |
| 2 | B1, bước 3–4: gộp, triển khai, trình bày lại thạch dừa, chấm | Trợ lý điều phối | Không (triển khai đã được phép sau duyệt và gộp) |
| 3 | Quyết định nguồn ảnh bìa (B2) | Chủ dự án | Có |
| 4 | Làm PR ảnh bìa (B2) + biểu đồ Flint (B6), có thể gộp làm một PR | omp + Astra | Không |
| 5 | Nạp tiền nguồn đánh giá (B3), chuyển về AUTO_REUSE | Chủ dự án, rồi trợ lý | Có |
| 6 | Chuyển việc đưa dữ liệu thu thập vào lượt chạy mới thành bước trong ứng dụng | omp | Không |
| 7 | Sửa lật trang của công cụ thu thập (B4), sau 14/10 | omp | Có (cầu nối OpenCLI và lượt tra cứu Metric) |

---

## Phần 6. Quy tắc phải giữ

- **Gộp:** chỉ gộp khi người duyệt cho Đạt trên **đúng** đầu nhánh, CI xanh và PR ở trạng thái MERGEABLE, dùng `--squash --match-head-commit`.
- **Git:** không bật tự gộp, không push thẳng main, không force-push, không rebase nhánh đã push (dùng `git merge origin/main`), không đổi git config, không `git stash` trần, không `rm`.
- **Quy tắc 3 lần:** việc nào trượt 3 lần thì dừng và viết method audit.
- **Metric:** không tra cứu mới (đã dùng 3 lượt), không đăng nhập hay xuất dữ liệu, không vào trang lịch sử.
- **Bảo mật:** không in hay lưu khóa; không đọc các file khóa của nhà cung cấp hay file môi trường của công cụ thu thập.
- **Báo cáo:**
  - không nêu tên nhà cung cấp dữ liệu (được nêu Shopee/TikTok Shop), không nêu Jev/TypeSafe;
  - không hiện % tiến độ;
  - tiếng Việt dễ hiểu.
- **Máy Fedora:** tối đa 4 agent cùng lúc, không dùng timer, không chạm tdn-web hay tdn-content-worker.

---

## Phần 7. Phụ lục kỹ thuật (cho trợ lý)

**Bản trình bày**
- Lấy bản trình bày tại `GET /api/workspaces/<WS>/research-automation/runs/<RUN>/report-versions/<pairId>/reports/market`.
- Đường dẫn **không có pairId** (`…/runs/<RUN>/reports/market`) trả về bản nháp chưa kiểm duyệt. Đừng chấm bản này.
- Khi tạo bản trình bày mới, luôn dùng pairId mới nhất, nếu không sẽ gặp lỗi 409 `revision_conflict`.

**Gói dữ liệu thu thập gắn với từng lượt chạy**
- `runBindingSha256 = sha256(canonical({runId, start}))`, được kiểm ở `metric-method-bridge.ts`.
- Gói chuẩn bị cho lượt chạy này không dùng được cho lượt chạy khác.
- Công thức chạy lại: xem `docs/handoffs/PRESFIX-209.md` (nhánh `wp/presfix-209`). Tóm tắt:
  1. tạo lượt chạy mới, cùng từ khóa và cùng giai đoạn;
  2. POST lại đúng các tệp thu thập vào `/sources/metric-capture` của lượt mới;
  3. xác nhận `USE_PREPARED` với **packageId mới**.

**Tài liệu liên quan trong repo**
- `docs/handoffs/CAPROWS-209.md`: vì sao canxi chỉ có 1 trang.
- `docs/handoffs/PRESFIX-209.md`: bản sửa quy tắc 3 và công thức chạy lại (trên nhánh PR #241).

**Lệnh gộp mẫu**
```
gh pr merge <n> --repo khangpworking/tdn-growth-os --squash --match-head-commit <sha>
```
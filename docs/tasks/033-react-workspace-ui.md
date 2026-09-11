# Task 033 — React frontend theo prototype nhiều thị trường đã duyệt

Trạng thái: được chủ dự án cho triển khai trên Fedora. Bỏ qua cài đặt/cấu hình LSP.
Base backend: `1e8cd2dcfd49fe339c0e05cc3bc88994a77dfc6a` (Task 032 merge).
Nhánh bàn giao và triển khai: `feature/033-react-workspace-ui`.

## Mục tiêu

Dựng frontend React + Vite + TypeScript chạy trên Fedora và build được, bám bản HTML chủ dự án đã duyệt. Lượt này dùng dữ liệu synthetic trong bộ nhớ. Không cần thêm phỏng vấn thiết kế hoặc chọn lại hướng.

## Nguồn chuẩn và thứ tự đọc

1. `AGENTS.md`, `README.md`, đầu `docs/STATUS.md` và task này.
2. `INTENT.md` D27–D31, `PRODUCT.md`, `docs/adr/0002-react-vite-typescript-frontend.md`.
3. **Visual source of truth: `docs/frontend/workspace-prototype.html`**. Mở và xem desktop/mobile trước khi chuyển sang React.
4. `DESIGN.md`, `.impeccable/design.json`, `docs/frontend/overview-detail-direction.md`.
5. `docs/frontend/product-workspace-brief.vi.md` cho ranh giới nghiệp vụ. Brief rộng hơn scope Task 033; không xây toàn bộ các form trong brief.

`direction-options.html` là lịch sử hình thành thiết kế. Bốn bản Coinbase/Meta/Apple/HP đã bị loại. Không chạy lại chọn visual, sinh ảnh, workshop, hay cài design skill. Không cần các file riêng tư Windows.

## Phạm vi UI

- Ba cấp: tất cả thị trường → workspace khám phá của thị trường → hồ sơ sản phẩm.
- Trang đầu: số đếm, danh sách thị trường, tìm tên/từ khóa, nút tạo nghiên cứu demo.
- Tạo nghiên cứu: tên thị trường bắt buộc sau trim, từ khóa tùy chọn; tạo workspace trống trong bộ nhớ, không tự thu thập dữ liệu.
- Trang thị trường: số đếm B8 của đúng thị trường, sản phẩm đã tách, rổ ứng viên, phần bằng chứng trống đúng ngữ cảnh.
- Thị trường chưa có sản phẩm vẫn hiển thị rổ cơ hội. Không biến số 0 thành lỗi hoặc tạo dữ liệu để lấp chỗ trống.
- Chi tiết sản phẩm: giữ bố cục hồ sơ, lane B8, evidence/history, trạng thái bước, điều kiện B9.
- B8 demo: bốn lane độc lập; Đạt / Tạm giữ / Không đạt, không lý do; không gửi lại cùng trạng thái; thêm lịch sử khi đổi.
- Bốn PASS cho xác nhận clearance minh họa. Thay đổi B8 sau đó vẫn giữ snapshot lịch sử; không tự mở khóa/hủy snapshot.
- B9 và B10 chỉ có view giải thích điều kiện và placeholder rõ ràng như HTML. **Không dựng form STP, khóa STP thật hoặc thực thi B10 trong task này.**
- Chuyển thị trường, back/forward, mở thẳng URL thị trường/sản phẩm phải đúng context. ID không có hiện thông báo phù hợp, không crash hoặc hiển thị nhầm sản phẩm.
- Hai thị trường có thể có tên/keyword trùng: nhận diện bằng ID; sản phẩm liên kết với thị trường bằng ID, candidate liên kết product bằng ID, không join tên.
- Dữ liệu mẫu: canxi, collagen, giấc ngủ; reset/reload đưa về seed. Nhãn demo luôn rõ. Không localStorage, provider call, API hoặc runtime DB.
- Giữ search không kết quả, empty/loading/error preview, reset và UI tiếng Việt. Keyboard focus rõ, reduced motion, bố cục responsive.

## Triển khai gọn

- Một application package và một root `package-lock.json`. Đề xuất frontend nằm `frontend/`, không tạo monorepo/workspace hoặc package manager mới.
- Giữ Node `24.15.0`, npm `11.12.1`, TypeScript `5.9.3`. Chọn React/Vite/plugin-react/type packages tương thích tại lúc triển khai; pin exact versions và cập nhật lock bằng npm. Không tự nâng backend dependencies.
- CSS thường hoặc CSS modules bám thiết kế đã duyệt. Chưa cần Tailwind, UI kit, thư viện chart/state hoặc framework full-stack.
- Component vừa đủ: AppShell, MarketList, MarketWorkspace, ProductWorkspace, B8 panel, badge và các control dùng lại. Mock state typed bằng TS; reducer/hook nhỏ nếu cần, không tạo plugin/service framework.
- Hash routing đơn giản là đủ cho scope demo; hỗ trợ history/back/forward và URL không hợp lệ. Không cần router dependency nếu chưa đem lại lợi ích rõ.
- Giữ frontend tách khỏi Node/SQLite filesystem modules. Không import backend service vào browser; chỉ đưa synthetic state vào bundle. Không sửa canonical contracts để chiều UI.
- Hiện backend typecheck dùng `scripts/typecheck.mjs`, quét `src/contracts/tests/scripts` với NodeNext. Dùng `frontend/tsconfig.json` riêng cho DOM/JSX/bundler; giữ backend check hoạt động.
- Cung cấp `npm run frontend:dev`, `frontend:typecheck`, `frontend:build`, `frontend:preview`; output build được Git ignore.
- Thêm typecheck/build frontend vào check CI hiện có qua scripts tối thiểu. Không thay đổi workflow trừ khi có nhu cầu cụ thể; mặc định workflow gọi `npm run check` là đủ.
- LSP được bỏ qua theo yêu cầu. Không cài/điều chỉnh harness hoặc toolchain toàn máy để phục vụ task.

## Không thuộc task

API, authentication/OWNER session thật, SQLite reads/writes, migrations, live decisions, provider/scraping/paid calls, B2 methodology Task 024, AI/Pi, Content Studio, B11–B14, Windows backport, deployment. Browser dev server chỉ phục vụ preview; không mở public port hoặc deploy.

## Kiểm tra vừa đủ

1. Frontend typecheck và production build.
2. Kiểm tra browser luồng trọng yếu: nhiều thị trường, tìm kiếm, tạo thị trường trống, mở sản phẩm, đổi B8 và lịch sử, clearance, back/forward, reset, URL lỗi. Xác nhận đổi một sản phẩm không đổi sản phẩm/thị trường khác.
3. Kiểm tra desktop 1440px và mobile 390px (thêm tablet nếu layout có vấn đề). Chụp overview thị trường, trang thị trường và hồ sơ sản phẩm. So sánh cùng viewport với HTML nguồn; không đổi design để hợp template khác.
4. Test nhỏ cho mock-state/routing có logic đáng kiểm tra. Không cần snapshot mọi component hoặc thêm bộ E2E lớn. Dùng browser kiểm tra trực tiếp nếu đủ.
5. `npm run check` một lần khi hoàn tất; chạy lại phần bị ảnh hưởng nếu có sửa. `git diff --check`.
6. Migrations 0001–0020, backend source và canonical/generated contracts phải giữ nguyên. Kiểm tra dependency diff, không đưa env/credential/DB/generated build/browser profile/log vào Git. Dừng process test do task tạo.

## Bàn giao

Tiếp tục trên đúng branch/commit bàn giao trong worktree Fedora riêng. Nếu nhánh đã tiến thêm, đọc handoff mới nhất, không reset/force push.

Commit/push bình thường lên cùng nhánh, dùng cùng draft PR của Task 033. Giữ PR draft; không merge hoặc deploy. Đợi Check thành công trên final SHA, xác nhận local/remote/PR head khớp.

Ghi `docs/handoffs/033-react-workspace-ui.md` và cập nhật STATUS: chức năng demo đã làm, lệnh chạy, files, tests, giới hạn, khoảng cách API. Đính kèm ảnh desktop/mobile cho chủ dự án xem. Comment:

`HANDOFF_TO_CODEX commit=<full SHA> result=PASS scope=FRONTEND_DEMO_ONLY`

Nếu chưa thể chạy preview/CI, báo phần chưa kiểm chứng cụ thể thay vì tuyên bố PASS.

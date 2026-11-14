---
name: tdn-shopee-m3-binh-luan
description: Run the M3 review-collection module of the TDN Shopee module flow (selection-v1 → reviews.json in the app shape shopee-public-rows → gate M3). Use when someone asks to «thu bình luận Shopee», «thu đánh giá Shopee» cho một lượt, read the gate M3 slip, or find where the Shopee collector rules live in the app code. Not for picking products or loading the database.
---

# M3 Thu bình luận Shopee

M3 đọc `selection.json` đã qua cổng M2, thu bình luận công khai cho từng link, ghi `m3/reviews.json` theo khuôn app và `m3/outcome.json` cho kết luận thu. Luật thu nằm trong code app. Skill này chỉ nói đầu vào, một lệnh cần gọi, luật ở đâu, đầu ra và cách xử lý khi cổng chưa đạt.

## 1. Đầu vào

- `m2/selection.json`, đã qua cổng M2: phiếu `gates/m2.json` phải có và `verdict` = `PASS`.
- Mã băm của `m2/selection.json` lúc chạy phải bằng `outputSha256` trên phiếu M2. Khác → `GATE_INPUT_CHANGED`.
- 1 đến 5 link. Mỗi link phải là `https://shopee.vn/product/<shopId>/<itemId>`.
- Trần bình luận mỗi link lấy từ `request.json` của lượt. M3 không cần `captureSpec` (R2).
- Chuẩn đầu ra của module: `shopee-public-rows` (khai trong `modules.json`).

## 2. Việc AI làm

Gọi đúng 1 lệnh, không mở trình duyệt, không đăng nhập thay owner, không sửa file đầu ra:

```
python3 shopee_flow.py m3 --run <runId>
```

- `--detach` chạy lệnh ở nền, in `{ "format": "detached-v1", "runId", "pid" }` rồi thoát 0. Luật chặn chạy trước khi tách.
- Lượt thu chạy lâu: tối đa 40 phút mỗi link. Lệnh chạy nền; AI đọc phiếu khi xong, không tự chạy lại.
- Không gọi thẳng bộ thu trong code, không gọi dịch vụ Shopee, không dùng token của app. Lệnh chỉ đọc cấu hình bộ thu từ env do owner đặt lúc chạy: `TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED=1` và `TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN`. Không in, không chép các giá trị này.
- Không thử lại ở mức module (0 lần). Mất đăng nhập hoặc gặp bước xác minh thì dừng và chuyển owner.

## 3. Quy tắc nghiệp vụ

Mỗi dòng là một luật, kèm chỗ ở trong code hoặc tham số.

1. Trần bình luận mỗi link từ 1 đến 300, mặc định 300 (D3). Chế độ mẫu thử `TRIAL` tối đa 20. (`src/platform/collectors/shopee-public-reviews.ts` → `ShopeePublicReviewCollector` constructor; `modules.json` → `params.reviewCapPerLink`)
2. Một lần thu nhận 1 đến 5 link, không hơn. (`shopee-public-reviews.ts` → `collect`)
3. Link phải chuẩn hoá được về `https://shopee.vn/product/<shopId>/<itemId>`; đường khác bị từ chối. (`shopee-public-reviews.ts` → `normalizePublicReviewUrl`)
4. Mỗi lần thu kiểm phiên đúng 1 lần. Chỉ `READY` mới thu. Mất đăng nhập hoặc đang chờ người đăng nhập → `HUMAN_LOGIN_REQUIRED`. Cần xác minh → `HUMAN_VERIFICATION_REQUIRED`. Bộ thu bận hoặc không phản hồi → `HEALTH_NOT_READY`. (`shopee-public-reviews.ts` → `ensureSession`)
5. Không gửi lại việc thu: journal ghi ý định trước khi gửi; chạy lại thì đọc journal và tiếp tục, không submit lần hai. Không xác định được việc đã gửi hay chưa → `SUBMISSION_UNCERTAIN`. (`shopee-public-reviews.ts` → `#collect`, `readJournal`, `reconcile`)
6. Hạn: 40 phút cho mỗi link; cả lượt 40 phút nhân số link. Quá hạn → `DEADLINE`, có một lần hủy việc thu. (`shopee-public-reviews.ts` → `#collect`, `deadline`, `acquisitionDeadline`, `cancel`)
7. Bộ thu chỉ lấy bình luận có nội dung (`filter: 'HAS_COMMENTS'`). Bình luận rỗng hoặc chỉ có media bị loại và ghi lý do `EMPTY_OR_MEDIA_ONLY`, `EMPTY_OR_SYMBOLS_ONLY`. (`shopee-public-reviews.ts` → `mapPublicReviewResult`)
8. Mỗi dòng kết quả giữ mã bình luận, `shopId`, `itemId`, `sourceUrl`, `sourcePage`, `sourceRow`, giờ gửi, số sao và lý do không nhận nếu có. Giờ gửi `postedAtLocal` đổi sang `createdAt` với múi giờ `+07:00`. (`shopee-public-reviews.ts` → `mapPublicReviewResult`, `publicReviewLocalTime`)
9. Kết luận thu: mất đăng nhập hoặc chờ đăng nhập → `SHOPEE_LOGIN_REQUIRED`; cần xác minh → `SHOPEE_VERIFICATION_REQUIRED`; bộ thu không phản hồi → `SHOPEE_COLLECTOR_DOWN`; không có bình luận nào → `PROVIDER_BLOCKED`; hết giờ mà không có bình luận → `PROVIDER_TIMEOUT_NO_REVIEWS`; có link thiếu bình luận hoặc chưa đủ mục tiêu → `PARTIAL_LISTINGS`; mọi link đủ → `OK`. (`src/modules/analysis/research-automation/exact-shopee-outcome.ts` → `classifyPublicExactShopee`)
10. Mục tiêu mỗi link là 300 bình luận (`TARGET_REVIEWS`). Trần của yêu cầu nhỏ hơn thì theo trần. (`exact-shopee-outcome.ts`; `shopee-public-reviews.ts` → `maxReviewsPerProduct`)
11. Mỗi link phải có ít nhất 1 bình luận; đây là điều kiện của cổng M3. Link có ít bình luận hơn trần chỉ là cảnh báo, không làm cổng trượt. Kết luận thu giữ lại các dòng đã thu khi nằm trong `params.collectionSuccessVerdicts` (`OK`, `PARTIAL_LISTINGS`). (`modules.json` → `params.minReviewsPerLink`, `params.collectionSuccessVerdicts`)
12. Số lần thử lại ở mức module là 0. Trong code, mỗi lần hỏi trạng thái/ kết quả tự thử lại 1 lần khi gặp `SHOPEE_REVIEW_TIMEOUT`, `SHOPEE_REVIEW_TRANSPORT` hoặc lỗi HTTP 5xx; đó là luật code, không phải retry module. (`shopee-public-reviews.ts` → `get`)
13. Token của bộ thu không vào file lượt và không vào phiếu. Lệnh chỉ đọc env lúc chạy, không đọc env của tiến trình khác và không đọc file bí mật. Kết quả chứa token bị từ chối (`CREDENTIAL_ECHO_REFUSED`). (`shopee-public-reviews.ts` → `#exchange`)
14. Bộ thu dùng chung phiên Shopee với app. App đang thu thì M3 dừng với `HEALTH_NOT_READY`. (`shopee-public-reviews.ts` → `ensureSession`; session state `COLLECTOR_BUSY`)

## 4. Đầu ra

- `m3/reviews.json`: mảng trần theo khuôn `shopee-public-rows` (JSON Schema trong `contracts/foundation/shopee-public-rows.schema.json`), không bọc trong object. File giữ các dòng đã thu khi kết luận thu nằm trong `modules.json` → `params.collectionSuccessVerdicts` (`OK`, `PARTIAL_LISTINGS`); mọi kết luận khác thì file là `[]`. Trường mỗi dòng: `reviewId`, `shopId`, `itemId`, `postedAtLocal`, `createdAt`, `variation`, `ratingStar`, `ratingState`, `comment`, `attributes`, `contentType`, `sourcePage`, `sourceUrl`, `sourceRow`, `admissionReasons`.
- `m3/outcome.json`, chuẩn `m3-outcome-v1` (D7): `format` = `"m3-outcome-v1"`, `verdict` = kết luận thu của app nguyên văn (`OK`, `PARTIAL_LISTINGS`, `PROVIDER_BLOCKED`, `SHOPEE_LOGIN_REQUIRED`, ...), `errorCode` = mã lỗi app hoặc `null`. `errorCode` là `null` khi `verdict` nằm trong `params.collectionSuccessVerdicts`. Được phép thêm trường từ outcome của app nếu không có nội dung bình luận và không có bí mật.
- Mã băm: SHA-256 của mã băm đệ quy thư mục `m3/` (D8): mỗi file một dòng `<đường dẫn tương đối posix>\t<sha256>\n`, sắp theo đường dẫn; chữ thường.
- Phiếu `gates/m3.json` (chuẩn `handoff-v1`). `next` là `null` sau cổng M3, kể cả khi `PASS`. Phiếu chỉ chứa số đếm, mã băm, phiên bản và trạng thái; không có nội dung bình luận.

## 5. Kiểm tra

Lệnh cổng:

```
python3 shopee_flow.py gate m3 --run <runId>
```

Exit code: `0` PASS, `20` FAIL, `21` WAIT_OWNER, `22` GATE_NOT_PASSED, `23` GATE_INPUT_CHANGED, `24` RUN_BUSY, `2` sai cách gọi hoặc không thấy thư mục lượt.

Phép kiểm của cổng M3 (hợp đồng mục 8):

- `verdict_ok`: `m3/outcome.json` có, đúng `m3-outcome-v1`, `verdict` nằm trong `modules.json` → `params.collectionSuccessVerdicts` (`OK`, `PARTIAL_LISTINGS`), `errorCode` = `null`. Thiếu file → phép kiểm sai (D8).
- `min_reviews_per_link`: mỗi link có ít nhất `params.minReviewsPerLink` bình luận (1).
- `cap_not_exceeded`: không link nào vượt trần của yêu cầu.
- `no_duplicate_review_ids`: không mã bình luận nào xuất hiện hai lần.
- `product_ids_match_m2`: mã sản phẩm trong kết quả bằng link của M2.
- `shape_shopee_public_rows`: file đúng khuôn `shopee-public-rows`.
- `links_below_cap` (cảnh báo): `got` = `{ "belowCap": <số link có ít bình luận hơn trần>, "cap": <trần> }`; `ok` sai khi `belowCap` > 0, nhưng cảnh báo không đổi kết luận cổng.

Lượt giới hạn theo số trang (`shopee-review-policy-v2`, `limitBy: "pages"`, `pagesPerLink` 1–100) chỉ chạy qua lần lấy cấu hình (`m3-custom`). Cổng của lần lấy đó thay `cap_not_exceeded` bằng `pages_not_exceeded` (số trang đã lưu của mỗi link ≤ `pagesPerLink`, đếm chung mọi bộ lọc sao), giữ `min_reviews_per_link` và không có `links_below_cap`. Số bình luận chỉ bị chặn bởi trần an toàn 2000 của dịch vụ.

M3 đạt khi mỗi link có ít nhất 1 bình luận. Một link có ít bình luận hơn trần là chuyện bình thường: nó chỉ là cảnh báo `links_below_cap`, không làm cổng M3 trượt. Kết luận thu `PARTIAL_LISTINGS` vẫn giữ các dòng đã thu và cổng M3 vẫn `PASS`.

Mã chặn của luồng (hợp đồng mục 7, không phải mã app):

- `GATE_NOT_PASSED`: phiếu M2 thiếu hoặc không `PASS`. Dừng, chưa gọi bộ thu.
- `GATE_INPUT_CHANGED`: `selection.json` đã đổi sau cổng M2. Dừng, báo qua cổng M2 lại.
- `RUN_BUSY`: lượt đang chạy với pid còn sống. Dừng. Pid đã chết thì lệnh đánh dấu `STOPPED` + `RUN_INTERRUPTED` rồi đi tiếp.
- `READONLY_ON`: khóa chỉ-đọc đang bật (`TDN_SHOPEE_FLOW_READONLY=1` hoặc file `<state>/shopee-flow/READONLY`). M3 dừng và giữ nguyên file. Không tự gỡ khóa.

Bảng mã lỗi app:

| Mã lỗi (nguồn) | AI làm gì | Chuyển cho người khi |
|---|---|---|
| `HUMAN_LOGIN_REQUIRED` (`shopee-public-reviews.ts`) | Dừng. Không đăng nhập thay, không thử lại. | Luôn: owner đăng nhập Shopee cho bộ thu rồi chạy lại M3. |
| `HUMAN_VERIFICATION_REQUIRED` (`shopee-public-reviews.ts`) | Dừng. Không thử lại. | Luôn: owner xử lý bước xác minh của Shopee. |
| `HEALTH_NOT_READY` (`shopee-public-reviews.ts`) | Dừng. | Luôn: owner kiểm bộ thu (app đang thu, bộ thu tắt hoặc không phản hồi). |
| `SUBMISSION_UNCERTAIN` (`shopee-public-reviews.ts`) | Dừng tuyệt đối. Không gửi lại việc thu, không xoá journal. | Luôn: owner kiểm việc thu trên bộ thu. |
| `DEADLINE` (`shopee-public-reviews.ts`) | Dừng. 0 lần thử lại. | Luôn: báo link và số bình luận đã có. |
| `OWNER_ABORTED` (`shopee-public-reviews.ts`) | Dừng, giữ journal. | Luôn: hỏi owner có muốn chạy lại M3. |
| `SHOPEE_REVIEW_TIMEOUT`, `SHOPEE_REVIEW_TRANSPORT` (`shopee-public-reviews.ts`) | Code đã tự thử 1 lần; vẫn lỗi thì dừng. | Luôn: báo mã lỗi và thời điểm. |
| `SHOPEE_REVIEW_HTTP_401`, `SHOPEE_REVIEW_HTTP_403`, `SHOPEE_REVIEW_HTTP_5XX` (`shopee-public-reviews.ts`) | Dừng. | Luôn: 401/403 owner kiểm đăng nhập Shopee; 5xx báo người phụ trách bộ thu. |
| `CREDENTIAL_ECHO_REFUSED` (`shopee-public-reviews.ts`) | Dừng, không in nội dung phản hồi. | Luôn: báo người phụ trách; đây là lỗi an toàn. |
| `SHOPEE_REVIEW_INVALID_RESPONSE`, `SHOPEE_REVIEW_LIMIT` (`shopee-public-reviews.ts`) | Dừng. | Luôn: báo mã lỗi và số dòng đã nhận. |
| `PROVIDER_BLOCKED`, `PROVIDER_TIMEOUT_NO_REVIEWS` (`exact-shopee-outcome.ts`) | Dừng. Cổng M3 trả `FAIL` ở `verdict_ok`. 0 lần thử lại. | Luôn: báo kết luận thu và số bình luận mỗi link. |
| `PARTIAL_LISTINGS` (`exact-shopee-outcome.ts`) | Chạy tiếp: giữ các dòng đã thu. Cổng M3 `PASS` khi mỗi link có ít nhất 1 bình luận; link dưới trần chỉ là cảnh báo. | Chỉ khi có link 0 bình luận: cổng M3 `FAIL` ở `min_reviews_per_link`, báo link đó cho owner. |
| `SHOPEE_LOGIN_REQUIRED`, `SHOPEE_VERIFICATION_REQUIRED` (`exact-shopee-outcome.ts` → `classifyExactShopee`) | Dừng. Không thử lại. | Luôn: owner đăng nhập hoặc xử lý xác minh Shopee rồi chạy lại M3. |

Bảng chuyển cho người — chỉ mã của M3 trong `modules.json` → `params.handToOwnerCodes` (D4):

| Mã | File app | AI làm gì | Chuyển cho người |
|---|---|---|---|
| `HUMAN_LOGIN_REQUIRED` | `shopee-public-reviews.ts` (`ensureSession`, `#collect`) | Dừng. Không đăng nhập thay, không thử lại. | Owner đăng nhập Shopee cho bộ thu rồi chạy lại M3. |
| `HUMAN_VERIFICATION_REQUIRED` | `shopee-public-reviews.ts` (`ensureSession`, `#collect`) | Dừng. Không thử lại. | Owner xử lý bước xác minh của Shopee. |
| `SHOPEE_LOGIN_REQUIRED` | `exact-shopee-outcome.ts` (`classifyExactShopee`) | Dừng. Không thử lại. | Owner đăng nhập Shopee rồi chạy lại M3. |
| `SHOPEE_VERIFICATION_REQUIRED` | `exact-shopee-outcome.ts` (`classifyExactShopee`) | Dừng. Không thử lại. | Owner xử lý xác minh Shopee rồi chạy lại M3. |

Cổng trả `WAIT_OWNER` khi mã lỗi nằm trong `params.handToOwnerCodes`. Mã ngoài bảng trên không đổi kết luận sang `WAIT_OWNER`.

## 6. Phiên bản

- Skill `tdn-shopee-m3-binh-luan`, phiên bản `1.0.1`. Giá trị này phải bằng `modules.json` → `modules[M3].skillVersion`, và bằng `skillVersion` trên phiếu.
- Bản luật code: không có (`modules.json` → `modules[M3].ruleVersion` = `null`).
- File code chịu trách nhiệm: `src/platform/collectors/shopee-public-reviews.ts` (`ShopeePublicReviewCollector`, `mapPublicReviewResult`); `src/modules/analysis/research-automation/exact-shopee-outcome.ts` (`classifyExactShopee`); khuôn `contracts/foundation/shopee-public-rows.schema.json`.
- Số lần thử lại `0`, số bình luận tối thiểu mỗi link `1`, trần mỗi link `1..300`: sửa trong `modules.json`, không sửa code.

# 0004. Product mode skips the interview

- **Status:** Accepted (owner, 2026-10-02, v4)
- **Date:** 2026-10-02

## Context

An owner with a detailed product in mind has already answered most of what the interview would ask. Asking again wastes their time and suggests the system didn't read their description.

## Decision

- Product mode goes from step 1 straight to step 3. The nav shows step 2 as "Bỏ qua · đã có mô tả".
- Step 3 ("Hệ thống hiểu sản phẩm của bạn") shows the fields read from the description: form, target and price band. They are labelled `operator_supplied_unverified` ("người dùng cung cấp, chưa kiểm chứng"). Links in the description become reference cards.
- Step 4 ("Sản phẩm giống ý bạn") ranks real candidates by how well they match those fields:
  - "Khớp cả 3" ranks above "Khớp x · y", which ranks above "Khác mô tả của bạn".
  - The exploration card always comes last.
- A field the description leaves out is **not asked**. It shows as "Chưa có · suy ra từ thẻ bạn chọn", is inferred from the picks, and is confirmed on step 5 ([0005](0005-candidate-cards-and-inferred-preferences.md)).
- If a field was extracted wrongly, the owner fixes it by editing the description in step 1 ("Sửa mô tả"); there is no separate field editor. The owner confirmed this is enough.

## Consequences

- The backend needs reliable extraction from free text, links and photos. The prototype shows a fixed sample product.
- Ranking by match must still keep exploration and diversity ([0005](0005-candidate-cards-and-inferred-preferences.md)), so that the owner's description doesn't narrow the search into a feedback loop.

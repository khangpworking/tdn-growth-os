# 0013. Step 1: mode shows/hides the description; pasted text is split

- **Status:** Accepted (owner, 2026-10-02, v5)
- **Date:** 2026-10-02

## Context

- In v4, step 1 always showed a product description box, and the mode was auto-detected from it. Someone exploring a category can't describe what they don't yet understand; that is the interview's job.
- Product mode with an empty description had nothing to match against.
- Owners may paste a whole product text (name, specs, price, link) into the keyword box.

## Decision

- **Step 1 order:** keyword, then "Chế độ nghiên cứu", then the description area.
  - The description, photo and "Dùng mô tả mẫu" show **only in product mode**.
  - Switching the mode resets the downstream steps.
- **Gate:** in product mode, "Tiếp tục" is disabled until there is a description or a photo, and a hint says why. Category mode needs only the keyword.
- **Paste split:**
  - Text counts as a product description when it has a newline, a URL, or more than 70 characters, or when it has a quantity with a unit (đ, k, ml, mg, viên, gói, hộp, …) and more than 6 words.
  - Text like that, pasted or typed into the keyword box, is split. The name (the first chunk, at most 8 words) becomes the keyword, the full text goes to the description, and the mode switches to product.
  - A "Hoàn tác" banner restores the previous keyword, description and mode.
  - A short paste is left alone.
- Auto-detecting the mode from the description was removed.

## Consequences

- The split is a front-end heuristic. The backend extraction ([0004](0004-product-mode-skips-interview.md)) still reads the full description, so a poor name split costs only a keyword the owner can edit.
- The split rules are Vietnamese-aware (đ / vnđ units, Vietnamese words) and will need tuning against real pastes.

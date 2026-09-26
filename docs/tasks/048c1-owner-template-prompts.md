# Task 048c1: Owner template prompts in the prompt library

Lane: Standard. Stacked on Task 048c (`feature/048c-content-prompt-library`).

## Goal

Add the owner's three prompt templates to "Thư viện prompt" as read-only system prompts, next to the existing defaults:

| Id | Type | Name | File |
|---|---|---|---|
| `system-big-idea-insight` | BIG_IDEA | Big Idea từ Consumer Insight v1 | `prompts/content/library/big-idea-insight-v1.md` |
| `system-angle-content` | ANGLE | Góc nội dung từ Big Idea v1 | `prompts/content/library/angle-content-v1.md` |
| `system-caption-social-post` | CAPTION | Social Post từ góc nội dung v1 | `prompts/content/library/caption-social-post-v1.md` |

## Decisions

- **Not default.** The existing default of each type stays. Each type still has exactly one default. An OWNER can duplicate a new template and edit the copy, as with any system prompt.
- **Creative layer only.** The system layer (`prompts/content/system/*-v1.md`) already provides locked data, safety rules and the JSON output contract. So each template's `INPUT` section is replaced by a short list of the fields the system provides, and its output section keeps only the quality rules for the content. `{{PREVIOUS_*}}` placeholders become the locked-input keys `previous_big_ideas`, `previous_angles` and `previous_posts`. The rest of the text is unchanged.
- **Social Post is CAPTION.** It maps to the CAPTION type (Facebook), whose system layer returns `{post}`.
- **Pinned by SHA-256**, like the other library files. Any later change needs a new version.
- **Demo mode** lists the new prompts by name. A demo system prompt now shows "Mặc định" only if it is the default.

## Out of scope

No schema, migration or API-shape change. No generation calls. No runtime or data change.

## Verification

- `tests/unit/content-prompt-library.test.ts` checks the exact list, one default per type, that no placeholder or system-layer text leaks into the creative text, and that every prompt passes the create contract (12000-character limit).
- `tests/integration/content-prompt-api.test.ts` checks the list order returned by `GET /api/content/prompts`.

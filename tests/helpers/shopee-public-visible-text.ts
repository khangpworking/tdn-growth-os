import assert from 'node:assert/strict';

/** Inspect whole tokens, leaving version strings, identifiers and decimals intact. */
export function assertNoPublicReviewZeroPlaceholder(text: string): void {
  const tokens = text.match(/[\p{L}\p{M}\p{N}_@.+/\[\],-]+/gu) ?? [];
  const placeholders = tokens.filter(token => /^[+-]?0$/u.test(token.replace(/[.,]+$/u, '')));
  assert.deepEqual(placeholders, [], 'Reader-facing bare numeric zero placeholder');
}

export function assertPublicReviewVisibleText(text: string): void {
  assert.doesNotMatch(text, /%/u);
  assertNoPublicReviewZeroPlaceholder(text);
}

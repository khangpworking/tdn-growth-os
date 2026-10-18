import assert from 'node:assert/strict';
import test from 'node:test';
import { shopeeRejectionMessage } from '../src/research-automation/shopee-report-api';
import { AUTORUN_DENY_LIST } from '../src/research-automation/autorun-text';

test('Shopee rejection says what is missing and who acts, per status', () => {
  assert.match(shopeeRejectionMessage(403), /OWNER/);
  assert.match(shopeeRejectionMessage(409), /Tải lại/);
  for (const status of [400, 401, 403, 404, 409, 500]) assert.match(shopeeRejectionMessage(status), /ý kiến khách hàng Shopee chưa có/);
  assert.match(shopeeRejectionMessage(400), /kỹ thuật/);
  assert.match(shopeeRejectionMessage(500), /thử lại sau/);
});

test('Shopee rejection never promises the report is usable and names no provider', () => {
  for (const status of [400, 401, 403, 404, 409, 500]) {
    const text = shopeeRejectionMessage(status);
    assert.ok(!/vẫn dùng được|vẫn có thể dùng/.test(text), text);
    assert.ok(text.includes('Shopee'));
    for (const word of AUTORUN_DENY_LIST) assert.ok(!text.includes(word), word);
  }
});

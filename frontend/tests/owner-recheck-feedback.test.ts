import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const app = readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');

test('recheck of OWNER writes tells the viewer the outcome, only after a manual attempt', () => {
  for (const text of ['ghi OWNER vẫn chưa bật trên máy chủ', 'ghi OWNER đã sẵn sàng', 'chưa kết nối được máy chủ']) assert.match(app, new RegExp(text));
  assert.equal(app.split('ownerAccessAttempt > 0').length - 1, 3);
});

test('read-only hints say the data is still viewable and how to recheck', () => {
  for (const file of ['BrandsPage.tsx', 'CampaignsPage.tsx', 'CatalogPanel.tsx', 'InsightPage.tsx', 'PromptsPage.tsx', 'research-automation/ScopeConfirm.tsx', 'research-automation/ResearchEditor.tsx']) {
    const source = readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');
    assert.match(source, /Bạn vẫn xem được dữ liệu\. Khi quản trị viên đã bật ghi, bấm "Kiểm tra quyền lại"/, file);
  }
});

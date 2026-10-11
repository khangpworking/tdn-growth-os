import assert from 'node:assert/strict';
import test from 'node:test';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { lintVisibleReportText, type VisibleTextLintResult } from '../../src/modules/analysis/report-visible-text-lint.js';

const u13 = (html: string, reportKind: 'MARKET' | 'INSIGHT' = 'MARKET'): VisibleTextLintResult[] =>
  lint(html, { reportKind, visibleTextRules: true }).filter(result => result.rule.startsWith('U13_')) as VisibleTextLintResult[];

const visible = (html: string): VisibleTextLintResult[] => lintVisibleReportText(html);

function assertBoth(html: string, rule: string, expectedOk: boolean, reportKind: 'MARKET' | 'INSIGHT' = 'MARKET', offendingText?: string): void {
  for (const checks of [visible(html), u13(html, reportKind)]) {
    const result = checks.find(check => check.rule === rule);
    assert.ok(result, `${rule} is returned`);
    assert.equal(result.ok, expectedOk, `${rule}: ${result.detail}`);
    if (!expectedOk && offendingText) assert.ok(result.detail.includes(offendingText), `${rule} detail names the offending text`);
  }
}

test('U13 L4 flags superlatives while allowing only headings and verbatim quote blocks', () => {
  assertBoth('<section><p>Sản phẩm tốt nhất trong mẫu.</p></section>', 'U13_SUPERLATIVE', false, 'MARKET', 'Sản phẩm tốt nhất');
  assertBoth('<h2>Sản phẩm tốt nhất</h2><blockquote>Hàng đầu theo lời khách.</blockquote>', 'U13_SUPERLATIVE', true);
  assertBoth('<title>Sản phẩm tốt nhất</title>', 'U13_SUPERLATIVE', false);
  for (const wording of ['thống nhất', 'nhất định', 'nhất quán', 'nhất trí', 'đồng nhất', 'hợp nhất']) {
    assertBoth(`<p>${wording}</p>`, 'U13_SUPERLATIVE', true);
  }
  for (const wording of ['lớn nhất', 'cao nhất', 'tốt nhất', 'duy nhất', '(nhất)', 'sản phẩm—nhất']) {
    assertBoth(`<p>${wording}</p>`, 'U13_SUPERLATIVE', false, 'MARKET', wording);
  }
});

test('U13 L4 flags ordering without a local dependency note', () => {
  assertBoth('<section><p>Làm ngay xác minh.</p><p>Tiếp theo tính giá.</p><p>Phụ thuộc vào dữ liệu.</p></section>', 'U13_PRIORITY', false, 'MARKET', 'Làm ngay xác minh');
  assertBoth('<p>Làm ngay xác minh; tiếp theo tính giá chỉ sau khi xác minh.</p>', 'U13_PRIORITY', true);
  assertBoth('<p>Làm ngay xác minh; phụ thuộc vào dữ liệu; tiếp theo tính giá.</p>', 'U13_PRIORITY', true);
  assertBoth('<p>Làm ngay xác minh; tiếp theo tính giá. Phụ thuộc vào dữ liệu.</p>', 'U13_PRIORITY', false, 'MARKET', 'Làm ngay xác minh');
});

test('U13 L3 keys the pending-number check to data-classified markup for Market and Insight', () => {
  const missing = '<section id="I15"><p><span data-classified="pending">12</span> bản ghi.</p></section>';
  const labelled = '<section id="I15"><p><span data-classified="pending">12</span> bản ghi (đề xuất, chờ chủ duyệt).</p></section>';
  assertBoth(missing, 'U13_PENDING_NUMBER', false, 'INSIGHT', '12');
  assertBoth(labelled, 'U13_PENDING_NUMBER', true, 'INSIGHT');
  assertBoth('<table><tr><td><span data-classified="pending">12</span> bản ghi.</td><td>đề xuất, chờ chủ duyệt</td></tr></table>', 'U13_PENDING_NUMBER', false, 'MARKET', '12');
  assertBoth('<table><tr><td><span data-classified="pending">12</span> bản ghi (đề xuất, chờ chủ duyệt)</td><td>khác</td></tr></table>', 'U13_PENDING_NUMBER', true);
});

test('legacy lint path does not add U13 checks without the newer visible-text option', () => {
  const results = lint('<p>Sản phẩm tốt nhất trong mẫu.</p>');
  assert.equal(results.some(result => result.rule.startsWith('U13_')), false);
});

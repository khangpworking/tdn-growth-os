import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyWebPage, WEB_PAGE_TYPE_LABEL } from '../../src/modules/analysis/research-automation/web-page-type.js';

const kind = (url: string, title: string, snippet: string | null = null) => classifyWebPage({ url, title, snippet });

test('news domains are S26, including subdomains, www and mobile hosts', () => {
  for (const url of ['https://vnexpress.net/a', 'https://www.tuoitre.vn/b', 'https://m.thanhnien.vn/c', 'https://kinhdoanh.dantri.com.vn/d', 'https://cafef.vn/e', 'https://24h.com.vn/f'])
    assert.equal(kind(url, 'Thạch dừa'), 'S26', url);
  assert.equal(kind('https://notvnexpress.net/a', 'Thạch dừa'), 'S19', 'a look-alike host is not a news domain');
  assert.equal(kind('https://vnexpress.net.example.test/a', 'Thạch dừa'), 'S19');
});

test('news-style paths are S26 on any host', () => {
  assert.equal(kind('https://shop.example.test/tin-tuc/thach-dua', 'Thạch dừa'), 'S26');
  assert.equal(kind('https://shop.example.test/thoi-su/a', 'Thạch dừa'), 'S26');
  assert.equal(kind('https://shop.example.test/tin-moi', 'Thạch dừa'), 'S26');
  assert.equal(kind('https://shop.example.test/san-pham/tin-tuc-thach-dua', 'Thạch dừa'), 'S19', 'only a whole path segment counts');
});

test('how-to wording in the title or snippet is S13, with and without diacritics, any case', () => {
  assert.equal(kind('https://blog.example.test/a', 'Cách làm thạch dừa tại nhà'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'CÁCH NẤU thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Hướng dẫn pha thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'huong dan lam thach dua'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Công thức thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Bí quyết giữ thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Làm sao để thạch dừa giòn'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Review cách dùng thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/a', 'Thạch dừa', 'Mẹo bảo quản thạch dừa lâu hơn'), 'S13', 'the snippet counts');
  assert.equal(kind('https://blog.example.test/a', 'Thạch dừa', 'Xem cách sử dụng bên dưới'), 'S13');
});

test('how-to slug in the URL path is S13 when the text has no pattern', () => {
  assert.equal(kind('https://blog.example.test/cach-lam-thach-dua', 'Thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/huong-dan-su-dung', 'Thạch dừa'), 'S13');
  assert.equal(kind('https://blog.example.test/meo-bao-quan', 'Thạch dừa'), 'S13');
});

test('ambiguous words do not make a how-to: mèo, cách nhiệt, cách điện', () => {
  assert.equal(kind('https://shop.example.test/a', 'Thạch dừa cho mèo'), 'S19', '"mèo" folds to the same letters as "mẹo"');
  assert.equal(kind('https://shop.example.test/a', 'Hộp cách nhiệt đựng thạch dừa'), 'S19');
  assert.equal(kind('https://shop.example.test/a', 'Thạch dừa', 'Khoảng cách giao hàng'), 'S19');
  assert.equal(kind('https://shop.example.test/a', 'Hộp thạch dừa giá tốt'), 'S19');
});

test('news wins a tie with how-to wording', () => {
  assert.equal(kind('https://vnexpress.net/a', 'Cách làm thạch dừa', 'Hướng dẫn chi tiết'), 'S26');
  assert.equal(kind('https://blog.example.test/tin-tuc/cach-lam', 'Cách làm thạch dừa'), 'S26');
});

test('unparseable or empty input falls back to S19 and the snippet may be null', () => {
  assert.equal(kind('not a url', 'Thạch dừa'), 'S19');
  assert.equal(kind('not a url', 'Cách làm thạch dừa'), 'S13');
  assert.equal(kind('https://shop.example.test/%E0%A4%A', 'Thạch dừa', null), 'S19');
  assert.equal(kind('', '', null), 'S19');
});

test('labels are neutral Vietnamese and never name a search engine', () => {
  assert.deepEqual(WEB_PAGE_TYPE_LABEL, { S13: 'Bài hướng dẫn', S26: 'Tin tức', S19: 'Trang khác' });
});

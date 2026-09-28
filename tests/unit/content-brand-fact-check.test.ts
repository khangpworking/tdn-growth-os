import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FACT_STATE_LABELS,
  brandFactCheck,
  canonicalPhone,
  canonicalUrl,
  comparable,
  findMoney,
  findPhones,
  findUrls,
} from '../../src/modules/flow/content-brand-fact-check.js';

const profile = {
  brandName: 'Synthetic Brand',
  tagline: 'Bền mỗi ngày',
  hotline: '(0900) 123-456',
  website: 'https://www.brand.example',
  fanpage: 'https://facebook.com/synthetic',
  address: '12 Example Street',
};
const display = { name: 'ALWAYS', tagline: 'ALWAYS', hotline: 'ALWAYS', web: 'ALWAYS', address: 'ALWAYS' } as const;

test('I73 gaps: parenthesized hotline, quoted tagline and unlabelled phone numbers', () => {
  const matched = brandFactCheck({
    profile, display,
    prices: ['1.290.000đ'],
    post: '“Bền mỗi ngày” cùng Synthetic Brand. Gọi (0900) 123-456 để được tư vấn.',
  });
  assert.deepEqual(matched.find((row) => row.element === 'tagline'), { element: 'tagline', state: 'MATCH', found: ['Bền mỗi ngày'] });
  assert.deepEqual(matched.find((row) => row.element === 'hotline'), { element: 'hotline', state: 'MATCH', found: ['(0900) 123-456'] });

  const wrongPhone = brandFactCheck({ profile, display, prices: [], post: 'Gọi 0912 999 888 hoặc 0900 123 456.' });
  assert.deepEqual(wrongPhone.find((row) => row.element === 'hotline'), { element: 'hotline', state: 'MISMATCH', found: ['0912 999 888'] });
  assert.deepEqual(findPhones('Liên hệ 0912 999 888; không phải giá 1.290.000đ.'), ['0912 999 888']);
});

test('phone and URL canonicalisation keeps equivalent forms together', () => {
  assert.equal(canonicalPhone('(0900) 123-456'), '0900123456');
  assert.equal(canonicalPhone('+84 900 123 456'), '0900123456');
  assert.equal(canonicalUrl('https://www.Brand.Example/path/'), 'brand.example/path');
  assert.equal(canonicalUrl('brand.example/path'), 'brand.example/path');
  assert.deepEqual(findUrls('Visit https://www.brand.example/path/, www.facebook.com/synthetic or TP.HCM.'), ['https://www.brand.example/path/', 'www.facebook.com/synthetic']);
  assert.equal(comparable(' “Bền   mỗi ngày” '), 'bền mỗi ngày');
});

test('money detection normalises grouped, decimal and abbreviated prices', () => {
  assert.deepEqual(findMoney('1.290.000đ | 1,29 triệu | 1290k'), [
    { text: '1.290.000đ', amount: 1290000 },
    { text: '1,29 triệu', amount: 1290000 },
    { text: '1290k', amount: 1290000 },
  ]);
  const match = brandFactCheck({ profile, display, prices: ['1.290.000đ'], post: 'Gói chỉ 1,29 triệu.' });
  assert.deepEqual(match.find((row) => row.element === 'price'), { element: 'price', state: 'MATCH', found: ['1,29 triệu'] });
  const mismatch = brandFactCheck({ profile, display, prices: ['1.290.000đ'], post: 'Gói chỉ 1.390.000đ.' });
  assert.deepEqual(mismatch.find((row) => row.element === 'price'), { element: 'price', state: 'MISMATCH', found: ['1.390.000đ'] });
});

test('fact-check state labels and hidden values are stable', () => {
  assert.deepEqual(FACT_STATE_LABELS, { MATCH: '✓ Đúng hồ sơ', NOT_MENTIONED: 'Không nhắc', HIDDEN: 'Ẩn theo mục đích', MISMATCH: 'Sai hồ sơ' });
  const hidden = brandFactCheck({ profile, display: { ...display, hotline: 'HIDDEN', web: 'HIDDEN' }, prices: [], post: 'Synthetic Brand Bền mỗi ngày 0900 123 456 https://www.brand.example' });
  assert.deepEqual(hidden.filter((row) => ['hotline', 'website', 'fanpage'].includes(row.element)), [
    { element: 'hotline', state: 'HIDDEN', found: ['0900 123 456'] },
    { element: 'website', state: 'HIDDEN', found: ['https://www.brand.example'] },
    { element: 'fanpage', state: 'HIDDEN', found: [] },
  ]);
});

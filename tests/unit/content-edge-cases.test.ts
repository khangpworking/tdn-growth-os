import assert from 'node:assert/strict';
import test from 'node:test';
import { contentAiCallCount } from '../../src/modules/flow/content-ai-call-count.js';
import { brandFactCheck, findMoney } from '../../src/modules/flow/content-brand-fact-check.js';
import {
  ContentDisplayRuleError,
  captionBrandContext,
  captionFooter,
  captionText,
  posterBrandData,
  purposeKinds,
  resolveBrandLevels,
  resolveCaptionDisplay,
  resolvePosterDisplay,
} from '../../src/modules/flow/content-display-rules.js';
import { buildPosterPrompt, logoInstruction, planPosterReferences } from '../../src/modules/flow/content-poster-prompt.js';
import { CREATIVE_IMAGE_FORMATS } from '../../src/platform/ai/creative-ai-gateway.js';

/**
 * Edge cases for the pure Content Studio rules (display, poster prompt, call count, fact check).
 * Suspected production bugs are marked `todo: 'EDGE-BUG: …'`: they run and report, but do not fail CI.
 */

const level = (value: 'ALWAYS' | 'OPTIONAL' | 'HIDDEN') => ({ name: value, logo: value, tagline: value, hotline: value, web: value, address: value });
const uniformRules = (value: 'ALWAYS' | 'OPTIONAL' | 'HIDDEN') => ({
  sales: level(value), trust: level(value), education: level(value), entertainment: level(value), engagement: level(value),
});

const profile = {
  brandName: 'Synthetic Brand',
  tagline: 'Bền mỗi ngày',
  hotline: '(0900) 123-456',
  website: 'https://www.brand.example',
  fanpage: 'https://facebook.com/synthetic',
  address: '12 Example Street',
};
const allAlways = { name: 'ALWAYS', tagline: 'ALWAYS', hotline: 'ALWAYS', web: 'ALWAYS', address: 'ALWAYS' } as const;
const layer = '{{RATIO_LABEL}} {{CANVAS_WIDTH}}x{{CANVAS_HEIGHT}} {{LAYOUT_PROFILE}} {{CAPTION_CONTENT}} {{LOGO_INSTRUCTION}} {{BRAND_JSON_LINE}}';
const factRow = (rows: ReturnType<typeof brandFactCheck>, element: string) => rows.find((row) => row.element === element);

// ------------------------------------------------------------------ display rules

test('footer is empty when every contact value is only OPTIONAL or HIDDEN, even with values present', () => {
  const footer = captionFooter(profile, { name: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' });
  assert.equal(footer, '');
  assert.equal(captionText('Synthetic post', footer), 'Synthetic post');
});

test('footer skips ALWAYS contact values the brand profile does not have', () => {
  assert.equal(captionFooter({ brandName: 'Synthetic Brand' }, allAlways), '');
  assert.equal(captionFooter({ ...profile, hotline: '', website: '', fanpage: '', address: '' }, allAlways), '');
  assert.equal(captionFooter({ brandName: 'Synthetic Brand', fanpage: profile.fanpage }, allAlways), 'Fanpage: https://facebook.com/synthetic');
});

test('a row override to HIDDEN beats an ALWAYS level and removes the footer line', () => {
  const levels = resolveBrandLevels(uniformRules('ALWAYS'), ['SALES']);
  const display = resolveCaptionDisplay(levels, { hotline: 'HIDDEN', address: 'HIDDEN' });
  assert.equal(display.hotline, 'HIDDEN');
  assert.equal(captionFooter(profile, display), 'Website: https://www.brand.example\nFanpage: https://facebook.com/synthetic');
});

test('poster override is final: logo true wins over includeLogo false and over a HIDDEN level', () => {
  const hidden = resolveBrandLevels(uniformRules('HIDDEN'), ['SALES']);
  assert.equal(resolvePosterDisplay(hidden, false, { logo: true }).logo, true);
  const always = resolveBrandLevels(uniformRules('ALWAYS'), ['SALES']);
  assert.equal(resolvePosterDisplay(always, false).logo, false);
  assert.equal(resolvePosterDisplay(always, true, { logo: false }).logo, false);
});

test('OPTIONAL shows identity on the poster but never contact values', () => {
  const levels = resolveBrandLevels(uniformRules('OPTIONAL'), ['TRUST']);
  const poster = resolvePosterDisplay(levels, true);
  assert.deepEqual(poster, { name: true, logo: true, tagline: true, hotline: false, web: false, address: false });
  assert.deepEqual(posterBrandData(profile, poster), { brand_name: 'Synthetic Brand', tagline: 'Bền mỗi ngày' });
});

test('duplicate purposes and a tag that resolves to the same kind collapse to one kind', () => {
  assert.deepEqual(purposeKinds(['SALES', 'SALES', 'tag:promo'], (id) => id === 'promo' ? 'SALES' : undefined), ['SALES']);
  assert.throws(() => purposeKinds(['SALES', 'tag:'], (id) => id === 'promo' ? 'SALES' : undefined), ContentDisplayRuleError);
});

test('ALWAYS tagline with no profile tagline is neither sent nor required', () => {
  const noTagline = { brandName: profile.brandName, hotline: profile.hotline, website: profile.website };
  assert.deepEqual(captionBrandContext(noTagline, allAlways), { name: 'Synthetic Brand', mention_required: ['name'] });
  assert.deepEqual(captionBrandContext({ ...profile, tagline: '' }, allAlways), { name: 'Synthetic Brand', mention_required: ['name'] });
  assert.deepEqual(posterBrandData({ brandName: 'Synthetic Brand' }, { name: true, logo: true, tagline: true, hotline: true, web: true, address: true }), { brand_name: 'Synthetic Brand' });
});

// ------------------------------------------------------------------ poster prompt

test('a ticked photo takes the only slot, so a requested logo becomes a text wordmark', () => {
  const plan = planPosterReferences('gpt-image-2', ['photo-1'], true, 'logo-sha');
  assert.deepEqual(plan, { photos: ['photo-1'] });
  const instruction = logoInstruction(plan, true);
  assert.match(instruction, /Reference image 1 is a product photo/u);
  assert.match(instruction, /small text wordmark/u);
  assert.doesNotMatch(instruction, /brand logo/u);
  assert.doesNotMatch(instruction, /No reference images are supplied/u);
});

test('logo switched on but never registered falls back to the wordmark with no references', () => {
  const plan = planPosterReferences('gemini-3.1-flash-image', [], true, undefined);
  assert.deepEqual(plan, { photos: [] });
  const instruction = logoInstruction(plan, true);
  assert.match(instruction, /No reference images are supplied\./u);
  assert.match(instruction, /small text wordmark/u);
});

test('planning references never mutates the ticked photo list', () => {
  const photos = Object.freeze(['photo-1', 'photo-2', 'photo-3']);
  const plan = planPosterReferences('gpt-image-2', photos, true, 'logo-sha');
  assert.deepEqual(photos, ['photo-1', 'photo-2', 'photo-3']);
  assert.deepEqual(plan.photos, ['photo-1']);
});

test('every poster format fills its own canvas size and ratio label', () => {
  const labels = { square: 'Square 1:1', portrait: 'Portrait 4:5', story: 'Story 9:16', landscape: 'Landscape 16:9' } as const;
  for (const format of ['square', 'portrait', 'story', 'landscape'] as const) {
    const prompt = buildPosterPrompt({ creativeText: 'Creative.', layerText: layer, format, captionPost: 'x', brandData: {}, plan: { photos: [] }, logoOn: false });
    const canvas = CREATIVE_IMAGE_FORMATS[format];
    assert.ok(prompt.startsWith('Creative.\n\n'), format);
    assert.ok(prompt.includes(`${labels[format]} ${canvas.width}x${canvas.height} `), format);
  }
});

test('caption quotes, newlines, Vietnamese and emoji are JSON-escaped into the poster prompt', () => {
  const captionPost = 'Giá "sốc" hôm nay\nMua ngay tại Hà Nội 🎉';
  const brandData = { brand_name: 'Cà Phê "Việt"' };
  const prompt = buildPosterPrompt({ creativeText: 'Creative.', layerText: layer, format: 'square', captionPost, brandData, plan: { photos: [] }, logoOn: false });
  assert.ok(prompt.includes(JSON.stringify(captionPost)));
  assert.ok(prompt.includes(JSON.stringify(brandData)));
  assert.ok(!prompt.includes('\nMua ngay'));
});

// EDGE-BUG: content-poster-prompt.ts:71-76 substitutes placeholders one by one across the whole layer, so a caption
// (AI output or a manual edit) that contains a later token is rewritten, and one that contains an earlier or unknown
// token makes the whole Poster fail. The caption should reach the image model verbatim.
test('caption text containing a later placeholder token is sent verbatim', { todo: 'EDGE-BUG: caption placeholder injection (content-poster-prompt.ts:71-75)' }, () => {
  const captionPost = 'Xem {{BRAND_JSON_LINE}} và {{LOGO_INSTRUCTION}}';
  const prompt = buildPosterPrompt({
    creativeText: 'Creative.', layerText: layer, format: 'square', captionPost, brandData: { brand_name: 'Synthetic Brand' }, plan: { photos: [] }, logoOn: false,
  });
  assert.ok(prompt.includes(JSON.stringify(captionPost)));
});

test('caption text containing an earlier or unknown placeholder token does not fail the Poster', { todo: 'EDGE-BUG: caption with {{…}} throws ContentPosterPromptError (content-poster-prompt.ts:76)' }, () => {
  for (const captionPost of ['Tỉ lệ {{RATIO_LABEL}}', 'Mã {{FOO}}']) {
    const prompt = buildPosterPrompt({ creativeText: 'Creative.', layerText: layer, format: 'square', captionPost, brandData: {}, plan: { photos: [] }, logoOn: false });
    assert.ok(prompt.includes(JSON.stringify(captionPost)), captionPost);
  }
});

test('brand values containing a placeholder token do not fail the Poster', { todo: 'EDGE-BUG: brand value with {{…}} throws ContentPosterPromptError (content-poster-prompt.ts:76)' }, () => {
  const brandData = { brand_name: 'Brand {{VIP}}' };
  const prompt = buildPosterPrompt({ creativeText: 'Creative.', layerText: layer, format: 'square', captionPost: 'x', brandData, plan: { photos: [] }, logoOn: false });
  assert.ok(prompt.includes(JSON.stringify(brandData)));
});

// ------------------------------------------------------------------ call count

test('call count rejects non-finite, negative, string and missing numbers', () => {
  const invalid: unknown[] = [
    { type: 'big_idea', runs: Number.NaN, perRun: 1 }, { type: 'big_idea', runs: Number.POSITIVE_INFINITY, perRun: 1 },
    { type: 'angle', runs: -1, perRun: 1 }, { type: 'angle', runs: '2', perRun: 1 }, { type: 'angle', runs: 1 },
    { type: 'caption_poster', angles: 2, caption: true }, { type: 'caption_poster', caption: true, poster: true },
    { type: 'caption_poster', angles: 2, caption: 1, poster: 0 }, 'big_idea', [],
  ];
  for (const action of invalid) assert.throws(() => contentAiCallCount(action as never), TypeError, JSON.stringify(action));
});

test('call count for a single angle with both parts and the lower bounds', () => {
  assert.deepEqual(contentAiCallCount({ type: 'caption_poster', angles: 1, caption: true, poster: true }), { text: 1, image: 1, total: 2, label: '1 Caption + 1 Poster = 2 lượt AI' });
  assert.deepEqual(contentAiCallCount({ type: 'angle', runs: 1, perRun: 1 }), { text: 1, image: 0, total: 1, label: '1 × 1 Angle = 1 lượt AI' });
});

// ------------------------------------------------------------------ brand fact check

test('an international +84 hotline matches the local profile hotline', () => {
  const rows = brandFactCheck({ profile, display: allAlways, prices: [], post: 'Gọi +84 900 123 456 nhé' });
  assert.deepEqual(factRow(rows, 'hotline'), { element: 'hotline', state: 'MATCH', found: ['+84 900 123 456'] });
});

test('a phone number in the post is a mismatch when the brand has no hotline', () => {
  const noHotline = { brandName: profile.brandName, website: profile.website, fanpage: profile.fanpage };
  const rows = brandFactCheck({ profile: noHotline, display: allAlways, prices: [], post: 'Gọi 0912 999 888 để đặt hàng.' });
  assert.deepEqual(factRow(rows, 'hotline'), { element: 'hotline', state: 'MISMATCH', found: ['0912 999 888'] });
});

test('a website in the post is a mismatch when the brand website is empty', () => {
  const rows = brandFactCheck({ profile: { ...profile, website: '' }, display: allAlways, prices: [], post: 'Xem https://brand.example ngay.' });
  assert.deepEqual(factRow(rows, 'website'), { element: 'website', state: 'MISMATCH', found: ['https://brand.example'] });
});

test('look-alike hosts never match the brand website or fanpage', () => {
  for (const url of ['https://brand.example.lua-dao.com', 'https://brand.examplefake.com/sale', 'https://facebook.com.evil.vn/synthetic']) {
    const rows = brandFactCheck({ profile, display: allAlways, prices: [], post: `Mua tại ${url} hôm nay` });
    assert.deepEqual(factRow(rows, 'website'), { element: 'website', state: 'MISMATCH', found: [url] }, url);
    assert.equal(factRow(rows, 'fanpage')?.state, 'NOT_MENTIONED', url);
  }
});

test('deeper paths, upper case and trailing punctuation still match the brand website', () => {
  const rows = brandFactCheck({ profile, display: allAlways, prices: [], post: 'Chi tiết: HTTPS://WWW.Brand.Example/San-Pham/Ao.' });
  assert.deepEqual(factRow(rows, 'website'), { element: 'website', state: 'MATCH', found: ['HTTPS://WWW.Brand.Example/San-Pham/Ao'] });
});

test('a fanpage post link counts for the fanpage row, not the website row', () => {
  const rows = brandFactCheck({ profile, display: allAlways, prices: [], post: 'Theo dõi https://facebook.com/synthetic/posts/1 nhé' });
  assert.deepEqual(factRow(rows, 'website'), { element: 'website', state: 'NOT_MENTIONED', found: [] });
  assert.deepEqual(factRow(rows, 'fanpage'), { element: 'fanpage', state: 'MATCH', found: ['https://facebook.com/synthetic/posts/1'] });
});

test('brand name matches across NFD decomposition and upper case', () => {
  const vietnamese = { brandName: 'Cà Phê Việt' };
  for (const post of [`Ghé ${'Cà Phê Việt'.normalize('NFD')} nhé`, 'Ghé CÀ PHÊ VIỆT nhé']) {
    const rows = brandFactCheck({ profile: vietnamese, display: allAlways, prices: [], post });
    assert.deepEqual(factRow(rows, 'name'), { element: 'name', state: 'MATCH', found: ['Cà Phê Việt'] }, post);
  }
});

test('found values are capped at 20 entries and 200 characters each', () => {
  const phones = Array.from({ length: 25 }, (_, index) => `09000000${String(index).padStart(2, '0')}`);
  const phoneRow = factRow(brandFactCheck({ profile, display: allAlways, prices: [], post: phones.join(', ') }), 'hotline');
  assert.equal(phoneRow?.state, 'MISMATCH');
  assert.deepEqual(phoneRow?.found, phones.slice(0, 20));

  const longUrl = `https://evil.vn/${'a'.repeat(300)}`;
  const urlRow = factRow(brandFactCheck({ profile, display: allAlways, prices: [], post: `Xem ${longUrl}` }), 'website');
  assert.equal(urlRow?.state, 'MISMATCH');
  assert.deepEqual(urlRow?.found, [longUrl.slice(0, 200)]);
});

test('weights and counts are not read as money', () => {
  assert.deepEqual(findMoney('Mua 2kg cam, 3 trứng gà và 5 trái dừa'), []);
  const rows = brandFactCheck({ profile, display: allAlways, prices: ['99.000đ'], post: 'Mua 2kg cam, 3 trứng gà' });
  assert.deepEqual(factRow(rows, 'price'), { element: 'price', state: 'NOT_MENTIONED', found: [] });
});

test('a price in the post is a mismatch when no tier has a numeric price', () => {
  for (const prices of [[], ['Liên hệ']]) {
    const rows = brandFactCheck({ profile, display: allAlways, prices, post: 'Chỉ 99k hôm nay' });
    assert.deepEqual(factRow(rows, 'price'), { element: 'price', state: 'MISMATCH', found: ['99k'] }, JSON.stringify(prices));
  }
});

test('abbreviated prices match tier prices written with a unit or as a bare grouped number', () => {
  for (const tier of ['50.000đ', '50.000']) {
    const rows = brandFactCheck({ profile, display: allAlways, prices: [tier], post: 'Chỉ 50k hôm nay' });
    assert.deepEqual(factRow(rows, 'price'), { element: 'price', state: 'MATCH', found: ['50k'] }, tier);
  }
});

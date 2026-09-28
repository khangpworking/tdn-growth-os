import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BRAND_ELEMENTS,
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

const rules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;

const profile = {
  brandName: 'Synthetic Brand',
  tagline: 'A useful tagline',
  hotline: '0900 123 456',
  website: 'https://brand.example',
  fanpage: 'https://facebook.com/synthetic',
  address: '12 Example Street',
};

const table: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  SALES: rules.sales,
  TRUST: rules.trust,
  EDUCATION: rules.education,
  ENTERTAINMENT: rules.entertainment,
  ENGAGEMENT: rules.engagement,
};

test('047 §5 defaults resolve every purpose cell exactly', () => {
  for (const [kind, expected] of Object.entries(table)) {
    const kinds = purposeKinds([kind], () => undefined);
    assert.deepEqual(kinds, [kind]);
    assert.deepEqual(resolveBrandLevels(rules, kinds), expected);
    assert.deepEqual(resolveCaptionDisplay(resolveBrandLevels(rules, kinds)), {
      name: expected.name, tagline: expected.tagline, hotline: expected.hotline, web: expected.web, address: expected.address,
    });
  }
});

test('custom tags use displayLike and highest wins across all brand elements', () => {
  assert.deepEqual(purposeKinds(['tag:trust-tag'], (id) => id === 'trust-tag' ? 'TRUST' : undefined), ['TRUST']);
  const levels = resolveBrandLevels(rules, purposeKinds(['EDUCATION', 'SALES', 'ENTERTAINMENT'], () => undefined));
  for (const element of BRAND_ELEMENTS) {
    const expected = element === 'name' || element === 'logo' || element === 'hotline' || element === 'web' ? 'ALWAYS' : 'OPTIONAL';
    assert.equal(levels[element], expected, element);
  }
  assert.deepEqual(resolveCaptionDisplay(levels, { tagline: 'ALWAYS', address: 'HIDDEN' }), {
    name: 'ALWAYS', tagline: 'ALWAYS', hotline: 'ALWAYS', web: 'ALWAYS', address: 'HIDDEN',
  });
  assert.deepEqual(resolvePosterDisplay(levels, true, { hotline: false, logo: false }), {
    name: true, logo: false, tagline: true, hotline: false, web: true, address: false,
  });
  assert.deepEqual(resolvePosterDisplay(levels, false), {
    name: true, logo: false, tagline: true, hotline: true, web: true, address: false,
  });
});

test('hidden values are absent from model bundles unless the owner overrides them', () => {
  const levels = resolveBrandLevels(rules, ['ENTERTAINMENT']);
  const hiddenCaption = resolveCaptionDisplay(levels);
  const hiddenPoster = resolvePosterDisplay(levels, true);
  assert.deepEqual(captionBrandContext(profile, hiddenCaption), { name: profile.brandName, mention_required: [] });
  assert.deepEqual(posterBrandData(profile, hiddenPoster), { brand_name: profile.brandName });

  const caption = resolveCaptionDisplay(levels, { tagline: 'ALWAYS', web: 'ALWAYS' });
  const poster = resolvePosterDisplay(levels, true, { tagline: true, web: true });
  assert.deepEqual(captionBrandContext(profile, caption), { name: profile.brandName, tagline: profile.tagline, mention_required: ['tagline'] });
  assert.deepEqual(posterBrandData(profile, poster), { brand_name: profile.brandName, tagline: profile.tagline, website: profile.website, fanpage: profile.fanpage });
});

test('contact footer has stable order and caption bytes stay identical across versions', () => {
  const display = { name: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'ALWAYS' } as const;
  const footer = captionFooter(profile, display);
  assert.equal(footer, 'Hotline: 0900 123 456\nWebsite: https://brand.example\nFanpage: https://facebook.com/synthetic\nĐịa chỉ: 12 Example Street');
  const firstPost = captionText('First synthetic post', footer);
  const secondPost = captionText('Second synthetic post', footer);
  assert.equal(firstPost.slice(firstPost.indexOf('\n\n') + 2), secondPost.slice(secondPost.indexOf('\n\n') + 2));
  assert.equal(captionText('No footer', ''), 'No footer');
});

test('invalid purposes fail closed', () => {
  assert.throws(() => purposeKinds([], () => undefined), ContentDisplayRuleError);
  assert.throws(() => purposeKinds(['UNKNOWN'], () => undefined), ContentDisplayRuleError);
  assert.throws(() => purposeKinds(['tag:missing'], () => undefined), ContentDisplayRuleError);
  assert.throws(() => resolveBrandLevels(rules, []), ContentDisplayRuleError);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentPosterPromptError, POSTER_MAX_REFERENCES, buildPosterPrompt, logoInstruction, planPosterReferences } from '../../src/modules/flow/content-poster-prompt.js';

const layer = '{{RATIO_LABEL}} {{CANVAS_WIDTH}}x{{CANVAS_HEIGHT}} {{LAYOUT_PROFILE}} {{CAPTION_CONTENT}} {{LOGO_INSTRUCTION}} {{BRAND_JSON_LINE}}';

test('one-slot poster plan sends the first product photo and never displaces it with the logo', () => {
  assert.deepEqual(POSTER_MAX_REFERENCES, { 'gpt-image-2': 1, 'gemini-3.1-flash-image': 1 });
  assert.deepEqual(planPosterReferences('gpt-image-2', ['photo-1', 'photo-2'], true, 'logo-sha'), { photos: ['photo-1'] });
  assert.deepEqual(planPosterReferences('gemini-3.1-flash-image', [], true, 'logo-sha'), { photos: [], logo: 'logo-sha' });
  assert.deepEqual(planPosterReferences('gpt-image-2', [], false, 'logo-sha'), { photos: [] });
});

test('logo instruction is explicit for supplied, absent and disabled logos', () => {
  assert.match(logoInstruction({ photos: ['photo-1'] }, true), /product photo/iu);
  assert.match(logoInstruction({ photos: [], logo: 'logo-sha' }, true), /brand logo/iu);
  assert.match(logoInstruction({ photos: [] }, true), /small text wordmark/iu);
  assert.match(logoInstruction({ photos: [] }, false), /Do not render any logo/iu);
});

test('poster prompt fills every layer placeholder with pinned values', () => {
  const prompt = buildPosterPrompt({
    creativeText: 'Make a synthetic poster.', layerText: layer, format: 'portrait', captionPost: 'Caption text',
    brandData: { brand_name: 'Synthetic Brand' }, plan: { photos: ['photo-1'] }, logoOn: false,
  });
  assert.match(prompt, /Portrait 4:5/);
  assert.match(prompt, /1088x1360/);
  assert.match(prompt, /"Caption text"/);
  assert.match(prompt, /Synthetic Brand/);
});

test('poster prompt preserves template-like caption and brand data byte-for-byte', () => {
  const captionPost = 'Giữ nguyên {{LOGO_INSTRUCTION}}, {{PROMO_CODE}}, dấu ", gạch \\ và emoji 🐈\nDòng hai';
  const brandName = 'Nhãn {{RATIO_LABEL}} {{PROMO_CODE}}';
  const prompt = buildPosterPrompt({
    creativeText: 'Make a synthetic poster.', layerText: layer, format: 'square', captionPost,
    brandData: { brand_name: brandName }, plan: { photos: [] }, logoOn: false,
  });
  assert.ok(prompt.includes(JSON.stringify(captionPost)));
  assert.ok(prompt.includes(JSON.stringify({ brand_name: brandName })));
});

test('missing, repeated, unknown or malformed layer placeholders fail before rendering data', () => {
  const invalidLayers = [
    layer.replace('{{CAPTION_CONTENT}}', ''),
    `${layer} {{CAPTION_CONTENT}}`,
    `${layer} {{NOT_FILLED}}`,
    `${layer} {{lowercase}}`,
    `${layer} {{NOT-FILLED}}`,
    `${layer} {{A1}}`,
    `${layer} {{ NOT_FILLED }}`,
    `${layer} {{NOT_CLOSED`,
    `${layer} NOT_OPEN}}`,
  ];
  for (const layerText of invalidLayers) {
    assert.throws(() => buildPosterPrompt({
      creativeText: 'x', layerText, format: 'square', captionPost: '{{PROMO_CODE}}', brandData: {}, plan: { photos: [] }, logoOn: false,
    }), ContentPosterPromptError);
  }
});

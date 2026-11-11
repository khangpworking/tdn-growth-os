import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PACKAGE_BATCH_LIMIT,
  captionDisplayOf,
  captionFooter,
  emptyRowDraft,
  manualPostBlocker,
  packageCallSummary,
  packageCreateBlocker,
  packageCreateRequest,
  packageRunPlan,
  posterDisplayOf,
  resolveLevels,
  type CaptionSettings,
  type PackageRowDraft,
  type PosterSettings,
} from '../src/package-data-source';

/** Edge cases for the Caption & Poster create form, run plan, manual edit limit and brand display mirror. */

const angleOneId = '66666666-6666-4666-8666-0000000000a2';
const photoSha = 'a'.repeat(64);
const caption: CaptionSettings = { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' };
const poster: PosterSettings = { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', includeLogo: true, referenceMediaSha256s: [photoSha] };
const rowIds = (count: number) => Array.from({ length: count }, (_, index) => emptyRowDraft(`66666666-6666-4666-8666-${(100 + index).toString(16).padStart(12, '0')}`));
const ready = { writesAvailable: true, campaignDeleted: false, insightLocked: true, rows: [emptyRowDraft(angleOneId)], caption, poster };
const freestyle = (creativeText: string) => ({ source: 'FREESTYLE' as const, creativeText });

const level = (value: 'ALWAYS' | 'OPTIONAL' | 'HIDDEN') => ({ name: value, logo: value, tagline: value, hotline: value, web: value, address: value });
const uniformRules = (value: 'ALWAYS' | 'OPTIONAL' | 'HIDDEN') => ({
  sales: level(value), trust: level(value), education: level(value), entertainment: level(value), engagement: level(value),
});

test('create blocker accepts the exact limits: 20 angles, a 12000-character prompt and one reference', () => {
  assert.equal(packageCreateBlocker({ ...ready, rows: rowIds(PACKAGE_BATCH_LIMIT) }), null);
  assert.equal(packageCreateBlocker({ ...ready, caption: { ...caption, prompt: freestyle('x'.repeat(12_000)) } }), null);
  assert.equal(packageCreateBlocker({ ...ready, caption: { ...caption, prompt: freestyle(`  ${'x'.repeat(12_000)}\n `) } }), null);
  assert.equal(packageCreateBlocker({ ...ready, rows: [{ ...emptyRowDraft(angleOneId), references: [photoSha] }] }), null);
  assert.equal(packageCreateBlocker({ ...ready, rows: [{ ...emptyRowDraft(angleOneId), references: [] }] }), null);
});

test('create blocker counts prompt characters, not UTF-16 units', () => {
  assert.equal(packageCreateBlocker({ ...ready, poster: { ...poster, prompt: freestyle('🎨'.repeat(12_000)) } }), null);
  assert.equal(packageCreateBlocker({ ...ready, poster: { ...poster, prompt: freestyle('\u1EC7'.repeat(12_000)) } }), null);
  assert.equal(packageCreateBlocker({ ...ready, poster: { ...poster, prompt: freestyle('🎨'.repeat(12_001)) } }), 'Prompt tự do cho Poster tối đa 12000 ký tự.');
});

test('create blocker reports OWNER first and the Caption prompt before the Poster prompt', () => {
  assert.equal(packageCreateBlocker({ writesAvailable: false, campaignDeleted: true, insightLocked: false, rows: [], caption, poster }), 'Cần mở khóa OWNER để tạo Caption & Poster.');
  const blankBoth = { ...ready, caption: { ...caption, prompt: freestyle(' \n') }, poster: { ...poster, prompt: freestyle('\t') } };
  assert.equal(packageCreateBlocker(blankBoth), 'Nhập nội dung prompt tự do cho Caption.');
  assert.equal(packageCreateBlocker({ ...ready, poster: { ...poster, prompt: freestyle('   ') } }), 'Nhập nội dung prompt tự do cho Poster.');
  assert.equal(packageCreateBlocker({ ...ready, rows: rowIds(PACKAGE_BATCH_LIMIT + 1), poster: { ...poster, referenceMediaSha256s: [photoSha, photoSha] } }), 'Một lượt tối đa 20 góc.');
});

test('manual caption limit counts characters and rejects whitespace-only posts', () => {
  assert.equal(manualPostBlocker('x'.repeat(4000)), null);
  assert.equal(manualPostBlocker('😀'.repeat(4000)), null);
  assert.equal(manualPostBlocker('\u1EC7'.repeat(4000)), null);
  assert.match(manualPostBlocker('😀'.repeat(4001))!, /4000/);
  assert.equal(manualPostBlocker(' \n\t '), 'Nội dung Caption không được để trống.');
});

test('create request trims freestyle prompts, copies arrays and sends an explicit empty row reference list', () => {
  const batchPoster: PosterSettings = { ...poster, prompt: freestyle('  Poster tối giản  ') };
  const sameAsBatch: PackageRowDraft = { ...emptyRowDraft(angleOneId), style: 'PROFESSIONAL', length: 'MEDIUM', references: [] };
  const request = packageCreateRequest({ caption: { ...caption, prompt: freestyle('\n Viết ngắn gọn ') }, poster: batchPoster, rows: [sameAsBatch] }, 'request-edge');
  assert.deepEqual(request.caption.prompt, { source: 'FREESTYLE', creativeText: 'Viết ngắn gọn' });
  assert.deepEqual(request.poster.prompt, { source: 'FREESTYLE', creativeText: 'Poster tối giản' });
  assert.deepEqual(request.rows, [{ angleId: angleOneId, poster: { referenceMediaSha256s: [] } }]);
  assert.notEqual(request.poster.referenceMediaSha256s, batchPoster.referenceMediaSha256s);
  assert.deepEqual(request.poster.referenceMediaSha256s, [photoSha]);
  assert.notEqual(request.rows[0]!.poster!.referenceMediaSha256s, sameAsBatch.references);
});

test('run plan: empty batch makes no ids, each package runs Caption before Poster, ids are unique', () => {
  let made = 0;
  const newId = () => `66666666-6666-4666-8666-${(++made).toString(16).padStart(12, '0')}`;
  assert.deepEqual(packageRunPlan([], ['CAPTION', 'POSTER'], newId), []);
  assert.equal(made, 0);

  const packages = [{ packageId: 'p1', code: 'A1·1' }, { packageId: 'p2', code: 'A1·2' }, { packageId: 'p3', code: 'A2·1' }];
  const plan = packageRunPlan(packages, ['CAPTION', 'POSTER'], newId);
  assert.deepEqual(plan.map((call) => `${call.packageId}:${call.part}`), ['p1:CAPTION', 'p1:POSTER', 'p2:CAPTION', 'p2:POSTER', 'p3:CAPTION', 'p3:POSTER']);
  assert.equal(new Set(plan.map((call) => call.request.requestId)).size, 6);
  for (const call of plan) {
    assert.equal(call.request.plannedCallCount, 6);
    assert.equal('retryOfAttemptId' in call.request, false);
  }
  assert.equal(packageCallSummary(1, ['POSTER']), '1 Poster');
  assert.equal(packageCallSummary(PACKAGE_BATCH_LIMIT, ['CAPTION', 'POSTER']), '20 Caption + 20 Poster');
});

test('display mirror: OPTIONAL shows identity only, poster override is final, footer skips missing values', () => {
  assert.deepEqual(posterDisplayOf(resolveLevels(uniformRules('OPTIONAL'), ['TRUST']), true), { name: true, logo: true, tagline: true, hotline: false, web: false, address: false });
  assert.equal(posterDisplayOf(resolveLevels(uniformRules('HIDDEN'), ['SALES']), false, { logo: true }).logo, true);
  assert.equal(posterDisplayOf(resolveLevels(uniformRules('ALWAYS'), ['SALES']), false).logo, false);

  const always = captionDisplayOf(resolveLevels(uniformRules('ALWAYS'), ['SALES']));
  assert.equal(captionFooter({ brandName: 'Synthetic Brand' }, always), '');
  assert.equal(captionFooter({ brandName: 'Synthetic Brand', fanpage: 'facebook.com/synthetic' }, always), 'Fanpage: facebook.com/synthetic');
  const hotlineHidden = captionDisplayOf(resolveLevels(uniformRules('ALWAYS'), ['SALES']), { hotline: 'HIDDEN' });
  assert.equal(captionFooter({ brandName: 'Synthetic Brand', hotline: '0900 000 000' }, hotlineHidden), '');
});

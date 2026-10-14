import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { fallbackCoverJpeg } from '../../src/modules/analysis/research-automation/cover-image-codec.js';
import { MARKET_COVER_MODEL, buildMarketCover, marketCoverAlt, marketCoverKeyword, marketCoverPrompt, verifyMarketCoverRecord,
  type MarketCoverAi } from '../../src/modules/analysis/research-automation/market-cover.js';
import { providerNameViolations, visibleTextViolations } from '../helpers/report-visible-text.js';
import { syntheticPng } from '../helpers/synthetic-png.js';

const png = syntheticPng(1536, 1024, 3, (x, y) => [200, (x + y) & 255, 120]);
const spy = (result: () => Promise<{ bytes: Buffer; model: typeof MARKET_COVER_MODEL }>) => {
  const calls: string[] = [];
  const ai: MarketCoverAi = { generate: async prompt => { calls.push(prompt); return result(); } };
  return { ai, calls };
};

test('keyword is sanitised before it reaches the prompt or alt text', () => {
  assert.equal(marketCoverKeyword('  thạch\u0000 "dừa" <b>`x`</b>\n “túi”  '), 'thạch dừa b x /b túi');
  assert.equal([...marketCoverKeyword('ạ'.repeat(200))].length, 120);
  assert.equal(marketCoverKeyword('é'), 'é');
  const prompt = marketCoverPrompt('bình "giữ" nhiệt');
  assert.ok(prompt.includes('"bình giữ nhiệt"'));
  assert.match(prompt, /No text, letters, numbers, logos/);
  assert.ok(marketCoverPrompt('  ').includes('"everyday consumer goods"'));
});

test('alt text is truthful, generic and passes the reader-text and provider-name checks', () => {
  const ai = marketCoverAlt('bình giữ nhiệt', 'ai-generated'), fallback = marketCoverAlt('bình giữ nhiệt', 'fallback');
  assert.equal(ai, 'Minh hoạ chung do AI tạo cho nhóm sản phẩm “bình giữ nhiệt”; không phải ảnh sản phẩm hoặc gian hàng cụ thể.');
  assert.equal(fallback, 'Hình trang trí chung cho báo cáo; không phải ảnh sản phẩm.');
  for (const text of [ai, fallback]) {
    assert.deepEqual(visibleTextViolations(text), []);
    const html = `<!doctype html><html><body><p>${text}</p><img alt="${text}"></body></html>`;
    assert.deepEqual(providerNameViolations(html), []);
    assert.ok(lintVisibleReportText(html).every(check => check.ok), JSON.stringify(lintVisibleReportText(html).filter(check => !check.ok)));
  }
});

test('buildMarketCover falls back with a reason and never claims AI provenance on failure', async () => {
  const none = await buildMarketCover({ keyword: 'thạch dừa' });
  assert.equal(none.record.provenance, 'fallback'); assert.equal(none.record.fallbackReason, 'COVER_AI_NOT_CONFIGURED'); assert.equal(none.record.model, null);
  assert.deepEqual(none.bytes, fallbackCoverJpeg());
  assert.equal(none.record.imageSha256, createHash('sha256').update(none.bytes).digest('hex'));
  verifyMarketCoverRecord(none.record);
  const thrown = await buildMarketCover({ keyword: 'x', ai: { generate: async () => { throw new Error('boom'); } } });
  assert.equal(thrown.record.fallbackReason, 'COVER_AI_FAILED');
  const junk = await buildMarketCover({ keyword: 'x', ai: spy(async () => ({ bytes: Buffer.from('junk'), model: MARKET_COVER_MODEL })).ai });
  assert.equal(junk.record.fallbackReason, 'COVER_AI_INVALID_IMAGE');
  const wrongModel = await buildMarketCover({ keyword: 'x', ai: { generate: async () => ({ bytes: png, model: 'other' as typeof MARKET_COVER_MODEL }) } });
  assert.equal(wrongModel.record.fallbackReason, 'COVER_AI_FAILED');
  const slow = await buildMarketCover({ keyword: 'x', timeoutMs: 10, ai: { generate: () => new Promise(() => undefined) } });
  assert.equal(slow.record.fallbackReason, 'COVER_AI_FAILED');
});

test('buildMarketCover returns an AI JPEG record and reuses a verified prior cover without calling the model', async () => {
  const first = spy(async () => ({ bytes: png, model: MARKET_COVER_MODEL }));
  const cover = await buildMarketCover({ keyword: 'thạch dừa', ai: first.ai });
  assert.equal(first.calls.length, 1); assert.equal(first.calls[0], marketCoverPrompt('thạch dừa'));
  assert.deepEqual(verifyMarketCoverRecord(cover.record), { contractVersion: 'automation-market-cover-v1', provenance: 'ai-generated', model: 'gpt-image-2',
    promptVersion: 'market-cover-prompt-v1', promptSha256: createHash('sha256').update(marketCoverPrompt('thạch dừa')).digest('hex'),
    imageSha256: createHash('sha256').update(cover.bytes).digest('hex'), mime: 'image/jpeg', byteSize: cover.bytes.byteLength, width: 1024, height: 576 });
  assert.deepEqual([cover.bytes[0], cover.bytes[1]], [0xff, 0xd8]);
  const second = spy(async () => ({ bytes: png, model: MARKET_COVER_MODEL }));
  const reused = await buildMarketCover({ keyword: 'thạch dừa', ai: second.ai, reuse: cover });
  assert.equal(second.calls.length, 0); assert.deepEqual(reused, cover);
  await buildMarketCover({ keyword: 'bình giữ nhiệt', ai: second.ai, reuse: cover });
  assert.equal(second.calls.length, 1, 'a different keyword prompt never reuses');
  await buildMarketCover({ keyword: 'thạch dừa', ai: second.ai, reuse: { record: cover.record, bytes: Buffer.from('tampered') } });
  assert.equal(second.calls.length, 2, 'tampered bytes never reuse');
  const fallback = await buildMarketCover({ keyword: 'thạch dừa' });
  await buildMarketCover({ keyword: 'thạch dừa', ai: second.ai, reuse: fallback });
  assert.equal(second.calls.length, 3, 'a fallback is retried when AI is configured');
});

test('verifyMarketCoverRecord is strict', async () => {
  const { record } = await buildMarketCover({ keyword: 'x' });
  for (const change of [{ extra: 1 }, { model: 'gpt-image-2' }, { fallbackReason: 'NOPE' }, { byteSize: 600_001 }, { width: 2048 }, { mime: 'image/png' },
    { provenance: 'licensed' }, { imageSha256: 'A'.repeat(64) }])
    assert.throws(() => verifyMarketCoverRecord({ ...record, ...change }), TypeError);
  const { fallbackReason: _drop, ...noReason } = record;
  assert.throws(() => verifyMarketCoverRecord({ ...noReason, provenance: 'ai-generated', model: null }), TypeError);
  assert.throws(() => verifyMarketCoverRecord({ ...noReason, provenance: 'ai-generated', model: 'gpt-image-2', fallbackReason: 'COVER_AI_FAILED' }), TypeError);
});

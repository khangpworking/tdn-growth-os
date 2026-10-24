import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { brandLabelOk, hostDenied } from '../../src/modules/analysis/research-automation/google-ads-lane.js';
import { metaTextReportSafe } from '../../src/modules/analysis/research-automation/meta-ad-report.js';
import { parseTikTokTopAds, tiktokTopAdsUrl, validTikTokTopAds } from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import { webTextHidden } from '../../src/modules/analysis/research-automation/web-page-type.js';

// Synthetic text only. Freeze pre-PR2 decisions at the paid callers, including stored-output validation.
const accepted = ['Điện Quang', 'Duy Tân', 'Sunhouse', 'Shopee', 'TikTok Shop', 'vnexpress.net'];
const rejected = ['Kalodata', 'K a l o d a t a', 'googleplay', 'site:', 'gpt-4o', 'TradeInt'];

function storedTikTok(text: string) {
  const raw = `Ad caption: ${text}\n`;
  const start = Buffer.byteLength('Ad caption: ');
  const url = tiktokTopAdsUrl('bình giữ nhiệt');
  return {
    profile: 'tiktok-top-ads-visible-text-v1', status: 'OK', stop: null, reasonVi: null,
    keyword: 'bình giữ nhiệt', opens: 1,
    evidence: { packageId: 'synthetic-name-pins', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) },
    reads: [{ requestedUrl: url, finalUrl: url, outcome: 'READ', stop: null, retained: true,
      textSha256: createHash('sha256').update(raw).digest('hex'), textBytes: Buffer.byteLength(raw), readAt: '2026-10-24T00:00:00.000Z' }],
    cards: [{ read: 0, caption: { text, span: { start, end: start + Buffer.byteLength(text) } },
      account: null, industry: null, objective: null, likes: null }],
    droppedCards: 0, refusedCards: 0,
  };
}

const lanes = [
  { name: 'meta-auto brandLabelOk', accepted, rejected, check: (text: string, ok: boolean) => assert.equal(brandLabelOk(text), ok, text) },
  { name: 'TikTok parsed and stored caption', accepted, rejected, check: (text: string, ok: boolean) => {
    const parsed = parseTikTokTopAds(`Ad caption: ${text}\n`);
    assert.ok(parsed.ok, text);
    assert.deepEqual(parsed.read.cards.map(card => card.caption.text), ok ? [text] : [], text);
    assert.equal(parsed.read.refusedCards, ok ? 0 : 1, text);
    assert.equal(validTikTokTopAds(storedTikTok(text)), ok, `stored caption: ${text}`);
  } },
  { name: 'Google Ads hostDenied',
    accepted: ['dienquang.com', 'duytan.com', 'sunhouse.com.vn', 'kangaroo.vn', 'locknlock.vn', 'rangdong.com.vn'],
    rejected: [...rejected, 'vnexpress.net', 'shopee.vn', 'ads.tiktok.com'],
    check: (text: string, ok: boolean) => assert.equal(hostDenied(text), !ok, text) },
  { name: 'Meta ad text', accepted, rejected, check: (text: string, ok: boolean) => assert.equal(metaTextReportSafe(text), ok, text) },
  { name: 'web title text', accepted, rejected, check: (text: string, ok: boolean) => assert.equal(webTextHidden(text), !ok, text) },
];

for (const lane of lanes) {
  for (const [label, rows, ok] of [['accepts', lane.accepted, true], ['rejects', lane.rejected, false]] as const) {
    test(`paid name pin: ${lane.name} ${label} pre-PR2 inputs`, () => {
      for (const text of rows) lane.check(text, ok);
    });
  }
}

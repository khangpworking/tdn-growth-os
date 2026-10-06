import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import {
  Narrator, ReaderReportGateError, ReaderReportInputError, computeReaderReportData, cover, makeExhibits, page,
  publishReaderReport, section, verifyReaderReportInput, type ReaderReportData,
} from '../../src/modules/analysis/reader-report/index.js';

const row = (i: number, platform: 'shopee' | 'tiktok', shop: string, rev: number, units: number, brand: string, title: string) =>
  ({ i, platform, listing: `L${i}`, shop, cat: 'Bình', rev, units, asp: rev / units, brand, title });
const input = (): ReaderReportInput => ({
  contractVersion: '1.0.0',
  profile: {
    slug: 'synthetic', product: 'Bình thử', status: 'proposed',
    segments: { S1: 'Bình nhỏ', S2: 'Bình lớn', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ', S2: 'Lớn' },
    core: ['S1', 'S2'], non: ['N1'],
    measure: { unit: 'ml', re: '(\\d+(?:\\.\\d+)?)\\s*(ml|lít)', toBase: { ml: 1, 'lít': 1000 } },
    rules: [{ seg: 'N1', when: { titleRe: 'nước giặt' } }, { seg: 'S2', when: { measureGte: 1000 } }, { seg: 'S1', when: {} }],
    signals: [['Quà tặng', 'quà']],
    brandAlias: { 'x shop': 'X' },
  },
  platforms: ['shopee', 'tiktok'],
  rows: [
    row(0, 'shopee', 'A', 600, 6, 'X', 'Bình nhỏ 500ml'),
    row(1, 'shopee', 'A', 300, 3, 'x shop', 'Bình lớn 1 lít'),
    row(2, 'shopee', 'B', 100, 1, '(không ghi)', 'Bình nhỏ làm quà'),
    row(3, 'tiktok', 'C', 400, 4, 'X', 'Bình nhỏ 350ml'),
    row(4, 'tiktok', 'D', 50, 5, 'Y', 'Nước giặt tặng bình'),
  ],
  source: {
    measurementPeriod: { start: '2025-10-05', end: '2026-10-02' },
    rowCap: 5000,
    displayedHeadlines: { revenueVnd: 2000, soldListings: 10, shops: 6, units: 30 },
    platformBreakdown: { shopee: { displayedRevenueVnd: 1250 }, tiktok: { displayedRevenueVnd: 500 } },
  },
});

function render(d: ReaderReportData, narrator: Narrator, extra = ''): string {
  const { fig } = makeExhibits('Dữ liệu bán hàng ước tính.');
  const ids = ['M01', 'M02', 'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09', 'M10', 'M11', 'M12', 'M13'];
  const sections = ids.map((id, k) => section(id, `Mục ${k + 1}`,
    id === 'M01' ? narrator.nar('Lõi Shopee có {{shopee.core.n}} sản phẩm; tệp phủ {{src.cover.rev}} doanh thu trên màn hình nguồn.', id) + extra : 'Câu trả lời ngắn.',
    id === 'M12' ? '<p>Ba phương án là đề xuất, chờ chủ duyệt.</p>'
      : id === 'M01' ? fig('1.1', 'Doanh thu', 'tỷ đồng', '<svg class="kc"></svg>') : ''));
  return page({
    title: `Báo cáo thị trường – ${d.profile.product}`,
    coverHtml: cover(null, 'Shopee và TikTok Shop', ['Báo cáo thị trường', d.profile.product, 'Shopee và TikTok Shop']),
    intro: '<div class="box"><p>Phân loại là đề xuất, chờ duyệt.</p></div>', toc: ids.map(id => [id, id] as const), sections, foot: 'TDN.',
    fontCss: '',
  });
}

test('input contract computes per-platform scopes, both-platform totals and source coverage', () => {
  const d = computeReaderReportData(input());
  const B = d.bundle;
  assert.deepEqual(d.rows.map(r => r.seg), ['S1', 'S2', 'S1', 'S1', 'N1']);
  assert.equal(d.rows[1]!.brand, 'X', 'brand alias applied');
  assert.equal(B.v('shopee.core.rev'), 1000);
  assert.equal(B.v('tiktok.core.rev'), 400);
  assert.equal(B.v('both.core.rev'), 1400);
  assert.equal(B.v('both.non.n'), 1);
  assert.equal(B.v('src.shopee.cover'), 80);
  assert.equal(B.v('src.tiktok.cover'), 90);
  assert.equal(B.v('src.cover.rev'), 72.5);
  assert.equal(B.v('src.cover.listings'), 50);
  assert.equal(B.v('src.tiktok.rows'), 2);
  assert.equal(input().rows[1]!.brand, 'x shop', 'input rows are not mutated');
});

test('one platform builds without both-platform totals', () => {
  const one = input();
  one.platforms = ['shopee'];
  one.rows = one.rows.filter(r => r.platform === 'shopee') as ReaderReportInput['rows'];
  const d = computeReaderReportData(one);
  assert.equal(d.bundle.has('both.core.rev'), false);
  assert.equal(d.bundle.has('src.tiktok.cover'), false);
});

test('input rejects broken contracts with plain messages', () => {
  const cases: [string, (x: any) => void, RegExp][] = [
    ['schema', x => { x.rows[0].rev = -1; }, /sai khuôn/],
    ['segment', x => { x.profile.rules[0].seg = 'Z9'; }, /chưa khai báo/],
    ['regex', x => { x.profile.signals[0][1] = '('; }, /mẫu chữ không hợp lệ/],
    ['duplicate', x => { x.rows[1].i = 0; }, /lặp số thứ tự/],
    ['platform', x => { x.platforms = ['shopee']; }, /không có trong danh sách sàn/],
    ['breakdown', x => { delete x.source.platformBreakdown.tiktok; }, /thiếu số màn hình nguồn/],
    ['period', x => { x.source.measurementPeriod.start = '2026-12-01'; }, /kỳ đo/],
    ['extra field', x => { x.rows[0].provider = 'x'; }, /sai khuôn/],
  ];
  for (const [name, mutate, re] of cases) {
    const x = input();
    mutate(x);
    assert.throws(() => verifyReaderReportInput(x), (e: unknown) => e instanceof ReaderReportInputError && re.test(e.message), name);
  }
});

test('publish stores html, metrics and claims deterministically and fails closed', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-report-'));
  try {
    const store = new ContentAddressedArtifactStore(root);
    const build = async () => {
      const d = computeReaderReportData(input());
      const narrator = new Narrator(d.bundle);
      return publishReaderReport(store, { html: render(d, narrator), narrator });
    };
    const a = await build(), b = await build();
    assert.equal(a.html.sha256, b.html.sha256);
    assert.equal(a.claims.sha256, b.claims.sha256);
    const claims = JSON.parse(await fs.readFile(a.claims.absolutePath, 'utf8'));
    assert.equal(claims.htmlSha256, a.html.sha256);
    assert.deepEqual(claims.usedMetricIds, ['shopee.core.n', 'src.cover.rev']);
    const metrics = JSON.parse(await fs.readFile(a.metrics.absolutePath, 'utf8'));
    assert.ok(metrics.some((m: { id: string; usedInText: boolean }) => m.id === 'src.cover.rev' && m.usedInText));

    const d = computeReaderReportData(input());
    const narrator = new Narrator(d.bundle);
    const html = render(d, narrator, narrator.nar(' Có 7 gian hàng.', 'M01b'));
    await assert.rejects(publishReaderReport(store, { html, narrator }),
      (e: unknown) => e instanceof ReaderReportGateError && e.hardcoded.length === 1 && e.notInBundle.length === 0);
    const d2 = computeReaderReportData(input());
    const n2 = new Narrator(d2.bundle);
    await assert.rejects(publishReaderReport(store, { html: render(d2, n2).replace('<title>', '<title>Metric '), narrator: n2 }),
      (e: unknown) => e instanceof ReaderReportGateError && e.lint.some(r => !r.ok && r.rule.startsWith('F1')));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

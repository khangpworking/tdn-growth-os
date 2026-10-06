import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { checkReaderRender, launchReaderBrowser, readerBrowserPath } from '../helpers/reader-render-check.js';

// I5: the reader report is checked in a real Chromium at desktop 1280, phone
// 375 and A4 print. Synthetic rows only; long names stress wrapping. Without a
// browser the test is skipped, unless TDN_REQUIRE_BROWSER=1 (Fedora runs).
// READER_RENDER_OUT keeps the screenshots and the PDF for a human look.

type P = 'shopee' | 'tiktok';
const titles = [
  'Bình giữ nhiệt inox 304 dung tích 500ml quà tặng sinh nhật cao cấp kèm túi vải và ống hút',
  'Bình lớn 1 lít', 'Bình nhỏ 350ml', 'Ly giữ nhiệt 600ml',
  'Nước giặt tặng bình', 'BìnhGiữNhiệtSiêuDàiKhôngCóDấuCáchĐểThửXuốngDòng500ml',
];
const rows = (platforms: readonly P[]) => platforms.flatMap((platform, k) => Array.from({ length: 40 }, (_, j) => {
  const i = k * 100 + j, rev = (41 - j) * 1_000_000 * (k ? 3 : 7), units = 10 + j;
  return {
    i, platform, listing: `L${i}`, shop: `shop${j % 9}`, cat: 'Bình', rev, units, asp: rev / units,
    shopName: j % 9 === 0 ? 'Gian hàng chính hãng phân phối độc quyền khu vực miền Nam' : `Gian hàng ${String.fromCharCode(65 + (j % 9))}`,
    brand: j % 3 ? 'Thương hiệu X' : '(không ghi)', title: titles[j % titles.length]!,
    start: j % 4 === 0 ? '2026-01-15' : j % 4 === 1 ? '2024-03-01' : j % 4 === 2 ? '1970-01-01' : null,
  };
}));
const input = (platforms: readonly P[]): ReaderReportInput => ({
  contractVersion: '1.0.0',
  profile: {
    slug: 'synthetic-render', product: 'Bình giữ nhiệt', status: 'proposed',
    segments: { S1: 'Bình nhỏ', S2: 'Bình lớn', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ', S2: 'Lớn' },
    core: ['S1', 'S2'], non: ['N1'],
    measure: { unit: 'ml', re: '(\\d+(?:\\.\\d+)?)\\s*(ml|lít)', toBase: { ml: 1, 'lít': 1000 } },
    rules: [{ seg: 'N1', when: { titleRe: 'nước giặt' }, why: 'Không phải bình' }, { seg: 'S2', when: { measureGte: 600 } }, { seg: 'S1', when: {} }],
    signals: [['Quà tặng', 'quà'], ['Giữ nhiệt', 'giữ nhiệt']],
    benchmark: { label: 'Bình ghi đúng 500 ml', measureRange: [450, 550] },
  },
  platforms: [...platforms] as ReaderReportInput['platforms'],
  rows: rows(platforms) as ReaderReportInput['rows'],
  source: {
    measurementPeriod: { start: '2025-10-05', end: '2026-10-02' },
    rowCap: 5000,
    displayedHeadlines: { revenueVnd: 9e9, soldListings: 120, shops: 30, units: 4000 },
    platformBreakdown: Object.fromEntries(platforms.map(p => [p, { displayedRevenueVnd: 4e9 }])),
  },
});
// 1x1 PNG: enough to exercise the cover layout without a real photo in the repo.
const COVER = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const options = {
  limitations: ['Phân loại sản phẩm chưa được chủ duyệt.', 'Tệp chỉ có tổng cả kỳ, chưa có số theo tháng.'],
  builtOn: '06/10/2026', cover: { bytes: COVER, mime: 'image/png' as const },
};

const noBrowser = readerBrowserPath() === null;
if (noBrowser && process.env.TDN_REQUIRE_BROWSER === '1') throw new Error('TDN_REQUIRE_BROWSER=1 but no Chromium was found.');

for (const platforms of [['shopee', 'tiktok'], ['shopee']] as const) {
  test(`reader report fits desktop, 375 px and A4 (${platforms.join(' + ')})`, { skip: noBrowser ? 'no Chromium on this machine' : false, timeout: 180_000 }, async () => {
    const built = await buildMarketReport(computeReaderReportData(input(platforms)), options);
    const keep = process.env.READER_RENDER_OUT;
    const outDir = keep ? path.join(keep, platforms.join('-')) : await fs.mkdtemp(path.join(os.tmpdir(), 'reader-render-'));
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, 'reader.html'), built.html);
    const browser = await launchReaderBrowser();
    try {
      const { views, pdfPages } = await checkReaderRender(browser, built.html, outDir);
      assert.deepEqual(views.map(v => v.view), ['desktop-1280', 'phone-375', 'print-a4']);
      for (const v of views) {
        assert.deepEqual(v.blockedRequests, [], `${v.view}: the page must not load anything from the network`);
        assert.deepEqual(v.errors, [], `${v.view}: script or console errors`);
        assert.ok(v.fontsLoaded, `${v.view}: a font failed to load`);
        assert.ok(v.scrollWidth <= v.width, `${v.view}: page scrolls sideways (${v.scrollWidth} > ${v.width})`);
        assert.deepEqual(v.overflow, [], `${v.view}: elements reach past the edge`);
      }
      assert.deepEqual(views.find(v => v.view === 'print-a4')!.clippedTables, [], 'A4: a table is wider than the printed page');
      assert.ok(pdfPages >= 2, `A4 PDF has ${pdfPages} pages`);
    } finally {
      await browser.close();
      if (!keep) await fs.rm(outDir, { recursive: true, force: true });
    }
  });
}

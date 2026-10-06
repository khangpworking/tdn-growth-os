import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import {
  READER_SECTION_ANCHORS, buildMarketReport, computeReaderReportData, lint, publishReaderReport, visibleText,
} from '../../src/modules/analysis/reader-report/index.js';

type P = 'shopee' | 'tiktok';
const titles = ['Bình nhỏ 500ml quà tặng', 'Bình lớn 1 lít', 'Bình nhỏ 350ml', 'Ly giữ nhiệt 600ml', 'Nước giặt tặng bình'];
const rows = (platforms: readonly P[]) => platforms.flatMap((platform, k) => Array.from({ length: 12 }, (_, j) => {
  const i = k * 100 + j, rev = (13 - j) * 1_000_000 * (k ? 3 : 7), units = 10 + j;
  return {
    i, platform, listing: `L${i}`, shop: `shop${j % 5}`, shopName: `Gian hàng ${String.fromCharCode(65 + (j % 5))}`, cat: 'Bình',
    rev, units, asp: rev / units, brand: j % 3 ? 'X' : '(không ghi)', title: titles[j % titles.length]!,
    start: j % 4 === 0 ? '2026-01-15' : j % 4 === 1 ? '2024-03-01' : j % 4 === 2 ? '1970-01-01' : null,
  };
}));
const input = (platforms: readonly P[] = ['shopee', 'tiktok']): ReaderReportInput => ({
  contractVersion: '1.0.0',
  profile: {
    slug: 'synthetic', product: 'Bình thử', status: 'proposed',
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
    displayedHeadlines: { revenueVnd: 2e9, soldListings: 40, shops: 12, units: 900 },
    platformBreakdown: Object.fromEntries(platforms.map(p => [p, { displayedRevenueVnd: 1e9 }])),
  },
});
const LIMITS = ['Phân loại sản phẩm chưa được chủ duyệt.', 'Tệp chỉ có tổng cả kỳ, chưa có số theo tháng.'];
const options = { limitations: LIMITS, builtOn: '06/10/2026', flint: false } as const;

async function withStore<T>(f: (store: ContentAddressedArtifactStore) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-template-'));
  try { return await f(new ContentAddressedArtifactStore(root)); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('two-platform market report passes every gate and is deterministic', async () => {
  await withStore(async store => {
    const build = async () => {
      const r = await buildMarketReport(computeReaderReportData(input()), options);
      return { r, pub: await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk }) };
    };
    const a = await build(), b = await build();
    assert.equal(a.pub.html.sha256, b.pub.html.sha256, 'same input gives the same html');
    assert.ok(a.pub.lint.every(x => x.ok), JSON.stringify(a.pub.lint.filter(x => !x.ok)));
    const vis = visibleText(a.r.html);
    for (const s of LIMITS) assert.ok(vis.includes(s), `limitation restated: ${s}`);
    for (const id of READER_SECTION_ANCHORS) assert.ok(a.r.html.includes(`<section id="${id}">`), id);
    assert.match(vis, /chờ chủ duyệt/);
    assert.match(vis, /TikTok Shop/);
    assert.equal(a.r.html.match(/<tr><td>\d+<\/td><td><span class="plat/g)?.length, 24, 'appendix lists every row');
    assert.ok(a.r.charts.length >= 5 && a.r.charts.every(c => c.engine === 'svg-fallback'));
  });
});

test('one-platform report has no second marketplace and still passes', async () => {
  await withStore(async store => {
    const r = await buildMarketReport(computeReaderReportData(input(['shopee'])), options);
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(x => x.ok));
    assert.doesNotMatch(visibleText(r.html), /TikTok/);
  });
});

test('approved profile and missing signals or benchmark still render', async () => {
  await withStore(async store => {
    const x = input();
    x.profile.status = 'approved';
    x.profile.signals = [];
    delete x.profile.benchmark;
    const r = await buildMarketReport(computeReaderReportData(x), { ...options, limitations: [] });
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(l => l.ok), JSON.stringify(pub.lint.filter(l => !l.ok)));
    assert.doesNotMatch(r.html, /Bảng 8\.2|Hình 5\.1/);
    assert.match(visibleText(r.html), /đã được chủ duyệt/);
  });
});

test('charts render through the chart engine without network', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network blocked in test'); }) as typeof fetch;
  try {
    const r = await buildMarketReport(computeReaderReportData(input()), { ...options, flint: true, cover: null });
    assert.deepEqual(r.charts.filter(c => c.engine !== 'flint'), []);
    assert.ok(lint(r.html, { sectionIds: READER_SECTION_ANCHORS }).every(x => x.ok));
  } finally {
    globalThis.fetch = fetch0;
  }
});

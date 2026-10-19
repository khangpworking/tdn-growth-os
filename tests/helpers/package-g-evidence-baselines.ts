import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import { G_CLOCK, G_SHAPES, gByteInput, gEvidenceInput, gTrade } from './package-g-evidence-fixture.js';

// Usage: node --import tsx tests/helpers/package-g-evidence-baselines.ts CHECKOUT OUTPUT_DIRECTORY
// CHECKOUT chooses the public builders and their complete dependency graph. It is never edited.
const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error('Expected checkout and output directory');
const own = (file: string) => import(pathToFileURL(resolve(checkout, file)).href);
const { buildResearchAutomationReport } = await own('src/modules/analysis/research-automation/reports.ts');
const { buildMarketReport, computeReaderReportData } = await own('src/modules/analysis/reader-report/index.ts');
const { auditMarket14 } = await own('src/modules/analysis/research-automation/market-14-rules.ts');
const { sync1ReaderFixture } = await own('tests/helpers/sync1-reader-fixture.ts');
const { DEFAULT_MARKET_PEER_RULE } = await own('src/modules/analysis/default-market-peers.ts');
await mkdir(output, { recursive: true });
mock.timers.enable({ apis: ['Date'], now: Date.parse(G_CLOCK) });
try {
  const raw = sync1ReaderFixture('1.4.0');
  raw.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const versioned = await buildMarketReport(computeReaderReportData(raw), {
    limitations: ['Nguồn bán hàng là số ước tính.'], builtOn: '19/10/2026', flint: false, comtrade: gTrade('G1'),
  });
  const builds = [
    ['legacy-market', buildResearchAutomationReport(await gByteInput(), 'MARKET').html],
    ['versioned-market', versioned.html],
    ['insight', buildResearchAutomationReport(await gByteInput(), 'INSIGHT').html],
  ] as const;
  for (const [name, html] of builds) {
    const bytes = Buffer.from(html);
    const filename = `package-g-evidence-${name}.html`;
    await writeFile(resolve(output, filename), bytes);
    console.log(`${filename} ${bytes.length} ${createHash('sha256').update(bytes).digest('hex')}`);
  }
  const audits: Record<string, unknown> = {};
  for (const shape of G_SHAPES) {
    const built = buildResearchAutomationReport(await gEvidenceInput(shape), 'MARKET');
    audits[shape] = auditMarket14(built.html.toString(), built.traceHtml?.toString(), { requireFlint: true })
      .map(({ rule, kind, ok }: { rule: string; kind: string; ok: boolean }) => ({ rule, kind, ok }));
  }
  await writeFile(resolve(output, 'package-g-evidence-main-audit.json'), JSON.stringify(audits, null, 2) + '\n');
} finally { mock.timers.reset(); }

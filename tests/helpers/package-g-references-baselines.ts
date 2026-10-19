import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { mock } from 'node:test';

// Usage: node --import tsx tests/helpers/package-g-references-baselines.ts CHECKOUT OUTPUT
// Imports CHECKOUT's own builders AND existing input helpers. Never edits CHECKOUT.
export const REFERENCE_BASE = 'a9fc87f0b93ed63381f40eb9cbdfdd4c66da241b';
export const REFERENCE_BASELINE_CLOCK = '2026-10-19T00:00:00.000Z';
export async function referenceBaselineBytes(checkout: string): Promise<Record<string, Buffer>> {
  const load = (relative: string) => import(pathToFileURL(resolve(checkout, relative)).href);
  const { buildResearchAutomationReport } = await load('src/modules/analysis/research-automation/reports.ts');
  const { businessByteInput } = await load('tests/helpers/package-r-business-byte-input.ts');
  const { buildMarketReport, computeReaderReportData } = await load('src/modules/analysis/reader-report/index.ts');
  const { sync1ReaderFixture, sync1Options } = await load('tests/helpers/sync1-reader-fixture.ts');
  const { DEFAULT_MARKET_PEER_RULE } = await load('src/modules/analysis/default-market-peers.ts');
  mock.timers.enable({ apis: ['Date'], now: Date.parse(REFERENCE_BASELINE_CLOCK) });
  try {
    const templateInput = { ...sync1ReaderFixture('1.4.0'), peerRule: DEFAULT_MARKET_PEER_RULE };
    const template = await buildMarketReport(computeReaderReportData(templateInput), sync1Options);
    return { 'legacy-market': buildResearchAutomationReport(businessByteInput(), 'MARKET').html,
      'market-template-v4': Buffer.from(template.html), insight: buildResearchAutomationReport(businessByteInput(), 'INSIGHT').html };
  } finally { mock.timers.reset(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [checkout, output] = process.argv.slice(2);
  assert.ok(checkout && output, 'CHECKOUT and OUTPUT required');
  assert.ok(!resolve(output).startsWith(resolve(checkout) + sep), 'output must be outside the source checkout');
  const pointer = (await readFile(resolve(checkout, '.git'), 'utf8')).trim().replace(/^gitdir: /u, '');
  assert.equal((await readFile(resolve(checkout, pointer, 'HEAD'), 'utf8')).trim(), REFERENCE_BASE);
  for (const name of ['TDN_CHROMIUM_PATH', 'TDN_RESEARCH_PDF_CHROMIUM', 'TDN_REQUIRE_BROWSER', 'TDN_BROWSER_EXECUTABLE', 'TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL']) {
    assert.equal(process.env[name], undefined, `${name} must be unset`);
  }
  globalThis.fetch = async () => { throw new Error('Network forbidden'); };
  await mkdir(output, { recursive: true });
  const bytes = await referenceBaselineBytes(checkout);
  const manifest: Record<string, { bytes: number; sha256: string; gzipSha256: string }> = {};
  for (const [name, html] of Object.entries(bytes)) {
    const compressed = gzipSync(html, { level: 9 });
    await writeFile(resolve(output, `${name}.html.gz`), compressed);
    manifest[name] = { bytes: html.length, sha256: createHash('sha256').update(html).digest('hex'),
      gzipSha256: createHash('sha256').update(compressed).digest('hex') };
  }
  await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ base: REFERENCE_BASE, clock: REFERENCE_BASELINE_CLOCK, files: manifest }, null, 2) + '\n');
  const { referenceInput, REFERENCE_SHAPES } = await import('./package-g-references-fixture.js');
  const { buildResearchAutomationReport } = await import(pathToFileURL(resolve(checkout, 'src/modules/analysis/research-automation/reports.ts')).href);
  for (const shape of REFERENCE_SHAPES) {
    const report = buildResearchAutomationReport(await referenceInput(shape), 'MARKET');
    const { citations, citationEntries } = report.semantic;
    await writeFile(resolve(output, `${shape}-citations.json`), JSON.stringify({ citations, citationEntries }, null, 2) + '\n');
  }
  console.log(JSON.stringify(manifest));
}

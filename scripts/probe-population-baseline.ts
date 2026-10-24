// Standalone harness for the S28 whole-population baseline: validates a built file, runs the lane read and the I02 block renderer
// with a synthetic Insight run context, and writes the block to <dir>/i02-block.html. No database, no network.
// Usage: npx tsx scripts/probe-population-baseline.ts --baseline <file.json> --out <dir>
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { checkPopulationBaseline, createPopulationBaselineSource, populationBaselineComparisons, populationBaselineDocument,
  populationBaselineSection, populationBaselineShares } from '../src/modules/analysis/research-automation/population-baseline.js';
import { findHiddenNames } from '../src/modules/analysis/report-language/hidden-names.js';

const round = (value: number): number => Math.round(value * 10) / 10;
try {
  const { values } = parseArgs({ options: { baseline: { type: 'string' }, out: { type: 'string' } }, strict: true });
  if (!values.baseline || !values.out) throw new Error('Usage: probe-population-baseline --baseline <file.json> --out <dir>');
  const file = path.resolve(values.baseline);
  if (!checkPopulationBaseline(JSON.parse(await fs.readFile(file, 'utf8')))) throw new Error('Baseline file does not match population-baseline-v1');
  const source = createPopulationBaselineSource({ path: file });
  const marketOnly = await source.read({ reports: ['MARKET'] });
  const attempt = await source.read({ reports: ['MARKET', 'INSIGHT'] });
  const document = populationBaselineDocument(attempt, 0);
  if (!document || document.status !== 'COLLECTED') throw new Error(`Lane read skipped: ${attempt.reason ?? 'DOCUMENT_INVALID'}`);
  const collection = { populationBaseline: document };
  const html = populationBaselineSection(collection);
  if (!html) throw new Error('I02 block rendered nothing for a valid read');
  const outDir = path.resolve(values.out);
  await fs.mkdir(outDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(outDir, 'i02-block.html'), html, 'utf8');
  const visible = html.replace(/<[^>]+>/g, ' ');
  const shares = populationBaselineShares(document.baseline);
  console.log(JSON.stringify({
    rowCount: document.baseline.rowCount, total: document.baseline.total, sourceRevision: document.baseline.sourceRevision,
    sexAgeRows: document.baseline.sexAge.rows.length, regionRows: document.baseline.region.rows.length, zoneRows: document.baseline.zone.rows.length,
    marketOnlyReason: marketOnly.reason, insightReason: attempt.reason, captureOperation: attempt.capture?.operation ?? null, captureBytes: attempt.capture?.responseByteLength ?? null,
    shares: { femalePct: round(shares.female), urbanPct: round(shares.urban),
      region: shares.region.map(row => ({ region: row.region, pct: round(row.share) })),
      sexAge: shares.sexAge.map(row => ({ ageBand: row.ageBand, malePct: round(row.male), femalePct: round(row.female) })) },
    comparisons: populationBaselineComparisons(document.baseline, {}),
    emptyWithoutCapture: populationBaselineSection({}) === '' && populationBaselineSection(null) === '',
    htmlBytes: Buffer.byteLength(html), hiddenNameHits: findHiddenNames(html, 'READER').length,
    forbiddenTerms: ['khách hàng', 'người dùng'].filter(term => visible.toLocaleLowerCase('vi-VN').includes(term)),
    nguoiMuaOnlyInNote: visible.split('người mua').length === 2,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Population baseline probe failed');
  process.exitCode = 1;
}

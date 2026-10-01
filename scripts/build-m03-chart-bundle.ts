import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildM03ChartBundle } from '../src/modules/analysis/index.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 3) {
    throw new Error('Usage: npm run research:metric:m03:charts -- <metric-set.json> <metric-set-sha256> <outside-output.json>');
  }
  const [metricSetArgument, metricSetSha256, outputArgument] = args;
  const metricSetPath = path.resolve(metricSetArgument!);
  const outputPath = await outsideRepository(outputArgument!, 'Output');
  let metricSet: unknown;
  try { metricSet = JSON.parse(await fs.readFile(metricSetPath, 'utf8')); }
  catch { throw new Error('M03 metric set is not valid JSON'); }
  const result = buildM03ChartBundle({
    contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1', metricSetSha256,
  }, metricSet);
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const handle = await fs.open(outputPath, 'wx', 0o600);
  try { await handle.writeFile(`${canonicalJson(result)}\n`, 'utf8'); }
  finally { await handle.close(); }
  console.log(JSON.stringify({
    chartBundleSha256: result.chartBundleSha256,
    metricSetSha256: result.metricSet.metricSetSha256,
    chartCount: result.charts.length,
    calculations: 0,
    aiCalls: 0,
    providerCalls: 0,
    outputPath,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'M03 chart bundle failed');
  process.exitCode = 1;
}

async function outsideRepository(argument: string, label: string): Promise<string> {
  const repositoryRoot = await fs.realpath(path.resolve(fileURLToPath(new URL('..', import.meta.url))));
  const absolute = path.resolve(argument);
  let target: string;
  try { target = await fs.realpath(absolute); }
  catch { target = path.join(await fs.realpath(path.dirname(absolute)), path.basename(absolute)); }
  const relative = path.relative(repositoryRoot, target);
  if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..')) {
    throw new Error(`${label} must be outside the Git repository`);
  }
  return target;
}

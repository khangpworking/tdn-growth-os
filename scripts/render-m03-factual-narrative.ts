import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderM03FactualNarrative } from '../src/modules/analysis/index.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 7) {
    throw new Error('Usage: npm run research:metric:m03:narrative -- <metric-set.json> <metric-set-sha256> <chart-bundle.json> <chart-bundle-sha256> <evidence-envelope.json> <envelope-sha256> <outside-output.json>');
  }
  const [metricPath, metricSetSha256, chartPath, chartBundleSha256, envelopePath, envelopeSha256, outputArgument] = args;
  const metricSet = await readJson(metricPath!, 'M03 metric set');
  const chartBundle = await readJson(chartPath!, 'M03 chart bundle');
  const envelope = await readJson(envelopePath!, 'M03 narrative evidence');
  const outputPath = await outsideRepository(outputArgument!, 'Output');
  const result = renderM03FactualNarrative({
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-factual-narrative-vi-v1', envelopeSha256,
  }, envelope, metricSet, chartBundle);
  if (result.dependencies.metricSetSha256 !== metricSetSha256 || result.dependencies.chartBundleSha256 !== chartBundleSha256) {
    throw new Error('Exact dependency digests do not match the verified narrative chain');
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const handle = await fs.open(outputPath, 'wx', 0o600);
  try { await handle.writeFile(`${canonicalJson(result)}\n`, 'utf8'); }
  finally { await handle.close(); }
  console.log(JSON.stringify({
    narrativeSha256: result.narrativeSha256,
    envelopeSha256: result.dependencies.envelopeSha256,
    paragraphCount: result.paragraphs.length,
    aiCalls: 0,
    providerCalls: 0,
    outputPath,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'M03 factual narrative failed');
  process.exitCode = 1;
}

async function readJson(argument: string, label: string): Promise<unknown> {
  try { return JSON.parse(await fs.readFile(path.resolve(argument), 'utf8')); }
  catch { throw new Error(`${label} is not valid JSON`); }
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

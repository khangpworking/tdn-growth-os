import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderM03SectionArtifact } from '../src/modules/analysis/index.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 9) {
    throw new Error('Usage: npm run research:metric:m03:section -- <metric-set.json> <metric-set-sha256> <chart-bundle.json> <chart-bundle-sha256> <evidence-envelope.json> <envelope-sha256> <factual-narrative.json> <narrative-sha256> <outside-output.html>');
  }
  const [
    metricPath, metricSetSha256, chartPath, chartBundleSha256,
    envelopePath, envelopeSha256, narrativePath, narrativeSha256, outputArgument,
  ] = args;
  const metricSet = await readJson(metricPath!, 'M03 metric set');
  const chartBundle = await readJson(chartPath!, 'M03 chart bundle');
  const envelope = await readJson(envelopePath!, 'M03 narrative evidence');
  const narrative = await readJson(narrativePath!, 'M03 factual narrative');
  const outputPath = await outsideRepository(outputArgument!, 'Output');
  const rendered = renderM03SectionArtifact({
    contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1', narrativeSha256,
  }, metricSet, chartBundle, envelope, narrative);
  const { artifact } = rendered;
  if (artifact.dependencies.metricSetSha256 !== metricSetSha256 ||
      artifact.dependencies.chartBundleSha256 !== chartBundleSha256 ||
      artifact.dependencies.envelopeSha256 !== envelopeSha256) {
    throw new Error('Exact dependency digests do not match the verified section artifact chain');
  }
  await fs.mkdir(path.dirname(outputPath), { recursive: true, mode: 0o700 });
  const handle = await fs.open(outputPath, 'wx', 0o600);
  try { await handle.writeFile(rendered.html, 'utf8'); }
  finally { await handle.close(); }
  console.log(JSON.stringify({
    artifactSha256: artifact.artifactSha256,
    narrativeSha256: artifact.dependencies.narrativeSha256,
    htmlSha256: artifact.html.sha256,
    htmlByteSize: artifact.html.byteSize,
    aiCalls: 0,
    providerCalls: 0,
    outputPath,
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'M03 section artifact export failed');
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

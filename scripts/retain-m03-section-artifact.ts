import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SectionArtifactRetentionLedgerService } from '../src/modules/analysis/index.js';
import { ContentAddressedArtifactStore } from '../src/platform/artifacts/index.js';
import { openDatabase } from '../src/platform/db/index.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 14) {
    throw new Error(
      'Usage: npm run research:metric:m03:retain -- <database> <artifact-root> ' +
      '<metric-set.json> <metric-set-sha256> <chart-bundle.json> <chart-bundle-sha256> ' +
      '<evidence-envelope.json> <envelope-sha256> <factual-narrative.json> <narrative-sha256> ' +
      '<section-artifact.json> <section-artifact-sha256> <section-artifact.html> <html-sha256>',
    );
  }
  const [
    databaseArgument, artifactArgument,
    metricSetArgument, metricSetSha256,
    chartBundleArgument, chartBundleSha256,
    envelopeArgument, envelopeSha256,
    narrativeArgument, narrativeSha256,
    receiptArgument, sectionArtifactSha256,
    htmlArgument, htmlSha256,
  ] = args;
  const databasePath = await outsideRepository(databaseArgument!, 'Database');
  const artifactRoot = await outsideRepository(artifactArgument!, 'Artifact root');
  const [metricSetBytes, chartBundleBytes, envelopeBytes, narrativeBytes, receiptBytes, htmlBytes] = await Promise.all([
    fs.readFile(path.resolve(metricSetArgument!)),
    fs.readFile(path.resolve(chartBundleArgument!)),
    fs.readFile(path.resolve(envelopeArgument!)),
    fs.readFile(path.resolve(narrativeArgument!)),
    fs.readFile(path.resolve(receiptArgument!)),
    fs.readFile(path.resolve(htmlArgument!)),
  ]);

  const opened = openDatabase({ databasePath });
  try {
    const artifactStore = new ContentAddressedArtifactStore(artifactRoot);
    const service = new SectionArtifactRetentionLedgerService({ db: opened.db, artifactStore });
    const execution = await service.retain({
      contractVersion: '1.0.0',
      sectionId: 'M03',
      rendererProfile: 'm03-section-artifact-html-vi-v1',
      metricSetSha256, chartBundleSha256, envelopeSha256, narrativeSha256,
      sectionArtifactSha256, htmlSha256,
    }, {
      metricSet: metricSetBytes, chartBundle: chartBundleBytes, envelope: envelopeBytes,
      narrative: narrativeBytes, receipt: receiptBytes, html: htmlBytes,
    });
    console.log(JSON.stringify({ ...execution, aiCalls: 0, providerCalls: 0 }, null, 2));
  } finally {
    opened.db.close();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'M03 section artifact retention failed');
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

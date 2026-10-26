/** Offline capture -> bounded existing CLIProxy text path -> gated HTML -> existing Chromium PDF. */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { readV3Archive, renderV3Report, v3Hash } from '../src/modules/analysis/research-automation/metric-v3-report.js';
import { createChromiumPdfRenderer } from '../src/modules/analysis/research-automation/pdf.js';
import { createInsightCodingCliproxyAi, insightCodingCliproxyConfiguration } from '../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import { cliproxyConfigurationFromEnvironment } from '../src/platform/ai/cliproxy-configuration.js';

const [captureDir, specPath, outputDir, modelId] = process.argv.slice(2);
if (!captureDir || !specPath || !outputDir || !modelId) throw new Error('Usage: tsx scripts/render-metric-v3-report.ts <capture-dir> <spec.json> <new-output-dir> <explicit-model-id>');
const cliproxy = cliproxyConfigurationFromEnvironment(process.env);
if (!cliproxy) throw new Error('V3_REPORT_AI_NOT_CONFIGURED');
const spec = JSON.parse(await readFile(resolve(specPath), 'utf8'));
const archive = await readV3Archive(resolve(captureDir), spec);
await mkdir(resolve(outputDir), { mode: 0o700 });
const save = (name: string, bytes: string | Uint8Array) => writeFile(join(resolve(outputDir), name), bytes, { flag: 'wx', mode: 0o600 });
const ai = createInsightCodingCliproxyAi({ cliproxy, configuration: insightCodingCliproxyConfiguration(modelId) });
const built = await renderV3Report(archive, { identity: modelId, generateText: async request => {
  const response = await ai.port.generateText({ ...request, configuration: ai.configuration, signal: AbortSignal.timeout(300_000) });
  await save('ai-response.json', response.text);
  return response.text;
} });
await save('report.html', built.html);
await save('number-trace.json', JSON.stringify({ trace: built.trace, gate: built.gate }, null, 2));
await save('receipt.json', JSON.stringify({ rendererVersion: 'metric-v3-report-v1', specDigest: archive.manifest.specDigest, modelId,
  captureManifestSha256: v3Hash(await readFile(join(resolve(captureDir), 'manifest.json'))), htmlSha256: v3Hash(built.html) }, null, 2));
if (process.env.TDN_RESEARCH_PDF_CHROMIUM) {
  const pdf = createChromiumPdfRenderer({ executablePath: process.env.TDN_RESEARCH_PDF_CHROMIUM });
  try { await save('report.pdf', await pdf.render(Buffer.from(built.html))); }
  finally { await pdf.close(); }
}
console.log(JSON.stringify({ html: true, numberTrace: built.gate.ok, untraced: built.gate.coveredUntraced, mismatches: built.gate.mismatches.length }));

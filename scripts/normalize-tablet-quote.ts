import { createHash } from 'node:crypto';
import { normalizeTabletQuote } from '../src/modules/analysis/tablet-quote-normalizer.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { readReportInput, publishPrivateReportBundle } from '../src/platform/artifacts/private-report-bundle.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: research:quote:normalize -- <quote.json> <outside-git-bundle-directory>');
  const [inputFile, outputDirectory] = args as [string, string];
  const raw = await readReportInput(inputFile, 128 * 1024);
  const input: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
  const result = normalizeTabletQuote(input);
  const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value) + '\n');
  const hash = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');
  const files = new Map<string, Buffer>([
    ['raw-input.json', raw],
    ['input.json', json(input)],
    ['result.json', json(result)],
  ]);
  files.set('manifest.json', json({
    contractVersion: 'tablet-quote-export-v1',
    methodVersion: result.methodVersion,
    quoteId: result.quoteId,
    inputSha256: result.inputSha256,
    status: 'SCENARIO',
    approvalState: 'UNREVIEWED',
    sourceAuthenticity: 'NOT_AUTHENTICATED',
    files: [...files].map(([name, bytes]) => ({ name, byteSize: bytes.length, sha256: hash(bytes) })),
  }));
  const published = await publishPrivateReportBundle(outputDirectory, files);
  console.log(JSON.stringify({
    ...published,
    quoteId: result.quoteId,
    status: result.status,
    approvalState: result.approvalState,
    sourceAuthenticity: result.sourceAuthenticity,
    inputSha256: result.inputSha256,
    resultSha256: hash(files.get('result.json')!),
    databaseMutations: 0,
    aiCalls: 0,
    providerCalls: 0,
  }));
}

await main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Tablet quote normalization failed');
  process.exitCode = 1;
});

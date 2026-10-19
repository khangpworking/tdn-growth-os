import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { mock } from 'node:test';
import { businessByteInput } from './package-r-business-byte-input.js';

// Usage: node --import tsx tests/helpers/package-r-business-baselines.ts CHECKOUT OUTPUT_DIRECTORY
// CHECKOUT selects that checkout's own public builder. No source is copied or patched.
const [checkout, output] = process.argv.slice(2);
if (!checkout || !output) throw new Error('Expected checkout and output directory');
const { buildResearchAutomationReport } = await import(pathToFileURL(resolve(checkout,
  'src/modules/analysis/research-automation/reports.ts')).href);
await mkdir(output, { recursive: true });
mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-19T00:00:00.000Z') });
try {
  for (const [name, kind] of [['legacy-market', 'MARKET'], ['insight', 'INSIGHT']] as const) {
    const bytes = Buffer.from(buildResearchAutomationReport(businessByteInput(), kind).html);
    await writeFile(resolve(output, `package-r-business-${name}.html`), bytes);
    console.log(`${name} ${bytes.length} ${createHash('sha256').update(bytes).digest('hex')}`);
  }
} finally { mock.timers.reset(); }

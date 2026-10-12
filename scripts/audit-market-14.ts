import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { auditMarket14 } from '../src/modules/analysis/research-automation/market-14-rules.js';

const [reportArg, traceArg] = process.argv.slice(2);
if (!reportArg) {
  console.error('Usage: audit-market-14 <report.html> [trace.md]');
  process.exit(2);
}

const html = readFileSync(resolve(reportArg), 'utf8');
const trace = traceArg === undefined ? undefined : readFileSync(resolve(traceArg), 'utf8');
const results = auditMarket14(html, trace);
for (const result of results) {
  const status = result.kind === 'evidence' ? 'READ' : result.ok ? 'PASS' : 'FAIL';
  console.log(`${status} rule ${result.rule} ${result.detail}`);
}
if (results.some(result => result.kind === 'machine' && !result.ok)) process.exitCode = 1;

import fs from 'node:fs';
import { auditMarketReportHtml } from '../src/modules/analysis/research-automation/market-business-gate.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node --import tsx scripts/audit-market-report.ts <file.html>');
  process.exitCode = 2;
} else {
  const results = auditMarketReportHtml(fs.readFileSync(file, 'utf8'));
  for (const check of results) console.log(`${check.ok ? 'PASS' : 'FAIL'} ${check.rule} ${check.detail}`);
  process.exitCode = results.every(check => check.ok) ? 0 : 1;
}

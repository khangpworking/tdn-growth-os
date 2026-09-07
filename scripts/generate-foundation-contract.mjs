import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contracts = [
  ['foundation', 'manual-observation'],
  ['foundation', 'json-export'],
  ['foundation', 'data-pack-request'],
  ['foundation', 'data-pack-manifest'],
  ['foundation', 'research-document-import'],
  ['foundation', 'research-pack-request'],
  ['foundation', 'research-pack-manifest'],
  ['analysis', 'market-snapshot-request'],
  ['analysis', 'market-snapshot-result'],
  ['analysis', 'research-evidence-index-request'],
  ['analysis', 'research-evidence-index-result'],
  ['analysis', 'research-evidence-audit-request'],
  ['analysis', 'research-evidence-audit-output'],
  ['analysis', 'research-evidence-audit'],
  ['analysis', 'market-snapshot-interpretation-request'],
  ['analysis', 'market-snapshot-interpretation-output'],
  ['analysis', 'market-snapshot-interpretation'],
  ['analysis', 'governed-skill-execution-request'],
  ['orchestrator', 'analysis-backed-proposal-submission'],
  ['orchestrator', 'analysis-backed-proposal'],
  ['governance', 'governed-proposal-review-request'],
  ['governance', 'governed-proposal-decision'],
];
for (const [module, contract] of contracts) {
  const schemaPath = path.join(root, `contracts/${module}/${contract}.schema.json`);
  const outputPath = path.join(root, `contracts/${module}/${contract}.generated.ts`);
  const generated = await compileFromFile(schemaPath, {
    bannerComment: `/* Generated from ${contract}.schema.json. Do not edit by hand. */`,
    style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
  });
  await fs.writeFile(outputPath, generated, 'utf8');
  console.log(path.relative(root, outputPath));
}

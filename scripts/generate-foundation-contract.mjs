import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contracts = [
  ['foundation', 'shopee-listing-request'],
  ['foundation', 'shopee-collection'],
  ['foundation', 'apify-shopee-rows'],
  ['analysis', 'shopee-review-result'],
  ['foundation', 'manual-observation'],
  ['foundation', 'json-export'],
  ['foundation', 'data-pack-request'],
  ['foundation', 'data-pack-manifest'],
  ['foundation', 'research-document-import'],
  ['foundation', 'research-pack-request'],
  ['foundation', 'research-pack-manifest'],
  ['foundation', 'source-package-intake-request'],
  ['foundation', 'source-package-manifest'],
  ['analysis', 'source-package-field-audit-request'],
  ['analysis', 'source-package-field-audit-result'],
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
  ['governance', 'candidate-b7-decision-request'],
  ['governance', 'candidate-b7-decision'],
  ['governance', 'product-b8-lane-decision-request'],
  ['governance', 'product-b8-lane-decision'],
  ['flow', 'approved-proposal-intake-request'],
  ['flow', 'authorized-plan'],
  ['flow', 'discovery-workspace-request'],
  ['flow', 'discovery-workspace-artifact'],
  ['flow', 'product-candidate-create-request'],
  ['flow', 'product-candidate-revision-request'],
  ['flow', 'product-candidate-artifact'],
  ['flow', 'candidate-basket-freeze-request'],
  ['flow', 'candidate-basket-artifact'],
  ['flow', 'product-workspace-create-request'],
  ['flow', 'product-workspace-artifact'],
  ['flow', 'b8-clearance-create-request'],
  ['flow', 'b8-clearance-artifact'],
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

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const contracts = ['manual-observation', 'json-export'];
for (const contract of contracts) {
  const schemaPath = path.join(root, `contracts/foundation/${contract}.schema.json`);
  const outputPath = path.join(root, `contracts/foundation/${contract}.generated.ts`);
  const generated = await compileFromFile(schemaPath, {
    bannerComment: `/* Generated from ${contract}.schema.json. Do not edit by hand. */`,
    style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
  });
  await fs.writeFile(outputPath, generated, 'utf8');
  console.log(path.relative(root, outputPath));
}

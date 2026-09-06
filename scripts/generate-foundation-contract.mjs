import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileFromFile } from 'json-schema-to-typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(root, 'contracts/foundation/manual-observation.schema.json');
const outputPath = path.join(root, 'contracts/foundation/manual-observation.generated.ts');
const generated = await compileFromFile(schemaPath, {
  bannerComment: '/* Generated from manual-observation.schema.json. Do not edit by hand. */',
  style: { singleQuote: true, semi: true, tabWidth: 2, trailingComma: 'all' },
});
await fs.writeFile(outputPath, generated, 'utf8');
console.log(path.relative(root, outputPath));

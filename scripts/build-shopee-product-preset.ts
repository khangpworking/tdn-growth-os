// Offline only: reuse the capture builder; never discover or infer product scope.
import { createRequire } from 'node:module';
import schema from '../contracts/analysis/shopee-product-input.schema.json' with { type: 'json' };
import { metricV3Defaults, metricV3Category } from '../src/shared/metric-v3-preset.js';
import { buildCaptureSpec } from '../src/modules/analysis/research-automation/autorun-derive.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const validate = new Ajv2020({ strict: true }).compile(schema);
const invalid = () => { throw new Error('PRODUCT_INPUT_INVALID'); };
const text = (value: string) => {
  const result = value.normalize('NFC').trim();
  // Query chips split at commas; accepting one would change the requested scope.
  if (!result || /[\p{Cc}\p{Cf}]/u.test(result)) invalid();
  return result;
};

async function main() {
  if (process.argv.length !== 2) invalid();
  let source = '';
  for await (const chunk of process.stdin) {
    source += chunk;
    if (Buffer.byteLength(source) > 65536) invalid();
  }
  const input = JSON.parse(source);
  if (!validate(input)) invalid();
  if (input.presetId !== text(input.presetId)) invalid();
  if (input.categoryId !== metricV3Category.id) throw new Error('PRODUCT_CATEGORY_UNSUPPORTED');
  const label = text(input.label), keyword = text(input.keyword);
  if (input.keyword2 && /[\p{Cc}\p{Cf}]/u.test(input.keyword2)) invalid();
  const keyword2 = input.keyword2?.trim() ? text(input.keyword2) : undefined;
  if ([keyword, keyword2].some(value => value?.includes(','))) invalid();
  const principalTitles = (input.principalTitles ?? []).map(text);
  if (new Set(principalTitles.map((value: string) => value.toLowerCase())).size !== principalTitles.length) invalid();
  // Windows are supplied by new-run, so saving requires no date or paid lookup.
  const { windows: _windows, ...preset } = buildCaptureSpec(metricV3Defaults(keyword, keyword2, '2000-12-31'));
  process.stdout.write(JSON.stringify({ format: 'preset-v1', presetId: input.presetId, label, preset,
    principalTitles, source: 'manual' }) + '\n');
}

main().catch((error: unknown) => {
  const code = error instanceof Error && error.message === 'PRODUCT_CATEGORY_UNSUPPORTED'
    ? error.message : 'PRODUCT_INPUT_INVALID';
  process.stdout.write(JSON.stringify({ format: 'error-v1', code, message: code }) + '\n');
  process.exitCode = 2;
});

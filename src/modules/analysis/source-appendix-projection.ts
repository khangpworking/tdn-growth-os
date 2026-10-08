import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/source-appendix-projection.schema.json' with { type: 'json' };
import type { SourceAppendixProjection, SourceAppendixProjectionInput, SourceAppendixUsage, SourceAppendixRow } from '../../../contracts/analysis/source-appendix-projection.generated.js';
import { REPORT_SOURCE_REGISTRY } from './source-registry.js';
export type { SourceAppendixProjection, SourceAppendixProjectionInput, SourceAppendixUsage, SourceAppendixRow } from '../../../contracts/analysis/source-appendix-projection.generated.js';
export const SOURCE_APPENDIX_PROJECTION_CONTRACT = 'source-appendix-projection-v2' as const;
export const E12_ATTRIBUTION = 'Cục Thống kê (nso.gov.vn)' as const;
export const E13_ATTRIBUTION = 'Ngân hàng Thế giới (World Bank Open Data)' as const;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true }); ajv.addSchema(schema);
const inputValid = ajv.compile<SourceAppendixProjectionInput>({ $ref: `${schema.$id}#/$defs/input` });
const outputValid = ajv.compile<SourceAppendixProjection>({ $ref: `${schema.$id}#/$defs/projection` });
export class SourceAppendixProjectionError extends Error { readonly code = 'INVALID_SOURCE_APPENDIX_INPUT'; }
function fail(message: string): never { throw new SourceAppendixProjectionError(message); }
export function buildSourceAppendixProjection(input: SourceAppendixProjectionInput): SourceAppendixProjection {
  if (!inputValid(input)) fail('input failed canonical schema validation');
  const seen = new Set<string>(); const accounted = new Set<string>();
  const rows: SourceAppendixRow[] = input.usages.map(usage => {
    const entry = REPORT_SOURCE_REGISTRY[usage.registryId as keyof typeof REPORT_SOURCE_REGISTRY];
    if (!entry) fail('unknown registry ID');
    const bindingKey = `${usage.binding.kind}:${usage.binding.ref}`;
    const key = `${usage.registryId}:${bindingKey}:${usage.l10SourceType ?? ''}`;
    if (seen.has(key)) fail('duplicate retained use'); seen.add(key);
    if (usage.l9) {
      if (accounted.has(bindingKey)) fail('duplicate L9 accounting bucket'); accounted.add(bindingKey);
      if (Object.values(usage.l9.byReason).reduce((sum, count) => sum + count, 0) !== usage.l9.excluded + usage.l9.unclear) fail('L9 reasons differ from accounting');
    }
    if (usage.l10SourceType !== null && usage.registryId !== 'S07') fail('L10 source type requires S07');
    return { registryId: usage.registryId, tier: entry[0], tierDetail: usage.registryId === 'S19' ? 'Theo trang gốc; chưa chấm hạng' : usage.registryId === 'S25' ? 'B (báo cáo thường niên đã kiểm toán) / C (khảo sát ngành)' : null,
      group: entry[2], reportName: entry[1], binding: { ...usage.binding }, l9Excluded: usage.l9?.excluded ?? null,
      l9Unclear: usage.l9?.unclear ?? null, l9Reasons: { ...(usage.l9?.byReason ?? {}) }, l10SourceType: usage.l10SourceType,
      attribution: ['S21', 'S22'].includes(usage.registryId) ? E12_ATTRIBUTION : usage.registryId === 'S23' ? E13_ATTRIBUTION : null };
  });
  const result: SourceAppendixProjection = { contractVersion: SOURCE_APPENDIX_PROJECTION_CONTRACT, registryVersion: '1.9', rows };
  if (!outputValid(result)) fail('projection failed canonical schema validation');
  return result;
}

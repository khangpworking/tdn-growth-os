import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/insight-reader-input.schema.json' with { type: 'json' };
import type { InsightReaderInput } from '../../../../contracts/analysis/insight-reader-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { ReaderReportInputError } from './build.js';

export type { InsightReaderInput } from '../../../../contracts/analysis/insight-reader-input.generated.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
const valid = ajv.compile<InsightReaderInput>(schema);

/** Expected is reconstructed from authenticated frozen start/scope and exact
 * replay-verified source/method identities by the owning service. Schema/hash
 * alone cannot authenticate a caller-supplied method or scope. */
export function verifyInsightReaderInput(value: unknown, expected: InsightReaderInput): InsightReaderInput {
  if (!valid(value) || !valid(expected)) throw new ReaderReportInputError('Đầu vào bản đọc insight không đúng hợp đồng.');
  if (value.scope.requestedPeriod.startDate > value.scope.requestedPeriod.endDate)
    throw new ReaderReportInputError('Kỳ yêu cầu insight không hợp lệ.');
  const identities = value.retainedMethods.map(method => `${method.kind}:${method.sha256}`);
  if (new Set(identities).size !== identities.length)
    throw new ReaderReportInputError('Tham chiếu phương pháp insight bị lặp.');
  if (canonicalJson(value) !== canonicalJson(expected))
    throw new ReaderReportInputError('Bản đọc insight không khớp nguồn, phạm vi hoặc phiên bản đã xác minh.');
  return JSON.parse(canonicalJson(value)) as InsightReaderInput;
}

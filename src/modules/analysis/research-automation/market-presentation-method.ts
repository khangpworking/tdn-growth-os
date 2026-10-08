import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import methodSchema from '../../../../contracts/analysis/automation-market-presentation-method.schema.json' with { type: 'json' };
import metricInputSchema from '../../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import metricOutputSchema from '../../../../contracts/analysis/metric-scope-output.schema.json' with { type: 'json' };
import readerInputSchema from '../../../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import readerApiSchema from '../../../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import apiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import peerSchema from '../../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import type { AutomationMarketPresentationMethod } from '../../../../contracts/analysis/automation-market-presentation-method.generated.js';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { projectMarketUnitPrices, type RetainedUnitPriceSource } from '../reader-report/market-unit-prices.js';
import { MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
for (const schema of [apiSchema, peerSchema, readerInputSchema, readerApiSchema, metricInputSchema, metricOutputSchema]) ajv.addSchema(schema);
const valid = ajv.compile<AutomationMarketPresentationMethod>(methodSchema);
export const marketPresentationDigest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const fail = (message: string): never => { throw new ResearchAutomationIntegrityError(message); };
type Method = AutomationMarketPresentationMethod;
type Finding = Method['findings'][number];
export type MarketPresentationBinding = Method['binding'];
export type MarketPresentationInput = Method['input'];
const integer = (value: string): string => BigInt(value).toLocaleString('vi-VN');

function verifyInputs(method: Method): void {
  const { binding, input } = method;
  if ((binding.metric === null) !== (input.metric === null)) fail('Market presentation lacks its exact Metric binding.');
  if (input.metric && (marketPresentationDigest(input.metric) !== binding.metric!.resultSha256 ||
      marketPresentationDigest(input.metric.input) !== input.metric.inputSha256)) fail('Market presentation Metric bytes differ from their binding.');
  const indices = new Set<number>();
  for (const row of input.rows) {
    if (indices.has(row.i)) fail('Market presentation contains duplicate workbook row identity.');
    indices.add(row.i);
  }
  const spec = input.unitSpec;
  if (spec && (!binding.metric || spec.sha256 !== marketPresentationDigest(spec.record) ||
      spec.record.workspaceId !== binding.workspaceId || spec.record.runId !== binding.runId ||
      spec.record.draftPairId !== binding.previousPairId || spec.record.workbookSha256 !== binding.metric.workbookSha256 ||
      spec.record.request.metricPackageId !== binding.metric.sourcePackage.packageId))
    fail('Market presentation unit-spec receipt differs from the exact prior pair, workbook or source.');
  if (!spec && method.unitPrices.length) fail('Market presentation unit prices lack an authenticated receipt.');
}

/** Presentation facts only. Metric totals are already calculated and verified by
 * their owning bridge. Unit arithmetic reuses the reader's retained-byte method.
 * The service supplies verified source/receipt inputs, never public digest claims. */
export function buildAutomationMarketPresentation(binding: MarketPresentationBinding, input: MarketPresentationInput,
  retainedSources: readonly RetainedUnitPriceSource[] = []): Method {
  const method: Method = { contractVersion: 'automation-market-presentation-method-v1', methodVersion: 'market-presentation-v1',
    binding: structuredClone(binding), input: structuredClone(input), findings: [], unitPrices: [], advertising: 'UNAVAILABLE_UNCONFIRMED_RETAINED_SEMANTICS' };
  if (!valid(method)) fail('Market presentation inputs fail their canonical contract.');
  verifyInputs(method);
  const metric = input.metric;
  if (metric) {
    const all = metric.scopes.find(scope => scope.key === 'all');
    if (!all || all.status !== 'CALCULATED') return fail('Market presentation lacks a frozen ALL scope.');
    const scope = `Trong mẫu xuất chưa phân loại theo nhóm sản phẩm; sàn ${metric.input.scope.platform === 'shopee' ? 'Shopee' : 'TikTok Shop'}, kỳ ${metric.input.scope.start} đến ${metric.input.scope.end}. Không quy ra toàn thị trường hoặc cộng với sàn khác.`;
    const add = (id: Finding['id'], statement: string, locator: string): void => {
      method.findings.push({ id, statement, scope, sectionId: 'M03', pending: false,
        evidence: [{ sourceSha256: binding.metric!.resultSha256, locator, label: 'Phép tính mẫu xuất đã lưu' }] });
    };
    const index = metric.scopes.indexOf(all);
    add('inventory', `Mẫu xuất giữ ${all.listingCount} bản ghi sản phẩm của ${all.shopCount} gian hàng; mỗi bản ghi chưa chứng minh một sản phẩm hoặc biến thể phân biệt.`, `/scopes/${index}`);
    if (all.revenue.value !== null || all.units.value !== null) {
      const amounts = [all.revenue.value === null ? 'chưa có tổng doanh thu dùng được' : `${integer(all.revenue.value)} VND doanh thu (ước tính)`,
        all.units.value === null ? 'chưa có tổng đơn vị bán dùng được' : `${integer(all.units.value)} đơn vị bán (ước tính)`];
      add('demand', `Doanh số (ước tính) mô tả nhu cầu trong mẫu: ${amounts.join('; ')}; không suy ra số người mua hoặc nguyên nhân.`, `/scopes/${index}`);
    }
    add('missing', `Trong mẫu có ${all.revenue.missingCount} dòng thiếu doanh thu và ${all.units.missingCount} dòng thiếu đơn vị bán; phần thiếu không thay bằng số không.`, `/scopes/${index}`);
    add('precision', `Trong các dòng quan sát có ${all.revenue.nonExactCount} giá trị doanh thu và ${all.units.nonExactCount} giá trị đơn vị bán chưa xác nhận độ chính xác tuyệt đối; các số bán hàng giữ nhãn ước tính.`, `/scopes/${index}`);
  }
  if (input.unitSpec) {
    const packet = input.unitSpec.record.request.unitPrices as unknown as NonNullable<ReaderReportInput['unitPrices']>;
    method.unitPrices = projectMarketUnitPrices({ contractVersion: '1.4.0', rows: input.rows, unitPrices: packet }, retainedSources);
    if (method.unitPrices.length) method.findings.push({ id: 'unit-prices',
      statement: `Có ${method.unitPrices.length} quan sát quy cách và giá đã đối chiếu với bản lưu; chỉ những dòng đủ giá và số lượng mới được quy đổi, và chỉ so trong phạm vi tương thích.`,
      scope: 'Các listing, biến thể, ngành hàng, sàn và kỳ quan sát giá ghi ở từng dòng bảng giá; kỳ giá giữ riêng với kỳ doanh số.',
      sectionId: 'M08', pending: false, evidence: [{ sourceSha256: input.unitSpec.sha256, locator: '/request/unitPrices', label: 'Biên nhận quy cách do người vận hành lưu' }] });
  }
  if (!valid(method)) fail('Market presentation result fails its canonical contract.');
  if (Buffer.byteLength(canonicalJson(method)) > MAX_JSON_ARTIFACT_BYTES) fail('Market presentation exceeds its retained byte bound.');
  return method;
}

/** Immutable read verification: no calculator, workbook reader, clock, intake,
 * model or provider. The service checks this artifact's manifest/digest and the
 * upstream source/receipt bytes before invoking this frozen v1 verifier. */
export function verifyAutomationMarketPresentation(value: unknown, binding: MarketPresentationBinding): Method {
  if (!valid(value) || Buffer.byteLength(canonicalJson(value)) > MAX_JSON_ARTIFACT_BYTES || canonicalJson(value.binding) !== canonicalJson(binding)) fail('Stored Market presentation identity differs.');
  const method = value as Method;
  verifyInputs(method);
  return method;
}

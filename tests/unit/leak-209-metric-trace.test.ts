import assert from 'node:assert/strict';
import test from 'node:test';
import { CITATION_FORBIDDEN_NAMES } from '../../src/modules/analysis/citation-registry.js';
import type { AutomationClassifiedMetricSnapshot } from '../../contracts/analysis/automation-classified-metric.generated.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

const LIMITATIONS = [
  ['OPERATOR_ATTACHED_EXPORT_NOT_PROVIDER_AUTHENTICATED', 'Bản xuất do người vận hành cung cấp; nguồn gốc thu thập chưa được xác minh độc lập.'],
  ['KEYWORD_EXPORT_CONTEXT_RETAINED_LITERALLY_NO_FILTER_CATEGORY_OR_COVERAGE_GUARANTEE', 'Ngữ cảnh theo từ khóa được giữ nguyên; chưa có bảo đảm về bộ lọc, phân loại hoặc độ bao phủ.'],
  ['ALL_SCOPE_IS_BOUNDED_OBSERVED_KEYWORD_EXPORT_SAMPLE_NOT_WHOLE_MARKET', 'Phạm vi toàn mẫu là mẫu quan sát có giới hạn theo từ khóa, không đại diện cho toàn bộ thị trường.'],
  ['CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED', 'Nhãn phân loại chưa được gắn xác nhận; phạm vi rộng và phạm vi cốt lõi chưa đủ điều kiện tính.'],
  ['CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED', 'M03 và M04 vẫn ở trạng thái chưa đủ điều kiện sau bước phân loại.'],
  ['NO_ANNUAL_GROWTH_TAM_OR_WHOLE_MARKET_SHARE', 'Bản lưu không cung cấp quy mô thị trường, tăng trưởng năm hoặc thị phần toàn thị trường.'],
  ['NOT_DIRECTLY_COMPARABLE_WITH_KALODATA_PERIODS', 'Kỳ đo của bản xuất này không so sánh trực tiếp được với kỳ của nguồn sàn khác.'],
  ['DECLARED_PERIOD_AND_PRECISION_NOT_INDEPENDENTLY_VERIFIED', 'Kỳ đo và độ chính xác do bản xuất khai báo chưa được xác minh độc lập.'],
  ['SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED', 'Kỳ đo của bản xuất ngắn hơn kỳ yêu cầu; không kéo dài hoặc chia tỷ lệ để bù.'],
] as const;
const CLASSIFICATION_CODES = ['CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED', 'CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED'] as const;
const CLASSIFICATION_COPIES = [LIMITATIONS[3][1], LIMITATIONS[4][1]] as const;
const METHOD_IDS = ['metric-scope-v1', 'percent-half-even-2-v1'] as const;
const GENERIC_LIMITATION = 'Một giới hạn kỹ thuật khác được giữ trong bản lưu';
const GENERIC_METHOD = 'Phiên bản được giữ trong bản lưu';
const PROTOTYPE_KEYS = ['toString', '__proto__', 'constructor'] as const;
const citations = { mark: () => '[1]' };

function snapshot(limitations: readonly string[] = LIMITATIONS.map(([code]) => code)): AutomationMetricMethodSnapshot {
  const result = calculateMetricScopes(metricFixture());
  return {
    contractVersion: 'automation-metric-method-snapshot-v1',
    runId: 'synthetic-run',
    runBindingSha256: 'a'.repeat(64),
    sourcePackage: { packageId: 'synthetic-package', manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) },
    originalSourcePackage: { packageId: 'synthetic-original', manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
    preparation: { normalizationReceiptSha256: 'f'.repeat(64) },
    readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] },
    result,
    limitations,
  } as unknown as AutomationMetricMethodSnapshot;
}

function classified(result = snapshot().result): AutomationClassifiedMetricSnapshot {
  return {
    contractVersion: 'automation-classified-metric-v1',
    binding: { adoptionSha256: '1'.repeat(64) },
    selection: { receiptIds: ['synthetic-receipt'] },
    proofSha256: '2'.repeat(64),
    result,
  } as unknown as AutomationClassifiedMetricSnapshot;
}

function render(sectionId: 'M03' | 'M04', isClassified: boolean, limitations: readonly string[] = LIMITATIONS.map(([code]) => code)): string {
  const base = snapshot(limitations);
  return metricMethodSection(base, sectionId, isClassified ? classified(base.result) : undefined, citations);
}

test('M03 and M04 traces keep provider names, raw limitation codes and method ids out of reader HTML', () => {
  for (const sectionId of ['M03', 'M04'] as const) {
    for (const isClassified of [false, true]) {
      const html = render(sectionId, isClassified);
      const lower = html.toLowerCase();
      for (const name of CITATION_FORBIDDEN_NAMES) assert.equal(lower.includes(name.toLowerCase()), false, `${sectionId} ${isClassified}: ${name}`);
      for (const [code] of LIMITATIONS) assert.equal(html.includes(code), false, `${sectionId} ${isClassified}: ${code}`);
      for (const id of METHOD_IDS) assert.equal(html.includes(id), false, `${sectionId} ${isClassified}: ${id}`);
    }
  }
});

test('every known limitation code has plain Vietnamese copy and unknown codes use the generic line', () => {
  for (const [code, copy] of LIMITATIONS) {
    const html = render('M03', false, [code]);
    assert.ok(html.includes(copy), code);
    assert.equal(html.includes(code), false, code);
  }
  const unknown = 'UNRECOGNIZED_SYNTHETIC_LIMITATION';
  const html = render('M03', false, [unknown]);
  assert.ok(html.includes(GENERIC_LIMITATION));
  assert.equal(html.includes(unknown), false);
});

test('classified M03 and M04 traces omit classification codes and their mapped copies', () => {
  for (const sectionId of ['M03', 'M04'] as const) {
    const html = render(sectionId, true, [...LIMITATIONS.map(([code]) => code), ...CLASSIFICATION_CODES]);
    for (const code of CLASSIFICATION_CODES) assert.equal(html.includes(code), false, `${sectionId}: ${code}`);
    for (const copy of CLASSIFICATION_COPIES) assert.equal(html.includes(copy), false, `${sectionId}: ${copy}`);
  }
});

test('known method and rounding ids have plain Vietnamese copy and unknown ids use the generic version line', () => {
  const known = snapshot([]);
  const html = metricMethodSection(known, 'M03', undefined, citations);
  assert.ok(html.includes('Phép tính trên mẫu số liệu đã lưu, phiên bản 1'));
  assert.ok(html.includes('Làm tròn tỷ lệ phần trăm tới 2 chữ số thập phân (nửa về số chẵn)'));
  assert.equal(html.includes('metric-scope-v1'), false);
  assert.equal(html.includes('percent-half-even-2-v1'), false);

  const unknownResult = { ...known.result, methodVersion: 'synthetic-method-v9', rounding: 'synthetic-rounding-v9' };
  const unknownHtml = metricMethodSection({ ...known, result: unknownResult } as AutomationMetricMethodSnapshot, 'M03', undefined, citations);
  assert.equal((unknownHtml.match(new RegExp(GENERIC_METHOD, 'g')) ?? []).length, 2);
  assert.equal(unknownHtml.includes('synthetic-method-v9'), false);
  assert.equal(unknownHtml.includes('synthetic-rounding-v9'), false);
});

test('prototype keys use generic limitation and method copies without JavaScript text', () => {
  for (const key of PROTOTYPE_KEYS) {
    const limitationHtml = render('M03', false, [key]);
    assert.ok(limitationHtml.includes(GENERIC_LIMITATION), `limitation ${key}`);
    const known = snapshot([]);
    const methodResult = { ...known.result, methodVersion: key, rounding: key };
    const methodHtml = metricMethodSection({ ...known, result: methodResult } as unknown as AutomationMetricMethodSnapshot, 'M03', undefined, citations);
    assert.equal(methodHtml.includes(GENERIC_METHOD), true, `method ${key}`);
    for (const html of [limitationHtml, methodHtml]) {
      assert.equal(html.includes('function'), false, key);
      assert.equal(html.includes('[object'), false, key);
      assert.equal(html.includes('native code'), false, key);
    }
  }
});

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/m03-factual-narrative-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/m03-factual-narrative.schema.json' with { type: 'json' };
import type { M03FactualNarrativeRequest } from '../../../contracts/analysis/m03-factual-narrative-request.generated.js';
import type { M03FactualNarrative } from '../../../contracts/analysis/m03-factual-narrative.generated.js';
import type { M03NarrativeEvidence } from '../../../contracts/analysis/m03-narrative-evidence.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { verifyM03ChartBundle } from './m03-chart-bundle.js';
import { verifyM03NarrativeEvidence } from './m03-narrative-evidence.js';
import { verifyM03VerifiedMetricSet } from './m03-section-recipe.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<M03FactualNarrativeRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<M03FactualNarrative>(resultSchema);
type Paragraph = M03FactualNarrative['paragraphs'][number];
type Claim = M03NarrativeEvidence['claims'][number];

export class M03FactualNarrativeValidationError extends Error {}
export class M03FactualNarrativeIntegrityError extends Error {}

export function renderM03FactualNarrative(
  untrustedRequest: unknown,
  untrustedEnvelope: unknown,
  untrustedMetricSet: unknown,
  untrustedChartBundle: unknown,
): M03FactualNarrative {
  if (!validateRequest(untrustedRequest)) {
    throw new M03FactualNarrativeValidationError(`Invalid M03 factual narrative request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  const request = JSON.parse(canonicalJson(untrustedRequest)) as M03FactualNarrativeRequest;
  const exactMetricSet = verifyM03VerifiedMetricSet(untrustedMetricSet);
  const exactChartBundle = verifyM03ChartBundle(untrustedChartBundle, undefined, exactMetricSet);
  const envelope = verifyM03NarrativeEvidence(
    untrustedEnvelope, request.envelopeSha256, exactMetricSet, exactChartBundle,
  );
  const paragraphs: Paragraph[] = [
    scopeParagraph(envelope, 'all', 'ALL'),
    scopeParagraph(envelope, 'wide', 'WIDE'),
    scopeParagraph(envelope, 'core', 'CORE'),
    sensitivityParagraph(envelope, 'all_to_wide', 'WIDE'),
    sensitivityParagraph(envelope, 'all_to_core', 'CORE'),
    {
      paragraphId: 'limitations', kind: 'CAVEAT',
      text: 'Các phạm vi có membership chồng lấp nên không được cộng. Chênh lệch theo membership không phải tăng trưởng, dự báo, thị phần hay quan hệ nhân quả. Listing không đồng nghĩa một sản phẩm duy nhất.',
      claimIds: [], chartIds: [],
    },
  ];
  for (const paragraph of paragraphs) verifyNumbers(paragraph, envelope);
  const content = {
    contractVersion: '1.0.0' as const,
    request,
    section: { sectionId: 'M03' as const, title: 'Quy mô và diễn biến' as const },
    dependencies: {
      envelopeSha256: envelope.envelopeSha256,
      metricSetSha256: envelope.dependencies.metricSetSha256,
      chartBundleSha256: envelope.dependencies.chartBundleSha256,
    },
    language: 'vi' as const,
    paragraphs: paragraphs as M03FactualNarrative['paragraphs'],
    status: 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED' as const,
  };
  const result: M03FactualNarrative = {
    ...content,
    narrativeSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
  };
  if (!validateResult(result)) {
    throw new M03FactualNarrativeIntegrityError(`M03 factual narrative breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
  }
  return JSON.parse(canonicalJson(result)) as M03FactualNarrative;
}

function scopeParagraph(envelope: M03NarrativeEvidence, scope: 'all' | 'wide' | 'core', label: 'ALL' | 'WIDE' | 'CORE'): Paragraph {
  const listing = claim(envelope, `M03:${scope}:listing_count`);
  const shop = claim(envelope, `M03:${scope}:shop_count`);
  const revenue = claim(envelope, `M03:${scope}:observed_revenue`);
  const units = claim(envelope, `M03:${scope}:observed_units`);
  const revenueText = revenue.value === null
    ? 'doanh thu quan sát chưa đủ dữ liệu để tính'
    : `doanh thu quan sát là ${revenue.value} VND`;
  const unitsText = units.value === null
    ? 'sản lượng quan sát chưa đủ dữ liệu để tính'
    : `sản lượng quan sát là ${units.value}`;
  return {
    paragraphId: `scope-${scope}`,
    kind: 'FACT',
    text: `Phạm vi ${label} ghi nhận ${listing.value} listing từ ${shop.value} shop; ${revenueText}; ${unitsText}.`,
    claimIds: [listing.claimId, shop.claimId, revenue.claimId, units.claimId],
    chartIds: ['m03-observed-revenue-by-scope', 'm03-observed-units-by-scope'],
  };
}

function sensitivityParagraph(
  envelope: M03NarrativeEvidence,
  context: 'all_to_wide' | 'all_to_core',
  label: 'WIDE' | 'CORE',
): Paragraph {
  const revenue = claim(envelope, `M03:${context}:revenue_membership_delta`);
  const units = claim(envelope, `M03:${context}:units_membership_delta`);
  const revenueText = revenue.value === null
    ? 'chưa đủ dữ liệu để tính chênh doanh thu quan sát'
    : `chênh doanh thu quan sát là ${revenue.value} VND`;
  const unitsText = units.value === null
    ? 'chưa đủ dữ liệu để tính chênh sản lượng quan sát'
    : `chênh sản lượng quan sát là ${units.value}`;
  return {
    paragraphId: label === 'WIDE' ? 'sensitivity-wide' : 'sensitivity-core',
    kind: 'FACT',
    text: `Khi chuyển membership từ ALL sang ${label}, ${revenueText}; ${unitsText}. Đây là độ nhạy membership, không phải tăng trưởng.`,
    claimIds: [revenue.claimId, units.claimId],
    chartIds: ['m03-membership-revenue-sensitivity'],
  };
}

function claim(envelope: M03NarrativeEvidence, claimId: string): Claim {
  const found = envelope.claims.find(candidate => candidate.claimId === claimId);
  if (!found) throw new M03FactualNarrativeIntegrityError(`Required M03 claim is missing: ${claimId}`);
  return found;
}

function verifyNumbers(paragraph: Paragraph, envelope: M03NarrativeEvidence): void {
  const allowed = new Set(paragraph.claimIds.map(id => claim(envelope, id).value).filter((value): value is string => value !== null));
  for (const token of paragraph.text.match(/-?(?:0|[1-9][0-9]*)/g) ?? []) {
    if (!allowed.has(token)) throw new M03FactualNarrativeIntegrityError(`Narrative number is not copied from a cited claim: ${token}`);
  }
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

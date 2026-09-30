import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import catalogSchema from '../../../contracts/analysis/report-section-catalog.schema.json' with { type: 'json' };
import packetSchema from '../../../contracts/analysis/versioned-report-packet.schema.json' with { type: 'json' };
import inputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/metric-scope-output.schema.json' with { type: 'json' };
import type { ReportSectionCatalog } from '../../../contracts/analysis/report-section-catalog.generated.js';
import type { VersionedReportPacket, FactObservation, SectionPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import { calculateMetricScopes } from './metric-scope-calculator.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
const validCatalog = ajv.compile<ReportSectionCatalog>(catalogSchema);
const validResult = ajv.compile<MetricScopeOutput>(resultSchema);
const validPacket = ajv.compile<VersionedReportPacket>(packetSchema);
const hash = (value: Buffer | string): string => createHash('sha256').update(value).digest('hex');
const identity = (value: unknown): string => hash(canonicalJson(value));
const methods: Readonly<Record<string, string>> = {
  M02: 'metric-scope-packet-context', M03: 'metric-scope-packet-totals',
  M04: 'metric-scope-packet-concentration', M08: 'tablet-quote-normalization',
  M13: 'metric-scope-packet-provenance', I03: 'metric-research-method-account', I17: 'evidence-trace-index',
};

export type ReportMethodArtifact = {
  readonly sectionId: 'M02';
  readonly methodVersion: '2.0.0';
  readonly fileName: 'm02-scope-method.json';
  readonly sha256: string;
  readonly methodOutputId: string;
} | {
  readonly sectionId: 'M08';
  readonly methodVersion: '2.0.0';
  readonly fileName: 'm08-tablet-quote-method.json';
  readonly sha256: string;
  readonly methodOutputId: string;
} | {
  readonly sectionId: 'M13';
  readonly methodVersion: '2.0.0';
  readonly fileName: 'm13-provenance-appendix.json';
  readonly sha256: string;
  readonly methodOutputId: string;
} | {
  readonly sectionId: 'I03';
  readonly methodVersion: '2.0.0';
  readonly fileName: 'i03-research-method.json';
  readonly sha256: string;
  readonly methodOutputId: string;
} | {
  readonly sectionId: 'I17';
  readonly methodVersion: '2.0.0';
  readonly fileName: 'i17-evidence-trace.json';
  readonly sha256: string;
  readonly methodOutputId: string;
};

const artifactFile = (sectionId: ReportMethodArtifact['sectionId']): ReportMethodArtifact['fileName'] => {
  if (sectionId === 'M02') return 'm02-scope-method.json';
  if (sectionId === 'M08') return 'm08-tablet-quote-method.json';
  if (sectionId === 'M13') return 'm13-provenance-appendix.json';
  if (sectionId === 'I03') return 'i03-research-method.json';
  return 'i17-evidence-trace.json';
};

function pinnedJson(bytes: Buffer, expected: string, kind: string): unknown {
  if (bytes.length > 32 * 1024 * 1024 || !/^[0-9a-f]{64}$/.test(expected) || hash(bytes) !== expected) {
    throw new TypeError(`${kind}: SIZE_OR_DIGEST_MISMATCH`);
  }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new TypeError(`${kind}: INVALID_JSON_UTF8`); }
}

/** No raw-source authentication or free-text claim intake. Same frozen inputs -> same draft. */
export function createResearchReportPacket(
  resultBytes: Buffer,
  resultSha256: string,
  catalogBytes: Buffer,
  catalogSha256: string,
  methodArtifacts: readonly ReportMethodArtifact[] = [],
) {
  const result = pinnedJson(resultBytes, resultSha256, 'result');
  if (!validResult(result)) throw new TypeError('result: INVALID_CONTRACT');
  const replay = calculateMetricScopes(result.input);
  if (!Buffer.from(canonicalJson(replay) + '\n').equals(resultBytes)) throw new TypeError('result: DETERMINISTIC_REPLAY_MISMATCH');
  const catalog = pinnedJson(catalogBytes, catalogSha256, 'catalog');
  if (!validCatalog(catalog)) throw new TypeError('catalog: INVALID_CONTRACT');
  if (new Set(catalog.sections.map(s => s.sectionId)).size !== catalog.sections.length) throw new TypeError('catalog: DUPLICATE_SECTION_ID');
  if (new Set(methodArtifacts.map(item => item.sectionId)).size !== methodArtifacts.length) {
    throw new TypeError('method artifacts: DUPLICATE_SECTION_ID');
  }
  const artifactBySection = new Map(methodArtifacts.map(item => [item.sectionId, item]));
  for (const artifact of methodArtifacts) {
    const definition = catalog.sections.find(section => section.sectionId === artifact.sectionId);
    const expectedFile = artifactFile(artifact.sectionId);
    if (!definition || definition.methodVersion !== artifact.methodVersion || artifact.fileName !== expectedFile) {
      throw new TypeError('method artifacts: CATALOG_OR_FILE_MISMATCH');
    }
  }

  const claims: FactObservation[] = [];
  const sections: SectionPacket[] = catalog.sections.map(definition => {
    const { sectionId } = definition;
    const claimIds: string[] = [], contextPointers: string[] = [], blockers: string[] = [];
    let deliveryState: SectionPacket['deliveryState'] = definition.fallbackState;
    const methodArtifact = artifactBySection.get(sectionId as ReportMethodArtifact['sectionId']);
    const supported = methods[sectionId] === definition.methodId &&
      (definition.methodVersion === '1.0.0' ||
        ((sectionId === 'M02' || sectionId === 'M08' || sectionId === 'M13' || sectionId === 'I03' || sectionId === 'I17') && definition.methodVersion === '2.0.0'));
    if (!supported) {
      blockers.push(...definition.fallbackReasons);
      if (methods[sectionId]) { deliveryState = 'NOT_IMPLEMENTED'; blockers.push('UNSUPPORTED_SECTION_METHOD_VERSION'); }
    } else {
      deliveryState = 'PARTIAL_DETERMINISTIC_DRAFT';
      if ((sectionId === 'M02' || sectionId === 'M08' || sectionId === 'M13' || sectionId === 'I03' || sectionId === 'I17') && definition.methodVersion === '2.0.0') {
        if (!methodArtifact || methodArtifact.sectionId !== sectionId || methodArtifact.methodVersion !== '2.0.0' ||
            !/^[0-9a-f]{64}$/.test(methodArtifact.sha256) || !/^[0-9a-f]{64}$/.test(methodArtifact.methodOutputId)) {
          deliveryState = 'BLOCKED';
          blockers.push(sectionId === 'M08' ? 'VERIFIED_TABLET_QUOTE_METHOD_ARTIFACT_REQUIRED'
            : sectionId === 'I03' ? 'VERIFIED_RESEARCH_METHOD_ARTIFACT_REQUIRED'
              : sectionId === 'I17' ? 'RESOLVED_EVIDENCE_TRACE_ARTIFACT_REQUIRED'
              : 'VERIFIED_SOURCE_METHOD_ARTIFACT_REQUIRED');
        } else {
          blockers.push('OWNER_REVIEW_REQUIRED');
          if (sectionId === 'M08') blockers.push(
            'FULL_M08_UNIT_ECONOMICS_NOT_IMPLEMENTED',
            'SINGLE_QUOTE_ONLY_NO_COMPARISON_OR_RANKING',
          );
        }
      } else {
        blockers.push('FULL_SECTION_METHOD_NOT_IMPLEMENTED', 'RAW_SOURCE_NOT_REVERIFIED', 'OWNER_REVIEW_REQUIRED');
      }
      if (sectionId !== 'M08' && result.input.scope.acquiredAt === null) blockers.push('ACQUISITION_TIME_UNCONFIRMED');
      if (sectionId !== 'M08') contextPointers.push('/input/scope');
      if (sectionId === 'M02') contextPointers.push('/input/profileId', '/input/labelCodebookVersion', '/input/wideUnknownPolicy', '/labelIssues');
      if (sectionId === 'M13') contextPointers.push('/input/sources', '/input/records');
      if (sectionId === 'I03') contextPointers.push('/input/profileId', '/input/labelCodebookVersion', '/input/wideUnknownPolicy', '/labelIssues', '/scopes');
      if (sectionId === 'M03' || sectionId === 'M04') for (const [i, scope] of result.scopes.entries()) {
        const base = `/scopes/${i}`;
        if (scope.status === 'BLOCKED_LABELS') { blockers.push(`${scope.key}:BLOCKED_LABELS`); continue; }
        blockers.push(...scope.warnings.map(w => `${scope.key}:${w}`));
        const emit = (kind: FactObservation['statementKind'], suffix: string, value: string | number,
          unit: FactObservation['unit'], metricPointer: string, coveragePointer: string | null,
          denominatorPointer: string | null = null) => {
          const claimId = `${sectionId}:${scope.key}:${suffix}`;
          const claim: FactObservation = {
            claimId, sectionId, claimType: 'FACT', evidenceState: 'DETERMINISTIC_NORMALIZED_OBSERVATION', approvalState: 'UNREVIEWED',
            statementKind: kind, scopeKey: scope.key, value, unit, metricPointer, scopePointer: '/input/scope',
            membershipPointer: `${base}/recordIndices`, denominatorPointer, coveragePointer,
            limitations: ['OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE', 'SOURCE_PROVENANCE_DECLARED_NOT_AUTHENTICATED',
              ...(result.input.scope.acquiredAt === null ? ['ACQUISITION_TIME_UNCONFIRMED'] : []),
              ...scope.warnings],
          };
          claims.push(claim); claimIds.push(claimId);
        };
        if (sectionId === 'M03') {
          emit('LISTING_COUNT', 'listings', scope.listingCount, 'listing', `${base}/listingCount`, null);
          emit('SHOP_COUNT', 'shops', scope.shopCount, 'shop', `${base}/shopCount`, null);
          for (const [key, kind, unit] of [['revenue', 'OBSERVED_REVENUE', 'VND'], ['units', 'OBSERVED_UNITS', 'unit']] as const) {
            const total = scope[key];
            if (total.value === null) blockers.push(`${scope.key}:${key}:NO_OBSERVED_VALUE`);
            else emit(kind, key, total.value, unit, `${base}/${key}/value`, `${base}/${key}`);
          }
        } else {
          for (const [j, concentration] of scope.concentration.entries()) {
            if (!concentration.share) { blockers.push(`${scope.key}:top${concentration.k}:NO_ELIGIBLE_DENOMINATOR`); continue; }
            emit('TOP_SHOP_SHARE', `top${concentration.k}`, concentration.share.percent, 'percent',
              `${base}/concentration/${j}/share/percent`, `${base}/revenue`, `${base}/concentration/${j}/share/denominator`);
          }
        }
      }
      if ((sectionId === 'M03' || sectionId === 'M04') && claimIds.length === 0) {
        deliveryState = 'BLOCKED';
        blockers.push('NO_ELIGIBLE_OBSERVATIONS');
      }
    }
    const section = {
      sectionId, deliveryState, claimIds, contextPointers, blockers: [...new Set(blockers)],
      ...(methodArtifact && definition.methodVersion === '2.0.0' ? { methodArtifact: {
        fileName: methodArtifact.fileName, sha256: methodArtifact.sha256, methodOutputId: methodArtifact.methodOutputId,
      } } : {}),
    };
    return { ...section, sectionSha256: identity({ policyVersion: 'report-packet-a3a-v1', definition,
      metricResultSha256: resultSha256, claims: claims.filter(c => c.sectionId === sectionId), ...section }) };
  });
  const content: Omit<VersionedReportPacket, 'packetId'> = {
    contractVersion: '1.0.0', policyVersion: 'report-packet-a3a-v1', rendererVersion: 'report-packet-vi-v1',
    status: 'DRAFT', approvalState: 'UNREVIEWED', sourceVerification: 'NORMALIZED_INPUT_ONLY',
    claimPolicy: 'APPLICATION_DERIVED_FACT_OBSERVATIONS_ONLY', catalogSha256, metricResultSha256: resultSha256,
    inputSha256: result.inputSha256, metricMethodVersion: result.methodVersion, metricRounding: result.rounding,
    metricRendererVersion: result.rendererVersion, catalog, scope: result.input.scope, declaredSources: result.input.sources,
    sections, claims,
  };
  const packet: VersionedReportPacket = { ...content, packetId: identity(content) };
  if (!validPacket(packet)) throw new TypeError('packet: INVALID_OUTPUT_CONTRACT');
  return { packet, report: render(packet, result) };
}

const literal = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/[\\`*_[\]#|]/g, c => `&#${c.charCodeAt(0)};`);

// Only reachable with freshly replayed results and application-derived claims.
function render(packet: VersionedReportPacket, result: MetricScopeOutput): string {
  const lines = ['# Hồ sơ bản nháp Market / Insight', '',
    '> DRAFT · UNREVIEWED — chưa được OWNER duyệt; không phải kết luận chính thức.', '',
    'Chỉ tái kiểm phép tính từ đầu vào chuẩn hóa. Chưa mở lại nguồn gốc; hash và thời điểm thu nhận dưới đây là thông tin được khai báo, không xác thực nhà cung cấp.',
    'FACT ở đây là quan sát của dữ liệu đầu vào, không phải bằng chứng về toàn thị trường, động cơ mua, hiệu quả sức khỏe hay quan hệ nhân quả.',
    'Chưa nhận suy luận (INFERENCE), giả thuyết (HYPOTHESIS) hoặc corpus Insight. Không tự điền phần thiếu.', '',
    `Packet: ${packet.packetId}`, `Result bytes: ${packet.metricResultSha256}`, `Catalog bytes: ${packet.catalogSha256}`,
    `Phạm vi: ${literal(packet.scope.key)} · ${packet.scope.platform} · ${packet.scope.selection}`,
    `Kỳ đo khai báo: ${packet.scope.start} → ${packet.scope.end}. Thu nhận khai báo: ${packet.scope.acquiredAt ?? 'chưa xác nhận — không suy đoán từ kỳ đo hoặc ngày sửa file'}.`,
    `Cơ sở kỳ: ${literal(packet.scope.periodBasis)}`, '',
    `Catalog: ${literal(packet.catalog.catalogId)} @ ${literal(packet.catalog.catalogVersion)} — metadata kế hoạch, không phải phương pháp đã thực thi.`,
    'Nhãn maturity chỉ thuộc mẫu báo cáo lịch sử, không chứng minh độ trưởng thành của bản nháp này. Có mục trong catalog không đồng nghĩa đã hoàn thành.', ''];
  const claims = new Map(packet.claims.map(c => [c.claimId, c]));
  for (const [i, section] of packet.sections.entries()) {
    const definition = packet.catalog.sections[i]!;
    lines.push(`## ${section.sectionId} — ${literal(definition.title)}`, '',
      `Trạng thái: ${section.deliveryState}. Maturity mẫu lịch sử: ${definition.historicalTemplateMaturity}.`,
      `Phương pháp kế hoạch: ${literal(definition.methodId)} @ ${literal(definition.methodVersion)}`,
      `Đầu vào yêu cầu (kế hoạch): ${definition.requiredInputs.map(literal).join('; ')}`, '',
      ...section.blockers.map(b => `- Giới hạn / còn thiếu: ${literal(b)}`));
    for (const pointer of section.contextPointers) lines.push(`- Ngữ cảnh trong metric-result.json: ${pointer}`);
    if (section.methodArtifact) lines.push(`- Hồ sơ phương pháp: ${section.methodArtifact.fileName} · ${section.methodArtifact.sha256} · output ${section.methodArtifact.methodOutputId}`);
    for (const id of section.claimIds) {
      const claim = claims.get(id)!;
      const scope = result.scopes.find(s => s.key === claim.scopeKey)!;
      let sentence: string;
      switch (claim.statementKind) {
        case 'LISTING_COUNT': sentence = `${claim.value} listing (không đồng nghĩa sản phẩm độc lập)`; break;
        case 'SHOP_COUNT': sentence = `${claim.value} shop theo ID`; break;
        case 'OBSERVED_REVENUE': case 'OBSERVED_UNITS': {
          const total = claim.statementKind === 'OBSERVED_REVENUE' ? scope.revenue : scope.units;
          sentence = `${claim.statementKind === 'OBSERVED_REVENUE' ? 'Doanh thu' : 'Sản lượng'} cộng phần quan sát: ${claim.value} ${claim.unit}; ${total.observedCount} dòng có giá trị, ${total.missingCount} dòng thiếu, ${total.nonExactCount} dòng không có precision exact`;
          break;
        }
        case 'TOP_SHOP_SHARE': {
          const c = scope.concentration.find(c => claim.claimId === `${claim.sectionId}:${scope.key}:top${c.k}`)!;
          sentence = `Top ${c.k} shop (thực dùng ${c.usedShopCount}): ${claim.value}%; mẫu số ${c.share!.denominator} VND trong tập quan sát; ${scope.revenue.nonExactCount} dòng không có precision exact`;
          break;
        }
      }
      lines.push('', `- FACT · ${claim.scopeKey}: ${sentence}.`,
        `  Ref: ${packet.metricResultSha256}#${claim.metricPointer}; membership: ${claim.membershipPointer}; scope/kỳ: ${claim.scopePointer}.`,
        ...(claim.denominatorPointer ? [`  Mẫu số: ${claim.denominatorPointer}.`] : []));
    }
    lines.push('', `Mở lại khi (kế hoạch): ${literal(definition.reopenCondition)}`, '');
  }
  lines.push('## Nguồn khai báo — chưa xác minh lại bytes', '');
  for (const source of packet.declaredSources) lines.push(`- ${literal(source.label)} · ${source.sha256} · ${literal(source.evidenceFamily)} · ${source.representationRole} · ${literal(source.provenanceBasis)}`);
  return lines.join('\n') + '\n';
}

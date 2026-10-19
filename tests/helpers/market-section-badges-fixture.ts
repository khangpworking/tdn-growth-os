import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { descriptiveReaderFixture } from './descriptive-reader-fixture.js';
import { headlineInput, headlineRows } from './market-headline-fixture.js';
import { fullMarket14Input } from './market14-full-fixture.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { calculateMetricScopes, metricLabelFingerprint } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

type Methods = NonNullable<AutomationReportInput['descriptiveMethods']>;
type MethodInput = Methods['input'];
export type BadgeProduct = 'background' | 'observed' | 'empty';
export const badgeProducts = {
  background: { title: 'Ấm mẫu Hổ Phách', ref: 'kalodata:91001' },
  observed: { title: 'Khăn mẫu San Hô', ref: 'kalodata:92002' },
  empty: { title: 'Đèn mẫu Lam Ngọc', ref: 'synthetic:93003' },
} as const;

export function withBadgeMethods(input: AutomationReportInput, patch: Partial<MethodInput>): AutomationReportInput {
  return { ...input, descriptiveMethods: buildDescriptiveMarketMethods({ ...input.descriptiveMethods!.input, ...patch },
    { methodVersion: '1.1.0' }).output };
}

export function badgeEvent(namedScope: string, eventDate: string | null, statement = false): MethodInput['m09'][number] {
  const template = descriptiveReaderFixture().input.m09[1]!;
  return { ...template, namedScope, eventDate, source: { ...template.source, locator: `/events/${eventDate ?? 'undated'}/${statement ? 'statement' : 'launch'}` },
    sourceWording: statement ? 'Nguồn ghi nhận một đợt thay đổi bao bì trong kỳ.' : JSON.stringify({ launch_date: eventDate }),
    statementType: statement ? 'COUNTEREVIDENCE' : 'UNCLASSIFIED' };
}

const inputs = new Map<BadgeProduct, Promise<AutomationReportInput>>();
/** Three synthetic products with different retained rows, search and event compositions. */
export function sectionBadgeInput(product: BadgeProduct): Promise<AutomationReportInput> {
  let pending = inputs.get(product);
  if (!pending) {
    pending = (async () => {
      const spec = badgeProducts[product];
      const rows = headlineRows().map(row => ({ ...row, title: `${spec.title} ${row.i}`, listing: `${product}-${row.i}` }));
      const input = await headlineInput(rows);
      const methods = descriptiveReaderFixture();
      const supply = { ...methods.input.m06[1]!, observation: { ...methods.input.m06[1]!.observation, entityLabel: spec.title } };
      const peer = { ...methods.input.m07[0]!, entityLabel: spec.title };
      const classifiedInput = metricFixture();
      classifiedInput.records = classifiedInput.records.slice(0, 2).map((row, index) => {
        const record = { ...row, title: `${spec.title} ${index}`, shopId: `synthetic-shop-${index}` };
        return { ...record, label: { ...record.label!, group: 'Nhóm mẫu',
          contentSha256: metricLabelFingerprint(classifiedInput.scope.platform, record) } };
      });
      const result = calculateMetricScopes(classifiedInput);
      const metricClassified: NonNullable<AutomationReportInput['metricClassified']> = {
        contractVersion: 'automation-classified-metric-v1', result, proofSha256: 'a'.repeat(64),
        binding: { workspaceId: input.run.workspaceId, runId: input.run.runId, pairId: 'b'.repeat(64),
          adoptionId: 'c'.repeat(64), adoptionSha256: 'd'.repeat(64), preparationSha256: 'e'.repeat(64),
          inputSha256: result.inputSha256, sourcePackageId: '33333333-3333-4333-8333-333333333333', scopeSha256: 'f'.repeat(64) },
        selection: { adoptionId: 'c'.repeat(64), receiptIds: ['44444444-4444-4444-8444-444444444444'] },
      };
      const { searchInterest: _interest, searchGeo: _geo, ...collection } = input.collection!;
      return withBadgeMethods({ ...input, descriptiveMethods: methods,
        start: { ...input.start, keyword: spec.title, defaultPeerRule: { ...DEFAULT_MARKET_PEER_RULE } },
        ...(product === 'observed' ? { metricClassified } : {}),
        scope: { ...input.scope, selectedProductIds: [spec.ref] },
        collection: { ...(product === 'observed' ? input.collection! : collection),
          productCards: [{ productId: spec.ref, title: spec.title, provider: 'synthetic', sourceProductId: spec.ref,
            role: 'PRINCIPAL', sourceUrl: null, imageUrl: null, description: null, descriptionState: 'UNAVAILABLE',
            observedWindow: null, retrievedAt: '2026-01-20T00:00:00Z' }] },
      }, { m05: [], m06: product === 'observed' ? [supply] : [], m07: product === 'observed' ? [peer] : [],
        m09: product === 'empty' ? [] : [badgeEvent(spec.ref, '2026-01-15'),
          ...(product === 'observed' ? [badgeEvent(spec.ref, '2026-01-20', true)] : [])] });
    })();
    inputs.set(product, pending);
  }
  return pending;
}

/** Exercises readerPlainText via the source-evidence version, independently of market14. */
export async function plainM09ControlInput(): Promise<AutomationReportInput> {
  const { marketPresentation: _presentation, ...input } = await fullMarket14Input();
  return { ...input, descriptiveMethods: descriptiveReaderFixture(),
    start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' },
    sourceEvidence: buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] }) };
}

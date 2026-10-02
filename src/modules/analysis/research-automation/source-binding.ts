import type {
  CollectInput,
  CollectResult,
  ProviderCallOptions,
  ProductCard as ProviderProductCard,
  ProviderRawCapture,
  QuickSearchInput,
  QuickSearchResult,
  ResearchAutomationProvider,
} from './providers.js';
import type { ResearchAutomationProductCard } from '../../../../contracts/api/research-automation-api.generated.js';
import { ResearchAutomationProviderOutputError, type SourceLimitation, type StepResultDocument } from './model.js';
import type { DateWindow } from './providers.js';

/** The backend-facing source port. Provider-specific credentials and transport stay behind this port. */
export interface AutomationSourcePort {
  readonly id: ResearchAutomationProvider['id'];
  quickSearch(input: QuickSearchInput, options?: ProviderCallOptions): Promise<BoundQuickSearchResult>;
  collect(input: CollectInput, options?: ProviderCallOptions): Promise<BoundCollectResult>;
}

export interface BoundQuickSearchResult {
  readonly result: QuickSearchResult;
  readonly step: StepResultDocument;
}

export interface BoundCollectResult {
  readonly result: CollectResult;
  readonly step: StepResultDocument;
}

/**
 * Adapts the provider lane's internal contract to the lifecycle service. The
 * service persists the result and raw captures; this adapter only normalizes
 * public product cards, coverage and typed single-product comparables.
 */
export function bindResearchAutomationProvider(provider: ResearchAutomationProvider): AutomationSourcePort {
  return {
    id: provider.id,
    async quickSearch(input, options) {
      const result = await provider.quickSearch(input, options);
      return { result, step: quickSearchStep(input.runId, result) };
    },
    async collect(input, options) {
      const result = await provider.collect(input, options);
      return { result, step: collectStep(input.runId, result) };
    },
  };
}

function quickSearchStep(runId: string, result: QuickSearchResult): StepResultDocument {
  return {
    contractVersion: 'research-automation-step-result-v1',
    runId,
    stepId: 'QUICK_SEARCH',
    outcome: internalOutcome(result.status),
    productCards: result.cards.map((card) => toPublicCard(card, result.captures)),
    comparables: [],
    coverage: result.coverage.map(toCoverage),
    limitations: result.limitations.map((code) => limitation(code, result.provider)),
  };
}

function collectStep(runId: string, result: CollectResult): StepResultDocument {
  return {
    contractVersion: 'research-automation-step-result-v1',
    runId,
    stepId: 'COLLECTION',
    outcome: internalOutcome(result.status),
    productCards: [],
    // A period sum spans several raw captures, while the backend's compact
    // comparable contract accepts one capture index. Keep this empty until a
    // renderer can carry every contributing capture and a verified metric unit.
    comparables: [],
    coverage: result.coverage.map(toCoverage),
    limitations: [
      ...result.limitations.map((code) => limitation(code, result.provider)),
      ...result.webResults.map((value) => limitation(value.semantics, 'SERPAPI')),
    ],
  };
}

function toPublicCard(card: ProviderProductCard, captures: readonly ProviderRawCapture[]): ResearchAutomationProductCard {
  const rankCapture = captures.find((capture) => capture.captureId === card.provenance.rankCaptureId);
  if (!rankCapture || rankCapture.provider !== card.provider || rankCapture.operation !== 'kalodata.product.rank' ||
      rankCapture.outcome !== 'OK' || rankCapture.queryWindow === null ||
      rankCapture.queryWindow.startDate !== card.rank.window.startDate || rankCapture.queryWindow.endDate !== card.rank.window.endDate ||
      !Number.isFinite(Date.parse(rankCapture.completedAt))) {
    throw new ResearchAutomationProviderOutputError('Provider card is missing a successful rank capture.');
  }
  const description = card.description.status === 'AVAILABLE' ? card.description.text : null;
  const descriptionState: ResearchAutomationProductCard['descriptionState'] = card.description.status === 'AVAILABLE'
    ? 'PRESENT'
    : card.description.status === 'MISSING_EMPTY' ? 'EMPTY' : 'UNAVAILABLE';
  return {
    productId: card.ref,
    provider: card.provider.toLowerCase(),
    sourceProductId: card.sourceProductId,
    role: 'PRINCIPAL',
    title: card.name || null,
    sourceUrl: safeHttps(card.providerPageUrl),
    imageUrl: card.image.status === 'AVAILABLE' ? safeHttps(card.image.url) : null,
    description,
    descriptionState,
    observedWindow: {
      startDate: card.price.observedWindow.startDate,
      endDate: card.price.observedWindow.endDate,
      label: 'QUICK_SEARCH_RECENT_WINDOW',
    },
    retrievedAt: rankCapture.completedAt,
  };
}

function toCoverage(value: {
  readonly provider: string;
  readonly operation: string;
  readonly status: string;
  readonly requestedPeriod: DateWindow | null;
  readonly truncated: boolean;
  readonly queryWindows: readonly { readonly window: DateWindow | null; readonly status: string }[];
  readonly limitations: readonly string[];
}): import('../../../../contracts/api/research-automation-api.generated.js').ResearchAutomationCoverageSource {
  const notRun = value.queryWindows.some((item) => item.status === 'NOT_RUN_BOUND' || item.status === 'NOT_RUN_CANCELLED');
  const dates = value.queryWindows.filter((item) => !item.status.startsWith('NOT_RUN_')).map((item) => item.window).filter((item): item is DateWindow => item !== null).sort(compareWindows);
  const incomplete = notRun || hasDateHole(dates);
  return {
    provider: value.provider.toLowerCase(),
    dataset: value.operation.toLowerCase(),
    state: coverageState(value.status, incomplete),
    observedStartDate: dates[0]?.startDate ?? null,
    observedEndDate: dates.at(-1)?.endDate ?? null,
    truncated: value.truncated || incomplete,
    note: value.limitations.length > 0 ? value.limitations[0]! : null,
  };
}

function compareWindows(left: DateWindow, right: DateWindow): number {
  return left.startDate.localeCompare(right.startDate) || left.endDate.localeCompare(right.endDate);
}

function hasDateHole(windows: readonly DateWindow[]): boolean {
  for (let index = 1; index < windows.length; index += 1) {
    const previousEnd = Date.parse(`${windows[index - 1]!.endDate}T00:00:00Z`);
    const currentStart = Date.parse(`${windows[index]!.startDate}T00:00:00Z`);
    if (!Number.isFinite(previousEnd) || !Number.isFinite(currentStart) || currentStart > previousEnd + 86_400_000) return true;
  }
  return false;
}

function coverageState(value: string, hasHole: boolean): import('../../../../contracts/api/research-automation-api.generated.js').ResearchAutomationCoverageSource['state'] {
  switch (value) {
    case 'QUERIES_COMPLETE': return hasHole ? 'PARTIAL' : 'COLLECTED';
    case 'EMPTY': return hasHole ? 'PARTIAL' : 'COLLECTED';
    case 'PARTIAL': return 'PARTIAL';
    case 'WAITING_FOR_INPUT': return 'WAITING_FOR_INPUT';
    case 'UNSUPPORTED': return 'UNSUPPORTED';
    case 'NOT_CONFIGURED': return 'UNAVAILABLE';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'FAILED';
  }
}

function internalOutcome(value: string): StepResultDocument['outcome'] {
  switch (value) {
    case 'SUCCEEDED': return 'SUCCEEDED';
    case 'PARTIAL': return 'PARTIAL';
    case 'NOT_CONFIGURED':
    case 'UNSUPPORTED':
    case 'WAITING_FOR_INPUT': return 'UNAVAILABLE';
    case 'CANCELLED': return 'CANCELLED';
    default: return 'FAILED';
  }
}

function limitation(code: string, provider: string): SourceLimitation {
  return { code: safeCode(code), provider: provider.toLowerCase(), message: limitationMessage(code) };
}

function limitationMessage(code: string): string {
  // Provider limitation identifiers are data, not user-facing prose. Keep the
  // projection safe and bounded; the report layer can render the identifier.
  return `Source limitation: ${safeCode(code)}`;
}

function safeCode(value: string): string {
  const code = value.toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 80);
  return code || 'SOURCE_LIMITATION';
}

function safeHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.hash ? url.toString() : null;
  } catch {
    return null;
  }
}

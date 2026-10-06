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
import { MAX_WEB_RESULTS, message, ResearchAutomationProviderOutputError, type SourceLimitation, type SourceStepId, type StepResultDocument, type StepWebResult, type TypedComparable } from './model.js';
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
      try { return { result, step: quickSearchStep(input.runId, result) }; }
      catch (error) {
        if (!(error instanceof ResearchAutomationProviderOutputError)) throw error;
        return { result, step: invalidProviderStep(input.runId, 'QUICK_SEARCH') };
      }
    },
    async collect(input, options) {
      const result = await provider.collect(input, options);
      try { return { result, step: collectStep(input.runId, result) }; }
      catch (error) {
        if (!(error instanceof ResearchAutomationProviderOutputError)) throw error;
        return { result, step: invalidProviderStep(input.runId, 'COLLECTION') };
      }
    },
  };
}

/** Rejects normalized projections without losing the completed provider exchange. */
export function invalidProviderStep(runId: string, stepId: SourceStepId): StepResultDocument {
  return {
    contractVersion: 'research-automation-step-result-v1', runId, stepId, outcome: 'FAILED',
    productCards: [], comparables: [], coverage: [],
    limitations: [{ code: 'PROVIDER_OUTPUT_INVALID', provider: null, message: message('PROVIDER_OUTPUT_INVALID') }],
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
  const comparables: TypedComparable[] = [];
  const limitations = result.limitations.map((code) => limitation(code, result.provider));
  const seen = new Set<string>();
  for (const observation of result.productObservations) {
    const captureIndex = result.captures.findIndex(capture => capture.captureId === observation.captureId);
    const capture = result.captures[captureIndex];
    if (result.provider !== 'KALODATA' || observation.currency !== 'VND' ||
        !capture || capture.provider !== result.provider || capture.operation !== 'kalodata.product.detail' ||
        capture.outcome !== 'OK' || capture.productRef !== observation.productRef ||
        capture.queryWindow?.startDate !== observation.window.startDate || capture.queryWindow.endDate !== observation.window.endDate ||
        observation.window.startDate < result.requestedPeriod.startDate || observation.window.endDate > result.requestedPeriod.endDate) {
      throw new ResearchAutomationProviderOutputError('Product observation is missing compatible source capture lineage.');
    }
    for (const [metric, value] of [['GMV_VND', observation.revenue], ['UNITS_SOLD', observation.salesVolume]] as const) {
      if (value === null) continue;
      // Preserve each source window, not the provider's floating-point period
      // sum. This keeps one exact capture reference per observation.
      if (!Number.isFinite(value) || value < 0 || value > Number.MAX_SAFE_INTEGER ||
          (metric === 'UNITS_SOLD' && !Number.isSafeInteger(value)) || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(String(value))) {
        limitations.push(limitation('METRIC_OUTSIDE_SUPPORTED_DECIMAL_RANGE', result.provider));
        continue;
      }
      const key = JSON.stringify([observation.productRef, metric, observation.window]);
      if (seen.has(key)) throw new ResearchAutomationProviderOutputError('Duplicate product metric window.');
      seen.add(key);
      comparables.push({ productId: observation.productRef, provider: result.provider.toLowerCase(), metric, value: String(value), window: observation.window, captureIndex });
    }
  }
  const webResults = toWebResults(result);
  return {
    contractVersion: 'research-automation-step-result-v1',
    runId,
    stepId: 'COLLECTION',
    outcome: internalOutcome(result.status),
    productCards: [],
    comparables,
    coverage: result.coverage.map(toCoverage),
    limitations,
    ...(webResults.length ? { webResults } : {}),
  };
}

/** Keeps https organic results with exact capture lineage; text is bounded, never interpreted. */
function toWebResults(result: CollectResult): StepWebResult[] {
  const out: StepWebResult[] = [];
  for (const value of result.webResults) {
    const captureIndex = result.captures.findIndex(capture => capture.captureId === value.captureId);
    const capture = result.captures[captureIndex];
    if (!capture || capture.provider !== result.provider || capture.outcome !== 'OK') {
      throw new ResearchAutomationProviderOutputError('Web result is missing its source capture.');
    }
    const url = safeHttps(value.url);
    const title = boundedText(value.title, 300);
    if (!url || url.length > 2000 || !title || !Number.isSafeInteger(value.position) || value.position < 1 ||
        !Number.isFinite(Date.parse(value.retrievedAt))) continue;
    out.push({ position: value.position, title, url, snippet: value.snippet === null ? null : boundedText(value.snippet, 1000), retrievedAt: value.retrievedAt, captureIndex });
    if (out.length === MAX_WEB_RESULTS) break;
  }
  return out;
}

function boundedText(value: string, max: number): string | null {
  const text = value.normalize('NFC').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, max) : null;
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
  // Only a successful or explicitly empty response is an observation. Failed,
  // ambiguous and unexecuted windows still describe attempted scope, but must
  // not extend the observed evidence period.
  const dates = value.queryWindows.filter((item) => item.status === 'OK' || item.status === 'EMPTY')
    .map((item) => item.window).filter((item): item is DateWindow => item !== null).sort(compareWindows);
  const incomplete = value.queryWindows.some((item) => item.status !== 'OK' && item.status !== 'EMPTY') || hasDateHole(dates);
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

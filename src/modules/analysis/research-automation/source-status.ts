import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from '../../../../contracts/api/research-automation-source-status-api.generated.js';
import type { ResearchAutomationProviderConfig } from './providers.js';
import type { ResearchAutomationSourceActivity, ResearchAutomationSourceActivityKey } from './service.js';

export interface SourceStatusInput {
  readonly workspaceId: string;
  readonly checkedAt: string;
  /** True only when this server owns the writer and worker that execute runs. */
  readonly executorEnabled: boolean;
  readonly providers: ResearchAutomationProviderConfig | undefined;
  /** Sources the executor actually calls during a run. Web search is configured separately from run wiring. */
  readonly wired: { readonly kalodata: boolean; readonly serpapi: boolean; readonly apifyShopee: boolean };
  readonly activity: Record<ResearchAutomationSourceActivityKey, ResearchAutomationSourceActivity>;
}

/** Configuration and stored history only: no provider is called and no credential value leaves the server. */
export function buildResearchAutomationSourceStatus(input: SourceStatusInput): ResearchAutomationSourceStatus {
  const providers = input.providers;
  const paidSource = (source: 'KALODATA' | 'SERPAPI' | 'APIFY_SHOPEE', key: Exclude<ResearchAutomationSourceActivityKey, 'metric'>,
    credentialPresent: boolean, usable: boolean, wired: boolean): ResearchAutomationSourceStatusEntry => ({
    source,
    state: !input.executorEnabled ? 'EXECUTOR_DISABLED' : !usable ? 'NOT_CONFIGURED' : wired ? 'READY' : 'CONFIGURED_NOT_WIRED',
    credential: credentialPresent ? 'CONFIGURED' : 'MISSING',
    wiredIntoRuns: wired, paid: true, ...input.activity[key],
  });
  const apifyToken = Boolean(providers?.apifyTokenConfigured || providers?.apifyReviews);
  return {
    contractVersion: 'research-automation-source-status-v1',
    workspaceId: input.workspaceId,
    checkedAt: input.checkedAt,
    executorEnabled: input.executorEnabled,
    sources: [
      paidSource('KALODATA', 'kalodata', Boolean(providers?.kalodataSecretKey), Boolean(providers?.kalodataSecretKey), input.wired.kalodata),
      paidSource('SERPAPI', 'serpapi', Boolean(providers?.serpApiKey), Boolean(providers?.serpApiKey), input.wired.serpapi),
      // Paid review collection also needs a spending cap; a token alone never starts a collection.
      paidSource('APIFY_SHOPEE', 'apify-shopee', apifyToken, Boolean(providers?.apifyReviews), input.wired.apifyShopee),
      {
        source: 'METRIC', state: input.executorEnabled ? 'MANUAL_IMPORT' : 'EXECUTOR_DISABLED', credential: 'NOT_REQUIRED',
        wiredIntoRuns: true, paid: false, ...input.activity.metric, lastUsageAt: null,
      },
    ],
  };
}

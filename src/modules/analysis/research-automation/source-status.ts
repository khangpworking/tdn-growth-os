import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from '../../../../contracts/api/research-automation-source-status-api.generated.js';
import type { ResearchAutomationProviderConfig } from './providers.js';
import type { ResearchAutomationSourceActivity, ResearchAutomationSourceActivityKey } from './service.js';

/** Live document-indexing connector state for the status card. Built server-side; no key value is included. */
export interface PageIndexStatusSummary {
  /** True when the server holds a document-indexing key (value never leaves the server). */
  readonly keyConfigured: boolean;
  /** False when the TDN_PAGEINDEX_CLOUD_ENABLED kill switch is off. */
  readonly enabled: boolean;
  readonly lastCallAt: string | null;
  readonly documentsSent: number | null;
  readonly balanceMicroDollars: number | null;
  readonly balanceCheckedAt: string | null;
  readonly billingUrl: string | null;
  readonly activePages: number | null;
  readonly estimatedMonthlyCostMicroDollars: number | null;
  readonly lowBalance: boolean;
  readonly usageLimited: boolean;
}

export interface SourceStatusInput {
  readonly workspaceId: string;
  readonly checkedAt: string;
  /** True only when this server owns the writer and worker that execute runs. */
  readonly executorEnabled: boolean;
  readonly providers: ResearchAutomationProviderConfig | undefined;
  /** Sources the executor actually calls during a run. Web search is configured separately from run wiring. */
  readonly wired: { readonly kalodata: boolean; readonly serpapi: boolean; readonly apifyShopee: boolean };
  readonly activity: Record<ResearchAutomationSourceActivityKey, ResearchAutomationSourceActivity>;
  /** Absent until the API route passes live connector state; the card then shows the not-connected copy. */
  readonly pageindex?: PageIndexStatusSummary;
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
  const pageindex = input.pageindex;
  const pageindexUsable = Boolean(pageindex?.keyConfigured && pageindex?.enabled);
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
      {
        source: 'PAGEINDEX',
        state: !input.executorEnabled ? 'EXECUTOR_DISABLED' : !pageindexUsable ? 'NOT_CONFIGURED' : 'READY',
        credential: pageindex?.keyConfigured ? 'CONFIGURED' : 'MISSING',
        wiredIntoRuns: pageindexUsable,
        paid: true,
        lastDataAt: null,
        dataCount: pageindex?.documentsSent ?? null,
        lastUsageAt: pageindex?.lastCallAt ?? null,
        pageindex: {
          automaticState: !input.executorEnabled || !pageindexUsable ? 'DISABLED' : pageindex?.lowBalance || pageindex?.usageLimited ? 'PAUSED_LOW_BALANCE' : 'INDEXING_PDFS',
          documentsSent: pageindex?.documentsSent ?? null,
          balanceMicroDollars: pageindex?.balanceMicroDollars ?? null,
          balanceCheckedAt: pageindex?.balanceCheckedAt ?? null,
          billingUrl: pageindex?.billingUrl ?? null,
          activePages: pageindex?.activePages ?? null,
          estimatedMonthlyCostMicroDollars: pageindex?.estimatedMonthlyCostMicroDollars ?? null,
          usageLimited: pageindex?.usageLimited ?? false,
        },
      },
    ],
  };
}

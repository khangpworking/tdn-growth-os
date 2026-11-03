import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createSerpApiProvider } from '../../src/modules/analysis/research-automation/provider-serpapi.js';
import { createExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { createSearchSuggestSource } from '../../src/modules/analysis/research-automation/search-suggest-lane.js';
import { createAiOverviewSource } from '../../src/modules/analysis/research-automation/ai-overview-lane.js';
import { validateMetricV3CaptureSpec } from '../../src/modules/analysis/research-automation/metric-v3-capture-spec.js';
import type { ProviderCallOptions, ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

export const BASES = ['synthetic jar', 'synthetic bottle'] as const;
export const WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const RUN = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');

export type Reply = { status?: number; raw?: string; body?: unknown };
export function fakeGoogleTransport(answer: (url: URL, index: number) => Reply = () => ({})) {
  const requests: { url: URL; started: number; ended: number; bytes: Buffer }[] = [];
  let clock = now().getTime();
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(input instanceof Request ? input.url : String(input));
      assert.ok(['suggestqueries.google.com', 'serpapi.com'].includes(url.hostname), 'fake refuses unexpected providers');
      const started = clock;
      const index = requests.length;
      const reply = answer(url, index);
      const body = reply.body ?? (url.hostname === 'suggestqueries.google.com'
        ? [url.searchParams.get('q'), [`${url.searchParams.get('q')} suggestion`]]
        : { search_parameters: { q: url.searchParams.get('q'), page_token: url.searchParams.get('page_token') }, organic_results: [] });
      // Whitespace makes a parse/stringify round trip observably different from the original bytes.
      const bytes = Buffer.from(reply.raw ?? ` \n${JSON.stringify(body, null, 2)}\r\n`);
      clock += 200;
      requests.push({ url, started, ended: clock, bytes });
      return new Response(new Uint8Array(bytes), { status: reply.status ?? 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async (ms, signal) => { if (signal?.aborted) throw new Error('synthetic aborted'); clock += ms; },
    now: () => clock,
  };
  return { transport, requests };
}

export interface CollectorRunOptions {
  flags?: { suggest?: string; overview?: string };
  reports?: ('MARKET' | 'INSIGHT')[];
  /** Synthetic confirmed base terms supplied at the existing collector port, like the ads-lane fixture's brands. */
  keywords?: readonly string[];
  /** Synthetic explicit start preset, exercising confirmed keywords without overriding the collector input. */
  presetKeywords?: readonly string[];
  expanded?: boolean;
  answer?: (url: URL, index: number) => Reply;
}

export async function googleCollectorRun(t: TestContext, options: CollectorRunOptions = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-google-collectors-'));
  const databasePath = path.join(root, 'test.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const frontendDist = path.join(root, 'frontend');
  await fs.mkdir(path.join(frontendDist, 'assets'), { recursive: true });
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<!doctype html><script src="./assets/app.js"></script>');
  await fs.writeFile(path.join(frontendDist, 'assets/app.js'), 'globalThis.synthetic=true;');
  const db = openDatabase({ databasePath, now }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => WORKSPACE, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'google-collectors', title: 'Synthetic Google collectors' });
  const config = operatorAppConfigurationFromEnvironment({
    TDN_WORKSPACE_DB: databasePath, TDN_ARTIFACT_ROOT: artifactRoot, TDN_SERPAPI_API_KEY: SYNTHETIC_SERP_KEY,
    ...(options.flags?.suggest === undefined ? {} : { TDN_RESEARCH_SEARCH_SUGGEST_ENABLED: options.flags.suggest }),
    ...(options.flags?.overview === undefined ? {} : { TDN_RESEARCH_AI_OVERVIEW_ENABLED: options.flags.overview }),
  }, { frontendDist, version: 'synthetic-test' });
  assert.equal(config.researchSearchSuggest === true, options.flags?.suggest === '1', 'S19b environment flag must reach runtime configuration');
  assert.equal(config.researchAiOverview === true, options.flags?.overview === '1', 'S29 environment flag must reach runtime configuration');
  const fake = fakeGoogleTransport(options.answer);
  const presetFixture = options.presetKeywords ? JSON.parse(await fs.readFile(new URL('./metric-v3/live-map-contract.json', import.meta.url), 'utf8')).spec : null;
  const preset = presetFixture ? validateMetricV3CaptureSpec({
    ...presetFixture, contractVersion: 'metric-v3-capture-spec-v2', preset: { ...presetFixture.preset, keywords: [...options.presetKeywords!] },
  }) : undefined;
  const suggest = config.researchSearchSuggest ? createSearchSuggestSource(fake.transport) : undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => RUN, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(),
    webSource: bindResearchAutomationProvider(createSerpApiProvider(SYNTHETIC_SERP_KEY, fake.transport)),
    ...(options.expanded ? { expandedSource: createExpandedSearchSource(SYNTHETIC_SERP_KEY, fake.transport) } : {}),
    ...(config.researchAiOverview ? { aiOverviewSource: createAiOverviewSource(SYNTHETIC_SERP_KEY, fake.transport) } : {}),
    ...(suggest ? { searchSuggestSource: { collect: (input: { readonly keywords: readonly string[] }, callOptions?: ProviderCallOptions) =>
      suggest.collect({ ...input, keywords: options.keywords ?? input.keywords }, callOptions) } } : {}),
  });
  await service.start(WORKSPACE, { contractVersion: preset ? 'research-automation-start-v2' : 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: BASES[0], requestedPeriod: preset ? preset.windows[1]!.period : { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: options.reports ?? ['INSIGHT'],
    ...(preset ? { metricV3Preset: preset } : {}) });
  await service.processNext();
  const awaiting = await service.getRun(WORKSPACE, RUN);
  await service.confirmScope(WORKSPACE, RUN, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: preset ? [] : [SYNTHETIC_CARD_ID], peerProductIds: [],
    exactShopeeUrls: preset ? ['https://shopee.vn/synthetic-i.111.222'] : [] });
  for (let i = 0; i < 12 && (await service.getRun(WORKSPACE, RUN)).status !== 'DRAFT_READY'; i++) await service.processNext();
  const run = await service.getRun(WORKSPACE, RUN);
  assert.equal(run.status, 'DRAFT_READY', 'optional collectors must not fail the run');
  const step = db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(RUN) as { state: string };
  // A preset skips quick search; its exact synthetic listing has no review collector configured.
  assert.equal(step.state, preset ? 'PARTIAL' : 'SUCCEEDED');
  const captures = db.prepare(`SELECT step_id,provider,operation,media_type,truncated,artifact_sha256 sha
    FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(RUN) as {
    step_id: string; provider: string; operation: string; media_type: string; truncated: bigint; sha: string;
  }[];
  const usage = db.prepare(`SELECT provider,operation,request_count,cost_state,cost_unit,cost_amount
    FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(RUN) as {
    provider: string; operation: string; request_count: bigint; cost_state: string; cost_unit: string | null; cost_amount: string | null;
  }[];
  return { ...fake, db, artifacts, service, run, captures, usage };
}

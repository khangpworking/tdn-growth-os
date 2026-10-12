import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildTikTokCommentCorpus } from '../../src/modules/analysis/research-automation/tiktok-comment-intake.js';
import { admitWebResults, buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { createExpandedSearchRunner } from '../../src/modules/analysis/research-automation/expanded-search.js';
import { SearchCallBudget } from '../../src/modules/analysis/research-automation/expanded-search-queries.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import { typesafeJevConfigurationFromEnvironment } from '../../src/platform/ai/typesafe-jev-client.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

function deterministicJevForFlag(flag: 'unset' | 'false'): null {
  const configuration = typesafeJevConfigurationFromEnvironment(flag === 'unset' ? {} : { TDN_RESEARCH_JEV_ENABLED: 'false' });
  assert.equal(configuration.enabled, false);
  return null;
}

const filter: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'jev-209-callers-v1', category: 'synthetic',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'synthetic other product' }] };

test('TikTok/P9 flag-unset and explicit-false corpus bytes match the base snapshot', async () => {
  const url = 'https://www.tiktok.com/@synthetic/video/1';
  const selection = { contractVersion: 'tiktok-video-selection-v1' as const, workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222',
    scopeSha256: 'a'.repeat(64), sourceSetSha256: 'b'.repeat(64), requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' },
    sourcePeriod: { state: 'UNKNOWN_UNVERIFIED' as const, startDate: null, endDate: null }, sourcePackage: { packageId: '33333333-3333-4333-8333-333333333333', manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
    tableSha256: 'e'.repeat(64), option: 'A_TOP_20_PERCENT' as const, tieRule: 'EXACT_SOURCE_ORDER' as const, maximumVideos: 30 as const, sampleVideoCount: 1,
    excluded: [], videos: [{ videoId: '1', url, kind: 'SELLER_VIDEO' as const, sourceLine: 'synthetic:1', revenue: '1' }] };
  const selected = { selection, selectionSha256: createHash('sha256').update(canonicalJson(selection)).digest('hex') };
  const privacy = createTikTokCommentPrivacy({ salt: Buffer.from('synthetic-private-salt-012345678901234567890123'), keyId: '11111111-1111-4111-8111-111111111111' });
  const transport: TikTokCommentsTransport = { start: async () => ({ runId: 'synthetic', datasetId: 'synthetic', buildId: null, status: 'SUCCEEDED' as const,
    retrievedAt: '2026-10-11T00:00:00.000Z', providerTotalRows: 1, usageTotalUsd: 0 }), readPage: async () => Buffer.from(JSON.stringify([{ item_type: 'comment', video_id: '1', comment_id: '1', reply_to_comment_id: '0', text: 'unrelated', like_count: 0,
      created_at_utc: '2026-10-01T00:00:00.000Z', user_id: '1' }])) };
  const capture = await new ApifyTikTokCommentsCollector({ transport, privacy, approvedMaxTotalChargeUsd: 1 }).collect([url], 'f'.repeat(64));
  const implicitOff = buildTikTokCommentCorpus(selected, capture, filter, deterministicJevForFlag('unset'));
  const explicitOff = buildTikTokCommentCorpus(selected, capture, filter, deterministicJevForFlag('false'));
  assert.equal(sha(canonicalJson(implicitOff)), 'b514676905e530889c3abcd88216c965c1472dee7d10a4b9e50db60a450c0bf9');
  assert.equal(sha(canonicalJson(explicitOff)), 'b514676905e530889c3abcd88216c965c1472dee7d10a4b9e50db60a450c0bf9');
});

function webTransport(): ProviderTransport {
  return { now: () => Date.parse('2026-10-11T00:00:00.000Z'), sleep: async () => undefined, fetch: async input => {
    const query = new URL(input.toString()).searchParams.get('q');
    return new Response(JSON.stringify({ search_parameters: { q: query }, organic_results: [
      { position: 1, title: 'Thạch dừa synthetic', link: 'https://example.test/1', snippet: null },
      { position: 2, title: 'Tin unrelated', link: 'https://example.test/2', snippet: null },
    ] }), { status: 200 });
  } };
}

test('expanded search flag-unset and explicit-false bytes match the base snapshot', async () => {
  const input = { run: { runId: 'synthetic-run', mode: 'CATEGORY' as const, requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, country: 'VN' as const, selectedProductRefs: [], peerProductRefs: [] },
    apiKey: 'synthetic-api-key' };
  const request = { version: 'expanded-search-request-v1' as const, confirmedProducts: ['thạch dừa'], confirmedBrands: [], requestedWindow: null, siteDomain: null };
  deterministicJevForFlag('unset');
  const first = await createExpandedSearchRunner({ ...input, transport: webTransport(), budget: new SearchCallBudget({ trends: 0, search: 1 }) }).execute(request, filter);
  deterministicJevForFlag('false');
  const second = await createExpandedSearchRunner({ ...input, transport: webTransport(), budget: new SearchCallBudget({ trends: 0, search: 1 }) }).execute(request, filter);
  assert.equal(sha(canonicalJson(first)), '43a0a26a72a80e432f83246e84d9aafe2824a902f1bdfbfb811ea3a9f705af19');
  assert.equal(sha(canonicalJson(second)), '43a0a26a72a80e432f83246e84d9aafe2824a902f1bdfbfb811ea3a9f705af19');
  assert.equal(first[0]?.mainCount, 1);
});

test('source-evidence flag-unset and explicit-false bytes match the base snapshot', () => {
  const input = { draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE' as const, webResults: [], captures: [] };
  for (const flag of ['unset', 'false'] as const) {
    const packet = buildSourceEvidence(input);
    const admitted = admitWebResults(packet, [], [], deterministicJevForFlag(flag));
    assert.equal(sha(canonicalJson(packet)), 'e4907d8b42c68dfa424c8d1ca956b03a7a14d14c39c735b0fbc0da3ee777e011');
    assert.equal(sha(canonicalJson(admitted)), '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945');
    assert.equal(packet.admission, null);
  }
});

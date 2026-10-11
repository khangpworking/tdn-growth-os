import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutomationQualitativeDraft } from '../../contracts/analysis/automation-qualitative-draft-v1.generated.js';
import type { QualitativeSourceBoundary } from '../../src/modules/analysis/research-automation/qualitative-draft-contracts.js';
import { checkQualitativeDraft } from '../../src/modules/analysis/research-automation/qualitative-draft-contracts.js';

const digest = (letter: string) => ({ a: 'a', b: 'b', c: 'c', d: 'd', e: 'e', f: 'f', g: '0', h: '1', i: '2' }[letter]!).repeat(64);
const binding = {
  workspaceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', runId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  scopeSha256: digest('a'), sourceSetSha256: digest('b'), requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' },
} as const;
const locator = (index: number) => ({ owner: 'synthetic-source', pageSha256: digest(index === 0 ? 'c' : 'd'), pageIndex: 0, rowIndex: index, textPointer: `/${index}/text` });
const quote = (index: number, text: string) => ({ recordIndex: index, recordId: `record-${index}`, locator: locator(index), text, start: 0, end: text.length });

function fixture(): { boundary: QualitativeSourceBoundary; draft: AutomationQualitativeDraft } {
  const records = [
    { recordIndex: 0, recordId: 'record-0', text: 'Dùng sau khi đi làm.', locator: locator(0), sourceHash: digest('c'), author: { state: 'VERIFIED_HASHED' as const, hash: digest('e') }, admission: 'INCLUDED' as const, admissionReason: null },
    { recordIndex: 1, recordId: 'record-1', text: 'Mùi hơi nồng.', locator: locator(1), sourceHash: digest('d'), author: { state: 'VERIFIED_HASHED' as const, hash: digest('f') }, admission: 'INCLUDED' as const, admissionReason: null },
    { recordIndex: 2, recordId: 'record-2', text: null, locator: { ...locator(2), pageSha256: digest('g') }, sourceHash: digest('g'), author: { state: 'UNAVAILABLE' as const, hash: null }, admission: 'EXCLUDED' as const, admissionReason: 'NO_READABLE_TEXT' },
  ];
  const source = { platform: 'SHOPEE' as const, sourceType: 'S05_LOCATED_REVIEW' as const, sourceSha256: digest('h'), sourcePackageId: null, sourceManifestSha256: null, sourceContentSha256: null };
  const boundary: QualitativeSourceBoundary = { binding, source, records };
  const q0 = quote(0, records[0]!.text!); const q1 = quote(1, records[1]!.text!);
  const draft: AutomationQualitativeDraft = {
    contractVersion: 'automation-qualitative-draft-v1', draftId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', requestKey: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    binding, source, records: records as AutomationQualitativeDraft['records'],
    classifications: [
      { recordIndex: 0, recordId: 'record-0', status: 'CLASSIFIED', confidence: 'HIGH', situation: 'Sau khi đi làm', journey: 'SAU_MUA', topic: 'Tiện dụng', statedSentiment: 'POSITIVE', quotes: [q0], uncertainty: null },
      { recordIndex: 1, recordId: 'record-1', status: 'CLASSIFIED', confidence: 'MEDIUM', situation: 'Nếm thử', journey: 'MUA', topic: 'Mùi vị', statedSentiment: 'NEGATIVE', quotes: [q1], uncertainty: null },
    ],
    cards: [{ cardId: digest('i'), situation: { kind: 'SITUATION', value: q0.text, quotes: [q0] }, journey: { kind: 'CHANNEL', value: 'SAU_MUA', quotes: [q0] }, recordIndexes: [0, 1], quotes: [q0, q1], attributes: [], authorEvidence: 'VERIFIED_DISTINCT_AUTHORS', identityLimitation: 'Verified source-bound author hashes.', status: 'PROPOSED' }],
    counts: { included: 2, excluded: 1, unclear: 0, classified: 2, unclassified: 0 },
    policy: { status: 'PROPOSED_AWAITING_REVIEW', reliability: { state: 'UNAVAILABLE', code: 'U11_STATISTIC_UNAVAILABLE' }, releaseEligibility: 'UNAVAILABLE', mainConclusionUse: 'EXCLUDED' },
    limitations: ['U11_STATISTIC_UNAVAILABLE; counts are scoped record accounting only.'],
  };
  return { boundary, draft };
}

test('qualitative draft validates exact source-bound quotes/cards and keeps policy unavailable', () => {
  const { boundary, draft } = fixture();
  assert.equal(checkQualitativeDraft(draft, boundary), draft);
  const changed = structuredClone(draft); changed.classifications[0]!.quotes[0]!.text = 'Invented quote';
  assert.throws(() => checkQualitativeDraft(changed, boundary), /QUALITATIVE_QUOTE_NOT_IN_RETAINED_SOURCE/);
  const authorCollision = structuredClone(draft); authorCollision.records[1]!.author = authorCollision.records[0]!.author;
  assert.throws(() => checkQualitativeDraft(authorCollision, { ...boundary, records: authorCollision.records }), /QUALITATIVE_AUTHOR_PROOF_MISMATCH/);
  const release = structuredClone(draft); release.policy.releaseEligibility = 'ELIGIBLE' as never;
  assert.throws(() => checkQualitativeDraft(release, boundary));
});

test('low or unavailable records remain unclassified and never contribute classified counts', () => {
  const { boundary, draft } = fixture();
  const low = structuredClone(draft);
  low.classifications[1] = { recordIndex: 1, recordId: 'record-1', status: 'UNCLASSIFIED', confidence: 'AMBIGUOUS', situation: null, journey: null, topic: null, statedSentiment: null, quotes: [], uncertainty: { state: 'AMBIGUOUS', detail: 'Source meaning remains unclear.' } };
  low.cards = [];
  low.counts = { included: 2, excluded: 1, unclear: 0, classified: 1, unclassified: 1 };
  assert.equal(checkQualitativeDraft(low, boundary).classifications[1]!.status, 'UNCLASSIFIED');
  const silentlyClassified = structuredClone(low);
  silentlyClassified.classifications[1] = { ...silentlyClassified.classifications[1]!, status: 'CLASSIFIED', confidence: 'LOW', situation: 'Made up', journey: 'MUA', topic: 'Made up', statedSentiment: 'POSITIVE', quotes: [quote(1, boundary.records[1]!.text!)], uncertainty: null };
  assert.throws(() => checkQualitativeDraft(silentlyClassified, boundary), /QUALITATIVE_CLASSIFICATION_NOT_CONFIDENT/);
});

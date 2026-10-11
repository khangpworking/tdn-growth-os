import assert from 'node:assert/strict';
import test from 'node:test';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { triageL9WithJev } from '../../src/modules/analysis/research-automation/l9-jev-triage.js';
import type { RetainedKeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';

const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'jev-209b-rejection-v1', category: 'synthetic',
  provenance: 'MODEL_DRAFTED', keywords: ['tháº¡ch dá»«a'], exclusions: [] };

test('web source evidence records unavailable when a retained Jev fingerprint is rejected', async () => {
  const deterministic = filterKeywordMeanings(data, [{ recordId: 'capture#1', text: 'unrelated', contextText: null }]);
  const sidecar = await triageL9WithJev({ data, result: deterministic });
  const draft = { output: data } as unknown as RetainedKeywordListDraftRecord;
  const packet = buildSourceEvidence({ draft, draftDigest: 'a'.repeat(64), unavailableReason: null,
    webResults: [{ position: 1, title: 'unrelated', url: 'https://example.test/1', snippet: null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex: 0 }],
    captures: [{ stepId: 'COLLECTION', ordinal: 0, artifactSha256: 'b'.repeat(64), mediaType: 'application/json', provider: 'serpapi',
      operation: 'serpapi.search', retrievedAt: '2026-10-12T00:00:00.000Z', window: null, truncated: false }],
    jevTriage: { ...sidecar, l9Fingerprint: '0'.repeat(64) } });
  assert.equal(packet.jevTriage?.status, 'UNAVAILABLE');
  assert.deepEqual(packet.jevTriage?.runNotes, ['L9_JEV_UNAVAILABLE']);
  assert.equal(packet.admission?.result.results[0]?.decision, 'UNCLEAR');
});

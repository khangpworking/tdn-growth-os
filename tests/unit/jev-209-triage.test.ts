import assert from 'node:assert/strict';
import test from 'node:test';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { applyL9JevTriage, triageL9WithJev } from '../../src/modules/analysis/research-automation/l9-jev-triage.js';

const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'jev-209-v1', category: 'synthetic product',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [{ term: 'other product', reason: 'synthetic other product' }] };

function jev(fetchImplementation: typeof globalThis.fetch): TypesafeJevClient {
  return new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-key', model: 'jev-1.13.0' }, fetchImplementation);
}

function responseForQuestions(input: RequestInit, choice: (text: string) => string, confidenceFor: (text: string) => number = () => 0.95): Response {
  const body = JSON.parse(String(input.body)) as { state: Record<string, { recordText: string }> };
  const answers = Object.fromEntries(Object.entries(body.state).map(([id, state]) => [id, {
    type: 'choice', choice: choice(state.recordText), probabilities: { ABOUT_PRODUCT: 0.02, NOT_ABOUT_PRODUCT: 0.03, UNRESOLVED: 0.95 }, confidence: confidenceFor(state.recordText),
  }]));
  return new Response(JSON.stringify({ model: 'jev-1.13.0', answers }));
}

test('gate promotes only high-confidence about/not-about and never sends excluded, empty or lookalike rows', async () => {
  const result = filterKeywordMeanings(data, [
    { recordId: 'included', text: 'thạch dừa product' },
    { recordId: 'excluded', text: 'other product' },
    { recordId: 'lookalike', text: 'thạch dứa' },
    { recordId: 'empty', text: '' },
    { recordId: 'about', text: 'unrelated about' },
    { recordId: 'not-about', text: 'unrelated not-about' },
    { recordId: 'low', text: 'unrelated low' },
  ]);
  const sent: string[] = [];
  const triage = await triageL9WithJev({ data, result, client: jev(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const body = JSON.parse(String((init as RequestInit).body)) as { state: Record<string, { recordText: string }> };
    sent.push(...Object.values(body.state).map(row => row.recordText));
    return responseForQuestions(init as RequestInit, text => text.includes('not-about') ? 'NOT_ABOUT_PRODUCT' : 'ABOUT_PRODUCT', text => text.includes('low') ? 0.89 : 0.95);
  }) });
  assert.deepEqual(sent.sort(), ['unrelated about', 'unrelated low', 'unrelated not-about'].sort());
  assert.deepEqual(triage.auditRows.map(row => [row.recordId, row.gateOutcome]), [
    ['about', 'INCLUDED'], ['not-about', 'EXCLUDED'], ['low', 'UNCHANGED'],
  ]);
  const applied = applyL9JevTriage(result, triage);
  assert.deepEqual(applied.get('about'), { decision: 'INCLUDED', reason: 'đúng sản phẩm (máy phân loại)' });
  assert.deepEqual(applied.get('not-about'), { decision: 'EXCLUDED', reason: 'không nói về sản phẩm (máy phân loại)' });
  assert.equal(applied.get('low')?.decision, 'UNCLEAR');
  assert.equal(applied.get('included')?.decision, 'INCLUDED');
  assert.equal(applied.get('excluded')?.decision, 'EXCLUDED');
  assert.equal(applied.get('lookalike')?.decision, 'UNCLEAR');
});

test('45 unclear records batch into three calls and never exceed four in flight', async () => {
  const result = filterKeywordMeanings({ ...data, keywords: ['definitely absent'] }, Array.from({ length: 45 }, (_, index) => ({ recordId: `r-${index}`, text: 'unrelated' })));
  let calls = 0; let active = 0; let maximum = 0;
  const triage = await triageL9WithJev({ data: { ...data, keywords: ['definitely absent'] }, result, client: jev(async (_url: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    calls++; active++; maximum = Math.max(maximum, active);
    await Promise.resolve();
    active--;
    return responseForQuestions(init as RequestInit, () => 'UNRESOLVED');
  }) });
  assert.equal(calls, 3);
  assert.ok(maximum <= 4);
  assert.equal(triage.auditRows.length, 45);
});

test('Jev failure preserves deterministic decisions and records the unavailable note', async () => {
  const result = filterKeywordMeanings(data, [{ recordId: 'unclear', text: 'unrelated' }]);
  const triage = await triageL9WithJev({ data, result, client: jev(async (_url: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => { throw new Error('synthetic network down'); }) });
  assert.equal(triage.status, 'UNAVAILABLE');
  assert.deepEqual(triage.runNotes, ['L9_JEV_UNAVAILABLE']);
  assert.deepEqual(triage.auditRows[0], { recordId: 'unclear', model: 'jev-1.13.0', choice: null, confidence: null, gateOutcome: 'NO_DECISION', reason: null });
  assert.deepEqual(applyL9JevTriage(result, triage).get('unclear'), { decision: 'UNCLEAR', reason: 'NO_KEYWORD_MATCH' });
});

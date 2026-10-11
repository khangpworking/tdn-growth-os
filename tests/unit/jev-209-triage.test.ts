import assert from 'node:assert/strict';
import test from 'node:test';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { applyL9JevTriage, triageL9WithJev, validatesL9JevTriageSidecar } from '../../src/modules/analysis/research-automation/l9-jev-triage.js';

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

test('sidecar application is bound to eligible deterministic rows and exact ordered fingerprint', async () => {
  const result = filterKeywordMeanings(data, [
    { recordId: 'included', text: 'thạch dừa product' },
    { recordId: 'excluded', text: 'other product' },
    { recordId: 'lookalike', text: 'thạch dứa' },
    { recordId: 'unclear', text: 'unrelated' },
  ]);
  const triage = await triageL9WithJev({ data, result, client: jev(async (_url, init) => responseForQuestions(init as RequestInit, text => text === 'unrelated' ? 'ABOUT_PRODUCT' : 'UNRESOLVED')) });
  const forged = {
    ...triage,
    auditRows: [...triage.auditRows,
      { recordId: 'included', model: triage.model, choice: 'NOT_ABOUT_PRODUCT' as const, confidence: 0.99, gateOutcome: 'EXCLUDED' as const, reason: 'không nói về sản phẩm (máy phân loại)' as const },
      { recordId: 'excluded', model: triage.model, choice: 'ABOUT_PRODUCT' as const, confidence: 0.99, gateOutcome: 'INCLUDED' as const, reason: 'đúng sản phẩm (máy phân loại)' as const },
      { recordId: 'lookalike', model: triage.model, choice: 'ABOUT_PRODUCT' as const, confidence: 0.99, gateOutcome: 'INCLUDED' as const, reason: 'đúng sản phẩm (máy phân loại)' as const },
    ],
  };
  assert.equal(validatesL9JevTriageSidecar({ ...forged, auditRows: [{ ...forged.auditRows[0]!, gateOutcome: 'INCLUDED', reason: null }] }), false);
  const applied = applyL9JevTriage(result, forged);
  assert.equal(applied.get('included')?.decision, 'INCLUDED');
  assert.equal(applied.get('excluded')?.decision, 'EXCLUDED');
  assert.equal(applied.get('lookalike')?.decision, 'UNCLEAR');
  assert.equal(applied.get('unclear')?.decision, 'INCLUDED');

  const duplicate = { ...triage, auditRows: [...triage.auditRows, triage.auditRows[0]!] };
  assert.equal(applyL9JevTriage(result, duplicate).get('unclear')?.decision, 'UNCLEAR');
  const unknown = { ...triage, auditRows: [...triage.auditRows, { recordId: 'unknown', model: triage.model, choice: 'ABOUT_PRODUCT' as const,
    confidence: 0.99, gateOutcome: 'INCLUDED' as const, reason: 'đúng sản phẩm (máy phân loại)' as const }] };
  assert.equal(applyL9JevTriage(result, unknown).get('unclear')?.decision, 'UNCLEAR');
  const mismatched = { ...triage, l9Fingerprint: '0'.repeat(64) };
  assert.equal(applyL9JevTriage(result, mismatched).get('unclear')?.decision, 'UNCLEAR');
});

test('corpora beyond the former 5000-row bound continue with deterministic fallback', async () => {
  const first = filterKeywordMeanings({ ...data, keywords: ['definitely absent'] }, Array.from({ length: 5000 }, (_, index) => ({ recordId: `r-${index}`, text: 'unrelated' })));
  const last = first.results[first.results.length - 1]!;
  const result = { ...first, results: [...first.results, { ...last, recordId: 'r-5000' }], accounting: { ...first.accounting, unclear: first.accounting.unclear + 1,
    byReason: { ...first.accounting.byReason, NO_KEYWORD_MATCH: (first.accounting.byReason.NO_KEYWORD_MATCH ?? 0) + 1 } } };
  let calls = 0;
  const triage = await triageL9WithJev({ data: { ...data, keywords: ['definitely absent'] }, result, client: jev(async () => { calls++; throw new Error('must not call beyond bound'); }) });
  assert.equal(calls, 251);
  assert.equal(triage.status, 'UNAVAILABLE');
  assert.deepEqual(triage.runNotes, ['L9_JEV_UNAVAILABLE']);
  assert.equal(triage.auditRows.length, 5001);
  assert.equal(applyL9JevTriage(result, triage).get('r-5000')?.decision, 'UNCLEAR');

  const overBound = { ...result, results: [...result.results, ...Array.from({ length: 19000 }, (_, index) => ({ ...last, recordId: `over-${index}` }))] };
  const fallback = await triageL9WithJev({ data: { ...data, keywords: ['definitely absent'] }, result: overBound, client: jev(async () => { throw new Error('over-bound must not call'); }) });
  assert.equal(fallback.status, 'UNAVAILABLE');
  assert.deepEqual(fallback.runNotes, ['L9_JEV_UNAVAILABLE']);
  assert.equal(fallback.auditRows.length, 0);
  assert.equal(applyL9JevTriage(overBound, fallback).get('over-18999')?.decision, 'UNCLEAR');
});

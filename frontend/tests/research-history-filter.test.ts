import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { filterHistory } from '../src/research-automation/run-status';
import type { ResearchAutomationRunSummary } from '../src/research-automation/api';

const run = (runId: string, keyword: string, status: string) => ({ runId, keyword, status }) as unknown as ResearchAutomationRunSummary;
const runs = [run('a', 'Quạt điện', 'DRAFT_READY'), run('b', 'Giày thể thao', 'FAILED'), run('c', 'quạt mini', 'CANCELLED'), run('d', 'Son', 'DRAFT_READY')];

test('history filter: no filter keeps every session, failed ones included', () => {
  assert.deepEqual(filterHistory(runs, '', false).map(item => item.runId), ['a', 'b', 'c', 'd']);
});

test('history filter: draft-only hides failed and cancelled sessions', () => {
  assert.deepEqual(filterHistory(runs, '', true).map(item => item.runId), ['a', 'd']);
});

test('history filter: keyword is case-insensitive and trimmed, and combines with draft-only', () => {
  assert.deepEqual(filterHistory(runs, '  QUẠT ', false).map(item => item.runId), ['a', 'c']);
  assert.deepEqual(filterHistory(runs, 'quạt', true).map(item => item.runId), ['a']);
});

test('history section sits before the editor on the research home and keeps the owner-facing title', () => {
  const source = readFileSync(new URL('../src/research-automation/ResearchAutomationPage.tsx', import.meta.url), 'utf8');
  assert.ok(source.indexOf('{!runId && historySection}') < source.indexOf('<ResearchEditor'));
  assert.ok(source.includes('Báo cáo và phiên nghiên cứu'));
});

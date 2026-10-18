import assert from 'node:assert/strict';
import test from 'node:test';
import { failureTodo } from '../src/research-automation/run-status';
import { AUTORUN_DENY_LIST } from '../src/research-automation/autorun-text';

const base = (steps: unknown[], sources: unknown[]) => ({ runId: 'run-1', steps, coverage: { sources } }) as unknown as Parameters<typeof failureTodo>[0];

test('failureTodo lists failed steps, kept data and an OWNER next step', () => {
  const todo = failureTodo(base([{ stepId: 'COLLECTION', state: 'FAILED', code: 'PROVIDER_FAILED' }, { stepId: 'REPORT', state: 'SUCCEEDED' }], [{ state: 'COLLECTED' }, { state: 'PARTIAL' }, { state: 'FAILED' }]), true);
  assert.equal(todo.failed.length, 1);
  assert.match(todo.failed[0]!, /^Thu thập: Lỗi/);
  assert.match(todo.usable[0]!, /1 nguồn đã thu thập xong, 1 nguồn thu được một phần/);
  assert.match(todo.next[0]!, /phiên mới/);
});

test('failureTodo gives a viewer the run id to hand off, and claims no kept data when none', () => {
  const todo = failureTodo(base([{ stepId: 'QUICK_SEARCH', state: 'INTERRUPTED' }], []), false);
  assert.deepEqual(todo.usable, []);
  assert.match(todo.next[0]!, /run-1/);
  assert.match(todo.next[0]!, /OWNER/);
});

test('failureTodo text never names a provider', () => {
  const todo = failureTodo(base([{ stepId: 'COLLECTION', state: 'FAILED', code: 'PROVIDER_CREDIT_EXHAUSTED' }], [{ state: 'COLLECTED' }]), true);
  const text = [...todo.failed, ...todo.usable, ...todo.next].join(' ');
  for (const word of AUTORUN_DENY_LIST) assert.ok(!text.includes(word), word);
});

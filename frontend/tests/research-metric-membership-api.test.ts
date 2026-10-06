import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loadMetricRuleAdoption, loadMetricRuleAdoptions, loadMetricMembershipReview,
  loadMetricMembershipProposal, loadMetricMembershipReceipt, acceptMetricMembership,
} from '../src/research-automation/metric-membership-api';
import { ResearchAutomationError } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const adoptionId = '33333333-3333-4333-8333-333333333333';
const proposalId = '44444444-4444-4444-8444-444444444444';
const receiptId = '55555555-5555-4555-8555-555555555555';
const otherId = '66666666-6666-4666-8666-666666666666';
const pairId = 'a'.repeat(64), recordKey = 'b'.repeat(64);
const signal = () => new AbortController().signal;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const integrity = (error: unknown) => error instanceof ResearchAutomationError && error.kind === 'integrity';
const rule = { contractVersion: 'automation-metric-rule-receipt-v1', adoptionId, workspaceId, runId,
  adoptedAt: '2026-10-04T00:00:00.000Z', exactRetry: false,
  rulebook: { ruleId: 'synthetic', revision: 1, title: 'Synthetic rule', wideUnknownPolicy: 'exclude',
    definitions: { CORE_CANDIDATE: 'Standalone', ADJACENT: 'Accessories', OUTSIDE: 'Unrelated', UNKNOWN: 'Unknown' },
    groups: [{ key: 'sample', label: 'Sample', definition: 'Synthetic only' }] } };

test('Metric exact readers reject schema-valid evidence for another route identity', async t => {
  const original = globalThis.fetch;
  let payload: unknown;
  globalThis.fetch = (async (_url, init) => {
    assert.equal(init?.body, undefined);
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    return json(payload);
  }) as typeof fetch;
  try {
    for (const wrong of [{ ...rule, workspaceId: otherId }, { ...rule, runId: otherId }]) {
      await t.test(`rule receipt ${wrong.workspaceId === workspaceId ? 'run' : 'workspace'}`, async () => {
        payload = rule;
        await loadMetricRuleAdoption(workspaceId, runId, adoptionId, signal());
        payload = wrong;
        await assert.rejects(loadMetricRuleAdoption(workspaceId, runId, adoptionId, signal()), integrity);
      });
    }
    await t.test('rule list members', async () => {
      payload = { contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: [rule] };
      await loadMetricRuleAdoptions(workspaceId, runId, signal());
      payload = { contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: [{ ...rule, runId: otherId }] };
      await assert.rejects(loadMetricRuleAdoptions(workspaceId, runId, signal()), integrity);
    });
    await t.test('proposal ID', async () => {
      const proposal = { contractVersion: 'metric-membership-proposal-view-v1', workspaceId, runId, pairId, adoptionId,
        proposalId, createdAt: rule.adoptedAt, assignments: [{ recordKey, classification: 'UNKNOWN', group: 'sample' }] };
      payload = proposal;
      await loadMetricMembershipProposal(workspaceId, runId, proposalId, signal());
      payload = { ...proposal, proposalId: otherId };
      await assert.rejects(loadMetricMembershipProposal(workspaceId, runId, proposalId, signal()), integrity);
    });
    await t.test('receipt ID', async () => {
      const receipt = { contractVersion: 'metric-membership-acceptance-view-v1', workspaceId, runId, receiptId, proposalId,
        acceptedAt: rule.adoptedAt, selectedRecordKeys: [recordKey] };
      payload = receipt;
      await loadMetricMembershipReceipt(workspaceId, runId, receiptId, signal());
      payload = { ...receipt, receiptId: otherId };
      await assert.rejects(loadMetricMembershipReceipt(workspaceId, runId, receiptId, signal()), integrity);
    });
  } finally { globalThis.fetch = original; }
});

test('Metric review preserves an empty pending universe and rejects contradictory acceptance projections', async () => {
  const original = globalThis.fetch;
  const empty = { contractVersion: 'metric-membership-review-v1', workspaceId, runId, pairId, adoptionId,
    recordCount: 0, acceptedCount: 0, pendingCount: 0, complete: false, acceptedReceiptIds: [], records: [] };
  let payload: unknown = empty;
  globalThis.fetch = (async () => json(payload)) as typeof fetch;
  const read = () => loadMetricMembershipReview(workspaceId, runId, pairId, adoptionId, signal());
  try {
    assert.deepEqual(await read(), empty);
    const pending = { ...empty, recordCount: 1, pendingCount: 1, records: [{ recordKey, title: 'Sample', category: '',
      shopId: '1', listingId: '2', locator: 'Sheet1!A2', state: 'PENDING', classification: null, group: null, proposalId: null }] };
    payload = pending; await read();
    for (const invalid of [
      { ...empty, complete: true },
      { ...pending, acceptedReceiptIds: [receiptId] },
      { ...pending, records: [{ ...pending.records[0], classification: 'UNKNOWN' }] },
      { ...pending, pendingCount: 0, acceptedCount: 1, complete: true, acceptedReceiptIds: [receiptId],
        records: [{ ...pending.records[0], state: 'ACCEPTED' }] },
    ]) {
      payload = invalid;
      await assert.rejects(read(), integrity);
    }
  } finally { globalThis.fetch = original; }
});

test('Metric acceptance sends only the explicit subset once and leaves ambiguous retry to the caller', async () => {
  const original = globalThis.fetch;
  const body = { contractVersion: 'metric-membership-accept-v1' as const, requestKey: otherId, proposalId,
    selectedRecordKeys: [recordKey] as [string] };
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/metric-membership-receipts`);
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-token');
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    throw new Error('synthetic lost response');
  }) as typeof fetch;
  try {
    await assert.rejects(acceptMetricMembership(workspaceId, runId, body, 'synthetic-token'),
      error => error instanceof ResearchAutomationError && error.kind === 'connection');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

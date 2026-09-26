import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FlowValidationError,
  validateContentCampaignArtifact,
  validateContentCampaignCreateRequest,
  validateContentCampaignLifecycleRequest,
  validateContentCampaignRevisionRequest,
} from '../../src/modules/flow/index.js';

const brandId = '66666666-6666-4666-8666-000000000001';
const itemA = '66666666-6666-4666-8666-0000000000a1';
const itemB = '66666666-6666-4666-8666-0000000000a2';
const campaign = (patch: Record<string, unknown> = {}) => ({
  name: 'Tết 2027 — quà cho bố mẹ',
  objective: 'Tăng đơn quà Tết cho người con đi làm xa.',
  items: [{ itemId: itemA, itemVersion: 2, tierKeys: ['plus'] }, { itemId: itemB, itemVersion: 1 }],
  ...patch,
});
const create = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', campaignKey: 'tet-2027', brandId, campaign: campaign(), ...patch });

test('campaign create requests accept bounded, trimmed content with unique items', () => {
  assert.deepEqual(validateContentCampaignCreateRequest(create()), create());
  assert.ok(validateContentCampaignCreateRequest(create({ campaign: campaign({ researchProductWorkspaceId: '66666666-6666-4666-8666-0000000000f1' }) })));
  for (const bad of [
    create({ campaignKey: 'Tet' }),
    create({ campaignKey: 'ab' }),
    create({ brandId: 'not-a-uuid' }),
    create({ extra: true }),
    create({ campaign: campaign({ name: ' Tết' }) }),
    create({ campaign: campaign({ name: 'x'.repeat(121) }) }),
    create({ campaign: campaign({ objective: '' }) }),
    create({ campaign: campaign({ objective: 'x'.repeat(1001) }) }),
    create({ campaign: campaign({ items: [] }) }),
    create({ campaign: campaign({ items: Array.from({ length: 13 }, (_, index) => ({ itemId: `66666666-6666-4666-8666-0000000001${String(index).padStart(2, '0')}`, itemVersion: 1 })) }) }),
    create({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1 }, { itemId: itemA, itemVersion: 2 }] }) }),
    create({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 0 }] }) }),
    create({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: [] }] }) }),
    create({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: ['go', 'go'] }] }) }),
    create({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: ['Go'] }] }) }),
    create({ campaign: campaign({ insight: 'chưa có' }) }),
  ]) assert.throws(() => validateContentCampaignCreateRequest(bad), FlowValidationError, JSON.stringify(bad));
});

test('campaign revision, lifecycle and artifact contracts are strict', () => {
  const revision = { contractVersion: '1.0.0', campaignId: '66666666-6666-4666-8666-0000000000c1', expectedVersion: 1, campaign: campaign() };
  assert.deepEqual(validateContentCampaignRevisionRequest(revision), revision);
  assert.throws(() => validateContentCampaignRevisionRequest({ ...revision, expectedVersion: 0 }), FlowValidationError);
  assert.throws(() => validateContentCampaignRevisionRequest({ ...revision, campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1 }, { itemId: itemA, itemVersion: 1 }] }) }), /Campaign items must be unique/);
  const lifecycle = { contractVersion: '1.0.0', campaignId: revision.campaignId, action: 'DELETE', expectedSequence: 0 };
  assert.deepEqual(validateContentCampaignLifecycleRequest(lifecycle), lifecycle);
  assert.throws(() => validateContentCampaignLifecycleRequest({ ...lifecycle, action: 'ARCHIVE' }), FlowValidationError);
  assert.throws(() => validateContentCampaignLifecycleRequest({ ...lifecycle, expectedSequence: -1 }), FlowValidationError);
  const artifact = { contractVersion: '1.0.0', campaignId: revision.campaignId, campaignKey: 'tet-2027', brandId, version: 1, campaign: campaign(), createdAt: '2027-01-01T00:00:00.000Z', requestSha256: 'a'.repeat(64) };
  assert.deepEqual(validateContentCampaignArtifact(artifact), artifact);
  assert.throws(() => validateContentCampaignArtifact({ ...artifact, createdAt: 'yesterday' }), FlowValidationError);
  assert.throws(() => validateContentCampaignArtifact({ ...artifact, requestSha256: 'A'.repeat(64) }), FlowValidationError);
});

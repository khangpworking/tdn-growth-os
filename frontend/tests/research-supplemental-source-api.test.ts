import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { prepareSupplementalSource, loadPreparedSupplementalSources, ResearchAutomationError,
  type ResearchAutomationSupplementalPrepareRequest } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const metadata: ResearchAutomationSupplementalPrepareRequest = {
  contractVersion: 'automation-supplemental-prepare-v1', requestKey: '33333333-3333-4333-8333-333333333333',
  family: 'QUOTE', sourceLabel: 'Synthetic source', acquiredAt: null, descriptorPath: 'descriptor.json',
  files: [{ path: 'descriptor.json', mediaType: 'application/json', representationRole: 'derived' }],
};
const content = '{"synthetic":true}';
const receipt = {
  contractVersion: 'automation-supplemental-prepared-v1', requestKey: metadata.requestKey, family: 'QUOTE',
  state: 'PREPARED_NOT_ADMITTED', exactRetry: false, packageId: '44444444-4444-4444-8444-444444444444',
  manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64), descriptorPath: metadata.descriptorPath,
  files: [{ path: metadata.descriptorPath, sha256: createHash('sha256').update(content).digest('hex'), byteSize: Buffer.byteLength(content), mediaType: 'application/json' }],
  sourceLabel: metadata.sourceLabel, acquiredAt: null, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED', admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION',
};
const json = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const hasKind = (kind: ResearchAutomationError['kind']) => (error: unknown) => error instanceof ResearchAutomationError && error.kind === kind;

// Client owner: multipart wire format, immutable async snapshot, receipt/file binding and no automatic retry.
// Domain semantics and persistence belong to the separate real HTTP/intake tests, not this transport stub.
test('supplemental upload snapshots its request and files, sends once, and rejects mismatched receipts', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0, response = json(receipt);
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/supplemental`);
    assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer synthetic-owner');
    assert.equal(new Headers(init?.headers).get('Content-Type'), null);
    const form = init?.body as FormData;
    assert.deepEqual(JSON.parse(form.get('metadata') as string), metadata);
    assert.equal(await (form.get('file:descriptor.json') as Blob).text(), content);
    assert.equal([...form.entries()].length, 2);
    return response;
  }) as typeof fetch;
  const upload = () => prepareSupplementalSource(workspaceId, runId, metadata,
    new Map([['descriptor.json', new Blob([content])]]), 'synthetic-owner');
  try {
    const mutable = structuredClone(metadata), files = new Map([['descriptor.json', new Blob([content])]]);
    const pending = prepareSupplementalSource(workspaceId, runId, mutable, files, 'synthetic-owner');
    mutable.sourceLabel = 'changed during hash'; files.clear();
    assert.deepEqual(await pending, receipt); assert.equal(calls, 1);
    for (const invalid of [
      { ...receipt, family: 'BOUNDED' }, { ...receipt, requestKey: workspaceId },
      { ...receipt, files: [{ ...receipt.files[0], sha256: 'f'.repeat(64) }] },
      { ...receipt, files: [{ ...receipt.files[0], byteSize: 99 }] },
      { ...receipt, descriptorPath: 'different.json' },
    ]) { response = json(invalid); await assert.rejects(upload(), hasKind('integrity')); }
    response = json({ ...receipt, exactRetry: true }, 200);
    assert.deepEqual(await upload(), { ...receipt, exactRetry: true });
    response = json(receipt, 202); await assert.rejects(upload(), hasKind('integrity'));
    response = json({ error: { message: 'Conflict' } }, 409);
    const beforeConflict = calls; await assert.rejects(upload(), hasKind('conflict')); assert.equal(calls, beforeConflict + 1);
    const beforeLocalReject = calls;
    await assert.rejects(prepareSupplementalSource(workspaceId, runId, metadata, new Map(), 'synthetic-owner'), hasKind('rejected'));
    await assert.rejects(prepareSupplementalSource(workspaceId, runId, metadata, files, ''), hasKind('authorization'));
    assert.equal(calls, beforeLocalReject);
    let failures = 0;
    globalThis.fetch = async () => { failures++; throw new Error('Connection lost after possible commit'); };
    await assert.rejects(upload(), hasKind('connection')); assert.equal(failures, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('prepared supplemental reload is read-only and rejects another run or duplicate package identity', async () => {
  const originalFetch = globalThis.fetch;
  const { contractVersion: _version, exactRetry: _retry, ...entry } = receipt;
  const inventory = { contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages: [entry] };
  let response = json(inventory, 200);
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/supplemental`);
    assert.equal(init?.body, undefined); assert.equal(new Headers(init?.headers).get('Authorization'), null);
    return response;
  }) as typeof fetch;
  const load = () => loadPreparedSupplementalSources(workspaceId, runId, new AbortController().signal);
  try {
    assert.deepEqual(await load(), inventory);
    for (const invalid of [{ ...inventory, runId: workspaceId }, { ...inventory, packages: [entry, entry] },
      { ...inventory, packages: [{ ...entry, descriptorPath: 'absent.json' }] }]) {
      response = json(invalid, 200); await assert.rejects(load(), hasKind('integrity'));
    }
    response = json({ error: { message: 'Stored source failed verification' } }, 500);
    await assert.rejects(load(), hasKind('integrity'));
  } finally { globalThis.fetch = originalFetch; }
});

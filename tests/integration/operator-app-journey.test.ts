import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import BetterSqlite3 from 'better-sqlite3';
import { openWorkspaceApi } from '../../src/api/workspace-api.js';
import {
  assertOwnerOnlyFiles, assertPortClosed, disposableOperatorFixture, postJson, regularFiles, startOperator,
  SYNTHETIC_OWNER_TOKEN,
} from '../helpers/disposable-operator-runtime.js';

const digest = (file: string) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const jsonGet = async (origin: string, pathname: string): Promise<any> => {
  const response = await fetch(origin + pathname);
  assert.equal(response.status, 200, `${pathname}: ${response.status}`);
  return response.json();
};
const expectCreated = async (request: Promise<{ response: Response; value: any }>): Promise<any> => {
  const result = await request; assert.equal(result.response.status, 201, JSON.stringify(result.value)); return result.value;
};

const workspaceBody = { contractVersion: '1.0.0', workspaceKey: 'synthetic-calcium-market', title: 'Synthetic calcium discovery', description: 'Offline placeholder evidence only.' };
const candidateCreate = { contractVersion: '1.0.0', candidateKey: 'synthetic-calcium', label: 'Synthetic calcium concept', summary: 'Placeholder product; no provider or real calcium data.' };
const candidateRevision = { contractVersion: '1.0.0', expectedVersion: 1, label: 'Synthetic calcium concept v2', summary: 'Revised placeholder product with synthetic-only claims.' };
const lanes = ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const;

async function staticSurface(origin: string): Promise<void> {
  const index = await fetch(origin + '/');
  assert.equal(index.status, 200); const html = await index.text(); assert.match(html, /<!doctype html>/i);
  const match = html.match(/<(?:script|link)\b[^>]*(?:src|href)=["']([^"']+)["']/i);
  assert.ok(match?.[1], 'built index must reference a real asset');
  const assetPath = new URL(match[1], origin + '/').pathname;
  const asset = await fetch(origin + assetPath); assert.equal(asset.status, 200); const bytes = Buffer.from(await asset.arrayBuffer()); assert.ok(bytes.length > 0);
  const head = await fetch(origin + assetPath, { method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(Number(head.headers.get('content-length')), bytes.length); assert.equal((await head.arrayBuffer()).byteLength, 0);
  for (const target of ['/not-a-spa-route', '/api/not-a-route', '/..%2fpackage.json', '/assets%5cmissing.js']) {
    const response = await fetch(origin + target); assert.ok([400, 404].includes(response.status), `${target}: ${response.status}`); assert.doesNotMatch(await response.text(), /<!doctype html>/i);
  }
}

test('Task045 disposable one-origin production runtime completes the authoritative OWNER B3→B10 journey and shuts down cleanly', async () => {
  const fixture = await disposableOperatorFixture(true);
  const application = await startOperator(fixture.configuration);
  const output: string[] = [];
  try {
    assert.equal(application.origin, `http://127.0.0.1:${fixture.port}`); assert.ok(fixture.port > 0);
    await staticSurface(application.origin);
    assert.deepEqual(await jsonGet(application.origin, '/healthz'), { status: 'ok', version: 'task045-smoke', ownerWritesEnabled: true, localTestOwner: false });
    assert.deepEqual(await jsonGet(application.origin, '/api/workspaces'), { contractVersion: '1.0.0', workspaces: [] });

    const denied = await postJson(application.origin, '/owner-api/workspaces', workspaceBody, false);
    assert.equal(denied.response.status, 401); assert.equal(denied.value.error.code, 'unauthorized');
    const workspace = await expectCreated(postJson(application.origin, '/owner-api/workspaces', workspaceBody)); output.push(JSON.stringify(workspace));
    const candidate = await expectCreated(postJson(application.origin, `/owner-api/workspaces/${workspace.workspaceId}/candidates`, candidateCreate)); output.push(JSON.stringify(candidate));
    const revised = await expectCreated(postJson(application.origin, `/owner-api/workspaces/${workspace.workspaceId}/candidates/${candidate.candidateId}/revisions`, candidateRevision));
    assert.equal(revised.version, 2);

    const basket = await expectCreated(postJson(application.origin, `/owner-api/workspaces/${workspace.workspaceId}/candidate-baskets`, {
      contractVersion: '1.0.0', basketKey: 'b3-shortlist', version: 1,
      candidates: [{ candidateId: candidate.candidateId, candidateVersion: 2 }],
    }));
    const b7 = await expectCreated(postJson(application.origin, `/owner-api/workspaces/${workspace.workspaceId}/candidate-baskets/${basket.basketId}/b7-decisions`, {
      contractVersion: '1.0.0', candidateId: candidate.candidateId, candidateVersion: 2, decision: 'PASS',
    }));
    const product = await expectCreated(postJson(application.origin, `/owner-api/workspaces/${workspace.workspaceId}/candidate-baskets/${basket.basketId}/b7-decisions/${b7.decisionId}/product-workspace`, {
      contractVersion: '1.0.0', productWorkspaceKey: 'synthetic-calcium-product',
    }));

    const decisionIds = {} as Record<(typeof lanes)[number], string>;
    for (const lane of lanes) {
      const decision = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b8-decisions`, { contractVersion: '1.0.0', lane, expectedVersion: 0, decision: 'PASS' }));
      decisionIds[lane] = decision.decisionId;
    }
    const clearance = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b8-clearance`, { contractVersion: '1.0.0', decisionIds }));
    assert.equal(clearance.state, 'READY_FOR_B9');

    const workingPayload = (expectedWorkingRevision: string | null, positioningStatement: string) => ({
      contractVersion: '1.0.0', b8ClearanceId: clearance.clearanceId, expectedWorkingRevision,
      segments: [{ key: 'synthetic-adults', label: 'Synthetic adults', description: 'Placeholder segment.' }, { key: 'synthetic-caregivers', label: 'Synthetic caregivers' }],
      primaryTargetSegmentKey: 'synthetic-adults', secondaryTargetSegmentKeys: ['synthetic-caregivers'], positioningStatement,
    });
    const firstWorking = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b9/working`, workingPayload(null, 'Synthetic initial positioning.')));
    const updatedCall = await postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b9/working`, workingPayload(firstWorking.workingRevision, 'Synthetic corrected positioning.'));
    assert.equal(updatedCall.response.status, 200); assert.notEqual(updatedCall.value.workingRevision, firstWorking.workingRevision);
    const lock = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b9/lock`, { contractVersion: '1.0.0', expectedWorkingRevision: updatedCall.value.workingRevision }));
    assert.equal(lock.state, 'LOCKED_STP');
    const hold = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b10-decisions`, { contractVersion: '1.0.0', lockedStpId: lock.lockId, previousDecisionId: null, decision: 'HOLD' }));
    const approve = await expectCreated(postJson(application.origin, `/owner-api/product-workspaces/${product.productWorkspaceId}/b10-decisions`, { contractVersion: '1.0.0', lockedStpId: lock.lockId, previousDecisionId: hold.decisionId, decision: 'APPROVE' }));

    const portfolio = await jsonGet(application.origin, '/api/workspaces');
    const discovery = await jsonGet(application.origin, `/api/workspaces/${workspace.workspaceId}`);
    const baskets = await jsonGet(application.origin, `/api/workspaces/${workspace.workspaceId}/candidate-baskets`);
    const b7Read = await jsonGet(application.origin, `/api/workspaces/${workspace.workspaceId}/candidate-baskets/${basket.basketId}/b7`);
    const detail = await jsonGet(application.origin, `/api/product-workspaces/${product.productWorkspaceId}`);
    const b9 = await jsonGet(application.origin, `/api/product-workspaces/${product.productWorkspaceId}/b9`);
    const b10 = await jsonGet(application.origin, `/api/product-workspaces/${product.productWorkspaceId}/b10`);
    assert.deepEqual([portfolio.workspaces[0].workspaceId, discovery.workspace.workspaceId, discovery.candidates[0].version], [workspace.workspaceId, workspace.workspaceId, 2]);
    assert.deepEqual(baskets.baskets[0].candidates[0], { candidateId: candidate.candidateId, candidateKey: 'synthetic-calcium', candidateVersion: 2, label: candidateRevision.label, summary: candidateRevision.summary, state: 'EXPLORING' });
    assert.equal(b7Read.candidates[0].decisionId, b7.decisionId); assert.equal(b7Read.candidates[0].productWorkspace.productWorkspaceId, product.productWorkspaceId);
    assert.deepEqual({ workspace: detail.product.sourceWorkspaceId, basket: detail.product.sourceBasketId, basketVersion: detail.product.sourceBasketVersion, candidate: detail.product.sourceCandidateId, candidateVersion: detail.product.sourceCandidateVersion, b7: detail.product.sourceB7DecisionId }, { workspace: workspace.workspaceId, basket: basket.basketId, basketVersion: 1, candidate: candidate.candidateId, candidateVersion: 2, b7: b7.decisionId });
    assert.deepEqual(detail.b8.lanes.map((lane: any) => [lane.lane, lane.effectiveState]), lanes.map((lane) => [lane, 'PASS'])); assert.equal(detail.b8.readyForB9, true); assert.equal(detail.clearance.clearanceId, clearance.clearanceId);
    assert.equal(b9.state, 'LOCKED'); assert.equal(b9.working.content.positioningStatement, 'Synthetic corrected positioning.'); assert.equal(b9.locked.lockId, lock.lockId);
    assert.deepEqual(b10.history.map((decision: any) => [decision.decisionId, decision.decisionNumber, decision.previousDecisionId, decision.decision]), [[hold.decisionId, 1, null, 'HOLD'], [approve.decisionId, 2, hold.decisionId, 'APPROVE']]);
    assert.deepEqual(b10.effective, b10.history[1]); assert.equal(b10.readyForB11, true);
    const rendered = JSON.stringify([portfolio, discovery, baskets, b7Read, detail, b9, b10]); assert.doesNotMatch(rendered, /provider|real calcium|sha256|artifact|actor|capability|policy|requestSha/i);
  } finally {
    await application.close(); await assertPortClosed(fixture.port);
  }

  const reopened = openWorkspaceApi({ databasePath: fixture.databasePath, artifactRoot: fixture.artifactRoot });
  assert.equal(reopened.diagnostics().queryOnly, true); reopened.close();
  const db = new BetterSqlite3(fixture.databasePath, { readonly: true });
  assert.deepEqual(db.prepare('SELECT decision_number number,decision FROM governance_product_b10_decisions ORDER BY decision_number').all(), [{ number: 1, decision: 'HOLD' }, { number: 2, decision: 'APPROVE' }]); db.close();
  const files = [fixture.databasePath, `${fixture.databasePath}-wal`, `${fixture.databasePath}-shm`, ...regularFiles(fixture.artifactRoot)].filter(fs.existsSync);
  assertOwnerOnlyFiles(files);
  const stage = path.join(fixture.artifactRoot, '.owner-api-requests'); assert.deepEqual(fs.existsSync(stage) ? fs.readdirSync(stage) : [], []);
  assert.equal(regularFiles(fixture.artifactRoot).some((file) => file.endsWith('.tmp')), false);
  const captured = output.join('\n'); assert.doesNotMatch(captured, new RegExp(SYNTHETIC_OWNER_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); assert.doesNotMatch(captured, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  fs.rmSync(fixture.root, { recursive: true, force: true }); assert.equal(fs.existsSync(fixture.root), false);
});

test('Task045 disabled runtime keeps static/read/health and safe 403 byte-stable', async () => {
  const fixture = await disposableOperatorFixture(false); const before = digest(fixture.databasePath); const application = await startOperator(fixture.configuration);
  try {
    await staticSurface(application.origin);
    assert.deepEqual(await jsonGet(application.origin, '/healthz'), { status: 'ok', version: 'task045-smoke', ownerWritesEnabled: false, localTestOwner: false });
    assert.deepEqual(await jsonGet(application.origin, '/api/workspaces'), { contractVersion: '1.0.0', workspaces: [] });
    const first = await fetch(application.origin + '/owner-api/workspaces', { method: 'POST' }); const bytes = await first.text();
    const second = await fetch(application.origin + '/owner-api/anything', { method: 'POST', body: 'ignored' });
    assert.equal(first.status, 403); assert.equal(second.status, 403); assert.equal(await second.text(), bytes);
  } finally { await application.close(); await assertPortClosed(fixture.port); }
  assert.equal(digest(fixture.databasePath), before); assert.deepEqual(regularFiles(fixture.artifactRoot), []);
  fs.rmSync(fixture.root, { recursive: true, force: true });
});


test('Task045 launcher handles SIGTERM without leaking credentials, paths, or its reserved port', async () => {
  const fixture = await disposableOperatorFixture(true);
  const child = spawn(process.execPath, ['--import', 'tsx', path.resolve('scripts/serve-operator-app.ts')], {
    cwd: path.resolve('.'),
    env: {
      ...process.env,
      TDN_WORKSPACE_DB: fixture.databasePath,
      TDN_ARTIFACT_ROOT: fixture.artifactRoot,
      TDN_OPERATOR_APP_HOST: '127.0.0.1',
      TDN_OPERATOR_APP_PORT: String(fixture.port),
      TDN_OWNER_API_ENABLED: 'true',
      TDN_OWNER_API_TOKEN: SYNTHETIC_OWNER_TOKEN,
      TDN_OWNER_API_ACTOR_ID: 'owner:task045-smoke',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdout = ''; let stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { stdout += chunk; }); child.stderr.on('data', (chunk: string) => { stderr += chunk; });
  try {
    // tsx compiles the whole app on start; under the parallel suite that can pass 10 s.
    await Promise.race([
      new Promise<void>((resolve) => child.stdout.on('data', () => { if (stdout.includes('Operator app listening on')) resolve(); })),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`launcher timeout: ${stderr}`)), 30_000)),
    ]);
    assert.deepEqual(await jsonGet(`http://127.0.0.1:${fixture.port}`, '/healthz'), { status: 'ok', version: fs.readFileSync('VERSION', 'utf8').trim(), ownerWritesEnabled: true, localTestOwner: false });
    assert.equal(child.kill('SIGTERM'), true);
    const [code, signal] = await once(child, 'exit') as [number | null, NodeJS.Signals | null];
    assert.equal(code, 0); assert.equal(signal, null); await assertPortClosed(fixture.port);
    const output = stdout + stderr; assert.doesNotMatch(output, new RegExp(SYNTHETIC_OWNER_TOKEN)); assert.doesNotMatch(output, new RegExp(fixture.root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await once(child, 'exit'); }
    fs.rmSync(fixture.root, { recursive: true, force: true });
  }
});

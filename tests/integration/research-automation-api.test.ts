import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import BetterSqlite3 from 'better-sqlite3';
import researchAutomationApiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/database.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const ownerToken = 'owner-token-1234567890-abcdefghijklmnopqrstuvwxyz';
const requestedPeriod = { startDate: '2026-01-01', endDate: '2026-01-30' };
const roots: string[] = [];

const noProviders = {
  kalodataSecretKey: null,
  serpApiKey: null,
  apifyTokenConfigured: false,
};

interface Fixture {
  root: string;
  databasePath: string;
  artifactRoot: string;
}

interface ReceiptResponse {
  contractVersion: string;
  exactRetry: boolean;
  run: Record<string, any>;
}

type ContractKind = 'run' | 'runList' | 'receipt';

const apiValidators = (() => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(researchAutomationApiSchema);
  return {
    run: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/run`)!,
    runList: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/runList`)!,
    receipt: ajv.getSchema(`${researchAutomationApiSchema.$id}#/$defs/receipt`)!,
  } satisfies Record<ContractKind, NonNullable<ReturnType<typeof ajv.getSchema>>>;
})();

function assertValidContract(value: unknown, kind: ContractKind): void {
  const validator = apiValidators[kind];
  assert.equal(validator(value), true, `${kind} response failed canonical schema: ${JSON.stringify(validator.errors)}`);
}

test.afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

async function createFixture(): Promise<Fixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-automation-api-'));
  roots.push(root);
  const databasePath = path.join(root, 'research.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  const workspaceService = new DiscoveryWorkspaceService({
    db,
    artifactStore: new ContentAddressedArtifactStore(artifactRoot),
    uuid: () => workspaceId,
    now: () => new Date('2026-01-31T00:00:00.000Z'),
  });
  await workspaceService.createWorkspace({
    contractVersion: '1.0.0',
    workspaceKey: 'research-automation-api-test',
    title: 'Research automation API test workspace',
  });
  db.close();
  return { root, databasePath, artifactRoot };
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function withApi<T>(
  fixture: Fixture,
  ownerEnabled: boolean,
  callback: (base: string) => Promise<T>,
): Promise<T> {
  const probe = http.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port;
  await closeServer(probe);

  const origin = `http://127.0.0.1:${port}`;
  const application = openResearchAutomationApi({
    databasePath: fixture.databasePath,
    artifactRoot: fixture.artifactRoot,
    origin,
    providers: noProviders,
    ...(ownerEnabled
      ? {
          owner: {
            writeEnabled: true,
            databasePath: fixture.databasePath,
            artifactRoot: fixture.artifactRoot,
            token: ownerToken,
            allowedOrigin: origin,
            actorId: 'owner:research',
          },
        }
      : {}),
  });
  const server = http.createServer(application.handler);
  server.listen(port, '127.0.0.1');
  await once(server, 'listening');
  try {
    return await callback(origin);
  } finally {
    await closeServer(server);
    await application.close();
  }
}

function ownerHeaders(origin: string, includeAuthorization = true): Record<string, string> {
  return {
    Origin: origin,
    'Content-Type': 'application/json',
    ...(includeAuthorization ? { Authorization: `Bearer ${ownerToken}` } : {}),
  };
}

function startBody(requestKey: string): Record<string, any> {
  return {
    contractVersion: 'research-automation-start-v1',
    requestKey,
    mode: 'CATEGORY',
    requestedPeriod,
    keyword: 'wireless earbuds',
    reports: ['MARKET', 'INSIGHT'],
  };
}

function confirmBody(requestKey: string, expectedRevision: number): Record<string, any> {
  return {
    contractVersion: 'research-automation-confirm-v1',
    requestKey,
    expectedRevision,
    definition: 'Current Vietnam research scope',
    includeTerms: ['wireless earbuds'],
    excludeTerms: [],
    selectedProductIds: [],
    peerProductIds: [],
  };
}

function cancelBody(requestKey: string, expectedRevision: number): Record<string, any> {
  return { contractVersion: 'research-automation-cancel-v1', requestKey, expectedRevision };
}

async function readJson(response: Response): Promise<Record<string, any>> {
  return (await response.json()) as Record<string, any>;
}

async function getRun(base: string, runId: string): Promise<Record<string, any>> {
  const response = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`);
  assert.equal(response.status, 200);
  const body = await readJson(response);
  assertValidContract(body, 'run');
  return body;
}

async function waitForRun(
  base: string,
  runId: string,
  predicate: (run: Record<string, any>) => boolean,
): Promise<Record<string, any>> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const run = await getRun(base, runId);
    if (predicate(run)) return run;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  const run = await getRun(base, runId);
  throw new Error(`timed out waiting for research run; last status=${run.status}`);
}

async function startAndWaitForScope(base: string, requestKey: string): Promise<Record<string, any>> {
  const response = await fetch(
    `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
    {
      method: 'POST',
      headers: ownerHeaders(base),
      body: JSON.stringify(startBody(requestKey)),
    },
  );
  assert.equal(response.status, 202);
  const payload = (await readJson(response)) as ReceiptResponse;
  assertValidContract(payload, 'receipt');
  assert.equal(payload.exactRetry, false);
  assert.equal(payload.run.workspaceId, workspaceId);
  assert.match(payload.run.runId, /^[0-9a-f-]{36}$/);
  return waitForRun(base, payload.run.runId, (run) => run.status === 'AWAITING_SCOPE');
}

function databaseDigest(databasePath: string): string {
  return createHash('sha256').update(fs.readFileSync(databasePath)).digest('hex');
}

function captureCount(databasePath: string): number {
  const db = new BetterSqlite3(databasePath, { readonly: true });
  try {
    return Number(
      (db.prepare('SELECT COUNT(*) AS count FROM analysis_research_automation_captures').get() as { count: number })
        .count,
    );
  } finally {
    db.close();
  }
}

test('readonly API has no writer and owner routes reject unauthenticated writes', async () => {
  const fixture = await createFixture();
  const before = databaseDigest(fixture.databasePath);

  await withApi(fixture, false, async (base) => {
    const listResponse = await fetch(
      `${base}/api/workspaces/${workspaceId}/research-automation/runs`,
    );
    assert.equal(listResponse.status, 200);
    const listBody = await readJson(listResponse);
    assertValidContract(listBody, 'runList');
    assert.deepEqual(listBody.runs, []);

    const writeResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      {
        method: 'POST',
        headers: ownerHeaders(base, false),
        body: JSON.stringify(startBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')),
      },
    );
    assert.equal(writeResponse.status, 403);
    assert.equal((await readJson(writeResponse)).error.code, 'forbidden');
  });

  await withApi(fixture, true, async (base) => {
    const unauthenticatedResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      {
        method: 'POST',
        headers: ownerHeaders(base, false),
        body: JSON.stringify(startBody('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')),
      },
    );
    assert.equal(unauthenticatedResponse.status, 401);
    assert.equal((await readJson(unauthenticatedResponse)).error.code, 'unauthorized');
  });

  assert.equal(databaseDigest(fixture.databasePath), before);
});

test('owner start is 202, exact retry is 200, and unconfigured Kalo stays awaiting scope', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const body = startBody('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
    const firstResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(firstResponse.status, 202);
    const first = (await readJson(firstResponse)) as ReceiptResponse;
    assertValidContract(first, 'receipt');
    assert.equal(first.exactRetry, false);
    assert.match(first.run.runId, /^[0-9a-f-]{36}$/);

    const retryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(retryResponse.status, 200);
    const retry = (await readJson(retryResponse)) as ReceiptResponse;
    assertValidContract(retry, 'receipt');
    assert.equal(retry.exactRetry, true);
    assert.equal(retry.run.runId, first.run.runId);

    const run = await waitForRun(base, first.run.runId, (candidate) => candidate.status === 'AWAITING_SCOPE');
    assert.equal(run.runId, first.run.runId);
    assert.deepEqual(run.productCards, []);
    assert.deepEqual(
      { startDate: run.requestedPeriod.startDate, endDate: run.requestedPeriod.endDate },
      requestedPeriod,
    );
    assert.equal(run.coverage.sources.length, 1);
    assert.equal(run.coverage.sources[0].provider, 'kalodata');
    assert.equal(run.coverage.sources[0].state, 'UNAVAILABLE');
    assert.equal(run.coverage.sources[0].observedStartDate, null);
    assert.equal(run.coverage.sources[0].observedEndDate, null);
    assert.equal(run.steps.find((step: Record<string, any>) => step.stepId === 'QUICK_SEARCH').state, 'UNAVAILABLE');
    assert.equal(captureCount(fixture.databasePath), 0);
  });
});

test('confirm freezes two web reports and reports PDF as unavailable without a renderer', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const run = await startAndWaitForScope(base, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    const body = confirmBody('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', run.revision);
    const confirmResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/confirm-scope`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(confirmResponse.status, 202);
    const confirmed = (await readJson(confirmResponse)) as ReceiptResponse;
    assertValidContract(confirmed, 'receipt');
    assert.equal(confirmed.exactRetry, false);

    const confirmRetryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/confirm-scope`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(body) },
    );
    assert.equal(confirmRetryResponse.status, 200);
    const confirmedRetry = (await readJson(confirmRetryResponse)) as ReceiptResponse;
    assertValidContract(confirmedRetry, 'receipt');
    assert.equal(confirmedRetry.exactRetry, true);
    assert.equal(confirmedRetry.run.runId, confirmed.run.runId);

    const completed = await waitForRun(base, run.runId, (candidate) => candidate.status === 'DRAFT_READY');
    const marketOutput = completed.outputs.market as Record<string, any> | undefined;
    const insightOutput = completed.outputs.insight as Record<string, any> | undefined;
    assert.ok(marketOutput);
    assert.ok(insightOutput);
    const outputs = [marketOutput, insightOutput];
    assert.equal(outputs.length, 2);
    for (const output of outputs) {
      assert.equal(output.web, true);
      assert.equal(output.pdf.available, false);
      assert.equal(typeof output.pdf.reason, 'string');
      assert.match(output.versionId, /^[0-9a-f]{64}$/);
    }
    assert.notEqual(marketOutput.versionId, insightOutput.versionId);

    for (const kind of ['market', 'insight']) {
      const reportResponse = await fetch(
        `${base}/api/workspaces/${workspaceId}/research-automation/runs/${completed.runId}/reports/${kind}`,
      );
      assert.equal(reportResponse.status, 200);
      assert.match(reportResponse.headers.get('content-type') ?? '', /^text\/html/);
      assert.ok((await reportResponse.text()).length > 100);

      const pdfResponse = await fetch(
        `${base}/api/workspaces/${workspaceId}/research-automation/runs/${completed.runId}/reports/${kind}/pdf`,
      );
      assert.equal(pdfResponse.status, 404);
      assert.equal((await readJson(pdfResponse)).error.code, 'pdf_not_available');
    }
  });
});

test('GET remains read-only and cancel is idempotent without repeating an unavailable provider call', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, async (base) => {
    const run = await startAndWaitForScope(base, 'ffffffff-ffff-4fff-8fff-ffffffffffff');
    assert.equal(captureCount(fixture.databasePath), 0);

    const cancelBodyValue = cancelBody('99999999-9999-4999-8999-999999999999', run.revision);
    const cancelResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/cancel`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancelBodyValue) },
    );
    assert.equal(cancelResponse.status, 200);
    const cancelled = (await readJson(cancelResponse)) as ReceiptResponse;
    assertValidContract(cancelled, 'receipt');
    assert.equal(cancelled.exactRetry, false);

    const cancelRetryResponse = await fetch(
      `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${run.runId}/cancel`,
      { method: 'POST', headers: ownerHeaders(base), body: JSON.stringify(cancelBodyValue) },
    );
    assert.equal(cancelRetryResponse.status, 200);
    const cancelledRetry = (await readJson(cancelRetryResponse)) as ReceiptResponse;
    assertValidContract(cancelledRetry, 'receipt');
    assert.equal(cancelledRetry.exactRetry, true);
    assert.equal(cancelledRetry.run.runId, cancelled.run.runId);

    const finalRun = await waitForRun(base, run.runId, (candidate) => candidate.status === 'CANCELLED');
    assert.equal(finalRun.runId, run.runId);
    assert.equal(captureCount(fixture.databasePath), 0);

    const listResponse = await fetch(
      `${base}/api/workspaces/${workspaceId}/research-automation/runs`,
    );
    assert.equal(listResponse.status, 200);
    const listBody = await readJson(listResponse);
    assertValidContract(listBody, 'runList');
    assert.equal(listBody.runs.length, 1);
  });
});

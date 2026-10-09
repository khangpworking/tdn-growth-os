import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import BetterSqlite3 from 'better-sqlite3';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { decisionCliproxySynthesisConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import { AutomationDecisionSynthesisExecutions } from '../../src/modules/analysis/research-automation/decision-synthesis-execution.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import { pausedI14Parent, syntheticI14Input, validI14Response, i14Now } from '../helpers/i14-execution-fixture.js';
import { reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const token = 'synthetic-owner-token-1234567890-abcdefghijklmnopqrstuvwxyz';
const sections = ['M11', 'M12', 'I15'] as const;
const sourceText = 'Tôi mua tặng sản phẩm.';
const prohibited = ['Mua sản phẩm đối thủ để kiểm tra chất lượng', 'Buy a competitor product to assess its quality'];
const orderProposals = ['Order a competitor’s product to assess quality', 'Order two units of the competitor product for quality assessment'];
const safeNegation = 'No purchase is needed to assess quality; use public sources and owner data';
function proposal(sectionId: typeof sections[number], claimId: string) {
  return { candidateType: sectionId === 'M12' ? 'ACTION_OPTION' : sectionId === 'I15' ? 'STRATEGY_OPTION' : 'HYPOTHESIS',
    candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
    text: 'Có thể đối chiếu chất lượng qua review công khai và dữ liệu chủ cung cấp.',
    conciseEvidenceLinkedRationale: 'Nguồn synthetic nêu mua tặng; chưa xác minh chất lượng.',
    citedClaimRefs: [claimId], counterevidenceRefs: [], counterevidenceRelations: [],
    assumptions: ['Nguồn chưa được xác minh độc lập.'], unknowns: ['Chưa rõ chất lượng sản phẩm.'],
    evidenceGaps: ['Cần thêm dữ liệu chủ cung cấp.'], limitations: ['Một bản ghi không đại diện thị trường.'],
    immediateTask: 'Không mua hay đặt hàng thử sản phẩm; đối chiếu review công khai.',
    proposedOwner: 'Chủ xác nhận', proposedDeadline: 'Trong hai tuần',
    ...(sectionId === 'M12' ? { prerequisites: ['Chỉ dùng nguồn công khai và dữ liệu chủ cung cấp.'] } : {}),
    ...(sectionId === 'I15' ? { conditions: ['Chủ xem xét trước khi quyết định.'] } : {}) };
}
async function close(server: http.Server) {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('OWNER HTTP action retains U16 INVALID, renders blocked proposals, and reads/retries without configuration or writes', { timeout: 120_000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-u16-owner-api-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'synthetic.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const seed = openDatabase({ databasePath }).db;
  const workspaces = new DiscoveryWorkspaceService({ db: seed, artifactStore: artifacts, uuid: () => workspaceId });
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-u16', title: 'Synthetic U16' });
  const native = await seedNativeDamiPackage(new SourcePackageService({ db: seed, artifactStore: artifacts }), {
    rawRows: [
      { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: 'synthetic-u16-source', comment: sourceText, rating_star: 5 },
      { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: 'synthetic-u16-description', comment: 'Tôi đã mua thử sản phẩm.', rating_star: 5 },
    ],
  });
  seed.close();
  const sourceBytes = native.files.get('capture/dataset.json')!;
  let scenario = 'purchase';
  const requests: { sectionId: string; input: Record<string, any>; system: string }[] = [];
  const errors: unknown[] = [];
  const gateway = http.createServer(async (request, response) => {
    try {
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const input = JSON.parse(body.messages[1].content);
      const sectionId = input.sectionId as typeof sections[number];
      assert.ok(sections.includes(sectionId));
      assert.equal(input.methodVersion, '1.3.0');
      assert.equal(input.packet.methodVersion, '1.3.0');
      assert.equal(input.runId.length, 36);
      assert.equal(input.workspaceId, workspaceId);
      assert.equal(body.model, `synthetic-${sectionId}`);
      assert.match(body.messages[0].content, /General purchase-to-inspect/);
      assert.equal(input.ownerInputs.question.state, 'UNSET');
      assert.equal(input.supportEligible.length, 1);
      assert.equal(input.supportEligible[0].contextFields[0].quote, 'mua tặng');
      requests.push({ sectionId, input, system: body.messages[0].content });
      const candidate = proposal(sectionId, input.supportEligible[0].claimId);
      if (scenario === 'purchase' && sectionId === 'M12') candidate.text = prohibited[0]!;
      if (scenario === 'purchase' && sectionId === 'I15') candidate.immediateTask = prohibited[1]!;
      if (scenario === 'order' && sectionId === 'M12') candidate.text = orderProposals[0]!;
      if (scenario === 'order' && sectionId === 'I15') candidate.immediateTask = orderProposals[1]!;
      if (scenario === 'safe-negation') candidate.immediateTask = safeNegation;
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify({ aiCandidates: [candidate] }) }, finish_reason: 'stop' }] }));
    } catch (error) { errors.push(error); response.writeHead(500); response.end('Synthetic assertion failed'); }
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(() => close(gateway));
  const cliproxy = { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-loopback-only-key' };
  const history: { runId: string; confirm: Record<string, unknown>; reports: Record<string, string>; pairId: string }[] = [];
  async function api(configured: boolean, callback: (base: string) => Promise<void>) {
    const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
    const port = (probe.address() as AddressInfo).port; await close(probe);
    const base = `http://127.0.0.1:${port}`;
    const app = openResearchAutomationApi({ databasePath, artifactRoot, origin: base,
      providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
      owner: { writeEnabled: true, databasePath, artifactRoot, token, allowedOrigin: base, actorId: 'owner:synthetic-u16' },
      ...(configured ? { decisionSynthesis: { cliproxy, configurations: Object.fromEntries(sections.map(sectionId =>
        [sectionId, decisionCliproxySynthesisConfiguration(sectionId, `synthetic-${sectionId}`)])) } } : {}) });
    const server = http.createServer(app.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
    try { await callback(base); } finally { await close(server); await app.close(); }
  }
  const headers = (base: string, authorized = true) => ({ Origin: base, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) });
  async function post(base: string, route: string, body: unknown, authorized = true) {
    return fetch(`${base}/owner-api/workspaces/${workspaceId}/research-automation/runs${route}`, { method: 'POST', headers: headers(base, authorized), body: JSON.stringify(body) });
  }
  async function run(base: string, runId: string, state: string) {
    for (let count = 0; count < 400; count++) {
      const response = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`);
      assert.equal(response.status, 200);
      const value = await response.json() as Record<string, any>;
      if (value.status === state) return value;
      assert.notEqual(value.status, 'FAILED', JSON.stringify(value));
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error(`Synthetic run did not reach ${state}`);
  }
  const rows = () => {
    const db = new BetterSqlite3(databasePath, { readonly: true });
    try { return db.prepare('SELECT * FROM analysis_research_automation_ai_executions ORDER BY run_id,section_id').all() as Record<string, any>[]; }
    finally { db.close(); }
  };
  const persisted = () => {
    const db = new BetterSqlite3(databasePath, { readonly: true });
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
      return JSON.stringify(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row)).sort()]));
    } finally { db.close(); }
  };
  await api(true, async base => {
    for (const mode of ['purchase', 'order', 'safe-negation', 'public-evidence']) {
      scenario = mode;
      const invalid = mode === 'purchase' || mode === 'order';
      const start = { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic U16',
        requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] };
      assert.equal((await post(base, '', start, false)).status, 401);
      const started = await post(base, '', start); assert.equal(started.status, 202, await started.clone().text());
      const runId = (await started.json() as Record<string, any>).run.runId;
      const awaiting = await run(base, runId, 'AWAITING_SCOPE');
      const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
        definition: 'Synthetic exact listing quality assessment', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
        exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] };
      assert.equal((await post(base, `/${runId}/confirm-scope`, confirm, false)).status, 401);
      assert.equal((await post(base, `/${runId}/confirm-scope`, { ...confirm, actorId: 'forged' })).status, 400);
      const accepted = await post(base, `/${runId}/confirm-scope`, confirm); assert.equal(accepted.status, 202, await accepted.clone().text());
      await run(base, runId, 'DRAFT_READY');
      assert.deepEqual(errors, []);
      const current = rows().filter(row => row.run_id === runId);
      assert.equal(current.length, 3);
      for (const row of current) {
        assert.equal(row.state, 'COMPLETED');
        const rejected = invalid && row.section_id !== 'M11';
        assert.equal(row.validation_status, rejected ? 'INVALID' : 'VALID');
        assert.equal(row.validation_code, rejected ? 'INVALID_DECISION_CANDIDATES' : null);
        assert.equal(row.unknown_code, null);
        assert.equal(row.candidates_sha256 === null, rejected);
        const input = JSON.parse((await artifacts.read(row.input_sha256)).toString());
        const packet = JSON.parse((await artifacts.read(row.admission_sha256)).toString());
        const prompt = JSON.parse((await artifacts.read(row.prompt_sha256)).toString());
        assert.equal(packet.methodVersion, '1.3.0'); assert.equal(prompt.promptVersion, '1.4.0');
        assert.equal(input.packet.packetSha256, row.admission_sha256);
        assert.equal(input.scopeSha256, row.scope_sha256);
        assert.deepEqual(input.authority, packet.authority);
        assert.equal(input.workspaceId, row.workspace_id);
        assert.equal(input.runId, row.run_id);
        assert.equal(input.sectionId, row.section_id);
      }
      const apiRoot = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
      const versions = await (await fetch(`${apiRoot}/report-versions`)).json() as Record<string, any>;
      const pairId = versions.versions[0].pairId;
      const reports: Record<string, string> = {};
      for (const kind of ['market', 'insight']) {
        const response = await fetch(`${apiRoot}/report-versions/${pairId}/reports/${kind}`);
        assert.equal(response.status, 200, await response.clone().text());
        reports[kind] = await response.text();
        const visible = reportVisibleText(reports[kind]!);
        assert.deepEqual(visibleTextViolations(visible), []);
        for (const phrase of [...prohibited, ...orderProposals]) assert.equal(visible.includes(phrase), false);
        assert.equal(visible.includes('Đề xuất AI bị chặn'), invalid);
        if (!invalid || kind === 'market') assert.match(visible, /review công khai và dữ liệu chủ cung cấp/);
        if (mode === 'safe-negation') assert.ok(visible.includes(safeNegation));
      }
      history.push({ runId, confirm, reports, pairId });
    }
  });
  assert.equal(requests.length, 12);
  assert.deepEqual(await artifacts.read(native.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256), sourceBytes);
  const before = rows();
  const allBefore = persisted();
  await api(false, async base => {
    for (const saved of history) {
      const retry = await post(base, `/${saved.runId}/confirm-scope`, saved.confirm);
      assert.equal(retry.status, 200, await retry.clone().text());
      assert.equal((await retry.json() as Record<string, any>).exactRetry, true);
      for (const kind of ['market', 'insight']) {
        const response = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/runs/${saved.runId}/report-versions/${saved.pairId}/reports/${kind}`);
        assert.equal(response.status, 200, await response.clone().text());
        assert.equal(await response.text(), saved.reports[kind]);
      }
    }
  });
  assert.equal(requests.length, 12, 'reopening with no model config never redispatches');
  assert.deepEqual(rows(), before, 'stored verdicts/inputs are immutable on read and exact action retry');
  assert.equal(persisted(), allBefore, 'OWNER retry and immutable report reads add no rows or artifact manifests');
});

test('new U16 INVALID verdict and input replay on query-only execution after current source version changes', async t => {
  const fixture = await pausedI14Parent(); t.after(() => fixture.cleanup());
  const source = { sectionId: 'I15' as const, packetVersion: '1.3.0' as const,
    evidence: { ...syntheticI14Input(), admissionVersion: '1.1.0' as const } };
  const owner = new AutomationDecisionSynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now, sectionId: 'I15' });
  let calls = 0;
  const rejected = await owner.execute({ parent: fixture.parent, source, ai: {
    configuration: decisionCliproxySynthesisConfiguration('I15', 'synthetic-only'),
    port: { async generateText() { calls++; return { text: JSON.stringify({ aiCandidates: [{
      ...proposal('I15', (validI14Response(source.evidence).aiCandidates[0]!.citedClaimRefs as string[])[0]!), text: prohibited[1] }] }) }; } },
  } });
  assert.equal(rejected.status, 'INVALID');
  fixture.release(); await fixture.reportPromise;
  const rows = fixture.db.prepare('SELECT * FROM analysis_research_automation_ai_executions').all();
  fixture.db.pragma('query_only = ON');
  const changed = { ...source, packetVersion: '1.2.0' as const };
  assert.deepEqual(await owner.execute({ parent: fixture.parent, source: changed, ai: null }), { ...rejected, dispatched: false });
  assert.deepEqual(await owner.read(fixture.parent, changed), { ...rejected, dispatched: false });
  assert.equal(calls, 1);
  assert.deepEqual(fixture.db.prepare('SELECT * FROM analysis_research_automation_ai_executions').all(), rows);
});

test('insufficient U16 source cannot dispatch or become a valid empty model response', async t => {
  const fixture = await pausedI14Parent(); t.after(() => fixture.cleanup());
  const base = syntheticI14Input();
  const claimsSha256 = createHash('sha256').update(canonicalJson([])).digest('hex');
  const source = { sectionId: 'I15' as const, packetVersion: '1.3.0' as const, evidence: { ...base,
    admissionVersion: '1.1.0' as const, locatedMethodOutput: null, claimsSha256,
    sourceClaims: { ...(base.sourceClaims as Record<string, unknown>), claims: [], claimsSha256 } } };
  const owner = new AutomationDecisionSynthesisExecutions({ ...fixture, artifactStore: fixture.artifacts, now: i14Now, sectionId: 'I15' });
  let calls = 0;
  const result = await owner.execute({ parent: fixture.parent, source, ai: {
    configuration: decisionCliproxySynthesisConfiguration('I15', 'synthetic-only'),
    port: { async generateText() { calls++; return { text: '{"aiCandidates":[]}' }; } },
  } });
  assert.deepEqual(result, { status: 'NOT_DISPATCHED', reason: 'INSUFFICIENT_EVIDENCE' });
  assert.equal(calls, 0);
  assert.equal((fixture.db.prepare('SELECT count(*) n FROM analysis_research_automation_ai_executions').get() as { n: bigint }).n, 0n);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { openDatabase } from '../../src/platform/db/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';

function pdfFixture(): Buffer {
  const text = 'BT /F1 12 Tf 20 100 Td (Calcium 120 mg) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  let pdf = '%PDF-1.4\n'; const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf)); pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n' + offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

test('Cloud CLI persists private unreviewed results, preserves SQLite bytes, and cannot redispatch an existing attempt', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-pageindex-cli-'));
  const database = path.join(root, 'db.sqlite'), artifacts = path.join(root, 'artifacts');
  const bytes = pdfFixture(), digest = createHash('sha256').update(bytes).digest('hex');
  try {
    const opened = openDatabase({ databasePath: database });
    const service = new SourcePackageService({ db: opened.db, artifactStore: new ContentAddressedArtifactStore(artifacts) });
    const result = await service.intake({ contractVersion: '1.0.0', packageKey: 'manual:pageindex-synthetic', version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Synthetic PDF', files: [{ path: 'fixture.pdf', sha256: digest,
        byteSize: bytes.length, mediaType: 'application/pdf', evidenceFamily: 'synthetic', representationRole: 'primary',
        independence: 'independent', providerProvenance: 'synthetic', provenanceBasis: 'Public fixture' }] }, new Map([['fixture.pdf', bytes]]));
    opened.db.close();
    const databaseBefore = await fs.readFile(database);
    const requestFile = path.join(root, 'request.json'), preload = path.join(root, 'transport.mjs');
    const request = { contractVersion: 'pageindex-cloud-query-v1', sourcePackageId: result.packageId,
      manifestSha256: result.manifestArtifactSha256, logicalPath: 'fixture.pdf', sourceSha256: digest,
      cloudDocId: 'pi-fixture', cloudFileName: 'fixture.pdf', pageCount: 1, question: 'Amount?' };
    await fs.writeFile(requestFile, JSON.stringify(request));
    // Test transport only. The production CLI, PDF parser and database reader run unchanged.
    await fs.writeFile(preload, `import fs from 'node:fs';
      const citation = {document:'fixture.pdf',page:1,block_id:'p1_text_1',block_type:'text',bbox:[0,0,100,100]};
      globalThis.fetch = async (url) => {
        fs.appendFileSync(${JSON.stringify(path.join(root, 'calls.txt'))}, String(url)+'\\n');
        if(process.env.TEST_PI_FAIL==='true') throw new Error('private-fake-key');
        const data = String(url).endsWith('/metadata') ? {id:'pi-fixture',name:'fixture.pdf',pageNum:1,status:'completed'}
          : String(url).endsWith('/chat/completions') ? {choices:[{message:{content:'120 mg <doc=fixture.pdf;page=1;block=p1_text_1>'}}],citations:[citation]}
          : {doc_id:'pi-fixture',page:1,block_id:'p1_text_1',block_type:'text',bbox:[0,0,100,100],text:'Calcium 120 mg'};
        return new Response(JSON.stringify(data));
      };`);
    const run = (directory: string, fail = false) => spawnSync(process.execPath, ['--import', preload, '--import', 'tsx',
      'scripts/query-pageindex-cloud.ts', database, artifacts, requestFile, directory], { encoding: 'utf8', timeout: 30_000,
      env: { ...process.env, TDN_PAGEINDEX_CLOUD_ENABLED: 'true', PAGEINDEX_API_KEY: 'private-fake-key', TEST_PI_FAIL: String(fail) } });
    const output = path.join(root, 'success');
    const first = run(output); assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).locallyMatched, 1);
    const saved = JSON.parse(await fs.readFile(path.join(output, 'result.json'), 'utf8'));
    assert.equal(saved.approvalState, 'UNREVIEWED'); assert.equal(saved.candidates[0].quote, 'Calcium 120 mg');
    const receipt = JSON.parse(await fs.readFile(path.join(output, 'receipt.json'), 'utf8'));
    assert.equal(receipt.resultSha256, createHash('sha256').update(await fs.readFile(path.join(output, 'result.json'))).digest('hex'));
    const callsBeforeRetry = await fs.readFile(path.join(root, 'calls.txt'), 'utf8');
    assert.equal(run(output).status, 1);
    assert.equal(await fs.readFile(path.join(root, 'calls.txt'), 'utf8'), callsBeforeRetry);
    const failedOutput = path.join(root, 'ambiguous'); const failed = run(failedOutput, true);
    assert.equal(failed.status, 1); assert.match(failed.stderr, /PAGEINDEX_TRANSPORT_FAILED/);
    assert.ok(await fs.stat(path.join(failedOutput, 'attempt.json')));
    assert.equal(await fs.stat(path.join(failedOutput, 'receipt.json')).then(() => true, () => false), false);
    const callsAfterFailure = await fs.readFile(path.join(root, 'calls.txt'), 'utf8');
    assert.equal(run(failedOutput).status, 1);
    assert.equal(await fs.readFile(path.join(root, 'calls.txt'), 'utf8'), callsAfterFailure);
    assert.deepEqual(await fs.readFile(database), databaseBefore);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(output)).mode & 0o777, 0o700);
      for (const file of ['request.json', 'attempt.json', 'result.json', 'receipt.json']) {
        assert.equal((await fs.stat(path.join(output, file))).mode & 0o777, 0o600);
      }
    }
    await fs.writeFile(requestFile, JSON.stringify({ ...request, manifestSha256: '0'.repeat(64) }));
    const mismatched = run(path.join(root, 'mismatch'));
    assert.equal(mismatched.status, 1); assert.match(mismatched.stderr, /PAGEINDEX_SOURCE_IDENTITY_MISMATCH/);
    assert.equal(await fs.readFile(path.join(root, 'calls.txt'), 'utf8'), callsAfterFailure);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

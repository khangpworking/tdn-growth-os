import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { PreparedReportCreateRequest } from '../../contracts/analysis/prepared-report-create-request.generated.js';
import { ReportVersionService } from '../../src/modules/analysis/report-version-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { preparedReportFixture, byteDigest } from './prepared-report-fixture.js';

/**
 * Linux-only synthetic acceptance helper for the live immutable report path.
 * It creates both presentations through ReportVersionService, reopens every
 * retained artifact through the version reader, and writes a disposable
 * outside-Git bundle for browser/API review. It never touches live data.
 */
if (process.platform !== 'linux') throw new Error('Linux-only live citation helper');
const output = process.argv[2];
if (!output || !path.isAbsolute(output)) throw new Error('Absolute outside-Git output directory required');

async function main(output: string): Promise<void> {
  try {
    await fs.lstat(output);
    throw new Error('Output directory already exists; choose a new disposable path');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  await fs.mkdir(output, { recursive: true, mode: 0o700 });

  const state = await preparedReportFixture(true);
  try {
    const reports = new ReportVersionService({
      db: state.db, artifactStore: state.artifacts, dependencies: state.dependencies,
      preparations: state.preparations, sectionArtifacts: state.sectionArtifacts,
    });
    const request = (reportKey: string, reportPresentation: 'report-kit-v1' | 'report-kit-citations-v1'): PreparedReportCreateRequest => ({
      contractVersion: 'prepared-report-v1', reportKey, version: 1, previousSemanticVersionId: null,
      reportPresentation, sourceRequest: state.sourceRequest,
      preparationSha256: state.preparation.result.preparationSha256,
      readinessSha256: state.readiness.readinessSha256,
      sectionArtifactSha256: state.retainedM03.record.sectionArtifactSha256,
    });
    const oldRequest = request('live-old-kit', 'report-kit-v1');
    const citationRequest = request('live-citation-kit', 'report-kit-citations-v1');
    const old = await reports.createPreparedVersion(oldRequest, state.catalogBytes);
    const citation = await reports.createPreparedVersion(citationRequest, state.catalogBytes);
    const oldRetry = await reports.createPreparedVersion(structuredClone(oldRequest), state.catalogBytes);
    const citationRetry = await reports.createPreparedVersion(structuredClone(citationRequest), state.catalogBytes);
    assert.equal(oldRetry.databaseMutations, 0);
    assert.equal(citationRetry.databaseMutations, 0);

    const writeVersion = async (name: string, execution: typeof citation) => {
      const record = await reports.readVersion(execution.reportId, execution.version);
      const directory = path.join(output, name);
      await fs.mkdir(directory, { mode: 0o700 });
      const artifacts: { fileName: string; sha256: string; byteSize: number }[] = [];
      for (const member of record.artifacts) {
        const verified = await reports.readArtifact(record.reportId, record.version, member.fileName);
        assert.equal(byteDigest(verified.bytes), member.sha256, member.fileName);
        await fs.writeFile(path.join(directory, member.fileName), verified.bytes, { mode: 0o600 });
        artifacts.push({ fileName: member.fileName, sha256: member.sha256, byteSize: member.byteSize });
      }
      return { reportId: record.reportId, version: record.version, versionId: record.versionId,
        semanticVersionId: record.semanticVersionId, artifacts };
    };
    const oldRecord = await writeVersion('old-report-kit-v1', old);
    const citationRecord = await writeVersion('report-kit-citations-v1', citation);
    await fs.writeFile(path.join(output, 'receipt.json'), `${canonicalJson({
      syntheticOnly: true, providerCalls: 0, aiCalls: 0,
      old: oldRecord, citation: citationRecord,
      exactRetries: { old: oldRetry, citation: citationRetry },
    })}\n`, { mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ output, ...oldRecord, citation: citationRecord, providerCalls: 0, aiCalls: 0 })}\n`);
  } finally {
    await state.cleanup();
  }
}

await main(output);

import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import apiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import readerSchema from '../../../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import inputSchema from '../../../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import peerSchema from '../../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import type { ResearchAutomationUnitSpecIntakeRequest, ResearchAutomationUnitSpecIntakeRecord, ResearchAutomationUnitSpecIntakeReceipt } from '../../../../contracts/api/research-automation-reader-report-api.generated.js';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { MarketUnitPriceError, projectMarketUnitPrices } from '../reader-report/market-unit-prices.js';
import { ResearchAutomationIntegrityError, ResearchAutomationValidationError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true }); addFormats(ajv);
for (const schema of [peerSchema, apiSchema, inputSchema, readerSchema]) ajv.addSchema(schema);
const validRequest = ajv.compile<ResearchAutomationUnitSpecIntakeRequest>({ $ref: `${readerSchema.$id}#/$defs/unitSpecIntakeRequest` });
const validRecord = ajv.compile<ResearchAutomationUnitSpecIntakeRecord>({ $ref: `${readerSchema.$id}#/$defs/unitSpecIntakeRecord` });
export const MAX_UNIT_SPEC_FILE_BYTES = 2 * 1024 * 1024;
export const MAX_UNIT_SPEC_TOTAL_BYTES = 8 * 1024 * 1024;
export const MAX_UNIT_SPEC_FILES = 16;
const RECEIPT_MEDIA_TYPE = 'application/vnd.tdn.reader-unit-spec-intake+json';
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const reject = (message: string): never => { throw new ResearchAutomationValidationError(message); };

export interface UnitSpecContext {
  readonly workspaceId: string; readonly runId: string; readonly draftPairId: string;
  readonly metricPackageId: string; readonly workbookSha256: string;
  readonly rows: readonly ReaderReportInput['rows'][number][];
}

/** Retains declarations through the existing artifact registry. A receipt proves
 * authenticated operator intake, never seller authenticity or report approval. */
export class ReaderUnitSpecIntakes {
  constructor(private readonly db: Database.Database, private readonly artifacts: ContentAddressedArtifactStore,
    private readonly staging: RequestScopedArtifactStore | undefined, private readonly now: () => Date) {}

  async prepare(context: UnitSpecContext, value: unknown, files: ReadonlyMap<string, Uint8Array>, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationUnitSpecIntakeReceipt> {
    if (actor.role !== 'OWNER' || !actor.actorId.trim()) reject('Cần quyền OWNER để lưu quy cách.');
    if (!this.staging) reject('Chức năng tải quy cách chưa khả dụng.');
    if (!validRequest(value)) reject('Thông tin quy cách không đúng định dạng.');
    const request = JSON.parse(canonicalJson(value)) as ResearchAutomationUnitSpecIntakeRequest;
    if (request.metricPackageId !== context.metricPackageId) reject('Quy cách không thuộc đúng tệp sản phẩm của phiên này.');
    const sources = request.unitPrices.sources;
    if (!sources.length || sources.length > MAX_UNIT_SPEC_FILES || files.size !== sources.length || !request.unitPrices.records.length)
      reject('Cần từ một đến 16 tệp được dùng trong các quan sát quy cách.');
    const consumed = new Set(request.unitPrices.records.flatMap(record => [record.source.sourceSha256, ...(record.quantityOverride ? [record.quantityOverride.source.sourceSha256] : [])]));
    const retained = sources.map(source => {
      const bytes = files.get(source.sha256);
      if (!bytes || !bytes.byteLength || bytes.byteLength > MAX_UNIT_SPEC_FILE_BYTES || !consumed.has(source.sha256))
        return reject('Tệp quy cách bị thiếu, không được dùng hoặc vượt giới hạn 2 MiB.');
      if (hash(bytes) !== source.sha256) reject('Nội dung tệp không khớp mã kiểm tra đã khai báo.');
      try { JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { reject('Tệp quy cách phải là JSON UTF-8 hợp lệ.'); }
      return { sha256: source.sha256, bytes: Buffer.from(bytes) };
    });
    if (retained.reduce((n, source) => n + source.bytes.byteLength, 0) > MAX_UNIT_SPEC_TOTAL_BYTES) reject('Tổng tệp quy cách vượt giới hạn 8 MiB.');
    if (request.unitPrices.records.some(record => !request.platforms.includes(record.observation.platform))) reject('Quan sát không thuộc sàn đã chọn.');
    // API generation uses arrays where the same canonical input schema generates tuples.
    // AJV above validates their shared field/count constraints before this representation cast.
    try { projectMarketUnitPrices({ contractVersion: '1.4.0', rows: context.rows, unitPrices: request.unitPrices as unknown as NonNullable<ReaderReportInput['unitPrices']> }, retained); }
    catch (error) { if (error instanceof MarketUnitPriceError) reject('Không xác minh được listing, biến thể, vị trí nguồn, giá hoặc số lượng đã khai báo.'); throw error; }
    const record: ResearchAutomationUnitSpecIntakeRecord = { contractVersion: 'reader-unit-spec-intake-record-v1',
      workspaceId: context.workspaceId, runId: context.runId, draftPairId: context.draftPairId,
      workbookSha256: context.workbookSha256, actorId: actor.actorId, request };
    if (!validRecord(record)) throw new ResearchAutomationIntegrityError('Unit-spec intake record is invalid.');
    const recordBytes = Buffer.from(canonicalJson(record)), intakeSha256 = hash(recordBytes);
    const prior = this.db.prepare('SELECT sha256 FROM artifact_manifests WHERE sha256=?').get(intakeSha256);
    if (prior) {
      await this.read(context, intakeSha256, request);
      return { contractVersion: 'reader-unit-spec-intake-receipt-v1', exactRetry: true, intakeSha256,
        workspaceId: context.workspaceId, runId: context.runId, request };
    }
    return this.staging!.withOwnership(async () => {
      const storedSources = await Promise.all(retained.map(source => this.staging!.put(source.bytes)));
      const storedRecord = await this.staging!.put(recordBytes);
      // All input/provenance validation precedes any canonical byte publication.
      this.db.exec('BEGIN IMMEDIATE');
      try {
        for (const source of storedSources) this.#manifest(source, 'application/json', '1.0.0');
        this.#manifest(storedRecord, RECEIPT_MEDIA_TYPE, record.contractVersion);
        for (const artifact of [...storedSources, storedRecord]) await this.staging!.publishOwned(artifact.sha256);
        this.db.exec('COMMIT');
      } catch (error) { if (this.db.inTransaction) this.db.exec('ROLLBACK'); throw error; }
      return { contractVersion: 'reader-unit-spec-intake-receipt-v1', exactRetry: false, intakeSha256,
        workspaceId: context.workspaceId, runId: context.runId, request };
    });
  }

  async read(context: UnitSpecContext, digest: string, request?: ResearchAutomationUnitSpecIntakeRequest): Promise<ResearchAutomationUnitSpecIntakeRecord> {
    const bytes = await this.#readRegistered(digest, RECEIPT_MEDIA_TYPE, 'reader-unit-spec-intake-record-v1');
    let record: unknown;
    try { record = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new ResearchAutomationIntegrityError('Stored unit-spec receipt is unreadable.'); }
    if (!validRecord(record)) throw new ResearchAutomationIntegrityError('Stored unit-spec receipt is invalid.');
    if (record.workspaceId !== context.workspaceId || record.runId !== context.runId || record.draftPairId !== context.draftPairId ||
      record.workbookSha256 !== context.workbookSha256 || (record.request.metricPackageId !== context.metricPackageId || (request !== undefined && canonicalJson(record.request) !== canonicalJson(request))))
      reject('Biên nhận quy cách không thuộc đúng phiên, tệp sản phẩm hoặc bộ quan sát này.');
    for (const source of record.request.unitPrices.sources) await this.#readRegistered(source.sha256, 'application/json', '1.0.0');
    return record;
  }

  async #readRegistered(digest: string, mediaType: string, version: string): Promise<Buffer> {
    const manifest = this.db.prepare('SELECT byte_size,relative_path,media_type,contract_version,retention_status FROM artifact_manifests WHERE sha256=?').get(digest) as
      { byte_size: number | bigint; relative_path: string; media_type: string; contract_version: string; retention_status: string } | undefined;
    if (!manifest || manifest.media_type !== mediaType || manifest.contract_version !== version || !['active', 'held'].includes(manifest.retention_status))
      reject('Không tìm thấy biên nhận hoặc nguồn quy cách đã lưu hợp lệ.');
    let bytes: Buffer;
    try { bytes = await this.artifacts.read(digest, { maxBytes: MAX_UNIT_SPEC_FILE_BYTES }); }
    catch { throw new ResearchAutomationIntegrityError('Stored unit-spec evidence failed integrity verification.'); }
    if (BigInt(bytes.byteLength) !== BigInt(manifest!.byte_size) || manifest!.relative_path !== `sha256/${digest.slice(0, 2)}/${digest}`)
      throw new ResearchAutomationIntegrityError('Stored unit-spec manifest failed verification.');
    return bytes;
  }

  #manifest(artifact: StoredArtifact, mediaType: string, version: string): void {
    const at = this.now().toISOString();
    this.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,?,?,?,?,'active',?) ON CONFLICT(sha256) DO NOTHING`).run(artifact.sha256, artifact.byteSize, mediaType, artifact.relativePath, at, version, at);
    const row = this.db.prepare('SELECT byte_size,media_type,relative_path,contract_version,retention_status FROM artifact_manifests WHERE sha256=?').get(artifact.sha256) as
      { byte_size: number | bigint; media_type: string; relative_path: string; contract_version: string; retention_status: string };
    if (BigInt(row.byte_size) !== BigInt(artifact.byteSize) || row.media_type !== mediaType || row.relative_path !== artifact.relativePath || row.contract_version !== version || !['active', 'held'].includes(row.retention_status))
      throw new ResearchAutomationIntegrityError('Unit-spec artifact manifest conflict.');
  }
}

import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import type { AutomatedVideoReading } from '../../contracts/analysis/video-reading-v3.generated.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildAutomatedVideoReading, buildSubtitleVideoReading, publishAutomatedVideoReading } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createVideoWatchModel } from '../../src/modules/analysis/research-automation/video-watch-gemini.js';
import type { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';
import { s07Hash } from './raw-db-v1-s07.js';
import document from './raw-db-v1-s14.synthetic.json' with { type: 'json' };

export const S14_FILE = fileURLToPath(new URL('./raw-db-v1-s14.synthetic.json', import.meta.url));
export const S14_RUN = 'synthetic-s14-file';
export const S14_DOCUMENT = document;
export const S14_READINGS = [document.records[0]!.files![0]!.content, document.records[2]!.files![0]!.content] as AutomatedVideoReading[];
export const S14_CALLS = [document.records[1]!, document.records[3]!].map(call => ({
  requestParameters: call.requestParameters!, requestedAt: call.requestedAt!, completedAt: call.completedAt!,
  httpStatus: call.httpStatus!, outcome: call.outcome!, billing: call.billing!, responseSha256: call.responseSha256!,
}));
export const S14_RECEIPT = { runId: S14_RUN, captures: 2, readings: 2, readingsAlreadyPresent: 0, videosInserted: 2, segments: 6 };
export const s14CapturePrefix = async () => `S14:${s07Hash(await fs.readFile(S14_FILE)).slice(0, 12)}`;

/** Real scope confirmation, Foundation attachments and model capture envelopes, pinned in a stored COLLECTION fixture. */
export async function saveVideoReadingRun(
  f: { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string; service: ResearchAutomationService },
  templates: readonly AutomatedVideoReading[] = S14_READINGS,
) {
  const workspaceId = S14_READINGS[0]!.workspaceId;
  for (let i = 0; (await f.service.getRun(workspaceId, f.runId)).status !== 'AWAITING_SCOPE'; i++) {
    if (i >= 10 || !await f.service.processNext()) throw new Error('synthetic S14 run did not reach scope confirmation');
  }
  await f.service.confirmScope(workspaceId, f.runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await f.service.getRun(workspaceId, f.runId)).revision, definition: 'Synthetic S14 scope',
    includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  const prepared = await prepareVideoReadingCollection(f, templates);
  const bytes = Buffer.from(canonicalJson(prepared.document));
  const stored = await f.artifacts.put(bytes), at = '2026-11-03T03:00:00.000Z';
  f.db.prepare(`INSERT INTO artifact_manifests (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
    VALUES (?,?,'application/vnd.tdn.research-automation.step+json',?,?,'1.0.0',?)`)
    .run(stored.sha256, stored.byteSize, stored.relativePath, at, at);
  f.db.prepare(`UPDATE analysis_research_automation_steps SET state='SUCCEEDED',result_sha256=?,started_at=?,finished_at=?
    WHERE run_id=? AND step_id='COLLECTION' AND state='QUEUED'`).run(stored.sha256, at, at, f.runId);
  f.db.prepare(`UPDATE analysis_research_automation_runs SET revision=revision+1,status='RENDERING' WHERE run_id=?`).run(f.runId);
  f.db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='REPORTS'`).run(f.runId);
  return prepared.result;
}

/** Retain readings before the caller finalizes COLLECTION; never rewrite a settled step. */
export async function prepareVideoReadingCollection(
  f: { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string },
  templates: readonly AutomatedVideoReading[] = S14_READINGS,
  retainCaptures = true,
) {
  const workspaceId = S14_READINGS[0]!.workspaceId;
  const run = f.db.prepare(`SELECT scope_request_sha256 scope,confirmed_source_set_sha256 sources
    FROM analysis_research_automation_runs WHERE run_id=?`).get(f.runId) as { scope: string; sources: string | null };
  // A historical collection snapshot can contain EXPANDED_SEARCH readings; today's candidate builder cannot create those.
  const document: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: f.runId,
    stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [], limitations: [] };
  const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifacts });
  const candidates = templates.map(reading => ({ videoId: reading.video.videoId, url: reading.video.videoUrl, origin: reading.video.origin }));
  const binding = { workspaceId, runId: f.runId, scopeSha256: run.scope,
    sourceSetSha256: run.sources, candidatesSha256: s07Hash(canonicalJson(candidates)) };
  const result = [];
  for (const [index, template] of templates.entries()) {
    const native = template.captionSource === 'NATIVE_SUBTITLE';
    const answer = { aboutProduct: template.video.aboutProduct, videoKind: template.video.videoKind };
    const spoken = { ...answer, segments: template.segments.map(s => ({ startSecond: s.startSeconds, endSecond: s.endSeconds, speech: s.text })),
      onScreenText: template.onScreenText.map(s => ({ startSecond: s.startSeconds, endSecond: s.endSeconds, text: s.text })) };
    const now = () => new Date(`2026-11-03T0${index + 1}:00:02.000Z`);
    const model = createVideoWatchModel({ modelId: template.model.modelId,
      cliproxy: { baseUrl: 'http://127.0.0.1:8317', apiKey: 'synthetic-raw-s14-unused-auth' },
      transport: { now: () => now().getTime(), sleep: async () => {}, fetch: async () =>
        Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(native ? answer : spoken) }] } }] }) } });
    const ask = { productKeyword: 'synthetic jar', durationSeconds: template.video.durationSeconds };
    const call = native ? await model.readSubtitles({ ...ask, captionText: template.segments.map(s => s.text).join('\n') })
      : await model.watch({ bytes: Buffer.from('synthetic-video-bytes'), mimeType: 'video/mp4', videoId: template.video.videoId }, ask);
    if (call.kind !== 'ANSWER' || call.captures.length !== 1) throw new Error('invalid synthetic S14 model fixture');
    const prepared = native ? buildSubtitleVideoReading(binding, candidates[index]!, answer, template.segments, template.media,
      { modelId: model.modelId, responseSha256: call.responseSha256 })
      : buildAutomatedVideoReading(binding, candidates[index]!, spoken, template.media, { modelId: model.modelId, responseSha256: call.responseSha256 });
    const ref = await publishAutomatedVideoReading(packages, binding, prepared);
    const capture = call.captures[0]!;
    const ordinal: number = retainCaptures ? Number((f.db.prepare(`SELECT COALESCE(MAX(ordinal),-1)+1 ordinal FROM analysis_research_automation_captures
      WHERE run_id=? AND step_id='COLLECTION'`).get(f.runId) as { ordinal: bigint }).ordinal) : result.length;
    const { requestBodyBytes, responseBytes, ...metadata } = capture;
    const envelope = { contractVersion: 'research-automation-capture-v1', ...metadata,
      requestBodyBytesBase64: requestBodyBytes?.toString('base64') ?? null, responseBytesBase64: responseBytes?.toString('base64') ?? null };
    const bytes = Buffer.from(canonicalJson(envelope)), stored = await f.artifacts.put(bytes);
    if (retainCaptures) {
      f.db.prepare(`INSERT OR IGNORE INTO artifact_manifests
        (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
        VALUES (?,?,'application/json',?,?,'1.0.0',?)`)
        .run(stored.sha256, stored.byteSize, stored.relativePath, capture.completedAt, capture.completedAt);
      f.db.prepare(`INSERT INTO analysis_research_automation_captures
        (run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,truncated,retained_at)
        VALUES (?,'COLLECTION',?,?,'application/json','video-watch','videowatch.generate',?,0,?)`)
        .run(f.runId, ordinal, stored.sha256, capture.completedAt, capture.completedAt);
    }
    result.push({ ref, prepared, ordinal, capture: envelope, sourceCapture: capture, stored });
  }
  const collected: StepResultDocument = { ...document, videoWatch: { profile: 'video-watch-v1', candidates,
    candidatesSha256: binding.candidatesSha256, skipped: [], videos: result.map(({ ref, prepared, ordinal, capture }) => ({
      videoId: prepared.reading.video.videoId, status: 'READ', reason: null, captureIndex: ordinal, retrievedAt: capture.completedAt,
      media: prepared.reading.media, reading: { ...ref, readingSha256: prepared.readingSha256 },
    })) } };
  return { result, document: collected };
}

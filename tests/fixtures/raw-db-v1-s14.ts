import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import type { AutomatedVideoReading } from '../../contracts/analysis/video-reading-v3.generated.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildAutomatedVideoReading, buildSubtitleVideoReading, publishAutomatedVideoReading } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createVideoWatchModel } from '../../src/modules/analysis/research-automation/video-watch-gemini.js';
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

/** Real Foundation attachments and real model capture envelopes; only the HTTP transport is synthetic. */
export async function saveVideoReadingRun(
  f: { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string },
  templates: readonly AutomatedVideoReading[] = S14_READINGS,
) {
  const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifacts });
  const candidates = templates.map(reading => ({ videoId: reading.video.videoId, url: reading.video.videoUrl, origin: reading.video.origin }));
  const binding = { workspaceId: S14_READINGS[0]!.workspaceId, runId: f.runId, scopeSha256: S14_READINGS[0]!.scopeSha256,
    sourceSetSha256: null, candidatesSha256: s07Hash(canonicalJson(candidates)) };
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
    const capture = call.captures[0]!, ordinal = index + 4;
    const { requestBodyBytes, responseBytes, ...metadata } = capture;
    const envelope = { contractVersion: 'research-automation-capture-v1', ...metadata,
      requestBodyBytesBase64: requestBodyBytes?.toString('base64') ?? null, responseBytesBase64: responseBytes?.toString('base64') ?? null };
    const bytes = Buffer.from(canonicalJson(envelope)), stored = await f.artifacts.put(bytes);
    f.db.prepare(`INSERT OR IGNORE INTO artifact_manifests
      (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
      VALUES (?,?,'application/json',?,?,'research-automation-capture-v1',?)`)
      .run(stored.sha256, stored.byteSize, stored.relativePath, capture.completedAt, capture.completedAt);
    f.db.prepare(`INSERT INTO analysis_research_automation_captures
      (run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,truncated,retained_at)
      VALUES (?,'COLLECTION',?,?,'application/json','video-watch','videowatch.generate',?,0,?)`)
      .run(f.runId, ordinal, stored.sha256, capture.completedAt, capture.completedAt);
    result.push({ ref, prepared, ordinal, capture: envelope, stored });
  }
  return result;
}

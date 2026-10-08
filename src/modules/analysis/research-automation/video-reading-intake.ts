import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import readingSchema from '../../../../contracts/analysis/video-reading-v1.schema.json' with { type: 'json' };
import type { OperatorVideoReading, PreparedVideoReading } from '../../../../contracts/analysis/video-reading-v1.generated.js';
export type { OperatorVideoReading, PreparedVideoReading } from '../../../../contracts/analysis/video-reading-v1.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { CitationRegistry } from '../citation-registry.js';
import { exactTikTokVideoUrl } from './tiktok-video-selection.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(readingSchema);
const validateInput = ajv.compile<OperatorVideoReading>({ $ref: `${readingSchema.$id}#/$defs/input` });
const validateReading = ajv.compile<PreparedVideoReading>({ $ref: `${readingSchema.$id}#/$defs/reading` });

export class VideoReadingIntakeError extends Error { readonly code = 'INVALID_VIDEO_READING'; }
function fail(): never { throw new VideoReadingIntakeError('Nội dung video chưa khớp tệp, mốc thời gian và phạm vi đã chọn.'); }
const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
export function prepareVideoReading(input: OperatorVideoReading, frames: ReadonlyMap<string, Uint8Array>, binding: {
  workspaceId: string; runId: string; scopeSha256: string; sourceSetSha256: string; selectionSha256: string;
}) {
  if (!validateInput(input)) fail();
  exactTikTokVideoUrl(input.videoUrl);
  if (!['SELLER_VIDEO', 'REVIEW_VIDEO'].includes(input.videoKind) || !Number.isFinite(input.durationSeconds) || input.durationSeconds <= 0 || input.durationSeconds > 86400 ||
    !Array.isArray(input.segments) || input.segments.length < 1 || input.segments.length > 10000 || !Array.isArray(input.onScreenText) || input.onScreenText.length > 10000 ||
    !Array.isArray(input.frames) || input.frames.length > 1000 || frames.size !== input.frames.length) fail();
  const interval = (start: number, end: number) => {
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > input.durationSeconds) fail();
  };
  let end = 0;
  for (const segment of input.segments) {
    interval(segment.startSeconds, segment.endSeconds);
    if (segment.startSeconds < end || typeof segment.text !== 'string' || !segment.text.trim() || segment.text.length > 20000 || !['NATIVE', 'SPEECH_TO_TEXT'].includes(segment.captionSource)) fail();
    end = segment.endSeconds;
  }
  for (const text of input.onScreenText) {
    interval(text.startSeconds, text.endSeconds); if (typeof text.text !== 'string' || !text.text.trim() || text.text.length > 20000) fail();
  }
  const paths = new Set<string>();
  for (const frame of input.frames) {
    if (!Number.isFinite(frame.atSeconds) || frame.atSeconds < 0 || frame.atSeconds > input.durationSeconds ||
      !/^frames\/[A-Za-z0-9_-]{1,80}\.(?:png|jpg)$/.test(frame.logicalPath) || paths.has(frame.logicalPath) || !/^[a-f0-9]{64}$/.test(frame.sha256)) fail();
    paths.add(frame.logicalPath); const bytes = frames.get(frame.logicalPath); if (!bytes || sha(bytes) !== frame.sha256 || bytes.byteLength > 8 * 1024 * 1024) fail();
  }
  const reading: PreparedVideoReading = { contractVersion: 'video-reading-v1' as const, registryId: 'S14' as const, ...binding,
    provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' as const, state: 'PREPARED_NOT_ADMITTED' as const,
    voice: input.videoKind === 'SELLER_VIDEO' ? 'SELLER' as const : 'CREATOR' as const,
    input: structuredClone(input), limitations: ['Operator-produced local video reading; caption source is declared, not provider authenticated.',
      'No watch, cloud upload, transcription, coding, model execution or approval occurs in this package.'] };
  if (!validateReading(reading)) fail();
  return { reading, bytes: Buffer.from(canonicalJson(reading)), sha256: sha(canonicalJson(reading)) };
}
export function citeVideoReading(reading: PreparedVideoReading, readingSha256: string, registry: CitationRegistry) {
  if (!validateReading(reading) || sha(canonicalJson(reading)) !== readingSha256) fail();
  return reading.input.segments.map(segment => ({ text: segment.text, voice: reading.voice,
    captionSource: segment.captionSource, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds,
    citation: registry.cite({ sourceKind: 'CAPTURE', identity: readingSha256,
      locator: `giây ${segment.startSeconds}–${segment.endSeconds}`, label: 'nội dung video', retrievedAt: null,
      url: reading.input.videoUrl, quote: null, quoteVerification: 'NOT_APPLICABLE', technical: { registryId: 'S14' } }) }));
}

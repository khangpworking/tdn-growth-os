// The video's own Vietnamese subtitle file (WebVTT) as verbatim seller speech. Pure: no file, network or model access here.
// The parser is strict: anything it cannot read exactly is "no subtitles", and the lane then watches the video as before.

/** Largest subtitle file read (bytes). */
export const SUBTITLE_MAX_BYTES = 256 * 1024;
/** Most cues read from one file (before dropping empty cues and merging exact duplicates). */
export const SUBTITLE_MAX_CUES = 500;
/** Longest text of one segment, as in the reading intake. */
export const SUBTITLE_MAX_SEGMENT_CHARS = 20_000;
/** The platform reports a video length in whole seconds, so the last cue may end up to one second after it. */
export const SUBTITLE_END_SLACK_SECONDS = 1;

export interface SubtitleSegment { readonly startSeconds: number; readonly endSeconds: number; readonly text: string }

const TIME = /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/;
const seconds = (value: string): number | null => {
  const match = TIME.exec(value);
  if (!match) return null;
  const total = Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
  return Number.isFinite(total) ? Math.round(total * 1000) / 1000 : null;
};
const ENTITIES: Readonly<Record<string, string>> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&nbsp;': ' ', '&lrm;': '', '&rlm;': '' };
/** Cue text as shown: tags removed (voice, class, bold, timestamps), the WebVTT character references decoded, white space folded. */
const cueText = (lines: readonly string[]): string => lines.join(' ').replace(/<[^>\n]*>/gu, '')
  .replace(/&(amp|lt|gt|nbsp|lrm|rlm);/gu, entity => ENTITIES[entity]!).replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/gu, ' ').trim();

/**
 * Strict WebVTT read: a `WEBVTT` header, cues with `hh:mm:ss.mmm --> hh:mm:ss.mmm` timings (hours optional, cue settings ignored),
 * NOTE/STYLE/REGION blocks skipped, tags stripped, empty cues dropped, exact duplicates (same times and text) merged. Cues must be in
 * start order, each start before its end and every end inside the video length (plus the one-second slack). Bounded by file size, cue
 * count and segment length. Returns null for an invalid file or one with no spoken text: the caller treats both as "no subtitles".
 */
export function parseVttSubtitles(bytes: Uint8Array, durationSeconds: number): SubtitleSegment[] | null {
  if (bytes.byteLength === 0 || bytes.byteLength > SUBTITLE_MAX_BYTES || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
  if (text.startsWith('﻿')) text = text.slice(1);
  const blocks = text.replace(/\r\n?/gu, '\n').split(/\n{2,}/u).map(block => block.split('\n'));
  const header = blocks.shift() ?? [];
  if (!/^WEBVTT(?:[ \t].*)?$/u.test(header[0] ?? '') || header.some(line => line.includes('-->'))) return null;
  const limit = durationSeconds + SUBTITLE_END_SLACK_SECONDS;
  const out: SubtitleSegment[] = [];
  const seen = new Set<string>();
  let cues = 0, lastStart = 0;
  for (const raw of blocks) {
    const block = raw.filter(line => line.trim() !== '');
    if (block.length === 0) continue;
    if (/^(NOTE|STYLE|REGION)(?:[ \t]|$)/u.test(block[0]!)) { if (block.some(line => line.includes('-->'))) return null; continue; }
    const timingAt = block[0]!.includes('-->') ? 0 : 1;
    const timing = block[timingAt];
    if (timing === undefined || !timing.includes('-->') || block.slice(timingAt + 1).some(line => line.includes('-->'))) return null;
    const match = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+.*)?$/u.exec(timing);
    const start = match ? seconds(match[1]!) : null, end = match ? seconds(match[2]!) : null;
    if (start === null || end === null || start >= end || end > limit || start < lastStart) return null;
    if (++cues > SUBTITLE_MAX_CUES) return null;
    lastStart = start;
    const said = cueText(block.slice(timingAt + 1));
    if (said === '') continue;
    if (said.length > SUBTITLE_MAX_SEGMENT_CHARS) return null;
    const key = `${start}|${end}|${said}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ startSeconds: start, endSeconds: end, text: said });
  }
  return out.length ? out : null;
}

/** The caption text the model reads: one cue per line, in order. */
export function subtitleCaptionText(segments: readonly SubtitleSegment[]): string {
  return segments.map(segment => segment.text).join('\n');
}

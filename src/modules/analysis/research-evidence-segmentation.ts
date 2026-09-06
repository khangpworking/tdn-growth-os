import { createHash } from 'node:crypto';

export interface ResearchEvidenceSegment {
  readonly segmentIndex: number;
  readonly byteStart: number;
  readonly byteEnd: number;
  readonly textSha256: string;
  readonly text: string;
}

const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);

export function segmentResearchDocument(rawBytes: Buffer): readonly ResearchEvidenceSegment[] {
  const segments: ResearchEvidenceSegment[] = [];
  let lineStart = rawBytes.subarray(0, 3).equals(utf8Bom) ? 3 : 0;

  for (let cursor = lineStart; cursor <= rawBytes.byteLength; cursor += 1) {
    if (cursor < rawBytes.byteLength && rawBytes[cursor] !== 0x0a) continue;
    let byteEnd = cursor;
    if (byteEnd > lineStart && rawBytes[byteEnd - 1] === 0x0d) byteEnd -= 1;
    const exactSlice = rawBytes.subarray(lineStart, byteEnd);
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(exactSlice);
    } catch (error) {
      throw new TypeError(`Invalid UTF-8 segment: ${(error as Error).message}`);
    }
    if (text.trim().length > 0) {
      segments.push({
        segmentIndex: segments.length,
        byteStart: lineStart,
        byteEnd,
        textSha256: createHash('sha256').update(exactSlice).digest('hex'),
        text,
      });
    }
    lineStart = cursor + 1;
  }
  return segments;
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { prepareVideoReading, citeVideoReading, type OperatorVideoReading } from '../../src/modules/analysis/research-automation/video-reading-intake.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';

const frame = Buffer.from('synthetic frame bytes, not real media');
const digest = createHash('sha256').update(frame).digest('hex');
const binding = { workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222',
  scopeSha256: 'a'.repeat(64), sourceSetSha256: 'b'.repeat(64), selectionSha256: 'c'.repeat(64) };
const input = (): OperatorVideoReading => ({ videoUrl: 'https://www.tiktok.com/@synthetic_creator/video/1234', videoKind: 'SELLER_VIDEO', durationSeconds: 20,
  segments: [{ startSeconds: 0, endSeconds: 4.5, text: 'Lời thoại nguyên văn về thạch dừa.', captionSource: 'NATIVE' },
    { startSeconds: 5, endSeconds: 8, text: 'Lời tiếp theo.', captionSource: 'SPEECH_TO_TEXT' }],
  onScreenText: [{ startSeconds: 0, endSeconds: 5, text: '350g' }], frames: [{ atSeconds: 2, logicalPath: 'frames/synthetic.png', sha256: digest }] });
const frames = new Map([['frames/synthetic.png', frame]]);

test('inert exact segment/frame preparation keeps seller and creator voice separate, reproducible cited read', () => {
  const prepared = prepareVideoReading(input(), frames, binding);
  assert.equal(prepared.reading.state, 'PREPARED_NOT_ADMITTED'); assert.equal(prepared.reading.voice, 'SELLER');
  assert.deepEqual(prepared, prepareVideoReading(input(), frames, binding));
  const registry = new CitationRegistry(), rows = citeVideoReading(prepared.reading, prepared.sha256, registry);
  assert.deepEqual(rows.map(r => [r.startSeconds, r.endSeconds, r.text]), [[0, 4.5, input().segments[0]!.text], [5, 8, input().segments[1]!.text]]);
  assert.equal(registry.entries().length, 2); assert.equal(registry.entries()[0]!.locatorText, 'giây 0–4.5');
  assert.equal(prepareVideoReading({ ...input(), videoKind: 'REVIEW_VIDEO' }, frames, binding).reading.voice, 'CREATOR');
});

test('missing segment, invalid timestamps, frame digest/membership and altered cited bytes reject', () => {
  const bad: OperatorVideoReading[] = [{ ...input(), segments: [] }, { ...input(), durationSeconds: 0 },
    { ...input(), segments: [{ ...input().segments[0]!, startSeconds: -1 }] },
    { ...input(), segments: [{ ...input().segments[0]!, endSeconds: 21 }] },
    { ...input(), segments: [{ ...input().segments[0]!, endSeconds: 0 }] },
    { ...input(), frames: [{ ...input().frames[0]!, sha256: 'f'.repeat(64) }] },
    { ...input(), frames: [{ ...input().frames[0]!, logicalPath: '../private.png' }] }];
  for (const value of bad) assert.throws(() => prepareVideoReading(value, frames, binding));
  assert.throws(() => prepareVideoReading(input(), new Map(), binding));
  const prepared = prepareVideoReading(input(), frames, binding);
  assert.throws(() => citeVideoReading({ ...prepared.reading, input: { ...input(), segments: [] } }, prepared.sha256, new CitationRegistry()));
});

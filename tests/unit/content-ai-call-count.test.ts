import assert from 'node:assert/strict';
import test from 'node:test';
import { contentAiCallCount } from '../../src/modules/flow/content-ai-call-count.js';

test('call-count helper matches the approved Big Idea, Angle, Caption and Poster examples', () => {
  assert.deepEqual(contentAiCallCount({ type: 'big_idea', runs: 2, perRun: 2 }), { text: 4, image: 0, total: 4, label: '2 × 2 Big Idea = 4 lượt AI' });
  assert.deepEqual(contentAiCallCount({ type: 'angle', runs: 1, perRun: 3 }), { text: 3, image: 0, total: 3, label: '1 × 3 Angle = 3 lượt AI' });
  assert.deepEqual(contentAiCallCount({ type: 'caption_poster', angles: 3, caption: true, poster: true }), { text: 3, image: 3, total: 6, label: '3 Caption + 3 Poster = 6 lượt AI' });
  assert.deepEqual(contentAiCallCount({ type: 'caption_poster', angles: 3, caption: true, poster: false }), { text: 3, image: 0, total: 3, label: '3 Caption = 3 lượt AI' });
  assert.deepEqual(contentAiCallCount({ type: 'caption_poster', angles: 3, caption: false, poster: true }), { text: 0, image: 3, total: 3, label: '3 Poster = 3 lượt AI' });
});

test('call-count bounds are exact and every invalid action is rejected', () => {
  assert.equal(contentAiCallCount({ type: 'big_idea', runs: 10, perRun: 10 }).total, 100);
  assert.equal(contentAiCallCount({ type: 'caption_poster', angles: 50, caption: true, poster: true }).total, 100);
  const invalid: unknown[] = [
    null, {}, { type: 'unknown', runs: 1, perRun: 1 },
    { type: 'big_idea', runs: 0, perRun: 1 }, { type: 'big_idea', runs: 11, perRun: 1 },
    { type: 'big_idea', runs: 1.5, perRun: 1 }, { type: 'big_idea', runs: 1, perRun: 11 },
    { type: 'caption_poster', angles: 0, caption: true, poster: false }, { type: 'caption_poster', angles: 51, caption: true, poster: false },
    { type: 'caption_poster', angles: 1, caption: false, poster: false },
    { type: 'caption_poster', angles: 1, caption: 'yes', poster: false },
  ];
  for (const action of invalid) assert.throws(() => contentAiCallCount(action as never), TypeError);
});

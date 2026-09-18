import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCutPlan, parseWordsFile, toSrt } from '../src/slicing.mjs';

const word = (text, start, end, utteranceEnd = end) => ({
  start,
  end,
  word: text,
  utterance_end: utteranceEnd,
});

const sampleTimeline = () => [
  word('大家好', 0, 600, 620),
  word('，', 600, 640, 640),
  word('今天', 640, 1_000, 1_020),
  word('讲', 1_000, 1_200, 1_220),
  word('切片。', 1_200, 1_800, 1_820), // sentence end → strong cut
  word('首先', 2_600, 3_000, 3_020), // 780ms silence gap → strong cut
  word('看', 3_000, 3_200, 3_220),
  word('时间轴，', 3_200, 3_900, 3_920),
  word('再', 3_900, 4_100, 4_120),
  word('看切点。', 4_100, 4_800, 4_820),
  word('好。', 4_900, 5_100, 5_120), // short segment → merged forward if next exists
];

test('parseWordsFile tolerates blank lines', () => {
  const words = parseWordsFile(JSON.stringify(word('a', 0, 10)) + '\n\n' + JSON.stringify(word('b', 20, 30)) + '\n');
  assert.equal(words.length, 2);
});

test('sentence-final punctuation and silence gaps produce cut points', () => {
  const plan = buildCutPlan(sampleTimeline());
  assert.ok(plan.segments.length >= 3, `expected >=3 segments, got ${plan.segments.length}`);
  // First segment covers the opening sentence.
  assert.equal(plan.segments[0].text, '大家好，今天讲切片。');
  // Rough-cut timeline is contiguous.
  for (let i = 1; i < plan.segments.length; i++) {
    assert.equal(plan.segments[i].roughStartUs, plan.segments[i - 1].roughEndUs);
  }
});

test('short trailing segment merges instead of standing alone', () => {
  const plan = buildCutPlan([
    word('内容一。', 0, 2_000, 2_020),
    word('好。', 3_000, 3_200, 3_220), // 1.2s gap → own block, but only 200ms → merged
  ]);
  assert.ok(plan.segments[plan.segments.length - 1].text.includes('好。'));
});

test('srt timestamps align to the rough-cut timeline', () => {
  const plan = buildCutPlan(sampleTimeline());
  const srt = toSrt(plan.segments);
  assert.match(srt, /^1\n00:00:00,000 --> /);
  assert.ok(srt.includes('-->'));
  const firstDur = plan.segments[0].durationUs;
  const second = plan.segments[1];
  assert.match(srt, new RegExp(`2\\n00:00:00,${String(Math.floor(firstDur / 1000) % 1000).padStart(3, '0')} --> `));
});

test('empty timeline throws', () => {
  assert.throws(() => buildCutPlan([]), /empty/);
});

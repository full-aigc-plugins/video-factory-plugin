import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  // utt1 (0-1820ms) | 780ms gap | utt2 (2600-4820ms) | 80ms gap (merged) → 2 segments.
  assert.equal(plan.segments.length, 2);
  assert.equal(plan.segments[0].text, '大家好，今天讲切片。');
  assert.equal(plan.segments[1].text, '首先看时间轴，再看切点。好。');
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
  // Segment 1 duration = 1820ms (utterance_end of 切片。), so segment 2 starts at 00:00:01,820.
  assert.match(srt, /2\n00:00:01,820 --> /);
});

test('empty timeline throws', () => {
  assert.throws(() => buildCutPlan([]), /empty/);
});

test('cli main episode-slice writes artifacts', async () => {
  const { main } = await import('../src/cli.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'ep-'));
  const wordsPath = join(dir, 'words.jsonl');
  writeFileSync(wordsPath, [
    JSON.stringify(word('大家好', 0, 600, 620)),
    JSON.stringify(word('讲切片。', 600, 1_800, 1_820)),
    JSON.stringify(word('首先', 2_600, 3_000, 3_020)),
    JSON.stringify(word('看切点。', 3_000, 4_800, 4_820)),
  ].join('\n'));
  const outDir = join(dir, 'out');
  let captured = '';
  const code = await main(['episode-slice', wordsPath, '--out-dir', outDir], {
    stdout: { write: (s) => { captured += s; } },
    stderr: { write: (s) => { captured += s; } },
  });
  assert.equal(code, 0);
  assert.ok(existsSync(join(outDir, 'cutlist.json')), 'cutlist missing');
  assert.ok(existsSync(join(outDir, 'subtitles.srt')), 'srt missing');
  const cutlist = JSON.parse(readFileSync(join(outDir, 'cutlist.json'), 'utf8'));
  assert.equal(cutlist.summary.keptSegments, 2);
});

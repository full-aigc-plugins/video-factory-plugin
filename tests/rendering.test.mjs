import assert from 'node:assert/strict';
import test from 'node:test';
import { compileSegment, outputProfile, segmentKey } from '../src/ffmpeg-compiler.mjs';
import { evaluateMedia } from '../src/media-evaluator.mjs';

const profile = outputProfile('rough', { aspect: '16:9' });

test('rough and final profiles are deterministic and use even standard dimensions', () => {
  assert.deepEqual(profile, { width: 1280, height: 720, fps: 30, crf: 28, preset: 'veryfast', audioRate: 48000 });
  assert.deepEqual(outputProfile('final', { aspect: '9:16' }), { width: 1080, height: 1920, fps: 30, crf: 20, preset: 'medium', audioRate: 48000 });
});

test('image and clip segments compile to bounded argv without a shell or network protocol', () => {
  const image = compileSegment({ id: 'C01', kind: 'image', path: '/input/a.png', durationSeconds: 2, motion: 'static' }, profile, '/work/C01.mp4');
  assert.equal(image.bin, 'ffmpeg');
  assert.equal(image.options.shell, false);
  assert.ok(image.args.includes('-loop'));
  assert.ok(image.args.includes('/input/a.png'));
  assert.ok(!image.args.join(' ').includes('http:'));
  const clip = compileSegment({ id: 'C02', kind: 'video', path: '/input/a.mp4', sourceInSeconds: 1, durationSeconds: 3 }, profile, '/work/C02.mp4');
  assert.ok(clip.args.includes('-ss'));
  assert.ok(clip.args.includes('1'));
  assert.throws(() => compileSegment({ ...clip, kind: 'filter', filter: 'movie=http://x' }, profile, '/work/x.mp4'), /unsupported source kind/);
});

test('segment identity changes with source hash or edit parameters', () => {
  const base = { id: 'C01', assetHash: 'a'.repeat(64), sourceInTicks: 0, sourceOutTicks: 60, profile };
  assert.equal(segmentKey(base), segmentKey(structuredClone(base)));
  assert.notEqual(segmentKey(base), segmentKey({ ...base, sourceOutTicks: 61 }));
});

test('required media failure outranks advisory findings and human approval', () => {
  const plan = { output: { width: 1280, height: 720, fps: 30, durationSeconds: 5, requireAudio: true } };
  const receipt = { exists: true, hashVerified: true, decodeOk: false, width: 1280, height: 720, fps: 30, durationSeconds: 5, hasAudio: false, provenanceOk: true };
  const scores = evaluateMedia(plan, receipt, { blackFrames: 'PASS' }, 'approved');
  assert.equal(scores.decision, 'fail');
  assert.deepEqual(scores.failedRequired.sort(), ['audio', 'decode']);
  assert.equal(scores.gates.find((gate) => gate.id === 'blackFrames').status, 'PASS');
});

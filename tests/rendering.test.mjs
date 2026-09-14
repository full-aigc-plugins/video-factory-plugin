import assert from 'node:assert/strict';
import test from 'node:test';
import { compileAssembly, compileDissolveAssembly, compileSegment, outputProfile, segmentKey } from '../src/ffmpeg-compiler.mjs';
import { evaluateMedia } from '../src/media-evaluator.mjs';
import { compileMaster } from '../src/final-renderer.mjs';

const profile = outputProfile('rough', { aspect: '16:9' });

test('rough and final profiles are deterministic and use even standard dimensions', () => {
  assert.deepEqual(profile, { width: 1280, height: 720, fps: 30, crf: 28, preset: 'veryfast', audioRate: 48000 });
  assert.deepEqual(outputProfile('final', { aspect: '9:16' }), { width: 1080, height: 1920, fps: 30, crf: 20, preset: 'medium', audioRate: 48000 });
});

test('final mastering adds declared audio and subtitles through bounded argv', () => {
  const spec = compileMaster({ inputVideo: '/input/rough.mp4', audioPath: '/input/voice.wav', subtitlePath: '/input/captions.srt', profile: outputProfile('final', { aspect: '16:9' }), destination: '/output/final.mp4' });
  assert.equal(spec.bin, 'ffmpeg');
  assert.equal(spec.options.shell, false);
  assert.ok(spec.args.includes('/input/voice.wav'));
  assert.ok(spec.args.includes('/input/captions.srt'));
  assert.ok(spec.args.includes('mov_text'));
  assert.ok(!spec.args.join(' ').includes('http:'));
});

test('final mastering mixes role-based audio tracks and overlays a registered watermark', () => {
  const spec = compileMaster({
    inputVideo: '/input/rough.mp4',
    audioTracks: [
      { path: '/input/voice.wav', gainDb: 0, timelineInSeconds: 0, role: 'narration' },
      { path: '/input/music.wav', gainDb: -12, timelineInSeconds: 0.5, role: 'music' },
    ],
    watermarkPath: '/input/logo.png',
    title: 'Approved cut',
    profile: outputProfile('final', { aspect: '16:9' }),
    destination: '/output/final.mp4',
    durationSeconds: 3,
  });
  const graph = spec.args[spec.args.indexOf('-filter_complex') + 1];
  assert.match(graph, /adelay=500\|500/);
  assert.match(graph, /volume=-12dB/);
  assert.match(graph, /amix=inputs=2/);
  assert.match(graph, /overlay=/);
  assert.ok(spec.args.includes('title=Approved cut'));
  assert.equal(spec.options.shell, false);
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

test('declared camera motion and fade transitions compile from a closed vocabulary', () => {
  const pan = compileSegment({ id: 'C03', kind: 'image', path: '/input/a.png', durationSeconds: 2, motion: 'pan-left', transition: 'fade' }, profile, '/work/C03.mp4');
  const filter = pan.args[pan.args.indexOf('-vf') + 1];
  assert.match(filter, /zoompan/);
  assert.match(filter, /fade=t=in/);
  assert.match(filter, /fade=t=out/);
  assert.throws(() => compileSegment({ id: 'C04', kind: 'image', path: '/input/a.png', durationSeconds: 2, motion: 'arbitrary-filter' }, profile, '/work/C04.mp4'), /unsupported motion/);
});

test('dissolve assembly compiles a bounded xfade and acrossfade graph', () => {
  const spec = compileDissolveAssembly(['/work/A.mp4', '/work/B.mp4'], [2, 2], ['cut', 'dissolve'], profile, '/work/out.mp4');
  assert.equal(spec.options.shell, false);
  const graph = spec.args[spec.args.indexOf('-filter_complex') + 1];
  assert.match(graph, /xfade=transition=fade:duration=0.5:offset=1.5/);
  assert.match(graph, /acrossfade=d=0.5/);
  assert.throws(() => compileDissolveAssembly(['/work/A.mp4'], [2], ['cut'], profile, '/work/out.mp4'), /at least two/);
});

test('concat assembly restricts protocols and rejects list control characters', () => {
  const spec = compileAssembly('/work/list.txt', profile, '/work/out.mp4');
  assert.deepEqual(spec.args.slice(3, 5), ['-protocol_whitelist', 'file,pipe']);
  assert.throws(() => compileAssembly('/work/list\ninjected.txt', profile, '/work/out.mp4'), /control characters/);
});

test('segment identity changes with source hash or edit parameters', () => {
  const base = { rendererVersion: 1, id: 'C01', kind: 'image', assetHash: 'a'.repeat(64), sourceInTicks: 0, sourceOutTicks: 60, motion: 'static', transition: 'cut', profile };
  assert.equal(segmentKey(base), segmentKey(structuredClone(base)));
  assert.notEqual(segmentKey(base), segmentKey({ ...base, sourceOutTicks: 61 }));
  assert.notEqual(segmentKey(base), segmentKey({ ...base, motion: 'pan-left' }));
  assert.notEqual(segmentKey(base), segmentKey({ ...base, transition: 'fade' }));
});

test('required media failure outranks advisory findings and human approval', () => {
  const plan = { output: { width: 1280, height: 720, fps: 30, durationSeconds: 5, requireAudio: true } };
  const receipt = { exists: true, hashVerified: true, decodeOk: false, width: 1280, height: 720, fps: 30, durationSeconds: 5, hasAudio: false, provenanceOk: true, timelineOk: true, container: 'mov,mp4,m4a,3gp,3g2,mj2', videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: '', audioSampleRate: 0 };
  const scores = evaluateMedia(plan, receipt, { blackFrames: 'PASS' }, 'approved');
  assert.equal(scores.decision, 'fail');
  assert.deepEqual(scores.failedRequired.sort(), ['audio', 'audioFormat', 'decode']);
  assert.equal(scores.gates.find((gate) => gate.id === 'blackFrames').status, 'PASS');
  assert.equal(scores.gates.find((gate) => gate.id === 'avSync').status, 'NOT_RUN');
});

test('every required media gate can be independently broken', () => {
  const plan = { output: { width: 1280, height: 720, fps: 30, durationSeconds: 5, requireAudio: true } };
  const receipt = { exists: true, hashVerified: true, decodeOk: true, width: 1280, height: 720, fps: 30, durationSeconds: 5, hasAudio: true, provenanceOk: true, timelineOk: true, container: 'mov,mp4,m4a,3gp,3g2,mj2', videoCodec: 'h264', pixelFormat: 'yuv420p', audioCodec: 'aac', audioSampleRate: 48000 };
  const cases = [
    ['file', { exists: false }], ['hash', { hashVerified: false }], ['decode', { decodeOk: false }],
    ['videoStream', { width: 0 }], ['duration', { durationSeconds: 6 }], ['dimensions', { width: 640 }],
    ['fps', { fps: 24 }], ['audio', { hasAudio: false }], ['timeline', { timelineOk: false }],
    ['provenance', { provenanceOk: false }], ['container', { container: 'matroska' }],
    ['videoCodec', { videoCodec: 'hevc' }], ['pixelFormat', { pixelFormat: 'yuv444p' }],
    ['audioFormat', { audioCodec: 'mp3' }],
  ];
  for (const [id, mutation] of cases) {
    const result = evaluateMedia(plan, { ...receipt, ...mutation });
    assert.equal(result.gates.find((gate) => gate.id === id).status, 'FAIL', id);
  }
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { analyzeMedia, classifyDetections } from '../src/media-analysis.mjs';

test('each deterministic policy gate has a fixture that breaks it', () => {
  assert.equal(classifyDetections({ blackLog: 'black_start:0 black_end:2 black_duration:2', durationSeconds: 2 }).blackFrames, 'FAIL');
  assert.equal(classifyDetections({ freezeLog: 'freeze_start:0\nfreeze_end:2 | freeze_duration:2', durationSeconds: 2 }).freezeFrames, 'FAIL');
  assert.equal(classifyDetections({ silenceLog: 'silence_start: 0\nsilence_end: 3 | silence_duration: 3', durationSeconds: 3 }).silence, 'FAIL');
  assert.equal(classifyDetections({ subtitleText: '1\n00:00:01,000 --> 00:00:03,000\nlate', durationSeconds: 2 }).subtitleTiming, 'FAIL');
});

test('missing optional evidence is SKIPPED rather than reported as passed', () => {
  const evidence = classifyDetections({ durationSeconds: 2 });
  assert.equal(evidence.blackFrames, 'SKIPPED');
  assert.equal(evidence.freezeFrames, 'SKIPPED');
  assert.equal(evidence.silence, 'SKIPPED');
  assert.equal(evidence.subtitleTiming, 'SKIPPED');
});

test('real FFmpeg detector reports a fully black clip', { timeout: 30000 }, () => {
  const root = mkdtempSync(join(tmpdir(), 'vedio-analysis-'));
  const video = join(root, 'black.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=black:s=160x90:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', video]);
  const result = analyzeMedia(video, { durationSeconds: 1, hasAudio: true });
  assert.equal(result.blackFrames, 'FAIL');
  assert.equal(result.detectors.black.exitCode, 0);
});

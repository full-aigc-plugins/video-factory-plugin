import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { collectMedia } from '../src/media-collector.mjs';
import { reviewSyncCommand, runAnalyzeSeed } from '../src/integrations/reelbench-adapter.mjs';

test('original ReelBench scripts analyze real media and produce a synchronized review video', { timeout: 60000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'reelbench-real-'));
  const video = join(root, 'two-shots.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'color=blue:s=320x180:r=30:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[out]', '-map', '[out]', '-map', '2:a:0', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video]);
  const evidence = runAnalyzeSeed(video, join(root, 'analysis'), { threshold: 0.15 });
  const seeded = JSON.parse(readFileSync(evidence.shotsPath, 'utf8'));
  assert.ok(seeded.shots.length >= 2);
  const shots = {
    source: 'two-shots.mp4', title: 'Two shots', lang: 'zh',
    meta: { durationSeconds: 2, fps: 30, width: 320, height: 180, aspect: '16:9', codec: 'h264', hasAudio: false },
    cast: [], seedCuts: [1], manualCuts: [],
    shots: [
      { id: 'S01', start: 0, end: 1, seconds: 1, motion: 0, size: 'wide', category: 'subject', camera: 'static', transitionIn: 'cut', subjects: [], frame: '纯红色画面保持静止并占满整个横向画框', onscreenText: '', audio: '', rhythm: 'setup', rhythmNote: '用红色建立第一个清晰可辨的视觉段落' },
      { id: 'S02', start: 1, end: 2, seconds: 1, motion: 0, size: 'wide', category: 'subject', camera: 'static', transitionIn: 'cut', subjects: [], frame: '纯蓝色画面保持静止并占满整个横向画框', onscreenText: '', audio: '', rhythm: 'payoff', rhythmNote: '切换为蓝色形成明确的第二段视觉兑现' },
    ],
  };
  const shotsPath = join(root, 'shots.json');
  writeFileSync(shotsPath, JSON.stringify(shots));
  const output = join(root, 'review.mp4');
  const spec = reviewSyncCommand(video, shotsPath, output, join(root, 'panels'));
  const result = spawnSync(spec.bin, spec.args, spec.options);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(existsSync(output));
  assert.equal((await collectMedia(output)).decodeOk, true);
});

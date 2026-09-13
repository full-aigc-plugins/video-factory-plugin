import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assembleVideo } from '../src/assembler.mjs';
import { outputProfile } from '../src/ffmpeg-compiler.mjs';
import { renderFinal } from '../src/final-renderer.mjs';
import { quotePlan } from '../src/approval.mjs';
import { sha256File } from '../src/hash.mjs';
import { collectMedia, verifyReceipt } from '../src/media-collector.mjs';
import { evaluateMedia } from '../src/media-evaluator.mjs';
import { renderSegment } from '../src/segment-renderer.mjs';
import { runApproved } from '../src/orchestrator.mjs';

test('real FFmpeg renders resumable image segments and a verified rough cut', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-runtime-'));
  const red = join(root, 'red.png');
  const blue = join(root, 'blue.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=red:s=64x64', '-frames:v', '1', red]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=blue:s=64x64', '-frames:v', '1', blue]);
  const profile = outputProfile('rough', { aspect: '16:9' });
  const first = await renderSegment({ source: { id: 'C01', kind: 'image', path: red, durationSeconds: 1, motion: 'static' }, profile, destination: join(root, 'S01.mp4') });
  const second = await renderSegment({ source: { id: 'C02', kind: 'image', path: blue, durationSeconds: 1, motion: 'static' }, profile, destination: join(root, 'S02.mp4') });
  assert.equal(first.receipt.decodeOk, true);
  const finalPath = join(root, 'rough.mp4');
  await assembleVideo([first.path, second.path], profile, finalPath);
  const receipt = await collectMedia(finalPath, { provenanceOk: true });
  assert.equal((await verifyReceipt(receipt)).ok, true);
  const scores = evaluateMedia({ output: { width: 1280, height: 720, fps: 30, durationSeconds: 2, requireAudio: false } }, receipt,
    { blackFrames: 'PASS', freezeFrames: 'PASS', silence: 'PASS', subtitleTiming: 'PASS', semanticConsistency: 'PASS' }, 'approved');
  assert.equal(scores.decision, 'pass');
});

test('real FFmpeg assembles two normalized segments with a dissolve', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-dissolve-'));
  const firstPath = join(root, 'first.mp4');
  const secondPath = join(root, 'second.mp4');
  for (const [path, color] of [[firstPath, 'purple'], [secondPath, 'yellow']]) {
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=${color}:s=320x180:d=1`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', path]);
  }
  const destination = join(root, 'dissolve.mp4');
  const receipt = await assembleVideo([firstPath, secondPath], outputProfile('rough', { width: 320, height: 180 }), destination, 30000, { durations: [1, 1], transitions: ['cut', 'dissolve'] });
  assert.equal(receipt.decodeOk, true);
  assert.ok(Math.abs(receipt.durationSeconds - 1.5) < 0.15);
});

test('approved orchestrator produces a review-ready rough cut and durable receipts', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-approved-'));
  const image = join(root, 'green.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=green:s=64x64', '-frames:v', '1', image]);
  const assetHash = await sha256File(image);
  const plan = {
    schemaVersion: '1.0.0', id: 'approved-job', mode: 'local_composition', round: 1,
    assets: [{ id: 'A01', path: 'green.png', sha256: assetHash, kind: 'image', durationTicks: 30 }],
    editDecision: { schemaVersion: '1.0.0', id: 'E01', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [
      { id: 'C01', assetId: 'A01', sourceInTicks: 0, sourceOutTicks: 30, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 },
    ] },
    output: { aspect: '16:9', width: 1280, height: 720, fps: 30, requireAudio: false },
  };
  const quote = quotePlan(plan, 'rough', 1);
  const approval = { schemaVersion: '1.0.0', stage: 'rough', planHash: quote.planHash, editHash: quote.editHash, round: 1, quoteRevision: 1, acceptedAt: '2026-09-14T00:00:00Z' };
  const planPath = join(root, 'plan.json');
  const approvalPath = join(root, 'approval.json');
  writeFileSync(planPath, JSON.stringify(plan));
  writeFileSync(approvalPath, JSON.stringify(approval));
  const result = await runApproved({ planPath, approvalPath, ledgerPath: join(root, 'job.json'), inputRoot: root, workRoot: join(root, 'work'), outputRoot: join(root, 'output'), stage: 'rough' });
  assert.equal(result.job.state, 'ReviewReady');
  assert.equal(result.receipt.decodeOk, true);
  assert.equal(result.job.segments[0].attempts, 1);
});

test('real final mastering embeds subtitles and replaces the guide track', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-final-'));
  const input = join(root, 'input.mp4');
  const voice = join(root, 'voice.wav');
  const subtitle = join(root, 'captions.srt');
  const destination = join(root, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=navy:s=320x180:d=1', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', input]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1:sample_rate=48000', voice]);
  writeFileSync(subtitle, '1\n00:00:00,000 --> 00:00:00,800\n终版字幕\n');
  const receipt = await renderFinal({ inputVideo: input, audioPath: voice, subtitlePath: subtitle, profile: outputProfile('final', { width: 320, height: 180 }), destination, durationSeconds: 1 });
  assert.equal(receipt.decodeOk, true);
  assert.equal(receipt.hasAudio, true);
  assert.equal(receipt.width, 320);
  assert.equal(receipt.height, 180);
  assert.equal((await verifyReceipt(receipt)).ok, true);
});

test('approved final orchestrator binds audio and subtitle assets and completes the job', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-approved-final-'));
  const image = join(root, 'frame.png');
  const audio = join(root, 'voice.wav');
  const music = join(root, 'music.wav');
  const subtitle = join(root, 'captions.srt');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=orange:s=64x64', '-frames:v', '1', image]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=330:duration=1:sample_rate=48000', audio]);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=0.5:sample_rate=48000', music]);
  writeFileSync(subtitle, '1\n00:00:00,000 --> 00:00:00,800\nFactory final\n');
  const plan = {
    schemaVersion: '1.0.0', id: 'approved-final-job', mode: 'local_composition', round: 1,
    assets: [
      { id: 'A01', path: 'frame.png', sha256: await sha256File(image), kind: 'image', durationTicks: 30 },
      { id: 'A02', path: 'voice.wav', sha256: await sha256File(audio), kind: 'audio' },
      { id: 'A03', path: 'captions.srt', sha256: await sha256File(subtitle), kind: 'subtitle' },
      { id: 'A04', path: 'music.wav', sha256: await sha256File(music), kind: 'audio' },
    ],
    editDecision: { schemaVersion: '1.0.0', id: 'E01', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [
      { id: 'C01', assetId: 'A01', sourceInTicks: 0, sourceOutTicks: 30, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 },
    ] },
    output: {
      aspect: '16:9', width: 320, height: 180, fps: 30, requireAudio: true,
      audioTracks: [
        { assetId: 'A02', role: 'narration', gainDb: 0, timelineInTicks: 0 },
        { assetId: 'A04', role: 'music', gainDb: -12, timelineInTicks: 15 },
      ],
      subtitleAssetId: 'A03', watermarkAssetId: 'A01', title: 'Approved final',
    },
  };
  const quote = quotePlan(plan, 'final', 1);
  const approval = { schemaVersion: '1.0.0', stage: 'final', planHash: quote.planHash, editHash: quote.editHash, round: 1, quoteRevision: 1, acceptedAt: '2026-09-14T00:00:00Z' };
  const planPath = join(root, 'plan.json');
  const approvalPath = join(root, 'approval.json');
  writeFileSync(planPath, JSON.stringify(plan));
  writeFileSync(approvalPath, JSON.stringify(approval));
  const result = await runApproved({ planPath, approvalPath, ledgerPath: join(root, 'job.json'), inputRoot: root, workRoot: join(root, 'work'), outputRoot: join(root, 'output'), stage: 'final' });
  assert.equal(result.job.state, 'Completed');
  assert.equal(result.receipt.hasAudio, true);
  assert.equal(result.scores.failedRequired.length, 0);
  assert.equal(result.scores.gates.find((gate) => gate.id === 'subtitleTiming').status, 'PASS');
});

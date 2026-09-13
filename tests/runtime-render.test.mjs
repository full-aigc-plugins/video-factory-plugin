import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assembleVideo } from '../src/assembler.mjs';
import { outputProfile } from '../src/ffmpeg-compiler.mjs';
import { quotePlan } from '../src/approval.mjs';
import { sha256File } from '../src/hash.mjs';
import { collectMedia, verifyReceipt } from '../src/media-collector.mjs';
import { evaluateMedia } from '../src/media-evaluator.mjs';
import { renderSegment } from '../src/segment-renderer.mjs';
import { runApproved } from '../src/orchestrator.mjs';

test('real FFmpeg renders resumable image segments and a verified rough cut', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'vedio-runtime-'));
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

test('approved orchestrator produces a review-ready rough cut and durable receipts', { timeout: 30000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), 'vedio-approved-'));
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

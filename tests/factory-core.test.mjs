import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { sha256File } from '../src/hash.mjs';
import { findMissingAssetRequirements, resolveGrantedFile, registerAssets, writeAssetRequirements } from '../src/paths.mjs';
import { canonicalHash, validateVideoPlan } from '../src/plan.mjs';
import { quotePlan, verifyApproval } from '../src/approval.mjs';
import { failSegment, markSegment, newJob, pendingSegments, readLedger, recordHumanDecision, transition, writeLedger } from '../src/job-ledger.mjs';

const receiptFixture = () => ({
  schemaVersion: '1.0.0', path: 'S01.mp4', sha256: 'b'.repeat(64), bytes: 1024, durationSeconds: 1,
  width: 320, height: 180, fps: 30, hasAudio: true, container: 'mov,mp4', streamCount: 2,
  videoCodec: 'h264', pixelFormat: 'yuv420p', videoStartSeconds: 0,
  audioCodec: 'aac', audioSampleRate: 48000, audioChannels: 2, audioStartSeconds: 0,
  exists: true, hashVerified: true, decodeOk: true, provenanceOk: true, timelineOk: true,
});

test('asset registration binds regular local files and rejects URL or symlink escape', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-assets-'));
  writeFileSync(join(root, 'clip.bin'), 'clip-one');
  const outside = join(root, '..', `outside-${Date.now()}`);
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(root, 'escape.bin'));
  const hash = await sha256File(join(root, 'clip.bin'));
  const result = await registerAssets([{ id: 'A01', path: 'clip.bin', sha256: hash, kind: 'video' }], root);
  assert.equal(result.A01.path, realpathSync(join(root, 'clip.bin')));
  assert.throws(() => resolveGrantedFile(root, 'https://example.com/a.mp4'), /local file/);
  assert.throws(() => resolveGrantedFile(root, 'escape.bin'), /symlink/);
  assert.throws(() => resolveGrantedFile(root, 'missing.mp4'), /missing asset/);
});

test('cross-plugin asset registration verifies the public receipt hash', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-receipt-'));
  const artifact = join(root, 'blender.mp4');
  const receipt = join(root, 'blender.receipt.json');
  writeFileSync(artifact, 'blender-render');
  const hash = await sha256File(artifact);
  writeFileSync(receipt, JSON.stringify({ schemaVersion: '1.0.0', source: 'codex-blender-plugin', path: 'blender.mp4', sha256: hash, kind: 'video' }));
  const registered = await registerAssets([{ id: 'B01', path: 'blender.mp4', sha256: hash, kind: 'video', source: 'codex-blender-plugin', receiptPath: 'blender.receipt.json' }], root);
  assert.equal(registered.B01.receipt.source, 'codex-blender-plugin');
  writeFileSync(receipt, JSON.stringify({ schemaVersion: '1.0.0', source: 'codex-blender-plugin', path: 'blender.mp4', sha256: 'f'.repeat(64), kind: 'video' }));
  await assert.rejects(() => registerAssets([{ id: 'B01', path: 'blender.mp4', sha256: hash, kind: 'video', source: 'codex-blender-plugin', receiptPath: 'blender.receipt.json' }], root), /receipt hash mismatch/);
});

test('missing assets produce an atomic public handoff without probing outside the grant', () => {
  const root = mkdtempSync(join(tmpdir(), 'video-requirements-'));
  const requirements = findMissingAssetRequirements([
    { id: 'IMG01', path: 'story.png', kind: 'image' },
    { id: 'ANIM01', path: 'scene.mp4', kind: 'video', source: 'codex-blender-plugin' },
  ], root);
  assert.deepEqual(requirements.map((item) => item.capability), ['image.batch', 'blender.animation']);
  const destination = join(root, 'work', 'asset-requirements.json');
  writeAssetRequirements(destination, requirements);
  assert.equal(existsSync(destination), true);
  assert.equal(JSON.parse(readFileSync(destination, 'utf8')).requirements.length, 2);
  assert.throws(() => findMissingAssetRequirements([{ id: 'X', path: '../escape', kind: 'video' }], root), /outside input root/);
});

test('plan identity is stable and approval binds stage, round and both hashes', () => {
  const plan = {
    schemaVersion: '1.0.0', id: 'P1', round: 1, mode: 'local_composition',
    editDecision: { schemaVersion: '1.0.0', id: 'E1', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [{ id: 'C01', assetId: 'A1', sourceInTicks: 0, sourceOutTicks: 30, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 }] },
    assets: [{ id: 'A1', path: 'frame.png', sha256: 'a'.repeat(64), kind: 'image', durationTicks: 30 }],
    output: { aspect: '16:9', width: 1280, height: 720, fps: 30, requireAudio: false },
  };
  assert.equal(canonicalHash(plan), canonicalHash(structuredClone(plan)));
  assert.notEqual(canonicalHash(plan), canonicalHash({ ...plan, round: 2 }));
  assert.equal(validateVideoPlan(plan), plan);
  assert.throws(() => validateVideoPlan({ ...plan, unexpected: true }), /additional property/);
  assert.throws(() => validateVideoPlan({ ...plan, output: { ...plan.output, audioAssetId: 'A1' } }), /audio asset/);
  assert.throws(() => validateVideoPlan({ ...plan, output: { ...plan.output, audioTracks: [{ assetId: 'A1', role: 'music', gainDb: -6, timelineInTicks: 0 }] } }), /audio track.*audio asset/);
  assert.throws(() => validateVideoPlan({ ...plan, output: { ...plan.output, watermarkAssetId: 'A1' }, assets: [{ ...plan.assets[0], kind: 'video' }] }), /watermarkAssetId.*image asset/);
  const quote = quotePlan(plan, 'rough', 1);
  const approval = { schemaVersion: '1.0.0', stage: 'rough', planHash: quote.planHash, editHash: quote.editHash, round: 1, quoteRevision: 1, acceptedAt: '2026-09-14T00:00:00Z' };
  assert.doesNotThrow(() => verifyApproval(approval, quote));
  assert.throws(() => verifyApproval({ ...approval, stage: 'final' }, quote), /approval mismatch/);
});

test('atomic ledger recovery never returns completed segments as pending', () => {
  const root = mkdtempSync(join(tmpdir(), 'video-ledger-'));
  const file = join(root, 'job.json');
  let job = newJob({ id: 'J1', planHash: 'a'.repeat(64), stage: 'rough', shotIds: ['S01', 'S02'] });
  job = transition(job, 'Running', 'approved');
  job = markSegment(job, 'S01', receiptFixture());
  writeLedger(file, job);
  const restored = readLedger(file);
  assert.deepEqual(pendingSegments(restored), ['S02']);
  assert.equal(JSON.parse(readFileSync(file, 'utf8')).revision, restored.revision);
  assert.throws(() => transition(restored, 'Completed'), /illegal transition/);
  assert.throws(() => writeLedger(file, { ...restored, unexpected: true }), /additional property/);
});

test('a failed segment is recorded once and cannot be selected for automatic retry', () => {
  let job = newJob({ id: 'J2', planHash: 'a'.repeat(64), stage: 'rough', shotIds: ['S01', 'S02'] });
  job = transition(job, 'Running', 'approved');
  job = failSegment(job, 'S01', new Error('decoder rejected source'));
  assert.equal(job.segments[0].state, 'Failed');
  assert.equal(job.segments[0].attempts, 1);
  assert.match(job.segments[0].error.message, /decoder rejected/);
  assert.deepEqual(pendingSegments(job), ['S02']);
  assert.equal(transition(job, 'Partial', 'manual decision required').state, 'Partial');
});

test('reused segment receipts do not count as new render attempts', () => {
  let job = newJob({ id: 'J3', planHash: 'a'.repeat(64), stage: 'rough', shotIds: ['S01'] });
  job = transition(job, 'Running', 'approved');
  job = markSegment(job, 'S01', receiptFixture(), { attempts: 0, reused: true });
  assert.equal(job.segments[0].attempts, 0);
  assert.equal(job.segments[0].reused, true);
});

test('only an explicit human review can complete or reject a review-ready artifact', () => {
  const ready = { ...newJob({ id: 'J4', planHash: 'a'.repeat(64), stage: 'final', shotIds: [] }), state: 'ReviewReady', scores: { decision: 'review', failedRequired: [], gates: [], humanLabel: 'unlabeled' } };
  const approved = recordHumanDecision(ready, 'approved', 'final playback accepted');
  assert.equal(approved.state, 'Completed');
  assert.equal(approved.scores.humanLabel, 'approved');
  const rejected = recordHumanDecision(ready, 'rejected', 'subtitle needs revision');
  assert.equal(rejected.state, 'ReworkReady');
  assert.equal(rejected.scores.decision, 'fail');
  assert.throws(() => recordHumanDecision({ ...ready, state: 'Running' }, 'approved'), /ReviewReady/);
});

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { recoverySummary } from '../src/orchestrator.mjs';
import { collectMedia } from '../src/media-collector.mjs';
import { canonicalHash } from '../src/plan.mjs';

const capture = () => {
  let stdout = '';
  let stderr = '';
  return { io: { stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } }, read: () => ({ stdout, stderr }) };
};

// One 30-tick clip at 1/30s per tick → a 1.0s expected duration.
const evaluateFixture = (root, { clipTicks = 30, artifactSeconds = 1 } = {}) => {
  const planPath = join(root, 'plan.json');
  const plan = {
    schemaVersion: '1.0.0', id: 'P1', round: 1, mode: 'local_composition',
    editDecision: { schemaVersion: '1.0.0', id: 'E1', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [{ id: 'C01', assetId: 'A1', sourceInTicks: 0, sourceOutTicks: clipTicks, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 }] },
    assets: [{ id: 'A1', path: 'frame.png', sha256: 'a'.repeat(64), kind: 'image', durationTicks: clipTicks }],
    output: { aspect: '16:9', width: 320, height: 180, fps: 30, requireAudio: false },
  };
  writeFileSync(planPath, JSON.stringify(plan));
  const artifact = join(root, 'artifact.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `color=green:s=320x180:d=${artifactSeconds}:r=30`, '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', artifact]);
  return { plan, planPath, artifact };
};

const gateStatus = (scores, id) => scores.gates.find((entry) => entry.id === id).status;

test('CLI quote emits a zero-remote-call rough estimate', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-cli-'));
  const planPath = join(root, 'plan.json');
  writeFileSync(planPath, JSON.stringify({
    schemaVersion: '1.0.0', id: 'P1', round: 1, mode: 'local_composition',
    editDecision: { schemaVersion: '1.0.0', id: 'E1', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [{ id: 'C01', assetId: 'A1', sourceInTicks: 0, sourceOutTicks: 30, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 }] },
    assets: [{ id: 'A1', path: 'frame.png', sha256: 'a'.repeat(64), kind: 'image', durationTicks: 30 }],
    output: { aspect: '16:9', width: 1280, height: 720, fps: 30, requireAudio: false },
  }));
  const out = capture();
  assert.equal(await main(['quote', planPath, '--stage', 'rough'], out.io), 0);
  const quote = JSON.parse(out.read().stdout);
  assert.equal(quote.remoteInvocations, 0);
  assert.equal(quote.stage, 'rough');
  assert.equal(quote.totalSeconds, 1);
  assert.equal(quote.outputPixels, 1280 * 720);
  assert.ok(quote.estimatedTemporaryBytes > 0);
});

test('CLI rejects unavailable native generation before execution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-cli-'));
  const path = join(root, 'plan.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: '1.0.0', id: 'P1', round: 1, mode: 'codex_native_generation', editDecision: {}, assets: [{}], output: { width: 1280, height: 720, fps: 30 } }));
  const out = capture();
  assert.equal(await main(['validate-plan', path], out.io), 3);
  assert.match(out.read().stderr, /local_composition/);
});

test('recovery summary returns only pending segment ids and never retries failures', () => {
  const summary = recoverySummary({ state: 'Partial', segments: [
    { id: 'S01', state: 'Completed' }, { id: 'S02', state: 'Pending' }, { id: 'S03', state: 'Failed' },
  ] });
  assert.deepEqual(summary.pending, ['S02']);
  assert.deepEqual(summary.failed, ['S03']);
  assert.equal(summary.nextAction, 'new_round_required');
  const interrupted = recoverySummary({ state: 'Running', segments: [
    { id: 'S01', state: 'Completed' }, { id: 'S02', state: 'Pending' },
  ] });
  assert.equal(interrupted.nextAction, 'resume_pending');
});

test('CLI evaluation derives the timeline from the edit and reports unverifiable gates as NOT_RUN', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-evaluate-'));
  const { planPath, artifact } = evaluateFixture(root);
  const out = capture();
  assert.equal(await main(['evaluate', artifact, planPath], out.io), 0);
  const { stdout, stderr } = out.read();
  const scores = JSON.parse(stdout);
  // Nothing is actually wrong with this artifact, so nothing may be reported as a failure.
  assert.deepEqual(scores.failedRequired, []);
  assert.equal(scores.decision, 'review');
  // Provenance needs the job ledger; without one it is NOT_RUN — not the FAIL that the old
  // hardcoded boolean default produced.
  assert.equal(gateStatus(scores, 'provenance'), 'NOT_RUN');
  assert.match(stderr, /unverified required gate "provenance"/);
  assert.match(stderr, /capped at review/);
  // The timeline gate is derived from the plan, so it holds with or without a ledger.
  assert.equal(gateStatus(scores, 'timeline'), 'PASS');
  assert.equal(gateStatus(scores, 'duration'), 'PASS');
  // Advisory gates that have producers are populated rather than left at NOT_RUN.
  assert.equal(gateStatus(scores, 'duplicateShots'), 'PASS');
  assert.notEqual(gateStatus(scores, 'blackFrames'), 'NOT_RUN');
});

test('CLI evaluation fails the timeline gate when the artifact diverges from the edit', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-evaluate-drift-'));
  const { planPath, artifact } = evaluateFixture(root, { artifactSeconds: 3 });
  const out = capture();
  assert.equal(await main(['evaluate', artifact, planPath], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  // timeline mirrors the orchestrator's derivation (artifact duration against the edit), so it
  // agrees with the duration gate by construction — both must fail together on a real drift.
  assert.equal(gateStatus(scores, 'timeline'), 'FAIL');
  assert.deepEqual(scores.failedRequired, ['duration', 'timeline']);
  assert.equal(scores.decision, 'fail');
});

test('CLI evaluation caps the decision at review when detectors are skipped', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-evaluate-skip-'));
  const { planPath, artifact } = evaluateFixture(root);
  const out = capture();
  assert.equal(await main(['evaluate', artifact, planPath, '--skip-detectors'], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  assert.equal(gateStatus(scores, 'blackFrames'), 'SKIPPED');
  assert.equal(gateStatus(scores, 'silence'), 'SKIPPED');
  assert.equal(scores.decision, 'review');
});

test('CLI evaluation verifies provenance from the job ledger', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-evaluate-ledger-'));
  const { plan, planPath, artifact } = evaluateFixture(root);
  const media = await collectMedia(artifact, { provenanceOk: true, timelineOk: true });
  const ledgerPath = join(root, 'job.json');
  const ledger = {
    schemaVersion: '1.0.0', id: 'J1', revision: 2, state: 'ReviewReady', planHash: canonicalHash(plan), stage: 'final', history: [],
    segments: [{ id: 'C01', state: 'Completed', attempts: 1, reused: false, receipt: { ...media, descriptorKey: 'c'.repeat(64), bindingKey: 'd'.repeat(64) } }],
    artifact: media,
  };
  writeFileSync(ledgerPath, JSON.stringify(ledger));
  const out = capture();
  assert.equal(await main(['evaluate', artifact, planPath, '--ledger', ledgerPath], out.io), 0);
  const { stdout, stderr } = out.read();
  assert.equal(gateStatus(JSON.parse(stdout), 'provenance'), 'PASS');
  // semanticConsistency has no producer yet, but it is advisory: it must be reported without
  // claiming it caps the decision.
  assert.doesNotMatch(stderr, /unverified required gate/);
  assert.match(stderr, /advisory gates without evidence: semanticConsistency/);
  assert.doesNotMatch(stderr, /semanticConsistency[^)]*capped at review/);
});

test('CLI evaluation fails provenance when the ledger does not describe this artifact', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-evaluate-ledger-bad-'));
  const { plan, planPath, artifact } = evaluateFixture(root);
  const media = await collectMedia(artifact, { provenanceOk: true, timelineOk: true });
  const ledgerPath = join(root, 'job.json');
  writeFileSync(ledgerPath, JSON.stringify({
    schemaVersion: '1.0.0', id: 'J1', revision: 2, state: 'ReviewReady', planHash: canonicalHash(plan), stage: 'final', history: [],
    segments: [{ id: 'C01', state: 'Completed', attempts: 1, receipt: { ...media, descriptorKey: 'c'.repeat(64), bindingKey: 'd'.repeat(64) } }],
    artifact: { ...media, sha256: 'b'.repeat(64) },
  }));
  const out = capture();
  assert.equal(await main(['evaluate', artifact, planPath, '--ledger', ledgerPath], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  assert.equal(gateStatus(scores, 'provenance'), 'FAIL');
  assert.deepEqual(scores.failedRequired, ['provenance']);
});

test('CLI accept is the only path from ReviewReady to Completed', async () => {
  const root = mkdtempSync(join(tmpdir(), 'video-accept-'));
  const ledgerPath = join(root, 'job.json');
  const artifactPath = join(root, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=green:s=320x180:d=1:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', artifactPath]);
  const artifact = await collectMedia(artifactPath, { provenanceOk: true, timelineOk: true });
  writeFileSync(ledgerPath, JSON.stringify({ schemaVersion: '1.0.0', id: 'J1', revision: 3, state: 'ReviewReady', planHash: 'a'.repeat(64), stage: 'final', segments: [], history: [], artifact, scores: { schemaVersion: '1.0.0', decision: 'review', failedRequired: [], gates: [], humanLabel: 'unlabeled' } }));
  const out = capture();
  assert.equal(await main(['accept', ledgerPath, '--decision', 'approved', '--note', 'played and accepted'], out.io), 0);
  assert.equal(JSON.parse(out.read().stdout).state, 'Completed');
  assert.equal(JSON.parse(readFileSync(ledgerPath, 'utf8')).review.decision, 'approved');
  writeFileSync(artifactPath, 'tampered');
  const second = capture();
  assert.equal(await main(['accept', ledgerPath, '--decision', 'approved'], second.io), 1);
  assert.match(second.read().stderr, /artifact.*verification|hash mismatch/);
});

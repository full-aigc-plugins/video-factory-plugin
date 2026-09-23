import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { main } from '../src/cli.mjs';
import { emitEvidence, validateAndNormalize, scoreToGateStatus, readSemanticSummary } from '../src/semantic-evidence.mjs';
import { gapFingerprint } from '../src/round-snapshot.mjs';
import { acceptJob } from '../src/orchestrator.mjs';
import { collectMedia } from '../src/media-collector.mjs';

const sha256File = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

const capture = () => {
  let stdout = '';
  let stderr = '';
  return { io: { stdout: { write: (text) => { stdout += text; } }, stderr: { write: (text) => { stderr += text; } } }, read: () => ({ stdout, stderr }) };
};

// Build a 3-second, 640x360 H.264/AAC MP4 fixture and a 640x360 target PNG.
function buildArtifacts(root) {
  const mp4 = join(root, 'src.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=30:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=3', '-map', '0:v:0', '-map', '1:a:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-t', '3', '-movflags', '+faststart', mp4]);
  const png = join(root, 'target.png');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=green:size=640x360:duration=1', '-frames:v', '1', png]);
  const planPath = join(root, 'plan.json');
  const sha = sha256File(mp4);
  const plan = {
    schemaVersion: '1.0.0', id: 'P1', round: 1, mode: 'local_composition',
    editDecision: { schemaVersion: '1.0.0', id: 'E1', revision: 1, timebase: { numerator: 1, denominator: 30 }, clips: [{ id: 'C01', assetId: 'A1', sourceInTicks: 0, sourceOutTicks: 90, timelineInTicks: 0, track: 0, transition: 'cut', gainDb: 0 }] },
    assets: [{ id: 'A1', path: './src.mp4', sha256: sha, kind: 'video', durationTicks: 90 }],
    output: { aspect: '16:9', width: 640, height: 360, fps: 30, requireAudio: true },
  };
  writeFileSync(planPath, JSON.stringify(plan));
  return { mp4, png, planPath };
}

test('semantic-evidence schema validates a well-formed score file', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-'));
  const { png } = buildArtifacts(root);
  const { manifestPath } = emitEvidence({ artifact: join(root, 'src.mp4'), target: png, outputDir: join(root, 'evidence') });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sha = sha256File(png);
  const score = {
    schemaVersion: '1.0.0',
    target: { path: 'target.png', sha256: sha, width: 640, height: 360 },
    frames: manifest.frames.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256, kind: entry.kind })),
    score: { composition: 2.5, lighting: 2.0, materials: 2.0, details: 0.5, total: 7.0 },
    gaps: [
      { dimension: 'lighting', frame: 'S01a', issue: 'Subject is underexposed by ~1 stop', fix: 'Increase key light by 1 stop or extend fill light' },
    ],
  };
  const scorePath = join(root, 'score.json');
  writeFileSync(scorePath, JSON.stringify(score));
  const result = validateAndNormalize(scorePath, manifest);
  assert.equal(result.ok, true, `expected ok=true, got ok=${result.ok} error=${result.error}`);
  assert.equal(scoreToGateStatus(result.normalized), 'FAIL');
});

test('semantic-evidence rejects a score that references an unknown frame', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-'));
  const { png } = buildArtifacts(root);
  const { manifestPath } = emitEvidence({ artifact: join(root, 'src.mp4'), target: png, outputDir: join(root, 'evidence') });
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const sha = sha256File(png);
  const score = {
    schemaVersion: '1.0.0',
    target: { path: 'target.png', sha256: sha, width: 640, height: 360 },
    frames: manifest.frames.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256, kind: entry.kind })),
    score: { composition: 3, lighting: 3, materials: 3, details: 1, total: 10 },
    gaps: [{ dimension: 'details', frame: 'S99a', issue: 'bogus', fix: 'bogus' }],
  };
  const scorePath = join(root, 'score.json');
  writeFileSync(scorePath, JSON.stringify(score));
  const result = validateAndNormalize(scorePath, manifest);
  assert.equal(result.ok, false);
  assert.match(result.error, /"S99a" is not present in the emitted evidence manifest/);
});

test('evaluate without --target leaves semanticConsistency NOT_RUN (no behavior change)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-eval-'));
  const { mp4, planPath } = buildArtifacts(root);
  const out = capture();
  assert.equal(await main(['evaluate', mp4, planPath], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  const gate = scores.gates.find((g) => g.id === 'semanticConsistency');
  assert.equal(gate.status, 'NOT_RUN');
  assert.equal(scores.decision, 'review');
  assert.deepEqual(scores.failedRequired, []);
});

test('evaluate with --target but no score emits evidence and leaves semanticConsistency NOT_RUN', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-emit-'));
  const { mp4, png, planPath } = buildArtifacts(root);
  const outDir = join(root, 'evidence');
  const out = capture();
  assert.equal(await main(['evaluate', mp4, planPath, '--target', png, '--emit-evidence', outDir], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  const { stderr } = out.read();
  const gate = scores.gates.find((g) => g.id === 'semanticConsistency');
  assert.equal(gate.status, 'NOT_RUN');
  assert.match(stderr, /emitted semantic evidence/);
  assert.ok(existsSync(join(outDir, 'semantic-evidence.json')), 'evidence manifest not written');
});

test('evaluate with --target + valid --semantic-evidence sets semanticConsistency and surfaces in stderr guidance', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-full-'));
  const { mp4, png, planPath } = buildArtifacts(root);
  const outDir = join(root, 'evidence');
  // Pre-emit so the score file has matching manifest target sha256.
  const { manifest } = emitEvidence({ artifact: mp4, target: png, outputDir: outDir });
  const sha = sha256File(png);
  const scorePath = join(root, 'score.json');
  writeFileSync(scorePath, JSON.stringify({
    schemaVersion: '1.0.0',
    target: { path: 'target.png', sha256: sha, width: 640, height: 360 },
    frames: manifest.frames.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256, kind: entry.kind })),
    score: { composition: 3, lighting: 2.5, materials: 2.5, details: 0.5, total: 8.5 },
    gaps: [],
  }));

  const out = capture();
  assert.equal(await main(['evaluate', mp4, planPath, '--target', png, '--emit-evidence', outDir, '--semantic-evidence', scorePath], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  const gate = scores.gates.find((g) => g.id === 'semanticConsistency');
  assert.equal(gate.status, 'PASS');
  assert.equal(scores.decision, 'review'); // capped by other advisory gates being non-PASS
});

test('evaluate with invalid --semantic-evidence keeps semanticConsistency NOT_RUN and reports error', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-bad-'));
  const { mp4, png, planPath } = buildArtifacts(root);
  const outDir = join(root, 'evidence');
  emitEvidence({ artifact: mp4, target: png, outputDir: outDir });
  const scorePath = join(root, 'score.json');
  writeFileSync(scorePath, '{"schemaVersion":"1.0.0","score":{}}'); // invalid

  const out = capture();
  assert.equal(await main(['evaluate', mp4, planPath, '--target', png, '--emit-evidence', outDir, '--semantic-evidence', scorePath], out.io), 0);
  const scores = JSON.parse(out.read().stdout);
  const gate = scores.gates.find((g) => g.id === 'semanticConsistency');
  assert.equal(gate.status, 'NOT_RUN');
  assert.match(out.read().stderr, /semantic evidence failed/);
});

test('evaluate writes a semantic summary side file for the round snapshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-summary-'));
  const { mp4, png, planPath } = buildArtifacts(root);
  const outDir = join(root, 'evidence');
  const { manifest } = emitEvidence({ artifact: mp4, target: png, outputDir: outDir });
  const sha = sha256File(png);
  const scorePath = join(root, 'score.json');
  writeFileSync(scorePath, JSON.stringify({
    schemaVersion: '1.0.0',
    target: { path: 'target.png', sha256: sha, width: 640, height: 360 },
    frames: manifest.frames.map((entry) => ({ id: entry.id, path: entry.path, sha256: entry.sha256, kind: entry.kind })),
    score: { composition: 2, lighting: 2, materials: 2, details: 1, total: 7 },
    gaps: [{ dimension: 'lighting', frame: 'S01a', issue: 'dark', fix: 'light' }],
  }));

  const out = capture();
  assert.equal(await main(['evaluate', mp4, planPath, '--target', png, '--emit-evidence', outDir, '--semantic-evidence', scorePath], out.io), 0);
  assert.match(out.read().stderr, /semantic score summary written to .*\.semantic\.json/);

  const summary = readSemanticSummary(mp4);
  assert.ok(summary, 'summary side file missing');
  assert.equal(summary.totalScore, 7);
  assert.equal(summary.gaps.length, 1);
  assert.equal(summary.gaps[0].dimension, 'lighting');
  assert.equal(summary.targetSha256, sha);
  assert.equal(summary.scoreFileSha256, sha256File(scorePath));
  assert.match(summary.gapFingerprint, /^[a-f0-9]{16}$/);
});

test('acceptJob attaches the semantic summary to the round snapshot', async () => {
  const root = mkdtempSync(join(tmpdir(), 'vf-se-accept-'));
  const artifactPath = join(root, 'final.mp4');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=green:s=320x180:d=1:r=30', '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', artifactPath]);
  const artifact = await collectMedia(artifactPath, { provenanceOk: true, timelineOk: true });
  const targetSha = 'a'.repeat(64);
  const scoreSha = 'b'.repeat(64);
  writeFileSync(`${artifactPath}.semantic.json`, JSON.stringify({
    schemaVersion: '1.0.0', totalScore: 8.5,
    gaps: [{ dimension: 'details', frame: 'S01b' }],
    gapFingerprint: gapFingerprint([{ dimension: 'details', frame: 'S01b' }]),
    targetSha256: targetSha, scoreFileSha256: scoreSha, at: new Date().toISOString(),
  }));
  const ledgerPath = join(root, 'job.json');
  writeFileSync(ledgerPath, JSON.stringify({
    schemaVersion: '1.0.0', id: 'J1', revision: 3, state: 'ReviewReady', planHash: 'a'.repeat(64), stage: 'final', segments: [], history: [],
    artifact,
    scores: { schemaVersion: '1.0.0', decision: 'review', failedRequired: [], gates: [], humanLabel: 'unlabeled' },
  }));

  const updated = await acceptJob({ ledgerPath, decision: 'approved', note: 'ok' });
  const snapshot = updated.snapshots[0];
  assert.equal(snapshot.totalScore, 8.5);
  assert.equal(snapshot.gapFingerprint, gapFingerprint([{ dimension: 'details', frame: 'S01b' }]));
  assert.equal(snapshot.targetSha256, targetSha);
  assert.equal(snapshot.scoreFileSha256, scoreSha);
  assert.equal(updated.state, 'Completed');
});

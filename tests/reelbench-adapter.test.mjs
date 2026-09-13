import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReviewInput, mapGateOutput, runAnalyzeEvidence, runAnalyzeSeed, runFinalizeAnalysis, reviewSyncCommand } from '../src/integrations/reelbench-adapter.mjs';
import { validateSchemaInstance } from '../src/schema-lite.mjs';

test('analyze seed invokes the original upstream script as argv and persists raw stdout', () => {
  const out = mkdtempSync(join(tmpdir(), 'reelbench-adapter-'));
  const calls = [];
  const runner = (bin, args, options) => {
    calls.push({ bin, args, options });
    return { status: 0, stdout: '{"shots":[]}', stderr: '[seed] ok' };
  };
  const evidence = runAnalyzeSeed('/input/source.mp4', out, { runner, node: '/usr/bin/node' });
  assert.equal(calls[0].bin, '/usr/bin/node');
  assert.match(calls[0].args[0], /skills\/video-shots\/scripts\/video-shots\.mjs$/);
  assert.equal(calls[0].options.shell, false);
  assert.equal(readFileSync(evidence.shotsPath, 'utf8'), '{"shots":[]}');
  assert.ok(existsSync(evidence.stderrPath));
});

test('factory maps upstream skipped gates to SKIPPED instead of pass', () => {
  assert.deepEqual(mapGateOutput('✅ 时间轴连续\n⊘ 关键帧齐全 （没有目录）\n❌ 运镜实测对账'), [
    { label: '时间轴连续', status: 'PASS' },
    { label: '关键帧齐全 （没有目录）', status: 'SKIPPED' },
    { label: '运镜实测对账', status: 'FAIL' },
  ]);
});

test('review sync command targets original video-sync export without a shell', () => {
  const spec = reviewSyncCommand('/tmp/rough.mp4', '/tmp/shots.json', '/tmp/review.mp4', '/tmp/panels');
  assert.match(spec.args[0], /skills\/video-sync\/scripts\/video-sync\.mjs$/);
  assert.deepEqual(spec.args.slice(1, 4), ['export', '/tmp/shots.json', '--video']);
  assert.equal(spec.options.shell, false);
});

test('review sync rejects a video without the normalized audio track that bounds upstream output', () => {
  assert.throws(() => assertReviewInput({ hasAudio: false }), /audio track/);
  assert.doesNotThrow(() => assertReviewInput({ hasAudio: true }));
});

test('analysis evidence runs original seed, frames and both contact sheets before Codex annotation', () => {
  const out = mkdtempSync(join(tmpdir(), 'reelbench-evidence-'));
  const calls = [];
  const runner = (bin, args, options) => {
    calls.push({ bin, args, options });
    return { status: 0, stdout: args[1] === 'seed' ? '{"shots":[]}' : '', stderr: '' };
  };
  const evidence = runAnalyzeEvidence('/input/source.mp4', out, { runner, node: '/usr/bin/node' });
  assert.deepEqual(calls.map((call) => call.args[1]), ['seed', 'frames', 'sheet', 'sheet']);
  assert.equal(calls.every((call) => call.options.shell === false), true);
  assert.equal(evidence.status, 'AWAITING_CODEX_ANNOTATION');
  assert.equal(existsSync(evidence.manifestPath), true);
  const manifest = JSON.parse(readFileSync(evidence.manifestPath, 'utf8'));
  assert.equal(manifest.upstreamRevision, '75520c7b32ab5af8b22c5e4f79705efbbc0d8e07');
  assert.ok(manifest.artifacts.some((artifact) => artifact.path === 'shots.json' && /^[a-f0-9]{64}$/.test(artifact.sha256)));
  const evidenceSchema = JSON.parse(readFileSync('schemas/reelbench_evidence.schema.json', 'utf8'));
  assert.deepEqual(validateSchemaInstance(evidenceSchema, evidence), []);
});

test('finalize analysis invokes original validate and both report render modes', () => {
  const root = mkdtempSync(join(tmpdir(), 'reelbench-finalize-'));
  const shotsPath = join(root, 'shots.json');
  const trackPath = join(root, 'track.json');
  const framesPath = join(root, 'frames');
  writeFileSync(shotsPath, '{}');
  writeFileSync(trackPath, '{}');
  const calls = [];
  const runner = (bin, args, options) => {
    calls.push({ bin, args, options });
    if (args[1] === 'validate') return { status: 0, stdout: '✅ 时间轴连续\n⊘ 人物对账', stderr: '' };
    return { status: 0, stdout: args.includes('--md') ? '# report' : '<html>report</html>', stderr: '' };
  };
  const result = runFinalizeAnalysis({ shotsPath, trackPath, framesPath, outputDir: root, runner, node: '/usr/bin/node' });
  assert.deepEqual(calls.map((call) => call.args[1]), ['validate', 'render', 'render']);
  assert.equal(result.status, 'PASS');
  assert.equal(result.gates[1].status, 'SKIPPED');
  assert.equal(readFileSync(result.markdownPath, 'utf8'), '# report');
  assert.equal(readFileSync(result.htmlPath, 'utf8'), '<html>report</html>');
  const evidenceSchema = JSON.parse(readFileSync('schemas/reelbench_evidence.schema.json', 'utf8'));
  assert.deepEqual(validateSchemaInstance(evidenceSchema, result), []);
});

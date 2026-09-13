import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { assertReviewInput, mapGateOutput, runAnalyzeSeed, reviewSyncCommand } from '../src/integrations/reelbench-adapter.mjs';

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
